import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../core/design/action_dock.dart';
import '../../core/design/components.dart';
import '../../core/design/count_meter.dart';
import '../../core/design/skeleton.dart';
import '../../core/design/tokens.dart';
import '../../core/utils/haptics.dart';
import '../../core/utils/image_compressor.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/photo_thumb.dart';
import '../../data/models/branch.dart';
import '../branches/branch_form.dart';
import '../branches/branch_providers.dart';
import '../voice/voice_note_button.dart';
import 'gap_controller.dart';

/// "Menü Tamamlama" (Mod 2): pick the branch, add platform panel screenshots and/or type the products on the menu →
/// gap analysis with a call checklist. Capture tools and "Eksikleri bul" live in the floating dock.
class GapScreen extends ConsumerStatefulWidget {
  const GapScreen({super.key});

  @override
  ConsumerState<GapScreen> createState() => _GapScreenState();
}

class _GapScreenState extends ConsumerState<GapScreen> {
  late final TextEditingController _notes = TextEditingController(text: ref.read(gapDraftProvider).notes);
  late final TextEditingController _menuText = TextEditingController(text: ref.read(gapDraftProvider).menuText);

  @override
  void dispose() {
    _notes.dispose();
    _menuText.dispose();
    super.dispose();
  }

  Future<void> _addFromGallery() async {
    final remaining = maxScreenshots - ref.read(gapDraftProvider).images.length;
    if (remaining <= 0) {
      showMessage(context, context.l10n.maxPhotos(maxScreenshots));
      return;
    }
    final files = await ImagePicker().pickMultiImage(limit: remaining, imageQuality: 100);
    if (files.isEmpty) return;
    _reportAdded(await ref.read(gapDraftProvider.notifier).addImages(files.map((f) => f.path).toList()));
  }

  Future<void> _addFromCamera() async {
    final remaining = maxScreenshots - ref.read(gapDraftProvider).images.length;
    if (remaining <= 0) {
      showMessage(context, context.l10n.maxPhotos(maxScreenshots));
      return;
    }
    final paths = await context.push<List<String>>('/camera', extra: remaining);
    if (paths == null || paths.isEmpty) return;
    _reportAdded(await ref.read(gapDraftProvider.notifier).addImages(paths));
  }

  void _reportAdded(AddImagesResult result) {
    if (!mounted) return;
    if (result.failed > 0) {
      Haptics.warn();
      showMessage(context, context.l10n.compressFailed);
    } else if (result.skipped > 0) {
      showMessage(context, context.l10n.maxPhotos(maxScreenshots));
    } else {
      Haptics.select();
    }
  }

  Future<void> _pickBranch() async {
    final picked = await showModalBottomSheet<Branch>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      builder: (_) => const _BranchSheet(),
    );
    if (picked != null) await ref.read(selectedBranchIdProvider.notifier).select(picked.id);
  }

  Future<void> _analyze(Branch? branch) async {
    final draft = ref.read(gapDraftProvider);
    if (branch == null || !draft.hasInput || draft.compressing) {
      showMessage(context, context.l10n.needScreenshot);
      return;
    }
    final request = GapRequest(branch: branch, images: draft.images, notes: draft.notes, menuText: draft.menuText);
    ref.read(gapDraftProvider.notifier).reset();
    _notes.clear();
    _menuText.clear();
    await context.push('/gap/result', extra: request);
    ref.invalidate(branchesProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final draft = ref.watch(gapDraftProvider);
    final branch = ref.watch(selectedBranchProvider);
    final notifier = ref.read(gapDraftProvider.notifier);
    // The product list can also arrive from outside the field (shared from another app).
    ref.listen(gapDraftProvider.select((d) => d.menuText), (_, next) {
      if (_menuText.text != next) _menuText.text = next;
    });
    final canAnalyze = branch != null && draft.hasInput && !draft.compressing;

    return Scaffold(
      extendBody: true,
      appBar: AppBar(title: Text(l10n.gapTitle)),
      bottomNavigationBar: ActionDock(
        tools: [
          DockButton(
            key: const Key('photo-gallery'),
            icon: Icons.photo_library_outlined,
            tooltip: l10n.pickFromGallery,
            badge: draft.images.length,
            onPressed: draft.compressing ? null : _addFromGallery,
          ),
          DockButton(key: const Key('photo-camera'), icon: Icons.photo_camera_outlined, tooltip: l10n.takePhoto, onPressed: draft.compressing ? null : _addFromCamera),
          VoiceNoteButton(
            compact: true,
            cuisineId: branch?.cuisineId,
            onText: (transcription) {
              final current = _menuText.text.trimRight();
              _menuText.text = current.isEmpty ? transcription.text : '$current, ${transcription.text}';
              notifier.setMenuText(_menuText.text);
            },
          ),
        ],
        primary: FilledButton(
          key: const Key('gap-analyze-button'),
          onPressed: canAnalyze ? () => _analyze(branch) : null,
          child: Text(l10n.analyzeButton),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(branchesProvider),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(AppSpace.page, AppSpace.lg, AppSpace.page, ActionDock.reservedHeight + AppSpace.lg),
          children: [
            FieldRow(
              key: const Key('gap-branch-button'),
              icon: Icons.storefront_outlined,
              label: l10n.branch,
              value: branch == null ? l10n.selectBranch : '${branch.name} · ${branch.cuisineName}',
              placeholder: branch == null,
              onTap: _pickBranch,
            ),
            if (branch != null) _BranchSummary(branch: branch),
            Eyebrow(l10n.screenshots, padding: const EdgeInsets.only(top: 20, bottom: 6)),
            Text(l10n.screenshotsHint, style: Theme.of(context).textTheme.bodySmall),
            if (draft.compressing || draft.images.isNotEmpty) ...[
              const SizedBox(height: AppSpace.sm),
              SizedBox(
                height: 120,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: draft.images.length + (draft.compressing ? 1 : 0),
                  separatorBuilder: (_, _) => const SizedBox(width: AppSpace.sm),
                  itemBuilder: (context, index) => index >= draft.images.length
                      ? const Shimmer(child: SkeletonBox(width: 64, height: 120, radius: 10))
                      : PhotoThumb(path: draft.images[index].path, width: 64, height: 120, onDelete: () => notifier.removeImage(index)),
                ),
              ),
            ],
            Eyebrow(l10n.menuTextEyebrow, padding: const EdgeInsets.only(top: 20, bottom: 8)),
            // During a call: type or dictate what the restaurant already sells — works without screenshots and AI.
            TextField(
              key: const Key('gap-menu-text'),
              controller: _menuText,
              minLines: 3,
              maxLines: 8,
              decoration: InputDecoration(labelText: l10n.menuTextLabel, hintText: l10n.menuTextHint, alignLabelWithHint: true),
              onChanged: notifier.setMenuText,
            ),
            const SizedBox(height: AppSpace.md),
            TextField(
              controller: _notes,
              minLines: 1,
              maxLines: 4,
              decoration: InputDecoration(labelText: l10n.extraNotes, hintText: l10n.extraNotesHint),
              onChanged: notifier.setNotes,
            ),
          ],
        ),
      ),
    );
  }
}

class _BranchSummary extends StatelessWidget {
  const _BranchSummary({required this.branch});

  final Branch branch;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final lastGap = branch.lastGapAt;
    return AppCard(
      margin: const EdgeInsets.only(top: AppSpace.md),
      padding: const EdgeInsets.fromLTRB(AppSpace.lg, 14, AppSpace.sm, 12),
      child: Row(
        children: [
          Expanded(
            child: CountMeter(
              compact: true,
              current: branch.currentItemCount,
              target: branch.effectiveTarget,
              unit: l10n.productsUnit,
              caption: lastGap == null
                  ? l10n.noAnalysisYet
                  : l10n.lastAnalysis(DateFormat('d MMM HH:mm', 'tr').format(lastGap.toLocal())),
            ),
          ),
          if (lastGap != null)
            TextButton(
              onPressed: () => context.push('/gap/result', extra: branch),
              child: Text(l10n.openLastAnalysis),
            ),
        ],
      ),
    );
  }
}

class _BranchSheet extends ConsumerWidget {
  const _BranchSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final p = context.palette;
    final branches = ref.watch(branchesProvider);
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.7,
      child: branches.when(
        loading: () => const SkeletonList(rows: 4),
        error: (e, _) => EmptyState(
          icon: Icons.cloud_off_rounded,
          message: l10n.networkError,
          action: FilledButton(onPressed: () => ref.invalidate(branchesProvider), child: Text(l10n.retry)),
        ),
        data: (list) => ListView(
          children: [
            ListTile(
              key: const Key('new-branch-tile'),
              leading: Icon(Icons.add_rounded, color: p.accentText),
              title: Text(l10n.newBranch, style: TextStyle(color: p.accentText, fontWeight: FontWeight.w700)),
              onTap: () async {
                final created = await openBranchForm(context);
                if (created != null && context.mounted) Navigator.pop(context, created);
              },
            ),
            const Divider(),
            if (list.isEmpty) Padding(padding: const EdgeInsets.all(AppSpace.page), child: Text(l10n.noBranches)),
            for (final branch in list)
              ListTile(
                leading: const Icon(Icons.storefront_outlined),
                title: Text(branch.name),
                subtitle: Text(branch.cuisineName),
                trailing: Text(
                  '${branch.currentItemCount} / ${branch.effectiveTarget}',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(fontFeatures: tabularFigures),
                ),
                onTap: () => Navigator.pop(context, branch),
              ),
          ],
        ),
      ),
    );
  }
}
