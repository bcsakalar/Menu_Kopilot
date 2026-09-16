import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';

/// What another app shared into Menü Kopilot: a menu photo from WhatsApp, panel screenshots from the gallery or a
/// product list sent as text.
class SharedIntake {
  const SharedIntake({this.imagePaths = const [], this.text = ''});

  factory SharedIntake.fromMedia(List<SharedMediaFile> files) {
    final images = <String>[];
    final texts = <String>[];
    for (final file in files) {
      switch (file.type) {
        case SharedMediaType.image:
          images.add(file.path);
        case SharedMediaType.file when (file.mimeType ?? '').startsWith('image/'):
          images.add(file.path);
        case SharedMediaType.text || SharedMediaType.url:
          if (file.path.trim().isNotEmpty) texts.add(file.path.trim());
        case SharedMediaType.file || SharedMediaType.video:
          break;
      }
    }
    return SharedIntake(imagePaths: images, text: texts.join('\n'));
  }

  final List<String> imagePaths;
  final String text;

  bool get isEmpty => imagePaths.isEmpty && text.trim().isEmpty;
}

/// Share events of the platform, behind an interface so widget tests do not need the plugin.
abstract interface class ShareSource {
  /// What the app was started with (null when it was opened normally).
  Future<SharedIntake?> initial();

  /// Shares that arrive while the app is running.
  Stream<SharedIntake> updates();

  /// The initial share was handled; do not deliver it again.
  Future<void> consumed();
}

class PluginShareSource implements ShareSource {
  const PluginShareSource();

  bool get _supported => !kIsWeb && (defaultTargetPlatform == TargetPlatform.android || defaultTargetPlatform == TargetPlatform.iOS);

  @override
  Future<SharedIntake?> initial() async {
    if (!_supported) return null;
    try {
      final intake = SharedIntake.fromMedia(await ReceiveSharingIntent.instance.getInitialMedia());
      return intake.isEmpty ? null : intake;
    } on PlatformException catch (e) {
      debugPrint('share intake unavailable: $e');
      return null;
    }
  }

  @override
  Stream<SharedIntake> updates() {
    if (!_supported) return const Stream.empty();
    return ReceiveSharingIntent.instance.getMediaStream().map(SharedIntake.fromMedia).where((intake) => !intake.isEmpty);
  }

  @override
  Future<void> consumed() async {
    if (!_supported) return;
    await ReceiveSharingIntent.instance.reset();
  }
}

final shareSourceProvider = Provider<ShareSource>((ref) => const PluginShareSource());
