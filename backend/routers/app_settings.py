from __future__ import annotations
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from core.database import db, db_error_message
from core.ratelimit import limiter
from core.security import require_admin
from services.app_settings import get_app_settings, invalidate_app_settings, public_view

MAX_REFERRAL_LEVEL = 5  # the levels seeded in referral_levels; the database refuses any it does not have

public_router = APIRouter(tags=["Settings"])
admin_router = APIRouter(prefix="/admin/settings", tags=["Admin Settings"])


@public_router.get("/settings")
@limiter.limit("60/minute")
def read_public_settings(request: Request, response: Response) -> dict[str, Any]:
    """Public, read-only values the landing page, calculator and forms need."""
    response.headers["Cache-Control"] = "no-cache"  # always asked again, so a switch an admin flips reaches every open page at once
    return public_view(get_app_settings())


class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    min_deposit_usdt: Optional[float] = Field(None, gt=0, le=1e9)
    max_deposit_usdt: Optional[float] = Field(None, gt=0, le=1e9)
    min_withdraw_usdt: Optional[float] = Field(None, gt=0, le=1e9)
    min_reinvest_usdt: Optional[float] = Field(None, gt=0, le=1e9)
    daily_rate: Optional[float] = Field(None, gt=0, le=0.1, description="Fraction per day, 0.002 = 0.20%. Applies to all principal from the next payout.")
    
    # Item 6: Emergency Circuit Breaker Switches
    deposits_enabled: Optional[bool] = Field(None, description="Master switch for accepting new deposits")
    withdrawals_enabled: Optional[bool] = Field(None, description="Master switch for processing withdrawals")
    reinvest_enabled: Optional[bool] = Field(None, description="Master switch for reinvesting earnings")
    maintenance_mode: Optional[bool] = Field(None, description="Global platform maintenance freeze")

    referral_levels: Optional[dict[int, float]] = Field(
        None,
        description="Tier rates as fractions of the deposit: {1: 0.1, 2: 0.02, ...}. Tier 1 is the direct sponsor.",
    )

    @field_validator("referral_levels")
    @classmethod
    def valid_levels(cls, v: Optional[dict[int, float]]) -> Optional[dict[int, float]]:
        if v is None:
            return v
        for level, rate in v.items():
            if not 1 <= level <= MAX_REFERRAL_LEVEL:
                raise ValueError(f"Tier must be between 1 and {MAX_REFERRAL_LEVEL}")
            if not 0 <= rate <= 1:
                raise ValueError("Tier rates must be between 0% and 100%")
        return v

    @model_validator(mode="after")
    def at_least_one(self) -> "SettingsUpdate":
        if not self.model_dump(exclude_none=True):
            raise ValueError("No settings provided")
        return self


@admin_router.get("")
def read_admin_settings(admin_user: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    row = get_app_settings(force=True)
    return {"settings": public_view(row), "updated_at": row["updated_at"], "updated_by": row["updated_by"]}


@admin_router.put("")
@limiter.limit("10/minute")
def update_admin_settings(
    request: Request,
    body: SettingsUpdate,
    admin_user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    changes = body.model_dump(exclude_none=True)
    if "referral_levels" in changes:
        # JSON object keys are strings
        changes["referral_levels"] = {str(k): v for k, v in changes["referral_levels"].items()}
    try:
        res = db.rpc("admin_update_settings", {"p_user_id": admin_user["id"], "p_changes": changes}).execute()
    except Exception as e:
        # the database's own checks (e.g. max below min) surface here
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Settings rejected: {db_error_message(e)}")
    invalidate_app_settings()
    row = get_app_settings(force=True)
    return {"result": res.data, "settings": public_view(row), "updated_at": row["updated_at"]}


@admin_router.get("/audit")
def read_settings_audit(
    limit: int = 50, admin_user: dict[str, Any] = Depends(require_admin)
) -> dict[str, Any]:
    limit = max(1, min(limit, 200))
    res = (
        db.table("audit_logs")
        .select("id, created_at, details, admin:profiles!audit_logs_admin_id_fkey(email)")
        .eq("action", "settings_update")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    entries = [
        {"id": r["id"], "changed_at": r["created_at"], "changes": (r.get("details") or {}).get("changes") or {}, "profiles": r.get("admin")}
        for r in res.data or []
    ]
    return {"entries": entries}
