from __future__ import annotations
import logging
import threading
import time
from decimal import Decimal
from typing import Any
from fastapi import HTTPException
from core.database import db

logger = logging.getLogger("mofi.settings")

CACHE_TTL_SECONDS = 5  # an admin switch is also applied at once (the cache is dropped on save); this only covers a second server

FIELDS = (
    "min_deposit_usdt", "max_deposit_usdt", "min_withdraw_usdt", "min_reinvest_usdt", "daily_rate",
    "deposits_enabled", "withdrawals_enabled", "reinvest_enabled", "maintenance_mode",
)

_lock = threading.Lock()
_cache: dict[str, Any] | None = None
_cache_at = 0.0


def get_app_settings(force: bool = False) -> dict[str, Any]:
    """Current global settings (single DB row), cached briefly to keep reads cheap."""
    global _cache, _cache_at
    with _lock:
        if not force and _cache is not None and time.monotonic() - _cache_at < CACHE_TTL_SECONDS:
            return _cache
        try:
            res = db.table("app_settings").select("*").limit(1).execute()
            data = res.data[0] if res.data else {}
            levels = db.table("referral_levels").select("level, percentage").order("level").execute()
        except Exception:
            # Not the defaults: they have every switch ON, so a database blip would quietly undo a pause or maintenance freeze.
            # Keep the last settings that were read; with none yet, refuse (503) until the database answers.
            logger.exception("could not read app_settings")
            if _cache is not None:
                _cache_at = time.monotonic() - CACHE_TTL_SECONDS + 5  # look again in 5 seconds
                return _cache
            raise HTTPException(status_code=503, detail="The service is starting up. Please try again in a moment.")
        # Tier 1 is the direct sponsor bonus; the rest are N levels up the chain. All admin-editable.
        _cache = {
            "min_deposit_usdt": data.get("min_deposit_usdt", 30.0),
            "max_deposit_usdt": data.get("max_deposit_usdt", 100000.0),
            "min_withdraw_usdt": data.get("min_withdraw_usdt", 30.0),
            "min_reinvest_usdt": data.get("min_reinvest_usdt", 0.20),
            "daily_rate": data.get("daily_rate", 0.0020),
            "deposits_enabled": data.get("deposits_enabled", True),
            "withdrawals_enabled": data.get("withdrawals_enabled", True),
            "reinvest_enabled": data.get("reinvest_enabled", True),
            "maintenance_mode": data.get("maintenance_mode", False),
            **data,
            "referral_levels": [
                {"level": r["level"], "percentage": float(r["percentage"])} for r in (levels.data or [])
            ],
        }
        _cache_at = time.monotonic()
        return _cache


def invalidate_app_settings() -> None:
    global _cache
    with _lock:
        _cache = None


def public_view(row: dict[str, Any]) -> dict[str, Any]:
    """Settings the browser needs: plain fields plus the tier rates (and tier 1 as `direct_bonus_pct`)."""
    levels = row.get("referral_levels", [])
    direct = next((l["percentage"] for l in levels if l["level"] == 1), 0.0)
    return {
        **{k: row.get(k) for k in FIELDS if k in row},
        "referral_levels": levels,
        "direct_bonus_pct": direct,
    }


def limit(settings_row: dict[str, Any], key: str) -> Decimal:
    return Decimal(str(settings_row[key]))



_SWITCHES = {
    "deposit": ("deposits_enabled", "deposits_paused", "Deposits are paused right now. Please check back soon."),
    "withdraw": ("withdrawals_enabled", "withdrawals_paused", "Withdrawals are paused right now. Your balance is safe. Please check back soon."),
    "reinvest": ("reinvest_enabled", "reinvest_paused", "Reinvesting is paused right now. Your earnings stay available."),
}


def ensure_open(cfg: dict[str, Any], feature: str) -> None:
    """Refuses (503, with a code the app understands) when an admin has paused this feature or put the platform in maintenance."""
    key, code, message = _SWITCHES[feature]
    if cfg.get("maintenance_mode", False):
        raise HTTPException(
            status_code=503,
            detail={"code": "maintenance", "message": "MoFi Life is under maintenance. Deposits, withdrawals and reinvesting are paused for a short while."},
        )
    if not cfg.get(key, True):
        raise HTTPException(status_code=503, detail={"code": code, "message": message})
