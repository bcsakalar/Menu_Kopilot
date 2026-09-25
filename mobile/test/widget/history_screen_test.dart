import 'package:drift/drift.dart' show DatabaseConnection, Value;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:menu_kopilot/core/network/api_client.dart';
import 'package:menu_kopilot/core/network/api_exception.dart';
import 'package:menu_kopilot/core/providers.dart';
import 'package:menu_kopilot/core/storage/app_database.dart';
import 'package:menu_kopilot/core/storage/token_store.dart';
import 'package:menu_kopilot/data/models/history.dart';
import 'package:menu_kopilot/features/history/history_screen.dart';
import 'package:menu_kopilot/l10n/gen/app_localizations.dart';

/// The server's side of the history: one analysis made on another phone, or no connection at all.
class FakeHistoryApi extends ApiClient {
  FakeHistoryApi() : super(baseUrl: 'http://fake', tokens: MemoryTokenStore());

  List<HistoryItem> items = const [];
  bool offline = false;
  int calls = 0;

  @override
  Future<HistoryPage> analysisHistory({
    int limit = 50,
    DateTime? before,
    DateTime? from,
    DateTime? to,
    String? cuisineId,
    String? mode,
    String? query,
  }) async {
    calls += 1;
    if (offline) throw const ApiException('NETWORK', 'server unreachable');
    return HistoryPage(items: before == null ? items : const []);
  }
}

void main() {
  late AppDatabase db;
  late FakeHistoryApi api;
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day, 0, 5);
  final yesterday = DateTime(now.year, now.month, now.day - 1, 18, 40);
  final older = DateTime(now.year, now.month, now.day - 10, 12, 15);

  setUpAll(() => initializeDateFormatting('tr'));

  setUp(() async {
    db = AppDatabase(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    api = FakeHistoryApi();
    await db.saveRecentRun(
      RecentRunsCompanion.insert(
        runId: 'r-pide',
        status: 'completed',
        snapshotJson: '{"runId":"r-pide"}',
        createdAt: today,
        cuisineId: const Value('c-pide'),
        cuisineName: const Value('Pide & Lahmacun'),
        mode: const Value('full'),
        productNamesJson: const Value('["Kıymalı Pide","Kaşarlı Pide","Kuşbaşılı Pide","Karışık Pide"]'),
        menuCount: const Value(5),
        newCount: const Value(12),
        menuCardCount: const Value(5),
        acceptedCount: const Value(3),
      ),
    );
    await db.saveRecentRun(
      RecentRunsCompanion.insert(
        runId: 'r-pizza',
        status: 'partial',
        snapshotJson: '{"runId":"r-pizza"}',
        createdAt: yesterday,
        cuisineId: const Value('c-pizza'),
        cuisineName: const Value('Pizza'),
        mode: const Value('quick'),
        productNamesJson: const Value('["Margherita","Karışık Pizza"]'),
        menuCount: const Value(2),
        newCount: const Value(6),
      ),
    );
    await db.saveRecentRun(
      RecentRunsCompanion.insert(
        runId: 'r-soup',
        status: 'completed',
        snapshotJson: '{}',
        createdAt: older,
        cuisineId: const Value('c-soup'),
        cuisineName: const Value('Çorba'),
        mode: const Value('full'),
        productNamesJson: const Value('["Mercimek Çorbası","İşkembe Çorbası"]'),
        menuCount: const Value(2),
        newCount: const Value(8),
        skippedCount: const Value(1),
      ),
    );
  });

  tearDown(() => db.close());

  Future<void> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(412 * 3, 1400 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final router = GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, _) => const HistoryScreen()),
        GoRoute(path: '/suggest/results', builder: (_, state) => Text('result ${state.uri.queryParameters['runId']}')),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [appDatabaseProvider.overrideWithValue(db), apiClientProvider.overrideWithValue(api)],
        child: MaterialApp.router(
          locale: const Locale('tr'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  bool shows(String runId) => find.byKey(ValueKey('history-$runId')).evaluate().isNotEmpty;

  /// The filter row scrolls sideways: a chip is brought into view before it is tapped.
  Future<void> tapChip(WidgetTester tester, String key) async {
    await tester.ensureVisible(find.byKey(Key(key)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key(key)));
    await tester.pumpAndSettle();
  }

  group('HistoryScreen', () {
    testWidgets('every analysis under its day, newest first, with its time, cuisine, mode and what it produced', (tester) async {
      await open(tester);
      expect(find.text('Bugün'), findsOneWidget);
      expect(find.text('Dün'), findsOneWidget);
      expect(find.text(DateFormat('d MMMM y, EEEE', 'tr').format(older)), findsOneWidget);

      final pide = find.byKey(const ValueKey('history-r-pide'));
      expect(find.descendant(of: pide, matching: find.text('00:05')), findsOneWidget);
      expect(find.descendant(of: pide, matching: find.text('Kıymalı Pide, Kaşarlı Pide, Kuşbaşılı Pide +2')), findsOneWidget);
      expect(find.descendant(of: pide, matching: find.text('Pide & Lahmacun · Tam')), findsOneWidget);
      expect(find.descendant(of: pide, matching: find.text('12 yeni · 5 menüde · 3 kabul')), findsOneWidget);
      final pizza = find.byKey(const ValueKey('history-r-pizza'));
      expect(find.descendant(of: pizza, matching: find.text('Eksik tamamlandı · 6 yeni')), findsOneWidget);

      // Newest first.
      final top = tester.getTopLeft(pide).dy;
      expect(top < tester.getTopLeft(pizza).dy, isTrue);
      expect(tester.getTopLeft(pizza).dy < tester.getTopLeft(find.byKey(const ValueKey('history-r-soup'))).dy, isTrue);
    });

    testWidgets('filters by mode, by a product name, by date and by cuisine, and clears', (tester) async {
      await open(tester);
      await tapChip(tester, 'filter-quick');
      expect((shows('r-pide'), shows('r-pizza'), shows('r-soup')), (false, true, false));
      await tapChip(tester, 'filter-quick');

      await tester.enterText(find.byKey(const Key('history-search')), 'iskembe');
      await tester.pumpAndSettle();
      expect((shows('r-pide'), shows('r-pizza'), shows('r-soup')), (false, false, true));
      await tapChip(tester, 'filter-clear');
      expect((shows('r-pide'), shows('r-pizza'), shows('r-soup')), (true, true, true));

      await tapChip(tester, 'filter-period');
      await tester.tap(find.byKey(const ValueKey('period-today')));
      await tester.pumpAndSettle();
      expect((shows('r-pide'), shows('r-pizza'), shows('r-soup')), (true, false, false));
      await tapChip(tester, 'filter-clear');

      await tapChip(tester, 'filter-cuisine');
      await tester.tap(find.byKey(const ValueKey('cuisine-c-pizza')));
      await tester.pumpAndSettle();
      expect((shows('r-pide'), shows('r-pizza'), shows('r-soup')), (false, true, false));
      expect(find.widgetWithText(FilterChip, 'Pizza'), findsOneWidget);

      // Nothing left: says so, with a way back.
      await tapChip(tester, 'filter-full');
      expect(find.text('Bu filtreye uyan analiz yok.'), findsOneWidget);
    });

    testWidgets('fills in an analysis made on another phone from the server', (tester) async {
      api.items = [
        HistoryItem(
          runId: 'r-kebap',
          createdAt: today.add(const Duration(minutes: 10)),
          status: 'completed',
          mode: 'quick',
          cuisineId: 'c-kebap',
          cuisineName: 'Kebap & Izgara',
          productNames: const ['Adana Kebap', 'Urfa Kebap'],
          menuCount: 2,
          newProducts: 6,
        ),
      ];
      await open(tester);
      expect(api.calls, 1);
      expect(shows('r-kebap'), isTrue);
      expect(find.text('Adana Kebap, Urfa Kebap'), findsOneWidget);
      expect(find.text('2 analiz'), findsOneWidget);
    });

    testWidgets("offline: the phone's copy, a notice, and a result only the server has is not opened", (tester) async {
      api.offline = true;
      await open(tester);
      expect(find.text('Çevrimdışı: telefondaki kayıtlar gösteriliyor.'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('history-r-soup')));
      await tester.pumpAndSettle();
      expect(find.text('Bu analiz internet varken açılır.'), findsOneWidget);
      // One with its result on the phone opens.
      await tester.tap(find.byKey(const ValueKey('history-r-pide')));
      await tester.pumpAndSettle();
      expect(find.text('result r-pide'), findsOneWidget);
    });
  });
}
