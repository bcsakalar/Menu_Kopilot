import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/widgets/common.dart';
import '../results/suggestion_card.dart';

const String appVersion = '1.0.0';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  Future<void> _editServer(BuildContext context, WidgetRef ref, String current) async {
    final next = await showFieldEditor(context, title: context.l10n.serverUrl, initial: current);
    if (next == null || next.isEmpty) return;
    await ref.read(serverUrlProvider.notifier).set(next);
    if (!context.mounted) return;
    try {
      final health = await ref.read(apiClientProvider).health();
      if (context.mounted) showMessage(context, '${health['status'] ?? 'ok'}');
    } on ApiException catch (e) {
      if (context.mounted) showMessage(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final session = ref.watch(authControllerProvider).value;
    final server = ref.watch(serverUrlProvider).value ?? '';
    return Scaffold(
      appBar: AppBar(title: Text(l10n.settingsTitle)),
      body: ListView(
        children: [
          Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: SectionLabel(l10n.account)),
          ListTile(
            leading: const Icon(Icons.person_outline),
            title: Text(session?.user.name ?? ''),
            subtitle: Text(session?.user.email ?? ''),
          ),
          Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: SectionLabel(l10n.serverSection)),
          ListTile(
            leading: const Icon(Icons.dns_outlined),
            title: Text(l10n.serverUrl),
            subtitle: Text(server),
            trailing: const Icon(Icons.edit_outlined),
            onTap: () => _editServer(context, ref, server),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout),
            title: Text(l10n.logout),
            onTap: () => ref.read(authControllerProvider.notifier).logout(),
          ),
          ListTile(leading: const Icon(Icons.info_outline), title: Text(l10n.about), subtitle: Text(l10n.version(appVersion))),
          const Padding(padding: EdgeInsets.all(16), child: DisclaimerBanner()),
        ],
      ),
    );
  }
}
