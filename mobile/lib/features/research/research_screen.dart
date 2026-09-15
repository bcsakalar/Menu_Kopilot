import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/network/api_client.dart';
import '../../core/widgets/common.dart';
import '../../data/models/branch.dart';
import '../../data/models/voice_research.dart';
import '../branches/branch_providers.dart';
import '../results/run_controller.dart';
import 'research_controller.dart';

/// Opens a source page in the browser (overridden in widget tests).
final linkOpenerProvider = Provider<Future<bool> Function(Uri uri)>(
  (ref) => (uri) => launchUrl(uri, mode: LaunchMode.externalApplication),
);

/// "İnternette araştır": what the restaurant sells according to its public pages, compared with the branch menu.
class ResearchScreen extends ConsumerWidget {
  const ResearchScreen({required this.branchId, super.key});

  final String branchId;

  Future<void> _openCards(BuildContext context, Branch branch, List<String> names) => context.push(
        '/branches/card?branchId=${branch.id}',
        extra: RunRequest(
          cuisineName: branch.cuisineName,
          data: SuggestRequestData(cuisineId: branch.cuisineId, promptText: names.join('\n'), branchId: branch.id),
        ),
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final state = ref.watch(researchControllerProvider(branchId));
    final controller = ref.read(researchControllerProvider(branchId).notifier);
    final branch = (ref.watch(branchesProvider).value ?? const <Branch>[]).firstWhereOrNull((b) => b.id == branchId);
    final result = state.result;
    final loading = state.phase == ResearchPhase.loading;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.researchTitle),
        actions: [
          if (result != null && !loading)
            IconButton(
              key: const Key('research-refresh'),
              tooltip: l10n.researchAgain,
              icon: const Icon(Icons.refresh),
              onPressed: () => controller.run(refresh: true),
            ),
        ],
        bottom: loading ? const PreferredSize(preferredSize: Size.fromHeight(3), child: LinearProgressIndicator(minHeight: 3)) : null,
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            color: Theme.of(context).colorScheme.secondaryContainer,
            child: Text(l10n.researchHint, style: TextStyle(color: Theme.of(context).colorScheme.onSecondaryContainer, fontSize: 12.5)),
          ),
          if (branch != null)
            ListTile(
              leading: const Icon(Icons.storefront_outlined),
              title: Text(branch.name),
              subtitle: Text([branch.cuisineName, if (branch.city != null && branch.city!.isNotEmpty) branch.city!].join(' · ')),
            ),
          if (result == null && !loading)
            Padding(
              padding: const EdgeInsets.all(16),
              child: FilledButton.icon(
                key: const Key('research-start'),
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                onPressed: controller.run,
                icon: const Icon(Icons.travel_explore),
                label: Text(l10n.researchStart),
              ),
            ),
          if (loading) Padding(padding: const EdgeInsets.all(16), child: Text(l10n.researchRunning)),
          if (state.phase == ResearchPhase.error)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(child: Text(state.error ?? l10n.networkError)),
                  TextButton(onPressed: controller.run, child: Text(l10n.retry)),
                ],
              ),
            ),
          if (result != null) ..._result(context, result, state, branch),
        ],
      ),
    );
  }

  List<Widget> _result(BuildContext context, ResearchResult result, ResearchState state, Branch? branch) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final missing = result.notOnMenu;
    final onMenu = result.items.where((i) => i.onMenu == true).toList();
    final date = result.researchedAt == null ? '' : DateFormat('d MMM HH:mm', 'tr').format(result.researchedAt!.toLocal());
    return [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(result.found ? l10n.researchFound(result.items.length) : l10n.researchNotFound, style: theme.textTheme.titleMedium),
            if (result.summary.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(result.summary)),
            const SizedBox(height: 6),
            Text(
              [
                if (result.cuisine != null) result.cuisine!,
                l10n.researchConfidence((result.confidence * 100).round()),
                if (date.isNotEmpty) state.fromDevice || result.cached ? l10n.researchCachedAt(date) : date,
              ].join(' · '),
              style: theme.textTheme.bodySmall,
            ),
          ],
        ),
      ),
      if (missing.isNotEmpty) ...[
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 8, 0),
          child: SectionLabel(
            l10n.researchNotOnMenu(missing.length),
            trailing: CopyButton(text: missing.map((i) => i.name).join('\n')),
          ),
        ),
        for (final item in missing) _ItemTile(item: item, onCard: branch == null ? null : () => _openCards(context, branch, [item.name])),
        if (branch != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: FilledButton.tonalIcon(
              key: const Key('research-cards'),
              onPressed: () => _openCards(context, branch, missing.map((i) => i.name).toList()),
              icon: const Icon(Icons.post_add_outlined),
              label: Text(l10n.researchPrepareAll(missing.length)),
            ),
          ),
      ],
      if (onMenu.isNotEmpty)
        ExpansionTile(
          title: Text(l10n.researchOnMenu(onMenu.length)),
          children: [for (final item in onMenu) _ItemTile(item: item, onCard: null)],
        ),
      if (result.items.isNotEmpty && result.items.every((i) => i.onMenu == null)) ...[
        Padding(padding: const EdgeInsets.fromLTRB(16, 16, 16, 0), child: SectionLabel(l10n.researchItems(result.items.length))),
        for (final item in result.items) _ItemTile(item: item, onCard: null),
      ],
      if (result.sources.isNotEmpty) ...[
        Padding(padding: const EdgeInsets.fromLTRB(16, 16, 16, 0), child: SectionLabel(l10n.researchSources)),
        for (final source in result.sources) _SourceTile(source: source),
      ],
    ];
  }
}

class _ItemTile extends StatelessWidget {
  const _ItemTile({required this.item, required this.onCard});

  final ResearchItem item;
  final VoidCallback? onCard;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final details = [
      if (item.section != null) item.section!,
      if (item.templateName != null) l10n.researchTemplate(item.templateName!),
    ];
    return ListTile(
      dense: true,
      title: Text(item.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
      subtitle: details.isEmpty ? null : Text(details.join(' · ')),
      trailing: onCard == null ? null : IconButton(tooltip: l10n.prepareCard, icon: const Icon(Icons.post_add_outlined), onPressed: onCard),
    );
  }
}

class _SourceTile extends ConsumerWidget {
  const _SourceTile({required this.source});

  final WebSource source;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListTile(
      dense: true,
      leading: const Icon(Icons.link),
      title: Text(source.title, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text(source.host),
      onTap: () async {
        final uri = Uri.tryParse(source.url);
        final opened = uri != null && await ref.read(linkOpenerProvider)(uri);
        if (!opened && context.mounted) await copyToClipboard(context, source.url);
      },
    );
  }
}
