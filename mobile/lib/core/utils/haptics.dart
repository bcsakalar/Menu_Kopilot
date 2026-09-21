import 'package:flutter/services.dart';

/// Physical confirmation for the steps that change data. Uses the platform's own haptic patterns (no vibrate
/// permission needed); silently does nothing where the device has no haptics.
abstract final class Haptics {
  /// A card was accepted — the product is now on the menu.
  static Future<void> confirm() => HapticFeedback.mediumImpact();

  /// A checklist line was ticked, a card skipped, a choice made.
  static Future<void> select() => HapticFeedback.selectionClick();

  /// Products were matched to templates (first cards of a run, the product counter moved).
  static Future<void> match() => HapticFeedback.lightImpact();

  /// Something needs attention (the request failed).
  static Future<void> warn() => HapticFeedback.heavyImpact();
}
