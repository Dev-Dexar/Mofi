from __future__ import annotations
import asyncio
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from core.database import db, db_error_message
from core.ratelimit import limiter
from core.security import get_signed_in_user

# The only endpoints a suspended account can reach: what its suspension says, and its one appeal
router = APIRouter(prefix="/me", tags=["Suspension"])


@router.get("/suspension")
@limiter.limit("60/minute")
async def my_suspension(request: Request, user: dict[str, Any] = Depends(get_signed_in_user)) -> dict[str, Any]:
    """Whether this account is suspended and, if so, the reference, the message meant for the user, and their appeal (plus their name and photo)."""
    res = await asyncio.to_thread(lambda: db.rpc("get_my_suspension", {"p_user_id": user["id"]}).execute())
    # the name and photo are all the lock screen needs of the profile (it is shown beside their appeal)
    return {**res.data, "profile": {"full_name": user.get("full_name"), "avatar_url": user.get("avatar_url")}}


class AppealRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=20, max_length=3000, description="Up to 3,000 characters")


@router.post("/appeal")
@limiter.limit("5/hour")
async def submit_appeal(request: Request, body: AppealRequest, user: dict[str, Any] = Depends(get_signed_in_user)) -> dict[str, Any]:
    """The one appeal for the open suspension. The database holds the rules: suspended now, not appealed yet, 3,000 characters at most."""
    try:
        res = await asyncio.to_thread(lambda: db.rpc("submit_appeal", {"p_user_id": user["id"], "p_message": body.message}).execute())
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=db_error_message(e))
    return res.data
