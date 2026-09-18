import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_tr.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'gen/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[Locale('tr')];

  /// No description provided for @appTitle.
  ///
  /// In tr, this message translates to:
  /// **'Menü Kopilot'**
  String get appTitle;

  /// No description provided for @appTagline.
  ///
  /// In tr, this message translates to:
  /// **'Şube açılışında menüyü hızla tamamla'**
  String get appTagline;

  /// No description provided for @changeServer.
  ///
  /// In tr, this message translates to:
  /// **'Değiştir'**
  String get changeServer;

  /// No description provided for @disclaimer.
  ///
  /// In tr, this message translates to:
  /// **'Öneriler yapay zekâ ve şablonlardan üretilir; restoranla teyit et.'**
  String get disclaimer;

  /// No description provided for @ok.
  ///
  /// In tr, this message translates to:
  /// **'Tamam'**
  String get ok;

  /// No description provided for @cancel.
  ///
  /// In tr, this message translates to:
  /// **'İptal'**
  String get cancel;

  /// No description provided for @save.
  ///
  /// In tr, this message translates to:
  /// **'Kaydet'**
  String get save;

  /// No description provided for @delete.
  ///
  /// In tr, this message translates to:
  /// **'Sil'**
  String get delete;

  /// No description provided for @retry.
  ///
  /// In tr, this message translates to:
  /// **'Tekrar dene'**
  String get retry;

  /// No description provided for @close.
  ///
  /// In tr, this message translates to:
  /// **'Kapat'**
  String get close;

  /// No description provided for @copied.
  ///
  /// In tr, this message translates to:
  /// **'Kopyalandı'**
  String get copied;

  /// No description provided for @copy.
  ///
  /// In tr, this message translates to:
  /// **'Kopyala'**
  String get copy;

  /// No description provided for @copyAll.
  ///
  /// In tr, this message translates to:
  /// **'Tümünü kopyala'**
  String get copyAll;

  /// No description provided for @edit.
  ///
  /// In tr, this message translates to:
  /// **'Düzenle'**
  String get edit;

  /// No description provided for @loading.
  ///
  /// In tr, this message translates to:
  /// **'Yükleniyor…'**
  String get loading;

  /// No description provided for @offlineBanner.
  ///
  /// In tr, this message translates to:
  /// **'Çevrimdışı: son sonuçlar ve şablonlar gösteriliyor'**
  String get offlineBanner;

  /// No description provided for @genericError.
  ///
  /// In tr, this message translates to:
  /// **'Bir şeyler ters gitti'**
  String get genericError;

  /// No description provided for @networkError.
  ///
  /// In tr, this message translates to:
  /// **'Sunucuya ulaşılamadı. Bağlantını kontrol et.'**
  String get networkError;

  /// No description provided for @navSuggest.
  ///
  /// In tr, this message translates to:
  /// **'Öneri'**
  String get navSuggest;

  /// No description provided for @navGap.
  ///
  /// In tr, this message translates to:
  /// **'Tamamla'**
  String get navGap;

  /// No description provided for @sharedPhotos.
  ///
  /// In tr, this message translates to:
  /// **'{count} fotoğraf paylaşıldı'**
  String sharedPhotos(int count);

  /// No description provided for @sharedText.
  ///
  /// In tr, this message translates to:
  /// **'Metin paylaşıldı'**
  String get sharedText;

  /// No description provided for @shareAsMenuPhotos.
  ///
  /// In tr, this message translates to:
  /// **'Menü fotoğrafı → Öneri'**
  String get shareAsMenuPhotos;

  /// No description provided for @shareAsMenuPhotosHint.
  ///
  /// In tr, this message translates to:
  /// **'Ürün kartları hazırlanır'**
  String get shareAsMenuPhotosHint;

  /// No description provided for @shareAsScreenshots.
  ///
  /// In tr, this message translates to:
  /// **'Panel ekran görüntüsü → Tamamla'**
  String get shareAsScreenshots;

  /// No description provided for @shareAsScreenshotsHint.
  ///
  /// In tr, this message translates to:
  /// **'Şubenin eksikleri bulunur'**
  String get shareAsScreenshotsHint;

  /// No description provided for @shareAsProductList.
  ///
  /// In tr, this message translates to:
  /// **'Ürün listesi → Öneri'**
  String get shareAsProductList;

  /// No description provided for @shareAsMenuText.
  ///
  /// In tr, this message translates to:
  /// **'Menüdeki ürünler → Tamamla'**
  String get shareAsMenuText;

  /// No description provided for @navBranches.
  ///
  /// In tr, this message translates to:
  /// **'Şubeler'**
  String get navBranches;

  /// No description provided for @navTemplates.
  ///
  /// In tr, this message translates to:
  /// **'Şablonlar'**
  String get navTemplates;

  /// No description provided for @navSettings.
  ///
  /// In tr, this message translates to:
  /// **'Ayarlar'**
  String get navSettings;

  /// No description provided for @loginTitle.
  ///
  /// In tr, this message translates to:
  /// **'Giriş yap'**
  String get loginTitle;

  /// No description provided for @serverUrl.
  ///
  /// In tr, this message translates to:
  /// **'Sunucu adresi'**
  String get serverUrl;

  /// No description provided for @serverUrlHint.
  ///
  /// In tr, this message translates to:
  /// **'https://api.ornek.com'**
  String get serverUrlHint;

  /// No description provided for @email.
  ///
  /// In tr, this message translates to:
  /// **'E-posta'**
  String get email;

  /// No description provided for @password.
  ///
  /// In tr, this message translates to:
  /// **'Şifre'**
  String get password;

  /// No description provided for @loginButton.
  ///
  /// In tr, this message translates to:
  /// **'Giriş'**
  String get loginButton;

  /// No description provided for @loginFailed.
  ///
  /// In tr, this message translates to:
  /// **'Giriş başarısız: {message}'**
  String loginFailed(String message);

  /// No description provided for @fieldRequired.
  ///
  /// In tr, this message translates to:
  /// **'Bu alan zorunlu'**
  String get fieldRequired;

  /// No description provided for @invalidUrl.
  ///
  /// In tr, this message translates to:
  /// **'Geçerli bir adres gir (http/https)'**
  String get invalidUrl;

  /// No description provided for @insecureUrl.
  ///
  /// In tr, this message translates to:
  /// **'Güvenli bağlantı gerekli: adres https:// ile başlamalı'**
  String get insecureUrl;

  /// No description provided for @logout.
  ///
  /// In tr, this message translates to:
  /// **'Çıkış yap'**
  String get logout;

  /// No description provided for @newSuggestion.
  ///
  /// In tr, this message translates to:
  /// **'Yeni Öneri'**
  String get newSuggestion;

  /// No description provided for @cuisine.
  ///
  /// In tr, this message translates to:
  /// **'Mutfak türü'**
  String get cuisine;

  /// No description provided for @selectCuisine.
  ///
  /// In tr, this message translates to:
  /// **'Mutfak türü seç'**
  String get selectCuisine;

  /// No description provided for @recentCuisines.
  ///
  /// In tr, this message translates to:
  /// **'Son kullanılanlar'**
  String get recentCuisines;

  /// No description provided for @allCuisines.
  ///
  /// In tr, this message translates to:
  /// **'Tümü'**
  String get allCuisines;

  /// No description provided for @promptLabel.
  ///
  /// In tr, this message translates to:
  /// **'Ürünler'**
  String get promptLabel;

  /// No description provided for @promptHint.
  ///
  /// In tr, this message translates to:
  /// **'ör. adana kebap, lahmacun, künefe var'**
  String get promptHint;

  /// No description provided for @photos.
  ///
  /// In tr, this message translates to:
  /// **'Menü fotoğrafları'**
  String get photos;

  /// No description provided for @photosCount.
  ///
  /// In tr, this message translates to:
  /// **'{count}/{max} fotoğraf'**
  String photosCount(int count, int max);

  /// No description provided for @takePhoto.
  ///
  /// In tr, this message translates to:
  /// **'Kamera'**
  String get takePhoto;

  /// No description provided for @pickFromGallery.
  ///
  /// In tr, this message translates to:
  /// **'Galeri'**
  String get pickFromGallery;

  /// No description provided for @deepMode.
  ///
  /// In tr, this message translates to:
  /// **'Derin analiz (daha yavaş, daha ayrıntılı)'**
  String get deepMode;

  /// No description provided for @deepModeTitle.
  ///
  /// In tr, this message translates to:
  /// **'Derin analiz'**
  String get deepModeTitle;

  /// No description provided for @deepModeHint.
  ///
  /// In tr, this message translates to:
  /// **'Daha yavaş, daha ayrıntılı kartlar'**
  String get deepModeHint;

  /// No description provided for @productsUnit.
  ///
  /// In tr, this message translates to:
  /// **'ürün'**
  String get productsUnit;

  /// No description provided for @cardsUnit.
  ///
  /// In tr, this message translates to:
  /// **'kart'**
  String get cardsUnit;

  /// No description provided for @aiCallsCount.
  ///
  /// In tr, this message translates to:
  /// **'{count} AI çağrısı'**
  String aiCallsCount(int count);

  /// No description provided for @detailGroups.
  ///
  /// In tr, this message translates to:
  /// **'{count} grup'**
  String detailGroups(int count);

  /// No description provided for @detailRemovables.
  ///
  /// In tr, this message translates to:
  /// **'{count} çıkarılabilir'**
  String detailRemovables(int count);

  /// No description provided for @detailExtras.
  ///
  /// In tr, this message translates to:
  /// **'{count} ekstra'**
  String detailExtras(int count);

  /// No description provided for @showDetails.
  ///
  /// In tr, this message translates to:
  /// **'Detaylar'**
  String get showDetails;

  /// No description provided for @hideDetails.
  ///
  /// In tr, this message translates to:
  /// **'Gizle'**
  String get hideDetails;

  /// No description provided for @queuedShort.
  ///
  /// In tr, this message translates to:
  /// **'sırada'**
  String get queuedShort;

  /// No description provided for @menuTextEyebrow.
  ///
  /// In tr, this message translates to:
  /// **'Menüdeki ürünler'**
  String get menuTextEyebrow;

  /// No description provided for @newShort.
  ///
  /// In tr, this message translates to:
  /// **'Yeni'**
  String get newShort;

  /// No description provided for @branchStatus.
  ///
  /// In tr, this message translates to:
  /// **'Şube durumu'**
  String get branchStatus;

  /// No description provided for @cameraStarting.
  ///
  /// In tr, this message translates to:
  /// **'Kamera açılıyor…'**
  String get cameraStarting;

  /// No description provided for @shareWhereTo.
  ///
  /// In tr, this message translates to:
  /// **'Nereye eklensin?'**
  String get shareWhereTo;

  /// No description provided for @suggestButton.
  ///
  /// In tr, this message translates to:
  /// **'Öner'**
  String get suggestButton;

  /// No description provided for @needInput.
  ///
  /// In tr, this message translates to:
  /// **'Ürün yaz veya menü fotoğrafı ekle'**
  String get needInput;

  /// No description provided for @compressing.
  ///
  /// In tr, this message translates to:
  /// **'Fotoğraflar küçültülüyor…'**
  String get compressing;

  /// No description provided for @maxPhotos.
  ///
  /// In tr, this message translates to:
  /// **'En fazla {max} fotoğraf eklenebilir'**
  String maxPhotos(int max);

  /// No description provided for @recentRuns.
  ///
  /// In tr, this message translates to:
  /// **'Son öneriler'**
  String get recentRuns;

  /// No description provided for @noRecentRuns.
  ///
  /// In tr, this message translates to:
  /// **'Henüz öneri yok'**
  String get noRecentRuns;

  /// No description provided for @photoRunTitle.
  ///
  /// In tr, this message translates to:
  /// **'Fotoğraftan öneri'**
  String get photoRunTitle;

  /// No description provided for @queuedOffline.
  ///
  /// In tr, this message translates to:
  /// **'Bağlantı yok: istek kuyruğa alındı, bağlantı gelince gönderilecek'**
  String get queuedOffline;

  /// No description provided for @pendingQueue.
  ///
  /// In tr, this message translates to:
  /// **'Kuyrukta {count} istek'**
  String pendingQueue(int count);

  /// No description provided for @cameraTitle.
  ///
  /// In tr, this message translates to:
  /// **'Menüyü çek'**
  String get cameraTitle;

  /// No description provided for @cameraDone.
  ///
  /// In tr, this message translates to:
  /// **'Bitti ({count})'**
  String cameraDone(int count);

  /// No description provided for @cameraUnavailable.
  ///
  /// In tr, this message translates to:
  /// **'Kamera kullanılamıyor'**
  String get cameraUnavailable;

  /// No description provided for @cameraPermission.
  ///
  /// In tr, this message translates to:
  /// **'Kamera izni gerekli'**
  String get cameraPermission;

  /// No description provided for @resultsTitle.
  ///
  /// In tr, this message translates to:
  /// **'Öneriler'**
  String get resultsTitle;

  /// No description provided for @streaming.
  ///
  /// In tr, this message translates to:
  /// **'Hazırlanıyor…'**
  String get streaming;

  /// No description provided for @readingPhotos.
  ///
  /// In tr, this message translates to:
  /// **'Fotoğraflar okunuyor…'**
  String get readingPhotos;

  /// No description provided for @cardsReady.
  ///
  /// In tr, this message translates to:
  /// **'{count} kart'**
  String cardsReady(int count);

  /// No description provided for @stop.
  ///
  /// In tr, this message translates to:
  /// **'Durdur'**
  String get stop;

  /// No description provided for @stopped.
  ///
  /// In tr, this message translates to:
  /// **'Durduruldu'**
  String get stopped;

  /// No description provided for @continueButton.
  ///
  /// In tr, this message translates to:
  /// **'Devam et'**
  String get continueButton;

  /// No description provided for @budgetExhausted.
  ///
  /// In tr, this message translates to:
  /// **'Bu istek için bütçe doldu: {count} ürün bekliyor'**
  String budgetExhausted(int count);

  /// No description provided for @pendingItemsCount.
  ///
  /// In tr, this message translates to:
  /// **'{count} ürün bekliyor'**
  String pendingItemsCount(int count);

  /// No description provided for @pendingPhotosCount.
  ///
  /// In tr, this message translates to:
  /// **'{count} fotoğraf bekliyor'**
  String pendingPhotosCount(int count);

  /// No description provided for @doneSummary.
  ///
  /// In tr, this message translates to:
  /// **'{db} DB, {ai} AI, {review} inceleme · {calls} AI çağrısı'**
  String doneSummary(int db, int ai, int review, int calls);

  /// No description provided for @fromCache.
  ///
  /// In tr, this message translates to:
  /// **'Tamamen veritabanı/önbellekten'**
  String get fromCache;

  /// No description provided for @placeholderPreparing.
  ///
  /// In tr, this message translates to:
  /// **'hazırlanıyor…'**
  String get placeholderPreparing;

  /// No description provided for @badgeSeed.
  ///
  /// In tr, this message translates to:
  /// **'Hazır şablon'**
  String get badgeSeed;

  /// No description provided for @badgeDb.
  ///
  /// In tr, this message translates to:
  /// **'DB\'den'**
  String get badgeDb;

  /// No description provided for @badgeAi.
  ///
  /// In tr, this message translates to:
  /// **'AI'**
  String get badgeAi;

  /// No description provided for @badgeReview.
  ///
  /// In tr, this message translates to:
  /// **'İnceleme gerek'**
  String get badgeReview;

  /// No description provided for @reviewUnknown.
  ///
  /// In tr, this message translates to:
  /// **'Bunu bilmiyorum, sen doldur.'**
  String get reviewUnknown;

  /// No description provided for @accept.
  ///
  /// In tr, this message translates to:
  /// **'Onayla'**
  String get accept;

  /// No description provided for @accepted.
  ///
  /// In tr, this message translates to:
  /// **'Onaylandı'**
  String get accepted;

  /// No description provided for @skip.
  ///
  /// In tr, this message translates to:
  /// **'Atla'**
  String get skip;

  /// No description provided for @skipped.
  ///
  /// In tr, this message translates to:
  /// **'Atlandı'**
  String get skipped;

  /// No description provided for @savedAsTemplate.
  ///
  /// In tr, this message translates to:
  /// **'Şablona kaydedildi'**
  String get savedAsTemplate;

  /// No description provided for @acceptNeedsContent.
  ///
  /// In tr, this message translates to:
  /// **'Önce açıklama veya bir opsiyon grubu ekle'**
  String get acceptNeedsContent;

  /// No description provided for @description.
  ///
  /// In tr, this message translates to:
  /// **'Açıklama'**
  String get description;

  /// No description provided for @descriptionCounter.
  ///
  /// In tr, this message translates to:
  /// **'{count}/160'**
  String descriptionCounter(int count);

  /// No description provided for @servingNote.
  ///
  /// In tr, this message translates to:
  /// **'Servis şekli'**
  String get servingNote;

  /// No description provided for @portionInfo.
  ///
  /// In tr, this message translates to:
  /// **'Porsiyon / adet'**
  String get portionInfo;

  /// No description provided for @optionGroups.
  ///
  /// In tr, this message translates to:
  /// **'Opsiyon grupları'**
  String get optionGroups;

  /// No description provided for @removables.
  ///
  /// In tr, this message translates to:
  /// **'Çıkarılabilir malzemeler'**
  String get removables;

  /// No description provided for @extras.
  ///
  /// In tr, this message translates to:
  /// **'Ekstra malzemeler'**
  String get extras;

  /// No description provided for @tags.
  ///
  /// In tr, this message translates to:
  /// **'Etiketler'**
  String get tags;

  /// No description provided for @allergens.
  ///
  /// In tr, this message translates to:
  /// **'Alerjenler'**
  String get allergens;

  /// No description provided for @upsell.
  ///
  /// In tr, this message translates to:
  /// **'Yanında öner'**
  String get upsell;

  /// No description provided for @productName.
  ///
  /// In tr, this message translates to:
  /// **'Ürün adı'**
  String get productName;

  /// No description provided for @singleChoice.
  ///
  /// In tr, this message translates to:
  /// **'tek seçim'**
  String get singleChoice;

  /// No description provided for @multiChoice.
  ///
  /// In tr, this message translates to:
  /// **'çoklu seçim (en fazla {max})'**
  String multiChoice(int max);

  /// No description provided for @required.
  ///
  /// In tr, this message translates to:
  /// **'zorunlu'**
  String get required;

  /// No description provided for @optional.
  ///
  /// In tr, this message translates to:
  /// **'isteğe bağlı'**
  String get optional;

  /// No description provided for @priceFree.
  ///
  /// In tr, this message translates to:
  /// **'ücretsiz'**
  String get priceFree;

  /// No description provided for @priceSurcharge.
  ///
  /// In tr, this message translates to:
  /// **'ek ücretli'**
  String get priceSurcharge;

  /// No description provided for @priceSetsBase.
  ///
  /// In tr, this message translates to:
  /// **'tabanı belirler'**
  String get priceSetsBase;

  /// No description provided for @defaultOption.
  ///
  /// In tr, this message translates to:
  /// **'varsayılan'**
  String get defaultOption;

  /// No description provided for @addGroup.
  ///
  /// In tr, this message translates to:
  /// **'Grup ekle'**
  String get addGroup;

  /// No description provided for @addOption.
  ///
  /// In tr, this message translates to:
  /// **'Opsiyon ekle'**
  String get addOption;

  /// No description provided for @addItem.
  ///
  /// In tr, this message translates to:
  /// **'Ekle'**
  String get addItem;

  /// No description provided for @groupName.
  ///
  /// In tr, this message translates to:
  /// **'Grup adı'**
  String get groupName;

  /// No description provided for @optionName.
  ///
  /// In tr, this message translates to:
  /// **'Opsiyon adı'**
  String get optionName;

  /// No description provided for @newItemHint.
  ///
  /// In tr, this message translates to:
  /// **'Yeni öğe'**
  String get newItemHint;

  /// No description provided for @editCard.
  ///
  /// In tr, this message translates to:
  /// **'Kartı düzenle'**
  String get editCard;

  /// No description provided for @editField.
  ///
  /// In tr, this message translates to:
  /// **'{field} düzenle'**
  String editField(String field);

  /// No description provided for @unsavedChanges.
  ///
  /// In tr, this message translates to:
  /// **'Kaydedilmemiş değişiklikler var'**
  String get unsavedChanges;

  /// No description provided for @discard.
  ///
  /// In tr, this message translates to:
  /// **'Vazgeç'**
  String get discard;

  /// No description provided for @cuisineSubtitle.
  ///
  /// In tr, this message translates to:
  /// **'Hedef {target} ürün · {templates} şablon'**
  String cuisineSubtitle(int target, int templates);

  /// No description provided for @gapTitle.
  ///
  /// In tr, this message translates to:
  /// **'Menü Tamamlama'**
  String get gapTitle;

  /// No description provided for @branch.
  ///
  /// In tr, this message translates to:
  /// **'Şube'**
  String get branch;

  /// No description provided for @selectBranch.
  ///
  /// In tr, this message translates to:
  /// **'Şube seç'**
  String get selectBranch;

  /// No description provided for @newBranch.
  ///
  /// In tr, this message translates to:
  /// **'Yeni şube'**
  String get newBranch;

  /// No description provided for @editBranch.
  ///
  /// In tr, this message translates to:
  /// **'Şubeyi düzenle'**
  String get editBranch;

  /// No description provided for @branchName.
  ///
  /// In tr, this message translates to:
  /// **'Şube adı'**
  String get branchName;

  /// No description provided for @city.
  ///
  /// In tr, this message translates to:
  /// **'Şehir'**
  String get city;

  /// No description provided for @notes.
  ///
  /// In tr, this message translates to:
  /// **'Notlar'**
  String get notes;

  /// No description provided for @targetOverride.
  ///
  /// In tr, this message translates to:
  /// **'Hedef ürün sayısı (boş = otomatik)'**
  String get targetOverride;

  /// No description provided for @targetOverrideHelp.
  ///
  /// In tr, this message translates to:
  /// **'Otomatik hedef: {count} ürün'**
  String targetOverrideHelp(int count);

  /// No description provided for @invalidNumber.
  ///
  /// In tr, this message translates to:
  /// **'1 ile 500 arasında bir sayı gir'**
  String get invalidNumber;

  /// No description provided for @noBranches.
  ///
  /// In tr, this message translates to:
  /// **'Henüz şube yok. Önce bir şube oluştur.'**
  String get noBranches;

  /// No description provided for @screenshots.
  ///
  /// In tr, this message translates to:
  /// **'Panel ekran görüntüleri'**
  String get screenshots;

  /// No description provided for @screenshotsHint.
  ///
  /// In tr, this message translates to:
  /// **'platform panelindeki ürün listesinin ekran görüntülerini ekle; kaydırarak alınmış, üst üste binen görüntüler sorun değil.'**
  String get screenshotsHint;

  /// No description provided for @extraNotes.
  ///
  /// In tr, this message translates to:
  /// **'Not (isteğe bağlı)'**
  String get extraNotes;

  /// No description provided for @extraNotesHint.
  ///
  /// In tr, this message translates to:
  /// **'ör. restoran tatlı da yapıyor'**
  String get extraNotesHint;

  /// No description provided for @analyzeButton.
  ///
  /// In tr, this message translates to:
  /// **'Eksikleri bul'**
  String get analyzeButton;

  /// No description provided for @needScreenshot.
  ///
  /// In tr, this message translates to:
  /// **'Şube seç; ekran görüntüsü ekle ya da menüdeki ürünleri yaz'**
  String get needScreenshot;

  /// No description provided for @menuTextLabel.
  ///
  /// In tr, this message translates to:
  /// **'Yaz ya da sesli söyle'**
  String get menuTextLabel;

  /// No description provided for @menuTextHint.
  ///
  /// In tr, this message translates to:
  /// **'ör. adana, urfa, lahmacun, ayran — ekran görüntüsü olmadan da çalışır'**
  String get menuTextHint;

  /// No description provided for @typedItems.
  ///
  /// In tr, this message translates to:
  /// **'Yazdığın ürünler ({count})'**
  String typedItems(int count);

  /// No description provided for @typedItemsHint.
  ///
  /// In tr, this message translates to:
  /// **'Sayıma dahil; açıklama/opsiyon durumları bilinmiyor'**
  String get typedItemsHint;

  /// No description provided for @analysisSummaryTyped.
  ///
  /// In tr, this message translates to:
  /// **'{screenshots} görüntü · {typed} yazılı · {unique} ürün · {calls} AI çağrısı'**
  String analysisSummaryTyped(
    int screenshots,
    int typed,
    int unique,
    int calls,
  );

  /// No description provided for @lastAnalysis.
  ///
  /// In tr, this message translates to:
  /// **'Son analiz: {date}'**
  String lastAnalysis(String date);

  /// No description provided for @openLastAnalysis.
  ///
  /// In tr, this message translates to:
  /// **'Aç'**
  String get openLastAnalysis;

  /// No description provided for @noAnalysisYet.
  ///
  /// In tr, this message translates to:
  /// **'Bu şube için henüz analiz yok'**
  String get noAnalysisYet;

  /// No description provided for @countsLabel.
  ///
  /// In tr, this message translates to:
  /// **'{current} / {target} ürün'**
  String countsLabel(int current, int target);

  /// No description provided for @missingCount.
  ///
  /// In tr, this message translates to:
  /// **'{count} ürün eksik'**
  String missingCount(int count);

  /// No description provided for @targetReached.
  ///
  /// In tr, this message translates to:
  /// **'Hedef tamam'**
  String get targetReached;

  /// No description provided for @manualTarget.
  ///
  /// In tr, this message translates to:
  /// **'elle girilen hedef'**
  String get manualTarget;

  /// No description provided for @analyzing.
  ///
  /// In tr, this message translates to:
  /// **'Analiz ediliyor…'**
  String get analyzing;

  /// No description provided for @analysisFromCache.
  ///
  /// In tr, this message translates to:
  /// **'Tamamen önbellekten (AI çağrısı yok)'**
  String get analysisFromCache;

  /// No description provided for @analysisSummary.
  ///
  /// In tr, this message translates to:
  /// **'{screenshots} görüntü · {unique} ürün · {calls} AI çağrısı'**
  String analysisSummary(int screenshots, int unique, int calls);

  /// No description provided for @callChecklist.
  ///
  /// In tr, this message translates to:
  /// **'Çağrıda sor ({done}/{total})'**
  String callChecklist(int done, int total);

  /// No description provided for @gapEmptyChecklist.
  ///
  /// In tr, this message translates to:
  /// **'Sorulacak bir şey kalmadı'**
  String get gapEmptyChecklist;

  /// No description provided for @clearTicks.
  ///
  /// In tr, this message translates to:
  /// **'İşaretleri temizle'**
  String get clearTicks;

  /// No description provided for @incompleteItems.
  ///
  /// In tr, this message translates to:
  /// **'Eksik bilgisi olan ürünler ({count})'**
  String incompleteItems(int count);

  /// No description provided for @recommendedItems.
  ///
  /// In tr, this message translates to:
  /// **'Önerilen ürünler ({count})'**
  String recommendedItems(int count);

  /// No description provided for @completeItems.
  ///
  /// In tr, this message translates to:
  /// **'Tamam olanlar ({count})'**
  String completeItems(int count);

  /// No description provided for @missingDescription.
  ///
  /// In tr, this message translates to:
  /// **'Açıklama yok'**
  String get missingDescription;

  /// No description provided for @missingOptions.
  ///
  /// In tr, this message translates to:
  /// **'Opsiyon yok'**
  String get missingOptions;

  /// No description provided for @missingRemovables.
  ///
  /// In tr, this message translates to:
  /// **'Malzeme yok'**
  String get missingRemovables;

  /// No description provided for @unknownDescription.
  ///
  /// In tr, this message translates to:
  /// **'Açıklama ?'**
  String get unknownDescription;

  /// No description provided for @unknownOptions.
  ///
  /// In tr, this message translates to:
  /// **'Opsiyon ?'**
  String get unknownOptions;

  /// No description provided for @unknownRemovables.
  ///
  /// In tr, this message translates to:
  /// **'Malzeme ?'**
  String get unknownRemovables;

  /// No description provided for @prepareCard.
  ///
  /// In tr, this message translates to:
  /// **'Kart hazırla'**
  String get prepareCard;

  /// No description provided for @addedToMenu.
  ///
  /// In tr, this message translates to:
  /// **'Şube menüsüne eklendi'**
  String get addedToMenu;

  /// No description provided for @branchStatusDraft.
  ///
  /// In tr, this message translates to:
  /// **'Taslak'**
  String get branchStatusDraft;

  /// No description provided for @branchStatusInProgress.
  ///
  /// In tr, this message translates to:
  /// **'Devam ediyor'**
  String get branchStatusInProgress;

  /// No description provided for @branchStatusReady.
  ///
  /// In tr, this message translates to:
  /// **'Hazır'**
  String get branchStatusReady;

  /// No description provided for @branchStatusOpened.
  ///
  /// In tr, this message translates to:
  /// **'Açıldı'**
  String get branchStatusOpened;

  /// No description provided for @deleteBranch.
  ///
  /// In tr, this message translates to:
  /// **'Şubeyi sil'**
  String get deleteBranch;

  /// No description provided for @deleteBranchConfirm.
  ///
  /// In tr, this message translates to:
  /// **'\"{name}\" şubesi ve menüsü silinsin mi?'**
  String deleteBranchConfirm(String name);

  /// No description provided for @deleteMenuItemConfirm.
  ///
  /// In tr, this message translates to:
  /// **'\"{name}\" şube menüsünden silinsin mi?'**
  String deleteMenuItemConfirm(String name);

  /// No description provided for @menu.
  ///
  /// In tr, this message translates to:
  /// **'Menü'**
  String get menu;

  /// No description provided for @export.
  ///
  /// In tr, this message translates to:
  /// **'Dışa aktar'**
  String get export;

  /// No description provided for @exportCsv.
  ///
  /// In tr, this message translates to:
  /// **'Excel (CSV)'**
  String get exportCsv;

  /// No description provided for @exportCsvHint.
  ///
  /// In tr, this message translates to:
  /// **'Türkçe Excel\'de doğrudan açılır'**
  String get exportCsvHint;

  /// No description provided for @exportJson.
  ///
  /// In tr, this message translates to:
  /// **'JSON'**
  String get exportJson;

  /// No description provided for @menuOnMenu.
  ///
  /// In tr, this message translates to:
  /// **'Menüde ({count})'**
  String menuOnMenu(int count);

  /// No description provided for @menuIncomplete.
  ///
  /// In tr, this message translates to:
  /// **'Eksik bilgi ({count})'**
  String menuIncomplete(int count);

  /// No description provided for @menuRecommended.
  ///
  /// In tr, this message translates to:
  /// **'Önerilen ({count})'**
  String menuRecommended(int count);

  /// No description provided for @markComplete.
  ///
  /// In tr, this message translates to:
  /// **'Tamam'**
  String get markComplete;

  /// No description provided for @markAvailable.
  ///
  /// In tr, this message translates to:
  /// **'Var'**
  String get markAvailable;

  /// No description provided for @cardAccepted.
  ///
  /// In tr, this message translates to:
  /// **'Kart onaylı'**
  String get cardAccepted;

  /// No description provided for @targetAutomatic.
  ///
  /// In tr, this message translates to:
  /// **'otomatik hedef (mutfak minimumu)'**
  String get targetAutomatic;

  /// No description provided for @searchTemplates.
  ///
  /// In tr, this message translates to:
  /// **'Şablon ara (ad veya takma ad)'**
  String get searchTemplates;

  /// No description provided for @sortBy.
  ///
  /// In tr, this message translates to:
  /// **'Sırala'**
  String get sortBy;

  /// No description provided for @sortUsage.
  ///
  /// In tr, this message translates to:
  /// **'Kullanıma göre'**
  String get sortUsage;

  /// No description provided for @sortName.
  ///
  /// In tr, this message translates to:
  /// **'Ada göre'**
  String get sortName;

  /// No description provided for @sortUpdated.
  ///
  /// In tr, this message translates to:
  /// **'Son değişene göre'**
  String get sortUpdated;

  /// No description provided for @allSources.
  ///
  /// In tr, this message translates to:
  /// **'Tümü'**
  String get allSources;

  /// No description provided for @sourceUser.
  ///
  /// In tr, this message translates to:
  /// **'Onaylı (kullanıcı)'**
  String get sourceUser;

  /// No description provided for @noTemplates.
  ///
  /// In tr, this message translates to:
  /// **'Şablon bulunamadı'**
  String get noTemplates;

  /// No description provided for @templateCount.
  ///
  /// In tr, this message translates to:
  /// **'{count} şablon'**
  String templateCount(int count);

  /// No description provided for @usedTimes.
  ///
  /// In tr, this message translates to:
  /// **'{count} kez kullanıldı'**
  String usedTimes(int count);

  /// No description provided for @aliases.
  ///
  /// In tr, this message translates to:
  /// **'Takma adlar'**
  String get aliases;

  /// No description provided for @templateSaved.
  ///
  /// In tr, this message translates to:
  /// **'Şablon kaydedildi'**
  String get templateSaved;

  /// No description provided for @deleteTemplateConfirm.
  ///
  /// In tr, this message translates to:
  /// **'\"{name}\" şablonu silinsin mi?'**
  String deleteTemplateConfirm(String name);

  /// No description provided for @deleteSeedTemplateConfirm.
  ///
  /// In tr, this message translates to:
  /// **'\"{name}\" hazır şablonu havuzdan kaldırılsın mı? (Arşivlenir, tekrar yüklenmez.)'**
  String deleteSeedTemplateConfirm(String name);

  /// No description provided for @menuSettings.
  ///
  /// In tr, this message translates to:
  /// **'Menü'**
  String get menuSettings;

  /// No description provided for @cuisinesAndMinimums.
  ///
  /// In tr, this message translates to:
  /// **'Mutfak türleri ve minimum ürün sayıları'**
  String get cuisinesAndMinimums;

  /// No description provided for @cuisinesAndMinimumsHint.
  ///
  /// In tr, this message translates to:
  /// **'Şube hedefleri buradan hesaplanır'**
  String get cuisinesAndMinimumsHint;

  /// No description provided for @newCuisine.
  ///
  /// In tr, this message translates to:
  /// **'Yeni mutfak türü'**
  String get newCuisine;

  /// No description provided for @cuisineName.
  ///
  /// In tr, this message translates to:
  /// **'Mutfak adı'**
  String get cuisineName;

  /// No description provided for @minItemCount.
  ///
  /// In tr, this message translates to:
  /// **'Minimum ürün sayısı'**
  String get minItemCount;

  /// No description provided for @minimumsHelp.
  ///
  /// In tr, this message translates to:
  /// **'Gerçek platform minimumlarını buraya gir. Şube hedefi = en az 10 veya bu sayı (hangisi büyükse); şubede elle hedef girilebilir.'**
  String get minimumsHelp;

  /// No description provided for @minimumLine.
  ///
  /// In tr, this message translates to:
  /// **'Minimum {min} · hedef {target} ürün'**
  String minimumLine(int min, int target);

  /// No description provided for @aiSection.
  ///
  /// In tr, this message translates to:
  /// **'Yapay zekâ'**
  String get aiSection;

  /// No description provided for @aiModels.
  ///
  /// In tr, this message translates to:
  /// **'Görev bazlı modeller'**
  String get aiModels;

  /// No description provided for @aiModelsHint.
  ///
  /// In tr, this message translates to:
  /// **'Her iş için birincil model; diğerleri yedek'**
  String get aiModelsHint;

  /// No description provided for @aiModelsHelp.
  ///
  /// In tr, this message translates to:
  /// **'API anahtarları yalnızca sunucuda durur. Buradan her görev için birincil modeli seçersin; zincirin kalanı otomatik yedek olarak kullanılır.'**
  String get aiModelsHelp;

  /// No description provided for @providerReady.
  ///
  /// In tr, this message translates to:
  /// **'hazır'**
  String get providerReady;

  /// No description provided for @providerNoKey.
  ///
  /// In tr, this message translates to:
  /// **'anahtar yok'**
  String get providerNoKey;

  /// No description provided for @preview.
  ///
  /// In tr, this message translates to:
  /// **'önizleme'**
  String get preview;

  /// No description provided for @fallbackChain.
  ///
  /// In tr, this message translates to:
  /// **'Yedek: {chain}'**
  String fallbackChain(String chain);

  /// No description provided for @quotaToday.
  ///
  /// In tr, this message translates to:
  /// **'Bugünkü kota'**
  String get quotaToday;

  /// No description provided for @quotaLine.
  ///
  /// In tr, this message translates to:
  /// **'{calls}/{dailyCalls} çağrı · {tokens}/{dailyTokens} token'**
  String quotaLine(int calls, int dailyCalls, int tokens, int dailyTokens);

  /// No description provided for @localOnlyOn.
  ///
  /// In tr, this message translates to:
  /// **'Yerel mod açık: yalnızca veritabanı ve önbellek kullanılıyor'**
  String get localOnlyOn;

  /// No description provided for @quotaExceeded.
  ///
  /// In tr, this message translates to:
  /// **'Günlük kota doldu'**
  String get quotaExceeded;

  /// No description provided for @appearance.
  ///
  /// In tr, this message translates to:
  /// **'Görünüm'**
  String get appearance;

  /// No description provided for @themeSystem.
  ///
  /// In tr, this message translates to:
  /// **'Sistem'**
  String get themeSystem;

  /// No description provided for @themeLight.
  ///
  /// In tr, this message translates to:
  /// **'Açık'**
  String get themeLight;

  /// No description provided for @themeDark.
  ///
  /// In tr, this message translates to:
  /// **'Koyu'**
  String get themeDark;

  /// No description provided for @serverStatus.
  ///
  /// In tr, this message translates to:
  /// **'Sunucu durumu: {status}'**
  String serverStatus(String status);

  /// No description provided for @usageTitle.
  ///
  /// In tr, this message translates to:
  /// **'Kullanım'**
  String get usageTitle;

  /// No description provided for @rangeToday.
  ///
  /// In tr, this message translates to:
  /// **'Bugün'**
  String get rangeToday;

  /// No description provided for @rangeMonth.
  ///
  /// In tr, this message translates to:
  /// **'Bu ay'**
  String get rangeMonth;

  /// No description provided for @aiCalls.
  ///
  /// In tr, this message translates to:
  /// **'AI çağrısı'**
  String get aiCalls;

  /// No description provided for @failedCalls.
  ///
  /// In tr, this message translates to:
  /// **'Hatalı'**
  String get failedCalls;

  /// No description provided for @tokens.
  ///
  /// In tr, this message translates to:
  /// **'Token'**
  String get tokens;

  /// No description provided for @avgLatency.
  ///
  /// In tr, this message translates to:
  /// **'Ort. süre'**
  String get avgLatency;

  /// No description provided for @runsLabel.
  ///
  /// In tr, this message translates to:
  /// **'İstek'**
  String get runsLabel;

  /// No description provided for @cacheHitRatio.
  ///
  /// In tr, this message translates to:
  /// **'AI\'sız cevap'**
  String get cacheHitRatio;

  /// No description provided for @cardsLabel.
  ///
  /// In tr, this message translates to:
  /// **'Kart'**
  String get cardsLabel;

  /// No description provided for @dbHitRatio.
  ///
  /// In tr, this message translates to:
  /// **'DB\'den kart'**
  String get dbHitRatio;

  /// No description provided for @cardsBreakdown.
  ///
  /// In tr, this message translates to:
  /// **'{db} DB/hazır şablon · {ai} AI · {review} inceleme'**
  String cardsBreakdown(int db, int ai, int review);

  /// No description provided for @byModel.
  ///
  /// In tr, this message translates to:
  /// **'Modele göre'**
  String get byModel;

  /// No description provided for @byTask.
  ///
  /// In tr, this message translates to:
  /// **'Göreve göre'**
  String get byTask;

  /// No description provided for @errorsLabel.
  ///
  /// In tr, this message translates to:
  /// **'Hatalar'**
  String get errorsLabel;

  /// No description provided for @noUsage.
  ///
  /// In tr, this message translates to:
  /// **'Bu aralıkta AI çağrısı yok'**
  String get noUsage;

  /// No description provided for @modelUsageLine.
  ///
  /// In tr, this message translates to:
  /// **'{calls} çağrı · {failed} hata · {tokens} token'**
  String modelUsageLine(int calls, int failed, int tokens);

  /// No description provided for @copyMultiChoice.
  ///
  /// In tr, this message translates to:
  /// **'çoklu seçim, en fazla {max}'**
  String copyMultiChoice(int max);

  /// No description provided for @copyLabelDescription.
  ///
  /// In tr, this message translates to:
  /// **'Açıklama'**
  String get copyLabelDescription;

  /// No description provided for @copyLabelPortion.
  ///
  /// In tr, this message translates to:
  /// **'Porsiyon'**
  String get copyLabelPortion;

  /// No description provided for @copyLabelServing.
  ///
  /// In tr, this message translates to:
  /// **'Servis'**
  String get copyLabelServing;

  /// No description provided for @copyLabelOptions.
  ///
  /// In tr, this message translates to:
  /// **'Opsiyonlar'**
  String get copyLabelOptions;

  /// No description provided for @copyLabelRemovables.
  ///
  /// In tr, this message translates to:
  /// **'Çıkarılabilir'**
  String get copyLabelRemovables;

  /// No description provided for @copyLabelExtras.
  ///
  /// In tr, this message translates to:
  /// **'Ekstra'**
  String get copyLabelExtras;

  /// No description provided for @copyLabelTags.
  ///
  /// In tr, this message translates to:
  /// **'Etiketler'**
  String get copyLabelTags;

  /// No description provided for @copyLabelAllergens.
  ///
  /// In tr, this message translates to:
  /// **'Alerjen'**
  String get copyLabelAllergens;

  /// No description provided for @copyLabelUpsell.
  ///
  /// In tr, this message translates to:
  /// **'Öneri'**
  String get copyLabelUpsell;

  /// No description provided for @cancelled.
  ///
  /// In tr, this message translates to:
  /// **'İptal edildi'**
  String get cancelled;

  /// No description provided for @compressFailed.
  ///
  /// In tr, this message translates to:
  /// **'Fotoğraf küçültülemedi, başka bir fotoğraf dene'**
  String get compressFailed;

  /// No description provided for @voiceNote.
  ///
  /// In tr, this message translates to:
  /// **'Sesli not'**
  String get voiceNote;

  /// No description provided for @voiceRecording.
  ///
  /// In tr, this message translates to:
  /// **'Bitir ({time})'**
  String voiceRecording(String time);

  /// No description provided for @voiceSending.
  ///
  /// In tr, this message translates to:
  /// **'Yazıya çevriliyor…'**
  String get voiceSending;

  /// No description provided for @voiceEmpty.
  ///
  /// In tr, this message translates to:
  /// **'Kayıtta konuşma anlaşılamadı'**
  String get voiceEmpty;

  /// No description provided for @voiceNeedsNetwork.
  ///
  /// In tr, this message translates to:
  /// **'Sesli not için internet bağlantısı gerekli'**
  String get voiceNeedsNetwork;

  /// No description provided for @micPermission.
  ///
  /// In tr, this message translates to:
  /// **'Sesli not için mikrofon izni gerekli'**
  String get micPermission;

  /// No description provided for @researchTitle.
  ///
  /// In tr, this message translates to:
  /// **'İnternette araştır'**
  String get researchTitle;

  /// No description provided for @researchHint.
  ///
  /// In tr, this message translates to:
  /// **'Restoranın herkese açık sayfaları (web sitesi, harita kaydı, sosyal medya) taranır. Bulunan ürünleri restoranla teyit et; fiyat ve iletişim bilgisi alınmaz.'**
  String get researchHint;

  /// No description provided for @researchStart.
  ///
  /// In tr, this message translates to:
  /// **'Restoranı internette araştır'**
  String get researchStart;

  /// No description provided for @researchRunning.
  ///
  /// In tr, this message translates to:
  /// **'Web\'de aranıyor… (yarım dakika kadar sürebilir)'**
  String get researchRunning;

  /// No description provided for @researchAgain.
  ///
  /// In tr, this message translates to:
  /// **'Yeniden araştır'**
  String get researchAgain;

  /// No description provided for @researchFound.
  ///
  /// In tr, this message translates to:
  /// **'İnternette {count} ürün bulundu'**
  String researchFound(int count);

  /// No description provided for @researchNotFound.
  ///
  /// In tr, this message translates to:
  /// **'Restoran internette bulunamadı'**
  String get researchNotFound;

  /// No description provided for @researchConfidence.
  ///
  /// In tr, this message translates to:
  /// **'güven %{value}'**
  String researchConfidence(int value);

  /// No description provided for @researchCachedAt.
  ///
  /// In tr, this message translates to:
  /// **'kayıtlı sonuç: {date}'**
  String researchCachedAt(String date);

  /// No description provided for @researchNotOnMenu.
  ///
  /// In tr, this message translates to:
  /// **'Menüde olmayanlar ({count})'**
  String researchNotOnMenu(int count);

  /// No description provided for @researchOnMenu.
  ///
  /// In tr, this message translates to:
  /// **'Menüde olanlar ({count})'**
  String researchOnMenu(int count);

  /// No description provided for @researchItems.
  ///
  /// In tr, this message translates to:
  /// **'Bulunan ürünler ({count})'**
  String researchItems(int count);

  /// No description provided for @researchPrepareAll.
  ///
  /// In tr, this message translates to:
  /// **'{count} ürün için kart hazırla'**
  String researchPrepareAll(int count);

  /// No description provided for @researchTemplate.
  ///
  /// In tr, this message translates to:
  /// **'şablon: {name}'**
  String researchTemplate(String name);

  /// No description provided for @researchSources.
  ///
  /// In tr, this message translates to:
  /// **'Kaynaklar'**
  String get researchSources;

  /// No description provided for @settingsTitle.
  ///
  /// In tr, this message translates to:
  /// **'Ayarlar'**
  String get settingsTitle;

  /// No description provided for @account.
  ///
  /// In tr, this message translates to:
  /// **'Hesap'**
  String get account;

  /// No description provided for @serverSection.
  ///
  /// In tr, this message translates to:
  /// **'Sunucu'**
  String get serverSection;

  /// No description provided for @about.
  ///
  /// In tr, this message translates to:
  /// **'Hakkında'**
  String get about;

  /// No description provided for @version.
  ///
  /// In tr, this message translates to:
  /// **'Sürüm {version}'**
  String version(String version);
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['tr'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'tr':
      return AppLocalizationsTr();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
