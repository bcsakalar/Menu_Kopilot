import 'dart:ui' show FontFeature, lerpDouble;

import 'package:flutter/material.dart';

/// Design tokens: anthracite surfaces separated by low-contrast hairlines (no shadows, no gradients), paprika for
/// actions, amber for counts. Every color a widget uses comes from here (`context.palette`), never a raw hex.
@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.canvas,
    required this.surface,
    required this.raised,
    required this.border,
    required this.borderStrong,
    required this.text,
    required this.textMuted,
    required this.textFaint,
    required this.accent,
    required this.onAccent,
    required this.accentText,
    required this.accentSoft,
    required this.amber,
    required this.success,
    required this.danger,
  });

  /// Screen background.
  final Color canvas;

  /// Cards, inputs, list groups.
  final Color surface;

  /// Sheets, the action dock and the navigation bar — one step above [surface].
  final Color raised;

  /// 1 px separators and card outlines.
  final Color border;

  /// Input outlines and empty meter segments.
  final Color borderStrong;

  final Color text;
  final Color textMuted;

  /// Hints and eyebrow labels (still ≥ 4.5:1 on [canvas]).
  final Color textFaint;

  /// Paprika fill of primary actions (white text on it is ≥ 5:1).
  final Color accent;
  final Color onAccent;

  /// Paprika for text and icons on [canvas] / [surface].
  final Color accentText;

  /// Tinted backgrounds: selected navigation item, highlighted rows.
  final Color accentSoft;

  /// Counts and progress.
  final Color amber;
  final Color success;
  final Color danger;

  static const AppPalette dark = AppPalette(
    canvas: Color(0xFF0E1116),
    surface: Color(0xFF151920),
    raised: Color(0xFF1B2029),
    border: Color(0xFF252B35),
    borderStrong: Color(0xFF363E4B),
    text: Color(0xFFECEEF2),
    textMuted: Color(0xFFA2A9B5),
    textFaint: Color(0xFF7C8491),
    accent: Color(0xFFC2410C),
    onAccent: Color(0xFFFFFFFF),
    accentText: Color(0xFFF08A55),
    accentSoft: Color(0x29E2622B),
    amber: Color(0xFFF2B544),
    success: Color(0xFF3DBE8B),
    danger: Color(0xFFF0565C),
  );

  static const AppPalette light = AppPalette(
    canvas: Color(0xFFF4F5F7),
    surface: Color(0xFFFFFFFF),
    raised: Color(0xFFFFFFFF),
    border: Color(0xFFE3E6EB),
    borderStrong: Color(0xFFCBD1DA),
    text: Color(0xFF12151A),
    textMuted: Color(0xFF4F5663),
    textFaint: Color(0xFF646B78),
    accent: Color(0xFFC2410C),
    onAccent: Color(0xFFFFFFFF),
    accentText: Color(0xFFB03A0A),
    accentSoft: Color(0x1FC2410C),
    amber: Color(0xFFB7791F),
    success: Color(0xFF1B7F53),
    danger: Color(0xFFC9353B),
  );

  @override
  AppPalette copyWith({
    Color? canvas,
    Color? surface,
    Color? raised,
    Color? border,
    Color? borderStrong,
    Color? text,
    Color? textMuted,
    Color? textFaint,
    Color? accent,
    Color? onAccent,
    Color? accentText,
    Color? accentSoft,
    Color? amber,
    Color? success,
    Color? danger,
  }) =>
      AppPalette(
        canvas: canvas ?? this.canvas,
        surface: surface ?? this.surface,
        raised: raised ?? this.raised,
        border: border ?? this.border,
        borderStrong: borderStrong ?? this.borderStrong,
        text: text ?? this.text,
        textMuted: textMuted ?? this.textMuted,
        textFaint: textFaint ?? this.textFaint,
        accent: accent ?? this.accent,
        onAccent: onAccent ?? this.onAccent,
        accentText: accentText ?? this.accentText,
        accentSoft: accentSoft ?? this.accentSoft,
        amber: amber ?? this.amber,
        success: success ?? this.success,
        danger: danger ?? this.danger,
      );

  @override
  AppPalette lerp(ThemeExtension<AppPalette>? other, double t) {
    if (other is! AppPalette) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t) ?? b;
    return AppPalette(
      canvas: mix(canvas, other.canvas),
      surface: mix(surface, other.surface),
      raised: mix(raised, other.raised),
      border: mix(border, other.border),
      borderStrong: mix(borderStrong, other.borderStrong),
      text: mix(text, other.text),
      textMuted: mix(textMuted, other.textMuted),
      textFaint: mix(textFaint, other.textFaint),
      accent: mix(accent, other.accent),
      onAccent: mix(onAccent, other.onAccent),
      accentText: mix(accentText, other.accentText),
      accentSoft: mix(accentSoft, other.accentSoft),
      amber: mix(amber, other.amber),
      success: mix(success, other.success),
      danger: mix(danger, other.danger),
    );
  }
}

extension AppPaletteX on BuildContext {
  AppPalette get palette => Theme.of(this).extension<AppPalette>() ?? AppPalette.dark;
}

/// Corner radii: cards 14, controls 12, floating sheets 22.
abstract final class AppRadius {
  static const double card = 14;
  static const double control = 12;
  static const double sheet = 22;
  static const Radius cardRadius = Radius.circular(card);
}

/// Spacing scale (4-pt grid).
abstract final class AppSpace {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;

  /// Horizontal page gutter.
  static const double page = 16;
}

/// Counts, x/target and other numbers line up when the digits have equal widths.
const List<FontFeature> tabularFigures = [FontFeature.tabularFigures()];

/// Interpolates a letter-spacing value for text that scales with the user's font size.
double trackingFor(double fontSize, {double at14 = 0, double at32 = -0.8}) =>
    lerpDouble(at14, at32, ((fontSize - 14) / 18).clamp(0, 1)) ?? at14;
