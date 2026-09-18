import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/design/components.dart';
import '../../core/design/count_meter.dart';
import '../../core/design/skeleton.dart';
import '../../core/design/tokens.dart';
import '../../core/network/api_client.dart';
import '../../core/providers.dart';
import '../../core/utils/haptics.dart';
import '../../core/utils/wakelock.dart';
import '../../core/widgets/common.dart';
import '../../data/models/branch.dart';
import '../../data/models/gap.dart';
import '../../l10n/gen/app_localizations.dart';
import '../results/run_controller.dart';
import 'gap_controller.dart';

/// One screen for the phone call: the count against the target, the "Çağrıda sor" checklist (ticks persist per
/// branch), items with missing fields and the recommendations. Tapping a product prepares its card for the branch;
/// the count moves as soon as it is accepted. The screen stays on while open.
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
    // A card accepted there is now on the branch menu: move the count while the call goes on.
    if (mounted) await ref.read(gapControllerProvider.notifier).syncBranchMenu();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final state = ref.watch(gapControllerProvider);
    final controller = ref.read(gapControllerProvider.notifier);
    final branch = _branch;
    final checked = branch == null ? const <String>{} : ref.watch(checkedQuestionsProvider(branch.id)).value ?? const <String>{};
    // A product added during the call is felt when the count moves.
    ref.listen(gapControllerProvider.select((s) => s.counts?.current), (previous, next) {
      if (previous != null && next != null && next > previous) Haptics.match();
    });

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(branch == null ? l10n.gapTitle : branch.name, maxLines: 1, overflow: TextOverflow.ellipsis),
            if (branch != null) Text(branch.cuisineName, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
        actions: [
          if (state.phase == GapPhase.streaming)
            TextButton.icon(onPressed: controller.cancel, icon: const Icon(Icons.stop_rounded), label: Text(l10n.stop)),
          if (branch != null)
            PopupMenuButton<String>(
              onSelected: (value) async {
                if (value == 'clear') await ref.read(appDatabaseProvider).clearChecked(checklistId(branch.id));
              },
              itemBuilder: (_) => [PopupMenuItem(value: 'clear', child: Text(l10n.clearTicks))],
            ),
        ],
      ),
      body: switch (state.phase) {
        GapPhase.empty => EmptyState(icon: Icons.fact_check_outlined, message: l10n.noAnalysisYet),
        GapPhase.error when state.counts == null => EmptyState(
            icon: Icons.error_outline_rounded,
            message: state.error ?? l10n.networkError,
            action: branch == null ? null : FilledButton(onPressed: () => controller.load(branch), child: Text(l10n.retry)),
          ),
        (GapPhase.loading || GapPhase.streaming) when state.counts == null => ListView(
            padding: const EdgeInsets.only(top: AppSpace.sm),
            children: [
              ScanSkeleton(message: state.message ?? l10n.analyzing),
              const SkeletonCard(),
            ],
          ),
        _ => RefreshIndicator(
            onRefresh: controller.syncBranchMenu,
            child: ListView(
              padding: const EdgeInsets.only(bottom: 40),
              children: [
                _CountsHeader(state: state),
                if (state.offline) InlineNotice(l10n.offlineBanner, icon: Icons.cloud_off_rounded, tone: Tone.amber),
                for (final warning in state.warnings) InlineNotice(warning, icon: Icons.warning_amber_rounded, tone: Tone.amber),
                if (branch != null) _Checklist(branchId: branch.id, questions: state.questions, checked: checked, onCard: _openCard),
                if (state.incompleteItems.isNotEmpty) ...[
                  Eyebrow(l10n.incompleteItems(state.incompleteItems.length)),
                  SurfaceGroup(
                    children: [
                      for (final item in state.incompleteItems)
                        _ItemTile(key: ValueKey('item-${item.normalized}'), item: item, onCard: () => _openCard(item.templateName ?? item.name)),
                    ],
                  ),
                ],
                if (state.recommendations.isNotEmpty) ...[
                  Eyebrow(l10n.recommendedItems(state.recommendations.length)),
                  SurfaceGroup(
                    children: [
                      for (final rec in state.recommendations)
                        if (state.isOnMenu(rec.name, rec.templateId))
                          ListTile(
                            key: ValueKey('rec-${rec.name}'),
                            leading: Icon(Icons.check_circle_rounded, color: p.success),
                            title: Text(rec.name, style: TextStyle(color: p.textMuted, fontWeight: FontWeight.w700)),
                            subtitle: Text(l10n.addedToMenu),
                          )
                        else
                          ListTile(
                            key: ValueKey('rec-${rec.name}'),
                            title: Text(rec.name, style: Theme.of(context).textTheme.titleMedium),
                            subtitle: Text('${rec.fromAi ? l10n.badgeAi : l10n.badgeDb} · ${rec.reason}'),
                            trailing: IconButton(
                              tooltip: l10n.prepareCard,
                              icon: Icon(Icons.add_circle_outline_rounded, color: p.accentText),
                              onPressed: () => _openCard(rec.name),
                            ),
                            onTap: () => _openCard(rec.name),
                          ),
                    ],
                  ),
                ],
                if (state.typedItems.isNotEmpty)
                  _Collapsible(
                    key: const Key('gap-typed-items'),
                    title: l10n.typedItems(state.typedItems.length),
                    subtitle: l10n.typedItemsHint,
                    children: [
                      for (final item in state.typedItems)
                        _ItemTile(key: ValueKey('typed-${item.normalized}'), item: item, onCard: () => _openCard(item.templateName ?? item.name)),
                    ],
                  ),
                if (state.completeItems.isNotEmpty)
                  _Collapsible(
                    title: l10n.completeItems(state.completeItems.length),
                    children: [
                      for (final item in state.completeItems)
                        _ItemTile(key: ValueKey('ok-${item.normalized}'), item: item, onCard: () => _openCard(item.templateName ?? item.name)),
                    ],
                  ),
              ],
            ),
          ),
      },
    );
  }
}

class _Collapsible extends StatelessWidget {
  const _Collapsible({required this.title, required this.children, super.key, this.subtitle});

  final String title;
  final String? subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return SurfaceGroup(
      margin: const EdgeInsets.fromLTRB(AppSpace.page, AppSpace.md, AppSpace.page, 0),
      children: [
        ExpansionTile(
          title: Text(title, style: Theme.of(context).textTheme.titleSmall),
          subtitle: subtitle == null ? null : Text(subtitle!),
          children: children,
        ),
      ],
    );
  }
}

class _CountsHeader extends StatelessWidget {
  const _CountsHeader({required this.state});

  final GapViewState state;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final text = Theme.of(context).textTheme;
    final counts = state.counts;
    final stats = state.stats;
    final status = switch (state.phase) {
      GapPhase.streaming || GapPhase.loading => state.message ?? l10n.analyzing,
      GapPhase.cancelled => l10n.stopped,
      _ when stats != null && stats.cacheHit => l10n.analysisFromCache,
      _ when stats != null && stats.typed > 0 => l10n.analysisSummaryTyped(stats.screenshots, stats.typed, stats.unique, stats.llmCalls),
      _ when stats != null => l10n.analysisSummary(stats.screenshots, stats.unique, stats.llmCalls),
      _ => '',
    };
    if (counts == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpace.page, 20, AppSpace.page, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CountMeter(
            key: const Key('gap-counts'),
            current: counts.current,
            target: counts.target,
            unit: l10n.productsUnit,
            caption: [
              if (counts.missing == 0) l10n.targetReached else l10n.missingCount(counts.missing),
              if (counts.targetOverridden) l10n.manualTarget,
            ].join(' · '),
          ),
          if (status.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(status, style: text.bodySmall)),
        ],
      ),
    );
  }
}

String _checklistText(List<Question> questions) =>
    questions.map((q) => ['- ${q.text}', for (final hint in q.hints) '  $hint'].join('\n')).join('\n');

class _Checklist extends ConsumerWidget {
  const _Checklist({required this.branchId, required this.questions, required this.checked, required this.onCard});

  final String branchId;
  final List<Question> questions;
  final Set<String> checked;
  final ValueChanged<String> onCard;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final done = questions.where((q) => checked.contains(q.key)).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Eyebrow(l10n.callChecklist(done, questions.length), trailing: CopyButton(text: _checklistText(questions))),
        if (questions.isEmpty)
          Padding(padding: const EdgeInsets.symmetric(horizontal: AppSpace.page), child: Text(l10n.gapEmptyChecklist))
        else
          SurfaceGroup(
            children: [
              for (final q in questions)
                _QuestionTile(
                  key: ValueKey('q-${q.key}'),
                  question: q,
                  checked: checked.contains(q.key),
                  onChanged: (value) {
                    Haptics.select();
                    ref.read(appDatabaseProvider).setChecked(checklistId(branchId), q.key, value);
                  },
                  onCard: onCard,
                ),
            ],
          ),
      ],
    );
  }
}

/// A checklist line sized for use during a call: a large tap target, the question in bold, hints below.
class _QuestionTile extends StatelessWidget {
  const _QuestionTile({required this.question, required this.checked, required this.onChanged, required this.onCard, super.key});

  final Question question;
  final bool checked;
  final ValueChanged<bool> onChanged;
  final ValueChanged<String> onCard;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final itemName = question.itemName;
    return Semantics(
      checked: checked,
      child: InkWell(
        onTap: () => onChanged(!checked),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(AppSpace.page, 14, 6, 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 160),
                width: 24,
                height: 24,
                margin: const EdgeInsets.only(top: 1),
                decoration: BoxDecoration(
                  color: checked ? p.accent : Colors.transparent,
                  borderRadius: BorderRadius.circular(7),
                  border: Border.all(color: checked ? p.accent : p.borderStrong, width: 1.5),
                ),
                child: checked ? Icon(Icons.check_rounded, size: 17, color: p.onAccent) : null,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      question.text,
                      style: text.titleMedium?.copyWith(
                        fontSize: 17,
                        color: checked ? p.textFaint : p.text,
                        decoration: checked ? TextDecoration.lineThrough : null,
                        decorationColor: p.textFaint,
                      ),
                    ),
                    if (question.hints.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(question.hints.join('\n'), style: text.bodySmall?.copyWith(fontSize: 13.5, color: checked ? p.textFaint : p.textMuted)),
                      ),
                  ],
                ),
              ),
              // "X var mı?" → the restaurant has it: prepare its card right away. Other questions only show their kind.
              if (question.kind == QuestionKind.missingItem && itemName != null)
                IconButton(
                  key: ValueKey('q-card-${question.key}'),
                  tooltip: context.l10n.prepareCard,
                  icon: Icon(Icons.add_circle_outline_rounded, color: p.accentText),
                  onPressed: () => onCard(itemName),
                )
              else
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 2, 12, 0),
                  child: Icon(
                    question.kind == QuestionKind.missingField ? Icons.edit_note_rounded : Icons.restaurant_menu_rounded,
                    size: 20,
                    color: p.textFaint,
                  ),
                ),
            ],
          ),
        ),
      ),
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
    final p = context.palette;
    return ListTile(
      title: Text(item.name, style: Theme.of(context).textTheme.titleMedium),
      subtitle: item.missing.isEmpty
          ? null
          : Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final missing in item.missing)
                    Pill(_missingLabel(l10n, missing), tone: missing.state == FieldState.unknown ? Tone.amber : Tone.danger),
                ],
              ),
            ),
      trailing: IconButton(
        tooltip: l10n.prepareCard,
        icon: Icon(Icons.add_circle_outline_rounded, color: p.accentText),
        onPressed: onCard,
      ),
    );
  }
}
