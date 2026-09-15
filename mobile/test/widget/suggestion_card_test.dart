import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:menu_kopilot/data/models/suggestion.dart';
import 'package:menu_kopilot/data/models/template_payload.dart';
import 'package:menu_kopilot/features/results/suggestion_card.dart';
import 'package:menu_kopilot/l10n/gen/app_localizations.dart';

import '../unit/models_test.dart' show adana;

Widget _host(Widget child) => MaterialApp(
      locale: const Locale('tr'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

SuggestionCard _card({CardOrigin origin = CardOrigin.seed, CardStatus status = CardStatus.pending, bool review = false}) =>
    SuggestionCard(
      id: 'c1',
      runId: 'r1',
      rawName: 'adana',
      origin: origin,
      payload: adana,
      status: status,
      needsReview: review,
      reviewReason: review ? 'Bunu bilmiyorum, sen doldur.' : null,
    );

void main() {
  testWidgets('shows badge, fields and actions; accept/skip/edit call back', (tester) async {
    var accepted = 0;
    var skipped = 0;
    var edited = 0;
    await tester.pumpWidget(_host(SuggestionCardView(
      card: _card(),
      onChanged: (_) {},
      onAccept: () => accepted++,
      onSkip: () => skipped++,
      onEdit: () => edited++,
    )));
    expect(find.text('Adana Kebap'), findsOneWidget);
    expect(find.text('Hazır şablon'), findsOneWidget);
    expect(find.text('Açıklama'), findsOneWidget);
    expect(find.textContaining('Porsiyon · 2'), findsOneWidget);
    expect(find.byIcon(Icons.copy_rounded), findsWidgets);

    for (final finder in [find.text('Onayla'), find.byTooltip('Atla'), find.byTooltip('Düzenle')]) {
      await tester.ensureVisible(finder);
      await tester.tap(finder);
    }
    expect((accepted, skipped, edited), (1, 1, 1));
  });

  testWidgets('copy-all puts the whole card on the clipboard', (tester) async {
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') {
        copied = (call.arguments as Map<Object?, Object?>)['text'] as String?;
      }
      return null;
    });
    await tester.pumpWidget(_host(SuggestionCardView(
      card: _card(origin: CardOrigin.ai),
      onChanged: (_) {},
      onAccept: () {},
      onSkip: () {},
      onEdit: () {},
    )));
    expect(find.text('AI'), findsOneWidget);
    await tester.ensureVisible(find.text('Tümünü kopyala'));
    await tester.tap(find.text('Tümünü kopyala'));
    await tester.pump();
    expect(copied, contains('Porsiyon (tek seçim, zorunlu)'));
    expect(find.text('Kopyalandı'), findsOneWidget);
  });

  testWidgets('review cards show the reason; decided cards hide the actions', (tester) async {
    await tester.pumpWidget(_host(SuggestionCardView(
      card: _card(origin: CardOrigin.review, review: true, status: CardStatus.accepted),
      onChanged: (_) {},
      onAccept: () {},
      onSkip: () {},
      onEdit: () {},
    )));
    expect(find.text('İnceleme gerek'), findsOneWidget);
    expect(find.text('Bunu bilmiyorum, sen doldur.'), findsOneWidget);
    expect(find.text('Onaylandı'), findsOneWidget);
    expect(find.text('Onayla'), findsNothing);
  });

  testWidgets('tapping the description opens the inline editor and reports the change', (tester) async {
    TemplatePayload? changed;
    await tester.pumpWidget(_host(SuggestionCardView(
      card: _card(origin: CardOrigin.db),
      onChanged: (p) => changed = p,
      onAccept: () {},
      onSkip: () {},
      onEdit: () {},
    )));
    await tester.tap(find.text(adana.description));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'Yeni açıklama');
    await tester.tap(find.text('Kaydet'));
    await tester.pumpAndSettle();
    expect(changed?.description, 'Yeni açıklama');
  });
}
