# 6. The backend (API)

## Install
On the server, as the `mofi` user's folder owner:

```bash
# copy the backend/ folder from this package to /var/www/mofi/backend (scp, rsync or git), then:
cd /var/www/mofi/backend
python3.12 -m venv venv
./venv/bin/pip install -r requirements.txt
```

## Settings: backend/.env
Easiest: on your own computer run `python3 tools/configure.py` (it also writes the website's settings) and copy `backend/.env` to the server (`scp backend/.env user@server:/var/www/mofi/backend/.env`). Or copy `backend/.env.example` to `.env` and fill it in by hand. Then lock the file down:
```bash
sudo chown mofi:mofi /var/www/mofi/backend/.env && sudo chmod 600 /var/www/mofi/backend/.env
```
**This file holds secrets: never put it in git, email it, or paste it in chat.**

| Setting | Meaning | Typical value |
|---|---|---|
| `SUPABASE_URL` | Project URL | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | service_role key (secret) | from guide 1 |
| `NOWPAYMENTS_API_KEY` | NOWPayments API key | guide 4 |
| `NOWPAYMENTS_IPN_SECRET` | Verifies payment messages. Empty = no deposit is ever credited | guide 4 |
| `NOWPAYMENTS_EMAIL`, `NOWPAYMENTS_PASSWORD` | Login used to create payouts | guide 4 |
| `NOWPAYMENTS_2FA_SECRET` | Lets payouts confirm themselves | guide 4 |
| `NOWPAYMENTS_SANDBOX` | `true` = test money (sandbox account and keys) | `false` when live |
| `APP_BASE_URL` | The website's public address. Used for CORS and the webhook address | `https://app.yourdomain.com` |
| `API_PUBLIC_URL` | Only if the API is on a different address from the website | empty |
| `CORS_ORIGINS` | Extra browser origins allowed, comma separated | empty |
| `TRUST_PROXY_HEADERS` | `true` behind Caddy/nginx (so rate limits see each visitor), `false` when reached directly | `true` on the server |
| `ENABLE_DOCS` | `true` shows the interactive `/docs` page. Keep off in production | `false` |
| `LOG_LEVEL` | `INFO` normal, `DEBUG` to track a problem down, `WARNING` quiet | `INFO` |
| `WITHDRAW_CONVERSION_FEE_PCT` | NOWPayments' conversion fee (guide 4). Empty = USDT withdrawals only | `0.5` |
| `WITHDRAW_FEE_BUFFER_PCT` | Headroom on the live network fee | `10` |
| `WITHDRAW_MAX_SLIPPAGE_PCT` | A conversion this far short of the quote waits for you | `3` |
| `SETTLEMENT_COIN` | Coin deposits settle in (your Primary balance) | `usdtbsc` |
| `RATE_LIMIT_STORAGE_URI` | Redis address, only if you ever run more than one API process (not recommended, see below) | empty |
| `PORT` | Port when started directly. The service file fixes 8001 | `8001` |

## Self-check before starting
```bash
cd /var/www/mofi/backend && ./venv/bin/python -m scripts.check_setup
```
It talks to Supabase and NOWPayments and prints OK / WARN / FAIL with what to do. Fix every FAIL first. Expected WARNs at this point: no admin yet, maybe the webhook if the domain is not live.

## Run it as a service
```bash
sudo cp /path/to/package/deploy/mofi-backend.service.example /etc/systemd/system/mofi-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now mofi-backend
sudo systemctl status mofi-backend        # should say: active (running)
curl http://127.0.0.1:8001/health         # {"status":"healthy",...}
curl https://app.yourdomain.com/api/health
```
**Run exactly one worker** (the service file does). The daily-return job and the recovery jobs run inside the process and must not run twice, and a few safety locks live in memory.

## Logs
```bash
sudo journalctl -u mofi-backend -f              # live
sudo journalctl -u mofi-backend --since "1 hour ago"
```
Every line carries a **request id** in brackets, and every API response returns the same id in its `X-Request-ID` header (visible in the browser's developer tools > Network > the failed request > Response headers; an unexpected server error also puts it in the error text). Search the log for it to see exactly what happened in that request. Set `LOG_LEVEL=DEBUG` in `.env` and restart for more detail while tracking a problem down, then set it back.

## Updating later
Upload the new `backend/` files, run `./venv/bin/pip install -r requirements.txt`, then `sudo systemctl restart mofi-backend` and watch `journalctl -u mofi-backend -n 50`. Never upload `.env` or `venv/` over the server's.

## Tests (optional, on your computer)
```bash
cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt && .venv/bin/python -m pytest
```
They need no internet or database and check the money logic.
