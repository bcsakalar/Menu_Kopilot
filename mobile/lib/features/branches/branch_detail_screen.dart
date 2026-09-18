import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/design/components.dart';
import '../../core/design/count_meter.dart';
import '../../core/design/skeleton.dart';
import '../../core/design/tokens.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/utils/file_sharer.dart';
import '../../core/widgets/common.dart';
import '../../data/models/branch.dart';
import '../../l10n/gen/app_localizations.dart';
import '../results/run_controller.dart';
import 'branch_form.dart';
import 'branch_providers.dart';
import 'branches_screen.dart' show branchStatusLabel, branchStatusTone;

final branchMenuProvider = FutureProvider.autoDispose.family<BranchMenu, String>(
  (ref, branchId) => ref.watch(apiClientProvider).branchMenu(branchId),
);

/// Branch detail: status, target, the stored menu (on the menu / missing info / recommended) and export.
class BranchDetailScreen extends ConsumerStatefulWidget {
  const BranchDetailScreen({required this.branchId, super.key});

  final String branchId;

  @override
  ConsumerState<BranchDetailScreen> createState() => _BranchDetailScreenState();
}

class _BranchDetailScreenState extends ConsumerState<BranchDetailScreen> {
  bool _busy = false;

  ApiClient get _api => ref.read(apiClientProvider);

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } on ApiException catch (e) {
      if (mounted) showMessage(context, apiErrorText(context.l10n, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _refresh() {
    ref.invalidate(branchMenuProvider(widget.branchId));
    ref.invalidate(branchesProvider);
  }

  Future<void> _setStatus(Branch branch, String status) => _run(() async {
        await _api.updateBranch(branch.id, {'status': status});
        _refresh();
      });

  Future<void> _setItemStatus(BranchMenuItem item, MenuItemStatus status) => _run(() async {
        await _api.updateMenuItem(widget.branchId, item.id, status);
        _refresh();
      });

  Future<void> _deleteItem(BranchMenuItem item) async {
    final l10n = context.l10n;
    final ok = await _confirm(l10n.deleteMenuItemConfirm(item.name));
    if (!ok) return;
    await _run(() async {
      await _api.deleteMenuItem(widget.branchId, item.id);
      _refresh();
    });
  }

  Future<bool> _confirm(String message) async {
    final l10n = context.l10n;
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.cancel)),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(l10n.delete)),
        ],
      ),
    );
    return result ?? false;
  }

  Future<void> _deleteBranch(Branch branch) async {
    final ok = await _confirm(context.l10n.deleteBranchConfirm(branch.name));
    if (!ok) return;
    await _run(() async {
      await _api.deleteBranch(branch.id);
      final selected = ref.read(selectedBranchIdProvider).value;
      if (selected == branch.id) await ref.read(selectedBranchIdProvider.notifier).select(null);
      ref.invalidate(branchesProvider);
      if (mounted) context.pop();
    });
  }

  Future<void> _export(Branch branch) async {
    final l10n = context.l10n;
    final format = await showModalBottomSheet<String>(
      context: context,
      useRootNavigator: true,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.table_chart_outlined),
              title: Text(l10n.exportCsv),
              subtitle: Text(l10n.exportCsvHint),
              onTap: () => Navigator.pop(context, 'csv'),
            ),
            ListTile(
              leading: const Icon(Icons.data_object),
              title: Text(l10n.exportJson),
              onTap: () => Navigator.pop(context, 'json'),
            ),
          ],
        ),
      ),
    );
    if (format == null) return;
    await _run(() async {
      final file = await _api.exportBranch(branch.id, format: format);
      await ref.read(fileSharerProvider).shareText(
            fileName: file.fileName,
            content: file.body,
            mimeType: format == 'csv' ? 'text/csv' : 'application/json',
            subject: '${branch.name} — ${l10n.menu}',
          );
    });
  }

  Future<void> _openCard(Branch branch, String name) => context.push(
        '/branches/card?branchId=${branch.id}',
        extra: RunRequest(
          cuisineName: branch.cuisineName,
          data: SuggestRequestData(cuisineId: branch.cuisineId, promptText: name, branchId: branch.id),
        ),
      );

  Future<void> _analyze(Branch branch) async {
    await ref.read(selectedBranchIdProvider.notifier).select(branch.id);
    if (mounted) context.go('/gap');
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final menu = ref.watch(branchMenuProvider(widget.branchId));
    final branch = menu.value?.branch;
    return Scaffold(
      appBar: AppBar(
        title: Text(branch?.name ?? l10n.navBranches),
        actions: [
          if (branch != null) ...[
            IconButton(
              key: const Key('research-branch'),
              tooltip: l10n.researchTitle,
              icon: const Icon(Icons.travel_explore),
              onPressed: () => context.push('/branches/${branch.id}/research'),
            ),
            IconButton(key: const Key('export-branch'), tooltip: l10n.export, icon: const Icon(Icons.ios_share), onPressed: _busy ? null : () => _export(branch)),
            PopupMenuButton<String>(
              onSelected: (value) async {
                if (value == 'edit') {
                  final saved = await openBranchForm(context, initial: branch);
                  if (saved != null) _refresh();
                } else if (value == 'delete') {
                  await _deleteBranch(branch);
                }
              },
              itemBuilder: (_) => [
                PopupMenuItem(value: 'edit', child: Text(l10n.editBranch)),
                PopupMenuItem(value: 'delete', child: Text(l10n.deleteBranch)),
              ],
            ),
          ],
        ],
        bottom: _busy ? const PreferredSize(preferredSize: Size.fromHeight(2), child: LinearProgressIndicator(minHeight: 2)) : null,
      ),
      body: menu.when(
        loading: () => const SkeletonList(rows: 3),
        error: (e, _) => EmptyState(
          icon: Icons.cloud_off,
          message: apiErrorText(l10n, e),
          action: FilledButton(onPressed: _refresh, child: Text(l10n.retry)),
        ),
        data: (data) => RefreshIndicator(
          onRefresh: () => ref.refresh(branchMenuProvider(widget.branchId).future),
          child: ListView(
            padding: const EdgeInsets.only(bottom: 32),
            children: [
              _Header(
                branch: data.branch,
                onStatus: (status) => _setStatus(data.branch, status),
                onAnalyze: () => _analyze(data.branch),
              ),
              _MenuSection(
                title: l10n.menuOnMenu(data.withStatus(MenuItemStatus.ok).length),
                items: data.withStatus(MenuItemStatus.ok),
                onCard: (item) => _openCard(data.branch, item.name),
                onDelete: _deleteItem,
              ),
              _MenuSection(
                title: l10n.menuIncomplete(data.withStatus(MenuItemStatus.incomplete).length),
                items: data.withStatus(MenuItemStatus.incomplete),
                onCard: (item) => _openCard(data.branch, item.name),
                onDelete: _deleteItem,
                onConfirm: (item) => _setItemStatus(item, MenuItemStatus.ok),
                confirmLabel: l10n.markComplete,
              ),
              _MenuSection(
                title: l10n.menuRecommended(data.withStatus(MenuItemStatus.missing).length),
                items: data.withStatus(MenuItemStatus.missing),
                onCard: (item) => _openCard(data.branch, item.name),
                onDelete: _deleteItem,
                onConfirm: (item) => _setItemStatus(item, MenuItemStatus.incomplete),
                confirmLabel: l10n.markAvailable,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.branch, required this.onStatus, required this.onAnalyze});

  final Branch branch;
  final ValueChanged<String> onStatus;
  final VoidCallback onAnalyze;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpace.page, 18, AppSpace.page, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  [branch.cuisineName, if (branch.city != null && branch.city!.isNotEmpty) branch.city!].join(' · '),
                  style: text.bodySmall,
                ),
              ),
              PopupMenuButton<String>(
                key: const Key('branch-status'),
                tooltip: l10n.branchStatus,
                initialValue: branchStatuses.contains(branch.status) ? branch.status : 'in_progress',
                onSelected: (value) {
                  if (value != branch.status) onStatus(value);
                },
                itemBuilder: (_) => [
                  for (final status in branchStatuses) PopupMenuItem(value: status, child: Text(branchStatusLabel(l10n, status))),
                ],
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Pill(branchStatusLabel(l10n, branch.status), tone: branchStatusTone(branch.status)),
                    Icon(Icons.expand_more_rounded, size: 18, color: p.textMuted),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          CountMeter(
            current: branch.currentItemCount,
            target: branch.effectiveTarget,
            unit: l10n.productsUnit,
            caption: branch.targetItemCount == null ? l10n.targetAutomatic : l10n.manualTarget,
          ),
          if (branch.notes != null && branch.notes!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(branch.notes!, style: text.bodySmall),
          ],
          const SizedBox(height: 16),
          FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            onPressed: onAnalyze,
            icon: const Icon(Icons.fact_check_outlined, size: 20),
            label: Text(l10n.gapTitle),
          ),
        ],
      ),
    );
  }
}

String _fieldLabel(AppLocalizations l10n, String field) => switch (field) {
      'description' => l10n.missingDescription,
      'options' => l10n.missingOptions,
      _ => l10n.missingRemovables,
    };

class _MenuSection extends StatelessWidget {
  const _MenuSection({
    required this.title,
    required this.items,
    required this.onCard,
    required this.onDelete,
    this.onConfirm,
    this.confirmLabel,
  });

  final String title;
  final List<BranchMenuItem> items;
  final ValueChanged<BranchMenuItem> onCard;
  final ValueChanged<BranchMenuItem> onDelete;
  final ValueChanged<BranchMenuItem>? onConfirm;
  final String? confirmLabel;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Eyebrow(title),
        SurfaceGroup(
          children: [
            for (final item in items)
              ListTile(
                key: ValueKey('menu-${item.id}'),
                title: Text(item.name, style: Theme.of(context).textTheme.titleSmall),
                subtitle: switch (item) {
                  BranchMenuItem(reason: final reason?) when item.status == MenuItemStatus.missing => Text(reason),
                  BranchMenuItem(missingFields: final fields) when fields.isNotEmpty => Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [for (final field in fields) Pill(_fieldLabel(l10n, field), tone: Tone.danger)],
                      ),
                    ),
                  BranchMenuItem(payload: _?) => Text(l10n.cardAccepted),
                  _ => null,
                },
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (onConfirm != null) TextButton(onPressed: () => onConfirm!(item), child: Text(confirmLabel ?? l10n.ok)),
                    PopupMenuButton<String>(
                      onSelected: (value) => value == 'card' ? onCard(item) : onDelete(item),
                      itemBuilder: (_) => [
                        PopupMenuItem(value: 'card', child: Text(l10n.prepareCard)),
                        PopupMenuItem(value: 'delete', child: Text(l10n.delete)),
                      ],
                    ),
                  ],
                ),
              ),
          ],
        ),
      ],
    );
  }
}
