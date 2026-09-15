import '../../data/models/template_payload.dart';

/// Plain-text renderings used by the copy buttons (the user pastes them into the partner panel by hand).

String priceHint(PriceMode mode) => switch (mode) {
      PriceMode.free => 'ücretsiz',
      PriceMode.surcharge => 'ek ücretli',
      PriceMode.setsBase => 'tabanı belirler',
    };

String formatGroup(OptionGroup group) {
  final kind = group.selectionType == SelectionType.single ? 'tek seçim' : 'çoklu seçim, en fazla ${group.maxSelect}';
  final required = group.isRequired ? 'zorunlu' : 'isteğe bağlı';
  final options = group.options
      .map((o) => '${o.name}${o.isDefault ? ' (varsayılan)' : ''} [${priceHint(o.priceMode)}]')
      .join(', ');
  return '${group.name} ($kind, $required): $options';
}

/// Option names only, one per line — the fastest thing to paste into an options form.
String formatGroupOptions(OptionGroup group) => group.options.map((o) => o.name).join('\n');

String formatCard(TemplatePayload p) {
  final lines = <String>[p.name];
  void add(String label, String value) {
    if (value.trim().isNotEmpty) lines.add('$label: ${value.trim()}');
  }

  add('Açıklama', p.description);
  add('Porsiyon', p.portionInfo);
  add('Servis', p.servingNote);
  if (p.optionGroups.isNotEmpty) {
    lines.add('Opsiyonlar:');
    lines.addAll(p.optionGroups.map((g) => '- ${formatGroup(g)}'));
  }
  add('Çıkarılabilir', p.removableIngredients.join(', '));
  add('Ekstra', p.extraIngredients.map((e) => '${e.name} (${e.priceHint})').join(', '));
  add('Etiketler', p.tags.join(', '));
  add('Alerjen', p.allergenNotes.join(', '));
  add('Öneri', p.upsellSuggestion);
  return lines.join('\n');
}
