# Menü Kopilot

A personal field assistant for a delivery platform branch-opening specialist. It has two modes:

- **Mod 1 · Öneri:** cuisine type + free text and/or up to 5 menu photos → editable, copy-ready product cards
  (description ≤ 160 characters, option groups with price logic, removable / extra ingredients, portion, serving
  note, tags, allergens, upsell). Known products are served from the database in milliseconds; the AI only fills
  the unknown ones.
- **Mod 2 · Menü Tamamlama (the main value):** screenshots of the restaurant's existing platform panel menu → a single
  screen for the live phone call: `12 / 14 ürün`, a "Çağrıda sor" checklist, items with missing fields
  (description / options / removable ingredients) and the products the menu most likely lacks.

> **Decision support, not an authority.** Suggestions come from templates and AI and must be confirmed with the
> restaurant; the app shows this warning on every result screen. The tool never talks to any delivery platform system:
> input is manual (typing, photos, screenshots) and output is copy/paste or a CSV/JSON export.
> **It never produces prices** — no TL amount appears anywhere; prices read on photos are kept only as a visual
> reference and are never assigned to a product.

| | |
|---|---|
| Spec | [`claude-code-prompt-menu-asistani.md`](claude-code-prompt-menu-asistani.md) |
| Provider research (Gemini, Groq) | [`docs/PROVIDER_NOTES.md`](docs/PROVIDER_NOTES.md) |
| Streaming contract (SSE) | [`docs/SSE_EVENTS.md`](docs/SSE_EVENTS.md) |
| Decisions / progress & acceptance status | [`DECISIONS.md`](DECISIONS.md) · [`PROGRESS.md`](PROGRESS.md) |

## Contents
1. [Architecture](#architecture)
2. [Security and privacy](#security-and-privacy)
3. [Local setup](#local-setup)
4. [Environment variables](#environment-variables)
5. [Getting the API keys](#getting-the-api-keys)
6. [Backend commands](#backend-commands)
7. [API overview](#api-overview)
8. [Deploying to a 1 GB VPS](#deploying-to-a-1-gb-vps)
9. [Android APK (build and signing)](#android-apk-build-and-signing)
10. [CI / release](#ci--release)
11. [Tests](#tests)
12. [Troubleshooting](#troubleshooting)

## Architecture

```mermaid
flowchart LR
  subgraph Phone["Flutter app (no provider keys)"]
    UI[Öneri · Tamamla · Şubeler · Şablonlar · Ayarlar]
    Local[(Drift: history, template pool,<br/>offline queue, checklist ticks)]
  end
  subgraph VPS["Docker Compose on a 1 GB droplet"]
    Caddy[Caddy<br/>HTTPS, no buffering] --> API[Fastify API<br/>+ embedding worker]
    API --> PG[(PostgreSQL 16<br/>pgvector + pg_trgm)]
    API --> Redis[(Redis 7<br/>cache + BullMQ)]
  end
  UI -- "JWT + SSE" --> Caddy
  API -- "keys live here only" --> Gemini[Gemini API]
  API --> Groq[Groq API]
```

Token economy — the database and caches answer first, the LLM is the last resort:

1. **Retrieval without AI:** exact name → alias → `pg_trgm` similarity → pgvector (only approved templates). The
   40 seed templates (`source='seed'`, badge **Hazır şablon**) and every card the user approves (badge **DB'den**)
   come back with zero LLM calls (`cache_hit=true`).
2. **Caches (Redis, 30 days):** per-image extraction, per-item enrichment, canonical name decisions and gap
   suggestions — the same photo or menu never costs twice.
3. **AI with a budget:** at most 6 calls / 25 k input tokens per request (then "Devam et"), a daily quota per user,
   batches of 3 → 10 items with 2 in flight, a single repair attempt, and uncertain items end up as
   **İnceleme gerek** cards ("Bunu bilmiyorum, sen doldur.").
4. **Provider router:** a fallback chain per task (e.g. vision: Gemini Flash → Groq Qwen), circuit breaker, rate-limit
   headers, cooldowns and full-jitter backoff. Prompts are versioned in the database (`prompt_templates`), not in the
   code.

| Path | What |
|---|---|
| `backend/` | Node.js 22 + TypeScript (strict) + Fastify 5, Drizzle ORM, PostgreSQL + pgvector, Redis + BullMQ, Zod |
| `mobile/` | Flutter (Android first; iOS kept buildable), Riverpod, go_router, Dio, Drift |
| `deploy/` | `Caddyfile`, production compose file for the droplet |
| `scripts/` | provider-key guard, deploy script |
| `docs/` | provider notes, SSE contract |

## Security and privacy

- **Provider API keys exist only on the backend.** The mobile app contains no Gemini/Groq key or endpoint — not even
  in a `.env` (an APK can be decompiled). `scripts/check-no-provider-keys.ps1` and a CI job fail the build if one
  appears.
- The app authenticates with a short-lived JWT + rotating refresh token (hashed server side). There is a single
  account (created by the seed from `ADMIN_EMAIL` / `ADMIN_PASSWORD`); production refuses to start with the
  development defaults.
- Photos and screenshots are never stored on the server — only their SHA-256 (for caching). EXIF/GPS is stripped on
  the phone before upload.
- **`LOCAL_ONLY_MODE=true`** turns off every external API call: answers come only from the database and the caches
  (a photo read once is still usable from the cache; new photos cannot be read in this mode).

**Free-tier data use (read this before sending real menus).** Menu photos and panel screenshots belong to the
restaurant. On the **Gemini API free tier ("Unpaid Services")** Google's terms state that submitted content and
responses are used to provide, improve and develop Google products and machine-learning technologies, that human
reviewers may read and annotate API input and output, and they explicitly advise not to submit sensitive,
confidential or personal information; on paid tiers prompts and responses are not used to improve products and are
logged only for a limited period for abuse detection ([Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms),
checked 2026-09-15, last updated 2026-04-28). Independently of the tier this backend sends every Gemini
interaction with `store: false`, so the Interactions API does not keep conversation state. **Groq** states that by
default it does not retain customer data for inference requests; inputs/outputs may be logged for up to 30 days for
reliability and abuse investigations unless **Zero Data Retention** is enabled in the console's Data Controls
([Groq: Your Data](https://console.groq.com/docs/your-data), checked 2026-09-15). Recommendations: use a paid Gemini
key (or keep Gemini for text-only tasks), enable Groq ZDR, never photograph documents with personal data, and switch
on `LOCAL_ONLY_MODE` when external processing is not acceptable. Policies change — re-check the linked pages.

## Local setup

Prerequisites (Windows 11 + PowerShell shown): Node.js ≥ 22, pnpm 11 (`corepack enable`), Docker Desktop, Flutter
(stable channel), JDK 17 and the Android SDK for the app.

```powershell
# 1. configuration (optional for a first run: compose has development defaults)
Copy-Item .env.example .env
#    edit .env: JWT_SECRET (openssl rand -base64 48), ADMIN_PASSWORD, GEMINI_API_KEY / GROQ_API_KEY

# 2. full stack: api + postgres(pgvector) + redis + caddy
docker compose up -d --build
#    http://localhost:3000/health/ready  → {"status":"ready"}
#    http://localhost:3000/docs          → Swagger UI (OpenAPI at /openapi.json)
```

Backend development with hot reload (databases from compose):

```powershell
docker compose up -d postgres redis
cd backend
pnpm install
pnpm db:migrate
pnpm db:seed          # 12 cuisines, 40 templates, prompts v1, provider routes, admin user
pnpm dev              # http://localhost:3000
```

The app (debug builds allow plain HTTP to a local backend):

```powershell
cd mobile
flutter pub get
# emulator → host machine is 10.0.2.2; a real phone needs the PC's LAN IP
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

The server address can also be typed on the login screen and changed later in **Ayarlar → Sunucu**.

## Environment variables

All keys are listed in [`.env.example`](.env.example) (a test keeps it in sync with the Zod schema in
`backend/src/config/env.ts`, the only place that reads `process.env`).

| Variable | Default | Meaning |
|---|---|---|
| `NODE_ENV` | `production` | `development` / `test` / `production` (production rejects weak secrets) |
| `HOST`, `PORT` | `0.0.0.0`, `3000` | HTTP listener |
| `LOG_LEVEL` | `info` | pino level (`silent` in tests) |
| `TRUST_PROXY` | `true` | trust `X-Forwarded-*` from Caddy |
| `ROLE` | `all` | `api`, `worker` or `all` (API + embedding worker in one process — best for 1 GB) |
| `DATABASE_URL` / `REDIS_URL` | local URLs | compose overrides them with the internal service names |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `menu` / `menu` / `menu_kopilot` | database container |
| `JWT_SECRET` | — | ≥ 32 random characters; required in production |
| `JWT_ACCESS_TTL`, `REFRESH_TOKEN_TTL_DAYS` | `12h`, `90` | token lifetimes |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | — | the single account, created by the seed |
| `SEED_ON_START` | `true` | run migrations + idempotent seed when the API starts |
| `GEMINI_API_KEY`, `GROQ_API_KEY` | — | provider keys (server only); a missing key just removes that provider from the chains |
| `LOCAL_ONLY_MODE` | `false` | never call external APIs |
| `DAILY_LLM_CALL_QUOTA`, `DAILY_TOKEN_QUOTA`, `QUOTA_TIMEZONE` | `300`, `1500000`, `Europe/Istanbul` | per-user daily quota; after it the app answers from DB/cache only |
| `REQUEST_MAX_LLM_CALLS`, `REQUEST_MAX_INPUT_TOKENS` | `6`, `25000` | per-request budget ("Devam et" after it) |
| `RETRIEVAL_TRGM_THRESHOLD`, `RETRIEVAL_VECTOR_THRESHOLD` | `0.72`, `0.85` | DB match thresholds |
| `CACHE_TTL_DAYS` | `30` | Redis cache lifetime |
| `UPLOAD_MAX_FILES`, `UPLOAD_MAX_FILE_MB` | `5`, `8` | photo upload limits |
| `SITE_ADDRESS` | `:80` | Caddy site; a hostname (e.g. `api.example.com`) enables automatic HTTPS |

Model IDs and fallback chains are in `backend/src/config/models.ts`; the primary model per task can be changed from
**Ayarlar → Görev bazlı modeller** without a redeploy.

## Getting the API keys

Keys go **only** into the server's environment file — never into the app.

- **Gemini:** open [Google AI Studio → API keys](https://aistudio.google.com/apikey), sign in, *Create API key*
  (choose or create a Google Cloud project) → `GEMINI_API_KEY`. The free tier works for trying things out; see the
  privacy note above before using real menus, and enable billing on the project for the paid terms.
- **Groq:** open [Groq Console → API Keys](https://console.groq.com/keys), *Create API Key* → `GROQ_API_KEY`.
  Consider enabling Zero Data Retention under *Data Controls*.
- Verify both (live calls, costs a few requests): `cd backend; pnpm test:smoke`. The smoke tests are skipped when the
  keys are missing, so the normal test suite never needs them.

## Backend commands

Run from `backend/` (PowerShell: chain commands with `;`).

| Command | What |
|---|---|
| `pnpm dev` | API with hot reload (reads `../.env`) |
| `pnpm test` / `pnpm test:watch` | unit + integration + e2e (hermetic: PGlite with pgvector/pg_trgm, fake providers) |
| `pnpm test:smoke` | live provider checks (needs keys) |
| `pnpm lint` · `pnpm typecheck` · `pnpm build` | ESLint (no `any`), `tsc --noEmit`, compile to `dist/` |
| `pnpm db:migrate` · `pnpm db:rollback` | apply / revert the last migration (every migration has a `drizzle/down/*.sql`) |
| `pnpm db:generate` | new migration from schema changes (add the matching down file) |
| `pnpm db:seed` | idempotent seed; never overwrites templates the user edited or seeds the user deleted |
| `pnpm db:export-seed [--from=files\|db] [--out=exports/seed-templates.csv]` | seed templates as a review CSV (UTF-8 BOM, `;`) |
| `pnpm fixtures:images` · `pnpm fixtures:record` | regenerate synthetic test images · re-record LLM fixtures with real keys |

## API overview

Everything is under `/api/v1` and needs `Authorization: Bearer <access token>` except login/refresh. Errors always
have the shape `{ "error": { "code", "message", "details?", "requestId" } }`. Interactive docs: `/docs`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| Mod 1 | `POST /suggest` (multipart: `cuisineId`, `promptText?`, `branchId?`, `deepMode?`, `images[]` ≤ 5; SSE with `Accept: text/event-stream`, `?async=1` → 202), `GET /suggest/:runId`, `GET /suggest/:runId/events`, `POST /suggest/:runId/cancel`, `POST /suggest/:runId/continue`, `POST /suggestion-items/:id/accept`, `POST /suggestion-items/:id/skip` |
| Mod 2 | `POST /gap-analysis` (multipart: `branchId`, `extraNotes?`, `images[]` 1–5; SSE / async / sync), `GET /gap-analysis/:runId`, `GET /gap-analysis/:runId/events`, `POST /gap-analysis/:runId/cancel`, `GET /branches/:id/gap/latest` |
| Branches | `GET/POST /branches`, `GET/PATCH/DELETE /branches/:id`, `GET /branches/:id/menu`, `PATCH/DELETE /branches/:id/menu/:itemId`, `GET /branches/:id/export?format=csv\|json` |
| Template pool | `GET /templates?q=&cuisineId=&source=&approved=&sort=usage\|name\|updated`, `GET/PATCH/DELETE /templates/:id`, `POST /templates` |
| Settings | `GET/POST/PATCH/DELETE /cuisines`, `GET /settings/providers`, `PUT /settings/providers/:taskKey`, `GET /settings/quota`, `GET /usage/summary?range=today\|month`, `GET/POST /prompts`, `POST /prompts/:id/activate` (admin) |
| Health | `GET /health`, `GET /health/ready` (database + Redis) |

Streaming events and payload shapes: [`docs/SSE_EVENTS.md`](docs/SSE_EVENTS.md). Mod 2 streams
`run → counts → questions → items → recommendations(db) → recommendations(ai) → done`, so the count and the checklist
reach the phone before anything else.

## Deploying to a 1 GB VPS

Target: Ubuntu droplet (ssh alias `myserver`), Docker Compose, Caddy for HTTPS. **Nothing is built on the droplet**
— `tsc`/`pnpm install` would be OOM-killed on 1 GB. The API image is built by the release workflow (or on your PC)
and pulled from GHCR. Memory limits in [`deploy/docker-compose.prod.yml`](deploy/docker-compose.prod.yml):
Postgres 256 MB, API 384 MB, Redis 128 MB, Caddy 64 MB.

**1. Build the image off-box.** Push a tag `v1.0.0` → `.github/workflows/release.yml` publishes
`ghcr.io/<owner>/menu-kopilot-api:1.0.0` and `:latest`. (Manual alternative from Windows:
`docker build -t ghcr.io/bcsakalar/menu-kopilot-api:latest backend; docker push ghcr.io/bcsakalar/menu-kopilot-api:latest`.)

**2. One-time server preparation** (as root on the droplet):

```bash
# Docker Engine + compose plugin
curl -fsSL https://get.docker.com | sh
# swap: turns OOM kills into slowness
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile \
  && echo '/swapfile none swap sw 0 0' >> /etc/fstab
# firewall: ssh + web only (Postgres/Redis are never published)
ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw --force enable
mkdir -p /etc/menu-kopilot /srv/menu-kopilot
# only if the GHCR package is private: a GitHub token with read:packages
docker login ghcr.io -u <github-user>
```

Point a DNS `A` record (e.g. `api.example.com`) to the droplet; Caddy obtains the certificate on first start.

**3. Secrets file — outside the deploy directory, mode 600.** Prepare `.env.production` locally from
`.env.example` (`NODE_ENV=production`, `SITE_ADDRESS=api.example.com`, a URL-safe `POSTGRES_PASSWORD` such as
`openssl rand -hex 24`, `JWT_SECRET`, `ADMIN_*`, provider keys) and send it over ssh stdin (never as a command-line
argument):

```powershell
Get-Content .env.production -Raw | ssh myserver "cat > /etc/menu-kopilot/env && chmod 600 /etc/menu-kopilot/env"
```

**4. Deploy / update** from Windows (uploads the compose file and Caddyfile with LF endings, pulls, restarts, waits
for `/health/ready`):

```powershell
powershell -File scripts/deploy.ps1            # :latest
powershell -File scripts/deploy.ps1 -Tag 1.0.0 # a released version
```

Equivalent by hand on the server:

```bash
cd /srv/menu-kopilot
docker compose --env-file /etc/menu-kopilot/env -f docker-compose.prod.yml pull
docker compose --env-file /etc/menu-kopilot/env -f docker-compose.prod.yml up -d
```

Migrations and the idempotent seed run when the API container starts (`SEED_ON_START`).

**5. Checks after every deploy**

- `curl -fsS https://api.example.com/health/ready` → `{"status":"ready",...}`
- `docker compose --env-file /etc/menu-kopilot/env -f docker-compose.prod.yml ps` — all services `healthy`/`running`
- `docker stats --no-stream` — total well below 1 GB; `free -m` shows swap
- `docker compose ... logs --tail 100 api` — no crash loop
- SSE through the proxy: a gap analysis in the app shows the count within seconds (Caddy `flush_interval -1`)
- Reboot test once: `reboot`, then the health check again (`restart: unless-stopped`)

**Windows → Linux pitfalls (already handled, keep it that way)**

- Line endings: `.gitattributes` forces LF for everything except `*.ps1`/`*.bat`; the deploy script also converts the
  uploaded files.
- Case sensitivity: ext4 is case-sensitive; CI runs the whole backend suite on Ubuntu, which catches a wrong-case
  import before it reaches the server. Keep `git config core.ignorecase false` in this repo.
- Paths: code uses `node:path` / `URL` helpers only, never string-concatenated `\` paths.
- Permissions: `/etc/menu-kopilot/env` is `600`; the API container runs as a non-root user.

**Backups** (Postgres holds the approved templates — the valuable part):

```bash
# daily dump at 03:30, keep 14 days
cat > /etc/cron.d/menu-kopilot-backup <<'EOF'
30 3 * * * root mkdir -p /var/backups/menu-kopilot && docker exec menu-kopilot-postgres-1 pg_dump -U menu -d menu_kopilot -Fc > /var/backups/menu-kopilot/$(date +\%F).dump && find /var/backups/menu-kopilot -name '*.dump' -mtime +14 -delete
EOF
```

## Android APK (build and signing)

```powershell
cd mobile
flutter build apk --debug                       # quick test build
flutter build apk --release                     # fat APK (all ABIs, ~65 MB)
flutter build apk --release --split-per-abi     # smaller per-ABI APKs; most phones need app-arm64-v8a-release.apk
```

Release signing: run `powershell -File mobile/scripts/create-keystore.ps1` once. It creates an upload keystore
(default `%USERPROFILE%\.android-keys\menu-kopilot-upload.jks`) and `mobile/android/key.properties`; both are
git-ignored. Without `key.properties` a release build is signed with the debug key (fine for your own phone, not for
distribution). **Back up the keystore and its password** — an app signed with a different key cannot be installed
over the existing one.

Install on the phone: copy the APK and allow "install unknown apps" for the file manager, or
`adb install -r build\app\outputs\flutter-apk\app-release.apk`. Set the default server with
`--dart-define=API_BASE_URL=https://api.example.com` (release builds only allow HTTPS).

iOS: the project stays buildable, but building requires macOS/Xcode (not possible on Windows).

## CI / release

- [`ci.yml`](.github/workflows/ci.yml) — on push/PR: backend `lint` + `typecheck` + `test` + `build` (Node 22), mobile
  `flutter analyze` + `flutter test` (stable channel), and the provider-key guard.
- [`release.yml`](.github/workflows/release.yml) — on a `v*` tag or manually: signed release APK as a workflow
  artifact (secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`,
  `ANDROID_KEY_ALIAS`; optional repository variable `API_BASE_URL`) and the API image pushed to GHCR (linux/amd64).

## Tests

- Backend: `cd backend; pnpm test` — ~255 tests: Turkish normalization, price guard, env, seed data, JSON-schema
  conversion, provider adapters and router resilience (fallback, circuit breaker, 429 cooldown), migrations up → down
  → up, and end-to-end runs of both pipelines against recorded fixtures (40 seed items with zero LLM calls, broken
  JSON → review cards, provider down → fallback, accepted card served from the DB, 12 unique items from overlapping
  screenshots, LOCAL_ONLY_MODE). Fixtures are hand-written stand-ins; see `backend/test/fixtures/llm/README.md`.
- Mobile: `cd mobile; flutter analyze; flutter test` — SSE parser, models, controllers (offline queue, gap stream,
  template pool cache) and widget tests (cards, checklist, branch menu).
- Acceptance criteria and what still needs a real device / real keys: [`PROGRESS.md`](PROGRESS.md).

## Troubleshooting

- **Cards do not stream / arrive all at once** — a proxy is buffering. With Caddy keep `flush_interval -1`; with
  another proxy disable response buffering for `text/event-stream`.
- **`quota_exceeded` / `local_only` warnings** — the daily quota is used up or `LOCAL_ONLY_MODE` is on; the app keeps
  answering from the database and caches. **Ayarlar → Kullanım** shows calls, errors and cache/DB hit ratios.
- **Photos are not read** — no provider key configured (Ayarlar → Görev bazlı modeller shows provider status), or
  both providers are down (circuit breaker opens for 60 s after 3 failures).
- **Release build warns about the Kotlin Gradle Plugin** (`flutter_image_compress_common`, `workmanager_android`) —
  upstream plugin issue, the build still succeeds; upgrade the plugins before upgrading Flutter (DECISIONS D-088).
- **Docker Desktop fails to start on Windows** — see DECISIONS D-056 (stale `sailor-ingest.sock`); the backend tests do
  not need Docker.
