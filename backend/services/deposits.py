from __future__ import annotations
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from core.config import settings
from core.database import db
from services.ledger import ledger_service

logger = logging.getLogger("mofi.deposits")


def _is_short(payload: dict[str, Any]) -> bool:
    try:
        paid, asked = Decimal(str(payload["actually_paid"])), Decimal(str(payload["pay_amount"]))
    except (KeyError, InvalidOperation, ValueError):
        return False  # nothing to compare: leave it to the gateway's own status
    return asked > 0 and paid < asked  # exactly what was asked, or more: anything less is held, never credited in full


def _check_settlement(payload: dict[str, Any]) -> None:
    """Deposits should arrive converted into SETTLEMENT_COIN (the Primary balance on NOWPayments). If one did not, the user is still credited
    (their price was fixed and the fee was theirs), but the treasury is holding another coin or short of the price: say so loudly."""
    outcome = str(payload.get("outcome_currency") or "").lower()
    if outcome and outcome != settings.SETTLEMENT_COIN.lower():
        logger.error("payment %s settled in %s, not %s: check the Primary balance setting on NOWPayments", payload.get("payment_id"), outcome, settings.SETTLEMENT_COIN)
    elif outcome:
        try:
            got, asked = Decimal(str(payload["outcome_amount"])), Decimal(str(payload["price_amount"]))
            if got < asked * Decimal("0.99"):
                logger.error("payment %s settled %s %s for a %s USD price: the fee was not fully covered", payload.get("payment_id"), got, outcome, asked)
        except (KeyError, InvalidOperation, ValueError):
            pass


def _has_amounts(payload: dict[str, Any]) -> bool:
    try:
        return Decimal(str(payload["actually_paid"])) > 0 and Decimal(str(payload["pay_amount"])) > 0
    except (KeyError, InvalidOperation, ValueError):
        return False


def _link_payment(payment_id: str, order_id: Any) -> None:
    """If the deposit row never got its payment_id (the database failed right after the gateway made the payment), the order id the payment was
    created with finds it, and the id is written in now. Without this such a payment could never be credited."""
    if not order_id:
        return
    have = db.table("deposits").select("id").eq("payment_id", payment_id).limit(1).execute().data
    if have:
        return
    rows = db.table("deposits").update({"payment_id": payment_id}).eq("order_id", str(order_id)).is_("payment_id", "null").execute().data
    if rows:
        logger.warning("deposit %s had no payment_id; linked to payment %s by its order id", rows[0]["id"], payment_id)


def apply_gateway_update(payload: dict[str, Any]) -> dict[str, Any]:
    """One gateway payment payload (webhook body or live status) -> ledger. Safe to call repeatedly."""
    payment_id = str(payload.get("payment_id") or "")
    if not payment_id:
        raise ValueError("Payment payload has no payment_id")
    _link_payment(payment_id, payload.get("order_id"))

    status = str(payload.get("payment_status") or payload.get("status") or "").lower()
    payin_hash = payload.get("payin_hash") or payload.get("hash")
    actually_paid = payload.get("actually_paid")

    # A "finished" report that says nothing about what was paid cannot be checked against what was asked: held, never credited blind.
    if status in ("finished", "confirmed", "sending") and not _has_amounts(payload):
        logger.warning("payment %s reported %s without amounts: held as partially_paid", payment_id, status)
        status = "partially_paid"

    # Defence in depth: the credit is the ordered amount, so a "finished" report for a payment that is clearly short of what was
    # asked is held as partially_paid for an admin to settle (admin_resolve_deposit) instead of crediting the full price.
    if status in ("finished", "confirmed", "sending") and _is_short(payload):
        logger.warning("payment %s reported %s but paid %s of %s: held as partially_paid", payment_id, status, actually_paid, payload.get("pay_amount"))
        status = "partially_paid"

    # If payment is finished or confirmed by gateway, process the credit via ledger RPC
    if status in ("finished", "confirmed", "sending"):
        _check_settlement(payload)
        result = ledger_service.process_confirmed_deposit(
            payment_id=payment_id,
            actually_paid=actually_paid,
            gateway_status=status,
            payin_hash=payin_hash,
            payload=payload,
        )
        logger.info("deposit credit for payment %s: %s", payment_id, (result or {}).get("status") if isinstance(result, dict) else result)
        return result

    # For waiting, confirming, expired, failed, or partially paid: update deposit state without crediting
    update_data: dict[str, Any] = {
        "status": status if status else "waiting",
        "gateway_payload": payload,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if payin_hash:
        update_data["payin_hash"] = payin_hash
    if payload.get("pay_address"):
        update_data["pay_address"] = payload["pay_address"]
    if payload.get("pay_amount"):
        update_data["pay_amount"] = payload["pay_amount"]
    if actually_paid not in (None, "", 0, "0"):
        update_data["actually_paid"] = str(actually_paid)

    # never over a deposit that is already credited: a late "confirming" must not reopen it for a second credit
    db.table("deposits").update(update_data).eq("payment_id", payment_id).neq("status", "finished").execute()
    return {"status": status, "payment_id": payment_id}


# Our own limit, whatever the gateway says: an unpaid deposit is good for one hour from the moment it was started.
DEPOSIT_WINDOW = timedelta(hours=1)


def deposit_deadline(created_at: str) -> datetime:
    return datetime.fromisoformat(str(created_at).replace("Z", "+00:00")) + DEPOSIT_WINDOW


def expire_unpaid(deposit_id: str | None = None) -> int:
    """
    Marks deposits never paid within the hour as expired, and their History row as failed, in one database call
    (expire_unpaid_deposits). Only deposits still 'waiting' are touched: once the gateway has seen a payment, money may be
    on its way, so those are left to it. A payment that arrives later is still credited when the gateway reports it.
    """
    return ledger_service.expire_unpaid_deposits(int(DEPOSIT_WINDOW.total_seconds()), deposit_id)
