# Deploying Menü Kopilot to `myserver`

Target: the existing DigitalOcean droplet (`ssh myserver`, Ubuntu) that already serves other apps behind **nginx**
and **Cloudflare**. Menü Kopilot runs next to them in Docker Compose; nginx terminates TLS with the Cloudflare origin
certificate for `*.example.com` and proxies `menu.example.com` to the API on `127.0.0.1:3030`.

Nothing is built on the server: `scripts/deploy.ps1` builds the API image on the PC (Docker Desktop) and copies it
over ssh. No registry account is needed.

## What changes on the server

| Added | Existing things it touches |
|---|---|
| `/srv/menu-kopilot/docker-compose.prod.yml` | — |
| `/etc/menu-kopilot/env` (mode 600) | — |
| containers `menu-kopilot-postgres-1`, `-redis-1`, `-api-1` (API on `127.0.0.1:3030` only) | ports 3002/3006/3012/3013/3020 stay untouched |
| `/etc/nginx/sites-available/menu-kopilot.conf` + symlink, `/etc/nginx/snippets/mk-proxy.conf` | includes the shared `ssl-params.conf` and `cloudflare-realip.conf`; rate-limit zones use the `mk_` prefix |

Memory limits: Postgres 256 MB, Redis 128 MB, API 384 MB. On 2026-09-16 the server had ~680 MB available plus
2 GB swap; idle the stack uses well below its limits (API ~150 MB).

## 1. DNS (Cloudflare, once)

`A` record **menu** → `<SUNUCU_IP>`, **Proxied**. SSL/TLS mode is already *Full (strict)* for the zone.

## 2. Secrets file (once)

Create `.env.production` in the repo root (it is git-ignored — never commit it). Use LF line endings.

```dotenv
NODE_ENV=production
POSTGRES_USER=menu
POSTGRES_PASSWORD=<hex, see below>
POSTGRES_DB=menu_kopilot
JWT_SECRET=<hex, see below>
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<at least 12 characters, not the local one>
ADMIN_NAME=Admin
GEMINI_API_KEY=
GROQ_API_KEY=
API_PORT=3030
```

Random values in PowerShell (cryptographic RNG; `POSTGRES_PASSWORD` must stay URL-safe, hex is):

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | ForEach-Object { $_.ToString('x2') }) -join ''
```

Copy it (the deploy script also strips CR characters and re-applies `chmod 600` on every run):

```powershell
ssh myserver "mkdir -p /etc/menu-kopilot && chmod 700 /etc/menu-kopilot"
scp .env.production myserver:/etc/menu-kopilot/env
ssh myserver "chmod 600 /etc/menu-kopilot/env"
```

AI keys can be added later: edit the file on the server, then run the deploy script again (or
`docker compose ... up -d` on the server). Without keys the app answers from the database only and says so.

## 3. nginx site (once)

```powershell
scp deploy/nginx/menu-kopilot.conf deploy/nginx/mk-proxy.conf myserver:/tmp/
ssh myserver "cp /tmp/menu-kopilot.conf /etc/nginx/sites-available/ && cp /tmp/mk-proxy.conf /etc/nginx/snippets/ && ln -sf /etc/nginx/sites-available/menu-kopilot.conf /etc/nginx/sites-enabled/menu-kopilot.conf && nginx -t && systemctl reload nginx"
```

`nginx -t` runs before the reload, so a mistake never reaches the running sites. To back out:
`ssh myserver "rm /etc/nginx/sites-enabled/menu-kopilot.conf && nginx -t && systemctl reload nginx"`.
Until the first deploy the site answers `502` — expected.

## 4. Deploy

Docker Desktop must be running on the PC.

```powershell
powershell -File scripts/deploy.ps1
```

The script checks the secrets file, uploads the compose file, builds `menu-kopilot-api:<git sha>`, copies the
compressed image (~100 MB), starts the stack and waits for `/health/ready`. Migrations and the idempotent seed (12
cuisines, 40 templates, the admin user) run when the API container starts.

## 5. Verify

```powershell
curl.exe -fsS https://menu.example.com/health/ready
ssh myserver "docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}' | grep -E 'NAME|menu-kopilot'"
```

End-to-end check against production (creates and deletes a test branch; with AI keys it also measures the latency
targets and spends a few LLM calls). The password is read without echo and never lands in shell history:

```powershell
$env:ADMIN_EMAIL = 'admin@example.com'
$secure = Read-Host 'Admin password' -AsSecureString
$env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
pnpm -C backend live:check --url https://menu.example.com
Remove-Item Env:ADMIN_PASSWORD
```

Server-Sent Events through Cloudflare + nginx: start a suggestion in the app — cards must appear one by one, not
all at the end (`proxy_buffering off` in `mk-proxy.conf`).

## 6. Phone

```powershell
cd mobile
flutter build apk --release --split-per-abi --dart-define=API_BASE_URL=https://menu.example.com
adb install -r build/app/outputs/flutter-apk/app-arm64-v8a-release.apk
```

A phone that was used against the local server keeps that address: change it under **Ayarlar → Sunucu adresi** (or
"Değiştir" on the login screen). Release builds only accept `https://` addresses (plus `http://localhost` for USB
testing). Without `mobile/android/key.properties` the APK is signed with the debug key — fine for personal use; see
the README for a real signing key.

## 7. Update and roll back

```powershell
powershell -File scripts/deploy.ps1                              # new build of the current commit
ssh myserver "docker image ls menu-kopilot-api"                  # images kept on the server
powershell -File scripts/deploy.ps1 -SkipBuild -Tag <older tag>  # roll back without building
ssh myserver "docker image rm menu-kopilot-api:<old tag>"        # free disk space later
```

The API applies pending migrations when it starts. If a rollback goes back past a migration, revert that migration
with the newer image still running, then deploy the older tag:

```powershell
ssh myserver "cd /srv/menu-kopilot && docker compose --env-file /etc/menu-kopilot/env -f docker-compose.prod.yml exec -T api node dist/db/rollback.js"
```

## 8. Backups (recommended, not set up automatically)

```bash
mkdir -p /var/backups/menu-kopilot
cd /srv/menu-kopilot && docker compose --env-file /etc/menu-kopilot/env -f docker-compose.prod.yml \
  exec -T postgres pg_dump -U menu -Fc menu_kopilot > /var/backups/menu-kopilot/$(date +%F).dump
```

A daily cron entry with `find /var/backups/menu-kopilot -mtime +14 -delete` keeps two weeks.

## 9. Remove completely

```bash
cd /srv/menu-kopilot && docker compose --env-file /etc/menu-kopilot/env -f docker-compose.prod.yml down -v  # deletes the data
rm /etc/nginx/sites-enabled/menu-kopilot.conf /etc/nginx/sites-available/menu-kopilot.conf /etc/nginx/snippets/mk-proxy.conf
nginx -t && systemctl reload nginx
rm -r /srv/menu-kopilot /etc/menu-kopilot
```

Do not reboot the server to test restarts: other production apps run there. `restart: unless-stopped` brings the
containers back after the Docker service or the machine restarts.
