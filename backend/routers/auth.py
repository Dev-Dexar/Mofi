from __future__ import annotations
import asyncio
import logging
import re
import time
from decimal import Decimal
from typing import Any, Literal
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator
from core import otp_guard
from core.config import settings
from core.database import db
from core.ratelimit import limiter
from core.security import bearer_scheme, get_current_user, invalidate_user_security_cache, verified_factor_ids, verify_supabase_token

logger = logging.getLogger("mofi.auth")

router = APIRouter(tags=["User & Profile"])

_ME_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
ME_CACHE_TTL = 5.0  # seconds


def invalidate_me_cache(user_id: str | None = None) -> None:
    """Clears cached /me payload so fresh balances and parts are read from DB."""
    if user_id:
        _ME_CACHE.pop(user_id, None)
    else:
        _ME_CACHE.clear()
    try:
        from routers.referrals import invalidate_referrals_cache
        invalidate_referrals_cache(user_id)
    except Exception:
        pass

# matched with fullmatch: `$` would also let a trailing newline through
_EMAIL_RE = re.compile(r"[^@\s<>()\[\]\\,;:\"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+")


class EmailCheckRequest(BaseModel):
    email: str


_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")


def clean_full_name(raw: str) -> str:
    """Same rules as public.clean_full_name in the database: control characters become spaces, < > dropped, single spaces."""
    return re.sub(r"\s+", " ", _CONTROL_RE.sub(" ", raw).replace("<", "").replace(">", "")).strip()


class ProfileUpdate(BaseModel):
    full_name: str

    @field_validator("full_name")
    @classmethod
    def valid_name(cls, v: str) -> str:
        v = clean_full_name(v)
        if len(v) < 2 or len(v) > 80:
            raise ValueError("Name must be 2 to 80 characters.")
        if not any(c.isalpha() for c in v):
            raise ValueError("Name must contain letters.")
        return v


@router.patch("/me/profile")
@limiter.limit("10/minute")
def update_profile(
    request: Request,
    body: ProfileUpdate,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    # Written with the service role on purpose: the browser has no UPDATE right on profiles, so only
    # the fields named here can ever change (never role, referral_code or referred_by).
    user_id = current_user["id"]
    res = db.table("profiles").update({"full_name": body.full_name}).eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Profile not found.")
    profile = res.data[0]
    invalidate_user_security_cache(user_id)
    invalidate_me_cache(user_id)
    return {"profile": profile}


AVATAR_BUCKET = "avatars"
_AVATAR_FILE_RE = re.compile(r"[A-Za-z0-9_-]{1,64}\.(webp|jpg|png)")


class AvatarSet(BaseModel):
    file: str = Field(max_length=80)  # the file name inside the caller's own folder, as uploaded by the browser


def _avatar_url(user_id: str, file: str) -> str:
    return f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{AVATAR_BUCKET}/{user_id}/{file}"


@router.put("/me/avatar")
@limiter.limit("10/minute")
async def set_avatar(
    request: Request,
    body: AvatarSet,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Points the profile at a picture the browser has just uploaded to its own folder. Only the file name is accepted, never a
    URL, so the profile can only ever point into our own bucket and the caller's own folder; the file must really be there
    and must be a small image.
    """
    if not _AVATAR_FILE_RE.fullmatch(body.file):
        raise HTTPException(status_code=422, detail="Invalid file name.")
    url = _avatar_url(current_user["id"], body.file)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            head = await client.head(url)
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="Could not check the picture right now.")
    ctype = head.headers.get("content-type", "")
    size = int(head.headers.get("content-length", "0") or 0)
    if head.status_code != 200 or ctype not in ("image/webp", "image/jpeg", "image/png") or not 0 < size <= 2 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="That picture was not uploaded correctly.")
    user_id = current_user["id"]
    res = await asyncio.to_thread(lambda: db.table("profiles").update({"avatar_url": url}).eq("id", user_id).execute())
    if not res.data:
        raise HTTPException(status_code=404, detail="Profile not found.")
    invalidate_user_security_cache(user_id)
    invalidate_me_cache(user_id)
    return {"profile": res.data[0]}


@router.delete("/me/avatar")
@limiter.limit("10/minute")
def remove_avatar(request: Request, current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    """Back to the Google photo for an account that has one, otherwise to the plain letter. Files in the bucket are removed by the browser."""
    user_id = current_user["id"]
    auth_user = current_user.get("auth_user") or {}
    meta = auth_user.get("user_metadata") or {}
    google = (auth_user.get("app_metadata") or {}).get("provider") == "google" or any(
        i.get("provider") == "google" for i in (auth_user.get("identities") or [])
    )
    fallback = (meta.get("avatar_url") or meta.get("picture")) if google else None
    res = db.table("profiles").update({"avatar_url": fallback}).eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Profile not found.")
    invalidate_user_security_cache(user_id)
    invalidate_me_cache(user_id)
    return {"profile": res.data[0]}


@router.post("/auth/check-email")
@limiter.limit("20/minute")
def check_email(request: Request, body: EmailCheckRequest) -> dict[str, Any]:
    """Pre-flight for the sign-up form so it can explain a refusal. The hard block is the trigger on
    auth.users, which holds for every client; this only reports what it would decide.
    It says nothing about whether an account already exists."""
    email = body.email.strip()
    if len(email) > 254 or not _EMAIL_RE.fullmatch(email):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    try:
        res = db.rpc("is_disposable_email", {"addr": email}).execute()
    except Exception:
        logger.exception("is_disposable_email lookup failed")
        raise HTTPException(status_code=503, detail="Could not check this address right now.")
    if res.data is True:
        return {"allowed": False, "reason": "disposable"}
    return {"allowed": True, "reason": None}


def _own_profile(user: dict[str, Any]) -> dict[str, Any]:
    """The profile row as the browser needs it: not the Supabase Auth user (identities, factors, metadata) that rides along on it."""
    return {k: v for k, v in user.items() if k != "auth_user"}


@router.get("/me")
def get_me(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    user_id = current_user["id"]
    now = time.time()
    cached = _ME_CACHE.get(user_id)
    if cached and cached[0] > now:
        res = dict(cached[1])
        res["profile"] = _own_profile(current_user)
        return res

    # 1. Wallet: balances split by source (principal / daily returns / referral)
    wallet_res = db.table("wallets").select("*").eq("user_id", user_id).execute()
    wallet = wallet_res.data[0] if wallet_res.data else {
        "user_id": user_id,
        "usdt_balance": "0", "deposit_balance": "0", "returns_balance": "0", "referral_balance": "0",
        "total_balance": "0", "total_deposited": "0", "total_reinvested": "0", "total_returns": "0",
        "total_referral": "0", "total_earned": "0", "total_withdrawn": "0",
    }

    # 2. Principal parts, newest first. They never end: each earns for as long as it is held
    inv_res = (
        db.table("stakes")
        .select("id,principal,source,deposit_id,earned_total,last_payout_date,started_at")
        .eq("user_id", user_id)
        .order("started_at", desc=True)
        .execute()
    )

    # 3. Withdrawals still on their way
    pending_res = (
        db.table("withdrawals")
        .select("amount")
        .eq("user_id", user_id)
        .in_("status", ["processing", "sending"])
        .execute()
    )
    pending_withdrawals = sum((Decimal(str(w["amount"])) for w in (pending_res.data or [])), Decimal(0))

    is_admin = current_user.get("role") == "admin"
    me: dict[str, Any] = {
        "profile": _own_profile(current_user),
        "wallet": wallet,
        "investments": inv_res.data or [],
        "pending_withdrawals": f"{pending_withdrawals:.8f}",
        "is_admin": is_admin,
    }
    if is_admin:
        # the badge on the admin menu: appeals waiting for someone
        me["pending_appeals"] = db.table("appeals").select("id", count="exact").eq("status", "pending").limit(1).execute().count or 0
    _ME_CACHE[user_id] = (now + ME_CACHE_TTL, dict(me))
    return me


class VerifyOtpRequest(BaseModel):
    email: str = Field(max_length=254)
    code: str = Field(pattern=r"^\d{6}$")
    type: Literal["recovery", "signup"]
    fingerprint: str = Field(default="", max_length=128)


@router.post("/auth/verify-otp")
@limiter.limit("30/minute")
async def verify_otp(request: Request, body: VerifyOtpRequest) -> dict[str, Any]:
    """
    Checks the 6-digit code from a sign-up or password-reset email, so wrong guesses can be counted. At most
    MAX_ATTEMPTS failures per email address and per caller (IP + browser fingerprint) in the window, whichever
    is hit first. On success returns the session, which the browser adopts.
    """
    email = body.email.strip().lower()
    if not _EMAIL_RE.fullmatch(email):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")

    try:
        ticket = await asyncio.to_thread(otp_guard.begin, email, otp_guard.client_ip(request), body.fingerprint)
    except otp_guard.Blocked as blocked:
        raise HTTPException(status_code=429, detail={"code": "too_many_attempts", "retry_after": blocked.retry_after})
    except Exception:
        logger.exception("otp attempt counter failed")
        raise HTTPException(status_code=503, detail="Could not check the code right now.")  # fail closed

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/verify",
                headers={"apikey": settings.SUPABASE_SERVICE_KEY},
                json={"type": body.type, "email": email, "token": body.code},
            )
    except httpx.HTTPError:
        await asyncio.to_thread(otp_guard.refund, ticket)  # not the user's fault
        raise HTTPException(status_code=503, detail="Could not check the code right now.")

    if res.status_code >= 500 or res.status_code == 429:
        await asyncio.to_thread(otp_guard.refund, ticket)
        raise HTTPException(status_code=503, detail="Could not check the code right now.")
    if res.status_code != 200:
        left = await asyncio.to_thread(otp_guard.attempts_left, ticket)
        raise HTTPException(status_code=400, detail={"code": "invalid_code", "attempts_left": left})

    await asyncio.to_thread(otp_guard.refund, ticket)
    await asyncio.to_thread(otp_guard.succeeded, ticket)
    data = res.json()
    return {"access_token": data.get("access_token"), "refresh_token": data.get("refresh_token")}


class MfaVerifyRequest(BaseModel):
    factor_id: str = Field(max_length=64)
    code: str = Field(pattern=r"^\d{6}$")
    fingerprint: str = Field(default="", max_length=128)


@router.post("/auth/mfa/verify")
@limiter.limit("30/minute")
async def verify_mfa(
    request: Request,
    body: MfaVerifyRequest,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict[str, Any]:
    """
    Second step of sign-in. The caller holds a password-only session; the authenticator code upgrades it. Wrong
    codes are counted per account and per caller (IP + browser fingerprint) with the same limit as emailed codes,
    and the count is taken BEFORE the code is checked so parallel guesses cannot slip past it.
    """
    token = credentials.credentials
    auth_user = await verify_supabase_token(token)
    user_id = auth_user.get("id")
    if not user_id or body.factor_id not in verified_factor_ids(auth_user):
        raise HTTPException(status_code=400, detail={"code": "invalid_code", "attempts_left": 0})

    try:
        # "mfa:" keeps the account's counter apart from the email-code counters
        ticket = await asyncio.to_thread(otp_guard.begin, f"mfa:{user_id}", otp_guard.client_ip(request), body.fingerprint)
    except otp_guard.Blocked as blocked:
        raise HTTPException(status_code=429, detail={"code": "too_many_attempts", "retry_after": blocked.retry_after})
    except Exception:
        logger.exception("mfa attempt counter failed")
        raise HTTPException(status_code=503, detail="Could not check the code right now.")  # fail closed

    base = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/factors/{body.factor_id}"
    headers = {"apikey": settings.SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            challenge = await client.post(f"{base}/challenge", headers=headers)
            if challenge.status_code != 200:
                await asyncio.to_thread(otp_guard.refund, ticket)
                raise HTTPException(status_code=503, detail="Could not check the code right now.")
            res = await client.post(
                f"{base}/verify", headers=headers, json={"challenge_id": challenge.json()["id"], "code": body.code}
            )
    except httpx.HTTPError:
        await asyncio.to_thread(otp_guard.refund, ticket)
        raise HTTPException(status_code=503, detail="Could not check the code right now.")

    if res.status_code >= 500 or res.status_code == 429:
        await asyncio.to_thread(otp_guard.refund, ticket)
        raise HTTPException(status_code=503, detail="Could not check the code right now.")
    if res.status_code != 200:
        raise HTTPException(status_code=400, detail={"code": "invalid_code", "attempts_left": await asyncio.to_thread(otp_guard.attempts_left, ticket)})

    await asyncio.to_thread(otp_guard.refund, ticket)
    await asyncio.to_thread(otp_guard.succeeded, ticket)
    data = res.json()
    return {"access_token": data.get("access_token"), "refresh_token": data.get("refresh_token")}
