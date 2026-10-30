# 1. Supabase: database and login

Supabase hosts the database (Postgres) and the sign-in system. Menu names below are as of writing and can move a little; use the search box in the dashboard if you cannot find one.

## 1. Create the project
1. Sign in at [supabase.com](https://supabase.com) > **New project**. Pick the region nearest your users and set a strong **database password** (store it in a password manager; the app itself does not use it).
2. Plan: the free plan is fine for testing. For real users use a paid plan: free projects pause after a week of inactivity and have no backups. Pro also includes the leaked-password check in step 5.

## 2. Create everything in the database (one paste)
1. In the project: **SQL Editor** > **New query**.
2. Open `supabase_setup.sql` from this package, copy **the whole file**, paste it, press **Run**.
3. It must finish with "Success" and no error. It builds 17 tables, 36 functions, the security rules, the starting data (5 referral levels, the default settings, a list of blocked throw-away email domains) and the `avatars` picture bucket.
4. Run it **once**, on an **empty** project. It does not delete anything, so running it a second time stops with an "already exists" error (harmless, but nothing is changed).

Check: **Table Editor** shows 17 tables (`profiles`, `wallets`, `deposits`, ...). The default settings are: daily rate 0.5%, minimum deposit and withdrawal 30 USDT, maximum deposit 100000 USDT.

## 3. Copy the keys
**Project Settings > API**:
- **Project URL** (`https://xxxx.supabase.co`) goes in both `backend/.env` and `frontend/.env`.
- **anon (public) key** goes in `frontend/.env` only (`VITE_SUPABASE_ANON_KEY`).
- **service_role (secret) key** goes in `backend/.env` only (`SUPABASE_SERVICE_KEY`). It has full access to the database: never put it in the website, in chat, or in git.

This package was tested with the standard JWT-style keys (they start with `eyJ`). If your dashboard shows only newer "publishable / secret" keys (`sb_...`), open the **Legacy API keys** tab and use those.

`python3 tools/configure.py` asks for these and writes both files.

## 4. Tell Supabase your website address
**Authentication > URL Configuration**:
- **Site URL**: your website's address, e.g. `https://app.yourdomain.com`.
- **Redirect URLs**: add `https://app.yourdomain.com` and `https://app.yourdomain.com/**`. (While testing locally also add `http://localhost:5173` and `http://localhost:5173/**`.)

Without this, Google sign-in and email links send people to the wrong place.

## 5. Sign-in options
**Authentication > Sign In / Providers** (also called "Providers"):
- **Email**: enabled. **Confirm email**: ON (sign-ups are confirmed with a 6-digit code). **Minimum password length**: 8 or more (the app itself requires at least 8).
- **Email OTP length: 6.** The app only accepts 6-digit codes. (In the Email provider settings, or under Authentication > Sign In / Providers > "Email OTP length" depending on the dashboard version.)
- **Multi-factor authentication (TOTP)**: enabled (it is by default). Users switch it on themselves in their Profile.
- **Leaked password protection** (Pro plan): ON. Users cannot pick a password found in known breaches.

## 6. The two emails (so users receive a code, not a link)
The app confirms sign-ups and resets passwords with a **6-digit code** that the user types in. Supabase's default emails send a link instead, so replace them:

**Authentication > Email Templates**
1. **Confirm signup**: Subject `Your MoFi Life confirmation code`. Paste the whole content of `docs/email-templates/confirm-signup.html` as the message body.
2. **Reset password**: Subject `Your MoFi Life password reset code`. Paste `docs/email-templates/reset-password.html`.

Both templates show `{{ .Token }}` (the code) and the logo from your own website (`{{ .SiteURL }}/logo-email.png`, which is part of the site). Change the wording and name as you like, but keep the `{{ .Token }}` part.

## 7. Email sending (important for real users)
Supabase's built-in email sender is for testing only and allows just a few emails per hour. For real users set your own: **Authentication > Emails > SMTP Settings** (or Project Settings > Auth > SMTP). Any provider works (Resend, Brevo, Postmark, Amazon SES, your own mail server). Use a sending address on your domain and add the SPF/DKIM records your provider gives you, or the codes land in spam. **The full step-by-step is in [01a-email-sending.md](01a-email-sending.md).**

## 8. Bot protection (CAPTCHA)
Do guide [02-cloudflare-turnstile.md](02-cloudflare-turnstile.md), which finishes in this same area of the dashboard (**Authentication > Attack Protection**).

## 9. Make yourself the first admin
1. Open the website (once it is running, or locally) and **sign up** with your own email. Confirm it with the code.
2. In Supabase **SQL Editor** run (with your email):
   ```sql
   UPDATE public.profiles SET role = 'admin' WHERE email = 'you@example.com';
   ```
3. Reload the site: an **Admin** area appears. More admins can be made later from the admin panel's user pages.

## 10. Check it
```bash
cd backend && .venv/bin/python -m scripts.check_setup
```
The `[supabase]` section should say: connection OK, all 17 tables present, 5 referral tiers, an admin exists, the avatars bucket is present.

## Backups
- Paid plans: daily backups are included (Database > Backups).
- Free plan: none. Download a copy regularly with `pg_dump` (Project Settings > Database shows the connection string).
