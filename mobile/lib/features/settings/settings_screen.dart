import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/utils/server_url.dart';
import '../../core/widgets/common.dart';
import '../../data/models/settings.dart';

const String appVersion = '1.1.0';

final quotaProvider = FutureProvider.autoDispose<QuotaInfo>((ref) => ref.watch(apiClientProvider).quota());

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  Future<void> _editServer(BuildContext context, WidgetRef ref, String current) async {
    final next = await showFieldEditor(context, title: context.l10n.serverUrl, initial: current);
    if (next == null || next.isEmpty || !context.mounted) return;
    final problem = checkServerUrl(next);
    if (problem != null) {
      showMessage(context, problem == ServerUrlProblem.insecure ? context.l10n.insecureUrl : context.l10n.invalidUrl);
      return;
    }
    await ref.read(serverUrlProvider.notifier).set(next);
    if (!context.mounted) return;
    try {
      final health = await ref.read(apiClientProvider).health();
      if (context.mounted) showMessage(context, context.l10n.serverStatus('${health['status'] ?? 'ok'}'));
    } on ApiException catch (e) {
      if (context.mounted) showMessage(context, apiErrorText(context.l10n, e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final session = ref.watch(authControllerProvider).value;
    final server = ref.watch(serverUrlProvider).value ?? '';
    final theme = ref.watch(themeModeProvider);
    final quota = ref.watch(quotaProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.settingsTitle)),
      body: ListView(
        children: [
          Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: SectionLabel(l10n.menuSettings)),
          ListTile(
            key: const Key('settings-cuisines'),
            leading: const Icon(Icons.restaurant_menu),
            title: Text(l10n.cuisinesAndMinimums),
            subtitle: Text(l10n.cuisinesAndMinimumsHint),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/settings/cuisines'),
          ),
          ListTile(
            key: const Key('settings-categories'),
            leading: const Icon(Icons.category_outlined),
            title: Text(l10n.categoriesTitle),
            subtitle: Text(l10n.categoriesHint),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/settings/categories'),
          ),
          Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: SectionLabel(l10n.aiSection)),
          ListTile(
            key: const Key('settings-models'),
            leading: const Icon(Icons.hub_outlined),
            title: Text(l10n.aiModels),
            subtitle: Text(l10n.aiModelsHint),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/settings/models'),
          ),
          ListTile(
            leading: const Icon(Icons.speed_outlined),
            title: Text(l10n.quotaToday),
            subtitle: quota.when(
              loading: () => Text(l10n.loading),
              error: (_, _) => Text(l10n.networkError),
              data: (q) => Text(
                [
                  l10n.quotaLine(q.callsToday, q.dailyCalls, q.tokensToday, q.dailyTokens),
                  if (q.localOnlyMode) l10n.localOnlyOn,
                  if (!q.allowed) l10n.quotaExceeded,
                ].join('\n'),
              ),
            ),
          ),
          ListTile(
            key: const Key('settings-learning'),
            leading: const Icon(Icons.school_outlined),
            title: Text(l10n.learningTitle),
            subtitle: Text(l10n.learningHint),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/settings/learning'),
          ),
          ListTile(
            key: const Key('settings-usage'),
            leading: const Icon(Icons.insights_outlined),
            title: Text(l10n.usageTitle),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/settings/usage'),
          ),
          Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: SectionLabel(l10n.appearance)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: SegmentedButton<ThemeMode>(
              segments: [
                ButtonSegment(value: ThemeMode.system, label: Text(l10n.themeSystem), icon: const Icon(Icons.brightness_auto)),
                ButtonSegment(value: ThemeMode.light, label: Text(l10n.themeLight), icon: const Icon(Icons.light_mode_outlined)),
                ButtonSegment(value: ThemeMode.dark, label: Text(l10n.themeDark), icon: const Icon(Icons.dark_mode_outlined)),
              ],
              selected: {theme},
              onSelectionChanged: (value) => ref.read(themeModeProvider.notifier).set(value.first),
            ),
          ),
          Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: SectionLabel(l10n.serverSection)),
          ListTile(
            leading: const Icon(Icons.dns_outlined),
            title: Text(l10n.serverUrl),
            subtitle: Text(server),
            trailing: const Icon(Icons.edit_outlined),
            onTap: () => _editServer(context, ref, server),
          ),
          Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: SectionLabel(l10n.account)),
          ListTile(
            leading: const Icon(Icons.person_outline),
            title: Text(session?.user.name ?? (deviceSignIn ? l10n.deviceAccount : '')),
            subtitle: Text(deviceSignIn ? l10n.deviceAccountHint : (session?.user.email ?? '')),
          ),
          // A build that signs itself in has nothing to sign out of: it would only sign in again (D-199).
          if (!deviceSignIn)
            ListTile(
              leading: const Icon(Icons.logout),
              title: Text(l10n.logout),
              onTap: () => ref.read(authControllerProvider.notifier).logout(),
            ),
          const Divider(),
          ListTile(leading: const Icon(Icons.info_outline), title: Text(l10n.about), subtitle: Text(l10n.version(appVersion))),
          const Padding(padding: EdgeInsets.all(16), child: DisclaimerBanner()),
        ],
      ),
    );
  }
}
