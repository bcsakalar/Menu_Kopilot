import 'package:drift/drift.dart' show DatabaseConnection;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:menu_kopilot/core/providers.dart';
import 'package:menu_kopilot/core/storage/app_database.dart';
import 'package:menu_kopilot/core/utils/wakelock.dart';
import 'package:menu_kopilot/features/gap/gap_controller.dart';
import 'package:menu_kopilot/features/gap/gap_result_screen.dart';
import 'package:menu_kopilot/l10n/gen/app_localizations.dart';

import '../unit/gap_test.dart' show FakeGapApi, kebapBranch, sampleGapEvents;

class FakeWakelock implements ScreenWakelock {
  final List<bool> calls = [];

  @override
  Future<void> enable() async => calls.add(true);

  @override
  Future<void> disable() async => calls.add(false);
}

void main() {
  late AppDatabase db;
  late FakeGapApi api;
  late FakeWakelock wakelock;

  setUp(() {
    db = AppDatabase(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    api = FakeGapApi()..stream = () => Stream.fromIterable(sampleGapEvents());
    wakelock = FakeWakelock();
  });

  tearDown(() async {
    await db.close();
  });

  Widget host(Widget child) => ProviderScope(
        overrides: [
          appDatabaseProvider.overrideWithValue(db),
          apiClientProvider.overrideWithValue(api),
          wakelockProvider.overrideWithValue(wakelock),
        ],
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

  testWidgets('shows x/target, the call checklist, missing-field badges and recommendations', (tester) async {
    await tester.pumpWidget(host(const GapResultScreen(request: GapRequest(branch: kebapBranch, images: []))));
    await tester.pumpAndSettle();

    expect(tester.widget<Text>(find.byKey(const Key('count-current'))).data, '12');
    expect(find.text(' / 14'), findsOneWidget);
    expect(find.text('2 ürün eksik'), findsOneWidget);
    expect(find.text('Çağrıda sor (0/4)'), findsOneWidget);
    expect(find.text('Beyti Sarma var mı?'), findsOneWidget);
    expect(find.text('Kuzu Tandır var mı?'), findsOneWidget);
    expect(find.text('Boy: Fındık (Küçük) / Normal / Büyük'), findsOneWidget);
    expect(wakelock.calls, [true]);

    for (final badge in ['Malzeme yok', 'Açıklama yok', 'Malzeme ?']) {
      await tester.scrollUntilVisible(find.text(badge), 200);
      expect(find.text(badge), findsOneWidget);
    }
    await tester.scrollUntilVisible(find.text('Kuzu Tandır'), 200);
    expect(find.textContaining('AI · Ocakbaşılarda'), findsOneWidget);
    expect(find.text('Tamam olanlar (1)'), findsOneWidget);
  });

  testWidgets('ticks are saved locally and survive reopening; the screen lock is released on close', (tester) async {
    await tester.pumpWidget(host(const GapResultScreen(request: GapRequest(branch: kebapBranch, images: []))));
    await tester.pumpAndSettle();

    final haptics = <Object?>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'HapticFeedback.vibrate') haptics.add(call.arguments);
      return null;
    });
    await tester.tap(find.text('Beyti Sarma var mı?'));
    await tester.pumpAndSettle();
    expect(find.text('Çağrıda sor (1/4)'), findsOneWidget);
    expect(haptics, ['HapticFeedbackType.selectionClick']);
    final saved = await tester.runAsync(() => db.watchChecked(checklistId(kebapBranch.id)).first);
    expect(saved, {'item:beyti sarma'});

    await tester.pumpWidget(host(const SizedBox.shrink()));
    await tester.pumpAndSettle();
    expect(wakelock.calls, [true, false]);

    await tester.pumpWidget(host(const GapResultScreen(request: GapRequest(branch: kebapBranch, images: []))));
    await tester.pumpAndSettle();
    expect(find.text('Çağrıda sor (1/4)'), findsOneWidget);
  });
}
