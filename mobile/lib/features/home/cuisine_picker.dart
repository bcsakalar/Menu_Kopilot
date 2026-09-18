import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/design/skeleton.dart';
import '../../core/providers.dart';
import '../../core/widgets/common.dart';
import '../../data/models/common.dart';

/// Bottom sheet listing cuisines with the recently used ones on top.
Future<Cuisine?> pickCuisine(BuildContext context) => showModalBottomSheet<Cuisine>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _CuisineSheet(),
    );

class _CuisineSheet extends ConsumerStatefulWidget {
  const _CuisineSheet();

  @override
  ConsumerState<_CuisineSheet> createState() => _CuisineSheetState();
}

class _CuisineSheetState extends ConsumerState<_CuisineSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final cuisines = ref.watch(cuisinesProvider);
    final recent = ref.watch(recentCuisinesProvider).value ?? const <String>[];
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.75,
      child: cuisines.when(
        loading: () => const SkeletonList(rows: 5),
        error: (e, _) => EmptyState(
          icon: Icons.cloud_off,
          message: l10n.networkError,
          action: FilledButton(onPressed: () => ref.invalidate(cuisinesProvider), child: Text(l10n.retry)),
        ),
        data: (list) {
          final q = _query.trim().toLowerCase();
          final filtered = list.where((c) => q.isEmpty || c.name.toLowerCase().contains(q)).toList();
          final recentItems = [
            for (final id in recent)
              ...filtered.where((c) => c.id == id),
          ];
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: TextField(
                  decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: l10n.selectCuisine, isDense: true),
                  onChanged: (v) => setState(() => _query = v),
                ),
              ),
              Expanded(
                child: ListView(
                  children: [
                    if (recentItems.isNotEmpty) ...[
                      Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 0), child: SectionLabel(l10n.recentCuisines)),
                      for (final c in recentItems) _CuisineTile(cuisine: c),
                      const Divider(),
                    ],
                    Padding(padding: const EdgeInsets.fromLTRB(16, 4, 16, 0), child: SectionLabel(l10n.allCuisines)),
                    for (final c in filtered) _CuisineTile(cuisine: c),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _CuisineTile extends StatelessWidget {
  const _CuisineTile({required this.cuisine});

  final Cuisine cuisine;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: const Icon(Icons.restaurant),
      title: Text(cuisine.name),
      subtitle: Text(context.l10n.cuisineSubtitle(cuisine.targetItemCount, cuisine.templateCount)),
      onTap: () => Navigator.pop(context, cuisine),
    );
  }
}
