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
