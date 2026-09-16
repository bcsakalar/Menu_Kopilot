import 'dart:async';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show DatabaseConnection;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:menu_kopilot/core/network/api_client.dart';
import 'package:menu_kopilot/core/network/api_exception.dart';
import 'package:menu_kopilot/core/network/sse.dart';
import 'package:menu_kopilot/core/providers.dart';
import 'package:menu_kopilot/core/storage/app_database.dart';
import 'package:menu_kopilot/core/storage/token_store.dart';
import 'package:menu_kopilot/data/models/branch.dart';
import 'package:menu_kopilot/data/models/gap.dart';
import 'package:menu_kopilot/features/gap/gap_controller.dart';

const kebapBranch = Branch(id: 'b1', name: 'Kadıköy Ocakbaşı', cuisineId: 'k1', cuisineName: 'Kebap & Izgara', effectiveTarget: 14);

/// Raw SSE messages as the backend sends them (see docs/SSE_EVENTS.md).
List<SseMessage> sampleGapMessages() => [
      const SseMessage('run', {'type': 'run', 'runId': 'g1', 'branchId': 'b1'}),
      const SseMessage('progress', {'type': 'progress', 'stage': 'extract', 'message': 'Panel ekran görüntüleri okunuyor', 'done': 1, 'total': 2}),
      const SseMessage('counts', {
        'type': 'counts',
        'counts': {'current': 12, 'target': 14, 'missing': 2, 'fromScreenshots': 12, 'cuisineMin': 14, 'targetOverridden': false},
      }),
      const SseMessage('questions', {
        'type': 'questions',
        'items': [
          {'key': 'item:beyti sarma', 'text': 'Beyti Sarma var mı?', 'kind': 'missing_item', 'itemName': 'Beyti Sarma', 'hints': ['Kebap & Izgara menülerinde sık görülür']},
          {
            'key': 'fields:lahmacun:dor',
            'text': 'Lahmacun: açıklamayı, seçenekleri ve çıkarılabilir malzemeleri sor',
            'kind': 'missing_field',
            'itemName': 'Lahmacun',
            'hints': ['Boy: Fındık (Küçük) / Normal / Büyük'],
          },
          {'key': 'cuisine:kebap-izgara:icecek', 'text': 'İçecekli menü seçeneği var mı?', 'kind': 'cuisine', 'itemName': null, 'hints': <Object?>[]},
        ],
      }),
      const SseMessage('items', {
        'type': 'items',
        'items': [
          {
            'name': 'Adana Kebap',
            'normalized': 'adana kebap',
            'flags': {'description': 'present', 'options': 'present', 'removables': 'absent'},
            'completeness': 0.75,
            'status': 'incomplete',
            'missing': [
              {'field': 'removables', 'state': 'absent'},
            ],
            'matchedTemplateId': 't-adana',
            'templateName': 'Adana Kebap',
            'origin': 'seed',
            'sectionText': 'Kebaplar',
            'seenIn': 1,
          },
          {
            'name': 'Tavuk Şiş',
            'normalized': 'tavuk sis',
            'flags': {'description': 'absent', 'options': 'present', 'removables': 'unknown'},
            'completeness': 0.475,
            'status': 'incomplete',
            'missing': [
              {'field': 'description', 'state': 'absent'},
              {'field': 'removables', 'state': 'unknown'},
            ],
            'matchedTemplateId': null,
            'templateName': null,
            'origin': null,
            'sectionText': null,
            'seenIn': 1,
          },
          {
            'name': 'Kıymalı Pide',
            'normalized': 'kiymali pide',
            'flags': {'description': 'present', 'options': 'present', 'removables': 'present'},
            'completeness': 1,
            'status': 'ok',
            'missing': <Object?>[],
            'matchedTemplateId': 't-pide',
            'templateName': 'Kıymalı Pide',
            'origin': 'seed',
            'sectionText': null,
            'seenIn': 2,
          },
        ],
      }),
      const SseMessage('recommendations', {
        'type': 'recommendations',
        'source': 'db',
        'items': [
          {'name': 'Beyti Sarma', 'reason': 'Kebap & Izgara menülerinde sık görülür', 'importance': 70, 'source': 'db', 'templateId': 't-beyti'},
        ],
      }),
      const SseMessage('recommendations', {
        'type': 'recommendations',
        'source': 'ai',
        'items': [
          {'name': 'Kuzu Tandır', 'reason': 'Ocakbaşılarda sık istenir', 'importance': 60, 'source': 'ai', 'templateId': null},
        ],
      }),
      const SseMessage('questions_append', {
        'type': 'questions_append',
        'items': [
          {'key': 'item:kuzu tandir', 'text': 'Kuzu Tandır var mı?', 'kind': 'missing_item', 'itemName': 'Kuzu Tandır', 'hints': <Object?>[]},
        ],
      }),
      const SseMessage('done', {
        'type': 'done',
        'status': 'completed',
        'stats': {'llmCalls': 3, 'latencyMs': 4200, 'screenshots': 2, 'extracted': 15, 'unique': 12, 'cacheHit': false},
      }),
    ];

List<GapEvent> sampleGapEvents() => sampleGapMessages().map((m) => GapEvent.fromSse(m.event, m.data)).nonNulls.toList();

class FakeGapApi extends ApiClient {
  FakeGapApi() : super(baseUrl: 'http://fake', tokens: MemoryTokenStore());

  Stream<GapEvent> Function()? stream;
  Future<GapResult?> Function()? latest;
  final List<String> branchIds = [];

  @override
  Stream<GapEvent> gapStream({
    required String branchId,
    required List<UploadImage> images,
    String? extraNotes,
    String? menuText,
    CancelToken? cancelToken,
  }) {
    branchIds.add(branchId);
    return stream!();
  }

  @override
  Future<GapResult?> latestGap(String branchId) => latest!();

  /// Branch menu as the server has it now; null → no connection.
  BranchMenu? menu;

  @override
  Future<BranchMenu> branchMenu(String branchId) async {
    final value = menu;
    if (value == null) throw const ApiException('NETWORK', 'offline');
    return value;
  }
}

void main() {
  group('gap models', () {
    test('parses every SSE event of the gap stream', () {
      final events = sampleGapEvents();
      expect(events.map((e) => e.runtimeType.toString()), [
        'GapRunEvent',
        'GapProgressEvent',
        'GapCountsEvent',
        'GapQuestionsEvent',
        'GapItemsEvent',
        'GapRecommendationsEvent',
        'GapRecommendationsEvent',
        'GapQuestionsEvent',
        'GapDoneEvent',
      ]);
      final items = (events[4] as GapItemsEvent).items;
      expect(items.first.missing.single.field, GapField.removables);
      expect(items[1].flags[GapField.removables], FieldState.unknown);
      expect(items[2].ok, isTrue);
      expect((events[7] as GapQuestionsEvent).append, isTrue);
      expect((events[6] as GapRecommendationsEvent).items.single.fromAi, isTrue);
      expect(GapEvent.fromSse('unknown', const {}), isNull);
    });

    test('typed products are kept apart from screenshot items and survive the offline copy', () {
      final typed = GapItem.fromJson(const {
        'name': 'Zıkkım Dürüm',
        'normalized': 'zikkim durum',
        'flags': {'description': 'unknown', 'options': 'unknown', 'removables': 'unknown'},
        'completeness': 0.5,
        'status': 'incomplete',
        'missing': <Object?>[],
        'seenIn': 0,
        'typed': true,
      });
      final items = [...(sampleGapEvents()[4] as GapItemsEvent).items, typed];
      final state = GapViewState(items: items, stats: GapStats.fromJson(const {'typed': 3, 'unique': 4}));
      expect(state.typedItems.map((i) => i.name), ['Zıkkım Dürüm']);
      expect(state.incompleteItems.map((i) => i.name), ['Adana Kebap', 'Tavuk Şiş']);
      expect(state.completeItems.map((i) => i.name), ['Kıymalı Pide']);
      expect(GapItem.fromJson(typed.toJson()).typed, isTrue);
      expect(GapStats.fromJson(state.stats!.toJson()).typed, 3);
      // Older snapshots have no "typed" field.
      expect(items.first.typed, isFalse);
      expect(const GapDraft(menuText: ' adana, urfa ').hasInput, isTrue);
      expect(const GapDraft(menuText: '  ').hasInput, isFalse);
    });

    test('a result survives a JSON round trip (offline copy)', () {
      const counts = GapCounts(current: 12, target: 14, missing: 2);
      final events = sampleGapEvents();
      final result = GapResult(
        runId: 'g1',
        branchId: 'b1',
        status: 'completed',
        counts: counts,
        items: (events[4] as GapItemsEvent).items,
        questions: (events[3] as GapQuestionsEvent).questions,
        recommendations: (events[5] as GapRecommendationsEvent).items,
      );
      final copy = GapResult.fromJson(result.toJson());
      expect(copy.counts?.current, 12);
      expect(copy.items.map((i) => i.name), ['Adana Kebap', 'Tavuk Şiş', 'Kıymalı Pide']);
      expect(copy.items[1].missing.map((m) => (m.field, m.state)), [
        (GapField.description, FieldState.absent),
        (GapField.removables, FieldState.unknown),
      ]);
      expect(copy.questions.map((q) => q.kind), [QuestionKind.missingItem, QuestionKind.missingField, QuestionKind.cuisine]);
      expect(counts.progress, closeTo(12 / 14, 1e-9));
      expect(const GapCounts(current: 20, target: 14, missing: 0).progress, 1);
    });
  });

  group('GapController', () {
    late AppDatabase db;
    late FakeGapApi api;
    late ProviderContainer container;

    setUp(() {
      db = AppDatabase(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
      api = FakeGapApi();
      container = ProviderContainer(
        overrides: [appDatabaseProvider.overrideWithValue(db), apiClientProvider.overrideWithValue(api)],
      );
    });

    tearDown(() async {
      await Future<void>.delayed(const Duration(milliseconds: 50));
      container.dispose();
      await db.close();
    });

    test('streams counts, the checklist and recommendations, then keeps an offline copy', () async {
      api.stream = () => Stream.fromIterable(sampleGapEvents());
      final sub = container.listen(gapControllerProvider, (_, _) {});
      await container.read(gapControllerProvider.notifier).start(const GapRequest(branch: kebapBranch, images: []));
      final state = container.read(gapControllerProvider);
      expect(state.phase, GapPhase.done);
      expect(state.counts?.missing, 2);
      expect(state.questions.map((q) => q.text).last, 'Kuzu Tandır var mı?');
      expect(state.recommendations.map((r) => r.name), ['Beyti Sarma', 'Kuzu Tandır']);
      expect(state.incompleteItems.map((i) => i.name), ['Adana Kebap', 'Tavuk Şiş']);
      expect(state.completeItems.single.name, 'Kıymalı Pide');
      expect(state.stats?.llmCalls, 3);
      expect(api.branchIds, ['b1']);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(await db.readKv(gapCacheKey('b1')), contains('Kuzu Tandır'));
      sub.close();
    });

    test('shows the saved copy when the server cannot be reached', () async {
      api.stream = () => Stream.fromIterable(sampleGapEvents());
      final sub = container.listen(gapControllerProvider, (_, _) {});
      final controller = container.read(gapControllerProvider.notifier);
      await controller.start(const GapRequest(branch: kebapBranch, images: []));
      await Future<void>.delayed(const Duration(milliseconds: 20));

      api.latest = () => Future<GapResult?>.error(const ApiException('NETWORK', 'offline'));
      await controller.load(kebapBranch);
      final state = container.read(gapControllerProvider);
      expect(state.offline, isTrue);
      expect(state.phase, GapPhase.done);
      expect(state.counts?.current, 12);
      expect(state.questions, hasLength(4));
      sub.close();
    });

    test('reports a branch without analyses', () async {
      api.latest = () async => null;
      final sub = container.listen(gapControllerProvider, (_, _) {});
      await container.read(gapControllerProvider.notifier).load(kebapBranch);
      expect(container.read(gapControllerProvider).phase, GapPhase.empty);
      sub.close();
    });

    test('a card accepted during the call moves the count, marks the product and ticks its question', () async {
      api.stream = () => Stream.fromIterable(sampleGapEvents());
      final sub = container.listen(gapControllerProvider, (_, _) {});
      final controller = container.read(gapControllerProvider.notifier);
      await controller.start(const GapRequest(branch: kebapBranch, images: []));
      expect(container.read(gapControllerProvider).isOnMenu('Beyti Sarma', 't-beyti'), isFalse);

      // Offline: nothing changes, no error.
      await controller.syncBranchMenu();
      expect(container.read(gapControllerProvider).counts?.current, 12);

      api.menu = const BranchMenu(
        branch: Branch(id: 'b1', name: 'Kadıköy Ocakbaşı', cuisineId: 'k1', cuisineName: 'Kebap & Izgara', effectiveTarget: 14, currentItemCount: 13),
        items: [
          BranchMenuItem(id: 'm1', name: 'Beyti Sarma', status: MenuItemStatus.ok, source: 'card', matchedTemplateId: 't-beyti'),
          BranchMenuItem(id: 'm2', name: 'Kuzu Tandır', status: MenuItemStatus.missing, source: 'recommendation'),
        ],
      );
      await controller.syncBranchMenu();
      final state = container.read(gapControllerProvider);
      expect(state.counts?.current, 13);
      expect(state.counts?.missing, 1);
      expect(state.isOnMenu('Beyti Sarma', 't-beyti'), isTrue);
      expect(state.isOnMenu('BEYTİ SARMA', null), isTrue);
      expect(state.isOnMenu('Kuzu Tandır', null), isFalse, reason: 'still only recommended');
      final ticked = await db.watchChecked(checklistId('b1')).first;
      expect(ticked, {'item:beyti sarma'});
      sub.close();
    });

    test('checklist ticks are stored per branch', () async {
      final ticks = <Set<String>>[];
      final sub = container.listen(checkedQuestionsProvider('b1'), (_, next) {
        final value = next.value;
        if (value != null) ticks.add(value);
      });
      await db.setChecked(checklistId('b1'), 'item:beyti sarma', true);
      await db.setChecked(checklistId('b2'), 'item:ayran', true);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(ticks.last, {'item:beyti sarma'});
      await db.clearChecked(checklistId('b1'));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(ticks.last, isEmpty);
      sub.close();
    });
  });
}
