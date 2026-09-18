import 'dart:io';

import 'package:flutter/material.dart';

import '../design/tokens.dart';
import 'common.dart';

/// Thumbnail of a picked photo with a remove button.
class PhotoThumb extends StatelessWidget {
  const PhotoThumb({required this.path, required this.onDelete, super.key, this.width = 80, this.height = 96});

  final String path;
  final VoidCallback onDelete;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Stack(
      children: [
        Container(
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(10), border: Border.all(color: p.border)),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Image.file(File(path), width: width, height: height, fit: BoxFit.cover, cacheWidth: 240),
          ),
        ),
        Positioned(
          top: 0,
          right: 0,
          // Its own semantics node: without `container` the label spread over the whole thumbnail, whose centre does
          // not delete. The hit area is 40 dp around the small visible badge.
          child: Semantics(
            container: true,
            button: true,
            label: context.l10n.delete,
            child: InkWell(
              onTap: onDelete,
              customBorder: const CircleBorder(),
              child: SizedBox(
                width: 40,
                height: 40,
                child: Center(
                  child: Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.6), shape: BoxShape.circle),
                    child: const Icon(Icons.close_rounded, size: 15, color: Colors.white),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
