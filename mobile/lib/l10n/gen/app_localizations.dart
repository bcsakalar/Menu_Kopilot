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
