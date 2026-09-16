import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/utils/image_compressor.dart';
import '../../core/widgets/common.dart';
import '../gap/gap_controller.dart';
import '../home/home_controller.dart';
import 'share_intake.dart';

enum ShareTarget { suggestPhotos, gapScreenshots, suggestText, gapText }

/// Receives what other apps share ("Paylaş → Menü Kopilot") and asks where it goes: menu photos / a product list to
/// "Öneri", panel screenshots / the products on the menu to "Tamamla". Lives in the signed-in shell, so a share that
/// opened the app waits until login.
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
        showDragHandle: true,
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
    String append(String current, String addition, String separator) {
      final trimmed = current.trimRight();
      return trimmed.isEmpty ? addition : '$trimmed$separator$addition';
    }

    void report(AddImagesResult result, int limit) {
      if (!mounted) return;
      if (result.failed > 0) {
        showMessage(context, l10n.compressFailed);
      } else if (result.skipped > 0) {
        showMessage(context, l10n.maxPhotos(limit));
      }
    }

    switch (target) {
      case ShareTarget.suggestPhotos:
        context.go('/suggest');
        report(await ref.read(homeDraftProvider.notifier).addImages(intake.imagePaths), maxPhotos);
      case ShareTarget.gapScreenshots:
        context.go('/gap');
        report(await ref.read(gapDraftProvider.notifier).addImages(intake.imagePaths), maxScreenshots);
      case ShareTarget.suggestText:
        context.go('/suggest');
        final draft = ref.read(homeDraftProvider);
        ref.read(homeDraftProvider.notifier).setPrompt(append(draft.prompt, intake.text, '\n'));
      case ShareTarget.gapText:
        context.go('/gap');
        final draft = ref.read(gapDraftProvider);
        ref.read(gapDraftProvider.notifier).setMenuText(append(draft.menuText, intake.text, '\n'));
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
    final theme = Theme.of(context);
    final photos = intake.imagePaths.length;
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text(
              [
                if (photos > 0) l10n.sharedPhotos(photos),
                if (intake.text.trim().isNotEmpty) l10n.sharedText,
              ].join(' · '),
              style: theme.textTheme.titleMedium,
            ),
          ),
          if (photos > 0) ...[
            ListTile(
              key: const Key('share-suggest-photos'),
              leading: const Icon(Icons.auto_awesome_outlined),
              title: Text(l10n.shareAsMenuPhotos),
              subtitle: Text(l10n.shareAsMenuPhotosHint),
              onTap: () => Navigator.pop(context, ShareTarget.suggestPhotos),
            ),
            ListTile(
              key: const Key('share-gap-screenshots'),
              leading: const Icon(Icons.fact_check_outlined),
              title: Text(l10n.shareAsScreenshots),
              subtitle: Text(l10n.shareAsScreenshotsHint),
              onTap: () => Navigator.pop(context, ShareTarget.gapScreenshots),
            ),
          ],
          if (intake.text.trim().isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 4),
              child: Text(
                intake.text.trim(),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall,
              ),
            ),
            ListTile(
              key: const Key('share-suggest-text'),
              leading: const Icon(Icons.auto_awesome_outlined),
              title: Text(l10n.shareAsProductList),
              onTap: () => Navigator.pop(context, ShareTarget.suggestText),
            ),
            ListTile(
              key: const Key('share-gap-text'),
              leading: const Icon(Icons.fact_check_outlined),
              title: Text(l10n.shareAsMenuText),
              onTap: () => Navigator.pop(context, ShareTarget.gapText),
            ),
          ],
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
