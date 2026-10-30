# 7. The website (frontend)

The website is built once on a computer with Node.js 20 or newer, and the result (static files) is uploaded to the server. Nothing needs to run on the server for it.

## Settings: frontend/.env
`python3 tools/configure.py` writes it. By hand, copy `frontend/.env.example` to `frontend/.env`:

| Setting | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://app.yourdomain.com/api` (with the standard server setup) |
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | the **anon / public** key, never the service_role key |
| `VITE_TURNSTILE_SITE_KEY` | Turnstile site key (guide 2). Empty only if CAPTCHA is also off in Supabase |
| `VITE_SUPPORT_EMAIL` | contact address shown in the Terms and Privacy pages |

Everything in this file ends up **inside the website** where anyone can read it, so only public values belong here. These values are baked in at build time: change one and you must build again.

## Build
```bash
cd frontend
npm ci
npm run build          # makes frontend/dist
```
`npm ci` installs exactly the versions in `package-lock.json`. The build must end without errors.

## Upload
Upload the **contents** of `frontend/dist` to `/var/www/mofi/frontend` on the server (replace what is there):
```bash
rsync -av --delete frontend/dist/ user@server:/var/www/mofi/frontend/
ssh user@server "sudo chmod -R a+rX /var/www/mofi/frontend"
```
(or `scp -r`, or any file-transfer program). From a Mac, if you pack with `tar`, set `COPYFILE_DISABLE=1` so no stray `._*` files get uploaded.

## Check
- Open `https://app.yourdomain.com`: the landing page loads in light or dark to match the device.
- Open it on a phone as well.
- Reload on a deep address such as `https://app.yourdomain.com/login`: it must load the app, not an error (that is the "fall back to index.html" part of the web-server setup).
- Browser developer tools > Network: calls to `/api/...` return normal answers, not red errors.

## Customising
- Name, colours and copy are in `frontend/src` (the landing page is `features/landing`). Logos are in `frontend/public` (`logo.svg`, `logo-ink.svg` for light mode, `logo-email.png` for emails). After any change, build and upload again.
- The Terms and Privacy text is in `frontend/src/components/legal/legal.tsx`. **Have your own legal adviser read and adapt it** before launching.
