# PROGRESS

Last update: 2026-09-15 — Faz 0 done.

## How to resume after a context reset
1. Read this file (especially **Where I am**), then `DECISIONS.md`, then `git log --oneline`.
2. The approved plan is mirrored in the phase list below; the spec is `claude-code-prompt-menu-asistani.md`.
3. Continue with the first unchecked item of the current phase. Never ask the user; log assumptions in DECISIONS.md.
4. At the end of each phase: lint/typecheck/test → update this file + DECISIONS.md → commit → 3-line summary.

## Phases
- [x] **Faz 0** — git init, `.gitignore`/`.gitattributes`, `docs/PROVIDER_NOTES.md`, DECISIONS, PROGRESS, README skeleton
- [ ] **Faz 1** — backend skeleton, Docker Compose, Drizzle schema + reversible migrations, health, auth, seed
      (12 cuisines + 40 templates, `source='seed'`), `pnpm db:export-seed`
- [ ] **Faz 2** — AI layer: provider interface, Gemini + Groq adapters, router, retry/circuit breaker,
      prompt templates, usage_log, smoke tests
- [ ] **Faz 3** — `/suggest` pipeline A→E, SSE, Redis cache, embedding jobs, Zod + repair, fixture e2e
- [ ] **Faz 4** — Flutter app: auth, home, camera + compression, results (copy/edit/accept), offline cache
- [ ] **Faz 5** — Mod 2 gap analysis (backend + Menü Tamamlama screen + call checklist)
- [ ] **Faz 6** — branches, template pool, settings, usage, CSV/JSON export, release APK signing, GitHub Actions
- [ ] **Faz 7** (optional) — Whisper voice note, Groq compound research mode

## Where I am
Faz 0 complete. Next: Faz 1 — create `backend/`, install deps (latest), schema + migrations, auth, seed.

## Environment facts (checked 2026-09-14)
- Windows 11 + PowerShell 5.1; node 24, pnpm 11, git 2.55, Flutter stable 3.47 / Dart 3.13, JDK 17, Android SDK.
- Docker Desktop installed but the daemon was **not running**; no Android device attached.
- `GEMINI_API_KEY` / `GROQ_API_KEY` not set → live smoke tests skip.

## Acceptance criteria status
| # | Criterion | Status |
|---|---|---|
| 1 | `docker compose up` brings up api + db + redis; `.env.example` complete | ⏳ |
| 2 | No provider key in Flutter (grep) | ⏳ |
| 3 | 40 seed items → `/suggest` with zero LLM calls | ⏳ |
| 4 | Photo → editable cards, first card < 6 s (15 items) | ⏳ |
| 5 | Mod 2: 12-item panel set read without duplicates, x/target, badges, call list, p95 < 8 s | ⏳ |
| 6 | Same item in two screenshots counted once | ⏳ |
| 7 | No TL amounts; `sets_base` correct | ⏳ |
| 8 | Descriptions ≤ 160 chars (schema-enforced) | ⏳ |
| 9 | Provider down → fallback keeps working | ⏳ |
| 10 | Broken JSON → item `needs_review`, request survives | ⏳ |
| 11 | Approved item served from DB on second query (`cache_hit=true`) | ⏳ |
| 12 | Release APK builds and runs on a real device | ⏳ |
| 13 | README: setup, VPS deploy, key acquisition, APK build | ⏳ |
| 14 | DECISIONS.md lists all assumptions | ⏳ (ongoing) |

## Pending verification by the user
- (filled in as phases complete)
