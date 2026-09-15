import 'package:collection/collection.dart';

import 'json.dart';
import 'template_payload.dart';

/// Where a card came from — drives the badge: Hazır şablon / DB'den / AI / İnceleme gerek.
enum CardOrigin {
  seed,
  db,
  ai,
  review;

  static CardOrigin fromWire(String value) => CardOrigin.values.firstWhereOrNull((o) => o.name == value) ?? CardOrigin.review;
}

enum CardStatus {
  pending,
  accepted,
  skipped;

  static CardStatus fromWire(String value) => CardStatus.values.firstWhereOrNull((s) => s.name == value) ?? CardStatus.pending;
}

class SuggestionCard {
  const SuggestionCard({
    required this.id,
    required this.runId,
    required this.rawName,
    required this.origin,
    required this.payload,
    this.matchedTemplateId,
    this.matchType,
    this.score,
    this.needsReview = false,
    this.reviewReason,
    this.confidence,
    this.sectionText,
    this.status = CardStatus.pending,
    this.sortOrder = 0,
    this.edited = false,
    this.queued = false,
  });

  factory SuggestionCard.fromJson(Json json) => SuggestionCard(
        id: json.str('id'),
        runId: json.str('runId'),
        rawName: json.str('rawName'),
        origin: CardOrigin.fromWire(json.str('origin')),
        payload: TemplatePayload.fromJson(json.object('payload') ?? const {}),
        matchedTemplateId: json.strOrNull('matchedTemplateId'),
        matchType: json.strOrNull('matchType'),
        score: json.dbl('score'),
        needsReview: json.boolean('needsReview'),
        reviewReason: json.strOrNull('reviewReason'),
        confidence: json.dbl('confidence'),
        sectionText: json.strOrNull('sectionText'),
        status: CardStatus.fromWire(json.str('status')),
        sortOrder: json.integer('sortOrder'),
      );

  final String id;
  final String runId;
  final String rawName;
  final CardOrigin origin;
  final TemplatePayload payload;
  final String? matchedTemplateId;
  final String? matchType;
  final double? score;
  final bool needsReview;
  final String? reviewReason;
  final double? confidence;
  final String? sectionText;
  final CardStatus status;
  final int sortOrder;

  /// Local-only: edited in the app but not yet accepted.
  final bool edited;

  /// Local-only: the accept/skip is waiting in the offline queue.
  final bool queued;

  Json toJson() => {
        'id': id,
        'runId': runId,
        'rawName': rawName,
        'origin': origin.name,
        'payload': payload.toJson(),
        'matchedTemplateId': matchedTemplateId,
        'matchType': matchType,
        'score': score,
        'needsReview': needsReview,
        'reviewReason': reviewReason,
        'confidence': confidence,
        'sectionText': sectionText,
        'status': status.name,
        'sortOrder': sortOrder,
      };

  SuggestionCard copyWith({TemplatePayload? payload, CardStatus? status, bool? edited, bool? queued}) => SuggestionCard(
        id: id,
        runId: runId,
        rawName: rawName,
        origin: origin,
        payload: payload ?? this.payload,
        matchedTemplateId: matchedTemplateId,
        matchType: matchType,
        score: score,
        needsReview: needsReview,
        reviewReason: reviewReason,
        confidence: confidence,
        sectionText: sectionText,
        status: status ?? this.status,
        sortOrder: sortOrder,
        edited: edited ?? this.edited,
        queued: queued ?? this.queued,
      );
}

class RunStats {
  const RunStats({
    this.llmCalls = 0,
    this.embedCalls = 0,
    this.tokensIn = 0,
    this.tokensOut = 0,
    this.cacheHit = false,
    this.latencyMs = 0,
    this.dbHits = 0,
    this.aiItems = 0,
    this.reviewItems = 0,
    this.pendingItems = 0,
    this.pendingImages = 0,
  });

  factory RunStats.fromJson(Json json) => RunStats(
        llmCalls: json.integer('llmCalls'),
        embedCalls: json.integer('embedCalls'),
        tokensIn: json.integer('tokensIn'),
        tokensOut: json.integer('tokensOut'),
        cacheHit: json.boolean('cacheHit'),
        latencyMs: json.integer('latencyMs'),
        dbHits: json.integer('dbHits'),
        aiItems: json.integer('aiItems'),
        reviewItems: json.integer('reviewItems'),
        pendingItems: json.integer('pendingItems'),
        pendingImages: json.integer('pendingImages'),
      );

  final int llmCalls;
  final int embedCalls;
  final int tokensIn;
  final int tokensOut;
  final bool cacheHit;
  final int latencyMs;
  final int dbHits;
  final int aiItems;
  final int reviewItems;
  final int pendingItems;
  final int pendingImages;
}

class RunSnapshot {
  const RunSnapshot({
    required this.id,
    required this.status,
    required this.cards,
    this.cuisineId,
    this.branchId,
    this.promptText,
    this.deepMode = false,
    this.cacheHit = false,
    this.llmCalls = 0,
    this.pendingItems = 0,
    this.pendingImageHashes = const [],
    this.error,
    this.createdAt,
  });

  factory RunSnapshot.fromJson(Json json) => RunSnapshot(
        id: json.str('id'),
        status: json.str('status', 'running'),
        cards: json.objects('cards').map(SuggestionCard.fromJson).toList(),
        cuisineId: json.strOrNull('cuisineId'),
        branchId: json.strOrNull('branchId'),
        promptText: json.strOrNull('promptText'),
        deepMode: json.boolean('deepMode'),
        cacheHit: json.boolean('cacheHit'),
        llmCalls: json.integer('llmCalls'),
        pendingItems: json.integer('pendingItems'),
        pendingImageHashes: json.strings('pendingImageHashes'),
        error: json.strOrNull('error'),
        createdAt: DateTime.tryParse(json.str('createdAt')),
      );

  final String id;
  final String status;
  final List<SuggestionCard> cards;
  final String? cuisineId;
  final String? branchId;
  final String? promptText;
  final bool deepMode;
  final bool cacheHit;
  final int llmCalls;
  final int pendingItems;
  final List<String> pendingImageHashes;
  final String? error;
  final DateTime? createdAt;

  bool get isRunning => status == 'running';

  Json toJson() => {
        'id': id,
        'status': status,
        'cards': cards.map((c) => c.toJson()).toList(),
        'cuisineId': cuisineId,
        'branchId': branchId,
        'promptText': promptText,
        'deepMode': deepMode,
        'cacheHit': cacheHit,
        'llmCalls': llmCalls,
        'pendingItems': pendingItems,
        'pendingImageHashes': pendingImageHashes,
        'error': error,
        'createdAt': createdAt?.toIso8601String(),
      };
}

/// Events of the suggestion SSE stream (see docs/SSE_EVENTS.md).
sealed class SuggestEvent {
  const SuggestEvent();

  static SuggestEvent? fromSse(String event, Json data) => switch (event) {
        'run' => RunStartedEvent(data.str('runId'), resumed: data.boolean('resumed')),
        'progress' => ProgressEvent(data.str('stage'), data.str('message'), data.intOrNull('done'), data.intOrNull('total')),
        'extracted' => ExtractedEvent(data.strings('names')),
        'item' => ItemEvent(SuggestionCard.fromJson(data.object('card') ?? const {})),
        'warning' => WarningEvent(data.str('code'), data.str('message')),
        'budget_exhausted' => BudgetExhaustedEvent(
            data.integer('pendingItems'),
            data.strings('pendingImageHashes'),
            data.str('message'),
          ),
        'done' => DoneEvent(data.str('status', 'completed'), data.object('stats') == null ? null : RunStats.fromJson(data.object('stats')!)),
        'error' => StreamErrorEvent(data.str('code'), data.str('message')),
        _ => null,
      };
}

final class RunStartedEvent extends SuggestEvent {
  const RunStartedEvent(this.runId, {this.resumed = false});
  final String runId;
  final bool resumed;
}

final class ProgressEvent extends SuggestEvent {
  const ProgressEvent(this.stage, this.message, this.done, this.total);
  final String stage;
  final String message;
  final int? done;
  final int? total;
}

final class ExtractedEvent extends SuggestEvent {
  const ExtractedEvent(this.names);
  final List<String> names;
}

final class ItemEvent extends SuggestEvent {
  const ItemEvent(this.card);
  final SuggestionCard card;
}

final class WarningEvent extends SuggestEvent {
  const WarningEvent(this.code, this.message);
  final String code;
  final String message;
}

final class BudgetExhaustedEvent extends SuggestEvent {
  const BudgetExhaustedEvent(this.pendingItems, this.pendingImageHashes, this.message);
  final int pendingItems;
  final List<String> pendingImageHashes;
  final String message;
}

final class DoneEvent extends SuggestEvent {
  const DoneEvent(this.status, this.stats);
  final String status;
  final RunStats? stats;
}

final class StreamErrorEvent extends SuggestEvent {
  const StreamErrorEvent(this.code, this.message);
  final String code;
  final String message;
}
