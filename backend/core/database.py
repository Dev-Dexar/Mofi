from __future__ import annotations
import json
import re
from supabase import create_client, Client
from core.config import settings

def get_supabase_client() -> Client:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY are not set. Copy backend/.env.example to backend/.env and fill them in "
            "(Supabase dashboard > Project Settings > API; see docs/01-supabase.md)."
        )
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

db: Client = get_supabase_client()

def db_error_message(exc: Exception) -> str:
    """Readable text from a PostgREST/Postgres error (the RAISE EXCEPTION message when there is one)."""
    msg = getattr(exc, "message", None)
    if isinstance(msg, str) and msg.strip():
        return msg.strip()

    if exc.args:
        first = exc.args[0]
        if isinstance(first, dict) and "message" in first:
            return str(first["message"]).strip()
        if isinstance(first, str):
            try:
                parsed = json.loads(first)
                if isinstance(parsed, dict) and "message" in parsed:
                    return str(parsed["message"]).strip()
            except Exception:
                pass
            cleaned = re.sub(r"^(?:P\d{4}:|ERROR:\s*)", "", first).strip()
            if cleaned:
                return cleaned

    return str(exc)
