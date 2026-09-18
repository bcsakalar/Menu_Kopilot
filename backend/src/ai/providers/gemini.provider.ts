import { GoogleGenAI } from '@google/genai';
import { getModelSpec } from '../../config/models.js';
import { ProviderError, type ProviderErrorKind, kindForStatus } from '../errors.js';
import { forGemini, type JsonSchema, toJsonSchema } from '../json-schema.js';
import { headerGetterFrom, parseGoogleRetryDelayMs, parseRateLimitHeaders } from '../rate-limit.js';
import type { CallMeta, EmbedOptions, GenerateStructuredOptions, LLMProvider, Result } from '../types.js';
import { outputTokenLimit, validateOutput, withTimeout } from './shared.js';

/**
 * Gemini via the Interactions API (default interface since June 2026) with structured output,
 * and `models.embedContent` for embeddings. Every interaction is stateless (`store: false`).
 */

export type GeminiInputPart = { type: 'text'; text: string } | { type: 'image'; data: string; mime_type: string };

export interface InteractionRequest {
  model: string;
  system: string;
  input: GeminiInputPart[];
  schema: JsonSchema;
  maxOutputTokens: number;
  thinkingLevel?: string;
}

export interface InteractionResponse {
  outputText: string | undefined;
  status: string | undefined;
  tokensIn: number;
  tokensOut: number;
  headers: Record<string, string> | undefined;
}

/** The only surface of the SDK this provider needs — swapped for a fake in tests. */
export interface GeminiTransport {
  createInteraction(request: InteractionRequest, options: { signal: AbortSignal; timeoutMs: number }): Promise<InteractionResponse>;
  embed(request: { model: string; texts: string[]; dim: number; signal: AbortSignal; timeoutMs: number }): Promise<number[][]>;
}

export class SdkGeminiTransport implements GeminiTransport {
  private readonly ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async createInteraction(
    request: InteractionRequest,
    options: { signal: AbortSignal; timeoutMs: number },
  ): Promise<InteractionResponse> {
    const interaction = await this.ai.interactions.create(
      {
        model: request.model,
        system_instruction: request.system,
        input: request.input,
        response_format: { type: 'text', mime_type: 'application/json', schema: request.schema },
        generation_config: {
          max_output_tokens: request.maxOutputTokens,
          ...(request.thinkingLevel ? { thinking_level: request.thinkingLevel } : {}),
        },
        store: false,
      },
      { maxRetries: 0, timeout: options.timeoutMs, fetchOptions: { signal: options.signal } },
    );
    return {
      outputText: interaction.output_text,
      status: interaction.status,
      tokensIn: interaction.usage?.total_input_tokens ?? 0,
      tokensOut: interaction.usage?.total_output_tokens ?? 0,
      headers: interaction.sdkHttpResponse?.headers,
    };
  }

  async embed(request: { model: string; texts: string[]; dim: number; signal: AbortSignal; timeoutMs: number }): Promise<number[][]> {
    const response = await this.ai.models.embedContent({
      model: request.model,
      // One Content per text → one vector per text (plain string arrays are aggregated into a single vector).
      contents: request.texts.map((text) => ({ parts: [{ text }] })),
      config: {
        outputDimensionality: request.dim,
        abortSignal: request.signal,
        httpOptions: { timeout: request.timeoutMs, retryOptions: { attempts: 1 } },
      },
    });
    return (response.embeddings ?? []).map((e) => e.values ?? []);
  }
}

interface DescribedError {
  status: number | undefined;
  message: string;
  name: string;
  headers: unknown;
  body: string;
}

function describeError(err: unknown): DescribedError {
  const record: Record<string, unknown> = typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : {};
  const numeric = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
  const status = numeric(record['status']) ?? numeric(record['statusCode']) ?? numeric(record['code']);
  const message = err instanceof Error ? err.message : String(err);
  const rawBody = record['body'] ?? record['error'];
  let body = '';
  if (typeof rawBody === 'string') body = rawBody;
  else if (rawBody !== undefined) {
    try {
      body = JSON.stringify(rawBody);
    } catch {
      body = '';
    }
  }
  const name = err instanceof Error ? `${err.name} ${err.constructor.name}` : '';
  return { status, message, name, headers: record['headers'], body };
}

export function classifyGeminiError(err: unknown, abortedByCaller: boolean, timedOut: boolean): ProviderErrorInitParts {
  const d = describeError(err);
  const text = `${d.message} ${d.body}`;
  let kind: ProviderErrorKind;
  if (abortedByCaller) kind = 'aborted';
  else if (timedOut || /timeout/i.test(d.name)) kind = 'timeout';
  else if (/abort/i.test(d.name)) kind = 'aborted';
  else if (/RESOURCE_EXHAUSTED/.test(text)) kind = 'rate_limited';
  else if (d.status !== undefined) kind = kindForStatus(d.status);
  else if (/API key not valid|PERMISSION_DENIED|UNAUTHENTICATED/i.test(text)) kind = 'auth';
  else if (/connection|ECONNRESET|ENOTFOUND|fetch failed/i.test(`${d.name} ${text}`)) kind = 'unavailable';
  else kind = 'unavailable';
  if (kind === 'bad_request' && /SAFETY|blocked/i.test(text)) kind = 'content_blocked';

  const headerSnapshot = parseRateLimitHeaders(headerGetterFrom(d.headers));
  const retryAfterMs = parseGoogleRetryDelayMs(text) ?? headerSnapshot.retryAfterMs;
  return { kind, message: d.message, status: d.status, retryAfterMs };
}

interface ProviderErrorInitParts {
  kind: ProviderErrorKind;
  message: string;
  status: number | undefined;
  retryAfterMs: number | undefined;
}

export interface GeminiProviderOptions {
  apiKey?: string | undefined;
  transport?: GeminiTransport;
  now?: () => number;
}

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini' as const;
  readonly capabilities = { vision: true, json: true, maxImages: 3600, maxImageBytes: 20 * 1024 * 1024 };
  private readonly transport: GeminiTransport | undefined;
  private readonly now: () => number;

  constructor(private readonly options: GeminiProviderOptions) {
    this.transport = options.transport ?? (options.apiKey ? new SdkGeminiTransport(options.apiKey) : undefined);
    this.now = options.now ?? (() => Date.now());
  }

  isConfigured(): boolean {
    return this.transport !== undefined;
  }

  private toError(parts: ProviderErrorInitParts, model: string): ProviderError {
    return new ProviderError({
      kind: parts.kind,
      message: parts.message,
      provider: 'gemini',
      model,
      ...(parts.status === undefined ? {} : { status: parts.status }),
      ...(parts.retryAfterMs === undefined ? {} : { retryAfterMs: parts.retryAfterMs }),
    });
  }

  async generateStructured<T>(opts: GenerateStructuredOptions<T>): Promise<Result<T>> {
    const model = opts.model ?? '';
    const meta: CallMeta = { provider: 'gemini', model, latencyMs: 0, tokensIn: 0, tokensOut: 0 };
    const fail = (error: ProviderError): Result<T> => ({ ok: false, error, meta });

    if (!this.transport) {
      return fail(new ProviderError({ kind: 'not_configured', message: 'GEMINI_API_KEY is not set', provider: 'gemini', model }));
    }
    const spec = getModelSpec(model);
    if (!spec || spec.provider !== 'gemini' || spec.kind !== 'chat') {
      return fail(new ProviderError({ kind: 'unsupported', message: `Unknown Gemini model ${model}`, provider: 'gemini', model }));
    }

    const params = opts.params ?? {};
    const request: InteractionRequest = {
      model,
      system: opts.system,
      // Docs: with a single image, put the text prompt before the image.
      input: [
        { type: 'text', text: opts.user },
        ...(opts.images ?? []).map(
          (img): GeminiInputPart => ({ type: 'image', data: img.data.toString('base64'), mime_type: img.mimeType }),
        ),
      ],
      schema: forGemini(toJsonSchema(opts.providerSchema ?? opts.schema)),
      maxOutputTokens: outputTokenLimit(opts.maxTokens, params, spec),
      ...(params.thinkingLevel ? { thinkingLevel: params.thinkingLevel } : {}),
    };

    const started = this.now();
    const timeoutMs = opts.timeoutMs ?? 60_000;
    const timer = withTimeout(opts.signal, timeoutMs);
    let response: InteractionResponse;
    try {
      response = await this.transport.createInteraction(request, { signal: timer.signal, timeoutMs });
    } catch (err) {
      meta.latencyMs = this.now() - started;
      return fail(this.toError(classifyGeminiError(err, timer.abortedByCaller(), timer.timedOut()), model));
    }
    meta.latencyMs = this.now() - started;
    meta.tokensIn = response.tokensIn;
    meta.tokensOut = response.tokensOut;
    if (response.headers) meta.rateLimit = parseRateLimitHeaders(headerGetterFrom(response.headers));

    const raw = response.outputText ?? '';
    if (response.status !== undefined && response.status !== 'completed') {
      const truncated = response.status === 'incomplete' || response.status === 'budget_exceeded';
      return fail(
        new ProviderError({
          kind: truncated ? 'invalid_output' : 'unavailable',
          message: `Interaction status: ${response.status}`,
          provider: 'gemini',
          model,
          raw,
          ...(truncated ? { issues: ['(root): çıktı yarıda kesildi, daha kısa yanıt ver'] } : {}),
        }),
      );
    }
    const validated = validateOutput(opts.schema, raw, { provider: 'gemini', model });
    if (!validated.ok) return fail(validated.error);
    return { ok: true, value: validated.value, raw, meta };
  }

  async embed(texts: string[], opts: EmbedOptions = {}): Promise<number[][]> {
    const model = opts.model ?? '';
    if (!this.transport) {
      throw new ProviderError({ kind: 'not_configured', message: 'GEMINI_API_KEY is not set', provider: 'gemini', model });
    }
    const dim = opts.dim ?? 768;
    const timeoutMs = opts.timeoutMs ?? 15_000;
    const vectors: number[][] = [];
    const CHUNK = 32;
    for (let i = 0; i < texts.length; i += CHUNK) {
      const chunk = texts.slice(i, i + CHUNK);
      const timer = withTimeout(opts.signal, timeoutMs);
      try {
        const result = await this.transport.embed({ model, texts: chunk, dim, signal: timer.signal, timeoutMs });
        if (result.length !== chunk.length || result.some((v) => v.length !== dim)) {
          throw new ProviderError({
            kind: 'invalid_output',
            message: `Embedding shape mismatch (expected ${chunk.length}×${dim})`,
            provider: 'gemini',
            model,
          });
        }
        vectors.push(...result);
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        throw this.toError(classifyGeminiError(err, timer.abortedByCaller(), timer.timedOut()), model);
      }
    }
    return vectors;
  }
}
