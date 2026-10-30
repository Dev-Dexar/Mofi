from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from core.database import db
from services.deposits import expire_unpaid
from services.ledger import ledger_service

logger = logging.getLogger("mofi.scheduler")
scheduler = AsyncIOScheduler()


async def execute_daily_payout_job(triggered_by: str = "scheduler") -> dict:
    """Pays every day still owed. Nothing owed (the usual case on a restart) writes nothing and logs one quiet line."""
    try:
        # The supabase client is blocking, keep it off the event loop
        result = await asyncio.to_thread(ledger_service.run_daily_returns, None, triggered_by)
        status = (result or {}).get("status")
        if status in ("up_to_date", "busy"):
            logger.info("Daily payout (%s): %s", triggered_by, status.replace("_", " "))
        elif status == "success":
            logger.info("Daily payout (%s): %s", triggered_by, result)
            try:
                from routers.auth import invalidate_me_cache
                invalidate_me_cache(None)
            except Exception:
                pass
        else:
            logger.error("Daily payout (%s) did not finish cleanly: %s", triggered_by, result)
        return result
    except Exception as e:
        logger.error("Error executing daily payout job: %s", e, exc_info=True)
        return {"status": "error", "message": str(e)}


async def catch_up_on_startup() -> None:
    """Pays any day missed while the server was down. Safe to repeat: one payout per plan per day."""
    await execute_daily_payout_job("startup")


async def expire_unpaid_deposits_job() -> None:
    try:
        n = await asyncio.to_thread(expire_unpaid)
        if n:
            logger.info("Expired %s unpaid deposit(s)", n)
    except Exception:
        logger.exception("Could not expire unpaid deposits")


async def resume_conversions_job() -> None:
    try:
        from services.withdraw_flow import resume_waiting_conversions
        await resume_waiting_conversions()
    except Exception:
        logger.exception("Could not resume waiting withdrawal conversions")


async def sweep_withdrawals_job() -> None:
    try:
        from services.withdraw_flow import sweep_stranded_withdrawals
        await sweep_stranded_withdrawals()
    except Exception:
        logger.exception("Could not sweep stranded withdrawals")


def _trim_old_rows() -> None:
    """Rows nobody reads any more: wrong-code counters (they only matter for 30 minutes) and the log lines of webhook calls whose
    signature was wrong (anyone can send those, so they must not pile up)."""
    now = datetime.now(timezone.utc)
    db.table("otp_attempts").delete().lt("created_at", (now - timedelta(days=1)).isoformat()).execute()
    db.table("payment_events").delete().eq("signature_valid", False).lt("created_at", (now - timedelta(days=7)).isoformat()).execute()


async def trim_old_rows_job() -> None:
    try:
        await asyncio.to_thread(_trim_old_rows)
    except Exception:
        logger.exception("Could not trim old rows")


def start_scheduler() -> None:
    if not scheduler.running:
        scheduler.add_job(
            execute_daily_payout_job,
            CronTrigger(hour=0, minute=0, timezone="UTC"),
            id="daily_return_job",
            replace_existing=True,
            misfire_grace_time=3600,
            coalesce=True,
        )
        scheduler.add_job(
            expire_unpaid_deposits_job,
            IntervalTrigger(minutes=1),
            id="expire_unpaid_deposits",
            replace_existing=True,
            next_run_time=datetime.now(timezone.utc),  # also once at startup
            coalesce=True,
        )
        scheduler.add_job(
            resume_conversions_job,
            IntervalTrigger(minutes=1),
            id="resume_withdrawal_conversions",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )
        scheduler.add_job(
            sweep_withdrawals_job,
            IntervalTrigger(minutes=5),
            id="sweep_stranded_withdrawals",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )
        scheduler.add_job(
            trim_old_rows_job,
            IntervalTrigger(hours=6),
            id="trim_old_rows",
            replace_existing=True,
            coalesce=True,
        )
        scheduler.start()
        logger.info("APScheduler started: Daily return job registered for 00:00 UTC")


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")
