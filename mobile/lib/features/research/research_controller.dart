import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../data/models/voice_research.dart';

String researchCacheKey(String branchId) => 'cache.research.$branchId';

enum ResearchPhase { idle, loading, done, error }

class ResearchState {
  const ResearchState({this.phase = ResearchPhase.idle, this.result, this.error, this.fromDevice = false});

  final ResearchPhase phase;
  final ResearchResult? result;

  /// null + error phase = no connection.
  final String? error;

  /// Shown from the phone's last copy (not searched just now).
  final bool fromDevice;
}

/// Web research of a branch's restaurant; the last result stays on the phone for offline reading.
class ResearchController extends Notifier<ResearchState> {
  ResearchController(this.branchId);

  final String branchId;

  @override
  ResearchState build() {
    unawaited(_loadLocal());
    return const ResearchState();
  }

  Future<void> _loadLocal() async {
    final raw = await ref.read(appDatabaseProvider).readKv(researchCacheKey(branchId));
    if (raw == null || !ref.mounted || state.result != null || state.phase == ResearchPhase.loading) return;
    state = ResearchState(phase: ResearchPhase.done, result: ResearchResult.fromJson(decodeJson(raw)), fromDevice: true);
  }

  Future<void> run({bool refresh = false}) async {
    final previous = state.result;
    state = ResearchState(phase: ResearchPhase.loading, result: previous);
    try {
      final result = await ref.read(apiClientProvider).research(branchId: branchId, refresh: refresh);
      if (!ref.mounted) return;
      state = ResearchState(phase: ResearchPhase.done, result: result);
      await ref.read(appDatabaseProvider).writeKv(researchCacheKey(branchId), jsonEncode(result.toJson()));
    } on ApiException catch (e) {
      if (!ref.mounted) return;
      state = ResearchState(phase: ResearchPhase.error, result: previous, error: e.serverMessage, fromDevice: previous != null);
    }
  }
}

final researchControllerProvider =
    NotifierProvider.autoDispose.family<ResearchController, ResearchState, String>(ResearchController.new);
