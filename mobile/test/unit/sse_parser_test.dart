import 'package:flutter_test/flutter_test.dart';
import 'package:menu_kopilot/core/network/sse.dart';
import 'package:menu_kopilot/data/models/suggestion.dart';

void main() {
  group('SseParser', () {
    test('parses messages split across arbitrary chunks and ignores heartbeats', () {
      final parser = SseParser();
      final messages = <SseMessage>[
        ...parser.add(': connected\n\nid: 1\nevent: run\nda'),
        ...parser.add('ta: {"type":"run","runId":"r1","resumed":false}\n\n: ping\n\n'),
        ...parser.add('id: 2\r\nevent: progress\r\ndata: {"type":"progress","stage":"extract","message":"okunuyor"}\r\n\r\n'),
      ];
      expect(messages.map((m) => m.event), ['run', 'progress']);
      expect(messages.first.data['runId'], 'r1');
      expect(messages.last.data['message'], 'okunuyor');
    });

    test('keeps incomplete blocks until the terminator arrives', () {
      final parser = SseParser();
      expect(parser.add('event: done\ndata: {"status":"completed"}'), isEmpty);
      final done = parser.add('\n\n');
      expect(done.single.event, 'done');
    });

    test('maps SSE messages to typed events', () {
      final parser = SseParser();
      final raw = [
        'event: item',
        'data: {"type":"item","card":{"id":"c1","runId":"r1","rawName":"adana","origin":"seed","status":"pending",'
            '"sortOrder":0,"needsReview":false,"payload":{"name":"Adana Kebap","description":"Acılı kıyma",'
            '"optionGroups":[{"name":"Porsiyon","selectionType":"single","isRequired":true,"minSelect":1,"maxSelect":1,'
            '"options":[{"name":"1 Porsiyon","priceMode":"sets_base","isDefault":true}]}]}}}',
        '',
        'event: budget_exhausted',
        'data: {"pendingItems":3,"pendingImageHashes":["abc"],"message":"bütçe"}',
        '',
        'event: done',
        'data: {"status":"completed","stats":{"llmCalls":2,"dbHits":12,"aiItems":3,"cacheHit":false}}',
        '',
        '',
      ].join('\n');
      final events = parser.add(raw).map((m) => SuggestEvent.fromSse(m.event, m.data)).toList();
      final item = events[0]! as ItemEvent;
      expect(item.card.origin, CardOrigin.seed);
      expect(item.card.payload.optionGroups.single.setsBase, isTrue);
      final budget = events[1]! as BudgetExhaustedEvent;
      expect(budget.pendingImageHashes, ['abc']);
      final done = events[2]! as DoneEvent;
      expect(done.stats?.dbHits, 12);
    });
  });
}
