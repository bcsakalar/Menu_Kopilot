import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../core/widgets/common.dart';
import '../../data/models/branch.dart';
import '../branches/branch_form.dart';
import '../branches/branch_providers.dart';
import '../voice/voice_note_button.dart';
import 'gap_controller.dart';

/// "Menü Tamamlama" (Mod 2): pick the branch, add platform panel screenshots → gap analysis with a call checklist.
class GapScreen extends ConsumerStatefulWidget {
  const GapScreen({super.key});

  @override
  ConsumerState<GapScreen> createState() => _GapScreenState();
}

class _GapScreenState extends ConsumerState<GapScreen> {
  late final TextEditingController _notes = TextEditingController(text: ref.read(gapDraftProvider).notes);

  @override
  void dispose() {
    _notes.dispose();
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
    final skipped = await ref.read(gapDraftProvider.notifier).addImages(files.map((f) => f.path).toList());
    if (skipped > 0 && mounted) showMessage(context, context.l10n.maxPhotos(maxScreenshots));
  }

  Future<void> _addFromCamera() async {
    final remaining = maxScreenshots - ref.read(gapDraftProvider).images.length;
    if (remaining <= 0) {
      showMessage(context, context.l10n.maxPhotos(maxScreenshots));
      return;
    }
    final paths = await context.push<List<String>>('/camera', extra: remaining);
    if (paths == null || paths.isEmpty) return;
    await ref.read(gapDraftProvider.notifier).addImages(paths);
  }

  Future<void> _pickBranch() async {
    final picked = await showModalBottomSheet<Branch>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _BranchSheet(),
    );
    if (picked != null) await ref.read(selectedBranchIdProvider.notifier).select(picked.id);
  }

  Future<void> _analyze(Branch? branch) async {
    final draft = ref.read(gapDraftProvider);
    if (branch == null || draft.images.isEmpty || draft.compressing) {
      showMessage(context, context.l10n.needScreenshot);
      return;
    }
    final request = GapRequest(branch: branch, images: draft.images, notes: draft.notes);
    ref.read(gapDraftProvider.notifier).reset();
    _notes.clear();
    await context.push('/gap/result', extra: request);
    ref.invalidate(branchesProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final draft = ref.watch(gapDraftProvider);
    final branch = ref.watch(selectedBranchProvider);
    final notifier = ref.read(gapDraftProvider.notifier);
    final canAnalyze = branch != null && draft.images.isNotEmpty && !draft.compressing;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.gapTitle)),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(branchesProvider),
        child: ListView(
          children: [
            const DisclaimerBanner(),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  OutlinedButton.icon(
                    key: const Key('gap-branch-button'),
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52), alignment: Alignment.centerLeft),
                    onPressed: _pickBranch,
                    icon: const Icon(Icons.storefront_outlined),
                    label: Text(branch == null ? l10n.selectBranch : '${l10n.branch}: ${branch.name} · ${branch.cuisineName}'),
                  ),
                  if (branch != null) _BranchSummary(branch: branch),
                  const SizedBox(height: 16),
                  Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 4,
                    children: [
                      Text(l10n.screenshots, style: Theme.of(context).textTheme.titleSmall),
                      Text(l10n.photosCount(draft.images.length, maxScreenshots), style: Theme.of(context).textTheme.bodySmall),
                      TextButton.icon(
                        onPressed: draft.compressing ? null : _addFromGallery,
                        icon: const Icon(Icons.photo_library_outlined),
                        label: Text(l10n.pickFromGallery),
                      ),
                      TextButton.icon(
                        onPressed: draft.compressing ? null : _addFromCamera,
                        icon: const Icon(Icons.photo_camera_outlined),
                        label: Text(l10n.takePhoto),
                      ),
                    ],
                  ),
                  Text(l10n.screenshotsHint, style: Theme.of(context).textTheme.bodySmall),
                  if (draft.compressing) Padding(padding: const EdgeInsets.all(8), child: Text(l10n.compressing)),
                  if (draft.images.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    SizedBox(
                      height: 120,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: draft.images.length,
                        separatorBuilder: (_, _) => const SizedBox(width: 8),
                        itemBuilder: (context, index) => _Thumb(
                          path: draft.images[index].path,
                          onDelete: () => notifier.removeImage(index),
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  TextField(
                    controller: _notes,
                    minLines: 1,
                    maxLines: 4,
                    decoration: InputDecoration(labelText: l10n.extraNotes, hintText: l10n.extraNotesHint),
                    onChanged: notifier.setNotes,
                  ),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: VoiceNoteButton(
                      cuisineId: branch?.cuisineId,
                      onText: (transcription) {
                        final current = _notes.text.trimRight();
                        _notes.text = current.isEmpty ? transcription.text : '$current ${transcription.text}';
                        notifier.setNotes(_notes.text);
                      },
                    ),
                  ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    key: const Key('gap-analyze-button'),
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                    onPressed: canAnalyze ? () => _analyze(branch) : null,
                    icon: const Icon(Icons.fact_check_outlined),
                    label: Text(l10n.analyzeButton),
                  ),
                ],
              ),
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
    return Card(
      margin: const EdgeInsets.only(top: 12),
      child: ListTile(
        title: Text(l10n.countsLabel(branch.currentItemCount, branch.effectiveTarget)),
        subtitle: Text(
          lastGap == null ? l10n.noAnalysisYet : l10n.lastAnalysis(DateFormat('d MMM HH:mm', 'tr').format(lastGap.toLocal())),
        ),
        trailing: lastGap == null
            ? null
            : TextButton(
                onPressed: () => context.push('/gap/result', extra: branch),
                child: Text(l10n.openLastAnalysis),
              ),
      ),
    );
  }
}

class _BranchSheet extends ConsumerWidget {
  const _BranchSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final branches = ref.watch(branchesProvider);
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.7,
      child: branches.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => EmptyState(
          icon: Icons.cloud_off,
          message: l10n.networkError,
          action: FilledButton(onPressed: () => ref.invalidate(branchesProvider), child: Text(l10n.retry)),
        ),
        data: (list) => ListView(
          children: [
            ListTile(
              key: const Key('new-branch-tile'),
              leading: const Icon(Icons.add_business_outlined),
              title: Text(l10n.newBranch),
              onTap: () async {
                final created = await openBranchForm(context);
                if (created != null && context.mounted) Navigator.pop(context, created);
              },
            ),
            const Divider(),
            if (list.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Text(l10n.noBranches)),
            for (final branch in list)
              ListTile(
                leading: const Icon(Icons.storefront_outlined),
                title: Text(branch.name),
                subtitle: Text('${branch.cuisineName} · ${l10n.countsLabel(branch.currentItemCount, branch.effectiveTarget)}'),
                onTap: () => Navigator.pop(context, branch),
              ),
          ],
        ),
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.path, required this.onDelete});

  final String path;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.file(File(path), width: 64, height: 120, fit: BoxFit.cover, cacheWidth: 200),
        ),
        Positioned(
          top: 2,
          right: 2,
          child: InkWell(
            onTap: onDelete,
            child: const CircleAvatar(radius: 12, backgroundColor: Colors.black54, child: Icon(Icons.close, size: 14, color: Colors.white)),
          ),
        ),
      ],
    );
  }
}
