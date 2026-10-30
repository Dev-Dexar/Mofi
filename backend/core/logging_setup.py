"""
Logging for the whole app: one format, a level you choose (LOG_LEVEL in .env), and a request id on every line.

Every request gets a short id (or keeps the one a proxy sent in X-Request-ID). It is added to each log line written while that request
runs and returned in the X-Request-ID response header, so a problem a user reports ("it failed, id 7f3a9c21") can be found in the log
with one search:   journalctl -u mofi-backend | grep 7f3a9c21
"""
from __future__ import annotations

import contextvars
import logging
import sys

request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id.get()
        return True


def setup_logging(level: str = "INFO") -> None:
    resolved = getattr(logging, str(level).upper(), None)
    if not isinstance(resolved, int):
        resolved = logging.INFO
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(_RequestIdFilter())
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] [%(request_id)s] %(name)s: %(message)s"))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(resolved)
    # these libraries are chatty at INFO (one line per database call); show them only when debugging
    noisy = logging.DEBUG if resolved <= logging.DEBUG else logging.WARNING
    for name in ("httpx", "httpcore", "hpack", "apscheduler.executors.default", "apscheduler.scheduler"):
        logging.getLogger(name).setLevel(noisy)
