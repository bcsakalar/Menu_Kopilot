# Sohbet API'si ve akış sözleşmesi (SSE)

## Mesaj göndermek

`POST /api/v1/chat/messages`: multipart (görüntüsüz mesaj JSON da olabilir). Ziyaretçiye açıktır; çerez yoksa bu istek
bir ziyaretçi oluşturur ve `mk_visitor` çerezini cevaba koyar. IP başına dakikada 20 istek.

| alan | | |
|---|---|---|
| `conversationId` | isteğe bağlı | yoksa yeni görüşme açılır |
| `text` | isteğe bağlı | en çok 4000 karakter |
| `images` | ≤ 5 | menü fotoğrafı ya da panel ekran görüntüsü; örtüşen görüntüler tekrarsız birleşir |

`text` ya da en az bir görüntü gerekir. Doğrulama hataları akış açılmadan normal JSON hata olarak döner; sonrası SSE'dir.
Tarayıcı bağlantıyı kapatsa da cevap sunucuda tamamlanır ve görüşmeye kaydedilir; `GET /chat/conversations/:id` sonradan
getirir (site, sayfa yenilenince bunu bekler).

Diğer uçlar: `GET /chat/conversations` (bu tarayıcının görüşmeleri), `GET /chat/conversations/:id` (mesajlar ve her
analizin tam sonucu), `DELETE /chat/conversations/:id`.

## Çerçeve

```
id: <sıra>
event: <tür>
data: <JSON, "type" alanını da içerir>
```

Her 15 saniyede bir `: ping` yorumu gönderilir.

## Sıra

Bir mesajın akışı:

`conversation → user_message → [analiz olayları] → conversation → message`

Analiz çalışmayan mesajlarda (doğrudan cevap) köşeli parantez içindeki kısım yoktur. Analiz olayları:

`run → progress* → classification → menu → counts → progress → item* → done`; her ajan adımından sonra `trace`, bir
şey kötüleştiğinde `warning`. **`counts` her zaman ilk `item`'dan önce gelir**: telefonda ilk önemli olan sayıdır.

| olay | veri | not |
|---|---|---|
| `conversation` | `{ conversation: { id, title, updatedAt } }` | başta ve sonda (başlık analizden sonra güncellenir) |
| `user_message` | `{ message }` | kaydedilen kullanıcı mesajı |
| `run` | `{ runId }` | analizin ilk olayı |
| `progress` | `{ agent, message, done?, total? }` | durum satırı; `done/total` okunan görüntü sayısı |
| `classification` | `{ classification: { cuisineId, cuisineName, priceSegment, confidence, reason, … } }` | mutfak türü |
| `menu` | `{ items: MenuItem[] }` | restoranın zaten sattıkları, tekrarsız |
| `counts` | `{ counts: { current, target, missing, cuisineName, cuisineId, categories: CategoryCount[] } }` | `target = max(10, mutfak minimumu)`; `categories` en boş olandan başlar |
| `item` | `{ card }` | A, B ya da C bölümünden bir kart (aşağıda) |
| `trace` | `{ step }` | bir ajan adımı: `agent, status, provider, model, durationMs, tokensIn, tokensOut, llmCalls, error` |
| `warning` | `{ code, message }` | aşağıda |
| `done` | `{ status, stats }` | `status`: completed \| partial \| failed \| cancelled |
| `message` | `{ message }` | asistanın cevabı: `text`, `quickReplies` (sıradaki adım düğmeleri) ve analiz varsa `result` (tam sonuç) |
| `error` | `{ code, message }` | analiz bitmeden kesildi |

Uyarı kodları: `local_only` / `quota_exceeded` / `not_configured` (yapay zekâ kapalı, yalnızca havuz), `images_skipped`,
`extract_failed` (bazı görüntüler okunamadı), `no_items`, `agent_failed` (bir ajan hata verdi, analiz onsuz devam etti),
`slow_providers` (öneri süresi doldu, havuz cevapları gönderildi), `recommend_failed`, `options_failed`,
`target_unreachable` (hepsi kabul edilse bile menü hedefin gerisinde; site bunu göstermez).

## Kart (`item.card`, `result.cards[]`)

Her bölüm aynı biçimi kullanır; bölümün kullanmadığı alanlar boştur.

```jsonc
{
  "id": "uuid",
  "runId": "uuid",
  "section": "new_product | option | fix",   // A: yeni ürün · B: opsiyon ve malzeme · C: düzeltme
  "name": "Ayran",              // A: önerilen ürün. B/C: kartın konusu olan ürün (havuzdaki yazılış)
  "targetName": "Ayran 300ml",  // B/C: panelde yazıldığı gibi. A: null
  "categoryKey": "icecek", "categoryLabel": "İçecek",
  "source": "seed | db | ai | review",
  "shortDescription": "Taze yoğurttan tuzlu ayran, soğuk servis edilir.",
  "portionInfo": "300 ml",
  "priceRangeHint": "25–40 TL", // A: yalnızca konuşma notu, şablona asla yazılmaz
  "reason": "İçecek kategorisi boş (0/2)",
  "pitch": "Menünüzde hiç içecek yok; …",   // restorana söylenecek cümle
  "basedOn": "Adana Kebap",     // A: hangi menü ürününün alternatifi (yoksa null)
  "optionGroups": [
    { "name": "Boy", "selectionType": "single | multi", "isRequired": true, "minSelect": 1, "maxSelect": 1,
      "options": [{ "name": "Yarım", "priceMode": "sets_base" }, { "name": "Tam", "priceMode": "sets_base" }] }
  ],
  "removableIngredients": ["Soğan"], "extraIngredients": ["Ekstra Lavaş"],
  "fixKind": "empty_description | bad_name | wrong_category | null",       // C
  "currentValue": "Karışık Pd", "suggestedValue": "Karışık Pide",           // C
  "sortOrder": 0
}
```

`priceMode`, paneldeki "fiyat farkının" sözle anlatımıdır: `free` (ücretsiz), `surcharge` (ek ücretli), `sets_base`
(tabanı belirler: seçilmesi ürünün taban fiyatını belirler, örneğin "Boy: Tam"). Tutar asla önerilmez.

## Admin uçları

`POST /api/v1/analyze` aynı analizi sohbetsiz çalıştırır (multipart: `images[]`, `menuText?`, `cuisineId?`, `notes?`,
`fromRunId?`, `mode?`, `debug?`; `Accept: text/event-stream` ile SSE, `?async=1` ile `202 { runId }`, yoksa sonucu bekler).
`POST /suggestion-items/:id/accept | skip | later` bir kartı şablon havuzuna yazar ya da öğrenme döngüsüne işler. İkisi de
yalnızca admin içindir; site bunları kullanmaz.

Kategoriler ve mutfak beklentileri veritabanında tutulur, yönetim panelinden düzenlenir: `GET /categories`,
`PATCH /categories/:key`, `GET/PUT /cuisines/:id/categories`. Panelden yapılan değişikliğin üzerine tohumlama yazmaz.
