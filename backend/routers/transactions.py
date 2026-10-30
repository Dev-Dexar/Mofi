from __future__ import annotations
import asyncio
import math
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from core.database import db
from core.ratelimit import limiter
from core.security import get_current_user

router = APIRouter(tags=["Ledger"])

TYPES = {"deposit", "withdraw", "withdraw_refund", "daily_yield", "referral_bonus", "reinvest"}
STATUSES = {"pending", "completed", "failed"}


def _page(res: Any, page: int, limit: int) -> dict[str, Any]:
    items = res.data or []
    total = res.count if res.count is not None else len(items)
    return {"items": items, "total": total, "page": page, "limit": limit, "total_pages": max(1, math.ceil(total / limit))}


@router.get("/transactions")
@limiter.limit("120/minute")
async def get_user_transactions(
    request: Request,
    page: int = Query(default=1, ge=1, le=100000, description="Page number starting at 1"),
    limit: int = Query(default=20, ge=1, le=100, description="Items per page"),
    type: str | None = Query(default=None, description="Only this transaction type"),
    status: str | None = Query(default=None, description="Only this status"),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if type:
        type = type.lower().strip()
        if type not in TYPES:
            raise HTTPException(status_code=400, detail="Unknown transaction type")
    if status:
        status = status.lower().strip()
        if status not in STATUSES:
            raise HTTPException(status_code=400, detail="Unknown status")

    # the ledger plus deposits not credited yet (waiting, failed, expired), as one history
    offset = (page - 1) * limit
    res = await asyncio.to_thread(
        lambda: db.rpc("list_user_history", {
            "p_user_id": current_user["id"], "p_type": type, "p_status": status, "p_limit": limit, "p_offset": offset,
        }).execute()
    )
    total = int((res.data or {}).get("total") or 0)
    return {"items": (res.data or {}).get("items") or [], "total": total, "page": page, "limit": limit, "total_pages": max(1, math.ceil(total / limit))}


@router.get("/payouts")
@limiter.limit("60/minute")
async def get_user_payouts(
    request: Request,
    page: int = Query(default=1, ge=1, le=100000),
    limit: int = Query(default=30, ge=1, le=100),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """The daily payouts, newest first: the day, the principal that earned, the rate and what was paid."""
    offset = (page - 1) * limit
    res = (
        db.table("yield_distributions")
        .select("payout_date,eligible_principal,rate,amount,created_at", count="exact")
        .eq("user_id", current_user["id"])
        .order("payout_date", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return _page(res, page, limit)


@router.get("/earnings/monthly")
@limiter.limit("60/minute")
async def get_monthly_earnings(request: Request, current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    """What the member earned in each of the last six months (daily returns plus referral commission), oldest first, for the Dashboard's chart."""
    from datetime import datetime, timezone
    from decimal import Decimal

    today = datetime.now(timezone.utc)
    keys = []
    y, m = today.year, today.month
    for _ in range(6):
        keys.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    keys.reverse()
    start = f"{keys[0]}-01"
    sums = {k: Decimal(0) for k in keys}

    def read() -> None:
        for table, column in (("yield_distributions", "payout_date"), ("referral_earnings", "created_at")):
            offset = 0
            while True:
                rows = (
                    db.table(table)
                    .select(f"amount,{column}")
                    .eq("user_id" if table == "yield_distributions" else "earner_id", current_user["id"])
                    .gte(column, start)
                    .order(column)
                    .order("id" if table == "referral_earnings" else "stake_id")  # a total order, so pages never overlap or skip
                    .range(offset, offset + 999)
                    .execute()
                    .data
                    or []
                )
                for r in rows:
                    k = str(r[column])[:7]
                    if k in sums:
                        sums[k] += Decimal(str(r["amount"]))
                if len(rows) < 1000:
                    break
                offset += 1000

    await asyncio.to_thread(read)
    return {"monthly": [{"month": k, "amount": f"{sums[k]:.8f}"} for k in keys]}
