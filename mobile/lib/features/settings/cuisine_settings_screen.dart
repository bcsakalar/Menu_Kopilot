import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/design/skeleton.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/widgets/common.dart';
import '../../data/models/common.dart';
import 'category_settings_screen.dart';

/// Cuisine types and their minimum product counts (user data — the minimums the team works with are entered here).
class CuisineSettingsScreen extends ConsumerWidget {
  const CuisineSettingsScreen({super.key});

  Future<void> _edit(BuildContext context, WidgetRef ref, {Cuisine? cuisine}) async {
    final l10n = context.l10n;
    final result = await showDialog<({String name, int min, String notes})>(
      context: context,
      builder: (_) => _CuisineDialog(cuisine: cuisine),
    );
    if (result == null) return;
    final api = ref.read(apiClientProvider);
    try {
      if (cuisine == null) {
        await api.createCuisine(name: result.name, minItemCount: result.min, notes: result.notes.isEmpty ? null : result.notes);
      } else {
        await api.updateCuisine(cuisine.id, {
          if (!cuisine.isSystem) 'name': result.name,
          'minItemCount': result.min,
          'notes': result.notes.isEmpty ? null : result.notes,
        });
      }
      ref.invalidate(cuisinesProvider);
    } on ApiException catch (e) {
      if (context.mounted) showMessage(context, apiErrorText(l10n, e));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, Cuisine cuisine) async {
    final l10n = context.l10n;
    try {
      await ref.read(apiClientProvider).deleteCuisine(cuisine.id);
      ref.invalidate(cuisinesProvider);
    } on ApiException catch (e) {
      if (context.mounted) showMessage(context, apiErrorText(l10n, e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final cuisines = ref.watch(cuisinesProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.cuisinesAndMinimums),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: TextButton.icon(onPressed: () => _edit(context, ref), icon: const Icon(Icons.add_rounded), label: Text(l10n.newShort)),
          ),
        ],
      ),
      body: cuisines.when(
        loading: () => const SkeletonList(rows: 6),
        error: (_, _) => EmptyState(
          icon: Icons.cloud_off,
          message: l10n.networkError,
          action: FilledButton(onPressed: () => ref.invalidate(cuisinesProvider), child: Text(l10n.retry)),
        ),
        data: (list) => ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            Padding(padding: const EdgeInsets.all(16), child: Text(l10n.minimumsHelp, style: Theme.of(context).textTheme.bodySmall)),
            for (final cuisine in list)
              ListTile(
                key: ValueKey('cuisine-${cuisine.slug}'),
                title: Text(cuisine.name),
                subtitle: Text(
                  [
                    l10n.minimumLine(cuisine.minItemCount, cuisine.targetItemCount),
                    if (cuisine.notes != null && cuisine.notes!.isNotEmpty) cuisine.notes!,
                  ].join('\n'),
                ),
                isThreeLine: cuisine.notes != null && cuisine.notes!.isNotEmpty,
                trailing: PopupMenuButton<String>(
                  key: ValueKey('cuisine-menu-${cuisine.slug}'),
                  onSelected: (v) => switch (v) {
                    'categories' => Navigator.of(context).push(
                        MaterialPageRoute<void>(builder: (_) => CuisineCategoriesScreen(cuisine: cuisine)),
                      ),
                    'delete' => _delete(context, ref, cuisine),
                    _ => _edit(context, ref, cuisine: cuisine),
                  },
                  itemBuilder: (_) => [
                    PopupMenuItem(value: 'edit', child: Text(l10n.edit)),
                    PopupMenuItem(value: 'categories', child: Text(l10n.cuisineCategoriesMenu)),
                    if (!cuisine.isSystem) PopupMenuItem(value: 'delete', child: Text(l10n.delete)),
                  ],
                ),
                onTap: () => _edit(context, ref, cuisine: cuisine),
              ),
          ],
        ),
      ),
    );
  }
}

class _CuisineDialog extends StatefulWidget {
  const _CuisineDialog({this.cuisine});

  final Cuisine? cuisine;

  @override
  State<_CuisineDialog> createState() => _CuisineDialogState();
}

class _CuisineDialogState extends State<_CuisineDialog> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name = TextEditingController(text: widget.cuisine?.name ?? '');
  late final TextEditingController _min = TextEditingController(text: '${widget.cuisine?.minItemCount ?? 10}');
  late final TextEditingController _notes = TextEditingController(text: widget.cuisine?.notes ?? '');

  @override
  void dispose() {
    _name.dispose();
    _min.dispose();
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final system = widget.cuisine?.isSystem ?? false;
    return AlertDialog(
      title: Text(widget.cuisine == null ? l10n.newCuisine : widget.cuisine!.name),
      content: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!system)
              TextFormField(
                controller: _name,
                decoration: InputDecoration(labelText: l10n.cuisineName),
                validator: (v) => (v ?? '').trim().length < 2 ? l10n.fieldRequired : null,
              ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('cuisine-min'),
              controller: _min,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(labelText: l10n.minItemCount),
              validator: (v) {
                final n = int.tryParse((v ?? '').trim());
                return n == null || n > 500 ? l10n.invalidNumber : null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(controller: _notes, maxLines: 3, decoration: InputDecoration(labelText: l10n.notes)),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l10n.cancel)),
        FilledButton(
          onPressed: () {
            if (!(_form.currentState?.validate() ?? false)) return;
            Navigator.pop(context, (name: _name.text.trim(), min: int.parse(_min.text.trim()), notes: _notes.text.trim()));
          },
          child: Text(l10n.save),
        ),
      ],
    );
  }
}
