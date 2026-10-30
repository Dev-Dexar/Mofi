from __future__ import annotations
import asyncio
import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Any
import httpx
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from core.config import settings
from core.database import db

logger = logging.getLogger("mofi.security")
bearer_scheme = HTTPBearer(auto_error=True)

_auth_client: httpx.AsyncClient | None = None


def get_auth_client() -> httpx.AsyncClient:
    global _auth_client
    if _auth_client is None or _auth_client.is_closed:
        _auth_client = httpx.AsyncClient(
            timeout=10.0,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=50),
        )
    return _auth_client


_TOKEN_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_PROFILE_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
TOKEN_CACHE_TTL = 30.0  # seconds
PROFILE_CACHE_TTL = 15.0  # seconds


def invalidate_user_security_cache(user_id: str | None = None) -> None:
    """Invalidates cached profile or tokens so changes take effect immediately."""
    if user_id:
        _PROFILE_CACHE.pop(user_id, None)
    else:
        _PROFILE_CACHE.clear()
        _TOKEN_CACHE.clear()


async def verify_supabase_token(token: str, fresh: bool = False) -> dict[str, Any]:
    """The user behind a token, asked of Supabase (and remembered for a few seconds). `fresh` skips what is remembered."""
    now = time.time()
    cached = None if fresh else _TOKEN_CACHE.get(token)
    if cached and cached[0] > now:
        return cached[1]

    url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": settings.SUPABASE_SERVICE_KEY,
    }
    client = get_auth_client()
    try:
        response = await client.get(url, headers=headers)
    except Exception as e:
        logger.warning("Supabase Auth unreachable: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to verify your session right now. Please try again.",
        )
    if response.status_code != 200:
        _TOKEN_CACHE.pop(token, None)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token",
        )
    data = response.json()
    _TOKEN_CACHE[token] = (now + TOKEN_CACHE_TTL, data)
    if len(_TOKEN_CACHE) > 1000:
        expired = [k for k, (exp, _) in _TOKEN_CACHE.items() if exp <= now]
        for k in expired:
            _TOKEN_CACHE.pop(k, None)
    return data

def token_aal(token: str) -> str:
    """The assurance level claim of a token. Only called on a token Supabase has just accepted, so it is read, not re-verified."""
    try:
        payload = token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        return str(claims.get("aal", "aal1"))
    except Exception:
        return "aal1"


def verified_factor_ids(auth_user: dict[str, Any]) -> list[str]:
    return [f["id"] for f in (auth_user.get("factors") or []) if f.get("status") == "verified" and f.get("factor_type", "totp") == "totp"]


async def get_signed_in_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict[str, Any]:
    return await _signed_in(request, credentials, fresh=False)


async def _signed_in(request: Request, credentials: HTTPAuthorizationCredentials, fresh: bool) -> dict[str, Any]:
    """The signed-in user's profile, suspended or not. Only the suspended user's own endpoints (their suspension and
    their appeal) use this directly; everything else goes through get_current_user, which refuses a suspended account."""
    token = credentials.credentials
    auth_user = await verify_supabase_token(token, fresh=fresh)
    user_id = auth_user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User ID missing from token",
        )
    # Two-step sign-in is enforced here, not just in the browser: a password-only session (aal1) is refused
    # for any account that has 2FA switched on
    if verified_factor_ids(auth_user) and token_aal(token) != "aal2":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "mfa_required"})

    now = time.time()
    if fresh:
        _PROFILE_CACHE.pop(user_id, None)
    cached_profile = _PROFILE_CACHE.get(user_id)
    if cached_profile and cached_profile[0] > now:
        profile_copy = dict(cached_profile[1])
        profile_copy["auth_user"] = auth_user
        return profile_copy

    # Fetch user profile
    try:
        profile_res = await asyncio.to_thread(lambda: db.table("profiles").select("*").eq("id", user_id).execute())
        if profile_res.data and len(profile_res.data) > 0:
            profile = profile_res.data[0]
            _PROFILE_CACHE[user_id] = (now + PROFILE_CACHE_TTL, dict(profile))
            profile["auth_user"] = auth_user
            return profile
    except Exception as e:
        logger.exception("could not load profile %s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not load your account. Please try again.",
        )

    # First sign-in: the profile and its wallet are created together, with the sponsor when a valid referral code came along
    # (sign-up form -> user metadata; Google sign-in -> the code the browser kept, sent in X-Referral-Code)
    user_metadata = auth_user.get("user_metadata", {}) or {}
    referral_code = (request.headers.get("x-referral-code") or user_metadata.get("referral_code") or "").strip()[:32] or None
    try:
        res = await asyncio.to_thread(lambda: db.rpc("provision_profile", {
            "p_user_id": user_id,
            "p_email": auth_user.get("email"),
            "p_full_name": user_metadata.get("full_name") or user_metadata.get("name"),
            "p_avatar_url": user_metadata.get("avatar_url") or user_metadata.get("picture"),
            "p_signup_method": "google" if (auth_user.get("app_metadata") or {}).get("provider") == "google" else "email",
            "p_referral_code": referral_code,
        }).execute())
        profile = res.data
        _PROFILE_CACHE[user_id] = (now + PROFILE_CACHE_TTL, dict(profile))
        profile["auth_user"] = auth_user
        return profile
    except Exception:
        logger.exception("could not provision profile %s", user_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Your profile does not exist and could not be created.",
        )

def _refuse_suspended(user: dict[str, Any]) -> dict[str, Any]:
    if user.get("status") == "suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "account_suspended", "message": "This account is suspended."},
        )
    return user


async def get_current_user(user: dict[str, Any] = Depends(get_signed_in_user)) -> dict[str, Any]:
    """The signed-in user, refused if their account is suspended: before any route runs, on every endpoint but their own
    suspension and appeal. (The database also refuses a suspended account's withdrawals.)
    Session and profile are remembered for a few seconds, which is fine for reading."""
    return _refuse_suspended(user)


async def get_fresh_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict[str, Any]:
    """Same, but nothing remembered: the session and the profile (status, role) are read again from the source on this very request.
    For anything that moves money or changes who has power: a sign-out, suspension or lost admin role applies at once."""
    return _refuse_suspended(await _signed_in(request, credentials, fresh=True))


async def require_admin(
    current_user: dict[str, Any] = Depends(get_fresh_user),
) -> dict[str, Any]:
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Admin access required",
        )
    return current_user

def verify_nowpayments_hmac(
    payload_dict: dict[str, Any],
    raw_body: bytes,
    received_sig: str | None,
) -> bool:
    if not received_sig:
        return False
    if not settings.NOWPAYMENTS_IPN_SECRET:
        return False

    secret_bytes = settings.NOWPAYMENTS_IPN_SECRET.encode("utf-8")

    # NOWPayments signs the body with its keys sorted at every level (their own Python check is json.dumps(..., sort_keys=True)).
    # Payment IPNs carry a nested "fee" object, so sorting only the top level would reject every real one.
    for ascii_only in (True, False):
        try:
            nested = json.dumps(payload_dict, separators=(",", ":"), sort_keys=True, ensure_ascii=ascii_only)
            computed = hmac.new(secret_bytes, nested.encode("utf-8"), hashlib.sha512).hexdigest()
            if hmac.compare_digest(computed.lower(), received_sig.lower()):
                return True
        except Exception:
            pass

    # Top-level keys sorted only
    try:
        def serialize_sorted(obj: Any) -> str:
            if isinstance(obj, dict):
                return json.dumps(
                    {k: obj[k] for k in sorted(obj.keys())},
                    separators=(",", ":"),
                    ensure_ascii=False,
                )
            return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)

        sorted_json = serialize_sorted(payload_dict)
        computed_sig = hmac.new(
            secret_bytes, sorted_json.encode("utf-8"), hashlib.sha512
        ).hexdigest()
        if hmac.compare_digest(computed_sig.lower(), received_sig.lower()):
            return True
    except Exception:
        pass

    # Fallback to raw body HMAC
    try:
        raw_computed = hmac.new(secret_bytes, raw_body, hashlib.sha512).hexdigest()
        if hmac.compare_digest(raw_computed.lower(), received_sig.lower()):
            return True
    except Exception:
        pass

    return False
