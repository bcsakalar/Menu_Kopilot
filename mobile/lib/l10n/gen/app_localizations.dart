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
  /// **'Restoran menüsünü hızla tamamla'**
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
  /// **'Bir sorun oldu. Tekrar dene.'**
  String get genericError;

  /// No description provided for @networkError.
  ///
  /// In tr, this message translates to:
  /// **'Sunucuya ulaşılamadı. Bağlantını kontrol et.'**
  String get networkError;

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
  /// **'Görüntüleri analize ekle'**
  String get shareAsMenuPhotos;

  /// No description provided for @shareAsMenuPhotosHint.
  ///
  /// In tr, this message translates to:
  /// **'Menü fotoğrafı ya da ekran görüntüsü — ikisi de olur'**
  String get shareAsMenuPhotosHint;

  /// No description provided for @shareAsProductList.
  ///
  /// In tr, this message translates to:
  /// **'Metni menü listesine ekle'**
  String get shareAsProductList;

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
  /// **'Tüm mutfaklar'**
  String get allCuisines;

  /// No description provided for @photos.
  ///
  /// In tr, this message translates to:
  /// **'Menü fotoğrafları'**
  String get photos;

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

  /// No description provided for @productsUnit.
  ///
  /// In tr, this message translates to:
  /// **'ürün'**
  String get productsUnit;

  /// No description provided for @cardsUnit.
  ///
  /// In tr, this message translates to:
  /// **'öneri'**
  String get cardsUnit;

  /// No description provided for @aiCallsCount.
  ///
  /// In tr, this message translates to:
  /// **'{count} AI çağrısı'**
  String aiCallsCount(int count);

  /// No description provided for @newShort.
  ///
  /// In tr, this message translates to:
  /// **'Yeni'**
  String get newShort;

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

  /// No description provided for @needInput.
  ///
  /// In tr, this message translates to:
  /// **'Menüdeki ürünleri yaz veya bir görüntü ekle'**
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
  /// **'Son analizler'**
  String get recentRuns;

  /// No description provided for @noRecentRuns.
  ///
  /// In tr, this message translates to:
  /// **'Henüz analiz yok'**
  String get noRecentRuns;

  /// No description provided for @photoRunTitle.
  ///
  /// In tr, this message translates to:
  /// **'Fotoğraftan analiz'**
  String get photoRunTitle;

  /// No description provided for @seeAllRuns.
  ///
  /// In tr, this message translates to:
  /// **'Tümünü gör'**
  String get seeAllRuns;

  /// No description provided for @historyTitle.
  ///
  /// In tr, this message translates to:
  /// **'Analiz geçmişi'**
  String get historyTitle;

  /// No description provided for @historySearchHint.
  ///
  /// In tr, this message translates to:
  /// **'Ürün ya da mutfak ara'**
  String get historySearchHint;

  /// No description provided for @periodAll.
  ///
  /// In tr, this message translates to:
  /// **'Tarih'**
  String get periodAll;

  /// No description provided for @periodToday.
  ///
  /// In tr, this message translates to:
  /// **'Bugün'**
  String get periodToday;

  /// No description provided for @periodWeek.
  ///
  /// In tr, this message translates to:
  /// **'Son 7 gün'**
  String get periodWeek;

  /// No description provided for @periodMonth.
  ///
  /// In tr, this message translates to:
  /// **'Bu ay'**
  String get periodMonth;

  /// No description provided for @periodCustom.
  ///
  /// In tr, this message translates to:
  /// **'Tarih aralığı seç…'**
  String get periodCustom;

  /// No description provided for @periodAllTimes.
  ///
  /// In tr, this message translates to:
  /// **'Tüm zamanlar'**
  String get periodAllTimes;

  /// No description provided for @cuisineFilter.
  ///
  /// In tr, this message translates to:
  /// **'Mutfak'**
  String get cuisineFilter;

  /// No description provided for @clearFilters.
  ///
  /// In tr, this message translates to:
  /// **'Temizle'**
  String get clearFilters;

  /// No description provided for @historyYesterday.
  ///
  /// In tr, this message translates to:
  /// **'Dün'**
  String get historyYesterday;

  /// No description provided for @historyDayCount.
  ///
  /// In tr, this message translates to:
  /// **'{count} analiz'**
  String historyDayCount(int count);

  /// No description provided for @historyNew.
  ///
  /// In tr, this message translates to:
  /// **'{count} yeni'**
  String historyNew(int count);

  /// No description provided for @historyOnMenu.
  ///
  /// In tr, this message translates to:
  /// **'{count} menüde'**
  String historyOnMenu(int count);

  /// No description provided for @historyAccepted.
  ///
  /// In tr, this message translates to:
  /// **'{count} evet'**
  String historyAccepted(int count);

  /// No description provided for @historySkipped.
  ///
  /// In tr, this message translates to:
  /// **'{count} hayır'**
  String historySkipped(int count);

  /// No description provided for @historyLater.
  ///
  /// In tr, this message translates to:
  /// **'{count} düşünecek'**
  String historyLater(int count);

  /// No description provided for @historyMore.
  ///
  /// In tr, this message translates to:
  /// **'+{count}'**
  String historyMore(int count);

  /// No description provided for @historyEmpty.
  ///
  /// In tr, this message translates to:
  /// **'Henüz analiz yok. Yaptığın her analiz burada tarihi ve saatiyle durur.'**
  String get historyEmpty;

  /// No description provided for @historyNoMatch.
  ///
  /// In tr, this message translates to:
  /// **'Bu filtreye uyan analiz yok.'**
  String get historyNoMatch;

  /// No description provided for @historyOffline.
  ///
  /// In tr, this message translates to:
  /// **'Çevrimdışı: telefondaki kayıtlar gösteriliyor.'**
  String get historyOffline;

  /// No description provided for @historyNeedsConnection.
  ///
  /// In tr, this message translates to:
  /// **'Bu analiz internet varken açılır.'**
  String get historyNeedsConnection;

  /// No description provided for @historyStatusRunning.
  ///
  /// In tr, this message translates to:
  /// **'Sürüyor'**
  String get historyStatusRunning;

  /// No description provided for @historyStatusPartial.
  ///
  /// In tr, this message translates to:
  /// **'Eksik tamamlandı'**
  String get historyStatusPartial;

  /// No description provided for @historyStatusFailed.
  ///
  /// In tr, this message translates to:
  /// **'Hata'**
  String get historyStatusFailed;

  /// No description provided for @learningTitle.
  ///
  /// In tr, this message translates to:
  /// **'Öğrenilenler'**
  String get learningTitle;

  /// No description provided for @learningHint.
  ///
  /// In tr, this message translates to:
  /// **'Sistemin öğrendiklerini gör, yanlışsa geri al'**
  String get learningHint;

  /// No description provided for @learningIntro.
  ///
  /// In tr, this message translates to:
  /// **'Satıcıların en az 3 kez ve çoğunlukla “Hayır” dediği ürünler öneri listesinin sonuna düşer. Ekibin kartlardan sürekli sildiği öneriler artık gelmez. Yanlışlıkla öğrenildiyse “Geri al”a dokun.'**
  String get learningIntro;

  /// No description provided for @learningProducts.
  ///
  /// In tr, this message translates to:
  /// **'Satıcıların çoğunlukla reddettiği ürünler'**
  String get learningProducts;

  /// No description provided for @learningSuggestions.
  ///
  /// In tr, this message translates to:
  /// **'Kartlarda artık gelmeyen öneriler'**
  String get learningSuggestions;

  /// No description provided for @learningEmpty.
  ///
  /// In tr, this message translates to:
  /// **'Henüz öğrenilen bir şey yok. Satıcılar bir ürüne en az 3 kez “Hayır” deyince ya da ekip bir öneriyi en az 3 kez silince burada görünür.'**
  String get learningEmpty;

  /// No description provided for @learnedProductLine.
  ///
  /// In tr, this message translates to:
  /// **'{cuisine} · {count} kez “Hayır” · {date}'**
  String learnedProductLine(String cuisine, int count, String date);

  /// No description provided for @learnedSuggestionLine.
  ///
  /// In tr, this message translates to:
  /// **'{type} · {kind} · {count} kez silindi · {date}'**
  String learnedSuggestionLine(
    String type,
    String kind,
    int count,
    String date,
  );

  /// No description provided for @kindOptionGroup.
  ///
  /// In tr, this message translates to:
  /// **'opsiyon grubu'**
  String get kindOptionGroup;

  /// No description provided for @kindRemovable.
  ///
  /// In tr, this message translates to:
  /// **'çıkarılabilir'**
  String get kindRemovable;

  /// No description provided for @kindExtra.
  ///
  /// In tr, this message translates to:
  /// **'ekstra'**
  String get kindExtra;

  /// No description provided for @undoLearned.
  ///
  /// In tr, this message translates to:
  /// **'Geri al'**
  String get undoLearned;

  /// No description provided for @undoProductQuestion.
  ///
  /// In tr, this message translates to:
  /// **'“{name}” {cuisine} mutfağında yeniden öne alınsın mı?'**
  String undoProductQuestion(String name, String cuisine);

  /// No description provided for @undoSuggestionQuestion.
  ///
  /// In tr, this message translates to:
  /// **'“{value}” {type} kartlarında yeniden önerilsin mi?'**
  String undoSuggestionQuestion(String value, String type);

  /// No description provided for @undoDone.
  ///
  /// In tr, this message translates to:
  /// **'Geri alındı; bir sonraki analizde yeniden hesaba katılır.'**
  String get undoDone;

  /// No description provided for @queuedOffline.
  ///
  /// In tr, this message translates to:
  /// **'İnternet yok. Analiz kaydedildi, bağlantı gelince kendiliğinden başlayacak.'**
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
  /// **'Sonuçlar'**
  String get resultsTitle;

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

  /// No description provided for @fromCache.
  ///
  /// In tr, this message translates to:
  /// **'Tamamen veritabanı/önbellekten'**
  String get fromCache;

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

  /// No description provided for @notes.
  ///
  /// In tr, this message translates to:
  /// **'Notlar'**
  String get notes;

  /// No description provided for @invalidNumber.
  ///
  /// In tr, this message translates to:
  /// **'1 ile 500 arasında bir sayı gir'**
  String get invalidNumber;

  /// No description provided for @screenshots.
  ///
  /// In tr, this message translates to:
  /// **'Menü görüntüleri'**
  String get screenshots;

  /// No description provided for @screenshotsHint.
  ///
  /// In tr, this message translates to:
  /// **'İstersen menünün fotoğrafını veya ekran görüntülerini ekle; üst üste binen görüntüler sorun değil.'**
  String get screenshotsHint;

  /// No description provided for @extraNotes.
  ///
  /// In tr, this message translates to:
  /// **'Not'**
  String get extraNotes;

  /// No description provided for @extraNotesHint.
  ///
  /// In tr, this message translates to:
  /// **'ör. restoran tatlı da yapıyor'**
  String get extraNotesHint;

  /// No description provided for @analyzeButton.
  ///
  /// In tr, this message translates to:
  /// **'Analiz et'**
  String get analyzeButton;

  /// No description provided for @menuTextLabel.
  ///
  /// In tr, this message translates to:
  /// **'Menüdeki ürünler'**
  String get menuTextLabel;

  /// No description provided for @menuTextHint.
  ///
  /// In tr, this message translates to:
  /// **'ör. adana, urfa, lahmacun — tek bir ürün de yazabilirsin'**
  String get menuTextHint;

  /// No description provided for @noAnalysisYet.
  ///
  /// In tr, this message translates to:
  /// **'Henüz analiz yok. Ana ekrandan menü fotoğrafı ekle ya da ürün adlarını yaz.'**
  String get noAnalysisYet;

  /// No description provided for @missingCount.
  ///
  /// In tr, this message translates to:
  /// **'{count} ürün eksik'**
  String missingCount(int count);

  /// No description provided for @targetReached.
  ///
  /// In tr, this message translates to:
  /// **'Hedefe ulaşıldı'**
  String get targetReached;

  /// No description provided for @analyzing.
  ///
  /// In tr, this message translates to:
  /// **'Hazırlanıyor…'**
  String get analyzing;

  /// No description provided for @analysisSummary.
  ///
  /// In tr, this message translates to:
  /// **'{items} ürün okundu · {calls} AI çağrısı'**
  String analysisSummary(int items, int calls);

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
  /// **'Menü hedefi ve beklenen kategoriler buradan hesaplanır'**
  String get cuisinesAndMinimumsHint;

  /// No description provided for @categoriesTitle.
  ///
  /// In tr, this message translates to:
  /// **'Kategoriler ve anahtar kelimeler'**
  String get categoriesTitle;

  /// No description provided for @categoriesHint.
  ///
  /// In tr, this message translates to:
  /// **'Bir ürünün hangi kategoriye düştüğünü adındaki kelimeler belirler'**
  String get categoriesHint;

  /// No description provided for @categoriesHelp.
  ///
  /// In tr, this message translates to:
  /// **'Ürün adında bu kelimelerden biri geçerse ürün o kategoriye sayılır (\"şalgam\" → İçecek); büyük/küçük harf ve Türkçe karakter fark etmez. Birden çok kelime tek ifade olarak eşleşir (\"sıcak çikolata\"). Değişiklik bir sonraki analizde geçerli olur.'**
  String get categoriesHelp;

  /// No description provided for @keywordsLabel.
  ///
  /// In tr, this message translates to:
  /// **'Anahtar kelimeler (virgülle ayır)'**
  String get keywordsLabel;

  /// No description provided for @keywordsCount.
  ///
  /// In tr, this message translates to:
  /// **'{count} anahtar kelime'**
  String keywordsCount(int count);

  /// No description provided for @cuisineCategoriesMenu.
  ///
  /// In tr, this message translates to:
  /// **'Kategoriler ve min. sayılar'**
  String get cuisineCategoriesMenu;

  /// No description provided for @cuisineCategoriesHelp.
  ///
  /// In tr, this message translates to:
  /// **'İşaretli kategoriler bu mutfakta beklenir; sayı, menüde o kategoride olması gereken en az ürün. 0 = olsa iyi olur. Değişiklik bir sonraki analizde geçerli olur.'**
  String get cuisineCategoriesHelp;

  /// No description provided for @minItemsLabel.
  ///
  /// In tr, this message translates to:
  /// **'en az {count}'**
  String minItemsLabel(int count);

  /// No description provided for @savedMessage.
  ///
  /// In tr, this message translates to:
  /// **'Kaydedildi'**
  String get savedMessage;

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
  /// **'Her mutfak türünde menüde olması gereken en az ürün sayısını buraya gir. Menü hedefi = en az 10 veya bu sayı (hangisi büyükse). Menüdeki ⋮ ile hangi kategorilerin beklendiğini de ayarlayabilirsin.'**
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

  /// No description provided for @cardDetailsShow.
  ///
  /// In tr, this message translates to:
  /// **'Göster'**
  String get cardDetailsShow;

  /// No description provided for @cardDetailsHide.
  ///
  /// In tr, this message translates to:
  /// **'Gizle'**
  String get cardDetailsHide;

  /// No description provided for @cardOptionGroupsCount.
  ///
  /// In tr, this message translates to:
  /// **'{count} opsiyon grubu'**
  String cardOptionGroupsCount(int count);

  /// No description provided for @cardIngredientsCount.
  ///
  /// In tr, this message translates to:
  /// **'{count} malzeme'**
  String cardIngredientsCount(int count);

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

  /// No description provided for @navAnalyze.
  ///
  /// In tr, this message translates to:
  /// **'Analiz'**
  String get navAnalyze;

  /// No description provided for @newAnalysis.
  ///
  /// In tr, this message translates to:
  /// **'Menü analizi'**
  String get newAnalysis;

  /// No description provided for @cuisineAuto.
  ///
  /// In tr, this message translates to:
  /// **'Otomatik (menüden anla)'**
  String get cuisineAuto;

  /// No description provided for @cuisineLabelled.
  ///
  /// In tr, this message translates to:
  /// **'mutfak türü: {name}'**
  String cuisineLabelled(String name);

  /// No description provided for @cuisineMismatch.
  ///
  /// In tr, this message translates to:
  /// **'Menü {name} gibi görünüyor.'**
  String cuisineMismatch(String name);

  /// No description provided for @rerunAs.
  ///
  /// In tr, this message translates to:
  /// **'{name} olarak yeniden analiz et'**
  String rerunAs(String name);

  /// No description provided for @changeCuisine.
  ///
  /// In tr, this message translates to:
  /// **'Mutfak türünü değiştir (menü yeniden okunmaz)'**
  String get changeCuisine;

  /// No description provided for @progressCurrent.
  ///
  /// In tr, this message translates to:
  /// **'Mevcut'**
  String get progressCurrent;

  /// No description provided for @progressTarget.
  ///
  /// In tr, this message translates to:
  /// **'hedef'**
  String get progressTarget;

  /// No description provided for @belowHardMinimum.
  ///
  /// In tr, this message translates to:
  /// **'Menüde en az {min} ürün olmalı'**
  String belowHardMinimum(int min);

  /// No description provided for @modeTitle.
  ///
  /// In tr, this message translates to:
  /// **'Nasıl çalışsın?'**
  String get modeTitle;

  /// No description provided for @modeQuickTitle.
  ///
  /// In tr, this message translates to:
  /// **'Hızlı'**
  String get modeQuickTitle;

  /// No description provided for @modeQuickHint.
  ///
  /// In tr, this message translates to:
  /// **'10 yeni ürün: fotoğraftaki ürünlere dayalı alternatifler ve eksik kategoriler; menüdeki 7 ürüne opsiyon, malzeme ve açıklama. Yaklaşık 15 saniye.'**
  String get modeQuickHint;

  /// No description provided for @modeFullTitle.
  ///
  /// In tr, this message translates to:
  /// **'Tam'**
  String get modeFullTitle;

  /// No description provided for @modeFullHint.
  ///
  /// In tr, this message translates to:
  /// **'Fotoğraftaki ürünlere dayalı alternatifler ve mutfağın hedefine kadar yeni ürün; her ürüne opsiyon, malzeme ve açıklama. 20–30 saniye.'**
  String get modeFullHint;

  /// No description provided for @debugToggle.
  ///
  /// In tr, this message translates to:
  /// **'Ayrıntılı kayıt'**
  String get debugToggle;

  /// No description provided for @debugToggleHint.
  ///
  /// In tr, this message translates to:
  /// **'Her agent adımının girdi/çıktısını sakla; sonuç ekranındaki böcek simgesinden görürsün.'**
  String get debugToggleHint;

  /// No description provided for @sectionNewProducts.
  ///
  /// In tr, this message translates to:
  /// **'YENİ ÜRÜNLER'**
  String get sectionNewProducts;

  /// No description provided for @sectionNewProductsHint.
  ///
  /// In tr, this message translates to:
  /// **'Menüde hiç yok — eklenmesi öneriliyor'**
  String get sectionNewProductsHint;

  /// No description provided for @sectionOptions.
  ///
  /// In tr, this message translates to:
  /// **'OPSİYON & MALZEME'**
  String get sectionOptions;

  /// No description provided for @sectionOptionsHint.
  ///
  /// In tr, this message translates to:
  /// **'Menüde olan ürünler için seçenek ve malzeme'**
  String get sectionOptionsHint;

  /// No description provided for @sectionFixes.
  ///
  /// In tr, this message translates to:
  /// **'EKSİK / DÜZELTME'**
  String get sectionFixes;

  /// No description provided for @sectionFixesHint.
  ///
  /// In tr, this message translates to:
  /// **'Mevcut üründe boş alan veya hatalı isim'**
  String get sectionFixesHint;

  /// No description provided for @sectionEmpty.
  ///
  /// In tr, this message translates to:
  /// **'Bu bölümde bir şey çıkmadı.'**
  String get sectionEmpty;

  /// No description provided for @filterAll.
  ///
  /// In tr, this message translates to:
  /// **'Tümü'**
  String get filterAll;

  /// No description provided for @filterNewProducts.
  ///
  /// In tr, this message translates to:
  /// **'Yeni ürün'**
  String get filterNewProducts;

  /// No description provided for @filterOptions.
  ///
  /// In tr, this message translates to:
  /// **'Opsiyon'**
  String get filterOptions;

  /// No description provided for @filterFixes.
  ///
  /// In tr, this message translates to:
  /// **'Düzeltme'**
  String get filterFixes;

  /// No description provided for @selectCard.
  ///
  /// In tr, this message translates to:
  /// **'Kartı seç'**
  String get selectCard;

  /// No description provided for @selectAll.
  ///
  /// In tr, this message translates to:
  /// **'Hepsini seç'**
  String get selectAll;

  /// No description provided for @selectedCount.
  ///
  /// In tr, this message translates to:
  /// **'{count} kart seçili'**
  String selectedCount(int count);

  /// No description provided for @copySelected.
  ///
  /// In tr, this message translates to:
  /// **'Panoya kopyala'**
  String get copySelected;

  /// No description provided for @clearSelection.
  ///
  /// In tr, this message translates to:
  /// **'Seçimi temizle'**
  String get clearSelection;

  /// No description provided for @copyOptions.
  ///
  /// In tr, this message translates to:
  /// **'Opsiyonları kopyala'**
  String get copyOptions;

  /// No description provided for @copyLabelCategory.
  ///
  /// In tr, this message translates to:
  /// **'Kategori'**
  String get copyLabelCategory;

  /// No description provided for @copyLabelPriceRange.
  ///
  /// In tr, this message translates to:
  /// **'Tahmini fiyat'**
  String get copyLabelPriceRange;

  /// No description provided for @addCard.
  ///
  /// In tr, this message translates to:
  /// **'Ekle'**
  String get addCard;

  /// No description provided for @reject.
  ///
  /// In tr, this message translates to:
  /// **'Reddet'**
  String get reject;

  /// No description provided for @markDone.
  ///
  /// In tr, this message translates to:
  /// **'Not aldım'**
  String get markDone;

  /// No description provided for @acceptedBadge.
  ///
  /// In tr, this message translates to:
  /// **'eklendi'**
  String get acceptedBadge;

  /// No description provided for @queuedBadge.
  ///
  /// In tr, this message translates to:
  /// **'kuyrukta'**
  String get queuedBadge;

  /// No description provided for @fixEmptyDescription.
  ///
  /// In tr, this message translates to:
  /// **'açıklama boş'**
  String get fixEmptyDescription;

  /// No description provided for @fixBadName.
  ///
  /// In tr, this message translates to:
  /// **'ad düzeltilmeli'**
  String get fixBadName;

  /// No description provided for @fixWrongCategory.
  ///
  /// In tr, this message translates to:
  /// **'kategori yanlış'**
  String get fixWrongCategory;

  /// No description provided for @pipelineDebug.
  ///
  /// In tr, this message translates to:
  /// **'Pipeline'**
  String get pipelineDebug;

  /// No description provided for @pipelineEmpty.
  ///
  /// In tr, this message translates to:
  /// **'Bu koşu için adım kaydı yok'**
  String get pipelineEmpty;

  /// No description provided for @pipelineTotal.
  ///
  /// In tr, this message translates to:
  /// **'toplam {ms} ms'**
  String pipelineTotal(int ms);

  /// No description provided for @pipelineSteps.
  ///
  /// In tr, this message translates to:
  /// **'{count} adım'**
  String pipelineSteps(int count);

  /// No description provided for @pipelineTokens.
  ///
  /// In tr, this message translates to:
  /// **'{input} / {output} token'**
  String pipelineTokens(int input, int output);

  /// No description provided for @pipelineInput.
  ///
  /// In tr, this message translates to:
  /// **'Girdi'**
  String get pipelineInput;

  /// No description provided for @pipelineOutput.
  ///
  /// In tr, this message translates to:
  /// **'Çıktı'**
  String get pipelineOutput;

  /// No description provided for @agentExtractor.
  ///
  /// In tr, this message translates to:
  /// **'Menü okuma'**
  String get agentExtractor;

  /// No description provided for @agentClassifier.
  ///
  /// In tr, this message translates to:
  /// **'Mutfak türü'**
  String get agentClassifier;

  /// No description provided for @agentGapAnalyst.
  ///
  /// In tr, this message translates to:
  /// **'Eksik analizi'**
  String get agentGapAnalyst;

  /// No description provided for @agentProductRecommender.
  ///
  /// In tr, this message translates to:
  /// **'Yeni ürün önerisi'**
  String get agentProductRecommender;

  /// No description provided for @agentOptionModifier.
  ///
  /// In tr, this message translates to:
  /// **'Opsiyon & malzeme'**
  String get agentOptionModifier;

  /// No description provided for @agentValidator.
  ///
  /// In tr, this message translates to:
  /// **'Doğrulama'**
  String get agentValidator;

  /// No description provided for @tabNewProducts.
  ///
  /// In tr, this message translates to:
  /// **'Yeni ürünler ({count})'**
  String tabNewProducts(int count);

  /// No description provided for @tabMenuProducts.
  ///
  /// In tr, this message translates to:
  /// **'Menüdeki ürünler ({count})'**
  String tabMenuProducts(int count);

  /// No description provided for @tabNewProductsEmpty.
  ///
  /// In tr, this message translates to:
  /// **'Yeni ürün önerisi çıkmadı.'**
  String get tabNewProductsEmpty;

  /// No description provided for @tabMenuProductsEmpty.
  ///
  /// In tr, this message translates to:
  /// **'Menüdeki ürünler için öneri çıkmadı.'**
  String get tabMenuProductsEmpty;

  /// No description provided for @sectionOptionsTitle.
  ///
  /// In tr, this message translates to:
  /// **'Opsiyonlar'**
  String get sectionOptionsTitle;

  /// No description provided for @sectionRemovablesTitle.
  ///
  /// In tr, this message translates to:
  /// **'Çıkarılabilir malzemeler'**
  String get sectionRemovablesTitle;

  /// No description provided for @sectionExtrasTitle.
  ///
  /// In tr, this message translates to:
  /// **'Ekstra malzemeler'**
  String get sectionExtrasTitle;

  /// No description provided for @sectionDescriptionTitle.
  ///
  /// In tr, this message translates to:
  /// **'Açıklama'**
  String get sectionDescriptionTitle;

  /// No description provided for @panelHasIt.
  ///
  /// In tr, this message translates to:
  /// **'Panelde zaten var'**
  String get panelHasIt;

  /// No description provided for @noSuggestion.
  ///
  /// In tr, this message translates to:
  /// **'Öneri yok'**
  String get noSuggestion;

  /// No description provided for @plainProduct.
  ///
  /// In tr, this message translates to:
  /// **'Hazır içecek: açıklama ve opsiyon gerekmez, adıyla eklenir.'**
  String get plainProduct;

  /// No description provided for @tapToRemove.
  ///
  /// In tr, this message translates to:
  /// **'Opsiyon, malzeme ya da açıklamaya tek dokunuşla bak. Satıcının cevabını “Evet”, “Düşünecek” ya da “Hayır” ile işaretle.'**
  String get tapToRemove;

  /// No description provided for @answerYes.
  ///
  /// In tr, this message translates to:
  /// **'Evet'**
  String get answerYes;

  /// No description provided for @answerYesKept.
  ///
  /// In tr, this message translates to:
  /// **'Evet (seçilenler)'**
  String get answerYesKept;

  /// No description provided for @answerLater.
  ///
  /// In tr, this message translates to:
  /// **'Düşünecek'**
  String get answerLater;

  /// No description provided for @answerNo.
  ///
  /// In tr, this message translates to:
  /// **'Hayır'**
  String get answerNo;

  /// No description provided for @answeredYes.
  ///
  /// In tr, this message translates to:
  /// **'Evet dedi'**
  String get answeredYes;

  /// No description provided for @answeredNo.
  ///
  /// In tr, this message translates to:
  /// **'Hayır dedi'**
  String get answeredNo;

  /// No description provided for @answeredLater.
  ///
  /// In tr, this message translates to:
  /// **'Düşünecek'**
  String get answeredLater;

  /// No description provided for @pitchLabel.
  ///
  /// In tr, this message translates to:
  /// **'Satıcıya söyle'**
  String get pitchLabel;

  /// No description provided for @callProgress.
  ///
  /// In tr, this message translates to:
  /// **'Evet {yes} · Düşünecek {later} · Hayır {no}'**
  String callProgress(int yes, int later, int no);

  /// No description provided for @officeTitle.
  ///
  /// In tr, this message translates to:
  /// **'Ofiste girilecekler'**
  String get officeTitle;

  /// No description provided for @officeOpen.
  ///
  /// In tr, this message translates to:
  /// **'Ofiste girilecekler ({count})'**
  String officeOpen(int count);

  /// No description provided for @officeYes.
  ///
  /// In tr, this message translates to:
  /// **'Satıcı evet dedi ({count})'**
  String officeYes(int count);

  /// No description provided for @officeLater.
  ///
  /// In tr, this message translates to:
  /// **'Düşünecek ({count})'**
  String officeLater(int count);

  /// No description provided for @officeEntered.
  ///
  /// In tr, this message translates to:
  /// **'{done}/{total} panele girildi'**
  String officeEntered(int done, int total);

  /// No description provided for @officeEnteredCheck.
  ///
  /// In tr, this message translates to:
  /// **'Panele girildi'**
  String get officeEnteredCheck;

  /// No description provided for @officeLaterYes.
  ///
  /// In tr, this message translates to:
  /// **'Evet dedi'**
  String get officeLaterYes;

  /// No description provided for @officeNote.
  ///
  /// In tr, this message translates to:
  /// **'Çağrı notu'**
  String get officeNote;

  /// No description provided for @officeNoteHint.
  ///
  /// In tr, this message translates to:
  /// **'Satıcının istekleri, fiyatlar, dönüş zamanı…'**
  String get officeNoteHint;

  /// No description provided for @officeEmpty.
  ///
  /// In tr, this message translates to:
  /// **'Henüz satıcının evet dediği ya da düşüneceği bir ürün yok. Çağrıda kartlardaki “Evet” ve “Düşünecek” butonlarını kullan.'**
  String get officeEmpty;

  /// No description provided for @officeShare.
  ///
  /// In tr, this message translates to:
  /// **'Satıcıya gönder'**
  String get officeShare;

  /// No description provided for @officeShareCopied.
  ///
  /// In tr, this message translates to:
  /// **'Paylaşım açılamadı; metin panoya kopyalandı, sohbete yapıştırabilirsin.'**
  String get officeShareCopied;

  /// No description provided for @officeShareIntro.
  ///
  /// In tr, this message translates to:
  /// **'Merhaba, görüşmemizde menünüze eklemeyi konuştuğumuz ürünler:'**
  String get officeShareIntro;

  /// No description provided for @officeShareLater.
  ///
  /// In tr, this message translates to:
  /// **'Düşünmek istediğiniz ürünler:'**
  String get officeShareLater;

  /// No description provided for @officeShareMenuLine.
  ///
  /// In tr, this message translates to:
  /// **'{name} ({what})'**
  String officeShareMenuLine(String name, String what);

  /// No description provided for @officeWhatOptions.
  ///
  /// In tr, this message translates to:
  /// **'opsiyonlar'**
  String get officeWhatOptions;

  /// No description provided for @officeWhatRemovables.
  ///
  /// In tr, this message translates to:
  /// **'çıkarılabilir malzemeler'**
  String get officeWhatRemovables;

  /// No description provided for @officeWhatExtras.
  ///
  /// In tr, this message translates to:
  /// **'ekstra malzemeler'**
  String get officeWhatExtras;

  /// No description provided for @officeWhatDescription.
  ///
  /// In tr, this message translates to:
  /// **'açıklama'**
  String get officeWhatDescription;

  /// No description provided for @openCard.
  ///
  /// In tr, this message translates to:
  /// **'Kartı aç'**
  String get openCard;

  /// No description provided for @closeCard.
  ///
  /// In tr, this message translates to:
  /// **'Kartı kapat'**
  String get closeCard;

  /// No description provided for @summaryGroups.
  ///
  /// In tr, this message translates to:
  /// **'{count} opsiyon grubu'**
  String summaryGroups(int count);

  /// No description provided for @summaryRemovables.
  ///
  /// In tr, this message translates to:
  /// **'{count} çıkarılabilir'**
  String summaryRemovables(int count);

  /// No description provided for @summaryExtras.
  ///
  /// In tr, this message translates to:
  /// **'{count} ekstra'**
  String summaryExtras(int count);

  /// No description provided for @summaryDescription.
  ///
  /// In tr, this message translates to:
  /// **'açıklama'**
  String get summaryDescription;

  /// No description provided for @summaryNotes.
  ///
  /// In tr, this message translates to:
  /// **'{count} not'**
  String summaryNotes(int count);

  /// No description provided for @summaryPlain.
  ///
  /// In tr, this message translates to:
  /// **'Hazır içecek, adıyla eklenir'**
  String get summaryPlain;

  /// No description provided for @checkThis.
  ///
  /// In tr, this message translates to:
  /// **'Kontrol et'**
  String get checkThis;

  /// No description provided for @newProductBadge.
  ///
  /// In tr, this message translates to:
  /// **'Yeni ürün'**
  String get newProductBadge;

  /// No description provided for @onMenuBadge.
  ///
  /// In tr, this message translates to:
  /// **'Menüde var'**
  String get onMenuBadge;

  /// No description provided for @noteRename.
  ///
  /// In tr, this message translates to:
  /// **'Doğru adı: {name}'**
  String noteRename(String name);

  /// No description provided for @noteAbbreviated.
  ///
  /// In tr, this message translates to:
  /// **'Ad kısaltılmış görünüyor, tam adını sor.'**
  String get noteAbbreviated;

  /// No description provided for @noteCategory.
  ///
  /// In tr, this message translates to:
  /// **'Panelde {from} bölümünde, {to} olabilir.'**
  String noteCategory(String from, String to);

  /// No description provided for @noteDone.
  ///
  /// In tr, this message translates to:
  /// **'Tamam'**
  String get noteDone;

  /// No description provided for @progressLine.
  ///
  /// In tr, this message translates to:
  /// **'Menüde {current} ürün · hedef {target}'**
  String progressLine(int current, int target);

  /// No description provided for @stillNeeded.
  ///
  /// In tr, this message translates to:
  /// **'{count} ürün daha lazım'**
  String stillNeeded(int count);

  /// No description provided for @missingCategories.
  ///
  /// In tr, this message translates to:
  /// **'Eksik bölümler: {list}'**
  String missingCategories(String list);

  /// No description provided for @priceAsk.
  ///
  /// In tr, this message translates to:
  /// **'Fiyatı sor: {range}'**
  String priceAsk(String range);

  /// No description provided for @portionLine.
  ///
  /// In tr, this message translates to:
  /// **'Porsiyon: {value}'**
  String portionLine(String value);

  /// No description provided for @removeGroup.
  ///
  /// In tr, this message translates to:
  /// **'Grubu çıkar'**
  String get removeGroup;

  /// No description provided for @restoreGroup.
  ///
  /// In tr, this message translates to:
  /// **'Grubu geri al'**
  String get restoreGroup;

  /// No description provided for @aiOffNotice.
  ///
  /// In tr, this message translates to:
  /// **'Yapay zekâ şu an kullanılamıyor; öneriler hazır listeden geldi.'**
  String get aiOffNotice;

  /// No description provided for @notesToggle.
  ///
  /// In tr, this message translates to:
  /// **'Not ekle (isteğe bağlı)'**
  String get notesToggle;

  /// No description provided for @copySection.
  ///
  /// In tr, this message translates to:
  /// **'{section} kopyala'**
  String copySection(String section);

  /// No description provided for @errorRetry.
  ///
  /// In tr, this message translates to:
  /// **'Analiz tamamlanamadı. Tekrar dene.'**
  String get errorRetry;

  /// No description provided for @alternativeOf.
  ///
  /// In tr, this message translates to:
  /// **'{name} alternatifi'**
  String alternativeOf(String name);

  /// No description provided for @quickOptions.
  ///
  /// In tr, this message translates to:
  /// **'Opsiyon {count}'**
  String quickOptions(int count);

  /// No description provided for @quickRemovables.
  ///
  /// In tr, this message translates to:
  /// **'Çıkar {count}'**
  String quickRemovables(int count);

  /// No description provided for @quickExtras.
  ///
  /// In tr, this message translates to:
  /// **'Ekstra {count}'**
  String quickExtras(int count);

  /// No description provided for @quickDescription.
  ///
  /// In tr, this message translates to:
  /// **'Açıklama'**
  String get quickDescription;

  /// No description provided for @expandAll.
  ///
  /// In tr, this message translates to:
  /// **'Tümünü aç'**
  String get expandAll;

  /// No description provided for @collapseAll.
  ///
  /// In tr, this message translates to:
  /// **'Tümünü kapat'**
  String get collapseAll;

  /// No description provided for @searchProducts.
  ///
  /// In tr, this message translates to:
  /// **'Ürün ara'**
  String get searchProducts;

  /// No description provided for @noSearchResults.
  ///
  /// In tr, this message translates to:
  /// **'Bu aramaya uyan ürün yok.'**
  String get noSearchResults;

  /// No description provided for @alternativesOnly.
  ///
  /// In tr, this message translates to:
  /// **'Alternatifler {count}'**
  String alternativesOnly(int count);

  /// No description provided for @allProducts.
  ///
  /// In tr, this message translates to:
  /// **'Tümü'**
  String get allProducts;

  /// No description provided for @deviceAccount.
  ///
  /// In tr, this message translates to:
  /// **'Ekip hesabı'**
  String get deviceAccount;

  /// No description provided for @deviceAccountHint.
  ///
  /// In tr, this message translates to:
  /// **'Bu cihaz ekip hesabına otomatik bağlı; giriş gerekmez.'**
  String get deviceAccountHint;
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
