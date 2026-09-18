import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/design/action_dock.dart';
import '../../core/design/skeleton.dart';
import '../../core/design/tokens.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../core/utils/haptics.dart';
import '../../core/widgets/common.dart';
import '../../data/models/voice_research.dart';
import 'voice_recorder.dart';

enum _VoiceState { idle, recording, sending }

/// "Sesli not": tap to record, tap again to send; the transcript comes back through [onText].
/// Recording stops by itself after [maxDuration]. [compact] renders it as a square dock button.
class VoiceNoteButton extends ConsumerStatefulWidget {
  const VoiceNoteButton({
    required this.onText,
    super.key,
    this.cuisineId,
    this.maxDuration = const Duration(seconds: 90),
    this.compact = false,
  });

  final ValueChanged<Transcription> onText;
  final String? cuisineId;
  final Duration maxDuration;
  final bool compact;

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
    unawaited(Haptics.select());
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
      if (mounted) showMessage(context, e.isNetwork ? l10n.voiceNeedsNetwork : apiErrorText(l10n, e));
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

  String get _elapsed => '${_seconds ~/ 60}:${(_seconds % 60).toString().padLeft(2, '0')}';

  Widget _compact(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    return switch (_state) {
      _VoiceState.idle => DockButton(key: const Key('voice-note'), icon: Icons.mic_none_rounded, tooltip: l10n.voiceNote, onPressed: _start),
      _VoiceState.recording => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Tooltip(
              message: l10n.voiceRecording(_elapsed),
              child: Material(
                color: p.danger.withValues(alpha: 0.14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: p.danger.withValues(alpha: 0.5))),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  key: const Key('voice-stop'),
                  onTap: _stopAndSend,
                  child: SizedBox(
                    height: 50,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.stop_rounded, color: p.danger),
                          const SizedBox(width: 4),
                          Text(_elapsed, style: TextStyle(fontWeight: FontWeight.w800, color: p.danger, fontFeatures: tabularFigures)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 6),
            DockButton(key: const Key('voice-cancel'), icon: Icons.close_rounded, tooltip: l10n.cancel, onPressed: _cancel),
          ],
        ),
      _VoiceState.sending => Tooltip(
          message: l10n.voiceSending,
          child: const Shimmer(child: DockButton(icon: Icons.graphic_eq_rounded, tooltip: '', onPressed: null)),
        ),
    };
  }

  @override
  Widget build(BuildContext context) {
    if (widget.compact) return _compact(context);
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
