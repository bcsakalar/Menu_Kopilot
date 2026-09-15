import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/widgets/common.dart';
import '../../data/models/voice_research.dart';
import 'voice_recorder.dart';

enum _VoiceState { idle, recording, sending }

/// "Sesli not": tap to record, tap again to send; the transcript comes back through [onText].
/// Recording stops by itself after [maxDuration].
class VoiceNoteButton extends ConsumerStatefulWidget {
  const VoiceNoteButton({required this.onText, super.key, this.cuisineId, this.maxDuration = const Duration(seconds: 90)});

  final ValueChanged<Transcription> onText;
  final String? cuisineId;
  final Duration maxDuration;

  @override
  ConsumerState<VoiceNoteButton> createState() => _VoiceNoteButtonState();
}

class _VoiceNoteButtonState extends ConsumerState<VoiceNoteButton> {
  _VoiceState _state = _VoiceState.idle;
  Timer? _ticker;
  int _seconds = 0;
  late final VoiceRecorder _recorder = ref.read(voiceRecorderProvider);

  @override
  void dispose() {
    _ticker?.cancel();
    if (_state == _VoiceState.recording) _recorder.cancel().ignore();
    super.dispose();
  }

  Future<void> _start() async {
    final l10n = context.l10n;
    if (!await _recorder.hasPermission()) {
      if (mounted) showMessage(context, l10n.micPermission);
      return;
    }
    final path = await ref.read(voiceNotePathProvider)();
    await _recorder.start(path);
    if (!mounted) return;
    setState(() {
      _state = _VoiceState.recording;
      _seconds = 0;
    });
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _seconds += 1);
      if (_seconds >= widget.maxDuration.inSeconds) _stopAndSend();
    });
  }

  Future<void> _cancel() async {
    _ticker?.cancel();
    await _recorder.cancel();
    if (mounted) setState(() => _state = _VoiceState.idle);
  }

  Future<void> _stopAndSend() async {
    if (_state != _VoiceState.recording) return;
    _ticker?.cancel();
    setState(() => _state = _VoiceState.sending);
    final l10n = context.l10n;
    final path = await _recorder.stop();
    if (path == null) {
      if (mounted) setState(() => _state = _VoiceState.idle);
      return;
    }
    try {
      final transcription = await ref.read(apiClientProvider).transcribe(path, cuisineId: widget.cuisineId);
      if (!mounted) return;
      if (transcription.text.trim().isEmpty) {
        showMessage(context, l10n.voiceEmpty);
      } else {
        widget.onText(transcription);
      }
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.isNetwork ? l10n.voiceNeedsNetwork : e.message);
    } finally {
      try {
        // The recording is only needed for this upload.
        File(path).deleteSync();
      } on FileSystemException {
        // already gone
      }
      if (mounted) setState(() => _state = _VoiceState.idle);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final scheme = Theme.of(context).colorScheme;
    return switch (_state) {
      _VoiceState.idle => TextButton.icon(
          key: const Key('voice-note'),
          onPressed: _start,
          icon: const Icon(Icons.mic_none),
          label: Text(l10n.voiceNote),
        ),
      _VoiceState.recording => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            FilledButton.icon(
              key: const Key('voice-stop'),
              style: FilledButton.styleFrom(backgroundColor: scheme.error, foregroundColor: scheme.onError),
              onPressed: _stopAndSend,
              icon: const Icon(Icons.stop),
              label: Text(l10n.voiceRecording('${_seconds ~/ 60}:${(_seconds % 60).toString().padLeft(2, '0')}')),
            ),
            IconButton(key: const Key('voice-cancel'), tooltip: l10n.cancel, onPressed: _cancel, icon: const Icon(Icons.close)),
          ],
        ),
      _VoiceState.sending => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
            const SizedBox(width: 8),
            Text(l10n.voiceSending),
          ],
        ),
    };
  }
}
