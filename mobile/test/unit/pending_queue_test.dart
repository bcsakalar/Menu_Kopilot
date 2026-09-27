import 'dart:convert';

import 'package:drift/drift.dart' show DatabaseConnection;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:menu_kopilot/core/network/api_client.dart';
import 'package:menu_kopilot/core/storage/app_database.dart';
import 'package:menu_kopilot/core/storage/token_store.dart';
import 'package:menu_kopilot/data/models/analysis.dart';
import 'package:menu_kopilot/data/models/template_payload.dart';
import 'package:menu_kopilot/features/offline/pending_queue.dart';

class FakeQueueApi extends ApiClient {
  FakeQueueApi() : super(baseUrl: 'http://fake', tokens: MemoryTokenStore());

  final List<AnalyzeRequestData> analyzed = [];
  final List<String> answers = [];

  @override
  Future<String> analyzeAsync(AnalyzeRequestData request) async {
    analyzed.add(request);
    return 'run-${analyzed.length}';
  }

  AnalysisCard _card(String id, CardStatus status) =>
      AnalysisCard.fromJson({'id': id, 'runId': 'r', 'section': 'new_product', 'name': id}).copyWith(status: status);

  @override
  Future<AnalysisCard> accept(String itemId, {TemplatePayload? payload}) async {
    answers.add('evet:$itemId:${payload?.name ?? '-'}');
    return _card(itemId, CardStatus.accepted);
  }

  @override
  Future<AnalysisCard> skip(String itemId) async {
    answers.add('hayır:$itemId');
    return _card(itemId, CardStatus.skipped);
  }

  @override
  Future<AnalysisCard> later(String itemId) async {
    answers.add('düşünecek:$itemId');
    return _card(itemId, CardStatus.later);
  }
}

void main() {
  late AppDatabase db;
  late FakeQueueApi api;
  late PendingQueue queue;

  setUp(() {
    db = AppDatabase(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    api = FakeQueueApi();
    queue = PendingQueue(db);
  });

  tearDown(() => db.close());

  Future<void> insertRaw(String kind, Map<String, Object?> payload) => db.into(db.pendingRequests).insert(
        PendingRequestsCompanion.insert(id: 'raw-$kind', kind: kind, payloadJson: jsonEncode(payload), createdAt: DateTime.now()),
      );

  test('a re-run queued offline keeps the run it starts from', () async {
    await queue.enqueueAnalyze(const AnalyzeRequestData(cuisineId: 'c2', fromRunId: 'run-0'), cuisineName: 'Kebap & Izgara');
    expect(await queue.flush(api), 1);
    expect(api.analyzed.single.fromRunId, 'run-0');
    expect(api.analyzed.single.cuisineId, 'c2');
    final recent = await db.recentRun('run-1');
    expect(recent?.cuisineName, 'Kebap & Izgara');
  });

  test('a request queued offline keeps the mode the user chose', () async {
    // The choice is part of the request, not a device setting: an analysis sent from the tunnel must come back
    // as the same kind of analysis it would have been on the spot.
    await queue.enqueueAnalyze(
      const AnalyzeRequestData(cuisineId: 'c1', menuText: 'Adana Kebap', mode: AnalysisMode.quick),
      cuisineName: 'Kebap & Izgara',
    );
    expect(await queue.flush(api), 1);
    expect(api.analyzed.single.mode, AnalysisMode.quick);
  });

  test('sends a request queued by the old "Öneri" screen as an analysis of its product list', () async {
    await insertRaw('suggest', {'cuisineId': 'c1', 'promptText': 'adana, lahmacun', 'images': <Object?>[], 'cuisineName': 'Kebap'});
    expect(await queue.flush(api), 1);
    expect(api.analyzed.single.menuText, 'adana, lahmacun');
    expect(api.analyzed.single.cuisineId, 'c1');
  });

  test('an answer changed offline reaches the server as the phone shows it: only the last one is sent (D-196)', () async {
    await queue.enqueueLater('soup');
    await queue.enqueueSkip('ayran');
    await queue.enqueueAccept('soup', payload: const TemplatePayload(name: 'Mercimek Çorbası'));
    expect(await queue.flush(api), 2);
    expect(api.answers, ['hayır:ayran', 'evet:soup:Mercimek Çorbası']);
  });

  test('never reports a kind it cannot send as sent', () async {
    await insertRaw('gap', {'branchId': 'b1'});
    expect(await queue.flush(api), 0);
    expect(api.analyzed, isEmpty);
    final rows = await db.select(db.pendingRequests).get();
    expect(rows.single.status, 'failed');
    // Failed rows leave the queue: the next flush does not retry them.
    expect(await db.queuedRequests(), isEmpty);
  });
}
