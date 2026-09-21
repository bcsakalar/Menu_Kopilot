# Deploying Menü Kopilot to `myserver`

Target: the existing DigitalOcean droplet (`ssh myserver`, Ubuntu, 2 GB RAM + 2 GB swap) that already serves other
apps behind **nginx** and **Cloudflare**. Menü Kopilot runs next to them in Docker Compose; nginx terminates TLS with
the Cloudflare origin certificate for `*.example.com` and proxies `menu.example.com` to the API on
`127.0.0.1:3030`.

The server holds a **git clone** of `github.com/bcsakalar/Menu_Kopilot` (private) in `/opt/menu-kopilot`, pulled with a
read-only deploy key. The API image is **built on the PC** (Docker Desktop) and copied over ssh — `pnpm install` + `tsc`
would be OOM-killed next to the other apps. `scripts/deploy.ps1` does both steps.

## What is on the server

| Path / object | Notes |
|---|---|
| `/opt/menu-kopilot` | git clone (`git pull --ff-only` by the deploy script); compose file in `deploy/` |
| `/root/.ssh/menu_kopilot_deploy` + `Host github-menu-kopilot` in `/root/.ssh/config` | read-only deploy key, only this repository (GitHub → Settings → Deploy keys → "myserver (read-only)") |
| `/etc/menu-kopilot/env` (dir 700, file 600) | secrets; outside the clone, so a pull or redeploy cannot touch them |
| containers `menu-kopilot-postgres-1`, `-redis-1`, `-api-1` | API on `127.0.0.1:3030` only; Postgres/Redis on no host port |
| `/etc/nginx/sites-available/menu-kopilot.conf` + symlink, `/etc/nginx/snippets/mk-proxy.conf` | copies of `deploy/nginx/`; include the shared `ssl-params.conf` and `cloudflare-realip.conf`; zones use the `mk_` prefix; logs `mk.*.log` (covered by fail2ban's `nginx-limit-req` jail) |
| `/etc/cron.d/menu-kopilot-backup` → `/opt/yedek/menu-kopilot-YYYY-MM-DD.dump` | daily 03:30, 14 days kept |

Memory limits: Postgres 256 MB, Redis 128 MB, API 384 MB. Measured right after the first deploy (2026-09-18): API
~77 MB, Postgres ~44 MB, Redis ~5 MB; the server had ~755 MB available.

## 1. DNS (Cloudflare, once)

`A` record **menu** → `<SUNUCU_IP>`, **Proxied**. SSL/TLS mode is already *Full (strict)* for the zone. Until the
record exists the site can be checked on the server with `curl -sk --resolve menu.example.com:443:127.0.0.1
https://menu.example.com/health/ready`.

## 2. Secrets file (once)

Generate `.env.production` in the repo root (git-ignored — never commit it):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\new-prod-env.ps1 -AdminEmail admin@example.com
```

It asks for the app's admin password (hidden input, at least 12 characters, not the local one), generates
`POSTGRES_PASSWORD` (hex: it goes into `DATABASE_URL`) and `JWT_SECRET` with the cryptographic RNG, copies
`GEMINI_API_KEY` / `GROQ_API_KEY` from the local `.env` without printing them, and writes LF line endings without a
BOM. Nothing secret is printed. It refuses to replace an existing file unless `-Force`.

Copy it (the deploy script also strips CR characters and re-applies `chmod 600` on every run):

```powershell
ssh myserver "mkdir -p /etc/menu-kopilot && chmod 700 /etc/menu-kopilot"
scp .env.production myserver:/etc/menu-kopilot/env
ssh myserver "chmod 600 /etc/menu-kopilot/env"
```

AI keys can be added later: edit the file on the server, then run the deploy script again (or
`docker compose ... up -d` on the server). Without keys the app answers from the database only and says so.

## 3. Clone (once)

```bash
# on the server: a key that can only read this repository
ssh-keygen -t ed25519 -N "" -C "myserver menu-kopilot deploy (read-only)" -f /root/.ssh/menu_kopilot_deploy
cat >> /root/.ssh/config <<'EOF'
Host github-menu-kopilot
  HostName github.com
  User git
  IdentityFile /root/.ssh/menu_kopilot_deploy
  IdentitiesOnly yes
EOF
chmod 600 /root/.ssh/config
```

```powershell
# on the PC: register the public key as a read-only deploy key
ssh myserver "cat /root/.ssh/menu_kopilot_deploy.pub" > $env:TEMP\mk_deploy.pub
gh repo deploy-key add $env:TEMP\mk_deploy.pub -R bcsakalar/Menu_Kopilot --title "myserver (read-only)"
ssh myserver "git clone -q git@github-menu-kopilot:bcsakalar/Menu_Kopilot.git /opt/menu-kopilot"
```

## 4. nginx site (once)

```bash
cp /opt/menu-kopilot/deploy/nginx/menu-kopilot.conf /etc/nginx/sites-available/
cp /opt/menu-kopilot/deploy/nginx/mk-proxy.conf /etc/nginx/snippets/
ln -sf /etc/nginx/sites-available/menu-kopilot.conf /etc/nginx/sites-enabled/menu-kopilot.conf
nginx -t && systemctl reload nginx
```

Copied, not symlinked into the clone: a `git pull` must never change the live proxy without `nginx -t`. After a pull
that changes `deploy/nginx/`, repeat the three copies. `nginx -t` runs before the reload, so a mistake never reaches the
running sites. To back out: `rm /etc/nginx/sites-enabled/menu-kopilot.conf && nginx -t && systemctl reload nginx`.
The site sends HSTS, `nosniff`, `X-Frame-Options: DENY`, a no-referrer policy and a `default-src 'none'` CSP (the API
serves only JSON and SSE), limits logins to 10/min and the API to 120/min per visitor IP, and hides `/docs`.

## 5. Deploy and update

Docker Desktop must be running on the PC, and the commit must be pushed:

```powershell
git push
powershell -File scripts/deploy.ps1
```

The script checks that `HEAD` is `origin/main`, checks the secrets file and the clone, runs `git pull --ff-only` on the
server, builds `menu-kopilot-api:<git sha>` for `linux/amd64`, copies the compressed image (~100 MB), starts the stack
and waits for `/health/ready`. Migrations and the idempotent seed (27 cuisines, 316 templates, the admin user) run when
the API container starts; templates the user edited or deleted are never overwritten or brought back.

## 6. Verify

```powershell
curl.exe -fsS https://menu.example.com/health/ready
ssh myserver "docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}' | grep -E 'NAME|menu-kopilot'"
```

End-to-end check against production (starts a few analyses and marks one card skipped, never accepts one, so the
template pool is untouched; with AI keys it also reads two screenshots and a menu photo and spends a few LLM calls). The password is read without echo and never lands in shell history:

```powershell
$env:ADMIN_EMAIL = 'admin@example.com'
$secure = Read-Host 'Admin password' -AsSecureString
$env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
pnpm -C backend live:check --url https://menu.example.com
Remove-Item Env:ADMIN_PASSWORD
```

Server-Sent Events through Cloudflare + nginx: start a suggestion in the app — cards must appear one by one, not
all at the end (`proxy_buffering off` in `mk-proxy.conf`).

## 7. Phone

The release APK (signed with the key in `%USERPROFILE%\.android-keys\menu-kopilot\`, see the README) opens with
`https://menu.example.com` prefilled:

```powershell
cd mobile
flutter build apk --release --split-per-abi --target-platform android-arm64 --dart-define=API_BASE_URL=https://menu.example.com
adb install -r build/app/outputs/flutter-apk/app-arm64-v8a-release.apk
```

A phone that has a debug-signed build installed must uninstall it first (Android refuses an update signed with a
different key). A phone that was used against the local server keeps that address: change it under **Ayarlar → Sunucu
adresi** (or "Değiştir" on the login screen). Release builds only accept `https://` addresses (plus
`http://localhost` for USB testing).

## 8. Roll back

```powershell
ssh myserver "docker image ls menu-kopilot-api"                  # images kept on the server
powershell -File scripts/deploy.ps1 -SkipBuild -Tag <older tag>  # roll back without building
```

The server's nightly `docker system prune -af --filter until=168h` removes images no container has used for a week,
so rollback images are available for about 7 days. The API applies pending migrations when it starts. If a rollback
goes back past a migration, revert that migration with the newer image still running, then deploy the older tag:

```powershell
ssh myserver "cd /opt/menu-kopilot && docker compose --env-file /etc/menu-kopilot/env -f deploy/docker-compose.prod.yml exec -T api node dist/db/rollback.js"
```

## 9. Backups

`/etc/cron.d/menu-kopilot-backup` runs [`deploy/backup.sh`](../deploy/backup.sh) every night at 03:30: a custom-format
`pg_dump` into `/opt/yedek/menu-kopilot-YYYY-MM-DD.dump` (14 days kept), log in `/var/log/menu-kopilot-backup.log`.

```bash
/opt/menu-kopilot/deploy/backup.sh                         # a dump right now
docker exec -i menu-kopilot-postgres-1 sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
  < /opt/yedek/menu-kopilot-YYYY-MM-DD.dump                # restore
```

Copy a dump off the server now and then (`scp myserver:/opt/yedek/menu-kopilot-*.dump .`): the droplet is a single disk.

## 10. Remove completely

```bash
cd /opt/menu-kopilot && docker compose --env-file /etc/menu-kopilot/env -f deploy/docker-compose.prod.yml down -v  # deletes the data
rm /etc/nginx/sites-enabled/menu-kopilot.conf /etc/nginx/sites-available/menu-kopilot.conf /etc/nginx/snippets/mk-proxy.conf
nginx -t && systemctl reload nginx
rm -r /opt/menu-kopilot /etc/menu-kopilot /etc/cron.d/menu-kopilot-backup
```

Do not reboot the server to test restarts: other production apps run there. `restart: unless-stopped` brings the
containers back after the Docker service or the machine restarts.

## Appendix: old-app was retired (2026-09-18)

Menü Kopilot took over from old-app. It was stopped and archived, not deleted:

- final dump `/opt/yedek/old-app-SON-20260918-2325.sql.gz` (the daily dumps `old-app-*.sql.gz` stay as well);
- containers `old-app-api` / `old-app-db` stopped with `--restart=no`; the nightly prune removes stopped
  containers and their image after a week; the database volume `old-app_postgres_veri` is kept;
- nginx site, `rp-*` snippets and `conf.d/rp-rate-limit.conf` moved to `/opt/arsiv/old-app-20260918-2325/nginx/`;
- its backup line in root's crontab is commented out (`# disabled 20260918-2325 …`);
- the project folder moved to `/opt/arsiv/old-app-20260918-2325/project`;
- the Cloudflare DNS record `old-app.example.com` can be deleted (it now reaches the default nginx site).

To delete it for good once nothing is needed from it:

```bash
docker rm old-app-api old-app-db 2>/dev/null; docker volume rm old-app_postgres_veri
docker image rm ghcr.io/bcsakalar/old-app:latest 2>/dev/null
rm -r /opt/arsiv/old-app-20260918-2325 && rm /opt/yedek/old-app-*.sql.gz /var/log/old-app-yedek.log
crontab -l | grep -v 'old-app' | crontab -
```
