import 'dart:convert';

import 'package:drift/drift.dart' show Value;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/storage/app_database.dart';
import '../../data/models/template_item.dart';
import '../../data/models/template_payload.dart';

/// Turkish-insensitive search key ("Çiğ Köfte" → "cig kofte"), mirroring the backend's normalization closely enough
/// for local filtering.
String foldTr(String value) {
  const from = 'çğıöşüâîûÇĞİIÖŞÜÂÎÛ';
  const to = 'cgiosuaiucgiiosuaiu';
  final buffer = StringBuffer();
  for (final rune in value.runes) {
    final char = String.fromCharCode(rune);
    final index = from.indexOf(char);
    buffer.write(index >= 0 ? to[index] : char.toLowerCase());
  }
  return buffer.toString().replaceAll(RegExp(r'\s+'), ' ').trim();
}

enum TemplateSort { usage, name, updated }

class TemplateFilter {
  const TemplateFilter({this.query = '', this.cuisineId, this.source, this.sort = TemplateSort.usage});

  final String query;
  final String? cuisineId;

  /// null = all, otherwise `seed` or `user`.
  final String? source;
  final TemplateSort sort;

  TemplateFilter copyWith({String? query, String? Function()? cuisineId, String? Function()? source, TemplateSort? sort}) =>
      TemplateFilter(
        query: query ?? this.query,
        cuisineId: cuisineId == null ? this.cuisineId : cuisineId(),
        source: source == null ? this.source : source(),
        sort: sort ?? this.sort,
      );

  List<TemplateItem> apply(List<TemplateItem> items) {
    final q = foldTr(query);
    final filtered = items.where((t) {
      if (cuisineId != null && t.cuisineId != cuisineId) return false;
      if (source == 'seed' && t.source != 'seed') return false;
      if (source == 'user' && t.source == 'seed') return false;
      if (q.isEmpty) return true;
      return foldTr(t.name).contains(q) || t.aliases.any((a) => foldTr(a).contains(q));
    }).toList();
    switch (sort) {
      case TemplateSort.usage:
        filtered.sort((a, b) {
          final byUsage = b.usageCount.compareTo(a.usageCount);
          if (byUsage != 0) return byUsage;
          final byImportance = b.importance.compareTo(a.importance);
          return byImportance != 0 ? byImportance : foldTr(a.name).compareTo(foldTr(b.name));
        });
      case TemplateSort.name:
        filtered.sort((a, b) => foldTr(a.name).compareTo(foldTr(b.name)));
      case TemplateSort.updated:
        filtered.sort((a, b) => (b.updatedAt ?? DateTime(0)).compareTo(a.updatedAt ?? DateTime(0)));
    }
    return filtered;
  }
}

class TemplatePool {
  const TemplatePool({this.items = const [], this.offline = false});

  final List<TemplateItem> items;

  /// Served from the local copy (no connection).
  final bool offline;
}

CachedTemplatesCompanion _row(TemplateItem item) => CachedTemplatesCompanion.insert(
      id: item.id,
      cuisineId: item.cuisineId,
      cuisineName: Value(item.cuisineName),
      name: item.name,
      searchKey: foldTr([item.name, ...item.aliases].join(' ')),
      source: item.source,
      approved: Value(item.approved),
      usageCount: Value(item.usageCount),
      payloadJson: jsonEncode(item.toJson()),
      updatedAt: item.updatedAt ?? DateTime.now(),
    );

/// The approved template pool, cached in Drift so it can be browsed offline.
class TemplatePoolController extends AsyncNotifier<TemplatePool> {
  @override
  Future<TemplatePool> build() async {
    final db = ref.read(appDatabaseProvider);
    try {
      final page = await ref.read(apiClientProvider).templates(limit: 500);
      await db.replaceCachedTemplates(page.items.map(_row).toList());
      return TemplatePool(items: page.items);
    } on ApiException catch (e) {
      if (!e.isNetwork) rethrow;
      final rows = await db.cachedTemplateRows();
      if (rows.isEmpty) rethrow;
      return TemplatePool(items: rows.map((r) => TemplateItem.fromJson(decodeJson(r.payloadJson))).toList(), offline: true);
    }
  }

  void _replace(TemplateItem item) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(TemplatePool(items: [for (final t in current.items) t.id == item.id ? item : t], offline: current.offline));
  }

  /// Saves an edited template (the server turns seed templates into user templates).
  Future<TemplateItem> save(TemplateItem item, TemplatePayload payload) async {
    final updated = await ref.read(apiClientProvider).updateTemplate(item.id, {'payload': payload.normalized().toJson()});
    await ref.read(appDatabaseProvider).upsertCachedTemplate(_row(updated));
    _replace(updated);
    return updated;
  }

  Future<void> remove(TemplateItem item) async {
    await ref.read(apiClientProvider).deleteTemplate(item.id);
    await ref.read(appDatabaseProvider).deleteCachedTemplate(item.id);
    final current = state.value;
    if (current == null) return;
    state = AsyncData(TemplatePool(items: current.items.where((t) => t.id != item.id).toList(), offline: current.offline));
  }
}

final templatePoolProvider = AsyncNotifierProvider<TemplatePoolController, TemplatePool>(TemplatePoolController.new);

class TemplateFilterController extends Notifier<TemplateFilter> {
  @override
  TemplateFilter build() => const TemplateFilter();

  void setQuery(String query) => state = state.copyWith(query: query);
  void setCuisine(String? cuisineId) => state = state.copyWith(cuisineId: () => cuisineId);
  void setSource(String? source) => state = state.copyWith(source: () => source);
  void setSort(TemplateSort sort) => state = state.copyWith(sort: sort);
}

final templateFilterProvider = NotifierProvider<TemplateFilterController, TemplateFilter>(TemplateFilterController.new);

/// Pool after search / filter / sort.
final filteredTemplatesProvider = Provider<List<TemplateItem>>((ref) {
  final pool = ref.watch(templatePoolProvider).value;
  if (pool == null) return const [];
  return ref.watch(templateFilterProvider).apply(pool.items);
});
