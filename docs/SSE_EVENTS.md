# Analysis API and streaming contract (SSE)

One endpoint does what "Öneri" and "Tamamla" used to do separately:

`POST /api/v1/analyze` — multipart (or JSON without images):

| field | | |
|---|---|---|
| `images` | ≤ 5 | platform panel screenshots and/or menu photos; overlapping screenshots are deduplicated |
| `menuText` | optional | products typed or dictated during the call, `,` / `;` / newline separated — parsed without a model |
| `cuisineId` | optional | the user's pick; left out → the Classifier decides |
| `notes` | optional | free text for the call |
| `fromRunId` | optional | re-run of an earlier analysis (another cuisine picked on the result screen): that run's product list is reused, no image is sent or read again (`409` when the run cannot be reused) |
| `debug` | optional | `true` stores every agent's input/output for the hidden debug screen |

At least one image, `menuText` or a reusable `fromRunId` is required.

Response modes:

- `Accept: text/event-stream` → SSE (below). The phone uses this.
- `?async=1` → `202 { runId }` (offline queue flush).
- otherwise → waits and returns the result (`analyzeResultSchema`, same shape as the snapshot).

Around a run: `GET /analyze/:runId` (snapshot) · `GET /analyze/:runId/events` (re-attach; replays past events, or
the stored result once the run left memory) · `GET /analyze/latest` (restore after the phone locked mid-call) ·
`GET /analyze/:runId/trace` (agent steps) · `POST /analyze/:runId/cancel` · `POST /suggestion-items/:id/accept`
(body `{ payload? }`) · `POST /suggestion-items/:id/skip`.

## Framing

```
id: <sequence>
event: <type>
data: <JSON, also contains "type">
```

A `: ping` comment is sent every 15 s. The run keeps going if the client disconnects.

## Order

`run → progress* → classification → menu → counts → progress → item* → done`, with `trace` after every agent step
and `warning` whenever something degrades. **`counts` always comes before the first `item`**: on a phone call the
number ("5 / 10") is the first thing that matters.

| event | payload | notes |
|---|---|---|
| `run` | `{ runId }` | always first |
| `progress` | `{ agent, message, done?, total? }` | status line; `done/total` = images read |
| `classification` | `{ classification: { cuisineId, cuisineName, priceSegment, confidence, reason, disagrees, suggestedCuisineId, suggestedCuisineName } }` | `disagrees` → the phone offers "X olarak yeniden analiz et" (a `fromRunId` re-run) |
| `menu` | `{ items: MenuItem[] }` | what the restaurant already sells, deduplicated |
| `counts` | `{ counts: { current, target, missing, hardMinimum, cuisineMin, cuisineName, cuisineId, categories: CategoryCount[] } }` | `target = max(hardMinimum 10, cuisineMin)`; `categories` = the cuisine's expected categories, emptiest first |
| `item` | `{ card }` | one card of section A, B or C (below), in display order |
| `trace` | `{ step }` | one agent step: `agent, label, status (ok\|failed\|skipped), provider, model, durationMs, tokensIn, tokensOut, llmCalls, input?, output?, error` — payloads only with `debug` |
| `warning` | `{ code, message }` | see below |
| `done` | `{ status, stats }` | `status`: completed \| partial \| failed \| cancelled |
| `error` | `{ code, message }` | terminal |

Warning codes: `local_only` / `quota_exceeded` / `not_configured` (AI off: answered from the template pool only),
`images_skipped`, `extract_failed` (some images unreadable), `no_items`, `agent_failed` (an agent threw; the run
continued without it), `slow_providers` (the recommender/option deadline of 11 s passed; database answers shipped),
`recommend_failed`, `options_failed`, `target_unreachable` (even accepting everything leaves the menu short).

`stats`: `llmCalls, tokensIn, tokensOut, latencyMs, imagesRead, imagesFailed, menuItems, newProducts, optionCards,
fixCards, dropped` (cards the Validator refused), `cacheHit` (no model call at all).

## Card (`item.card`)

Every section uses one shape; fields a section does not use are empty.

```jsonc
{
  "id": "uuid",                 // → /suggestion-items/:id/accept | skip
  "runId": "uuid",
  "section": "new_product | option | fix",
  "name": "Ayran",              // A: the proposed product. B/C: the product the card is about (canonical spelling)
  "targetName": "Ayran 300ml",  // B/C: as written on the panel. A: null
  "targetNormalized": "ayran 300ml", // B/C: join key to menu[].normalized. A: null
  "categoryKey": "icecek", "categoryLabel": "İçecek",
  "source": "seed | db | ai | review",   // badge: Hazır şablon / DB'den / AI / İnceleme gerek
  "matchedTemplateId": "uuid | null",
  "shortDescription": "Taze yoğurttan tuzlu ayran, soğuk servis edilir.",  // A: one line to paste
  "portionInfo": "300 ml",
  "priceRangeHint": "25–40 TL", // A: a call note only — never written into a template
  "reason": "İçecek kategorisi boş (0/2)",
  "importance": 70,
  "optionGroups": [             // B
    { "name": "Boy", "selectionType": "single | multi", "isRequired": true, "minSelect": 1, "maxSelect": 1,
      "options": [{ "name": "Yarım", "priceMode": "sets_base" }, { "name": "Tam", "priceMode": "sets_base" }] }
  ],
  "removableIngredients": ["Soğan"], "extraIngredients": ["Ekstra Lavaş"],   // B
  "fixKind": "empty_description | bad_name | wrong_category | null",       // C
  "currentValue": "Karışık Pd", "suggestedValue": "Karışık Pide",           // C
  "payload": { /* A: the full TemplatePayload written to the pool on accept */ },
  "status": "pending | accepted | skipped",
  "sortOrder": 0
}
```

`priceMode` is the panel's "fiyat farkı" in words: `free` (ücretsiz), `surcharge` (ek ücretli), `sets_base`
(tabanı belirler — choosing it sets the product's base price, e.g. "Boy: Tam"). Amounts are never suggested.

Accept semantics: a section A card writes its payload into the template pool (a new template, or merged into the
matching one). A section B card MERGES into the product's template — groups of the same name are replaced, other
groups, the description and the tags are kept, ingredient lists are unioned. A section C card is a note for the
call: accepting it only ticks it off.

## Categories (settings)

The Gap Analyst's yardstick lives in Postgres and is edited from the phone (Ayarlar):

- `GET /categories` · `PATCH /categories/:key` `{ label?, sortOrder?, keywords? }` — keywords are stored normalized
  (`"Şalgam"` → `salgam`); a multi-word keyword matches as a phrase.
- `GET /cuisines/:id/categories` · `PUT /cuisines/:id/categories` `{ items: [{ categoryKey, minItems }] }` — the
  complete set for the cuisine.

An edit marks the row as the user's: the seed that runs on every start no longer overwrites it.
