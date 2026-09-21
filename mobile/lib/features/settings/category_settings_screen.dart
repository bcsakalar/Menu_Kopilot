import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/design/skeleton.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/widgets/common.dart';
import '../../data/models/common.dart';

/// The category taxonomy lives in Postgres (`menu_categories`, `cuisine_categories`), not in code: these two
/// screens are where it is edited. A change applies to the next analysis — the server reads it on every run.

final categoriesProvider = FutureProvider.autoDispose<List<MenuCategory>>((ref) => ref.watch(apiClientProvider).categories());

/// Ayarlar > Kategoriler: the keywords that put a product into each category.
class CategorySettingsScreen extends ConsumerWidget {
  const CategorySettingsScreen({super.key});

  Future<void> _edit(BuildContext context, WidgetRef ref, MenuCategory category) async {
    final l10n = context.l10n;
    final next = await showFieldEditor(
      context,
      title: category.label,
      initial: category.keywords.join(', '),
      helper: l10n.keywordsLabel,
    );
    if (next == null || !context.mounted) return;
    final keywords = next.split(',').map((k) => k.trim()).where((k) => k.isNotEmpty).toList();
    try {
      await ref.read(apiClientProvider).updateCategory(category.key, keywords: keywords);
      ref.invalidate(categoriesProvider);
      if (context.mounted) showMessage(context, l10n.savedMessage);
    } on ApiException catch (e) {
      if (context.mounted) showMessage(context, apiErrorText(l10n, e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final categories = ref.watch(categoriesProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.categoriesTitle)),
      body: categories.when(
        loading: () => const SkeletonList(rows: 8),
        error: (_, _) => EmptyState(
          icon: Icons.cloud_off,
          message: l10n.networkError,
          action: FilledButton(onPressed: () => ref.invalidate(categoriesProvider), child: Text(l10n.retry)),
        ),
        data: (list) => ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            Padding(padding: const EdgeInsets.all(16), child: Text(l10n.categoriesHelp, style: Theme.of(context).textTheme.bodySmall)),
            for (final category in list)
              ListTile(
                key: ValueKey('category-${category.key}'),
                title: Text(category.label),
                subtitle: Text(
                  category.keywords.length > 8
                      ? '${category.keywords.take(8).join(', ')}…'
                      : category.keywords.join(', '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: Text(l10n.keywordsCount(category.keywords.length), style: Theme.of(context).textTheme.bodySmall),
                onTap: () => _edit(context, ref, category),
              ),
          ],
        ),
      ),
    );
  }
}

/// Ayarlar > Mutfak Türleri > ⋮ > Kategoriler: which categories a cuisine is expected to have, and how many
/// products each needs for a branch opening. This is the Gap Analyst's yardstick.
class CuisineCategoriesScreen extends ConsumerStatefulWidget {
  const CuisineCategoriesScreen({required this.cuisine, super.key});

  final Cuisine cuisine;

  @override
  ConsumerState<CuisineCategoriesScreen> createState() => _CuisineCategoriesScreenState();
}

class _CuisineCategoriesScreenState extends ConsumerState<CuisineCategoriesScreen> {
  List<MenuCategory>? _all;

  /// Category key → minimum products; a key that is absent is not expected from this cuisine.
  final Map<String, int> _mins = {};
  bool _failed = false;
  bool _saving = false;

  static const int _maxMin = 100;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    final api = ref.read(apiClientProvider);
    try {
      final all = await api.categories();
      final expected = await api.cuisineCategories(widget.cuisine.id);
      if (!mounted) return;
      setState(() {
        _all = all;
        _mins
          ..clear()
          ..addEntries(expected.map((c) => MapEntry(c.categoryKey, c.minItems)));
      });
    } on ApiException {
      if (mounted) setState(() => _failed = true);
    }
  }

  Future<void> _save() async {
    final l10n = context.l10n;
    setState(() => _saving = true);
    try {
      await ref.read(apiClientProvider).replaceCuisineCategories(widget.cuisine.id, Map.of(_mins));
      if (!mounted) return;
      showMessage(context, l10n.savedMessage);
      await Navigator.of(context).maybePop();
    } on ApiException catch (e) {
      if (mounted) showMessage(context, apiErrorText(l10n, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final all = _all;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.cuisine.name),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: TextButton(
              key: const Key('save-cuisine-categories'),
              onPressed: all == null || _saving ? null : _save,
              child: Text(l10n.save),
            ),
          ),
        ],
      ),
      body: _failed
          ? EmptyState(
              icon: Icons.cloud_off,
              message: l10n.networkError,
              action: FilledButton(onPressed: _load, child: Text(l10n.retry)),
            )
          : all == null
              ? const SkeletonList(rows: 8)
              : ListView(
                  padding: const EdgeInsets.only(bottom: 32),
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(l10n.cuisineCategoriesHelp, style: Theme.of(context).textTheme.bodySmall),
                    ),
                    for (final category in all)
                      _ExpectationRow(
                        key: ValueKey('expect-${category.key}'),
                        label: category.label,
                        min: _mins[category.key],
                        max: _maxMin,
                        onChanged: (value) => setState(() {
                          if (value == null) {
                            _mins.remove(category.key);
                          } else {
                            _mins[category.key] = value;
                          }
                        }),
                      ),
                  ],
                ),
    );
  }
}

/// One category: ticked when the cuisine expects it, with a − / + for the minimum product count.
class _ExpectationRow extends StatelessWidget {
  const _ExpectationRow({required this.label, required this.min, required this.max, required this.onChanged, super.key});

  final String label;

  /// Null = not expected from this cuisine.
  final int? min;
  final int max;
  final ValueChanged<int?> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final value = min;
    return ListTile(
      leading: Checkbox(value: value != null, onChanged: (on) => onChanged((on ?? false) ? 1 : null)),
      title: Text(label),
      onTap: () => onChanged(value == null ? 1 : null),
      trailing: value == null
          ? null
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  icon: const Icon(Icons.remove_rounded),
                  onPressed: value > 0 ? () => onChanged(value - 1) : null,
                ),
                Text(l10n.minItemsLabel(value), style: Theme.of(context).textTheme.titleSmall),
                IconButton(
                  icon: const Icon(Icons.add_rounded),
                  onPressed: value < max ? () => onChanged(value + 1) : null,
                ),
              ],
            ),
    );
  }
}
