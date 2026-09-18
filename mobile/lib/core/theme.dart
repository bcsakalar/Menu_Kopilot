import 'package:flutter/material.dart';

import 'design/tokens.dart';

/// Brand "paprika": primary actions, launcher icon and the mark on the splash.
const Color brandPaprika = Color(0xFFC2410C);

/// Anthracite canvas of the dark theme (native splash background too).
const Color brandAnthracite = Color(0xFF0E1116);

/// Bundled font (SIL OFL, `assets/fonts/`): works offline and never fetched at runtime.
const String appFontFamily = 'Manrope';

TextTheme _textTheme(AppPalette p) {
  TextStyle style(double size, FontWeight weight, {double height = 1.35, double? spacing, Color? color, bool numbers = false}) =>
      TextStyle(
        fontFamily: appFontFamily,
        fontSize: size,
        fontWeight: weight,
        height: height,
        letterSpacing: spacing ?? trackingFor(size),
        color: color ?? p.text,
        fontFeatures: numbers ? tabularFigures : null,
      );
  return TextTheme(
    // Counts ("8 / 12"): heavy, tight, tabular digits.
    displayLarge: style(52, FontWeight.w800, height: 1, spacing: -1.6, numbers: true),
    displayMedium: style(44, FontWeight.w800, height: 1, spacing: -1.3, numbers: true),
    displaySmall: style(34, FontWeight.w800, height: 1.05, spacing: -0.9, numbers: true),
    headlineLarge: style(28, FontWeight.w800, height: 1.15),
    headlineMedium: style(24, FontWeight.w800, height: 1.2),
    headlineSmall: style(21, FontWeight.w800, height: 1.25),
    titleLarge: style(18, FontWeight.w800, height: 1.3),
    titleMedium: style(16, FontWeight.w700, height: 1.35),
    titleSmall: style(14, FontWeight.w700, height: 1.35),
    bodyLarge: style(16, FontWeight.w500, height: 1.45),
    bodyMedium: style(14.5, FontWeight.w500, height: 1.45),
    bodySmall: style(12.5, FontWeight.w500, height: 1.4, color: p.textMuted),
    labelLarge: style(15, FontWeight.w700, height: 1.2, spacing: 0.1),
    labelMedium: style(12.5, FontWeight.w700, height: 1.2, spacing: 0.2, color: p.textMuted),
    // Eyebrow labels above sections.
    labelSmall: style(11, FontWeight.w800, height: 1.2, spacing: 0.9, color: p.textFaint),
  );
}

ThemeData buildTheme(Brightness brightness) {
  final p = brightness == Brightness.dark ? AppPalette.dark : AppPalette.light;
  final text = _textTheme(p);
  final scheme = ColorScheme(
    brightness: brightness,
    primary: p.accent,
    onPrimary: p.onAccent,
    primaryContainer: p.accentSoft,
    onPrimaryContainer: p.accentText,
    secondary: p.amber,
    onSecondary: brightness == Brightness.dark ? p.canvas : p.onAccent,
    secondaryContainer: p.raised,
    onSecondaryContainer: p.text,
    tertiary: p.success,
    onTertiary: p.onAccent,
    tertiaryContainer: p.success.withValues(alpha: 0.14),
    onTertiaryContainer: p.success,
    error: p.danger,
    onError: p.onAccent,
    errorContainer: p.danger.withValues(alpha: 0.14),
    onErrorContainer: p.danger,
    surface: p.canvas,
    onSurface: p.text,
    onSurfaceVariant: p.textMuted,
    surfaceContainerLowest: p.canvas,
    surfaceContainerLow: p.surface,
    surfaceContainer: p.surface,
    surfaceContainerHigh: p.raised,
    surfaceContainerHighest: p.raised,
    outline: p.borderStrong,
    outlineVariant: p.border,
    shadow: Colors.black,
    scrim: Colors.black,
    inverseSurface: p.text,
    onInverseSurface: p.canvas,
    inversePrimary: p.accentText,
    surfaceTint: Colors.transparent,
  );
  final controlShape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control));
  OutlineInputBorder outline(Color color, [double width = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.control),
        borderSide: BorderSide(color: color, width: width),
      );

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    fontFamily: appFontFamily,
    textTheme: text,
    scaffoldBackgroundColor: p.canvas,
    canvasColor: p.canvas,
    extensions: [p],
    splashFactory: InkRipple.splashFactory,
    splashColor: p.text.withValues(alpha: 0.06),
    highlightColor: Colors.transparent,
    visualDensity: VisualDensity.standard,
    appBarTheme: AppBarTheme(
      backgroundColor: p.canvas,
      foregroundColor: p.text,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      titleSpacing: AppSpace.page,
      toolbarHeight: 60,
      titleTextStyle: text.titleLarge,
      iconTheme: IconThemeData(color: p.text, size: 22),
      actionsIconTheme: IconThemeData(color: p.textMuted, size: 22),
      shape: Border(bottom: BorderSide(color: p.border)),
    ),
    cardTheme: CardThemeData(
      color: p.surface,
      elevation: 0,
      margin: const EdgeInsets.symmetric(horizontal: AppSpace.page, vertical: 6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.card),
        side: BorderSide(color: p.border),
      ),
      clipBehavior: Clip.antiAlias,
    ),
    dividerTheme: DividerThemeData(color: p.border, thickness: 1, space: 1),
    inputDecorationTheme: InputDecorationThemeData(
      filled: true,
      fillColor: p.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: outline(p.border),
      enabledBorder: outline(p.border),
      focusedBorder: outline(p.accentText, 1.5),
      errorBorder: outline(p.danger),
      focusedErrorBorder: outline(p.danger, 1.5),
      disabledBorder: outline(p.border),
      labelStyle: text.bodyMedium?.copyWith(color: p.textMuted),
      floatingLabelStyle: text.labelMedium?.copyWith(color: p.accentText),
      hintStyle: text.bodyMedium?.copyWith(color: p.textFaint),
      helperStyle: text.bodySmall,
      prefixIconColor: p.textMuted,
      suffixIconColor: p.textMuted,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(Size(64, 50)),
        padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(horizontal: 20)),
        shape: WidgetStatePropertyAll(controlShape),
        textStyle: WidgetStatePropertyAll(text.labelLarge),
        elevation: const WidgetStatePropertyAll(0),
        backgroundColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.disabled) ? p.raised : p.accent,
        ),
        foregroundColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.disabled) ? p.textFaint : p.onAccent,
        ),
        side: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.disabled) ? BorderSide(color: p.border) : BorderSide.none,
        ),
        overlayColor: WidgetStatePropertyAll(p.onAccent.withValues(alpha: 0.12)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(Size(64, 48)),
        padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(horizontal: 16)),
        shape: WidgetStatePropertyAll(controlShape),
        textStyle: WidgetStatePropertyAll(text.labelLarge),
        foregroundColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.disabled) ? p.textFaint : p.text,
        ),
        backgroundColor: WidgetStatePropertyAll(p.surface),
        side: WidgetStatePropertyAll(BorderSide(color: p.border)),
        overlayColor: WidgetStatePropertyAll(p.text.withValues(alpha: 0.06)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(Size(48, 44)),
        shape: WidgetStatePropertyAll(controlShape),
        textStyle: WidgetStatePropertyAll(text.labelLarge),
        foregroundColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.disabled) ? p.textFaint : p.accentText,
        ),
        overlayColor: WidgetStatePropertyAll(p.accentText.withValues(alpha: 0.08)),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: ButtonStyle(
        foregroundColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.disabled) ? p.textFaint.withValues(alpha: 0.5) : p.textMuted,
        ),
        overlayColor: WidgetStatePropertyAll(p.text.withValues(alpha: 0.06)),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: p.surface,
      selectedColor: p.accentSoft,
      disabledColor: p.surface,
      side: BorderSide(color: p.border),
      shape: const StadiumBorder(),
      labelStyle: text.bodySmall?.copyWith(color: p.text, fontWeight: FontWeight.w600),
      secondaryLabelStyle: text.bodySmall?.copyWith(color: p.accentText, fontWeight: FontWeight.w700),
      checkmarkColor: p.accentText,
      iconTheme: IconThemeData(color: p.textMuted, size: 16),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      showCheckmark: false,
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 66,
      backgroundColor: p.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      indicatorColor: p.accentSoft,
      indicatorShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(size: 22, color: states.contains(WidgetState.selected) ? p.accentText : p.textMuted),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontFamily: appFontFamily,
          fontSize: 11.5,
          letterSpacing: 0.1,
          fontWeight: states.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w600,
          color: states.contains(WidgetState.selected) ? p.text : p.textMuted,
        ),
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: p.raised,
      modalBackgroundColor: p.raised,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      modalElevation: 0,
      showDragHandle: true,
      dragHandleColor: p.borderStrong,
      dragHandleSize: const Size(36, 4),
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.sheet)),
        side: BorderSide(color: p.border),
      ),
      modalBarrierColor: Colors.black.withValues(alpha: 0.55),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: p.text,
      contentTextStyle: text.bodyMedium?.copyWith(color: p.canvas, fontWeight: FontWeight.w600),
      actionTextColor: p.accent,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control)),
      insetPadding: const EdgeInsets.fromLTRB(AppSpace.page, 0, AppSpace.page, AppSpace.md),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: p.raised,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: p.border)),
      titleTextStyle: text.titleLarge,
      contentTextStyle: text.bodyMedium,
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: p.raised,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control), side: BorderSide(color: p.border)),
      textStyle: text.bodyMedium,
    ),
    listTileTheme: ListTileThemeData(
      iconColor: p.textMuted,
      textColor: p.text,
      contentPadding: const EdgeInsets.symmetric(horizontal: AppSpace.page),
      minVerticalPadding: 10,
      titleTextStyle: text.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
      subtitleTextStyle: text.bodySmall,
    ),
    expansionTileTheme: ExpansionTileThemeData(
      shape: const Border(),
      collapsedShape: const Border(),
      iconColor: p.textMuted,
      collapsedIconColor: p.textMuted,
      textColor: p.text,
      collapsedTextColor: p.text,
      tilePadding: const EdgeInsets.symmetric(horizontal: AppSpace.page),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? p.onAccent : p.textMuted,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? p.accent : p.border,
      ),
      trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? p.accent : Colors.transparent,
      ),
      checkColor: WidgetStatePropertyAll(p.onAccent),
      side: BorderSide(color: p.borderStrong, width: 1.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: p.accentText,
      linearTrackColor: p.border,
      circularTrackColor: Colors.transparent,
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(color: p.text, borderRadius: BorderRadius.circular(8)),
      textStyle: text.bodySmall?.copyWith(color: p.canvas, fontWeight: FontWeight.w600),
    ),
    dropdownMenuTheme: DropdownMenuThemeData(textStyle: text.bodyMedium),
  );
}
