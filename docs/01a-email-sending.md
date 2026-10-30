# 1a. Email: sending the sign-up and password-reset codes

Every new user gets a 6-digit code by email, and so does anyone who forgets a password. If these emails do not arrive, nobody can register. Supabase's own sender is for testing only (a few emails per hour, often lands in spam), so for a real launch you connect your own email-sending service.

## What you need
1. A **sending service** (SMTP). Any of these have a free starting tier: Resend, Brevo, Postmark, Mailgun, Amazon SES, or the mail server your domain host already gives you.
2. A **sender address on your own domain**, e.g. `no-reply@yourdomain.com`.
3. The **DNS records** your service asks for (SPF and DKIM, sometimes DMARC). Without them the codes go to spam or are rejected.

## Steps (example with Resend; the other services work the same way, with their own host and port)
1. Create an account at your sending service and **add your domain** (`yourdomain.com`).
2. The service shows you a few DNS records (TXT / CNAME / MX). Add them at your domain's DNS settings, the same place you add the server's A record (guide 5). Wait until the service shows the domain as **Verified** (minutes to a few hours).
3. Create an **API key** or SMTP password in the service.
4. In Supabase: **Authentication > Emails > SMTP Settings** (older dashboards: Project Settings > Auth > SMTP) > turn on **Custom SMTP** and fill in:
   | Field | Value |
   |---|---|
   | Sender email | `no-reply@yourdomain.com` |
   | Sender name | `MoFi Life` (or your brand) |
   | Host | from your service, e.g. `smtp.resend.com` |
   | Port | usually `465` (SSL) or `587` (TLS); your service says which |
   | Username / password | from your service (for Resend the username is `resend` and the password is the API key) |
   Save. (Hosts and ports above are examples; always use the values in your service's own SMTP documentation.)
5. **Authentication > Email Templates**: paste the two templates from `docs/email-templates/` (guide 1, step 6), so the email carries the code.
6. Raise the email rate limit if needed: **Authentication > Rate Limits** (the default is low for custom SMTP).

## Test it
1. Sign up on your site with an address you can read (use a Gmail or similar, not the sender's own domain).
2. The email should arrive within a minute with a 6-digit code and your logo. If it does not:
   - Check the spam folder, and the sending service's **logs** (they show delivered / bounced / rejected).
   - Supabase **Logs > Auth logs** shows whether Supabase tried to send it and any SMTP error.
   - Make sure the domain shows **Verified** and the sender address uses that domain.
   - The Site URL must be set (guide 1, step 4) or the logo link in the email is broken.
3. Try **Forgot password** too: a second email with a different title.

## Keep in mind
- Use one sender address for these system emails, and do not use it for newsletters.
- Check the `{{ .Token }}` part is still in both templates after you edit the wording.
- The email OTP length in Supabase must stay at **6**.
