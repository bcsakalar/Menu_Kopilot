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

/// A pide-only menu: five main courses, nothing to drink, no soup, no dessert. The three sections and the
/// progress header are exactly what the screen has to make obvious during a call.
Json result({String status = 'completed', bool disagrees = false}) => {
      'runId': '11111111-1111-1111-1111-111111111111',
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
          {'key': 'ana-yemek', 'label': 'Ana Yemek', 'present': 5, 'minItems': 6, 'missing': 1},
        ],
      },
      'menu': [
        {'name': 'Kıymalı Pide', 'normalized': 'kiymali pide', 'categoryKey': 'ana-yemek', 'categoryLabel': 'Ana Yemek'},
      ],
      'cards': [
        {
          'id': 'card-new',
          'runId': '11111111-1111-1111-1111-111111111111',
          'section': 'new_product',
          'name': 'Ayran',
          'source': 'db',
          'categoryKey': 'icecek',
          'categoryLabel': 'İçecek',
          'shortDescription': 'Taze yoğurttan tuzlu ayran, soğuk servis edilir.',
          'priceRangeHint': '25–40 TL',
          'reason': 'İçecek kategorisi tamamen boş',
          'status': 'pending',
          'sortOrder': 0,
          'payload': {'name': 'Ayran', 'description': 'Taze yoğurttan tuzlu ayran, soğuk servis edilir.'},
        },
        {
          'id': 'card-option',
          'runId': '11111111-1111-1111-1111-111111111111',
          'section': 'option',
          'name': 'Kıymalı Pide',
          'targetName': 'Kıymalı Pide',
          'targetNormalized': 'kiymali pide',
          'source': 'ai',
          'categoryLabel': 'Ana Yemek',
          'reason': 'Panelde opsiyon alanı boş',
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
          'removableIngredients': ['Soğan'],
          'status': 'pending',
          'sortOrder': 1,
        },
        {
          'id': 'card-fix',
          'runId': '11111111-1111-1111-1111-111111111111',
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
          'sortOrder': 2,
        },
      ],
      'stats': {'llmCalls': 2, 'menuItems': 5, 'newProducts': 1, 'optionCards': 1, 'fixCards': 1, 'latencyMs': 3400},
      'warnings': <Json>[],
    };

class FakeApi extends ApiClient {
  FakeApi() : super(baseUrl: 'http://fake', tokens: MemoryTokenStore());

  final List<String> accepted = [];
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
    // A phone, not the 800×600 test default: the pinned strip and the sticky headers are sized for this.
    tester.view.physicalSize = const Size(412 * 3, 915 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(host(overrides(), const ResultsScreen(runId: '11111111-1111-1111-1111-111111111111')));
    await tester.pumpAndSettle();
  }

  /// The result list (not the horizontal chip/pill strips). The test font draws every glyph as a full square, so
  /// the page is far taller than on a phone: later sections have to be scrolled to before they exist.
  Finder resultList() => find.descendant(of: find.byType(CustomScrollView), matching: find.byType(Scrollable)).first;
  Future<void> scrollTo(WidgetTester tester, Finder finder) => tester.scrollUntilVisible(finder, 250, scrollable: resultList());

  /// The horizontal filter strip; its later chips are built only once it is scrolled.
  Finder chipStrip() => find.ancestor(of: find.byType(FilterChip).first, matching: find.byType(Scrollable)).first;

  group('ResultsScreen', () {
    testWidgets('shows the count against the target, the cuisine and the open categories', (tester) async {
      await open(tester);
      expect(find.byKey(const Key('analysis-counts')), findsOneWidget);
      expect(find.textContaining('Mevcut 5 ürün / hedef 10'), findsOneWidget);
      expect(find.textContaining('mutfak türü: Pide & Lahmacun'), findsOneWidget);
      // Below the hard 10-product rule, that is what the caption has to say first.
      expect(find.textContaining('en az 10 ürün'), findsOneWidget);
      expect(find.textContaining('5 ürün eksik'), findsOneWidget);
      // Only the short categories are listed, emptiest first.
      expect(find.text('İçecek 0/2'), findsOneWidget);
      expect(find.text('Çorba 0/1'), findsOneWidget);
    });

    testWidgets('splits the cards into three titled, counted sections', (tester) async {
      await open(tester);
      expect(find.textContaining('YENİ ÜRÜNLER · 1'), findsOneWidget);
      await scrollTo(tester, find.textContaining('OPSİYON & MALZEME · 1'));
      expect(find.textContaining('OPSİYON & MALZEME · 1'), findsOneWidget);
      await scrollTo(tester, find.textContaining('EKSİK / DÜZELTME · 1'));
      expect(find.textContaining('EKSİK / DÜZELTME · 1'), findsOneWidget);
    });

    testWidgets('puts the target product first on an option card, and the rename on a fix card', (tester) async {
      await open(tester);
      // Section B: which product it belongs to, then the group and its choices.
      await scrollTo(tester, find.text('Boy'));
      expect(find.text('Kıymalı Pide'), findsWidgets);
      expect(find.text('Boy'), findsOneWidget);
      // The panel's "fiyat farkı" in words: this choice sets the base price.
      expect(find.text('Tek Kişilik · tabanı belirler'), findsOneWidget);
      // Section C: old name struck through, suggested name next to it.
      await scrollTo(tester, find.byKey(const ValueKey('card-fix')));
      expect(find.text('Karışık Pd'), findsWidgets);
      expect(find.text('Karışık Pide'), findsWidgets);
    });

    testWidgets('shows the price hint of a new product but never inside its template', (tester) async {
      await open(tester);
      expect(find.text('25–40 TL'), findsOneWidget);
      final card = AnalysisResult.fromJson(result()).cards.first;
      expect(card.payload?.toJson().toString().contains('TL'), isFalse);
    });

    testWidgets('filters down to one section and back', (tester) async {
      await open(tester);
      await tester.scrollUntilVisible(find.byKey(const Key('filter-option')), 120, scrollable: chipStrip());
      await tester.tap(find.byKey(const Key('filter-option')));
      await tester.pumpAndSettle();
      expect(find.textContaining('OPSİYON & MALZEME · 1'), findsOneWidget);
      expect(find.textContaining('YENİ ÜRÜNLER'), findsNothing);

      // Back to the start of the strip, where 'Tümü' sits.
      await tester.drag(chipStrip(), const Offset(800, 0));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('filter-all')));
      await tester.pumpAndSettle();
      expect(find.textContaining('YENİ ÜRÜNLER · 1'), findsOneWidget);
    });

    testWidgets('bulk-selects cards and offers one copy for all of them', (tester) async {
      await open(tester);
      expect(find.byKey(const Key('copy-selected')), findsNothing);
      await tester.tap(find.byIcon(Icons.check_box_outline_blank_rounded).first);
      await tester.pumpAndSettle();
      expect(find.text('1 kart seçili'), findsOneWidget);
      expect(find.byKey(const Key('copy-selected')), findsOneWidget);
    });

    testWidgets('accepting a new product moves the counter during the call', (tester) async {
      await open(tester);
      await tester.tap(find.text('Ekle').first);
      await tester.pumpAndSettle();
      expect(api.accepted, ['card-new']);
      // 5 → 6 without waiting for a re-run, and the drinks pill moves with it.
      expect(find.textContaining('Mevcut 6 ürün'), findsOneWidget);
      expect(find.textContaining('4 ürün eksik'), findsOneWidget);
      expect(find.text('İçecek 1/2'), findsOneWidget);
    });

    testWidgets('selects a whole section from its header', (tester) async {
      await open(tester);
      await scrollTo(tester, find.byKey(const ValueKey('select-all-option')));
      await tester.tap(find.byKey(const ValueKey('select-all-option')));
      await tester.pumpAndSettle();
      expect(find.text('1 kart seçili'), findsOneWidget);
    });

    testWidgets('re-runs against the cuisine the menu reads as, without re-reading the menu', (tester) async {
      api.payload = result(disagrees: true);
      await open(tester);
      expect(find.textContaining('Kebap & Izgara gibi görünüyor'), findsOneWidget);
      await scrollTo(tester, find.byKey(const Key('rerun-suggested')));
      await tester.tap(find.byKey(const Key('rerun-suggested')));
      await tester.pumpAndSettle();
      final request = api.started.single;
      expect(request.fromRunId, '11111111-1111-1111-1111-111111111111');
      expect(request.cuisineId, 'c2');
      expect(request.images, isEmpty);
      expect(find.textContaining('mutfak türü: Kebap & Izgara'), findsOneWidget);
      expect(find.textContaining('hedef 12'), findsOneWidget);
    });

    testWidgets('rejecting a card marks it and keeps the rest', (tester) async {
      await open(tester);
      await tester.tap(find.text('Reddet').first);
      await tester.pumpAndSettle();
      expect(api.skipped, ['card-new']);
      expect(find.textContaining('YENİ ÜRÜNLER · 1'), findsOneWidget);
    });
  });
}
