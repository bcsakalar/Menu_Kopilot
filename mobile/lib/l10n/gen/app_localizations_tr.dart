// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Turkish (`tr`).
class AppLocalizationsTr extends AppLocalizations {
  AppLocalizationsTr([String locale = 'tr']) : super(locale);

  @override
  String get appTitle => 'Menü Kopilot';

  @override
  String get appTagline => 'Şube açılışında menüyü hızla tamamla';

  @override
  String get changeServer => 'Değiştir';

  @override
  String get disclaimer => 'Öneriler yapay zekâ ve şablonlardan üretilir; restoranla teyit et.';

  @override
  String get cancel => 'İptal';

  @override
  String get save => 'Kaydet';

  @override
  String get delete => 'Sil';

  @override
  String get retry => 'Tekrar dene';

  @override
  String get close => 'Kapat';

  @override
  String get copied => 'Kopyalandı';

  @override
  String get copy => 'Kopyala';

  @override
  String get copyAll => 'Tümünü kopyala';

  @override
  String get edit => 'Düzenle';

  @override
  String get loading => 'Yükleniyor…';

  @override
  String get offlineBanner => 'Çevrimdışı: son sonuçlar ve şablonlar gösteriliyor';

  @override
  String get genericError => 'Bir şeyler ters gitti';

  @override
  String get networkError => 'Sunucuya ulaşılamadı. Bağlantını kontrol et.';

  @override
  String sharedPhotos(int count) {
    return '$count fotoğraf paylaşıldı';
  }

  @override
  String get sharedText => 'Metin paylaşıldı';

  @override
  String get shareAsMenuPhotos => 'Görüntüleri analize ekle';

  @override
  String get shareAsMenuPhotosHint =>
      'Menü fotoğrafı ya da platform panel ekran görüntüsü — ikisi de olur';

  @override
  String get shareAsProductList => 'Metni menü listesine ekle';

  @override
  String get navTemplates => 'Şablonlar';

  @override
  String get navSettings => 'Ayarlar';

  @override
  String get loginTitle => 'Giriş yap';

  @override
  String get serverUrl => 'Sunucu adresi';

  @override
  String get serverUrlHint => 'https://api.ornek.com';

  @override
  String get email => 'E-posta';

  @override
  String get password => 'Şifre';

  @override
  String get loginButton => 'Giriş';

  @override
  String loginFailed(String message) {
    return 'Giriş başarısız: $message';
  }

  @override
  String get fieldRequired => 'Bu alan zorunlu';

  @override
  String get invalidUrl => 'Geçerli bir adres gir (http/https)';

  @override
  String get insecureUrl => 'Güvenli bağlantı gerekli: adres https:// ile başlamalı';

  @override
  String get logout => 'Çıkış yap';

  @override
  String get cuisine => 'Mutfak türü';

  @override
  String get selectCuisine => 'Mutfak türü seç';

  @override
  String get recentCuisines => 'Son kullanılanlar';

  @override
  String get allCuisines => 'Tümü';

  @override
  String get photos => 'Menü fotoğrafları';

  @override
  String get takePhoto => 'Kamera';

  @override
  String get pickFromGallery => 'Galeri';

  @override
  String get productsUnit => 'ürün';

  @override
  String get cardsUnit => 'öneri';

  @override
  String aiCallsCount(int count) {
    return '$count AI çağrısı';
  }

  @override
  String get newShort => 'Yeni';

  @override
  String get cameraStarting => 'Kamera açılıyor…';

  @override
  String get shareWhereTo => 'Nereye eklensin?';

  @override
  String get needInput => 'Menüdeki ürünleri yaz veya bir görüntü ekle';

  @override
  String get compressing => 'Fotoğraflar küçültülüyor…';

  @override
  String maxPhotos(int max) {
    return 'En fazla $max fotoğraf eklenebilir';
  }

  @override
  String get recentRuns => 'Son analizler';

  @override
  String get noRecentRuns => 'Henüz analiz yok';

  @override
  String get photoRunTitle => 'Fotoğraftan analiz';

  @override
  String get queuedOffline => 'Bağlantı yok: istek kuyruğa alındı, bağlantı gelince gönderilecek';

  @override
  String pendingQueue(int count) {
    return 'Kuyrukta $count istek';
  }

  @override
  String get cameraTitle => 'Menüyü çek';

  @override
  String cameraDone(int count) {
    return 'Bitti ($count)';
  }

  @override
  String get cameraUnavailable => 'Kamera kullanılamıyor';

  @override
  String get cameraPermission => 'Kamera izni gerekli';

  @override
  String get resultsTitle => 'Analiz';

  @override
  String get readingPhotos => 'Fotoğraflar okunuyor…';

  @override
  String cardsReady(int count) {
    return '$count kart';
  }

  @override
  String get stop => 'Durdur';

  @override
  String get stopped => 'Durduruldu';

  @override
  String get fromCache => 'Tamamen veritabanı/önbellekten';

  @override
  String get badgeSeed => 'Hazır şablon';

  @override
  String get badgeDb => 'DB\'den';

  @override
  String get badgeAi => 'AI';

  @override
  String get badgeReview => 'İnceleme gerek';

  @override
  String get acceptNeedsContent => 'Önce açıklama veya bir opsiyon grubu ekle';

  @override
  String get description => 'Açıklama';

  @override
  String get servingNote => 'Servis şekli';

  @override
  String get portionInfo => 'Porsiyon / adet';

  @override
  String get optionGroups => 'Opsiyon grupları';

  @override
  String get removables => 'Çıkarılabilir malzemeler';

  @override
  String get extras => 'Ekstra malzemeler';

  @override
  String get tags => 'Etiketler';

  @override
  String get allergens => 'Alerjenler';

  @override
  String get upsell => 'Yanında öner';

  @override
  String get productName => 'Ürün adı';

  @override
  String get singleChoice => 'tek seçim';

  @override
  String multiChoice(int max) {
    return 'çoklu seçim (en fazla $max)';
  }

  @override
  String get required => 'zorunlu';

  @override
  String get optional => 'isteğe bağlı';

  @override
  String get priceFree => 'ücretsiz';

  @override
  String get priceSurcharge => 'ek ücretli';

  @override
  String get priceSetsBase => 'tabanı belirler';

  @override
  String get defaultOption => 'varsayılan';

  @override
  String get addGroup => 'Grup ekle';

  @override
  String get addOption => 'Opsiyon ekle';

  @override
  String get addItem => 'Ekle';

  @override
  String get groupName => 'Grup adı';

  @override
  String get optionName => 'Opsiyon adı';

  @override
  String get newItemHint => 'Yeni öğe';

  @override
  String get editCard => 'Kartı düzenle';

  @override
  String editField(String field) {
    return '$field düzenle';
  }

  @override
  String get unsavedChanges => 'Kaydedilmemiş değişiklikler var';

  @override
  String get discard => 'Vazgeç';

  @override
  String cuisineSubtitle(int target, int templates) {
    return 'Hedef $target ürün · $templates şablon';
  }

  @override
  String get notes => 'Notlar';

  @override
  String get invalidNumber => '1 ile 500 arasında bir sayı gir';

  @override
  String get screenshots => 'Panel ekran görüntüleri';

  @override
  String get screenshotsHint =>
      'İstersen platform panelinin ekran görüntülerini veya menü fotoğrafını ekle; üst üste binen görüntüler sorun değil.';

  @override
  String get extraNotes => 'Not (isteğe bağlı)';

  @override
  String get extraNotesHint => 'ör. restoran tatlı da yapıyor';

  @override
  String get analyzeButton => 'Analiz et';

  @override
  String get menuTextLabel => 'Menüde neler var?';

  @override
  String get menuTextHint => 'ör. adana, urfa, lahmacun — ekran görüntüsü olmadan da çalışır';

  @override
  String get noAnalysisYet => 'Henüz analiz yok — menüyü yaz veya ekran görüntüsü ekle';

  @override
  String missingCount(int count) {
    return '$count ürün eksik';
  }

  @override
  String get targetReached => 'Hedef tamam';

  @override
  String get analyzing => 'Analiz ediliyor…';

  @override
  String analysisSummary(int items, int calls) {
    return '$items ürün okundu · $calls AI çağrısı';
  }

  @override
  String get searchTemplates => 'Şablon ara (ad veya takma ad)';

  @override
  String get sortBy => 'Sırala';

  @override
  String get sortUsage => 'Kullanıma göre';

  @override
  String get sortName => 'Ada göre';

  @override
  String get sortUpdated => 'Son değişene göre';

  @override
  String get allSources => 'Tümü';

  @override
  String get sourceUser => 'Onaylı (kullanıcı)';

  @override
  String get noTemplates => 'Şablon bulunamadı';

  @override
  String templateCount(int count) {
    return '$count şablon';
  }

  @override
  String usedTimes(int count) {
    return '$count kez kullanıldı';
  }

  @override
  String get aliases => 'Takma adlar';

  @override
  String get templateSaved => 'Şablon kaydedildi';

  @override
  String deleteTemplateConfirm(String name) {
    return '"$name" şablonu silinsin mi?';
  }

  @override
  String deleteSeedTemplateConfirm(String name) {
    return '"$name" hazır şablonu havuzdan kaldırılsın mı? (Arşivlenir, tekrar yüklenmez.)';
  }

  @override
  String get menuSettings => 'Menü';

  @override
  String get cuisinesAndMinimums => 'Mutfak türleri ve minimum ürün sayıları';

  @override
  String get cuisinesAndMinimumsHint => 'Açılış hedefi ve beklenen kategoriler buradan hesaplanır';

  @override
  String get categoriesTitle => 'Kategoriler ve anahtar kelimeler';

  @override
  String get categoriesHint => 'Bir ürünün hangi kategoriye düştüğünü adındaki kelimeler belirler';

  @override
  String get categoriesHelp =>
      'Ürün adında bu kelimelerden biri geçerse ürün o kategoriye sayılır ("şalgam" → İçecek); büyük/küçük harf ve Türkçe karakter fark etmez. Birden çok kelime tek ifade olarak eşleşir ("sıcak çikolata"). Değişiklik bir sonraki analizde geçerli olur.';

  @override
  String get keywordsLabel => 'Anahtar kelimeler (virgülle ayır)';

  @override
  String keywordsCount(int count) {
    return '$count anahtar kelime';
  }

  @override
  String get cuisineCategoriesMenu => 'Kategoriler ve min. sayılar';

  @override
  String get cuisineCategoriesHelp =>
      'İşaretli kategoriler bu mutfakta beklenir; sayı, açılış için o kategoride olması gereken en az ürün. 0 = olsa iyi olur. Değişiklik bir sonraki analizde geçerli olur.';

  @override
  String minItemsLabel(int count) {
    return 'en az $count';
  }

  @override
  String get savedMessage => 'Kaydedildi';

  @override
  String get newCuisine => 'Yeni mutfak türü';

  @override
  String get cuisineName => 'Mutfak adı';

  @override
  String get minItemCount => 'Minimum ürün sayısı';

  @override
  String get minimumsHelp =>
      'Gerçek platform minimumlarını buraya gir. Açılış hedefi = en az 10 veya bu sayı (hangisi büyükse). Menüdeki ⋮ ile hangi kategorilerin beklendiğini de ayarlayabilirsin.';

  @override
  String minimumLine(int min, int target) {
    return 'Minimum $min · hedef $target ürün';
  }

  @override
  String get aiSection => 'Yapay zekâ';

  @override
  String get aiModels => 'Görev bazlı modeller';

  @override
  String get aiModelsHint => 'Her iş için birincil model; diğerleri yedek';

  @override
  String get aiModelsHelp =>
      'API anahtarları yalnızca sunucuda durur. Buradan her görev için birincil modeli seçersin; zincirin kalanı otomatik yedek olarak kullanılır.';

  @override
  String get providerReady => 'hazır';

  @override
  String get providerNoKey => 'anahtar yok';

  @override
  String get preview => 'önizleme';

  @override
  String fallbackChain(String chain) {
    return 'Yedek: $chain';
  }

  @override
  String get quotaToday => 'Bugünkü kota';

  @override
  String quotaLine(int calls, int dailyCalls, int tokens, int dailyTokens) {
    return '$calls/$dailyCalls çağrı · $tokens/$dailyTokens token';
  }

  @override
  String get localOnlyOn => 'Yerel mod açık: yalnızca veritabanı ve önbellek kullanılıyor';

  @override
  String get quotaExceeded => 'Günlük kota doldu';

  @override
  String get appearance => 'Görünüm';

  @override
  String get themeSystem => 'Sistem';

  @override
  String get themeLight => 'Açık';

  @override
  String get themeDark => 'Koyu';

  @override
  String serverStatus(String status) {
    return 'Sunucu durumu: $status';
  }

  @override
  String get usageTitle => 'Kullanım';

  @override
  String get rangeToday => 'Bugün';

  @override
  String get rangeMonth => 'Bu ay';

  @override
  String get aiCalls => 'AI çağrısı';

  @override
  String get failedCalls => 'Hatalı';

  @override
  String get tokens => 'Token';

  @override
  String get avgLatency => 'Ort. süre';

  @override
  String get runsLabel => 'İstek';

  @override
  String get cacheHitRatio => 'AI\'sız cevap';

  @override
  String get cardsLabel => 'Kart';

  @override
  String get dbHitRatio => 'DB\'den kart';

  @override
  String cardsBreakdown(int db, int ai, int review) {
    return '$db DB/hazır şablon · $ai AI · $review inceleme';
  }

  @override
  String get byModel => 'Modele göre';

  @override
  String get byTask => 'Göreve göre';

  @override
  String get errorsLabel => 'Hatalar';

  @override
  String get noUsage => 'Bu aralıkta AI çağrısı yok';

  @override
  String modelUsageLine(int calls, int failed, int tokens) {
    return '$calls çağrı · $failed hata · $tokens token';
  }

  @override
  String copyMultiChoice(int max) {
    return 'çoklu seçim, en fazla $max';
  }

  @override
  String get copyLabelDescription => 'Açıklama';

  @override
  String get copyLabelPortion => 'Porsiyon';

  @override
  String get copyLabelServing => 'Servis';

  @override
  String get copyLabelOptions => 'Opsiyonlar';

  @override
  String get copyLabelRemovables => 'Çıkarılabilir';

  @override
  String get copyLabelExtras => 'Ekstra';

  @override
  String get copyLabelTags => 'Etiketler';

  @override
  String get copyLabelAllergens => 'Alerjen';

  @override
  String get copyLabelUpsell => 'Öneri';

  @override
  String get cancelled => 'İptal edildi';

  @override
  String get compressFailed => 'Fotoğraf küçültülemedi, başka bir fotoğraf dene';

  @override
  String get voiceNote => 'Sesli not';

  @override
  String voiceRecording(String time) {
    return 'Bitir ($time)';
  }

  @override
  String get voiceSending => 'Yazıya çevriliyor…';

  @override
  String get voiceEmpty => 'Kayıtta konuşma anlaşılamadı';

  @override
  String get voiceNeedsNetwork => 'Sesli not için internet bağlantısı gerekli';

  @override
  String get micPermission => 'Sesli not için mikrofon izni gerekli';

  @override
  String get settingsTitle => 'Ayarlar';

  @override
  String get account => 'Hesap';

  @override
  String get serverSection => 'Sunucu';

  @override
  String get about => 'Hakkında';

  @override
  String version(String version) {
    return 'Sürüm $version';
  }

  @override
  String get navAnalyze => 'Analiz';

  @override
  String get newAnalysis => 'Menü analizi';

  @override
  String get cuisineAuto => 'Otomatik (menüden anla)';

  @override
  String cuisineLabelled(String name) {
    return 'mutfak türü: $name';
  }

  @override
  String cuisineMismatch(String name) {
    return 'Menü $name gibi görünüyor.';
  }

  @override
  String rerunAs(String name) {
    return '$name olarak yeniden analiz et';
  }

  @override
  String get changeCuisine => 'Mutfak türünü değiştir (menü yeniden okunmaz)';

  @override
  String get progressCurrent => 'Mevcut';

  @override
  String get progressTarget => 'hedef';

  @override
  String belowHardMinimum(int min) {
    return 'Açılış için en az $min ürün gerekli';
  }

  @override
  String get debugToggle => 'Ayrıntılı kayıt';

  @override
  String get debugToggleHint =>
      'Her agent adımının girdi/çıktısını sakla; sonuç ekranındaki böcek simgesinden görürsün.';

  @override
  String get sectionNewProducts => 'YENİ ÜRÜNLER';

  @override
  String get sectionNewProductsHint => 'Menüde hiç yok — eklenmesi öneriliyor';

  @override
  String get sectionOptions => 'OPSİYON & MALZEME';

  @override
  String get sectionOptionsHint => 'Menüde olan ürünler için seçenek ve malzeme';

  @override
  String get sectionFixes => 'EKSİK / DÜZELTME';

  @override
  String get sectionFixesHint => 'Mevcut üründe boş alan veya hatalı isim';

  @override
  String get sectionEmpty => 'Bu bölümde bir şey çıkmadı.';

  @override
  String get filterAll => 'Tümü';

  @override
  String get filterNewProducts => 'Yeni ürün';

  @override
  String get filterOptions => 'Opsiyon';

  @override
  String get filterFixes => 'Düzeltme';

  @override
  String get selectCard => 'Kartı seç';

  @override
  String get selectAll => 'Hepsini seç';

  @override
  String selectedCount(int count) {
    return '$count kart seçili';
  }

  @override
  String get copySelected => 'Panoya kopyala';

  @override
  String get clearSelection => 'Seçimi temizle';

  @override
  String get copyOptions => 'Opsiyonları kopyala';

  @override
  String get copyLabelCategory => 'Kategori';

  @override
  String get copyLabelPriceRange => 'Tahmini fiyat';

  @override
  String get addCard => 'Ekle';

  @override
  String get reject => 'Reddet';

  @override
  String get markDone => 'Not aldım';

  @override
  String get acceptedBadge => 'eklendi';

  @override
  String get queuedBadge => 'kuyrukta';

  @override
  String get fixEmptyDescription => 'açıklama boş';

  @override
  String get fixBadName => 'ad düzeltilmeli';

  @override
  String get fixWrongCategory => 'kategori yanlış';

  @override
  String get pipelineDebug => 'Pipeline';

  @override
  String get pipelineEmpty => 'Bu koşu için adım kaydı yok';

  @override
  String pipelineTotal(int ms) {
    return 'toplam $ms ms';
  }

  @override
  String pipelineSteps(int count) {
    return '$count adım';
  }

  @override
  String pipelineTokens(int input, int output) {
    return '$input / $output token';
  }

  @override
  String get pipelineInput => 'Girdi';

  @override
  String get pipelineOutput => 'Çıktı';

  @override
  String get agentExtractor => 'Menü okuma';

  @override
  String get agentClassifier => 'Mutfak türü';

  @override
  String get agentGapAnalyst => 'Eksik analizi';

  @override
  String get agentProductRecommender => 'Yeni ürün önerisi';

  @override
  String get agentOptionModifier => 'Opsiyon & malzeme';

  @override
  String get agentValidator => 'Doğrulama';
}
