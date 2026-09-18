import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'tokens.dart';

/// "8 / 12 ürün": the number that matters during a call, set large with tabular digits, over a segmented meter
/// (one segment per product up to 24, a continuous bar above that). Amber while products are missing, green at target.
class CountMeter extends StatelessWidget {
  const CountMeter({
    required this.current,
    required this.target,
    required this.unit,
    super.key,
    this.caption,
    this.compact = false,
  });

  final int current;
  final int target;

  /// "ürün" (from l10n).
  final String unit;
  final String? caption;

  /// List rows: one line of 20 px digits and a thin bar.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final reached = target > 0 && current >= target;
    final fill = reached ? p.success : p.amber;
    final numberStyle = (compact ? text.titleLarge : text.displayMedium)?.copyWith(fontFeatures: tabularFigures);
    final targetStyle = (compact ? text.titleMedium : text.headlineMedium)?.copyWith(color: p.textFaint, fontFeatures: tabularFigures);
    return Semantics(
      label: '$current / $target $unit',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text('$current', key: const Key('count-current'), style: numberStyle),
              Text(' / $target', style: targetStyle),
              const SizedBox(width: 6),
              Text(unit, style: (compact ? text.bodySmall : text.titleSmall)?.copyWith(color: p.textMuted)),
            ],
          ),
          SizedBox(height: compact ? 8 : 12),
          SegmentedMeter(current: current, target: target, color: fill, height: compact ? 4 : 6),
          if (caption != null) ...[
            SizedBox(height: compact ? 6 : 10),
            Text(caption!, style: text.bodySmall),
          ],
        ],
      ),
    );
  }
}

class SegmentedMeter extends StatelessWidget {
  const SegmentedMeter({required this.current, required this.target, required this.color, super.key, this.height = 6});

  final int current;
  final int target;
  final Color color;
  final double height;

  static const int maxSegments = 24;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final radius = BorderRadius.circular(height);
    if (target <= 0 || target > maxSegments) {
      final progress = target <= 0 ? 1.0 : (current / target).clamp(0.0, 1.0);
      return ClipRRect(
        borderRadius: radius,
        child: SizedBox(
          height: height,
          child: Stack(
            children: [
              Positioned.fill(child: ColoredBox(color: p.borderStrong)),
              FractionallySizedBox(widthFactor: progress, child: ColoredBox(color: color)),
            ],
          ),
        ),
      );
    }
    final filled = math.min(current, target);
    return SizedBox(
      height: height,
      child: Row(
        children: [
          for (var i = 0; i < target; i++) ...[
            if (i > 0) const SizedBox(width: 3),
            Expanded(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 220),
                decoration: BoxDecoration(color: i < filled ? color : p.borderStrong, borderRadius: radius),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
