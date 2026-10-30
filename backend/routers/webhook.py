from __future__ import annotations
import asyncio
import json
import uuid
import logging
from typing import Any
from fastapi import APIRouter, Header, HTTPException, Request, status
from core.database import db, db_error_message
from core.ratelimit import limiter
from core.security import verify_nowpayments_hmac
from routers.auth import invalidate_me_cache
from services.deposits import apply_gateway_update
from services.ledger import ledger_service

logger = logging.getLogger("mofi.webhook")
router = APIRouter(prefix="/webhook", tags=["Webhook"])


def _event_kind(payload: dict[str, Any]) -> str:
    if "payment_status" in payload:
        return "payment"
    if any(k in payload for k in ("batch_withdrawal_id", "unique_external_id", "withdrawals")):
        return "payout"
    return "unknown"


def _is_uuid(value: Any) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except ValueError:
        return False


def _find_withdrawal(payload: dict[str, Any]) -> dict[str, Any] | None:
    ext = payload.get("unique_external_id")
    if ext and _is_uuid(ext):  # (anything else cannot be ours, and would only make the database reject the filter)
        rows = db.table("withdrawals").select("id,status").eq("id", str(ext)).limit(1).execute().data
        if rows:
            return rows[0]
    for key in ("id", "batch_withdrawal_id"):
        if payload.get(key):
            rows = db.table("withdrawals").select("id,status").eq("payout_id", str(payload[key])).limit(1).execute().data
            if rows:
                return rows[0]
    return None


def _apply_payout(payload: dict[str, Any]) -> dict[str, Any]:
    w = _find_withdrawal(payload)
    if not w:
        # not one of ours (a payout made by hand in the dashboard, say): answering with an error would only make the gateway retry for ever
        logger.warning("payout event %s matches no withdrawal: ignored", payload.get("id") or payload.get("unique_external_id"))
        return {"status": "ignored", "reason": "unknown withdrawal"}
    state = str(payload.get("status") or "").upper()
    if state == "FINISHED":
        return ledger_service.complete_withdrawal(w["id"], payload.get("hash"), payload)
    if state == "REJECTED":
        return ledger_service.fail_withdrawal(w["id"], payload.get("error") or "Payout rejected", payload)
    if state == "FAILED":
        # NOT final: NOWPayments may still process a failed payout once the cause is cleared, so refunding now could pay the user twice.
        # It stays as it is until the gateway says FINISHED or REJECTED (or a person settles it with support).
        logger.error("payout %s reported FAILED (not final, not refunded): %s", w["id"], payload.get("error"))
        return {"status": "recorded", "payout_status": state}
    ledger_service.mark_withdrawal_sent(w["id"], str(payload.get("id") or "") or None, payload)
    return {"status": "recorded", "payout_status": state}


@router.post("/nowpayments")
@limiter.limit("120/minute")
async def nowpayments_webhook(
    request: Request,
    x_nowpayments_sig: str | None = Header(None, alias="x-nowpayments-sig"),
) -> dict[str, Any]:
    raw_body = await request.body()
    if len(raw_body) > 64 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Payload too large")
    try:
        payload = json.loads(raw_body.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("not an object")
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload")

    valid = verify_nowpayments_hmac(payload, raw_body, x_nowpayments_sig)
    kind = _event_kind(payload)
    external_id = str(payload.get("payment_id") or payload.get("id") or payload.get("unique_external_id") or "") or None

    # Every call is logged first, valid or not.
    event_id = None
    try:
        event_id = (await asyncio.to_thread(lambda: db.table("payment_events").insert({
            "event_type": kind,
            "external_id": external_id,
            "status": str(payload.get("payment_status") or payload.get("status") or "") or None,
            "signature_valid": valid,
            # anyone can call this URL, so a forged call is logged without its body
            "payload": payload if valid else {"redacted": "invalid signature"},
        }).execute()))
        event_id = event_id.data[0]["id"]
    except Exception:
        logger.exception("could not log payment event")

    async def finish(**fields: Any) -> None:
        if event_id:
            try:
                await asyncio.to_thread(lambda: db.table("payment_events").update(fields).eq("id", event_id).execute())
            except Exception:
                logger.exception("could not update payment event %s", event_id)

    if not valid:
        logger.warning("NOWPayments webhook signature check failed (%s)", external_id)
        await finish(error="invalid signature")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook signature")

    try:
        if kind == "payment":
            result = await asyncio.to_thread(apply_gateway_update, payload)
        elif kind == "payout":
            result = await asyncio.to_thread(_apply_payout, payload)
        else:
            await finish(processed=True, result={"status": "ignored"})
            return {"status": "ignored"}
    except Exception as e:
        logger.error("webhook %s %s failed: %s", kind, external_id, db_error_message(e), exc_info=True)
        await finish(error=db_error_message(e))
        # 5xx makes the gateway retry later
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not process event")

    if isinstance(result, dict) and result.get("status") == "conflict_after_refund":
        logger.error("PAYOUT SENT AFTER REFUND, needs manual review: %s", result)
    logger.info("webhook %s %s processed: %s", kind, external_id, (result or {}).get("status") if isinstance(result, dict) else result)
    invalidate_me_cache(None)
    await finish(processed=True, result=result)
    return {"status": "ok", "result": result}
