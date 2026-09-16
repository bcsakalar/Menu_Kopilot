import 'dart:async';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show DatabaseConnection;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:menu_kopilot/core/network/api_client.dart';
import 'package:menu_kopilot/core/network/api_exception.dart';
import 'package:menu_kopilot/core/providers.dart';
import 'package:menu_kopilot/core/storage/app_database.dart';
import 'package:menu_kopilot/core/storage/token_store.dart';
import 'package:menu_kopilot/data/models/suggestion.dart';
import 'package:menu_kopilot/data/models/template_payload.dart';
import 'package:menu_kopilot/features/offline/background.dart';
import 'package:menu_kopilot/features/offline/pending_queue.dart';
import 'package:menu_kopilot/features/results/run_controller.dart';

SuggestionCard card(String id, String name, CardOrigin origin, int order) => SuggestionCard(
      id: id,
      runId: 'run-1',
      rawName: name,
      origin: origin,
      sortOrder: order,
      payload: TemplatePayload(name: name, description: '$name açıklaması'),
    );

class FakeApi extends ApiClient {
  FakeApi() : super(baseUrl: 'http://fake', tokens: MemoryTokenStore());

  Stream<SuggestEvent> Function()? stream;
  ApiException? acceptError;
  final List<String> acceptedIds = [];
  final List<SuggestRequestData> asyncRequests = [];

  @override
  Stream<SuggestEvent> suggestStream(SuggestRequestData request, {CancelToken? cancelToken}) => stream!();

  @override
  Future<({SuggestionCard card, String templateId})> accept(String itemId, {TemplatePayload? payload, String? branchId}) async {
    final error = acceptError;
    if (error != null) throw error;
    acceptedIds.add(itemId);
    return (card: card(itemId, payload?.name ?? 'x', CardOrigin.db, 0).copyWith(status: CardStatus.accepted), templateId: 't1');
  }

  @override
  Future<String> suggestAsync(SuggestRequestData request) async {
    asyncRequests.add(request);
    return 'run-queued';
  }
}

void main() {
  late AppDatabase db;
  late FakeApi api;
  late ProviderContainer container;

  setUp(() {
    db = AppDatabase(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    api = FakeApi();
    container = ProviderContainer(
      overrides: [
        appDatabaseProvider.overrideWithValue(db),
        apiClientProvider.overrideWithValue(api),
        // No documents folder in unit tests: queued photos stay where they are.
        pendingQueueProvider.overrideWithValue(PendingQueue(db)),
      ],
    );
  });

  tearDown(() async {
    // Let fire-and-forget history writes finish before the in-memory database goes away.
    await Future<void>.delayed(const Duration(milliseconds: 50));
    container.dispose();
    await db.close();
  });

  const request = RunRequest(
    cuisineName: 'Kebap & Izgara',
    data: SuggestRequestData(cuisineId: 'k1', promptText: 'adana, humus'),
  );

  test('streams cards in order, replaces placeholders and stores the run for offline reading', () async {
    api.stream = () => Stream.fromIterable([
          const RunStartedEvent('run-1'),
          const ExtractedEvent(['Adana', 'Humus']),
          ItemEvent(card('c1', 'Adana', CardOrigin.seed, 0)),
          const ProgressEvent('enrich', 'Kartlar hazırlanıyor', 0, 1),
          ItemEvent(card('c2', 'Humus', CardOrigin.ai, 1)),
          const DoneEvent('completed', RunStats(dbHits: 1, aiItems: 1, llmCalls: 1)),
        ]);
    final sub = container.listen(runControllerProvider(runSlotSuggest), (_, _) {});
    await container.read(runControllerProvider(runSlotSuggest).notifier).start(request);
    final state = container.read(runControllerProvider(runSlotSuggest));
    expect(state.phase, RunPhase.done);
    expect(state.cards.map((c) => c.payload.name), ['Adana', 'Humus']);
    expect(state.placeholders, isEmpty);
    expect(state.stats?.dbHits, 1);
    final saved = await db.recentRun('run-1');
    expect(saved?.cardCount, 2);
    expect(saved?.status, 'completed');
    sub.close();
  });

  test('queues the request offline when the server is unreachable before the run starts', () async {
    api.stream = () => Stream<SuggestEvent>.error(const ApiException('NETWORK', 'offline'));
    final sub = container.listen(runControllerProvider(runSlotSuggest), (_, _) {});
    await container.read(runControllerProvider(runSlotSuggest).notifier).start(request);
    expect(container.read(runControllerProvider(runSlotSuggest)).phase, RunPhase.queued);
    expect(await db.queuedRequests(), hasLength(1));

    final sent = await PendingQueue(db).flush(api);
    expect(sent, 1);
    expect(api.asyncRequests.single.promptText, 'adana, humus');
    expect(await db.queuedRequests(), isEmpty);
    expect((await db.recentRun('run-queued'))?.status, 'running');
    sub.close();
  });

  test('edited cards are sent with their payload; offline accepts are queued', () async {
    api.stream = () => Stream.fromIterable([
          const RunStartedEvent('run-1'),
          ItemEvent(card('c1', 'Humus', CardOrigin.ai, 0)),
          const DoneEvent('completed', null),
        ]);
    final sub = container.listen(runControllerProvider(runSlotSuggest), (_, _) {});
    final controller = container.read(runControllerProvider(runSlotSuggest).notifier);
    await controller.start(request);

    final current = container.read(runControllerProvider(runSlotSuggest)).cards.single;
    controller.updatePayload('c1', current.payload.copyWith(description: 'Nohut, tahin ve limonla ezilir.'));
    expect(container.read(runControllerProvider(runSlotSuggest)).cards.single.edited, isTrue);

    api.acceptError = const ApiException('NETWORK', 'offline');
    expect(await controller.accept('c1'), isNull);
    final queuedCard = container.read(runControllerProvider(runSlotSuggest)).cards.single;
    expect(queuedCard.status, CardStatus.accepted);
    expect(queuedCard.queued, isTrue);
    final pending = await db.queuedRequests();
    expect(pending.single.kind, 'accept');
    expect(pending.single.payloadJson, contains('Nohut, tahin'));

    api.acceptError = null;
    await PendingQueue(db).flush(api);
    expect(api.acceptedIds, ['c1']);
    sub.close();
  });

  test('refuses to accept an empty card', () async {
    api.stream = () => Stream.fromIterable([
          const RunStartedEvent('run-1'),
          ItemEvent(SuggestionCard(
            id: 'c9',
            runId: 'run-1',
            rawName: 'Zıkkım',
            origin: CardOrigin.review,
            payload: const TemplatePayload(name: 'Zıkkım'),
          )),
          const DoneEvent('completed', null),
        ]);
    final sub = container.listen(runControllerProvider(runSlotSuggest), (_, _) {});
    final controller = container.read(runControllerProvider(runSlotSuggest).notifier);
    await controller.start(request);
    expect(await controller.accept('c9'), isA<CardNeedsContent>());
    expect(api.acceptedIds, isEmpty);
    sub.close();
  });
}
