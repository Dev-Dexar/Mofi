"""
The steps after a withdrawal has been debited: convert USDT into the coin (not for USDT), then pay out. Used by the request itself and by
the scheduler, which finishes what a request left waiting for a conversion and tidies up what a crash left half done.

Rules that keep money safe:
  * a payout is asked for once: `payout_requested_at` is claimed with a conditional UPDATE (only one caller can win it), and only
    the winner asks the gateway (whose own `unique_external_id` is the second lock). A payout whose outcome is unclear is left for the
    webhook or a person, never refunded or repeated.
  * a conversion has no idempotency key, so one whose outcome is unclear is never repeated either; it is left for a person.
  * the user is refunded only when the gateway definitely did not do it (a conversion or payout it rejected).
  * anything that needs a person is marked in `withdrawals.error` (the admin panel shows it) and left alone by the jobs after that, so
    the log does not repeat it every minute. An admin settles it with "complete" or "refund".
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from decimal import ROUND_DOWN, Decimal, InvalidOperation
from typing import Any

from core.config import settings
from core.database import db
from services.ledger import ledger_service
from services.nowpayments import STABLE, ConversionResult, nowpayments_service
from services.withdraw_quote import payout_places, percent_setting

logger = logging.getLogger("mofi.withdraw")

CONVERSION_POLL_SECONDS = 25  # how long a request waits for the conversion before leaving the rest to the scheduler


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _db(fn):
    return await asyncio.to_thread(fn)


async def flag_for_review(withdrawal_id: str, why: str) -> None:
    """Marks a withdrawal that only a person can settle. Never raises."""
    logger.error("withdrawal %s needs a person: %s", withdrawal_id, why)
    try:
        await _db(lambda: db.table("withdrawals").update({"error": f"Needs review: {why}", "updated_at": _now()}).eq("id", withdrawal_id).is_("error", "null").execute())
    except Exception:
        logger.exception("withdrawal %s: could not flag it for review", withdrawal_id)


async def refund(withdrawal_id: str, reason: str, payload: dict[str, Any]) -> bool:
    """Gives the debit back (the gateway definitely did not do it). Tries a few times; False means a person must."""
    for attempt in range(3):
        try:
            await _db(lambda: ledger_service.fail_withdrawal(withdrawal_id, reason, payload))
            return True
        except Exception:
            logger.exception("withdrawal %s: refund try %s failed", withdrawal_id, attempt + 1)
            await asyncio.sleep(1)
    await flag_for_review(withdrawal_id, f"refund failed ({reason})")
    return False


async def claim_payout(withdrawal_id: str, amount: Decimal) -> bool:
    """Wins the single right to ask for this payout. False: someone else already has it (or it is no longer pending)."""
    now = _now()
    rows = await _db(
        lambda: db.table("withdrawals")
        .update({"payout_requested_at": now, "payout_amount": str(amount), "updated_at": now})
        .eq("id", withdrawal_id)
        .eq("status", "processing")
        .is_("payout_requested_at", "null")
        .execute()
        .data
    )
    return bool(rows)


async def send_payout(withdrawal_id: str, address: str, coin: str, amount: Decimal) -> dict[str, Any]:
    """Asks for the payout. Returns {'state': 'sending' | 'processing' | 'refunded', 'message'}."""
    if not await claim_payout(withdrawal_id, amount):
        return {"state": "processing", "message": "already being handled"}
    payout = await nowpayments_service.create_payout(withdrawal_id, address, amount, coin)
    if payout.outcome == "rejected":
        if await refund(withdrawal_id, payout.message or "Payout rejected", {"error": payout.message}):
            return {"state": "refunded", "message": payout.message}
        return {"state": "processing", "message": payout.message}
    if payout.outcome == "unknown":
        logger.error("withdrawal %s: payout outcome unknown: %s", withdrawal_id, payout.message)
        return {"state": "processing", "message": payout.message}
    try:
        await _db(lambda: ledger_service.mark_withdrawal_sent(withdrawal_id, payout.payout_id, payout.raw))
    except Exception:
        logger.exception("withdrawal %s: payout accepted but could not be marked as sent", withdrawal_id)
    return {"state": "sending", "message": None}


def _quoted_amount(w: dict[str, Any]) -> Decimal | None:
    try:
        q = Decimal(str(w["payout_amount"])) if w.get("payout_amount") is not None else None
        return q if q is not None and q.is_finite() and q > 0 else None
    except (InvalidOperation, ValueError):
        return None


async def settle_conversion(w: dict[str, Any], conversion: ConversionResult | None = None) -> dict[str, Any]:
    """Looks at the conversion of withdrawal `w` and carries on from there. Same return shape as send_payout."""
    conv = conversion or await nowpayments_service.get_conversion(w["conversion_id"])
    if conv.outcome == "rejected":
        if await refund(w["id"], f"Conversion rejected ({conv.message})", {"conversion": conv.raw}):
            return {"state": "refunded", "message": conv.message}
        return {"state": "processing", "message": conv.message}
    if conv.outcome != "finished":
        return {"state": "processing", "message": conv.message}
    # the user is paid exactly what the conversion returned: its fee is theirs, whatever the quote assumed
    amount = (conv.to_amount or Decimal(0)).quantize(payout_places(w["network"]), rounding=ROUND_DOWN)
    if amount <= 0:
        await flag_for_review(w["id"], f"conversion {w['conversion_id']} finished with nothing to send")
        return {"state": "processing", "message": "conversion returned nothing"}
    # ... but not without limit: far less than the quote (a very volatile coin, or a conversion fee much higher than assumed) waits for a person
    quoted = _quoted_amount(w)
    tolerance = percent_setting(settings.WITHDRAW_MAX_SLIPPAGE_PCT, "WITHDRAW_MAX_SLIPPAGE_PCT") or Decimal(0)
    if quoted is not None and amount < quoted * (1 - tolerance / 100):
        await flag_for_review(w["id"], f"conversion {w['conversion_id']} returned {amount}, quoted {quoted}: more than {tolerance}% short")
        return {"state": "processing", "message": "conversion came back short of the quote"}
    return await send_payout(w["id"], w["address"], w["network"], amount)


async def convert_and_pay(w: dict[str, Any], convert_usdt: Decimal) -> dict[str, Any]:
    """Converts `convert_usdt` USDT into the coin of withdrawal `w` (w has id, address, network, payout_amount = the quote), waits a little, pays out."""
    conv = await nowpayments_service.create_conversion(convert_usdt, w["network"])
    if conv.outcome == "rejected":
        if await refund(w["id"], f"Conversion rejected: {conv.message}", {"error": conv.message}):
            return {"state": "refunded", "message": conv.message}
        return {"state": "processing", "message": conv.message}
    if conv.outcome == "unknown" or not conv.conversion_id:
        await flag_for_review(w["id"], f"conversion outcome unknown ({conv.message}); check NOWPayments before doing anything")
        return {"state": "processing", "message": conv.message}
    w = {**w, "conversion_id": conv.conversion_id}
    recorded = False
    for _ in range(3):
        try:
            await _db(lambda: db.table("withdrawals").update({"conversion_id": conv.conversion_id, "updated_at": _now()}).eq("id", w["id"]).execute())
            recorded = True
            break
        except Exception:
            logger.exception("withdrawal %s: could not record conversion %s", w["id"], conv.conversion_id)
            await asyncio.sleep(1)
    if not recorded:
        await flag_for_review(w["id"], f"conversion {conv.conversion_id} was made but could not be recorded")
        return {"state": "processing", "message": "conversion not recorded"}
    waited = 0
    while conv.outcome == "pending" and waited < CONVERSION_POLL_SECONDS:
        await asyncio.sleep(2)
        waited += 2
        conv = await nowpayments_service.get_conversion(w["conversion_id"])
    return await settle_conversion(w, conv)


async def resume_waiting_conversions() -> int:
    """Scheduler job: withdrawals whose conversion was still running when their request ended, and nothing was asked of the payout yet."""
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
    rows = await _db(
        lambda: db.table("withdrawals")
        .select("id,address,network,conversion_id,payout_amount")
        .eq("status", "processing")
        .not_.is_("conversion_id", "null")
        .is_("payout_requested_at", "null")
        .is_("error", "null")
        .lt("updated_at", cutoff)
        .limit(20)
        .execute()
        .data
    )
    for w in rows:
        try:
            res = await settle_conversion(w)
            logger.info("withdrawal %s resumed after conversion: %s", w["id"], res["state"])
        except Exception:
            logger.exception("withdrawal %s: could not resume", w["id"])
    return len(rows)


async def sweep_stranded_withdrawals() -> int:
    """
    Scheduler job: debited withdrawals that a crash or a database blip left going nowhere.
      * USDT, never started (no payout asked, no conversion): nothing was sent, so it is refunded.
      * a coin, no conversion recorded for 30 minutes: a conversion may or may not exist, so it is flagged for a person.
      * a payout asked for 30 minutes ago with no answer: it may have gone out, so it is flagged for a person.
    """
    now = datetime.now(timezone.utc)
    old = lambda minutes: (now - timedelta(minutes=minutes)).isoformat()  # noqa: E731
    base = lambda: db.table("withdrawals").select("id,network,payout_amount").eq("status", "processing").is_("error", "null")  # noqa: E731
    handled = 0

    never_started = await _db(lambda: base().eq("network", STABLE).is_("conversion_id", "null").is_("payout_requested_at", "null").lt("created_at", old(10)).limit(20).execute().data)
    for w in never_started:
        # claim it first, so a request that is merely very late cannot also pay it
        if await claim_payout(w["id"], _quoted_amount(w) or Decimal(0)):
            await refund(w["id"], "Payout never started", {"swept": True})
            handled += 1

    for w in await _db(lambda: base().neq("network", STABLE).is_("conversion_id", "null").is_("payout_requested_at", "null").lt("created_at", old(30)).limit(20).execute().data):
        await flag_for_review(w["id"], "no conversion was recorded; check NOWPayments conversions before refunding")
        handled += 1

    for w in await _db(lambda: base().is_("payout_id", "null").not_.is_("payout_requested_at", "null").lt("updated_at", old(30)).limit(20).execute().data):
        await flag_for_review(w["id"], "payout asked for but no answer; check NOWPayments payouts before refunding")
        handled += 1
    return handled
