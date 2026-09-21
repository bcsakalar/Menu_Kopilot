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
import '../../data/models/analysis.dart';
import '../../data/models/template_payload.dart';
import '../offline/background.dart';
import '../templates/template_pool.dart';

/// Everything the result screen needs to start a run. The picked images stay on the device so a queued run can
/// be re-sent later.
class AnalyzeRequest {
  const AnalyzeRequest({required this.data, this.cuisineName = '', this.images = const []});

  final AnalyzeRequestData data;
  final String cuisineName;
  final List<PickedImage> images;
}

enum RunPhase { idle, streaming, done, error, cancelled, queued }

/// Which section the filter chips are showing.
enum SectionFilter {
  all,
  newProduct,
  option,
  fix;

  CardSection? get section => switch (this) {
        SectionFilter.all => null,
        SectionFilter.newProduct => CardSection.newProduct,
        SectionFilter.option => CardSection.option,
        SectionFilter.fix => CardSection.fix,
      };
}

class AnalysisViewState {
  const AnalysisViewState({
    this.runId,
    this.phase = RunPhase.idle,
    this.message,
    this.counts,
    this.classification,
    this.menu = const [],
    this.cards = const [],
    this.trace = const [],
    this.warnings = const [],
    this.stats,
    this.error,
    this.request,
    this.cuisineName = '',
    this.offline = false,
    this.filter = SectionFilter.all,
    this.selected = const {},
  });

  final String? runId;
  final RunPhase phase;
  final String? message;
  final AnalysisCounts? counts;
  final Classification? classification;
  final List<AnalysisMenuItem> menu;
  final List<AnalysisCard> cards;

  /// Agent steps as they arrive — the hidden debug screen reads this live.
  final List<TraceStep> trace;
  final List<String> warnings;
  final AnalysisStats? stats;
  final String? error;
  final AnalyzeRequest? request;
  final String cuisineName;

  /// Loaded from the local copy (no connection).
  final bool offline;
  final SectionFilter filter;

  /// Card ids ticked for "seçilenleri kopyala".
  final Set<String> selected;

  bool get isStreaming => phase == RunPhase.streaming;

  List<AnalysisCard> section(CardSection value) =>
      cards.where((c) => c.section == value).toList()..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

  int count(CardSection value) => cards.where((c) => c.section == value).length;

  /// Sections the current filter shows, in screen order.
  List<CardSection> get visibleSections {
    final picked = filter.section;
    return picked == null ? CardSection.values : [picked];
  }

  AnalysisViewState copyWith({
    String? runId,
    RunPhase? phase,
    String? message,
    AnalysisCounts? counts,
    Classification? classification,
    List<AnalysisMenuItem>? menu,
    List<AnalysisCard>? cards,
    List<TraceStep>? trace,
    List<String>? warnings,
    AnalysisStats? stats,
    String? error,
    AnalyzeRequest? request,
    String? cuisineName,
    bool? offline,
    SectionFilter? filter,
    Set<String>? selected,
  }) =>
      AnalysisViewState(
        runId: runId ?? this.runId,
        phase: phase ?? this.phase,
        message: message ?? this.message,
        counts: counts ?? this.counts,
        classification: classification ?? this.classification,
        menu: menu ?? this.menu,
        cards: cards ?? this.cards,
        trace: trace ?? this.trace,
        warnings: warnings ?? this.warnings,
        stats: stats ?? this.stats,
        error: error ?? this.error,
        request: request ?? this.request,
        cuisineName: cuisineName ?? this.cuisineName,
        offline: offline ?? this.offline,
        filter: filter ?? this.filter,
        selected: selected ?? this.selected,
      );
}

/// Returned by [AnalysisController.accept] when the card has nothing worth saving yet.
class CardNeedsContent implements Exception {
  const CardNeedsContent();
}

class AnalysisController extends Notifier<AnalysisViewState> {
  CancelToken? _cancelToken;

  @override
  AnalysisViewState build() {
    // Leaving the screen only stops listening: the run keeps going on the server and can be reopened later.
    ref.onDispose(() => _cancelToken?.cancel('screen closed'));
    return const AnalysisViewState();
  }

  ApiClient get _api => ref.read(apiClientProvider);
  AppDatabase get _db => ref.read(appDatabaseProvider);

  Future<void> start(AnalyzeRequest request) async {
    state = AnalysisViewState(phase: RunPhase.streaming, request: request, cuisineName: request.cuisineName);
    await _consume(() => _api.analyzeStream(request.data, cancelToken: _newToken()));
  }

  /// Re-runs this analysis against another cuisine — the user overriding the Classifier. The server reuses the
  /// product list it already read, so nothing is uploaded or read again and the answer comes in seconds.
  Future<void> rerun({required String cuisineId, required String cuisineName}) async {
    final runId = state.runId;
    if (runId == null || state.isStreaming) return;
    final previous = state.request?.data;
    await start(
      AnalyzeRequest(
        cuisineName: cuisineName,
        data: AnalyzeRequestData(
          cuisineId: cuisineId,
          fromRunId: runId,
          // Typed names are already in the reused list (the server dedupes); sent again only as the run's title.
          menuText: previous?.menuText ?? '',
          notes: previous?.notes ?? '',
          debug: previous?.debug ?? false,
        ),
      ),
    );
  }

  /// Opens a run from history: live snapshot when online, the saved copy otherwise. A run that is still going
  /// (the app was closed mid-call) is re-attached to its stream instead of freezing on the snapshot.
  Future<void> load(String runId) async {
    state = AnalysisViewState(runId: runId, phase: RunPhase.streaming);
    final recent = await _db.recentRun(runId);
    try {
      _apply(await _api.analysis(runId), recent?.cuisineName ?? '');
      await _followIfRunning();
    } on ApiException catch (e) {
      if (recent != null && recent.snapshotJson.length > 2) {
        _apply(AnalysisResult.fromJson(decodeJson(recent.snapshotJson)), recent.cuisineName, offline: true);
      } else {
        state = state.copyWith(phase: RunPhase.error, error: e.serverMessage);
      }
    }
  }

  /// Restores the last analysis when the screen opens cold (the phone was locked mid-call).
  Future<void> loadLatest() async {
    state = const AnalysisViewState(phase: RunPhase.streaming);
    try {
      final latest = await _api.latestAnalysis();
      if (latest == null) {
        state = const AnalysisViewState();
        return;
      }
      _apply(latest, latest.counts?.cuisineName ?? '');
      await _followIfRunning();
    } on ApiException catch (e) {
      state = state.copyWith(phase: RunPhase.error, error: e.serverMessage);
    }
  }

  Future<void> _followIfRunning() async {
    final runId = state.runId;
    if (runId == null || state.phase != RunPhase.streaming || !ref.mounted) return;
    await _consume(() => _api.runEvents(runId, cancelToken: _newToken()));
  }

  CancelToken _newToken() {
    _cancelToken?.cancel('replaced');
    return _cancelToken = CancelToken();
  }

  Future<void> _consume(Stream<AnalyzeEvent> Function() open) async {
    try {
      await for (final event in open()) {
        _handle(event);
      }
      if (state.phase == RunPhase.streaming && state.runId != null) {
        // Stream ended without `done` (proxy cut): fall back to the snapshot.
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
        await ref.read(pendingQueueProvider).enqueueAnalyze(request.data, cuisineName: request.cuisineName);
        state = state.copyWith(phase: RunPhase.queued);
        return;
      }
      state = state.copyWith(phase: RunPhase.error, error: e.serverMessage);
    }
  }

  void _handle(AnalyzeEvent event) {
    switch (event) {
      case RunStartedEvent(:final runId):
        state = state.copyWith(runId: runId);
      case ProgressEvent(:final message):
        state = state.copyWith(message: message);
      case ClassificationEvent(:final classification):
        state = state.copyWith(classification: classification, cuisineName: classification.cuisineName);
      case MenuEvent(:final items):
        state = state.copyWith(menu: items);
      case CountsEvent(:final counts):
        state = state.copyWith(counts: counts, cuisineName: counts.cuisineName);
      case CardEvent(:final card):
        // A re-attached stream replays cards as they were first sent; a decision made since then must survive it.
        final known = _card(card.id);
        final next = known != null && !known.isPending ? card.copyWith(status: known.status, payload: known.payload) : card;
        final cards = [...state.cards.where((c) => c.id != card.id), next]..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
        state = state.copyWith(cards: cards);
      case TraceEvent(:final step):
        state = state.copyWith(trace: [...state.trace.where((s) => s.seq != step.seq), step]..sort((a, b) => a.seq.compareTo(b.seq)));
      case WarningEvent(:final message):
        // A re-attached stream replays its past events; a notice is shown once.
        if (!state.warnings.contains(message)) state = state.copyWith(warnings: [...state.warnings, message]);
      case DoneEvent(:final status, :final stats):
        state = state.copyWith(phase: status == 'cancelled' ? RunPhase.cancelled : RunPhase.done, stats: stats);
        unawaited(_persistRecent());
      case StreamErrorEvent(:final message):
        state = state.copyWith(phase: RunPhase.error, error: message);
    }
  }

  void _apply(AnalysisResult result, String cuisineName, {bool offline = false}) {
    state = state.copyWith(
      runId: result.runId,
      phase: switch (result.status) {
        'running' => RunPhase.streaming,
        'cancelled' => RunPhase.cancelled,
        'failed' => RunPhase.error,
        _ => RunPhase.done,
      },
      counts: result.counts,
      classification: result.classification,
      menu: result.menu,
      cards: result.cards,
      warnings: result.warnings,
      stats: result.stats,
      error: result.error,
      cuisineName: cuisineName.isEmpty ? (result.counts?.cuisineName ?? '') : cuisineName,
      offline: offline,
    );
  }

  Future<void> _pollUntilDone(String runId) async {
    for (var attempt = 0; attempt < 60; attempt += 1) {
      try {
        final result = await _api.analysis(runId);
        _apply(result, state.cuisineName);
        if (result.status != 'running') {
          await _persistRecent();
          return;
        }
      } on ApiException catch (e) {
        if (!e.isNetwork) {
          state = state.copyWith(phase: RunPhase.error, error: e.serverMessage);
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
      final snapshot = AnalysisResult(
        runId: runId,
        status: switch (state.phase) {
          RunPhase.done => 'completed',
          RunPhase.cancelled => 'cancelled',
          _ => 'running',
        },
        counts: state.counts,
        classification: state.classification,
        menu: state.menu,
        cards: state.cards,
        stats: state.stats,
        createdAt: DateTime.now(),
      );
      final title = state.request?.data.menuText.trim() ?? '';
      await _db.saveRecentRun(
        RecentRunsCompanion.insert(
          runId: runId,
          cuisineId: Value(state.counts?.cuisineId ?? state.request?.data.cuisineId),
          cuisineName: Value(state.cuisineName),
          // Photo-only runs have no title; the list shows a localized label instead.
          title: Value(title.isNotEmpty ? title.split('\n').first : ''),
          status: snapshot.status,
          cardCount: Value(state.cards.length),
          snapshotJson: jsonEncode(snapshot.toJson()),
          createdAt: DateTime.now(),
        ),
      );
    } on Object catch (_) {
      // Local history is best effort (e.g. the screen closed while saving); the server keeps the run.
    }
  }

  Future<void> cancel() async {
    final runId = state.runId;
    _cancelToken?.cancel('user cancelled');
    state = state.copyWith(phase: RunPhase.cancelled);
    if (runId != null) {
      try {
        await _api.cancelRun(runId);
      } on ApiException {
        // best effort
      }
    }
  }

  // ---- screen state ------------------------------------------------------------------------------------------

  void setFilter(SectionFilter filter) => state = state.copyWith(filter: filter);

  void toggleSelected(String cardId) {
    final next = {...state.selected};
    if (!next.remove(cardId)) next.add(cardId);
    state = state.copyWith(selected: next);
  }

  /// "Hepsini seç" on a section header: every undecided card of that section.
  void selectSection(CardSection section) {
    final ids = state.section(section).where((c) => c.isPending).map((c) => c.id);
    state = state.copyWith(selected: {...state.selected, ...ids});
  }

  void clearSelection() => state = state.copyWith(selected: const {});

  // ---- card actions ------------------------------------------------------------------------------------------

  AnalysisCard? _card(String id) {
    for (final card in state.cards) {
      if (card.id == id) return card;
    }
    return null;
  }

  void _replace(AnalysisCard card) {
    // A decided card leaves the bulk selection: it is no longer something to paste.
    final selected = card.isPending ? state.selected : ({...state.selected}..remove(card.id));
    state = state.copyWith(cards: [for (final c in state.cards) c.id == card.id ? card : c], selected: selected);
    unawaited(_persistRecent());
  }

  void updatePayload(String cardId, TemplatePayload payload) {
    final card = _card(cardId);
    if (card == null) return;
    _replace(card.copyWith(payload: payload));
  }

  /// Accepting a new product moves the counter and its category: it is now on the menu.
  void _bumpCount(AnalysisCard card) {
    final counts = state.counts;
    if (counts == null || card.section != CardSection.newProduct) return;
    state = state.copyWith(counts: counts.withAdded(card.categoryKey));
  }

  /// Returns null on success, otherwise [CardNeedsContent] or the server's [ApiException].
  Future<Exception?> accept(String cardId) async {
    final card = _card(cardId);
    if (card == null) return null;
    final payload = card.payload?.normalized();
    if (card.section == CardSection.newProduct && (payload == null || !payload.hasContent)) {
      return const CardNeedsContent();
    }
    try {
      final result = await _api.accept(cardId, payload: payload);
      if (!ref.mounted) return null;
      _replace(result);
      _bumpCount(card);
      ref.invalidate(templatePoolProvider);
      return null;
    } on ApiException catch (e) {
      if (e.isNetwork) {
        await ref.read(pendingQueueProvider).enqueueAccept(cardId, payload: payload);
        _replace(card.copyWith(status: CardStatus.accepted, queued: true));
        _bumpCount(card);
        return null;
      }
      return e;
    }
  }

  Future<Exception?> skip(String cardId) async {
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
      return e;
    }
  }
}

final analysisControllerProvider = NotifierProvider<AnalysisController, AnalysisViewState>(AnalysisController.new);

/// The run trace, fetched on demand by the hidden debug screen.
final runTraceProvider = FutureProvider.autoDispose.family<RunTrace, String>((ref, runId) async {
  return ref.read(apiClientProvider).analysisTrace(runId);
});
