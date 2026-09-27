import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Shares an exported file, or a plain message, through the system share sheet (mail, WhatsApp, Drive…).
abstract interface class FileSharer {
  Future<void> shareText({required String fileName, required String content, required String mimeType, String? subject});

  /// A message to paste into a chat — the call summary for the seller (D-196).
  Future<void> shareMessage(String text);
}

class PluginFileSharer implements FileSharer {
  const PluginFileSharer();

  @override
  Future<void> shareText({required String fileName, required String content, required String mimeType, String? subject}) async {
    final temp = await getTemporaryDirectory();
    final file = File(p.join(temp.path, 'exports', fileName));
    await file.parent.create(recursive: true);
    await file.writeAsString(content, flush: true);
    await SharePlus.instance.share(
      ShareParams(files: [XFile(file.path, mimeType: mimeType)], subject: subject, title: subject),
    );
  }

  @override
  Future<void> shareMessage(String text) async {
    await SharePlus.instance.share(ShareParams(text: text));
  }
}

/// Overridden in widget tests (no platform channel there).
final fileSharerProvider = Provider<FileSharer>((ref) => const PluginFileSharer());
