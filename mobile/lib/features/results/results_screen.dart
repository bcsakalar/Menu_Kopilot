import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/design/components.dart';
import '../../core/design/skeleton.dart';
import '../../core/design/tokens.dart';
import '../../core/utils/haptics.dart';
import '../../core/widgets/common.dart';
import '../../data/models/suggestion.dart';
import '../../data/models/template_payload.dart';
import 'card_editor_screen.dart';
import 'run_controller.dart';
import 'suggestion_card.dart';

/// Streaming results: while the menu is read a scan skeleton shows the stage; names already read appear as skeleton
/// cards and turn into real cards one by one (DB cards first).
class ResultsScreen extends ConsumerStatefulWidget {
  const ResultsScreen({super.key, this.request, this.runId, this.branchId, this.slot = runSlotSuggest});

  final RunRequest? request;
  final String? runId;
  final String? branchId;

  /// Which tab's controller drives this screen (see [runSlotSuggest] / [runSlotGap]).
  final String slot;

  @override
  ConsumerState<ResultsScreen> createState() => _ResultsScreenState();
}

class _ResultsScreenState extends ConsumerState<ResultsScreen> {
  final Set<String> _busy = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final controller = ref.read(runControllerProvider(widget.slot).notifier);
      final request = widget.request;
      final runId = widget.runId;
      if (request != null) {
        controller.start(request);
      } else if (runId != null) {
        controller.load(runId);
      }
    });
  }

  Future<void> _act(String cardId, Future<Exception?> Function() action, {required bool accept}) async {
    setState(() => _busy.add(cardId));
    final error = await action();
    if (!mounted) return;
    setState(() => _busy.remove(cardId));
    if (error == null) {
      await (accept ? Haptics.confirm() : Haptics.select());
      return;
    }
    await Haptics.warn();
    if (!mounted) return;
    showMessage(context, error is CardNeedsContent ? context.l10n.acceptNeedsContent : apiErrorText(context.l10n, error));
  }

  Future<void> _openEditor(SuggestionCard card) async {
    final edited = await Navigator.of(context).push<TemplatePayload>(
      MaterialPageRoute(builder: (_) => CardEditorScreen(initial: card.payload)),
    );
    if (edited != null) ref.read(runControllerProvider(widget.slot).notifier).updatePayload(card.id, edited);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = ref.watch(runControllerProvider(widget.slot));
    final controller = ref.read(runControllerProvider(widget.slot).notifier);
    final streaming = state.phase == RunPhase.streaming;
    // The first matched products of a run are felt, not only seen.
    ref.listen(runControllerProvider(widget.slot).select((s) => s.cards.isNotEmpty), (previous, hasCards) {
      if (previous == false && hasCards) Haptics.match();
    });
    final reading = streaming && state.cards.isEmpty && state.placeholders.isEmpty;

    return Scaffold(
      appBar: AppBar(
        title: _TitleBlock(title: l10n.resultsTitle, subtitle: state.cuisineName.isEmpty ? null : state.cuisineName),
        actions: [
          if (streaming)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: TextButton.icon(onPressed: controller.cancel, icon: const Icon(Icons.stop_rounded), label: Text(l10n.stop)),
            ),
        ],
      ),
      body: state.phase == RunPhase.queued
          ? EmptyState(icon: Icons.cloud_upload_outlined, message: l10n.queuedOffline)
          : state.phase == RunPhase.error && state.cards.isEmpty
              ? EmptyState(icon: Icons.error_outline_rounded, message: state.error ?? l10n.genericError)
              : ListView(
                  padding: const EdgeInsets.only(bottom: 32),
                  children: [
                    _RunSummary(state: state, onContinue: controller.continueRun),
                    const DisclaimerBanner(),
                    if (state.offline) InlineNotice(l10n.offlineBanner, icon: Icons.cloud_off_rounded, tone: Tone.amber),
                    for (final warning in state.warnings) InlineNotice(warning, icon: Icons.warning_amber_rounded, tone: Tone.amber),
                    if (reading) ScanSkeleton(message: state.message ?? l10n.streaming),
                    for (final card in state.cards)
                      SuggestionCardView(
                        key: ValueKey(card.id),
                        card: card,
                        busy: _busy.contains(card.id),
                        onChanged: (p) => controller.updatePayload(card.id, p),
                        onAccept: () => _act(card.id, () => controller.accept(card.id, branchId: widget.branchId), accept: true),
                        onSkip: () => _act(card.id, () => controller.skip(card.id), accept: false),
                        onEdit: () => _openEditor(card),
                      ),
                    for (final name in state.placeholders) SkeletonCard(title: name, subtitle: l10n.placeholderPreparing),
                    if (streaming && !reading && state.placeholders.isEmpty) const SkeletonCard(),
                  ],
                ),
    );
  }
}

/// App bar title with an optional second line (cuisine, branch).
class _TitleBlock extends StatelessWidget {
  const _TitleBlock({required this.title, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(title, style: text.titleLarge),
        if (subtitle != null) Text(subtitle!, style: text.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
      ],
    );
  }
}

/// What the run produced so far: card count, where the cards came from, AI calls; "Devam et" when work is pending.
class _RunSummary extends StatelessWidget {
  const _RunSummary({required this.state, required this.onContinue});

  final RunViewState state;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final stats = state.stats;
    final status = switch (state.phase) {
      RunPhase.streaming => state.message ?? l10n.streaming,
      RunPhase.cancelled => l10n.stopped,
      RunPhase.done when stats != null && stats.cacheHit => l10n.fromCache,
      RunPhase.done when stats != null => l10n.aiCallsCount(stats.llmCalls),
      _ => '',
    };
    final waiting = [
      if (state.pendingItems > 0) l10n.pendingItemsCount(state.pendingItems),
      if (state.pendingImageHashes.isNotEmpty) l10n.pendingPhotosCount(state.pendingImageHashes.length),
    ].join(' · ');
    final reason = state.pendingMessage;
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpace.page, 14, AppSpace.page, 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text('${state.cards.length}', style: text.displaySmall),
              const SizedBox(width: 6),
              Text(l10n.cardsUnit, style: text.titleSmall?.copyWith(color: p.textMuted)),
              const Spacer(),
              if (stats != null && state.phase == RunPhase.done)
                Wrap(
                  spacing: 6,
                  children: [
                    if (stats.dbHits > 0) Pill('${stats.dbHits} ${l10n.badgeDb}', tone: Tone.success),
                    if (stats.aiItems > 0) Pill('${stats.aiItems} ${l10n.badgeAi}', tone: Tone.amber),
                    if (stats.reviewItems > 0) Pill('${stats.reviewItems} ${l10n.badgeReview}', tone: Tone.danger),
                  ],
                ),
            ],
          ),
          if (status.isNotEmpty) Text(status, style: text.bodySmall, maxLines: 2, overflow: TextOverflow.ellipsis),
          if (state.canContinue)
            InlineNotice(
              reason == null ? l10n.budgetExhausted(state.pendingItems) : '$reason · $waiting',
              tone: Tone.amber,
              icon: Icons.hourglass_bottom_rounded,
              margin: const EdgeInsets.only(top: 10),
              action: FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                onPressed: onContinue,
                child: Text(l10n.continueButton),
              ),
            ),
        ],
      ),
    );
  }
}
