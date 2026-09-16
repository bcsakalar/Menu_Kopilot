import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/widgets/common.dart';
import '../../data/models/branch.dart';
import '../home/cuisine_picker.dart';
import 'branch_providers.dart';

/// Opens the branch form; returns the saved branch (null when cancelled).
Future<Branch?> openBranchForm(BuildContext context, {Branch? initial}) => Navigator.of(context).push<Branch>(
      MaterialPageRoute(fullscreenDialog: true, builder: (_) => BranchFormScreen(initial: initial)),
    );

/// Create / edit a branch: name, cuisine, city, manual target (empty = automatic) and notes.
class BranchFormScreen extends ConsumerStatefulWidget {
  const BranchFormScreen({super.key, this.initial});

  final Branch? initial;

  @override
  ConsumerState<BranchFormScreen> createState() => _BranchFormScreenState();
}

class _BranchFormScreenState extends ConsumerState<BranchFormScreen> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name = TextEditingController(text: widget.initial?.name ?? '');
  late final TextEditingController _city = TextEditingController(text: widget.initial?.city ?? '');
  late final TextEditingController _target = TextEditingController(text: widget.initial?.targetItemCount?.toString() ?? '');
  late final TextEditingController _notes = TextEditingController(text: widget.initial?.notes ?? '');
  late String? _cuisineId = widget.initial?.cuisineId;
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _city.dispose();
    _target.dispose();
    _notes.dispose();
    super.dispose();
  }

  String? _trimmedOrNull(TextEditingController controller) {
    final value = controller.text.trim();
    return value.isEmpty ? null : value;
  }

  Future<void> _save() async {
    final l10n = context.l10n;
    if (!(_form.currentState?.validate() ?? false)) return;
    final cuisineId = _cuisineId;
    if (cuisineId == null) {
      showMessage(context, l10n.selectCuisine);
      return;
    }
    setState(() => _saving = true);
    final api = ref.read(apiClientProvider);
    final target = int.tryParse(_target.text.trim());
    try {
      final initial = widget.initial;
      final Branch saved;
      if (initial == null) {
        saved = await api.createBranch(
          name: _name.text.trim(),
          cuisineId: cuisineId,
          city: _trimmedOrNull(_city),
          notes: _trimmedOrNull(_notes),
          targetItemCount: target,
        );
      } else {
        saved = await api.updateBranch(initial.id, {
          'name': _name.text.trim(),
          'cuisineId': cuisineId,
          'city': _trimmedOrNull(_city),
          'notes': _trimmedOrNull(_notes),
          'targetItemCount': target,
        });
      }
      ref.invalidate(branchesProvider);
      if (mounted) Navigator.of(context).pop(saved);
    } on ApiException catch (e) {
      if (mounted) showMessage(context, apiErrorText(l10n, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final cuisines = ref.watch(cuisinesProvider).value ?? const [];
    final cuisine = cuisines.firstWhereOrNull((c) => c.id == _cuisineId);
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.initial == null ? l10n.newBranch : l10n.editBranch),
        actions: [
          TextButton(
            key: const Key('branch-save'),
            onPressed: _saving ? null : _save,
            child: Text(l10n.save),
          ),
        ],
      ),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              key: const Key('branch-name'),
              controller: _name,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(labelText: l10n.branchName),
              validator: (v) => (v ?? '').trim().length < 2 ? l10n.fieldRequired : null,
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              key: const Key('branch-cuisine'),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52), alignment: Alignment.centerLeft),
              onPressed: () async {
                final picked = await pickCuisine(context);
                if (picked != null) setState(() => _cuisineId = picked.id);
              },
              icon: const Icon(Icons.restaurant),
              label: Text(cuisine == null ? l10n.selectCuisine : '${l10n.cuisine}: ${cuisine.name}'),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _city,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(labelText: l10n.city),
            ),
            const SizedBox(height: 16),
            TextFormField(
              key: const Key('branch-target'),
              controller: _target,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(
                labelText: l10n.targetOverride,
                helperText: l10n.targetOverrideHelp(cuisine?.targetItemCount ?? 10),
              ),
              validator: (v) {
                final text = (v ?? '').trim();
                if (text.isEmpty) return null;
                final n = int.tryParse(text);
                return n == null || n < 1 || n > 500 ? l10n.invalidNumber : null;
              },
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _notes,
              minLines: 2,
              maxLines: 5,
              decoration: InputDecoration(labelText: l10n.notes, alignLabelWithHint: true),
            ),
          ],
        ),
      ),
    );
  }
}
