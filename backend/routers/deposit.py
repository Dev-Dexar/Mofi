from __future__ import annotations
import asyncio
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from core.config import settings
from core.database import db, db_error_message
from core.ratelimit import limiter
from core.security import get_current_user, get_fresh_user
from core.validators import whole_cents
from services.app_settings import ensure_open, get_app_settings, limit
from services.deposits import apply_gateway_update, deposit_deadline, expire_unpaid
from services.nowpayments import GatewayError, nowpayments_service

logger = logging.getLogger("mofi.deposit")
_CREATE_LOCK = asyncio.Lock()
router = APIRouter(tags=["Deposit"])


class DepositCreateRequest(BaseModel):
    amount: Decimal = Field(..., gt=0, max_digits=14, decimal_places=2, description="Amount in USD, whole cents. Credited 1:1 as USDT.")
    pay_currency: str = Field(..., description="Coin the user pays with, one of usdtbsc, btc, eth, ton, sol")

    @field_validator("amount", mode="before")
    @classmethod
    def cents(cls, v: Any) -> Decimal:
        return whole_cents(v)

    @field_validator("pay_currency")
    @classmethod
    def clean_currency(cls, v: str) -> str:
        v = v.lower().strip()
        if not re.fullmatch(r"[a-z0-9]{2,24}", v):
            raise ValueError("Invalid currency")
        return v


@router.get("/deposit/currencies")
@limiter.limit("60/minute")
async def list_deposit_currencies(
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        currencies = await nowpayments_service.list_currencies()
    except GatewayError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=e.message)
    return {"currencies": currencies, "credited_as": "USDT"}


@router.post("/deposit/create")
@limiter.limit("1/minute")  # one new invoice a minute: each one is a real payment on the gateway account
async def create_deposit(
    request: Request,
    body: DepositCreateRequest,
    current_user: dict[str, Any] = Depends(get_fresh_user),
) -> dict[str, Any]:
    user_id = current_user["id"]

    cfg = await asyncio.to_thread(get_app_settings)
    ensure_open(cfg, "deposit")

    lo, hi = limit(cfg, "min_deposit_usdt"), limit(cfg, "max_deposit_usdt")
    if not (lo <= body.amount <= hi):
        raise HTTPException(status_code=400, detail=f"Deposit must be between {lo} and {hi} USDT")

    try:
        allowed = {c["code"] for c in await nowpayments_service.list_currencies()}
    except GatewayError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=e.message)
    if body.pay_currency not in allowed:
        raise HTTPException(status_code=400, detail="This currency is not available for deposits.")

    order_id = f"DEP-{user_id[:8]}-{uuid.uuid4().hex[:10]}"
    reference = f"MF-DEP-{uuid.uuid4().hex[:10].upper()}"

    # One new invoice a minute per account as well as per address: counted from the deposits table itself (every attempt is
    # recorded there first), so it holds across restarts, and a second address does not get a second allowance. The check and the
    # recording of the attempt happen under one lock (this runs as a single process), so two requests at once cannot both pass.
    async with _CREATE_LOCK:
        since = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
        recent = await asyncio.to_thread(lambda: db.table("deposits").select("id", count="exact").eq("user_id", user_id).gte("created_at", since).limit(1).execute())
        if (recent.count or 0) > 0:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="You are going too fast. Please wait a minute and try again.",
                headers={"Retry-After": "60"},
            )
        # Record the intent first in the deposits table with its unique reference.
        try:
            dep = (await asyncio.to_thread(lambda: db.table("deposits").insert({
                "reference": reference,
                "user_id": user_id,
                "order_id": order_id,
                "price_amount": str(body.amount),
                "pay_currency": body.pay_currency,
            }).execute().data))[0]
        except Exception as e:
            logger.exception("could not record deposit intent")
            raise HTTPException(status_code=500, detail=f"Could not start the deposit: {db_error_message(e)}")

    try:
        gw = await nowpayments_service.create_payment(body.amount, body.pay_currency, user_id, order_id)
    except GatewayError as e:
        await asyncio.to_thread(lambda: db.table("deposits").update({"status": "failed", "gateway_payload": {"error": e.message}}).eq("id", dep["id"]).execute())
        raise HTTPException(
            status_code=400 if e.status and e.status < 500 else status.HTTP_502_BAD_GATEWAY,
            detail=e.message,
        )

    payment_id = str(gw.get("payment_id") or "")
    update = {
        "payment_id": payment_id,
        "status": str(gw.get("payment_status") or "waiting").lower(),
        "pay_address": gw.get("pay_address"),
        "pay_amount": gw.get("pay_amount"),
        "pay_currency": str(gw.get("pay_currency") or body.pay_currency).lower(),
        "pay_network": gw.get("network"),
        "gateway_payload": gw,
        # our own deadline, not the gateway's: an hour from when the deposit was started
        "expires_at": deposit_deadline(dep["created_at"]).isoformat(),
    }
    logger.info("deposit %s created: %s USD via %s (payment %s, user %s)", dep["reference"], body.amount, body.pay_currency, payment_id, user_id)
    # The payment exists at the gateway now, so storing its id must not be given up on at the first hiccup. If it still fails, the webhook
    # finds the deposit by its order id (services/deposits.py: _link_payment), and the details are logged so a person can recover it.
    for attempt in range(3):
        try:
            await asyncio.to_thread(lambda: db.table("deposits").update(update).eq("id", dep["id"]).execute())
            break
        except Exception:
            logger.exception("deposit %s: could not store payment %s (try %s)", dep["id"], payment_id, attempt + 1)
            if attempt == 2:
                logger.error("deposit %s (order %s) NOT STORED: payment_id=%s address=%s amount=%s", dep["id"], order_id, payment_id, gw.get("pay_address"), gw.get("pay_amount"))
            else:
                await asyncio.sleep(1)

    return {
        "reference": dep["reference"],
        "deposit_id": dep["id"],
        "payment_id": payment_id,
        "order_id": order_id,
        "status": update["status"],
        "pay_address": gw.get("pay_address"),
        "pay_amount": str(gw.get("pay_amount")),
        "pay_currency": update["pay_currency"],
        "network": gw.get("network"),
        "price_amount": str(body.amount),
        "credited_usdt": str(body.amount),
        "fee_paid_by_user": True,
        "expires_at": update.get("expires_at"),
    }


@router.get("/deposit/pay/{reference}")
@limiter.limit("60/minute")
async def get_payment_by_reference(
    request: Request,
    reference: str,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Everything the pay page needs for one deposit, looked up by the deposit's public reference."""
    clean_ref = reference.strip().upper()
    dep_res = await asyncio.to_thread(lambda: (
        db.table("deposits").select("*")
        .eq("user_id", current_user["id"])
        .eq("reference", clean_ref)
        .limit(1).execute()
    ))
    if not dep_res.data:
        # Fallback by UUID id if a direct ID was passed (anything else would only make the database reject the filter)
        try:
            uuid.UUID(reference.strip())
        except ValueError:
            raise HTTPException(status_code=404, detail="Payment not found")
        dep_res = await asyncio.to_thread(lambda: (
            db.table("deposits").select("*")
            .eq("user_id", current_user["id"])
            .eq("id", reference.strip())
            .limit(1).execute()
        ))
        if not dep_res.data:
            raise HTTPException(status_code=404, detail="Payment not found")

    dep = dep_res.data[0]

    payment_id = dep.get("payment_id")
    if payment_id and dep["status"] not in ("finished", "failed", "expired", "refunded"):
        live = await nowpayments_service.get_payment_status(payment_id)
        if live:
            try:
                await asyncio.to_thread(apply_gateway_update, live)
                dep = (await asyncio.to_thread(lambda: db.table("deposits").select("*").eq("id", dep["id"]).single().execute())).data
            except Exception:
                logger.exception("could not apply live status for %s", payment_id)

    if dep["status"] == "waiting" and await asyncio.to_thread(expire_unpaid, dep["id"]):
        dep = (await asyncio.to_thread(lambda: db.table("deposits").select("*").eq("id", dep["id"]).single().execute())).data

    return {
        "reference": dep["reference"],
        "deposit_id": dep["id"],
        "payment_id": payment_id,
        "status": dep["status"],
        "pay_address": dep.get("pay_address"),
        "pay_amount": str(dep["pay_amount"]) if dep.get("pay_amount") is not None else None,
        "pay_currency": dep["pay_currency"],
        "network": dep.get("pay_network"),
        "price_amount": str(dep["price_amount"]),
        "credited_usdt": str(dep.get("credited_usdt") or dep["price_amount"]),
        "expires_at": deposit_deadline(dep["created_at"]).isoformat(),
    }
