import 'dart:io';

import 'package:drift/drift.dart' show DatabaseConnection;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:menu_kopilot/core/network/api_client.dart';
import 'package:menu_kopilot/core/network/api_exception.dart';
import 'package:menu_kopilot/core/providers.dart';
import 'package:menu_kopilot/core/storage/app_database.dart';
import 'package:menu_kopilot/core/storage/token_store.dart';
import 'package:menu_kopilot/data/models/branch.dart';
import 'package:menu_kopilot/data/models/voice_research.dart';
import 'package:menu_kopilot/features/research/research_controller.dart';
import 'package:menu_kopilot/features/research/research_screen.dart';
import 'package:menu_kopilot/features/voice/voice_note_button.dart';
import 'package:menu_kopilot/features/voice/voice_recorder.dart';
import 'package:menu_kopilot/l10n/gen/app_localizations.dart';

class FakeRecorder implements VoiceRecorder {
  bool permission = true;
  final List<String> events = [];
  String? path;

  @override
  Future<bool> hasPermission() async => permission;

  @override
  Future<void> start(String path) async {
    this.path = path;
    File(path).writeAsBytesSync([1, 2, 3]);
    events.add('start');
  }

  @override
  Future<String?> stop() async {
    events.add('stop');
    return path;
  }

  @override
  Future<void> cancel() async => events.add('cancel');

  @override
  Future<void> dispose() async {}
}

const branch = Branch(id: 'b1', name: 'Karşıyaka Kebapçısı', cuisineId: 'k1', cuisineName: 'Kebap & Izgara', city: 'İzmir');

final researchJson = <String, Object?>{
  'restaurantName': 'Karşıyaka Kebapçısı',
  'city': 'İzmir',
  'found': true,
  'summary': 'Ocakbaşı kebapçı; Adana ve Beyti öne çıkıyor.',
  'cuisine': 'Kebap & Izgara',
  'confidence': 0.86,
  'items': [
    {'name': 'Adana Kebap', 'section': 'Kebaplar', 'matchedTemplateId': 't1', 'templateName': 'Adana Kebap', 'onMenu': true},
    {'name': 'Beyti Sarma', 'section': 'Kebaplar', 'matchedTemplateId': 't2', 'templateName': 'Beyti Sarma', 'onMenu': false},
    {'name': 'Kuzu Tandır', 'section': null, 'matchedTemplateId': null, 'templateName': null, 'onMenu': false},
  ],
  'sources': [
    {'title': 'Menü', 'url': 'https://ornek-kebapci.example/menu'},
  ],
  'cached': false,
  'researchedAt': '2026-09-15T10:00:00Z',
};

class FakeApi extends ApiClient {
  FakeApi() : super(baseUrl: 'http://fake', tokens: MemoryTokenStore());

  ApiException? transcribeError;
  final List<String?> transcribedCuisines = [];
  int researchCalls = 0;

  @override
  Future<Transcription> transcribe(String path, {String language = 'tr', String? cuisineId}) async {
    transcribedCuisines.add(cuisineId);
    final error = transcribeError;
    if (error != null) throw error;
    return const Transcription(text: 'Adana kebap, lahmacun', items: ['Adana kebap', 'lahmacun']);
  }

  @override
  Future<List<Branch>> branches() async => const [branch];

  @override
  Future<ResearchResult> research({String? branchId, String? restaurantName, String? city, bool refresh = false}) async {
    researchCalls += 1;
    return ResearchResult.fromJson(researchJson);
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
        home: Scaffold(body: child),
      ),
    );

void main() {
  late AppDatabase db;
  late FakeApi api;
  late FakeRecorder recorder;
  late Directory temp;

  setUp(() {
    db = AppDatabase(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    api = FakeApi();
    recorder = FakeRecorder();
    temp = Directory.systemTemp.createTempSync('voice-test');
  });

  tearDown(() async {
    await db.close();
    if (temp.existsSync()) temp.deleteSync(recursive: true);
  });

  List<Override> overrides() => [
        appDatabaseProvider.overrideWithValue(db),
        apiClientProvider.overrideWithValue(api),
        voiceRecorderProvider.overrideWithValue(recorder),
        voiceNotePathProvider.overrideWithValue(() async => '${temp.path}/note.m4a'),
      ];

  group('VoiceNoteButton', () {
    testWidgets('records, sends and hands back the product names; the file is deleted', (tester) async {
      Transcription? received;
      await tester.pumpWidget(host(overrides(), VoiceNoteButton(cuisineId: 'k1', onText: (t) => received = t)));
      await tester.tap(find.byKey(const Key('voice-note')));
      await tester.pump();
      expect(find.text('Bitir (0:00)'), findsOneWidget);
      await tester.pump(const Duration(seconds: 2));
      expect(find.text('Bitir (0:02)'), findsOneWidget);

      await tester.tap(find.byKey(const Key('voice-stop')));
      await tester.pumpAndSettle();
      expect(recorder.events, ['start', 'stop']);
      expect(received?.items, ['Adana kebap', 'lahmacun']);
      expect(api.transcribedCuisines, ['k1']);
      expect(File('${temp.path}/note.m4a').existsSync(), isFalse);
      expect(find.byKey(const Key('voice-note')), findsOneWidget);
    });

    testWidgets('stops by itself at the maximum length', (tester) async {
      var calls = 0;
      await tester.pumpWidget(host(overrides(), VoiceNoteButton(maxDuration: const Duration(seconds: 3), onText: (_) => calls++)));
      await tester.tap(find.byKey(const Key('voice-note')));
      await tester.pump();
      await tester.pump(const Duration(seconds: 3));
      await tester.pumpAndSettle();
      expect(recorder.events, ['start', 'stop']);
      expect(calls, 1);
    });

    testWidgets('explains a missing permission and a missing connection', (tester) async {
      recorder.permission = false;
      await tester.pumpWidget(host(overrides(), VoiceNoteButton(onText: (_) {})));
      await tester.tap(find.byKey(const Key('voice-note')));
      await tester.pump();
      expect(find.text('Sesli not için mikrofon izni gerekli'), findsOneWidget);

      recorder.permission = true;
      api.transcribeError = const ApiException('NETWORK', 'offline');
      await tester.tap(find.byKey(const Key('voice-note')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('voice-stop')));
      await tester.pumpAndSettle();
      expect(find.text('Sesli not için internet bağlantısı gerekli'), findsOneWidget);
    });
  });

  group('ResearchScreen', () {
    testWidgets('shows what is not on the menu yet, opens sources and keeps a copy on the phone', (tester) async {
      final opened = <Uri>[];
      await tester.pumpWidget(
        host([
          ...overrides(),
          linkOpenerProvider.overrideWithValue((uri) async {
            opened.add(uri);
            return true;
          }),
        ], const ResearchScreen(branchId: 'b1')),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('research-start')));
      await tester.pumpAndSettle();

      expect(api.researchCalls, 1);
      expect(find.text('İnternette 3 ürün bulundu'), findsOneWidget);
      expect(find.text('Menüde olmayanlar (2)'), findsOneWidget);
      expect(find.text('Beyti Sarma'), findsOneWidget);
      expect(find.text('Kuzu Tandır'), findsOneWidget);
      expect(find.text('Menüde olanlar (1)'), findsOneWidget);
      expect(find.text('2 ürün için kart hazırla'), findsOneWidget);

      await tester.scrollUntilVisible(find.text('ornek-kebapci.example'), 200);
      await tester.tap(find.text('ornek-kebapci.example'));
      await tester.pump();
      expect(opened.single.toString(), 'https://ornek-kebapci.example/menu');

      final saved = await tester.runAsync(() => db.readKv(researchCacheKey('b1')));
      expect(saved, contains('Kuzu Tandır'));
    });
  });
}
