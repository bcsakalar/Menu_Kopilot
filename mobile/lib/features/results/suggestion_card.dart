import 'package:flutter/material.dart';

import '../../core/utils/copy_format.dart';
import '../../core/widgets/common.dart';
import '../../data/models/suggestion.dart';
import '../../data/models/template_payload.dart';

/// Opens a one-field editor ("inline" editing of any text field on the card).
Future<String?> showFieldEditor(BuildContext context, {required String title, required String initial, int? maxLength}) {
  return showModalBottomSheet<String>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    builder: (context) => _FieldEditSheet(title: title, initial: initial, maxLength: maxLength),
  );
}

class _FieldEditSheet extends StatefulWidget {
  const _FieldEditSheet({required this.title, required this.initial, this.maxLength});

  final String title;
  final String initial;
  final int? maxLength;

  @override
  State<_FieldEditSheet> createState() => _FieldEditSheetState();
}

class _FieldEditSheetState extends State<_FieldEditSheet> {
  late final TextEditingController _controller = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(context).viewInsets.bottom + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l10n.editField(widget.title), style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            autofocus: true,
            minLines: 1,
            maxLines: 5,
            maxLength: widget.maxLength,
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(onPressed: () => Navigator.pop(context), child: Text(l10n.cancel)),
              const SizedBox(width: 8),
              FilledButton(onPressed: () => Navigator.pop(context, _controller.text.trim()), child: Text(l10n.save)),
            ],
          ),
        ],
      ),
    );
  }
}

/// A suggestion card: every field has its own copy button, text fields are editable by tapping,
/// option groups expand, and the footer carries Onayla / Düzenle / Atla.
class SuggestionCardView extends StatelessWidget {
  const SuggestionCardView({
    required this.card,
    required this.onChanged,
    required this.onAccept,
    required this.onSkip,
    required this.onEdit,
    super.key,
    this.busy = false,
  });

  final SuggestionCard card;
  final ValueChanged<TemplatePayload> onChanged;
  final VoidCallback onAccept;
  final VoidCallback onSkip;
  final VoidCallback onEdit;
  final bool busy;

  Future<void> _editText(BuildContext context, String title, String value, TemplatePayload Function(String) apply,
      {int? maxLength}) async {
    final next = await showFieldEditor(context, title: title, initial: value, maxLength: maxLength);
    if (next != null && next != value) onChanged(apply(next));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = card.payload;
    final theme = Theme.of(context);
    final decided = card.status != CardStatus.pending;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Opacity(
        opacity: card.status == CardStatus.skipped ? 0.55 : 1,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 4, 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: InkWell(
                      onTap: decided ? null : () => _editText(context, l10n.productName, p.name, (v) => p.copyWith(name: v)),
                      child: Text(p.name, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    ),
                  ),
                  OriginBadge(origin: card.origin),
                  CopyButton(text: p.name),
                ],
              ),
              if (card.rawName.trim().toLowerCase() != p.name.trim().toLowerCase())
                Text('“${card.rawName}”', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline)),
              if (card.needsReview)
                Container(
                  margin: const EdgeInsets.only(top: 6, right: 8),
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.errorContainer.withValues(alpha: 0.5),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(card.reviewReason ?? l10n.reviewUnknown),
                ),
              _TextField(
                label: l10n.description,
                value: p.description,
                trailing: l10n.descriptionCounter(p.description.length),
                onTap: decided
                    ? null
                    : () => _editText(context, l10n.description, p.description, (v) => p.copyWith(description: v),
                        maxLength: descriptionMaxLength),
              ),
              _TextField(
                label: l10n.portionInfo,
                value: p.portionInfo,
                onTap: decided ? null : () => _editText(context, l10n.portionInfo, p.portionInfo, (v) => p.copyWith(portionInfo: v)),
              ),
              _TextField(
                label: l10n.servingNote,
                value: p.servingNote,
                onTap: decided ? null : () => _editText(context, l10n.servingNote, p.servingNote, (v) => p.copyWith(servingNote: v)),
              ),
              if (p.optionGroups.isNotEmpty) ...[
                SectionLabel(l10n.optionGroups),
                for (final group in p.optionGroups) _GroupTile(group: group),
              ],
              _Chips(label: l10n.removables, values: p.removableIngredients),
              _Chips(label: l10n.extras, values: p.extraIngredients.map((e) => '${e.name} (${e.priceHint})').toList()),
              _Chips(label: l10n.tags, values: p.tags),
              _Chips(label: l10n.allergens, values: p.allergenNotes),
              _TextField(
                label: l10n.upsell,
                value: p.upsellSuggestion,
                onTap: decided
                    ? null
                    : () => _editText(context, l10n.upsell, p.upsellSuggestion, (v) => p.copyWith(upsellSuggestion: v)),
              ),
              const SizedBox(height: 4),
              // Copy on the left, decisions on the right; wraps to two lines on narrow screens / large fonts instead of
              // pushing "Onayla" out of the card.
              SizedBox(
                width: double.infinity,
                child: Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Wrap(
                    alignment: WrapAlignment.spaceBetween,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    runSpacing: 4,
                    children: [
                      TextButton.icon(
                        onPressed: () => copyToClipboard(context, formatCard(l10n, p)),
                        icon: const Icon(Icons.copy_all_rounded, size: 18),
                        label: Text(l10n.copyAll),
                      ),
                      if (decided)
                        Chip(
                          avatar: Icon(card.status == CardStatus.accepted ? Icons.check_circle : Icons.remove_circle_outline, size: 18),
                          label: Text(
                            '${card.status == CardStatus.accepted ? l10n.accepted : l10n.skipped}${card.queued ? ' ⏳' : ''}',
                          ),
                        )
                      else
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              tooltip: l10n.skip,
                              visualDensity: VisualDensity.compact,
                              onPressed: busy ? null : onSkip,
                              icon: const Icon(Icons.do_not_disturb_on_outlined),
                            ),
                            IconButton(
                              tooltip: l10n.edit,
                              visualDensity: VisualDensity.compact,
                              onPressed: busy ? null : onEdit,
                              icon: const Icon(Icons.edit_outlined),
                            ),
                            const SizedBox(width: 4),
                            FilledButton(onPressed: busy ? null : onAccept, child: Text(l10n.accept)),
                          ],
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TextField extends StatelessWidget {
  const _TextField({required this.label, required this.value, this.onTap, this.trailing});

  final String label;
  final String value;
  final VoidCallback? onTap;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (value.trim().isEmpty && onTap == null) return const SizedBox.shrink();
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(label, style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.primary)),
                      if (trailing != null) ...[
                        const SizedBox(width: 6),
                        Text(trailing!, style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.outline)),
                      ],
                    ],
                  ),
                  Text(
                    value.trim().isEmpty ? '—' : value,
                    style: value.trim().isEmpty ? TextStyle(color: theme.colorScheme.outline) : null,
                  ),
                ],
              ),
            ),
            CopyButton(text: value),
          ],
        ),
      ),
    );
  }
}

class _GroupTile extends StatelessWidget {
  const _GroupTile({required this.group});

  final OptionGroup group;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final kind = group.selectionType == SelectionType.single ? l10n.singleChoice : l10n.multiChoice(group.maxSelect);
    final required = group.isRequired ? l10n.required : l10n.optional;
    return ExpansionTile(
      tilePadding: const EdgeInsets.only(right: 4),
      childrenPadding: const EdgeInsets.only(bottom: 8, right: 8),
      title: Text('${group.name} · ${group.options.length}'),
      subtitle: Text('$kind · $required'),
      trailing: CopyButton(text: formatGroupOptions(group)),
      children: [
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final option in group.options)
              Chip(
                label: Text('${option.name} · ${priceHint(l10n, option.priceMode)}${option.isDefault ? ' · ${l10n.defaultOption}' : ''}'),
                backgroundColor: option.priceMode == PriceMode.setsBase
                    ? Theme.of(context).colorScheme.tertiaryContainer
                    : option.priceMode == PriceMode.surcharge
                        ? Theme.of(context).colorScheme.secondaryContainer
                        : null,
              ),
          ],
        ),
      ],
    );
  }
}

class _Chips extends StatelessWidget {
  const _Chips({required this.label, required this.values});

  final String label;
  final List<String> values;

  @override
  Widget build(BuildContext context) {
    if (values.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionLabel(label, trailing: CopyButton(text: values.join(', '))),
        Wrap(spacing: 6, runSpacing: 4, children: [for (final v in values) Chip(label: Text(v))]),
      ],
    );
  }
}
