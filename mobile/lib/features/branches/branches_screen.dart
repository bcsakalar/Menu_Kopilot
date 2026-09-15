import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/common.dart';
import '../../data/models/branch.dart';
import '../../l10n/gen/app_localizations.dart';
import 'branch_form.dart';
import 'branch_providers.dart';

String branchStatusLabel(AppLocalizations l10n, String status) => switch (status) {
      'draft' => l10n.branchStatusDraft,
      'ready' => l10n.branchStatusReady,
      'opened' => l10n.branchStatusOpened,
      _ => l10n.branchStatusInProgress,
    };

/// "Şubeler": every branch with its x / target progress.
class BranchesScreen extends ConsumerWidget {
  const BranchesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final branches = ref.watch(branchesProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.navBranches)),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('add-branch'),
        onPressed: () async {
          final created = await openBranchForm(context);
          if (created != null && context.mounted) await context.push('/branches/${created.id}');
        },
        icon: const Icon(Icons.add_business_outlined),
        label: Text(l10n.newBranch),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(branchesProvider.future),
        child: branches.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              EmptyState(
                icon: Icons.cloud_off,
                message: l10n.networkError,
                action: FilledButton(onPressed: () => ref.invalidate(branchesProvider), child: Text(l10n.retry)),
              ),
            ],
          ),
          data: (list) => list.isEmpty
              ? ListView(children: [EmptyState(icon: Icons.storefront_outlined, message: l10n.noBranches)])
              : ListView.builder(
                  padding: const EdgeInsets.only(bottom: 96),
                  itemCount: list.length,
                  itemBuilder: (context, index) => _BranchTile(branch: list[index]),
                ),
        ),
      ),
    );
  }
}

class _BranchTile extends StatelessWidget {
  const _BranchTile({required this.branch});

  final Branch branch;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final progress = branch.effectiveTarget <= 0 ? 1.0 : (branch.currentItemCount / branch.effectiveTarget).clamp(0, 1).toDouble();
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/branches/${branch.id}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(branch.name, style: theme.textTheme.titleMedium)),
                  Chip(label: Text(branchStatusLabel(l10n, branch.status)), visualDensity: VisualDensity.compact),
                ],
              ),
              Text(
                [branch.cuisineName, if (branch.city != null && branch.city!.isNotEmpty) branch.city!].join(' · '),
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(value: progress, minHeight: 8),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(l10n.countsLabel(branch.currentItemCount, branch.effectiveTarget), style: theme.textTheme.labelLarge),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
