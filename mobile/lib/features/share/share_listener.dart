import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/design/tokens.dart';
import '../../core/utils/image_compressor.dart';
import '../../core/widgets/common.dart';
import '../home/home_controller.dart';
import 'share_intake.dart';

/// Where a share goes. There is only one analysis screen now, so the question is just "photos or text?" —
/// the pipeline works out by itself whether a picture is a menu photo or a panel screenshot.
enum ShareTarget { photos, text }

/// Receives what other apps share ("Paylaş → Menü Kopilot") and drops it into the analysis screen. Lives in the
/// signed-in shell, so a share that opened the app waits until login.
class ShareIntakeListener extends ConsumerStatefulWidget {
  const ShareIntakeListener({required this.child, super.key});

  final Widget child;

  @override
  ConsumerState<ShareIntakeListener> createState() => _ShareIntakeListenerState();
}

class _ShareIntakeListenerState extends ConsumerState<ShareIntakeListener> {
  StreamSubscription<SharedIntake>? _subscription;
  final List<SharedIntake> _pending = [];
  bool _asking = false;

  @override
  void initState() {
    super.initState();
    final source = ref.read(shareSourceProvider);
    _subscription = source.updates().listen(_enqueue);
    unawaited(source.initial().then((intake) async {
      if (intake == null) return;
      await source.consumed();
      _enqueue(intake);
    }));
  }

  @override
  void dispose() {
    unawaited(_subscription?.cancel());
    super.dispose();
  }

  void _enqueue(SharedIntake intake) {
    _pending.add(intake);
    WidgetsBinding.instance.addPostFrameCallback((_) => _askNext());
  }

  Future<void> _askNext() async {
    if (_asking || _pending.isEmpty || !mounted) return;
    _asking = true;
    final intake = _pending.removeAt(0);
    try {
      final target = await showModalBottomSheet<ShareTarget>(
        context: context,
        useRootNavigator: true,
        // Floating panel: the sheet itself is transparent, the panel draws its own rounded surface.
        backgroundColor: Colors.transparent,
        shape: const RoundedRectangleBorder(),
        showDragHandle: false,
        builder: (_) => ShareTargetSheet(intake: intake),
      );
      if (target != null && mounted) await _apply(intake, target);
    } finally {
      _asking = false;
    }
    if (_pending.isNotEmpty) unawaited(_askNext());
  }

  Future<void> _apply(SharedIntake intake, ShareTarget target) async {
    final l10n = context.l10n;
    context.go('/suggest');
    switch (target) {
      case ShareTarget.photos:
        final result = await ref.read(homeDraftProvider.notifier).addImages(intake.imagePaths);
        if (!mounted) return;
        if (result.failed > 0) {
          showMessage(context, l10n.compressFailed);
        } else if (result.skipped > 0) {
          showMessage(context, l10n.maxPhotos(maxPhotos));
        }
      case ShareTarget.text:
        final draft = ref.read(homeDraftProvider);
        final current = draft.menuText.trimRight();
        ref.read(homeDraftProvider.notifier).setMenuText(current.isEmpty ? intake.text : '$current\n${intake.text}');
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

class ShareTargetSheet extends StatelessWidget {
  const ShareTargetSheet({required this.intake, super.key});

  final SharedIntake intake;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final photos = intake.imagePaths.length;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        child: Material(
          color: p.raised,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.sheet), side: BorderSide(color: p.border)),
          clipBehavior: Clip.antiAlias,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l10n.shareWhereTo, style: text.labelSmall),
                    const SizedBox(height: 4),
                    Text(
                      [
                        if (photos > 0) l10n.sharedPhotos(photos),
                        if (intake.text.trim().isNotEmpty) l10n.sharedText,
                      ].join(' · '),
                      style: text.titleLarge,
                    ),
                  ],
                ),
              ),
              if (photos > 0)
                _ShareOption(
                  key: const Key('share-photos'),
                  icon: Icons.playlist_add_rounded,
                  title: l10n.shareAsMenuPhotos,
                  subtitle: l10n.shareAsMenuPhotosHint,
                  onTap: () => Navigator.pop(context, ShareTarget.photos),
                ),
              if (intake.text.trim().isNotEmpty) ...[
                Container(
                  margin: const EdgeInsets.fromLTRB(20, 6, 20, 6),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: p.surface, borderRadius: BorderRadius.circular(AppRadius.control), border: Border.all(color: p.border)),
                  child: Text(intake.text.trim(), maxLines: 3, overflow: TextOverflow.ellipsis, style: text.bodySmall),
                ),
                _ShareOption(
                  key: const Key('share-text'),
                  icon: Icons.notes_rounded,
                  title: l10n.shareAsProductList,
                  onTap: () => Navigator.pop(context, ShareTarget.text),
                ),
              ],
              const SizedBox(height: 10),
            ],
          ),
        ),
      ),
    );
  }
}

class _ShareOption extends StatelessWidget {
  const _ShareOption({required this.icon, required this.title, required this.onTap, super.key, this.subtitle});

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: p.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: p.border)),
              child: Icon(icon, color: p.accentText),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: text.titleSmall),
                  if (subtitle != null) Text(subtitle!, style: text.bodySmall),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: p.textFaint),
          ],
        ),
      ),
    );
  }
}
