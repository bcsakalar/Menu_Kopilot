# Provider Notes (Groq + Gemini)

Fetched and summarized on 2026-09-14/15 from the official docs listed in the task prompt (section 0).
Everything the backend relies on is referenced from here; model IDs live only in
`backend/src/config/models.ts` (seeded into `provider_configs`).

> Free-tier limits are **not** published as a fixed table for Gemini, and only partially for Groq.
> The code never assumes fixed limits: it reads rate-limit headers / error details and backs off adaptively.

---

## 1. Groq

Sources: [overview](https://console.groq.com/docs/overview) ·
[models](https://console.groq.com/docs/models) · [vision](https://console.groq.com/docs/vision) ·
[structured outputs](https://console.groq.com/docs/structured-outputs) ·
[rate limits](https://console.groq.com/docs/rate-limits) · [OpenAI compat](https://console.groq.com/docs/openai) ·
(extra) [reasoning](https://console.groq.com/docs/reasoning)

### 1.1 API basics
- OpenAI-compatible base URL: `https://api.groq.com/openai/v1`, auth `Authorization: Bearer $GROQ_API_KEY`.
- We call `POST /chat/completions` with native `fetch` (no SDK) to keep full control over headers,
  timeouts, abort and retries. Groq also ships a Responses API and `groq-sdk`; not needed here.
- Unsupported OpenAI params: `logprobs`, `logit_bias`, `top_logprobs`, `messages[].name`, `n > 1`.
- `temperature: 0` is converted to `1e-8`; use values in `(0, 2]`.
- Audio transcription does not support `vtt` / `srt` output.

### 1.2 Models (from the models page)
| Model ID | Type | Context | Max completion | Notes |
|---|---|---|---|---|
| `openai/gpt-oss-120b` | production | 131,072 | 65,536 | strict structured outputs |
| `openai/gpt-oss-20b` | production | 131,072 | 65,536 | strict structured outputs |
| `qwen/qwen3.6-27b` | **removed** | — | — | was vision + JSON mode; no longer served (D-141) |
| `qwen/qwen3.8-27b` | **preview** | 131,042 | 16,384 | vision (3 images), strict structured outputs |
| `whisper-large-v3-turbo` | production | — | — | speech-to-text, 100 MB file limit |
| `whisper-large-v3` | production | — | — | speech-to-text |
| `groq/compound`, `groq/compound-mini` | system | 131,072 | 8,192 | agentic, web search + code exec (Faz 7) |

Preview models "may be discontinued without notice" → vision fallback chain must survive their removal.

### 1.3 Vision
- Vision model: `qwen/qwen3.8-27b` (max **3** images/request); `qwen/qwen3.6-27b` was removed by Groq (D-141).
- Max request size with image **20 MB**; each image counts as **~2048 input tokens**.
- Local images are sent as data URLs:
  `{ "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,<b64>" } }`.
- We always send **one image per call** (task rule: long menus break JSON most often with many images).

### 1.4 Structured outputs
```json
{ "type": "json_schema", "json_schema": { "name": "...", "strict": true, "schema": { } } }
```
- **Strict mode** (constrained decoding, guaranteed valid): `openai/gpt-oss-20b`, `openai/gpt-oss-120b`,
  `qwen/qwen3.8-27b`.
- Best-effort (`strict: false`): above + `openai/gpt-oss-safeguard-20b`; invalid output → **HTTP 400**
  ("Generated JSON does not match the expected schema").
- `{ "type": "json_object" }` works on all models (no schema adherence) → used for the compound systems,
  with the JSON schema embedded in the prompt and Zod validation afterwards.
- Strict-mode schema rules: every property in `required`; `additionalProperties: false` on all objects;
  optional = union with null (`anyOf` / `["string","null"]`); `anyOf` supported; `$ref`/`$defs` supported.
- **Not supported**: `minLength`, `maxLength`, `pattern`, `format`. Streaming and tool use are not
  supported together with structured outputs.
- Implication: length limits (e.g. description ≤ 160) are enforced by Zod + DB, not by the provider schema.

### 1.5 Reasoning parameters (affects latency / token use)
- gpt-oss: `reasoning_effort: "low" | "medium" | "high"`; they do **not** support `reasoning_format`,
  use `include_reasoning: false` to drop reasoning text.
- qwen3.8-27b: `"none" | "default" | "low" | "medium" | "high"`.
- Non-gpt-oss models: `reasoning_format: "parsed" | "raw" | "hidden"`; `raw` + JSON mode → 400.

### 1.6 Rate limits
- Dimensions: RPM, RPD, TPM, TPD, ASH, ASD (audio), ITPM/OTPM. A free-plan table exists but is partial
  and changes; **not hard-coded**.
- 429 on breach. Headers (returned on every response; `retry-after` only when limited):

| Header | Value |
|---|---|
| `retry-after` | seconds, e.g. `2` |
| `x-ratelimit-limit-requests` | RPD |
| `x-ratelimit-limit-tokens` | TPM |
| `x-ratelimit-remaining-requests` | int |
| `x-ratelimit-remaining-tokens` | int |
| `x-ratelimit-reset-requests` | duration, e.g. `2m59.56s` |
| `x-ratelimit-reset-tokens` | duration, e.g. `7.66s` |

- Implementation: parse all of them on every response (`RateLimitSnapshot`), honor `retry-after`,
  cool down the model until reset when `remaining-tokens` < estimated request tokens, exponential backoff
  with full jitter otherwise.

### 1.7 Speech-to-text (Faz 7 — checked 2026-09-15)
Source: https://console.groq.com/docs/speech-to-text
- `POST /openai/v1/audio/transcriptions` (multipart). Fields: `file` (or `url`), `model`, optional `language`
  (ISO-639-1, e.g. `tr`), `prompt` (≤ 224 tokens — we pass template names as vocabulary), `response_format`
  (`json` | `verbose_json` | `text`; we use `verbose_json` for `language` + `duration`), `temperature` (0–1),
  `timestamp_granularities[]`.
- Formats: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm. Size: **25 MB free tier**, 100 MB dev tier.
  Minimum billed length 10 s. Audio is downsampled to 16 kHz mono server-side → the app records mono 16 kHz AAC.
- `whisper-large-v3-turbo` (faster, cheaper, no translation) → primary; `whisper-large-v3` → fallback.

### 1.8 Compound systems (Faz 7 — checked 2026-09-15)
> 2026-09-21: the research feature that used compound was removed with the branches (DECISIONS D-151); the notes
> stay as provider knowledge. No code calls compound any more.

Sources: https://console.groq.com/docs/compound, …/compound/built-in-tools, …/compound/systems/compound,
https://console.groq.com/docs/web-search
- `groq/compound` (several tool calls per request) and `groq/compound-mini` (one tool call, ~3× lower latency)
  via the normal chat completions endpoint. Context 131,072, max output 8,192. Capabilities list includes
  **JSON Object Mode** (no strict json_schema) → the router embeds the schema in the prompt and Zod validates.
- Built-in tools: `web_search`, `visit_website`, `code_interpreter`, `wolfram_alpha`; all enabled by default.
  We restrict with `compound_custom: { tools: { enabled_tools: [...] } }` (research: `web_search` + `visit_website`).
- Response: `choices[0].message.executed_tools[]`, web search results under `search_results` (title, url, content,
  score) → surfaced as `CallMeta.sources`. Search is powered by Tavily. `search_settings`
  (`include_domains` / `exclude_domains` / `country`) exists; the `country` value format is not documented → unused.
- Not documented: `temperature`, `reasoning_effort` → not sent for compound models. Rate limits follow the
  underlying models. Versioning header `Groq-Model-Version` (not used — latest).
- Unverified until `pnpm test:smoke` runs with a key: JSON mode behaviour and the exact `executed_tools` shape
  (parsed leniently: array or `{ results: [...] }`).

---

## 2. Gemini

Sources: [docs home (tr)](https://ai.google.dev/gemini-api/docs?hl=tr) ·
[Interactions overview](https://ai.google.dev/gemini-api/docs/interactions-overview) ·
[structured output](https://ai.google.dev/gemini-api/docs/structured-output) ·
[image understanding](https://ai.google.dev/gemini-api/docs/image-understanding) ·
[embeddings](https://ai.google.dev/gemini-api/docs/embeddings) ·
[rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) · [models](https://ai.google.dev/gemini-api/docs/models) ·
(extra) [quickstart](https://ai.google.dev/gemini-api/docs/quickstart), SDK types from `googleapis/js-genai`.

### 2.1 SDK + default API
- SDK: `@google/genai` (`new GoogleGenAI({ apiKey })`), env var convention `GEMINI_API_KEY`.
- **Interactions API is the default interface since June 2026**; `generateContent` "remains fully supported"
  but is legacy. New code uses `ai.interactions.create(...)`.

```ts
const interaction = await ai.interactions.create({
  model: 'gemini-3.8-flash',
  system_instruction: '...',
  input: [
    { type: 'text', text: 'Read this menu.' },          // text BEFORE the image (docs tip)
    { type: 'image', data: base64, mime_type: 'image/jpeg' },
  ],
  response_format: { type: 'text', mime_type: 'application/json', schema: jsonSchema },
  generation_config: { max_output_tokens: 4096, thinking_level: 'low' },
  store: false,
});
interaction.output_text;                       // JSON string
interaction.usage?.total_input_tokens;         // also total_output_tokens, total_thought_tokens, total_tokens
```
- Request type (SDK `CreateModelInteraction`): `model, input, system_instruction, generation_config,
  response_format, store, stream, background, tools, previous_interaction_id, safety_settings, ...`.
- `generation_config` for Gemini 3 has **no `temperature`** (fields: `max_output_tokens`, `seed`,
  `stop_sequences`, `thinking_level`, `thinking_summaries`, `tool_choice`, ...).
- Abort: passed via request options (`fetch_options.signal`) — verified against installed `.d.ts`.
- Streaming (`stream: true`) yields SSE events: `interaction.created`, `interaction.status_update`,
  `step.start`, `step.delta` (`event.delta.text`, partial JSON that concatenates), `step.stop`,
  `interaction.completed`, `error`. We do not stream model output (cards are emitted per batch).
- **Storage**: `store` defaults to `true`; interactions are retained **55 days (paid) / 1 day (free)**.
  Menu data belongs to the vendor → we always send `store: false` (stateless).

### 2.2 Structured output
- Interactions API: `response_format: { type: 'text', mime_type: 'application/json', schema }`.
- Supported JSON Schema subset: types `string, number, integer, boolean, object, array, null`; `title`,
  `description`, `properties`, `required`, `additionalProperties`, `enum`, `format` (date/time),
  `minimum`/`maximum`, `items`, `prefixItems`, `minItems`/`maxItems`, `$ref`, `anyOf`.
- `minLength`/`maxLength`/`pattern` are not listed → stripped; enforced by Zod.
- "Very large or deeply nested schemas may be rejected" → keep LLM schemas flat and small.
- Output is syntactically valid JSON; semantic validation is ours (Zod).

### 2.3 Image understanding
- MIME types: `image/png`, `image/jpeg`, `image/webp`, `image/heic`, `image/heif`.
- Inline data: total request (prompt + system + inline bytes) ≤ **20 MB**; Files API for larger.
- Up to 3,600 images/request (irrelevant: one image per call).
- Tokens: ≤384 px both sides → 258 tokens; larger images tiled into 768×768 tiles, **258 tokens/tile**
  (1600×1200 → 3×2 tiles ≈ 1,548 tokens). `media_resolution` caps tokens per image.
- Tips: single image + text → put the text prompt **before** the image; use sharp, correctly rotated images.

### 2.4 Embeddings
- Method: `ai.models.embedContent({ model, contents, config: { outputDimensionality } })` (not Interactions).
- `gemini-embedding-2`: multimodal, default **3072** dims, 128–3072 supported, recommended 768/1536/3072,
  **truncated dims auto-normalized**, **8,192** input tokens. `gemini-embedding-001`: text-only, 2,048 tokens,
  needs manual normalization below 3072. **Vector spaces of 001 and 2 are incompatible** → store `model` + `dim`.
- `gemini-embedding-2` has **no `task_type`**; the task goes into the text:
  - query: `task: search result | query: {content}`
  - document: `title: {title} | text: {content}`
- Multiple strings passed directly in `contents` produce **one aggregated embedding**. To get one vector per
  text, wrap each in its own `Content`: `contents: texts.map(t => ({ parts: [{ text: t }] }))` →
  `response.embeddings[i].values`.
- **Discrepancy**: the models page lists `gemini-embedding-2-preview`, the embeddings page uses
  `gemini-embedding-2`. Default = `gemini-embedding-2` (config), smoke test verifies; switch in
  `models.ts` / `provider_configs` if the API returns 404.

### 2.5 Rate limits
- Dimensions RPM / TPM (input) / RPD; tiers Free, Tier 1 (billing linked), Tier 2 ($100+, 3 days),
  Tier 3 ($1,000+, 30 days). **No per-model free-tier table on the page** (shown in AI Studio).
- Limits apply **per project**, not per key. RPD resets at midnight **Pacific**.
- Rate-limit error: **429 `RESOURCE_EXHAUSTED`**. Retry delay may appear in error details
  (`google.rpc.RetryInfo.retryDelay`, e.g. `"34s"`); parsed when present, otherwise adaptive backoff.

### 2.6 Models used (from the models page)
| Model ID | Status | Use here |
|---|---|---|
| `gemini-3.8-flash` | stable | enrichment fallback, last vision fallback (free tier: 20 requests/day) |
| `gemini-3.5-flash-lite` | stable | primary vision extraction (~3 s per menu photo), classify, gap suggestions |
| `gemini-3.1-pro-preview` | preview | deep analysis mode only |
| `gemini-embedding-2` | see 2.4 | embeddings @768 |

Other listed IDs (not used): `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.1-flash-lite`,
`gemini-3-flash-preview`, `gemini-2.5-*`, image/video/music/TTS/transcribe models. Shut down:
`gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-3.1-flash-lite-preview`, `gemini-3-pro-preview`.

---

## 3. Deviations from the task prompt (and what we do)

| Prompt says | Docs say | Decision |
|---|---|---|
| Vision fallback `qwen/qwen3.6-27b` | qwen3.6 = JSON mode only (later removed); qwen3.8 has **strict** schemas | Chain (D-141): gemini-3.5-flash-lite → qwen3.8-27b (strict, 1000 output tokens) → gemini-3.8-flash |
| `gemini-embedding-2` | models page: `gemini-embedding-2-preview` | keep `gemini-embedding-2`, verify in smoke test |
| Interactions structured output | field is `response_format` with `mime_type` + `schema` | as documented |
| (not mentioned) | Interactions `store` defaults to true (1–55 day retention) | always `store: false` |
| (not mentioned) | Gemini 3 has no `temperature` in `generation_config` | use `thinking_level` / `max_output_tokens` only |
| (not mentioned) | multiple texts in one `contents` → one aggregated vector | one `Content` per text |
| (not mentioned) | Groq strict mode rejects `minLength/maxLength/pattern/format` | sanitize schema per provider; Zod enforces limits |
| Whisper in "Faz 6" (section 0) vs "Faz 7" (section 6) | — | built in Faz 7: `audio.transcribe` (turbo → v3), `research.web` (compound → compound-mini) |

## 4. Measured with real keys (2026-09-18, free tiers)

| What | Result |
|---|---|
| Gemini response schema with `minItems`/`maxItems` | 400 "Request contains an invalid argument" → dropped in `forGemini()` |
| gemini-3.5-flash-lite, 15-item menu photo | 2.8–3.1 s, 15/15 items; panel screenshot ~2 s |
| gemini-3.8-flash, same photo | 13–20 s, frequent 503/429; free tier **20 requests/day** |
| qwen/qwen3.8-27b | free tier **1000 output tokens/minute**; `max_completion_tokens` above it → 413 |
| openai/gpt-oss-120b / 20b | free tier 8K tokens/minute, 1K requests/day; large `max_completion_tokens` accepted |
| groq/compound, compound-mini + web_search | 413 "Request Entity Too Large" / 429 on the internal model (free tier) |
| Gemini Interactions + `google_search` tool | 429 immediately on the free key (plain calls work) |
| Live check (`pnpm live:check`) | 14/14; Mod 1 first card 3.8 s; Mod 2 two screenshots 2.6 s; research → clear plan-limit error |
| 2026-09-21, Gemini key | 403 `PERMISSION_DENIED` "Your project has been denied access" (worked the night before) → every chain on Groq (D-164) |
| 2026-09-21, live check on `/analyze` | 14/15: typed menu 0.3–5.9 s, re-run 2.6 s, two screenshots 2.2 s; the 15-item menu photo fails on Groq alone (1000 output tokens/minute) |
