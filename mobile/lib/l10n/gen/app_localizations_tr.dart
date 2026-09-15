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
  String get disclaimer =>
      'Öneriler yapay zekâ ve şablonlardan üretilir; restoranla teyit et.';

  @override
  String get ok => 'Tamam';

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
  String get offlineBanner =>
      'Çevrimdışı: son sonuçlar ve şablonlar gösteriliyor';

  @override
  String get genericError => 'Bir şeyler ters gitti';

  @override
  String get networkError => 'Sunucuya ulaşılamadı. Bağlantını kontrol et.';

  @override
  String get navSuggest => 'Öneri';

  @override
  String get navGap => 'Tamamla';

  @override
  String get navBranches => 'Şubeler';

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
  String get logout => 'Çıkış yap';

  @override
  String get newSuggestion => 'Yeni Öneri';

  @override
  String get cuisine => 'Mutfak türü';

  @override
  String get selectCuisine => 'Mutfak türü seç';

  @override
  String get recentCuisines => 'Son kullanılanlar';

  @override
  String get allCuisines => 'Tümü';

  @override
  String get promptLabel => 'Ürünler';

  @override
  String get promptHint => 'ör. adana kebap, lahmacun, künefe var';

  @override
  String get photos => 'Menü fotoğrafları';

  @override
  String photosCount(int count, int max) {
    return '$count/$max fotoğraf';
  }

  @override
  String get takePhoto => 'Kamera';

  @override
  String get pickFromGallery => 'Galeri';

  @override
  String get deepMode => 'Derin analiz (daha yavaş, daha ayrıntılı)';

  @override
  String get suggestButton => 'Öner';

  @override
  String get needInput => 'Ürün yaz veya menü fotoğrafı ekle';

  @override
  String get compressing => 'Fotoğraflar küçültülüyor…';

  @override
  String maxPhotos(int max) {
    return 'En fazla $max fotoğraf eklenebilir';
  }

  @override
  String get recentRuns => 'Son öneriler';

  @override
  String get noRecentRuns => 'Henüz öneri yok';

  @override
  String get queuedOffline =>
      'Bağlantı yok: istek kuyruğa alındı, bağlantı gelince gönderilecek';

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
  String get resultsTitle => 'Öneriler';

  @override
  String get streaming => 'Hazırlanıyor…';

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
  String get continueButton => 'Devam et';

  @override
  String budgetExhausted(int count) {
    return 'Bu istek için bütçe doldu: $count ürün bekliyor';
  }

  @override
  String doneSummary(int db, int ai, int review, int calls) {
    return '$db DB, $ai AI, $review inceleme · $calls AI çağrısı';
  }

  @override
  String get fromCache => 'Tamamen veritabanı/önbellekten';

  @override
  String get placeholderPreparing => 'hazırlanıyor…';

  @override
  String get badgeSeed => 'Hazır şablon';

  @override
  String get badgeDb => 'DB\'den';

  @override
  String get badgeAi => 'AI';

  @override
  String get badgeReview => 'İnceleme gerek';

  @override
  String get reviewUnknown => 'Bunu bilmiyorum, sen doldur.';

  @override
  String get accept => 'Onayla';

  @override
  String get accepted => 'Onaylandı';

  @override
  String get skip => 'Atla';

  @override
  String get skipped => 'Atlandı';

  @override
  String get savedAsTemplate => 'Şablona kaydedildi';

  @override
  String get acceptNeedsContent => 'Önce açıklama veya bir opsiyon grubu ekle';

  @override
  String get description => 'Açıklama';

  @override
  String descriptionCounter(int count) {
    return '$count/160';
  }

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
  String get gapTitle => 'Menü Tamamlama';

  @override
  String get branch => 'Şube';

  @override
  String get selectBranch => 'Şube seç';

  @override
  String get newBranch => 'Yeni şube';

  @override
  String get editBranch => 'Şubeyi düzenle';

  @override
  String get branchName => 'Şube adı';

  @override
  String get city => 'Şehir';

  @override
  String get notes => 'Notlar';

  @override
  String get targetOverride => 'Hedef ürün sayısı (boş = otomatik)';

  @override
  String targetOverrideHelp(int count) {
    return 'Otomatik hedef: $count ürün';
  }

  @override
  String get invalidNumber => '1 ile 500 arasında bir sayı gir';

  @override
  String get noBranches => 'Henüz şube yok. Önce bir şube oluştur.';

  @override
  String get screenshots => 'Panel ekran görüntüleri';

  @override
  String get screenshotsHint =>
      'platform panelindeki ürün listesinin ekran görüntülerini ekle; kaydırarak alınmış, üst üste binen görüntüler sorun değil.';

  @override
  String get extraNotes => 'Not (isteğe bağlı)';

  @override
  String get extraNotesHint => 'ör. restoran tatlı da yapıyor';

  @override
  String get analyzeButton => 'Eksikleri bul';

  @override
  String get needScreenshot => 'Şube seç ve en az bir ekran görüntüsü ekle';

  @override
  String lastAnalysis(String date) {
    return 'Son analiz: $date';
  }

  @override
  String get openLastAnalysis => 'Aç';

  @override
  String get noAnalysisYet => 'Bu şube için henüz analiz yok';

  @override
  String countsLabel(int current, int target) {
    return '$current / $target ürün';
  }

  @override
  String missingCount(int count) {
    return '$count ürün eksik';
  }

  @override
  String get targetReached => 'Hedef tamam';

  @override
  String get manualTarget => 'elle girilen hedef';

  @override
  String get analyzing => 'Analiz ediliyor…';

  @override
  String get analysisFromCache => 'Tamamen önbellekten (AI çağrısı yok)';

  @override
  String analysisSummary(int screenshots, int unique, int calls) {
    return '$screenshots görüntü · $unique ürün · $calls AI çağrısı';
  }

  @override
  String callChecklist(int done, int total) {
    return 'Çağrıda sor ($done/$total)';
  }

  @override
  String get gapEmptyChecklist => 'Sorulacak bir şey kalmadı';

  @override
  String get clearTicks => 'İşaretleri temizle';

  @override
  String incompleteItems(int count) {
    return 'Eksik bilgisi olan ürünler ($count)';
  }

  @override
  String recommendedItems(int count) {
    return 'Önerilen ürünler ($count)';
  }

  @override
  String completeItems(int count) {
    return 'Tamam olanlar ($count)';
  }

  @override
  String get missingDescription => 'Açıklama yok';

  @override
  String get missingOptions => 'Opsiyon yok';

  @override
  String get missingRemovables => 'Malzeme yok';

  @override
  String get unknownDescription => 'Açıklama ?';

  @override
  String get unknownOptions => 'Opsiyon ?';

  @override
  String get unknownRemovables => 'Malzeme ?';

  @override
  String get prepareCard => 'Kart hazırla';

  @override
  String get branchStatusDraft => 'Taslak';

  @override
  String get branchStatusInProgress => 'Devam ediyor';

  @override
  String get branchStatusReady => 'Hazır';

  @override
  String get branchStatusOpened => 'Açıldı';

  @override
  String get deleteBranch => 'Şubeyi sil';

  @override
  String deleteBranchConfirm(String name) {
    return '\"$name\" şubesi ve menüsü silinsin mi?';
  }

  @override
  String deleteMenuItemConfirm(String name) {
    return '\"$name\" şube menüsünden silinsin mi?';
  }

  @override
  String get menu => 'Menü';

  @override
  String get export => 'Dışa aktar';

  @override
  String get exportCsv => 'Excel (CSV)';

  @override
  String get exportCsvHint => 'Türkçe Excel\'de doğrudan açılır';

  @override
  String get exportJson => 'JSON';

  @override
  String menuOnMenu(int count) {
    return 'Menüde ($count)';
  }

  @override
  String menuIncomplete(int count) {
    return 'Eksik bilgi ($count)';
  }

  @override
  String menuRecommended(int count) {
    return 'Önerilen ($count)';
  }

  @override
  String get markComplete => 'Tamam';

  @override
  String get markAvailable => 'Var';

  @override
  String get cardAccepted => 'Kart onaylı';

  @override
  String get targetAutomatic => 'otomatik hedef (mutfak minimumu)';

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
    return '\"$name\" şablonu silinsin mi?';
  }

  @override
  String deleteSeedTemplateConfirm(String name) {
    return '\"$name\" hazır şablonu havuzdan kaldırılsın mı? (Arşivlenir, tekrar yüklenmez.)';
  }

  @override
  String get menuSettings => 'Menü';

  @override
  String get cuisinesAndMinimums => 'Mutfak türleri ve minimum ürün sayıları';

  @override
  String get cuisinesAndMinimumsHint => 'Şube hedefleri buradan hesaplanır';

  @override
  String get newCuisine => 'Yeni mutfak türü';

  @override
  String get cuisineName => 'Mutfak adı';

  @override
  String get minItemCount => 'Minimum ürün sayısı';

  @override
  String get minimumsHelp =>
      'Gerçek platform minimumlarını buraya gir. Şube hedefi = en az 10 veya bu sayı (hangisi büyükse); şubede elle hedef girilebilir.';

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
  String get localOnlyOn =>
      'Yerel mod açık: yalnızca veritabanı ve önbellek kullanılıyor';

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
  String get researchTitle => 'İnternette araştır';

  @override
  String get researchHint =>
      'Restoranın herkese açık sayfaları (web sitesi, harita kaydı, sosyal medya) taranır. Bulunan ürünleri restoranla teyit et; fiyat ve iletişim bilgisi alınmaz.';

  @override
  String get researchStart => 'Restoranı internette araştır';

  @override
  String get researchRunning =>
      'Web\'de aranıyor… (yarım dakika kadar sürebilir)';

  @override
  String get researchAgain => 'Yeniden araştır';

  @override
  String researchFound(int count) {
    return 'İnternette $count ürün bulundu';
  }

  @override
  String get researchNotFound => 'Restoran internette bulunamadı';

  @override
  String researchConfidence(int value) {
    return 'güven %$value';
  }

  @override
  String researchCachedAt(String date) {
    return 'kayıtlı sonuç: $date';
  }

  @override
  String researchNotOnMenu(int count) {
    return 'Menüde olmayanlar ($count)';
  }

  @override
  String researchOnMenu(int count) {
    return 'Menüde olanlar ($count)';
  }

  @override
  String researchItems(int count) {
    return 'Bulunan ürünler ($count)';
  }

  @override
  String researchPrepareAll(int count) {
    return '$count ürün için kart hazırla';
  }

  @override
  String researchTemplate(String name) {
    return 'şablon: $name';
  }

  @override
  String get researchSources => 'Kaynaklar';

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
}
