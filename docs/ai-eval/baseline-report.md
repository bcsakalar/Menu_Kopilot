# AI menü asistanı — başlangıç ölçümü (baseline)

AŞAMA 1 çıktısı. Kodda hiçbir değişiklik yapmadan, üretimdeki sürümün (`daed3fa`) davranışı ölçüldü.

## Nasıl ölçüldü

| | |
|---|---|
| Ortam | Yerel Docker yığını, üretimle aynı kod ve aynı sağlayıcılar (Gemini + Groq, ücretsiz katman). Günlük kota yalnızca bu ölçüm için yükseltildi (`tests/ai_eval/docker-compose.eval.yml`). |
| Menüler | 27 mutfak türünün her biri için elle yazılmış gerçekçi bir Türkçe paket menüsü (`tests/ai_eval/menus.mjs`). |
| Fotoğraflar | Her menü tarayıcıda çizilip fotoğrafa çevrildi, beş farklı stilde: baskı, el yazısı defter, tahta, **bulanık**, **eğik/düşük kalite** (`tests/ai_eval/images/`). Ayrıca depodaki üç gerçek menü fotoğrafı (kebapçı, pideci, tatlı-kafe). |
| Matris | 27 mutfak × {yazı, fotoğraf} × {hızlı, tam} = 108 · "ürün ekle" (tek ürün, hızlı) 27 · depo fotoğrafları × 2 mod = 6 → **141 senaryo** |
| Araç | `tests/ai_eval/run.mjs` (istek, izleme kaydı, sağlayıcı kullanımı; hata/sıkıntıda 75 sn bekleyip bir kez tekrar, senaryolar arasında bekleme, önbellek) · `tests/ai_eval/score.mjs` (puanlama) |
| Puanlama | `tests/ai_eval/rules.mjs` — backend'in kendi doğrulamasından **bağımsız**, elle yazılmış kurallar: ürün türü, uygunsuz grup kuralları, malzeme/opsiyon ayrımı, açıklama uzunluğu, tekrar/halüsinasyon. Kurallar el incelemesinde bulunan kusurlara göre inceltildi ve **aynı kurallar önce ve sonra ölçümüne birlikte uygulandı**. |
| Ham sonuçlar | `tests/ai_eval/results/baseline/` (senaryo başına JSON, `summary.json`, `summary.md`, `sample.md`) |

"Tam ürün" = opsiyon grubu **ve** çıkarılabilir **ve** ekstra malzeme **ve** 6–8 kelimelik açıklaması olan ürün.
Paketli içecekler (kola, ayran, su…) bu sayıma girmez; onlar panelde düz satırdır.

## Özet

| metrik | toplam |
|---|---:|
| senaryo | 141 (başarısız 0, sağlayıcı sıkıntısı 6) |
| süre medyan / p90 | 5,9 sn / 13,1 sn (hızlı mod fotoğrafta p90 **20,9 sn**) |
| **senaryo başına tam ürün (ortalama)** | **0,1** |
| **≥6 tam ürün veren senaryo** | **%0** |
| opsiyonu olan ürün | %81,8 (hızlı modda %71) |
| çıkarılabilir malzemesi olan ürün | %68,7 |
| ekstra malzemesi olan ürün | %74,5 |
| açıklaması olan ürün | %50,0 |
| açıklaması 6–8 kelime olan ürün | **%2,7** |
| ürün başına grup / grup başına seçenek | 3,2 / 4,0 |
| opsiyon–malzeme karışması | **202** |
| açıklaması olmayan hazırlanan içecek (kahve, çay, limonata, milkshake) | **130** |
| menüde olanı tekrar öneren yeni ürün | 36 |
| mutfağa yabancı yeni ürün | 5 |
| JSON hatası / onarım turu | 13 / 13 |
| mutfak türü doğruluğu (fotoğraf) · menü okuma (recall) | %98,3 · %97,0 |

Giriş ve moda göre:

| metrik | yazı·hızlı | yazı·tam | foto·hızlı | foto·tam | tek ürün | depo·hızlı | depo·tam |
|---|---:|---:|---:|---:|---:|---:|---:|
| tam ürün (ort.) | 0,1 | 0,1 | 0,1 | 0,1 | 0,1 | 0 | 0 |
| opsiyonu olan % | 71,5 | 89,4 | 70,2 | 91,1 | 89,9 | 47,6 | 88,2 |
| açıklaması olan % | 40,6 | 52,9 | 43,1 | 54,6 | 73,2 | 26,2 | 39,2 |
| açıklama 6–8 kelime % | 2,3 | 2,7 | 2,4 | 2,5 | 4,3 | 4,8 | 2,0 |
| opsiyon–malzeme karışması | 32 | 47 | 33 | 46 | 17 | 9 | 18 |
| medyan sn | 4,7 | 4,5 | 8,8 | 4,4 | 6,6 | 13,2 | 6,8 |

## Kullanıcının gözlemleri — doğrulama

| gözlem | sonuç | kanıt |
|---|---|---|
| Opsiyonlar absürt | **Doğrulandı** | Kurallar yalnızca 2 bariz vaka yakaladı, ama **elle incelenen 40 üründen 10'unda** en az bir saçma öğe var (aşağıda). |
| Opsiyonlar yetersiz | **Kısmen** | Ürünlerin %18'inde hiç grup yok (hızlı modda %29); olanlarda grup sayısı yeterli (3,2). |
| Çıkarılabilir/ekstra eksik ya da opsiyonlarla karışık | **Doğrulandı** | %31'inde çıkarılabilir, %26'sında ekstra yok; 202 karışma (aşağıda). |
| Çok az ürüne öneri geliyor | **Doğrulandı** | Senaryo başına tam ürün 0,1. Hızlı modda menüdeki yalnızca 3 ürün kart alıyor; içecek kategorisindeki her şey (kahve dahil) boş bırakılıyor. |
| Arayüz karışık | **Doğrulandı** | Üç teknik bölüm (Yeni ürün / Opsiyon & Malzeme / Eksik-Düzeltme), "DB'den / AI / Hazır şablon" etiketleri, "N AI çağrısı" sayacı, böcek simgeli hata ayıklama ekranı, "Ayrıntılı kayıt" anahtarı, toplu seçim kutuları; bir kartın tek tek önerileri kaldırılamıyor, yalnızca kartın tamamı "Ekle / Reddet". |

### Opsiyon–malzeme karışmasının dökümü (202)

| tür | adet | örnek |
|---|---:|---|
| aynı şey hem opsiyon grubu hem ekstra | 60 | "Yumurta" grubu + "Yumurta" ekstrası (pide) |
| aynı malzeme hem çıkarılabilir hem ekstra | 57 | "Mantar" hem çıkarılabilir hem ekstra (pizza) |
| malzeme aç/kapa grubu olarak | 51 | "Soğan: Soğanlı / Soğansız", "Kaymak: Kaymaksız / Kaymaklı" |
| malzeme listesi grup olarak | 25 | "Ekstra Malzeme", "Ek Malzeme", "İçine" |
| "Ekstra …" seçeneği bir opsiyon grubunda | 9 | "Yanında: … Ekstra Lavaş" |

## Elle örneklem (40 ürün, sabit tohum)

`tests/ai_eval/sample.mjs` tüm sonuçlardaki farklı ürünlerden 40 tanesini rastgele çekti
(`tests/ai_eval/results/baseline/sample.md`). Bir operasyon çalışanının "bu saçma" diyeceği öğeler:

| # | ürün | sorun |
|---:|---|---|
| 2 | Ispanaklı Kol Böreği | "İç Harç: Peynirli / Kıymalı / Ispanaklı…" — ürünün adı zaten ıspanaklı |
| 10 | Çiğ Köfte Wrap | Ekstra: **"Ekstra Et", "Ekstra Kaşar"** — çiğ köfte etsizdir |
| 11 | Patatesli Gözleme | "İç Harç" seçimi (adı zaten patatesli) + "Tereyağı: Tereyağlı/Tereyağsız" aç/kapa grubu |
| 14 | Kakaolu Çörek | "Yanında: Sade, Peynirli, Kaşarlı, Nutellalı" + ekstraların aynısı "Ekstra Malzeme" grubu olarak |
| 23 | Antrikot | "Steak Sosu: **Sossuz (+ücret)**" |
| 27 | Peynirli Gözleme | "İç Harç" seçimi, adı zaten peynirli |
| 30 | Penne Arrabbiata | "Makarna Türü: Spagetti / Penne / Fettuccine…" — adı zaten penne |
| 34 | Somon Izgara | "Pişirme Şekli: Izgara / Fırında / Teriyaki" — adı zaten ızgara |
| 35 | Yaş Pasta | Ekstra: **"Maket Bıçak"** |
| 40 | San Sebastian Cheesecake | "Sos: **Sossuz (+ücret)**" |

Ayrıca 40 üründen 20'sinde (menüdeki ürünler) açıklama yok, o alanda kartın özeti (grup adları) duruyor; gerçek
açıklaması olan 20 üründen 19'u 11–18 kelime, yalnızca 1'i 6–8 kelime.

## En kötü 10 senaryo

`score.mjs` sıralaması (tam ürün 0, en çok karışma ve tekrar):

| senaryo | ürün | tam | başlıca sorun |
|---|---:|---:|---|
| pizza · yazı · tam | 12 | 0 | "Ekstra Malzeme" opsiyon grubu; 4 pizzada aynı malzeme hem çıkarılabilir hem ekstra; pizzacıya "Künefe"; açıklama 0/12 doğru uzunlukta |
| pide-lahmacun · foto · tam | 13 | 0 | Her pidede "Yumurta: Yumurtalı/Yumurtasız" aç/kapa grubu **ve** aynı "Yumurta" ekstrası |
| pide-lahmacun · yazı · tam | 13 | 0 | aynı |
| depo kebapçı · tam | 20 | 0 | "Yoğurt"/"Yumurta" aç/kapa grupları; Türk Kahvesi açıklamasız; 15,3 sn |
| pizza · foto · hızlı | 9 | 0 | "Ekstra Malzeme" grubu, "Kaymak" aç/kapa (künefe), **24,1 sn** |
| çiğ köfte · foto · tam | 10 | 0 | 3 üründe "Ekstra Malzeme" grubu; menüdekini tekrar ("Çiğ Köfte Paketi", "Çiğ Köfte Salata") |
| çiğ köfte · yazı · tam | 10 | 0 | aynı + limonata açıklamasız |
| pide-lahmacun · foto · hızlı | 10 | 0 | "Yumurta" aç/kapa + ekstra tekrarı |
| pide-lahmacun · yazı · hızlı | 10 | 0 | aynı |
| pizza · foto · tam | 12 | 0 | "Ekstra Malzeme" grubu; malzeme tekrarları; "Barbekü Tavuklu Pizza" menüdeki "Tavuklu Pizza"nın varyantı |

## Kök neden analizi

1. **Ürünün ne olduğu bilinmiyordu.** Opsiyonlar ya havuzdaki bir şablondan ya da modelin serbest cevabından geliyor,
   hiçbiri ürün türüne göre denetlenmiyordu. Tek koruma kategori bazlıydı ("içecek = düz satır"). Genel bir "Kol
   Böreği" şablonunun "İç Harç" grubu "Ispanaklı Kol Böreği"ne, genel makarna şablonunun "Makarna Türü" grubu
   "Penne Arrabbiata"ya olduğu gibi taşındı. Çiğ köftenin etsiz olduğunu, tatlıya turşu yakışmadığını bilen bir yer yoktu.
   (`agents/option-modifier.ts`, `agents/validator.ts`)
2. **Opsiyon ile malzeme ayrımı hiçbir yerde uygulanmıyordu.** Prompt "removableIngredients / extraIngredients"
   alanlarını istiyordu ama model ve şablonlar malzemeyi grup olarak da yazıyordu ("Ekstra Malzeme", "İçine",
   "Soğan: Soğanlı/Soğansız"). Doğrulayıcı yalnızca şema kurallarını (tek seçim → max 1 vb.) denetliyordu.
3. **Açıklama uzunluğu yanlış tanımlanmıştı.** Öneri promptu "60–140 karakter" istiyordu (≈10–20 kelime); havuzda
   açıklaması olan 383 şablondan yalnızca 9'u 6–8 kelimeydi, çoğu 11–16. Menüde zaten olan ürünlere açıklama hiç
   üretilmiyordu: yalnızca panel ekran görüntüsünde "açıklama boş" görülürse ayrı bir "düzeltme" kartı çıkıyordu;
   menü fotoğrafı ya da yazıyla gelen ürünlerde bu bilgi olmadığı için hiçbir şey çıkmıyordu.
4. **Kapsam dar tutulmuştu.** Hızlı mod menüdeki yalnızca 3 ürüne opsiyon kartı çıkarıyordu; tam mod en fazla 24 ürüne
   ve 4 model çağrısına sınırlıydı. İçecek kategorisinin tamamı "düz satır" sayıldığı için Türk kahvesi, latte, çay,
   limonata, milkshake de açıklamasız ve opsiyonsuz kalıyordu (130 vaka).
5. **Tekrar kontrolü şablonun kanonik adını görmüyordu.** Menüdeki "Mercimek" havuzdaki "Mercimek Çorbası" ile
   eşleşiyordu, ama aynı ürün başka bir mutfakta başka bir şablon kimliğiyle durduğu için öneri tarafı onu yeni
   ürün sanıp önerebiliyordu.
6. **Tohum verisinde yanlış takma adlar vardı.** "Levrek Izgara" şablonunun takma adlarından biri "Levrek Buğulama"ydı
   (ayrıca "Çipura Buğulama → Çipura Izgara", "Ciğer Dürüm → Ciğer Şiş" gibi 6 tane). Buğulama levrek yazan bir
   restorana ızgara opsiyonları ve "adı Levrek Izgara olmalı" diye yanlış bir düzeltme kartı çıkıyordu. (Bu, sonraki
   ölçümün incelemesinde bulundu; kök neden baseline koduna ait.)
7. **Kategori anahtar kelimeleri tek kelimeye bakıyordu.** "Tavuk Suyu Çorbası" "su" kelimesinden içecek, "Tatlı Ekşi
   Soslu Tavuk" "tatlı" kelimesinden tatlı sayılıyordu; bu hem sayaçları hem kart kurallarını bozuyordu.
8. **Gecikme ve JSON.** Mutfak sınıflandırıcısının ilk denemesi (Gemini) 91 denemenin 49'unda 6 sn zaman aşımına
   düştü, cevabı ardından Groq 0,5 sn'de verdi: her analizde boşa giden süre. Opsiyon ajanının Groq cevaplarının
   17'de 9'u JSON şemasından geçemedi (onarım turuna gitti).
9. **Arayüz teknik bir ekip için tasarlanmıştı.** Kart kaynağı rozetleri, çağrı sayıları, hata ayıklama ekranı ve üç
   ayrı teknik bölüm, teknik olmayan bir operasyon çalışanının ilk açılışta anlayacağı bir dil değildi; bir kartın tek
   bir önerisini kaldırmanın yolu yoktu.

## Cihaz ekran görüntüleri

Telefon ölçüm sırasında kilitliydi ve sonra bağlantısı kesildi; üretimdeki eski uygulamanın ekran görüntüleri,
telefon bağlandığında `docs/ai-eval/screenshots/` klasörüne eklenecek.
