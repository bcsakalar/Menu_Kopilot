import 'dart:async';
import 'dart:io';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:workmanager/workmanager.dart';

import '../../core/network/api_client.dart';
import '../../core/providers.dart';
import '../../core/storage/app_database.dart';
import '../../core/storage/token_store.dart';
import 'pending_queue.dart';

const String _uniqueTask = 'menu-kopilot-pending-flush';
const String _taskName = 'flushPending';

/// Background isolate entry: sends the offline queue even when the app is closed (Android WorkManager / iOS BG).
@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    DartPluginRegistrant.ensureInitialized();
    final db = AppDatabase();
    try {
      final url = await db.readKv(serverUrlKey) ?? defaultServerUrl;
      if (url.isEmpty) return true;
      final api = ApiClient(baseUrl: url, tokens: SecureTokenStore());
      await PendingQueue(db).flush(api);
      return true;
    } on Object catch (error) {
      debugPrint('background flush failed: $error');
      return false;
    } finally {
      await db.close();
    }
  });
}

/// Android only: iOS background tasks need extra native registration, so on iOS the queue is flushed when the
/// app is open and the connection returns.
Future<void> registerBackgroundSync() async {
  if (kIsWeb || !Platform.isAndroid) return;
  await Workmanager().initialize(callbackDispatcher);
  await Workmanager().registerPeriodicTask(
    _uniqueTask,
    _taskName,
    frequency: const Duration(minutes: 15),
    constraints: Constraints(networkType: NetworkType.connected),
    existingWorkPolicy: ExistingPeriodicWorkPolicy.keep,
  );
}

final pendingQueueProvider = Provider<PendingQueue>(
  (ref) => PendingQueue(ref.watch(appDatabaseProvider), storageDir: getApplicationDocumentsDirectory),
);

final queuedCountProvider = StreamProvider<int>((ref) => ref.watch(appDatabaseProvider).watchQueuedCount());

/// Flushes the queue whenever connectivity comes back while the app is open.
final queueFlusherProvider = Provider<void>((ref) {
  ref.listen<AsyncValue<bool>>(connectivityProvider, (previous, next) {
    final wasOnline = previous?.value ?? false;
    final isOnline = next.value ?? false;
    if (isOnline && !wasOnline) {
      unawaited(ref.read(pendingQueueProvider).flush(ref.read(apiClientProvider)));
    }
  });
});
