# Durum

Son güncelleme: 2026-11-13 · Canlı sürüm: `f06fca4`

## Bugün ne çalışıyor

- **Site:** sohbet ekranı (Ctrl+V, sürükle-bırak, dosya seçme, yazarak ürün listesi), takip mesajları, kopyalama, sayfa
  yenilenince kaldığı yerden devam, analiz sürerken görüşme değiştirme, **geri bildirim gönderme**.
- **Analiz:** altı ajanlık hat, ilk cevap normalde 6–11 saniye; hazır düğmeler ("Çorba öner") modelsiz, 1–3 saniye.
  Başlıkta **açılış kuralları** (ürün sayısı, 10 içecek, %70 açıklama, %20 fotoğraf, yazım düzeni) ve ek mutfak türü
  önerisi (D-206).
- **Şablon havuzu:** 977 hazır şablon; her mutfakta havuz açılış hedefine yetiyor (D-207), paketli içecek seti; yönetimden **Excel ile toplu ekleme ve
  güncelleme** (örnek dosya, önizleme, dışa aktarma).
- **Yönetim paneli:** pano (14 günlük seri, kuralların kaçırılma oranı, hedefine uzak mutfaklar), görüşmeler, geri
  bildirimler, şablon havuzu ve arşivi, mutfak türleri, öğrenilenler, modeller.
- **Güvenlik:** ziyaretçi çerezi, admin girişi, üç katmanlı kota, CSP ve diğer başlıklar, ziyaretçinin ortak veriye
  yazamaması.
- **Testler:** backend 1311, web 2; hepsi geçiyor. GitHub Actions da yeşil. Canlıda temsilci senaryoları tek tek denendi,
  çıkan sekiz sorun düzeltildi (D-208).
- **Sunucu:** `myserver` üzerinde nginx + Cloudflare arkasında Docker Compose; her gece 03:30'da veritabanı yedeği.

## Bilinen sorunlar

- **Gemini zaman zaman aşırı yoğun.** 503 "high demand" ve hız limiti verdiğinde zincir Groq'a düşer; Groq'un ücretsiz
  katmanı da limite takılınca öneriler hazır havuzdan gelir ve kartın üstünde bir not görünür. Yoğun anlarda ilk analiz
  20–30 saniyeyi bulabilir. Kalıcı çözüm ücretli Gemini katmanı.
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
3. [`DECISIONS.md`](DECISIONS.md) sonundaki D-198 … D-211 kayıtları son ayların neden öyle olduğunu anlatır.

Telefon uygulaması döneminin ilerleme günlüğü: [`docs/arsiv/PROGRESS-telefon-donemi.md`](docs/arsiv/PROGRESS-telefon-donemi.md).
