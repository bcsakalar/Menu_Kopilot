# DECISIONS

> **Türkçe not:** Bu dosya projedeki bütün kararların günlüğüdür. Eski kayıtlar İngilizce yazıldı; yeni kararlar Türkçe
> eklenebilir, numaralandırma D-213'ten devam eder. Telefon uygulaması dönemine ait belgeler
> (`docs/FAZ0_TESHIS.md`, `docs/FAZ3_RAPOR.md`, eski `PROGRESS.md`) `docs/arsiv/` klasörüne taşındı; ilk görev tanımı
> repodan çıkarıldı (D-203).

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
  are different products even when they match the same template (a panel lists "Adana Dürüm" and "Adana Porsiyon"
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

## Canlı test ve teslim (2026-09-16/17)

- **D-119** — pnpm is pinned to the exact installed version (11.27.0) in `devEngines`, the Dockerfile and CI: corepack
  in the image rejects version ranges, which broke `docker compose up --build`. Upgrades change all three together.
- **D-120** — `backend/scripts/live-check.ts` (`pnpm live:check`) drives a running server over HTTP (auth rotation,
  zero-LLM seed suggestions, SSE, branches, CSV bytes incl. BOM, templates, settings; with keys also latency targets
  and research). It is the acceptance check for a real deployment; it creates and deletes its own test branch.
  Local Docker: API on `127.0.0.1:3030` because 3000 is taken on this PC (`API_PORT` in `.env`).
- **D-121** — UI texts: every user-facing string is in `app_tr.arb`, including the copy formatter labels. Only messages
  that came from the server's error envelope are shown verbatim (`ApiException.fromServer`); network/gateway
  (502/503/504) errors, cancels and unknown failures use l10n texts via `apiErrorText`. Accept/skip return typed
  failures instead of magic strings.
- **D-122** — Photos: HEIC/HEIF (not readable by `image_size_getter`) is converted once to JPEG by
  `flutter_image_compress`, then scaled; a photo that still fails is counted and reported ("Fotoğraf küçültülemedi"),
  and no longer drops the rest of the batch.
- **D-123** — Release builds accept only `https://` server addresses, except `localhost`/`127.0.0.1` (USB testing via
  `adb reverse`). Reason: `dart:io` does not apply Android's `usesCleartextTraffic`, so the manifest flag alone did not
  protect the session token.
- **D-124** — No AI key at all is its own state: `AiRouter.availability()` and exhausted chains whose routes were all
  skipped for `not_configured` return `not_configured` (before: `unavailable`, which parked unknown products as
  pending "Devam et" work forever). Suggest answers from the DB and turns unknown products into review cards that say
  the key is missing; gap analysis warns once; voice notes and research return the new error code
  `AI_NOT_CONFIGURED` (409) naming the key to add.
- **D-125** — Found on the phone (Galaxy S23 FE, Android 16) and fixed: the results status bar squeezed its summary to
  zero width when work was pending (now two rows, with the server's reason); bottom sheets opened under the navigation
  bar (`useRootNavigator`); the keyboard could not be dismissed (tap outside unfocuses); the card footer pushed
  "Onayla" out of the card (wrapping footer, "Atla" no longer uses a trash icon); the "X var mı?" rows showed a (+)
  icon that looked like a button but only ticked the box (now a real "Kart hazırla" button).
- **D-126** — Gap screen live sync: after a card screen opened from the analysis closes (or on pull to refresh) the
  app re-reads the branch menu; the count moves, recommendations now on the menu show "Şube menüsüne eklendi" and their
  "… var mı?" question is ticked. The analysis itself is not re-run (no extra AI calls).
- **D-127** — Mod 2 without screenshots: `menuText` (typed/dictated) is parsed with the same LLM-free parser as Mod 1
  prompts. Typed products join after screenshot dedupe (same matching rules), count toward x/target, exclude themselves
  from recommendations, create no missing-field questions (their panel texts are unknown) and are shown in their own
  section. Stored as `manual` rows: inserted when new, a `missing` (recommended) row moves onto the menu, anything a
  screenshot or card already stored is left alone. The voice note on the Tamamla tab now fills this list.
- **D-128** — Sharing into the app (`receive_sharing_intent`, latest): Android intent filters for `image/*` (single and
  multiple) and `text/plain`. A bottom sheet asks where it goes: menu photos → Öneri, panel screenshots → Tamamla,
  text → Öneri prompt or Tamamla product list. The listener lives in the signed-in shell, so a share that opens the app
  waits for login. iOS needs a Share Extension target (Xcode, not possible on Windows) — Android only for now.
  The plugin is compiled against API 37 and its AAR metadata requires the app to compile against 37 as well, so
  `compileSdk = maxOf(flutter.compileSdkVersion, 37)` (targetSdk unchanged); `flutter build apk` caught this, analyze
  and tests do not.
- **D-129** — Brand: paprika `#C2410C` (the theme seed) with a white menu card + amber sparkle. Android adaptive vector
  icon with a monochrome layer (themed icons), legacy/iOS PNGs rendered by `mobile/scripts/generate-app-icons.ps1`
  (System.Drawing, same geometry), native splash in the brand color (incl. Android 12+ `windowSplashScreen*`), and a
  `BrandMark` CustomPainter for the in-app splash and login. Login collapses a prefilled server address to one line.
- **D-130** — Production on `myserver` runs next to other apps: the compose file publishes the API on
  `127.0.0.1:${API_PORT:-3030}` only and Caddy moved behind `--profile caddy` (fresh droplets). nginx site
  `deploy/nginx/menu-kopilot.conf` follows the server's pattern (Cloudflare origin certificate, shared
  `ssl-params`/`cloudflare-realip` snippets, `mk_` zone prefix), overwrites `X-Forwarded-For` with the real IP (no
  client-supplied values reach the login rate limit), disables buffering for SSE and hides `/docs`.
  `scripts/deploy.ps1` builds the image on the PC (`linux/amd64`), copies it with Windows' `tar.exe` + scp (no
  registry), strips CR from the server env file, supports `-SkipBuild -Tag` rollbacks. Runbook:
  `docs/DEPLOY_MYSERVER.md`. Nothing was changed on the server by the assistant.
- **D-131** — Embedding jobs do not burn their 8 retries when the failure waits for a configuration change
  (`not_configured`, `local_only`, `quota_exceeded`, `auth`): the job completes with `retryable: false` and the
  30-minute sweeper embeds those templates once a key is added. Provider outages still retry with backoff.

## Tasarım yenilemesi ve ofis teslimi (2026-09-18)

- **D-132** — Docker Desktop's stale `sailor-ingest.sock` (D-056) is an AF_UNIX reparse point that neither
  `Remove-Item` nor `del` can delete ("The file cannot be accessed by the system"). Working fix, with Docker Desktop
  fully stopped: rename `%LOCALAPPDATA%\Docker\run` to `run.stale-<timestamp>` (only runtime sockets live there;
  Docker recreates the folder) and start Docker again — up in 20 s. Reversible; the stale folder can be deleted after
  a reboot.
- **D-133** — Design system (user request: no generic "AI" look). Tokens in `core/design/tokens.dart` as a
  `ThemeExtension` (`context.palette`): anthracite canvas `#0E1116`, surfaces separated by 1 px hairlines instead of
  shadows or tinted fills, paprika `#C2410C` for primary actions (white label ≥ 5:1), light paprika for text on dark,
  amber for counts, green/red for state. Every text role is checked for WCAG AA on canvas and cards in a test. The
  Material 3 `fromSeed` tonal palette is gone (it produced the generic look); `ColorScheme` is built from the tokens and
  `surfaceTint` is transparent. Default theme is dark; "Sistem"/"Açık" remain in Ayarlar.
- **D-134** — Typography: Manrope (SIL OFL 1.1) bundled as five static weights (400–800, ~95 KB each) in
  `mobile/assets/fonts` with its license registered in `LicenseRegistry` — no runtime font fetching, works offline, no
  request to Google from the app. Counts use tabular figures (`tnum`) so "8 / 12" does not jitter. Turkish glyph
  coverage was verified against the notdef glyph.
- **D-135** — Origin badges change color (supersedes the spec's mor/yeşil/mavi/turuncu, at the user's request to drop
  purple/blue "AI" colors): Hazır şablon = neutral, DB'den = green, AI = amber ("check it"), İnceleme gerek = red. Labels
  and meaning are unchanged.
- **D-136** — Components: `AppCard`, `Pill`, `InlineNotice` (replaces `MaterialBanner`s and "⚠" lines), `Eyebrow`,
  `FieldRow`, `SurfaceGroup` (a `Material`, not a decorated box, so row ripples stay visible — a widget test caught
  the difference), `CountMeter` (one segment per product up to 24), `Shimmer`/`SkeletonCard`/`SkeletonList` and a
  `ScanSkeleton` for menu/panel reading, `ActionDock` + `DockButton`. Spinners remain only inside buttons.
- **D-137** — Input screens (Öneri, Tamamla) put camera, gallery, voice note and the primary action in a floating dock
  (`bottomNavigationBar` of the tab's scaffold, `extendBody`). Nested scaffolds hide the keyboard inset from their
  children, so the root `MaterialApp.builder` publishes `KeyboardVisibility`; the dock slides away and ignores taps
  while the keyboard is open, so it never covers the field being typed in. FABs are gone (branches and cuisines get an
  app-bar action, the camera a custom shutter); sparkle icons are gone from the navigation and buttons.
- **D-138** — Product cards fold their details: name, origin, description (3 lines) and a portion/serving line stay
  visible; option groups, ingredients, tags, allergens and upsell open under "Detaylar" (with counts). The footer is
  one row — copy on the left, Atla/Düzenle, then "Onayla" at the right edge (thumb reach); `Wrap` fallback removed.
- **D-139** — Haptics through `HapticFeedback` (no vibrate permission): medium impact on accept, selection click on
  skip / checklist tick / tab change / photo added, light impact when the first cards of a run arrive and when the
  branch count moves during a call, heavy impact on failures.
- **D-140** — Native splash: anthracite background with the mark on a paprika tile (pre-31 layer-list; Android 12+
  `windowSplashScreenIconBackgroundColor`); the window background behind Flutter is anthracite too, so there is no
  white flash between splash and first frame.

- **D-141** — Vision after the first runs with real keys: the Interactions API answers "400 Request contains an invalid
  argument" when a response schema has `minItems`/`maxItems`, so `forGemini()` drops them (Zod still enforces the
  caps). Gemini 3.5 Flash-Lite reads the 15-item test menu in ~3 s and a panel screenshot in ~2 s; 3.8 Flash needed
  13–20 s or answered 503/429. New vision chain: Flash-Lite → qwen3.8 (strict) → 3.8 Flash. `qwen/qwen3.6-27b` is gone
  from Groq and is removed. Groq's free tier allows qwen3.8 1000 output tokens per minute and rejects a request that
  asks for more (413), so that route is capped at 1000. `params.maxOutputTokens` of a route is now a ceiling for the
  call (`outputTokenLimit`), also when a caller asks for more. Migration `0002_vision_routes` (with down) moves
  existing databases; it only touches databases that were already seeded, a fresh one gets the order from the seed.
  Live check with real keys: Mod 1 photo → first card 3.8 s, 15 cards; Mod 2, two screenshots → 2.6 s.
- **D-142** — Free API tiers, measured: Gemini 3.8 Flash allows 20 requests a day; Groq gpt-oss 8K tokens/minute and
  1K requests/day; Gemini's Google Search tool answers 429 on the free key; Groq compound's own follow-up calls exceed
  the free per-minute limits (413 "Request Entity Too Large", 429 on the internal llama model). So "internetten
  araştır" does not work on free tiers with either provider. A 413 from Groq stays `bad_request` (waiting does not
  help, the chain moves on) with a message that names the limit, and the API answers `PROVIDER_UNAVAILABLE` "… bu AI
  planında yapılamıyor: istek sağlayıcının dakikalık token sınırını aşıyor" instead of a vague rejection. No Gemini
  search fallback was added: it could not be verified on this key. Chains that ended on 3.8 Flash get a fallback with
  a larger daily quota (`text.item_enrich` → Flash-Lite, `deep.analyze` → gpt-oss-120b reasoning high), appended at the
  end so the start-up seed adds them to existing databases without reordering a user's choice. Smoke tests skip
  (with the provider's reason) on plan limits instead of failing. Daily office use should run on paid tiers (Groq Dev
  tier, Gemini Tier 1); the app works on free tiers but falls back more often.
- **D-143** — Found on the phone: a share whose sender did not grant read access (e.g. `am start … --eu
  EXTRA_STREAM content://media/…`, or a buggy app) made receive_sharing_intent throw a `SecurityException` on the main
  thread in `onNewIntent`/`onCreate`, killing the app. `MainActivity` now checks every shared stream with
  `openAssetFileDescriptor` before the plugin sees the intent, drops unreadable ones (with `EXTRA_MIME_TYPES` kept in
  step), turns a share left with nothing into a plain launch and shows a native toast (`res/values/strings.xml`, the
  only UI text outside the ARB: Flutter is not running yet). Second finding: with `launchMode="singleTop"` every share
  from the gallery opened a new copy of the app inside the gallery's task, so two screenshots shared one after the
  other landed in two separate drafts. `singleTask` (as the plugin's README advises) delivers each share to the running
  app; verified on the device: panel-1 and panel-2 shared separately → one draft with 2 screenshots.
- **D-144** — Photo thumbnails: the delete badge's `Semantics` merged into the list item's node (list items are
  semantics boundaries), so TalkBack announced the whole photo as "Sil" while only the 26 dp corner deleted. The badge
  is now its own node (`container: true`) with a 40 dp hit area around the unchanged 26 dp circle; a widget test in a
  horizontal list (as on the screens) fails without the fix.
- **D-145** — Office start and production env as scripts. `scripts/dev-up.ps1`: Docker engine → `docker compose up -d`
  → `/health/ready` → `adb reverse` for every phone; the port comes from `API_PORT` in `.env` (nothing else is read).
  The `sailor-ingest.sock` recovery (D-132) stops Docker Desktop, so it runs only with `-FixDockerSocket`, never on its
  own. The USB bridge dropped once during the device run (PC idle overnight) and the app sat on skeletons — rerunning
  the script is the documented fix. `scripts/new-prod-env.ps1` writes `.env.production` with RNG secrets (hex, so
  `POSTGRES_PASSWORD` is URL-safe inside `DATABASE_URL`), asks for the admin password with hidden input (or a
  `SecureString` parameter), copies the AI keys from `.env`, writes LF without a BOM, never prints a secret and refuses
  to overwrite. Values with spaces, quotes, `$`, `\`, `#` or backticks are rejected because compose reads the file both
  for interpolation (`--env-file`) and as the container's `env_file`. The output was checked with the API's own env
  schema in production mode.
- **D-146** — Production seed data (user request: "research, prepare cuisines and templates in detail"). Cuisines now
  mirror the kitchen categories food-ordering apps commonly use (Burger, Döner, Köfte, Steak, Tavuk, Kebap,
  Pizza, Tatlı, Mantı & Makarna, Salata & Sağlık, Dondurma, Kahvaltı, Ev Yemekleri, Pide & Lahmacun, Pastane & Fırın,
  Kahve & İçecek, Tost & Sandviç, Sokak Lezzetleri, Balık & Deniz Ürünleri, Uzak Doğu, Dünya Mutfağı, Börek, Çiğ Köfte,
  Meze, Çorba, Tantuni): 27 cuisines with parents chosen for recommendations (Köfte/Döner/Pide → Kebap, Çorba/Mantı →
  Ev Yemekleri, Dondurma → Tatlı, Tantuni → Sokak, Tost → Kahvaltı, Börek → Pastane, Meze → Balık) and notes that list
  the usual menu sections, the must-have products and what to ask. `min_item_count` stays 10 everywhere: real
  minimums differ from team to team (D-019 rule unchanged). Templates grew from 40 to 316 (5–17 per cuisine), all original text
  (no copied descriptions), no prices, validated by the same Zod schema; popular-order data (Yemeksepeti 2025 summary:
  döner, burger, pizza, kebap, lahmacun, mercimek çorbası, ayran) set the importance values. The same product may now
  be seeded in several cuisines (Ayran for kebap, çiğ köfte, ev yemekleri, sokak; Patates Kızartması for döner, burger,
  tavuk): recommendations only look at the branch's cuisine family, and matching already prefers the own cuisine. Rules
  enforced by tests: names unique within a cuisine, the same spelling across cuisines, no alias equal to any canonical
  name; `template()` drops aliases that normalize to the name or to an earlier alias. Option groups use the wording
  restaurant panels use ("İçecek Seçimi", "Ekmek Seçimi", "Sos Seçimi"; new factories for Menü, Adet, Gramaj, Pilav, Pişirme Şekli,
  Hamur, Süt, Şurup, Yan Ürün) and the checklist question map knows both old and new names. The seed refreshes a
  cuisine's notes only while they still hold an earlier seed's text (`LEGACY_NOTES`), so user-edited notes and minimums
  survive. Tests that relied on "unknown" fixture products (Humus, İçli Köfte, Şalgam, Kazandibi…) now delete those
  seeds the way a user would; the zero-LLM acceptance test covers all 316 templates cuisine by cuisine.
- **D-147** — Bug found while reworking those tests: `upsertDraft` reused any unapproved row with the same cuisine and
  name, which includes a seed the user deleted (archived: approved=false, source='seed'). An AI answer for that name
  rewrote it as an AI draft, the archive marker was lost and the next seed run inserted the deleted seed again. Only real
  AI drafts are refreshed now; an archived row is left as it is (accepting the card is what revives it). Covered by
  the fallback e2e test.
- **D-148** — Production on myserver (user request): the server runs a git clone in `/opt/menu-kopilot` (the server's
  convention for apps) pulled with a read-only, repository-scoped deploy key; the image is still built on the PC.
  `deploy.ps1` refuses to deploy a commit that is not on `origin/main`, pulls with `--ff-only`, and its health wait
  no longer dies on the expected "connection refused" (PowerShell 5.1 turned redirected stderr into a terminating
  error). old-app was retired as asked, but stopped and archived instead of deleted (a final dump, containers
  with `--restart=no`, nginx files and the project folder under `/opt/arsiv/`, its backup cron commented out): the
  assistant does not permanently delete data; the exact commands for a permanent removal are in the runbook. nginx for
  `menu.example.com` adds HSTS, nosniff, frame, referrer, permissions and CSP headers (the API sets none) on
  top of the existing TLS snippet, Cloudflare real-IP, rate limits and the `/docs` block; its `mk.error.log` is covered
  by the server's fail2ban `nginx-limit-req` jail. A daily `pg_dump` runs from `/etc/cron.d` into `/opt/yedek` (the
  server's backup folder), 14 days kept. The admin password was generated (20 characters, phone-friendly groups) and
  handed over in a file on the PC's desktop, never printed.
- **D-149** — Release signing key (supersedes "the assistant does not create the keystore", plan decision 20): the
  user asked for a signed APK. A PKCS12 RSA-4096 key (`CN=Menu Kopilot, O=bcsakalar, C=TR`, 10 000 days) was
  generated with a 28-character random password passed to keytool through an environment variable; the password is
  only in `key.properties` (git-ignored) and in a backup copy next to the `.jks` in
  `%USERPROFILE%\.android-keys\menu-kopilot\`. The office APK is arm64-only with `API_BASE_URL` set to production;
  `apksigner` verifies it (v2). A phone with the earlier debug-signed build must uninstall it first. Also: the
  generated env file quotes `ADMIN_NAME` (a name with a space broke `source` in a shell; compose was fine).

## FAZ 0–3 — one analysis screen and the agent pipeline (2026-09-21)

The user's brief: remove Şubeler, rebuild Öneri as three scannable sections for a live phone call, decide what to do
with Tamamla, and rebuild the AI as an auditable agent pipeline (< 15 s). Diagnosis: `docs/FAZ0_TESHIS.md`; report
with the before/after numbers: `docs/FAZ3_RAPOR.md`.

- **D-150** — Şubeler removed end to end: routes, service, schemas, the branch-menu merge, the branch CSV/JSON export,
  the mobile screens/providers/models, the nav tab and the tables (`branches`, `branch_menu_snapshots`,
  `branch_menu_items`, `suggestion_runs.branch_id`) in migration 0003. The down migration recreates the tables as
  empty structures — dropped rows cannot come back, so take a dump before rolling back. *Why:* the user no longer
  tracks branches; a half-removed feature would keep costing (queries, UI, tests). (F1)
- **D-151** — "İnternette araştır" removed with it (it only worked on a branch), and with it Groq `compound` support
  and `contact-guard`. Voice notes stay (they feed the analysis). *Why:* no branch → no research entry point; dead
  provider code is a maintenance and privacy liability. (F1)
- **D-152** — **Tamamla merged into Öneri** instead of rebuilt next to it: one endpoint `POST /analyze`, one result
  screen. *Why (FAZ 0):* both modes took the same input (panel screenshots, a menu photo or typed products) and the
  user had to pick a mode mid-call; Tamamla's valuable parts map one-to-one onto the new sections — its "eksik ürün"
  recommendations → A, missing option/removable badges → B, the call checklist → C — while its "x / hedef" count
  becomes the pinned header. Keeping two screens would have doubled the pipeline and the tests for no call-time gain.
- **D-153** — Pipeline: Extractor → Classifier → Gap Analyst → Product Recommender ∥ Option/Modifier → Validator
  (`backend/src/agents/`), one prompt file + one Zod schema per model agent (`agents/prompts`, `agents/schemas`),
  each step traced into `agent_steps` (duration, provider/model, tokens, calls; input/output only with `debug=true`).
  The Gap Analyst and the Validator are deterministic (counting and set subtraction do not need a model, and a model
  can get arithmetic wrong). The Validator checks schema, dedupe against the menu (normalizeTr + fuzzy via the
  template matcher), cuisine fit (category quotas) and the target in code; only when a model answer fails its schema
  does it ask once more on its own route (`agent.validate`, `generateChecked`). The Extractor keeps its per-image
  repair because the image has to be resent with it. (F1)
- **D-154** — Per-agent model routes (`provider_configs`, editable in Ayarlar → Görev bazlı modeller): mechanical
  steps on small models (extract: Flash-Lite → qwen3.8 → 3.8 Flash; classify: Flash-Lite → gpt-oss-20b), the
  recommendation on the strong one (gpt-oss-120b first). Attempt timeouts 6 s for the text agents and an 11 s deadline
  over the parallel recommender/option pair, after which the database answers ship. *Why:* 24.6 s was measured once
  before the deadline existed; with it the worst case stays inside the 15 s budget. (F1)
- **D-155** — Category taxonomy in Postgres, not in code: `menu_categories` (label, order, keywords) and
  `cuisine_categories` (which categories a cuisine needs, with a minimum each). Classification matches whole tokens
  ("su" never matches "Sütlaç"); a keyword with a space matches as a phrase ("sıcak çikolata"), so a precise keyword
  does not drag every "sıcak" product along. Editable from the app (Ayarlar → Kategoriler; Mutfak Türleri → ⋮ →
  Kategoriler ve min. sayılar) via `GET/PATCH /categories`, `GET/PUT /cuisines/:id/categories`. *Why:* the user
  asked to edit templates and minimums later without a deploy. (F1)
- **D-156** — The seed runs on every start (`SEED_ON_START=true`), so an edit must survive it: `menu_categories`
  rows edited by the user (`edited_by_user`) and cuisines whose category set the user changed
  (`categories_edited_by_user`) are left alone; everything else is refreshed. Seed templates are re-classified with
  the stored taxonomy on every seed and right after a keyword edit (`recategorizeTemplates`); a category that came
  from accepting a card stays. Both columns went into the still-unreleased migration 0003 (the local dev database got
  the same `ALTER`s by hand). (F1)
- **D-157** — Category quotas: the recommender asks for the larger of the product gap and the category "shape" gap,
  fills the open categories round-robin, and the Validator enforces "never more of a category than the menu is short
  of". *Why:* the old recommender answered a pide-only menu with six more pides (category gap closure 1/11). (F1)
- **D-158** — Accept semantics: a section A card writes its template (template-backed cards carry the full pool
  payload, so accepting unedited never thins a template out); a section B card MERGES into the product's template
  (same-name groups replaced, a single base-price group, ingredient lists unioned, description and tags kept); a
  section C card is only ticked. An option card is titled with the panel spelling (`targetName`, what the user looks
  for on the call) and carries the pool spelling as `name`; accepting stores the panel spelling as an alias.
  *Why:* the first version overwrote seed templates with an option-only payload (found by a test, fixed, guarded by
  a mutation-checked test). (F1)
- **D-159** — A section A card may show an estimated price range (`priceRangeHint`, e.g. "25–40 TL") because the user
  asked for it as a talking point; it is never written into a template (`toPayload` strips amounts, the live check
  asserts no amount in any payload). This narrows the earlier "no TL amount anywhere" rule to "no TL amount in the
  template pool". (F1)
- **D-160** — Classifier override: the user's pick always wins; when the Classifier disagrees the phone offers a
  one-tap re-run, and the cuisine on the pinned header can be changed any time. The re-run sends `fromRunId`: the
  server reuses the stored product list (`suggestion_runs.menu_snapshot.extracted`), skips the Extractor (traced as
  `skipped`) and answers in ~2.5 s with no vision call — the empty-description / missing-option evidence carries
  over. (F1)
- **D-161** — Result screen: the progress strip and the filter chips are pinned outside the scroll view; each section
  is a `SliverMainAxisGroup` whose header sticks only while that section is on screen (three pinned headers stacked
  up to 168 px before); "Hepsini seç" selects one section; decided cards leave the bulk selection; a re-attached
  stream (app restarted mid-run) keeps the decisions made since and shows each warning once. Home shows the recent
  analyses again. (F1)
- **D-162** — Mobile could not be compiled here (no Flutter/Android SDK on this machine, the phone not visible on USB;
  installing an SDK needs downloads and licence acceptance, which were not authorised). Substitute: static checks
  written for this refactor — import reachability (including `part` files and `Type.member` statics), l10n
  keys/arity, and a stand-in for `flutter gen-l10n` that reproduces the checked-in format. They found and fixed real
  compile errors: `showFieldEditor` defined only in a deleted file, `AppDatabase.forTesting` (does not exist), missing
  test imports. Widget/unit tests were written for the new screens but not run; CI (`ci.yml`) runs `flutter analyze`,
  `flutter test` and a debug APK build on every pull request — the first real compile. (F2)
- **D-163** — Measuring quality: four frozen menus (`backend/test/fixtures/menus/`: pideci, kebapçı, kafe, tatlıcı)
  and a frozen judge (`scripts/measure-quality.ts`: duplicate of the menu, irrelevant to the cuisine, directly usable,
  category coverage, time) run against the live stack before and after; `pnpm compare` prints the table. The judge
  was not changed after seeing results; where it misjudged (its own keyword copy lacks "kek"; option cards titled with
  the pool spelling before D-158) the report says so instead of re-scoring. (F0/F2)
- **D-164** — Findings on 2026-09-21 that are environment, not code: the Gemini key answers 403 `PERMISSION_DENIED`
  ("Your project has been denied access") since the morning — it worked the night before — so every chain runs on
  Groq; Groq's free tier caps qwen3.8 vision at 1000 output tokens per minute, which a 15-item menu photo exceeds
  (first attempt cut at exactly 1000 tokens, the retry rate-limited). Panel screenshots are read; large menu photos
  need a working Gemini key (first in the vision chain) or Groq's Dev tier. (F2)
- **D-165** — Per-analysis budget: the configured `REQUEST_MAX_LLM_CALLS` / `REQUEST_MAX_INPUT_TOKENS` is what the
  agents may spend; each image adds one call and 4 000 input tokens on top. *Why:* with one shared budget of six, five
  panel screenshots used five calls, the Classifier the sixth, and the option/recommendation agents were refused —
  the biggest menus got database answers only. Found while writing the report; covered by an e2e test that fails
  without the fix. (F2)
- **D-166** — New release signing key (user decision, 2026-09-21): the 2026-09-18 key (D-149) is on another PC
  (`key.properties` pointed at `C:/Users/<user>/...`, which does not exist here) and the user chose a new key over
  fetching it. PKCS12 RSA-4096, `CN=Menu Kopilot, O=bcsakalar, C=TR`, 10 000 days, 32-character random
  password passed to keytool through an environment variable, stored only in `key.properties` (git-ignored) and a
  copy next to the `.jks` in `%USERPROFILE%\.android-keys\menu-kopilot\`. The old `key.properties` (the old
  key's password) is kept there as `old-key.properties` in case the old `.jks` turns up. Consequence: the
  phone uninstalls the 1.0.0 build once (local history and offline queue go; server data stays). App version 1.1.0+2.
- **D-167** — The first real compile of the FAZ 1 mobile code (Flutter 3.47.5 installed on this PC with the user's
  permission) found what the static checks could not: nullable `fold` results in the debug screen (type errors), two
  unused imports, and three layout faults the widget tests exposed — a long option pill ("Çift Kişilik · tabanı
  belirler") overflowing its card, the "X olarak yeniden analiz et" button not fitting next to its notice, and the
  card's action row overflowing on a 360 dp phone. Fixed: `Pill` shortens its label with "…" in a bounded row,
  `InlineNotice` puts its action under the text, the secondary card actions wrap while "Ekle" stays right. Also: the
  re-run no longer waits for a haptic before starting (a slow or missing haptic blocked it). `flutter analyze`
  clean, 56/56 tests. (F2)
- **D-168** — A second account (user request): `node dist/db/seed/add-user.js` (`pnpm user:add`) opens an account
  with the password read from stdin — never from the command line — and never overwrites an existing e-mail. There
  is still no sign-up endpoint (D-040). Opened `uzman@example.com`, role `uzman` (everything but prompt
  versioning); the password was generated on the PC, piped to the server, and handed over in a Desktop note.
- **D-169** — Production deploy of FAZ 0–3 (2026-09-21, `4f693e9`) after a fresh pre-migration dump; the
  post-deploy live check with the new account passed 15/15, the menu photo included — the Gemini key that answers
  403 (D-164) is only the one in this PC's local `.env`; production's key works.
- **D-170** — 2026-09-21, user request: the Gemini key rotated on production from the local `.env` (only the
  provider keys travel, as in `scripts/new-prod-env.ps1`; the Groq key was already identical). Checked first on the
  local stack (a menu photo read by gemini-3.5-flash-lite), then from inside the production API container (Gemini
  answers 200). The value went over ssh stdin into an environment variable, never a command line; the previous env
  file is kept as `/etc/menu-kopilot/env.bak-2026-09-21-193619`. The whole stack was then recreated (volumes kept).
  A third account: `uzman2@example.com` (role `uzman`) — the request said "uzman2@example", which
  is not a valid e-mail, so `.com` was added; password in a Desktop note.

- **D-171** — 2026-09-22, the user tested the 1.1.0 build on the phone and the answer was too thin: "ne ürün
  öneriyor ne opsiyon". Measured against the local stack with real keys before touching anything: a handwritten
  menu photo (10 products read) produced **0 option cards** and 3 new products; the same 10-product menu in a
  cuisine whose minimum is 30 produced **3** new products and `target_unreachable`. Three causes, all in the
  pipeline's arithmetic, none in the models:
  1. `needOptions` only took products whose panel option field was *empty* (`absent`). A menu photo has no panel
     fields, so every product came back `unknown` and section B stayed empty. Now every product whose options are
     not known to exist is a candidate, richest-first (pool-backed ones first: those cost no model call).
  2. The recommendation count was capped by the sum of the per-category gaps and by a hard 12. A 10-product menu
     in a 30-product cuisine is 20 products short while its categories are only ~7 short, so it could never be
     filled. The new `src/agents/plan.ts` hands out a per-category quota that first closes the gaps and then keeps
     going — proportionally to what the cuisine expects of each category (D'Hondt) — until the menu would reach the
     opening target. Combos (`menu-kampanya`) weigh almost nothing, so they are the last resort the user asked for.
  3. Section A cards carried no options at all, so a suggested product reached the phone as a name and a sentence.
     The recommender now asks for 1–2 option groups and the ingredient lists in the same call (no extra round
     trip); pool-backed products keep using the curated template. The Validator normalizes a group's arithmetic
     (single ⇒ maxSelect 1, required ⇔ minSelect ≥ 1, a base-price group is single/required/base throughout)
     instead of dropping a nearly-right group, and falls back to the plain payload rather than losing the product.
- **D-172** — Two modes on `/analyze` (`mode=quick|full`, default `full`), the user's "checkboxlı biriyle biri":
  *quick* = one product per category across five or six categories plus 3 option cards, inside the 15 s promise;
  *full* = fill to the cuisine's opening minimum (up to 40 products) with options for up to 24 menu products,
  batched 6 per model call, under a 26 s deadline and a budget of +4 calls / +15 k tokens. The phone sends the
  choice with every run, offline queue and cuisine re-run included. Measured after the change (local stack, real
  keys): 10 products in a 30-product cuisine → **22** new products (all with options) and 10 option cards, 32/30
  reachable; 5 products → 25 and 30/30; the handwritten photo → 8 new products and **10** option cards (was 0).
- **D-173** — Seeded prompts are versioned (`AGENT_PROMPT_VERSIONS`) and the seeder now activates a newer seeded
  version in place of an older one. Before this, a prompt edited in the repo never reached a database that already had
  v1, so the wording that runs in production could silently differ from the file. A prompt written from the app
  always lands on a version above the seeded ones and is never overwritten, and a version is only activated while
  it still holds exactly the seeded text.
- **D-174** — What the production traces taught, after the first deploy of D-171/D-172 (2026-09-22). None of it was
  visible in the fixture tests, all of it in `usage_log` and `agent_steps`:
  1. **One 40-item call does not come back.** A café whose opening minimum is 50 is 43 products short; asking for
     all of it in one call took 33 s and failed. The recommender now batches the open categories into calls of
     about ten products, like the option agent.
  2. **Parallel batches to one provider spend its per-minute allowance.** Groq's free tier caps tokens per minute,
     so two of three batches came back 429. A request can now say which route in the chain to start from, and
     both batching agents pass their batch index — batch 0 to the primary, batch 1 to the next provider. Every
     route is still tried on failure.
  3. **A 6 s per-attempt timeout was sized for the old, smaller answers.** After a 429 the retry and the fallback
     both died on it, so the run finished with pool cards only. A request may now carry its own timeout; the plan
     sets 6 s in quick mode (its 11 s deadline must still fit a fallback) and 11 s in full mode.
  4. **One bad item cost the whole batch.** The answer is parsed against one schema, so a 200-character
     description or a third option group failed everything with `invalid_output`. The wire schemas are now wider
     than a card, and the exact rules are applied per item by the agent and the Validator.
  5. **A cuisine can ask for more than its category table describes.** kafe-icecek expects 50 products across
     three categories summing to 13; capping each category at twice its own minimum stopped the run 24 products
     short. The ceiling now also follows the category's share of what the run needs.
  Measured on production after all five (kafe-icecek, 7-product menu, full mode): 36 new products, 7/7 products
  with an option card, 43/50 reachable, 19 s, `completed` — from 12 products, `partial` and 33 s.
- **D-175** — 2026-09-22 (user): **a drink is a plain panel row.** "İçeceklerde ne açıklama ne opsiyon oluyor,
  orası direkt ürün diye geçiyor." So the `icecek` category is now a *plain category* (`PLAIN_CATEGORIES` in
  `src/domain/category.ts`) and four places honour it: the Gap Analyst raises no option card and no
  "açıklama boş" fix for a drink, the Validator strips the description, options and ingredients from a suggested
  drink (even one that comes from a curated pool template) and refuses an option card aimed at one, and the
  recommender's prompt (v4) says to leave those fields empty for `icecek`. Consequence worth knowing: in a café
  the option section is nearly empty, because almost every product there is a drink.
- **D-176** — The template pool grew from 316 to **424** (`templates-kombo-icecek.ts`, `templates-ek-genis.ts`).
  Measured first: çorba and yan ürün had 13 templates each across 27 cuisines, six kitchens (tantuni, mantı, çiğ
  köfte, dondurma, steak, köfte) had fewer than ten products, and **menü & kampanya had none at all** — the
  category every cuisine expects one of, so the "last resort" slot could only ever be filled by the model. Added:
  12 combos with their own Menü/İçecek/Yan Ürün groups, 40 drinks as plain rows, and the soups, sides, ara sıcak
  and desserts the thin kitchens were missing. Why it matters: a pool product is instant, carries curated options
  and costs no model call, so every gap the pool can close is one the model does not have to invent. Side effect
  on the tests: a five-product menu is now often filled from templates alone, so the three e2e tests that need a
  model call empty or trim the pool first, on purpose.
- **D-177** — 2026-09-24 (user: "mutfak türü bazında minimum hedef … araştır, config/DB'de tutulsun"): **realistic
  opening targets per cuisine.** Researched from published delivery menus and menu-engineering guidance
  (`docs/ai-eval/cuisine-targets.md`): each cuisine now has a realistic product count (`cuisines.typical_item_count`),
  an opening target (`min_item_count`, never below the 10-product rule) and the reason (`target_note`), seeded from
  `db/seed/cuisine-targets.ts` (kebap 35/20, kafe 42/25, çorba 14/10, tantuni 14/10 …). A target typed in the app sets
  `min_item_count_edited_by_user` and is never replaced by a seed; migration 0004 treats every value that is not the
  old default 10 as the user's. Consequence: "tam" mode now fills to 20 on a kebab menu instead of 10.
- **D-178** — **Every product description is 6–8 natural Turkish words** (user rule), except packaged drinks, which
  have none. All 424 pool templates got a hand-written 6–8 word description (`db/seed/short-descriptions.ts`); the
  recommender prompt (v6) asks for 6–8 words instead of "60–140 characters"; the option agent (prompt v4) writes the
  description of a menu product in the same answer as its options; `fitDescription` cuts a long one at a clause
  boundary and `acceptableDescription` refuses English, ASCII-folded Turkish and ad language, falling back to the
  product type's own line. A menu product's description now travels on its own card, so the separate
  "açıklama boş" fix card is gone.
- **D-179** — **Product-type knowledge base and grounding.** Baseline: options came from a pool template or from the
  model and nothing checked them against what the product is (a soup's "Pişirme Derecesi", "Makarna Türü" on a
  "Penne Arrabbiata", "Ekstra Et" on a meatless çiğ köfte). `product_types` (45 rows, seeded, versioned, a row the
  user edits is theirs) holds per type: identifying keywords, plain row or not, typical option groups, typical
  removable and extra ingredients, groups and ingredients that never apply, a fallback description. It is given to
  the option agent as a per-batch type guide, and `agents/grounding.ts` applies it to every card from every source:
  separation (ingredient lists and on/off toggles out of the options), fit (forbidden groups, choices the name already
  made, forbidden ingredients, non-food), canonical shape ("Sossuz" is never charged), completion of empty sections
  from the type, the 6–8 word description, and a 0–100 confidence per card (below 60 the phone says "Kontrol et").
  The Validator also guarantees coverage: every product the plan promised a card gets one, from the knowledge base
  when the model skipped it. D-175's category rule is replaced by a type rule: packaged drinks (kola, ayran, su) are
  plain rows; prepared drinks (Türk kahvesi, latte, limonata, milkshake) get options and a description.
- **D-180** — **Learning loop.** The phone sends a card back as the user kept it (suggestions tapped away are missing);
  the server records one `suggestion_feedback` row per suggested group, ingredient and description (accepted / removed
  / edited, with the product type). A suggestion removed at least 3 times and in at least 70 % of the cases for a type
  is no longer offered (grounding drops it, the prompt lists it as "ekibin sürekli sildiği"). The accepted card is
  written to the template pool, grounded version included, so the product comes back without a model call.
- **D-181** — **Coverage per mode.** Both modes give every menu product that is not a packaged drink its four
  sections (up to 40). The mode decides how many of them the MODEL is asked about: quick 7 (two parallel calls), full
  30 (five); the rest come from the pool and the knowledge base at no model cost. Quick mode on a menu of 1–3
  products (the "ürün ekle" case) suggests 7 new products and may take two from a category.
- **D-182** — **Matching guard and wrong aliases.** Six seeded aliases named another dish ("Levrek Buğulama" →
  Levrek Izgara, "Ciğer Dürüm" → Ciğer Şiş, "Sucuklu Kaşarlı Pide" → Sucuklu Yumurtalı Pide …): a steamed sea bass got
  grill options and a wrong rename card. They are gone from the seed and migration 0004 deletes the copies earlier
  seeds left. A fuzzy (trigram/vector) match is now also refused when the two names carry different words of one
  family — cooking, filling/meat, form — or only one is a "dolma" (`lib/same-product.ts`). The duplicate check of new
  products also knows the pool's spelling of a menu product ("Mercimek" is on the menu as "Mercimek Çorbası"), a
  longer spelling that only adds a generic word ("Taze Sıkma Portakal Suyu"), and a bare product line next to a
  variant of it ("Tantuni" next to "Et Tantuni Dürüm").
- **D-183** — **Category reconciled with the product type.** The keyword index filed "Tavuk Suyu Çorbası" as a drink
  ("su") and "Tatlı Ekşi Soslu Tavuk" as a dessert ("tatlı"). When the restaurant's heading did not decide and the
  name identified the type, the type's category wins — only for drink/dessert confusions, so every other category's
  gap count is exactly what the keyword table says.
- **D-184** — **Result screen for the whole operations team** (user: sadelik önce). Two big tabs, "Yeni ürünler" and
  "Menüdeki ürünler", each with one card per product and the same four sections: Opsiyonlar, Çıkarılabilir
  malzemeler, Ekstra malzemeler, Açıklama. Every suggestion is a chip kept until tapped; a whole group comes off with
  one tap; "Hepsini kabul et" (or "Seçilenleri kabul et") saves what is left; every section has its own "Kopyala". A
  rename or a wrong section is a note inside the product's card with "Tamam". Gone: the filter chips, bulk selection
  and bulk copy, the source badges ("DB'den", "AI"), AI call counts, the debug screen and its bug icon, the
  "Ayrıntılı kayıt" switch; technical server notices are hidden (the cards are complete anyway); the note field on the
  home screen is folded; an error screen has a "Tekrar dene" button. A debug build now installs next to the release
  app ("Kopilot TEST", `.debug` id), so testing never replaces the app in use.
- **D-185** — The classifier's per-attempt timeout is 3 s (was 6 s). Measured: its first (Gemini) attempt timed out in
  49 of 91 baseline runs and Groq answered in ~0.5 s after it — six wasted seconds on every such analysis.
- **D-186** — **Evaluation harness** `tests/ai_eval/`: 27 hand-written Turkish menus, rendered to photos in five
  styles (print, handwriting, board, blurred, skewed low-quality) plus the three repository photos; 141 cases (every
  cuisine × text/photo × quick/full, a single typed product per cuisine, repository photos in both modes); scoring by
  hand-written rules independent of the backend's own validation, refined only for judge defects found on manual
  review and always applied to both runs; a seeded random sample for manual review. Reports:
  `docs/ai-eval/baseline-report.md`, `docs/ai-eval/after-report.md`.
- **D-187** — **The cuisine is read off the menu when the model cannot.** With the providers rate-limited, the
  classifier had no answer and the run took the first cuisine in the list: a pizzeria photo became a kebab house and
  was offered lahmacun (evaluation: cuisine accuracy 45 %, 36 alien products). A low-confidence model guess took the
  same fallback. Now every product whose name identifies its type votes for the type's home cuisine (full vote) and
  the other cuisines it is typical of (a third); that guess is the answer whenever the model has none. 26 of the 27
  evaluation menus are read correctly this way without a model call (the miss: tantuni → döner, which share a type).
- **D-188** — **Four rules from the final manual sample** (4 of 40 products still had a misfit item; baseline 10 of
  40). (1) The name decides the filling: a product whose name carries a filling ("Kakaolu Çörek", "Peynirli
  Gözleme") is not asked a filling/variety group ("Çeşit", "İç Harç") whose answers are fillings; a menu product is
  grounded on the restaurant's own name, with the pool's name ("Gözleme") alongside. (2) Nothing is asked twice: an
  answer in a group is not also a removable or an extra — the group is the choice, the ingredient leaves its list
  (before completion, so an emptied list is filled from the type); 25 such repeats inside the knowledge base itself
  were cleaned, and a test keeps every type free of them. (3) The ingredient a product is named after is not
  removable ("Kaşar" of a "Kaşarlı Pide", "Antep Fıstığı" of a "Fıstıklı Kadayıf Dolması", "Soğan" of a "Soğan
  Halkası"). (4) A sweet name ("Kakaolu", "Çikolatalı", "Çilekli"…) forbids the savory list whatever the type.
  Knowledge base v2: fried rice is a wok dish ("Sebzeli Kızarmış Pilav" was a pilaf garnish with grated kaşar), a
  coleslaw no longer resolves to the salad type (it was offered Sezar dressing and grilled chicken). A variant is no
  longer "renamed" to the pool product it is a variant of ("Peynirli Gözleme" and "Patatesli Gözleme" would both have
  become "Gözleme").
- **D-189** — **Quick mode keeps its promise of six.** Measured without a model (providers out of quota), quick
  runs came back with 3–5 new products in several kitchens, for three reasons: one (or two) products per category
  capped a cuisine with five usable categories (döner) at five and an ice-cream shop with two at four; the pool picked a product seeded in several related cuisines
  twice ("Ayran" of kebap and of çorba) and the copy was then dropped; and a category with nothing left in the pool
  (ev yemekleri's salads) kept its slot empty. Now the plan hands out the missing slots again, round by round, once
  every category has its share (open gaps first, then the categories the cuisine leans on most, one more per category
  per round — an ice-cream shop with two categories gets three and three); the pool never
  picks the same product twice; and a quick run left short by the pool and the model is filled with more pool
  products of the other open categories, past their quota — the Validator lets such a fill-up through, never past
  the run's total. Full mode is unchanged. A kitchen whose whole pool is on the menu (a çiğ köfte shop) can still be
  short without a model; with one, the model fills the rest.
- **D-190** — **Two duplicates the final run still let through.** "Tacos" was suggested to a menu listing "Tacos
  (3'lü)": the pack size is now left out when two names are compared. "Künefe" was suggested next to "Dondurmalı
  Künefe": a bare product name is the product line of a longer name that only adds a "-li" word (what is added or
  inside), as it already was for a meat, cooking or form word. "Barbekü Tavuklu Pizza" next to "Tavuklu Pizza"
  stays a different product.
- **D-191** — **Knowledge base v3, from the second final sample** (3 of 40 products with a misfit). A spring roll
  resolved to sushi through the word "roll" and was offered wasabi and pickled ginger: "spring roll" is now a hot
  starter keyword. Iced coffee and lemonade shared one type, so an iced tea was offered an espresso shot and whipped
  cream: the type is split into `soguk-kahve` (ice latte, frappe, cold brew, milkshake — size, milk, syrup, shot) and
  `soguk-icecek` (lemonade, iced tea, smoothie — size, ice). Çökertme was filed as a pot dish, with a pilaf choice and
  a line about slow cooking: it has its own type (portion, yoghurt, butter sauce). Two fallback lines that were
  wrong for part of their type were replaced: "seçilen harçlı" for a börek or gözleme whose name fixes the filling,
  "isteğe göre sütlü" for a latte. 46 → 48 types.
- **D-192** — **Product cards open and close** (user, testing 1.3.0 on the phone: the open cards were right but took
  the whole screen). Closed, a card is its name, its badges ("Yeni ürün", "Kontrol et", "Kabul edildi") and one line
  of what it holds as the user kept it ("1 opsiyon grubu · 2 çıkarılabilir · 2 ekstra · açıklama"); a tap anywhere on
  the header opens the four sections with a short slide. Cards start closed, except when a tab holds a single product
  ("ürün ekle"); a card closes itself once accepted or skipped. A note-only row stays open (it is one line).
- **D-193** — **Analysis history with date, time and filters** (user: "tarihli saatli saklansın, filtreleme olsun").
  The phone keeps every analysis it made (up to 500; the whole result for the newest 100, the summary for the rest)
  with the time it was made — saving a run again after an accept no longer moves its time — its mode, cuisine, first
  products and card counts. The server's `GET /analyze/history` (newest first, paged by time, filtered by date range,
  cuisine, mode and a product/cuisine search) fills in runs made on another phone or before the install; the screen
  always reads the phone's copy, so it opens instantly and works offline. "Analiz geçmişi" groups runs under
  "Bugün", "Dün" and the date, with the time, cuisine, mode and what each run produced; filters: date (today, last 7
  days, this month, a range of days), quick, full, cuisine, and a search that ignores Turkish letter case and
  accents. `suggestion_runs.analysis_mode` stores the mode from now on (migration 0005); older runs have none.
- **D-194** — **The learning loop, second pass.** (1) A product turned down with "Önerme" at least 3 times and in
  more than 70 % of its verdicts for one cuisine is no longer suggested to that cuisine — by the pool or the model,
  which is told so (recommender user prompt v3); `suggestion_feedback.cuisine_id` records the kitchen (backfilled).
  (2) What the team keeps taking comes first: a removable or an extra accepted at least 3 times and in more than 70 %
  of its verdicts for a product type leads its list and is named to the option model; every accepted card counts as a
  use of its template (`usage_count` was never incremented), and the pool ranks a template up to 10 uses higher.
  (3) Ayarlar → "Ekibin sildikleri" lists what was learned, with "Geri al": the rows are kept and marked
  (`ignored_at`, `ignored_by`), and the loop stops counting them (`GET /learning`, `POST /learning/forget`). Two
  spellings of one suggestion now add up instead of overwriting each other.
- **D-195** — **A slow photo read gets a second reader** (user: "menüyü taratıyom çağrı sırasında"). Measured on
  production: a menu photo reads in 4.5 s at the median, but one read in eight hung on the first vision provider for
  the whole 18 s timeout, after which the next provider answered in 2 s — dead air on a call with the seller. A read
  that has not answered after 7 s now starts the same photo on the next provider of the chain; the first good answer
  wins and the other call is cancelled (a cancelled attempt does not count against the provider's circuit breaker).
  A hedge that fails does not end the read: the first call keeps going down its chain as before. *Why not a shorter
  timeout:* a long menu can take 9 s on the first provider, and the next one caps its output at 1000 tokens, so
  cutting the first one short would trade a slow full read for a fast partial one.
- **D-196** — **Call mode** (user: the expert reads the app on the phone during the call, pitches the suggestions
  to the seller — "ihtiyaç yaratmak" — notes what the seller agrees to and enters it on the seller's panel back in
  the office; nothing is copied during the call). (1) *The order and the "neden":* every card carries one sentence to
  say to the seller and a priority; the cards arrive in call order. A new product: a category with nothing in it
  opens ("Menünüzde hiç tatlı yok"), then a thin one ("İçecek tarafınız az (1/3)"), then how common the product is
  in this cuisine's curated pool ("… menülerinin çoğunda var"), and — once at least 3 earlier sellers answered — "son
  5 satıcıdan 4 tanesi ekledi". A product on the menu: the strongest thing its card adds (a menu choice grows the
  basket, then a drink, a size, extras, other choices, removables, a description), a little earlier when the panel
  shows it with no options at all. Facts only: a statistic that is not there is not said. (2) *The seller's answer:*
  "Evet" (the product as the chips were left — replaces "kabul et"), "Düşünecek", "Hayır" on every card, changeable
  during the call; the last answer counts (`suggestion_items.answer`, `answered_at`, migration 0006, backfilled from
  `accepted`; `POST /suggestion-items/:id/later`). The screen shows "Evet 2 · Düşünecek 1 · Hayır 3" and the
  counter follows every change. (3) *Ofiste girilecekler:* the "Evet" products with every section to enter and a
  "Panele girildi" tick (kept on the phone), the "Düşünecek" ones with their sentence and an "Evet dedi" for the
  call back, a call note (typed or spoken), and "Satıcıya gönder" — a plain message of what was agreed. (4)
  *Learning from the answers:* a "Hayır" is now what the seller said, not what the team deleted, so a product sellers
  of a kitchen mostly turn down (≥ 3 answers, > 70 % "Hayır") goes to the back of its category and of the call — no
  longer out of the list (D-194 hid it): another seller may want it, and nothing fits better than an empty slot.
  Products they mostly take come earlier and say so. The model is still told what sellers turn down (recommender
  user prompt v4). Ayarlar → "Öğrenilenler" (was "Ekibin sildikleri") shows both.
- **D-197** — **Menü Kopilot stands on its own** (user: the app works by itself and must not look tied to any
  company's systems; it is an external tool). No platform name, no platform's internal system names and no
  "branch opening" wording anywhere the app, the server or the AI shows or reads: the phone's texts (tagline
  "Restoran menüsünü hızla tamamla", "menü hedefi" instead of an opening target, "Menüde en az 10 ürün olmalı",
  photo hints without a platform), the server's messages, the API description, the recommender and option prompts
  (recommender system v7, user v5, options system v5 — a redeploy activates them), code comments, tests, the docs
  and the original spec. The rules the app works with (at least 10 products, a target per cuisine, drinks as plain
  rows) stay: they are the team's own settings, editable from the app. The repository and the production database
  were searched for personal-data notices too: there were none.
- **D-198** — **Alternatives the kitchen can make, ten in quick mode, every section one tap away** (user, testing on
  the phone: "fotoğraf veriyorum, olmayacak ürünler öneriyor"; quick mode should give more, and options, ingredients,
  extras and descriptions must be reachable at once during the call). Production showed why: quick mode never asked
  the model for new products — the pool filled its six slots per cuisine by importance, so every "Sokak Lezzetleri"
  menu (a kokoreççi, a midyeci, a dürümcü) got the same Waffle, Kumpir, Midye Tava, Et Tantuni Dürüm, and kebap
  shops got Tavuk Döner Dürüm. (1) *Kitchen profile* (`agents/kitchen.ts`): the product types the menu sells by name,
  what each of them can also make with the same equipment and stock (a kebap shop: dürüm, lahmacun, çorba, künefe —
  never döner), the ingredient/form words of its products, and speciality words that need their own machine or
  master (döner, tantuni, kokoreç, midye, kumpir, waffle, künefe, dondurma, sushi, çiğ köfte, işkembe, kelle paça,
  katmer) — offered only to a menu that shows them. Every new product, from the pool or the model, must fit it; the
  Validator checks again after a model answer is renamed to a pool template. Packaged drinks the menu already lists
  under a brand ("Ayran Özerhisar", Coca Cola for "Kutu İçecek") are not suggested again; "Taze Sıkılmış" is
  "Taze Sıkma". (2) *Alternatives*: new products built on a product of the menu — the same meat, dough or dessert
  base in a form the menu lacks (Adana → Beyti, kokoreç → kokoreç dürüm, şam tatlısı → revani) or what is always
  sold with it. The model is asked for them on EVERY run (recommender system v8, user v6: the kitchen brief, the
  specialities to avoid, `basedOn`); an answer whose `basedOn` is not on the menu is judged as a category product;
  the pool's closest products stand in when the model cannot answer. Alternatives are outside the category quota.
  (3) *Counts*: quick = 6 alternatives + 4 category products (small menus 5 + 5), full = 8 alternatives on top of the
  quota; quick attempt 8 s / deadline 14 s (ten products with options measured at 3–5 s), budget +1 call. The pool
  ranks makeable products closest-to-the-menu first. (4) *Phone*: a new product built on a menu product says so
  ("Adana Kebap alternatifi") and its sentence for the seller leads with it ("Adana Kebap ürününüzün alternatifi;
  aynı harçla…", priority 85); a closed card shows its sections as buttons — "Opsiyon 2 · Çıkar 3 · Ekstra 4 ·
  Açıklama" — and one tap opens that section in a sheet with tabs for the other three, "Kopyala" and the seller's
  answer; "Tümünü aç / kapat", a search box on lists longer than six, and "Alternatifler" as a filter. App 1.6.0. (5) *Measured on production after the first deploy:* ten products with their options in one answer ran past the 8 s attempt on Groq (medium reasoning, and the free 8 K tokens a minute shared with the option agent) and on Gemini Flash, so both runs fell back to the pool; and the pool still let "Ekmek Arası Tantuni" and "Ekmek Kadayıfı" through to a kokoreççi. Now the alternatives get a call of their own (two short answers in parallel on different providers), the recommend route runs at low effort (code default and the production rows), a missing speciality is refused whatever the type, bread words ("ekmek", "arası") are no shared ingredient, and an alternative is tied to a menu product of its own type first. The recommend chain is Groq → Gemini Flash-Lite → Gemini Flash (Flash needed more than 8 s even at low thinking; Flash-Lite answers in 2–4 s), in the code default and the production rows. A main dish filed under a side by its bread or meze word ("Tam Ekmek Kokoreç" → yan ürün, "Atom Kokoreç" → meze) counts as a main when its name identifies the type — the kokoreç shop had read as "no main course at all" and was offered Turşu Tabağı and Mısır as mains.
- **D-199** — **No login screen: the app signs itself in** (user: "e-posta ve şifre gerek yok, direkt kullanıma hazır
  olsun"; confirmed after the auto-mode check flagged it, with the trade-off below). A release build carries an app
  key (`--dart-define=APP_ACCESS_KEY`, the server's `APP_ACCESS_KEY`, ≥ 24 characters); on the first request the
  phone calls `POST /auth/device` with it and gets its own device session on the team account (`ADMIN_EMAIL`) —
  rotating refresh token, revocable like any session — so history, pool and learning stay one. A session the server
  no longer knows is replaced by a new device sign-in transparently; offline on the first start the app still opens
  (the first request that reaches the server signs in). No login, no splash, no "Çıkış yap" in such a build; a
  development build without the key keeps e-mail and password. *Trade-off:* the API is still closed to anyone
  without the key (AI quota, data), but someone who extracts it from the APK can use it; rotating `APP_ACCESS_KEY`
  on the server shuts out every build that carries the old one (then ship a new APK). The key is compared in
  constant time and rate-limited (10/min in the API and in nginx, like the login).
- **D-200** — **From a phone app to a website, with a chat** (user: "telefon uygulaması olmaktan çıkarıcaz, sitede
  olacak"; Ctrl+V ile ekran görüntüsü, yazışma, güzel ve sade arayüz; admin paneli girişli, sitenin kendisi girişsiz, cookie
  ile, herkes kullanabilir; iş çağrı içinde yapılıyor; bir yemek sipariş platformunda şube açan proaktif temsilci kafası). (1) *Removed:*
  `mobile/`, its CI and release jobs, device sign-in and refresh tokens (D-199), the voice route. (2) *Site:* `web/`,
  React + Vite + plain CSS, built into the one image and served by Fastify; the anthracite/paprika/Manrope identity is
  carried over (`DESIGN.md`). (3) *No login:* a browser's first message creates a user row with no password and a
  year-long HttpOnly cookie, so every ownership check, history and quota keeps working per visitor. Created in a
  preHandler, after the rate limit, and only on a message, so a page view or a flood creates nobody. The admin cookie is
  separate (SameSite=Strict, 12 h), and every write of shared data sits behind it. (4) *Open site, so three limits:* 20
  messages a minute per IP, the per-visitor quota, and `GLOBAL_DAILY_LLM_CALL_QUOTA` for the site, which a cleared cookie
  cannot reset. `POST /analyze` became admin only: the chat is the public door. A visitor's "Evet" records the answer,
  teaches the feedback loop and leaves a draft of a new product (`approved=false`) instead of writing the approved
  pool. (5) *Chat without a second pipeline:* the chat agent (`agent.chat`, Flash-Lite first) writes no product; it decides
  to answer, or to run a slice of the agents (`RunFocus`: a category, named menu products, what a later screenshot
  added), so a product asked for in chat passes the same kitchen and duplicate guards. A follow-up reuses the run's
  product list, skips the Classifier, never offers a product twice in a conversation, and takes what the restaurant said
  yes to into the menu. Its sentence is written from the run's cards, not by the model: the model's lead-in named
  products the guards then dropped ("Humus ekleyelim" with Humus already on the menu). A special request ("vegan") skips
  the pool, which knows nothing of it. (6) *Call:* the first analysis is `quick`; more is one message away. (7) *Gemini
  first* on the recommend and option routes (migration 0007 moves the production rows), Groq second so parallel batches
  still spread over two providers. Measured on the eval images with Flash-Lite first: 6–11 s per menu screenshot, 1.5–5 s
  per follow-up. (8) *Stance:* the recommend and option prompts now name the rep opening a delivery platform branch, reversing
  D-197 for the prompts only; the site itself carries no platform branding. (9) *Pool alternatives* outside the cuisine's
  family must share a word with the menu product, and when the model answered the top-up comes from the family alone
  (a sushi bar was offered Mercimek Çorbası as an alternative of Miso Çorbası); quick mode's fill-up no longer repeats a
  type the alternatives filled. *Trade-offs:* anyone with the address can use the site and spend the day's quota; visitors'
  answers feed the shared learning loop (the admin can take a verdict back); a reload during a running analysis shows
  the answer only when the conversation is opened again; a card's options cannot be struck out one by one before "Evet" as
  on the phone.
- **D-201** — **What the full run before going live found** (user: "canlıya almadan önce tam anlamıyla çalıştır"). Run on the
  real image behind Caddy with the production CSP, driven in real Chromium, including a real Ctrl+V from the Windows
  clipboard. *Measured:* Gemini answered 503 "high demand" on both models for long stretches (a direct probe: 200 in 1 s,
  then 13 s, then 503), which opens the provider's circuit for 60 s and leaves everything to Groq's free per-model limits.
  So a run can fall back to the pool, and that path has to be good. (1) The next-step buttons ("Çorba öner", "Daha fazla
  ürün öner") no longer call the chat model. (2) `agent.chat` got GPT-OSS 120B as a last fallback. (3) When the providers
  fail the answer says so and offers the same request as a button, instead of a verdict on the menu ("uygun sonuç çıkmadı")
  or a request to paste a menu that is already there. (4) Pool alternatives come from the cuisine's own family only, and a
  shared type alone counts only within the cuisine itself; this replaces point 9 of D-200 (Bulgur Pilavı was the pizza
  shop's "Sarımsaklı Ekmek alternatifi"). (5) A run that read nothing is no menu: the next screenshot is the first analysis.
  (6) A product just taken off the menu is not offered back in the same answer. (7) *Browser:* the conversation survives a
  reload and waits for an answer still running on the server; leaving a conversation mid-answer no longer writes into the
  next one; a failed send gives the text and the images back; deleting a conversation asks first. (8) `agent.chat.system`
  v2: an objection is answered with the sentence to read out.
- **D-202** — **No seller answers, no prompt screen, a calmer page** (user, after testing: "düşünecek evet hayır falan
  kaldıralım", "daha düzenli okunaklı ve sade", "promptlar neden var silelim"). (1) The Evet / Düşünecek / Hayır buttons, the
  Özet panel and everything that fed on them leave the site: the meter shows the menu as read, the chat no longer takes
  accepted products into the menu. The `/suggestion-items` routes stay for an admin bearer token only (the learning tests and
  `live:check`), so a visitor writes nothing shared; the visitor's draft path is gone, and the panel's second template tab is
  simply the archive. *Trade-off:* nothing teaches the learning loop any more. What production already learned keeps
  working and can be taken back under Öğrenilenler. (2) `/prompts` and its repository operations are deleted; prompts change
  through a version bump in the code, which the seed activates. (3) *Cards:* one aligned spec list instead of three
  uneven columns; the sentence to say comes first and is regular weight with a small label; paprika only on the main action,
  the current tab and that label; selection is neutral; the next-step chips sit above the composer. The first answer says
  only what the header and tabs do not (the gaps and card counts left it), and the "target unreachable" notice is gone.
  (4) *Admin:* overview as a stat strip and two panels; conversations as a table with whole-row click; a conversation as a
  timeline with each analysis folded. (5) *Domain:* `menu.example.com` stays: it is already in Cloudflare and under
  the origin certificate, next to `qr.example.com`.
- **D-203** — **Repo herkese açık, platform adı ve kişisel bilgi yok, MIT lisansı** (kullanıcı kararı, 2026-11-08: "bağımsız
  bir uygulama", "publicte özel şey olmasın"). Repo public olmadan önce bütün git geçmişi yeniden yazıldı: belirli bir
  sipariş platformunun adı "bir yemek sipariş platformu" / "delivery platform" oldu; sunucu IP'si, gerçek e-postalar ve
  isimler, kişisel alan adı (`example.com`), sunucudaki diğer projelerin adları ve yerel yollar yer tutucuyla değişti;
  ilk görev tanımı (telefon dönemi) geçmişten tamamen çıkarıldı. Kod davranışı aynı; yalnızca `agent.recommend.system`
  (v11) ve `agent.chat.system` (v3) promptlarının ilk cümlesi değişti, sürümleri bu yüzden arttı. Lisans MIT.
  *Bedel:* commit kodları değişti (sunucudaki kopya yeniden eşitlendi); `deploy/nginx/menu-kopilot.conf` artık yer
  tutucu alan adı ve sertifika yolu taşır, sunucuya kopyalanırken gerçek değerler yazılır.
- **D-204** — **Güvenlik sıkılaştırması** (kullanıcı isteği, 2026-11-08). (1) *Origin yalnızca Cloudflare'e açık:* menü
  sitesi IP'yle doğrudan açılıyordu, Cloudflare'in korumaları atlanabiliyordu. `deploy/nginx/menu-kopilot.conf` artık
  `$realip_remote_addr` üzerinden Cloudflare aralıklarını (ve sunucunun kendisini) tanıyan bir `geo` haritası taşır;
  başka her bağlantı `444` ile kapanır. `$remote_addr` kullanılamaz: real_ip onu ziyaretçinin IP'sine çevirir. Aralıklar
  `/etc/nginx/snippets/cloudflare-geo.conf` dosyasından gelir; onu sunucudaki haftalık Cloudflare IP güncelleme betiği
  `cloudflare-realip.conf` ile birlikte yazar, böylece iki liste ayrışmaz. Güvenlik duvarında
  80/443'ü Cloudflare'e kısmak seçilmedi: sunucudaki diğer siteleri ve Let's Encrypt yenilemelerini etkilerdi.
  (2) *Paketler:* fastify, `@fastify/*`, zod ve geçişli `fast-uri`, `ip-address`, `brace-expansion` yamalı sürümlere;
  web'de vitest 3 → 5. Üretim bağımlılıklarında bilinen açık kalmadı; kalanlar yalnızca geliştirme araçlarında (eslint,
  drizzle-kit, vitest içindeki vite) ve üst sürüm bekliyor. (3) *Sunucu:* kullanılmayan `ufw allow 8080` kuralı silindi
  (dinleyen süreç yalnızca 127.0.0.1'de), SSH'te X11 yönlendirmesi kapatıldı. Bilinmeyen alan adlarını reddeden varsayılan
  nginx sunucusu eklenmedi: bazı alt alan adları bugün varsayılan siteye düşüyor.
  (4) *İşletim sistemi:* Ubuntu 25.10'un güvenlik desteği bitmişti; sunucu 26.04.1 LTS'e yükseltildi. Önce bütün
  projelerin veritabanları ve `/etc` sunucu dışına yedeklendi; yükseltme mevcut ayar dosyalarını korudu, yeniden
  başlatmadan sonra bütün konteynerler ve siteler önceki durumuyla aynı yanıt verdi.
- **D-205** — **Sunucu düzeyinde bakım** (kullanıcı isteği, 2026-11-08). D-204'teki çekince kalktı: sunucuya tanınmayan alan
  adlarını ve doğrudan IP isteklerini düşüren bir varsayılan nginx sunucusu eklendi (80'de `444`, 443'te el sıkışma reddi;
  sertifika yenileme yolu açık kalır). Ayrıca sunucudaki bütün projelerin veritabanları her gece yedeklenir, 10 dakikada bir
  çalışan bir sağlık kontrolü sorunları telefona bildirir. Bunlar sunucuya ait betiklerdir, bu repoda yer almaz; Menü
  Kopilot'un kendi yedeği (`deploy/backup.sh`) aynen sürer.
- **D-206** — **Açılış kuralları, geri bildirim, Excel ile şablon havuzu, yönetim panosu, zenginleşen havuz** (kullanıcı
  isteği, 2026-11-13: ekibe sunum öncesi "hedeflere göre güncelle, şablonları zenginleştir, Excel'den ekleyelim,
  geri bildirim ve akıllı bir pano"). (1) *Kontrol listesi:* her analiz `counts.quality` taşır: ürün sayısı mutfağın
  hedefine karşı (içecekler dahil), en az 10 içecek, ürünlerin %70'inde açıklama, %20'sinde fotoğraf, yazım düzeni
  (tamamı büyük ya da küçük harf ad) ve menünün kendi ürünlerinden çıkan ek mutfak türleri. Açıklama ve fotoğraf
  yalnızca panel ekran görüntüsünde görünür; görünmeyen kural tahmin edilmez, "bilinmiyor" döner. Eşikler
  `agents/quality.ts`; mutfak bazlı minimum sayılar şirket içi bilgi olduğu için koda yazılmaz, canlıda yönetimden
  girilir. Bölge km², logo/banner, AI görsel ve arama kuralları menüyle ilgili olmadığı için kapsam dışı. (2) *İçecek:*
  kategori beklentisi 10 (kahve dükkânı 25), migration 0009; GREATEST ile hiçbir sayıyı düşürmez, kural platformun
  olduğu için elle düzenlenmiş mutfaklara da uygulanır. Her mutfağa paketli içecek seti eklendi (düz panel satırı).
  (3) *Geri bildirim:* `feedback` tablosu (0008); ziyaretçi çereziyle gönderir (dakikada 5), görüşme yalnızca kendi
  görüşmesiyse eklenir; yönetim okur, not düşer, kapatır. (4) *Excel:* örnek dosya, havuzu dışa aktarma ve içe aktarma
  aynı düzende; içe aktarma önce önizleme gösterir, eşleşme mutfak + ad, içe aktarılan şablon `imported` olur ve
  tohumlama üzerine yazmaz. Kütüphane olarak `read-excel-file` / `write-excel-file` (küçük, bakımlı; `exceljs`'in eski
  bağımlılıkları yerine). (5) *Pano:* 7 günlük aralık, 14 günlük seri, analizlerin kuralları kaçırma oranı, hedefine
  uzak mutfaklar, yeni geri bildirim. (6) *Mutfak adları* platformun kategori adlarına çekildi (0008, elle değiştirilmiş
  ada dokunulmaz); Makarna & İtalyan, Mantı & Makarna'nın altına alındı. (7) *Havuz* 424 → 899 şablon; menüde ayrı ürün
  olan varyantlar (zeytinli/kaşarlı poğaça, kıymalı/patatesli gözleme, elma dilim patates) takma ad değil, kendi
  şablonu. "Ice tea" içecek anahtar kelimesi oldu.
- **D-207** — **Her mutfakta havuz açılış hedefine yetiyor** (kullanıcı isteği, 2026-11-13: "eksiksiz tamamla"). Canlıda
  yönetimden girilen hedeflerle karşılaştırınca dokuz mutfağın havuzu hedefin altında kalıyordu (Pizza, Uzak Doğu,
  Pastane & Fırın, Kahve & İçecek, Dünya Mutfağı & Cafe, Steak, Balık & Deniz Ürünleri, Meze, Börek). Hedef temsilcinin
  restorana söylediği toplam ürün sayısıdır; restoranın kendi ürünleri havuzdaki şablonlarla örtüştükçe havuz ancak
  kendi büyüklüğü kadar doldurabilir. Bu yüzden ölçüt *havuz ≥ hedef*: model yoğunken de hedefe havuzdan ulaşılabilir.
  78 el yazımı şablon eklendi (899 → 977), her biri hedefin en az iki üstünde. Yeni adlar başka şablonların takma
  adlarıyla çakışmıyor; başka mutfakta zaten olan ürün (Lazanya, Hünkar Beğendi, Avokadolu Ekmek) aynı yazılışla
  eklendi. Hedef sayıları yine kodda değil, canlı veritabanında.
- **D-208** — **Canlı temsilci testinden çıkan düzeltmeler** (kullanıcı isteği, 2026-11-13: "canlıya al ve dene, bizim
  temsilciler gibi her senaryoyu dene"). `1fde908` canlıdayken pizza, Uzak Doğu (iki görüntü), yazılı döner listesi,
  mutfak değişikliği, opsiyon isteği, kategori düğmesi, "daha fazla ürün", açılışa hazır mı sorusu, fatura görüntüsü,
  selamlaşma, geri bildirim ve telefon ekranı denendi. Çıkanlar: (1) "merhaba, yeni bir restoranla görüşüyorum"
  virgül yüzünden iki ürünlük menü sayılıp analiz başlatıyordu; cümle kelimesi (merhaba, bir, için, mı…) içeren parça
  artık ürün adı sayılmaz, mesaj sohbet ajanına gider. (2) Temsilcinin "ayran yokmuş" diye çıkardığı ürün sonraki
  önerilerde geri geliyordu; görüşmede okunup menüden çıkan her ürün o görüşmenin önerilerinden de çıkar. (3) Sohbet
  ajanı açılış kurallarını görmüyordu ve 11/52 ürünlük menüye "hemen başlayabiliriz" dedi; bağlama kuralların eksikleri
  girdi, "hazır mı" sorusunda eksik varsa hazır değil der. (4) Hiç ürün okunmayan analiz (fatura) başlıkta ve görüşme
  adında "Dondurma · 0 ürün" gösteriyor, altına da o mutfağın on ürününü diziyordu; menüsüz analiz mesaja hiç
  bağlanmaz, yalnızca "menü okuyamadım" cevabı kalır. (5) Havuzda birebir eşleşen kısa ad
  ("Kola", "Çay") "kısaltma gibi" diye düzeltmeye düşüyordu; uyarı yalnızca havuzla eşleşmeyen adlarda. (6) Fotoğrafı
  yazarak eklenen tek ürün yüzünden bilinmeyen kural "Bu görüntüde görünmüyor" diyordu; artık "x/y ürün; z ürünün
  durumu görünmüyor" der. (7) Wakame Salatası'na genel salatanın Sezar sosu ve krutonu doluyordu; şablona kendi sosu ve
  malzemeleri yazıldı. (8) Düzeltmeler canlıya çıktıktan sonraki ikinci turda model "ayranı satmıyorlarmış" mesajına
  Ayran'ı çıkarıp yerine olmayan bir "Yeni İçecek" ekledi; menüye artık yalnızca adı temsilcinin mesajında geçen ürün
  eklenir (`onlyNamed`).
- **D-209** — **Menü gelmeden de sohbet takılmaz** (kullanıcı isteği, 2026-11-13: "bu tarz yazılar da gelebilir, tekil
  ürün, mutfak türü… sistem hiçbir şekilde takılmamalı"). Telefondan denenirken menü yokken "Suşici için opsiyon öner",
  "Uzak doğu mutfağı için öneri sun" gibi mesajlar yalnızca "Bakıyorum." alıp kalıyordu: model öneri aksiyonu seçiyor,
  kod menü olmadığı için hiçbir şey yapmıyordu. Artık: (1) menüden önce adı geçen ürün ("Adana için opsiyon yaz")
  menüyü başlatır; (2) yalnızca mutfak türü söylendiyse model `cuisineSlug` verir ve analiz menüsüz, o mutfaktan başlar:
  hedef sayı ve o mutfağın temel ürünleri gelir, sonraki "daha fazla", yazılı liste ya da ekran görüntüsü aynı mutfakla
  devam eder (`analyze.start` mutfak verildiyse boş girişi kabul eder); (3) ikisi de yoksa cevap hiçbir zaman çıplak
  "Bakıyorum." olmaz, neyin yazılacağını söyler. Mutfak türünü koddaki kelime eşleştirmesiyle bulmak denenmedi:
  "tatlı öner", "çorba öner" gibi kategori istekleri mutfak adlarıyla çakışıyor; karar modelde, liste bağlamda.
- **D-210** — **Yapay zekâ meşgulken görüntü bir kez daha okunur, mesaj gerçeği söyler** (kullanıcı isteği,
  2026-11-13: "bu hata var sebebi ne"). Canlıda iki dakikada üç ekran görüntüsünden üçüncüsü "Bu görüntüde menü
  okuyamadım" aldı. Menüde sorun yoktu: Gemini o an iki kez 503 "high demand" verdi, yedek Groq önce bozuk çıktı verip
  sonra dakikalık girdi token sınırına (7000) takıldı; okuma adımı başarısız olunca kullanıcıya "menü yok" denmişti.
  Artık okuma kapasite yüzünden başarısızsa (`extract_failed` gibi uyarılar) sohbet 5 saniye bekleyip görüntüyü bir
  kez daha okutur (Groq'un "4,9 saniye sonra dene" penceresi); yine olmazsa cevap "Yapay zekâ servisleri şu an çok
  yoğun" olur, "menü okuyamadım" değil. Kalıcı çözüm ücretli Gemini katmanı (PROGRESS'teki bilinen sorun).
- **D-211** — **Tek başına yazılan bilinen ürün adı üründür** (kullanıcı isteği, 2026-11-13: "ürün adı yazsalar, mutfak
  türünü yazsalar çalışıyor mu, hazır şablonlardan mesela"). Canlı denemede "Pizza" doğru şekilde Pizza mutfağından
  menüsüz başladı, "Karides Nigiri, Wakame Salatası, Tavuklu Bao" Uzak Doğu 3/54 oldu; ama tek başına "Lahmacun"
  model tarafından "Pide & Lahmacun" mutfağı sayıldı ve menü boş kaldı. Menü yokken tek bir ad havuzdaki onaylı bir
  şablonun adıyla birebir eşleşiyorsa artık model sorulmadan ürün listesi gibi okunur: ürün menüye girer, mutfak türü
  ondan çıkar. Eşleşmeyen tek kelime ("Pizza", "suşici") yine sohbet ajanına gider.
- **D-212** — **Makarna & İtalyan, Mantı & Makarna'ya katıldı; yönetimde bütün şablonlar içerikleriyle görünür**
  (kullanıcı isteği, 2026-11-13: "bizde makarna italyan diye mutfak türü yok, silelim, mantı makarna olacak"; "şablon
  havuzu sayfasında az şablon görünüyor, içeriğini de göremiyorum"). (1) Ekibin mutfak listesinde ayrı bir İtalyan
  mutfağı yok. `0010_merge_pasta_cuisine` migration'ı Makarna & İtalyan'ın şablonlarını, analizlerini (sohbetin devam
  ettiği `counts` dahil), öğrenilenlerini ve ürün türü eşleşmelerini Mantı & Makarna'ya taşır; iki mutfakta da olan
  paketli içecekler tekilleşir, sonra mutfak silinir. Tohum veride makarna şablonları Mantı & Makarna'ya geçti
  (26 mutfak, 966 şablon). Geri alma adımı birleştirmeyi bölmez. (2) Excel'de "Makarna & İtalyan" (ya da "makarna")
  yazan satırlar Mantı & Makarna'ya yüklenir; birleştirmeden önce indirilmiş dosya hata vermez. Tam havuzu dışa aktarıp
  birkaç satırını düzeltip yüklemek yalnızca o satırları yazar; test veritabanında bütün satırları değişmiş 966 satırlık
  dosya 5 saniyede kaydedildi. (3) Şablon havuzu sayfası en çok kullanılan 100 şablonu gösterip kalanını gizliyordu,
  içerik de ancak ada tıklayınca açılıyordu. Artık toplam sayı, sayfa sayfa gezinme, mutfak filtresi var; her şablonun
  açıklaması, porsiyonu, opsiyonları, çıkarılabilir ve ekstra malzemeleri, takma adları listede açık durur.
  `tests/ai_eval/` düzeneğindeki "makarna" menüsü güncellenmedi: o menü artık Mantı & Makarna'ya düşer.
