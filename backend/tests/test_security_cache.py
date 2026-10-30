"""Money and admin routes read the session and profile fresh; everything else may use the short cache."""
import asyncio

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from core import security as sec
from tests.conftest import FakeDB


def test_a_suspension_applies_at_once_on_fresh_routes_only(monkeypatch):
    db = FakeDB()
    db.rows("profiles").append({"id": "u1", "status": "active", "role": "user"})
    monkeypatch.setattr(sec, "db", db)
    sec._TOKEN_CACHE.clear()
    sec._PROFILE_CACHE.clear()

    class Client:
        async def get(self, *_a, **_k):
            return type("R", (), {"status_code": 200, "json": lambda self: {"id": "u1", "factors": []}})()

    monkeypatch.setattr(sec, "get_auth_client", lambda: Client())
    cred = HTTPAuthorizationCredentials(scheme="Bearer", credentials="a.b.c")

    async def scenario():
        assert (await sec.get_signed_in_user(None, cred))["status"] == "active"
        db.rows("profiles")[0]["status"] = "suspended"
        assert (await sec.get_signed_in_user(None, cred))["status"] == "active"  # remembered for a few seconds
        with pytest.raises(HTTPException) as refused:
            await sec.get_fresh_user(None, cred)  # a money route sees the truth now
        assert refused.value.status_code == 403

    asyncio.run(scenario())
