# 2. Cloudflare Turnstile: bot protection

Turnstile is a free, privacy-friendly check that stops scripts from mass-creating accounts and guessing passwords. It protects sign-up, sign-in, resend and password reset. It has to be switched on in **two** places that must agree: the website (site key) and Supabase (secret key).

## Create the widget
1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com) (a free account is enough) > **Turnstile** > **Add widget**.
2. **Domains**: your website's domain (`app.yourdomain.com`). For local testing also add `localhost`.
3. **Widget mode**: Managed. Create.
4. You get a **Site Key** (public) and a **Secret Key** (private).

## Put the keys in
- **Site key** > `frontend/.env` as `VITE_TURNSTILE_SITE_KEY` (rebuild the website afterwards, guide 7).
- **Secret key** > Supabase: **Authentication > Attack Protection** > **Enable CAPTCHA protection** > provider **Cloudflare Turnstile** > paste the secret > Save.

## The rule: both or neither
- Site key set **and** Supabase CAPTCHA on: protected (the normal setup).
- Neither set: no bot check (fine for a private test).
- Only one of the two: **sign-in and sign-up fail** ("captcha verification process failed"). If login suddenly breaks, check this first.

## Test keys for local development
Cloudflare publishes always-pass test keys (search "Turnstile testing"): use the test site key in `frontend/.env` and the matching test secret in Supabase while developing, then swap in the real ones.
