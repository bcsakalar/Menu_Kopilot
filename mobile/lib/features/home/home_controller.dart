import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/providers.dart';
import '../../core/utils/image_compressor.dart';

const int maxPhotos = 5;

class HomeDraft {
  const HomeDraft({this.cuisineId, this.prompt = '', this.images = const [], this.deepMode = false, this.compressing = false});

  final String? cuisineId;
  final String prompt;
  final List<PickedImage> images;
  final bool deepMode;
  final bool compressing;

  bool get canSubmit => cuisineId != null && !compressing && (prompt.trim().isNotEmpty || images.isNotEmpty);

  HomeDraft copyWith({String? cuisineId, String? prompt, List<PickedImage>? images, bool? deepMode, bool? compressing}) =>
      HomeDraft(
        cuisineId: cuisineId ?? this.cuisineId,
        prompt: prompt ?? this.prompt,
        images: images ?? this.images,
        deepMode: deepMode ?? this.deepMode,
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

  void setPrompt(String prompt) => state = state.copyWith(prompt: prompt);

  void setDeepMode(bool value) => state = state.copyWith(deepMode: value);

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

  void resetInputs() => state = HomeDraft(cuisineId: state.cuisineId, deepMode: state.deepMode);
}

final homeDraftProvider = NotifierProvider<HomeDraftController, HomeDraft>(HomeDraftController.new);
