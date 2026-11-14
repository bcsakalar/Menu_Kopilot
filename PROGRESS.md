# Durum

Son güncelleme: 2026-11-14 · Canlı sürüm: `816a98f`

## Bugün ne çalışıyor

- **Site:** sohbet ekranı (Ctrl+V, sürükle-bırak, dosya seçme, yazarak ürün listesi), takip mesajları, kopyalama, sayfa
  yenilenince kaldığı yerden devam, analiz sürerken görüşme değiştirme, **geri bildirim gönderme**.
- **Araçlar (D-218):** sol üstte "Asistan | Araçlar" geçişi. **Metin düzeltme:** ürün/mağaza adı ve açıklama yazdıkça
  panelin kurallarına göre düzeltilir, yapıştırılan metin düzeltilip panoya kopyalanır; Türkçe karakter, yazım hatası ve
  bitişik kelime havuzun sözlüğüyle, yapay zekâsız. **Excel:** dosyayı aç, ara, sırala, ad ve açıklama sütunlarını
  düzeltip indir, istenmeyen sütunları çıkar. **Logo ve banner:** panel ölçüleri ya da özel ölçü, 150 KB sınırı, JPEG/PNG.
  Hepsi tarayıcıda çalışır. Kurallar ekibin önceki aracının kural tablosuyla birebir sınandı (D-219).
- **Analiz:** altı ajanlık hat, ilk cevap normalde 6–11 saniye; hazır düğmeler ("Çorba öner") modelsiz, 1–3 saniye.
  Başlıkta **açılış kuralları** (ürün sayısı, 10 içecek, %70 açıklama, %20 fotoğraf, yazım düzeni) ve ek mutfak türü
  önerisi (D-206). Her ilk analiz (ekran görüntüsü, liste, tek ürün, yalnızca mutfak) **mutfağın hedefini geçecek kadar**
  ürün önerir: önce yazılan ürünün çeşitleri, sonra aynı türden ürünler, sonra mutfağın geri kalanı ("hamsi" → hamsi
  çeşitleri, balıklar, meze ve içecekler). Model yavaşsa havuz tamamlar (D-213).
- **Havuz ve model birlikte (D-217):** yapay zekâ kapalıyken de her mutfak hedefine ulaşır: canlı havuzun kopyasında 26
  mutfak × 4 senaryonun 102'si (önce 91'i), mutfak başlangıcında önerilerin %91'i mutfağın kendi ürünü (önce %65).
  Havuzdaki ürünler mutfağı modelsiz tanır (yanlış mutfak 13 senaryodan 2'ye indi). Modelin önerdiği yeni ürünler yönetimde
  "Yapay zekâ önerileri" sekmesinde birikir; havuza alınan sonra modelsiz önerilir.
- **Çok kişide (D-214):** analiz başına sunucu işlemcisi 650 → yaklaşık 50 ms; aynı anda 20 analiz 1 saniyenin altında
  (modeller hariç, `pnpm probe:load` ile ölçüldü). Aynı anda en çok 10 analiz çalışır, fazlası sırasını görerek bekler;
  sıra da doluysa "Şu an çok yoğunuz" denir. Hız sınırları kişi başına ve bir ofisin ortak adresine göre cömert: temsilci
  başına dakikada 30 mesaj, bir adresten dakikada 600 mesaj (D-215). Bir
  model 429 verince o dakika kaldırabildiği kadar çağrı alır, fazlası zincirdeki sıradaki modele gider.
- **Şablon havuzu:** 966 hazır şablon, 26 mutfak (Makarna & İtalyan, Mantı & Makarna'ya katıldı: D-212); her mutfakta
  havuz açılış hedefine yetiyor (D-207), paketli içecek seti; yönetimden **Excel ile toplu ekleme ve güncelleme**
  (örnek dosya, önizleme, dışa aktarma). Yönetimdeki liste bütün şablonları içerikleriyle, sayfa sayfa ve mutfağa göre
  gösterir.
- **Yönetim paneli:** pano (**anlık yük**: çalışan ve sıradaki analizler, süreler, sağlayıcı hataları; 14 günlük seri, kuralların kaçırılma oranı, hedefine uzak mutfaklar), görüşmeler, geri
  bildirimler, şablon havuzu ve arşivi, mutfak türleri, öğrenilenler, modeller.
- **Güvenlik:** ziyaretçi çerezi, admin girişi, üç katmanlı kota, CSP ve diğer başlıklar, ziyaretçinin ortak veriye
  yazamaması.
- **Testler:** backend 1368, web 120; hepsi geçiyor. GitHub Actions da yeşil. Canlıda temsilci senaryoları tek tek denendi,
  çıkan sekiz sorun düzeltildi (D-208).
- **Sunucu:** `myserver` üzerinde nginx + Cloudflare arkasında Docker Compose; her gece 03:30'da veritabanı yedeği.
  Uygulamanın bellek sınırı 512 MB. Analizler yavaşlarsa, sağlayıcı hataları %30'u aşarsa ya da kuyruk dolarsa ntfy
  uyarısı gelir (`ALERT_NTFY_URL`, D-214).

## Bilinen sorunlar

- **Gemini zaman zaman aşırı yoğun.** 503 "high demand" ve hız limiti verdiğinde zincir Groq'a düşer; Groq'un ücretsiz
  katmanı da limite takılınca öneriler hazır havuzdan gelir ve kartın üstünde bir not görünür. Yoğun anlarda ilk analiz
  20–30 saniyeyi bulabilir. 2026-11-13'te çağrıların %27'si bu yüzden başarısızdı; kişi sayısı arttıkça öneriler
  giderek havuzdan gelir. Kalıcı çözüm ücretli Gemini katmanı. Günlük kotalar cömert: temsilci başına 1000 çağrı, site
  geneli 10 000; başarısız çağrılar kotadan düşmez, tavanın %80'inde ntfy uyarısı gelir. Ücretsiz katmanda sağlayıcıların
  kendi günlük sınırı bundan önce dolar: o zaman ekran görüntüleri okunamaz, yazılan listeler, mutfak adları ve hazır
  düğmeler havuzdan çalışır ve mesaj bunu açıkça söyler (D-216).
- **Öğrenme döngüsü yeni veri almıyor.** Evet / Düşünecek / Hayır kaldırıldığı için (D-202) sistem restoranların tercihini
  artık öğrenmiyor; daha önce öğrendikleri çalışmaya devam ediyor. **Öğrenilenler** sayfası bu yüzden sabit.
- **Embedding kotası günde 1000 istek (Gemini ücretsiz katman).** Toplu şablon eklemesinden sonra kota dolarsa yeni
  şablonların vektörü ertesi gün tamamlanır: `embed-missing` taraması 30 dakikada bir 100 şablonu işler. Bu sürede
  öneriler havuzdan gelmeye devam eder, yalnızca anlamca benzer ad eşleştirmesi zayıflar. 2026-11-13'te 553 şablon
  bekliyordu.
- **Modelin yazdığı kartlar havuzunkiler kadar temiz değil.** Canlı testte "Mantar Peynirli Pide Pizza" gibi garip bir ad ve
  "Ekstra Yoğurt" / "Ekstra Yoğurtlu" gibi neredeyse aynı iki ekstra görüldü. Havuzdan gelen kartlarda bu olmuyor;
  `agents/validator.ts` ve `agents/grounding.ts` bu tür tekrarları daha sıkı eleyebilir.
- **Cloudflare Web Analytics betiği CSP'ye takılıyor.** Siteyi etkilemez, yalnızca tarayıcı konsolunda hata görünür.
  Cloudflare panelinden kapatılabilir.

## Sıradaki işler için fikirler

- **Havuz kalitesi:** her mutfakta havuz artık hedefe yetiyor (D-207). Bundan sonrası için en hızlı yol, yöneticilerin
  bölgelerinden gelen gerçek ürünleri yönetim panelinden Excel ile eklemesi; kod tarafı `backend/src/db/seed/templates-*.ts`.
- **İlk cevabın hızı:** kartlar ancak doğrulamadan sonra geliyor. Havuzdan gelen kartları erkenden göstermek ilk cevabı
  hızlandırır (`agents/pipeline.ts`, `item` olayları).
- **Öğrenme için hafif bir sinyal:** temsilcinin kopyaladığı kartlar "işe yaradı" sinyali olarak kaydedilebilir.
- **Kullanılmayan kod:** sesli not uç noktası kaldırıldı ama `audio.transcribe` görevi ve Groq Whisper kodu
  (`ai/router.ts`, `ai/providers/groq.provider.ts`) duruyor; temizlenebilir.

## Nereden başlamalı

1. [`README.md`](README.md): kurulum, mimari, neyi nerede değiştireceğin.
2. Seçenek B ile yerelde çalıştır, bir menü yapıştır, akışı uçtan uca gör.
3. [`DECISIONS.md`](DECISIONS.md) sonundaki D-198 … D-219 kayıtları son ayların neden öyle olduğunu anlatır.

Telefon uygulaması döneminin ilerleme günlüğü: [`docs/arsiv/PROGRESS-telefon-donemi.md`](docs/arsiv/PROGRESS-telefon-donemi.md).
