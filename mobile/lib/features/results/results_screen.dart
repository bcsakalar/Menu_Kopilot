import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/design/components.dart';
import '../../core/design/count_meter.dart';
import '../../core/design/skeleton.dart';
import '../../core/design/tokens.dart';
import '../../core/utils/haptics.dart';
import '../../core/utils/wakelock.dart';
import '../../core/widgets/common.dart';
import '../../data/models/analysis.dart';
import '../../data/models/template_payload.dart';
import '../home/cuisine_picker.dart';
import 'analysis_controller.dart';
import 'card_editor_screen.dart';
import 'product_card.dart';

/// The one result screen, built for someone on a phone call who is not a technical person.
///
/// Pinned on top: how many products the menu has against the cuisine's target. Below it two big tabs — "Yeni
/// ürünler" and "Menüdeki ürünler" — and under each tab one card per product with the same four sections. Nothing
/// on the screen needs a second screen. The screen stays awake while it is open, because it is read during a call.
class ResultsScreen extends ConsumerStatefulWidget {
  const ResultsScreen({super.key, this.request, this.runId});

  /// Starts a new analysis.
  final AnalyzeRequest? request;

  /// Opens an existing one; null with no request restores the latest.
  final String? runId;

  @override
  ConsumerState<ResultsScreen> createState() => _ResultsScreenState();
}

class _ResultsScreenState extends ConsumerState<ResultsScreen> {
  late final ScreenWakelock _wakelock = ref.read(wakelockProvider);
  final Set<String> _busy = {};

  /// Which product cards the user opened or closed. Unset: closed, unless the tab holds a single product.
  final Map<String, bool> _open = {};

  bool _isOpen(String key, {required bool byDefault}) => _open[key] ?? byDefault;

  @override
  void initState() {
    super.initState();
    _wakelock.enable().ignore();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final controller = ref.read(analysisControllerProvider.notifier);
      final request = widget.request;
      final runId = widget.runId;
      if (request != null) {
        controller.start(request);
      } else if (runId != null) {
        controller.load(runId);
      } else if (ref.read(analysisControllerProvider).cards.isEmpty) {
        controller.loadLatest();
      }
    });
  }

  @override
  void dispose() {
    _wakelock.disable().ignore();
    super.dispose();
  }

  /// [collapse]: the card to close once the action succeeds — a decided product needs no room on the screen.
  Future<void> _act(String cardId, Future<Exception?> Function() action, {required bool accept, String? collapse}) async {
    setState(() => _busy.add(cardId));
    final error = await action();
    if (!mounted) return;
    setState(() {
      _busy.remove(cardId);
      if (error == null && collapse != null) _open[collapse] = false;
    });
    if (error == null) {
      await (accept ? Haptics.confirm() : Haptics.select());
      return;
    }
    await Haptics.warn();
    if (!mounted) return;
    showMessage(context, error is CardNeedsContent ? context.l10n.acceptNeedsContent : apiErrorText(context.l10n, error));
  }

  Future<void> _openEditor(AnalysisCard card) async {
    final payload = card.payload;
    if (payload == null) return;
    final edited = await Navigator.of(context).push<TemplatePayload>(
      MaterialPageRoute(builder: (_) => CardEditorScreen(initial: payload)),
    );
    if (edited != null) ref.read(analysisControllerProvider.notifier).updatePayload(card.id, edited);
  }

  /// The user overrides the cuisine: same menu, another cuisine. The server reuses the product list it read.
  Future<void> _changeCuisine() async {
    final cuisine = await pickCuisine(context);
    if (cuisine == null || !mounted) return;
    await _rerun(cuisine.id, cuisine.name);
  }

  Future<void> _rerun(String cuisineId, String cuisineName) async {
    if (ref.read(analysisControllerProvider).counts?.cuisineId == cuisineId) return;
    // Felt, never waited for: a haptic that is slow or unsupported must not hold up the re-run.
    unawaited(Haptics.select());
    await ref.read(analysisControllerProvider.notifier).rerun(cuisineId: cuisineId, cuisineName: cuisineName);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = ref.watch(analysisControllerProvider);
    final controller = ref.read(analysisControllerProvider.notifier);
    // The first cards of a run are felt, not only seen.
    ref.listen(analysisControllerProvider.select((s) => s.cards.isNotEmpty), (previous, hasCards) {
      if (previous == false && hasCards) Haptics.match();
    });
    // A product added during the call is felt when the counter moves.
    ref.listen(analysisControllerProvider.select((s) => s.counts?.current), (previous, next) {
      if (previous != null && next != null && next > previous) Haptics.match();
    });

    final reading = state.isStreaming && state.counts == null;
    // A re-run needs the server (it reuses the stored product list) and a finished run to start from.
    final canRerun = state.runId != null && !state.isStreaming && !state.offline;

    return Scaffold(
      appBar: AppBar(
        title: _TitleBlock(title: l10n.resultsTitle, subtitle: state.cuisineName.isEmpty ? null : state.cuisineName),
        actions: [
          if (state.isStreaming)
            TextButton.icon(onPressed: controller.cancel, icon: const Icon(Icons.stop_rounded), label: Text(l10n.stop)),
        ],
      ),
      body: switch (state.phase) {
        RunPhase.idle => EmptyState(icon: Icons.playlist_add_rounded, message: l10n.noAnalysisYet),
        RunPhase.queued => EmptyState(icon: Icons.cloud_upload_outlined, message: l10n.queuedOffline),
        RunPhase.error when state.cards.isEmpty => EmptyState(
            icon: Icons.error_outline_rounded,
            message: state.error == null ? l10n.errorRetry : '${state.error}\n${l10n.errorRetry}',
            action: FilledButton.icon(
              key: const Key('retry-run'),
              onPressed: controller.retry,
              icon: const Icon(Icons.refresh_rounded),
              label: Text(l10n.retry),
            ),
          ),
        _ => Column(
            children: [
              // Pinned: the number that matters never scrolls away during the call.
              if (state.counts != null) _ProgressStrip(state: state, onChangeCuisine: canRerun ? _changeCuisine : null),
              if (!reading) _Tabs(state: state, onChanged: controller.setTab),
              Expanded(
                child: ListView(
                  key: const Key('result-list'),
                  padding: const EdgeInsets.only(bottom: 40),
                  children: [
                    if (state.offline) InlineNotice(l10n.offlineBanner, icon: Icons.cloud_off_rounded, tone: Tone.amber),
                    if (state.classification?.disagrees ?? false)
                      _CuisineMismatch(classification: state.classification!, onRerun: canRerun ? _rerun : null),
                    for (final warning in state.warnings) InlineNotice(warning, icon: Icons.info_outline_rounded, tone: Tone.amber),
                    if (reading) ScanSkeleton(message: state.message ?? l10n.analyzing),
                    if (!reading) ..._tabContent(state, controller),
                    if (state.isStreaming && !reading) const SkeletonCard(),
                  ],
                ),
              ),
            ],
          ),
      },
    );
  }

  List<Widget> _tabContent(AnalysisViewState state, AnalysisController controller) {
    final l10n = context.l10n;
    final text = Theme.of(context).textTheme;
    final hint = Padding(
      padding: const EdgeInsets.fromLTRB(AppSpace.page, 10, AppSpace.page, 2),
      child: Text(l10n.tapToRemove, style: text.bodyMedium?.copyWith(color: context.palette.textMuted)),
    );
    Widget empty(String message) => Padding(
          padding: const EdgeInsets.fromLTRB(AppSpace.page, 24, AppSpace.page, 8),
          child: Text(message, textAlign: TextAlign.center, style: text.bodyLarge?.copyWith(color: context.palette.textMuted)),
        );

    switch (state.activeTab) {
      case ResultTab.newProducts:
        final cards = state.newProducts;
        if (cards.isEmpty) return [if (!state.isStreaming) empty(l10n.tabNewProductsEmpty)];
        return [
          hint,
          for (final card in cards)
            ProductCard(
              key: ValueKey(card.id),
              card: card,
              title: card.name,
              removed: state.removedOf(card.id),
              busy: _busy.contains(card.id),
              expanded: _isOpen(card.id, byDefault: cards.length == 1),
              onExpandedChanged: (open) => setState(() => _open[card.id] = open),
              onToggle: (key) => controller.toggleItem(card.id, key),
              onAccept: () => _act(card.id, () => controller.accept(card.id), accept: true, collapse: card.id),
              onSkip: () => _act(card.id, () => controller.skip(card.id), accept: false, collapse: card.id),
              onEdit: card.payload == null ? null : () => _openEditor(card),
            ),
        ];
      case ResultTab.menuProducts:
        final entries = state.menuEntries;
        if (entries.isEmpty) return [if (!state.isStreaming) empty(l10n.tabMenuProductsEmpty)];
        // "Ürün ekle" with one product: its card opens by itself. A note-only row has nothing to fold.
        final single = entries.where((e) => e.card != null).length == 1;
        return [
          hint,
          for (final entry in entries)
            ProductCard(
              key: ValueKey('entry-${entry.key}'),
              card: entry.card,
              title: entry.title,
              notes: entry.notes,
              removed: entry.card == null ? const {} : state.removedOf(entry.card!.id),
              busy: entry.card != null && _busy.contains(entry.card!.id),
              expanded: _isOpen('entry-${entry.key}', byDefault: single),
              onExpandedChanged: (open) => setState(() => _open['entry-${entry.key}'] = open),
              onToggle: (key) {
                if (entry.card != null) controller.toggleItem(entry.card!.id, key);
              },
              onAccept: () {
                final card = entry.card;
                if (card != null) _act(card.id, () => controller.accept(card.id), accept: true, collapse: 'entry-${entry.key}');
              },
              onSkip: () {
                final card = entry.card;
                if (card != null) _act(card.id, () => controller.skip(card.id), accept: false, collapse: 'entry-${entry.key}');
              },
              onNoteDone: (note) => _act(note.id, () => controller.accept(note.id), accept: true),
            ),
        ];
    }
  }
}

/// App bar title with an optional second line (the cuisine).
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

/// Pinned progress: "Menüde X ürün · hedef Y", a bar, how many are still needed, the sections still short, and the
/// cuisine (tap to change it). Updates live as products are accepted.
class _ProgressStrip extends StatelessWidget {
  const _ProgressStrip({required this.state, required this.onChangeCuisine});

  final AnalysisViewState state;

  /// Null while the run is going or offline: a re-run needs a finished run and the server.
  final VoidCallback? onChangeCuisine;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final counts = state.counts!;
    final open = counts.openCategories;
    final need = [
      if (!counts.meetsHardMinimum) l10n.belowHardMinimum(counts.hardMinimum),
      if (counts.missing > 0) l10n.stillNeeded(counts.missing) else l10n.targetReached,
    ].join(' · ');
    final status = switch (state.phase) {
      RunPhase.streaming => state.message ?? l10n.analyzing,
      RunPhase.cancelled => l10n.stopped,
      _ => '',
    };

    return Material(
      color: p.canvas,
      child: Container(
        key: const Key('analysis-counts'),
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(AppSpace.page, 10, AppSpace.sm, 10),
        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: p.border))),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    l10n.progressLine(counts.current, counts.target),
                    style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700, fontFeatures: tabularFigures),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                _CuisineButton(name: counts.cuisineName, onTap: onChangeCuisine),
              ],
            ),
            Padding(
              padding: const EdgeInsets.only(top: 6, right: AppSpace.sm),
              child: SegmentedMeter(
                current: counts.current,
                target: counts.target,
                color: counts.meetsTarget ? p.success : p.amber,
                height: 6,
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 6, right: AppSpace.sm),
              child: Text(
                [need, if (status.isNotEmpty) status].join(' · '),
                style: text.bodyMedium?.copyWith(color: counts.meetsHardMinimum ? p.textMuted : p.amber),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (open.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2, right: AppSpace.sm),
                child: Text(
                  l10n.missingCategories(open.map((c) => '${c.label} ${c.present}/${c.minItems}').join(', ')),
                  style: text.bodyMedium?.copyWith(color: p.textMuted),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// "mutfak türü: Pide & Lahmacun ▾" — the cuisine, one tap from being changed.
class _CuisineButton extends StatelessWidget {
  const _CuisineButton({required this.name, required this.onTap});

  final String name;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 170, minHeight: 44),
      child: Tooltip(
        message: l10n.changeCuisine,
        child: InkWell(
          key: const Key('change-cuisine'),
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.control),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(
                    l10n.cuisineLabelled(name),
                    style: text.bodyMedium?.copyWith(color: onTap == null ? p.textMuted : p.accentText),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (onTap != null) Icon(Icons.expand_more_rounded, size: 18, color: p.accentText),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Shown only when the menu reads as another cuisine than the one picked: a one-line "did you mean", with the
/// re-run one tap away.
class _CuisineMismatch extends StatelessWidget {
  const _CuisineMismatch({required this.classification, required this.onRerun});

  final Classification classification;
  final void Function(String cuisineId, String cuisineName)? onRerun;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final suggestedId = classification.suggestedCuisineId;
    final suggested = classification.suggestedCuisineName;
    if (suggestedId == null || suggested == null) return const SizedBox.shrink();
    final rerun = onRerun;
    return InlineNotice(
      l10n.cuisineMismatch(suggested),
      icon: Icons.help_outline_rounded,
      tone: Tone.amber,
      action: rerun == null
          ? null
          : TextButton(
              key: const Key('rerun-suggested'),
              onPressed: () => rerun(suggestedId, suggested),
              child: Text(l10n.rerunAs(suggested)),
            ),
    );
  }
}

/// Two big tabs with their counts: what to add, and what to complete.
class _Tabs extends StatelessWidget {
  const _Tabs({required this.state, required this.onChanged});

  final AnalysisViewState state;
  final ValueChanged<ResultTab> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpace.page, 10, AppSpace.page, 2),
      child: SizedBox(
        width: double.infinity,
        child: SegmentedButton<ResultTab>(
          key: const Key('result-tabs'),
          showSelectedIcon: false,
          style: SegmentedButton.styleFrom(minimumSize: const Size(0, 48), textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
          segments: [
            ButtonSegment(
              value: ResultTab.newProducts,
              label: Text(l10n.tabNewProducts(state.count(CardSection.newProduct)), key: const Key('tab-new')),
            ),
            ButtonSegment(
              value: ResultTab.menuProducts,
              label: Text(l10n.tabMenuProducts(state.menuEntries.length), key: const Key('tab-menu')),
            ),
          ],
          selected: {state.activeTab},
          onSelectionChanged: (selection) {
            Haptics.select();
            onChanged(selection.first);
          },
        ),
      ),
    );
  }
}
