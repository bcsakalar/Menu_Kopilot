import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/design/components.dart';
import '../../core/design/tokens.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/widgets/common.dart';
import '../../data/models/history.dart';
import '../../l10n/gen/app_localizations.dart';

/// What the team taught the suggestions (D-194).
final learningProvider = FutureProvider.autoDispose<LearningResult>((ref) => ref.watch(apiClientProvider).learning());

/// "Öğrenilenler": the products sellers kept saying "Hayır" to, which now come last (D-196), and the card suggestions
/// the team kept deleting, which no longer come — each with a "Geri al" for the one learned by mistake.
class LearningScreen extends ConsumerWidget {
  const LearningScreen({super.key});

  static String _kind(AppLocalizations l10n, LearnedKind kind) => switch (kind) {
        LearnedKind.optionGroup => l10n.kindOptionGroup,
        LearnedKind.removable => l10n.kindRemovable,
        LearnedKind.extra => l10n.kindExtra,
      };

  Future<void> _undo(BuildContext context, WidgetRef ref, {required String question, required Future<int> Function() forget}) async {
    final l10n = context.l10n;
    final sure = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: Text(question),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(l10n.cancel)),
          FilledButton(key: const Key('undo-confirm'), onPressed: () => Navigator.of(context).pop(true), child: Text(l10n.undoLearned)),
        ],
      ),
    );
    if (sure != true || !context.mounted) return;
    try {
      await forget();
      ref.invalidate(learningProvider);
      if (context.mounted) showMessage(context, l10n.undoDone);
    } on ApiException catch (e) {
      if (context.mounted) showMessage(context, apiErrorText(l10n, e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final api = ref.watch(apiClientProvider);
    final date = DateFormat('d MMM HH:mm', 'tr');
    final result = ref.watch(learningProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.learningTitle)),
      body: result.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => EmptyState(
          icon: Icons.cloud_off_rounded,
          message: apiErrorText(l10n, error),
          action: FilledButton(onPressed: () => ref.invalidate(learningProvider), child: Text(l10n.retry)),
        ),
        data: (learned) => RefreshIndicator(
          onRefresh: () => ref.refresh(learningProvider.future),
          child: ListView(
            key: const Key('learning-list'),
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: 32),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(AppSpace.page, 12, AppSpace.page, 4),
                child: Text(l10n.learningIntro, style: text.bodyMedium?.copyWith(color: p.textMuted)),
              ),
              if (learned.isEmpty) EmptyState(icon: Icons.school_outlined, message: l10n.learningEmpty),
              if (learned.products.isNotEmpty) ...[
                Padding(padding: const EdgeInsets.symmetric(horizontal: AppSpace.page), child: SectionLabel(l10n.learningProducts)),
                SurfaceGroup(
                  children: [
                    for (final product in learned.products)
                      _LearnedRow(
                        key: ValueKey('learned-product-${product.cuisineId}-${product.name}'),
                        title: product.name,
                        subtitle: l10n.learnedProductLine(product.cuisineName, product.removed, date.format(product.lastAt)),
                        onUndo: () => _undo(
                          context,
                          ref,
                          question: l10n.undoProductQuestion(product.name, product.cuisineName),
                          forget: () => api.forgetLearnedProduct(cuisineId: product.cuisineId, name: product.name),
                        ),
                      ),
                  ],
                ),
              ],
              if (learned.suggestions.isNotEmpty) ...[
                Padding(padding: const EdgeInsets.symmetric(horizontal: AppSpace.page), child: SectionLabel(l10n.learningSuggestions)),
                SurfaceGroup(
                  children: [
                    for (final suggestion in learned.suggestions)
                      _LearnedRow(
                        key: ValueKey('learned-suggestion-${suggestion.productType}-${suggestion.kind.wire}-${suggestion.value}'),
                        title: suggestion.value,
                        subtitle: l10n.learnedSuggestionLine(
                          suggestion.productTypeLabel,
                          _kind(l10n, suggestion.kind),
                          suggestion.removed,
                          date.format(suggestion.lastAt),
                        ),
                        onUndo: () => _undo(
                          context,
                          ref,
                          question: l10n.undoSuggestionQuestion(suggestion.value, suggestion.productTypeLabel),
                          forget: () => api.forgetLearnedSuggestion(
                            productType: suggestion.productType,
                            kind: suggestion.kind,
                            value: suggestion.value,
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _LearnedRow extends StatelessWidget {
  const _LearnedRow({required this.title, required this.subtitle, required this.onUndo, super.key});

  final String title;
  final String subtitle;
  final VoidCallback onUndo;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return ListTile(
      title: Text(title, style: Theme.of(context).textTheme.titleSmall),
      subtitle: Text(subtitle),
      trailing: TextButton(
        onPressed: onUndo,
        style: TextButton.styleFrom(minimumSize: const Size(64, 44)),
        child: Text(l10n.undoLearned),
      ),
    );
  }
}
