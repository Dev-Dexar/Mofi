# 8. Go-live checklist

Do the test run with **sandbox / test money** first (`NOWPAYMENTS_SANDBOX=true` with sandbox keys). Tick each line.

## A. Before testing
- [ ] `supabase_setup.sql` ran without errors; 17 tables exist (guide 1)
- [ ] Site URL and Redirect URLs set in Supabase (guide 1, step 4)
- [ ] Confirm-signup and reset-password email templates pasted; email service connected and the domain verified (guides 1 and 1a)
- [ ] Turnstile on in both places, or off in both (guide 2)
- [ ] `backend/.env` filled; `scripts.check_setup` shows **no FAIL** (guide 6)
- [ ] Service running; `https://app.yourdomain.com/api/health` answers `healthy`
- [ ] Website uploaded; opens with HTTPS (guide 7)
- [ ] Your account made admin (guide 1, step 9)

## B. Test run (sandbox)
1. **Sign up** a second test account with another email: you receive the 6-digit email, the code works, you land in the app.
2. **Sign in / out**, **forgot password** (code arrives, new password works), and **Google** if enabled.
3. **Turn on 2FA** in Profile, sign out, sign in: the authenticator code is asked for.
4. **Deposit**: Wallet > Deposit, 30 USDT or more, choose a coin. A payment page with an address and amount shows. Pay it from the sandbox. Within a few minutes the deposit becomes *credited*, the balance shows the principal, History shows it. Watch the log: `journalctl -u mofi-backend -f` shows `webhook payment ... processed`.
5. **Underpayment** (sandbox): pay slightly less than asked. It must **not** be credited; it appears in Admin > Money as needing review.
6. **Daily return**: as admin, Admin overview > Payouts > run (or wait for 00:00 UTC). The test user gets the daily return in "Earnings". Run it again the same day: nothing more is paid (one payout per day).
7. **Referral**: sign up a third account with the second one's invite link and deposit: the second account gets 10% as a referral bonus.
8. **Reinvest**: move some earnings into principal; the principal grows and the earnings drop.
9. **Withdraw**: an amount of 30 USDT or more in USDT (BEP-20) to a test address. The review screen shows the network fee, you confirm, status goes *sending* then *completed*. For BTC/ETH/GRAM/SOL, set `WITHDRAW_CONVERSION_FEE_PCT` first.
10. **Admin**: Users (search, open one), Money (deposits and withdrawals), Settings (change the daily rate, pause deposits to see the notice), Appeals (suspend a test user, sign in as them to see the suspension page and file an appeal).
11. **Self-check once more** after the test run: `cd /var/www/mofi/backend && ./venv/bin/python -m scripts.check_setup` (also available to a signed-in admin at `/api/admin/diagnostics`).

## C. Switch to real money
- [ ] NOWPayments **live** account: Custody on, Primary balance USDT BEP-20, five coins enabled, payouts enabled (guide 4)
- [ ] Server IP whitelisted for payouts; address whitelist turned off by NOWPayments support
- [ ] `NOWPAYMENTS_SANDBOX=false` and the live API key, IPN secret, login, 2FA secret in `backend/.env`; `sudo systemctl restart mofi-backend`
- [ ] `WITHDRAW_CONVERSION_FEE_PCT` set from the dashboard
- [ ] `scripts.check_setup` all OK
- [ ] One real deposit of the minimum, then one real withdrawal of the minimum, end to end
- [ ] `ENABLE_DOCS=false`, `LOG_LEVEL=INFO`
- [ ] Supabase: paid plan, backups on, leaked-password protection on
- [ ] Terms and Privacy reviewed by your legal adviser; support email set
- [ ] Passwords for server, Supabase, NOWPayments in a password manager; 2FA on all of those accounts
