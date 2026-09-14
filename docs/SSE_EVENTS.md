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
