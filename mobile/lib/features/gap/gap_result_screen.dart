import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/network/api_client.dart';
import '../../core/providers.dart';
import '../../core/utils/wakelock.dart';
import '../../core/widgets/common.dart';
import '../../data/models/branch.dart';
import '../../data/models/gap.dart';
import '../../l10n/gen/app_localizations.dart';
import '../results/run_controller.dart';
import 'gap_controller.dart';

/// One screen for the phone call: big x / target, the "Çağrıda sor" checklist (ticks persist per branch),
/// items with missing fields and recommendations. Tapping an item opens a Mod 1 card for it (linked to the branch).
/// The screen stays on while open.
class GapResultScreen extends ConsumerStatefulWidget {
  const GapResultScreen({super.key, this.request, this.branch, this.runId});

  /// Starts a new analysis.
  final GapRequest? request;

  /// Shows the latest (or [runId]) analysis of this branch.
  final Branch? branch;
  final String? runId;

  @override
  ConsumerState<GapResultScreen> createState() => _GapResultScreenState();
}

class _GapResultScreenState extends ConsumerState<GapResultScreen> {
  late final ScreenWakelock _wakelock = ref.read(wakelockProvider);

  @override
  void initState() {
    super.initState();
    _wakelock.enable().ignore();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final controller = ref.read(gapControllerProvider.notifier);
      final request = widget.request;
      final branch = widget.branch;
      if (request != null) {
        controller.start(request);
      } else if (branch != null) {
        controller.load(branch, runId: widget.runId);
      }
    });
  }

  @override
  void dispose() {
    _wakelock.disable().ignore();
    super.dispose();
  }

  Branch? get _branch => widget.request?.branch ?? widget.branch;

  Future<void> _openCard(String name) async {
    final branch = _branch;
    if (branch == null) return;
    final request = RunRequest(
      cuisineName: branch.cuisineName,
      data: SuggestRequestData(cuisineId: branch.cuisineId, promptText: name, branchId: branch.id),
    );
    await context.push('/gap/card?branchId=${branch.id}', extra: request);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = ref.watch(gapControllerProvider);
    final controller = ref.read(gapControllerProvider.notifier);
    final branch = _branch;
    final busy = state.phase == GapPhase.streaming || state.phase == GapPhase.loading;
    final checked = branch == null ? const <String>{} : ref.watch(checkedQuestionsProvider(branch.id)).value ?? const <String>{};

    return Scaffold(
      appBar: AppBar(
        title: Text(branch == null ? l10n.gapTitle : branch.name),
        actions: [
          if (state.phase == GapPhase.streaming)
            TextButton.icon(onPressed: controller.cancel, icon: const Icon(Icons.stop_circle_outlined), label: Text(l10n.stop)),
          if (branch != null)
            PopupMenuButton<String>(
              onSelected: (value) async {
                if (value == 'clear') await ref.read(appDatabaseProvider).clearChecked(checklistId(branch.id));
              },
              itemBuilder: (_) => [PopupMenuItem(value: 'clear', child: Text(l10n.clearTicks))],
            ),
        ],
        bottom: busy ? const PreferredSize(preferredSize: Size.fromHeight(3), child: LinearProgressIndicator(minHeight: 3)) : null,
      ),
      body: switch (state.phase) {
        GapPhase.empty => EmptyState(icon: Icons.fact_check_outlined, message: l10n.noAnalysisYet),
        GapPhase.error when state.counts == null => EmptyState(
            icon: Icons.error_outline,
            message: state.error ?? l10n.networkError,
            action: branch == null
                ? null
                : FilledButton(onPressed: () => controller.load(branch), child: Text(l10n.retry)),
          ),
        _ => ListView(
            padding: const EdgeInsets.only(bottom: 32),
            children: [
              if (state.offline) MaterialBanner(content: Text(l10n.offlineBanner), actions: const [SizedBox.shrink()]),
              _CountsHeader(state: state),
              for (final warning in state.warnings)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
                  child: Text('⚠ $warning', style: Theme.of(context).textTheme.bodySmall),
                ),
              if (branch != null) _Checklist(branchId: branch.id, questions: state.questions, checked: checked),
              if (state.incompleteItems.isNotEmpty) ...[
                _Section(l10n.incompleteItems(state.incompleteItems.length)),
                for (final item in state.incompleteItems)
                  _ItemTile(key: ValueKey('item-${item.normalized}'), item: item, onCard: () => _openCard(item.templateName ?? item.name)),
              ],
              if (state.recommendations.isNotEmpty) ...[
                _Section(l10n.recommendedItems(state.recommendations.length)),
                for (final rec in state.recommendations)
                  ListTile(
                    key: ValueKey('rec-${rec.name}'),
                    leading: Icon(rec.fromAi ? Icons.auto_awesome_outlined : Icons.inventory_2_outlined),
                    title: Text(rec.name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
                    subtitle: Text('${rec.fromAi ? l10n.badgeAi : l10n.badgeDb} · ${rec.reason}'),
                    trailing: IconButton(
                      tooltip: l10n.prepareCard,
                      icon: const Icon(Icons.post_add_outlined),
                      onPressed: () => _openCard(rec.name),
                    ),
                    onTap: () => _openCard(rec.name),
                  ),
              ],
              if (state.completeItems.isNotEmpty)
                ExpansionTile(
                  title: Text(l10n.completeItems(state.completeItems.length)),
                  children: [
                    for (final item in state.completeItems)
                      _ItemTile(key: ValueKey('ok-${item.normalized}'), item: item, onCard: () => _openCard(item.templateName ?? item.name)),
                  ],
                ),
            ],
          ),
      },
    );
  }
}

class _Section extends StatelessWidget {
  const _Section(this.text, {this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) =>
      Padding(padding: const EdgeInsets.fromLTRB(16, 16, 8, 0), child: SectionLabel(text, trailing: trailing));
}

class _CountsHeader extends StatelessWidget {
  const _CountsHeader({required this.state});

  final GapViewState state;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final counts = state.counts;
    final stats = state.stats;
    final status = switch (state.phase) {
      GapPhase.streaming || GapPhase.loading => state.message ?? l10n.analyzing,
      GapPhase.cancelled => l10n.stopped,
      _ when stats != null && stats.cacheHit => l10n.analysisFromCache,
      _ when stats != null => l10n.analysisSummary(stats.screenshots, stats.unique, stats.llmCalls),
      _ => '',
    };
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (counts == null)
            Text(l10n.analyzing, style: theme.textTheme.headlineSmall)
          else ...[
            Text(
              l10n.countsLabel(counts.current, counts.target),
              key: const Key('gap-counts'),
              style: theme.textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: counts.progress,
                minHeight: 12,
                color: counts.missing == 0 ? const Color(0xFF15803D) : theme.colorScheme.primary,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              [
                counts.missing == 0 ? l10n.targetReached : l10n.missingCount(counts.missing),
                if (counts.targetOverridden) l10n.manualTarget,
              ].join(' · '),
              style: theme.textTheme.titleMedium,
            ),
          ],
          if (status.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(status, style: theme.textTheme.bodySmall)),
        ],
      ),
    );
  }
}

String _checklistText(List<Question> questions) =>
    questions.map((q) => ['- ${q.text}', for (final hint in q.hints) '  $hint'].join('\n')).join('\n');

class _Checklist extends ConsumerWidget {
  const _Checklist({required this.branchId, required this.questions, required this.checked});

  final String branchId;
  final List<Question> questions;
  final Set<String> checked;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final done = questions.where((q) => checked.contains(q.key)).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Section(
          l10n.callChecklist(done, questions.length),
          trailing: CopyButton(text: _checklistText(questions)),
        ),
        if (questions.isEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Text(l10n.gapEmptyChecklist)),
        for (final q in questions)
          _QuestionTile(
            key: ValueKey('q-${q.key}'),
            question: q,
            checked: checked.contains(q.key),
            onChanged: (value) => ref.read(appDatabaseProvider).setChecked(checklistId(branchId), q.key, value),
          ),
      ],
    );
  }
}

class _QuestionTile extends StatelessWidget {
  const _QuestionTile({required this.question, required this.checked, required this.onChanged, super.key});

  final Question question;
  final bool checked;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = checked ? theme.colorScheme.outline : null;
    return CheckboxListTile(
      value: checked,
      onChanged: (v) => onChanged(v ?? false),
      controlAffinity: ListTileControlAffinity.leading,
      secondary: Icon(switch (question.kind) {
        QuestionKind.missingItem => Icons.add_circle_outline,
        QuestionKind.missingField => Icons.edit_note,
        QuestionKind.cuisine => Icons.restaurant_menu,
      }),
      title: Text(
        question.text,
        style: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: muted,
          decoration: checked ? TextDecoration.lineThrough : null,
        ),
      ),
      subtitle: question.hints.isEmpty ? null : Text(question.hints.join('\n'), style: TextStyle(fontSize: 14, color: muted)),
    );
  }
}

String _missingLabel(AppLocalizations l10n, MissingField missing) => switch ((missing.field, missing.state == FieldState.unknown)) {
      (GapField.description, false) => l10n.missingDescription,
      (GapField.description, true) => l10n.unknownDescription,
      (GapField.options, false) => l10n.missingOptions,
      (GapField.options, true) => l10n.unknownOptions,
      (GapField.removables, false) => l10n.missingRemovables,
      (GapField.removables, true) => l10n.unknownRemovables,
    };

class _ItemTile extends StatelessWidget {
  const _ItemTile({required this.item, required this.onCard, super.key});

  final GapItem item;
  final VoidCallback onCard;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final scheme = Theme.of(context).colorScheme;
    return ListTile(
      title: Text(item.name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
      subtitle: item.missing.isEmpty
          ? null
          : Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Wrap(
                spacing: 6,
                runSpacing: 4,
                children: [
                  for (final missing in item.missing)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: missing.state == FieldState.unknown ? scheme.tertiaryContainer : scheme.errorContainer,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        _missingLabel(l10n, missing),
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: missing.state == FieldState.unknown ? scheme.onTertiaryContainer : scheme.onErrorContainer,
                        ),
                      ),
                    ),
                ],
              ),
            ),
      trailing: IconButton(tooltip: l10n.prepareCard, icon: const Icon(Icons.post_add_outlined), onPressed: onCard),
    );
  }
}
