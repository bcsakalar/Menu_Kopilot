import 'package:flutter/material.dart';

import 'tokens.dart';

/// A flat surface with a hairline border — the only card style of the app (no shadows, no tinted fills).
class AppCard extends StatelessWidget {
  const AppCard({
    required this.child,
    super.key,
    this.padding = const EdgeInsets.all(AppSpace.lg),
    this.margin = const EdgeInsets.symmetric(horizontal: AppSpace.page, vertical: 6),
    this.onTap,
    this.borderColor,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry margin;
  final VoidCallback? onTap;

  /// Emphasis (e.g. a card waiting for a decision); defaults to the hairline border.
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: margin,
      child: Material(
        color: p.surface,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.card),
          side: BorderSide(color: borderColor ?? p.border),
        ),
        child: InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
      ),
    );
  }
}

enum Tone { neutral, accent, amber, success, danger }

Color toneColor(AppPalette p, Tone tone) => switch (tone) {
      Tone.neutral => p.textMuted,
      Tone.accent => p.accentText,
      Tone.amber => p.amber,
      Tone.success => p.success,
      Tone.danger => p.danger,
    };

/// Small status label: a dot and a word, on a faint tint of its tone.
class Pill extends StatelessWidget {
  const Pill(this.label, {super.key, this.tone = Tone.neutral, this.icon});

  final String label;
  final Tone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final color = toneColor(p, tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: tone == Tone.neutral ? p.raised : color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: tone == Tone.neutral ? p.border : color.withValues(alpha: 0.28)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null)
            Icon(icon, size: 12, color: color)
          else
            Container(width: 6, height: 6, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 5),
          // A long label ("Çift Kişilik · tabanı belirler") shortens with "…" where the row is bounded (a Wrap on
          // a narrow phone) instead of overflowing; in an unbounded row (a horizontal list) it keeps its width.
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 11.5, height: 1.2, fontWeight: FontWeight.w700, letterSpacing: 0.1, color: tone == Tone.neutral ? p.text : color),
            ),
          ),
        ],
      ),
    );
  }
}

/// One-line notice inside the flow (warnings, offline copy, the "confirm with the restaurant" reminder).
class InlineNotice extends StatelessWidget {
  const InlineNotice(
    this.text, {
    super.key,
    this.tone = Tone.neutral,
    this.icon = Icons.info_outline_rounded,
    this.action,
    this.margin = const EdgeInsets.symmetric(horizontal: AppSpace.page, vertical: 6),
  });

  final String text;
  final Tone tone;
  final IconData icon;
  final Widget? action;
  final EdgeInsetsGeometry margin;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final color = toneColor(p, tone);
    return Padding(
      padding: margin,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        decoration: BoxDecoration(
          color: tone == Tone.neutral ? p.surface : color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(AppRadius.control),
          border: Border.all(color: tone == Tone.neutral ? p.border : color.withValues(alpha: 0.25)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(icon, size: 17, color: color),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(text, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: tone == Tone.neutral ? p.textMuted : p.text)),
                ),
              ],
            ),
            // Under the text, not beside it: an action label ("Kebap & Izgara olarak yeniden analiz et") is often
            // longer than the room a phone leaves next to the message.
            if (action != null) Align(alignment: AlignmentDirectional.centerEnd, child: action),
          ],
        ),
      ),
    );
  }
}

/// Eyebrow label above a group of content ("MENÜDE", "ÇAĞRIDA SOR"): small, tracked, faint.
class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key, this.trailing, this.padding = const EdgeInsets.fromLTRB(AppSpace.page, 20, AppSpace.sm, 8)});

  final String text;
  final Widget? trailing;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(
        children: [
          Expanded(child: Text(text, style: Theme.of(context).textTheme.labelSmall)),
          ?trailing,
        ],
      ),
    );
  }
}

/// A form row that opens a picker: label on top, the chosen value (or a prompt) below, chevron on the right.
class FieldRow extends StatelessWidget {
  const FieldRow({required this.label, required this.value, required this.onTap, super.key, this.icon, this.placeholder = false});

  final String label;
  final String value;
  final VoidCallback onTap;
  final IconData? icon;

  /// true while nothing is chosen: the value is drawn as a prompt.
  final bool placeholder;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    return Material(
      color: p.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control), side: BorderSide(color: p.border)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
          child: Row(
            children: [
              if (icon != null) ...[
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(color: p.raised, borderRadius: BorderRadius.circular(10), border: Border.all(color: p.border)),
                  child: Icon(icon, size: 18, color: placeholder ? p.textMuted : p.accentText),
                ),
                const SizedBox(width: 12),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(label, style: text.labelSmall),
                    const SizedBox(height: 3),
                    Text(
                      value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: text.titleMedium?.copyWith(color: placeholder ? p.textMuted : p.text),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: p.textFaint),
            ],
          ),
        ),
      ),
    );
  }
}

/// Rows on one bordered surface, separated by hairlines. A Material (not a decorated box) so the rows' ink ripples
/// stay visible.
class SurfaceGroup extends StatelessWidget {
  const SurfaceGroup({
    required this.children,
    super.key,
    this.margin = const EdgeInsets.symmetric(horizontal: AppSpace.page),
    this.dividerIndent = AppSpace.page,
  });

  final List<Widget> children;
  final EdgeInsetsGeometry margin;
  final double dividerIndent;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: margin,
      child: Material(
        color: p.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.card), side: BorderSide(color: p.border)),
        clipBehavior: Clip.antiAlias,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (index, child) in children.indexed) ...[
              if (index > 0) Divider(height: 1, indent: dividerIndent, color: p.border),
              child,
            ],
          ],
        ),
      ),
    );
  }
}
