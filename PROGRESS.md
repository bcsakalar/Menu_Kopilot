# PROGRESS

Last update: 2026-09-15 — Faz 1 done.

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
- [ ] **Faz 2** — AI layer: provider interface, Gemini + Groq adapters, router, retry/circuit breaker,
      prompt templates repo, usage_log, smoke tests
- [ ] **Faz 3** — `/suggest` pipeline A→E, SSE, Redis cache, embedding jobs, Zod + repair, fixture e2e
- [ ] **Faz 4** — Flutter app: auth, home, camera + compression, results (copy/edit/accept), offline cache
- [ ] **Faz 5** — Mod 2 gap analysis (backend + Menü Tamamlama screen + call checklist)
- [ ] **Faz 6** — branches, template pool, settings, usage, CSV/JSON export, release APK signing, GitHub Actions
- [ ] **Faz 7** (optional) — Whisper voice note, Groq compound research mode

## Where I am
Faz 1 complete. Next: Faz 2 — `backend/src/ai/` (types, json-schema sanitizers, Gemini/Groq providers, rate-limit,
circuit breaker, router, prompt repository, budget, usage/quota) + settings/prompts routes + tests + smoke tests.
`src/config/models.ts` (catalog + DEFAULT_ROUTES) and the prompt seed (`src/db/seed/prompts.ts`) already exist.

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
| 2 | No provider key in Flutter (grep) | ⏳ |
| 3 | 40 seed items → `/suggest` with zero LLM calls | ⏳ (seed done) |
| 4 | Photo → editable cards, first card < 6 s (15 items) | ⏳ |
| 5 | Mod 2: 12-item panel set read without duplicates, x/target, badges, call list, p95 < 8 s | ⏳ |
| 6 | Same item in two screenshots counted once | ⏳ |
| 7 | No TL amounts; `sets_base` correct | ◐ schema + seed enforced; pipeline pending |
| 8 | Descriptions ≤ 160 chars (schema-enforced) | ◐ Zod + DB CHECK done; pipeline pending |
| 9 | Provider down → fallback keeps working | ⏳ |
| 10 | Broken JSON → item `needs_review`, request survives | ⏳ |
| 11 | Approved item served from DB on second query (`cache_hit=true`) | ⏳ |
| 12 | Release APK builds and runs on a real device | ⏳ |
| 13 | README: setup, VPS deploy, key acquisition, APK build | ⏳ |
| 14 | DECISIONS.md lists all assumptions | ◐ ongoing |

## Pending verification by the user
- Fix Docker Desktop (D-056), then from the repo root: `docker compose up -d --build` and open
  `http://localhost:3000/health/ready` (expects `{"status":"ready"}`) and `http://localhost:3000/docs`.
- Review `backend/exports/seed-templates.csv` (regenerate with `pnpm db:export-seed --from=files`).
