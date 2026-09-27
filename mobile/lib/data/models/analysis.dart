import 'package:collection/collection.dart';

import 'json.dart';
import 'template_payload.dart';

/// Which section of the result screen a card belongs to. The order here is the order on screen.
enum CardSection {
  /// A) Products the menu does not have at all.
  newProduct,

  /// B) Option groups / ingredients for a product already on the menu.
  option,

  /// C) Something empty or wrong on a product already on the menu.
  fix;

  static const _wire = {'new_product': CardSection.newProduct, 'option': CardSection.option, 'fix': CardSection.fix};

  static CardSection fromWire(String value) => _wire[value] ?? CardSection.newProduct;

  String get wire => _wire.entries.firstWhere((e) => e.value == this).key;
}

/// What a "düzeltme" card is about. Missing options are not a fix: they are section B's whole job.
enum FixKind {
  emptyDescription,
  badName,
  wrongCategory;

  static const _wire = {
    'empty_description': FixKind.emptyDescription,
    'bad_name': FixKind.badName,
    'wrong_category': FixKind.wrongCategory,
  };

  static FixKind? fromWire(String? value) => value == null ? null : _wire[value];
}

/// Where a card came from — drives the badge: Hazır şablon / DB'den / AI / İnceleme gerek.
enum CardOrigin {
  seed,
  db,
  ai,
  review;

  static CardOrigin fromWire(String value) => CardOrigin.values.firstWhereOrNull((o) => o.name == value) ?? CardOrigin.review;
}

/// The seller's answer on the call (D-196): accepted = "Evet", skipped = "Hayır", later = "Düşünecek".
enum CardStatus {
  pending,
  accepted,
  skipped,
  later;

  static CardStatus fromWire(String value) => CardStatus.values.firstWhereOrNull((s) => s.name == value) ?? CardStatus.pending;
}

class OptionChoice {
  const OptionChoice({required this.name, required this.priceMode});

  factory OptionChoice.fromJson(Json json) => OptionChoice(name: json.str('name'), priceMode: json.str('priceMode', 'free'));

  final String name;
  final String priceMode;

  Json toJson() => {'name': name, 'priceMode': priceMode};
}

class OptionGroupSuggestion {
  const OptionGroupSuggestion({
    required this.name,
    required this.selectionType,
    required this.isRequired,
    required this.minSelect,
    required this.maxSelect,
    required this.options,
  });

  factory OptionGroupSuggestion.fromJson(Json json) => OptionGroupSuggestion(
        name: json.str('name'),
        selectionType: json.str('selectionType', 'single'),
        isRequired: json.boolean('isRequired'),
        minSelect: json.integer('minSelect'),
        maxSelect: json.integer('maxSelect', 1),
        options: json.objects('options').map(OptionChoice.fromJson).toList(),
      );

  final String name;
  final String selectionType;
  final bool isRequired;
  final int minSelect;
  final int maxSelect;
  final List<OptionChoice> options;

  bool get isMulti => selectionType == 'multi';

  Json toJson() => {
        'name': name,
        'selectionType': selectionType,
        'isRequired': isRequired,
        'minSelect': minSelect,
        'maxSelect': maxSelect,
        'options': options.map((o) => o.toJson()).toList(),
      };
}

/// One card of the result screen. Every section uses the same shape; the unused fields stay empty.
class AnalysisCard {
  const AnalysisCard({
    required this.id,
    required this.runId,
    required this.section,
    required this.name,
    required this.origin,
    this.targetName,
    this.targetNormalized,
    this.categoryKey,
    this.categoryLabel,
    this.matchedTemplateId,
    this.shortDescription = '',
    this.portionInfo = '',
    this.priceRangeHint = '',
    this.reason = '',
    this.importance = 0,
    this.optionGroups = const [],
    this.removableIngredients = const [],
    this.extraIngredients = const [],
    this.fixKind,
    this.currentValue,
    this.suggestedValue,
    this.payload,
    this.productType,
    this.confidence,
    this.pitch = '',
    this.priority = 0,
    this.status = CardStatus.pending,
    this.sortOrder = 0,
    this.queued = false,
  });

  factory AnalysisCard.fromJson(Json json) => AnalysisCard(
        id: json.str('id'),
        runId: json.str('runId'),
        section: CardSection.fromWire(json.str('section')),
        name: json.str('name'),
        origin: CardOrigin.fromWire(json.str('source')),
        targetName: json.strOrNull('targetName'),
        targetNormalized: json.strOrNull('targetNormalized'),
        categoryKey: json.strOrNull('categoryKey'),
        categoryLabel: json.strOrNull('categoryLabel'),
        matchedTemplateId: json.strOrNull('matchedTemplateId'),
        shortDescription: json.str('shortDescription'),
        portionInfo: json.str('portionInfo'),
        priceRangeHint: json.str('priceRangeHint'),
        reason: json.str('reason'),
        importance: json.integer('importance'),
        optionGroups: json.objects('optionGroups').map(OptionGroupSuggestion.fromJson).toList(),
        removableIngredients: json.strings('removableIngredients'),
        extraIngredients: json.strings('extraIngredients'),
        fixKind: FixKind.fromWire(json.strOrNull('fixKind')),
        currentValue: json.strOrNull('currentValue'),
        suggestedValue: json.strOrNull('suggestedValue'),
        payload: json.object('payload') == null ? null : TemplatePayload.fromJson(json.object('payload')!),
        productType: json.strOrNull('productType'),
        confidence: json.intOrNull('confidence'),
        pitch: json.str('pitch'),
        priority: json.integer('priority'),
        status: CardStatus.fromWire(json.str('status')),
        sortOrder: json.integer('sortOrder'),
      );

  final String id;
  final String runId;
  final CardSection section;

  /// Section A: the proposed product. Sections B/C: the product the card is about (canonical spelling).
  final String name;
  final CardOrigin origin;

  /// Sections B/C: the product as it appears on the panel.
  final String? targetName;

  /// Sections B/C: the join key to the menu list (`AnalysisMenuItem.normalized`).
  final String? targetNormalized;
  final String? categoryKey;
  final String? categoryLabel;
  final String? matchedTemplateId;

  /// One line, ready to paste into the panel.
  final String shortDescription;
  final String portionInfo;

  /// Estimated range for the call ("40–60 TL"); never written into a template.
  final String priceRangeHint;
  final String reason;
  final int importance;
  final List<OptionGroupSuggestion> optionGroups;
  final List<String> removableIngredients;
  final List<String> extraIngredients;
  final FixKind? fixKind;
  final String? currentValue;
  final String? suggestedValue;

  /// Section A only: what is written to the pool on accept.
  final TemplatePayload? payload;

  /// The kind of product ("durum", "tatli-serbetli") the suggestions were checked against; null on older cards.
  final String? productType;

  /// 0-100: how sure the suggestions are. Low ones get a "Kontrol et" label.
  final int? confidence;

  /// One sentence to say to the seller on the call — why this card (D-196); '' on older cards.
  final String pitch;

  /// The order of the call, higher first; the cards already arrive in it.
  final int priority;
  final CardStatus status;
  final int sortOrder;

  /// Local-only: the accept/skip is waiting in the offline queue.
  final bool queued;

  bool get isPending => status == CardStatus.pending;

  AnalysisCard copyWith({CardStatus? status, TemplatePayload? payload, bool? queued}) => AnalysisCard(
        id: id,
        runId: runId,
        section: section,
        name: name,
        origin: origin,
        targetName: targetName,
        targetNormalized: targetNormalized,
        categoryKey: categoryKey,
        categoryLabel: categoryLabel,
        matchedTemplateId: matchedTemplateId,
        shortDescription: shortDescription,
        portionInfo: portionInfo,
        priceRangeHint: priceRangeHint,
        reason: reason,
        importance: importance,
        optionGroups: optionGroups,
        removableIngredients: removableIngredients,
        extraIngredients: extraIngredients,
        fixKind: fixKind,
        currentValue: currentValue,
        suggestedValue: suggestedValue,
        payload: payload ?? this.payload,
        productType: productType,
        confidence: confidence,
        pitch: pitch,
        priority: priority,
        status: status ?? this.status,
        sortOrder: sortOrder,
        queued: queued ?? this.queued,
      );

  /// Everything the card suggests, as a payload: the four sections the screen shows. A new product carries its
  /// own payload (it may have been edited); a product already on the menu is built from the card fields.
  TemplatePayload get content =>
      payload ??
      TemplatePayload(
        name: name,
        description: shortDescription,
        optionGroups: [
          for (final group in optionGroups)
            OptionGroup(
              name: group.name,
              selectionType: SelectionType.fromWire(group.selectionType),
              isRequired: group.isRequired,
              minSelect: group.minSelect,
              maxSelect: group.maxSelect,
              options: [for (final o in group.options) TemplateOption(name: o.name, priceMode: PriceMode.fromWire(o.priceMode))],
            ),
        ],
        removableIngredients: removableIngredients,
        extraIngredients: [for (final e in extraIngredients) ExtraIngredient(name: e)],
      );

  /// A packaged drink: on the panel just a name, nothing to choose or describe.
  bool get isPlainRow {
    final c = content;
    return section == CardSection.newProduct &&
        c.optionGroups.isEmpty &&
        c.removableIngredients.isEmpty &&
        c.extraIngredients.isEmpty &&
        c.description.trim().isEmpty;
  }

  /// The card as the user kept it: every suggestion they tapped away is left out (see [ItemKey]).
  TemplatePayload kept(Set<String> removed) {
    final c = content;
    return c
        .copyWith(
          description: removed.contains(ItemKey.description) ? '' : c.description,
          optionGroups: [
            for (final group in c.optionGroups)
              if (!removed.contains(ItemKey.group(group.name)))
                group.copyWith(
                  options: [
                    for (final option in group.options)
                      if (!removed.contains(ItemKey.option(group.name, option.name))) option,
                  ],
                ),
          ],
          removableIngredients: [
            for (final name in c.removableIngredients)
              if (!removed.contains(ItemKey.removable(name))) name,
          ],
          extraIngredients: [
            for (final extra in c.extraIngredients)
              if (!removed.contains(ItemKey.extra(extra.name))) extra,
          ],
        )
        .normalized();
  }

  Json toJson() => {
        'id': id,
        'runId': runId,
        'section': section.wire,
        'name': name,
        'source': origin.name,
        'targetName': targetName,
        'targetNormalized': targetNormalized,
        'categoryKey': categoryKey,
        'categoryLabel': categoryLabel,
        'matchedTemplateId': matchedTemplateId,
        'shortDescription': shortDescription,
        'portionInfo': portionInfo,
        'priceRangeHint': priceRangeHint,
        'reason': reason,
        'importance': importance,
        'optionGroups': optionGroups.map((g) => g.toJson()).toList(),
        'removableIngredients': removableIngredients,
        'extraIngredients': extraIngredients,
        'fixKind': fixKind == null ? null : FixKind._wire.entries.firstWhere((e) => e.value == fixKind).key,
        'currentValue': currentValue,
        'suggestedValue': suggestedValue,
        'payload': payload?.toJson(),
        'productType': productType,
        'confidence': confidence,
        'pitch': pitch,
        'priority': priority,
        'status': status.name,
        'sortOrder': sortOrder,
      };
}

/// Keys of the suggestions on a card, for "tap to remove": a whole option group, one option inside it, an
/// ingredient, or the description.
abstract final class ItemKey {
  static String group(String name) => 'g|$name';
  static String option(String group, String option) => 'o|$group|$option';
  static String removable(String name) => 'r|$name';
  static String extra(String name) => 'e|$name';
  static const String description = 'd';
}

/// Server notices worth showing to the operations team, in their words. The technical ones (a provider was slow,
/// one step fell back) are hidden: the cards are complete either way.
String? friendlyWarning(String code, String message) => switch (code) {
      'slow_providers' || 'recommend_failed' || 'options_failed' || 'agent_failed' => null,
      'local_only' || 'quota_exceeded' || 'not_configured' || 'ai_off' => 'Yapay zekâ şu an kullanılamıyor; öneriler hazır listeden geldi.',
      _ => message.isEmpty ? null : message,
    };

/// One category of the progress header: how many products the menu has against what the cuisine expects.
class CategoryCount {
  const CategoryCount({
    required this.key,
    required this.label,
    required this.present,
    required this.minItems,
    required this.missing,
  });

  factory CategoryCount.fromJson(Json json) => CategoryCount(
        key: json.str('key'),
        label: json.str('label'),
        present: json.integer('present'),
        minItems: json.integer('minItems'),
        missing: json.integer('missing'),
      );

  final String key;
  final String label;
  final int present;
  final int minItems;
  final int missing;

  CategoryCount withOneMore() => CategoryCount(
        key: key,
        label: label,
        present: present + 1,
        minItems: minItems,
        missing: (minItems - present - 1).clamp(0, minItems),
      );

  CategoryCount withOneLess() => CategoryCount(
        key: key,
        label: label,
        present: present > 0 ? present - 1 : 0,
        minItems: minItems,
        missing: (minItems - (present > 0 ? present - 1 : 0)).clamp(0, minItems),
      );

  Json toJson() => {'key': key, 'label': label, 'present': present, 'minItems': minItems, 'missing': missing};
}

/// The progress header: current vs target, the cuisine, and the per-category breakdown.
class AnalysisCounts {
  const AnalysisCounts({
    required this.current,
    required this.target,
    required this.missing,
    required this.hardMinimum,
    required this.cuisineMin,
    required this.cuisineName,
    required this.cuisineId,
    this.categories = const [],
  });

  factory AnalysisCounts.fromJson(Json json) => AnalysisCounts(
        current: json.integer('current'),
        target: json.integer('target'),
        missing: json.integer('missing'),
        hardMinimum: json.integer('hardMinimum', 10),
        cuisineMin: json.integer('cuisineMin'),
        cuisineName: json.str('cuisineName'),
        cuisineId: json.str('cuisineId'),
        categories: json.objects('categories').map(CategoryCount.fromJson).toList(),
      );

  final int current;
  final int target;
  final int missing;

  /// The hard business rule: 10 products minimum, whatever the cuisine says.
  final int hardMinimum;
  final int cuisineMin;
  final String cuisineName;
  final String cuisineId;
  final List<CategoryCount> categories;

  bool get meetsHardMinimum => current >= hardMinimum;
  bool get meetsTarget => current >= target;
  List<CategoryCount> get openCategories => categories.where((c) => c.missing > 0).toList();

  /// A new product was added during the call: the total moves, and so does its category's pill.
  AnalysisCounts withAdded(String? categoryKey) => AnalysisCounts(
        current: current + 1,
        target: target,
        missing: (target - current - 1).clamp(0, target),
        hardMinimum: hardMinimum,
        cuisineMin: cuisineMin,
        cuisineName: cuisineName,
        cuisineId: cuisineId,
        categories: [for (final c in categories) c.key == categoryKey ? c.withOneMore() : c],
      );

  /// The seller took back a "Evet" during the call: the product is off the menu again.
  AnalysisCounts withRemoved(String? categoryKey) => AnalysisCounts(
        current: current > 0 ? current - 1 : 0,
        target: target,
        missing: (target - (current > 0 ? current - 1 : 0)).clamp(0, target),
        hardMinimum: hardMinimum,
        cuisineMin: cuisineMin,
        cuisineName: cuisineName,
        cuisineId: cuisineId,
        categories: [for (final c in categories) c.key == categoryKey ? c.withOneLess() : c],
      );

  Json toJson() => {
        'current': current,
        'target': target,
        'missing': missing,
        'hardMinimum': hardMinimum,
        'cuisineMin': cuisineMin,
        'cuisineName': cuisineName,
        'cuisineId': cuisineId,
        'categories': categories.map((c) => c.toJson()).toList(),
      };
}

/// A product the restaurant already sells, as the pipeline read it.
class AnalysisMenuItem {
  const AnalysisMenuItem({
    required this.name,
    required this.normalized,
    required this.categoryKey,
    required this.categoryLabel,
    this.matchedTemplateId,
    this.typed = false,
    this.seenIn = 0,
  });

  factory AnalysisMenuItem.fromJson(Json json) => AnalysisMenuItem(
        name: json.str('name'),
        normalized: json.str('normalized'),
        categoryKey: json.str('categoryKey'),
        categoryLabel: json.str('categoryLabel'),
        matchedTemplateId: json.strOrNull('matchedTemplateId'),
        typed: json.boolean('typed'),
        seenIn: json.integer('seenIn'),
      );

  final String name;
  final String normalized;
  final String categoryKey;
  final String categoryLabel;
  final String? matchedTemplateId;
  final bool typed;
  final int seenIn;

  Json toJson() => {
        'name': name,
        'normalized': normalized,
        'categoryKey': categoryKey,
        'categoryLabel': categoryLabel,
        'matchedTemplateId': matchedTemplateId,
        'typed': typed,
        'seenIn': seenIn,
      };
}

/// The Classifier's verdict. Shown only when it disagrees with the cuisine the user picked.
class Classification {
  const Classification({
    required this.cuisineId,
    required this.cuisineName,
    required this.priceSegment,
    required this.confidence,
    this.reason = '',
    this.disagrees = false,
    this.suggestedCuisineId,
    this.suggestedCuisineName,
  });

  factory Classification.fromJson(Json json) => Classification(
        cuisineId: json.str('cuisineId'),
        cuisineName: json.str('cuisineName'),
        priceSegment: json.str('priceSegment'),
        confidence: json.dbl('confidence') ?? 0,
        reason: json.str('reason'),
        disagrees: json.boolean('disagrees'),
        suggestedCuisineId: json.strOrNull('suggestedCuisineId'),
        suggestedCuisineName: json.strOrNull('suggestedCuisineName'),
      );

  final String cuisineId;
  final String cuisineName;
  final String priceSegment;
  final double confidence;
  final String reason;
  final bool disagrees;
  final String? suggestedCuisineId;
  final String? suggestedCuisineName;

  Json toJson() => {
        'cuisineId': cuisineId,
        'cuisineName': cuisineName,
        'priceSegment': priceSegment,
        'confidence': confidence,
        'reason': reason,
        'disagrees': disagrees,
        'suggestedCuisineId': suggestedCuisineId,
        'suggestedCuisineName': suggestedCuisineName,
      };
}

class AnalysisStats {
  const AnalysisStats({
    this.llmCalls = 0,
    this.tokensIn = 0,
    this.tokensOut = 0,
    this.latencyMs = 0,
    this.imagesRead = 0,
    this.imagesFailed = 0,
    this.menuItems = 0,
    this.newProducts = 0,
    this.optionCards = 0,
    this.fixCards = 0,
    this.dropped = 0,
    this.cacheHit = false,
  });

  factory AnalysisStats.fromJson(Json json) => AnalysisStats(
        llmCalls: json.integer('llmCalls'),
        tokensIn: json.integer('tokensIn'),
        tokensOut: json.integer('tokensOut'),
        latencyMs: json.integer('latencyMs'),
        imagesRead: json.integer('imagesRead'),
        imagesFailed: json.integer('imagesFailed'),
        menuItems: json.integer('menuItems'),
        newProducts: json.integer('newProducts'),
        optionCards: json.integer('optionCards'),
        fixCards: json.integer('fixCards'),
        dropped: json.integer('dropped'),
        cacheHit: json.boolean('cacheHit'),
      );

  final int llmCalls;
  final int tokensIn;
  final int tokensOut;
  final int latencyMs;
  final int imagesRead;
  final int imagesFailed;
  final int menuItems;
  final int newProducts;
  final int optionCards;
  final int fixCards;
  final int dropped;
  final bool cacheHit;

  Json toJson() => {
        'llmCalls': llmCalls,
        'tokensIn': tokensIn,
        'tokensOut': tokensOut,
        'latencyMs': latencyMs,
        'imagesRead': imagesRead,
        'imagesFailed': imagesFailed,
        'menuItems': menuItems,
        'newProducts': newProducts,
        'optionCards': optionCards,
        'fixCards': fixCards,
        'dropped': dropped,
        'cacheHit': cacheHit,
      };
}

/// One agent step of a run — the rows of the hidden debug screen.
class TraceStep {
  const TraceStep({
    required this.seq,
    required this.agent,
    required this.status,
    required this.durationMs,
    this.provider,
    this.model,
    this.tokensIn = 0,
    this.tokensOut = 0,
    this.llmCalls = 0,
    this.input,
    this.output,
    this.error,
  });

  factory TraceStep.fromJson(Json json) => TraceStep(
        seq: json.integer('seq'),
        agent: json.str('agent'),
        status: json.str('status'),
        durationMs: json.integer('durationMs'),
        provider: json.strOrNull('provider'),
        model: json.strOrNull('model'),
        tokensIn: json.integer('tokensIn'),
        tokensOut: json.integer('tokensOut'),
        llmCalls: json.integer('llmCalls'),
        input: json.object('input'),
        output: json.object('output'),
        error: json.strOrNull('error'),
      );

  final int seq;
  final String agent;
  final String status;
  final int durationMs;
  final String? provider;
  final String? model;
  final int tokensIn;
  final int tokensOut;
  final int llmCalls;
  final Json? input;
  final Json? output;
  final String? error;

  bool get failed => status == 'failed';
  bool get skipped => status == 'skipped';
}

class RunTrace {
  const RunTrace({required this.runId, required this.steps, required this.totalMs, required this.llmCalls});

  factory RunTrace.fromJson(Json json) {
    final totals = json.object('totals') ?? const {};
    return RunTrace(
      runId: json.str('runId'),
      steps: json.objects('steps').map(TraceStep.fromJson).toList(),
      totalMs: totals.integer('durationMs'),
      llmCalls: totals.integer('llmCalls'),
    );
  }

  final String runId;
  final List<TraceStep> steps;
  final int totalMs;
  final int llmCalls;
}

/// A complete analysis, as returned by `GET /analyze/:runId` and rebuilt from the SSE stream.
class AnalysisResult {
  const AnalysisResult({
    required this.runId,
    required this.status,
    this.counts,
    this.classification,
    this.menu = const [],
    this.cards = const [],
    this.stats,
    this.warnings = const [],
    this.error,
    this.createdAt,
  });

  factory AnalysisResult.fromJson(Json json) => AnalysisResult(
        runId: json.str('runId'),
        status: json.str('status', 'running'),
        counts: json.object('counts') == null ? null : AnalysisCounts.fromJson(json.object('counts')!),
        classification: json.object('classification') == null ? null : Classification.fromJson(json.object('classification')!),
        menu: json.objects('menu').map(AnalysisMenuItem.fromJson).toList(),
        cards: json.objects('cards').map(AnalysisCard.fromJson).toList(),
        stats: json.object('stats') == null ? null : AnalysisStats.fromJson(json.object('stats')!),
        warnings: json
            .objects('warnings')
            .map((w) => friendlyWarning(w.str('code'), w.str('message')))
            .whereType<String>()
            .toSet()
            .toList(),
        error: json.strOrNull('error'),
        createdAt: DateTime.tryParse(json.str('createdAt')),
      );

  final String runId;
  final String status;
  final AnalysisCounts? counts;
  final Classification? classification;
  final List<AnalysisMenuItem> menu;
  final List<AnalysisCard> cards;
  final AnalysisStats? stats;
  final List<String> warnings;
  final String? error;
  final DateTime? createdAt;

  Json toJson() => {
        'runId': runId,
        'status': status,
        'counts': counts?.toJson(),
        'classification': classification?.toJson(),
        'menu': menu.map((m) => m.toJson()).toList(),
        'cards': cards.map((c) => c.toJson()).toList(),
        'stats': stats?.toJson(),
        'warnings': warnings.map((w) => {'code': '', 'message': w}).toList(),
        'error': error,
        'createdAt': createdAt?.toIso8601String(),
      };
}

/// Events of the analysis SSE stream (see docs/SSE_EVENTS.md).
sealed class AnalyzeEvent {
  const AnalyzeEvent();

  static AnalyzeEvent? fromSse(String event, Json data) => switch (event) {
        'run' => RunStartedEvent(data.str('runId')),
        'progress' => ProgressEvent(data.str('agent'), data.str('message'), data.intOrNull('done'), data.intOrNull('total')),
        'classification' => ClassificationEvent(Classification.fromJson(data.object('classification') ?? const {})),
        'menu' => MenuEvent(data.objects('items').map(AnalysisMenuItem.fromJson).toList()),
        'counts' => CountsEvent(AnalysisCounts.fromJson(data.object('counts') ?? const {})),
        'item' => CardEvent(AnalysisCard.fromJson(data.object('card') ?? const {})),
        'trace' => TraceEvent(TraceStep.fromJson(data.object('step') ?? const {})),
        'warning' => WarningEvent(data.str('code'), data.str('message')),
        'done' => DoneEvent(
            data.str('status', 'completed'),
            data.object('stats') == null ? null : AnalysisStats.fromJson(data.object('stats')!),
          ),
        'error' => StreamErrorEvent(data.str('code'), data.str('message')),
        _ => null,
      };
}

final class RunStartedEvent extends AnalyzeEvent {
  const RunStartedEvent(this.runId);
  final String runId;
}

final class ProgressEvent extends AnalyzeEvent {
  const ProgressEvent(this.agent, this.message, this.done, this.total);
  final String agent;
  final String message;
  final int? done;
  final int? total;
}

final class ClassificationEvent extends AnalyzeEvent {
  const ClassificationEvent(this.classification);
  final Classification classification;
}

final class MenuEvent extends AnalyzeEvent {
  const MenuEvent(this.items);
  final List<AnalysisMenuItem> items;
}

final class CountsEvent extends AnalyzeEvent {
  const CountsEvent(this.counts);
  final AnalysisCounts counts;
}

final class CardEvent extends AnalyzeEvent {
  const CardEvent(this.card);
  final AnalysisCard card;
}

final class TraceEvent extends AnalyzeEvent {
  const TraceEvent(this.step);
  final TraceStep step;
}

final class WarningEvent extends AnalyzeEvent {
  const WarningEvent(this.code, this.message);
  final String code;
  final String message;
}

final class DoneEvent extends AnalyzeEvent {
  const DoneEvent(this.status, this.stats);
  final String status;
  final AnalysisStats? stats;
}

final class StreamErrorEvent extends AnalyzeEvent {
  const StreamErrorEvent(this.code, this.message);
  final String code;
  final String message;
}
