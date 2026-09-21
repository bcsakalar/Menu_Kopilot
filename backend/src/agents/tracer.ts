import type { AttemptRecord } from '../ai/router.js';
import type { Database } from '../db/client.js';
import { agentSteps } from '../db/schema/index.js';
import type { AgentName } from './types.js';

/**
 * Per-step audit trail: how long each agent took, which model answered, how many tokens it burned and what went
 * in and out. Written to `agent_steps` and streamed as `trace` SSE events, which is what the hidden debug screen
 * renders. A failed write is swallowed — losing a log line must never fail an analysis on a live phone call.
 */

export interface AgentStepRecord {
  seq: number;
  agent: AgentName;
  label: string;
  status: 'ok' | 'failed' | 'skipped';
  provider: string | null;
  model: string | null;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  llmCalls: number;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
}

/** Images and long prompts are never stored whole: the trace has to stay small enough to fetch on a phone. */
const MAX_PAYLOAD_CHARS = 4000;

export function trimPayload(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  const wrapped = typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : { value };
  const json = JSON.stringify(wrapped);
  if (json === undefined) return null;
  if (json.length <= MAX_PAYLOAD_CHARS) return wrapped;
  return { truncated: true, chars: json.length, preview: json.slice(0, MAX_PAYLOAD_CHARS) };
}

export interface AttemptTotals {
  tokensIn: number;
  tokensOut: number;
  /** Attempts that reached a provider — a route skipped for a missing key or an open circuit is not a call. */
  llmCalls: number;
  /** The route that finally answered, if any did. */
  provider: string | undefined;
  model: string | undefined;
}

/** One place that turns an agent's attempts into the numbers the debug screen shows. */
export function summarizeAttempts(attempts: readonly AttemptRecord[]): AttemptTotals {
  const totals: AttemptTotals = { tokensIn: 0, tokensOut: 0, llmCalls: 0, provider: undefined, model: undefined };
  for (const attempt of attempts) {
    if (attempt.outcome === 'skipped') continue;
    totals.llmCalls += 1;
    totals.tokensIn += attempt.tokensIn ?? 0;
    totals.tokensOut += attempt.tokensOut ?? 0;
    if (attempt.outcome === 'ok') {
      totals.provider = attempt.provider;
      totals.model = attempt.model;
    }
  }
  return totals;
}

/** What an agent body hands back to the tracer. */
export interface StepResult<T> {
  value: T;
  status?: AgentStepRecord['status'];
  /**
   * Every provider attempt the step made (repair round included). Tokens, call count, provider and model are
   * derived from these, so an agent cannot forget to report them.
   */
  attempts?: readonly AttemptRecord[];
  output?: unknown;
  error?: string | undefined;
}

export interface TracerOptions {
  db: Database;
  runId: string;
  emit: (step: AgentStepRecord) => void;
  onError?: (err: unknown) => void;
  /** Debug payloads are only written when the user asked for them (Ayarlar > geliştirici). */
  storePayloads: boolean;
}

export class AgentTracer {
  private seq = 0;
  private readonly steps: AgentStepRecord[] = [];

  constructor(private readonly options: TracerOptions) {}

  get recorded(): readonly AgentStepRecord[] {
    return this.steps;
  }

  get totals(): { durationMs: number; tokensIn: number; tokensOut: number; llmCalls: number } {
    return this.steps.reduce(
      (sum, s) => ({
        durationMs: sum.durationMs + s.durationMs,
        tokensIn: sum.tokensIn + s.tokensIn,
        tokensOut: sum.tokensOut + s.tokensOut,
        llmCalls: sum.llmCalls + s.llmCalls,
      }),
      { durationMs: 0, tokensIn: 0, tokensOut: 0, llmCalls: 0 },
    );
  }

  /** Times `body`, records the step and returns its value. Throwing bodies are recorded as `failed` and re-thrown. */
  async step<T>(agent: AgentName, label: string, input: unknown, body: () => Promise<StepResult<T>>): Promise<T> {
    const started = Date.now();
    const seq = (this.seq += 1);
    try {
      const result = await body();
      const totals = summarizeAttempts(result.attempts ?? []);
      await this.record({
        seq,
        agent,
        label,
        status: result.status ?? 'ok',
        provider: totals.provider ?? null,
        model: totals.model ?? null,
        durationMs: Date.now() - started,
        tokensIn: totals.tokensIn,
        tokensOut: totals.tokensOut,
        llmCalls: totals.llmCalls,
        input: this.options.storePayloads ? trimPayload(input) : null,
        output: this.options.storePayloads ? trimPayload(result.output) : null,
        error: result.error ?? null,
      });
      return result.value;
    } catch (err) {
      await this.record({
        seq,
        agent,
        label,
        status: 'failed',
        provider: null,
        model: null,
        durationMs: Date.now() - started,
        tokensIn: 0,
        tokensOut: 0,
        llmCalls: 0,
        input: this.options.storePayloads ? trimPayload(input) : null,
        output: null,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async skip(agent: AgentName, label: string, reason: string): Promise<void> {
    await this.record({
      seq: (this.seq += 1),
      agent,
      label,
      status: 'skipped',
      provider: null,
      model: null,
      durationMs: 0,
      tokensIn: 0,
      tokensOut: 0,
      llmCalls: 0,
      input: null,
      output: null,
      error: reason,
    });
  }

  private async record(step: AgentStepRecord): Promise<void> {
    this.steps.push(step);
    this.options.emit(step);
    try {
      await this.options.db.insert(agentSteps).values({
        runId: this.options.runId,
        seq: step.seq,
        agent: step.agent,
        status: step.status,
        provider: step.provider,
        model: step.model,
        durationMs: step.durationMs,
        tokensIn: step.tokensIn,
        tokensOut: step.tokensOut,
        llmCalls: step.llmCalls,
        input: step.input ?? undefined,
        output: step.output ?? undefined,
        error: step.error,
      });
    } catch (err) {
      this.options.onError?.(err);
    }
  }
}
