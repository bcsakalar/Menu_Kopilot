import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../core/widgets/brand_mark.dart';
import '../../core/widgets/common.dart';
import '../share/share_listener.dart';

/// Bottom navigation: Öneri · Tamamla · Şubeler · Şablonlar · Ayarlar.
class AppShell extends StatelessWidget {
  const AppShell({required this.shell, super.key});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      body: ShareIntakeListener(child: shell),
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (index) => shell.goBranch(index, initialLocation: index == shell.currentIndex),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.auto_awesome_outlined), label: l10n.navSuggest),
          NavigationDestination(icon: const Icon(Icons.fact_check_outlined), label: l10n.navGap),
          NavigationDestination(icon: const Icon(Icons.storefront_outlined), label: l10n.navBranches),
          NavigationDestination(icon: const Icon(Icons.library_books_outlined), label: l10n.navTemplates),
          NavigationDestination(icon: const Icon(Icons.settings_outlined), label: l10n.navSettings),
        ],
      ),
    );
  }
}

/// Shown while the stored session is read; continues the native launch splash (brand color + mark).
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(
        backgroundColor: brandPaprika,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              BrandMark(size: 180, withBackground: false),
              SizedBox(height: 8),
              SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white)),
            ],
          ),
        ),
      );
}
