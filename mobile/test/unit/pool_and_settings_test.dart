import 'package:drift/drift.dart' show DatabaseConnection;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:menu_kopilot/core/network/api_client.dart';
import 'package:menu_kopilot/core/network/api_exception.dart';
import 'package:menu_kopilot/core/providers.dart';
import 'package:menu_kopilot/core/storage/app_database.dart';
import 'package:menu_kopilot/core/storage/token_store.dart';
import 'package:menu_kopilot/data/models/json.dart';
import 'package:menu_kopilot/data/models/settings.dart';
import 'package:menu_kopilot/data/models/analysis.dart';
import 'package:menu_kopilot/data/models/template_item.dart';
import 'package:menu_kopilot/data/models/template_payload.dart';
import 'package:menu_kopilot/features/templates/template_pool.dart';

TemplateItem template(String id, String name, {String source = 'seed', int usage = 0, List<String> aliases = const [], String cuisineId = 'k1'}) =>
    TemplateItem(
      id: id,
      cuisineId: cuisineId,
      cuisineName: 'Kebap & Izgara',
      name: name,
      source: source,
      usageCount: usage,
      aliases: aliases,
      payload: TemplatePayload(name: name, description: '$name açıklaması'),
      updatedAt: DateTime(2026, 9, 1),
    );

class FakePoolApi extends ApiClient {
  FakePoolApi() : super(baseUrl: 'http://fake', tokens: MemoryTokenStore());

  List<TemplateItem> pool = [];
  bool offline = false;
  final List<Json> updates = [];

  @override
  Future<({List<TemplateItem> items, int total})> templates({
    String? query,
    String? cuisineId,
    String? source,
    String approved = 'true',
    String sort = 'usage',
    int limit = 500,
    int offset = 0,
  }) async {
    if (offline) throw const ApiException('NETWORK', 'offline');
    return (items: pool, total: pool.length);
  }

  @override
  Future<TemplateItem> updateTemplate(String id, Json changes) async {
    updates.add(changes);
    final current = pool.firstWhere((t) => t.id == id);
    final payload = TemplatePayload.fromJson(changes['payload'] as Map<String, Object?>);
    return TemplateItem(
      id: id,
      cuisineId: current.cuisineId,
      cuisineName: current.cuisineName,
      name: payload.name,
      source: 'user',
      payload: payload,
      usageCount: current.usageCount,
    );
  }
}

void main() {
  group('template filtering', () {
    final items = [
      template('1', 'Adana Kebap', usage: 5, aliases: ['Acılı Kebap']),
      template('2', 'Çiğ Köfte Dürüm', usage: 9),
      template('3', 'İskender Kebap', source: 'user', usage: 1),
      template('4', 'Künefe', cuisineId: 't1'),
    ];

    test('folds Turkish characters for search', () {
      expect(foldTr('Çiğ KÖFTE  Dürüm'), 'cig kofte durum');
      expect(foldTr('ISPARTA'), 'isparta');
    });

    test('searches names and aliases, filters by cuisine and source, sorts', () {
      expect(const TemplateFilter(query: 'cig').apply(items).map((t) => t.id), ['2']);
      expect(const TemplateFilter(query: 'acili').apply(items).map((t) => t.id), ['1']);
      expect(const TemplateFilter(source: 'user').apply(items).map((t) => t.id), ['3']);
      expect(const TemplateFilter(source: 'seed', cuisineId: 'k1').apply(items).map((t) => t.id), ['2', '1']);
      expect(const TemplateFilter(sort: TemplateSort.name).apply(items).map((t) => t.name), [
        'Adana Kebap',
        'Çiğ Köfte Dürüm',
        'İskender Kebap',
        'Künefe',
      ]);
    });

    test('badges: seed → Hazır şablon, approved user/AI → DB', () {
      expect(items[0].origin, CardOrigin.seed);
      expect(items[2].origin, CardOrigin.db);
    });
  });

  group('TemplatePoolController', () {
    late AppDatabase db;
    late FakePoolApi api;
    late ProviderContainer container;

    setUp(() {
      db = AppDatabase(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
      api = FakePoolApi()..pool = [template('1', 'Adana Kebap', usage: 3), template('2', 'Lahmacun', usage: 7)];
      container = ProviderContainer(overrides: [appDatabaseProvider.overrideWithValue(db), apiClientProvider.overrideWithValue(api)]);
    });

    tearDown(() async {
      container.dispose();
      await db.close();
    });

    test('caches the pool and serves it offline', () async {
      final online = await container.read(templatePoolProvider.future);
      expect(online.offline, isFalse);
      expect(online.items, hasLength(2));

      api.offline = true;
      container.invalidate(templatePoolProvider);
      final offline = await container.read(templatePoolProvider.future);
      expect(offline.offline, isTrue);
      expect(offline.items.map((t) => t.name).toSet(), {'Adana Kebap', 'Lahmacun'});
    });

    test('saving an edit updates the list and the local copy', () async {
      final pool = await container.read(templatePoolProvider.future);
      final item = pool.items.first;
      await container.read(templatePoolProvider.notifier).save(item, item.payload.copyWith(description: 'Yeni açıklama'));
      expect(api.updates.single['payload'], isA<Map<String, Object?>>());
      final updated = container.read(templatePoolProvider).value!.items.firstWhere((t) => t.id == item.id);
      expect(updated.source, 'user');
      expect(updated.payload.description, 'Yeni açıklama');
      final rows = await db.cachedTemplateRows();
      expect(rows.firstWhere((r) => r.id == item.id).payloadJson, contains('Yeni açıklama'));
    });
  });

  group('settings and branch models', () {
    test('primary model is the first enabled route', () {
      final task = TaskSettings.fromJson({
        'taskKey': 'text.item_enrich',
        'label': 'Ürün kartı üretme',
        'chain': [
          {'id': 'openai/gpt-oss-120b', 'provider': 'groq', 'label': 'GPT-OSS 120B', 'enabled': false},
          {'id': 'gemini-3.8-flash', 'provider': 'gemini', 'label': 'Gemini Flash', 'enabled': true},
        ],
        'eligibleModels': <Object?>[],
      });
      expect(task.primaryModel, 'gemini-3.8-flash');
    });

    test('parses the usage summary', () {
      final summary = UsageSummary.fromJson({
        'range': 'today',
        'totals': {'calls': 3, 'failed': 1, 'tokensIn': 1200, 'tokensOut': 300, 'avgLatencyMs': 900},
        'byModel': [
          {'provider': 'gemini', 'model': 'gemini-3.8-flash', 'label': 'Gemini Flash', 'calls': 3, 'failed': 1, 'tokensIn': 1200, 'tokensOut': 300, 'avgLatencyMs': 900},
        ],
        'byTask': [
          {'taskKey': 'vision.panel_extract', 'label': 'Panel ekran görüntüsü okuma', 'calls': 3, 'failed': 1},
        ],
        'errors': [
          {'code': 'timeout', 'count': 1},
        ],
        'runs': {'total': 4, 'suggest': 3, 'gap': 1, 'cacheHit': 2, 'cacheHitRatio': 0.5},
        'cards': {'total': 10, 'fromDb': 8, 'ai': 1, 'review': 1, 'dbHitRatio': 0.8},
        'quota': {'allowed': true, 'callsToday': 3, 'tokensToday': 1500, 'dailyCalls': 300, 'dailyTokens': 1500000},
      });
      expect(summary.totals.calls, 3);
      expect(summary.byModel.single.label, 'Gemini Flash');
      expect(summary.byTask.single.calls, 3);
      expect(summary.errors.single.code, 'timeout');
      expect(summary.cacheHitRatio, 0.5);
      expect(summary.dbHitRatio, 0.8);
      expect(summary.quota.dailyCalls, 300);
    });
  });
}
