import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

/// Keeps the screen on while the call checklist is open (the phone is in the user's hand during the call).
abstract interface class ScreenWakelock {
  Future<void> enable();
  Future<void> disable();
}

class PluginWakelock implements ScreenWakelock {
  const PluginWakelock();

  @override
  Future<void> enable() => WakelockPlus.enable();

  @override
  Future<void> disable() => WakelockPlus.disable();
}

/// Overridden with a no-op in widget tests (no platform channel there).
final wakelockProvider = Provider<ScreenWakelock>((ref) => const PluginWakelock());
