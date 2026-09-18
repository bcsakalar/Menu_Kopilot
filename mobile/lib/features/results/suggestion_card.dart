import 'package:flutter/material.dart';

import '../../core/design/components.dart';
import '../../core/design/tokens.dart';
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
      padding: EdgeInsets.fromLTRB(AppSpace.page, 0, AppSpace.page, MediaQuery.viewInsetsOf(context).bottom + AppSpace.page),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l10n.editField(widget.title), style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: AppSpace.md),
          TextField(
            controller: _controller,
            autofocus: true,
            minLines: 1,
            maxLines: 5,
            maxLength: widget.maxLength,
          ),
          const SizedBox(height: AppSpace.sm),
          Row(
            children: [
              Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(context), child: Text(l10n.cancel))),
              const SizedBox(width: AppSpace.sm),
              Expanded(child: FilledButton(onPressed: () => Navigator.pop(context, _controller.text.trim()), child: Text(l10n.save))),
            ],
          ),
        ],
      ),
    );
  }
}

/// A suggestion card, reduced to what is decided on the spot: name + origin, the description (tap to edit, copy on
/// the right) and a one-line summary. Portion, serving, option groups, ingredients, tags and the upsell open under
/// "Detaylar". The footer keeps "Onayla" at the right edge, where the thumb rests.
class SuggestionCardView extends StatefulWidget {
  const SuggestionCardView({
    required this.card,
    required this.onChanged,
    required this.onAccept,
    required this.onSkip,
    required this.onEdit,
    super.key,
    this.busy = false,
    this.initiallyExpanded = false,
  });

  final SuggestionCard card;
  final ValueChanged<TemplatePayload> onChanged;
  final VoidCallback onAccept;
  final VoidCallback onSkip;
  final VoidCallback onEdit;
  final bool busy;
  final bool initiallyExpanded;

  @override
  State<SuggestionCardView> createState() => _SuggestionCardViewState();
}

class _SuggestionCardViewState extends State<SuggestionCardView> {
  late bool _expanded = widget.initiallyExpanded;

  SuggestionCard get card => widget.card;

  Future<void> _editText(String title, String value, TemplatePayload Function(String) apply, {int? maxLength}) async {
    final next = await showFieldEditor(context, title: title, initial: value, maxLength: maxLength);
    if (next != null && next != value) widget.onChanged(apply(next));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = card.payload;
    final palette = context.palette;
    final text = Theme.of(context).textTheme;
    final decided = card.status != CardStatus.pending;
    final accepted = card.status == CardStatus.accepted;
    final meta = [p.portionInfo, p.servingNote].where((s) => s.trim().isNotEmpty).join(' · ');
    final detailCounts = [
      if (p.optionGroups.isNotEmpty) l10n.detailGroups(p.optionGroups.length),
      if (p.removableIngredients.isNotEmpty) l10n.detailRemovables(p.removableIngredients.length),
      if (p.extraIngredients.isNotEmpty) l10n.detailExtras(p.extraIngredients.length),
    ].join(' · ');

    return AppCard(
      padding: EdgeInsets.zero,
      borderColor: accepted ? palette.success.withValues(alpha: 0.45) : null,
      child: Opacity(
        opacity: card.status == CardStatus.skipped ? 0.55 : 1,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpace.lg, 14, 6, 0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          GestureDetector(
                            onTap: decided ? null : () => _editText(l10n.productName, p.name, (v) => p.copyWith(name: v)),
                            child: Text(p.name, style: text.titleMedium?.copyWith(fontSize: 17)),
                          ),
                          if (card.rawName.trim().toLowerCase() != p.name.trim().toLowerCase())
                            Padding(
                              padding: const EdgeInsets.only(top: 2),
                              child: Text('“${card.rawName}”', style: text.bodySmall?.copyWith(color: palette.textFaint)),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Padding(padding: const EdgeInsets.only(top: 3), child: OriginBadge(origin: card.origin)),
                  CopyButton(text: p.name),
                ],
              ),
            ),
            if (card.needsReview)
              InlineNotice(
                card.reviewReason ?? l10n.reviewUnknown,
                tone: Tone.danger,
                icon: Icons.report_gmailerrorred_rounded,
                margin: const EdgeInsets.fromLTRB(AppSpace.lg, 10, AppSpace.lg, 0),
              ),
            _TextField(
              label: l10n.description,
              value: p.description,
              trailing: l10n.descriptionCounter(p.description.length),
              maxLines: _expanded ? null : 3,
              onTap: decided
                  ? null
                  : () => _editText(l10n.description, p.description, (v) => p.copyWith(description: v), maxLength: descriptionMaxLength),
            ),
            if (meta.isNotEmpty && !_expanded)
              Padding(
                padding: const EdgeInsets.fromLTRB(AppSpace.lg, 2, AppSpace.lg, 0),
                child: Text(meta, maxLines: 1, overflow: TextOverflow.ellipsis, style: text.bodySmall),
              ),
            _DetailsToggle(
              expanded: _expanded,
              summary: detailCounts,
              onTap: () => setState(() => _expanded = !_expanded),
            ),
            AnimatedSize(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOut,
              alignment: Alignment.topCenter,
              child: _expanded
                  ? Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _TextField(
                            label: l10n.portionInfo,
                            value: p.portionInfo,
                            onTap: decided ? null : () => _editText(l10n.portionInfo, p.portionInfo, (v) => p.copyWith(portionInfo: v)),
                          ),
                          _TextField(
                            label: l10n.servingNote,
                            value: p.servingNote,
                            onTap: decided ? null : () => _editText(l10n.servingNote, p.servingNote, (v) => p.copyWith(servingNote: v)),
                          ),
                          if (p.optionGroups.isNotEmpty) ...[
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
                              child: SectionLabel(l10n.optionGroups),
                            ),
                            for (final group in p.optionGroups) _GroupTile(group: group),
                          ],
                          _Chips(label: l10n.removables, values: p.removableIngredients),
                          _Chips(label: l10n.extras, values: p.extraIngredients.map((e) => '${e.name} (${e.priceHint})').toList()),
                          _Chips(label: l10n.tags, values: p.tags),
                          _Chips(label: l10n.allergens, values: p.allergenNotes),
                          _TextField(
                            label: l10n.upsell,
                            value: p.upsellSuggestion,
                            onTap: decided ? null : () => _editText(l10n.upsell, p.upsellSuggestion, (v) => p.copyWith(upsellSuggestion: v)),
                          ),
                        ],
                      ),
                    )
                  : const SizedBox(width: double.infinity),
            ),
            Divider(height: 1, color: palette.border),
            Padding(
              padding: const EdgeInsets.fromLTRB(6, 6, 10, 6),
              child: Row(
                children: [
                  Flexible(
                    child: Tooltip(
                      message: l10n.copyAll,
                      child: TextButton.icon(
                        key: const Key('card-copy-all'),
                        onPressed: () => copyToClipboard(context, formatCard(l10n, p)),
                        icon: const Icon(Icons.copy_all_rounded, size: 18),
                        label: Text(l10n.copy, overflow: TextOverflow.ellipsis),
                        style: TextButton.styleFrom(foregroundColor: palette.textMuted),
                      ),
                    ),
                  ),
                  const Spacer(),
                  if (decided)
                    Pill(
                      '${accepted ? l10n.accepted : l10n.skipped}${card.queued ? ' · ${l10n.queuedShort}' : ''}',
                      tone: accepted ? Tone.success : Tone.neutral,
                      icon: accepted ? Icons.check_rounded : Icons.remove_rounded,
                    )
                  else ...[
                    IconButton(
                      tooltip: l10n.skip,
                      onPressed: widget.busy ? null : widget.onSkip,
                      icon: const Icon(Icons.do_not_disturb_on_outlined),
                    ),
                    IconButton(
                      tooltip: l10n.edit,
                      onPressed: widget.busy ? null : widget.onEdit,
                      icon: const Icon(Icons.edit_outlined),
                    ),
                    const SizedBox(width: 4),
                    FilledButton.icon(
                      key: const Key('card-accept'),
                      style: FilledButton.styleFrom(minimumSize: const Size(0, 44), padding: const EdgeInsets.symmetric(horizontal: 16)),
                      onPressed: widget.busy ? null : widget.onAccept,
                      icon: widget.busy
                          ? SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: palette.textFaint))
                          : const Icon(Icons.check_rounded, size: 18),
                      label: Text(l10n.accept),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailsToggle extends StatelessWidget {
  const _DetailsToggle({required this.expanded, required this.summary, required this.onTap});

  final bool expanded;
  final String summary;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    return InkWell(
      key: const Key('card-details'),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(AppSpace.lg, 10, 12, 10),
        child: Row(
          children: [
            Text(expanded ? l10n.hideDetails : l10n.showDetails, style: text.labelMedium?.copyWith(color: p.accentText)),
            if (summary.isNotEmpty && !expanded) ...[
              const SizedBox(width: 8),
              Expanded(child: Text(summary, maxLines: 1, overflow: TextOverflow.ellipsis, style: text.bodySmall?.copyWith(color: p.textFaint))),
            ] else
              const Spacer(),
            AnimatedRotation(
              turns: expanded ? 0.5 : 0,
              duration: const Duration(milliseconds: 200),
              child: Icon(Icons.expand_more_rounded, size: 20, color: p.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}

class _TextField extends StatelessWidget {
  const _TextField({required this.label, required this.value, this.onTap, this.trailing, this.maxLines});

  final String label;
  final String value;
  final VoidCallback? onTap;
  final String? trailing;
  final int? maxLines;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    if (value.trim().isEmpty && onTap == null) return const SizedBox.shrink();
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(AppSpace.lg, 10, 6, 0),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(label, style: text.labelSmall),
                      if (trailing != null) ...[
                        const SizedBox(width: 6),
                        Text(trailing!, style: text.labelSmall?.copyWith(fontWeight: FontWeight.w600, fontFeatures: tabularFigures)),
                      ],
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    value.trim().isEmpty ? '—' : value,
                    maxLines: maxLines,
                    overflow: maxLines == null ? null : TextOverflow.ellipsis,
                    style: value.trim().isEmpty ? text.bodyMedium?.copyWith(color: p.textFaint) : text.bodyMedium,
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
    final p = context.palette;
    final kind = group.selectionType == SelectionType.single ? l10n.singleChoice : l10n.multiChoice(group.maxSelect);
    final required = group.isRequired ? l10n.required : l10n.optional;
    return ExpansionTile(
      tilePadding: const EdgeInsets.only(left: AppSpace.lg, right: 6),
      childrenPadding: const EdgeInsets.fromLTRB(AppSpace.lg, 0, AppSpace.lg, 10),
      dense: true,
      title: Text('${group.name} · ${group.options.length}', style: Theme.of(context).textTheme.titleSmall),
      subtitle: Text('$kind · $required', style: Theme.of(context).textTheme.bodySmall),
      trailing: CopyButton(text: formatGroupOptions(group)),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final option in group.options)
                Chip(
                  label: Text('${option.name} · ${priceHint(l10n, option.priceMode)}${option.isDefault ? ' · ${l10n.defaultOption}' : ''}'),
                  backgroundColor: switch (option.priceMode) {
                    PriceMode.setsBase => p.amber.withValues(alpha: 0.12),
                    PriceMode.surcharge => p.accentSoft,
                    PriceMode.free => null,
                  },
                ),
            ],
          ),
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
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpace.lg, 0, 6, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionLabel(label, trailing: CopyButton(text: values.join(', '))),
          Wrap(spacing: 6, runSpacing: 6, children: [for (final v in values) Chip(label: Text(v))]),
        ],
      ),
    );
  }
}
