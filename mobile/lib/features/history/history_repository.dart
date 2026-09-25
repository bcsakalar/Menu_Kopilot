import 'dart:convert';

import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart' show DateTimeRange;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/providers.dart';
import '../../core/storage/app_database.dart';
import '../../data/models/history.dart';

/// The analysis history (D-193). The phone is where it lives: every run it made is saved with its date and time the
/// moment it is known, and the server's list fills in runs made on another phone or before this install. The screen
/// always reads the phone's copy, so it opens instantly and works without a connection; filtering happens here too.

/// One analysis as the history screen shows it.
class HistoryEntry {
  HistoryEntry(this.row) : productNames = _names(row.productNamesJson);

  final RecentRun row;

  /// The first products of the menu (up to five).
  final List<String> productNames;

  String get runId => row.runId;
  DateTime get createdAt => row.createdAt;
  String? get mode => row.mode;
  String? get cuisineId => row.cuisineId;
  String get cuisineName => row.cuisineName;
  String get status => row.status;

  /// The whole result is on the phone: it opens without a connection.
  bool get openableOffline => row.snapshotJson.length > 2;

  static List<String> _names(String json) {
    try {
      final value = jsonDecode(json);
      return value is List ? value.whereType<String>().toList() : const [];
    } on FormatException {
      return const [];
    }
  }
}

/// Turkish text folded for search: "İŞKEMBE", "işkembe" and "iskembe" all find each other.
String foldForSearch(String text) {
  const from = 'çğıöşüâîûÇĞIİÖŞÜÂÎÛ';
  const to = 'cgiosuaiucgiiosuaiu';
  final buffer = StringBuffer();
  for (final rune in text.runes) {
    final char = String.fromCharCode(rune);
    final index = from.indexOf(char);
    buffer.write(index >= 0 ? to[index] : char.toLowerCase());
  }
  return buffer.toString();
}

enum HistoryPeriod { all, today, week, month, custom }

/// What the history screen is filtered on. Empty filter: everything, newest first.
class HistoryFilter {
  const HistoryFilter({this.period = HistoryPeriod.all, this.range, this.cuisineId, this.mode, this.query = ''});

  final HistoryPeriod period;

  /// The chosen days when [period] is [HistoryPeriod.custom], both ends included.
  final DateTimeRange? range;
  final String? cuisineId;

  /// "quick" or "full".
  final String? mode;
  final String query;

  bool get isActive => period != HistoryPeriod.all || cuisineId != null || mode != null || query.trim().isNotEmpty;

  HistoryFilter copyWith({
    HistoryPeriod? period,
    DateTimeRange? range,
    String? Function()? cuisineId,
    String? Function()? mode,
    String? query,
  }) =>
      HistoryFilter(
        period: period ?? this.period,
        range: period == null || period == HistoryPeriod.custom ? (range ?? this.range) : null,
        cuisineId: cuisineId == null ? this.cuisineId : cuisineId(),
        mode: mode == null ? this.mode : mode(),
        query: query ?? this.query,
      );

  /// The window of [period] in local time: from (inclusive) to (exclusive); null ends are open.
  (DateTime?, DateTime?) window(DateTime now) {
    final today = DateTime(now.year, now.month, now.day);
    return switch (period) {
      HistoryPeriod.all => (null, null),
      HistoryPeriod.today => (today, null),
      HistoryPeriod.week => (today.subtract(const Duration(days: 6)), null),
      HistoryPeriod.month => (DateTime(now.year, now.month), null),
      HistoryPeriod.custom => range == null
          ? (null, null)
          : (
              DateTime(range!.start.year, range!.start.month, range!.start.day),
              DateTime(range!.end.year, range!.end.month, range!.end.day).add(const Duration(days: 1)),
            ),
    };
  }

  bool matches(HistoryEntry entry, DateTime now) {
    final (from, to) = window(now);
    if (from != null && entry.createdAt.isBefore(from)) return false;
    if (to != null && !entry.createdAt.isBefore(to)) return false;
    if (cuisineId != null && entry.cuisineId != cuisineId) return false;
    if (mode != null && entry.mode != mode) return false;
    final needle = foldForSearch(query.trim());
    if (needle.isEmpty) return true;
    final haystack = foldForSearch([entry.row.title, entry.cuisineName, ...entry.productNames].join(' '));
    return haystack.contains(needle);
  }
}

class HistoryRepository {
  HistoryRepository(this._api, this._db);

  final ApiClient _api;
  final AppDatabase _db;

  /// Pulls the server's history onto the phone, newest first. Stops at the first page that brings nothing new —
  /// every run on it already known, in the same state — or after [maxPages].
  Future<void> sync({int maxPages = 6}) async {
    DateTime? before;
    for (var page = 0; page < maxPages; page += 1) {
      final result = await _api.analysisHistory(limit: 50, before: before);
      if (result.items.isEmpty) return;
      var changed = false;
      for (final item in result.items) {
        final known = await _db.recentRun(item.runId);
        if (known == null ||
            known.status != item.status ||
            known.acceptedCount != item.accepted ||
            known.skippedCount != item.skipped ||
            known.productNamesJson == '[]') {
          changed = true;
          break;
        }
      }
      await _db.upsertHistory(result.items.map(companionOf).toList());
      if (!changed || result.nextBefore == null) return;
      before = DateTime.tryParse(result.nextBefore!);
      if (before == null) return;
    }
  }

  static RecentRunsCompanion companionOf(HistoryItem item) => RecentRunsCompanion.insert(
        runId: item.runId,
        cuisineId: Value(item.cuisineId),
        cuisineName: Value(item.cuisineName),
        status: item.status,
        cardCount: Value(item.newProducts + item.menuCards),
        snapshotJson: '{}',
        createdAt: item.createdAt,
        mode: Value(item.mode),
        finishedAt: Value(item.finishedAt),
        productNamesJson: Value(jsonEncode(item.productNames)),
        menuCount: Value(item.menuCount),
        newCount: Value(item.newProducts),
        menuCardCount: Value(item.menuCards),
        acceptedCount: Value(item.accepted),
        skippedCount: Value(item.skipped),
        currentCount: Value(item.current),
        targetCount: Value(item.target),
      );
}

final historyRepositoryProvider = Provider<HistoryRepository>(
  (ref) => HistoryRepository(ref.watch(apiClientProvider), ref.watch(appDatabaseProvider)),
);

/// Every analysis on the phone, newest first.
final historyEntriesProvider = StreamProvider<List<HistoryEntry>>(
  (ref) => ref.watch(appDatabaseProvider).watchRecentRuns().map((rows) => rows.map(HistoryEntry.new).toList()),
);
