import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/design/components.dart';
import '../../core/design/skeleton.dart';
import '../../core/design/tokens.dart';
import '../../core/widgets/common.dart';
import '../../data/models/analysis.dart';
import '../../l10n/gen/app_localizations.dart';
import 'analysis_controller.dart';

/// Hidden pipeline screen: every agent step of a run with its duration, model, tokens and — when the run was
/// started with "Ayrıntılı kayıt" on — its input and output. Reached from the bug icon on the result screen.
///
/// This is the answer to "neden bunu önerdi?" during a call: the Gap Analyst's output says which categories were
/// open, and the Validator's says which cards were dropped and why.
class PipelineDebugScreen extends ConsumerWidget {
  const PipelineDebugScreen({required this.runId, super.key});

  final String runId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    // While a run streams, the controller already has the steps; otherwise they are fetched.
    final live = ref.watch(analysisControllerProvider.select((s) => s.runId == runId ? s.trace : const <TraceStep>[]));
    final fetched = ref.watch(runTraceProvider(runId));

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.pipelineDebug),
        actions: [
          IconButton(
            tooltip: l10n.retry,
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => ref.invalidate(runTraceProvider(runId)),
          ),
        ],
      ),
      body: fetched.when(
        loading: () => live.isEmpty ? const SkeletonList(rows: 6) : _Steps(steps: live, totalMs: null, llmCalls: null),
        error: (error, _) => live.isNotEmpty
            ? _Steps(steps: live, totalMs: null, llmCalls: null)
            : EmptyState(
                icon: Icons.error_outline_rounded,
                message: error is Exception ? apiErrorText(l10n, error) : l10n.genericError,
                action: FilledButton(onPressed: () => ref.invalidate(runTraceProvider(runId)), child: Text(l10n.retry)),
              ),
        data: (trace) => trace.steps.isEmpty
            ? EmptyState(icon: Icons.bug_report_outlined, message: l10n.pipelineEmpty)
            : _Steps(steps: trace.steps, totalMs: trace.totalMs, llmCalls: trace.llmCalls),
      ),
    );
  }
}

/// Turkish label per agent; the wire value is shown next to it so a log line can be found later.
String agentLabel(AppLocalizations l10n, String agent) => switch (agent) {
      'extractor' => l10n.agentExtractor,
      'classifier' => l10n.agentClassifier,
      'gap_analyst' => l10n.agentGapAnalyst,
      'product_recommender' => l10n.agentProductRecommender,
      'option_modifier' => l10n.agentOptionModifier,
      'validator' => l10n.agentValidator,
      _ => agent,
    };

class _Steps extends StatelessWidget {
  const _Steps({required this.steps, required this.totalMs, required this.llmCalls});

  final List<TraceStep> steps;
  final int? totalMs;
  final int? llmCalls;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final total = totalMs ?? steps.fold<int>(0, (sum, s) => sum + s.durationMs);
    final calls = llmCalls ?? steps.fold<int>(0, (sum, s) => sum + s.llmCalls);
    final slowest = steps.fold(0, (max, s) => s.durationMs > max ? s.durationMs : max);

    return ListView(
      padding: const EdgeInsets.only(bottom: 32),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(AppSpace.page, 16, AppSpace.page, 4),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              Pill(l10n.pipelineTotal(total), tone: Tone.accent, icon: Icons.timer_outlined),
              Pill(l10n.aiCallsCount(calls), tone: Tone.amber, icon: Icons.bolt_outlined),
              Pill(l10n.pipelineSteps(steps.length), icon: Icons.list_alt_rounded),
            ],
          ),
        ),
        for (final step in steps) _StepTile(step: step, slowestMs: slowest),
      ],
    );
  }
}

class _StepTile extends StatelessWidget {
  const _StepTile({required this.step, required this.slowestMs});

  final TraceStep step;

  /// The longest step of the run — the bar is drawn relative to it, so the bottleneck is obvious.
  final int slowestMs;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = context.palette;
    final text = Theme.of(context).textTheme;
    final tone = step.failed ? Tone.danger : (step.skipped ? Tone.neutral : Tone.success);
    final fraction = slowestMs == 0 ? 0.0 : (step.durationMs / slowestMs).clamp(0.0, 1.0);

    return AppCard(
      padding: const EdgeInsets.fromLTRB(AppSpace.lg, 12, AppSpace.lg, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('${step.seq}', style: text.labelSmall?.copyWith(color: p.textFaint)),
              const SizedBox(width: 10),
              Expanded(child: Text(agentLabel(l10n, step.agent), style: text.titleSmall)),
              Text('${step.durationMs} ms', style: text.titleSmall?.copyWith(fontFeatures: tabularFigures, color: p.textMuted)),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: LinearProgressIndicator(
              value: fraction,
              minHeight: 3,
              backgroundColor: p.raised,
              valueColor: AlwaysStoppedAnimation(toneColor(p, tone)),
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              Pill(step.status, tone: tone),
              Text(step.agent, style: text.bodySmall?.copyWith(color: p.textFaint)),
              if (step.model != null) Pill('${step.provider} · ${step.model}', tone: Tone.neutral),
              if (step.llmCalls > 0) Pill(l10n.aiCallsCount(step.llmCalls), tone: Tone.amber),
              if (step.tokensIn + step.tokensOut > 0) Pill(l10n.pipelineTokens(step.tokensIn, step.tokensOut)),
            ],
          ),
          if (step.error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(step.error!, style: text.bodySmall?.copyWith(color: p.danger)),
            ),
          if (step.input != null) _Payload(label: l10n.pipelineInput, value: step.input!),
          if (step.output != null) _Payload(label: l10n.pipelineOutput, value: step.output!),
        ],
      ),
    );
  }
}

/// Collapsed by default — the interesting number is usually the duration, not the payload.
class _Payload extends StatelessWidget {
  const _Payload({required this.label, required this.value});

  final String label;
  final Map<String, Object?> value;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final pretty = const JsonEncoder.withIndent('  ').convert(value);
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        childrenPadding: const EdgeInsets.only(bottom: 8),
        title: Text(label, style: Theme.of(context).textTheme.labelSmall),
        trailing: CopyButton(text: pretty),
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: p.raised, borderRadius: BorderRadius.circular(8), border: Border.all(color: p.border)),
            child: SelectableText(
              pretty,
              style: TextStyle(fontFamily: 'monospace', fontSize: 11.5, height: 1.4, color: p.textMuted),
            ),
          ),
        ],
      ),
    );
  }
}
