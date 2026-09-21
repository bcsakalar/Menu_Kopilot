import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

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
import 'section_cards.dart';

/// The one result screen. Pinned on top: how many products the menu has against the cuisine target, and the
/// section filter. Below: three titled, counted sections — new products, options for products already on the
/// menu, and things to fix — each scannable without opening anything. The screen stays awake while it is open,
/// because it is read during a phone call.
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

  Future<void> _openEditor(AnalysisCard card) async {
    final payload = card.payload;
    if (payload == null) return;
    final edited = await Navigator.of(context).push<TemplatePayload>(
      MaterialPageRoute(builder: (_) => CardEditorScreen(initial: payload)),
    );
    if (edited != null) ref.read(analysisControllerProvider.notifier).updatePayload(card.id, edited);
  }

  void _copySelected(AnalysisViewState state) {
    final l10n = context.l10n;
    final chosen = state.cards.where((c) => state.selected.contains(c.id)).toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    if (chosen.isEmpty) return;
    final text = chosen.map((c) => cardCopyText(l10n, c)).join('\n\n');
    copyToClipboard(context, text);
    Haptics.confirm();
  }

  /// The user overrides the Classifier: same menu, another cuisine. The server reuses the product list it read.
  Future<void> _changeCuisine() async {
    final cuisine = await pickCuisine(context);
    if (cuisine == null || !mounted) return;
    await _rerun(cuisine.id, cuisine.name);
  }

  Future<void> _rerun(String cuisineId, String cuisineName) async {
    if (ref.read(analysisControllerProvider).counts?.cuisineId == cuisineId) return;
    await Haptics.select();
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
          if (state.runId != null && !state.isStreaming)
            IconButton(
              tooltip: l10n.pipelineDebug,
              icon: const Icon(Icons.bug_report_outlined),
              onPressed: () => context.push('/suggest/debug?runId=${state.runId}'),
            ),
        ],
      ),
      bottomNavigationBar: state.selected.isEmpty
          ? null
          : _SelectionBar(
              count: state.selected.length,
              onCopy: () => _copySelected(state),
              onClear: controller.clearSelection,
            ),
      body: switch (state.phase) {
        RunPhase.idle => EmptyState(icon: Icons.playlist_add_rounded, message: l10n.noAnalysisYet),
        RunPhase.queued => EmptyState(icon: Icons.cloud_upload_outlined, message: l10n.queuedOffline),
        RunPhase.error when state.cards.isEmpty => EmptyState(
            icon: Icons.error_outline_rounded,
            message: state.error ?? l10n.genericError,
          ),
        _ => Column(
            children: [
              // Pinned: the number that matters and the filter never scroll away during the call.
              if (state.counts != null) _ProgressStrip(state: state, onChangeCuisine: canRerun ? _changeCuisine : null),
              if (!reading) _FilterChips(state: state, onChanged: controller.setFilter),
              Expanded(
                child: CustomScrollView(
                  slivers: [
                    SliverToBoxAdapter(
                      child: Column(
                        children: [
                          const DisclaimerBanner(),
                          if (state.offline) InlineNotice(l10n.offlineBanner, icon: Icons.cloud_off_rounded, tone: Tone.amber),
                          if (state.classification?.disagrees ?? false)
                            _CuisineMismatch(
                              classification: state.classification!,
                              onRerun: canRerun ? _rerun : null,
                            ),
                          for (final warning in state.warnings)
                            InlineNotice(warning, icon: Icons.warning_amber_rounded, tone: Tone.amber),
                          if (reading) ScanSkeleton(message: state.message ?? l10n.analyzing),
                        ],
                      ),
                    ),
                    for (final section in state.visibleSections) _sectionGroup(state, controller, section),
                    if (state.isStreaming && !reading) const SliverToBoxAdapter(child: SkeletonCard()),
                    const SliverToBoxAdapter(child: SizedBox(height: 40)),
                  ],
                ),
              ),
            ],
          ),
      },
    );
  }

  /// One section: its header sticks while the section is on screen and hands over to the next one, so it always
  /// names the block you are reading. Empty sections still show their header with a "yok" line — the absence of
  /// a section is information too ("bu menüde düzeltilecek bir şey çıkmadı").
  Widget _sectionGroup(AnalysisViewState state, AnalysisController controller, CardSection section) {
    final l10n = context.l10n;
    final cards = state.section(section);
    if (cards.isEmpty && state.filter == SectionFilter.all && state.isStreaming) {
      return const SliverToBoxAdapter(child: SizedBox.shrink());
    }
    return SliverMainAxisGroup(
      slivers: [
        SliverPersistentHeader(
          pinned: true,
          delegate: _SectionHeaderDelegate(
            section: section,
            count: cards.length,
            palette: context.palette,
            theme: Theme.of(context),
            title: sectionTitle(l10n, section),
            hint: sectionHint(l10n, section),
            onSelectAll: cards.any((c) => c.isPending) ? () => controller.selectSection(section) : null,
            selectAllLabel: l10n.selectAll,
          ),
        ),
        if (cards.isEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(AppSpace.page, 4, AppSpace.page, 12),
              child: Text(l10n.sectionEmpty, style: Theme.of(context).textTheme.bodySmall),
            ),
          )
        else
          SliverList.builder(
            itemCount: cards.length,
            itemBuilder: (context, index) {
              final card = cards[index];
              return SectionCardView(
                key: ValueKey(card.id),
                card: card,
                busy: _busy.contains(card.id),
                selected: state.selected.contains(card.id),
                onToggleSelect: () => controller.toggleSelected(card.id),
                onAccept: () => _act(card.id, () => controller.accept(card.id), accept: true),
                onSkip: () => _act(card.id, () => controller.skip(card.id), accept: false),
                onEdit: card.payload == null ? null : () => _openEditor(card),
              );
            },
          ),
      ],
    );
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

/// Pinned progress: "Mevcut X ürün / hedef Y", the cuisine (tap to change it), the 10-product rule and the
/// categories still short. Updates live as cards are accepted.
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

    final numbers = text.titleLarge?.copyWith(fontFeatures: tabularFigures, fontWeight: FontWeight.w700);
    final words = text.bodyMedium?.copyWith(color: p.textMuted);
    final rule = [
      if (!counts.meetsHardMinimum) l10n.belowHardMinimum(counts.hardMinimum),
      if (counts.missing > 0) l10n.missingCount(counts.missing) else l10n.targetReached,
    ].join(' · ');
    final status = switch (state.phase) {
      RunPhase.streaming => state.message ?? l10n.analyzing,
      RunPhase.cancelled => l10n.stopped,
      _ when state.stats != null && state.stats!.cacheHit => l10n.fromCache,
      _ when state.stats != null => l10n.analysisSummary(state.stats!.menuItems, state.stats!.llmCalls),
      _ => '',
    };

    return Material(
      color: p.canvas,
      child: Container(
        key: const Key('analysis-counts'),
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(AppSpace.page, 10, AppSpace.sm, 8),
        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: p.border))),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(text: '${l10n.progressCurrent} ', style: words),
                        TextSpan(text: '${counts.current}', style: numbers),
                        TextSpan(text: ' ${l10n.productsUnit} / ${l10n.progressTarget} ', style: words),
                        TextSpan(text: '${counts.target}', style: numbers?.copyWith(color: p.textMuted)),
                      ],
                    ),
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
                height: 4,
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 6, right: AppSpace.sm),
              child: Text(
                [rule, if (status.isNotEmpty) status].join(' · '),
                style: text.bodySmall?.copyWith(color: counts.meetsHardMinimum ? p.textMuted : p.amber),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (open.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: SizedBox(
                  height: 24,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: open.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 6),
                    itemBuilder: (context, index) {
                      final category = open[index];
                      return Pill('${category.label} ${category.present}/${category.minItems}', tone: Tone.amber);
                    },
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// "mutfak türü: Pide & Lahmacun ▾" — the Classifier's verdict, one tap from being overridden.
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
      constraints: const BoxConstraints(maxWidth: 170),
      child: Tooltip(
        message: l10n.changeCuisine,
        child: InkWell(
          key: const Key('change-cuisine'),
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.control),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(
                    l10n.cuisineLabelled(name),
                    style: text.bodySmall?.copyWith(color: onTap == null ? p.textMuted : p.accentText),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (onTap != null) Icon(Icons.expand_more_rounded, size: 16, color: p.accentText),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Shown only when the Classifier read a different cuisine than the one picked: a one-line "did you mean", with
/// the re-run one tap away.
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

class _FilterChips extends StatelessWidget {
  const _FilterChips({required this.state, required this.onChanged});

  final AnalysisViewState state;
  final ValueChanged<SectionFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final entries = <(SectionFilter, String, int)>[
      (SectionFilter.all, l10n.filterAll, state.cards.length),
      (SectionFilter.newProduct, l10n.filterNewProducts, state.count(CardSection.newProduct)),
      (SectionFilter.option, l10n.filterOptions, state.count(CardSection.option)),
      (SectionFilter.fix, l10n.filterFixes, state.count(CardSection.fix)),
    ];
    return SizedBox(
      height: 48,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpace.page, vertical: 4),
        itemCount: entries.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final (filter, label, count) = entries[index];
          return FilterChip(
            key: ValueKey('filter-${filter.name}'),
            selected: state.filter == filter,
            label: Text('$label · $count'),
            onSelected: (_) {
              Haptics.select();
              onChanged(filter);
            },
          );
        },
      ),
    );
  }
}

/// Bottom bar while cards are ticked: copy them all at once, or clear the selection.
class _SelectionBar extends StatelessWidget {
  const _SelectionBar({required this.count, required this.onCopy, required this.onClear});

  final int count;
  final VoidCallback onCopy;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    return SafeArea(
      child: DecoratedBox(
        decoration: BoxDecoration(color: p.surface, border: Border(top: BorderSide(color: p.border))),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(AppSpace.page, 8, AppSpace.page, 8),
          child: Row(
            children: [
              IconButton(onPressed: onClear, icon: const Icon(Icons.close_rounded), tooltip: l10n.clearSelection),
              const SizedBox(width: 4),
              Expanded(child: Text(l10n.selectedCount(count), style: Theme.of(context).textTheme.titleSmall)),
              FilledButton.icon(
                key: const Key('copy-selected'),
                onPressed: onCopy,
                icon: const Icon(Icons.copy_all_rounded, size: 18),
                label: Text(l10n.copySelected),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Sticky section header: colour bar, icon, title, live count, and "hepsini seç" for that section.
class _SectionHeaderDelegate extends SliverPersistentHeaderDelegate {
  _SectionHeaderDelegate({
    required this.section,
    required this.count,
    required this.palette,
    required this.theme,
    required this.title,
    required this.hint,
    required this.onSelectAll,
    required this.selectAllLabel,
  });

  final CardSection section;
  final int count;
  final AppPalette palette;
  final ThemeData theme;
  final String title;
  final String hint;
  final VoidCallback? onSelectAll;
  final String selectAllLabel;

  static const double _height = 56;

  @override
  double get minExtent => _height;

  @override
  double get maxExtent => _height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    final style = sectionStyle(palette, section);
    return Material(
      color: palette.canvas,
      child: Container(
        height: _height,
        padding: const EdgeInsets.fromLTRB(AppSpace.page, 0, AppSpace.sm, 0),
        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: palette.border))),
        child: Row(
          children: [
            Container(width: 3, height: 26, decoration: BoxDecoration(color: style.colour, borderRadius: BorderRadius.circular(2))),
            const SizedBox(width: 10),
            Icon(style.icon, size: 18, color: style.colour),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$title · $count', style: theme.textTheme.titleSmall),
                  Text(hint, style: theme.textTheme.bodySmall?.copyWith(fontSize: 11.5, color: palette.textFaint), maxLines: 1),
                ],
              ),
            ),
            if (onSelectAll != null)
              TextButton(
                key: ValueKey('select-all-${section.name}'),
                onPressed: onSelectAll,
                child: Text(selectAllLabel, style: theme.textTheme.labelMedium),
              ),
          ],
        ),
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _SectionHeaderDelegate old) =>
      old.count != count ||
      old.section != section ||
      (old.onSelectAll == null) != (onSelectAll == null) ||
      old.palette != palette ||
      old.title != title ||
      old.hint != hint;
}
