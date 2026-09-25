import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/design/components.dart';
import '../../core/design/tokens.dart';
import '../../core/network/api_exception.dart';
import '../../core/widgets/common.dart';
import '../../l10n/gen/app_localizations.dart';
import 'history_repository.dart';

/// "Analiz geçmişi" (D-193): every analysis with its date and time, newest first, under a heading per day. A search
/// box and four filters — date, quick, full, cuisine — narrow it down; a tap reopens the result.
class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});

  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  final _search = TextEditingController();
  HistoryFilter _filter = const HistoryFilter();
  bool _syncing = false;
  bool _offline = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _sync());
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _sync() async {
    if (!mounted) return;
    setState(() => _syncing = true);
    try {
      await ref.read(historyRepositoryProvider).sync();
      if (mounted) setState(() => _offline = false);
    } on ApiException catch (e) {
      if (mounted) setState(() => _offline = e.isNetwork);
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  void _setFilter(HistoryFilter filter) => setState(() => _filter = filter);

  void _clear() {
    _search.clear();
    _setFilter(const HistoryFilter());
  }

  Future<void> _pickPeriod() async {
    final l10n = context.l10n;
    final choice = await showModalBottomSheet<HistoryPeriod>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (period, label) in [
              (HistoryPeriod.all, l10n.periodAllTimes),
              (HistoryPeriod.today, l10n.periodToday),
              (HistoryPeriod.week, l10n.periodWeek),
              (HistoryPeriod.month, l10n.periodMonth),
              (HistoryPeriod.custom, l10n.periodCustom),
            ])
              ListTile(
                key: ValueKey('period-${period.name}'),
                title: Text(label),
                trailing: _filter.period == period ? const Icon(Icons.check_rounded) : null,
                onTap: () => Navigator.of(context).pop(period),
              ),
          ],
        ),
      ),
    );
    if (choice == null || !mounted) return;
    if (choice != HistoryPeriod.custom) {
      _setFilter(_filter.copyWith(period: choice));
      return;
    }
    final now = DateTime.now();
    final range = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 3),
      lastDate: now,
      initialDateRange: _filter.range,
    );
    if (range != null && mounted) _setFilter(_filter.copyWith(period: HistoryPeriod.custom, range: range));
  }

  Future<void> _pickCuisine(Map<String, String> cuisines) async {
    final l10n = context.l10n;
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            ListTile(
              key: const ValueKey('cuisine-all'),
              title: Text(l10n.allCuisines),
              trailing: _filter.cuisineId == null ? const Icon(Icons.check_rounded) : null,
              onTap: () => Navigator.of(context).pop(''),
            ),
            for (final MapEntry(:key, :value) in cuisines.entries)
              ListTile(
                key: ValueKey('cuisine-$key'),
                title: Text(value),
                trailing: _filter.cuisineId == key ? const Icon(Icons.check_rounded) : null,
                onTap: () => Navigator.of(context).pop(key),
              ),
          ],
        ),
      ),
    );
    if (choice == null || !mounted) return;
    _setFilter(_filter.copyWith(cuisineId: () => choice.isEmpty ? null : choice));
  }

  void _open(HistoryEntry entry) {
    if (_offline && !entry.openableOffline) {
      showMessage(context, context.l10n.historyNeedsConnection);
      return;
    }
    context.push('/suggest/results?runId=${entry.runId}');
  }

  String _periodLabel(AppLocalizations l10n) => switch (_filter.period) {
        HistoryPeriod.all => l10n.periodAll,
        HistoryPeriod.today => l10n.periodToday,
        HistoryPeriod.week => l10n.periodWeek,
        HistoryPeriod.month => l10n.periodMonth,
        HistoryPeriod.custom => _filter.range == null
            ? l10n.periodCustom
            : '${DateFormat('d MMM', 'tr').format(_filter.range!.start)} – ${DateFormat('d MMM', 'tr').format(_filter.range!.end)}',
      };

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final all = ref.watch(historyEntriesProvider).value ?? const <HistoryEntry>[];
    final now = DateTime.now();
    final shown = all.where((e) => _filter.matches(e, now)).toList();
    final cuisines = <String, String>{
      for (final e in all)
        if (e.cuisineId != null && e.cuisineName.isNotEmpty) e.cuisineId!: e.cuisineName,
    };
    final sortedCuisines = Map.fromEntries(cuisines.entries.toList()..sort((a, b) => a.value.compareTo(b.value)));

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.historyTitle),
        bottom: _syncing
            ? const PreferredSize(preferredSize: Size.fromHeight(2), child: LinearProgressIndicator(minHeight: 2))
            : null,
      ),
      body: RefreshIndicator(
        onRefresh: _sync,
        child: ListView(
          key: const Key('history-list'),
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpace.page, 12, AppSpace.page, 4),
              child: TextField(
                key: const Key('history-search'),
                controller: _search,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search_rounded),
                  hintText: l10n.historySearchHint,
                  suffixIcon: _filter.query.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close_rounded),
                          onPressed: () {
                            _search.clear();
                            _setFilter(_filter.copyWith(query: ''));
                          },
                        ),
                ),
                onChanged: (value) => _setFilter(_filter.copyWith(query: value)),
              ),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.page, vertical: 6),
              child: Row(
                children: [
                  // First, so it is on screen whenever a filter is on — the row scrolls sideways on a narrow phone.
                  if (_filter.isActive) ...[
                    ActionChip(
                      key: const Key('filter-clear'),
                      avatar: const Icon(Icons.close_rounded, size: 18),
                      label: Text(l10n.clearFilters),
                      onPressed: _clear,
                    ),
                    const SizedBox(width: 8),
                  ],
                  FilterChip(
                    key: const Key('filter-period'),
                    avatar: const Icon(Icons.event_outlined, size: 18),
                    label: Text(_periodLabel(l10n)),
                    selected: _filter.period != HistoryPeriod.all,
                    showCheckmark: false,
                    onSelected: (_) => _pickPeriod(),
                  ),
                  const SizedBox(width: 8),
                  FilterChip(
                    key: const Key('filter-quick'),
                    label: Text(l10n.modeQuickTitle),
                    selected: _filter.mode == 'quick',
                    onSelected: (on) => _setFilter(_filter.copyWith(mode: () => on ? 'quick' : null)),
                  ),
                  const SizedBox(width: 8),
                  FilterChip(
                    key: const Key('filter-full'),
                    label: Text(l10n.modeFullTitle),
                    selected: _filter.mode == 'full',
                    onSelected: (on) => _setFilter(_filter.copyWith(mode: () => on ? 'full' : null)),
                  ),
                  const SizedBox(width: 8),
                  FilterChip(
                    key: const Key('filter-cuisine'),
                    avatar: const Icon(Icons.restaurant_menu_rounded, size: 18),
                    label: Text(cuisines[_filter.cuisineId] ?? l10n.cuisineFilter),
                    selected: _filter.cuisineId != null,
                    showCheckmark: false,
                    onSelected: sortedCuisines.isEmpty ? null : (_) => _pickCuisine(sortedCuisines),
                  ),
                ],
              ),
            ),
            if (_offline) InlineNotice(l10n.historyOffline, icon: Icons.cloud_off_rounded, tone: Tone.amber),
            if (all.isEmpty && !_syncing)
              EmptyState(icon: Icons.history_rounded, message: l10n.historyEmpty)
            else if (shown.isEmpty && all.isNotEmpty)
              EmptyState(
                icon: Icons.filter_alt_off_outlined,
                message: l10n.historyNoMatch,
                action: TextButton(onPressed: _clear, child: Text(l10n.clearFilters)),
              )
            else
              for (final (day, entries) in _byDay(shown)) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(AppSpace.page, 18, AppSpace.page, 6),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          _dayLabel(l10n, day, now),
                          style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                      Text(l10n.historyDayCount(entries.length), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: p.textMuted)),
                    ],
                  ),
                ),
                SurfaceGroup(
                  children: [for (final entry in entries) _HistoryRow(entry: entry, onTap: () => _open(entry))],
                ),
              ],
          ],
        ),
      ),
    );
  }

  static List<(DateTime, List<HistoryEntry>)> _byDay(List<HistoryEntry> entries) {
    final days = <(DateTime, List<HistoryEntry>)>[];
    for (final entry in entries) {
      final day = DateTime(entry.createdAt.year, entry.createdAt.month, entry.createdAt.day);
      if (days.isEmpty || days.last.$1 != day) days.add((day, <HistoryEntry>[]));
      days.last.$2.add(entry);
    }
    return days;
  }

  static String _dayLabel(AppLocalizations l10n, DateTime day, DateTime now) {
    final today = DateTime(now.year, now.month, now.day);
    if (day == today) return l10n.periodToday;
    if (day == today.subtract(const Duration(days: 1))) return l10n.historyYesterday;
    return DateFormat('d MMMM y, EEEE', 'tr').format(day);
  }
}

/// One analysis: its time, what was on the menu, the cuisine and mode, what it produced and how it ended.
class _HistoryRow extends StatelessWidget {
  const _HistoryRow({required this.entry, required this.onTap});

  final HistoryEntry entry;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final row = entry.row;
    final names = entry.productNames;
    final title = names.isNotEmpty
        ? [names.take(3).join(', '), if (row.menuCount > 3) l10n.historyMore(row.menuCount - 3)].join(' ')
        : (row.title.isNotEmpty ? row.title : l10n.photoRunTitle);
    final kind = [
      if (entry.cuisineName.isNotEmpty) entry.cuisineName,
      if (entry.mode == 'quick') l10n.modeQuickTitle,
      if (entry.mode == 'full') l10n.modeFullTitle,
    ].join(' · ');
    final counts = [
      if (row.newCount > 0) l10n.historyNew(row.newCount),
      if (row.menuCardCount > 0) l10n.historyOnMenu(row.menuCardCount),
      if (row.acceptedCount > 0) l10n.historyAccepted(row.acceptedCount),
      if (row.skippedCount > 0) l10n.historySkipped(row.skippedCount),
    ].join(' · ');
    final (icon, color, status) = switch (entry.status) {
      'completed' => (Icons.check_circle_rounded, p.success, null),
      'running' => (Icons.timelapse_rounded, p.amber, l10n.historyStatusRunning),
      'partial' => (Icons.error_outline_rounded, p.amber, l10n.historyStatusPartial),
      'failed' => (Icons.cancel_outlined, p.danger, l10n.historyStatusFailed),
      _ => (Icons.block_rounded, p.textFaint, null),
    };

    return InkWell(
      key: ValueKey('history-${entry.runId}'),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(AppSpace.lg, 12, AppSpace.md, 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 54,
              child: Text(
                DateFormat.Hm('tr').format(entry.createdAt),
                style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700, fontFeatures: tabularFigures),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: text.titleSmall),
                  if (kind.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(kind, style: text.bodyMedium?.copyWith(color: p.textMuted)),
                  ],
                  if (counts.isNotEmpty || status != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      [?status, if (counts.isNotEmpty) counts].join(' · '),
                      style: text.bodySmall?.copyWith(color: p.textMuted),
                    ),
                  ],
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(left: 8, top: 2),
              child: Icon(icon, size: 20, color: color),
            ),
          ],
        ),
      ),
    );
  }
}
