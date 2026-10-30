from __future__ import annotations
import asyncio
import logging
from decimal import Decimal
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator, model_validator
from core.validators import finite_decimal, whole_cents
from services.addresses import address_error
from core.database import db, db_error_message
from core.ratelimit import limiter
from core.security import get_current_user, get_fresh_user
from routers.auth import invalidate_me_cache
from services.app_settings import ensure_open, get_app_settings
from services.ledger import ledger_service
from services.nowpayments import STABLE, WITHDRAW_NETWORKS, nowpayments_service
from services.withdraw_flow import convert_and_pay, send_payout
from services.withdraw_quote import QuoteError, quote_withdrawal

logger = logging.getLogger("mofi.withdraw")
router = APIRouter(tags=["Withdrawals"])

class WithdrawRequest(BaseModel):
    # whole cents only, and a sane ceiling: more places than the ledger keeps, or a number with 40 digits, is never a real request
    amount: Decimal = Field(..., gt=0, max_digits=14, decimal_places=2, description="USDT to withdraw")
    network: str = Field(default="usdtbsc", description="The coin to receive: usdtbsc | btc | eth | ton | sol")
    address: str = Field(..., min_length=20, max_length=100)
    # what the user was shown they would receive: if the price has moved against them since, the request is refused and they look again
    expected_receive: Decimal | None = Field(default=None, ge=0, max_digits=24, decimal_places=8)

    @field_validator("amount", mode="before")
    @classmethod
    def cents(cls, v: Any) -> Decimal:
        return whole_cents(v)

    @field_validator("expected_receive", mode="before")
    @classmethod
    def finite_receive(cls, v: Any) -> Decimal | None:
        return None if v is None else finite_decimal(v)

    @model_validator(mode="after")
    def check(self) -> "WithdrawRequest":
        self.network = self.network.lower().strip()
        self.address = self.address.strip()
        if self.network not in WITHDRAW_NETWORKS:
            raise ValueError("Supported coins: USDT (BEP-20), BTC, ETH, TON, SOL")
        problem = address_error(self.network, self.address)
        if problem:
            raise ValueError(problem)
        return self


def _queued_usdt() -> Decimal:
    """USDT of withdrawals debited but not yet handed to the gateway ('processing'); 'sending' ones are the gateway's balance to show."""
    rows = db.table("withdrawals").select("amount").eq("status", "processing").limit(1000).execute().data or []
    return sum((Decimal(str(r["amount"])) for r in rows), Decimal(0))


@router.get("/withdraw/quote")
@limiter.limit("30/minute")
async def withdraw_quote(
    request: Request,
    amount: Decimal = Query(..., gt=0, max_digits=14, decimal_places=2),
    network: str = "usdtbsc",
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """What `amount` USDT comes to in the chosen coin right now: the network fee, and what arrives after it."""
    network = network.lower().strip()
    if network not in WITHDRAW_NETWORKS:
        raise HTTPException(status_code=400, detail="Unsupported coin")
    amount = amount.quantize(Decimal("0.01"))  # the same two places as a withdrawal itself
    try:
        q = await quote_withdrawal(amount, network)
    except QuoteError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE if e.retryable else 400, detail=e.message)
    return {
        "amount": str(q.amount), "network": network, "fee": str(q.fee), "network_fee": str(q.network_fee),
        "conversion_fee": str(q.conversion_fee), "net": str(q.net), "receive": str(q.receive),
    }


@router.post("/withdraw")
@limiter.limit("5/minute")
async def withdraw_funds(
    request: Request,
    body: WithdrawRequest,
    current_user: dict[str, Any] = Depends(get_fresh_user),
):
    user_id = current_user["id"]

    ensure_open(await asyncio.to_thread(get_app_settings), "withdraw")

    # 0. Price the payout first, so a missing quote never leaves a debit to undo. The fee is taken out of what is sent (the user pays it),
    #    and if the price has moved against what they were shown, they are asked to look again instead of getting less than they agreed to.
    try:
        q = await quote_withdrawal(body.amount, body.network)
    except QuoteError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE if e.retryable else 400, detail=e.message)
    if body.expected_receive is not None and q.receive < body.expected_receive * Decimal("0.98"):
        raise HTTPException(status_code=409, detail="The price changed. Please review the new amount and confirm again.")
    payout_amount = q.receive

    # The address must be one NOWPayments will pay (checked before anything is debited)
    problem = await nowpayments_service.validate_address(body.network, body.address)
    if problem:
        raise HTTPException(status_code=400, detail=problem)

    # Pre-flight: the USDT the payout (or its conversion) draws on must be in custody, or it would fail after the debit
    # (withdrawals still waiting to be handed to the gateway are not in the balance yet, so they are counted as already spoken for)
    needed = q.convert_usdt if body.network != STABLE else payout_amount
    queued = await asyncio.to_thread(_queued_usdt)
    has_liq, liq_msg = await nowpayments_service.check_sufficient_balance(STABLE, needed + queued)
    if not has_liq:
        logger.warning("Withdrawal blocked by liquidity pre-check: %s", liq_msg)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Withdrawals are temporarily unavailable while the payout wallet is topped up. Please try again in a little while.",
        )

    # 1. Atomically take the money out of returns/referral balances (never principal) and log it.
    try:
        res = await asyncio.to_thread(ledger_service.process_withdrawal, user_id, body.amount, body.network, body.address)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=db_error_message(e))
    withdrawal_id = res["withdrawal_id"]
    # The fee and the coin amount, for History (the database already recorded the coin and address). The money has already left
    # the balance, so a failure here must not stop the payout (that would leave the debit with nothing sent and nothing refunded);
    # it is logged and the payout goes ahead.
    try:
        await asyncio.to_thread(lambda: db.table("withdrawals").update({"fee": str(q.fee), "payout_amount": str(payout_amount)}).eq("id", withdrawal_id).execute())
        await asyncio.to_thread(lambda: db.table("wallet_ledger").update({"fee": str(q.fee)}).eq("withdrawal_id", withdrawal_id).execute())
    except Exception:
        logger.exception("withdrawal %s: could not record its payout details", withdrawal_id)

    logger.info("withdrawal %s requested: %s USDT as %s to %s... (fee %s, user %s)", withdrawal_id, body.amount, body.network, body.address[:10], q.fee, user_id)
    # 2. Convert (not for USDT) and send it straight out. No admin approval.
    # The money is already out of the balance, so nothing here may end in a 500 that tells the user it failed: whatever goes wrong, the
    # withdrawal stays 'processing' and the scheduler / the payout webhook / an admin settle it (see services/withdraw_flow.py).
    try:
        if body.network == STABLE:
            outcome = await send_payout(withdrawal_id, body.address, body.network, payout_amount)
        else:
            w = {"id": withdrawal_id, "address": body.address, "network": body.network, "payout_amount": str(payout_amount)}
            outcome = await convert_and_pay(w, q.convert_usdt)
    except Exception:
        logger.exception("withdrawal %s: payout step failed after the debit", withdrawal_id)
        outcome = {"state": "processing", "message": "unexpected error"}
    logger.info("withdrawal %s -> %s", withdrawal_id, outcome["state"])
    invalidate_me_cache(user_id)

    if outcome["state"] == "refunded":
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"The payout could not be submitted and your balance has been restored. ({outcome['message']})",
        )

    reply = {
        "withdrawal_id": withdrawal_id,
        "transaction_id": res["transaction_id"],
        "reference": res.get("reference"),
        "amount": str(body.amount),
        "currency": "USDT",
        "fee": str(q.fee),
        "network_fee": str(q.network_fee),
        "conversion_fee": str(q.conversion_fee),
        "payout_amount": str(payout_amount),
        "network": body.network,
        "address": body.address,
    }
    if outcome["state"] == "processing":
        # Not settled yet (a conversion still running, or an unclear outcome). Never refunded here: the scheduler or the payout webhook settles it.
        return {**reply, "status": "processing", "message": "Withdrawal received. It is being processed and will update shortly."}
    return {**reply, "status": "sending", "message": "Withdrawal submitted. Your funds are on their way."}
