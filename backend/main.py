from __future__ import annotations
import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from core.logging_setup import request_id, setup_logging
from services.scheduler import catch_up_on_startup, start_scheduler, stop_scheduler

from routers.auth import router as auth_router
from routers.deposit import router as deposit_router
from routers.webhook import router as webhook_router
from routers.reinvest import router as reinvest_router
from routers.withdraw import router as withdraw_router
from routers.transactions import router as transactions_router
from routers.referrals import router as referrals_router
from routers.admin import router as admin_router
from routers.suspension import router as suspension_router
from routers.app_settings import public_router as settings_public_router, admin_router as settings_admin_router
from core.diagnostics import startup_warnings
from core.ratelimit import limiter
from slowapi.errors import RateLimitExceeded

setup_logging(settings.LOG_LEVEL)
logger = logging.getLogger("mofi.main")

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Initializing MoFi Life backend (log level %s)...", settings.LOG_LEVEL.upper())
    for problem in startup_warnings():
        logger.warning("setup: %s", problem)
    start_scheduler()
    catch_up = asyncio.create_task(catch_up_on_startup())
    yield
    catch_up.cancel()
    logger.info("Shutting down MoFi Life backend...")
    stop_scheduler()

_docs = {} if settings.ENABLE_DOCS else {"docs_url": None, "redoc_url": None, "openapi_url": None}

app = FastAPI(
    title="MoFi Life API",
    description="Crypto Investment & Multi-Level Referral Platform Backend",
    version="1.0.0",
    lifespan=lifespan,
    **_docs,
)

async def _too_many_requests(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    # the same shape as every other error (`detail`), so the app can show it as written
    return JSONResponse(
        status_code=429,
        content={"detail": "You are going too fast. Please wait a minute and try again."},
        headers={"Retry-After": "60"},
    )


async def _invalid_request(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Where and why, without echoing the submitted value back: a body holding Infinity or NaN cannot even be written as JSON (it
    # turned a plain refusal into a 500), and nothing the caller sent needs to come back to them.
    detail = [{"loc": list(e.get("loc", ())), "msg": e.get("msg", "Invalid value"), "type": e.get("type", "value_error")} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": detail})


app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _too_many_requests)
app.add_exception_handler(RequestValidationError, _invalid_request)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Referral-Code", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)


SLOW_REQUEST_SECONDS = 2.0


@app.middleware("http")
async def request_context(request: Request, call_next):
    """Gives each request an id (shown on every log line it writes and returned in X-Request-ID), and logs the ones that fail or drag."""
    rid = (request.headers.get("x-request-id") or "")[:32] or uuid.uuid4().hex[:8]
    token = request_id.set(rid)
    started = time.monotonic()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("unhandled error on %s %s", request.method, request.url.path)
        response = JSONResponse(status_code=500, content={"detail": "Something went wrong on our side.", "request_id": rid})
    took = time.monotonic() - started
    if response.status_code >= 500:
        logger.error("%s %s -> %s in %.2fs", request.method, request.url.path, response.status_code, took)
    elif took > SLOW_REQUEST_SECONDS:
        logger.warning("slow request: %s %s -> %s in %.2fs", request.method, request.url.path, response.status_code, took)
    elif logger.isEnabledFor(logging.DEBUG):
        logger.debug("%s %s -> %s in %.3fs", request.method, request.url.path, response.status_code, took)
    response.headers["X-Request-ID"] = rid
    request_id.reset(token)
    return response


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")  # API answers are per-user; /settings sets its own
    return response

ROUTERS = [
    auth_router,
    deposit_router,
    webhook_router,
    reinvest_router,
    withdraw_router,
    transactions_router,
    referrals_router,
    admin_router,
    suspension_router,
    settings_public_router,
    settings_admin_router,
]

# Mounted at the root, and again under /api for setups where a proxy forwards /api to this service
api_app = FastAPI(title="MoFi Life Sub-API", **_docs)
for r in ROUTERS:
    app.include_router(r)
    api_app.include_router(r)
api_app.state.limiter = limiter
api_app.add_exception_handler(RateLimitExceeded, _too_many_requests)
api_app.add_exception_handler(RequestValidationError, _invalid_request)

@api_app.get("/health", tags=["Health"])
@api_app.get("/", tags=["Health"])
async def api_health_check() -> dict[str, str]:
    return {
        "status": "healthy",
        "service": "MoFi Life Sub-API",
        "version": "1.0.0",
    }

app.mount("/api", api_app)

@app.get("/health", tags=["Health"])
@app.get("/", tags=["Health"])
async def health_check() -> dict[str, str]:
    return {
        "status": "healthy",
        "service": "MoFi Life API",
        "version": "1.0.0",
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.PORT, reload=True)
