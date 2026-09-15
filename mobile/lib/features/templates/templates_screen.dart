import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/utils/copy_format.dart';
import '../../core/widgets/common.dart';
import '../../data/models/template_item.dart';
import '../../data/models/template_payload.dart';
import '../home/cuisine_picker.dart';
import '../results/card_editor_screen.dart';
import 'template_pool.dart';

/// "Şablon havuzu": search, filter by cuisine / source, sort by usage / name / date; edit and delete.
/// Readable offline (Drift copy).
class TemplatesScreen extends ConsumerStatefulWidget {
  const TemplatesScreen({super.key});

  @override
  ConsumerState<TemplatesScreen> createState() => _TemplatesScreenState();
}

class _TemplatesScreenState extends ConsumerState<TemplatesScreen> {
  late final TextEditingController _search = TextEditingController(text: ref.read(templateFilterProvider).query);

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _edit(TemplateItem item) async {
    final l10n = context.l10n;
    final edited = await Navigator.of(context).push<TemplatePayload>(
      MaterialPageRoute(builder: (_) => CardEditorScreen(initial: item.payload)),
    );
    if (edited == null || !mounted) return;
    try {
      await ref.read(templatePoolProvider.notifier).save(item, edited);
      if (mounted) showMessage(context, l10n.templateSaved);
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.isNetwork ? l10n.networkError : e.message);
    }
  }

  Future<void> _delete(TemplateItem item) async {
    final l10n = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: Text(item.source == 'seed' ? l10n.deleteSeedTemplateConfirm(item.name) : l10n.deleteTemplateConfirm(item.name)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.cancel)),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(l10n.delete)),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await ref.read(templatePoolProvider.notifier).remove(item);
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.isNetwork ? l10n.networkError : e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final pool = ref.watch(templatePoolProvider);
    final filter = ref.watch(templateFilterProvider);
    final items = ref.watch(filteredTemplatesProvider);
    final cuisines = ref.watch(cuisinesProvider).value ?? const [];
    final cuisine = cuisines.firstWhereOrNull((c) => c.id == filter.cuisineId);
    final notifier = ref.read(templateFilterProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.navTemplates),
        actions: [
          PopupMenuButton<TemplateSort>(
            icon: const Icon(Icons.sort),
            tooltip: l10n.sortBy,
            initialValue: filter.sort,
            onSelected: notifier.setSort,
            itemBuilder: (_) => [
              PopupMenuItem(value: TemplateSort.usage, child: Text(l10n.sortUsage)),
              PopupMenuItem(value: TemplateSort.name, child: Text(l10n.sortName)),
              PopupMenuItem(value: TemplateSort.updated, child: Text(l10n.sortUpdated)),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          if (pool.value?.offline ?? false) MaterialBanner(content: Text(l10n.offlineBanner), actions: const [SizedBox.shrink()]),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: TextField(
              key: const Key('template-search'),
              controller: _search,
              decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: l10n.searchTemplates, isDense: true),
              onChanged: notifier.setQuery,
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            child: Row(
              children: [
                InputChip(
                  avatar: const Icon(Icons.restaurant, size: 18),
                  label: Text(cuisine?.name ?? l10n.allCuisines),
                  onPressed: () async {
                    final picked = await pickCuisine(context);
                    if (picked != null) notifier.setCuisine(picked.id);
                  },
                  onDeleted: cuisine == null ? null : () => notifier.setCuisine(null),
                ),
                const SizedBox(width: 8),
                ChoiceChip(label: Text(l10n.allSources), selected: filter.source == null, onSelected: (_) => notifier.setSource(null)),
                const SizedBox(width: 6),
                ChoiceChip(label: Text(l10n.badgeSeed), selected: filter.source == 'seed', onSelected: (_) => notifier.setSource('seed')),
                const SizedBox(width: 6),
                ChoiceChip(label: Text(l10n.sourceUser), selected: filter.source == 'user', onSelected: (_) => notifier.setSource('user')),
              ],
            ),
          ),
          Expanded(
            child: pool.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => EmptyState(
                icon: Icons.cloud_off,
                message: l10n.networkError,
                action: FilledButton(onPressed: () => ref.invalidate(templatePoolProvider), child: Text(l10n.retry)),
              ),
              data: (_) => RefreshIndicator(
                onRefresh: () => ref.refresh(templatePoolProvider.future),
                child: items.isEmpty
                    ? ListView(children: [EmptyState(icon: Icons.library_books_outlined, message: l10n.noTemplates)])
                    : ListView.builder(
                        padding: const EdgeInsets.only(bottom: 32),
                        itemCount: items.length + 1,
                        itemBuilder: (context, index) {
                          if (index == 0) {
                            return Padding(
                              padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                              child: Text(l10n.templateCount(items.length), style: Theme.of(context).textTheme.bodySmall),
                            );
                          }
                          final item = items[index - 1];
                          return _TemplateTile(
                            key: ValueKey(item.id),
                            item: item,
                            onEdit: () => _edit(item),
                            onDelete: () => _delete(item),
                          );
                        },
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TemplateTile extends StatelessWidget {
  const _TemplateTile({required this.item, required this.onEdit, required this.onDelete, super.key});

  final TemplateItem item;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return Card(
      child: ExpansionTile(
        title: Row(
          children: [
            Expanded(child: Text(item.name, style: theme.textTheme.titleMedium)),
            OriginBadge(origin: item.origin),
          ],
        ),
        subtitle: Text('${item.cuisineName} · ${l10n.usedTimes(item.usageCount)}', style: theme.textTheme.bodySmall),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (item.payload.description.isNotEmpty) Text(item.payload.description),
          const SizedBox(height: 6),
          for (final group in item.payload.optionGroups)
            Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Text(formatGroup(group), style: theme.textTheme.bodySmall),
            ),
          if (item.aliases.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('${l10n.aliases}: ${item.aliases.join(', ')}', style: theme.textTheme.bodySmall),
            ),
          const SizedBox(height: 8),
          Row(
            children: [
              CopyButton(text: formatCard(item.payload), tooltip: l10n.copyAll),
              const Spacer(),
              TextButton.icon(onPressed: onDelete, icon: const Icon(Icons.delete_outline), label: Text(l10n.delete)),
              const SizedBox(width: 8),
              FilledButton.tonalIcon(onPressed: onEdit, icon: const Icon(Icons.edit_outlined), label: Text(l10n.edit)),
            ],
          ),
        ],
      ),
    );
  }
}
