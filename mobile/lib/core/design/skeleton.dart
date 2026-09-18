import 'package:flutter/material.dart';

import 'tokens.dart';

/// A soft highlight sweeping across its child (skeleton placeholders). Static when the system asks for reduced motion.
class Shimmer extends StatefulWidget {
  const Shimmer({required this.child, super.key});

  final Widget child;

  @override
  State<Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<Shimmer> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return AnimatedBuilder(
      animation: _controller,
      child: widget.child,
      builder: (context, child) => ShaderMask(
        blendMode: BlendMode.srcATop,
        shaderCallback: (bounds) {
          final t = _controller.value;
          return LinearGradient(
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
            colors: [p.border, p.borderStrong, p.border],
            stops: [(t - 0.3).clamp(0.0, 1.0), t, (t + 0.3).clamp(0.0, 1.0)],
          ).createShader(bounds);
        },
        child: child,
      ),
    );
  }
}

/// A rounded placeholder block.
class SkeletonBox extends StatelessWidget {
  const SkeletonBox({super.key, this.width, this.height = 12, this.radius = 6});

  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) =>
      Container(width: width, height: height, decoration: BoxDecoration(color: context.palette.border, borderRadius: BorderRadius.circular(radius)));
}

/// Placeholder of a product card that is still being prepared; shows the name when it is already known.
class SkeletonCard extends StatelessWidget {
  const SkeletonCard({super.key, this.title, this.subtitle});

  final String? title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.page, vertical: 6),
      child: Container(
        padding: const EdgeInsets.all(AppSpace.lg),
        decoration: BoxDecoration(
          color: p.surface,
          borderRadius: BorderRadius.circular(AppRadius.card),
          border: Border.all(color: p.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (title != null)
                  Expanded(child: Text(title!, style: text.titleMedium, maxLines: 1, overflow: TextOverflow.ellipsis))
                else
                  const Expanded(child: Shimmer(child: SkeletonBox(height: 16, width: 160))),
                const SizedBox(width: 12),
                const Shimmer(child: SkeletonBox(width: 64, height: 18, radius: 999)),
              ],
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 4),
              Text(subtitle!, style: text.bodySmall?.copyWith(color: p.textFaint)),
            ],
            const SizedBox(height: 14),
            const Shimmer(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SkeletonBox(width: double.infinity),
                  SizedBox(height: 8),
                  SkeletonBox(width: 220),
                  SizedBox(height: 16),
                  Row(children: [SkeletonBox(width: 72, height: 22, radius: 999), SizedBox(width: 8), SkeletonBox(width: 92, height: 22, radius: 999)]),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A list of skeleton rows (loading lists: branches, templates, settings).
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.rows = 5});

  final int rows;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return ListView.builder(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.only(top: 8),
      itemCount: rows,
      itemBuilder: (context, index) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpace.page, vertical: 6),
        child: Container(
          height: 84,
          padding: const EdgeInsets.all(AppSpace.lg),
          decoration: BoxDecoration(color: p.surface, borderRadius: BorderRadius.circular(AppRadius.card), border: Border.all(color: p.border)),
          child: const Shimmer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonBox(width: 180, height: 14),
                SizedBox(height: 10),
                SkeletonBox(width: 120, height: 10),
                Spacer(),
                SkeletonBox(width: double.infinity, height: 4),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Menu / panel reading in progress: a page of lines with a paprika scan line moving over it and the stage text.
class ScanSkeleton extends StatefulWidget {
  const ScanSkeleton({required this.message, super.key, this.detail});

  final String message;
  final String? detail;

  @override
  State<ScanSkeleton> createState() => _ScanSkeletonState();
}

class _ScanSkeletonState extends State<ScanSkeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    const widths = [0.72, 0.5, 0.86, 0.64, 0.42, 0.78, 0.56];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.page, vertical: 6),
      child: Container(
        key: const Key('scan-skeleton'),
        padding: const EdgeInsets.all(AppSpace.lg),
        decoration: BoxDecoration(color: p.surface, borderRadius: BorderRadius.circular(AppRadius.card), border: Border.all(color: p.border)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                // A pulsing dot instead of a spinner: the scan line below carries the motion.
                AnimatedBuilder(
                  animation: _controller,
                  builder: (context, _) => Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: p.accentText.withValues(alpha: 0.35 + 0.65 * _controller.value),
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(child: Text(widget.message, style: text.titleSmall)),
              ],
            ),
            if (widget.detail != null) ...[
              const SizedBox(height: 4),
              Text(widget.detail!, style: text.bodySmall),
            ],
            const SizedBox(height: 14),
            SizedBox(
              height: 112,
              child: LayoutBuilder(
                builder: (context, constraints) => Stack(
                  children: [
                    Column(
                      children: [
                        for (final w in widths) ...[
                          Align(alignment: Alignment.centerLeft, child: SkeletonBox(width: constraints.maxWidth * w, height: 10)),
                          const SizedBox(height: 6),
                        ],
                      ],
                    ),
                    AnimatedBuilder(
                      animation: _controller,
                      builder: (context, _) => Positioned(
                        top: Curves.easeInOut.transform(_controller.value) * (constraints.maxHeight - 2),
                        left: 0,
                        right: 0,
                        child: Container(
                          height: 2,
                          decoration: BoxDecoration(
                            color: p.accentText,
                            boxShadow: [BoxShadow(color: p.accentText.withValues(alpha: 0.45), blurRadius: 8)],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
