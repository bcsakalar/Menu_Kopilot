import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:menu_kopilot/core/network/api_client.dart';
import 'package:menu_kopilot/core/providers.dart';
import 'package:menu_kopilot/core/storage/token_store.dart';
import 'package:menu_kopilot/data/models/history.dart';
import 'package:menu_kopilot/features/settings/learning_screen.dart';
import 'package:menu_kopilot/l10n/gen/app_localizations.dart';

/// What the calls taught: one product sellers said "Hayır" to in pizzerias, one extra the team deleted on pides.
class FakeLearningApi extends ApiClient {
  FakeLearningApi() : super(baseUrl: 'http://fake', tokens: MemoryTokenStore());

  final forgotten = <String>[];

  @override
  Future<LearningResult> learning() async => LearningResult(
        products: [
          if (!forgotten.contains('product:Künefe'))
            LearnedProduct(
              cuisineId: 'c-pizza',
              cuisineName: 'Pizza',
              name: 'Künefe',
              removed: 4,
              accepted: 0,
              lastAt: DateTime(2026, 9, 25, 14, 32),
            ),
        ],
        suggestions: [
          if (!forgotten.contains('extra:Ekstra Mısır'))
            LearnedSuggestion(
              productType: 'pide',
              productTypeLabel: 'Pide',
              kind: LearnedKind.extra,
              value: 'Ekstra Mısır',
              removed: 5,
              accepted: 1,
              lastAt: DateTime(2026, 9, 24, 9, 10),
            ),
        ],
      );

  @override
  Future<int> forgetLearnedProduct({required String cuisineId, required String name}) async {
    forgotten.add('product:$name');
    expect(cuisineId, 'c-pizza');
    return 4;
  }

  @override
  Future<int> forgetLearnedSuggestion({required String productType, required LearnedKind kind, required String value}) async {
    forgotten.add('${kind.wire}:$value');
    expect(productType, 'pide');
    return 5;
  }
}

void main() {
  late FakeLearningApi api;

  setUpAll(() => initializeDateFormatting('tr'));
  setUp(() => api = FakeLearningApi());

  Future<void> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(412 * 3, 1400 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(api)],
        child: const MaterialApp(
          locale: Locale('tr'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: LearningScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  group('LearningScreen ("Öğrenilenler")', () {
    testWidgets('lists what was learned from the calls and the cards, and why', (tester) async {
      await open(tester);
      expect(find.text('Öğrenilenler'), findsOneWidget);
      expect(find.text('Satıcıların çoğunlukla reddettiği ürünler'), findsOneWidget);
      expect(find.text('Künefe'), findsOneWidget);
      expect(find.text('Pizza · 4 kez “Hayır” · 25 Eyl 14:32'), findsOneWidget);
      expect(find.text('Kartlarda artık gelmeyen öneriler'), findsOneWidget);
      expect(find.text('Ekstra Mısır'), findsOneWidget);
      expect(find.text('Pide · ekstra · 5 kez silindi · 24 Eyl 09:10'), findsOneWidget);
    });

    testWidgets('"Geri al" asks first, then forgets the verdict and the row goes', (tester) async {
      await open(tester);
      await tester.tap(find.descendant(of: find.byKey(const ValueKey('learned-product-c-pizza-Künefe')), matching: find.text('Geri al')));
      await tester.pumpAndSettle();
      expect(find.text('“Künefe” Pizza mutfağında yeniden öne alınsın mı?'), findsOneWidget);
      // Changing one's mind costs nothing.
      await tester.tap(find.text('İptal'));
      await tester.pumpAndSettle();
      expect(api.forgotten, isEmpty);

      await tester.tap(find.descendant(of: find.byKey(const ValueKey('learned-product-c-pizza-Künefe')), matching: find.text('Geri al')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('undo-confirm')));
      await tester.pumpAndSettle();
      expect(api.forgotten, ['product:Künefe']);
      expect(find.text('Künefe'), findsNothing);
      expect(find.text('Geri alındı; bir sonraki analizde yeniden hesaba katılır.'), findsOneWidget);

      await tester.tap(find.descendant(of: find.byKey(const ValueKey('learned-suggestion-pide-extra-Ekstra Mısır')), matching: find.text('Geri al')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('undo-confirm')));
      await tester.pumpAndSettle();
      expect(api.forgotten, ['product:Künefe', 'extra:Ekstra Mısır']);
      expect(
        find.text('Henüz öğrenilen bir şey yok. Satıcılar bir ürüne en az 3 kez “Hayır” deyince ya da ekip bir öneriyi en az 3 kez silince burada görünür.'),
        findsOneWidget,
      );
    });
  });
}
