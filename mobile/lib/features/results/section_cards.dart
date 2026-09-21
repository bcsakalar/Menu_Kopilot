import 'package:flutter/material.dart';

import '../../core/design/components.dart';
import '../../core/design/tokens.dart';
import '../../core/utils/copy_format.dart';
import '../../core/widgets/common.dart';
import '../../data/models/analysis.dart';
import '../../data/models/template_payload.dart';
import '../../l10n/gen/app_localizations.dart';

/// The three sections of the result screen, and the one card widget each of them uses.
///
/// Everything here is sized for a live phone call: the first line answers "what is this about?", the second is
/// the text to paste, and the actions sit where a thumb already is. No card needs a tap to reveal its point.

/// Colour and icon per section, so a glance down the list tells you which block you are in.
({Color colour, IconData icon, Tone tone}) sectionStyle(AppPalette p, CardSection section) => switch (section) {
      CardSection.newProduct => (colour: p.accentText, icon: Icons.add_circle_outline_rounded, tone: Tone.accent),
      CardSection.option => (colour: p.success, icon: Icons.tune_rounded, tone: Tone.success),
      CardSection.fix => (colour: p.amber, icon: Icons.edit_note_rounded, tone: Tone.amber),
    };

String sectionTitle(AppLocalizations l10n, CardSection section) => switch (section) {
      CardSection.newProduct => l10n.sectionNewProducts,
      CardSection.option => l10n.sectionOptions,
      CardSection.fix => l10n.sectionFixes,
    };

String sectionHint(AppLocalizations l10n, CardSection section) => switch (section) {
      CardSection.newProduct => l10n.sectionNewProductsHint,
      CardSection.option => l10n.sectionOptionsHint,
      CardSection.fix => l10n.sectionFixesHint,
    };

/// "Tam [tabanı belirler]" — the price effect of a choice, the panel's "fiyat farkı" field in words. Amounts are
/// never suggested: the restaurant states them on the call.
String optionWithPrice(AppLocalizations l10n, OptionChoice option) =>
    '${option.name} [${priceHint(l10n, PriceMode.fromWire(option.priceMode))}]';

/// Plain text of one card, for the copy button and the bulk copy.
String cardCopyText(AppLocalizations l10n, AnalysisCard card) {
  final lines = <String>[];
  switch (card.section) {
    case CardSection.newProduct:
      lines.add(card.name);
      if (card.shortDescription.isNotEmpty) lines.add(card.shortDescription);
      if (card.portionInfo.isNotEmpty) lines.add('${l10n.copyLabelPortion}: ${card.portionInfo}');
      if (card.categoryLabel != null) lines.add('${l10n.copyLabelCategory}: ${card.categoryLabel}');
      if (card.priceRangeHint.isNotEmpty) lines.add('${l10n.copyLabelPriceRange}: ${card.priceRangeHint}');
    case CardSection.option:
      lines.add(card.targetName ?? card.name);
      for (final group in card.optionGroups) {
        final kind = group.isMulti ? l10n.copyMultiChoice(group.maxSelect) : l10n.singleChoice;
        final need = group.isRequired ? l10n.required : l10n.optional;
        lines.add('- ${group.name} ($kind, $need): ${group.options.map((o) => optionWithPrice(l10n, o)).join(', ')}');
      }
      if (card.removableIngredients.isNotEmpty) {
        lines.add('${l10n.copyLabelRemovables}: ${card.removableIngredients.join(', ')}');
      }
      if (card.extraIngredients.isNotEmpty) {
        lines.add('${l10n.copyLabelExtras}: ${card.extraIngredients.join(', ')}');
      }
    case CardSection.fix:
      lines.add(card.targetName ?? card.name);
      if (card.suggestedValue != null) lines.add('→ ${card.suggestedValue}');
      if (card.reason.isNotEmpty) lines.add(card.reason);
  }
  return lines.join('\n');
}

String fixLabel(AppLocalizations l10n, FixKind? kind) => switch (kind) {
      FixKind.emptyDescription => l10n.fixEmptyDescription,
      FixKind.badName => l10n.fixBadName,
      FixKind.wrongCategory => l10n.fixWrongCategory,
      null => '',
    };

/// One card. The layout differs per section but the frame, the badges and the actions are shared.
class SectionCardView extends StatelessWidget {
  const SectionCardView({
    required this.card,
    required this.busy,
    required this.selected,
    required this.onToggleSelect,
    required this.onAccept,
    required this.onSkip,
    this.onEdit,
    super.key,
  });

  final AnalysisCard card;
  final bool busy;
  final bool selected;
  final VoidCallback onToggleSelect;
  final VoidCallback onAccept;
  final VoidCallback onSkip;

  /// New-product cards can be edited before they are added; option/fix cards are read-only.
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final style = sectionStyle(p, card.section);
    final decided = card.status != CardStatus.pending;

    return AppCard(
      borderColor: selected ? p.accent : (decided ? p.border : null),
      padding: const EdgeInsets.fromLTRB(AppSpace.lg, 12, AppSpace.sm, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Bulk selection: a tap target big enough to hit without looking.
              Semantics(
                checked: selected,
                label: l10n.selectCard,
                child: InkWell(
                  onTap: onToggleSelect,
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.only(right: 10, top: 2, bottom: 2),
                    child: Icon(
                      selected ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded,
                      size: 22,
                      color: selected ? p.accentText : p.textFaint,
                    ),
                  ),
                ),
              ),
              Expanded(child: _Heading(card: card, style: style, decided: decided)),
              CopyButton(text: cardCopyText(l10n, card)),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(left: 32, right: 8, top: 2),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Body(card: card),
                if (card.reason.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.info_outline_rounded, size: 14, color: p.textFaint),
                        const SizedBox(width: 6),
                        Expanded(child: Text(card.reason, style: text.bodySmall?.copyWith(color: p.textMuted))),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          _Actions(card: card, busy: busy, decided: decided, onAccept: onAccept, onSkip: onSkip, onEdit: onEdit),
        ],
      ),
    );
  }
}

/// Title line: for sections B and C the product the card belongs to comes FIRST and in bold — on the phone the
/// first question is always "hangi ürün için?".
class _Heading extends StatelessWidget {
  const _Heading({required this.card, required this.style, required this.decided});

  final AnalysisCard card;
  final ({Color colour, IconData icon, Tone tone}) style;
  final bool decided;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final title = card.section == CardSection.newProduct ? card.name : (card.targetName ?? card.name);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(style.icon, size: 16, color: style.colour),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                title,
                style: text.titleMedium?.copyWith(
                  fontSize: 17,
                  color: decided ? p.textMuted : p.text,
                  decoration: card.status == CardStatus.skipped ? TextDecoration.lineThrough : null,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 6,
          runSpacing: 4,
          children: [
            if (card.categoryLabel != null) Pill(card.categoryLabel!, tone: style.tone),
            if (card.section == CardSection.newProduct && card.priceRangeHint.isNotEmpty)
              Pill(card.priceRangeHint, tone: Tone.neutral, icon: Icons.sell_outlined),
            if (card.section == CardSection.fix) Pill(fixLabel(l10n, card.fixKind), tone: Tone.amber),
            OriginBadge(origin: card.origin),
            if (card.queued) Pill(l10n.queuedBadge, tone: Tone.amber, icon: Icons.cloud_upload_outlined),
            if (card.status == CardStatus.accepted) Pill(l10n.acceptedBadge, tone: Tone.success, icon: Icons.check_rounded),
          ],
        ),
      ],
    );
  }
}

/// The pasteable part of the card.
class _Body extends StatelessWidget {
  const _Body({required this.card});

  final AnalysisCard card;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;

    switch (card.section) {
      case CardSection.newProduct:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (card.shortDescription.isNotEmpty)
              SelectableText(card.shortDescription, style: text.bodyMedium, maxLines: 4),
            if (card.portionInfo.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('${l10n.copyLabelPortion}: ${card.portionInfo}', style: text.bodySmall?.copyWith(color: p.textMuted)),
              ),
          ],
        );

      case CardSection.option:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final group in card.optionGroups)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: _OptionGroupRow(group: group),
              ),
            if (card.removableIngredients.isNotEmpty)
              _IngredientRow(label: l10n.copyLabelRemovables, items: card.removableIngredients, icon: Icons.remove_circle_outline_rounded),
            if (card.extraIngredients.isNotEmpty)
              _IngredientRow(label: l10n.copyLabelExtras, items: card.extraIngredients, icon: Icons.add_circle_outline_rounded),
          ],
        );

      case CardSection.fix:
        final current = card.currentValue;
        final suggested = card.suggestedValue;
        if (current == null && suggested == null) {
          return Text(card.shortDescription, style: text.bodyMedium);
        }
        return Row(
          children: [
            if (current != null)
              Flexible(
                child: Text(
                  current,
                  style: text.bodyMedium?.copyWith(color: p.textMuted, decoration: TextDecoration.lineThrough),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            if (current != null && suggested != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Icon(Icons.arrow_forward_rounded, size: 15, color: p.textFaint),
              ),
            if (suggested != null)
              Flexible(
                child: SelectableText(suggested, style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
              ),
          ],
        );
    }
  }
}

/// One option group: name + rules on the first line, the choices on the second.
class _OptionGroupRow extends StatelessWidget {
  const _OptionGroupRow({required this.group});

  final OptionGroupSuggestion group;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final kind = group.isMulti ? l10n.copyMultiChoice(group.maxSelect) : l10n.singleChoice;
    final need = group.isRequired ? l10n.required : l10n.optional;
    // A price effect is spelled out on the pill; when no choice changes the price, once on the rule line.
    final allFree = group.options.every((o) => PriceMode.fromWire(o.priceMode) == PriceMode.free);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: Text(group.name, style: text.titleSmall)),
            Text(
              [kind, need, if (allFree) l10n.priceFree].join(' · '),
              style: text.bodySmall?.copyWith(color: p.textFaint),
            ),
            CopyButton(text: group.options.map((o) => o.name).join('\n'), tooltip: l10n.copyOptions),
          ],
        ),
        Wrap(
          spacing: 6,
          runSpacing: 4,
          children: [
            for (final option in group.options)
              switch (PriceMode.fromWire(option.priceMode)) {
                PriceMode.free => Pill(option.name),
                PriceMode.surcharge => Pill('${option.name} · ${l10n.priceSurcharge}', tone: Tone.amber),
                PriceMode.setsBase => Pill('${option.name} · ${l10n.priceSetsBase}', tone: Tone.accent),
              },
          ],
        ),
      ],
    );
  }
}

class _IngredientRow extends StatelessWidget {
  const _IngredientRow({required this.label, required this.items, required this.icon});

  final String label;
  final List<String> items;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 14, color: p.textFaint),
          const SizedBox(width: 6),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(text: '$label: ', style: text.bodySmall?.copyWith(color: p.textFaint)),
                  TextSpan(text: items.join(', '), style: text.bodySmall?.copyWith(color: p.textMuted)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Actions extends StatelessWidget {
  const _Actions({
    required this.card,
    required this.busy,
    required this.decided,
    required this.onAccept,
    required this.onSkip,
    required this.onEdit,
  });

  final AnalysisCard card;
  final bool busy;
  final bool decided;
  final VoidCallback onAccept;
  final VoidCallback onSkip;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (busy) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))),
      );
    }
    if (decided) return const SizedBox(height: 4);

    // "Ekle" writes to the pool; "Not al" only ticks a fix off the call list.
    final acceptLabel = card.section == CardSection.fix ? l10n.markDone : l10n.addCard;
    return Row(
      children: [
        // The secondary actions take the room that is left and wrap onto a second line on a narrow phone (360 dp),
        // so "Ekle" always stays where the thumb is.
        Expanded(
          child: Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (onEdit != null)
                TextButton.icon(onPressed: onEdit, icon: const Icon(Icons.edit_outlined, size: 17), label: Text(l10n.edit)),
              TextButton.icon(onPressed: onSkip, icon: const Icon(Icons.close_rounded, size: 17), label: Text(l10n.reject)),
            ],
          ),
        ),
        const SizedBox(width: 8),
        FilledButton.icon(
          onPressed: onAccept,
          icon: const Icon(Icons.check_rounded, size: 18),
          label: Text(acceptLabel),
          style: FilledButton.styleFrom(minimumSize: const Size(0, 38)),
        ),
      ],
    );
  }
}
