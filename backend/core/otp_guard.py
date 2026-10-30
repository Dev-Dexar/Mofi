from __future__ import annotations
import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from fastapi import Request
from core.config import settings
from core.database import db

logger = logging.getLogger("mofi.otp")

MAX_ATTEMPTS = 5
WINDOW = timedelta(minutes=30)


def client_ip(request: Request) -> str:
    if settings.TRUST_PROXY_HEADERS:
        # the proxy in front appends the address it saw, so the LAST entry is the one we can trust (earlier ones are whatever the client claimed)
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[-1].strip()
        if forwarded:
            return forwarded
    return request.client.host if request.client else "unknown"


def _digest(*parts: str) -> str:
    return hashlib.sha256("\x1f".join(parts).encode()).hexdigest()


@dataclass
class Ticket:
    """One attempt that has been counted. Refunded if the code turns out to be right."""
    email_key: str
    client_key: str
    ids: list[int]


@dataclass
class Blocked(Exception):
    retry_after: int  # seconds


def _since() -> str:
    return (datetime.now(timezone.utc) - WINDOW).isoformat()


def _count(scope: str, key: str) -> int:
    res = db.table("otp_attempts").select("id", count="exact").eq("scope", scope).eq("key", key).gte("created_at", _since()).execute()
    return res.count or 0


def _retry_after(scope: str, key: str) -> int:
    res = (
        db.table("otp_attempts").select("created_at").eq("scope", scope).eq("key", key)
        .gte("created_at", _since()).order("created_at").limit(1).execute()
    )
    if not res.data:
        return 60
    oldest = datetime.fromisoformat(res.data[0]["created_at"].replace("Z", "+00:00"))
    return max(1, int((oldest + WINDOW - datetime.now(timezone.utc)).total_seconds()))


def begin(email: str, ip: str, fingerprint: str) -> Ticket:
    """
    Counts this attempt BEFORE the code is checked, so a burst of parallel guesses cannot all slip through
    ahead of the first failure being recorded. Two independent counters: the email being attacked, and the
    caller (IP + browser fingerprint). Raises Blocked when either is already at its limit.
    """
    email_key = _digest("email", email.strip().lower())
    client_key = _digest("client", ip, fingerprint)
    rows = db.table("otp_attempts").insert(
        [{"scope": "email", "key": email_key}, {"scope": "client", "key": client_key}]
    ).execute().data or []
    ticket = Ticket(email_key, client_key, [r["id"] for r in rows])

    over = [(s, k) for s, k in (("email", email_key), ("client", client_key)) if _count(s, k) > MAX_ATTEMPTS]
    if over:
        refund(ticket)  # a refused attempt does not extend the lock
        raise Blocked(max(_retry_after(s, k) for s, k in over))
    return ticket


def refund(ticket: Ticket) -> None:
    if ticket.ids:
        db.table("otp_attempts").delete().in_("id", ticket.ids).execute()


def succeeded(ticket: Ticket) -> None:
    """Right code: the address starts clean (the caller's own count stays, so one valid account cannot reset it)"""
    db.table("otp_attempts").delete().eq("scope", "email").eq("key", ticket.email_key).execute()


def attempts_left(ticket: Ticket) -> int:
    used = max(_count("email", ticket.email_key), _count("client", ticket.client_key))
    return max(0, MAX_ATTEMPTS - used)
