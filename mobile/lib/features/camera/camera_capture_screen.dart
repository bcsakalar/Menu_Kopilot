import 'dart:io';

import 'package:camera/camera.dart';
import 'package:collection/collection.dart';
import 'package:flutter/material.dart';

import '../../core/widgets/common.dart';

/// In-app multi-shot capture: take several menu pages quickly without leaving the screen.
/// Pops with the list of captured file paths (compressed later by the home screen).
class CameraCaptureScreen extends StatefulWidget {
  const CameraCaptureScreen({super.key, this.maxShots = 5});

  final int maxShots;

  @override
  State<CameraCaptureScreen> createState() => _CameraCaptureScreenState();
}

class _CameraCaptureScreenState extends State<CameraCaptureScreen> with WidgetsBindingObserver {
  CameraController? _controller;
  final List<String> _shots = [];
  String? _error;
  bool _taking = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _init();
  }

  Future<void> _init() async {
    try {
      final cameras = await availableCameras();
      final back = cameras.firstWhereOrNull((c) => c.lensDirection == CameraLensDirection.back) ?? cameras.firstOrNull;
      if (back == null) {
        setState(() => _error = 'cameraUnavailable');
        return;
      }
      final controller = CameraController(back, ResolutionPreset.veryHigh, enableAudio: false, imageFormatGroup: ImageFormatGroup.jpeg);
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _controller = controller);
    } on CameraException catch (e) {
      if (mounted) setState(() => _error = e.code == 'CameraAccessDenied' ? 'cameraPermission' : 'cameraUnavailable');
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    if (state == AppLifecycleState.inactive) {
      controller.dispose();
      setState(() => _controller = null);
    } else if (state == AppLifecycleState.resumed) {
      _init();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _take() async {
    final controller = _controller;
    if (controller == null || _taking || _shots.length >= widget.maxShots) return;
    setState(() => _taking = true);
    try {
      final file = await controller.takePicture();
      setState(() => _shots.add(file.path));
    } on CameraException {
      if (mounted) showMessage(context, context.l10n.cameraUnavailable);
    } finally {
      if (mounted) setState(() => _taking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final controller = _controller;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(l10n.cameraTitle),
        actions: [
          TextButton(
            onPressed: _shots.isEmpty ? null : () => Navigator.pop(context, _shots),
            child: Text(l10n.cameraDone(_shots.length), style: const TextStyle(color: Colors.white)),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: Center(
              child: _error != null
                  ? Text(_error == 'cameraPermission' ? l10n.cameraPermission : l10n.cameraUnavailable,
                      style: const TextStyle(color: Colors.white))
                  : controller == null
                      ? const CircularProgressIndicator()
                      : CameraPreview(controller),
            ),
          ),
          if (_shots.isNotEmpty)
            SizedBox(
              height: 84,
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                scrollDirection: Axis.horizontal,
                itemCount: _shots.length,
                separatorBuilder: (_, _) => const SizedBox(width: 6),
                itemBuilder: (context, i) => Stack(
                  children: [
                    Image.file(File(_shots[i]), width: 56, height: 72, fit: BoxFit.cover, cacheWidth: 160),
                    Positioned(
                      right: 0,
                      top: 0,
                      child: InkWell(
                        onTap: () => setState(() => _shots.removeAt(i)),
                        child: const Icon(Icons.cancel, color: Colors.white, size: 18),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(bottom: 24, top: 8),
            child: FloatingActionButton.large(
              onPressed: controller == null || _shots.length >= widget.maxShots ? null : _take,
              child: _taking ? const CircularProgressIndicator() : const Icon(Icons.camera_alt),
            ),
          ),
        ],
      ),
    );
  }
}
