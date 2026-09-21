import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:menu_kopilot/core/network/api_client.dart';
import 'package:menu_kopilot/core/providers.dart';
import 'package:menu_kopilot/core/storage/token_store.dart';
import 'package:menu_kopilot/data/models/common.dart';
import 'package:menu_kopilot/features/settings/category_settings_screen.dart';
import 'package:menu_kopilot/l10n/gen/app_localizations.dart';

class FakeCategoryApi extends ApiClient {
  FakeCategoryApi() : super(baseUrl: 'http://fake', tokens: MemoryTokenStore());

  final List<Map<String, int>> saved = [];
  final List<(String, List<String>)> keywordEdits = [];

  @override
  Future<List<MenuCategory>> categories() async => const [
        MenuCategory(key: 'corba', label: 'Çorba', sortOrder: 10, keywords: ['corba']),
        MenuCategory(key: 'ana-yemek', label: 'Ana Yemek', sortOrder: 20, keywords: ['pide', 'kebap']),
        MenuCategory(key: 'icecek', label: 'İçecek', sortOrder: 70, keywords: ['ayran', 'salgam']),
      ];

  @override
  Future<List<CuisineCategory>> cuisineCategories(String cuisineId) async => const [
        CuisineCategory(categoryKey: 'ana-yemek', label: 'Ana Yemek', minItems: 6, sortOrder: 20),
        CuisineCategory(categoryKey: 'icecek', label: 'İçecek', minItems: 2, sortOrder: 70),
      ];

  @override
  Future<List<CuisineCategory>> replaceCuisineCategories(String cuisineId, Map<String, int> minItemsByKey) async {
    saved.add(minItemsByKey);
    return const [];
  }

  @override
  Future<MenuCategory> updateCategory(String key, {String? label, List<String>? keywords}) async {
    keywordEdits.add((key, keywords ?? const []));
    return MenuCategory(key: key, label: label ?? key, sortOrder: 0, keywords: keywords ?? const []);
  }
}

Widget host(FakeCategoryApi api, Widget child) => ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(api)],
      child: MaterialApp(
        locale: const Locale('tr'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: child,
      ),
    );

const pide = Cuisine(id: 'c1', name: 'Pide & Lahmacun', slug: 'pide-lahmacun', isSystem: true);

void main() {
  testWidgets('edits which categories a cuisine needs, and how many of each', (tester) async {
    final api = FakeCategoryApi();
    await tester.pumpWidget(host(api, const CuisineCategoriesScreen(cuisine: pide)));
    await tester.pumpAndSettle();

    // What the server has: main courses 6, drinks 2; soup not expected.
    expect(find.text('en az 6'), findsOneWidget);
    expect(find.text('en az 2'), findsOneWidget);

    // Expect a soup (starts at 1), ask for one more drink.
    await tester.tap(find.text('Çorba'));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(of: find.byKey(const ValueKey('expect-icecek')), matching: find.byIcon(Icons.add_rounded)));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('save-cuisine-categories')));
    await tester.pumpAndSettle();
    expect(api.saved.single, {'ana-yemek': 6, 'icecek': 3, 'corba': 1});
  });

  testWidgets('edits the keywords of a category', (tester) async {
    final api = FakeCategoryApi();
    await tester.pumpWidget(host(api, const CategorySettingsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('ayran, salgam'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('category-icecek')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'ayran, şalgam, boza');
    await tester.tap(find.text('Kaydet'));
    await tester.pumpAndSettle();
    final (key, keywords) = api.keywordEdits.single;
    expect(key, 'icecek');
    expect(keywords, ['ayran', 'şalgam', 'boza']);
  });
}
