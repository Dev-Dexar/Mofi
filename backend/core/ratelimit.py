from __future__ import annotations
from slowapi import Limiter
from fastapi import Request
from core.config import settings
from core.otp_guard import client_ip

# Per-client-IP limits, held in process memory. For multiple instances, point
# storage_uri at Redis (e.g. "redis://host:6379") so counters are shared.

def _key(request: Request) -> str:
    # honours TRUST_PROXY_HEADERS, so behind a proxy people are not all counted as one address
    return client_ip(request)


limiter = Limiter(key_func=_key, storage_uri=settings.RATE_LIMIT_STORAGE_URI or None)
