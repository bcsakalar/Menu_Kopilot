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

/// Finished runs kept for offline reading ("Son öneriler").
class RecentRuns extends Table {
  TextColumn get runId => text()();
  TextColumn get cuisineId => text().nullable()();
  TextColumn get cuisineName => text().withDefault(const Constant(''))();
  TextColumn get title => text().withDefault(const Constant(''))();
  TextColumn get status => text()();
  IntColumn get cardCount => integer().withDefault(const Constant(0))();
  TextColumn get snapshotJson => text()();
  DateTimeColumn get createdAt => dateTime()();

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
  int get schemaVersion => 1;

  // ---- key/value --------------------------------------------------------------------------------------------

  Future<String?> readKv(String key) async {
    final row = await (select(kvEntries)..where((t) => t.key.equals(key))).getSingleOrNull();
    return row?.value;
  }

  Future<void> writeKv(String key, String value) =>
      into(kvEntries).insertOnConflictUpdate(KvEntriesCompanion.insert(key: key, value: value));

  Future<void> deleteKv(String key) => (delete(kvEntries)..where((t) => t.key.equals(key))).go();

  // ---- recent runs ------------------------------------------------------------------------------------------

  Future<void> saveRecentRun(RecentRunsCompanion run) async {
    await into(recentRuns).insertOnConflictUpdate(run);
    // Keep the 30 newest.
    final old = await (select(recentRuns)
          ..orderBy([(t) => OrderingTerm.desc(t.createdAt)])
          ..limit(1000, offset: 30))
        .get();
    for (final row in old) {
      await (delete(recentRuns)..where((t) => t.runId.equals(row.runId))).go();
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
}
