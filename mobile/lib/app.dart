import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/design/action_dock.dart';
import 'core/providers.dart';
import 'core/theme.dart';
import 'l10n/gen/app_localizations.dart';
import 'router.dart';

class MenuKopilotApp extends ConsumerWidget {
  const MenuKopilotApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: ref.watch(themeModeProvider),
      locale: const Locale('tr'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      routerConfig: ref.watch(routerProvider),
      // Tapping outside a text field closes the keyboard; buttons still win their own taps. The keyboard state is read
      // here, at the root, because nested scaffolds hide it from their children (see ActionDock).
      builder: (context, child) => KeyboardVisibility(
        open: MediaQuery.viewInsetsOf(context).bottom > 0,
        child: GestureDetector(
          onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
          child: child,
        ),
      ),
    );
  }
}

const String themeModeKey = 'ui.theme';

/// No stored choice → the dark (anthracite) theme, the app's primary look; "Sistem" and "Açık" stay available.
ThemeMode themeModeFromWire(String? value) =>
    ThemeMode.values.firstWhere((m) => m.name == value, orElse: () => ThemeMode.dark);

/// Theme preference (light / dark / system); persisted in the local database. main() passes the stored value.
final themeModeProvider = NotifierProvider<ThemeModeController, ThemeMode>(ThemeModeController.new);

class ThemeModeController extends Notifier<ThemeMode> {
  ThemeModeController([this._initial = ThemeMode.dark]);

  final ThemeMode _initial;

  @override
  ThemeMode build() => _initial;

  Future<void> set(ThemeMode mode) async {
    state = mode;
    await ref.read(appDatabaseProvider).writeKv(themeModeKey, mode.name);
  }
}
