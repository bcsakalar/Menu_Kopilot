import 'package:collection/collection.dart';
import 'package:flutter/material.dart';

import '../../core/utils/copy_format.dart';
import '../../core/widgets/common.dart';
import '../../data/models/template_payload.dart';

/// Full editor for a card / template. Returns the edited payload via Navigator.pop.
class CardEditorScreen extends StatefulWidget {
  const CardEditorScreen({required this.initial, super.key});

  final TemplatePayload initial;

  @override
  State<CardEditorScreen> createState() => _CardEditorScreenState();
}

class _CardEditorScreenState extends State<CardEditorScreen> {
  late TemplatePayload _payload = widget.initial;
  late final _name = TextEditingController(text: widget.initial.name);
  late final _description = TextEditingController(text: widget.initial.description);
  late final _serving = TextEditingController(text: widget.initial.servingNote);
  late final _portion = TextEditingController(text: widget.initial.portionInfo);
  late final _upsell = TextEditingController(text: widget.initial.upsellSuggestion);

  @override
  void dispose() {
    for (final c in [_name, _description, _serving, _portion, _upsell]) {
      c.dispose();
    }
    super.dispose();
  }

  TemplatePayload _collect() => _payload.copyWith(
        name: _name.text,
        description: _description.text,
        servingNote: _serving.text,
        portionInfo: _portion.text,
        upsellSuggestion: _upsell.text,
      );

  void _setGroups(List<OptionGroup> groups) => setState(() => _payload = _payload.copyWith(optionGroups: groups));

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final changed = _collect() != widget.initial;
        if (!changed) {
          Navigator.pop(context);
          return;
        }
        final discard = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            content: Text(l10n.unsavedChanges),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.cancel)),
              TextButton(onPressed: () => Navigator.pop(context, true), child: Text(l10n.discard)),
            ],
          ),
        );
        if ((discard ?? false) && context.mounted) Navigator.pop(context);
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.editCard),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, _collect().normalized()), child: Text(l10n.save)),
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextField(controller: _name, decoration: InputDecoration(labelText: l10n.productName)),
            const SizedBox(height: 12),
            TextField(
              controller: _description,
              maxLength: descriptionMaxLength,
              minLines: 2,
              maxLines: 4,
              decoration: InputDecoration(labelText: l10n.description),
            ),
            TextField(controller: _portion, decoration: InputDecoration(labelText: l10n.portionInfo)),
            const SizedBox(height: 12),
            TextField(controller: _serving, minLines: 1, maxLines: 3, decoration: InputDecoration(labelText: l10n.servingNote)),
            const SizedBox(height: 12),
            TextField(controller: _upsell, decoration: InputDecoration(labelText: l10n.upsell)),
            const SizedBox(height: 16),
            SectionLabel(
              l10n.optionGroups,
              trailing: TextButton.icon(
                onPressed: () => _setGroups([
                  ..._payload.optionGroups,
                  const OptionGroup(name: '', options: [TemplateOption(name: '')]),
                ]),
                icon: const Icon(Icons.add),
                label: Text(l10n.addGroup),
              ),
            ),
            for (var i = 0; i < _payload.optionGroups.length; i += 1)
              _GroupEditor(
                key: ValueKey('group-$i-${_payload.optionGroups.length}'),
                group: _payload.optionGroups[i],
                onChanged: (g) {
                  final groups = [..._payload.optionGroups]..[i] = g;
                  _setGroups(groups);
                },
                onDelete: () {
                  final groups = [..._payload.optionGroups]..removeAt(i);
                  _setGroups(groups);
                },
              ),
            _ListEditor(
              label: l10n.removables,
              values: _payload.removableIngredients,
              onChanged: (v) => setState(() => _payload = _payload.copyWith(removableIngredients: v)),
            ),
            _ListEditor(
              label: l10n.extras,
              values: _payload.extraIngredients.map((e) => e.name).toList(),
              onChanged: (v) => setState(
                () => _payload = _payload.copyWith(
                  extraIngredients: v
                      .map((name) => _payload.extraIngredients.firstWhereOrNull((e) => e.name == name) ?? ExtraIngredient(name: name))
                      .toList(),
                ),
              ),
            ),
            _ListEditor(label: l10n.tags, values: _payload.tags, onChanged: (v) => setState(() => _payload = _payload.copyWith(tags: v))),
            _ListEditor(
              label: l10n.allergens,
              values: _payload.allergenNotes,
              onChanged: (v) => setState(() => _payload = _payload.copyWith(allergenNotes: v)),
            ),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }
}

class _GroupEditor extends StatefulWidget {
  const _GroupEditor({required this.group, required this.onChanged, required this.onDelete, super.key});

  final OptionGroup group;
  final ValueChanged<OptionGroup> onChanged;
  final VoidCallback onDelete;

  @override
  State<_GroupEditor> createState() => _GroupEditorState();
}

class _GroupEditorState extends State<_GroupEditor> {
  late final _name = TextEditingController(text: widget.group.name);

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _update(OptionGroup group) => widget.onChanged(group.normalized());

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final g = widget.group;
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _name,
                    decoration: InputDecoration(labelText: l10n.groupName, isDense: true),
                    onChanged: (v) => widget.onChanged(g.copyWith(name: v)),
                  ),
                ),
                IconButton(onPressed: widget.onDelete, icon: const Icon(Icons.delete_outline)),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SegmentedButton<SelectionType>(
                  segments: [
                    ButtonSegment(value: SelectionType.single, label: Text(l10n.singleChoice)),
                    ButtonSegment(value: SelectionType.multi, label: Text(l10n.multiChoice(g.maxSelect))),
                  ],
                  selected: {g.selectionType},
                  onSelectionChanged: (s) => _update(
                    g.copyWith(selectionType: s.first, maxSelect: s.first == SelectionType.multi ? g.options.length : 1),
                  ),
                ),
                FilterChip(
                  label: Text(l10n.required),
                  selected: g.isRequired,
                  onSelected: (v) => _update(g.copyWith(isRequired: v, minSelect: v ? 1 : 0)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            for (var i = 0; i < g.options.length; i += 1)
              _OptionRow(
                key: ValueKey('opt-$i-${g.options.length}'),
                option: g.options[i],
                onChanged: (o) {
                  final options = [...g.options]..[i] = o;
                  widget.onChanged(g.copyWith(options: options));
                },
                onPriceMode: (mode) {
                  // A base-price option makes the whole group a base-price group (and vice versa).
                  final options = mode == PriceMode.setsBase
                      ? g.options.map((o) => o.copyWith(priceMode: PriceMode.setsBase)).toList()
                      : g.setsBase
                          ? g.options.map((o) => o.copyWith(priceMode: mode)).toList()
                          : ([...g.options]..[i] = g.options[i].copyWith(priceMode: mode));
                  _update(g.copyWith(options: options));
                },
                onDelete: () {
                  final options = [...g.options]..removeAt(i);
                  _update(g.copyWith(options: options));
                },
              ),
            TextButton.icon(
              onPressed: () => widget.onChanged(g.copyWith(options: [...g.options, TemplateOption(name: '', priceMode: g.setsBase ? PriceMode.setsBase : PriceMode.free)])),
              icon: const Icon(Icons.add),
              label: Text(l10n.addOption),
            ),
          ],
        ),
      ),
    );
  }
}

class _OptionRow extends StatefulWidget {
  const _OptionRow({required this.option, required this.onChanged, required this.onPriceMode, required this.onDelete, super.key});

  final TemplateOption option;
  final ValueChanged<TemplateOption> onChanged;
  final ValueChanged<PriceMode> onPriceMode;
  final VoidCallback onDelete;

  @override
  State<_OptionRow> createState() => _OptionRowState();
}

class _OptionRowState extends State<_OptionRow> {
  late final _name = TextEditingController(text: widget.option.name);

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _name,
            decoration: InputDecoration(hintText: l10n.optionName, isDense: true, border: InputBorder.none),
            onChanged: (v) => widget.onChanged(widget.option.copyWith(name: v)),
          ),
        ),
        DropdownButton<PriceMode>(
          value: widget.option.priceMode,
          underline: const SizedBox.shrink(),
          items: [
            for (final mode in PriceMode.values) DropdownMenuItem(value: mode, child: Text(priceHint(mode))),
          ],
          onChanged: (mode) {
            if (mode != null) widget.onPriceMode(mode);
          },
        ),
        IconButton(visualDensity: VisualDensity.compact, onPressed: widget.onDelete, icon: const Icon(Icons.close, size: 18)),
      ],
    );
  }
}

class _ListEditor extends StatefulWidget {
  const _ListEditor({required this.label, required this.values, required this.onChanged});

  final String label;
  final List<String> values;
  final ValueChanged<List<String>> onChanged;

  @override
  State<_ListEditor> createState() => _ListEditorState();
}

class _ListEditorState extends State<_ListEditor> {
  final _input = TextEditingController();

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  void _add() {
    final value = _input.text.trim();
    if (value.isEmpty) return;
    widget.onChanged([...widget.values, value]);
    _input.clear();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionLabel(widget.label),
        Wrap(
          spacing: 6,
          runSpacing: 4,
          children: [
            for (var i = 0; i < widget.values.length; i += 1)
              InputChip(
                label: Text(widget.values[i]),
                onDeleted: () => widget.onChanged([...widget.values]..removeAt(i)),
              ),
          ],
        ),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _input,
                decoration: InputDecoration(hintText: l10n.newItemHint, isDense: true),
                onSubmitted: (_) => _add(),
              ),
            ),
            TextButton(onPressed: _add, child: Text(l10n.addItem)),
          ],
        ),
      ],
    );
  }
}
