from __future__ import annotations
import math
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from core.config import settings
from core.database import db
from core.ratelimit import limiter
from core.security import get_current_user
from services.ledger import ledger_service

router = APIRouter(tags=["Referrals"])

_REFERRALS_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
REFERRALS_CACHE_TTL = 5.0  # seconds


def invalidate_referrals_cache(user_id: str | None = None) -> None:
    if user_id:
        _REFERRALS_CACHE.pop(user_id, None)
    else:
        _REFERRALS_CACHE.clear()

CHUNK = 150  # ids per `in` filter, so the request URL stays short
MAX_PER_LEVEL = 5000  # a safety stop for one tier's member list


def _d(value: Any) -> str:
    return f"{Decimal(str(value or 0)):.8f}"


def _mask_name(full_name: str | None) -> str:
    """'Alex Morgan' -> 'Alex M.'. Members only ever see each other this way: no email, no picture, nothing else about them is
    read from the database for these lists at all."""
    parts = (full_name or "").split()
    if not parts:
        return "Member"
    return parts[0] if len(parts) == 1 else f"{parts[0]} {parts[-1][0].upper()}."


def _chunks(items: list[str]):
    for i in range(0, len(items), CHUNK):
        yield items[i : i + CHUNK]


def _children(parent_ids: list[str]) -> list[str]:
    found: list[str] = []
    for chunk in _chunks(parent_ids):
        res = db.table("profiles").select("id").in_("referred_by", chunk).execute()
        found.extend(r["id"] for r in res.data or [])
    return found[:MAX_PER_LEVEL]


def _walk(user_id: str, depth: int) -> dict[int, list[str]]:
    """The people below this user, tier by tier: tier 1 are the ones who joined with their code, tier 2 theirs, and so on."""
    levels: dict[int, list[str]] = {}
    current = [user_id]
    for level in range(1, depth + 1):
        current = _children(current)
        levels[level] = current
        if not current:
            for rest in range(level + 1, depth + 1):
                levels[rest] = []
            break
    return levels


def _depositors(user_ids: list[str]) -> set[str]:
    """Which of these people have made at least one deposit that went through"""
    active: set[str] = set()
    for chunk in _chunks(user_ids):
        res = db.table("deposits").select("user_id").in_("user_id", chunk).eq("status", "finished").execute()
        active.update(r["user_id"] for r in res.data or [])
    return active


def _max_level() -> int:
    res = db.table("referral_levels").select("level").order("level", desc=True).limit(1).execute()
    return (res.data[0]["level"] if res.data else 5) or 5


def _month_keys(count: int) -> list[str]:
    now = datetime.now(timezone.utc)
    keys: list[str] = []
    y, m = now.year, now.month
    for _ in range(count):
        keys.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(keys))


@router.get("/referrals/overview")
@limiter.limit("30/minute")
def referrals_overview(request: Request, current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    user_id = current_user["id"]
    now = time.time()
    cached = _REFERRALS_CACHE.get(user_id)
    if cached and cached[0] > now:
        return cached[1]

    code = current_user.get("referral_code")

    wallet = (db.table("wallets").select("referral_balance,total_referral").eq("user_id", user_id).execute().data or [{}])[0]
    levels_cfg = db.table("referral_levels").select("level,percentage").order("level").execute().data or []

    summary = ledger_service.get_referral_summary(user_id)  # members and earnings per tier, computed in the database
    counts = summary.get("level_counts") or {}
    earned = summary.get("earnings_by_level") or {}

    direct = _children([user_id])
    active_direct = len(_depositors(direct)) if direct else 0

    # The last six months of commissions, for the chart
    keys = _month_keys(6)
    start = f"{keys[0]}-01T00:00:00+00:00"
    monthly = {k: Decimal(0) for k in keys}
    offset = 0
    while True:
        rows = (
            db.table("referral_earnings").select("amount,created_at").eq("earner_id", user_id).gte("created_at", start)
            .order("created_at").range(offset, offset + 999).execute().data or []
        )
        for r in rows:
            key = str(r["created_at"])[:7]
            if key in monthly:
                monthly[key] += Decimal(str(r["amount"]))
        if len(rows) < 1000:
            break
        offset += 1000

    result = {
        "referral_code": code,
        "share_link": f"{settings.APP_BASE_URL.rstrip('/')}/login?ref={code}" if code else None,
        "available": _d(wallet.get("referral_balance")),
        "total_earned": _d(wallet.get("total_referral")),
        "this_month": _d(monthly[keys[-1]]),
        "members": {"total": sum(int(v) for v in counts.values()), "direct": len(direct), "active_direct": active_direct},
        "levels": [
            {
                "level": lv["level"],
                "percentage": str(lv["percentage"]),
                "members": int(counts.get(str(lv["level"]), 0)),
                "earned": _d(earned.get(str(lv["level"]), 0)),
            }
            for lv in levels_cfg
        ],
        "monthly": [{"month": k, "amount": _d(v)} for k, v in monthly.items()],
    }
    _REFERRALS_CACHE[user_id] = (now + REFERRALS_CACHE_TTL, result)
    return result


@router.get("/referrals/earnings")
@limiter.limit("60/minute")
def referrals_earnings(
    request: Request,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=15, ge=1, le=50),
    level: int | None = Query(default=None, ge=1, le=10),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Every commission paid to this user, newest first: which tier, what percentage of whose deposit, how much."""
    offset = (page - 1) * limit
    query = (
        db.table("referral_earnings")
        .select(
            "id,level,amount,percentage,created_at,"
            "source:profiles!referral_earnings_source_user_id_fkey(full_name),"
            "deposit:deposits!referral_earnings_deposit_id_fkey(credited_usdt)",
            count="exact",
        )
        .eq("earner_id", current_user["id"])
    )
    if level:
        query = query.eq("level", level)
    res = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    total = res.count or 0
    items = []
    for r in res.data or []:
        src = r.get("source") or {}
        dep = r.get("deposit") or {}
        items.append(
            {
                "id": r["id"],
                "level": r["level"],
                "amount": _d(r["amount"]),
                "percentage": str(r.get("percentage") or ""),
                "deposit_amount": _d(dep.get("credited_usdt")) if dep.get("credited_usdt") is not None else None,
                "from": _mask_name(src.get("full_name")),
                "created_at": r["created_at"],
            }
        )
    return {"items": items, "total": total, "page": page, "total_pages": max(1, math.ceil(total / limit))}


@router.get("/referrals/team")
@limiter.limit("60/minute")
def referrals_team(
    request: Request,
    level: int = Query(default=1, ge=1, le=10),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=15, ge=1, le=50),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """The people at one tier of this user's network. Only a shortened name, when they joined and whether they have started: no email, no picture, and nothing about their money except what they earned for you."""
    user_id = current_user["id"]
    if level > _max_level():
        raise HTTPException(status_code=422, detail="That tier does not exist.")
    ids = _walk(user_id, level).get(level, [])

    people: list[dict[str, Any]] = []
    for chunk in _chunks(ids):
        res = db.table("profiles").select("id,full_name,created_at").in_("id", chunk).execute()
        people.extend(res.data or [])
    people.sort(key=lambda p: p["created_at"], reverse=True)

    total = len(people)
    offset = (page - 1) * limit
    shown = people[offset : offset + limit]
    shown_ids = [p["id"] for p in shown]

    active = _depositors(shown_ids) if shown_ids else set()
    earned: dict[str, Decimal] = {}
    if shown_ids:
        rows = (
            db.table("referral_earnings").select("source_user_id,amount").eq("earner_id", user_id)
            .in_("source_user_id", shown_ids).execute().data or []
        )
        for r in rows:
            earned[r["source_user_id"]] = earned.get(r["source_user_id"], Decimal(0)) + Decimal(str(r["amount"]))

    items = [
        {
            "name": _mask_name(p.get("full_name")),
            "joined_at": p["created_at"],
            "status": "active" if p["id"] in active else "joined",
            "earned": _d(earned.get(p["id"], 0)),
        }
        for p in shown
    ]
    return {"items": items, "total": total, "page": page, "total_pages": max(1, math.ceil(total / limit)), "level": level}
