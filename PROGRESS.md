# Durum

Son güncelleme: 2026-11-08 · Canlı sürüm: `fbce03b` · https://menu.example.com

## Bugün ne çalışıyor

- **Site:** sohbet ekranı (Ctrl+V, sürükle-bırak, dosya seçme, yazarak ürün listesi), takip mesajları, kopyalama, sayfa
  yenilenince kaldığı yerden devam, analiz sürerken görüşme değiştirme.
- **Analiz:** altı ajanlık hat, ilk cevap normalde 6–11 saniye; hazır düğmeler ("Çorba öner") modelsiz, 1–3 saniye.
- **Yönetim paneli:** genel bakış, görüşmeler (zaman çizelgesi), şablon havuzu ve arşivi, mutfak türleri, öğrenilenler,
  modeller.
- **Güvenlik:** ziyaretçi çerezi, admin girişi, üç katmanlı kota, CSP ve diğer başlıklar, ziyaretçinin ortak veriye
  yazamaması.
- **Testler:** backend 737, web 2; hepsi geçiyor.
- **Sunucu:** `myserver` üzerinde nginx + Cloudflare arkasında Docker Compose; her gece 03:30'da veritabanı yedeği.

## Bilinen sorunlar

- **Gemini zaman zaman aşırı yoğun.** 503 "high demand" ve hız limiti verdiğinde zincir Groq'a düşer; Groq'un ücretsiz
  katmanı da limite takılınca öneriler hazır havuzdan gelir ve kartın üstünde bir not görünür. Yoğun anlarda ilk analiz
  20–30 saniyeyi bulabilir. Kalıcı çözüm ücretli Gemini katmanı.
- **Öğrenme döngüsü yeni veri almıyor.** Evet / Düşünecek / Hayır kaldırıldığı için (D-202) sistem restoranların tercihini
  artık öğrenmiyor; daha önce öğrendikleri çalışmaya devam ediyor. **Öğrenilenler** sayfası bu yüzden sabit.
- **Cloudflare Web Analytics betiği CSP'ye takılıyor.** Siteyi etkilemez, yalnızca tarayıcı konsolunda hata görünür.
  Cloudflare panelinden kapatılabilir.
- **GitHub Actions sonucu son iki sürüm için doğrulanmadı.** Yerelde bütün kontroller geçiyor; Actions sekmesine bakmak lazım.

## Sıradaki işler için fikirler

- **Havuz kalitesi:** Türk mutfakları dışındaki mutfaklarda (Uzak Doğu, Dünya Mutfağı, Burger) hazır şablon az. Yapay zekâ
  yoğunken öneriler havuza düştüğü için buraya şablon eklemek kaliteyi doğrudan artırır (`backend/src/db/seed/templates-*.ts`).
- **İlk cevabın hızı:** kartlar ancak doğrulamadan sonra geliyor. Havuzdan gelen kartları erkenden göstermek ilk cevabı
  hızlandırır (`agents/pipeline.ts`, `item` olayları).
- **Öğrenme için hafif bir sinyal:** temsilcinin kopyaladığı kartlar "işe yaradı" sinyali olarak kaydedilebilir.
- **Kullanılmayan kod:** sesli not uç noktası kaldırıldı ama `audio.transcribe` görevi ve Groq Whisper kodu
  (`ai/router.ts`, `ai/providers/groq.provider.ts`) duruyor; temizlenebilir.

## Nereden başlamalı

1. [`README.md`](README.md): kurulum, mimari, neyi nerede değiştireceğin.
2. Seçenek B ile yerelde çalıştır, bir menü yapıştır, akışı uçtan uca gör.
3. [`DECISIONS.md`](DECISIONS.md) sonundaki D-198 … D-202 kayıtları son ayların neden öyle olduğunu anlatır.

Telefon uygulaması döneminin ilerleme günlüğü: [`docs/arsiv/PROGRESS-telefon-donemi.md`](docs/arsiv/PROGRESS-telefon-donemi.md).
