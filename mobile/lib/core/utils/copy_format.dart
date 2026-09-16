import '../../data/models/template_payload.dart';
import '../../l10n/gen/app_localizations.dart';

/// Plain-text renderings used by the copy buttons (the user pastes them into the partner panel by hand).
/// Every word comes from the l10n file.

String priceHint(AppLocalizations l10n, PriceMode mode) => switch (mode) {
      PriceMode.free => l10n.priceFree,
      PriceMode.surcharge => l10n.priceSurcharge,
      PriceMode.setsBase => l10n.priceSetsBase,
    };

String formatGroup(AppLocalizations l10n, OptionGroup group) {
  final kind = group.selectionType == SelectionType.single ? l10n.singleChoice : l10n.copyMultiChoice(group.maxSelect);
  final required = group.isRequired ? l10n.required : l10n.optional;
  final options = group.options
      .map((o) => '${o.name}${o.isDefault ? ' (${l10n.defaultOption})' : ''} [${priceHint(l10n, o.priceMode)}]')
      .join(', ');
  return '${group.name} ($kind, $required): $options';
}

/// Option names only, one per line — the fastest thing to paste into an options form.
String formatGroupOptions(OptionGroup group) => group.options.map((o) => o.name).join('\n');

String formatCard(AppLocalizations l10n, TemplatePayload p) {
  final lines = <String>[p.name];
  void add(String label, String value) {
    if (value.trim().isNotEmpty) lines.add('$label: ${value.trim()}');
  }

  add(l10n.copyLabelDescription, p.description);
  add(l10n.copyLabelPortion, p.portionInfo);
  add(l10n.copyLabelServing, p.servingNote);
  if (p.optionGroups.isNotEmpty) {
    lines.add('${l10n.copyLabelOptions}:');
    lines.addAll(p.optionGroups.map((g) => '- ${formatGroup(l10n, g)}'));
  }
  add(l10n.copyLabelRemovables, p.removableIngredients.join(', '));
  add(l10n.copyLabelExtras, p.extraIngredients.map((e) => '${e.name} (${e.priceHint})').join(', '));
  add(l10n.copyLabelTags, p.tags.join(', '));
  add(l10n.copyLabelAllergens, p.allergenNotes.join(', '));
  add(l10n.copyLabelUpsell, p.upsellSuggestion);
  return lines.join('\n');
}
