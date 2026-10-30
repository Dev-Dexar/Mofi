# MoFi Life: setup guide

This folder takes you from an empty computer to a running site, step by step. Do the guides in order; each one ends with a way to check it worked.

| # | Guide | What you do | Time |
|---|---|---|---|
| 1 | [01-supabase.md](01-supabase.md) | Create the database and login system, run `supabase_setup.sql`, set the login options | 30 min |
| 1a | [01a-email-sending.md](01a-email-sending.md) | Set up the email service that sends the sign-up and reset codes (DNS records, SMTP, test) | 30 min |
| 2 | [02-cloudflare-turnstile.md](02-cloudflare-turnstile.md) | Bot protection for sign-up and sign-in | 10 min |
| 3 | [03-google-sign-in.md](03-google-sign-in.md) | "Continue with Google" (optional) | 20 min |
| 4 | [04-nowpayments.md](04-nowpayments.md) | Payments in and out: account, keys, custody, payouts | 40 min |
| 5 | [05-server-and-domain.md](05-server-and-domain.md) | A server, your domain, HTTPS | 30 min |
| 6 | [06-backend.md](06-backend.md) | Install and run the API on the server | 20 min |
| 7 | [07-frontend.md](07-frontend.md) | Build the website and put it online | 15 min |
| 8 | [08-go-live-checklist.md](08-go-live-checklist.md) | Test everything with test money, then switch to real money | 1 h |
| 9 | [09-running-and-troubleshooting.md](09-running-and-troubleshooting.md) | Daily running, the admin panel, logs, and what to do when something is wrong | reference |

Short on time? Run the guided setup (it asks for every value and writes both settings files) and the self-check:

```bash
python3 tools/configure.py                       # asks for each value, says where to find it
cd backend && .venv/bin/python -m scripts.check_setup   # tells you what is still missing, in plain words
```

## How the pieces fit

```
 visitor's browser
       |  https://your-domain.com
       v
 [ web server: Caddy or nginx ] ---- /            -> the website (static files in frontend/dist)
       |                       \--- /api/*        -> the API (backend/, FastAPI, 127.0.0.1:8001)
       |                                              |
       |                                              +--> Supabase: Postgres database + login (Auth) + avatar storage
       |                                              +--> NOWPayments: create payments, send payouts
       |
 NOWPayments --- webhook (payment/payout updates) ---> https://your-domain.com/api/webhook/nowpayments
```

- The **website** talks to Supabase only for logging in (and 2FA, profile pictures). Everything with money goes through the **API**.
- Users have **no direct access to any database table**: all reads and writes go through the API, and money moves only inside database functions.
- Secrets (the Supabase `service_role` key, the NOWPayments keys) live only in `backend/.env` on the server. `frontend/.env` holds public values only.

## What you need before you start
- A domain you control (a subdomain such as `app.yourdomain.com` is fine) and access to its DNS settings.
- A Linux server (Ubuntu 22.04 or newer, 1 CPU and 1 GB of memory is enough to begin) where you can log in as an administrator.
- Accounts: [Supabase](https://supabase.com), [Cloudflare](https://cloudflare.com) (free, for Turnstile), [NOWPayments](https://nowpayments.io), optionally a Google Cloud account (Google sign-in), and an email-sending service for sign-up codes (see guide 1, step 7).
- On the computer you build from: Python 3.12 and Node.js 20 or newer.

## The money rules the app enforces (so you know what to expect)
- The money a user deposits is **locked principal** and can never be withdrawn. It earns a daily return (starting at 0.5% a day; you change the rate in the admin panel, and a change applies from the next payout). There is no cap on the returns.
- Only **earnings** (daily returns and referral bonuses) can be withdrawn, or reinvested into new principal.
- Referral bonuses are paid on every deposit up the chain: 10%, 5%, 3%, 2%, 1% over five levels.
- Deposits are credited for **exactly what was asked or more**. A payment that is even slightly short is held for an admin to settle.
- The user pays every fee: the deposit fee, and on withdrawal the network fee and the conversion fee. Withdrawals need no approval and go out automatically.
- Minimum deposit and withdrawal are 30 USDT by default (changeable in the admin panel).
