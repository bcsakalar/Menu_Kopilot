# FAZ 0 — Teşhis notu

Tarih: 2026-09-21 · Ölçüm ortamı: `docker compose up -d` (api `127.0.0.1:3030`, Postgres+pgvector, Redis),
gerçek Gemini/Groq anahtarları `.env` içinde, 27 mutfak / 316 seed şablonu yüklü.

Ölçüt tek: **canlı telefon görüşmesi sırasında menüyü tamamlama işini hızlandırıyor mu?**

---

## 1. Ortam kısıtı (rapora etkisi var)

Bu makinede **Flutter SDK ve Android SDK yok** (`where flutter/dart/adb/java` → hiçbiri; C:\ ve D:\ taraması
`flutter.bat` / `adb.exe` bulmuyor). `PROGRESS.md` 2026-09-17'de ikisinin de kurulu olduğunu yazıyor, sonradan
kaldırılmış.

Sonuç: `flutter run`, gerçek cihaz ekran görüntüsü, `flutter analyze` ve `flutter test` bu oturumda
**çalıştırılamadı**. Backend tarafı tam doğrulanabilir (Docker + PGlite testleri + gerçek anahtarlarla ölçüm).
Dart değişiklikleri derlenmeden yazıldı; FAZ 3'te hangi komutların çalıştırılması gerektiği listelendi.

---

## 2. Ekran ekran teşhis

| Ekran | Canlı görüşmede işe yarıyor mu? | Teşhis |
|---|---|---|
| **Öneri** (`/suggest`) | Kısmen | Girdi ekranı iyi (mutfak + foto + metin + dikte, dock'ta tek buton). Sonuç ekranı düz bir kart listesi: 21 kartın 19'u zaten girdide olan ürün, hiçbiri "yeni ürün" değil. Telefonda tarayacak bir yapı yok — başlık yok, sayaç yok, filtre yok. |
| **Tamamla** (`/gap`) | Hayır (mevcut hâliyle) | Analiz yapabilmek için **önce şube kaydı açmak zorunlu**. Görüşme başlarken bürokrasi. Sonuç ekranı gerçekte değerli (sayaç + çağrı checklist'i + eksik alan rozetleri + öneri listesi) ama Öneri ekranından tamamen kopuk: aynı menü için iki ayrı akış, iki ayrı sonuç ekranı. |
| **Şubeler** | Hayır | Ölü özellik. Tek kullanıcı, her görüşme bir kerelik. Liste + detay + CSV/JSON export + "araştır" alt ekranı; hiçbiri görüşme sırasında kullanılmıyor. Varlık sebebi yalnızca Tamamla'nın şube zorunluluğu. |
| **Şablonlar** | Evet | Havuz araması Türkçe duyarsız çalışıyor, kalsın. |
| **Ayarlar** | Evet | Mutfak türü min ürün sayısı, model/sağlayıcı seçimi, kota, kullanım. Kalsın — agent mimarisi için de gerekli. |
| **Araştırma** (`/branches/:id/research`) | Hayır | Şubeye bağlı, görüşme sırasında internet araştırması yapılmıyor. Şube silinince bağımlılığı çözülmeli. |

### "Tamamla" ekranı — ayrı teşhis ve karar

**Şu an ne yapıyor:** şube seç → panel ekran görüntüsü ve/veya menü metni gir → analiz. Çıktı: mevcut/hedef
sayaç, "Çağrıda sor" checklist'i (≤15 soru, tikler şube başına kalıcı), eksik alanı olan ürünler, önerilen ürünler.

**Ne eksik:** (a) şube kaydı zorunluluğu, (b) Öneri ekranıyla veri paylaşmıyor — aynı menüyü iki kez girmek gerekiyor,
(c) önerilen ürün için kart hazırlamak ayrı bir ekrana atlıyor (`/gap/card`), geri dönünce sayaç senkronlanıyor,
(d) opsiyon/malzeme önerisi hiç yok — sadece "şu alan boş" diyor, ne yazılacağını söylemiyor.

**Karar: Öneri ekranıyla BİRLEŞTİRİLDİ, ayrı sekme kaldırıldı.**

Gerekçe: FAZ 1'in 2. maddesi Öneri ekranından "ilerleme göstergesi (mevcut X / hedef Y / mutfak türü Z)",
"yeni ürünler", "mevcut ürünlere opsiyon" ve "eksik/düzeltme" bölümleri istiyor. Bu dört şey Tamamla'nın
tamamı. İki ekranda tutmak, canlı görüşmede aynı menüyü iki kez girmek demek. Tamamla'nın değerli mantığı
(dedupe, completeness, sayaç, checklist) silinmiyor — agent pipeline'ının içine taşınıyor ve tek sonuç
ekranında bölüm olarak görünüyor. Kaybolan tek şey ayrı sekme ve şube kaydı.

---

## 3. Mevcut AI çıktısının ölçümü ("önce" verisi)

Fixture'lar: `backend/test/fixtures/menus/{kebapci,pideci,kafe,tatlici}.json` — dört mutfak türü, satıcıdan eksik
gelmiş menüyü temsil eden ürün listeleri. Aynı girdiyle tekrar koşulabilir.

Ölçüm scriptleri (yeni):
- `pnpm measure --label before` → uçtan uca `/suggest` + `/gap-analysis` (çalışan sunucuya HTTP)
- `pnpm probe:recommender --label before --runs 2` → `text.gap_suggest` görevini **yalıtılmış** çağırır

### 3a. Mod 1 — `/suggest` (öneri ekranının bugünkü çıktısı)

| | değer |
|---|---|
| üretilen kart | 21 |
| **girdinin tekrarı** | **19 (%90)** |
| yeni ürün önerisi | **0** |
| şemadan geçen / kullanılabilir | 21 (%100) |
| LLM çağrısı | 0 |
| toplam süre | 169 ms |

Kalan 2 kart da tekrar sayılmalı: "Kadayıf → Tel Kadayıf", "Sütlaç → Fırın Sütlaç" — kanonik ada çevrilmiş aynı
ürün, trigram eşiğinin altında kaldığı için "tekrar" işaretlenmemiş. Yani **gerçekte 21/21 tekrar, 0 yeni ürün.**

Bu bir hata değil, tasarım: `/suggest` verilen adları kartlaştırır, yeni ürün önermez. Kullanıcının
"gerçekten yeni ürün önermiyor" şikâyetinin sayısal karşılığı bu.

### 3b. Mod 2 — `/gap-analysis` (DB yolu, bugünkü varsayılan)

| | değer |
|---|---|
| üretilen öneri | 27 |
| tekrar | 0 (%0) |
| alakasız | 0 (%0) |
| kullanılabilir | 27 (%100) |
| **kategori açığını kapatan** | **1/17 (%6)** |
| LLM çağrısı | 0 |
| toplam süre | 168 ms |

Seed havuzu dolu olduğu için model hiç çağrılmıyor — hızlı ve temiz, ama **kategori körü**. Öneriler yalnızca
`importance` ve `usageCount` ile sıralanıyor, hangi kategorinin eksik olduğuna bakmıyor. Somut sonuç:

- `pideci` (çorba, salata, içecek, tatlı açık) → 7 önerinin 6'sı **yine pide**: Peynirli Pide, Kıymalı Kaşarlı
  Pide, Kavurmalı Pide, Etli Ekmek, Pastırmalı Kaşarlı Pide, Ispanaklı Pide.
- `tatlici` (içecek açık) → 7 önerinin 7'si **yine tatlı**, tek içecek yok.
- `kafe` (atıştırmalık, tatlı açık) → 7 önerinin 7'si **yine içecek**.

### 3c. Öneri üreten LLM adımı, yalıtılmış (`text.gap_suggest`, 4 fixture × 2 koşu)

| | değer |
|---|---|
| üretilen öneri | 75 |
| tekrar (menüde zaten var) | 0 (%0) |
| **alakasız / ürün olmayan** | **18 (%24)** |
| **adında gramaj/ambalaj** | **8 (%11)** |
| kullanılabilir | 57 (%76) |
| kategori açığını kapatan | 9/12 (%75) |
| ortalama süre | 2545 ms (min 1812 / max 3030) |
| koşu başına öneri | 10,10,10,10,10,10,**5**,10 |

Gözlenen kusurlar:

1. **Ada karışan ambalaj bilgisi** — `Ayran (1 Litre)`, `Ayran (1 L)`, `Ayran (33 cl)`, `Ayran (300 ml)`,
   `Kola (33 cl)` ×3, `Su (500 ml)`. Bu bilgi şemaya göre `portionInfo` alanına ait. Adda olunca hem dedupe
   hem şablon eşleşmesi bozuluyor — "Ayran (1 L)" havuzdaki "Ayran"a oturmuyor, yeni taslak açılıyor.
2. **Ürün olmayan öneriler** — `Kaymak` (garnitür), `Kavurmalı Humus`, `Kısırlık Bulgur Pilavı`,
   `Demleme Çay`, `Demleme Türk Kahvesi`, `Soğuk Baklava`, `Türk Çayı`.
3. **Koşular arası tutarsızlık** — aynı girdiye bir koşuda 10, bir koşuda 5 öneri.
4. **Mutfak türü kısmen ciddiye alınıyor** — kategori kapsamı %75, DB yolundan (%6) çok daha iyi. Yani
   "mutfak türünü ciddiye almıyor" şikâyeti asıl **DB önericisi** için geçerli, model için değil.

### 3d. Teşhisin özeti

| Sorun | Kanıt | Çözüm (FAZ 1) |
|---|---|---|
| Yeni ürün önerilmiyor | Mod 1: 21/21 tekrar | Product Recommender agent — yalnızca menüde OLMAYAN ürün |
| Kategori körlüğü | DB yolu 1/17 kategori kapatıyor | Gap Analyst agent + `cuisine_categories` tablosu |
| Adda gramaj/ambalaj | %11 | Validator'da deterministik ad temizleme |
| Ürün olmayan öneri | %24 | Validator + şablon eşleşmesi + `is_product` kontrolü |
| Çıktı tutarsızlığı | 5–10 öneri arası oynuyor | Agent başına ayrı şema + min/max zorlaması |
| İki ayrı akış | Öneri ve Tamamla aynı menüyü iki kez istiyor | Tek pipeline, tek sonuç ekranı, üç bölüm |
| Şube bürokrasisi | Analiz için önce kayıt açmak gerekiyor | Şubeler tamamen silindi |
| Pipeline görünmüyor | Tek prompt, tek cevap, ara adım yok | Adım adım log + gizli debug ekranı |

---

## 4. Ölçüm dosyaları

- `backend/exports/quality-before.json` — uçtan uca, kart/öneri bazında karar dökümü
- `backend/exports/recommender-before.json` — yalıtılmış LLM koşuları, öneri bazında karar dökümü

FAZ 2'de aynı komutlar `--label after` ile koşulup yan yana konacak.
