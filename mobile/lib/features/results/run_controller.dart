import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/storage/app_database.dart';
import '../../core/utils/image_compressor.dart';
import '../../data/models/suggestion.dart';
import '../../data/models/template_payload.dart';
import '../branches/branch_providers.dart';
import '../offline/background.dart';
import '../templates/template_pool.dart';

/// Everything the results screen needs to start a run (images stay on the device for "Devam et").
class RunRequest {
  const RunRequest({required this.data, required this.cuisineName, this.images = const []});

  final SuggestRequestData data;
  final String cuisineName;
  final List<PickedImage> images;
}

enum RunPhase { idle, streaming, done, error, cancelled, queued }

class RunViewState {
  const RunViewState({
    this.runId,
    this.phase = RunPhase.idle,
    this.message,
    this.placeholders = const [],
    this.cards = const [],
    this.warnings = const [],
    this.pendingItems = 0,
    this.pendingImageHashes = const [],
    this.stats,
    this.error,
    this.request,
    this.cuisineName = '',
    this.offline = false,
  });

  final String? runId;
  final RunPhase phase;
  final String? message;
  final List<String> placeholders;
  final List<SuggestionCard> cards;
  final List<String> warnings;
  final int pendingItems;
  final List<String> pendingImageHashes;
  final RunStats? stats;
  final String? error;
  final RunRequest? request;
  final String cuisineName;

  /// Loaded from the local copy (no connection).
  final bool offline;

  bool get canContinue => (pendingItems > 0 || pendingImageHashes.isNotEmpty) && phase != RunPhase.streaming;

  RunViewState copyWith({
    String? runId,
    RunPhase? phase,
    String? message,
    List<String>? placeholders,
    List<SuggestionCard>? cards,
    List<String>? warnings,
    int? pendingItems,
    List<String>? pendingImageHashes,
    RunStats? stats,
    String? error,
    RunRequest? request,
    String? cuisineName,
    bool? offline,
  }) =>
      RunViewState(
        runId: runId ?? this.runId,
        phase: phase ?? this.phase,
        message: message ?? this.message,
        placeholders: placeholders ?? this.placeholders,
        cards: cards ?? this.cards,
        warnings: warnings ?? this.warnings,
        pendingItems: pendingItems ?? this.pendingItems,
        pendingImageHashes: pendingImageHashes ?? this.pendingImageHashes,
        stats: stats ?? this.stats,
        error: error ?? this.error,
        request: request ?? this.request,
        cuisineName: cuisineName ?? this.cuisineName,
        offline: offline ?? this.offline,
      );
}

String _normalizeName(String value) => value.trim().toLowerCase();

/// Controller slots: each bottom-navigation tab that can show suggestion results has its own controller, so a card
/// opened from the gap checklist does not replace the run shown in the "Öneri" tab.
const String runSlotSuggest = 'suggest';
const String runSlotGap = 'gap';
const String runSlotBranches = 'branches';

class RunController extends Notifier<RunViewState> {
  RunController(this.slot);

  final String slot;
  CancelToken? _cancelToken;

  @override
  RunViewState build() {
    // Leaving the screen only stops listening: the run keeps going on the server and can be reopened later.
    ref.onDispose(() => _cancelToken?.cancel('screen closed'));
    return const RunViewState();
  }

  ApiClient get _api => ref.read(apiClientProvider);
  AppDatabase get _db => ref.read(appDatabaseProvider);

  Future<void> start(RunRequest request) async {
    state = RunViewState(phase: RunPhase.streaming, request: request, cuisineName: request.cuisineName);
    await _consume(() => _api.suggestStream(request.data, cancelToken: _newToken()));
  }

  /// Opens a run from history: live snapshot when online, the saved copy otherwise.
  Future<void> load(String runId) async {
    state = RunViewState(runId: runId, phase: RunPhase.streaming);
    final recent = await _db.recentRun(runId);
    try {
      final snapshot = await _api.run(runId);
      _applySnapshot(snapshot, recent?.cuisineName ?? '');
      if (snapshot.isRunning) unawaited(_pollUntilDone(runId));
    } on ApiException catch (e) {
      if (recent != null && recent.snapshotJson.length > 2) {
        _applySnapshot(RunSnapshot.fromJson(decodeJson(recent.snapshotJson)), recent.cuisineName, offline: true);
      } else {
        state = state.copyWith(phase: RunPhase.error, error: e.message);
      }
    }
  }

  CancelToken _newToken() {
    _cancelToken?.cancel('replaced');
    return _cancelToken = CancelToken();
  }

  Future<void> _consume(Stream<SuggestEvent> Function() open) async {
    try {
      await for (final event in open()) {
        _handle(event);
      }
      if (state.phase == RunPhase.streaming && state.runId != null) {
        // Stream ended without `done` (proxy cut): fall back to polling the snapshot.
        await _pollUntilDone(state.runId!);
      }
    } on ApiException catch (e) {
      if (e.code == 'CANCELLED') return;
      final runId = state.runId;
      if (runId != null) {
        await _pollUntilDone(runId);
        return;
      }
      final request = state.request;
      if (e.isNetwork && request != null) {
        await ref.read(pendingQueueProvider).enqueueSuggest(request.data, cuisineName: request.cuisineName);
        state = state.copyWith(phase: RunPhase.queued);
        return;
      }
      state = state.copyWith(phase: RunPhase.error, error: e.message);
    }
  }

  void _handle(SuggestEvent event) {
    switch (event) {
      case RunStartedEvent(:final runId):
        state = state.copyWith(runId: runId);
        unawaited(_persistRecent());
      case ProgressEvent(:final message):
        state = state.copyWith(message: message);
      case ExtractedEvent(:final names):
        final known = {...state.cards.map((c) => _normalizeName(c.rawName)), ...state.placeholders.map(_normalizeName)};
        state = state.copyWith(placeholders: [...state.placeholders, ...names.where((n) => !known.contains(_normalizeName(n)))]);
      case ItemEvent(:final card):
        final placeholders = state.placeholders.where((p) => _normalizeName(p) != _normalizeName(card.rawName)).toList();
        final cards = [...state.cards.where((c) => c.id != card.id), card]..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
        state = state.copyWith(cards: cards, placeholders: placeholders);
      case WarningEvent(:final message):
        state = state.copyWith(warnings: [...state.warnings, message]);
      case BudgetExhaustedEvent(:final pendingItems, :final pendingImageHashes):
        state = state.copyWith(pendingItems: pendingItems, pendingImageHashes: pendingImageHashes);
      case DoneEvent(:final status, :final stats):
        state = state.copyWith(
          phase: status == 'cancelled' ? RunPhase.cancelled : RunPhase.done,
          stats: stats,
          placeholders: const [],
          pendingItems: stats?.pendingItems ?? state.pendingItems,
        );
        unawaited(_persistRecent());
      case StreamErrorEvent(:final message):
        state = state.copyWith(phase: RunPhase.error, error: message);
    }
  }

  void _applySnapshot(RunSnapshot snapshot, String cuisineName, {bool offline = false}) {
    state = state.copyWith(
      runId: snapshot.id,
      phase: snapshot.isRunning
          ? RunPhase.streaming
          : snapshot.status == 'cancelled'
              ? RunPhase.cancelled
              : RunPhase.done,
      cards: snapshot.cards,
      placeholders: const [],
      pendingItems: snapshot.pendingItems,
      pendingImageHashes: snapshot.pendingImageHashes,
      cuisineName: cuisineName,
      offline: offline,
    );
  }

  Future<void> _pollUntilDone(String runId) async {
    for (var attempt = 0; attempt < 90; attempt += 1) {
      try {
        final snapshot = await _api.run(runId);
        _applySnapshot(snapshot, state.cuisineName);
        if (!snapshot.isRunning) {
          await _persistRecent();
          return;
        }
      } on ApiException catch (e) {
        if (!e.isNetwork) {
          state = state.copyWith(phase: RunPhase.error, error: e.message);
          return;
        }
      }
      await Future<void>.delayed(const Duration(seconds: 2));
      if (!ref.mounted) return;
    }
  }

  Future<void> _persistRecent() async {
    if (!ref.mounted) return;
    final runId = state.runId;
    if (runId == null) return;
    try {
      await _saveRecent(runId);
    } on Object catch (_) {
      // Local history is best effort (e.g. the screen closed while saving); the server keeps the run.
    }
  }

  Future<void> _saveRecent(String runId) async {
    final snapshot = RunSnapshot(
      id: runId,
      status: switch (state.phase) {
        RunPhase.done => 'completed',
        RunPhase.cancelled => 'cancelled',
        _ => 'running',
      },
      cards: state.cards,
      cuisineId: state.request?.data.cuisineId,
      promptText: state.request?.data.promptText,
      pendingItems: state.pendingItems,
      pendingImageHashes: state.pendingImageHashes,
      createdAt: DateTime.now(),
    );
    final prompt = state.request?.data.promptText.trim() ?? '';
    await _db.saveRecentRun(
      RecentRunsCompanion.insert(
        runId: runId,
        cuisineId: Value(state.request?.data.cuisineId),
        cuisineName: Value(state.cuisineName),
        title: Value(prompt.isNotEmpty ? prompt.split('\n').first : '${state.request?.images.length ?? 0} fotoğraf'),
        status: snapshot.status,
        cardCount: Value(state.cards.length),
        snapshotJson: jsonEncode(snapshot.toJson()),
        createdAt: DateTime.now(),
      ),
    );
  }

  Future<void> cancel() async {
    final runId = state.runId;
    _cancelToken?.cancel('user cancelled');
    state = state.copyWith(phase: RunPhase.cancelled, placeholders: const []);
    if (runId != null) {
      try {
        await _api.cancelRun(runId);
      } on ApiException {
        // best effort
      }
    }
  }

  Future<void> continueRun() async {
    final runId = state.runId;
    if (runId == null) return;
    final images = (state.request?.images ?? const <PickedImage>[])
        .where((i) => state.pendingImageHashes.contains(i.sha256))
        .map((i) => UploadImage(path: i.path, sha256: i.sha256))
        .toList();
    state = state.copyWith(phase: RunPhase.streaming, pendingItems: 0, pendingImageHashes: const []);
    await _consume(() => _api.continueStream(runId, images, cancelToken: _newToken()));
  }

  void updatePayload(String cardId, TemplatePayload payload) {
    state = state.copyWith(
      cards: [for (final c in state.cards) c.id == cardId ? c.copyWith(payload: payload, edited: true) : c],
    );
  }

  SuggestionCard? _card(String id) {
    for (final card in state.cards) {
      if (card.id == id) return card;
    }
    return null;
  }

  void _replace(SuggestionCard card) {
    state = state.copyWith(cards: [for (final c in state.cards) c.id == card.id ? card : c]);
    unawaited(_persistRecent());
  }

  /// Returns null on success, otherwise a user-facing error message.
  Future<String?> accept(String cardId, {String? branchId}) async {
    final card = _card(cardId);
    if (card == null) return null;
    final payload = card.payload.normalized();
    if (!payload.hasContent) return 'acceptNeedsContent';
    try {
      final result = await _api.accept(cardId, payload: card.edited ? payload : null, branchId: branchId);
      if (!ref.mounted) return null;
      _replace(result.card);
      // The approved card is now a template (pool) and possibly a branch menu item.
      ref.invalidate(templatePoolProvider);
      if (branchId != null || state.request?.data.branchId != null) ref.invalidate(branchesProvider);
      return null;
    } on ApiException catch (e) {
      if (e.isNetwork) {
        await ref.read(pendingQueueProvider).enqueueAccept(cardId, payload: card.edited ? payload : null, branchId: branchId);
        _replace(card.copyWith(status: CardStatus.accepted, queued: true));
        return null;
      }
      return e.message;
    }
  }

  Future<String?> skip(String cardId) async {
    final card = _card(cardId);
    if (card == null) return null;
    try {
      _replace(await _api.skip(cardId));
      return null;
    } on ApiException catch (e) {
      if (e.isNetwork) {
        await ref.read(pendingQueueProvider).enqueueSkip(cardId);
        _replace(card.copyWith(status: CardStatus.skipped, queued: true));
        return null;
      }
      return e.message;
    }
  }
}

final runControllerProvider = NotifierProvider.autoDispose.family<RunController, RunViewState, String>(RunController.new);
