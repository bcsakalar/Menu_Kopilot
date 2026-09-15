import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../data/models/branch.dart';

const String branchesCacheKey = 'cache.branches';
const String selectedBranchKey = 'gap.branch';

/// The user's branches; falls back to the last cached copy when offline.
final branchesProvider = FutureProvider<List<Branch>>((ref) async {
  final db = ref.watch(appDatabaseProvider);
  final api = ref.watch(apiClientProvider);
  try {
    final list = await api.branches();
    await db.writeKv(branchesCacheKey, jsonEncode(list.map((b) => b.toJson()).toList()));
    return list;
  } on ApiException catch (e) {
    if (!e.isNetwork) rethrow;
    final cached = await db.readKv(branchesCacheKey);
    if (cached == null) rethrow;
    final decoded = jsonDecode(cached);
    return decoded is List ? decoded.whereType<Map<String, Object?>>().map(Branch.fromJson).toList() : <Branch>[];
  }
});

/// Branch picked on the "Tamamla" tab (remembered across app starts).
class SelectedBranchController extends AsyncNotifier<String?> {
  @override
  Future<String?> build() => ref.read(appDatabaseProvider).readKv(selectedBranchKey);

  Future<void> select(String? branchId) async {
    final db = ref.read(appDatabaseProvider);
    if (branchId == null) {
      await db.deleteKv(selectedBranchKey);
    } else {
      await db.writeKv(selectedBranchKey, branchId);
    }
    state = AsyncData(branchId);
  }
}

final selectedBranchIdProvider = AsyncNotifierProvider<SelectedBranchController, String?>(SelectedBranchController.new);

/// The selected branch object (null when none is selected or it no longer exists).
final selectedBranchProvider = Provider<Branch?>((ref) {
  final id = ref.watch(selectedBranchIdProvider).value;
  final list = ref.watch(branchesProvider).value ?? const <Branch>[];
  if (id == null) return null;
  for (final branch in list) {
    if (branch.id == id) return branch;
  }
  return null;
});
