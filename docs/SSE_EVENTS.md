# Streaming contract (SSE)

`POST /api/v1/suggest` and `POST /api/v1/suggest/:runId/continue` stream Server-Sent Events when the request has
`Accept: text/event-stream`. Each message is:

```
id: <sequence>
event: <type>
data: <JSON, also contains "type">
```

A `: ping` comment is sent every 15 s. The run keeps going if the client disconnects; re-attach with
`GET /api/v1/suggest/:runId/events` (replays past events) or read `GET /api/v1/suggest/:runId` (snapshot).
Cancel with `POST /api/v1/suggest/:runId/cancel`.

| event | payload | notes |
|---|---|---|
| `run` | `{ runId, cuisineId, resumed, budget: { maxCalls, maxInputTokens } }` | always first |
| `progress` | `{ stage: extract\|retrieve\|canonicalize\|enrich\|finalize, message, done?, total? }` | UI status line |
| `extracted` | `{ names: string[] }` | names read from one photo — show placeholders |
| `item` | `{ card }` — see `cardDtoSchema` | one per product, in display order |
| `warning` | `{ code, message }` | `provider_fallback`, `local_only`, `quota_exceeded`, `images_skipped`, `extract_failed`, `not_a_product` |
| `budget_exhausted` | `{ pendingItems, pendingImageHashes, message }` | offer "Devam et" (re-send the listed images) |
| `done` | `{ status, stats }` | `status`: completed \| partial \| cancelled; `stats.cacheHit` = no external API call |
| `error` | `{ code, message }` | terminal |

## Card (`item.card`)

```jsonc
{
  "id": "uuid",               // suggestion item id → /suggestion-items/:id/accept | skip
  "runId": "uuid",
  "rawName": "İçli Köfte",
  "origin": "seed | db | ai | review",   // badge: Hazır şablon / DB'den / AI / İnceleme gerek
  "matchedTemplateId": "uuid | null",
  "matchType": "exact | alias | trigram | vector | canonical | null",
  "score": 0.91,
  "needsReview": false,
  "reviewReason": null,        // e.g. "Bunu bilmiyorum, sen doldur."
  "confidence": 0.93,
  "sectionText": "ARA SICAKLAR",
  "status": "pending | accepted | skipped",
  "sortOrder": 7,
  "payload": { /* TemplatePayload: name, description (≤160), servingNote, portionInfo, optionGroups[], removableIngredients[], extraIngredients[], tags[], allergenNotes[], upsellSuggestion */ }
}
```

Prices never appear in cards. `priceMode` is `free | surcharge | sets_base` (`sets_base` = selecting the option sets
the product's base price, e.g. "Boy: Orta").

---

# Gap analysis (Mod 2)

`POST /api/v1/gap-analysis` (multipart: `branchId`, `menuText?`, `extraNotes?`, `images` ≤ 5 panel screenshots;
screenshots or `menuText` required) streams with the same framing. `menuText` = products typed or dictated during the
call ("adana, urfa, lahmacun ve ayran var"), parsed without an LLM — a run with only `menuText` needs no AI key. Re-attach: `GET /api/v1/gap-analysis/:runId/events`; result: `GET /api/v1/gap-analysis/:runId`;
latest of a branch: `GET /api/v1/branches/:id/gap/latest`; cancel: `POST /api/v1/gap-analysis/:runId/cancel`.

The order is fixed so the phone can show the most useful parts first during a call:
`run → progress* → counts → questions → items → recommendations(db) → [recommendations(ai) → questions_append] → done`.

| event | payload | notes |
|---|---|---|
| `run` | `{ runId, branchId }` | always first |
| `progress` | `{ stage: extract\|analyze\|recommend, message, done?, total? }` | status line |
| `counts` | `{ counts: { current, target, missing, fromScreenshots, cuisineMin, targetOverridden } }` | big "x / hedef"; `current` = union of the stored branch menu, the screenshots and the typed products |
| `questions` | `{ items: Question[] }` | "Çağrıda sor" checklist, ≤ 15 |
| `items` | `{ items: GapItem[] }` | one per unique product (screenshots first; a typed product already seen on a screenshot is not repeated) |
| `recommendations` | `{ source: db\|ai, items: Recommendation[] }` | `db` always sent (may be empty); `ai` only when the DB could not fill the list |
| `questions_append` | `{ items: Question[] }` | "var mı?" lines for AI recommendations |
| `warning` | `{ code, message }` | `provider_fallback`, `extract_failed`, `ai_unavailable`, `no_items`, `ai_recommendations_failed` |
| `done` | `{ status, stats: { llmCalls, latencyMs, screenshots, extracted, unique, cacheHit, typed } }` | `status`: completed \| partial \| failed \| cancelled (`failed` only when every screenshot failed and nothing was typed) |
| `error` | `{ code, message }` | terminal |

```jsonc
// GapItem
{ "name": "Adana Kebap", "normalized": "adana kebap",
  "flags": { "description": "present", "options": "present", "removables": "absent" },   // present | absent | unknown
  "completeness": 0.75, "status": "ok | incomplete",
  "missing": [{ "field": "removables", "state": "absent" }],   // badges; fields the template lacks are not expected
  "matchedTemplateId": "uuid | null", "templateName": "Adana Kebap", "origin": "seed | db | null",
  "sectionText": "Kebaplar", "seenIn": 1,
  "typed": false }   // true = typed/dictated: fields unknown, no badges, no missing-field questions
// Question — key is stable across runs (ticks are stored per key on the phone)
{ "key": "fields:lahmacun:dor", "text": "Lahmacun: açıklamayı, seçenekleri ve çıkarılabilir malzemeleri sor",
  "kind": "missing_item | missing_field | cuisine", "itemName": "Lahmacun",
  "hints": ["Boy: Fındık (Küçük) / Normal / Büyük · ayrıca Acı Seviyesi, Hamur, Yanında"] }
// Recommendation
{ "name": "Beyti Sarma", "reason": "Kebap & Izgara menülerinde sık görülür", "importance": 70,
  "source": "db | ai", "templateId": "uuid | null" }
```

Completeness weights: description .40, options .35, removable ingredients .25; `unknown` counts half; `ok` ≥ 0.85.

Typed products are stored on the branch menu as `manual` rows only when the product is new (or was only recommended);
they never overwrite what a screenshot or an accepted card says about a product. The warning `ai_unavailable` also
covers a server without any AI key (`not_configured`).
