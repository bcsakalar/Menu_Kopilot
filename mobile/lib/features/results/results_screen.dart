import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/widgets/common.dart';
import '../../data/models/suggestion.dart';
import '../../data/models/template_payload.dart';
import 'card_editor_screen.dart';
import 'run_controller.dart';
import 'suggestion_card.dart';

/// Streaming results: cards drop in one by one (DB cards first), with placeholders for names already read.
class ResultsScreen extends ConsumerStatefulWidget {
  const ResultsScreen({super.key, this.request, this.runId, this.branchId});

  final RunRequest? request;
  final String? runId;
  final String? branchId;

  @override
  ConsumerState<ResultsScreen> createState() => _ResultsScreenState();
}

class _ResultsScreenState extends ConsumerState<ResultsScreen> {
  final Set<String> _busy = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final controller = ref.read(runControllerProvider.notifier);
      final request = widget.request;
      final runId = widget.runId;
      if (request != null) {
        controller.start(request);
      } else if (runId != null) {
        controller.load(runId);
      }
    });
  }

  Future<void> _act(String cardId, Future<String?> Function() action) async {
    setState(() => _busy.add(cardId));
    final error = await action();
    if (!mounted) return;
    setState(() => _busy.remove(cardId));
    if (error == 'acceptNeedsContent') {
      showMessage(context, context.l10n.acceptNeedsContent);
    } else if (error != null) {
      showMessage(context, error);
    }
  }

  Future<void> _openEditor(SuggestionCard card) async {
    final edited = await Navigator.of(context).push<TemplatePayload>(
      MaterialPageRoute(builder: (_) => CardEditorScreen(initial: card.payload)),
    );
    if (edited != null) ref.read(runControllerProvider.notifier).updatePayload(card.id, edited);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = ref.watch(runControllerProvider);
    final controller = ref.read(runControllerProvider.notifier);
    final streaming = state.phase == RunPhase.streaming;

    return Scaffold(
      appBar: AppBar(
        title: Text(state.cuisineName.isEmpty ? l10n.resultsTitle : '${l10n.resultsTitle} · ${state.cuisineName}'),
        actions: [
          if (streaming)
            TextButton.icon(onPressed: controller.cancel, icon: const Icon(Icons.stop_circle_outlined), label: Text(l10n.stop)),
        ],
        bottom: streaming ? const PreferredSize(preferredSize: Size.fromHeight(3), child: LinearProgressIndicator(minHeight: 3)) : null,
      ),
      body: Column(
        children: [
          const DisclaimerBanner(),
          if (state.offline) MaterialBanner(content: Text(l10n.offlineBanner), actions: const [SizedBox.shrink()]),
          _StatusBar(state: state, onContinue: controller.continueRun),
          Expanded(
            child: state.phase == RunPhase.queued
                ? EmptyState(icon: Icons.cloud_upload_outlined, message: l10n.queuedOffline)
                : state.phase == RunPhase.error && state.cards.isEmpty
                    ? EmptyState(icon: Icons.error_outline, message: state.error ?? l10n.genericError)
                    : ListView(
                        padding: const EdgeInsets.only(bottom: 80),
                        children: [
                          for (final card in state.cards)
                            SuggestionCardView(
                              key: ValueKey(card.id),
                              card: card,
                              busy: _busy.contains(card.id),
                              onChanged: (p) => controller.updatePayload(card.id, p),
                              onAccept: () => _act(card.id, () => controller.accept(card.id, branchId: widget.branchId)),
                              onSkip: () => _act(card.id, () => controller.skip(card.id)),
                              onEdit: () => _openEditor(card),
                            ),
                          for (final name in state.placeholders) _PlaceholderCard(name: name),
                          for (final warning in state.warnings)
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                              child: Text('⚠ $warning', style: Theme.of(context).textTheme.bodySmall),
                            ),
                        ],
                      ),
          ),
        ],
      ),
    );
  }
}

class _StatusBar extends StatelessWidget {
  const _StatusBar({required this.state, required this.onContinue});

  final RunViewState state;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final stats = state.stats;
    final text = switch (state.phase) {
      RunPhase.streaming => state.message ?? l10n.streaming,
      RunPhase.cancelled => l10n.stopped,
      RunPhase.done when stats != null && stats.cacheHit => '${l10n.cardsReady(state.cards.length)} · ${l10n.fromCache}',
      RunPhase.done when stats != null =>
        l10n.doneSummary(stats.dbHits, stats.aiItems, stats.reviewItems, stats.llmCalls),
      _ => l10n.cardsReady(state.cards.length),
    };
    return Material(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            Expanded(child: Text(text, maxLines: 2, overflow: TextOverflow.ellipsis)),
            if (state.canContinue) ...[
              Text(l10n.budgetExhausted(state.pendingItems), style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(width: 8),
              FilledButton.tonal(onPressed: onContinue, child: Text(l10n.continueButton)),
            ],
          ],
        ),
      ),
    );
  }
}

class _PlaceholderCard extends StatelessWidget {
  const _PlaceholderCard({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2)),
        title: Text(name),
        subtitle: Text(context.l10n.placeholderPreparing),
      ),
    );
  }
}
