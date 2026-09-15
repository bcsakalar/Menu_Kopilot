import type { ProviderName } from '../../src/config/models.js';
import { ProviderError, type ProviderErrorKind } from '../../src/ai/errors.js';
import { validateOutput } from '../../src/ai/providers/shared.js';
import type {
  AudioInput,
  EmbedOptions,
  GenerateStructuredOptions,
  LLMProvider,
  Result,
  TranscribeOptions,
  Transcription,
  WebSource,
} from '../../src/ai/types.js';

export type FakeReply =
  | { ok: true; raw: string; tokensIn?: number; tokensOut?: number; latencyMs?: number; sources?: WebSource[] }
  | { ok: false; kind: ProviderErrorKind; retryAfterMs?: number; raw?: string; status?: number; message?: string };

export type FakeResponder = (opts: GenerateStructuredOptions<unknown>, callIndex: number) => FakeReply | Promise<FakeReply>;

export type FakeTranscriber = (
  audio: AudioInput,
  opts: TranscribeOptions,
) => { ok: true; value: Transcription } | { ok: false; kind: ProviderErrorKind; message?: string };

/** Scriptable LLMProvider for unit/e2e tests (no network). */
export class FakeProvider implements LLMProvider {
  readonly calls: GenerateStructuredOptions<unknown>[] = [];
  readonly embedCalls: string[][] = [];
  readonly transcribeCalls: { audio: AudioInput; opts: TranscribeOptions }[] = [];
  readonly capabilities = { vision: true, json: true, maxImages: 5, maxImageBytes: 20 * 1024 * 1024 };
  configured = true;
  /** Speech-to-text answer; unset → "unsupported". */
  transcriber: FakeTranscriber | undefined;

  constructor(
    readonly name: ProviderName,
    private responder: FakeResponder,
    private readonly embedder?: (texts: string[], opts: EmbedOptions) => number[][] | Promise<number[][]>,
  ) {}

  setResponder(responder: FakeResponder): void {
    this.responder = responder;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async generateStructured<T>(opts: GenerateStructuredOptions<T>): Promise<Result<T>> {
    const index = this.calls.length;
    this.calls.push(opts);
    const reply = await this.responder(opts, index);
    const model = opts.model ?? 'fake-model';
    const meta = {
      provider: this.name,
      model,
      latencyMs: reply.ok ? (reply.latencyMs ?? 5) : 5,
      tokensIn: reply.ok ? (reply.tokensIn ?? 100) : 0,
      tokensOut: reply.ok ? (reply.tokensOut ?? 50) : 0,
    };
    if (!reply.ok) {
      return {
        ok: false,
        meta,
        error: new ProviderError({
          kind: reply.kind,
          message: reply.message ?? `fake ${reply.kind}`,
          provider: this.name,
          model,
          ...(reply.retryAfterMs === undefined ? {} : { retryAfterMs: reply.retryAfterMs }),
          ...(reply.raw === undefined ? {} : { raw: reply.raw }),
          ...(reply.status === undefined ? {} : { status: reply.status }),
        }),
      };
    }
    const validated = validateOutput(opts.schema, reply.raw, { provider: this.name, model });
    if (!validated.ok) return { ok: false, error: validated.error, meta };
    return { ok: true, value: validated.value, raw: reply.raw, meta: reply.sources ? { ...meta, sources: reply.sources } : meta };
  }

  transcribe(audio: AudioInput, opts: TranscribeOptions): Promise<Result<Transcription>> {
    this.transcribeCalls.push({ audio, opts });
    const meta = { provider: this.name, model: opts.model, latencyMs: 5, tokensIn: 0, tokensOut: 0 };
    const reply = this.transcriber?.(audio, opts) ?? { ok: false as const, kind: 'unsupported' as const, message: 'no transcriber' };
    if (!reply.ok) {
      return Promise.resolve({
        ok: false,
        meta,
        error: new ProviderError({ kind: reply.kind, message: reply.message ?? `fake ${reply.kind}`, provider: this.name, model: opts.model }),
      });
    }
    return Promise.resolve({ ok: true, value: reply.value, raw: JSON.stringify(reply.value), meta });
  }

  async embed(texts: string[], opts: EmbedOptions = {}): Promise<number[][]> {
    this.embedCalls.push(texts);
    if (!this.embedder) {
      throw new ProviderError({ kind: 'unsupported', message: 'no embedder', provider: this.name });
    }
    return this.embedder(texts, opts);
  }
}

export const okJson = (value: unknown): FakeReply => ({ ok: true, raw: JSON.stringify(value) });

/** Deterministic pseudo-embedding: normalized bag of character trigrams hashed into `dim` buckets. */
export function hashEmbedding(text: string, dim = 768): number[] {
  const v = new Array<number>(dim).fill(0);
  const s = ` ${text.toLowerCase()} `;
  for (let i = 0; i < s.length - 2; i += 1) {
    let h = 2166136261;
    for (let j = i; j < i + 3; j += 1) {
      h ^= s.charCodeAt(j);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dim;
    v[idx] = (v[idx] ?? 0) + 1;
  }
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}
