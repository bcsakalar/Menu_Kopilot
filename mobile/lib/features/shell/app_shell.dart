import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/common.dart';

/// Bottom navigation: Öneri · Tamamla · Şubeler · Şablonlar · Ayarlar.
class AppShell extends StatelessWidget {
  const AppShell({required this.shell, super.key});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      body: shell,
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

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: CircularProgressIndicator()));
}
