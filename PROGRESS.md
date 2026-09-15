# PROGRESS

Last update: 2026-09-15 — Faz 5 done.

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
- [ ] **Faz 6** — branches, template pool, settings, usage, CSV/JSON export, release APK signing, GitHub Actions
- [ ] **Faz 7** (optional) — Whisper voice note, Groq compound research mode

## Where I am
Faz 5 complete. Next: Faz 6, in this order:
1. Backend: `GET /branches/:id/menu` (items grouped by status), `DELETE /branches/:id/menu/:itemId`,
   `GET /branches/:id/export?format=csv|json` (accepted payloads, no prices, CSV = UTF-8 BOM + `;`);
   `modules/templates/` API (`GET /templates?q=&cuisineId=&source=&approved=&sort=usage|name|updated&limit&cursor`,
   `GET/PATCH/DELETE /templates/:id`, `POST /templates`; edits re-embed); `GET /usage/summary?range=today|month`
   (calls, per model, tokens, cache-hit and DB-hit ratio, errors) + e2e tests.
2. Flutter: Şubeler tab (list, create/edit via `features/branches/branch_form.dart`, delete, detail = menu + target
   override + export via share_plus), Şablonlar tab (search/filter/sort, edit with `CardEditorScreen`, delete,
   offline via `CachedTemplates`), Ayarlar (cuisines + min counts, task-based model dropdown from
   `/settings/providers`, quota, theme, server URL) and a Kullanım screen.
3. Release: `mobile/scripts/create-keystore.ps1`, `flutter build apk --release`, `.github/workflows/{ci,release}.yml`,
   README complete (setup, env, keys, 1 GB VPS deploy with the win-to-linux-deploy skill, APK signing, privacy +
   LOCAL_ONLY_MODE, AI disclaimer, SSE contract), acceptance table here. Commits per the plan.

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

## Environment facts (checked 2026-09-14/15)
- Windows 11 + PowerShell 5.1; node 24, pnpm 11, git 2.55, Flutter stable 3.47 / Dart 3.13, JDK 17, Android SDK.
- Docker Desktop crashes on start (stale `sailor-ingest.sock`, see D-056) → compose not verified yet.
- No Android device attached. `GEMINI_API_KEY` / `GROQ_API_KEY` not set → live smoke tests skip.

## Acceptance criteria status
| # | Criterion | Status |
|---|---|---|
| 1 | `docker compose up` brings up api + db + redis; `.env.example` complete | ⏳ files done, `.env.example` sync tested; run blocked by Docker Desktop (D-056) |
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
| 12 | Release APK builds and runs on a real device | ⏳ |
| 13 | README: setup, VPS deploy, key acquisition, APK build | ⏳ |
| 14 | DECISIONS.md lists all assumptions | ◐ ongoing |

## Pending verification by the user
- Fix Docker Desktop (D-056), then from the repo root: `docker compose up -d --build` and open
  `http://localhost:3000/health/ready` (expects `{"status":"ready"}`) and `http://localhost:3000/docs`.
- Review `backend/exports/seed-templates.csv` (regenerate with `pnpm db:export-seed --from=files`).
- Put `GEMINI_API_KEY` / `GROQ_API_KEY` in `.env`, then `cd backend; pnpm test:smoke` (verifies model IDs incl.
  `gemini-embedding-2`, strict schemas, vision).
