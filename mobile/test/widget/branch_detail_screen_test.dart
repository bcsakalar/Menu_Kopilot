import 'package:drift/drift.dart' show DatabaseConnection;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:menu_kopilot/core/network/api_client.dart';
import 'package:menu_kopilot/core/providers.dart';
import 'package:menu_kopilot/core/storage/app_database.dart';
import 'package:menu_kopilot/core/storage/token_store.dart';
import 'package:menu_kopilot/core/utils/file_sharer.dart';
import 'package:menu_kopilot/data/models/branch.dart';
import 'package:menu_kopilot/data/models/json.dart';
import 'package:menu_kopilot/features/branches/branch_detail_screen.dart';
import 'package:menu_kopilot/l10n/gen/app_localizations.dart';

Json _menuJson({String beytiStatus = 'missing', int current = 2}) => {
      'branch': {
        'id': 'b1',
        'name': 'Karşıyaka Kebapçısı',
        'cuisineId': 'k1',
        'cuisineName': 'Kebap & Izgara',
        'status': 'in_progress',
        'effectiveTarget': 14,
        'currentItemCount': current,
      },
      'items': [
        {'id': 'i1', 'name': 'Lahmacun', 'status': 'incomplete', 'source': 'screenshot', 'missingFields': ['description', 'removables']},
        {'id': 'i2', 'name': 'Adana Kebap', 'status': 'ok', 'source': 'suggestion', 'payload': {'name': 'Adana Kebap', 'description': 'Acılı'}},
        {'id': 'i3', 'name': 'Beyti Sarma', 'status': beytiStatus, 'source': 'recommendation', 'reason': 'Kebap menülerinde sık görülür'},
      ],
    };

class FakeBranchApi extends ApiClient {
  FakeBranchApi() : super(baseUrl: 'http://fake', tokens: MemoryTokenStore());

  BranchMenu menu = BranchMenu.fromJson(_menuJson());
  final List<(String, MenuItemStatus)> statusChanges = [];

  @override
  Future<BranchMenu> branchMenu(String branchId) async => menu;

  @override
  Future<BranchMenu> updateMenuItem(String branchId, String itemId, MenuItemStatus status) async {
    statusChanges.add((itemId, status));
    menu = BranchMenu.fromJson(_menuJson(beytiStatus: status.name, current: 3));
    return menu;
  }

  @override
  Future<({String fileName, String body})> exportBranch(String branchId, {String format = 'csv'}) async =>
      (fileName: 'karsiyaka-kebapcisi-menu.$format', body: '﻿Ürün;Durum\r\nLahmacun;Eksik bilgi\r\n');
}

class FakeSharer implements FileSharer {
  final List<(String, String)> shared = [];

  @override
  Future<void> shareText({required String fileName, required String content, required String mimeType, String? subject}) async {
    shared.add((fileName, mimeType));
  }
}

void main() {
  late AppDatabase db;
  late FakeBranchApi api;
  late FakeSharer sharer;

  setUp(() {
    db = AppDatabase(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    api = FakeBranchApi();
    sharer = FakeSharer();
  });

  tearDown(() async {
    await db.close();
  });

  Widget host() => ProviderScope(
        overrides: [
          appDatabaseProvider.overrideWithValue(db),
          apiClientProvider.overrideWithValue(api),
          fileSharerProvider.overrideWithValue(sharer),
        ],
        child: MaterialApp(
          locale: const Locale('tr'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: const BranchDetailScreen(branchId: 'b1'),
        ),
      );

  testWidgets('shows the menu by status; "Var" puts a recommendation on the menu', (tester) async {
    await tester.pumpWidget(host());
    await tester.pumpAndSettle();

    expect(find.text('Karşıyaka Kebapçısı'), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('count-current'))).data, '2');
    expect(find.text(' / 14'), findsOneWidget);
    expect(find.text('Menüde (1)'), findsOneWidget);
    expect(find.text('Eksik bilgi (1)'), findsOneWidget);
    expect(find.text('Önerilen (1)'), findsOneWidget);
    expect(find.text('Açıklama yok'), findsOneWidget);
    expect(find.text('Kebap menülerinde sık görülür'), findsOneWidget);

    await tester.tap(find.text('Var'));
    await tester.pumpAndSettle();
    expect(api.statusChanges, [('i3', MenuItemStatus.incomplete)]);
    expect(tester.widget<Text>(find.byKey(const Key('count-current'))).data, '3');
    expect(find.text('Eksik bilgi (2)'), findsOneWidget);
  });

  testWidgets('exports the menu through the share sheet', (tester) async {
    await tester.pumpWidget(host());
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('export-branch')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Excel (CSV)'));
    await tester.pumpAndSettle();
    expect(sharer.shared, [('karsiyaka-kebapcisi-menu.csv', 'text/csv')]);
  });
}
