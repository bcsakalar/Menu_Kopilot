import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/design/components.dart';
import '../../core/design/tokens.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/storage/app_database.dart';
import '../../core/utils/file_sharer.dart';
import '../../core/utils/haptics.dart';
import '../../core/widgets/common.dart';
import '../../data/models/analysis.dart';
import '../../data/models/template_payload.dart';
import '../../l10n/gen/app_localizations.dart';
import '../voice/voice_note_button.dart';
import 'analysis_controller.dart';
import 'product_card.dart' show optionLabel;

/// "Ofiste girilecekler" (D-196): after the call, what the seller said yes to — every product with the sections to
/// enter on the panel and a "Panele girildi" tick — what the seller will think about, and the call's note. Shared
/// with the seller in one tap.

/// The ticks live on the phone, per analysis.
final officeTicksProvider = StreamProvider.autoDispose.family<Set<String>, String>(
  (ref, runId) => ref.watch(appDatabaseProvider).watchChecked('office:$runId'),
);

String _nameOf(AnalysisCard card) => card.targetName ?? card.name;

/// The message for the seller: what was agreed, and what they will think about. No prices, no technical words.
/// [removedOf]: what was tapped away on a card, so a product on the menu names only the sections that stay.
String officeShareText(
  AppLocalizations l10n,
  List<AnalysisCard> yes,
  List<AnalysisCard> later, {
  Set<String> Function(String cardId)? removedOf,
}) {
  String line(AnalysisCard card) {
    if (card.section != CardSection.option) return '• ${_nameOf(card)}';
    final c = card.kept(removedOf?.call(card.id) ?? const {});
    final what = [
      if (c.optionGroups.isNotEmpty) l10n.officeWhatOptions,
      if (c.removableIngredients.isNotEmpty) l10n.officeWhatRemovables,
      if (c.extraIngredients.isNotEmpty) l10n.officeWhatExtras,
      if (c.description.trim().isNotEmpty) l10n.officeWhatDescription,
    ].join(', ');
    return what.isEmpty ? '• ${_nameOf(card)}' : '• ${l10n.officeShareMenuLine(_nameOf(card), what)}';
  }

  return [
    if (yes.isNotEmpty) ...[l10n.officeShareIntro, ...yes.map(line)],
    if (yes.isNotEmpty && later.isNotEmpty) '',
    if (later.isNotEmpty) ...[l10n.officeShareLater, ...later.map(line)],
  ].join('\n');
}

class OfficeScreen extends ConsumerStatefulWidget {
  const OfficeScreen({required this.runId, super.key});

  final String runId;

  @override
  ConsumerState<OfficeScreen> createState() => _OfficeScreenState();
}

class _OfficeScreenState extends ConsumerState<OfficeScreen> {
  final _note = TextEditingController();
  final Set<String> _busy = {};
  Timer? _noteSave;
  // Held from the start: the note is saved one last time while the screen closes, when ref is no longer usable.
  late final AppDatabase _db;

  String get _noteKey => 'call_note:${widget.runId}';

  @override
  void initState() {
    super.initState();
    _db = ref.read(appDatabaseProvider);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      // Opened from the history: the analysis is loaded first.
      if (ref.read(analysisControllerProvider).runId != widget.runId) {
        unawaited(ref.read(analysisControllerProvider.notifier).load(widget.runId));
      }
    });
    unawaited(_loadNote());
  }

  Future<void> _loadNote() async {
    final saved = await _db.readKv(_noteKey);
    if (mounted && saved != null && _note.text.isEmpty) _note.text = saved;
  }

  void _noteChanged(String text) {
    _noteSave?.cancel();
    _noteSave = Timer(const Duration(milliseconds: 400), () => _db.writeKv(_noteKey, text));
  }

  @override
  void dispose() {
    if (_noteSave?.isActive ?? false) {
      _noteSave!.cancel();
      unawaited(_db.writeKv(_noteKey, _note.text));
    }
    _note.dispose();
    super.dispose();
  }

  Future<void> _yes(AnalysisCard card) async {
    setState(() => _busy.add(card.id));
    final error = await ref.read(analysisControllerProvider.notifier).accept(card.id);
    if (!mounted) return;
    setState(() => _busy.remove(card.id));
    if (error == null) {
      unawaited(Haptics.confirm());
      return;
    }
    showMessage(context, error is ApiException ? apiErrorText(context.l10n, error) : context.l10n.acceptNeedsContent);
  }

  Future<void> _share(List<AnalysisCard> yes, List<AnalysisCard> later) async {
    final l10n = context.l10n;
    final message = officeShareText(l10n, yes, later, removedOf: ref.read(analysisControllerProvider).removedOf);
    try {
      await ref.read(fileSharerProvider).shareMessage(message);
    } on Object catch (_) {
      // No share sheet (rare): the text goes to the clipboard, ready to paste into the chat.
      await Clipboard.setData(ClipboardData(text: message));
      if (mounted) showMessage(context, l10n.officeShareCopied);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final state = ref.watch(analysisControllerProvider);
    final ours = state.runId == widget.runId;
    // Opened from the history, the analysis is still on its way; an analysis that is still running shows what it has.
    final loading = !ours || (state.cards.isEmpty && (state.phase == RunPhase.idle || state.phase == RunPhase.streaming));
    final failed = ours && state.cards.isEmpty && state.phase == RunPhase.error;
    final cards = ours ? state.cards.where((c) => c.section != CardSection.fix).toList() : const <AnalysisCard>[];
    final yes = cards.where((c) => c.status == CardStatus.accepted).toList();
    final later = cards.where((c) => c.status == CardStatus.later).toList();
    final ticks = ref.watch(officeTicksProvider(widget.runId)).value ?? const <String>{};
    final entered = yes.where((c) => ticks.contains(c.id)).length;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.officeTitle),
        actions: [
          if (yes.isNotEmpty || later.isNotEmpty)
            IconButton(
              key: const Key('office-share'),
              onPressed: () => _share(yes, later),
              icon: const Icon(Icons.share_outlined),
              tooltip: l10n.officeShare,
            ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : failed
          ? EmptyState(
              icon: Icons.error_outline_rounded,
              message: l10n.networkError,
              action: FilledButton.icon(
                key: const Key('office-retry'),
                onPressed: () => ref.read(analysisControllerProvider.notifier).load(widget.runId),
                icon: const Icon(Icons.refresh_rounded),
                label: Text(l10n.retry),
              ),
            )
          : ListView(
              key: const Key('office-list'),
              padding: const EdgeInsets.only(bottom: 32),
              children: [
                if (state.cuisineName.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(AppSpace.page, 12, AppSpace.page, 0),
                    child: Text(state.cuisineName, style: text.bodyMedium?.copyWith(color: p.textMuted)),
                  ),
                if (yes.isEmpty && later.isEmpty) EmptyState(icon: Icons.assignment_outlined, message: l10n.officeEmpty),
                if (yes.isNotEmpty) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(AppSpace.page, 8, AppSpace.page, 4),
                    child: SectionLabel(
                      l10n.officeYes(yes.length),
                      trailing: Text(
                        l10n.officeEntered(entered, yes.length),
                        key: const Key('office-progress'),
                        style: text.bodyMedium?.copyWith(color: entered == yes.length ? p.success : p.textMuted, fontFeatures: tabularFigures),
                      ),
                    ),
                  ),
                  for (final card in yes)
                    _OfficeItem(
                      card: card,
                      kept: card.kept(state.removedOf(card.id)),
                      entered: ticks.contains(card.id),
                      onEntered: (value) => _db.setChecked('office:${widget.runId}', card.id, value),
                    ),
                ],
                if (later.isNotEmpty) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(AppSpace.page, 16, AppSpace.page, 4),
                    child: SectionLabel(l10n.officeLater(later.length)),
                  ),
                  SurfaceGroup(
                    children: [
                      for (final card in later)
                        ListTile(
                          key: ValueKey('office-later-${card.id}'),
                          title: Text(_nameOf(card), style: text.titleSmall),
                          subtitle: card.pitch.isEmpty ? null : Text(card.pitch),
                          trailing: _busy.contains(card.id)
                              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4))
                              : TextButton(
                                  key: ValueKey('office-yes-${card.id}'),
                                  onPressed: () => _yes(card),
                                  style: TextButton.styleFrom(minimumSize: const Size(64, 44)),
                                  child: Text(l10n.officeLaterYes),
                                ),
                        ),
                    ],
                  ),
                ],
                Padding(
                  padding: const EdgeInsets.fromLTRB(AppSpace.page, 16, AppSpace.page, 4),
                  child: SectionLabel(l10n.officeNote),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpace.page),
                  child: TextField(
                    key: const Key('office-note'),
                    controller: _note,
                    minLines: 3,
                    maxLines: 10,
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: _noteChanged,
                    decoration: InputDecoration(hintText: l10n.officeNoteHint),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(AppSpace.page, 8, AppSpace.page, 0),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: VoiceNoteButton(
                      cuisineId: state.counts?.cuisineId,
                      onText: (transcription) {
                        final addition = transcription.text.trim();
                        if (addition.isEmpty) return;
                        final current = _note.text.trimRight();
                        _note.text = current.isEmpty ? addition : '$current\n$addition';
                        _noteChanged(_note.text);
                      },
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

/// One product to enter on the panel: its name, the sections as the seller agreed to them, and the tick.
class _OfficeItem extends StatelessWidget {
  const _OfficeItem({required this.card, required this.kept, required this.entered, required this.onEntered});

  final AnalysisCard card;
  final TemplatePayload kept;
  final bool entered;
  final ValueChanged<bool> onEntered;

  String _copyText(AppLocalizations l10n) => [
        _nameOf(card),
        if (kept.optionGroups.isNotEmpty) '${l10n.sectionOptionsTitle}:\n${optionsCopyLines(l10n, kept.optionGroups)}',
        if (kept.removableIngredients.isNotEmpty) '${l10n.sectionRemovablesTitle}: ${kept.removableIngredients.join(', ')}',
        if (kept.extraIngredients.isNotEmpty) '${l10n.sectionExtrasTitle}: ${kept.extraIngredients.map((e) => e.name).join(', ')}',
        if (kept.description.trim().isNotEmpty) '${l10n.sectionDescriptionTitle}: ${kept.description.trim()}',
      ].join('\n');

  static String optionsCopyLines(AppLocalizations l10n, List<OptionGroup> groups) =>
      groups.map((g) => '${g.name}: ${g.options.map((o) => optionLabel(l10n, o)).join(', ')}').join('\n');

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    Widget section(String label, String value) => Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: text.labelLarge?.copyWith(color: p.textMuted)),
              const SizedBox(height: 2),
              SelectableText(value, style: text.bodyLarge?.copyWith(fontSize: 15.5, height: 1.35)),
            ],
          ),
        );

    return AppCard(
      key: ValueKey('office-item-${card.id}'),
      borderColor: entered ? p.success.withValues(alpha: 0.5) : null,
      padding: const EdgeInsets.fromLTRB(AppSpace.md, 10, AppSpace.lg, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Checkbox(
                key: ValueKey('office-entered-${card.id}'),
                value: entered,
                semanticLabel: l10n.officeEnteredCheck,
                onChanged: (value) {
                  Haptics.select();
                  onEntered(value ?? false);
                },
              ),
              Expanded(
                child: Text(
                  _nameOf(card),
                  style: text.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: entered ? p.textMuted : p.text,
                    decoration: entered ? TextDecoration.lineThrough : null,
                  ),
                ),
              ),
              Pill(
                card.section == CardSection.newProduct ? l10n.newProductBadge : l10n.onMenuBadge,
                tone: card.section == CardSection.newProduct ? Tone.accent : Tone.neutral,
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(left: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (card.isPlainRow)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(l10n.plainProduct, style: text.bodyMedium?.copyWith(color: p.textMuted)),
                  ),
                if (kept.optionGroups.isNotEmpty) section(l10n.sectionOptionsTitle, optionsCopyLines(l10n, kept.optionGroups)),
                if (kept.removableIngredients.isNotEmpty) section(l10n.sectionRemovablesTitle, kept.removableIngredients.join(', ')),
                if (kept.extraIngredients.isNotEmpty)
                  section(l10n.sectionExtrasTitle, kept.extraIngredients.map((e) => e.name).join(', ')),
                if (kept.description.trim().isNotEmpty) section(l10n.sectionDescriptionTitle, kept.description.trim()),
                Align(alignment: Alignment.centerRight, child: CopyButton(text: _copyText(l10n))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
