import 'dart:io';

import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../core/network/api_client.dart';
import '../../core/providers.dart';
import '../../core/widgets/common.dart';
import '../offline/background.dart';
import '../results/run_controller.dart';
import '../voice/voice_note_button.dart';
import 'cuisine_picker.dart';
import 'home_controller.dart';

/// "Yeni Öneri": cuisine + free text + up to 5 menu photos → streaming cards.
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
    final skipped = await ref.read(homeDraftProvider.notifier).addImages(files.map((f) => f.path).toList());
    if (skipped > 0 && mounted) showMessage(context, context.l10n.maxPhotos(maxPhotos));
  }

  Future<void> _addFromCamera() async {
    final remaining = maxPhotos - ref.read(homeDraftProvider).images.length;
    if (remaining <= 0) {
      showMessage(context, context.l10n.maxPhotos(maxPhotos));
      return;
    }
    final paths = await context.push<List<String>>('/camera', extra: remaining);
    if (paths == null || paths.isEmpty) return;
    await ref.read(homeDraftProvider.notifier).addImages(paths);
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
    final draft = ref.watch(homeDraftProvider);
    final cuisines = ref.watch(cuisinesProvider).value ?? const [];
    final selected = cuisines.firstWhereOrNull((c) => c.id == draft.cuisineId);
    final queued = ref.watch(queuedCountProvider).value ?? 0;
    ref.watch(queueFlusherProvider);
    final notifier = ref.read(homeDraftProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.newSuggestion),
        actions: [
          if (queued > 0)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Chip(avatar: const Icon(Icons.cloud_upload_outlined, size: 18), label: Text(l10n.pendingQueue(queued))),
            ),
        ],
      ),
      body: ListView(
        children: [
          const DisclaimerBanner(),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                OutlinedButton.icon(
                  key: const Key('cuisine-button'),
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52), alignment: Alignment.centerLeft),
                  onPressed: () async {
                    final cuisine = await pickCuisine(context);
                    if (cuisine != null) await notifier.selectCuisine(cuisine.id);
                  },
                  icon: const Icon(Icons.restaurant),
                  label: Text(selected == null ? l10n.selectCuisine : '${l10n.cuisine}: ${selected.name}'),
                ),
                const SizedBox(height: 16),
                TextField(
                  key: const Key('prompt-field'),
                  controller: _prompt,
                  minLines: 3,
                  maxLines: 8,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(labelText: l10n.promptLabel, hintText: l10n.promptHint, alignLabelWithHint: true),
                  onChanged: notifier.setPrompt,
                ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: VoiceNoteButton(
                    cuisineId: draft.cuisineId,
                    onText: (transcription) {
                      final addition = transcription.items.isNotEmpty ? transcription.items.join('\n') : transcription.text;
                      final current = _prompt.text.trimRight();
                      _prompt.text = current.isEmpty ? addition : '$current\n$addition';
                      notifier.setPrompt(_prompt.text);
                    },
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 4,
                  children: [
                    Text(l10n.photos, style: Theme.of(context).textTheme.titleSmall),
                    Text(l10n.photosCount(draft.images.length, maxPhotos), style: Theme.of(context).textTheme.bodySmall),
                    TextButton.icon(
                      onPressed: draft.compressing ? null : _addFromCamera,
                      icon: const Icon(Icons.photo_camera_outlined),
                      label: Text(l10n.takePhoto),
                    ),
                    TextButton.icon(
                      onPressed: draft.compressing ? null : _addFromGallery,
                      icon: const Icon(Icons.photo_library_outlined),
                      label: Text(l10n.pickFromGallery),
                    ),
                  ],
                ),
                if (draft.compressing) Padding(padding: const EdgeInsets.all(8), child: Text(l10n.compressing)),
                if (draft.images.isNotEmpty)
                  SizedBox(
                    height: 96,
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
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: draft.deepMode,
                  onChanged: notifier.setDeepMode,
                  title: Text(l10n.deepMode),
                ),
                const SizedBox(height: 8),
                FilledButton.icon(
                  key: const Key('suggest-button'),
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                  onPressed: draft.canSubmit ? _submit : null,
                  icon: const Icon(Icons.auto_awesome),
                  label: Text(l10n.suggestButton),
                ),
              ],
            ),
          ),
          const _RecentRuns(),
        ],
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
          child: Image.file(File(path), width: 80, height: 96, fit: BoxFit.cover, cacheWidth: 240),
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

final _recentRunsProvider = StreamProvider((ref) => ref.watch(appDatabaseProvider).watchRecentRuns());

class _RecentRuns extends ConsumerWidget {
  const _RecentRuns();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final runs = ref.watch(_recentRunsProvider).value ?? const [];
    final format = DateFormat('d MMM HH:mm', 'tr');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: SectionLabel(l10n.recentRuns)),
        if (runs.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Text(l10n.noRecentRuns)),
        for (final run in runs.take(10))
          ListTile(
            leading: Icon(run.status == 'completed' ? Icons.check_circle_outline : Icons.timelapse),
            title: Text(run.title.isEmpty ? run.cuisineName : run.title, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text('${run.cuisineName} · ${l10n.cardsReady(run.cardCount)} · ${format.format(run.createdAt)}'),
            onTap: () => context.push('/suggest/results?runId=${run.runId}'),
          ),
        const SizedBox(height: 24),
      ],
    );
  }
}
