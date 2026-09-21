import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../data/models/analysis.dart';
import '../../l10n/gen/app_localizations.dart';
import '../design/components.dart';
import '../design/tokens.dart';
import '../network/api_exception.dart';

extension L10nX on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
}

/// User-facing text for any failure: the server's own message when it sent one, otherwise an l10n text.
String apiErrorText(AppLocalizations l10n, Object error) {
  if (error is ApiException) {
    if (error.isNetwork) return l10n.networkError;
    if (error.code == 'CANCELLED') return l10n.cancelled;
    final server = error.serverMessage;
    if (server != null) return server;
  }
  return l10n.genericError;
}

Future<void> copyToClipboard(BuildContext context, String text) async {
  await Clipboard.setData(ClipboardData(text: text));
  if (!context.mounted) return;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(context.l10n.copied), duration: const Duration(milliseconds: 900)));
}

void showMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// Opens a one-field editor in a bottom sheet; resolves to the trimmed text, or null when cancelled.
Future<String?> showFieldEditor(
  BuildContext context, {
  required String title,
  required String initial,
  int? maxLength,
  String? helper,
}) {
  return showModalBottomSheet<String>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    builder: (context) => _FieldEditSheet(title: title, initial: initial, maxLength: maxLength, helper: helper),
  );
}

class _FieldEditSheet extends StatefulWidget {
  const _FieldEditSheet({required this.title, required this.initial, this.maxLength, this.helper});

  final String title;
  final String initial;
  final int? maxLength;
  final String? helper;

  @override
  State<_FieldEditSheet> createState() => _FieldEditSheetState();
}

class _FieldEditSheetState extends State<_FieldEditSheet> {
  late final TextEditingController _controller = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: EdgeInsets.fromLTRB(AppSpace.page, 0, AppSpace.page, MediaQuery.viewInsetsOf(context).bottom + AppSpace.page),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l10n.editField(widget.title), style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: AppSpace.md),
          TextField(
            controller: _controller,
            autofocus: true,
            minLines: 1,
            maxLines: 5,
            maxLength: widget.maxLength,
            decoration: InputDecoration(helperText: widget.helper),
          ),
          const SizedBox(height: AppSpace.sm),
          Row(
            children: [
              Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(context), child: Text(l10n.cancel))),
              const SizedBox(width: AppSpace.sm),
              Expanded(child: FilledButton(onPressed: () => Navigator.pop(context, _controller.text.trim()), child: Text(l10n.save))),
            ],
          ),
        ],
      ),
    );
  }
}

class CopyButton extends StatelessWidget {
  const CopyButton({required this.text, super.key, this.tooltip});

  final String text;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.copy_rounded, size: 17),
      tooltip: tooltip ?? context.l10n.copy,
      visualDensity: VisualDensity.compact,
      onPressed: text.trim().isEmpty ? null : () => copyToClipboard(context, text),
    );
  }
}

/// Where a card comes from: Hazır şablon (neutral) · DB'den (green) · AI (amber: check it) · İnceleme gerek (red).
Tone originTone(CardOrigin origin) => switch (origin) {
      CardOrigin.seed => Tone.neutral,
      CardOrigin.db => Tone.success,
      CardOrigin.ai => Tone.amber,
      CardOrigin.review => Tone.danger,
    };

class OriginBadge extends StatelessWidget {
  const OriginBadge({required this.origin, super.key});

  final CardOrigin origin;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final label = switch (origin) {
      CardOrigin.seed => l10n.badgeSeed,
      CardOrigin.db => l10n.badgeDb,
      CardOrigin.ai => l10n.badgeAi,
      CardOrigin.review => l10n.badgeReview,
    };
    return Pill(label, tone: originTone(origin));
  }
}

/// Visible reminder that suggestions are decision support, not authority.
class DisclaimerBanner extends StatelessWidget {
  const DisclaimerBanner({super.key});

  @override
  Widget build(BuildContext context) =>
      InlineNotice(context.l10n.disclaimer, icon: Icons.verified_user_outlined, margin: const EdgeInsets.fromLTRB(AppSpace.page, 12, AppSpace.page, 4));
}

class EmptyState extends StatelessWidget {
  const EmptyState({required this.icon, required this.message, super.key, this.action});

  final IconData icon;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(color: p.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: p.border)),
              child: Icon(icon, size: 26, color: p.textMuted),
            ),
            const SizedBox(height: 14),
            Text(message, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: p.textMuted)),
            if (action != null) ...[const SizedBox(height: 18), action!],
          ],
        ),
      ),
    );
  }
}

/// Section heading used inside cards and lists (eyebrow style).
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) =>
      Eyebrow(text, trailing: trailing, padding: const EdgeInsets.only(top: 12, bottom: 4));
}
