import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../core/design/action_dock.dart';
import '../../core/design/components.dart';
import '../../core/design/skeleton.dart';
import '../../core/design/tokens.dart';
import '../../core/network/api_client.dart';
import '../../core/providers.dart';
import '../../core/utils/haptics.dart';
import '../../core/utils/image_compressor.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/photo_thumb.dart';
import '../offline/background.dart';
import '../results/analysis_controller.dart';
import '../voice/voice_note_button.dart';
import 'cuisine_picker.dart';
import 'home_controller.dart';

/// The single input screen: whatever you have about the restaurant's menu — panel screenshots, a menu photo, or
/// the products typed/dictated during the call — goes in here, and one button produces the three result sections.
/// The cuisine is optional: the Classifier reads it from the menu when it is left blank.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  late final TextEditingController _menuText = TextEditingController(text: ref.read(homeDraftProvider).menuText);
  late final TextEditingController _notes = TextEditingController(text: ref.read(homeDraftProvider).notes);

  /// The note field is rarely needed: it stays folded behind one line until asked for.
  late bool _showNotes = ref.read(homeDraftProvider).notes.isNotEmpty;

  @override
  void dispose() {
    _menuText.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _addFromGallery() async {
    final remaining = maxPhotos - ref.read(homeDraftProvider).images.length;
    if (remaining <= 0) {
      showMessage(context, context.l10n.maxPhotos(maxPhotos));
      return;
    }
    final files = await ImagePicker().pickMultiImage(limit: remaining, imageQuality: 100);
    if (files.isEmpty) return;
    _reportAdded(await ref.read(homeDraftProvider.notifier).addImages(files.map((f) => f.path).toList()));
  }

  Future<void> _addFromCamera() async {
    final remaining = maxPhotos - ref.read(homeDraftProvider).images.length;
    if (remaining <= 0) {
      showMessage(context, context.l10n.maxPhotos(maxPhotos));
      return;
    }
    final paths = await context.push<List<String>>('/camera', extra: remaining);
    if (paths == null || paths.isEmpty) return;
    _reportAdded(await ref.read(homeDraftProvider.notifier).addImages(paths));
  }

  void _reportAdded(AddImagesResult result) {
    if (!mounted) return;
    if (result.failed > 0) {
      Haptics.warn();
      showMessage(context, context.l10n.compressFailed);
    } else if (result.skipped > 0) {
      showMessage(context, context.l10n.maxPhotos(maxPhotos));
    } else {
      Haptics.select();
    }
  }

  Future<void> _pickCuisine() async {
    final cuisine = await pickCuisine(context);
    if (cuisine != null) await ref.read(homeDraftProvider.notifier).selectCuisine(cuisine.id);
  }

  Future<void> _submit() async {
    final draft = ref.read(homeDraftProvider);
    if (!draft.canSubmit) {
      showMessage(context, context.l10n.needInput);
      return;
    }
    final cuisines = ref.read(cuisinesProvider).value ?? const [];
    final cuisine = cuisines.firstWhereOrNull((c) => c.id == draft.cuisineId);
    final request = AnalyzeRequest(
      cuisineName: cuisine?.name ?? '',
      images: draft.images,
      data: AnalyzeRequestData(
        cuisineId: cuisine?.id ?? '',
        menuText: draft.menuText,
        notes: draft.notes,
        mode: draft.mode,
        debug: draft.debug,
        images: draft.images.map((i) => UploadImage(path: i.path, sha256: i.sha256)).toList(),
      ),
    );
    ref.read(homeDraftProvider.notifier).resetInputs();
    _menuText.clear();
    _notes.clear();
    await context.push('/suggest/results', extra: request);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final draft = ref.watch(homeDraftProvider);
    final cuisines = ref.watch(cuisinesProvider).value ?? const [];
    final selected = cuisines.firstWhereOrNull((c) => c.id == draft.cuisineId);
    final queued = ref.watch(queuedCountProvider).value ?? 0;
    ref.watch(queueFlusherProvider);
    final notifier = ref.read(homeDraftProvider.notifier);
    // Text can also arrive from outside the field (shared from another app).
    ref.listen(homeDraftProvider.select((d) => d.menuText), (_, next) {
      if (_menuText.text != next) _menuText.text = next;
    });

    return Scaffold(
      extendBody: true,
      appBar: AppBar(
        title: Text(l10n.newAnalysis),
        actions: [
          if (queued > 0)
            Padding(
              padding: const EdgeInsets.only(right: AppSpace.page),
              child: Pill(l10n.pendingQueue(queued), tone: Tone.amber, icon: Icons.cloud_upload_outlined),
            ),
        ],
      ),
      bottomNavigationBar: ActionDock(
        tools: [
          DockButton(
            key: const Key('photo-camera'),
            icon: Icons.photo_camera_outlined,
            tooltip: l10n.takePhoto,
            onPressed: draft.compressing ? null : _addFromCamera,
          ),
          DockButton(
            key: const Key('photo-gallery'),
            icon: Icons.photo_library_outlined,
            tooltip: l10n.pickFromGallery,
            badge: draft.images.length,
            onPressed: draft.compressing ? null : _addFromGallery,
          ),
          VoiceNoteButton(
            compact: true,
            cuisineId: draft.cuisineId,
            onText: (transcription) {
              final addition = transcription.items.isNotEmpty ? transcription.items.join(', ') : transcription.text;
              final current = _menuText.text.trimRight();
              _menuText.text = current.isEmpty ? addition : '$current, $addition';
              notifier.setMenuText(_menuText.text);
            },
          ),
        ],
        primary: FilledButton(
          key: const Key('analyze-button'),
          onPressed: draft.canSubmit ? _submit : null,
          child: Text(l10n.analyzeButton),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpace.page, AppSpace.lg, AppSpace.page, ActionDock.reservedHeight + AppSpace.lg),
        children: [
          FieldRow(
            key: const Key('cuisine-button'),
            icon: Icons.restaurant_menu_rounded,
            label: l10n.cuisine,
            value: selected?.name ?? l10n.cuisineAuto,
            placeholder: selected == null,
            onTap: _pickCuisine,
          ),
          const SizedBox(height: AppSpace.md),
          // The heart of the screen: what the restaurant already sells. Works with no photo and no AI key.
          TextField(
            key: const Key('menu-text-field'),
            controller: _menuText,
            minLines: 4,
            maxLines: 10,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: l10n.menuTextLabel,
              hintText: l10n.menuTextHint,
              alignLabelWithHint: true,
            ),
            onChanged: notifier.setMenuText,
          ),
          if (draft.compressing || draft.images.isNotEmpty) ...[
            Eyebrow(l10n.screenshots, padding: const EdgeInsets.only(top: 20, bottom: 6)),
            SizedBox(
              height: 120,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: draft.images.length + (draft.compressing ? 1 : 0),
                separatorBuilder: (_, _) => const SizedBox(width: AppSpace.sm),
                itemBuilder: (context, index) => index >= draft.images.length
                    ? const Shimmer(child: SkeletonBox(width: 64, height: 120, radius: 10))
                    : PhotoThumb(
                        path: draft.images[index].path,
                        width: 64,
                        height: 120,
                        onDelete: () => notifier.removeImage(index),
                      ),
              ),
            ),
          ] else
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(l10n.screenshotsHint, style: Theme.of(context).textTheme.bodySmall),
            ),
          Eyebrow(l10n.modeTitle, padding: const EdgeInsets.only(top: 20, bottom: 6)),
          _ModeChoice(
            key: const Key('mode-quick'),
            title: l10n.modeQuickTitle,
            hint: l10n.modeQuickHint,
            icon: Icons.bolt_rounded,
            selected: draft.mode == AnalysisMode.quick,
            onTap: () => notifier.setMode(AnalysisMode.quick),
          ),
          const SizedBox(height: AppSpace.sm),
          _ModeChoice(
            key: const Key('mode-full'),
            title: l10n.modeFullTitle,
            hint: l10n.modeFullHint,
            icon: Icons.all_inclusive_rounded,
            selected: draft.mode == AnalysisMode.full,
            onTap: () => notifier.setMode(AnalysisMode.full),
          ),
          const SizedBox(height: AppSpace.md),
          if (_showNotes)
            TextField(
              key: const Key('notes-field'),
              controller: _notes,
              minLines: 1,
              maxLines: 4,
              decoration: InputDecoration(labelText: l10n.extraNotes, hintText: l10n.extraNotesHint),
              onChanged: notifier.setNotes,
            )
          else
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                key: const Key('notes-toggle'),
                onPressed: () => setState(() => _showNotes = true),
                icon: const Icon(Icons.add_rounded),
                label: Text(l10n.notesToggle),
                style: TextButton.styleFrom(minimumSize: const Size(0, 48)),
              ),
            ),
          const _RecentRuns(),
        ],
      ),
    );
  }
}

/// One of the two ways to run the analysis. Two boxes, one of them always ticked: the expert picks between
/// "bir iki öneri yeter" and "menüyü açılışa hazır hale getir" before the call, not in a settings screen.
class _ModeChoice extends StatelessWidget {
  const _ModeChoice({
    required this.title,
    required this.hint,
    required this.icon,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final String title;
  final String hint;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    return Semantics(
      checked: selected,
      button: true,
      child: AppCard(
        margin: EdgeInsets.zero,
        padding: const EdgeInsets.fromLTRB(12, 12, AppSpace.lg, 12),
        borderColor: selected ? p.accent : null,
        onTap: () {
          if (!selected) Haptics.select();
          onTap();
        },
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              selected ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded,
              size: 22,
              color: selected ? p.accentText : p.textFaint,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(icon, size: 16, color: selected ? p.accentText : p.textMuted),
                      const SizedBox(width: 6),
                      Expanded(child: Text(title, style: text.titleSmall)),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(hint, style: text.bodySmall?.copyWith(color: p.textMuted)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

final _recentRunsProvider = StreamProvider((ref) => ref.watch(appDatabaseProvider).watchRecentRuns());

/// Analyses kept on the phone: the call dropped, the phone locked, a second restaurant came in between — one tap
/// reopens the result (from the server, or from the saved copy when offline).
class _RecentRuns extends ConsumerWidget {
  const _RecentRuns();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final runs = ref.watch(_recentRunsProvider).value ?? const [];
    final format = DateFormat('d MMM HH:mm', 'tr');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Eyebrow(
          l10n.recentRuns,
          padding: const EdgeInsets.only(top: 24, bottom: 8),
          trailing: runs.isEmpty
              ? null
              : TextButton(
                  key: const Key('history-open'),
                  onPressed: () => context.push('/suggest/history'),
                  child: Text(l10n.seeAllRuns),
                ),
        ),
        if (runs.isEmpty)
          Text(l10n.noRecentRuns, style: text.bodySmall)
        else
          SurfaceGroup(
            margin: EdgeInsets.zero,
            children: [
              for (final run in runs.take(5))
                ListTile(
                  key: ValueKey('recent-${run.runId}'),
                  title: Text(
                    run.title.isEmpty ? l10n.photoRunTitle : run.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: text.titleSmall,
                  ),
                  subtitle: Text(
                    [if (run.cuisineName.isNotEmpty) run.cuisineName, format.format(run.createdAt)].join(' · '),
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('${run.cardCount}', style: text.titleMedium?.copyWith(fontFeatures: tabularFigures)),
                      const SizedBox(width: 4),
                      Text(l10n.cardsUnit, style: text.bodySmall),
                      const SizedBox(width: 6),
                      Icon(
                        run.status == 'completed' ? Icons.check_circle_rounded : Icons.timelapse_rounded,
                        size: 16,
                        color: run.status == 'completed' ? p.success : p.amber,
                      ),
                    ],
                  ),
                  onTap: () => context.push('/suggest/results?runId=${run.runId}'),
                ),
            ],
          ),
      ],
    );
  }
}
