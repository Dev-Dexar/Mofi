from __future__ import annotations
from decimal import Decimal
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from core.database import db, db_error_message
from core.ratelimit import limiter
from core.security import get_current_user, get_fresh_user, invalidate_user_security_cache
from core.validators import finite_decimal
from routers.auth import invalidate_me_cache
from services.app_settings import ensure_open, get_app_settings
from services.ledger import ledger_service

router = APIRouter(prefix="/reinvest", tags=["Reinvest"])


class ReinvestEarningsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount: Decimal | None = Field(default=None, gt=0, max_digits=24, decimal_places=8, description="USDT of earnings to reinvest; leave out for all of it")

    @field_validator("amount", mode="before")
    @classmethod
    def finite(cls, v: Any) -> Decimal | None:
        return None if v is None else finite_decimal(v)


@router.post("/earnings")
@limiter.limit("10/minute")
def reinvest_earnings(
    request: Request,
    body: ReinvestEarningsRequest,
    current_user: dict[str, Any] = Depends(get_fresh_user),
) -> dict[str, Any]:
    """Earnings (daily returns, then referral commission) become locked principal: a new part that earns from the next payout day."""
    ensure_open(get_app_settings(), "reinvest")
    try:
        result = ledger_service.process_reinvest_earnings(user_id=current_user["id"], amount=body.amount)
        invalidate_me_cache(current_user["id"])
    except Exception as e:
        # the database raises plain-language messages for rule breaks (minimum, more than earned)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=db_error_message(e))
    return {
        "status": "success",
        "message": "Your earnings are now locked principal, earning from the next payout",
        "data": result,
    }


class AutoReinvestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool


@router.put("/auto")
@limiter.limit("10/minute")
def set_auto_reinvest(
    request: Request,
    body: AutoReinvestRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Switches automatic reinvesting: when on, earnings move into principal right after each daily payout."""
    rows = (
        db.table("profiles").update({"auto_reinvest": body.enabled}).eq("id", current_user["id"]).execute().data
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Your profile could not be found")
    invalidate_user_security_cache(current_user["id"])
    invalidate_me_cache(current_user["id"])
    return {"status": "success", "auto_reinvest": rows[0]["auto_reinvest"]}
