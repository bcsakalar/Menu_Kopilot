import 'package:flutter/material.dart';

import 'tokens.dart';

/// Whether the software keyboard is open. Provided once at the app root: nested scaffolds remove the keyboard inset
/// from their own MediaQuery, so a widget deep in a tab cannot see it any more.
class KeyboardVisibility extends InheritedWidget {
  const KeyboardVisibility({required this.open, required super.child, super.key});

  final bool open;

  static bool of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<KeyboardVisibility>()?.open ?? false;

  @override
  bool updateShouldNotify(KeyboardVisibility oldWidget) => oldWidget.open != open;
}

/// Floating bottom bar of the input screens: capture tools on the left, the primary action on the right (thumb
/// reach). It slides away while the keyboard is open so it never covers the field being typed in; tapping outside
/// the field closes the keyboard and brings it back.
class ActionDock extends StatelessWidget {
  const ActionDock({required this.primary, super.key, this.tools = const []});

  final Widget primary;
  final List<Widget> tools;

  /// Space the scrolling content keeps free below itself so its end is not hidden behind the dock.
  static const double reservedHeight = 96;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final hidden = KeyboardVisibility.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return AnimatedSlide(
      offset: hidden ? const Offset(0, 1.4) : Offset.zero,
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
      child: AnimatedOpacity(
        opacity: hidden ? 0 : 1,
        duration: const Duration(milliseconds: 140),
        child: IgnorePointer(
          ignoring: hidden,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: Container(
              key: const Key('action-dock'),
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: p.raised,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: p.border),
                boxShadow: [
                  BoxShadow(color: Colors.black.withValues(alpha: dark ? 0.45 : 0.10), blurRadius: 28, offset: const Offset(0, 10)),
                ],
              ),
              child: Row(
                children: [
                  for (final tool in tools) ...[tool, const SizedBox(width: 6)],
                  const SizedBox(width: 2),
                  Expanded(child: primary),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Square tool button of the dock (camera, gallery, voice).
class DockButton extends StatelessWidget {
  const DockButton({required this.icon, required this.tooltip, required this.onPressed, super.key, this.badge});

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;

  /// Small count in the corner (e.g. photos added).
  final int? badge;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        label: tooltip,
        child: SizedBox(
          width: 50,
          height: 50,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned.fill(
                child: Material(
                  color: p.surface,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: p.border)),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: onPressed,
                    child: Icon(icon, size: 22, color: onPressed == null ? p.textFaint : p.text),
                  ),
                ),
              ),
              if (badge != null && badge! > 0)
                Positioned(
                  top: -4,
                  right: -4,
                  child: Container(
                    constraints: const BoxConstraints(minWidth: 18),
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(color: p.accent, borderRadius: BorderRadius.circular(999), border: Border.all(color: p.raised, width: 2)),
                    child: Text(
                      '${badge!}',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: p.onAccent, fontFeatures: tabularFigures),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
