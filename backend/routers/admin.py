from __future__ import annotations
import asyncio
import logging
import math
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from core.database import db, db_error_message
from core.ratelimit import limiter
from core.security import require_admin, invalidate_user_security_cache
from routers.auth import invalidate_me_cache
from services.ledger import ledger_service
from services.nowpayments import nowpayments_service

logger = logging.getLogger("mofi.admin")
router = APIRouter(prefix="/admin", tags=["Admin"])

# Withdrawals the gateway should have settled by now; older ones in flight are flagged for a look
STUCK_AFTER = timedelta(minutes=30)
DEPOSIT_STATUSES = {"waiting", "confirming", "confirmed", "sending", "partially_paid", "finished", "failed", "refunded", "expired"}
WITHDRAWAL_STATUSES = {"processing", "sending", "completed", "failed"}


def parse_uuid_or_404(id_val: Any, entity_name: str = "Resource") -> str:
    try:
        return str(uuid.UUID(str(id_val).strip()))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{entity_name} not found",
        )


async def _rpc(name: str, params: dict[str, Any] | None = None) -> Any:
    """A database function, off the event loop. Its own rule-break messages come back to the admin as a 400."""
    try:
        res = await asyncio.to_thread(lambda: db.rpc(name, params or {}).execute())
    except Exception as e:
        msg = db_error_message(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
    return res.data


async def _query(build) -> Any:
    return await asyncio.to_thread(lambda: build().execute())


def _page(res: Any, page: int, limit: int) -> dict[str, Any]:
    items = res.data or []
    total = res.count if res.count is not None else len(items)
    return {"items": items, "total": total, "page": page, "limit": limit, "total_pages": max(1, math.ceil(total / limit))}


# ------------------------------------------------------------------------------------------------------------- overview

@router.get("/stats")
async def get_admin_dashboard_stats(admin_user: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    stats = await _rpc("get_admin_stats")
    cutoff = (datetime.now(timezone.utc) - STUCK_AFTER).isoformat()
    stuck = await _query(
        lambda: db.table("withdrawals").select("id", count="exact").in_("status", ["processing", "sending"]).lt("created_at", cutoff).limit(1)
    )
    stats["withdrawals_stuck"] = stuck.count or 0
    appeals = await _query(lambda: db.table("appeals").select("id", count="exact").eq("status", "pending").limit(1))
    stats["pending_appeals"] = appeals.count or 0
    return {"status": "success", "admin_email": admin_user.get("email"), "stats": stats}


@router.post("/run-payouts")
@limiter.limit("3/minute")
async def trigger_daily_payouts_manually(request: Request, admin_user: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    """Pays every day still owed, up to today. Safe to press any number of times: a day is never paid twice."""
    result = await asyncio.to_thread(ledger_service.run_daily_returns, None, "admin", admin_user["id"])
    invalidate_me_cache(None)
    return {"status": "success", "executed_by": admin_user.get("email"), "result": result}


@router.get("/diagnostics")
@limiter.limit("6/minute")
async def diagnostics(request: Request, admin_user: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    """Is the installation set up properly? The same checks as `python -m scripts.check_setup`, for an admin to read."""
    from core.diagnostics import run_checks
    checks = await run_checks()
    return {
        "ok": not any(c.status == "fail" for c in checks),
        "checks": [{"area": c.area, "name": c.name, "status": c.status, "detail": c.detail, "fix": c.fix} for c in checks],
    }


@router.get("/gateway/balance")
async def get_gateway_balance(admin_user: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    """Item 1: Checks live hot-wallet balances on NOWPayments."""
    return await nowpayments_service.get_balance()



@router.get("/reconcile")
@limiter.limit("10/minute")
async def reconcile(request: Request, admin_user: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    """Checks every wallet against its ledger, principal parts and payouts. `ok` is true when nothing disagrees."""
    mismatches = await asyncio.to_thread(ledger_service.reconcile_wallets)
    return {"ok": not mismatches, "mismatches": mismatches}


@router.get("/analytics")
@limiter.limit("30/minute")
async def analytics(
    request: Request,
    days: int = Query(default=30, ge=7, le=366),
    admin_user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    """Day by day for the last `days` days: sign-ups, deposits, withdrawals, payouts, reinvested, commissions and principal."""
    return await _rpc("admin_analytics", {"p_days": days})


@router.get("/actions")
async def admin_actions(
    page: int = Query(default=1, ge=1, le=100000),
    limit: int = Query(default=30, ge=1, le=100),
    admin_user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    """The admin log, newest first: who did what, to whom, and why."""
    offset = (page - 1) * limit
    res = await _query(
        lambda: db.table("audit_logs")
        .select(
            "id,action,note,details,target_id,created_at,"
            "admin:profiles!audit_logs_admin_id_fkey(email),"
            "target:profiles!audit_logs_target_user_id_fkey(id,email,full_name)",
            count="exact",
        )
        .neq("action", "settings_update")  # rule changes have their own history on the settings page
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    return _page(res, page, limit)


# ---------------------------------------------------------------------------------------------------------------- users

@router.get("/users")
@limiter.limit("60/minute")
async def list_users(
    request: Request,
    search: str | None = Query(default=None, max_length=120),
    status_filter: Literal["active", "suspended"] | None = Query(default=None, alias="status"),
    role: Literal["user", "admin"] | None = None,
    sort: Literal["newest", "oldest", "principal", "withdrawable", "deposited", "withdrawn"] = "newest",
    page: int = Query(default=1, ge=1, le=100000),
    limit: int = Query(default=25, ge=1, le=100),
    admin_user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    data = await _rpc("admin_list_users", {
        "p_search": search, "p_status": status_filter, "p_role": role, "p_sort": sort,
        "p_limit": limit, "p_offset": (page - 1) * limit,
    })
    total = int(data.get("total") or 0)
    return {"items": data.get("items") or [], "total": total, "page": page, "limit": limit, "total_pages": max(1, math.ceil(total / limit))}


def _auth_summary(user_id: str) -> dict[str, Any] | None:
    """How the account signs in, from Supabase Auth: never the raw user object, only what an admin needs to see."""
    try:
        u = db.auth.admin.get_user_by_id(user_id).user
    except Exception:
        logger.warning("could not read auth user %s", user_id)
        return None
    if u is None:
        return None
    factors = getattr(u, "factors", None) or []
    providers = (getattr(u, "app_metadata", None) or {}).get("providers") or []
    return {
        "email_confirmed": bool(getattr(u, "email_confirmed_at", None)),
        "last_sign_in_at": getattr(u, "last_sign_in_at", None),
        "providers": providers,
        "two_factor": any(getattr(f, "status", None) == "verified" for f in factors),
    }


@router.get("/users/{user_id}")
async def get_user(user_id: str, admin_user: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    u_id = parse_uuid_or_404(user_id, "User")
    try:
        raw_detail = await _rpc("admin_get_user", {"p_user_id": u_id})
    except HTTPException as e:
        if e.status_code == 404 or "not found" in str(e.detail).lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User not found")
        raise e
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User not found")

    detail = dict(raw_detail)
    auth, suspensions = await asyncio.gather(
        asyncio.to_thread(_auth_summary, u_id),
        _query(
            lambda: db.table("suspensions")
            .select(
                "id,reference,reason,public_reason,created_at,lifted_at,lift_note,"
                "by:profiles!suspensions_suspended_by_fkey(email),"
                "appeal:appeals(id,status,message,response,created_at,reviewed_at)"
            )
            .eq("user_id", u_id)
            .order("created_at", desc=True)
            .limit(50)
        ),
    )

    detail["parts"] = detail.get("investments") or []
    try:
        detail["referrals"] = await asyncio.to_thread(ledger_service.get_referral_summary, u_id)
    except Exception:
        detail["referrals"] = {"level_counts": {}, "earnings_by_level": {}}

    prof = detail.get("profile") or {}
    ref_by = prof.get("referred_by")
    if ref_by:
        try:
            sp_res = await _query(lambda: db.table("profiles").select("id,email,full_name").eq("id", str(ref_by)).limit(1))
            detail["sponsor"] = sp_res.data[0] if sp_res.data else None
        except Exception:
            detail["sponsor"] = None
    else:
        detail["sponsor"] = None

    try:
        actions_res = await _query(
            lambda: db.table("audit_logs")
            .select("id,action,note,details,target_id,created_at,admin:profiles!audit_logs_admin_id_fkey(email)")
            .eq("target_user_id", u_id)
            .order("created_at", desc=True)
            .limit(50)
        )
        detail["admin_actions"] = actions_res.data or []
    except Exception:
        detail["admin_actions"] = []

    detail["auth"] = auth
    detail["suspensions"] = suspensions.data or []
    return detail


LEDGER_COLUMNS = "id,user_id,type:entry_type,currency,amount,status,source,description,tx_hash,reference,network,address,fee,deposit_id,withdrawal_id,meta,created_at"
ACTIVITY = {
    "transactions": ("wallet_ledger", LEDGER_COLUMNS, "created_at"),
    "deposits": ("deposits", "id,reference,order_id,status,price_amount,pay_currency,pay_amount,actually_paid,credited_usdt,payin_hash,created_at,credited_at", "created_at"),
    "withdrawals": ("withdrawals", "id,reference,amount,network,address,status,payout_amount,tx_hash,error,created_at,completed_at,refunded_at", "created_at"),
    "payouts": ("yield_distributions", "payout_date,eligible_principal,rate,amount,created_at", "payout_date"),
}


@router.get("/users/{user_id}/activity")
async def user_activity(
    user_id: str,
    kind: Literal["transactions", "deposits", "withdrawals", "payouts"] = "transactions",
    page: int = Query(default=1, ge=1, le=100000),
    limit: int = Query(default=20, ge=1, le=100),
    admin_user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    u_id = parse_uuid_or_404(user_id, "User")
    table, columns, order = ACTIVITY[kind]
    offset = (page - 1) * limit
    res = await _query(
        lambda: db.table(table).select(columns, count="exact").eq("user_id", u_id).order(order, desc=True).range(offset, offset + limit - 1)
    )
    return _page(res, page, limit)


TEAM_DEPTH = 12  # how many tiers down an admin can look into a team


def _team(user_id: str, level: int, beyond: bool, page: int, limit: int) -> dict[str, Any]:
    """The people below one user: one tier, or everyone past the last tier that pays commission. Admins see who they are (name, email,
    photo), what each deposited and what each earned for this user."""
    from routers.referrals import _chunks, _max_level, _walk  # the same walk the members' own team page uses

    max_level = _max_level()
    tiers = _walk(user_id, TEAM_DEPTH)
    counts = {str(k): len(v) for k, v in tiers.items()}
    if beyond:
        members = [(i, lv) for lv in range(max_level + 1, TEAM_DEPTH + 1) for i in tiers.get(lv, [])]
    else:
        members = [(i, level) for i in tiers.get(level, [])]
    level_of = dict(members)

    people: list[dict[str, Any]] = []
    for chunk in _chunks(list(level_of)):
        res = db.table("profiles").select("id,full_name,email,avatar_url,created_at,status").in_("id", chunk).execute()
        people.extend(res.data or [])
    people.sort(key=lambda p: p["created_at"], reverse=True)

    total = len(people)
    shown = people[(page - 1) * limit : page * limit]
    ids = [p["id"] for p in shown]
    deposited: dict[str, Decimal] = {}
    earned: dict[str, Decimal] = {}
    if ids:
        for r in db.table("deposits").select("user_id,credited_usdt").in_("user_id", ids).eq("status", "finished").execute().data or []:
            deposited[r["user_id"]] = deposited.get(r["user_id"], Decimal(0)) + Decimal(str(r["credited_usdt"] or 0))
        for r in db.table("referral_earnings").select("source_user_id,amount").eq("earner_id", user_id).in_("source_user_id", ids).execute().data or []:
            earned[r["source_user_id"]] = earned.get(r["source_user_id"], Decimal(0)) + Decimal(str(r["amount"]))

    return {
        "items": [
            {
                "id": p["id"], "full_name": p.get("full_name"), "email": p.get("email"), "avatar_url": p.get("avatar_url"),
                "status": p.get("status"), "joined_at": p["created_at"], "level": level_of[p["id"]],
                "deposited": f"{deposited.get(p['id'], Decimal(0)):.8f}", "earned": f"{earned.get(p['id'], Decimal(0)):.8f}",
            }
            for p in shown
        ],
        "total": total, "page": page, "limit": limit, "total_pages": max(1, math.ceil(total / limit)),
        "max_level": max_level, "counts": counts,
    }


@router.get("/users/{user_id}/team")
async def user_team(
    user_id: str,
    level: int = Query(default=1, ge=1, le=TEAM_DEPTH),
    beyond: bool = False,
    page: int = Query(default=1, ge=1, le=100000),
    limit: int = Query(default=10, ge=1, le=50),
    admin_user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    u_id = parse_uuid_or_404(user_id, "User")
    """`counts` is the head-count at every tier (so the tabs can say how many are in each, including past the last paying tier)."""
    return await asyncio.to_thread(_team, u_id, level, beyond, page, limit)


class StatusChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["active", "suspended"]
    reason: str | None = Field(default=None, max_length=500, description="For admins: why (a suspension needs one)")
    public_reason: str | None = Field(default=None, max_length=1000, description="Optional message the suspended user sees")


@router.put("/users/{user_id}/status")
@limiter.limit("20/minute")
async def set_user_status(request: Request, user_id: str, body: StatusChange, admin_user: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    u_id = parse_uuid_or_404(user_id, "User")
    res = await _rpc("admin_set_user_status", {
        "p_admin_id": admin_user["id"], "p_user_id": u_id, "p_status": body.status,
        "p_reason": body.reason, "p_public_reason": body.public_reason,
    })
    invalidate_user_security_cache(u_id)
    invalidate_me_cache(u_id)
    return res


class RoleChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "admin"]


@router.put("/users/{user_id}/role")
@limiter.limit("10/minute")
async def set_user_role(request: Request, user_id: str, body: RoleChange, admin_user: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    u_id = parse_uuid_or_404(user_id, "User")
    res = await _rpc("admin_set_user_role", {"p_admin_id": admin_user["id"], "p_user_id": u_id, "p_role": body.role})
    invalidate_user_security_cache(u_id)
    invalidate_me_cache(u_id)
    return res


# ------------------------------------------------------------------------------------------------- deposits, withdrawals

DEPOSIT_COLUMNS = "id,reference,order_id,payment_id,status,price_amount,pay_currency,pay_amount,actually_paid,credited_usdt,payin_hash,created_at,credited_at"
WITHDRAWAL_COLUMNS = "id,reference,amount,network,address,status,payout_id,payout_amount,tx_hash,error,created_at,completed_at,refunded_at"
USER_COLUMNS = "user:profiles!{table}_user_id_fkey(id,email,full_name,avatar_url)"


# A deposit's gateway states, grouped the way an admin thinks of them (a withdrawal's own four need no grouping)
DEPOSIT_GROUPS = {
    "progress": ["waiting", "confirming", "confirmed", "sending"],  # the payment is on its way; nothing to do yet
    "closed": ["failed", "expired", "refunded"],  # over without a credit ("refunded" is NOWPayments sending a stuck payment back to the sender; this app never refunds a deposit)
}
# a withdrawal's four states, grouped the same two ways (so "in progress" and "closed" mean the same thing on both)
WITHDRAWAL_GROUPS = {"progress": ["processing", "sending"], "closed": ["failed"]}


def _money_query(table: str, columns: str, status_filter: str | None, allowed: set[str], attention: list[str], stuck: bool):
    q = db.table(table).select(f"{columns},{USER_COLUMNS.format(table=table)}", count="exact")
    if status_filter == "attention":
        q = q.in_("status", attention)
        if stuck:
            q = q.lt("created_at", (datetime.now(timezone.utc) - STUCK_AFTER).isoformat())
    elif status_filter in (DEPOSIT_GROUPS if table == "deposits" else WITHDRAWAL_GROUPS):
        q = q.in_("status", (DEPOSIT_GROUPS if table == "deposits" else WITHDRAWAL_GROUPS)[status_filter])
    elif status_filter:
        if status_filter not in allowed:
            raise HTTPException(status_code=400, detail="Unknown status")
        q = q.eq("status", status_filter)
    return q


def _money_search(text: str, columns: list[str], amount_column: str) -> str | None:
    """A PostgREST `or` over what an admin might paste or type: a name or email, any id, hash or address, or an exact amount."""
    clean = "".join(ch for ch in text if ch not in ',()*\\"\'%_').strip()[:100]
    if not clean:
        return None
    like = f"*{clean}*"
    uids = [r["id"] for r in db.table("profiles").select("id").or_(f"email.ilike.{like},full_name.ilike.{like}").limit(300).execute().data or []]
    parts = [f"{c}.ilike.{like}" for c in columns]
    if uids:
        parts.append(f"user_id.in.({','.join(uids)})")
    try:
        Decimal(clean.lstrip("$"))
        parts.append(f"{amount_column}.eq.{clean.lstrip('$')}")
    except Exception:
        pass
    return ",".join(parts)


def _count(table: str, column: str, values: list[str], older_than: datetime | None = None) -> int:
    q = db.table(table).select("id", count="exact").in_(column, values).limit(1)
    if older_than:
        q = q.lt("created_at", older_than.isoformat())
    return q.execute().count or 0


def _money_list(kind: str, status_filter: str | None, search: str, page: int, limit: int) -> dict[str, Any]:
    deposits = kind == "deposits"
    table, columns = ("deposits", DEPOSIT_COLUMNS) if deposits else ("withdrawals", WITHDRAWAL_COLUMNS)
    allowed, attention = (DEPOSIT_STATUSES, ["partially_paid"]) if deposits else (WITHDRAWAL_STATUSES, ["processing", "sending"])
    q = _money_query(table, columns, status_filter, allowed, attention, stuck=not deposits)
    if search:
        # "reference" is the MF- id a member quotes to support
        searchable = ["reference", "order_id", "payment_id", "payin_hash"] if deposits else ["reference", "address", "tx_hash", "payout_id"]
        clause = _money_search(search, searchable, "price_amount" if deposits else "amount")
        if clause:
            q = q.or_(clause)
    offset = (page - 1) * limit
    out = _page(q.order("created_at", desc=True).range(offset, offset + limit - 1).execute(), page, limit)
    stuck_before = datetime.now(timezone.utc) - STUCK_AFTER
    out["counts"] = (
        {
            "attention": _count("deposits", "status", ["partially_paid"]),
            "progress": _count("deposits", "status", DEPOSIT_GROUPS["progress"]),
            "credited": _count("deposits", "status", ["finished"]),
            "closed": _count("deposits", "status", DEPOSIT_GROUPS["closed"]),
        }
        if deposits
        else {
            "attention": _count("withdrawals", "status", ["processing", "sending"], stuck_before),
            "progress": _count("withdrawals", "status", ["processing", "sending"]),
            "delivered": _count("withdrawals", "status", ["completed"]),
            "refunded": _count("withdrawals", "status", ["failed"]),
        }
    )
    return out


# What "done" and "closed" mean on each side when deposits and withdrawals are listed together
_UNIFIED = {"attention": ("attention", "attention"), "progress": ("progress", "progress"), "done": ("finished", "completed"), "closed": ("closed", "closed")}
MAX_MERGED = 4000  # rows a merged page may reach into (page x limit): each side is read that far, then the two are interleaved


def _money_merged(kind: str, status_filter: str | None, search: str, page: int, limit: int) -> dict[str, Any]:
    """Deposits and withdrawals as one list, newest first (or just one kind), each row tagged with its `kind`, and the four counts the
    strip shows (attention, progress, done, closed) added up across whatever is listed."""
    if page * limit > MAX_MERGED:
        raise HTTPException(status_code=400, detail="That page is too far back: narrow the search instead")
    sides = ["deposits", "withdrawals"] if kind == "all" else [kind]
    merged: list[dict[str, Any]] = []
    total = 0
    counts = {"attention": 0, "progress": 0, "done": 0, "closed": 0}
    for side in sides:
        status_for_side = status_filter
        if kind == "all" and status_filter in _UNIFIED:
            status_for_side = _UNIFIED[status_filter][0 if side == "deposits" else 1]
        # one side alone is paged by the database; both together are read from the top as far as this page reaches, then interleaved
        out = _money_list(side, status_for_side, search, page if kind != "all" else 1, limit if kind != "all" else page * limit)
        tag = "deposit" if side == "deposits" else "withdrawal"
        merged += [{**row, "kind": tag} for row in out["items"]]
        total += out["total"]
        c = out["counts"]
        counts["attention"] += c["attention"]
        counts["progress"] += c["progress"]
        counts["done"] += c["credited"] if side == "deposits" else c["delivered"]
        counts["closed"] += c["closed"] if side == "deposits" else c["refunded"]
    if kind == "all":
        merged.sort(key=lambda r: r["created_at"], reverse=True)
        merged = merged[(page - 1) * limit : page * limit]
    return {"items": merged, "total": total, "page": page, "limit": limit, "total_pages": max(1, math.ceil(total / limit)), "counts": counts}


@router.get("/money")
@limiter.limit("60/minute")
async def list_money(
    request: Request,
    kind: Literal["all", "deposits", "withdrawals"] = "all",
    status_filter: str | None = Query(default=None, alias="status", max_length=20),
    search: str = Query(default="", max_length=100),
    page: int = Query(default=1, ge=1, le=100000),
    limit: int = Query(default=25, ge=1, le=100),
    admin_user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    """Deposits and withdrawals in one list. kind=all interleaves them by date, and its status filter reads attention | progress | done |
    closed (each means the matching thing on both sides); one kind alone takes that kind's own statuses."""
    return await asyncio.to_thread(_money_merged, kind, status_filter, search.strip(), page, limit)


@router.get("/deposits")
@limiter.limit("60/minute")
async def list_deposits(
    request: Request,
    status_filter: str | None = Query(default=None, alias="status", max_length=20),
    search: str = Query(default="", max_length=100),
    page: int = Query(default=1, ge=1, le=100000),
    limit: int = Query(default=25, ge=1, le=100),
    admin_user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    """Every deposit, newest first, searchable. status=attention: the ones a person has to settle (paid short of what was ordered)."""
    return await asyncio.to_thread(_money_list, "deposits", status_filter, search.strip(), page, limit)


@router.get("/withdrawals")
@limiter.limit("60/minute")
async def list_withdrawals(
    request: Request,
    status_filter: str | None = Query(default=None, alias="status", max_length=20),
    search: str = Query(default="", max_length=100),
    page: int = Query(default=1, ge=1, le=100000),
    limit: int = Query(default=25, ge=1, le=100),
    admin_user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    """Every withdrawal, newest first, searchable. status=attention: still in flight after half an hour, which the gateway should have settled."""
    return await asyncio.to_thread(_money_list, "withdrawals", status_filter, search.strip(), page, limit)


@router.get("/deposits/{deposit_id}")
@limiter.limit("120/minute")
async def get_deposit(request: Request, deposit_id: str, admin_user: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    d_id = parse_uuid_or_404(deposit_id, "Deposit")
    res = await _query(lambda: db.table("deposits").select(f"{DEPOSIT_COLUMNS},{USER_COLUMNS.format(table='deposits')}").eq("id", d_id).limit(1))
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deposit not found")
    return res.data[0]


@router.get("/withdrawals/{withdrawal_id}")
@limiter.limit("120/minute")
async def get_withdrawal(request: Request, withdrawal_id: str, admin_user: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    w_id = parse_uuid_or_404(withdrawal_id, "Withdrawal")
    res = await _query(lambda: db.table("withdrawals").select(f"{WITHDRAWAL_COLUMNS},{USER_COLUMNS.format(table='withdrawals')}").eq("id", w_id).limit(1))
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Withdrawal not found")
    return res.data[0]


class DepositResolution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["credit", "reject"]
    amount: Decimal | None = Field(default=None, gt=0, max_digits=24, decimal_places=8, description="USDT to credit; the ordered amount when left out")
    note: str = Field(min_length=3, max_length=500)


@router.post("/deposits/{deposit_id}/resolve")
@limiter.limit("20/minute")
async def resolve_deposit(request: Request, deposit_id: str, body: DepositResolution, admin_user: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    """Settles a deposit the gateway left open: credit it (through the same ledger and commissions as the gateway) or reject it."""
    d_id = parse_uuid_or_404(deposit_id, "Deposit")
    res = await _rpc("admin_resolve_deposit", {
        "p_admin_id": admin_user["id"], "p_deposit_id": d_id, "p_action": body.action,
        "p_amount": None if body.amount is None else str(body.amount), "p_note": body.note,
    })
    invalidate_me_cache(None)
    return res


class WithdrawalResolution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["complete", "refund"]
    tx_hash: str | None = Field(default=None, max_length=200)
    note: str = Field(min_length=3, max_length=500)


@router.post("/withdrawals/{withdrawal_id}/resolve")
@limiter.limit("20/minute")
async def resolve_withdrawal(request: Request, withdrawal_id: str, body: WithdrawalResolution, admin_user: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    """Settles a withdrawal the gateway never did: delivered (with the payout's hash) or refunded in full to the user."""
    w_id = parse_uuid_or_404(withdrawal_id, "Withdrawal")
    res = await _rpc("admin_resolve_withdrawal", {
        "p_admin_id": admin_user["id"], "p_withdrawal_id": w_id, "p_action": body.action,
        "p_tx_hash": body.tx_hash, "p_note": body.note,
    })
    invalidate_me_cache(None)
    return res



# -------------------------------------------------------------------------------------------------------------- appeals

APPEAL_SELECT = (
    "id,status,message,response,created_at,reviewed_at,"
    "user:profiles!appeals_user_id_fkey(id,email,full_name,avatar_url,status),"
    "reviewer:profiles!appeals_reviewed_by_fkey(email),"
    "suspension:suspensions!appeals_suspension_id_fkey(reference,reason,public_reason,created_at,lifted_at)"
)


def _search_clause(text: str) -> str | None:
    """A PostgREST `or` over what an admin might type: part of the appeal, a name or email, or a suspension reference."""
    clean = "".join(ch for ch in text if ch not in ',()*\\"\'%_').strip()[:80]
    if not clean:
        return None
    like = f"*{clean}*"
    uids = [r["id"] for r in db.table("profiles").select("id").or_(f"email.ilike.{like},full_name.ilike.{like}").limit(300).execute().data or []]
    sids = [r["id"] for r in db.table("suspensions").select("id").ilike("reference", like).limit(300).execute().data or []]
    parts = [f"message.ilike.{like}"]
    if uids:
        parts.append(f"user_id.in.({','.join(uids)})")
    if sids:
        parts.append(f"suspension_id.in.({','.join(sids)})")
    return ",".join(parts)


def _appeals(status_filter: str, search: str, page: int, limit: int) -> dict[str, Any]:
    q = db.table("appeals").select(APPEAL_SELECT, count="exact")
    if status_filter == "pending":
        q = q.eq("status", "pending")
    elif status_filter == "reviewed":
        q = q.neq("status", "pending")
    elif status_filter in ("accepted", "rejected"):
        q = q.eq("status", status_filter)
    if search:
        clause = _search_clause(search)
        if clause:
            q = q.or_(clause)
    # the ones waiting come oldest first (the longest wait on top); the rest newest first
    q = q.order("created_at") if status_filter == "pending" else q.order("created_at", desc=True)
    offset = (page - 1) * limit
    out = _page(q.range(offset, offset + limit - 1).execute(), page, limit)
    out["counts"] = {
        st: (db.table("appeals").select("id", count="exact").eq("status", st).limit(1).execute().count or 0) for st in ("pending", "accepted", "rejected")
    }
    return out


@router.get("/appeals")
@limiter.limit("60/minute")
async def list_appeals(
    request: Request,
    status_filter: Literal["pending", "reviewed", "accepted", "rejected", "all"] = Query(default="pending", alias="status"),
    search: str = Query(default="", max_length=100),
    page: int = Query(default=1, ge=1, le=100000),
    limit: int = Query(default=20, ge=1, le=100),
    admin_user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    """Appeals with their suspension and the user, searchable; `counts` is how many are waiting, accepted and rejected overall."""
    return await asyncio.to_thread(_appeals, status_filter, search.strip(), page, limit)


@router.get("/appeals/{appeal_id}")
@limiter.limit("120/minute")
async def get_appeal(request: Request, appeal_id: str, admin_user: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    a_id = parse_uuid_or_404(appeal_id, "Appeal")
    res = await _query(lambda: db.table("appeals").select(APPEAL_SELECT).eq("id", a_id).limit(1))
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appeal not found")
    return res.data[0]


class AppealReview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: Literal["accept", "reject"]
    response: str | None = Field(default=None, max_length=2000, description="Shown to the user; required to reject")


@router.post("/appeals/{appeal_id}/review")
@limiter.limit("30/minute")
async def review_appeal(request: Request, appeal_id: str, body: AppealReview, admin_user: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    """Accept (the suspension is lifted) or reject (the user sees the reply). Logged either way."""
    a_id = parse_uuid_or_404(appeal_id, "Appeal")
    res = await _rpc("admin_review_appeal", {
        "p_admin_id": admin_user["id"], "p_appeal_id": a_id, "p_decision": body.decision, "p_response": body.response,
    })
    invalidate_user_security_cache(None)
    invalidate_me_cache(None)
    return res

