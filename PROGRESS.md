# PROGRESS

Last update: 2026-09-19 — anthracite redesign, fixes found with real AI keys, end-to-end run on the phone with keys,
share fixes, one-command office start and the production env generator.

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

## Where I am
Everything is committed. The production deploy is prepared but **not executed** (to be done together with the user,
see `docs/DEPLOY_MYSERVER.md`: `scripts/new-prod-env.ps1` → copy the env → nginx site → `scripts/deploy.ps1`). What is
left needs the user: the deploy, a release keystore (`mobile/scripts/create-keystore.ps1`), and — for daily use —
paid API tiers (free tiers work but "İnternette araştır" cannot run on them, D-142).
Ideas not built: research results as extra "var mı?" lines in the gap checklist; a Gemini fallback for voice notes;
on-device OCR (ML Kit) to read screenshots without AI keys; keeping drafts across process death; an iOS Share
Extension.

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
| 3 | 40 seed items → `/suggest` with zero LLM calls | ✅ e2e (`llmCalls=0`, usage_log unchanged, cache_hit) |
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
| 14 | DECISIONS.md lists all assumptions | ✅ D-001 … D-130 |

## Pending verification by the user
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
