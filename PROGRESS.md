# PROGRESS

Last update: 2026-09-22 — the suggestion engine reworked after the user's phone test (D-171…D-173): two modes
("öneri versen yeter" / "hakikaten işimizi yapalım"), recommendations that fill up to the cuisine's minimum
instead of stopping at the category gaps, option and ingredient suggestions for every product — the ones read from
a photo included — and new products that carry their own options. Backend 545 tests, mobile 58, both clean.

## How to resume after a context reset
1. Read this file (especially **Where I am**), then `DECISIONS.md`, then `git log --oneline`.
2. The approved plan is mirrored in the phase list below; the spec is `claude-code-prompt-menu-asistani.md`.
3. Continue with the first unchecked item of the current phase. Never ask the user; log assumptions in DECISIONS.md.
4. At the end of each phase: lint/typecheck/test → update this file + DECISIONS.md → commit → 3-line summary.
5. Backend commands (PowerShell, from `backend/`): `pnpm exec vitest run`, `pnpm exec tsc -p tsconfig.json --noEmit`,
   `pnpm exec eslint .`, `pnpm exec tsc -p tsconfig.build.json`. Tests use PGlite — no Docker needed.

## Phases
- [x] **Faz 0** — git init, `.gitignore`/`.gitattributes`, `docs/PROVIDER_NOTES.md`, DECISIONS, PROGRESS, README skeleton
- [x] **Faz 1** — backend skeleton, Docker Compose, Drizzle schema + reversible migrations, health, auth, seed
      (12 cuisines + 40 templates, `source='seed'`), `pnpm db:export-seed`
- [x] **Faz 2** — AI layer: provider interface, Gemini + Groq adapters, router, retry/circuit breaker,
      prompt templates repo, usage_log, smoke tests
- [x] **Faz 3** — `/suggest` pipeline A→E, SSE, Redis cache, embedding jobs, Zod + repair, fixture e2e
- [x] **Faz 4** — Flutter app: auth, home, camera + compression, results (copy/edit/accept), offline cache
- [x] **Faz 5** — Mod 2 gap analysis (backend + Menü Tamamlama screen + call checklist)
- [x] **Faz 6** — branches, template pool, settings, usage, CSV/JSON export, release APK signing, GitHub Actions
- [x] **Faz 7** (optional) — Whisper voice note, Groq compound research mode
- [x] **Teslim** — live test (Docker stack + Galaxy S23 FE over USB), fixes, Mod 2 without screenshots, sharing
      into the app, icon/splash/login design, deploy files + runbook for `myserver`
- [x] **Redesign + real keys** — anthracite/paprika design system (Manrope, count meters, skeletons, action dock,
      haptics), vision routing after real-key measurements, device run with keys, share fixes, `scripts/dev-up.ps1`,
      `scripts/new-prod-env.ps1`
- [x] **FAZ 0–3 (2026-09-21)** — diagnosis (`docs/FAZ0_TESHIS.md`), Şubeler + research removed, Tamamla merged into
      one `/analyze` screen with sections A/B/C, agent pipeline with trace + debug screen, categories in Postgres and
      editable from the app, before/after measurement, report (`docs/FAZ3_RAPOR.md`)
- [ ] **FAZ 0–3 follow-up (user)** — compile + test the app (CI on a PR or a machine with Flutter), device walk-through
      with screenshots, a working Gemini key, commit + deploy (migration 0003 runs on start)

## Where I am
**2026-09-22 — suggestion engine rework (D-171…D-173).** The user's complaint on the 1.1.0 build was reproduced
first (local stack, real keys) and then fixed:

| Senaryo | Önce | Sonra |
| --- | --- | --- |
| El yazısı menü fotoğrafı (10 ürün okundu) | 0 opsiyon kartı, 3 yeni ürün | 10 opsiyon kartı, 8 yeni ürün (hepsi opsiyonlu) |
| 10 ürünlük menü, mutfak minimumu 30 | 3 yeni ürün + `target_unreachable` | 22 yeni ürün, kabul edilirse 32/30 |
| 5 ürünlük menü, mutfak minimumu 30 | 8 yeni ürün | 25 yeni ürün, 30/30 |
| "Yeter" modu (yeni) | — | 6 farklı kategoriden 6 ürün + 3 opsiyon kartı, ~1,5 sn |

New: `backend/src/agents/plan.ts` (modes + per-category quota, D'Hondt apportionment), `mode` on `POST /analyze`,
prompt versions that actually reach the database, option/ingredient data on section A cards, the mode selector on
the home screen and a fold-out "opsiyon ve malzemeler" block on new-product cards.

Then measured on **production** and fixed what only real providers show (D-174): recommendations go out in
batches of ~10, parallel batches start on different providers in the chain, a request carries its own attempt
timeout (11 s in full mode), the wire schemas are wider than a card so one bad item costs one card, and a
category's ceiling follows the cuisine's minimum. Production, kafe-icecek (minimum 50) with a 7-product menu:
36 new products, option cards for 7/7 products, 43/50 reachable, 19 s — from 12 products, `partial`, 33 s.
App 1.2.0+3 signed and installed on the phone over USB.

**2026-09-21 (later) — deployed:** pushed `57fe3ab..f2e12a2`, `scripts/deploy.ps1` → production on `f2e12a2`
(migration 0003 + seed ran; pre-deploy dump in `/opt/yedek`), production live check 15/15. APK
`MenuKopilot-1.1.0-arm64.apk` on the Desktop (new signing key: uninstall the 1.0.0 build first). Accounts:
`admin@example.com` (admin), `uzman@example.com` (uzman), `uzman2@example.com` (uzman) —
passwords handed over in Desktop notes. Gemini key rotated on production the same evening (D-170). Flutter
3.47.5 / Android SDK / JDK 17 now live in `%USERPROFILE%\dev` and `%LOCALAPPDATA%\Android\Sdk` on this PC.

**2026-09-21 — FAZ 0–3 done in the working tree, uncommitted.** Backend: 538 tests, lint + typecheck clean, the local
Docker stack runs the new code, `pnpm live:check` 14/15 (the one failure is a menu photo: the Gemini key is denied
with 403 and Groq's free vision tier caps output at 1000 tokens/minute — D-164). Quality (`pnpm compare`): new
products 0 % duplicates, category gap closure 1/11 → 10/11, ~3 s per analysis cold. Mobile: rewritten result screen,
settings for categories, offline queue fixes — checked statically only (D-162). Next steps are in **Pending
verification by the user** below.

**Before that (2026-09-18/19):**
**Production is live on myserver** (2026-09-18): `/opt/menu-kopilot` (git clone, read-only deploy key), API image
`menu-kopilot-api:<sha>` built on the PC, stack healthy behind nginx for `menu.example.com` (security headers,
rate limits, Cloudflare real IP), secrets in `/etc/menu-kopilot/env`, nightly `pg_dump` to `/opt/yedek`. Production
data: 27 cuisines aligned with the platform app, 316 seed templates, admin `admin@example.com` (password in the
desktop note). old-app was retired (stopped + archived; permanent removal steps in `docs/DEPLOY_MYSERVER.md`).
Signed release APK on the desktop (`MenuKopilot-1.0.0-arm64.apk`, key in `%USERPROFILE%\.android-keys\menu-kopilot\`).
Left for the user: the Cloudflare DNS record `menu` -> <SUNUCU_IP> (Proxied), uninstalling the old debug build on
the phone before installing the signed one, deleting the `old-app` DNS record, and paid API tiers for heavy use.
Update flow: commit -> `git push` -> `powershell -File scripts/deploy.ps1`.

### FAZ 0–3 inventory (2026-09-21)
- Backend new: `src/agents/` (six agents, prompts, schemas, tracer, dedupe, pipeline), `src/modules/analyze/`
  (`/analyze`, SSE, snapshot/latest/events/trace, accept/skip with merge semantics, `fromRunId` re-run),
  `src/domain/category.ts`, `src/db/schema/{categories,agents}.ts`, `src/db/seed/categories.ts`, migration
  `0003_agents_categories` (+ down), category API in `src/modules/cuisines/`, `scripts/{measure-quality,
  compare-quality,probe-recommender}.ts`, rewritten `scripts/live-check.ts`, frozen menus in `test/fixtures/menus/`.
- Backend removed: `modules/{branches,gap,suggest,research,export/branch-export}`, `lib/contact-guard.ts`, the
  branch schema, Groq compound, their tests and fixtures.
- Mobile: `data/models/analysis.dart`, `features/results/{analysis_controller,section_cards,results_screen,
  pipeline_debug_screen}.dart`, `features/settings/category_settings_screen.dart`, home = single input screen with
  recent analyses; removed `features/{branches,gap,research}`, `run_controller`, `suggestion_card`,
  `models/{branch,gap,suggestion}`; `models/voice_research.dart` → `transcription.dart`; l10n regenerated.
- Docs: `docs/FAZ0_TESHIS.md`, `docs/FAZ3_RAPOR.md`, `docs/SSE_EVENTS.md` (analysis contract), README, D-150…D-164.

### Delivery inventory (2026-09-18/19)
- Design: tokens + components in `mobile/lib/core/design/` (D-133…D-140), every screen moved over; 61 widget/unit tests,
  `flutter analyze` clean. Release APK `app-arm64-v8a-release.apk` (22.9 MB, arm64 only, debug-signed, no provider
  keys or endpoints inside — scanned).
- Real keys (`pnpm live:check --runs 5`, 14/14): Mod 1 photo → first card 3.8 s (15 cards); Mod 2 two screenshots →
  2.6 s; research → clear plan-limit error. Smoke 8 passed / 4 skipped on plan limits. Fixes: Gemini schema without
  `minItems`/`maxItems`, vision chain Flash-Lite → qwen3.8 (1000 tokens) → 3.8 Flash, qwen3.6 removed, migration 0002,
  route token caps, Groq 413 message, extra fallbacks (D-141, D-142). Backend tests → 292 passing.
- Phone (Galaxy S23 FE, release APK, keys on): Samsung HEIC shared from Gallery → Öneri → scan skeleton → 15 cards
  (12 DB, 3 AI, no prices); accept + haptics; text share → Öneri (4 DB cards, 0 AI calls); two panel screenshots shared
  one by one → one draft → Tamamla 12/10 with 2 typed products, 15-line checklist, DB recommendations → "Kart hazırla" →
  accept → 13/10 live; keyboard hides the dock; camera (one-time permission) → photo → removed unsent; CSV + JSON
  export open the share sheet; no crash/ANR in logcat, memory plateaus (PSS 302 → 313 MB over 7 runs, 1 activity).
  Bugs found and fixed: share crash on unreadable streams + one app copy per share (D-143), thumbnail delete
  semantics/hit area (D-144).
- Ops: `scripts/dev-up.ps1` (Docker incl. the `sailor-ingest.sock` recovery, stack, health, `adb reverse`),
  `scripts/new-prod-env.ps1` (random secrets, keys from `.env`, LF, no output of secrets); image has no secrets and
  runs as `app`; repo/APK secret scans clean.

### Delivery inventory (2026-09-16/17)
- Live test: `docker compose up -d --build` on this PC (API `127.0.0.1:3030`), `pnpm live:check` 13/13 without keys.
  Release APK on a Galaxy S23 FE (Android 16) over `adb reverse`: login, Öneri (7 DB cards, 0 LLM calls), accept →
  template became `source=user`, Tamamla with a new branch + 2 panel screenshots (no AI: count, warning, 12-line
  checklist, 10 DB recommendations, "Kart hazırla" → accept → branch 1/10), Şubeler (detail, CSV share sheet),
  Şablonlar (Turkish-insensitive search), Ayarlar (providers "anahtar yok", quota, usage). Bugs found → D-125/D-124.
- Backend: `not_configured` state + `AI_NOT_CONFIGURED` (D-124), `menuText` / typed products in gap analysis (D-127),
  `scripts/live-check.ts`, pnpm pin (D-119). Tests → 286 passing.
- Mobile: l10n error texts + typed failures (D-121), HEIC fallback + per-photo failures (D-122), HTTPS rule (D-123),
  device fixes (D-125), gap live sync (D-126), typed products UI (D-127), share intake (D-128), brand icon/splash/login
  + photo buttons (D-129). Tests → 52 passing, `flutter analyze` clean.
- Ops: compose API on loopback + Caddy profile, nginx site + proxy snippet, `scripts/deploy.ps1` (local image over
  ssh, rollback), `docs/DEPLOY_MYSERVER.md` (D-130).

### Faz 7 inventory
- Backend: `config/models.ts` (tasks `audio.transcribe`, `research.web`; whisper v3, compound, compound-mini),
  `ai/providers/groq.provider.ts` (`transcribe`, compound tools + `executed_tools` sources), `ai/router.ts`
  (`transcribe`), `ai/errors.ts` (`providerFailure`), `lib/{audio,contact-guard,uploads}.ts`, `modules/voice/*`
  (`POST /transcribe`), `modules/research/*` (`POST /research`), prompts `transcribe.vocabulary`, `research.system`,
  `research.user`, dictation-aware `suggest/prompt-parse.ts`. Tests `test/unit/voice-research.test.ts`,
  `test/e2e/voice-research.e2e.test.ts`, smoke tests for Whisper + compound → 279 passing.
- Mobile: `features/voice/{voice_recorder,voice_note_button}.dart` (home prompt + gap notes),
  `features/research/{research_controller,research_screen}.dart` (`/branches/:id/research`),
  `data/models/voice_research.dart`, API `transcribe` / `research`, packages `record`, `url_launcher`.
  Tests `test/widget/voice_research_test.dart` → 41 passing.

### Faz 6 inventory
- Backend: `modules/branches/service.ts` (+ menu, status change, delete item, export), `modules/export/branch-export.ts`,
  `modules/templates/{schemas,service,routes}.ts` (pool API; seed delete = archive), `modules/usage/*`
  (`GET /usage/summary`), `lib/csv.ts` (formula-injection guard), `lib/errors.ts` (`isUniqueViolation` through `cause`),
  seed skips archived seeds; `gap/menu-merge.ts` + `attachAcceptedCard` (a card and its panel row = one product,
  D-111). Tests `test/e2e/{templates,branch-menu}.e2e.test.ts`, `test/unit/csv.test.ts` → 261 passing.
- Mobile: `features/branches/{branches_screen,branch_detail_screen}.dart`, `features/templates/{template_pool,
  templates_screen}.dart`, `features/settings/{settings_screen,cuisine_settings_screen,model_settings_screen}.dart`,
  `features/usage/usage_screen.dart`, `core/utils/file_sharer.dart`, `data/models/{settings,template_item}.dart`,
  persisted theme (`app.dart`, `main.dart`). Tests `test/unit/pool_and_settings_test.dart`,
  `test/widget/branch_detail_screen_test.dart` → 37 passing, `flutter analyze` clean, `flutter build apk --release` OK
  (debug-signed without `key.properties`, 64.5 MB universal APK).
- Release/ops: `mobile/scripts/create-keystore.ps1`, `.github/workflows/{ci,release}.yml`, `deploy/docker-compose.prod.yml`,
  `scripts/deploy.ps1`, `scripts/check-no-provider-keys.ps1` (cross-platform path), README complete.

### Faz 5 inventory
- Backend `src/modules/gap/`: `schemas.ts` (panel item tri-state flags, DTOs, events), `dedupe.ts`,
  `completeness.ts`, `questions.ts`, `recommend.ts` (MenuIndex, DB + AI recommendations), `pipeline.ts`,
  `store.ts`, `service.ts`, `routes.ts`; `src/modules/branches/{schemas,service,routes}.ts` (CRUD) and
  `branch-menu.ts` (`upsertScreenshotItem`, `replaceRecommendations`); Turkish texts in `src/i18n/tr.ts` (`GAP_TEXT`).
- API: `POST /api/v1/gap-analysis` (SSE | `?async=1` | sync), `GET /gap-analysis/:runId`, `GET /gap-analysis/:runId/events`,
  `POST /gap-analysis/:runId/cancel`, `GET /branches/:id/gap/latest`, `GET/POST /branches`, `GET/PATCH/DELETE /branches/:id`.
  SSE contract in `docs/SSE_EVENTS.md`.
- Fixtures `test/fixtures/llm/panel/panel-{1,2}.json`; tests `test/unit/gap-helpers.test.ts`, `test/e2e/gap.e2e.test.ts`
  → backend 243 tests passing.
- Mobile: `data/models/{gap,branch}.dart`, `core/utils/wakelock.dart`, `features/gap/{gap_controller,gap_screen,
  gap_result_screen}.dart`, `features/branches/{branch_providers,branch_form}.dart`, routes `/gap`, `/gap/result`,
  `/gap/card`; run controller is now a family per tab slot. Tests `test/unit/gap_test.dart`,
  `test/widget/gap_result_screen_test.dart` → 27 passing, `flutter analyze` clean.

### Faz 4 inventory (mobile/)
- `lib/core/`: `providers.dart` (db, tokens, server URL, API client, auth, connectivity, cuisines, recent cuisines),
  `network/{api_client,api_exception,sse}.dart`, `storage/{app_database(.g),token_store}.dart`,
  `utils/{image_compressor,copy_format}.dart`, `widgets/common.dart`, `theme.dart`.
- `lib/data/models/{json,template_payload,suggestion,common}.dart`.
- `lib/features/`: `auth/login_screen.dart`, `home/{home_screen,home_controller,cuisine_picker}.dart`,
  `camera/camera_capture_screen.dart`, `results/{results_screen,run_controller,suggestion_card,card_editor_screen}.dart`,
  `offline/{pending_queue,background}.dart`, `settings/settings_screen.dart` (minimal), `shell/app_shell.dart`.
- `lib/router.dart`, `lib/app.dart`, `lib/main.dart`, `lib/l10n/app_tr.arb` (+ `gen/`).
- Tests: 19 passing (`test/unit/*`, `test/widget/*`); `flutter analyze` clean; `scripts/check-no-provider-keys.ps1` OK.

### Faz 3 inventory (backend/src)
- `modules/suggest/`: `schemas.ts` (LLM schemas, CardDto, RunDto, events), `prompt-parse.ts`, `sanitize.ts`,
  `canonicalize.ts`, `enrichment.ts`, `pipeline.ts`, `store.ts`, `run-registry.ts`, `service.ts` (start/continue/
  cancel/snapshot/accept/skip), `routes.ts`.
- `modules/retrieval/` (`retrieval.service.ts`, `cuisine-graph.ts`), `modules/extraction/vision-extractor.ts`,
  `modules/branches/branch-menu.ts`, `jobs/{embedding.service,queue}.ts`, `lib/{sse,uploads,images,trigram,clean-name,concurrency}.ts`.
- API: `POST /api/v1/suggest` (multipart/JSON; SSE | `?async=1` | sync), `GET /suggest/:runId`,
  `GET /suggest/:runId/events`, `POST /suggest/:runId/cancel`, `POST /suggest/:runId/continue`,
  `POST /suggestion-items/:id/accept|skip`. SSE contract: `docs/SSE_EVENTS.md`.
- Fixtures: `test/fixtures/images/*` (3 menus + 2 panels, generated), `test/fixtures/llm/*` (recorded stand-ins).
- Tests: 211 passing incl. `test/e2e/suggest.e2e.test.ts` (14 scenarios).

### Faz 2 inventory (backend/src/ai/)
- `types.ts` (LLMProvider — spec signature + optional extensions), `errors.ts` (ProviderError kinds),
  `json-schema.ts` (Zod→JSON Schema, `forGemini`, `forGroqStrict`), `rate-limit.ts` (headers, RetryInfo, cooldowns,
  backoff), `circuit-breaker.ts`, `budget.ts` (RequestBudget + token estimates), `usage.ts` (UsageLogger,
  QuotaService, startOfDay/Month), `prompt-repository.ts` (active prompt versions, render, admin ops),
  `route-repository.ts` (provider_configs chain + setPrimary), `router.ts` (AiRouter: generate / generateOnRoute /
  embed / availability), `index.ts` (createAiServices), `providers/{gemini,groq,shared}.ts`.
- API: `GET/PUT /api/v1/settings/providers[/:taskKey]`, `GET /api/v1/settings/quota`, `GET/POST /api/v1/prompts`,
  `POST /api/v1/prompts/:id/activate` (admin).
- Tests: 179 passing (+ `test/smoke/providers.smoke.test.ts`, skipped without keys). Test helpers:
  `test/helpers/fake-provider.ts` (FakeProvider, hashEmbedding), `test/helpers/test-app.ts` (createTestApp with fakes).

### Faz 1 inventory (backend/)
- `src/config/env.ts` (Zod env, only reader of process.env), `src/config/models.ts` (all model IDs + routes)
- `src/db/schema/*` (17 tables), `drizzle/0000_extensions.sql`, `drizzle/0001_init.sql`, `drizzle/down/*.sql`,
  `src/db/migrations.ts` (rollback), `src/db/client.ts` (driver-agnostic `Database` type)
- `src/domain/template.ts` (canonical template payload schema: ≤160 desc, no prices, sets_base rules)
- `src/lib/normalize-tr.ts`, `price-guard.ts`, `password.ts` (scrypt), `csv.ts`, `duration.ts`, `errors.ts`
- `src/modules/templates/template-store.ts` (insert/replace/load templates), `src/modules/export/template-csv.ts`
- `src/db/seed/*` (cuisines, 40 templates, prompts v1, provider routes, admin) + `run.ts`, `export-seed.ts`
- `src/app.ts` (Fastify + zod provider + swagger `/docs` + error envelope), `src/modules/auth/*`, `src/plugins/auth.ts`,
  `src/modules/health/routes.ts`, `src/server.ts`, `src/cache/*`
- Tests: `test/unit/*` (normalizeTr, price guard, env, seed data), `test/integration/*` (migrations round-trip,
  seed idempotency + CSV, auth API) — 141 passing.
- Root: `docker-compose.yml`, `deploy/Caddyfile`, `.env.example`, `backend/Dockerfile`.

## Environment facts (checked 2026-09-17)
- Windows 11 + PowerShell 5.1; node 24, pnpm 11.27, git 2.55, Flutter stable 3.47 / Dart 3.13, JDK 17, Android SDK.
- Docker Desktop worked on 2026-09-16 (stack verified) but crashed again on 2026-09-17 with the stale
  `sailor-ingest.sock` (D-056) — reboot or delete the socket file before `docker compose up -d`.
- Phone: Samsung Galaxy S23 FE (SM-S711B), Android 16; not attached on 2026-09-17.
- `GEMINI_API_KEY` / `GROQ_API_KEY` not set → AI paths answer with "AI anahtarı tanımlı değil"; smoke tests skip.
- `myserver`: nginx + Cloudflare in front of 6 apps, ports 3002/3006/3012/3013/3020 taken, ~680 MB RAM available +
  2 GB swap (2026-09-16).

## Acceptance criteria status
| # | Criterion | Status |
|---|---|---|
| 1 | `docker compose up` brings up api + db + redis; `.env.example` complete | ✅ 2026-09-16: stack up, migrations + seed on real Postgres/pgvector, `pnpm live:check` 13/13 |
| 2 | No provider key in Flutter (grep) | ✅ `scripts/check-no-provider-keys.ps1` (keys + provider endpoints) |
| 3 | Known products answered with zero LLM calls | ✅ e2e (`/analyze` with AI off answers all three sections from the pool; `/suggest` was merged into `/analyze`, D-152) |
| 4 | Photo → editable cards, first card < 6 s (15 items) | ◐ e2e: 15-item photo → 12 DB cards streamed before AI cards; real latency needs keys |
| 5 | Mod 2: 12-item panel set read without duplicates, x/target, badges, call list, p95 < 8 s | ◐ e2e: 2 screenshots → 12 unique, 12/14, badges, ≤ 15 questions, counts before recommendations, 2 LLM calls; real p95 needs keys |
| 6 | Same item in two screenshots counted once | ✅ unit + e2e (3 overlapping rows + clipped "Karışık Pi…" merged; `seenIn` = 2) |
| 7 | No TL amounts; `sets_base` correct | ✅ sanitizer + Zod refine + e2e (flawed fixtures fixed) |
| 8 | Descriptions ≤ 160 chars (schema-enforced) | ✅ Zod `.max(160)` + DB CHECK + clamp; e2e |
| 9 | Provider down → fallback keeps working | ✅ router tests + e2e (Gemini 503 → Groq vision; Groq key removed → Gemini enrich) |
| 10 | Broken JSON → item `needs_review`, request survives | ✅ e2e (one repair, then review cards, run completed) |
| 11 | Approved item served from DB on second query (`cache_hit=true`) | ✅ e2e (accept → exact DB hit, run.cache_hit=true) |
| 12 | Release APK builds and runs on a real device | ✅ release APK (debug-signed) exercised on a Galaxy S23 FE / Android 16 (all tabs); the newest build (icon, sharing, typed products) still to be installed; own signing key optional |
| 13 | README: setup, VPS deploy, key acquisition, APK build | ✅ README (+ privacy paragraph with sources, LOCAL_ONLY_MODE, SSE contract link) |
| 14 | DECISIONS.md lists all assumptions | ✅ D-001 … D-164 |
| 15 | FAZ 1: new products never already on the menu; sections A/B/C; pinned counter; < 15 s | ✅ backend (e2e + live: 0/26 duplicates, ~3 s cold); ◐ app screens checked statically, not yet compiled (D-162) |

## Pending verification by the user
**FAZ 0–3 (2026-09-21), in this order:**
- Compile and test the app: open a pull request (CI runs `flutter analyze`, `flutter test`, a debug APK) or, on a
  machine with Flutter: `cd mobile; flutter pub get; flutter analyze; flutter test`.
- Gemini: the key answers 403 "Your project has been denied access" — check the project in AI Studio / Google Cloud
  or create a key in a new project, then replace it in `.env` and `/etc/menu-kopilot/env` (D-164).
- Device walk-through with the phone on USB (`scripts/dev-up.ps1`, `flutter run`): panel screenshots → pinned
  counter, A/B/C, filter chips, bulk copy, accept moves the counter, cuisine re-run, Ayarlar → Kategoriler.
- Commit, push, `scripts/deploy.ps1` — migration 0003 drops the branch tables on production (a nightly dump exists;
  take a fresh one first), then `pnpm live:check --url https://menu.example.com`.

**Earlier items:**
- Docker Desktop: reboot (or quit it and delete `%LOCALAPPDATA%\Docker\run\sailor-ingest.sock`), then
  `docker compose up -d` in the repo root and `cd backend; pnpm live:check`.
- AI keys: put `GEMINI_API_KEY` / `GROQ_API_KEY` into `.env` (local) or `/etc/menu-kopilot/env` (server), then
  `cd backend; pnpm test:smoke` and `pnpm live:check` — the latter also times a menu photo (first card < 6 s) and the
  gap analysis p95 (< 8 s).
- Deploy together: `docs/DEPLOY_MYSERVER.md` (Cloudflare record `menu`, env file, nginx site, `scripts/deploy.ps1`).
- Phone: install the newest APK
  (`flutter build apk --release --split-per-abi --dart-define=API_BASE_URL=https://menu.example.com`), check
  the icon/splash, share a WhatsApp menu photo into the app, run Tamamla with typed products; with a Groq key dictate a
  voice note (microphone permission) and run "İnternette araştır".
- Review `backend/exports/seed-templates.csv` (regenerate with `pnpm db:export-seed --from=files`).
- Optional: own signing key (`mobile/scripts/create-keystore.ps1`), GitHub repository + release secrets.
