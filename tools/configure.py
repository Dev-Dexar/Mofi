#!/usr/bin/env python3
"""
Guided setup of the two settings files. Asks for each value (with where to find it), then writes
    backend/.env     (server only: has secrets)
    frontend/.env    (public values only: ends up inside the website)

    python3 tools/configure.py

Plain Python 3, nothing to install. Run it again any time: what you entered before is offered as the default (press Enter to keep it),
and a value you do not have yet can be skipped and added later. Nothing is sent anywhere.
"""
from __future__ import annotations

import getpass
import os
import re
import stat
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND_ENV = ROOT / "backend" / ".env"
FRONTEND_ENV = ROOT / "frontend" / ".env"


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
            if m:
                v = m.group(2).strip()
                if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                    v = v[1:-1]
                else:
                    v = re.split(r"\s+#", v)[0].strip()  # an inline comment starts at " #"; a # inside a value (a password) stays
                values[m.group(1)] = v
    return values


def quote(v: str) -> str:
    """A value with spaces, # or quotes is wrapped in quotes so it reads back exactly (single quotes keep everything as typed)."""
    if not re.search(r"[\s#\"'\\]", v):
        return v
    if "'" not in v:
        return f"'{v}'"
    if '"' not in v and "\\" not in v:
        return f'"{v}"'
    raise SystemExit("A value contains both ' and \" (or a backslash with a '): choose one without that mix.")


def ask(label: str, help_text: str, current: str = "", secret: bool = False, required: bool = False, check=None) -> str:
    print(f"\n{label}\n  {help_text}")
    while True:
        shown = ("(kept: ****" + current[-4:] + ")") if (secret and current) else (f"[{current}]" if current else "[skip]" if not required else "")
        prompt = f"  > {shown} "
        raw = (getpass.getpass(prompt) if secret else input(prompt)).strip()
        value = raw or current
        if not value and required:
            print("    This one is needed.")
            continue
        if value and check:
            problem = check(value)
            if problem:
                print(f"    {problem}")
                continue
        return value


def is_url(v: str) -> str | None:
    return None if re.match(r"^https?://[^\s/]+", v) else "That should start with https:// (or http:// for a local test)."


def is_supabase_url(v: str) -> str | None:
    return None if re.match(r"^https://[a-z0-9-]+\.supabase\.(co|com)$", v.rstrip("/")) else "That should look like https://xxxxxxxx.supabase.co (Project Settings > API > Project URL)."


def is_key(v: str) -> str | None:
    return None if (v.startswith("eyJ") and v.count(".") == 2) or v.startswith("sb_") else "That does not look like a Supabase key (it starts with eyJ... or sb_...)."


def is_percent(v: str) -> str | None:
    try:
        return None if 0 <= float(v) < 100 else "A percentage between 0 and 100, like 0.5"
    except ValueError:
        return "A number like 0.5"


def yes(prompt: str, default: bool) -> bool:
    raw = input(f"\n{prompt} [{'Y/n' if default else 'y/N'}] ").strip().lower()
    return default if not raw else raw.startswith("y")


def main() -> int:
    be, fe = read_env(BACKEND_ENV), read_env(FRONTEND_ENV)
    print("MoFi Life setup. Press Enter to keep the value shown, or to skip an optional one.\nThe guides in docs/ say where each value comes from.")

    print("\n=== Your website ===")
    site = ask("Website address", "The public address people will open, e.g. https://app.yourdomain.com (no slash at the end). For a local test: http://localhost:5173",
               be.get("APP_BASE_URL", ""), required=True, check=is_url).rstrip("/")
    local = "localhost" in site or "127.0.0.1" in site
    api_default = fe.get("VITE_API_BASE_URL") or ("http://localhost:8000" if local else f"{site}/api")
    api = ask("API address", f"Where the website finds the backend. With the standard setup (docs/07) this is {site}/api; for a local test http://localhost:8000.",
              api_default, required=True, check=is_url).rstrip("/")
    support = ask("Support email", "Shown in the Terms and Privacy pages as the contact address.", fe.get("VITE_SUPPORT_EMAIL", ""))

    print("\n=== Supabase (docs/01-supabase.md) ===")
    sb_url = ask("Project URL", "Project Settings > API > Project URL", be.get("SUPABASE_URL") or fe.get("VITE_SUPABASE_URL", ""), required=True, check=is_supabase_url).rstrip("/")
    anon = ask("anon / publishable key", "Project Settings > API > anon (public) key. Goes into the website, which is fine.", fe.get("VITE_SUPABASE_ANON_KEY", ""), required=True, check=is_key)
    service = ask("service_role / secret key", "Project Settings > API > service_role key. SECRET: server only, never shared.", be.get("SUPABASE_SERVICE_KEY", ""), secret=True, required=True, check=is_key)

    print("\n=== Cloudflare Turnstile, the bot check (docs/02) ===")
    turnstile = ask("Turnstile site key", "The public site key of your Turnstile widget. Skip it ONLY if CAPTCHA is also off in Supabase.", fe.get("VITE_TURNSTILE_SITE_KEY", ""))

    print("\n=== NOWPayments, deposits and withdrawals (docs/04). You can skip all of this now and add it when the account is ready. ===")
    sandbox = yes("Use the NOWPayments SANDBOX (test money, separate account and keys)?", be.get("NOWPAYMENTS_SANDBOX", "false").lower() == "true")
    np_key = ask("API key", "NOWPayments dashboard > Store settings > API keys", be.get("NOWPAYMENTS_API_KEY", ""), secret=True)
    np_ipn = ask("IPN secret key", "Store settings > IPN secret key. Without it, payments are never credited.", be.get("NOWPAYMENTS_IPN_SECRET", ""), secret=True)
    np_mail = ask("Dashboard login email", "The NOWPayments account that sends payouts (a dedicated sub-user is best).", be.get("NOWPAYMENTS_EMAIL", ""))
    np_pass = ask("Dashboard login password", "Used only to log in for payouts.", be.get("NOWPAYMENTS_PASSWORD", ""), secret=True)
    np_2fa = ask("2FA secret", "The text secret shown next to the QR code when 2FA was set up on that account (not the 6-digit code).", be.get("NOWPAYMENTS_2FA_SECRET", ""), secret=True)
    conv = ask("Conversion fee percent", "What NOWPayments charges to convert USDT into another coin (see your dashboard). Empty = only USDT withdrawals.", be.get("WITHDRAW_CONVERSION_FEE_PCT", ""), check=is_percent)

    backend = {
        "SUPABASE_URL": sb_url, "SUPABASE_SERVICE_KEY": service,
        "NOWPAYMENTS_API_KEY": np_key, "NOWPAYMENTS_IPN_SECRET": np_ipn, "NOWPAYMENTS_EMAIL": np_mail,
        "NOWPAYMENTS_PASSWORD": np_pass, "NOWPAYMENTS_2FA_SECRET": np_2fa, "NOWPAYMENTS_SANDBOX": "true" if sandbox else "false",
        "APP_BASE_URL": site, "API_PUBLIC_URL": be.get("API_PUBLIC_URL", ""), "CORS_ORIGINS": be.get("CORS_ORIGINS", ""),
        "ENABLE_DOCS": be.get("ENABLE_DOCS", "false"), "TRUST_PROXY_HEADERS": "false" if local else "true",
        "LOG_LEVEL": be.get("LOG_LEVEL", "INFO"), "RATE_LIMIT_STORAGE_URI": be.get("RATE_LIMIT_STORAGE_URI", ""),
        "WITHDRAW_CONVERSION_FEE_PCT": conv, "WITHDRAW_FEE_BUFFER_PCT": be.get("WITHDRAW_FEE_BUFFER_PCT", "10"),
        "WITHDRAW_MAX_SLIPPAGE_PCT": be.get("WITHDRAW_MAX_SLIPPAGE_PCT", "3"), "SETTLEMENT_COIN": be.get("SETTLEMENT_COIN", "usdtbsc"),
        "PORT": be.get("PORT", "8000" if local else "8001"),
    }
    frontend = {
        "VITE_API_BASE_URL": api, "VITE_SUPABASE_URL": sb_url, "VITE_SUPABASE_ANON_KEY": anon,
        "VITE_TURNSTILE_SITE_KEY": turnstile, "VITE_SUPPORT_EMAIL": support,
    }
    for path, values, note in ((BACKEND_ENV, backend, "# Written by tools/configure.py. Secrets: never share or commit this file.\n"),
                               (FRONTEND_ENV, frontend, "# Written by tools/configure.py. Public values only (they end up in the website).\n")):
        path.write_text(note + "".join(f"{k}={quote(v)}\n" for k, v in values.items()))
    os.chmod(BACKEND_ENV, stat.S_IRUSR | stat.S_IWUSR)
    print(f"\nWrote {BACKEND_ENV.relative_to(ROOT)} and {FRONTEND_ENV.relative_to(ROOT)}.")
    print("Next: from backend/ run  .venv/bin/python -m scripts.check_setup  to see what is still missing.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KeyboardInterrupt, EOFError):
        print("\nStopped. Nothing was written.")
        sys.exit(1)
