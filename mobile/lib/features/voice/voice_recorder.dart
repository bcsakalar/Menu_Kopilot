import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// Microphone recording for voice notes; an interface so widget tests run without the platform plugin.
abstract interface class VoiceRecorder {
  Future<bool> hasPermission();

  /// Records AAC in an m4a container to [path].
  Future<void> start(String path);

  /// Stops and returns the file path (null when nothing was recorded).
  Future<String?> stop();

  Future<void> cancel();

  Future<void> dispose();
}

class RecordVoiceRecorder implements VoiceRecorder {
  final AudioRecorder _recorder = AudioRecorder();

  @override
  Future<bool> hasPermission() => _recorder.hasPermission();

  // Speech only: mono 16 kHz is what Whisper uses internally, so larger files would only cost upload time.
  @override
  Future<void> start(String path) => _recorder.start(
        const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 48000, sampleRate: 16000, numChannels: 1, noiseSuppress: true),
        path: path,
      );

  @override
  Future<String?> stop() => _recorder.stop();

  @override
  Future<void> cancel() => _recorder.cancel();

  @override
  Future<void> dispose() => _recorder.dispose();
}

/// One recorder for the app's lifetime (only one voice note records at a time).
final voiceRecorderProvider = Provider<VoiceRecorder>((ref) {
  final recorder = RecordVoiceRecorder();
  ref.onDispose(recorder.dispose);
  return recorder;
});

/// Where a new recording goes (temporary directory; deleted after upload).
final voiceNotePathProvider = Provider<Future<String> Function()>((ref) {
  return () async {
    final dir = Directory(p.join((await getTemporaryDirectory()).path, 'voice'));
    await dir.create(recursive: true);
    return p.join(dir.path, 'note-${DateTime.now().millisecondsSinceEpoch}.m4a');
  };
});
