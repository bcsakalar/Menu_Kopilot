import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/design/skeleton.dart';
import '../../core/providers.dart';
import '../../core/widgets/common.dart';
import '../../data/models/settings.dart';

final usageRangeProvider = NotifierProvider<UsageRangeController, String>(UsageRangeController.new);

class UsageRangeController extends Notifier<String> {
  @override
  String build() => 'today';

  void set(String range) => state = range;
}

final usageSummaryProvider = FutureProvider.autoDispose<UsageSummary>(
  (ref) => ref.watch(apiClientProvider).usageSummary(ref.watch(usageRangeProvider)),
);

String _percent(double ratio) => '%${(ratio * 100).round()}';

/// AI usage: calls per model / task, tokens, errors, how often answers came from the DB/cache, quota.
class UsageScreen extends ConsumerWidget {
  const UsageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final range = ref.watch(usageRangeProvider);
    final summary = ref.watch(usageSummaryProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.usageTitle)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: SegmentedButton<String>(
              segments: [
                ButtonSegment(value: 'today', label: Text(l10n.rangeToday)),
                ButtonSegment(value: 'month', label: Text(l10n.rangeMonth)),
              ],
              selected: {range},
              onSelectionChanged: (value) => ref.read(usageRangeProvider.notifier).set(value.first),
            ),
          ),
          Expanded(
            child: summary.when(
              loading: () => const SkeletonList(rows: 3),
              error: (_, _) => EmptyState(
                icon: Icons.cloud_off,
                message: l10n.networkError,
                action: FilledButton(onPressed: () => ref.invalidate(usageSummaryProvider), child: Text(l10n.retry)),
              ),
              data: (s) => RefreshIndicator(
                onRefresh: () => ref.refresh(usageSummaryProvider.future),
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 32),
                  children: [
                    _Stats(
                      items: [
                        (l10n.aiCalls, '${s.totals.calls}'),
                        (l10n.failedCalls, '${s.totals.failed}'),
                        (l10n.tokens, '${s.totals.tokensIn + s.totals.tokensOut}'),
                        (l10n.avgLatency, '${s.totals.avgLatencyMs} ms'),
                      ],
                    ),
                    _Stats(
                      items: [
                        (l10n.runsLabel, '${s.runs}'),
                        (l10n.cacheHitRatio, _percent(s.cacheHitRatio)),
                        (l10n.cardsLabel, '${s.cards}'),
                        (l10n.dbHitRatio, _percent(s.dbHitRatio)),
                      ],
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                      child: Text(
                        l10n.cardsBreakdown(s.dbCards, s.aiCards, s.reviewCards),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                    Padding(padding: const EdgeInsets.fromLTRB(16, 16, 16, 0), child: SectionLabel(l10n.byModel)),
                    if (s.byModel.isEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Text(l10n.noUsage)),
                    for (final model in s.byModel)
                      ListTile(
                        dense: true,
                        title: Text(model.label),
                        subtitle: Text(
                          l10n.modelUsageLine(model.counters.calls, model.counters.failed, model.counters.tokensIn + model.counters.tokensOut),
                        ),
                        trailing: Text(model.provider),
                      ),
                    Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 0), child: SectionLabel(l10n.byTask)),
                    for (final task in s.byTask)
                      ListTile(dense: true, title: Text(task.label), trailing: Text('${task.calls}${task.failed > 0 ? ' (${task.failed}!)' : ''}')),
                    if (s.errors.isNotEmpty) ...[
                      Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 0), child: SectionLabel(l10n.errorsLabel)),
                      for (final error in s.errors) ListTile(dense: true, title: Text(error.code), trailing: Text('${error.count}')),
                    ],
                    Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 0), child: SectionLabel(l10n.quotaToday)),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(l10n.quotaLine(s.quota.callsToday, s.quota.dailyCalls, s.quota.tokensToday, s.quota.dailyTokens)),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Stats extends StatelessWidget {
  const _Stats({required this.items});

  final List<(String, String)> items;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Row(
        children: [
          for (final (label, value) in items)
            Expanded(
              child: Card(
                margin: const EdgeInsets.all(4),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                  child: Column(
                    children: [
                      Text(value, style: theme.textTheme.titleLarge),
                      const SizedBox(height: 2),
                      Text(label, style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
