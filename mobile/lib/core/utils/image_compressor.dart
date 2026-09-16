import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image_size_getter/file_input.dart';
import 'package:image_size_getter/image_size_getter.dart';
import 'package:path/path.dart' as p;

/// Upload rule (spec): long edge ≤ 1600 px, JPEG quality 80, target < 1.5 MB per photo.
const int maxImageEdge = 1600;
const int targetImageBytes = 1536 * 1024;
const List<int> compressQualities = [80, 70, 60];

class PickedImage {
  const PickedImage({required this.path, required this.bytes, required this.sha256, required this.width, required this.height});

  final String path;
  final int bytes;
  final String sha256;
  final int width;
  final int height;
}

/// flutter_image_compress scales by `max(1, min(w / minWidth, h / minHeight))`. Passing the SAME value for both
/// minimums — the short side the image should have after scaling — makes the long side land exactly on
/// [maxEdge], whatever the orientation. Images already small enough are never upscaled.
int compressMinSide(int width, int height, {int maxEdge = maxImageEdge}) {
  final longSide = math.max(width, height);
  final shortSide = math.min(width, height);
  if (longSide <= maxEdge) return shortSide;
  return (maxEdge * shortSide / longSide).round();
}

/// Output size of the compressor for a given input (mirrors the plugin's scaling formula).
(int, int) scaledSize(int width, int height, int minSide) {
  final scale = math.max(1.0, math.min(width / minSide, height / minSide));
  return ((width / scale).round(), (height / scale).round());
}

String sha256Of(Uint8List bytes) => sha256.convert(bytes).toString();

/// Outcome of adding photos to a draft: [skipped] were over the photo limit, [failed] could not be read.
typedef AddImagesResult = ({int skipped, int failed});

/// A photo that could not be read or converted (unsupported format, broken file).
class ImageCompressException implements Exception {
  const ImageCompressException(this.reason);

  final String reason;

  @override
  String toString() => 'ImageCompressException: $reason';
}

/// Width and height after EXIF rotation, or null when the format is unknown to the size reader.
(int, int)? _readSize(ImageInput input) {
  try {
    final size = ImageSizeGetter.getSizeResult(input).size;
    return size.needRotate ? (size.height, size.width) : (size.width, size.height);
  } on Object catch (_) {
    return null;
  }
}

/// Compresses a picked photo into [outDir] and returns its metadata. EXIF (incl. GPS) is stripped.
Future<PickedImage> compressForUpload(String sourcePath, Directory outDir) async {
  var size = _readSize(FileInput(File(sourcePath)));
  Uint8List? converted;
  if (size == null) {
    // HEIC/HEIF (Samsung "high efficiency" photos, iPhone camera) is not readable by the size reader: convert it
    // once to a JPEG no smaller than the target, then scale from those bytes.
    converted = await FlutterImageCompress.compressWithFile(
      sourcePath,
      minWidth: maxImageEdge,
      minHeight: maxImageEdge,
      quality: 95,
      format: CompressFormat.jpeg,
      keepExif: false,
      autoCorrectionAngle: true,
    );
    size = converted == null ? null : _readSize(MemoryInput(converted));
  }
  if (size == null) throw const ImageCompressException('unsupported image format');
  final (width, height) = size;
  final minSide = compressMinSide(width, height);

  Uint8List? best;
  for (final quality in compressQualities) {
    final source = converted;
    final bytes = source == null
        ? await FlutterImageCompress.compressWithFile(
            sourcePath,
            minWidth: minSide,
            minHeight: minSide,
            quality: quality,
            format: CompressFormat.jpeg,
            keepExif: false,
            autoCorrectionAngle: true,
          )
        : await FlutterImageCompress.compressWithList(
            source,
            minWidth: minSide,
            minHeight: minSide,
            quality: quality,
            format: CompressFormat.jpeg,
            keepExif: false,
          );
    if (bytes == null) continue;
    best = bytes;
    if (bytes.length <= targetImageBytes) break;
  }
  if (best == null) throw const ImageCompressException('compression failed');
  final hash = sha256Of(best);
  await outDir.create(recursive: true);
  final outPath = p.join(outDir.path, '$hash.jpg');
  await File(outPath).writeAsBytes(best, flush: true);
  final (outW, outH) = scaledSize(width, height, minSide);
  return PickedImage(path: outPath, bytes: best.length, sha256: hash, width: outW, height: outH);
}
