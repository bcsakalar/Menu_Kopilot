import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:menu_kopilot/core/utils/image_compressor.dart';
import 'package:menu_kopilot/features/home/home_controller.dart';
import 'package:menu_kopilot/features/share/share_intake.dart';
import 'package:menu_kopilot/features/share/share_listener.dart';
import 'package:menu_kopilot/l10n/gen/app_localizations.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';

class FakeShareSource implements ShareSource {
  FakeShareSource({this.first});

  final SharedIntake? first;
  final StreamController<SharedIntake> controller = StreamController<SharedIntake>.broadcast();
  int consumedCalls = 0;

  @override
  Future<SharedIntake?> initial() async => first;

  @override
  Stream<SharedIntake> updates() => controller.stream;

  @override
  Future<void> consumed() async => consumedCalls++;
}

GoRouter testRouter() => GoRouter(
      initialLocation: '/suggest',
      routes: [
        ShellRoute(
          builder: (context, state, child) => Scaffold(body: ShareIntakeListener(child: child)),
          routes: [
            GoRoute(path: '/suggest', builder: (_, _) => const Text('suggest-tab')),
          ],
        ),
      ],
    );

Widget app(ShareSource source, List<String> compressed) => ProviderScope(
      overrides: [
        shareSourceProvider.overrideWithValue(source),
        imageCompressorProvider.overrideWithValue((path) async {
          compressed.add(path);
          return PickedImage(path: path, bytes: 1000, sha256: path, width: 1600, height: 1200);
        }),
      ],
      child: MaterialApp.router(
        routerConfig: testRouter(),
        locale: const Locale('tr'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
      ),
    );

void main() {
  test('shared media is split into photos and text; videos and other files are ignored', () {
    final intake = SharedIntake.fromMedia([
      SharedMediaFile(path: '/cache/menu.jpg', type: SharedMediaType.image),
      SharedMediaFile(path: '/cache/scan.heic', type: SharedMediaType.file, mimeType: 'image/heic'),
      SharedMediaFile(path: '/cache/clip.mp4', type: SharedMediaType.video),
      SharedMediaFile(path: '/cache/menu.pdf', type: SharedMediaType.file, mimeType: 'application/pdf'),
      SharedMediaFile(path: 'Adana 250 TL, Lahmacun', type: SharedMediaType.text),
    ]);
    expect(intake.imagePaths, ['/cache/menu.jpg', '/cache/scan.heic']);
    expect(intake.text, 'Adana 250 TL, Lahmacun');
    expect(SharedIntake.fromMedia([SharedMediaFile(path: ' ', type: SharedMediaType.text)]).isEmpty, isTrue);
  });

  testWidgets('photos that opened the app land in the analysis draft', (tester) async {
    final source = FakeShareSource(first: const SharedIntake(imagePaths: ['/cache/p1.png', '/cache/p2.png']));
    final compressed = <String>[];
    await tester.pumpWidget(app(source, compressed));
    await tester.pumpAndSettle();

    expect(find.text('2 fotoğraf paylaşıldı'), findsOneWidget);
    expect(source.consumedCalls, 1);
    await tester.tap(find.byKey(const Key('share-photos')));
    await tester.pumpAndSettle();

    expect(find.text('suggest-tab'), findsOneWidget);
    final container = ProviderScope.containerOf(tester.element(find.text('suggest-tab')));
    expect(container.read(homeDraftProvider).images.map((i) => i.path), ['/cache/p1.png', '/cache/p2.png']);
    expect(compressed, hasLength(2));
  });

  testWidgets('a product list shared while the app runs is appended to the menu field', (tester) async {
    final source = FakeShareSource();
    await tester.pumpWidget(app(source, []));
    await tester.pumpAndSettle();
    final container = ProviderScope.containerOf(tester.element(find.text('suggest-tab')));
    container.read(homeDraftProvider.notifier).setMenuText('Künefe');

    source.controller.add(const SharedIntake(text: 'Adana Kebap\nAyran'));
    await tester.pumpAndSettle();
    expect(find.text('Metin paylaşıldı'), findsOneWidget);
    expect(find.byKey(const Key('share-photos')), findsNothing);
    await tester.tap(find.byKey(const Key('share-text')));
    await tester.pumpAndSettle();

    expect(container.read(homeDraftProvider).menuText, 'Künefe\nAdana Kebap\nAyran');
    expect(find.text('suggest-tab'), findsOneWidget);
  });
}
