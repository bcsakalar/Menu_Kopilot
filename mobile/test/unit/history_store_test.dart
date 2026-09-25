import 'package:drift/drift.dart' show DatabaseConnection, Value;
import 'package:drift/native.dart';
import 'package:flutter/material.dart' show DateTimeRange;
import 'package:flutter_test/flutter_test.dart';
import 'package:menu_kopilot/core/storage/app_database.dart';
import 'package:menu_kopilot/data/models/history.dart';
import 'package:menu_kopilot/features/history/history_repository.dart';

RecentRunsCompanion run(String id, DateTime at, {String snapshot = '{}', String title = '', String? mode, String names = '[]'}) =>
    RecentRunsCompanion.insert(
      runId: id,
      status: 'completed',
      snapshotJson: snapshot,
      createdAt: at,
      title: Value(title),
      mode: Value(mode),
      productNamesJson: Value(names),
    );

void main() {
  late AppDatabase db;

  setUp(() => db = AppDatabase(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true)));
  tearDown(() => db.close());

  group('the history on the phone (D-193)', () {
    test('a run saved again later keeps the time it was made', () async {
      final made = DateTime(2026, 9, 25, 9, 5);
      await db.saveRecentRun(run('r1', made, snapshot: '{"cards":[]}'));
      await db.saveRecentRun(run('r1', DateTime(2026, 9, 25, 11, 40), snapshot: '{"cards":[1]}'));
      final row = await db.recentRun('r1');
      expect(row?.createdAt, made);
      expect(row?.snapshotJson, '{"cards":[1]}');
    });

    test("the server's list refreshes the summary but never drops a result or a title the phone has", () async {
      await db.saveRecentRun(run('r1', DateTime(2026, 9, 25, 9), snapshot: '{"cards":[]}', title: 'Kıymalı Pide, Kaşarlı Pide'));
      await db.upsertHistory([
        HistoryRepository.companionOf(
          HistoryItem(
            runId: 'r1',
            createdAt: DateTime(2026, 9, 25, 9),
            status: 'completed',
            mode: 'quick',
            productNames: const ['Kıymalı Pide', 'Kaşarlı Pide'],
            menuCount: 2,
            newProducts: 6,
            accepted: 2,
          ),
        ),
        HistoryRepository.companionOf(HistoryItem(runId: 'r2', createdAt: DateTime(2026, 9, 20, 18), status: 'partial')),
      ]);
      final r1 = (await db.recentRun('r1'))!;
      expect(r1.snapshotJson, '{"cards":[]}');
      expect(r1.title, 'Kıymalı Pide, Kaşarlı Pide');
      expect((r1.mode, r1.newCount, r1.acceptedCount, r1.menuCount), ('quick', 6, 2, 2));
      final r2 = (await db.recentRun('r2'))!;
      expect(r2.snapshotJson, '{}');
      expect(r2.status, 'partial');
    });

    test('keeps the newest 500 analyses, and the whole result only for the newest 100', () async {
      final start = DateTime(2026, 1, 1);
      await db.upsertHistory([
        for (var i = 0; i < 505; i += 1) run('r$i', start.add(Duration(hours: i)), snapshot: '{"i":$i}'),
      ]);
      final rows = await db.watchRecentRuns().first;
      expect(rows, hasLength(AppDatabase.historyLimit));
      // Newest first: r504 … r5; the five oldest are gone.
      expect(rows.first.runId, 'r504');
      expect(rows.last.runId, 'r5');
      expect(rows.where((r) => r.snapshotJson.length > 2), hasLength(AppDatabase.snapshotLimit));
      expect(rows.take(AppDatabase.snapshotLimit).every((r) => r.snapshotJson.length > 2), isTrue);
    });
  });

  group('history filter', () {
    final now = DateTime(2026, 9, 25, 15);
    HistoryEntry entry(DateTime at, {String? mode, String cuisineId = 'c1', String names = '[]', String title = '', String cuisine = ''}) =>
        HistoryEntry(
          RecentRun(
            runId: 'r',
            cuisineId: cuisineId,
            cuisineName: cuisine,
            title: title,
            status: 'completed',
            cardCount: 0,
            snapshotJson: '{}',
            createdAt: at,
            mode: mode,
            productNamesJson: names,
            menuCount: 0,
            newCount: 0,
            menuCardCount: 0,
            acceptedCount: 0,
            skippedCount: 0,
          ),
        );

    test('finds a product whatever the Turkish letters are typed with', () {
      final soup = entry(now, names: '["İşkembe Çorbası","Mercimek Çorbası"]');
      expect(const HistoryFilter(query: 'iskembe').matches(soup, now), isTrue);
      expect(const HistoryFilter(query: 'İŞKEMBE').matches(soup, now), isTrue);
      expect(const HistoryFilter(query: 'çorba').matches(soup, now), isTrue);
      expect(const HistoryFilter(query: 'pide').matches(soup, now), isFalse);
      // The cuisine and the typed menu line are searched too.
      expect(const HistoryFilter(query: 'lahmacun').matches(entry(now, cuisine: 'Pide & Lahmacun'), now), isTrue);
      expect(const HistoryFilter(query: 'adana').matches(entry(now, title: 'Adana Kebap, Urfa Kebap'), now), isTrue);
    });

    test('by date: today, the last seven days, this month, a range of days (both ends included)', () {
      final morning = entry(DateTime(2026, 9, 25, 8));
      final lastWeek = entry(DateTime(2026, 9, 19, 23));
      final lastMonth = entry(DateTime(2026, 8, 30, 12));
      expect(const HistoryFilter(period: HistoryPeriod.today).matches(morning, now), isTrue);
      expect(const HistoryFilter(period: HistoryPeriod.today).matches(lastWeek, now), isFalse);
      expect(const HistoryFilter(period: HistoryPeriod.week).matches(lastWeek, now), isTrue);
      expect(const HistoryFilter(period: HistoryPeriod.month).matches(lastWeek, now), isTrue);
      expect(const HistoryFilter(period: HistoryPeriod.month).matches(lastMonth, now), isFalse);
      final range = HistoryFilter(period: HistoryPeriod.custom, range: DateTimeRange(start: DateTime(2026, 8, 30), end: DateTime(2026, 9, 19)));
      expect(range.matches(lastMonth, now), isTrue);
      expect(range.matches(lastWeek, now), isTrue);
      expect(range.matches(morning, now), isFalse);
    });

    test('by mode and by cuisine', () {
      final quick = entry(now, mode: 'quick', cuisineId: 'pizza');
      expect(const HistoryFilter(mode: 'quick').matches(quick, now), isTrue);
      expect(const HistoryFilter(mode: 'full').matches(quick, now), isFalse);
      expect(const HistoryFilter(cuisineId: 'pizza').matches(quick, now), isTrue);
      expect(const HistoryFilter(cuisineId: 'kebap').matches(quick, now), isFalse);
      // Clearing one filter keeps the others.
      final both = const HistoryFilter(mode: 'quick', cuisineId: 'pizza').copyWith(mode: () => null);
      expect((both.mode, both.cuisineId), (null, 'pizza'));
    });
  });
}
