import 'package:flutter/material.dart';

import '../../core/design/components.dart';
import '../../core/design/tokens.dart';
import '../../core/utils/haptics.dart';
import '../../core/widgets/common.dart';
import '../../data/models/analysis.dart';
import '../../data/models/template_payload.dart';
import '../../l10n/gen/app_localizations.dart';

/// One product, one card — the only card of the result screen (D-184).
///
/// Four sections in the order the panel asks for them: Opsiyonlar, Çıkarılabilir malzemeler, Ekstra malzemeler,
/// Açıklama. Every suggestion is a chip that is KEPT until tapped; one tap takes it out, a second brings it back.
/// "Hepsini kabul et" saves what is left. Each section has its own "Kopyala". Nothing on the card needs a second
/// screen, and nothing on it is a technical word.

/// Below this confidence a card says "Kontrol et": the suggestions are generic for the product type.
const int lowConfidence = 60;

/// "1 Porsiyon · tabanı belirler": the price effect of a choice, in words. Amounts are never suggested.
String optionLabel(AppLocalizations l10n, TemplateOption option) => switch (option.priceMode) {
      PriceMode.free => option.name,
      PriceMode.surcharge => '${option.name} · ${l10n.priceSurcharge}',
      PriceMode.setsBase => '${option.name} · ${l10n.priceSetsBase}',
    };

/// Copy text of each section, as the user kept it.
String optionsCopyText(AppLocalizations l10n, List<OptionGroup> groups) => [
      for (final group in groups)
        '${group.name} (${group.selectionType == SelectionType.multi ? l10n.copyMultiChoice(group.maxSelect) : l10n.singleChoice}, '
            '${group.isRequired ? l10n.required : l10n.optional}): '
            '${group.options.map((o) => optionLabel(l10n, o)).join(', ')}',
    ].join('\n');

String listCopyText(List<String> items) => items.join(', ');

class ProductCard extends StatelessWidget {
  const ProductCard({
    required this.card,
    required this.title,
    required this.removed,
    required this.busy,
    required this.onToggle,
    required this.onAccept,
    required this.onSkip,
    this.notes = const [],
    this.onNoteDone,
    this.onEdit,
    super.key,
  });

  /// The suggestion card; null for a product that only has notes (a better name, a wrong section).
  final AnalysisCard? card;
  final String title;
  final Set<String> removed;
  final bool busy;
  final void Function(String key) onToggle;
  final VoidCallback onAccept;
  final VoidCallback onSkip;
  final List<AnalysisCard> notes;
  final void Function(AnalysisCard note)? onNoteDone;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final card = this.card;
    final decided = card != null && !card.isPending;
    final isNew = card?.section == CardSection.newProduct;

    return AppCard(
      key: card == null ? null : ValueKey('product-${card.id}'),
      borderColor: decided ? p.border : (isNew ? p.accent.withValues(alpha: 0.55) : null),
      padding: const EdgeInsets.fromLTRB(AppSpace.lg, 14, AppSpace.lg, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Header(card: card, title: title, onEdit: decided ? null : onEdit),
          for (final note in notes) _NoteRow(note: note, onDone: onNoteDone == null ? null : () => onNoteDone!(note)),
          if (card != null) ...[
            if (card.isPlainRow)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(l10n.plainProduct, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: p.textMuted)),
              )
            else
              _Sections(card: card, removed: removed, enabled: !decided && !busy, onToggle: onToggle),
            const SizedBox(height: 12),
            _Actions(card: card, removed: removed, busy: busy, onAccept: onAccept, onSkip: onSkip),
          ],
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.card, required this.title, required this.onEdit});

  final AnalysisCard? card;
  final String title;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final card = this.card;
    final skipped = card?.status == CardStatus.skipped;
    final details = [
      if (card?.categoryLabel != null) card!.categoryLabel!,
      if (card != null && card.portionInfo.isNotEmpty) l10n.portionLine(card.portionInfo),
    ].join(' · ');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                title,
                style: text.titleLarge?.copyWith(
                  fontSize: 19,
                  fontWeight: FontWeight.w700,
                  color: skipped ? p.textMuted : p.text,
                  decoration: skipped ? TextDecoration.lineThrough : null,
                ),
              ),
            ),
            if (onEdit != null)
              IconButton(
                key: const Key('edit-card'),
                onPressed: onEdit,
                icon: const Icon(Icons.edit_outlined, size: 20),
                tooltip: l10n.edit,
              ),
          ],
        ),
        const SizedBox(height: 4),
        Wrap(
          spacing: 6,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (card != null)
              Pill(
                card.section == CardSection.newProduct ? l10n.newProductBadge : l10n.onMenuBadge,
                tone: card.section == CardSection.newProduct ? Tone.accent : Tone.neutral,
              ),
            if (card != null && card.isPending && (card.confidence ?? 100) < lowConfidence)
              Pill(l10n.checkThis, tone: Tone.amber, icon: Icons.visibility_outlined),
            if (card?.status == CardStatus.accepted) Pill(l10n.acceptedDone, tone: Tone.success, icon: Icons.check_rounded),
            if (skipped) Pill(l10n.skippedDone, tone: Tone.neutral),
            if (card?.queued ?? false) Pill(l10n.queuedBadge, tone: Tone.amber, icon: Icons.cloud_upload_outlined),
            if (details.isNotEmpty) Text(details, style: text.bodyMedium?.copyWith(color: p.textMuted)),
          ],
        ),
        if (card != null && card.section == CardSection.newProduct && card.priceRangeHint.isNotEmpty && card.isPending)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(l10n.priceAsk(card.priceRangeHint), style: text.bodyMedium?.copyWith(color: p.textMuted)),
          ),
      ],
    );
  }
}

/// A note about a product on the menu: a better name, a section it may not belong to. Ticked off with "Tamam".
class _NoteRow extends StatelessWidget {
  const _NoteRow({required this.note, required this.onDone});

  final AnalysisCard note;
  final VoidCallback? onDone;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final done = !note.isPending;
    final message = switch (note.fixKind) {
      FixKind.badName when note.suggestedValue != null => l10n.noteRename(note.suggestedValue!),
      FixKind.badName => l10n.noteAbbreviated,
      FixKind.wrongCategory => l10n.noteCategory(note.currentValue ?? '', note.suggestedValue ?? ''),
      _ => note.reason,
    };
    return InlineNotice(
      message,
      icon: done ? Icons.check_circle_outline_rounded : Icons.lightbulb_outline_rounded,
      tone: done ? Tone.neutral : Tone.amber,
      margin: const EdgeInsets.only(top: 10),
      action: done
          ? null
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (note.suggestedValue != null && note.fixKind == FixKind.badName) CopyButton(text: note.suggestedValue!),
                TextButton(key: ValueKey('note-done-${note.id}'), onPressed: onDone, child: Text(l10n.noteDone)),
              ],
            ),
    );
  }
}

class _Sections extends StatelessWidget {
  const _Sections({required this.card, required this.removed, required this.enabled, required this.onToggle});

  final AnalysisCard card;
  final Set<String> removed;
  final bool enabled;
  final void Function(String key) onToggle;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final content = card.content;
    final kept = card.kept(removed);
    // A product on the menu gets every section the panel lacks; an empty one means the panel already has it.
    final none = card.section == CardSection.option ? l10n.panelHasIt : l10n.noSuggestion;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _SectionBlock(
          key: const Key('section-options'),
          icon: Icons.tune_rounded,
          title: l10n.sectionOptionsTitle,
          copyText: optionsCopyText(l10n, kept.optionGroups),
          empty: content.optionGroups.isEmpty ? none : null,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final group in content.optionGroups)
                _GroupBlock(group: group, removed: removed, enabled: enabled, onToggle: onToggle),
            ],
          ),
        ),
        _SectionBlock(
          key: const Key('section-removables'),
          icon: Icons.remove_circle_outline_rounded,
          title: l10n.sectionRemovablesTitle,
          copyText: listCopyText(kept.removableIngredients),
          empty: content.removableIngredients.isEmpty ? none : null,
          child: _ChipWrap(
            items: [
              for (final name in content.removableIngredients) (key: ItemKey.removable(name), label: name),
            ],
            removed: removed,
            enabled: enabled,
            onToggle: onToggle,
          ),
        ),
        _SectionBlock(
          key: const Key('section-extras'),
          icon: Icons.add_circle_outline_rounded,
          title: l10n.sectionExtrasTitle,
          copyText: listCopyText(kept.extraIngredients.map((e) => e.name).toList()),
          empty: content.extraIngredients.isEmpty ? none : null,
          child: _ChipWrap(
            items: [
              for (final extra in content.extraIngredients) (key: ItemKey.extra(extra.name), label: extra.name),
            ],
            removed: removed,
            enabled: enabled,
            onToggle: onToggle,
          ),
        ),
        _SectionBlock(
          key: const Key('section-description'),
          icon: Icons.notes_rounded,
          title: l10n.sectionDescriptionTitle,
          copyText: kept.description,
          empty: content.description.trim().isEmpty ? none : null,
          child: _DescriptionChip(
            text: content.description,
            removed: removed.contains(ItemKey.description),
            enabled: enabled,
            onToggle: () => onToggle(ItemKey.description),
          ),
        ),
      ],
    );
  }
}

/// A titled block with its own "Kopyala".
class _SectionBlock extends StatelessWidget {
  const _SectionBlock({
    required this.icon,
    required this.title,
    required this.copyText,
    required this.child,
    this.empty,
    super.key,
  });

  final IconData icon;
  final String title;
  final String copyText;
  final Widget child;

  /// Shown instead of the content when the section has nothing.
  final String? empty;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.only(top: 10),
      decoration: BoxDecoration(border: Border(top: BorderSide(color: p.border))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: p.textMuted),
              const SizedBox(width: 8),
              Expanded(child: Text(title, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600))),
              if (empty == null)
                TextButton.icon(
                  onPressed: copyText.trim().isEmpty
                      ? null
                      : () {
                          Haptics.select();
                          copyToClipboard(context, copyText);
                        },
                  icon: const Icon(Icons.copy_rounded, size: 18),
                  label: Text(l10n.copy),
                  style: TextButton.styleFrom(minimumSize: const Size(48, 44)),
                ),
            ],
          ),
          if (empty != null)
            Padding(
              padding: const EdgeInsets.only(top: 2, bottom: 4),
              child: Text(empty!, style: text.bodyMedium?.copyWith(color: p.textFaint)),
            )
          else
            child,
        ],
      ),
    );
  }
}

/// One option group: its name and rule, a "grubu çıkar" switch, and its options as chips.
class _GroupBlock extends StatelessWidget {
  const _GroupBlock({required this.group, required this.removed, required this.enabled, required this.onToggle});

  final OptionGroup group;
  final Set<String> removed;
  final bool enabled;
  final void Function(String key) onToggle;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final groupKey = ItemKey.group(group.name);
    final off = removed.contains(groupKey);
    final rule = [
      group.selectionType == SelectionType.multi ? l10n.copyMultiChoice(group.maxSelect) : l10n.singleChoice,
      group.isRequired ? l10n.required : l10n.optional,
    ].join(' · ');

    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: group.name,
                        style: text.titleSmall?.copyWith(
                          fontSize: 15.5,
                          color: off ? p.textFaint : p.text,
                          decoration: off ? TextDecoration.lineThrough : null,
                        ),
                      ),
                      TextSpan(text: '  $rule', style: text.bodySmall?.copyWith(color: p.textFaint)),
                    ],
                  ),
                ),
              ),
              TextButton(
                key: ValueKey('group-${group.name}'),
                onPressed: enabled ? () => onToggle(groupKey) : null,
                style: TextButton.styleFrom(minimumSize: const Size(48, 44)),
                child: Text(off ? l10n.restoreGroup : l10n.removeGroup),
              ),
            ],
          ),
          if (!off)
            _ChipWrap(
              items: [
                for (final option in group.options) (key: ItemKey.option(group.name, option.name), label: optionLabel(l10n, option)),
              ],
              removed: removed,
              enabled: enabled,
              onToggle: onToggle,
            ),
        ],
      ),
    );
  }
}

/// Suggestions as chips: ticked = kept. One tap takes one out (struck through), another tap brings it back.
class _ChipWrap extends StatelessWidget {
  const _ChipWrap({required this.items, required this.removed, required this.enabled, required this.onToggle});

  final List<({String key, String label})> items;
  final Set<String> removed;
  final bool enabled;
  final void Function(String key) onToggle;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    return Wrap(
      spacing: 8,
      runSpacing: 6,
      children: [
        for (final item in items)
          FilterChip(
            key: ValueKey('chip-${item.key}'),
            selected: !removed.contains(item.key),
            showCheckmark: true,
            label: Text(
              item.label,
              style: text.bodyLarge?.copyWith(
                fontSize: 15,
                color: removed.contains(item.key) ? p.textFaint : p.text,
                decoration: removed.contains(item.key) ? TextDecoration.lineThrough : null,
              ),
            ),
            materialTapTargetSize: MaterialTapTargetSize.padded,
            onSelected: enabled
                ? (_) {
                    Haptics.select();
                    onToggle(item.key);
                  }
                : null,
          ),
      ],
    );
  }
}

/// The description, pasteable; tapping the switch next to it leaves it out.
class _DescriptionChip extends StatelessWidget {
  const _DescriptionChip({required this.text, required this.removed, required this.enabled, required this.onToggle});

  final String text;
  final bool removed;
  final bool enabled;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final style = Theme.of(context).textTheme.bodyLarge?.copyWith(
          fontSize: 16,
          height: 1.35,
          color: removed ? p.textFaint : p.text,
          decoration: removed ? TextDecoration.lineThrough : null,
        );
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Checkbox(
          key: const Key('description-toggle'),
          value: !removed,
          onChanged: enabled ? (_) => onToggle() : null,
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(top: 10),
            child: SelectableText(text, style: style),
          ),
        ),
      ],
    );
  }
}

class _Actions extends StatelessWidget {
  const _Actions({required this.card, required this.removed, required this.busy, required this.onAccept, required this.onSkip});

  final AnalysisCard card;
  final Set<String> removed;
  final bool busy;
  final VoidCallback onAccept;
  final VoidCallback onSkip;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (busy) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4))),
      );
    }
    if (!card.isPending) return const SizedBox.shrink();
    final isNew = card.section == CardSection.newProduct;
    final label = card.isPlainRow ? l10n.acceptPlain : (removed.isEmpty ? l10n.acceptAll : l10n.acceptKept);
    return Row(
      children: [
        TextButton(
          key: ValueKey('skip-${card.id}'),
          onPressed: onSkip,
          style: TextButton.styleFrom(minimumSize: const Size(64, 48)),
          child: Text(isNew ? l10n.dontSuggest : l10n.notNow),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: FilledButton.icon(
            key: ValueKey('accept-${card.id}'),
            onPressed: onAccept,
            icon: const Icon(Icons.check_rounded, size: 20),
            label: Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            style: FilledButton.styleFrom(minimumSize: const Size(0, 52)),
          ),
        ),
      ],
    );
  }
}
