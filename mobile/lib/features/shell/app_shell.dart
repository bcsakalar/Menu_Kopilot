import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/design/tokens.dart';
import '../../core/theme.dart';
import '../../core/widgets/brand_mark.dart';
import '../../core/widgets/common.dart';
import '../../core/utils/haptics.dart';
import '../share/share_listener.dart';

/// Bottom navigation: Öneri · Tamamla · Şubeler · Şablonlar · Ayarlar (flat bar on the canvas, hairline on top).
class AppShell extends StatelessWidget {
  const AppShell({required this.shell, super.key});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      body: ShareIntakeListener(child: shell),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(border: Border(top: BorderSide(color: context.palette.border))),
        child: NavigationBar(
          selectedIndex: shell.currentIndex,
          onDestinationSelected: (index) {
            if (index != shell.currentIndex) Haptics.select();
            shell.goBranch(index, initialLocation: index == shell.currentIndex);
          },
          destinations: [
            NavigationDestination(
              icon: const Icon(Icons.playlist_add_rounded),
              selectedIcon: const Icon(Icons.playlist_add_check_rounded),
              label: l10n.navSuggest,
            ),
            NavigationDestination(
              icon: const Icon(Icons.fact_check_outlined),
              selectedIcon: const Icon(Icons.fact_check_rounded),
              label: l10n.navGap,
            ),
            NavigationDestination(
              icon: const Icon(Icons.storefront_outlined),
              selectedIcon: const Icon(Icons.storefront_rounded),
              label: l10n.navBranches,
            ),
            NavigationDestination(
              icon: const Icon(Icons.menu_book_outlined),
              selectedIcon: const Icon(Icons.menu_book_rounded),
              label: l10n.navTemplates,
            ),
            NavigationDestination(
              icon: const Icon(Icons.tune_rounded),
              selectedIcon: const Icon(Icons.tune_rounded),
              label: l10n.navSettings,
            ),
          ],
        ),
      ),
    );
  }
}

/// Shown while the stored session is read; continues the native launch splash (anthracite + the mark).
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(
        backgroundColor: brandAnthracite,
        body: Center(child: BrandMark(size: 96)),
      );
}
