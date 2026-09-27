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
import 'package:menu_kopilot/core/utils/file_sharer.dart';
import 'package:menu_kopilot/data/models/analysis.dart';
import 'package:menu_kopilot/data/models/json.dart';
import 'package:menu_kopilot/data/models/template_payload.dart';
import 'package:menu_kopilot/features/results/office_screen.dart';
import 'package:menu_kopilot/l10n/gen/app_localizations.dart';

const runId = '33333333-3333-3333-3333-333333333333';

/// After the call (D-196): the seller said "Evet" to a soup (as the chips were left) and to a packaged drink, will
/// think about the pide's options, and said "Hayır" to künefe.
Json call({bool answered = true}) => {
      'runId': runId,
      'status': 'completed',
      'counts': {
        'current': 5,
        'target': 10,
        'missing': 5,
        'hardMinimum': 10,
        'cuisineMin': 10,
        'cuisineName': 'Pide & Lahmacun',
        'cuisineId': 'c1',
      },
      'cards': [
        {
          'id': 'card-soup',
          'runId': runId,
          'section': 'new_product',
          'name': 'Mercimek Çorbası',
          'source': 'db',
          'categoryKey': 'corba',
          'categoryLabel': 'Çorba',
          'pitch': 'Menünüzde hiç çorba yok; Pide & Lahmacun menülerinin çoğunda var.',
          'status': answered ? 'accepted' : 'pending',
          'sortOrder': 0,
          // What the seller agreed to: half portions and the chili flakes were left out on the call.
          'payload': {
            'name': 'Mercimek Çorbası',
            'description': 'Kırmızı mercimek, tereyağlı sosla sıcak servis edilir.',
            'optionGroups': [
              {
                'name': 'Porsiyon',
                'selectionType': 'single',
                'isRequired': true,
                'minSelect': 1,
                'maxSelect': 1,
                'options': [
                  {'name': 'Tam', 'priceMode': 'sets_base'},
                  {'name': 'Büyük', 'priceMode': 'sets_base'},
                ],
              },
            ],
            'removableIngredients': ['Tereyağlı Sos'],
            'extraIngredients': [
              {'name': 'Ekstra Limon'},
            ],
          },
        },
        {
          'id': 'card-ayran',
          'runId': runId,
          'section': 'new_product',
          'name': 'Ayran',
          'source': 'db',
          'categoryKey': 'icecek',
          'categoryLabel': 'İçecek',
          'status': answered ? 'accepted' : 'pending',
          'sortOrder': 1,
          'payload': {'name': 'Ayran', 'description': ''},
        },
        {
          'id': 'card-kunefe',
          'runId': runId,
          'section': 'new_product',
          'name': 'Künefe',
          'source': 'db',
          'categoryKey': 'tatli',
          'status': answered ? 'skipped' : 'pending',
          'sortOrder': 2,
          'payload': {'name': 'Künefe', 'description': 'Kadayıf, peynir, şerbet.'},
        },
        {
          'id': 'card-pide',
          'runId': runId,
          'section': 'option',
          'name': 'Kıymalı Pide',
          'targetName': 'Kıymalı Pide',
          'source': 'ai',
          'shortDescription': 'Taş fırında pişen kıymalı tekne pide.',
          'pitch': 'Boy seçeneğiyle farklı fiyatlardan satılır.',
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
          'status': answered ? 'later' : 'pending',
          'sortOrder': 3,
        },
        {
          'id': 'card-fix',
          'runId': runId,
          'section': 'fix',
          'name': 'Karışık Pide',
          'targetName': 'Karışık Pd',
          'source': 'review',
          'fixKind': 'bad_name',
          'suggestedValue': 'Karışık Pide',
          'status': 'pending',
          'sortOrder': 4,
        },
      ],
    };

class FakeApi extends ApiClient {
  FakeApi() : super(baseUrl: 'http://fake', tokens: MemoryTokenStore());

  Json payload = call();
  final List<String> accepted = [];

  @override
  Future<AnalysisResult> analysis(String runId) async => AnalysisResult.fromJson(payload);

  @override
  Future<AnalysisCard> accept(String itemId, {TemplatePayload? payload}) async {
    accepted.add(itemId);
    final card = AnalysisResult.fromJson(this.payload).cards.firstWhere((c) => c.id == itemId);
    return card.copyWith(status: CardStatus.accepted);
  }
}

class FakeSharer implements FileSharer {
  final List<String> messages = [];

  @override
  Future<void> shareMessage(String text) async => messages.add(text);

  @override
  Future<void> shareText({required String fileName, required String content, required String mimeType, String? subject}) async {}
}

void main() {
  late AppDatabase db;
  late FakeApi api;
  late FakeSharer sharer;

  setUp(() {
    db = AppDatabase(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    api = FakeApi();
    sharer = FakeSharer();
  });

  tearDown(() => db.close());

  List<Override> overrides() => [
        appDatabaseProvider.overrideWithValue(db),
        apiClientProvider.overrideWithValue(api),
        fileSharerProvider.overrideWithValue(sharer),
      ];

  Future<void> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(412 * 3, 2400 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides(),
        child: const MaterialApp(
          locale: Locale('tr'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: OfficeScreen(runId: runId),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Finder inItem(String cardId, String text) => find.descendant(of: find.byKey(ValueKey('office-item-$cardId')), matching: find.text(text));

  group('OfficeScreen ("Ofiste girilecekler")', () {
    testWidgets('what the seller said yes to, with every section to enter, and what they will think about', (tester) async {
      await open(tester);
      expect(find.text('Ofiste girilecekler'), findsOneWidget);
      expect(find.text('Satıcı evet dedi (2)'), findsOneWidget);
      expect(find.text('0/2 panele girildi'), findsOneWidget);
      // The soup as the seller agreed to it.
      expect(inItem('card-soup', 'Mercimek Çorbası'), findsOneWidget);
      expect(inItem('card-soup', 'Porsiyon: Tam · tabanı belirler, Büyük · tabanı belirler'), findsOneWidget);
      expect(inItem('card-soup', 'Tereyağlı Sos'), findsOneWidget);
      expect(inItem('card-soup', 'Ekstra Limon'), findsOneWidget);
      expect(inItem('card-soup', 'Kırmızı mercimek, tereyağlı sosla sıcak servis edilir.'), findsOneWidget);
      // A packaged drink is its name.
      expect(inItem('card-ayran', 'Hazır içecek: açıklama ve opsiyon gerekmez, adıyla eklenir.'), findsOneWidget);
      // "Düşünecek", with what to say when calling back.
      expect(find.text('Düşünecek (1)'), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('office-later-card-pide')), matching: find.text('Boy seçeneğiyle farklı fiyatlardan satılır.')), findsOneWidget);
      // "Hayır" and the notes are not office work.
      expect(find.text('Künefe'), findsNothing);
      expect(find.text('Karışık Pide'), findsNothing);
    });

    testWidgets('"Panele girildi" ticks stay on the phone and count up', (tester) async {
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('office-entered-card-soup')));
      await tester.pumpAndSettle();
      expect(find.text('1/2 panele girildi'), findsOneWidget);
      // Straight from the phone's database, outside the test's fake clock.
      expect(await tester.runAsync(() => db.watchChecked('office:$runId').first), {'card-soup'});

      await tester.tap(find.byKey(const ValueKey('office-entered-card-ayran')));
      await tester.pumpAndSettle();
      expect(find.text('2/2 panele girildi'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('office-entered-card-soup')));
      await tester.pumpAndSettle();
      expect(find.text('1/2 panele girildi'), findsOneWidget);
    });

    testWidgets('a follow-up the seller agreed to later moves to the yes list', (tester) async {
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('office-yes-card-pide')));
      await tester.pumpAndSettle();
      expect(api.accepted, ['card-pide']);
      expect(find.text('Satıcı evet dedi (3)'), findsOneWidget);
      expect(find.text('Düşünecek (1)'), findsNothing);
      expect(inItem('card-pide', 'Boy: Tek Kişilik · tabanı belirler, Çift Kişilik · tabanı belirler'), findsOneWidget);
    });

    testWidgets('"Satıcıya gönder": a plain message of what was agreed and what is left to think about', (tester) async {
      await open(tester);
      await tester.tap(find.byKey(const Key('office-share')));
      await tester.pumpAndSettle();
      expect(sharer.messages, [
        'Merhaba, görüşmemizde menünüze eklemeyi konuştuğumuz ürünler:\n'
            '• Mercimek Çorbası\n'
            '• Ayran\n'
            '\n'
            'Düşünmek istediğiniz ürünler:\n'
            '• Kıymalı Pide (opsiyonlar, çıkarılabilir malzemeler, açıklama)',
      ]);
    });

    testWidgets('the call note is kept on the phone, for this analysis', (tester) async {
      await open(tester);
      await tester.enterText(find.byKey(const Key('office-note')), 'Fiyatları yarın mesajla iletecek.');
      await tester.pump(const Duration(milliseconds: 500));
      expect(await tester.runAsync(() => db.readKv('call_note:$runId')), 'Fiyatları yarın mesajla iletecek.');

      // Closed and opened again: the note is back.
      await tester.pumpWidget(const SizedBox());
      await open(tester);
      expect(find.text('Fiyatları yarın mesajla iletecek.'), findsOneWidget);
    });

    testWidgets('before any answer it says how the list fills', (tester) async {
      api.payload = call(answered: false);
      await open(tester);
      expect(find.textContaining('Henüz satıcının evet dediği'), findsOneWidget);
      expect(find.byKey(const Key('office-share')), findsNothing);
    });
  });
}
