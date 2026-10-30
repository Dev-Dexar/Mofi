"""
Is this installation set up properly? Two uses:

  * startup_warnings()  - what is wrong with the settings alone (no network); written to the log every time the server starts
  * run_checks()        - the full check against the real Supabase project and NOWPayments account; used by
                          `python -m scripts.check_setup` and by the admin endpoint GET /admin/diagnostics

Each check is one line: ok / warn / fail and what to do about it. Nothing here changes anything.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

import httpx

from core.config import settings

REQUIRED_TABLES = [
    "profiles", "wallets", "stakes", "deposits", "withdrawals", "wallet_ledger", "yield_distributions", "distribution_batches",
    "referral_levels", "referral_earnings", "app_settings", "audit_logs", "suspensions", "appeals", "payment_events",
    "otp_attempts", "disposable_email_domains",
]


@dataclass
class Check:
    area: str
    name: str
    status: str  # ok | warn | fail
    detail: str = ""
    fix: str = ""
    extra: dict[str, Any] = field(default_factory=dict)


def _local(url: str) -> bool:
    return any(h in url for h in ("localhost", "127.0.0.1", "0.0.0.0"))


def _findings() -> list[tuple[str, str, str]]:
    """(setting, what is wrong, what to do) for problems visible from the settings alone."""
    out: list[tuple[str, str, str]] = []
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        out.append(("SUPABASE_URL / SUPABASE_SERVICE_KEY", "not set: nothing can work", "run tools/configure.py or fill backend/.env (docs/01-supabase.md)"))
    if _local(settings.APP_BASE_URL):
        out.append(("APP_BASE_URL", "is a local address (fine for development)", "on a server set it to your website's address, https://..."))
    if not settings.NOWPAYMENTS_API_KEY:
        out.append(("NOWPAYMENTS_API_KEY", "is empty: deposits are off", "docs/04-nowpayments.md"))
    if not settings.NOWPAYMENTS_IPN_SECRET:
        out.append(("NOWPAYMENTS_IPN_SECRET", "is empty: every payment webhook is refused, so no deposit would ever be credited", "docs/04-nowpayments.md"))
    if not (settings.NOWPAYMENTS_EMAIL and settings.NOWPAYMENTS_PASSWORD):
        out.append(("NOWPAYMENTS_EMAIL / NOWPAYMENTS_PASSWORD", "are empty: withdrawals (payouts) are off", "docs/04-nowpayments.md, section 3"))
    elif not settings.NOWPAYMENTS_2FA_SECRET:
        out.append(("NOWPAYMENTS_2FA_SECRET", "is empty: payouts are created but wait for a manual 2FA confirmation in the NOWPayments dashboard", "docs/04-nowpayments.md, section 3"))
    if settings.webhook_url is None:
        out.append(("webhook address", "none: APP_BASE_URL / API_PUBLIC_URL is local, so NOWPayments cannot report payments back", "use a tunnel when testing, or the real address on the server"))
    if not settings.WITHDRAW_CONVERSION_FEE_PCT.strip():
        out.append(("WITHDRAW_CONVERSION_FEE_PCT", "is empty: only USDT withdrawals are offered", "docs/04-nowpayments.md, section 4"))
    if settings.ENABLE_DOCS:
        out.append(("ENABLE_DOCS", "is on: /docs lists every endpoint", "turn it off in production"))
    return out


def startup_warnings() -> list[str]:
    return [f"{name} {what}." for name, what, _fix in _findings()]


async def _get(client: httpx.AsyncClient, url: str, **kw: Any) -> httpx.Response | None:
    try:
        return await client.get(url, **kw)
    except Exception:
        return None


async def run_checks() -> list[Check]:
    checks: list[Check] = []
    add = lambda *a, **k: checks.append(Check(*a, **k))  # noqa: E731
    base = settings.SUPABASE_URL.rstrip("/")
    keyed = {"apikey": settings.SUPABASE_SERVICE_KEY}
    if settings.SUPABASE_SERVICE_KEY.startswith("eyJ"):  # the older JWT-style key is also sent as a bearer token; the newer "sb_secret_..." keys are not
        keyed["Authorization"] = f"Bearer {settings.SUPABASE_SERVICE_KEY}"

    async with httpx.AsyncClient(timeout=12) as client:
        # ---- settings
        for name, what, fix in _findings():
            add("settings", name, "warn", what, fix)
        if not any(c.area == "settings" for c in checks):
            add("settings", "environment", "ok", "all the settings that matter are filled in")

        # ---- Supabase: reachable, key valid, schema installed
        if not base or not settings.SUPABASE_SERVICE_KEY:
            add("supabase", "connection", "fail", "no project URL or service key", "fill SUPABASE_URL and SUPABASE_SERVICE_KEY in backend/.env")
        else:
            r = await _get(client, f"{base}/rest/v1/app_settings?select=daily_rate&limit=1", headers=keyed)
            if r is None:
                add("supabase", "connection", "fail", "cannot reach the project URL", "check SUPABASE_URL (Project Settings > API)")
            elif r.status_code in (401, 403):
                add("supabase", "service key", "fail", "the project rejected the key", "use the service_role key (not the anon key) from Project Settings > API")
            elif r.status_code == 404 or "PGRST205" in r.text or "does not exist" in r.text:
                add("supabase", "database schema", "fail", "the tables are not there", "run supabase_setup.sql in the SQL Editor (once, on an empty project)")
            elif r.status_code == 200:
                add("supabase", "connection + service key", "ok", "reachable and accepted")
                missing = []
                for t in REQUIRED_TABLES:
                    rt = await _get(client, f"{base}/rest/v1/{t}?select=*&limit=0", headers=keyed)
                    if rt is None or rt.status_code != 200:
                        missing.append(t)
                if missing:
                    add("supabase", "database schema", "fail", f"missing tables: {', '.join(missing)}", "run supabase_setup.sql in the SQL Editor")
                else:
                    add("supabase", "database schema", "ok", f"all {len(REQUIRED_TABLES)} tables present")
                    seeded = await _get(client, f"{base}/rest/v1/referral_levels?select=level", headers=keyed)
                    n = len(seeded.json()) if seeded is not None and seeded.status_code == 200 else 0
                    add("supabase", "starting data", "ok" if n == 5 else "warn", f"{n} referral tiers" + ("" if n == 5 else " (expected 5)"), "" if n == 5 else "the starting-data part of supabase_setup.sql did not run")
                    admins = await _get(client, f"{base}/rest/v1/profiles?select=id&role=eq.admin&limit=1", headers=keyed)
                    has_admin = admins is not None and admins.status_code == 200 and bool(admins.json())
                    add("supabase", "first admin", "ok" if has_admin else "warn", "an admin exists" if has_admin else "no admin yet",
                        "" if has_admin else "sign up in the app, then run: UPDATE public.profiles SET role = 'admin' WHERE email = 'you@example.com';")
                bucket = await _get(client, f"{base}/storage/v1/bucket/avatars", headers=keyed)
                add("supabase", "avatars bucket", "ok" if bucket is not None and bucket.status_code == 200 else "warn",
                    "present" if bucket is not None and bucket.status_code == 200 else "not found",
                    "" if bucket is not None and bucket.status_code == 200 else "the storage part of supabase_setup.sql did not run (profile pictures will fail)")
            else:
                add("supabase", "connection", "fail", f"unexpected answer {r.status_code}: {r.text[:120]}")

            # sign-in options as the project reports them (needs only the public settings call)
            s = await _get(client, f"{base}/auth/v1/settings", headers={"apikey": settings.SUPABASE_SERVICE_KEY})
            if s is not None and s.status_code == 200:
                conf = s.json()
                google = bool((conf.get("external") or {}).get("google"))
                add("supabase auth", "Google sign-in", "ok" if google else "warn", "enabled" if google else "not enabled",
                    "" if google else "optional: Authentication > Sign In / Providers > Google (see docs/03-google-sign-in.md)")
                autoconfirm = bool(conf.get("mailer_autoconfirm"))
                add("supabase auth", "email confirmation", "warn" if autoconfirm else "ok",
                    "OFF: accounts are active without confirming the email" if autoconfirm else "on (users confirm with the emailed code)",
                    "turn on Confirm email in Authentication > Sign In / Providers > Email" if autoconfirm else "")
                add("supabase auth", "sign-ups", "warn" if conf.get("disable_signup") else "ok", "disabled" if conf.get("disable_signup") else "open")

        # ---- NOWPayments
        np_base = "https://api-sandbox.nowpayments.io/v1" if settings.NOWPAYMENTS_SANDBOX else "https://api.nowpayments.io/v1"
        mode = "sandbox" if settings.NOWPAYMENTS_SANDBOX else "live"
        st = await _get(client, f"{np_base}/status")
        add("nowpayments", f"gateway ({mode})", "ok" if st is not None and st.status_code == 200 else "fail",
            "reachable" if st is not None and st.status_code == 200 else "cannot reach NOWPayments", "check the server's internet access")
        if settings.NOWPAYMENTS_API_KEY:
            coins = await _get(client, f"{np_base}/merchant/coins", headers={"x-api-key": settings.NOWPAYMENTS_API_KEY})
            if coins is not None and coins.status_code == 200:
                selected = {str(c).lower() for c in coins.json().get("selectedCurrencies", [])}
                from services.nowpayments import SUPPORTED_COINS
                off = [sym for code, sym, *_ in SUPPORTED_COINS if code not in selected]
                add("nowpayments", "API key", "ok", f"accepted; {len(selected)} coins enabled")
                add("nowpayments", "coins we offer", "ok" if not off else "warn", "all five are enabled" if not off else f"not enabled on the account: {', '.join(off)}",
                    "" if not off else "enable them in the NOWPayments dashboard (Store settings > Payment coins) or users will not see them")
            else:
                add("nowpayments", "API key", "fail", "NOWPayments rejected the key" if coins is not None else "no answer", "copy the API key again (Store settings > API keys), and use sandbox keys only with NOWPAYMENTS_SANDBOX=true")
        if settings.NOWPAYMENTS_EMAIL and settings.NOWPAYMENTS_PASSWORD:
            from services.nowpayments import nowpayments_service
            info = await nowpayments_service.get_balance()
            if info.get("balances"):
                usdt = (info["balances"].get("usdtbsc") or {}).get("amount")
                add("nowpayments", "payout login + balance", "ok", f"works; USDT (BEP-20) available: {usdt}")
                if settings.NOWPAYMENTS_2FA_SECRET:
                    try:
                        import pyotp
                        pyotp.TOTP(settings.NOWPAYMENTS_2FA_SECRET).now()
                        add("nowpayments", "2FA secret", "ok", "valid format (a wrong secret only shows when the first payout is verified)")
                    except Exception:
                        add("nowpayments", "2FA secret", "fail", "not a valid base32 secret", "copy the text secret shown next to the QR code when 2FA was set up")
            else:
                add("nowpayments", "payout login + balance", "fail", str(info.get("error") or "login failed"),
                    "check NOWPAYMENTS_EMAIL / NOWPAYMENTS_PASSWORD, that this server's IP is whitelisted for payouts, and that Custody is on")

    # ---- the site itself
    add("site", "webhook address", "ok" if settings.webhook_url else "warn", settings.webhook_url or "none (local address)",
        "" if settings.webhook_url else "set APP_BASE_URL (or API_PUBLIC_URL) to the public address")
    add("site", "browser origins allowed (CORS)", "ok", ", ".join(settings.cors_origins))
    return checks


def format_report(checks: list[Check]) -> str:
    icon = {"ok": "OK  ", "warn": "WARN", "fail": "FAIL"}
    lines: list[str] = []
    area = ""
    for c in checks:
        if c.area != area:
            area = c.area
            lines.append(f"\n[{area}]")
        lines.append(f"  {icon[c.status]} {c.name}" + (f": {c.detail}" if c.detail else ""))
        if c.fix and c.status != "ok":
            lines.append(f"       -> {c.fix}")
    fails = sum(c.status == "fail" for c in checks)
    warns = sum(c.status == "warn" for c in checks)
    lines.append(f"\n{fails} problem(s), {warns} warning(s).")
    return "\n".join(lines)
