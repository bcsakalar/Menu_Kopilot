import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'app_database.g.dart';

/// Small key/value store (server URL, recent cuisines, cached JSON blobs).
class KvEntries extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column> get primaryKey => {key};
}

/// The analysis history on the phone (D-193): every run with its date and time, what the list shows and filters on,
/// and — for the newest ones — the whole result, so it opens without a connection. Runs made on another phone arrive
/// from the server with their summary only (`snapshotJson` is `{}` until one is opened).
class RecentRuns extends Table {
  TextColumn get runId => text()();
  TextColumn get cuisineId => text().nullable()();
  TextColumn get cuisineName => text().withDefault(const Constant(''))();
  TextColumn get title => text().withDefault(const Constant(''))();
  TextColumn get status => text()();
  IntColumn get cardCount => integer().withDefault(const Constant(0))();
  TextColumn get snapshotJson => text()();
  DateTimeColumn get createdAt => dateTime()();
  // v2 (D-193): what the history screen shows and filters on.
  /// "quick" or "full"; null for runs made before it was stored.
  TextColumn get mode => text().nullable()();
  DateTimeColumn get finishedAt => dateTime().nullable()();
  /// The first products of the menu, a JSON list — the row's title and what the search looks in.
  TextColumn get productNamesJson => text().withDefault(const Constant('[]'))();
  IntColumn get menuCount => integer().withDefault(const Constant(0))();
  IntColumn get newCount => integer().withDefault(const Constant(0))();
  IntColumn get menuCardCount => integer().withDefault(const Constant(0))();
  IntColumn get acceptedCount => integer().withDefault(const Constant(0))();
  IntColumn get skippedCount => integer().withDefault(const Constant(0))();
  IntColumn get currentCount => integer().nullable()();
  IntColumn get targetCount => integer().nullable()();

  @override
  Set<Column> get primaryKey => {runId};
}

/// Requests made while offline (suggest / accept / skip / gap); sent when the connection returns — also from the
/// background worker, so they survive the app being closed.
class PendingRequests extends Table {
  TextColumn get id => text()();
  TextColumn get kind => text()();
  TextColumn get payloadJson => text()();
  TextColumn get imagePathsJson => text().withDefault(const Constant('[]'))();
  TextColumn get status => text().withDefault(const Constant('queued'))();
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  TextColumn get lastError => text().nullable()();
  TextColumn get serverRunId => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Call checklist ticks of a gap analysis ("Çağrıda sor"), persisted while on the phone.
/// Kept for the schema version, unused since the call checklist became the "Eksik / Düzeltme" section.
/// Dropping it needs a Drift migration and a build_runner pass — see docs/FAZ3_RAPOR.md.
class ChecklistTicks extends Table {
  TextColumn get analysisId => text()();
  TextColumn get questionKey => text()();
  BoolColumn get checked => boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {analysisId, questionKey};
}

/// Template pool cache for offline browsing.
class CachedTemplates extends Table {
  TextColumn get id => text()();
  TextColumn get cuisineId => text()();
  TextColumn get cuisineName => text().withDefault(const Constant(''))();
  TextColumn get name => text()();
  TextColumn get searchKey => text()();
  TextColumn get source => text()();
  BoolColumn get approved => boolean().withDefault(const Constant(true))();
  IntColumn get usageCount => integer().withDefault(const Constant(0))();
  TextColumn get payloadJson => text()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

@DriftDatabase(tables: [KvEntries, RecentRuns, PendingRequests, ChecklistTicks, CachedTemplates])
class AppDatabase extends _$AppDatabase {
  AppDatabase([QueryExecutor? executor]) : super(executor ?? driftDatabase(name: 'menu_kopilot'));

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        onUpgrade: (m, from, to) async {
          // v2: the history columns. Existing rows keep their snapshot and get zero counts until next saved or synced.
          if (from < 2) {
            for (final column in [
              recentRuns.mode,
              recentRuns.finishedAt,
              recentRuns.productNamesJson,
              recentRuns.menuCount,
              recentRuns.newCount,
              recentRuns.menuCardCount,
              recentRuns.acceptedCount,
              recentRuns.skippedCount,
              recentRuns.currentCount,
              recentRuns.targetCount,
            ]) {
              await m.addColumn(recentRuns, column);
            }
          }
        },
      );

  // ---- key/value --------------------------------------------------------------------------------------------

  Future<String?> readKv(String key) async {
    final row = await (select(kvEntries)..where((t) => t.key.equals(key))).getSingleOrNull();
    return row?.value;
  }

  Future<void> writeKv(String key, String value) =>
      into(kvEntries).insertOnConflictUpdate(KvEntriesCompanion.insert(key: key, value: value));

  Future<void> deleteKv(String key) => (delete(kvEntries)..where((t) => t.key.equals(key))).go();

  // ---- recent runs ------------------------------------------------------------------------------------------

  /// How many runs the phone keeps, and how many of the newest keep their whole result for offline reading.
  static const historyLimit = 500;
  static const snapshotLimit = 100;

  /// Saves a run the phone made or opened. A run saved again (a card accepted later) keeps the time it was made.
  Future<void> saveRecentRun(RecentRunsCompanion run) async {
    await transaction(() async {
      final existing = await recentRun(run.runId.value);
      await into(recentRuns).insertOnConflictUpdate(existing == null ? run : run.copyWith(createdAt: Value(existing.createdAt)));
    });
    await _trimHistory();
  }

  /// Rows from the server's history (runs made on another phone, or before this install): the summary is refreshed,
  /// a result already on the phone stays.
  Future<void> upsertHistory(List<RecentRunsCompanion> rows) async {
    await transaction(() async {
      for (final row in rows) {
        final existing = await recentRun(row.runId.value);
        if (existing == null) {
          await into(recentRuns).insert(row);
        } else {
          await (update(recentRuns)..where((t) => t.runId.equals(row.runId.value))).write(
                row.copyWith(
                  createdAt: const Value.absent(),
                  snapshotJson: const Value.absent(),
                  // A photo-only run has no title on the server; the phone may know the typed text.
                  title: existing.title.isNotEmpty ? const Value.absent() : row.title,
                ),
              );
        }
      }
    });
    await _trimHistory();
  }

  Future<void> _trimHistory() async {
    final beyond = await (select(recentRuns)
          ..orderBy([(t) => OrderingTerm.desc(t.createdAt)])
          ..limit(100000, offset: historyLimit))
        .get();
    for (final row in beyond) {
      await (delete(recentRuns)..where((t) => t.runId.equals(row.runId))).go();
    }
    // Older results give their room back; the summary stays, and the server still has the whole run.
    final old = await (select(recentRuns)
          ..where((t) => t.snapshotJson.length.isBiggerThanValue(2))
          ..orderBy([(t) => OrderingTerm.desc(t.createdAt)])
          ..limit(100000, offset: snapshotLimit))
        .get();
    for (final row in old) {
      await (update(recentRuns)..where((t) => t.runId.equals(row.runId))).write(const RecentRunsCompanion(snapshotJson: Value('{}')));
    }
  }

  Stream<List<RecentRun>> watchRecentRuns() =>
      (select(recentRuns)..orderBy([(t) => OrderingTerm.desc(t.createdAt)])).watch();

  Future<RecentRun?> recentRun(String runId) =>
      (select(recentRuns)..where((t) => t.runId.equals(runId))).getSingleOrNull();

  // ---- pending requests -------------------------------------------------------------------------------------

  Future<List<PendingRequest>> queuedRequests() => (select(pendingRequests)
        ..where((t) => t.status.equals('queued'))
        ..orderBy([(t) => OrderingTerm.asc(t.createdAt)]))
      .get();

  Stream<int> watchQueuedCount() {
    final count = pendingRequests.id.count();
    final query = selectOnly(pendingRequests)
      ..addColumns([count])
      ..where(pendingRequests.status.equals('queued'));
    return query.map((row) => row.read(count) ?? 0).watchSingle();
  }

  // ---- checklist --------------------------------------------------------------------------------------------

  Stream<Set<String>> watchChecked(String analysisId) =>
      (select(checklistTicks)..where((t) => t.analysisId.equals(analysisId) & t.checked.equals(true)))
          .watch()
          .map((rows) => rows.map((r) => r.questionKey).toSet());

  Future<void> setChecked(String analysisId, String questionKey, bool checked) =>
      into(checklistTicks).insertOnConflictUpdate(
        ChecklistTicksCompanion.insert(analysisId: analysisId, questionKey: questionKey, checked: Value(checked)),
      );

  Future<void> clearChecked(String analysisId) =>
      (delete(checklistTicks)..where((t) => t.analysisId.equals(analysisId))).go();

  // ---- template pool cache ----------------------------------------------------------------------------------

  Future<List<CachedTemplate>> cachedTemplateRows() =>
      (select(cachedTemplates)..orderBy([(t) => OrderingTerm.desc(t.usageCount), (t) => OrderingTerm.asc(t.searchKey)])).get();

  /// Replaces the whole cached pool (the server copy is the truth).
  Future<void> replaceCachedTemplates(List<CachedTemplatesCompanion> rows) => transaction(() async {
        await delete(cachedTemplates).go();
        await batch((b) => b.insertAll(cachedTemplates, rows));
      });

  Future<void> upsertCachedTemplate(CachedTemplatesCompanion row) => into(cachedTemplates).insertOnConflictUpdate(row);

  Future<void> deleteCachedTemplate(String id) => (delete(cachedTemplates)..where((t) => t.id.equals(id))).go();
}
