import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';
import 'core/providers.dart';
import 'core/storage/app_database.dart';
import 'features/offline/background.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('tr');
  final database = AppDatabase();
  final theme = themeModeFromWire(await database.readKv(themeModeKey));
  unawaited(registerBackgroundSync().catchError((Object e) => debugPrint('background sync unavailable: $e')));
  runApp(
    ProviderScope(
      overrides: [
        appDatabaseProvider.overrideWithValue(database),
        themeModeProvider.overrideWith(() => ThemeModeController(theme)),
      ],
      child: const MenuKopilotApp(),
    ),
  );
}
