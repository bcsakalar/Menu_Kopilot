import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:menu_kopilot/core/theme.dart';
import 'package:menu_kopilot/core/widgets/photo_thumb.dart';
import 'package:menu_kopilot/l10n/gen/app_localizations.dart';

Widget _host(Widget child) => MaterialApp(
      theme: buildTheme(Brightness.dark),
      locale: const Locale('tr'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(body: Center(child: child)),
    );

void main() {
  testWidgets('only the corner badge deletes, and it is its own button with a 40 dp target', (tester) async {
    final semantics = tester.ensureSemantics();
    var deleted = 0;
    // Laid out like the draft strips: list items are semantics boundaries, which is where the label used to spread
    // over the whole photo. The file is never read in a widget test (no real IO), so a missing path is fine.
    await tester.pumpWidget(
      _host(
        SizedBox(
          height: 96,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: 2,
            separatorBuilder: (_, _) => const SizedBox(width: 8),
            itemBuilder: (_, index) => index == 0 ? PhotoThumb(path: 'missing.jpg', onDelete: () => deleted += 1) : const SizedBox(width: 80),
          ),
        ),
      ),
    );

    final button = find.bySemanticsLabel('Sil');
    expect(button, findsOneWidget);
    final node = tester.getSemantics(button);
    expect(node.rect.width, lessThanOrEqualTo(40));
    expect(node.rect.height, lessThanOrEqualTo(40));
    expect(node.getSemanticsData().flagsCollection.isButton, isTrue);

    // A tap on the photo itself must not remove it.
    await tester.tapAt(tester.getCenter(find.byType(PhotoThumb)) + const Offset(-20, 20));
    expect(deleted, 0);

    await tester.tap(button);
    expect(deleted, 1);
    semantics.dispose();
  });
}
