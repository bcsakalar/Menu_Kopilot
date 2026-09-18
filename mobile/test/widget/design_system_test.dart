import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:menu_kopilot/core/design/action_dock.dart';
import 'package:menu_kopilot/core/design/count_meter.dart';
import 'package:menu_kopilot/core/design/skeleton.dart';
import 'package:menu_kopilot/core/design/tokens.dart';
import 'package:menu_kopilot/core/theme.dart';

double contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  final hi = la > lb ? la : lb;
  final lo = la > lb ? lb : la;
  return (hi + 0.05) / (lo + 0.05);
}

Widget themed(Widget child, {bool keyboard = false, bool reduceMotion = false}) => MaterialApp(
      theme: buildTheme(Brightness.dark),
      home: MediaQuery(
        data: MediaQueryData(disableAnimations: reduceMotion),
        child: KeyboardVisibility(open: keyboard, child: Scaffold(body: child)),
      ),
    );

void main() {
  group('palette', () {
    for (final (name, p) in [('dark', AppPalette.dark), ('light', AppPalette.light)]) {
      test('$name: text colors reach WCAG AA on the canvas and on cards', () {
        for (final background in [p.canvas, p.surface]) {
          for (final (role, color) in [('text', p.text), ('textMuted', p.textMuted), ('textFaint', p.textFaint), ('accentText', p.accentText)]) {
            expect(contrast(color, background), greaterThanOrEqualTo(4.5), reason: '$role on $background');
          }
        }
        expect(contrast(p.onAccent, p.accent), greaterThanOrEqualTo(4.5), reason: 'button label on paprika');
        expect(contrast(p.danger, p.surface), greaterThanOrEqualTo(4.5), reason: 'danger text');
        expect(contrast(p.success, p.surface), greaterThanOrEqualTo(4.5), reason: 'success text');
      });
    }

    test('both themes carry the palette and the bundled font; no Material "tint" on surfaces', () {
      for (final brightness in Brightness.values) {
        final theme = buildTheme(brightness);
        expect(theme.extension<AppPalette>(), isNotNull);
        expect(theme.textTheme.bodyMedium?.fontFamily, appFontFamily);
        expect(theme.colorScheme.surfaceTint, Colors.transparent);
        expect(theme.textTheme.displayMedium?.fontFeatures, tabularFigures);
      }
    });
  });

  testWidgets('count meter: big tabular number, one segment per product, green at target', (tester) async {
    await tester.pumpWidget(themed(const CountMeter(current: 8, target: 12, unit: 'ürün', caption: '4 ürün eksik')));
    expect(tester.widget<Text>(find.byKey(const Key('count-current'))).data, '8');
    expect(find.text(' / 12'), findsOneWidget);
    expect(find.text('4 ürün eksik'), findsOneWidget);
    final segments = find.descendant(of: find.byType(SegmentedMeter), matching: find.byType(AnimatedContainer));
    expect(segments, findsNWidgets(12));
    final filled = tester
        .widgetList<AnimatedContainer>(segments)
        .where((c) => (c.decoration! as BoxDecoration).color == AppPalette.dark.amber)
        .length;
    expect(filled, 8);

    await tester.pumpWidget(themed(const CountMeter(current: 12, target: 12, unit: 'ürün')));
    await tester.pumpAndSettle();
    final done = tester.widgetList<AnimatedContainer>(find.descendant(of: find.byType(SegmentedMeter), matching: find.byType(AnimatedContainer)));
    expect(done.every((c) => (c.decoration! as BoxDecoration).color == AppPalette.dark.success), isTrue);
  });

  testWidgets('the action dock steps aside while the keyboard is open', (tester) async {
    var taps = 0;
    final dock = ActionDock(primary: FilledButton(onPressed: () => taps++, child: const Text('Öner')));
    await tester.pumpWidget(themed(dock));
    await tester.tap(find.text('Öner'));
    expect(taps, 1);

    await tester.pumpWidget(themed(dock, keyboard: true));
    await tester.pumpAndSettle();
    expect(tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity, 0);
    await tester.tap(find.text('Öner'), warnIfMissed: false);
    expect(taps, 1, reason: 'hidden dock ignores taps');
  });

  testWidgets('skeletons stand still when the system asks for reduced motion', (tester) async {
    await tester.pumpWidget(themed(const SkeletonCard(title: 'Adana Kebap'), reduceMotion: true));
    expect(find.text('Adana Kebap'), findsOneWidget);
    expect(tester.hasRunningAnimations, isFalse);

    await tester.pumpWidget(themed(const ScanSkeleton(message: 'Menü okunuyor')));
    expect(tester.hasRunningAnimations, isTrue);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('dock buttons announce themselves and show a count badge', (tester) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(themed(Row(children: [DockButton(icon: Icons.photo_library_outlined, tooltip: 'Galeriden seç', badge: 3, onPressed: () {})])));
    expect(find.bySemanticsLabel(RegExp('Galeriden seç')), findsWidgets);
    expect(find.text('3'), findsOneWidget);
    semantics.dispose();
  });

  test('haptic helpers use the platform patterns', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final calls = <Object?>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'HapticFeedback.vibrate') calls.add(call.arguments);
      return null;
    });
    await HapticFeedback.mediumImpact();
    expect(calls, ['HapticFeedbackType.mediumImpact']);
  });
}
