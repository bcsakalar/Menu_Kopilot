import 'package:collection/collection.dart';

import 'json.dart';

/// Mod 2 (menu gap analysis) models — mirror of the backend DTOs (see docs/SSE_EVENTS.md).

enum FieldState {
  present,
  absent,
  unknown;

  static FieldState fromWire(String value) => FieldState.values.firstWhereOrNull((s) => s.name == value) ?? FieldState.unknown;
}

enum GapField {
  description,
  options,
  removables;

  static GapField? fromWire(String value) => GapField.values.firstWhereOrNull((f) => f.name == value);
}

class MissingField {
  const MissingField(this.field, this.state);

  final GapField field;
  final FieldState state;

  Json toJson() => {'field': field.name, 'state': state.name};
}

class GapItem {
  const GapItem({
    required this.name,
    required this.normalized,
    required this.flags,
    required this.completeness,
    required this.ok,
    required this.missing,
    this.matchedTemplateId,
    this.templateName,
    this.origin,
    this.sectionText,
    this.seenIn = 1,
  });

  factory GapItem.fromJson(Json json) {
    final flags = json.object('flags') ?? const {};
    return GapItem(
      name: json.str('name'),
      normalized: json.str('normalized'),
      flags: {for (final field in GapField.values) field: FieldState.fromWire(flags.str(field.name, 'unknown'))},
      completeness: json.dbl('completeness') ?? 0,
      ok: json.str('status') == 'ok',
      missing: json
          .objects('missing')
          .map((m) {
            final field = GapField.fromWire(m.str('field'));
            return field == null ? null : MissingField(field, FieldState.fromWire(m.str('state')));
          })
          .nonNulls
          .toList(),
      matchedTemplateId: json.strOrNull('matchedTemplateId'),
      templateName: json.strOrNull('templateName'),
      origin: json.strOrNull('origin'),
      sectionText: json.strOrNull('sectionText'),
      seenIn: json.integer('seenIn', 1),
    );
  }

  final String name;
  final String normalized;
  final Map<GapField, FieldState> flags;
  final double completeness;
  final bool ok;
  final List<MissingField> missing;
  final String? matchedTemplateId;
  final String? templateName;
  final String? origin;
  final String? sectionText;
  final int seenIn;

  Json toJson() => {
        'name': name,
        'normalized': normalized,
        'flags': {for (final entry in flags.entries) entry.key.name: entry.value.name},
        'completeness': completeness,
        'status': ok ? 'ok' : 'incomplete',
        'missing': missing.map((m) => m.toJson()).toList(),
        'matchedTemplateId': matchedTemplateId,
        'templateName': templateName,
        'origin': origin,
        'sectionText': sectionText,
        'seenIn': seenIn,
      };
}

class Recommendation {
  const Recommendation({required this.name, required this.reason, required this.importance, required this.fromAi, this.templateId});

  factory Recommendation.fromJson(Json json) => Recommendation(
        name: json.str('name'),
        reason: json.str('reason'),
        importance: json.integer('importance'),
        fromAi: json.str('source') == 'ai',
        templateId: json.strOrNull('templateId'),
      );

  final String name;
  final String reason;
  final int importance;
  final bool fromAi;
  final String? templateId;

  Json toJson() => {
        'name': name,
        'reason': reason,
        'importance': importance,
        'source': fromAi ? 'ai' : 'db',
        'templateId': templateId,
      };
}

enum QuestionKind {
  missingItem,
  missingField,
  cuisine;

  static QuestionKind fromWire(String value) => switch (value) {
        'missing_item' => QuestionKind.missingItem,
        'cuisine' => QuestionKind.cuisine,
        _ => QuestionKind.missingField,
      };

  String get wire => switch (this) {
        QuestionKind.missingItem => 'missing_item',
        QuestionKind.missingField => 'missing_field',
        QuestionKind.cuisine => 'cuisine',
      };
}

class Question {
  const Question({required this.key, required this.text, required this.kind, this.itemName, this.hints = const []});

  factory Question.fromJson(Json json) => Question(
        key: json.str('key'),
        text: json.str('text'),
        kind: QuestionKind.fromWire(json.str('kind')),
        itemName: json.strOrNull('itemName'),
        hints: json.strings('hints'),
      );

  final String key;
  final String text;
  final QuestionKind kind;
  final String? itemName;
  final List<String> hints;

  Json toJson() => {'key': key, 'text': text, 'kind': kind.wire, 'itemName': itemName, 'hints': hints};
}

class GapCounts {
  const GapCounts({
    required this.current,
    required this.target,
    required this.missing,
    this.fromScreenshots = 0,
    this.cuisineMin = 10,
    this.targetOverridden = false,
  });

  factory GapCounts.fromJson(Json json) => GapCounts(
        current: json.integer('current'),
        target: json.integer('target', 10),
        missing: json.integer('missing'),
        fromScreenshots: json.integer('fromScreenshots'),
        cuisineMin: json.integer('cuisineMin', 10),
        targetOverridden: json.boolean('targetOverridden'),
      );

  final int current;
  final int target;
  final int missing;
  final int fromScreenshots;
  final int cuisineMin;
  final bool targetOverridden;

  double get progress => target <= 0 ? 1 : (current / target).clamp(0, 1).toDouble();

  Json toJson() => {
        'current': current,
        'target': target,
        'missing': missing,
        'fromScreenshots': fromScreenshots,
        'cuisineMin': cuisineMin,
        'targetOverridden': targetOverridden,
      };
}

class GapStats {
  const GapStats({this.llmCalls = 0, this.latencyMs = 0, this.screenshots = 0, this.extracted = 0, this.unique = 0, this.cacheHit = false});

  factory GapStats.fromJson(Json json) => GapStats(
        llmCalls: json.integer('llmCalls'),
        latencyMs: json.integer('latencyMs'),
        screenshots: json.integer('screenshots'),
        extracted: json.integer('extracted'),
        unique: json.integer('unique'),
        cacheHit: json.boolean('cacheHit'),
      );

  final int llmCalls;
  final int latencyMs;
  final int screenshots;
  final int extracted;
  final int unique;
  final bool cacheHit;

  Json toJson() => {
        'llmCalls': llmCalls,
        'latencyMs': latencyMs,
        'screenshots': screenshots,
        'extracted': extracted,
        'unique': unique,
        'cacheHit': cacheHit,
      };
}

class GapResult {
  const GapResult({
    required this.runId,
    required this.status,
    this.branchId,
    this.counts,
    this.items = const [],
    this.recommendations = const [],
    this.questions = const [],
    this.stats,
    this.createdAt,
  });

  factory GapResult.fromJson(Json json) => GapResult(
        runId: json.str('runId'),
        branchId: json.strOrNull('branchId'),
        status: json.str('status', 'completed'),
        counts: json.object('counts') == null ? null : GapCounts.fromJson(json.object('counts')!),
        items: json.objects('items').map(GapItem.fromJson).toList(),
        recommendations: json.objects('recommendations').map(Recommendation.fromJson).toList(),
        questions: json.objects('questions').map(Question.fromJson).toList(),
        stats: json.object('stats') == null ? null : GapStats.fromJson(json.object('stats')!),
        createdAt: DateTime.tryParse(json.str('createdAt')),
      );

  final String runId;
  final String? branchId;
  final String status;
  final GapCounts? counts;
  final List<GapItem> items;
  final List<Recommendation> recommendations;
  final List<Question> questions;
  final GapStats? stats;
  final DateTime? createdAt;

  bool get isRunning => status == 'running';

  Json toJson() => {
        'runId': runId,
        'branchId': branchId,
        'status': status,
        'counts': counts?.toJson(),
        'items': items.map((i) => i.toJson()).toList(),
        'recommendations': recommendations.map((r) => r.toJson()).toList(),
        'questions': questions.map((q) => q.toJson()).toList(),
        'stats': stats?.toJson(),
        'createdAt': createdAt?.toIso8601String(),
      };
}

/// Events of the gap-analysis SSE stream.
sealed class GapEvent {
  const GapEvent();

  static GapEvent? fromSse(String event, Json data) => switch (event) {
        'run' => GapRunEvent(data.str('runId')),
        'progress' => GapProgressEvent(data.str('stage'), data.str('message'), data.intOrNull('done'), data.intOrNull('total')),
        'counts' => GapCountsEvent(GapCounts.fromJson(data.object('counts') ?? const {})),
        'questions' => GapQuestionsEvent(data.objects('items').map(Question.fromJson).toList()),
        'questions_append' => GapQuestionsEvent(data.objects('items').map(Question.fromJson).toList(), append: true),
        'items' => GapItemsEvent(data.objects('items').map(GapItem.fromJson).toList()),
        'recommendations' => GapRecommendationsEvent(data.objects('items').map(Recommendation.fromJson).toList()),
        'warning' => GapWarningEvent(data.str('code'), data.str('message')),
        'done' => GapDoneEvent(data.str('status', 'completed'), data.object('stats') == null ? null : GapStats.fromJson(data.object('stats')!)),
        'error' => GapErrorEvent(data.str('code'), data.str('message')),
        _ => null,
      };
}

final class GapRunEvent extends GapEvent {
  const GapRunEvent(this.runId);
  final String runId;
}

final class GapProgressEvent extends GapEvent {
  const GapProgressEvent(this.stage, this.message, this.done, this.total);
  final String stage;
  final String message;
  final int? done;
  final int? total;
}

final class GapCountsEvent extends GapEvent {
  const GapCountsEvent(this.counts);
  final GapCounts counts;
}

final class GapQuestionsEvent extends GapEvent {
  const GapQuestionsEvent(this.questions, {this.append = false});
  final List<Question> questions;
  final bool append;
}

final class GapItemsEvent extends GapEvent {
  const GapItemsEvent(this.items);
  final List<GapItem> items;
}

final class GapRecommendationsEvent extends GapEvent {
  const GapRecommendationsEvent(this.items);
  final List<Recommendation> items;
}

final class GapWarningEvent extends GapEvent {
  const GapWarningEvent(this.code, this.message);
  final String code;
  final String message;
}

final class GapDoneEvent extends GapEvent {
  const GapDoneEvent(this.status, this.stats);
  final String status;
  final GapStats? stats;
}

final class GapErrorEvent extends GapEvent {
  const GapErrorEvent(this.code, this.message);
  final String code;
  final String message;
}
