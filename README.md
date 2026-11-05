# Menü Kopilot

A website for the rep who opens a restaurant branch on a food-delivery platform, used during the live phone call.
The restaurant comes with nothing but its menu; the site reads it and leads the call:

- **Paste a screenshot with Ctrl+V** (from anywhere on the page), drop an image, or type the products. Several
  screenshots of one panel are merged without duplicates.
- **The first answer** says where the menu stands (`15 ürün, hedef 20`, `Çorba 0/1`), what to bring up first and the next
  steps as buttons, with the cards under it in three tabs:
  **Yeni ürünler** (products the menu lacks and this kitchen can make, each with a sentence to say to the restaurant),
  **Opsiyon ve malzeme** (option groups, removable and extra ingredients, a description for every product on the menu),
  **Düzeltmeler** (wrong names, a product under the wrong heading).
- **It is a chat.** "Tatlı öner", "Adana için opsiyon yaz", "ayran yokmuş", "restoran dürüm istemiyor, ne diyeyim?", or
  a second screenshot: every follow-up goes through the same agents and guards as the first analysis, and nothing is
  offered twice in one conversation.
- **Everything is one copy away:** a card, one of its rows, or a whole tab, as plain text for the restaurant panel.

No account and no password: a browser's first message creates a visitor, and a cookie keeps its conversations.
The admin panel at `/admin` has a real sign-in.

> **Decision support, not an authority.** Suggestions come from templates and AI and must be confirmed with the
> restaurant. The tool never talks to any ordering platform: input is manual (typing, screenshots) and output is
> copy/paste.
> **Templates never contain a price.** The only amount the site shows is a new product's *estimated* price range
> (`25–40 TL`), a prompt for the conversation that is never written into the template pool; prices read on photos
> are never assigned to a product.

| | |
|---|---|
| Spec | [`claude-code-prompt-menu-asistani.md`](claude-code-prompt-menu-asistani.md) |
| Provider research (Gemini, Groq) | [`docs/PROVIDER_NOTES.md`](docs/PROVIDER_NOTES.md) |
| Streaming contract (SSE) | [`docs/SSE_EVENTS.md`](docs/SSE_EVENTS.md) |
| Deploying next to other apps on `myserver` (nginx + Cloudflare) | [`docs/DEPLOY_MYSERVER.md`](docs/DEPLOY_MYSERVER.md) |
| Product and design context | [`PRODUCT.md`](PRODUCT.md) · [`DESIGN.md`](DESIGN.md) |
| Decisions / progress & acceptance status | [`DECISIONS.md`](DECISIONS.md) · [`PROGRESS.md`](PROGRESS.md) |

## Contents
1. [Architecture](#architecture)
2. [Security and privacy](#security-and-privacy)
3. [Local setup](#local-setup)
4. [Environment variables](#environment-variables)
5. [Getting the API keys](#getting-the-api-keys)
6. [Backend commands](#backend-commands)
7. [API overview](#api-overview)
8. [Deploying](#deploying)
9. [CI / release](#ci--release)
10. [Tests](#tests)
11. [Troubleshooting](#troubleshooting)

## Architecture

```mermaid
flowchart LR
  Browser["Browser (React, no keys)<br/>chat at /, admin at /admin"]
  subgraph VPS["Docker Compose on a small droplet"]
    Proxy[nginx or Caddy<br/>HTTPS, no buffering] --> API[Fastify: site + API<br/>+ embedding worker]
    API --> PG[(PostgreSQL 16<br/>pgvector + pg_trgm)]
    API --> Redis[(Redis 7<br/>cache + BullMQ)]
  end
  Browser -- "cookie + SSE" --> Proxy
  API -- "keys live here only" --> Gemini[Gemini API]
  API -. fallback .-> Groq[Groq API]
```

Token economy — the database and caches answer first, the LLM is the last resort:

1. **Retrieval without AI:** exact name → alias → `pg_trgm` similarity → pgvector (only approved templates). The
   316 seed templates in 27 common kitchen categories (`source='seed'`, badge **Hazır şablon**)
   and every card the user approves (badge **DB'den**)
   come back with zero LLM calls (`cache_hit=true`).
2. **Caches (Redis, 30 days):** per-image extraction, recommender answers per gap set and voice transcriptions —
   the same photo or menu never costs twice.
3. **AI with a budget:** at most 6 agent calls / 25 k input tokens per analysis (plus one call per image) and a daily quota per user; images are read
   3 in flight, the two recommendation agents run in parallel under an 11 s deadline, and anything a model could not
   answer in time or in shape is filled from the database. The Validator checks every model answer in code (schema,
   dedupe against the menu, cuisine fit, category quotas) and asks the model again at most once.
4. **Provider router:** a fallback chain per task (e.g. vision: Gemini Flash → Groq Qwen), circuit breaker, rate-limit
   headers, cooldowns and full-jitter backoff. Prompts are versioned in the database (`prompt_templates`), not in the
   code.

| Path | What |
|---|---|
| `backend/` | Node.js 22 + TypeScript (strict) + Fastify 5, Drizzle ORM, PostgreSQL + pgvector, Redis + BullMQ, Zod |
| `web/` | React 19 + Vite + TypeScript, plain CSS; built into the API image and served by Fastify |
| `deploy/` | production compose file, nginx site for a shared server, `Caddyfile` for a fresh droplet |
| `scripts/` | provider-key guard, deploy script (builds the image locally, copies it over ssh) |
| `docs/` | provider notes, SSE contract, myserver runbook |

## Security and privacy

- **Provider API keys exist only on the backend.** The site contains no Gemini/Groq key or endpoint, because everything
  under `web/` ends up in a public bundle. `scripts/check-no-provider-keys.ps1` and a CI job fail the build if one
  appears.
- **The site is open (D-200).** A visitor is a user row with no password, identified by an HttpOnly, SameSite=Lax
  cookie. That is what keeps ownership checks, history and quotas per browser. Anyone with the address can use it, so
  it is limited three ways: 20 messages a minute per IP, `DAILY_LLM_CALL_QUOTA` per visitor and
  `GLOBAL_DAILY_LLM_CALL_QUOTA` for the whole site, past which answers come from the template pool only.
- **A visitor cannot write anything shared.** The template pool, the learning loop and every setting sit behind the
  admin cookie (HttpOnly, SameSite=Strict, 12 h), and production refuses to start with the development defaults.
- Screenshots are never stored on the server, only their SHA-256 (for caching). The browser re-encodes them before
  upload, which also drops EXIF/GPS.
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

Prerequisites (Windows 11 + PowerShell shown): Node.js ≥ 22, pnpm 11 (`corepack enable`), Docker Desktop.

```powershell
# 1. configuration (optional for a first run: compose has development defaults)
Copy-Item .env.example .env
#    edit .env: JWT_SECRET (openssl rand -base64 48), ADMIN_PASSWORD, GEMINI_API_KEY / GROQ_API_KEY

# 2. full stack: site + api + postgres(pgvector) + redis
docker compose up -d --build
#    http://localhost:3000/              → the site (admin: /admin)
#    http://localhost:3000/health/ready  → {"status":"ready"}
#    http://localhost:3000/docs          → Swagger UI (OpenAPI at /openapi.json)
```

### One command on the office PC

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1                   # Docker, stack, health check
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -Build            # after pulling new code
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -FixDockerSocket  # Docker Desktop hangs while starting
```

Backend development with hot reload (databases from compose):

```powershell
docker compose up -d postgres redis
cd backend
pnpm install
pnpm db:migrate
pnpm db:seed          # 27 cuisines, 316 templates, prompts v1, provider routes, admin user
pnpm dev              # http://localhost:3000
```

The site with hot reload (the dev server proxies `/api` to port 3000, so cookies work as in production):

```powershell
cd web
pnpm install
pnpm dev              # http://localhost:5173
```

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
| `JWT_ACCESS_TTL` | `12h` | admin session lifetime (a visitor's cookie lasts a year) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | — | the admin panel's account, created by the seed |
| `SEED_ON_START` | `true` | run migrations + idempotent seed when the API starts |
| `GEMINI_API_KEY`, `GROQ_API_KEY` | — | provider keys (server only); a missing key just removes that provider from the chains |
| `LOCAL_ONLY_MODE` | `false` | never call external APIs |
| `DAILY_LLM_CALL_QUOTA`, `DAILY_TOKEN_QUOTA`, `QUOTA_TIMEZONE` | `300`, `1500000`, `Europe/Istanbul` | per-user daily quota; after it the app answers from DB/cache only |
| `REQUEST_MAX_LLM_CALLS`, `REQUEST_MAX_INPUT_TOKENS` | `6`, `25000` | what the agents may spend per analysis; every image adds one call and 4 000 tokens on top; past it the remaining sections come from the database |
| `GLOBAL_DAILY_LLM_CALL_QUOTA` | `3000` | ceiling for the whole site: the site is open and a cleared cookie gets a fresh per-visitor quota |
| `RETRIEVAL_TRGM_THRESHOLD`, `RETRIEVAL_VECTOR_THRESHOLD` | `0.72`, `0.85` | DB match thresholds |
| `CACHE_TTL_DAYS` | `30` | Redis cache lifetime |
| `UPLOAD_MAX_FILES`, `UPLOAD_MAX_FILE_MB` | `5`, `8` | photo upload limits |
| `API_PORT` | `3000` (production: `3030`) | host port of the API, bound to `127.0.0.1` only (compose) |
| `SITE_ADDRESS` | `:80` | Caddy site; a hostname (e.g. `api.example.com`) enables automatic HTTPS |

Model IDs and fallback chains are in `backend/src/config/models.ts`; the primary model per task can be changed from
the admin panel (**Modeller**) without a redeploy.

## Getting the API keys

Keys go **only** into the server's environment file — never into `web/`.

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
| `pnpm live:check [--url https://…] [--skip-ai]` | end-to-end check of a running server over HTTP, independent of the app: auth rotation, categories, a typed analysis (three sections, no duplicate of the menu, no price in a template, < 15 s), trace, resume/replay, re-run with another cuisine, SSE order; with keys also panel screenshots and a menu photo. Never accepts a card. Uses `ADMIN_EMAIL` / `ADMIN_PASSWORD` from the environment or `../.env` |
| `pnpm measure --label <name>` · `pnpm compare` | quality measurement on the frozen menu fixtures (`test/fixtures/menus/`: duplicates, irrelevant, directly usable, category coverage, time) → `exports/quality-<name>.json`; `compare` prints the before/after table |
| `pnpm probe:recommender` | the Product Recommender alone on the fixture gaps (name noise, category fit) |
| `pnpm lint` · `pnpm typecheck` · `pnpm build` | ESLint (no `any`), `tsc --noEmit`, compile to `dist/` |
| `pnpm db:migrate` · `pnpm db:rollback` | apply / revert the last migration (every migration has a `drizzle/down/*.sql`) |
| `pnpm db:generate` | new migration from schema changes (add the matching down file) |
| `pnpm db:seed` | idempotent seed; never overwrites templates the user edited or seeds the user deleted |
| `pnpm db:export-seed [--from=files\|db] [--out=exports/seed-templates.csv]` | seed templates as a review CSV (UTF-8 BOM, `;`) |
| `pnpm fixtures:images` · `pnpm fixtures:record` | regenerate synthetic test images · re-record LLM fixtures with real keys |

## API overview

Everything is under `/api/v1`. The chat routes are open and identified by the visitor cookie; everything else needs the
admin cookie or `Authorization: Bearer <token>`. Errors always have the shape
`{ "error": { "code", "message", "details?", "requestId" } }`. Interactive docs: `/docs` (blocked by the production nginx
site).

| Area | Endpoints |
|---|---|
| Chat (open) | `POST /chat/messages` (multipart: `conversationId?`, `text?`, `images[]` ≤ 5; the answer streams as SSE), `GET /chat/conversations`, `GET/DELETE /chat/conversations/:id` |
| Admin | `GET /admin/overview?range=today\|month`, `GET /admin/conversations`, `GET /admin/conversations/:id` |
| Auth | `POST /auth/login` (sets the admin cookie), `POST /auth/logout`, `GET /auth/me` |
| Analysis | `POST /analyze` (multipart: `images[]` ≤ 5, `menuText?`, `cuisineId?`, `notes?`, `fromRunId?`, `debug?`; SSE with `Accept: text/event-stream`, `?async=1` → 202, otherwise the result), `GET /analyze/latest`, `GET /analyze/:runId`, `GET /analyze/:runId/events`, `GET /analyze/:runId/trace`, `POST /analyze/:runId/cancel`, `POST /suggestion-items/:id/accept`, `POST /suggestion-items/:id/skip` |
| Categories | `GET /categories`, `PATCH /categories/:key` (label, order, keywords), `GET/PUT /cuisines/:id/categories` (which categories a cuisine needs, with a minimum each) |
| Template pool | `GET /templates?q=&cuisineId=&source=&approved=&sort=usage\|name\|updated`, `GET/PATCH/DELETE /templates/:id`, `POST /templates` |
| Settings | `GET/POST/PATCH/DELETE /cuisines`, `GET /settings/providers`, `PUT /settings/providers/:taskKey`, `GET /settings/quota`, `GET /usage/summary?range=today\|month`, `GET/POST /prompts`, `POST /prompts/:id/activate` (admin) |
| Health | `GET /health`, `GET /health/ready` (database + Redis) |

Streaming events and payload shapes: [`docs/SSE_EVENTS.md`](docs/SSE_EVENTS.md). An analysis streams
`run → classification → menu → counts → item* → done` (plus `trace` per agent step and `warning`), so the count
reaches the browser before the first card.

## Deploying

Nothing is built on the server — `pnpm install`/`tsc` would be OOM-killed on a small droplet. `scripts/deploy.ps1`
builds the image (site + API) on the PC (Docker Desktop), copies it over ssh, starts the stack and waits for `/health/ready`.
Migrations and the idempotent seed run when the API container starts (`SEED_ON_START`). Memory limits in
[`deploy/docker-compose.prod.yml`](deploy/docker-compose.prod.yml): Postgres 256 MB, API 384 MB, Redis 128 MB.

**On `myserver` (nginx + Cloudflare, next to other apps)** — `scripts/new-prod-env.ps1` writes `.env.production`
(random secrets, keys copied from the local `.env`, LF, nothing printed); the rest step by step in
[`docs/DEPLOY_MYSERVER.md`](docs/DEPLOY_MYSERVER.md): Cloudflare DNS record, `/etc/menu-kopilot/env`, the nginx site
from [`deploy/nginx/`](deploy/nginx/), then:

```powershell
powershell -File scripts/deploy.ps1                               # build + copy + start
powershell -File scripts/deploy.ps1 -SkipBuild -Tag <older tag>   # roll back to an image already on the server
```

The API listens on `127.0.0.1:3030` only; nginx terminates TLS (Cloudflare origin certificate) and proxies with
buffering off so SSE cards stream.

**On a fresh droplet** (no reverse proxy yet) the same compose file starts Caddy with automatic HTTPS:

```bash
# once, as root: Docker, swap, firewall, directories
curl -fsSL https://get.docker.com | sh
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile \
  && echo '/swapfile none swap sw 0 0' >> /etc/fstab
ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw --force enable
mkdir -p /etc/menu-kopilot /srv/menu-kopilot
```

Point a DNS `A` record at the droplet, put `SITE_ADDRESS=api.example.com` into `/etc/menu-kopilot/env` (plus the
values listed in the runbook) and run `powershell -File scripts/deploy.ps1 -WithCaddy`. Release images can also come
from GHCR (`.github/workflows/release.yml` on a `v*` tag): `-ImageSource ghcr -Tag 1.0.0`.

**Checks after every deploy**

- `curl -fsS https://<host>/health/ready` → `{"status":"ready",...}`
- `pnpm -C backend live:check --url https://<host>` (see the runbook for passing the admin password safely)
- `docker stats --no-stream` — the stack stays well below its limits; `free -m` shows swap
- SSE through the proxy: the status line of a running analysis moves, it does not jump at the end

**Windows → Linux pitfalls (already handled, keep it that way)**

- Line endings: `.gitattributes` forces LF for everything except `*.ps1`/`*.bat`; the deploy script also converts the
  uploaded compose file and strips CR characters from the server's env file.
- Case sensitivity: ext4 is case-sensitive; CI and the Docker build compile on Linux, which catches a wrong-case
  import before it reaches the server.
- Paths: code uses `node:path` / `URL` helpers only, never string-concatenated `\` paths.
- Permissions: `/etc/menu-kopilot/env` is `600`; the API container runs as a non-root user.

**Backups** (Postgres holds the approved templates — the valuable part):

```bash
# daily dump at 03:30, keep 14 days
cat > /etc/cron.d/menu-kopilot-backup <<'EOF'
30 3 * * * root mkdir -p /var/backups/menu-kopilot && docker exec menu-kopilot-postgres-1 pg_dump -U menu -d menu_kopilot -Fc > /var/backups/menu-kopilot/$(date +\%F).dump && find /var/backups/menu-kopilot -name '*.dump' -mtime +14 -delete
EOF
```

## CI / release

- [`ci.yml`](.github/workflows/ci.yml) — on push/PR: backend `lint` + `typecheck` + `test` + `build` (Node 22), web `test` +
  `build`, and the provider-key guard.
- [`release.yml`](.github/workflows/release.yml) — on a `v*` tag or manually: the image (site + API) pushed to GHCR
  (linux/amd64).

## Tests

- Backend: `cd backend; pnpm test` — ~700 tests: Turkish normalization, price guard, env, seed data, JSON-schema
  conversion, provider adapters and router resilience (fallback, circuit breaker, 429 cooldown), migrations up → down
  → up, the agents one by one (dedupe across screenshots, category classification and gaps, name cleaning, option
  merge on accept) and end-to-end runs of the pipeline against recorded fixtures: three sections, no new product
  that is already on the menu, category quotas, a failing agent → partial result, re-run with another cuisine without
  re-reading the images, typed products without keys, LOCAL_ONLY_MODE, the product-type knowledge base
  and grounding (absurd groups removed, ingredients separated from options, 6–8 word descriptions, coverage), the
  matching guard, the learning loop (products turned down per cuisine, favoured suggestions first, "Geri al"), the
  analysis history (filters, paging by time), the call (call order, the sentence for the seller, "Evet / Düşünecek /
  Hayır" with the last answer counting) and the hedged photo read. Fixtures are hand-written stand-ins; see
  `backend/test/fixtures/llm/README.md`. `test/e2e/chat.e2e.test.ts` covers the site's door: the visitor cookie, one
  visitor kept out of another's conversation and of the admin routes, and follow-ups that run only what was asked.
- Web: `cd web; pnpm test` — the SSE frame parser and the text copied into the panel.
- AI quality: `tests/ai_eval/` — 141 scenarios over all 27 cuisines, scored by independent rules
  ([`tests/ai_eval/README.md`](tests/ai_eval/README.md); reports in [`docs/ai-eval/`](docs/ai-eval/)).
- Live: `cd backend; pnpm live:check` against the running stack (see Backend commands).
- Acceptance criteria and what still needs a real device / real keys: [`PROGRESS.md`](PROGRESS.md).

## Troubleshooting

- **Cards do not stream / arrive all at once** — a proxy is buffering. With Caddy keep `flush_interval -1`; with
  another proxy disable response buffering for `text/event-stream`.
- **`quota_exceeded` / `local_only` warnings** — the daily quota is used up or `LOCAL_ONLY_MODE` is on; the site keeps
  answering from the database and caches. The admin panel's **Genel bakış** shows calls, errors and quota.
- **"AI anahtarı tanımlı değil"** — no `GEMINI_API_KEY` / `GROQ_API_KEY` on the server. Typed products and the
  seed/approved templates keep working (all three sections, answered from the database). Add a key to the server's
  env file and redeploy (the admin panel's **Modeller** shows provider status).
- **A key is rejected (403 `PERMISSION_DENIED`, "Your project has been denied access")** — the provider disabled the
  project behind the key; its routes fail and the chains fall back to the other provider. Create a new key in a
  healthy project and replace it in the env file.
- **Photos are not read** — no provider key (above), or both providers are down (circuit breaker opens for 60 s
  after 3 failures).
- **A photo is sometimes not read on a free tier** — Groq's free per-minute limit for the vision model is reached
  after a few images in a row; with a working Gemini key the chain falls back to it, otherwise that image is skipped
  with a warning. For daily office use prefer Groq's Dev tier and Gemini Tier 1.
- **Docker Desktop fails to start on Windows** — a stale socket in `%LOCALAPPDATA%\Docker\run` or
  `%LOCALAPPDATA%\docker-secrets-engine` cannot be deleted (DECISIONS D-056, D-132, D-200): stop Docker Desktop, rename
  both folders and start it again (`scripts/dev-up.ps1 -FixDockerSocket` does the first one). The backend tests do not
  need Docker.
