# 3. Google sign-in (optional)

Adds the "Continue with Google" button. Skip this guide if you only want email and password: the button simply does nothing useful without it, so ask your developer to hide it, or set it up.

## In Google Cloud
1. [console.cloud.google.com](https://console.cloud.google.com) > create a project (or pick one).
2. **APIs & Services > OAuth consent screen**: user type **External**; app name, support email, developer email. Scopes: the defaults (email, profile, openid). Under **Audience / Publishing status** choose **In production** when ready: while it says "Testing" only the test users you list can sign in.
3. **APIs & Services > Credentials > Create credentials > OAuth client ID**, type **Web application**.
   - **Authorized JavaScript origins**: `https://app.yourdomain.com` (and `http://localhost:5173` for local tests).
   - **Authorized redirect URIs**: `https://<your-project-ref>.supabase.co/auth/v1/callback`. You can copy the exact address from Supabase (step below). This is the **Supabase** address, not your website's.
4. Copy the **Client ID** and **Client secret**.

## In Supabase
**Authentication > Sign In / Providers > Google**: switch on, paste Client ID and Client secret, save. The callback address is shown on that page: that is the one Google needs in "Authorized redirect URIs".

Also confirm the **Site URL** and **Redirect URLs** from guide 1, step 4.

## Test
Open the site, press **Continue with Google**, choose an account: you land back on the site signed in, and a new profile exists (Supabase > Table Editor > `profiles`).

A person who signs in with Google gets an account with no password. They can set one later in their Profile.
