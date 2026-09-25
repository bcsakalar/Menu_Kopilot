import 'dart:io';

import 'package:dio/dio.dart' show CancelToken;
import 'package:drift/drift.dart' show DatabaseConnection;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:menu_kopilot/core/network/api_client.dart';
import 'package:menu_kopilot/core/providers.dart';
import 'package:menu_kopilot/core/storage/app_database.dart';
import 'package:menu_kopilot/core/storage/token_store.dart';
import 'package:menu_kopilot/data/models/analysis.dart';
import 'package:menu_kopilot/data/models/json.dart';
import 'package:menu_kopilot/data/models/template_payload.dart';
import 'package:menu_kopilot/features/results/results_screen.dart';
import 'package:menu_kopilot/l10n/gen/app_localizations.dart';

const runId = '11111111-1111-1111-1111-111111111111';

Json soupGroups() => {
      'name': 'Porsiyon',
      'selectionType': 'single',
      'isRequired': true,
      'minSelect': 1,
      'maxSelect': 1,
      'options': [
        {'name': 'Yarım', 'priceMode': 'sets_base'},
        {'name': 'Tam', 'priceMode': 'sets_base'},
      ],
    };

/// A pide-only menu: five main courses, nothing to drink, no soup. The result is one soup and one drink to add,
/// a card for a pide the restaurant already sells, and a note about a shorthand name.
Json result({String status = 'completed', bool disagrees = false, List<Json> warnings = const []}) => {
      'runId': runId,
      'status': status,
      if (disagrees)
        'classification': {
          'cuisineId': 'c1',
          'cuisineName': 'Pide & Lahmacun',
          'priceSegment': 'orta',
          'confidence': 0.8,
          'reason': 'ürünlerin çoğu kebap',
          'disagrees': true,
          'suggestedCuisineId': 'c2',
          'suggestedCuisineName': 'Kebap & Izgara',
        },
      'counts': {
        'current': 5,
        'target': 10,
        'missing': 5,
        'hardMinimum': 10,
        'cuisineMin': 10,
        'cuisineName': 'Pide & Lahmacun',
        'cuisineId': 'c1',
        'categories': [
          {'key': 'icecek', 'label': 'İçecek', 'present': 0, 'minItems': 2, 'missing': 2},
          {'key': 'corba', 'label': 'Çorba', 'present': 0, 'minItems': 1, 'missing': 1},
        ],
      },
      'menu': [
        {'name': 'Kıymalı Pide', 'normalized': 'kiymali pide', 'categoryKey': 'ana-yemek', 'categoryLabel': 'Ana Yemek'},
      ],
      'cards': [
        {
          'id': 'card-soup',
          'runId': runId,
          'section': 'new_product',
          'name': 'Mercimek Çorbası',
          'source': 'db',
          'categoryKey': 'corba',
          'categoryLabel': 'Çorba',
          'shortDescription': 'Kırmızı mercimek, tereyağlı sosla sıcak servis edilir.',
          'priceRangeHint': '60–90 TL',
          'productType': 'corba',
          'confidence': 92,
          'status': 'pending',
          'sortOrder': 0,
          'optionGroups': [soupGroups()],
          'removableIngredients': ['Tereyağlı Sos', 'Pul Biber'],
          'extraIngredients': ['Ekstra Limon', 'Kıtır Ekmek'],
          'payload': {
            'name': 'Mercimek Çorbası',
            'description': 'Kırmızı mercimek, tereyağlı sosla sıcak servis edilir.',
            'optionGroups': [soupGroups()],
            'removableIngredients': ['Tereyağlı Sos', 'Pul Biber'],
            'extraIngredients': [
              {'name': 'Ekstra Limon', 'priceHint': 'ek ücretli'},
              {'name': 'Kıtır Ekmek', 'priceHint': 'ek ücretli'},
            ],
          },
        },
        {
          // A packaged drink: a plain panel row, nothing to choose or describe.
          'id': 'card-ayran',
          'runId': runId,
          'section': 'new_product',
          'name': 'Ayran',
          'source': 'db',
          'categoryKey': 'icecek',
          'categoryLabel': 'İçecek',
          'productType': 'mesrubat',
          'confidence': 95,
          'status': 'pending',
          'sortOrder': 1,
          'payload': {'name': 'Ayran', 'description': ''},
        },
        {
          'id': 'card-option',
          'runId': runId,
          'section': 'option',
          'name': 'Kıymalı Pide',
          'targetName': 'Kıymalı Pide',
          'targetNormalized': 'kiymali pide',
          'source': 'ai',
          'categoryLabel': 'Ana Yemek',
          'shortDescription': 'Taş fırında pişen kıymalı tekne pide, tereyağıyla.',
          'productType': 'pide',
          'confidence': 50,
          'optionGroups': [
            {
              'name': 'Boy',
              'selectionType': 'single',
              'isRequired': true,
              'minSelect': 1,
              'maxSelect': 1,
              'options': [
                {'name': 'Tek Kişilik', 'priceMode': 'sets_base'},
                {'name': 'Çift Kişilik', 'priceMode': 'sets_base'},
              ],
            },
          ],
          'removableIngredients': ['Soğan', 'Maydanoz'],
          'extraIngredients': ['Ekstra Kaşar'],
          'status': 'pending',
          'sortOrder': 2,
        },
        {
          'id': 'card-fix',
          'runId': runId,
          'section': 'fix',
          'name': 'Karışık Pide',
          'targetName': 'Karışık Pd',
          'targetNormalized': 'karisik pd',
          'source': 'review',
          'fixKind': 'bad_name',
          'currentValue': 'Karışık Pd',
          'suggestedValue': 'Karışık Pide',
          'reason': 'Ad kısaltma gibi görünüyor',
          'status': 'pending',
          'sortOrder': 3,
        },
      ],
      'stats': {'llmCalls': 2, 'menuItems': 5, 'newProducts': 2, 'optionCards': 1, 'fixCards': 1, 'latencyMs': 3400},
      'warnings': warnings,
    };

class FakeApi extends ApiClient {
  FakeApi() : super(baseUrl: 'http://fake', tokens: MemoryTokenStore());

  final List<String> accepted = [];
  final Map<String, TemplatePayload?> acceptedPayloads = {};
  final List<String> skipped = [];
  final List<AnalyzeRequestData> started = [];
  Json payload = result();

  /// A re-run: the server answers for the other cuisine, from the product list it already has.
  @override
  Stream<AnalyzeEvent> analyzeStream(AnalyzeRequestData request, {CancelToken? cancelToken}) {
    started.add(request);
    return Stream.fromIterable([
      const RunStartedEvent('22222222-2222-2222-2222-222222222222'),
      CountsEvent(
        AnalysisCounts.fromJson(const {
          'current': 5,
          'target': 12,
          'missing': 7,
          'hardMinimum': 10,
          'cuisineMin': 12,
          'cuisineName': 'Kebap & Izgara',
          'cuisineId': 'c2',
        }),
      ),
      const DoneEvent('completed', null),
    ]);
  }

  @override
  Future<AnalysisResult> analysis(String runId) async => AnalysisResult.fromJson(payload);

  @override
  Future<AnalysisResult?> latestAnalysis() async => AnalysisResult.fromJson(payload);

  @override
  Future<AnalysisCard> accept(String itemId, {TemplatePayload? payload}) async {
    accepted.add(itemId);
    acceptedPayloads[itemId] = payload;
    final card = AnalysisResult.fromJson(this.payload).cards.firstWhere((c) => c.id == itemId);
    return card.copyWith(status: CardStatus.accepted);
  }

  @override
  Future<AnalysisCard> skip(String itemId) async {
    skipped.add(itemId);
    final card = AnalysisResult.fromJson(payload).cards.firstWhere((c) => c.id == itemId);
    return card.copyWith(status: CardStatus.skipped);
  }
}

Widget host(List<Override> overrides, Widget child) => ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        locale: const Locale('tr'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: child,
      ),
    );

void main() {
  late AppDatabase db;
  late FakeApi api;
  late Directory temp;

  setUp(() {
    temp = Directory.systemTemp.createTempSync('results-test');
    db = AppDatabase(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    api = FakeApi();
  });

  tearDown(() async {
    await db.close();
    if (temp.existsSync()) temp.deleteSync(recursive: true);
  });

  List<Override> overrides() => [
        appDatabaseProvider.overrideWithValue(db),
        apiClientProvider.overrideWithValue(api),
      ];

  Future<void> open(WidgetTester tester) async {
    // A phone, not the 800×600 test default: the pinned strip and the tabs are sized for this.
    tester.view.physicalSize = const Size(412 * 3, 915 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(host(overrides(), const ResultsScreen(runId: runId)));
    await tester.pumpAndSettle();
  }

  /// The test font draws every glyph as a full square, so the page is far taller than on a phone: later cards
  /// have to be scrolled to before they exist.
  Finder resultList() => find.descendant(of: find.byKey(const Key('result-list')), matching: find.byType(Scrollable)).first;
  Future<void> scrollTo(WidgetTester tester, Finder finder) async {
    await tester.scrollUntilVisible(finder, 250, scrollable: resultList());
    // Built is not the same as on screen: the list builds a little past the bottom edge.
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
  }

  Future<void> tapOn(WidgetTester tester, Finder finder) async {
    await scrollTo(tester, finder);
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  Future<void> openMenuTab(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('tab-menu')));
    await tester.pumpAndSettle();
  }

  group('ResultsScreen', () {
    testWidgets('shows the count against the target, what is still needed and the short sections', (tester) async {
      await open(tester);
      expect(find.byKey(const Key('analysis-counts')), findsOneWidget);
      expect(find.text('Menüde 5 ürün · hedef 10'), findsOneWidget);
      expect(find.textContaining('mutfak türü: Pide & Lahmacun'), findsOneWidget);
      // Below the hard 10-product rule, that is what the caption has to say first.
      expect(find.textContaining('en az 10 ürün'), findsOneWidget);
      expect(find.textContaining('5 ürün daha lazım'), findsOneWidget);
      expect(find.text('Eksik bölümler: İçecek 0/2, Çorba 0/1'), findsOneWidget);
      // No technical words on the screen.
      expect(find.textContaining('AI çağrısı'), findsNothing);
      expect(find.textContaining("DB'den"), findsNothing);
    });

    testWidgets('two tabs: products to add and products already on the menu, with their counts', (tester) async {
      await open(tester);
      expect(find.text('Yeni ürünler (2)'), findsOneWidget);
      // The pide's card and the note about "Karışık Pd" are two products.
      expect(find.text('Menüdeki ürünler (2)'), findsOneWidget);
      expect(find.text('Mercimek Çorbası'), findsOneWidget);
      expect(find.text('Kıymalı Pide'), findsNothing);

      await openMenuTab(tester);
      expect(find.text('Kıymalı Pide'), findsOneWidget);
      expect(find.text('Mercimek Çorbası'), findsNothing);
    });

    testWidgets('every product card has the four sections, each with its own copy button', (tester) async {
      await open(tester);
      final card = find.byKey(const ValueKey('product-card-soup'));
      for (final title in ['Opsiyonlar', 'Çıkarılabilir malzemeler', 'Ekstra malzemeler', 'Açıklama']) {
        expect(find.descendant(of: card, matching: find.text(title)), findsOneWidget, reason: title);
      }
      expect(find.descendant(of: card, matching: find.text('Kopyala')), findsNWidgets(4));
      expect(find.descendant(of: card, matching: find.text('Tam · tabanı belirler')), findsOneWidget);
      expect(find.descendant(of: card, matching: find.text('Kırmızı mercimek, tereyağlı sosla sıcak servis edilir.')), findsOneWidget);
    });

    testWidgets('one tap takes a suggestion out; accepting sends only what was kept', (tester) async {
      await open(tester);
      await tapOn(tester, find.byKey(const ValueKey('chip-r|Pul Biber')));
      await tapOn(tester, find.byKey(const ValueKey('chip-o|Porsiyon|Yarım')));
      // The button says what it will do now.
      expect(find.text('Seçilenleri kabul et'), findsOneWidget);

      await tapOn(tester, find.byKey(const ValueKey('accept-card-soup')));
      final sent = api.acceptedPayloads['card-soup']!;
      expect(sent.removableIngredients, ['Tereyağlı Sos']);
      expect(sent.optionGroups.single.options.map((o) => o.name), ['Tam']);
      expect(sent.extraIngredients.map((e) => e.name), ['Ekstra Limon', 'Kıtır Ekmek']);
      expect(sent.description, 'Kırmızı mercimek, tereyağlı sosla sıcak servis edilir.');
    });

    testWidgets('a whole option group comes out with one tap and back with another', (tester) async {
      await open(tester);
      await tapOn(tester, find.byKey(const ValueKey('group-Porsiyon')));
      expect(find.text('Grubu geri al'), findsOneWidget);
      expect(find.byKey(const ValueKey('chip-o|Porsiyon|Tam')), findsNothing);
      await tapOn(tester, find.byKey(const ValueKey('group-Porsiyon')));
      expect(find.byKey(const ValueKey('chip-o|Porsiyon|Tam')), findsOneWidget);
    });

    testWidgets('accepting a new product moves the counter during the call', (tester) async {
      await open(tester);
      await tapOn(tester, find.byKey(const ValueKey('accept-card-soup')));
      expect(api.accepted, ['card-soup']);
      // 5 → 6 without waiting for a re-run, and the soup section moves with it.
      expect(find.text('Menüde 6 ürün · hedef 10'), findsOneWidget);
      expect(find.textContaining('4 ürün daha lazım'), findsOneWidget);
      expect(find.text('Eksik bölümler: İçecek 0/2'), findsOneWidget);
      expect(find.text('Kabul edildi'), findsOneWidget);
    });

    testWidgets('a packaged drink is added with its name alone', (tester) async {
      await open(tester);
      await scrollTo(tester, find.byKey(const ValueKey('accept-card-ayran')));
      expect(find.text('Hazır içecek: açıklama ve opsiyon gerekmez, adıyla eklenir.'), findsOneWidget);
      expect(find.text('Menüye ekle'), findsOneWidget);
      await tapOn(tester, find.byKey(const ValueKey('accept-card-ayran')));
      expect(api.accepted, ['card-ayran']);
    });

    testWidgets('shows the price to ask about, never inside the template', (tester) async {
      await open(tester);
      expect(find.text('Fiyatı sor: 60–90 TL'), findsOneWidget);
      final card = AnalysisResult.fromJson(result()).cards.first;
      expect(card.payload?.toJson().toString().contains('TL'), isFalse);
    });

    testWidgets('a product on the menu: its card, a "Kontrol et" when unsure, and the note about another product', (tester) async {
      await open(tester);
      await openMenuTab(tester);
      final pide = find.byKey(const ValueKey('product-card-option'));
      expect(find.descendant(of: pide, matching: find.text('Kontrol et')), findsOneWidget);
      expect(find.descendant(of: pide, matching: find.text('Tek Kişilik · tabanı belirler')), findsOneWidget);
      expect(find.descendant(of: pide, matching: find.text('Soğan')), findsOneWidget);
      expect(find.descendant(of: pide, matching: find.text('Şimdi değil')), findsOneWidget);

      await scrollTo(tester, find.byKey(const ValueKey('note-done-card-fix')));
      expect(find.text('Doğru adı: Karışık Pide'), findsOneWidget);
      await tapOn(tester, find.byKey(const ValueKey('note-done-card-fix')));
      expect(api.accepted, ['card-fix']);
    });

    testWidgets('accepting a product on the menu sends its four sections', (tester) async {
      await open(tester);
      await openMenuTab(tester);
      await tapOn(tester, find.byKey(const ValueKey('chip-e|Ekstra Kaşar')));
      await tapOn(tester, find.byKey(const ValueKey('accept-card-option')));
      final sent = api.acceptedPayloads['card-option']!;
      expect(sent.name, 'Kıymalı Pide');
      expect(sent.optionGroups.single.name, 'Boy');
      expect(sent.removableIngredients, ['Soğan', 'Maydanoz']);
      expect(sent.extraIngredients, isEmpty);
      expect(sent.description, 'Taş fırında pişen kıymalı tekne pide, tereyağıyla.');
    });

    testWidgets('"Önerme" takes a new product off the list and keeps the rest', (tester) async {
      await open(tester);
      await tapOn(tester, find.byKey(const ValueKey('skip-card-soup')));
      expect(api.skipped, ['card-soup']);
      expect(find.text('Çıkarıldı'), findsOneWidget);
      expect(find.text('Yeni ürünler (2)'), findsOneWidget);
    });

    testWidgets('hides technical notices and keeps the ones the team can act on', (tester) async {
      api.payload = result(
        warnings: [
          {'code': 'slow_providers', 'message': 'AI sağlayıcıları 11 sn içinde cevap vermedi; veritabanı önerileriyle devam edildi.'},
          {'code': 'extract_failed', 'message': '1 görüntü okunamadı; kalanlarla devam edildi.'},
        ],
      );
      await open(tester);
      expect(find.textContaining('sağlayıcı'), findsNothing);
      expect(find.text('1 görüntü okunamadı; kalanlarla devam edildi.'), findsOneWidget);
    });

    testWidgets('re-runs against the cuisine the menu reads as, without re-reading the menu', (tester) async {
      api.payload = result(disagrees: true);
      await open(tester);
      expect(find.textContaining('Kebap & Izgara gibi görünüyor'), findsOneWidget);
      await tester.tap(find.byKey(const Key('rerun-suggested')));
      await tester.pumpAndSettle();
      final request = api.started.single;
      expect(request.fromRunId, runId);
      expect(request.cuisineId, 'c2');
      expect(request.images, isEmpty);
      expect(find.textContaining('mutfak türü: Kebap & Izgara'), findsOneWidget);
      expect(find.textContaining('hedef 12'), findsOneWidget);
    });
  });
}
