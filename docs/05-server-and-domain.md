# 5. Server, domain and HTTPS

## 1. The server
Any Linux server works. These steps assume Ubuntu 22.04 or newer with a user that has `sudo`. Install the basics:

```bash
sudo apt update && sudo apt install -y python3.12 python3.12-venv git curl ufw
# Caddy (web server with automatic HTTPS). If you prefer nginx, skip this and see deploy/nginx.example.conf
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```
(If `python3.12` is not in your Ubuntu's package list, use the deadsnakes PPA or build from the official site. Any 3.12 works.)

Firewall: allow only SSH and the web:
```bash
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```
The API listens only on `127.0.0.1:8001`; it is never opened to the internet directly.

Make a user for the app and its folder:
```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin mofi
sudo mkdir -p /var/www/mofi/backend /var/www/mofi/frontend
sudo chown -R mofi:mofi /var/www/mofi
```

## 2. The domain
At your domain's DNS settings add an **A record** for the address you will use (for example `app`) pointing to the server's public IPv4 address. Wait a few minutes, then check from your computer: `ping app.yourdomain.com` shows the server's address.

Note down the server's **public IP**: NOWPayments needs it for the payout whitelist (guide 4).

## 3. The web server (HTTPS)
Edit `/etc/caddy/Caddyfile`, add the block from `deploy/Caddyfile.example` with your own address in place of `your-domain.com`, and reload:
```bash
sudo systemctl reload caddy
```
Caddy requests and renews the HTTPS certificate on its own as soon as the domain points at the server. Open `https://app.yourdomain.com`: until the website is uploaded (guide 7) you may see an empty page or an error, which is fine; what matters is that the lock icon shows.

What the block does: `/api/*` goes to the backend on port 8001, everything else is the built website, and unknown paths fall back to `index.html` (the site handles its own pages).

**Using nginx instead?** Use `deploy/nginx.example.conf`. Keep the line that **sets** `X-Forwarded-For` to the visitor's address (the API's rate limits rely on it).

## Permissions
The website files must be readable by the web server. After every upload run:
```bash
sudo chmod -R a+rX /var/www/mofi/frontend
```
A file that is not world-readable makes the server answer with the wrong content (images and icons break).
