import 'package:flutter/material.dart';

import 'common.dart';

/// Section title with the photo count, then camera and gallery as two equal buttons.
class PhotoSourceBar extends StatelessWidget {
  const PhotoSourceBar({
    required this.title,
    required this.count,
    required this.max,
    required this.onCamera,
    required this.onGallery,
    super.key,
    this.enabled = true,
    this.galleryFirst = false,
  });

  final String title;
  final int count;
  final int max;
  final VoidCallback onCamera;
  final VoidCallback onGallery;
  final bool enabled;

  /// Panel screenshots usually come from the gallery, menu photos from the camera.
  final bool galleryFirst;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final camera = OutlinedButton.icon(
      key: const Key('photo-camera'),
      onPressed: enabled ? onCamera : null,
      icon: const Icon(Icons.photo_camera_outlined),
      label: Text(l10n.takePhoto),
    );
    final gallery = OutlinedButton.icon(
      key: const Key('photo-gallery'),
      onPressed: enabled ? onGallery : null,
      icon: const Icon(Icons.photo_library_outlined),
      label: Text(l10n.pickFromGallery),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text(title, style: theme.textTheme.titleSmall)),
            Text(l10n.photosCount(count, max), style: theme.textTheme.bodySmall),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(child: galleryFirst ? gallery : camera),
            const SizedBox(width: 8),
            Expanded(child: galleryFirst ? camera : gallery),
          ],
        ),
      ],
    );
  }
}
