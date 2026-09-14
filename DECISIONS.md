# DECISIONS

Every assumption / judgment call made while building Menü Kopilot. Newest at the bottom of each section.
Format: **D-NNN** — decision. *Why:* rationale. (Phase)

## Process & repo

- **D-001** — Monorepo without a package-manager workspace: `backend/` (standalone pnpm project), `mobile/`
  (Flutter), root holds `docker-compose.yml`, `deploy/`, `docs/`, `scripts/`, `.github/`. *Why:* only one Node
  package; keeps the Docker build context (`backend/`) and lockfile simple. (F0)
- **D-002** — Commits go straight to `main` (fresh repo, user asked for a commit per phase). Nothing is pushed,
  no GHCR image is published and nothing is deployed — those are outward-facing actions left to the user. (F0)
- **D-003** — The original task prompt (`claude-code-prompt-menu-asistani.md`) stays in the repo as the spec. (F0)
- **D-004** — Package versions are never pinned from memory: `pnpm add <pkg>` / `flutter pub add <pkg>` install
  latest, lockfiles pin. Exception: if latest violates a peer range, the newest version satisfying it (read from
  the registry at install time) is used and recorded here. (user decision, F0)
- **D-005** — Whisper voice notes + Groq `compound` research mode are Faz 7 (optional). The prompt mentions
  Whisper under "Faz 6" in section 0 but lists it under Faz 7 in section 6; section 6 wins. (F0)
- **D-006** — File contents (code, docs, DECISIONS/PROGRESS/README) are English; app UI strings are Turkish in a
  single l10n file; backend-generated Turkish texts (call questions) live in `backend/src/i18n/tr.ts`. (F0)

## Providers (see docs/PROVIDER_NOTES.md)

- **D-010** — Vision chain: `gemini-3.8-flash` → `qwen/qwen3.8-27b` (strict json_schema) →
  `qwen/qwen3.6-27b` (json_object). *Why:* qwen3.8 supports strict schemas; we send one image per call so its
  3-image cap is irrelevant; qwen3.6 kept as last resort as the prompt asked. Both qwen models are preview. (F0)
- **D-011** — Groq adapter uses native `fetch` instead of an SDK. *Why:* full control over rate-limit headers,
  timeouts, AbortSignal and retries (SDK retries would fight our router). Gemini uses `@google/genai` (spec). (F0)
- **D-012** — Every Gemini interaction is sent with `store: false`. *Why:* Interactions API stores by default
  (1 day free / 55 days paid); vendor menu data should not be retained. (F0)
- **D-013** — Embeddings: `gemini-embedding-2` @768 via `ai.models.embedContent`, one `Content` per text
  (plain arrays aggregate into one vector). Query prefix `task: search result | query: {x}`, document
  `title: {t} | text: {x}`; prefixes are prompt templates (versioned). The models page lists
  `gemini-embedding-2-preview` — default stays `gemini-embedding-2`, smoke test verifies. (F0)
- **D-014** — Extra task keys beyond the prompt's table: `vision.panel_extract` (Mod 2, same chain as
  `vision.menu_extract`), `text.gap_suggest` (flash-lite → gpt-oss-20b). `text.normalize_classify` is used to map
  unmatched names onto existing approved templates (canonicalization) and only runs when trigram "near-miss"
  candidates (0.30–0.72) exist — much cheaper than enrichment. `audio.transcribe` reserved for Faz 7. (F0)
- **D-015** — Provider JSON schemas are generated from Zod and sanitized per provider: Groq strict (all
  properties required, nullable via union, `additionalProperties:false`, no min/maxLength/pattern/format/bounds),
  Gemini (documented subset). Length/price rules are enforced by Zod + DB, not by providers. (F0)

## Data & domain

- **D-020** — Description ≤ 160 chars: Zod `.max(160)` + DB `varchar(160)` + CHECK. A sanitizer trims at a word
  boundary before validation so an over-long description does not cost a repair call. (F0)
- **D-021** — No prices anywhere: a price guard strips TL/₺/lira amounts from every generated string and a Zod
  refinement rejects leftovers. Photo `priceText` is kept only in the raw extraction record in the DB, never on
  cards or exports. (F0)
- **D-022** — `sets_base`: option groups named Boy/Porsiyon/Gramaj/Adet/Boyut are deterministically `sets_base`;
  at most one `sets_base` group per item (others fall back to `surcharge`). (F0)
- **D-023** — Seed templates: `approved=true, source='seed'` (`source` enum = `ai|user|imported|seed`). Cards show
  a separate purple "Hazır şablon" badge (DB'den green = user-approved, AI blue, İnceleme gerek orange).
  Accepting a seed card (edited or not) turns the template into `source='user'`. Re-seeding only updates rows
  still `source='seed'`. `pnpm db:export-seed` dumps seed templates to CSV for review (`--from=db|files`). (user decision, F0)
- **D-024** — `branch_menu_items` is the single branch-menu table: `ok|incomplete` = on the menu (from panel
  screenshots or accepted Mod 1 cards with a frozen payload), `missing` = recommended. `current_item_count =
  ok + incomplete`; target = `target_item_count ?? max(10, cuisine.min_item_count)` (null = automatic). (F0)
- **D-025** — Schema additions beyond the prompt: menu_items `allergen_notes, upsell_suggestion,
  importance (0–100 prior for "almost always on this cuisine's menu"), needs_review`; ingredients `price_hint`;
  devices `refresh_token_hash, revoked_at`; suggestion_runs `mode, llm_calls, pending_work, deep_mode, finished_at`;
  suggestion_items `source, status, normalized_name`; usage_log `task_key, run_id, latency_ms, success, error_code`;
  branch_menu_items `normalized_name, flags, payload, reason, source`. (F0)
- **D-026** — Naming: API JSON camelCase, DB snake_case, LLM schemas snake_case exactly as in the prompt; the
  validation stage maps between them. (F0)
- **D-027** — CSV exports: UTF-8 with BOM and `;` delimiter (Turkish Excel). (F0)
- **D-028** — `cost_estimate` stays null/0 unless a price table is configured; the Usage screen shows tokens. (F0)

## Pipeline

- **D-030** — Caching (Redis, 30-day TTL): (a) extraction per `image_sha256 + promptVersion`, (b) enrichment per
  `cuisine + normalized_name + promptVersion`, (c) run key `image_hashes + cuisine + prompt_hash` → parsed names.
  On a run-cache hit Stage B is re-run (DB-only, cheap) so newly approved templates are never shadowed by stale
  cached AI output. A run with zero LLM calls is logged `cache_hit=true`. (F0)
- **D-031** — Enrichment batches: first batch 3 items (fast first AI card), then ≤10 per call, max 2 in flight.
  Budget per request: 6 LLM calls / ~25k input tokens (query embeddings counted separately); on exhaustion the
  remaining work is stored in `suggestion_runs.pending_work` and the client gets `budget_exhausted` + a
  "Devam et" action (`POST /suggest/:runId/continue`; pending images are re-sent by the client — the server never
  stores images, only hashes). (F0)
- **D-032** — Run model: `POST /suggest` with `Accept: text/event-stream` streams SSE; `?async=1` returns 202 +
  runId (used by the offline queue); if the client disconnects the run continues server-side
  (`GET /suggest/:runId` snapshot); `POST /suggest/:runId/cancel` aborts in-flight provider calls. (F0)

## Infra

- **D-040** — Auth: single admin user created by the seed from env; no registration endpoint. Password hashing
  with `node:crypto` scrypt (no native builds). Access JWT (12 h) + rotating opaque refresh token stored hashed
  on the `devices` row. (F0)
- **D-041** — Tests run on PGlite (+ pgvector + pg_trgm) so they are hermetic (no Docker, no CI services).
  Cache and queue sit behind interfaces with in-memory/inline test implementations. Live provider smoke tests
  are skipped when keys are absent. (F0)
- **D-042** — Reversible migrations: drizzle-kit generates "up" SQL; each migration gets a hand-written
  `drizzle/down/<tag>.sql`; `pnpm db:rollback` applies the latest down; a test runs up → down → up. (F0)
- **D-043** — Redis runs with `maxmemory-policy noeviction` (BullMQ requirement); every cache key has a TTL. (F0)
- **D-044** — 1 GB droplet: memory limits in compose, small Postgres buffers, embedding worker runs inside the
  API process (`ROLE=all`), images are built locally/CI and pulled (never built on the droplet). (F0)
- **D-045** — The Android release keystore is not generated by the assistant: `mobile/scripts/create-keystore.ps1`
  creates it on the user's machine; without `key.properties` release builds fall back to debug signing; CI signs
  with repository secrets. (F0)

## Faz 1

- **D-046** — TypeScript is `~6.0.3`, not latest 7.x: typescript-eslint's peer range at install time was
  `>=4.8.4 <6.1.0` (D-004 exception). `@types/node` is `22.x` to match the Node 22 runtime of the Docker image
  (local dev runs Node 24, which is a superset). (F1)
- **D-047** — pnpm 11 blocks dependency build scripts: `backend/pnpm-workspace.yaml` → `allowBuilds`
  (`esbuild: true`, `msgpackr-extract: false` — msgpackr falls back to pure JS). (F1)
- **D-048** — `users.token_version` added (in JWT as `tv`); bumping it revokes every access token of the user.
  JWTs are HS256 with fixed `iss`/`aud`, verified on every request together with the device row. (F1)
- **D-049** — `suggestion_items.accepted` is the spec's tri-state (null = pending, true = accepted, false = skipped);
  no separate status column. `suggestion_items.source` = card origin (`seed|db|ai|review`). (F1)
- **D-050** — One approved and one draft template per (cuisine, normalized name):
  unique index `(cuisine_id, normalized_name, approved)`. (F1)
- **D-051** — Cuisines are seeded with `min_item_count = 10` and a note telling the user to enter the real number in
  settings; re-seeding never touches existing cuisine rows. Parent links: döner & pide-lahmacun → kebap-izgara,
  mantı-hamur-işleri → ev-yemekleri (used for retrieval priority). (F1)
- **D-052** — Seed templates carry an `importance` prior (0–100) used later to rank Mod 2 recommendations; it is
  editorial knowledge, not usage statistics (`usage_count` starts at 0). (F1)
- **D-053** — Prompt templates v1 are seeded from `src/db/seed/prompts.ts`; seeding activates a key only if it has no
  active version, so versions activated later via the API are never reverted. (F1)
- **D-054** — Empty env values (`JWT_SECRET=` copied from `.env.example`) are treated as unset; production refuses to
  boot with the dev JWT secret or dev admin password. `docker compose up` works without `.env` (development
  defaults) because compose only interpolates `NODE_ENV` default `development`. (F1)
- **D-055** — The api container applies migrations on start and runs the idempotent seed when `SEED_ON_START=true`
  (single instance, so no migration race). (F1)
- **D-056** — Docker verification is pending: Docker Desktop 4.87 crashed on start on this machine
  (`initializing Ingest server ... sailor-ingest.sock: The file cannot be accessed by the system`). The stale socket
  belongs to Docker Desktop's own state, so it was not deleted by the assistant; the crashed processes that the
  assistant started were stopped again. Fix on the user side: reboot, or quit Docker Desktop and delete
  `%LOCALAPPDATA%\Docker\run\sailor-ingest.sock`, then `docker compose up -d --build`. All tests run on PGlite. (F1)
