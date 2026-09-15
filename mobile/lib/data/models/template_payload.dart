import 'package:collection/collection.dart';

import 'json.dart';

/// free: ücretsiz · surcharge: ek ücretli · setsBase: seçilince ürünün taban fiyatını belirler (ör. Boy).
enum PriceMode {
  free('free'),
  surcharge('surcharge'),
  setsBase('sets_base');

  const PriceMode(this.wire);
  final String wire;

  static PriceMode fromWire(String value) =>
      PriceMode.values.firstWhereOrNull((m) => m.wire == value) ?? PriceMode.free;
}

enum SelectionType {
  single,
  multi;

  static SelectionType fromWire(String value) => value == 'multi' ? SelectionType.multi : SelectionType.single;
}

class TemplateOption {
  const TemplateOption({required this.name, this.priceMode = PriceMode.free, this.isDefault = false});

  factory TemplateOption.fromJson(Json json) => TemplateOption(
        name: json.str('name'),
        priceMode: PriceMode.fromWire(json.str('priceMode')),
        isDefault: json.boolean('isDefault'),
      );

  final String name;
  final PriceMode priceMode;
  final bool isDefault;

  Json toJson() => {'name': name, 'priceMode': priceMode.wire, 'isDefault': isDefault};

  TemplateOption copyWith({String? name, PriceMode? priceMode, bool? isDefault}) => TemplateOption(
        name: name ?? this.name,
        priceMode: priceMode ?? this.priceMode,
        isDefault: isDefault ?? this.isDefault,
      );

  @override
  bool operator ==(Object other) =>
      other is TemplateOption && other.name == name && other.priceMode == priceMode && other.isDefault == isDefault;

  @override
  int get hashCode => Object.hash(name, priceMode, isDefault);
}

class OptionGroup {
  const OptionGroup({
    required this.name,
    this.selectionType = SelectionType.single,
    this.isRequired = false,
    this.minSelect = 0,
    this.maxSelect = 1,
    this.options = const [],
  });

  factory OptionGroup.fromJson(Json json) => OptionGroup(
        name: json.str('name'),
        selectionType: SelectionType.fromWire(json.str('selectionType')),
        isRequired: json.boolean('isRequired'),
        minSelect: json.integer('minSelect'),
        maxSelect: json.integer('maxSelect', 1),
        options: json.objects('options').map(TemplateOption.fromJson).toList(),
      );

  final String name;
  final SelectionType selectionType;
  final bool isRequired;
  final int minSelect;
  final int maxSelect;
  final List<TemplateOption> options;

  bool get setsBase => options.any((o) => o.priceMode == PriceMode.setsBase);

  Json toJson() => {
        'name': name,
        'selectionType': selectionType.name,
        'isRequired': isRequired,
        'minSelect': minSelect,
        'maxSelect': maxSelect,
        'options': options.map((o) => o.toJson()).toList(),
      };

  OptionGroup copyWith({
    String? name,
    SelectionType? selectionType,
    bool? isRequired,
    int? minSelect,
    int? maxSelect,
    List<TemplateOption>? options,
  }) =>
      OptionGroup(
        name: name ?? this.name,
        selectionType: selectionType ?? this.selectionType,
        isRequired: isRequired ?? this.isRequired,
        minSelect: minSelect ?? this.minSelect,
        maxSelect: maxSelect ?? this.maxSelect,
        options: options ?? this.options,
      );

  /// Keeps min/max consistent with the backend rules (single → max 1, required → min ≥ 1, max ≤ options).
  OptionGroup normalized() {
    final count = options.isEmpty ? 1 : options.length;
    final max = selectionType == SelectionType.single ? 1 : maxSelect.clamp(1, count);
    final min = isRequired ? minSelect.clamp(1, max) : 0;
    final base = setsBase;
    return copyWith(
      selectionType: base ? SelectionType.single : selectionType,
      isRequired: base ? true : isRequired,
      minSelect: base ? 1 : min,
      maxSelect: base ? 1 : max,
      options: base ? options.map((o) => o.copyWith(priceMode: PriceMode.setsBase)).toList() : options,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is OptionGroup &&
      other.name == name &&
      other.selectionType == selectionType &&
      other.isRequired == isRequired &&
      other.minSelect == minSelect &&
      other.maxSelect == maxSelect &&
      const ListEquality<TemplateOption>().equals(other.options, options);

  @override
  int get hashCode => Object.hash(name, selectionType, isRequired, minSelect, maxSelect, Object.hashAll(options));
}

class ExtraIngredient {
  const ExtraIngredient({required this.name, this.priceHint = 'ek ücretli'});

  factory ExtraIngredient.fromJson(Json json) =>
      ExtraIngredient(name: json.str('name'), priceHint: json.str('priceHint', 'ek ücretli'));

  final String name;
  final String priceHint;

  Json toJson() => {'name': name, 'priceHint': priceHint};

  @override
  bool operator ==(Object other) => other is ExtraIngredient && other.name == name && other.priceHint == priceHint;

  @override
  int get hashCode => Object.hash(name, priceHint);
}

const int descriptionMaxLength = 160;

/// A product card / template (mirrors the backend TemplatePayload; camelCase JSON).
class TemplatePayload {
  const TemplatePayload({
    required this.name,
    this.description = '',
    this.servingNote = '',
    this.portionInfo = '',
    this.optionGroups = const [],
    this.removableIngredients = const [],
    this.extraIngredients = const [],
    this.tags = const [],
    this.allergenNotes = const [],
    this.upsellSuggestion = '',
  });

  factory TemplatePayload.fromJson(Json json) => TemplatePayload(
        name: json.str('name'),
        description: json.str('description'),
        servingNote: json.str('servingNote'),
        portionInfo: json.str('portionInfo'),
        optionGroups: json.objects('optionGroups').map(OptionGroup.fromJson).toList(),
        removableIngredients: json.strings('removableIngredients'),
        extraIngredients: json.objects('extraIngredients').map(ExtraIngredient.fromJson).toList(),
        tags: json.strings('tags'),
        allergenNotes: json.strings('allergenNotes'),
        upsellSuggestion: json.str('upsellSuggestion'),
      );

  final String name;
  final String description;
  final String servingNote;
  final String portionInfo;
  final List<OptionGroup> optionGroups;
  final List<String> removableIngredients;
  final List<ExtraIngredient> extraIngredients;
  final List<String> tags;
  final List<String> allergenNotes;
  final String upsellSuggestion;

  /// The backend refuses to save a card without a description and without option groups.
  bool get hasContent => description.trim().isNotEmpty || optionGroups.isNotEmpty;

  Json toJson() => {
        'name': name,
        'description': description,
        'servingNote': servingNote,
        'portionInfo': portionInfo,
        'optionGroups': optionGroups.map((g) => g.toJson()).toList(),
        'removableIngredients': removableIngredients,
        'extraIngredients': extraIngredients.map((e) => e.toJson()).toList(),
        'tags': tags,
        'allergenNotes': allergenNotes,
        'upsellSuggestion': upsellSuggestion,
      };

  TemplatePayload copyWith({
    String? name,
    String? description,
    String? servingNote,
    String? portionInfo,
    List<OptionGroup>? optionGroups,
    List<String>? removableIngredients,
    List<ExtraIngredient>? extraIngredients,
    List<String>? tags,
    List<String>? allergenNotes,
    String? upsellSuggestion,
  }) =>
      TemplatePayload(
        name: name ?? this.name,
        description: description ?? this.description,
        servingNote: servingNote ?? this.servingNote,
        portionInfo: portionInfo ?? this.portionInfo,
        optionGroups: optionGroups ?? this.optionGroups,
        removableIngredients: removableIngredients ?? this.removableIngredients,
        extraIngredients: extraIngredients ?? this.extraIngredients,
        tags: tags ?? this.tags,
        allergenNotes: allergenNotes ?? this.allergenNotes,
        upsellSuggestion: upsellSuggestion ?? this.upsellSuggestion,
      );

  /// Normalized copy ready for the API (trimmed, description clamped, groups consistent, one base-price group).
  TemplatePayload normalized() {
    var baseSeen = false;
    final groups = <OptionGroup>[];
    for (final group in optionGroups) {
      final options = group.options.where((o) => o.name.trim().isNotEmpty).map((o) => o.copyWith(name: o.name.trim())).toList();
      if (group.name.trim().isEmpty || options.isEmpty) continue;
      var next = group.copyWith(name: group.name.trim(), options: options);
      if (next.setsBase) {
        if (baseSeen) {
          next = next.copyWith(
            options: next.options
                .map((o) => o.priceMode == PriceMode.setsBase ? o.copyWith(priceMode: PriceMode.surcharge) : o)
                .toList(),
          );
        }
        baseSeen = baseSeen || next.setsBase;
      }
      groups.add(next.normalized());
    }
    final desc = description.trim();
    return copyWith(
      name: name.trim(),
      description: desc.length > descriptionMaxLength ? desc.substring(0, descriptionMaxLength) : desc,
      servingNote: servingNote.trim(),
      portionInfo: portionInfo.trim(),
      optionGroups: groups,
      removableIngredients: _cleanList(removableIngredients),
      extraIngredients: extraIngredients.where((e) => e.name.trim().isNotEmpty).toList(),
      tags: _cleanList(tags),
      allergenNotes: _cleanList(allergenNotes),
      upsellSuggestion: upsellSuggestion.trim(),
    );
  }

  static List<String> _cleanList(List<String> values) {
    final seen = <String>{};
    return [
      for (final v in values.map((e) => e.trim()))
        if (v.isNotEmpty && seen.add(v.toLowerCase())) v,
    ];
  }

  @override
  bool operator ==(Object other) =>
      other is TemplatePayload &&
      other.name == name &&
      other.description == description &&
      other.servingNote == servingNote &&
      other.portionInfo == portionInfo &&
      const ListEquality<OptionGroup>().equals(other.optionGroups, optionGroups) &&
      const ListEquality<String>().equals(other.removableIngredients, removableIngredients) &&
      const ListEquality<ExtraIngredient>().equals(other.extraIngredients, extraIngredients) &&
      const ListEquality<String>().equals(other.tags, tags) &&
      const ListEquality<String>().equals(other.allergenNotes, allergenNotes) &&
      other.upsellSuggestion == upsellSuggestion;

  @override
  int get hashCode => Object.hash(
        name,
        description,
        servingNote,
        portionInfo,
        Object.hashAll(optionGroups),
        Object.hashAll(removableIngredients),
        Object.hashAll(extraIngredients),
        Object.hashAll(tags),
        Object.hashAll(allergenNotes),
        upsellSuggestion,
      );
}
