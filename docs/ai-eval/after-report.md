# AI menü asistanı — sonra ölçümü (after)

AŞAMA 5 çıktısı. Baseline'daki 141 senaryo, aynı menüler, aynı fotoğraflar, aynı puanlama kuralları; son kod
`8acb04c`. Yöntem ve senaryolar için `baseline-report.md`, yeni algoritma için `algorithm.md`, mutfak hedefleri için
`cuisine-targets.md`.

## Önce okunacak: bu ölçüm hangi yolu ölçtü?

Son ölçüm sırasında iki sağlayıcının da **ücretsiz katman günlük kotası bitmişti**: Groq'un büyük modeli
(gpt-oss-120b) 24 Eylül ~19:00 UTC'den, Gemini 25 Eylül ~00:00 UTC'den beri 429 veriyordu. Son ölçüm bu yüzden
sistemin **yedek yolunu** ölçer: havuz şablonları + ürün tipi bilgi tabanı + doğrulama katmanı. Yeniden deneme
kapalıydı (`--no-retry`), çünkü kota bitmişken 75 sn beklemek sonucu değiştirmiyordu. Fotoğraflar, aynı görseller
daha önce okunduğu için okuma önbelleğinden geldi; okuma katmanı bu çalışmada değişmedi.

Bu, sanıldığı kadar büyük bir fark değil. Baseline'da da ürünlerin çoğunu havuz veriyordu:

| ölçüm | modelin cevap verdiği senaryo | modelden gelen yeni ürün | modelden gelen menü kartı | sağlayıcı sıkıntısı |
|---|---:|---:|---:|---:|
| baseline | 90 / 141 | 115 / 885 | 19 / 469 | 6 |
| after-v1 (sağlayıcılar çalışıyordu, ilk yeni kod) | 96 / 141 | 172 / 1087 | 38 / 641 | 5 |
| **after (son kod)** | 34 / 141 | 78 / 1124 | 0 / 608 | 72 |

Son ölçümdeki model cevapları, önceki koşuların önbellekteki öneri cevaplarıdır; menü kartlarının tamamı havuzdan
ve bilgi tabanından geldi. Yani bu ölçüm, **modelin hiç cevap vermediği en kötü günde** ekibin telefonda ne
gördüğünü gösteriyor. Model yolu son kodla ayrıca ölçüldü (aşağıda "Model yolu").

**Süre satırı karşılaştırılamaz:** son ölçümün 0,1 sn medyanı neredeyse hiç model çağrısı olmamasından gelir, bir
hızlanma değildir. Model yolundaki süre için `after-v1` (medyan 3,4 sn, p90 6,5 sn; baseline 5,9 / 13,1) ve
"Model yolu" bölümü geçerlidir.

## Özet — önce / sonra

"Tam ürün" = opsiyon grubu **ve** çıkarılabilir **ve** ekstra malzeme **ve** 6–8 kelimelik açıklaması olan ürün;
paketli içecekler (kola, ayran, su…) sayılmaz, onlar panelde düz satırdır.

| metrik | baseline | after |
|---|---:|---:|
| senaryo | 141 | 141 |
| sağlayıcı sıkıntısı | 6 | 72 |
| süre medyan (sn) | 5,9 | 0,1 |
| süre p90 (sn) | 13,1 | 0,2 |
| senaryo başına tam ürün | 0,1 | 10,8 |
| ≥6 tam ürün veren senaryo % | 0,0 | 98,6 |
| opsiyonu olan ürün % | 81,8 | 99,9 |
| çıkarılabiliri olan ürün % | 68,7 | 94,7 |
| ekstrası olan ürün % | 74,5 | 99,1 |
| açıklaması olan ürün % | 50,0 | 99,8 |
| açıklaması 6–8 kelime % | 2,7 | 99,8 |
| ürün başına grup | 3,2 | 3,1 |
| grup başına seçenek | 4,0 | 4,0 |
| saçma grup (kural) | 2 | 0 |
| opsiyon–malzeme karışması | 202 | 0 |
| paketli içecekte açıklama/opsiyon | 2 | 0 |
| açıklamasız hazırlanan içecek | 130 | 0 |
| senaryo başına yeni ürün | 6,2 | 8,0 |
| menüdekinin tekrarı/varyantı | 36 | 34 |
| mutfağa yabancı yeni ürün | 5 | 0 |
| JSON hatası | 13 | 0 |
| mutfak doğruluğu % | 98,3 | 96,7 |
| menü okuma % | 97,0 | 97,0 |
| senaryo başına model çağrısı | 2,3 | 0,2 |

Giriş ve moda göre:

| metrik (önce → sonra) | yazı·hızlı | yazı·tam | foto·hızlı | foto·tam | tek ürün | depo·hızlı | depo·tam |
|---|---:|---:|---:|---:|---:|---:|---:|
| tam ürün (ort.) | 0,1 → **9,6** | 0,1 → **13,7** | 0,1 → **9,6** | 0,1 → **13,9** | 0,1 → **6,2** | 0,0 → **13,7** | 0,0 → **17,0** |
| ≥6 tam ürün veren % | 0 → **100** | 0 → **100** | 0 → **100** | 0 → **100** | 0 → **93** | 0 → **100** | 0 → **100** |
| yeni ürün (ort.) | 5,1 → **5,9** | 8,0 → **10,5** | 5,1 → **5,9** | 7,8 → **10,7** | 5,0 → **7,0** | 5,0 → **6,0** | 8,0 → **9,3** |
| opsiyonu olan % | 71,5 → **100,0** | 89,4 → **99,7** | 70,2 → **100,0** | 91,1 → **100,0** | 89,9 → **100,0** | 47,6 → **100,0** | 88,2 → **100,0** |
| çıkarılabiliri olan % | 59,4 → **94,5** | 75,5 → **95,4** | 59,6 → **94,5** | 77,3 → **95,4** | 74,6 → **93,3** | 38,1 → **91,1** | 70,6 → **92,7** |
| ekstrası olan % | 64,8 → **99,3** | 82,2 → **99,2** | 64,3 → **99,3** | 81,6 → **98,7** | 82,6 → **100,0** | 42,9 → **97,8** | 82,4 → **98,2** |
| açıklama 6–8 kelime % | 2,3 → **100,0** | 2,7 → **100,0** | 2,4 → **100,0** | 2,5 → **99,7** | 4,3 → **100,0** | 4,8 → **97,8** | 2,0 → **98,2** |
| opsiyon–malzeme karışması | 32 → **0** | 47 → **0** | 33 → **0** | 46 → **0** | 17 → **0** | 9 → **0** | 18 → **0** |
| medyan sn | 4,7 → **0,1** | 4,5 → **0,1** | 8,8 → **0,1** | 4,4 → **0,1** | 6,6 → **0,1** | 13,2 → **0,1** | 6,8 → **0,2** |

## Kabul kriterleri

| kriter | sonuç | kanıt / not |
|---|---|---|
| Absürt opsiyon ≈ 0 (elle örneklem) | ✅ **40 üründe 0** (baseline 10/40); kurallarla da 0 | `results/after/sample.md`, aşağıda |
| Hızlı modda 6–7 ürün | ✅ yazı ve fotoğraf senaryolarının 54'ünden 52'sinde **tam 6** yeni ürün; "ürün ekle" (tek ürün) 27'de 27 **7** | modelsiz çiğ köftecide 3: havuzun o tarafı zaten menüde, model varken model tamamlar |
| Her iki modda ≥6 ürün için opsiyon + çıkarılabilir + ekstra | ✅ senaryoların **%98,6**'sında ≥6 tam ürün (baseline %0) | iki istisna 5'er: tek ürün akışında önerilerin bir kısmı düz içecek |
| Tam mod: mutfak minimumu, her şey eksiksiz | ✅ senaryo başına ~10,5 yeni ürün + menüdeki her ürüne kart; senaryo başına 13,7–17 tam ürün | tablo |
| Her ürüne 6–8 kelimelik açıklama, paketli içecek hariç | ✅ %99,8 (baseline %2,7); paketli içecekte açıklama/opsiyon 0 | açıklamasız kalan 3 ürün: fotoğrafta yanlış okunan "Künete" (2) ve modelin önerdiği "Takoyaki" |
| Kahve, kokteyl, limonata… açıklamalı | ✅ açıklamasız hazırlanan içecek **0** (baseline 130) | |
| Malzemeler opsiyonlardan ayrı | ✅ opsiyon–malzeme karışması **0** (baseline 202); bir grupta seçenek olan şey malzeme listesinde de yazmıyor (D-188) | |
| Teknik olmayan biri yardımsız kullanabilir | ◐ ekran bu hedefle yeniden yapıldı (D-184) ve widget testleriyle doğrulandı; **cihazda deneme bekliyor** | aşağıda "Cihaz ekran görüntüleri" |

## Elle örneklem

`tests/ai_eval/sample.mjs` son koşunun 323 farklı ürününden 40'ını sabit tohumla çekti
(`tests/ai_eval/results/after/sample.md`). Baseline'daki ölçütle, bir operasyon çalışanının "bu yanlış" diyeceği öğe
arandı.

| koşu | yanlış öğesi olan ürün | örnek |
|---|---:|---|
| baseline | **10 / 40** | "Ispanaklı Kol Böreği"ne "İç Harç" seçimi, çiğ köfteye "Ekstra Et", yaş pastaya "Maket Bıçak", "Sossuz (+ücret)" |
| after-v2 | 3 / 40 | |
| after-v4 | 4 / 40 | "Peynirli Gözleme"ye "İç Harç", "Kakaolu Çörek"e peynirli/zeytinli "Çeşit", coleslaw'a Sezar sos ve ızgara tavuk, Asya usulü kızarmış pilava kaşar rendesi → D-188 |
| after-v5 | 3 / 40 | soğuk çaya espresso shot ve krem şanti, spring roll'a wasabi, çökertmeye "tencerede ağır ağır pişer" → D-191 |
| **after** | **0 / 40** | |

Son örneklemde kalan küçük pürüzler (yanlış değil, ama bir insanın düzelteceği yerler):

- Mega Dürüm: "Yeşillik" grubunda "Göbek Marul", çıkarılabilirde "Marul" — aynı şeyin iki yazılışı.
- Çikolatalı Brownie: "Yanında: Dondurma" ücretsiz, ekstrada "Dondurma Topu" ücretli.
- Katmer: ekstrada hem "Ekstra Kaymaklı" hem "Ekstra Kaymak".
- Pumpkin Spice Latte: zaten aromalı içeceğe şurup seçimi; açıklama tipin genel satırı.
- Levrek Buğulama: açıklama ızgara balığa daha uygun genel bir satır.
- Sebzeli Spring Roll: ara sıcakların genel sosları (yoğurt, ranch) ve çıkarılabilirleri.

## İterasyonlar

Bütün koşular aynı kurallarla yeniden puanlandı (`results/after-v*/summary.md`). Puanlayıcıda son incelemede bulunan
bir kusur (havuzdaki adıyla listelenen menü ürünü, kartı menüdeki adına bağlı olduğu için bir kez de boş sayılıyordu)
düzeltildi ve baseline dahil hepsine uygulandı; baseline'ın oranları bu yüzden birkaç onda bir değişti.

| metrik | baseline | after-v1 | after-v2 | after-v3 | after-v4 | after-v5 | after |
|---|---:|---:|---:|---:|---:|---:|---:|
| senaryo | 141 | 141 | 141 | 141 | 141 | 141 | 141 |
| sağlayıcı sıkıntısı | 6 | 5 | 36 | 44 | 53 | 72 | 72 |
| süre medyan (sn) | 5,9 | 3,4 | 1,6 | 0,8 | 0,6 | 0,1 | 0,1 |
| süre p90 (sn) | 13,1 | 6,5 | 3,6 | 2,0 | 1,6 | 0,2 | 0,2 |
| senaryo başına tam ürün | 0,1 | 11,0 | 10,7 | 11,1 | 10,4 | 10,8 | 10,8 |
| ≥6 tam ürün veren senaryo % | 0,0 | 88,7 | 91,5 | 90,1 | 90,8 | 98,6 | 98,6 |
| opsiyonu olan ürün % | 81,8 | 99,1 | 99,6 | 99,6 | 99,5 | 99,6 | 99,9 |
| çıkarılabiliri olan ürün % | 68,7 | 99,1 | 95,7 | 95,8 | 95,0 | 94,3 | 94,7 |
| ekstrası olan ürün % | 74,5 | 99,1 | 99,6 | 99,2 | 98,8 | 98,8 | 99,1 |
| açıklaması olan ürün % | 50,0 | 99,1 | 99,6 | 99,5 | 99,4 | 99,4 | 99,8 |
| açıklaması 6–8 kelime % | 2,7 | 99,1 | 99,6 | 99,5 | 99,4 | 99,4 | 99,8 |
| ürün başına grup | 3,2 | 3,1 | 3,1 | 3,2 | 3,1 | 3,1 | 3,1 |
| grup başına seçenek | 4,0 | 3,9 | 4,0 | 4,0 | 4,0 | 4,0 | 4,0 |
| saçma grup (kural) | 2 | 8 | 0 | 0 | 0 | 0 | 0 |
| opsiyon–malzeme karışması | 202 | 56 | 14 | 29 | 0 | 0 | 0 |
| paketli içecekte açıklama/opsiyon | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| açıklamasız hazırlanan içecek | 130 | 2 | 0 | 0 | 0 | 0 | 0 |
| senaryo başına yeni ürün | 6,2 | 7,6 | 7,7 | 8,1 | 7,5 | 8,0 | 8,0 |
| menüdekinin tekrarı/varyantı | 36 | 32 | 32 | 24 | 30 | 35 | 34 |
| mutfağa yabancı yeni ürün | 5 | 0 | 0 | 36 | 0 | 0 | 0 |
| JSON hatası | 13 | 2 | 0 | 0 | 0 | 0 | 0 |
| mutfak doğruluğu % | 98,3 | 100,0 | 100,0 | 45,0 | 96,7 | 96,7 | 96,7 |
| menü okuma % | 97,0 | 97,0 | 97,0 | 97,0 | 97,0 | 97,0 | 97,0 |
| senaryo başına model çağrısı | 2,3 | 2,2 | 2,0 | 1,5 | 1,3 | 0,1 | 0,2 |

- **after-v1** (24 Eylül akşamı, sağlayıcılar çalışıyor): bilgi tabanı (ürün tipleri), doğrulama katmanı, dört
  bölümlü kart, menüdeki her ürüne kart, her ürüne açıklama (D-177…D-181). Kalan: 56 karışma (aç/kapa gruplar,
  "Ekstra …" seçenekleri, "Sossuz +ücret"), 8 kural-saçma grup.
- **after-v2**: ayrıştırma kuralları genişledi, yanlış takma adlar temizlendi ve bulanık eşleşmeye çelişki koruması
  geldi (D-182), kategori ürün tipiyle uzlaştırıldı (D-183), sınıflandırıcının zaman aşımı 3 sn (D-185).
- **after-v3**: koşunun ortasında Groq'un günlük kotası bitti; sınıflandırıcı cevap veremeyince listedeki ilk mutfağı
  (kebap) seçti: mutfak doğruluğu %45, 36 yabancı ürün (pizzacıya lahmacun). → D-187: mutfak, menünün ürün
  tiplerinden okunuyor.
- **after-v4**: D-187 ve aç/kapa grubunun "Ekstra …" seçeneği ayrıldıktan sonra değerlendirilmesi. Elle örneklem 4/40.
- **after-v5**: D-188 (ad dolguyu belirler; hiçbir şey iki kez sorulmaz; ürünün adını aldığı malzeme çıkarılamaz;
  tatlı adlı ürüne tuzlu malzeme girmez), D-189 (hızlı mod altıyı tutar), D-190 (paket adedi ve eklenen dolgu başka
  ürün yapmaz). Elle örneklem 3/40.
- **after (son)**: D-191 (spring roll, soğuk kahve / soğuk içecek ayrımı, çökertme), menü listesinde varyantların
  kendi adı. Elle örneklem 0/40.

## En kötü 10 senaryo

`score.mjs` sıralaması (en az tam ürün, en çok tekrar/varyant):

| senaryo | tam ürün | neden |
|---|---:|---|
| kafe-icecek · tek ürün | 5 | 7 önerinin 2'si çay (çıkarılacak malzemesi yok, "tam" sayılmıyor); önerilen "Latte", yazılan "Pumpkin Spice Latte"nin varyantı sayıldı |
| çiğ köfte · tek ürün | 6 | "Çiğ Köfte Wrap" yazılınca "Çiğ Köfte Porsiyon" ve "Kase" önerildi — aynı ürünün başka biçimleri (bilinçli) |
| kafe-icecek · foto ve yazı · tam | 22 | "Ice Latte" (menüde Latte) ve "Soğuk Çay" (menüde Çay) varyant sayıldı — farklı ürünler (bilinçli) |
| tantuni · foto · tam | 13 | modelsiz mutfak tahmini tantuniyi döner okudu (aynı ürün tipi), iki döner dürüm önerildi |
| sokak-lezzetleri · tek ürün | 5 | 7 önerinin 2'si düz içecek (ayran, şalgam) |
| burger · foto ve yazı · hızlı ve tam (4) | 11–13 | "Double Cheeseburger" (menüde Cheeseburger) varyant sayıldı — farklı ürün (bilinçli) |

"Menüdekinin tekrarı/varyantı" metriğinin 34 işaretinin hepsi bu türden: soğuk/sıcak, et/tavuk, porsiyon/paket,
tek/duble. `same-product.ts` bunları bilinçli olarak ayrı ürün sayar, yargıç ise işaretler. Gerçek tekrarlar ("Tacos"
ile "Tacos (3'lü)", "Künefe" ile "Dondurmalı Künefe") D-190 ile kapandı. İstisna tantuni fotoğrafıdır (mutfak yanlış
okununca gelen döner ürünleri).

## Model yolu (after-model)

_Gemini'nin günlük kotası 07:00 UTC'de yenileniyor. Yazı senaryoları (54) son kodla, kayıtlı öneri cevapları
silinerek (yani modelden taze cevapla) 07:10 UTC'de koşuluyor; sonuçlar bu bölüme eklenecek._

## Kalan sınırlar

1. **Ücretsiz katman kotası.** Bir akşamlık ölçüm iki sağlayıcının günlük kotasını bitirdi. Üretimde tek bir ekip bu
   sınıra yaklaşmaz, ama ekip büyürse ücretli katman gerekir. Model yoksa sistem yine eksiksiz kart üretir (bu
   rapor), ama yeni ürün önerileri havuzla sınırlı kalır.
2. **Modelsiz çiğ köfteci.** Havuzun çiğ köfte tarafı zaten menüdeyse hızlı mod 3 yeni ürünle döner; model
   çalışırken model tamamlar.
3. **Tantuni fotoğrafı.** Model yokken mutfak tahmini tantuniyi döner okuyor (ikisinin ürünleri aynı tipte);
   kullanıcının seçtiği mutfak her zaman kazanır.
4. **Ürünlerin ~%5'inde çıkarılabilir malzeme yok.** Çoğu bilinçli: çay (çıkarılacak bir şey yok), fırın sütlaç,
   künefe. Adından tipi anlaşılamayan ürün (fotoğrafta yanlış okunan "Künete" gibi) yalnızca porsiyon seçimi alır ve
   telefonda "Kontrol et" diye işaretlenir.
5. **Küçük pürüzler** (örneklemdeki 6 madde): ekip bunları kartta tek dokunuşla siliyor; bir ürün tipinde en az 3
   kez ve %70'ten fazla silinen öneri artık sunulmuyor (D-180).

## Cihaz ekran görüntüleri

Çalışma boyunca telefon ya kilitliydi ya da bağlı değildi; eski ve yeni uygulamanın ekran görüntüleri
`docs/ai-eval/screenshots/` klasörüne, telefon bağlanıp "Kopilot TEST" uygulamasına giriş yapıldığında eklenecek.
Yeni debug APK (`mobile/build/app/outputs/flutter-apk/app-debug.apk`) hazır; kurulum README'de.

## Yeniden üretmek

```bash
docker compose -f docker-compose.yml -f tests/ai_eval/docker-compose.eval.yml up -d --build api
node --env-file=.env tests/ai_eval/run.mjs --label after --no-retry --pause 2
node tests/ai_eval/score.mjs --label after --md
node tests/ai_eval/compare.mjs baseline after
node tests/ai_eval/sample.mjs --label after --n 40
```
