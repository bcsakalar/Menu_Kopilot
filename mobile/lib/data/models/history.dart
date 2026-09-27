import 'json.dart';

/// One analysis in the server's history (D-193): when it ran, for which kitchen, in which mode, and what it produced.
class HistoryItem {
  const HistoryItem({
    required this.runId,
    required this.createdAt,
    required this.status,
    this.finishedAt,
    this.mode,
    this.cuisineId,
    this.cuisineName = '',
    this.productNames = const [],
    this.menuCount = 0,
    this.newProducts = 0,
    this.menuCards = 0,
    this.accepted = 0,
    this.skipped = 0,
    this.later = 0,
    this.current,
    this.target,
  });

  factory HistoryItem.fromJson(Json json) => HistoryItem(
        runId: json.str('runId'),
        createdAt: DateTime.tryParse(json.str('createdAt'))?.toLocal() ?? DateTime.now(),
        finishedAt: DateTime.tryParse(json.str('finishedAt'))?.toLocal(),
        status: json.str('status', 'completed'),
        mode: json.strOrNull('mode'),
        cuisineId: json.strOrNull('cuisineId'),
        cuisineName: json.str('cuisineName'),
        productNames: json.strings('productNames'),
        menuCount: json.integer('menuCount'),
        newProducts: json.integer('newProducts'),
        menuCards: json.integer('menuCards'),
        accepted: json.integer('accepted'),
        skipped: json.integer('skipped'),
        later: json.integer('later'),
        current: json.intOrNull('current'),
        target: json.intOrNull('target'),
      );

  final String runId;
  final DateTime createdAt;
  final DateTime? finishedAt;
  final String status;
  final String? mode;
  final String? cuisineId;
  final String cuisineName;
  final List<String> productNames;
  final int menuCount;
  final int newProducts;
  final int menuCards;
  final int accepted;
  final int skipped;

  /// The seller's "Düşünecek" answers (D-196); accepted is "Evet", skipped is "Hayır".
  final int later;
  final int? current;
  final int? target;
}

class HistoryPage {
  const HistoryPage({required this.items, this.nextBefore});

  factory HistoryPage.fromJson(Json json) => HistoryPage(
        items: json.objects('items').map(HistoryItem.fromJson).toList(),
        nextBefore: json.strOrNull('nextBefore'),
      );

  final List<HistoryItem> items;

  /// Pass back as `before` for the next page; null on the last one.
  final String? nextBefore;
}

/// A product sellers kept saying "Hayır" to in one kitchen; it goes to the back of the list there (D-194, D-196).
class LearnedProduct {
  const LearnedProduct({
    required this.cuisineId,
    required this.cuisineName,
    required this.name,
    required this.removed,
    required this.accepted,
    required this.lastAt,
  });

  factory LearnedProduct.fromJson(Json json) => LearnedProduct(
        cuisineId: json.str('cuisineId'),
        cuisineName: json.str('cuisineName'),
        name: json.str('name'),
        removed: json.integer('removed'),
        accepted: json.integer('accepted'),
        lastAt: DateTime.tryParse(json.str('lastAt'))?.toLocal() ?? DateTime.now(),
      );

  final String cuisineId;
  final String cuisineName;
  final String name;
  final int removed;
  final int accepted;
  final DateTime lastAt;
}

enum LearnedKind {
  optionGroup('option_group'),
  removable('removable'),
  extra('extra');

  const LearnedKind(this.wire);
  final String wire;

  static LearnedKind parse(String value) => values.firstWhere((k) => k.wire == value, orElse: () => LearnedKind.extra);
}

/// A card suggestion (a group, a removable, an extra) the team kept deleting for one kind of product.
class LearnedSuggestion {
  const LearnedSuggestion({
    required this.productType,
    required this.productTypeLabel,
    required this.kind,
    required this.value,
    required this.removed,
    required this.accepted,
    required this.lastAt,
  });

  factory LearnedSuggestion.fromJson(Json json) => LearnedSuggestion(
        productType: json.str('productType'),
        productTypeLabel: json.str('productTypeLabel'),
        kind: LearnedKind.parse(json.str('kind')),
        value: json.str('value'),
        removed: json.integer('removed'),
        accepted: json.integer('accepted'),
        lastAt: DateTime.tryParse(json.str('lastAt'))?.toLocal() ?? DateTime.now(),
      );

  final String productType;
  final String productTypeLabel;
  final LearnedKind kind;
  final String value;
  final int removed;
  final int accepted;
  final DateTime lastAt;
}

class LearningResult {
  const LearningResult({this.products = const [], this.suggestions = const []});

  factory LearningResult.fromJson(Json json) => LearningResult(
        products: json.objects('products').map(LearnedProduct.fromJson).toList(),
        suggestions: json.objects('suggestions').map(LearnedSuggestion.fromJson).toList(),
      );

  final List<LearnedProduct> products;
  final List<LearnedSuggestion> suggestions;

  bool get isEmpty => products.isEmpty && suggestions.isEmpty;
}
