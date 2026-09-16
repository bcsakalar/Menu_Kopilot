import 'package:flutter/material.dart';

import '../theme.dart';

const Color brandSparkle = Color(0xFFFDE68A);

/// The app mark (menu card with a check + copilot sparkle), drawn from the same 108-unit geometry as the launcher
/// icon (android/app/src/main/res/drawable/ic_launcher_foreground.xml) so login and splash match the icon.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 88, this.withBackground = true});

  final double size;

  /// false → only the mark, for screens that are already brand-colored (splash).
  final bool withBackground;

  @override
  Widget build(BuildContext context) => SizedBox.square(
        dimension: size,
        child: CustomPaint(painter: _BrandMarkPainter(withBackground: withBackground)),
      );
}

class _BrandMarkPainter extends CustomPainter {
  const _BrandMarkPainter({required this.withBackground});

  final bool withBackground;

  @override
  void paint(Canvas canvas, Size size) {
    final side = size.shortestSide;
    if (withBackground) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(Offset.zero & Size.square(side), Radius.circular(side * 0.26)),
        Paint()..color = brandPaprika,
      );
    }
    // The mark spans x 32..76.5 and y 27.5..80 of the 108-unit canvas; fill ~62% of the side, centered.
    final s = side * 0.62 / 52.5;
    final origin = Offset(side / 2 - 54.25 * s, side / 2 - 53.75 * s);
    Offset p(double x, double y) => origin + Offset(x * s, y * s);

    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromPoints(p(32, 42), p(62, 80)), Radius.circular(5 * s)),
      Paint()..color = Colors.white,
    );
    final ink = Paint()
      ..color = brandPaprika
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4 * s
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas
      ..drawLine(p(39, 53), p(55, 53), ink)
      ..drawLine(p(39, 61.5), p(51, 61.5), ink)
      ..drawPath(
        Path()
          ..moveTo(p(39, 70).dx, p(39, 70).dy)
          ..lineTo(p(43, 74).dx, p(43, 74).dy)
          ..lineTo(p(51, 66).dx, p(51, 66).dy),
        ink,
      );

    final star = Path()..moveTo(p(68, 27.5).dx, p(68, 27.5).dy);
    void curve(Offset control, Offset end) => star.quadraticBezierTo(control.dx, control.dy, end.dx, end.dy);
    curve(p(70.2, 33.8), p(76.5, 36));
    curve(p(70.2, 38.2), p(68, 44.5));
    curve(p(65.8, 38.2), p(59.5, 36));
    curve(p(65.8, 33.8), p(68, 27.5));
    canvas.drawPath(star..close(), Paint()..color = brandSparkle);
  }

  @override
  bool shouldRepaint(_BrandMarkPainter oldDelegate) => oldDelegate.withBackground != withBackground;
}
