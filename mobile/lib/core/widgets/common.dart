import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../data/models/suggestion.dart';
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
