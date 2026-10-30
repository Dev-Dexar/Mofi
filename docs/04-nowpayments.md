# 4. NOWPayments: money in and out

NOWPayments (nowpayments.io) takes crypto deposits and sends crypto withdrawals. Menu names can change; use the dashboard search if you cannot find something.

## How money moves
- **Deposit**: the user picks BTC, ETH, SOL, GRAM or USDT (BEP-20) and an amount in USD. The app asks NOWPayments for a payment with a **fixed rate and the fee paid by the user**, so the user sends the amount plus the fee and the app credits exactly the amount asked, as USDT. NOWPayments converts what arrives into USDT in your account (see "Primary balance").
- **Withdrawal**: when a user withdraws, the app takes the USDT out of their balance, converts it to the coin they chose inside your NOWPayments account (**Custody**), and sends it to their address. The user pays the network fee and the conversion fee. No approval is needed.
- **Webhooks**: NOWPayments tells the app when a payment or payout changes. You do **not** create a webhook in the dashboard; the app sends its own address with each request. You only need the **IPN secret** (below) so it can verify the messages.

## 1. Account and the Custody setup
1. Create an account at nowpayments.io and complete their verification if they ask.
2. Turn on **Custody** (the account holds the balance, which is what lets payouts be automatic). Without Custody, automatic withdrawals fail with "insufficient funds".
3. **Primary balance / outcome coin**: set it to **USDT on BEP-20 (BNB Smart Chain)**. This is what converts every deposit (BTC, ETH, ...) into USDT automatically.
4. **Coins**: enable all five coins the app offers: BTC, ETH, SOL, TON (shown as GRAM in the app), and USDT BSC (BEP-20). The app only offers the coins you enabled.

## 2. Keys for deposits
- **API key**: Store settings > API keys > create. Goes in `NOWPAYMENTS_API_KEY`.
- **IPN secret key**: Store settings > IPN > generate. Goes in `NOWPAYMENTS_IPN_SECRET`. It is shown in full only when created: copy it then. Without it **every payment webhook is refused and no deposit is ever credited**.

## 3. Keys for withdrawals (payouts)
Payouts need more than the API key:
1. **Dashboard login**: `NOWPAYMENTS_EMAIL` and `NOWPAYMENTS_PASSWORD`. The app logs in with it to create payouts. Best practice: create a separate user (sub-account) on the NOWPayments account just for this, with a strong password.
2. **2FA secret**: in the account's security settings, set up 2FA with an **authenticator app**. NOWPayments shows a QR code and, next to it, a text secret (base32, letters and digits). Put that **text secret** in `NOWPAYMENTS_2FA_SECRET` so the server can confirm payouts by itself. Also add it to your own authenticator app, or you will lose dashboard access.
3. **Whitelist the server**: payouts are only accepted from whitelisted IP addresses. Settings > Whitelist: add your **server's public IP**.
4. **Wallet whitelist: turn it off for the account.** By default NOWPayments only pays out to whitelisted wallet addresses. Users withdraw to their own addresses, so every one would be refused. Ask NOWPayments support (partners@nowpayments.io) to disable the address whitelist on your account. This step is easy to miss and blocks every withdrawal until done.

## 4. Fees and the conversion percentage
- **Network fee**: the app asks NOWPayments for the live network fee of the coin and adds a safety buffer (`WITHDRAW_FEE_BUFFER_PCT`, 10% by default). The user pays it.
- **Conversion fee**: NOWPayments charges to convert USDT into BTC/ETH/SOL/GRAM. Read the current percentage in your dashboard (or ask their support) and put it in `WITHDRAW_CONVERSION_FEE_PCT` (for example `0.5`). **Until it is set, only USDT withdrawals are offered**; the other coins say "not available yet". The user always receives exactly what the conversion really returned, so the real fee is always theirs; this number is only used to show the quote.
- If a conversion comes back more than `WITHDRAW_MAX_SLIPPAGE_PCT` (3%) below the quote, the payout waits in the admin panel for you instead of sending a smaller amount.

## 5. Keep money in the account
Withdrawals are paid from your NOWPayments balance. Deposits arrive there as USDT. You can move profit out by hand from the dashboard, but **leave enough USDT to cover what users may withdraw**. When the balance is short, withdrawals show "temporarily unavailable" until you top it up. To compare: the admin overview shows **Withdrawable now** (what users could withdraw this moment) and **On its way out**; keep your NOWPayments USDT balance above that. The check script and the admin endpoint `/admin/diagnostics` show the current USDT balance.

## 6. Test with test money first
NOWPayments has a **sandbox** (a separate account at account-sandbox.nowpayments.io, with its own keys). Set `NOWPAYMENTS_SANDBOX=true` and use the sandbox keys to try everything without real money. Switch to `false` and the real keys when you go live (guide 8).

## Check
```bash
cd backend && .venv/bin/python -m scripts.check_setup
```
The `[nowpayments]` section should say: gateway reachable, API key accepted with the coins enabled, payout login works and shows the USDT balance.

## Good to know
- A fixed-rate payment can expire sooner than the hour the app shows if NOWPayments closes it: the app then shows "expired" and the user starts a new deposit. Watch this during testing (guide 8) and adjust wording if needed.
- A payment that arrives short is never credited automatically; it appears in the admin panel for you to settle.
