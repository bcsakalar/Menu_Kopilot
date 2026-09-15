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

## Faz 2

- **D-060** — `GeminiProvider` talks to the SDK through a thin `GeminiTransport` (the only file touching SDK types)
  so it can be tested with a fake. SDK errors are classified structurally (status / message / RetryInfo) because the
  SDK throws several unrelated error class families. (F2)
- **D-061** — All SDK-level retries are disabled (`maxRetries: 0` on interactions; `retryOptions.attempts: 1` on
  `embedContent`, whose default is 5 attempts). The router owns retry/backoff. (F2)
- **D-062** — Router policy per attempt: 429 asking ≤ 3 s → one same-provider retry (plus jitter), longer → cooldown
  of that provider:model and fallback; 5xx/network → one retry with full-jitter backoff, then fallback; timeout →
  immediate fallback (no retry on a slow provider); 401/403/missing key → provider tripped for 10 min; invalid
  output → returned to the caller for the single repair (no fallback). Circuit breaker is keyed per provider
  (3 consecutive failures → 60 s open → one half-open trial). (F2)
- **D-063** — Every provider attempt (success or failure) writes a `usage_log` row; the daily quota counts all attempts
  and their tokens (failed calls can cost too). Quota day = Europe/Istanbul midnight (`QUOTA_TIMEZONE`). (F2)
- **D-064** — Query/document embeddings are not charged to the 6-call per-request budget (they are cheap and needed
  for retrieval), but they are logged and count toward the daily quota. (F2)
- **D-065** — For JSON-mode-only models (qwen3.6) the router renders the `json.instructions` prompt template (DB) with
  the sanitized schema and passes it to the adapter. (F2)
- **D-066** — Gemini 3 has no temperature knob (`thinking_level` + `max_output_tokens` only). Groq calls use
  temperature 0.3 unless a route overrides it (0 is rejected by Groq's semantics, so values ≤ 0 fall back to 0.3). (F2)
- **D-067** — API DTOs carry dates as ISO strings (no `z.date()` in response schemas → clean OpenAPI output). (F2)
- **D-068** — "Model selection" in settings = pick the primary model of a task; the other chain entries stay as
  fallbacks in their existing order. Only capability-eligible models are accepted (vision tasks → vision models). (F2)
- **D-069** — Live smoke tests (`pnpm test:smoke`) read keys from `../.env` and skip without them; vision smoke tests
  also need the fixture images generated in Faz 3. (F2)

## Faz 3

- **D-070** — The spec's run-level cache (`image_hash + cuisine + prompt_hash`) is realised as the composition of
  per-stage caches: extraction per image hash, canonicalize decision per name + candidate set, enrichment per
  cuisine + name (all keyed with prompt versions, 30-day TTL). A repeated request makes zero external calls
  (`cache_hit=true`) while DB retrieval always runs first, so newly approved templates are never shadowed by stale
  cached AI output. Redis keys are namespaced `mk:x|c|e:…`. (F3)
- **D-071** — Only calls the model actually processed (success or invalid output) count toward the 6-call request
  budget; 5xx/429/timeouts are logged in `usage_log` but do not consume budget. (F3)
- **D-072** — Canonicalization only runs for names whose best trigram near miss scores ≥ 0.45 (candidates are collected
  from 0.30), and accepts a mapping at confidence ≥ 0.8. It never runs when fewer than 2 budget calls remain. (F3)
- **D-073** — Extraction items with confidence < 0.25 are dropped as noise; photo prices are kept only inside the stored
  extraction record (`suggestion_items.payload.extraction.priceText`), never in card DTOs or exports. (F3)
- **D-074** — Streaming order: prompt names are resolved first; each photo is retrieved as soon as it is read, so DB
  cards arrive right after the first extraction; enrichment runs after all photos (batches [3, 10, …], 2 in flight).
  An `extracted` event carries the names early so the app can show placeholders. (F3)
- **D-075** — A card with no description and no option groups cannot be accepted (prevents empty templates).
  Accepting a seed card turns it into `source='user'` even without edits (D-023); accepting an AI card approves its
  draft (`source='ai'`, or `'user'` if edited); name collisions with an existing approved template update that
  template instead. Aliases for the raw and final names are added; an embedding job is queued. (F3)
- **D-076** — Unknown items (model confidence < 0.5) keep whatever the model filled and get
  `reviewReason = "Bunu bilmiyorum, sen doldur."`; unparseable output after the single repair becomes an empty review
  card. When AI is unavailable (local-only/quota) unmatched names become review cards; when providers are down or the
  budget runs out they become `pending_work` for "Devam et". (F3)
- **D-077** — The embedding worker runs inside the API process (ROLE=all) with a BullMQ queue (`embeddings`,
  8 attempts, exponential backoff from 30 s) plus a 30-minute sweep for approved templates missing vectors; tests use
  an inline queue. Only approved templates are embedded (drafts never enter the vector index). (F3)
- **D-078** — Test fixtures: synthetic menu photos and panel screenshots are rendered by
  `scripts/generate-fixture-images.ps1` (System.Drawing, Windows) from `test/fixtures/images/menus.json`; LLM
  responses are hand-authored "recorded" fixtures (see `test/fixtures/llm/README.md`); `pnpm fixtures:record`
  re-records them with real keys into `*.recorded.json` for comparison. (F3)
- **D-079** — Cuisines got their full CRUD API early (`/api/v1/cuisines`) because the app's home screen needs the list;
  system cuisines keep their names but their minimum counts/notes are editable, user cuisines can be deleted when
  unused. Correlated sub-queries with Drizzle column interpolation lose table qualifiers, so counts use a grouped
  query instead. (F3/F4)

## Faz 4

- **D-080** — Flutter state: Riverpod 3 without code generation (manual `Notifier`/`AsyncNotifier` providers); models
  use hand-written `fromJson/toJson`; `build_runner` only for Drift. Generated files (`app_database.g.dart`,
  `lib/l10n/gen/*`) are committed so analysis/builds never depend on a generator step. (F4)
- **D-081** — Networking: Dio with a queued auth interceptor (one refresh on 401, request retried once, session
  cleared if refresh fails) and GET-only retries on network/5xx errors. `POST /suggest` is never retried
  automatically — offline requests go to the queue instead (no duplicate runs). Base URL is entered at login
  (default via `--dart-define=API_BASE_URL`). (F4)
- **D-082** — Offline: Drift tables `kv_entries`, `recent_runs` (last 30 snapshots readable offline), `pending_requests`
  (suggest/accept/skip; photos copied to the documents folder), `checklist_ticks`, `cached_templates`. The queue is
  flushed when connectivity returns and, on Android, by WorkManager every 15 min with a network constraint (works with
  the app closed). iOS flushes only while the app is open (native BG task registration left out). (F4)
- **D-083** — Leaving the results screen only stops listening; the server run continues. A history entry is written at
  `run` time, so reopening it loads the snapshot and polls while the run is still going. (F4)
- **D-084** — Photo compression: both `minWidth` and `minHeight` get the target short side so the long edge lands on
  1600 px in any orientation; JPEG quality 80 → 70 → 60 until ≤ 1.5 MB; EXIF (incl. GPS) stripped; dedupe by
  sha256. (F4)
- **D-085** — Editing: tapping a text field on a card opens a one-field sheet ("inline"); the full editor handles option
  groups and lists. Choosing `sets_base` for one option turns the whole group into the base-price group (single,
  required); the client normalizes before sending and the server validates again. (F4)
- **D-086** — Android: minSdk 24; cleartext HTTP only in debug builds (local backend); release uses HTTPS. Release
  signing from `android/key.properties` or `ANDROID_KEYSTORE_*` env vars, else the debug key. (F4)
- **D-087** — The Tamamla / Şubeler / Şablonlar tabs exist from Faz 4 as placeholders so navigation is final; they are
  implemented in Faz 5–6. (F4)
- **D-088** — Risk noted: `flutter build apk` warns that some plugins still apply the Kotlin Gradle Plugin the old
  way; a future Flutter/AGP release may turn this into an error. Mitigation: `flutter pub upgrade` of the plugins
  before upgrading Flutter; nothing to change in our code today. (F4)

## Faz 5 — Mod 2 gap analysis

- **D-089** — Panel extraction reads one screenshot per call (like Mod 1), cached per image hash + prompt versions
  (`mk:p:*`), with 3 screenshots in flight (Mod 1 uses 2). *Why:* the result is needed live during a call (p95 < 8 s);
  typical use is 2–3 screenshots → one round trip. Each item gets tri-state flags `present | absent | unknown` for
  description / options / removable ingredients; "unknown" = not visible on the screenshot, never guessed. (F5)
- **D-090** — Dedupe across screenshots: same normalized name → a clipped name that is a prefix of a longer one
  (marked with "…"/"..", or at most 3 characters shorter, min. 5 characters) → trigram ≥ 0.9. Flags merge by
  information (present > absent > unknown); the complete spelling wins over a clipped one. Rows below confidence 0.3
  are dropped. (F5)
- **D-091** — Completeness = description .40 + options .35 + removables .25, `unknown` = half, `ok` at ≥ 0.85. Fields
  the matched template does not have are not expected (e.g. Ayran has no removable ingredients) and the weights are
  re-normalized; unmatched items expect all three. (F5)
- **D-092** — Template matching in Mod 2 is exact → alias → trigram only (no vector search, no canonicalize call).
  *Why:* matching only tunes expectations and hides already-present items from the recommendations; zero extra tokens
  and latency beat the small recall gain during a call. (F5)
- **D-093** — Counts: `current` = union of the stored branch menu (ok/incomplete rows, e.g. cards accepted in Mod 1)
  and the screenshot items, deduplicated by normalized name (template links refined in D-111); `target` = branch override or
  max(10, cuisine minimum). Items removed from the panel stay on the stored menu until deleted in the branch screen
  (Faz 6). (F5)
- **D-094** — Recommendations: wanted = clamp(missing + 2, 3, 10). Approved templates of the same cuisine first, then
  parent/child/sibling cuisines, ordered by importance and usage, with a deterministic one-line reason (no LLM).
  `text.gap_suggest` is called only for the remainder; answers are cleaned (no prices), matched back to templates,
  dropped when already on the menu / already recommended (alias-aware), and cached per menu + prompt version. (F5)
- **D-095** — "Çağrıda sor" checklist is deterministic and capped at 15: missing items needed for the target (≤ 6,
  unfilled slots reserved for AI recommendations → `questions_append`), then one line per item with missing fields
  (least complete first; hints = base option group and removable ingredients of the matched template), then ≤ 2
  cuisine-wide questions from option groups recurring in ≥ 30 % of the cuisine's templates, then spare
  recommendations. Keys are stable across runs; the phone stores ticks per branch so they survive re-analysis. (F5)
- **D-096** — Persistence: every completed/partial analysis writes a `branch_menu_snapshots` row (the full result, so
  `GET /gap-analysis/:runId` and `/branches/:id/gap/latest` need no recomputation) and upserts screenshot items into
  `branch_menu_items` without losing an accepted Mod 1 payload; previous recommendations (status `missing`) are
  replaced. A run whose screenshots all failed is not persisted (the previous analysis stays "latest"). (F5)
- **D-097** — LOCAL_ONLY_MODE / quota exhausted in Mod 2: cached screenshots are still read (cache first), the rest is
  answered from the DB; no provider is ever called. (F5)
- **D-098** — Branch CRUD landed in Faz 5 (the gap flow needs a branch); every query is scoped by the signed-in user.
  Faz 6 adds the branch menu, export and the branch screens. (F5)
- **D-099** — Mobile: a recommendation or an incomplete item opens a single-item Mod 1 run linked to the branch
  (`/gap/card`), so accepting the card puts it on the branch menu. Suggestion results got one controller per tab
  (Riverpod family keyed by slot) so a card opened from the checklist does not replace the run shown in the Öneri tab.
  Gap analyses are not queued offline (useless after the call); the last result per branch is cached for offline
  reading. The result screen keeps the display on (wakelock) while open. (F5)
- **D-100** — `scripts/check-no-provider-keys.ps1` walks the tree itself and skips build folders without descending
  (Gradle transform paths exceed the Windows path limit). (F5)

## Faz 6 — branches, template pool, settings, usage, release

- **D-101** — Branch menu API: the stored menu (screenshot items, accepted cards, recommendations) grouped by status.
  `missingFields` come from the latest screenshot flags; fields the matched template does not have are stored as
  `n/a` and never reported. "Var" on the phone turns a recommendation into a menu item (`incomplete`, source
  `manual`). Export: CSV for Turkish Excel (BOM + `;`, Turkish headers, one row per product, content from the accepted
  card or else the matched template, never prices) and JSON; the file name comes from the branch name. (F6)
- **D-102** — CSV cells starting with `= + - @`, tab or CR get a leading apostrophe (CSV/formula injection), for every
  export including the seed review CSV. (F6)
- **D-103** — Template pool: any user edit makes the template `source='user'` (re-seeding never touches it).
  Deleting a seed template archives it (`approved=false`, `source='seed'`) and the seed skips archived seeds, so the
  `SEED_ON_START` of the next container start does not bring it back; restoring = `PATCH {approved:true}`. An
  unapproved AI draft with the same name gives way to a user-created or archived template (unique constraint).
  `sort=name` orders by the ASCII-folded name so Ç/İ/Ş names sort the same under any DB collation. The phone loads the
  approved pool (≤ 500) once, filters locally (instant, Turkish-insensitive search on names and aliases) and keeps a
  Drift copy for offline reading. (F6)
- **D-104** — Usage summary is per signed-in user: provider attempts from `usage_log` per model / task / error code,
  cache-hit ratio of runs, DB-hit ratio of cards and today's quota. No money estimate (no price table) — tokens are
  shown instead (plan decision 18). (F6)
- **D-105** — Settings: theme stored in the local key/value table and applied at startup; the per-task dropdown only
  offers the server's `eligibleModels` and sets the primary model (the rest of the chain stays as fallback); cuisine
  minimum counts and notes are editable, system cuisine names stay fixed. (F6)
- **D-106** — Navigation: "Kart hazırla" from a branch opens the Mod 1 card inside the Şubeler tab (third run
  controller slot); "Menü analizi" from a branch switches to the Tamamla tab with the branch preselected (one gap
  controller, no duplicated state). (F6)
- **D-107** — Release signing: `mobile/scripts/create-keystore.ps1` (run by the user) creates a PKCS12 upload key
  (RSA 4096, one password handed to keytool through an environment variable) and `android/key.properties` with an
  absolute forward-slash path; both are git-ignored. Local release builds without it use the debug key; the CI
  release job fails when the signing secrets are missing instead of publishing a debug-signed "release". Default
  output is a universal APK (~65 MB); `--split-per-abi` is documented. I did not generate the user's keystore. (F6)
- **D-108** — CI actions (latest majors checked with `gh api` on 2026-09-15): checkout v7, setup-node v7 (Node 22),
  pnpm/action-setup v6 with `version: 11` (package.json uses `devEngines`, not `packageManager`),
  subosito/flutter-action v2 (stable), setup-java v6 (Temurin 17), upload-artifact v7, docker login v4 / buildx v4 /
  metadata v6 / build-push v7. The API image is built for linux/amd64 only (DigitalOcean droplet). (F6)
- **D-109** — Production deploy = `deploy/docker-compose.prod.yml` (GHCR image, no build on the droplet,
  Postgres/Redis not published, json-file log rotation, secrets in `/etc/menu-kopilot/env` outside the deploy
  directory with mode 600) + `scripts/deploy.ps1` (uploads compose file and Caddyfile with LF, pull, up, waits for
  `/health/ready`). Docker's `restart: unless-stopped` + per-service memory limits take the role of a systemd unit.
  Nothing was pushed, published or deployed (D-002). (F6)
- **D-110** — The README privacy paragraph quotes the provider pages as checked on 2026-09-15 (Gemini API Additional
  Terms, last updated 2026-04-28: unpaid content used for product improvement + human review, "do not submit
  sensitive…"; Groq: no retention by default, up to 30 days for reliability/abuse logs unless Zero Data Retention). (F6)
- **D-111** — Product identity on the branch menu: the same normalized name is one product; different panel names
  are different products even when they match the same template (platform lists "Adana Dürüm" and "Adana Porsiyon"
  separately, both count toward the target); a Mod 1 card and a panel row under another name linked by the template
  are one product — the card row is renamed to the panel name during gap analysis, or the card is attached to the
  most similar panel row without a card when accepted later (`gap/menu-merge.ts`, `attachAcceptedCard`). This keeps
  `x / target` and `current_item_count` equal. (F6 review)

## Faz 7 — voice notes and web research (optional phase, done after "devam et")

- **D-112** — New task keys `audio.transcribe` (Groq `whisper-large-v3-turbo` → `whisper-large-v3`) and `research.web`
  (`groq/compound` with `web_search` + `visit_website` → `groq/compound-mini` with `web_search`). Both chains are
  Groq-only: no Gemini fallback (Gemini would need a different API shape for audio / search grounding). Settings list
  only audio models for voice and only compound systems for research (`kind` `audio` / `compound`), so compound can
  never become the model of a normal text task. (F7)
- **D-113** — Transcription is a separate router method (`AiRouter.transcribe`) with the same availability, breaker,
  cooldown and usage logging as generate; it is not charged to a request budget, and a rejected recording
  (bad_request / unsupported) is not retried on the next model. Usage rows log 0 input tokens (audio is billed per
  second) and the transcript's estimated tokens as output. (F7)
- **D-114** — `POST /transcribe` accepts one file ≤ the upload limit, recognized by magic bytes (m4a/mp4 audio, mp3,
  ogg, wav, webm, flac; HEIC-branded ftyp and AAC-ADTS rejected). The Whisper prompt is a DB template
  (`transcribe.vocabulary`) filled with up to 40 approved template names (the selected cuisine first) so dish names
  are spelled right and separated by commas. Price amounts are stripped from transcripts; results are cached per
  audio hash + prompt. The phone records AAC mono 16 kHz at 48 kbps (Whisper downsamples to 16 kHz mono anyway),
  stops at 90 s and deletes the file after upload. (F7)
- **D-115** — Dictation parsing: sentence ends (`letter + . ! ?`) now split items, and spoken fillers ("… da
  yapıyorlar", "satıyorlar", "varmış", "bizde …") are dropped. Typed prompts keep their behaviour. (F7)
- **D-116** — `POST /research` uses JSON Object Mode (compound has no strict schema) with the schema in the prompt and a
  lenient Zod envelope; one repair on invalid output; a separate request budget (2 calls / 250k input tokens) because
  web pages inflate the prompt. Output is scrubbed: prices, phone numbers and e-mail addresses removed
  (`lib/contact-guard.ts`), items de-duplicated and capped at 60, sources = real search results first
  (`executed_tools`), then the model's citations, http(s) only, ≤ 8. Items are matched to templates without vectors
  and, for a branch, marked on/off its menu. Cached 7 days per restaurant + city + cuisine + notes + prompt version;
  `refresh: true` searches again. (F7)
- **D-117** — Compound calls do not send `temperature` / reasoning parameters (not documented for compound); the
  `country` search setting is not used because its value format is undocumented — city and country go into the
  query text instead. To be confirmed by `pnpm test:smoke` with a real key. (F7)
- **D-118** — Mobile: the voice note button sits under the Mod 1 prompt (names appended as lines) and the gap notes
  (text appended); research lives in the Şubeler tab (`/branches/:id/research`) with "Kart hazırla" per missing item,
  one Mod 1 run for all missing items, sources opened in the browser (url_launcher, copy as fallback) and the last
  result kept on the phone. New plugins `record` and `url_launcher` (latest, pinned by `pubspec.lock`); Android
  `RECORD_AUDIO` + an https VIEW query; the iOS microphone text now describes voice notes. (F7)
