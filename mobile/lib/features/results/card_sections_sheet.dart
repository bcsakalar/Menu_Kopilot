import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/design/tokens.dart';
import '../../core/utils/haptics.dart';
import '../../core/widgets/common.dart';
import '../../data/models/analysis.dart';
import 'analysis_controller.dart';
import 'product_card.dart';

/// One product's four sections over the result list, opened from a closed card's quick buttons (D-198).
///
/// During the call the seller asks "lahmacunda ekstra ne var?" — the expert taps "Ekstra 3" on the Lahmacun card and
/// the extras are on screen, big, with "Kopyala"; the other sections are one swipe away and the seller's answer is
/// at the bottom. The list underneath keeps its place. Chips toggle exactly as on the card: both read the same state.
Future<void> showCardSections(
  BuildContext context, {
  required String cardId,
  required String title,
  required CardSectionKind initial,
  required VoidCallback onYes,
  required VoidCallback onLater,
  required VoidCallback onNo,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (sheetContext) => _CardSectionsSheet(
      cardId: cardId,
      title: title,
      initial: initial,
      // An answer closes the sheet first: the card behind it then closes itself, and the call moves on.
      onYes: () {
        Navigator.of(sheetContext).pop();
        onYes();
      },
      onLater: () {
        Navigator.of(sheetContext).pop();
        onLater();
      },
      onNo: () {
        Navigator.of(sheetContext).pop();
        onNo();
      },
    ),
  );
}

class _CardSectionsSheet extends ConsumerWidget {
  const _CardSectionsSheet({
    required this.cardId,
    required this.title,
    required this.initial,
    required this.onYes,
    required this.onLater,
    required this.onNo,
  });

  final String cardId;
  final String title;
  final CardSectionKind initial;
  final VoidCallback onYes;
  final VoidCallback onLater;
  final VoidCallback onNo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final state = ref.watch(analysisControllerProvider);
    final card = state.cards.where((c) => c.id == cardId).firstOrNull;
    if (card == null) return const SizedBox(height: 120);
    final removed = state.removedOf(card.id);
    final controller = ref.read(analysisControllerProvider.notifier);
    final enabled = card.status != CardStatus.accepted;
    final details = [
      if (card.basedOn != null) l10n.alternativeOf(card.basedOn!),
      if (card.categoryLabel != null) card.categoryLabel!,
      if (card.portionInfo.isNotEmpty) l10n.portionLine(card.portionInfo),
    ].join(' · ');
    String tabLabel(CardSectionKind kind) => switch (kind) {
          CardSectionKind.options => l10n.sectionOptionsTitle,
          CardSectionKind.removables => l10n.sectionRemovablesTitle,
          CardSectionKind.extras => l10n.sectionExtrasTitle,
          CardSectionKind.description => l10n.sectionDescriptionTitle,
        };

    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.78,
      child: DefaultTabController(
        length: CardSectionKind.values.length,
        initialIndex: initial.index,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpace.page, 0, AppSpace.page, 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, key: const Key('sheet-title'), style: text.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                  if (details.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(details, style: text.bodyMedium?.copyWith(color: p.textMuted)),
                    ),
                ],
              ),
            ),
            TabBar(
              key: const Key('sheet-tabs'),
              isScrollable: true,
              tabAlignment: TabAlignment.start,
              onTap: (_) => Haptics.select(),
              tabs: [
                for (final kind in CardSectionKind.values)
                  Tab(
                    height: 48,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(sectionIcon(kind), size: 18),
                        const SizedBox(width: 6),
                        Text(tabLabel(kind), style: TextStyle(color: hasSection(card, kind) ? null : p.textFaint)),
                      ],
                    ),
                  ),
              ],
            ),
            Expanded(
              child: TabBarView(
                children: [
                  for (final kind in CardSectionKind.values)
                    ListView(
                      padding: const EdgeInsets.fromLTRB(AppSpace.page, 4, AppSpace.page, 16),
                      children: [
                        CardSectionView(
                          card: card,
                          kind: kind,
                          removed: removed,
                          enabled: enabled,
                          divider: false,
                          onToggle: (key) => controller.toggleItem(card.id, key),
                        ),
                      ],
                    ),
                ],
              ),
            ),
            if (card.section != CardSection.fix)
              DecoratedBox(
                decoration: BoxDecoration(border: Border(top: BorderSide(color: p.border))),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(AppSpace.page, 10, AppSpace.page, 12),
                  child: CardAnswers(card: card, removed: removed, busy: false, onYes: onYes, onLater: onLater, onNo: onNo),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
