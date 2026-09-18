import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/design/components.dart';
import '../../core/design/count_meter.dart';
import '../../core/design/skeleton.dart';
import '../../core/design/tokens.dart';
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

Tone branchStatusTone(String status) => switch (status) {
      'ready' => Tone.success,
      'opened' => Tone.success,
      'draft' => Tone.neutral,
      _ => Tone.amber,
    };

/// "Şubeler": every branch with its count against the target. "Yeni şube" sits in the app bar.
class BranchesScreen extends ConsumerWidget {
  const BranchesScreen({super.key});

  Future<void> _create(BuildContext context) async {
    final created = await openBranchForm(context);
    if (created != null && context.mounted) await context.push('/branches/${created.id}');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final branches = ref.watch(branchesProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.navBranches),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: AppSpace.sm),
            child: TextButton.icon(
              key: const Key('add-branch'),
              onPressed: () => _create(context),
              icon: const Icon(Icons.add_rounded),
              label: Text(l10n.newShort),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(branchesProvider.future),
        child: branches.when(
          loading: () => const SkeletonList(rows: 4),
          error: (e, _) => ListView(
            children: [
              EmptyState(
                icon: Icons.cloud_off_rounded,
                message: l10n.networkError,
                action: FilledButton(onPressed: () => ref.invalidate(branchesProvider), child: Text(l10n.retry)),
              ),
            ],
          ),
          data: (list) => list.isEmpty
              ? ListView(
                  children: [
                    EmptyState(
                      icon: Icons.storefront_outlined,
                      message: l10n.noBranches,
                      action: FilledButton(onPressed: () => _create(context), child: Text(l10n.newBranch)),
                    ),
                  ],
                )
              : ListView.builder(
                  padding: const EdgeInsets.only(top: AppSpace.sm, bottom: 32),
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
    final text = Theme.of(context).textTheme;
    return AppCard(
      onTap: () => context.push('/branches/${branch.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: Text(branch.name, style: text.titleMedium?.copyWith(fontSize: 17))),
              const SizedBox(width: AppSpace.sm),
              Pill(branchStatusLabel(l10n, branch.status), tone: branchStatusTone(branch.status)),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            [branch.cuisineName, if (branch.city != null && branch.city!.isNotEmpty) branch.city!].join(' · '),
            style: text.bodySmall,
          ),
          const SizedBox(height: 14),
          CountMeter(compact: true, current: branch.currentItemCount, target: branch.effectiveTarget, unit: l10n.productsUnit),
        ],
      ),
    );
  }
}
