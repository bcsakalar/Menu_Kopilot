import 'package:flutter_test/flutter_test.dart';
import 'package:menu_kopilot/core/network/sse.dart';
import 'package:menu_kopilot/data/models/analysis.dart';

void main() {
  group('SseParser', () {
    test('parses messages split across arbitrary chunks and ignores heartbeats', () {
      final parser = SseParser();
      final messages = <SseMessage>[
        ...parser.add(': connected\n\nid: 1\nevent: run\nda'),
        ...parser.add('ta: {"type":"run","runId":"r1"}\n\n: ping\n\n'),
        ...parser.add('id: 2\r\nevent: progress\r\ndata: {"type":"progress","agent":"extractor","message":"okunuyor"}\r\n\r\n'),
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

    test('maps SSE messages to typed analysis events', () {
      final parser = SseParser();
      final raw = [
        'event: counts',
        'data: {"type":"counts","counts":{"current":5,"target":10,"missing":5,"hardMinimum":10,"cuisineMin":10,'
            '"cuisineName":"Pide & Lahmacun","cuisineId":"c1","categories":['
            '{"key":"icecek","label":"İçecek","present":0,"minItems":2,"missing":2},'
            '{"key":"ana-yemek","label":"Ana Yemek","present":5,"minItems":6,"missing":1}]}}',
        '',
        'event: item',
        'data: {"type":"item","card":{"id":"c1","runId":"r1","section":"new_product","name":"Ayran",'
            '"source":"db","categoryKey":"icecek","categoryLabel":"İçecek","shortDescription":"Taze yoğurttan ayran.",'
            '"priceRangeHint":"25–40 TL","reason":"İçecek kategorisi boş","status":"pending","sortOrder":0,'
            '"payload":{"name":"Ayran","description":"Taze yoğurttan ayran."}}}',
        '',
        'event: trace',
        'data: {"type":"trace","step":{"seq":3,"agent":"gap_analyst","status":"ok","durationMs":2,"llmCalls":0}}',
        '',
        'event: done',
        'data: {"type":"done","status":"completed","stats":{"llmCalls":2,"menuItems":5,"newProducts":6,'
            '"optionCards":5,"fixCards":0,"dropped":0,"cacheHit":false,"latencyMs":3400}}',
        '',
        '',
      ].join('\n');
      final events = parser.add(raw).map((m) => AnalyzeEvent.fromSse(m.event, m.data)).toList();

      final counts = (events[0]! as CountsEvent).counts;
      expect(counts.current, 5);
      expect(counts.meetsHardMinimum, isFalse);
      // The header shows only what is actually short, emptiest first.
      expect(counts.openCategories.map((c) => c.key), ['icecek', 'ana-yemek']);

      final card = (events[1]! as CardEvent).card;
      expect(card.section, CardSection.newProduct);
      expect(card.categoryLabel, 'İçecek');
      expect(card.priceRangeHint, '25–40 TL');
      expect(card.payload?.name, 'Ayran');

      final step = (events[2]! as TraceEvent).step;
      expect(step.agent, 'gap_analyst');
      expect(step.llmCalls, 0);

      final done = events[3]! as DoneEvent;
      expect(done.stats?.newProducts, 6);
      expect(done.stats?.llmCalls, 2);
    });

    test('ignores event names the app does not know', () {
      expect(AnalyzeEvent.fromSse('something_new', const {}), isNull);
    });
  });
}
