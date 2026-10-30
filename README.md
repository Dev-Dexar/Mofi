# MoFi Life

A crypto earnings platform. Users deposit in BTC, ETH, SOL, GRAM or USDT; the money is held as locked USDT principal that earns a daily
return; earnings and referral bonuses can be withdrawn or reinvested. Payments run through NOWPayments; accounts and data through Supabase.

**Start here: [docs/README.md](docs/README.md)** (the step-by-step setup guide), or run the guided setup:

```bash
python3 tools/configure.py        # asks for every value, says where to find it, writes both settings files
```

## What is in this package
```
supabase_setup.sql     the whole database in one file: paste it into Supabase's SQL Editor and run it once
backend/               the API (Python 3.12, FastAPI)
frontend/              the website (React, Vite, TypeScript, Tailwind)
deploy/                ready-to-edit templates: Caddy, nginx, and the systemd service for the API
docs/                  the setup guides, and the two sign-up/reset email templates
tools/configure.py     guided creation of backend/.env and frontend/.env
```
**No keys, passwords or accounts are included.** You create your own (Supabase, NOWPayments, Cloudflare, domain, server) by following the guides, and enter them into `backend/.env` and `frontend/.env`.

## Quick local run (to look around before setting up a server)
```bash
python3 tools/configure.py                                   # use http://localhost:5173 as the website address
cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m scripts.check_setup                      # what is set up, what is missing
.venv/bin/uvicorn main:app --reload --port 8000              # the API
# in a second terminal:
cd frontend && npm ci && npm run dev                         # the website at http://localhost:5173
```
Local runs still need your own Supabase project (guide 1). NOWPayments cannot call a local address; for test money use its sandbox (guide 4).

## The rules the app enforces
- The money a user deposits is locked principal and is never withdrawable. Only daily returns and referral bonuses can be withdrawn or reinvested. No cap on returns.
- Deposits are credited for exactly the amount asked or more; anything less is held for an admin.
- The user pays every fee (deposit, network and conversion fees). Withdrawals need no approval.
- Users have no direct access to any database table; every read and write goes through the API, and money moves only inside database functions.

## Checking and debugging
- `backend/scripts/check_setup.py` - checks the settings, Supabase, the database, and NOWPayments, and says what to fix.
- Every request has an id (`X-Request-ID`) that appears on each log line it writes: `journalctl -u mofi-backend | grep <id>`.
- `LOG_LEVEL=DEBUG` in `backend/.env` for detail. Tests: `cd backend && .venv/bin/python -m pytest`.
- More in [docs/09-running-and-troubleshooting.md](docs/09-running-and-troubleshooting.md).
