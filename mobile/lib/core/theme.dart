import 'package:flutter/material.dart';

import '../data/models/suggestion.dart';

const Color _seed = Color(0xFFC2410C); // paprika

ThemeData buildTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(seedColor: _seed, brightness: brightness);
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    visualDensity: VisualDensity.standard,
    inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
    cardTheme: const CardThemeData(margin: EdgeInsets.symmetric(horizontal: 12, vertical: 6)),
    chipTheme: const ChipThemeData(padding: EdgeInsets.symmetric(horizontal: 4)),
  );
}

/// Badge colors: Hazır şablon (purple) · DB'den (green) · AI (blue) · İnceleme gerek (orange).
Color originColor(CardOrigin origin) => switch (origin) {
      CardOrigin.seed => const Color(0xFF7C3AED),
      CardOrigin.db => const Color(0xFF15803D),
      CardOrigin.ai => const Color(0xFF1D4ED8),
      CardOrigin.review => const Color(0xFFEA580C),
    };
