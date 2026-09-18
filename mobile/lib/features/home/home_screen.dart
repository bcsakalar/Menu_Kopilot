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
import '../results/run_controller.dart';
import '../voice/voice_note_button.dart';
import 'cuisine_picker.dart';
import 'home_controller.dart';

/// "Yeni öneri": cuisine + product names and/or up to 5 menu photos → streaming cards. Capture tools and "Öner" sit
/// in the floating dock at the bottom.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  late final TextEditingController _prompt = TextEditingController(text: ref.read(homeDraftProvider).prompt);

  @override
  void dispose() {
    _prompt.dispose();
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
    final cuisines = ref.read(cuisinesProvider).value ?? const [];
    final cuisine = cuisines.firstWhereOrNull((c) => c.id == draft.cuisineId);
    if (!draft.canSubmit || cuisine == null) {
      showMessage(context, context.l10n.needInput);
      return;
    }
    final request = RunRequest(
      cuisineName: cuisine.name,
      images: draft.images,
      data: SuggestRequestData(
        cuisineId: cuisine.id,
        promptText: draft.prompt,
        deepMode: draft.deepMode,
        images: draft.images.map((i) => UploadImage(path: i.path, sha256: i.sha256)).toList(),
      ),
    );
    ref.read(homeDraftProvider.notifier).resetInputs();
    _prompt.clear();
    await context.push('/suggest/results', extra: request);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final draft = ref.watch(homeDraftProvider);
    final cuisines = ref.watch(cuisinesProvider).value ?? const [];
    final selected = cuisines.firstWhereOrNull((c) => c.id == draft.cuisineId);
    final queued = ref.watch(queuedCountProvider).value ?? 0;
    ref.watch(queueFlusherProvider);
    final notifier = ref.read(homeDraftProvider.notifier);
    // Text can also arrive from outside the field (shared from another app).
    ref.listen(homeDraftProvider.select((d) => d.prompt), (_, next) {
      if (_prompt.text != next) _prompt.text = next;
    });

    return Scaffold(
      extendBody: true,
      appBar: AppBar(
        title: Text(l10n.newSuggestion),
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
          DockButton(key: const Key('photo-camera'), icon: Icons.photo_camera_outlined, tooltip: l10n.takePhoto, onPressed: draft.compressing ? null : _addFromCamera),
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
              final addition = transcription.items.isNotEmpty ? transcription.items.join('\n') : transcription.text;
              final current = _prompt.text.trimRight();
              _prompt.text = current.isEmpty ? addition : '$current\n$addition';
              notifier.setPrompt(_prompt.text);
            },
          ),
        ],
        primary: FilledButton(
          key: const Key('suggest-button'),
          onPressed: draft.canSubmit ? _submit : null,
          child: Text(l10n.suggestButton),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpace.page, AppSpace.lg, AppSpace.page, ActionDock.reservedHeight + AppSpace.lg),
        children: [
          FieldRow(
            key: const Key('cuisine-button'),
            icon: Icons.restaurant_menu_rounded,
            label: l10n.cuisine,
            value: selected?.name ?? l10n.selectCuisine,
            placeholder: selected == null,
            onTap: _pickCuisine,
          ),
          const SizedBox(height: AppSpace.md),
          TextField(
            key: const Key('prompt-field'),
            controller: _prompt,
            minLines: 4,
            maxLines: 10,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(labelText: l10n.promptLabel, hintText: l10n.promptHint, alignLabelWithHint: true),
            onChanged: notifier.setPrompt,
          ),
          if (draft.compressing || draft.images.isNotEmpty) ...[
            Eyebrow(l10n.photosCount(draft.images.length, maxPhotos), padding: const EdgeInsets.only(top: 20, bottom: 8)),
            SizedBox(
              height: 96,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: draft.images.length + (draft.compressing ? 1 : 0),
                separatorBuilder: (_, _) => const SizedBox(width: AppSpace.sm),
                itemBuilder: (context, index) => index >= draft.images.length
                    ? const Shimmer(child: SkeletonBox(width: 80, height: 96, radius: 10))
                    : PhotoThumb(path: draft.images[index].path, onDelete: () => notifier.removeImage(index)),
              ),
            ),
          ],
          const SizedBox(height: AppSpace.md),
          Material(
            color: p.surface,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control), side: BorderSide(color: p.border)),
            clipBehavior: Clip.antiAlias,
            child: SwitchListTile(
              value: draft.deepMode,
              onChanged: notifier.setDeepMode,
              title: Text(l10n.deepModeTitle, style: text.titleSmall),
              subtitle: Text(l10n.deepModeHint, style: text.bodySmall),
            ),
          ),
          const _RecentRuns(),
        ],
      ),
    );
  }
}

final _recentRunsProvider = StreamProvider((ref) => ref.watch(appDatabaseProvider).watchRecentRuns());

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
        Eyebrow(l10n.recentRuns, padding: const EdgeInsets.only(top: 24, bottom: 8)),
        if (runs.isEmpty)
          Text(l10n.noRecentRuns, style: text.bodySmall)
        else
          SurfaceGroup(
            margin: EdgeInsets.zero,
            children: [
              for (final run in runs.take(10))
                ListTile(
                  title: Text(
                    run.title.isEmpty ? l10n.photoRunTitle : run.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: text.titleSmall,
                  ),
                  subtitle: Text('${run.cuisineName} · ${format.format(run.createdAt)}'),
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
