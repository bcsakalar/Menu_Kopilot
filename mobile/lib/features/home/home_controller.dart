import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/network/api_client.dart';
import '../../core/providers.dart';
import '../../core/utils/image_compressor.dart';

const int maxPhotos = 5;

class HomeDraft {
  const HomeDraft({
    this.cuisineId,
    this.menuText = '',
    this.notes = '',
    this.mode = AnalysisMode.full,
    this.images = const [],
    this.debug = false,
    this.compressing = false,
  });

  /// Optional: the Classifier fills it from the menu when nothing is chosen.
  final String? cuisineId;

  /// Products the restaurant already sells, typed or dictated.
  final String menuText;
  final String notes;

  /// "Öneri versen yeter" or "hakikaten işimizi yapalım" — how much the run is asked to do.
  final AnalysisMode mode;
  final List<PickedImage> images;

  /// Keep the agent payloads for the hidden pipeline screen.
  final bool debug;
  final bool compressing;

  bool get canSubmit => !compressing && (menuText.trim().isNotEmpty || images.isNotEmpty);

  HomeDraft copyWith({
    String? cuisineId,
    String? menuText,
    String? notes,
    AnalysisMode? mode,
    List<PickedImage>? images,
    bool? debug,
    bool? compressing,
  }) =>
      HomeDraft(
        cuisineId: cuisineId ?? this.cuisineId,
        menuText: menuText ?? this.menuText,
        notes: notes ?? this.notes,
        mode: mode ?? this.mode,
        images: images ?? this.images,
        debug: debug ?? this.debug,
        compressing: compressing ?? this.compressing,
      );
}

typedef ImageCompressor = Future<PickedImage> Function(String sourcePath);

/// Compression is injectable so widget tests do not need the native plugin.
final imageCompressorProvider = Provider<ImageCompressor>((ref) {
  return (sourcePath) async {
    final temp = await getTemporaryDirectory();
    return compressForUpload(sourcePath, Directory(p.join(temp.path, 'uploads')));
  };
});

class HomeDraftController extends Notifier<HomeDraft> {
  @override
  HomeDraft build() => const HomeDraft();

  Future<void> selectCuisine(String cuisineId) async {
    state = state.copyWith(cuisineId: cuisineId);
    await ref.read(recentCuisinesProvider.notifier).touch(cuisineId);
  }

  void setMenuText(String value) => state = state.copyWith(menuText: value);

  void setNotes(String value) => state = state.copyWith(notes: value);

  void setDebug(bool value) => state = state.copyWith(debug: value);

  void setMode(AnalysisMode value) => state = state.copyWith(mode: value);

  /// Adds photos up to the limit and reports how many were over it or could not be read.
  Future<AddImagesResult> addImages(List<String> paths) async {
    final free = maxPhotos - state.images.length;
    final accepted = paths.take(free < 0 ? 0 : free).toList();
    if (accepted.isEmpty) return (skipped: paths.length, failed: 0);
    state = state.copyWith(compressing: true);
    final compress = ref.read(imageCompressorProvider);
    final images = [...state.images];
    var failed = 0;
    try {
      for (final path in accepted) {
        try {
          final image = await compress(path);
          if (images.every((i) => i.sha256 != image.sha256)) images.add(image);
        } on Object catch (_) {
          // One unreadable photo (unsupported format, broken file) must not drop the others.
          failed += 1;
        }
      }
    } finally {
      state = state.copyWith(images: images, compressing: false);
    }
    return (skipped: paths.length - accepted.length, failed: failed);
  }

  void removeImage(int index) {
    final images = [...state.images]..removeAt(index);
    state = state.copyWith(images: images);
  }

  // The mode is a preference, not an input: it survives a submitted analysis like the cuisine does.
  void resetInputs() => state = HomeDraft(cuisineId: state.cuisineId, mode: state.mode, debug: state.debug);
}

final homeDraftProvider = NotifierProvider<HomeDraftController, HomeDraft>(HomeDraftController.new);
