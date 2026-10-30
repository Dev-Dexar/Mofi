# 9. Running the site, and when something is wrong

## Every day
- **Admin overview**: balances at a glance and a **Needs you** list: underpaid deposits, withdrawals stuck for more than half an hour, appeals waiting. Work that list down.
- The daily return is paid automatically at **00:00 UTC**. If the server was down at that time, it catches up by itself when the server starts. Admin overview > Payouts shows the history and can run it by hand (it never pays a day twice).
- **Keep USDT in your NOWPayments account** above what users can withdraw (the overview shows "Withdrawable now").

## The admin panel
| Area | What it does |
|---|---|
| Overview | Totals, today's activity, the Needs-you list, run payouts, check the books (reconcile) |
| Users | Search; open a user to see wallet, deposits, withdrawals, team; **suspend / lift the suspension**; make or remove an admin |
| Money | All deposits and withdrawals with filters. Settle underpaid deposits (credit what was paid, or reject) and stuck withdrawals (mark delivered with the transaction hash, or refund) |
| Appeals | Suspended users asking for a review: accept (lifts the suspension) or reject, with a reply |
| Analytics | Charts over time |
| Settings | Daily rate, minimum/maximum amounts, pause deposits / withdrawals / reinvesting, maintenance mode, referral percentages shown |

Changing the **daily rate** applies to all principal from the next payout and is recorded in the settings history.

## Withdrawals that say "Needs review"
The system only refunds a withdrawal when NOWPayments definitely did not do it. If anything is unclear (a timeout, a payout with no answer, a conversion that came back far below the quote) the withdrawal is marked **Needs review: ...** in Admin > Money and waits for you. Do this:
1. Open the withdrawal in Admin > Money; read the note.
2. Look at the matching payout or conversion in the **NOWPayments dashboard**.
3. If it was sent: **Mark delivered** with the transaction hash. If it was not and will not be: **Refund**. Never refund something that went out.

## Something is wrong: where to look
1. **Run the self-check**: `cd /var/www/mofi/backend && ./venv/bin/python -m scripts.check_setup`. It names the broken setting.
2. **Read the log**: `sudo journalctl -u mofi-backend -n 100 --no-pager`. Lines at ERROR or WARNING are the interesting ones. If you have a **request id** (from the browser's developer tools > Network > Response headers > `X-Request-ID`, or in an error message), search for it: `sudo journalctl -u mofi-backend | grep 7f3a9c21`.
3. **Payment events**: Supabase > Table Editor > `payment_events` lists every message NOWPayments sent, valid or not, with the result or error.
4. **More detail**: set `LOG_LEVEL=DEBUG`, restart, repeat the problem, set it back.

## Common problems
| Symptom | Likely cause | Fix |
|---|---|---|
| Sign-up / sign-in says "captcha verification failed" | Turnstile on in only one place | Guide 2: both or neither; rebuild the site after changing the site key |
| No sign-up email arrives | Built-in sender limit, or spam | Set your own SMTP (guide 1, step 7); check spam |
| Email contains a link, not a code | Templates not replaced | Guide 1, step 6 |
| Google button: redirect error | Redirect URI mismatch | The URI in Google must be the Supabase callback; Site URL set (guides 1 and 3) |
| Sign-in works but the app shows "Could not load your account" | API unreachable or `SUPABASE_SERVICE_KEY` wrong | `check_setup`; `curl https://app.yourdomain.com/api/health` |
| Browser console: CORS error | `APP_BASE_URL` does not match the site's address | Set it exactly (with `https://`), restart the service |
| Everyone gets "going too fast" | Proxy headers not trusted, so all visitors look like one | `TRUST_PROXY_HEADERS=true` behind Caddy/nginx |
| Deposit paid but not credited | IPN secret missing/wrong, or webhook can't reach the server | `check_setup`; check `payment_events` for "invalid signature"; the webhook address is `https://app.yourdomain.com/api/webhook/nowpayments` |
| Deposit page shows "expired" before an hour | NOWPayments closed the fixed-rate payment | Start a new deposit; this is NOWPayments' timing |
| Deposit is "partially paid" | The user sent less than asked | Admin > Money: credit what was received, or reject |
| Withdrawal: "temporarily unavailable" | Not enough USDT in the NOWPayments account, or its balance can't be read | Top up; run `check_setup` |
| Withdrawal rejected by the gateway | IP not whitelisted, address whitelist still on, wrong login | Guide 4, section 3 |
| BTC/ETH/GRAM/SOL withdrawals "not available yet" | `WITHDRAW_CONVERSION_FEE_PCT` empty | Guide 4, section 4 |
| Images / icons broken after an upload | File permissions | `sudo chmod -R a+rX /var/www/mofi/frontend` |
| Page reload on a deep link shows an error | Web server missing the fall-back | Use the block from `deploy/Caddyfile.example` |
| `systemctl status mofi-backend` shows failed | Missing `.env` value or wrong Python | `journalctl -u mofi-backend -n 50`; the message names the setting |

## Backups and safety
- Back up the database (Supabase backups or `pg_dump`) and keep a copy of `backend/.env` in your password manager.
- Rotate keys if they were ever exposed: Supabase (Project Settings > API), NOWPayments (new API key and IPN secret), and change the passwords.
- Update the server regularly (`sudo apt update && sudo apt upgrade`).
- To go down for maintenance without breaking anything: Admin > Settings > **Maintenance mode**.
