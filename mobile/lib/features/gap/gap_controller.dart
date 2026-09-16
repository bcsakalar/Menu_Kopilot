import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/storage/app_database.dart';
import '../../core/utils/image_compressor.dart';
import '../../data/models/branch.dart';
import '../../data/models/gap.dart';
import '../home/home_controller.dart' show imageCompressorProvider;

const int maxScreenshots = 5;

String gapCacheKey(String branchId) => 'cache.gap.$branchId';

/// Checklist ticks are stored per branch, so they survive a re-analysis (question keys are stable).
String checklistId(String branchId) => 'branch:$branchId';

// ---- inputs of the "Tamamla" tab ------------------------------------------------------------------------------

class GapDraft {
  const GapDraft({this.images = const [], this.notes = '', this.compressing = false});

  final List<PickedImage> images;
  final String notes;
  final bool compressing;

  GapDraft copyWith({List<PickedImage>? images, String? notes, bool? compressing}) => GapDraft(
        images: images ?? this.images,
        notes: notes ?? this.notes,
        compressing: compressing ?? this.compressing,
      );
}

class GapDraftController extends Notifier<GapDraft> {
  @override
  GapDraft build() => const GapDraft();

  /// Adds photos up to the limit and reports how many were over it or could not be read.
  Future<AddImagesResult> addImages(List<String> paths) async {
    final free = maxScreenshots - state.images.length;
    final accepted = paths.take(free < 0 ? 0 : free).toList();
    if (accepted.isEmpty) return (skipped: paths.length, failed: 0);
    state = state.copyWith(compressing: true);
    final compress = ref.read(imageCompressorProvider);
    final images = [...state.images];
    var failed = 0;
    try {
      for (final path in accepted) {
        try {
          final image = await compress(path);
          if (images.every((i) => i.sha256 != image.sha256)) images.add(image);
        } on Object catch (_) {
          // One unreadable photo (unsupported format, broken file) must not drop the others.
          failed += 1;
        }
      }
    } finally {
      state = state.copyWith(images: images, compressing: false);
    }
    return (skipped: paths.length - accepted.length, failed: failed);
  }

  void removeImage(int index) => state = state.copyWith(images: [...state.images]..removeAt(index));

  void setNotes(String notes) => state = state.copyWith(notes: notes);

  void reset() => state = const GapDraft();
}

final gapDraftProvider = NotifierProvider<GapDraftController, GapDraft>(GapDraftController.new);

// ---- analysis run -------------------------------------------------------------------------------------------

class GapRequest {
  const GapRequest({required this.branch, required this.images, this.notes = ''});

  final Branch branch;
  final List<PickedImage> images;
  final String notes;
}

enum GapPhase { idle, loading, streaming, done, empty, error, cancelled }

class GapViewState {
  const GapViewState({
    this.branch,
    this.runId,
    this.phase = GapPhase.idle,
    this.message,
    this.counts,
    this.questions = const [],
    this.items = const [],
    this.recommendations = const [],
    this.warnings = const [],
    this.stats,
    this.status,
    this.error,
    this.createdAt,
    this.offline = false,
  });

  final Branch? branch;
  final String? runId;
  final GapPhase phase;
  final String? message;
  final GapCounts? counts;
  final List<Question> questions;
  final List<GapItem> items;
  final List<Recommendation> recommendations;
  final List<String> warnings;
  final GapStats? stats;

  /// Server status of the run (completed / partial / failed / cancelled).
  final String? status;
  final String? error;
  final DateTime? createdAt;

  /// Loaded from the local copy (no connection).
  final bool offline;

  List<GapItem> get incompleteItems => items.where((i) => !i.ok).toList();
  List<GapItem> get completeItems => items.where((i) => i.ok).toList();

  GapViewState copyWith({
    Branch? branch,
    String? runId,
    GapPhase? phase,
    String? message,
    GapCounts? counts,
    List<Question>? questions,
    List<GapItem>? items,
    List<Recommendation>? recommendations,
    List<String>? warnings,
    GapStats? stats,
    String? status,
    String? error,
    DateTime? createdAt,
    bool? offline,
  }) =>
      GapViewState(
        branch: branch ?? this.branch,
        runId: runId ?? this.runId,
        phase: phase ?? this.phase,
        message: message ?? this.message,
        counts: counts ?? this.counts,
        questions: questions ?? this.questions,
        items: items ?? this.items,
        recommendations: recommendations ?? this.recommendations,
        warnings: warnings ?? this.warnings,
        stats: stats ?? this.stats,
        status: status ?? this.status,
        error: error ?? this.error,
        createdAt: createdAt ?? this.createdAt,
        offline: offline ?? this.offline,
      );

  GapResult toResult() => GapResult(
        runId: runId ?? '',
        branchId: branch?.id,
        status: status ?? 'completed',
        counts: counts,
        items: items,
        recommendations: recommendations,
        questions: questions,
        stats: stats,
        createdAt: createdAt ?? DateTime.now(),
      );
}

class GapController extends Notifier<GapViewState> {
  CancelToken? _token;

  @override
  GapViewState build() {
    // Closing the screen only stops listening; the analysis finishes on the server and is shown as "latest".
    ref.onDispose(() => _token?.cancel('screen closed'));
    return const GapViewState();
  }

  ApiClient get _api => ref.read(apiClientProvider);
  AppDatabase get _db => ref.read(appDatabaseProvider);

  Future<void> start(GapRequest request) async {
    _token?.cancel('replaced');
    final token = _token = CancelToken();
    state = GapViewState(branch: request.branch, phase: GapPhase.streaming, createdAt: DateTime.now());
    try {
      final stream = _api.gapStream(
        branchId: request.branch.id,
        images: request.images.map((i) => UploadImage(path: i.path, sha256: i.sha256)).toList(),
        extraNotes: request.notes,
        cancelToken: token,
      );
      await for (final event in stream) {
        _handle(event);
      }
      final runId = state.runId;
      if (state.phase == GapPhase.streaming && runId != null) await _poll(runId);
    } on ApiException catch (e) {
      if (e.code == 'CANCELLED') return;
      final runId = state.runId;
      if (runId != null && e.isNetwork) {
        await _poll(runId);
        return;
      }
      state = state.copyWith(phase: GapPhase.error, error: e.serverMessage);
    }
  }

  /// Latest analysis of the branch (or a given run): server first, the local copy when offline.
  Future<void> load(Branch branch, {String? runId}) async {
    state = GapViewState(branch: branch, phase: GapPhase.loading);
    try {
      final result = runId != null ? await _api.gapResult(runId) : await _api.latestGap(branch.id);
      if (!ref.mounted) return;
      if (result == null) {
        state = state.copyWith(phase: GapPhase.empty);
        return;
      }
      _apply(result);
      if (result.isRunning) {
        await _poll(result.runId);
      } else {
        await _cache();
      }
    } on ApiException catch (e) {
      if (!ref.mounted) return;
      final cached = e.isNetwork ? await _readCache(branch.id) : null;
      if (cached != null) {
        _apply(cached, offline: true);
      } else {
        state = state.copyWith(phase: GapPhase.error, error: e.serverMessage);
      }
    }
  }

  Future<void> cancel() async {
    final runId = state.runId;
    _token?.cancel('user cancelled');
    state = state.copyWith(phase: GapPhase.cancelled);
    if (runId == null) return;
    try {
      await _api.cancelGap(runId);
    } on ApiException {
      // best effort
    }
  }

  void _handle(GapEvent event) {
    switch (event) {
      case GapRunEvent(:final runId):
        state = state.copyWith(runId: runId);
      case GapProgressEvent(:final message, :final done, :final total):
        state = state.copyWith(message: done != null && total != null && total > 0 ? '$message ($done/$total)' : message);
      case GapCountsEvent(:final counts):
        state = state.copyWith(counts: counts);
      case GapQuestionsEvent(:final questions, :final append):
        state = state.copyWith(questions: append ? [...state.questions, ...questions] : questions);
      case GapItemsEvent(:final items):
        state = state.copyWith(items: items);
      case GapRecommendationsEvent(:final items):
        state = state.copyWith(recommendations: [...state.recommendations, ...items]);
      case GapWarningEvent(:final message):
        state = state.copyWith(warnings: [...state.warnings, message]);
      case GapDoneEvent(:final status, :final stats):
        state = state.copyWith(
          phase: status == 'cancelled' ? GapPhase.cancelled : GapPhase.done,
          status: status,
          stats: stats,
        );
        unawaited(_cache());
      case GapErrorEvent(:final message):
        state = state.copyWith(phase: GapPhase.error, error: message);
    }
  }

  void _apply(GapResult result, {bool offline = false}) {
    state = state.copyWith(
      runId: result.runId,
      phase: result.isRunning
          ? GapPhase.streaming
          : result.status == 'cancelled'
              ? GapPhase.cancelled
              : GapPhase.done,
      status: result.status,
      counts: result.counts,
      questions: result.questions,
      items: result.items,
      recommendations: result.recommendations,
      stats: result.stats,
      createdAt: result.createdAt,
      offline: offline,
    );
  }

  Future<void> _poll(String runId) async {
    for (var attempt = 0; attempt < 60; attempt += 1) {
      await Future<void>.delayed(const Duration(seconds: 2));
      if (!ref.mounted) return;
      try {
        final result = await _api.gapResult(runId);
        if (!ref.mounted) return;
        if (!result.isRunning) {
          _apply(result);
          await _cache();
          return;
        }
      } on ApiException catch (e) {
        if (!e.isNetwork) {
          if (ref.mounted) state = state.copyWith(phase: GapPhase.error, error: e.serverMessage);
          return;
        }
      }
    }
  }

  Future<void> _cache() async {
    if (!ref.mounted) return;
    final branchId = state.branch?.id;
    if (branchId == null || state.counts == null) return;
    try {
      await _db.writeKv(gapCacheKey(branchId), jsonEncode(state.toResult().toJson()));
    } on Object catch (_) {
      // The local copy is best effort.
    }
  }

  Future<GapResult?> _readCache(String branchId) async {
    final raw = await _db.readKv(gapCacheKey(branchId));
    return raw == null ? null : GapResult.fromJson(decodeJson(raw));
  }
}

final gapControllerProvider = NotifierProvider.autoDispose<GapController, GapViewState>(GapController.new);

/// Ticked checklist keys of a branch (live from the local database).
final checkedQuestionsProvider = StreamProvider.autoDispose.family<Set<String>, String>(
  (ref, branchId) => ref.watch(appDatabaseProvider).watchChecked(checklistId(branchId)),
);
