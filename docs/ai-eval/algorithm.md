# Öneri algoritması — katmanlı hibrit tasarım

AŞAMA 3 çıktısı. Baseline'daki kök nedenlerin (bkz. `baseline-report.md`) her biri bir katmana karşılık gelir: model
serbestçe öneriyor, ürünün ne olduğunu bilen ve modelin cevabını ona göre düzelten bir katman ise yoktu.

```
 fotoğraf / yazı
      │
 1 ANLAMA ─────────── ad normalize · havuz eşleşmesi (+ çelişki koruması) · kategori · ÜRÜN TİPİ
      │
 2 BİLGİ TABANI ───── mutfak → ürün tipi → opsiyon şablonları, tipik çıkarılabilir/ekstra, yasaklar, açıklama
      │                (Postgres'te, sürümlü, düzenlenebilir; ekibin geri bildirimiyle beslenir)
 3 ÜRETİM ─────────── havuz önce · sonra model (katı JSON, tip rehberi bağlamda, 6–8 kelimelik açıklama aynı cevapta)
      │                Gemini ↔ Groq yedekli, paralel küçük partiler
 4 DOĞRULAMA ──────── ayrıştırma · tipe uygunluk · şekil · tamamlama · açıklama · güven puanı
      │
 5 KAPSAM GARANTİSİ ─ menüdeki her ürün kart alır; model yetişemezse havuz/bilgi tabanı
      │
 telefonda: ürün başına tek kart, 4 bölüm  ──(kabul/çıkar)──►  6 ÖĞRENME
```

## 1. Anlama

| adım | nasıl | nerede |
|---|---|---|
| Ad temizliği | Türkçe'ye duyarlı normalizasyon ("çorbası" → "corba"), hacim/fiyat ayıklama | `lib/normalize-tr.ts`, `agents/validator.ts` |
| Havuz eşleşmesi | kesin ad → takma ad → trigram → vektör. **Bulanık eşleşmeye koruma:** iki ad aynı ailede birbirinde olmayan bir kelime taşıyorsa (pişirme: ızgara/buğulama; iç: kıymalı/kaşarlı; protein: tavuk/et; biçim: dürüm/kâse) eşleşme reddedilir. "Levrek Buğulama" artık "Levrek Izgara" sayılmaz (D-182). | `modules/retrieval`, `lib/same-product.ts` |
| Kategori | restoranın kendi başlığı → anahtar kelime; başlık yoksa ve ürün tipi addan bulunduysa içecek/tatlı karışıklığında tipin kategorisi kazanır ("Tavuk Suyu Çorbası" çorbadır, D-183) | `domain/category.ts`, `domain/product-type.ts` |
| Mutfak türü | model (sınıflandırıcı); model cevap veremezse ya da emin değilse menünün kendi ürün tipleri oy verir — tipin asıl mutfağına tam oy, diğerlerine üçte bir (27 menünün 26'sı doğru, D-187). Kullanıcının seçimi her zaman kazanır. | `agents/classifier.ts` |
| **Ürün tipi** | ifade bazlı anahtar kelimeler (uzun ifade kazanır), biçim tiplerine öncelik ("Tavuk Döner Dürüm" bir dürümdür), mutfak eşitlik bozucu, bulunamazsa kategori → mutfak varsayılanı → genel tabak | `domain/product-type.ts` |

## 2. Bilgi tabanı (D-179)

`product_types` tablosu, 48 tip (kebap porsiyon, dürüm, pide, lahmacun, şerbetli tatlı, sıcak kahve, meşrubat…).
Her satır:

| alan | ne işe yarar |
|---|---|
| `keywords`, `priority`, `cuisines` | tipi addan bulmak |
| `plain` | paketli içecek: açıklama ve opsiyon yok, adıyla eklenir |
| `option_groups` | bu tip ürünün panelde tipik açtığı gruplar (seçenek ve fiyat etkisiyle) |
| `removable`, `extras` | tipik çıkarılabilir ve ek ücretli malzemeler |
| `forbidden_groups` | bu tipte **asla** olmayan gruplar (tatlıda "Acı Seviyesi", çorbada "Pişirme Derecesi") |
| `forbidden_ingredients` | bu tipte asla olmayan malzemeler (çiğ köftede et/kaşar, tatlı ve içecekte soğan/turşu) |
| `fallback_description` | her ürün için doğru olan 6–8 kelime; yalnızca son çare |
| `version`, `edited_by_user` | tohum sürümü; kullanıcının düzenlediği satıra tohum bir daha dokunmaz |

Tablo her analizde taze okunur; bir düzenleme bir sonraki analizde geçerlidir. Üç yerde kullanılır: modele bağlam
olarak verilir (tip rehberi), doğrulayıcı kural olarak uygular, eksik kalan bölümü tamamlamakta kullanılır.

## 3. Üretim

- **Yeni ürünler:** önce onaylı havuz şablonları (kategori kotasına göre, en boş kategoriden başlayarak), sonra
  model. Model cevabı havuzda varsa şablona bağlanır (bulanık eşleşmede aynı çelişki koruması). Prompt v6:
  açıklama 6–8 kelime; yalnızca paketli içecek düz satır, kahve/limonata/milkshake değil.
- **Menüdeki ürünler:** havuzda kartı olan ürün model çağrısı olmadan kartını alır. Kalanlar modele 6'şarlı
  partilerle, paralel ve farklı sağlayıcılarla gider. Prompt v4: her ürünün yanında `[tip: …]`, partinin altında
  **tip rehberi** (tipik gruplar, çıkarılabilir, ekstra, ASLA olmayan gruplar, ekibin sürekli sildikleri); aynı
  cevapta 6–8 kelimelik açıklama.
- **Katı JSON:** zod şemaları; kablo şeması kartınkinden geniş tutulur ki tek bozuk öğe bütün partiyi düşürmesin;
  şemadan geçmeyen cevaba tam bir onarım turu (küçük modelde), ikincisi yok.
- **Yedekleme:** her görevin sağlayıcı zinciri (Gemini ↔ Groq) ayarlardan değiştirilebilir; deneme başına zaman
  aşımı (sınıflandırıcıda 3 sn, D-185), devre kesici, partilerin farklı sağlayıcıdan başlaması, analiz başına süre
  sınırı (hızlı 11 sn, tam 26 sn). Süre dolduğunda eldeki havuz/bilgi tabanı cevabıyla bitirilir, ekran asla boş
  kalmaz.

## 4. Doğrulama ve puanlama

Her kart (havuzdan, modelden ya da hiçbir yerden gelmiş olsun) aynı sırayla geçer (`agents/grounding.ts`):

1. **Ayrıştırma** — tipin yasak grubu bütünüyle silinir; "Ekstra Malzeme / Ek Malzeme" grubu ekstralara, "İçine /
   Çıkarılacaklar" grubu çıkarılabilirlere taşınır; "Soğan: Soğanlı/Soğansız" gibi aç/kapa grup — ücretsizse
   çıkarılabilir, ücretliyse ekstra olur; "Ekstra X" çıkarılabilirden ekstraya, "…sız" ekstradan çıkarılabilire geçer.
2. **Tipe uygunluk** — ürünün adının zaten yaptığı seçim kaldırılır ("Somon Izgara"da "Pişirme Şekli", "Penne
   Arrabbiata"da "Makarna Türü"; adında dolgu olan "Kakaolu Çörek"e "Çeşit: Peynirli / Zeytinli" sorulmaz — menüdeki
   ürün restoranın kendi adıyla değerlendirilir, havuzun adı yanında); ürünün adını aldığı malzeme çıkarılabilir
   yazılmaz ("Kaşarlı Pide"de Kaşar, "Soğan Halkası"nda Soğan); tipin asla içermediği malzeme, adı tatlı olan
   üründe ("Kakaolu", "Çikolatalı"…) tuzlu malzeme ve gıda olmayan öğe ("Maket Bıçak") silinir; ekibin bu tipte
   sürekli sildiği öneri sunulmaz (D-188).
3. **Şekil** — panelin kanonik kuralları (tek seçim → en fazla 1, zorunlu → en az 1, tek taban fiyat grubu), aynı
   seçeneğin tekrarı, tek seçenekli grup; "Sossuz / Yok / Sade" hiçbir zaman ücretli değildir.
4. **Tamamlama** — önce bir grupta seçenek olan malzeme listesinden çıkar ("Yanında: Limon" varken çıkarılabilir
   "Limon" yazılmaz; grup seçimdir), sonra boş kalan bölüm tipten doldurulur (tek grup kaldıysa ikinciye
   tamamlanır); en sonda hiçbir şey hem çıkarılabilir hem ekstra, hem grup hem ekstra kalmaz. Bilgi tabanının kendi
   satırları da bu kurala uyar; bir test bunu her tip için denetler.
5. **Açıklama** — Türkçe, reklam dili yok, İngilizce yok, ASCII'ye düşmüş Türkçe yok; uzunsa virgülden 6–8 kelimeye
   kısaltılır, kısaltılamıyorsa tipin kendi açıklaması kullanılır.
6. **Güven puanı** (0–100) — kaynağa göre başlar (havuz 92, model 84, yalnızca bilgi tabanı 70), tip addan
   bulunamadıysa, yasak grup silindiyse, bölüm tamamlandıysa düşer. 60'ın altı telefonda "Kontrol et" olarak görünür.

## 5. Kapsam garantisi (D-181)

| | Hızlı ("yalandan olan") | Tam ("hakikaten olan") |
|---|---|---|
| Yeni ürün | 6 (menü 1–3 ürünse 7): önce her kategoriden bir; kategori ya da havuz yetmezse açık kategorilerden tamamlanır (D-189) | mutfağın açılış hedefine kadar (+2), en az 8, en çok 40 |
| Menüdeki ürünlerin kartı | **hepsi** (en çok 40) | **hepsi** (en çok 40) |
| Modele sorulan menü ürünü | 7 (2 paralel çağrı) | 30 (5 paralel çağrı) |
| Kalanlar | havuz → bilgi tabanı | havuz → bilgi tabanı |
| Paketli içecek | düz satır | düz satır |
| Hedef kalite | 85–90 | 100 |

Doğrulayıcı, planın söz verdiği her ürün için kart üretilip üretilmediğine bakar; model atladıysa, zaman aşımına
düştüyse ya da söylediği her şey ürüne yanlışsa kartı bilgi tabanından kurar.

## 6. Öğrenme (D-180)

- Telefonda her öneri bir çiptir; dokunulan çıkar. "Hepsini kabul et / Seçilenleri kabul et" kartı kalanlarla gönderir.
- Sunucu önerilenle kabul edileni karşılaştırır: her grup, malzeme ve açıklama için `suggestion_feedback`'e bir
  satır (kabul / çıkarıldı / düzenlendi, ürün tipiyle).
- Bir tipte en az 3 kez ve %70'ten fazla çıkarılan öneri artık sunulmaz ve modele "ekibin sürekli sildiği" diye
  söylenir.
- Kabul edilen kart havuza yazılır (şablon güncellenir, panel yazımı takma ad olur): aynı ürün bir dahaki sefere
  model çağrısı olmadan, ekibin onayladığı hâliyle gelir.
- İkinci tur (D-194):
  - **Ürün, mutfak başına:** bir mutfakta en az 3 kez ve %70'ten fazla "Önerme" denen ürün o mutfağa artık
    önerilmez (havuzdan da modelden de); modele "ekibin bu mutfakta istemediği ürünler" diye söylenir. Başka mutfak
    etkilenmez.
  - **Sevilen öneri öne:** bir tipte en az 3 kez ve %70'ten fazla kabul edilen çıkarılabilir/ekstra kartın başına
    geçer ve modele "ekibin hep kabul ettiği" diye söylenir; her kabul şablonun kullanım sayısını artırır, havuzda
    sık kabul edilen ürün öne çıkar (en fazla 10 kabule kadar).
  - **Geri al:** telefonda Ayarlar → "Ekibin sildikleri" öğrenilenleri listeler; "Geri al" o kararın satırlarını
    silmeden işaretler (`ignored_at`, kim ve ne zaman), döngü onları artık saymaz.

## Kod haritası

| katman | dosya |
|---|---|
| Plan | `backend/src/agents/plan.ts` |
| Anlama | `backend/src/agents/pipeline.ts`, `backend/src/domain/product-type.ts`, `backend/src/lib/same-product.ts` |
| Bilgi tabanı | `backend/src/db/seed/product-types.ts`, `backend/src/db/schema/knowledge.ts`, `backend/src/agents/knowledge.ts`, `backend/drizzle/0004_product_types.sql` |
| Üretim | `backend/src/agents/product-recommender.ts`, `backend/src/agents/option-modifier.ts`, `backend/src/agents/prompts/` |
| Doğrulama | `backend/src/agents/grounding.ts`, `backend/src/agents/validator.ts` |
| Öğrenme | `backend/src/agents/knowledge.ts`, `backend/src/modules/analyze/feedback.ts`, `backend/src/modules/analyze/service.ts`, `backend/src/modules/learning/` |
| Analiz geçmişi | `backend/src/modules/analyze/store.ts` (`history`), `mobile/lib/features/history/` |
| Mutfak hedefleri | `backend/src/db/seed/cuisine-targets.ts`, `docs/ai-eval/cuisine-targets.md` |
