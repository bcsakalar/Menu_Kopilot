import { z } from 'zod';
import { getModelSpec } from '../../config/models.js';
import { ProviderError, kindForStatus } from '../errors.js';
import { forGroqStrict, toJsonSchema } from '../json-schema.js';
import { parseRateLimitHeaders } from '../rate-limit.js';
import type {
  AudioInput,
  CallMeta,
  EmbedOptions,
  GenerateStructuredOptions,
  LLMProvider,
  Result,
  TranscribeOptions,
  Transcription,
  WebSource,
} from '../types.js';
import { validateOutput, withTimeout } from './shared.js';

/**
 * Groq via its OpenAI-compatible `/chat/completions` endpoint (native fetch, no SDK):
 * strict json_schema for gpt-oss / qwen3.8, JSON mode + prompt-embedded schema for qwen3.6.
 */

const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

const searchResultSchema = z.object({ title: z.string().nullish(), url: z.string().nullish() });

/** Groq compound: tools the system ran server-side; web search results carry title + url. Parsed leniently. */
const executedToolSchema = z.object({
  type: z.string().nullish(),
  search_results: z
    .union([z.array(searchResultSchema), z.object({ results: z.array(searchResultSchema).nullish() })])
    .nullish(),
});

const chatResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullish(),
          executed_tools: z.array(executedToolSchema).nullish().catch(null),
        }),
        finish_reason: z.string().nullish(),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() }).optional(),
});

const transcriptionSchema = z.object({
  text: z.string(),
  language: z.string().nullish(),
  duration: z.number().nullish(),
});

function sourcesOf(tools: z.infer<typeof executedToolSchema>[] | null | undefined): WebSource[] {
  const seen = new Set<string>();
  const sources: WebSource[] = [];
  for (const tool of tools ?? []) {
    const results = Array.isArray(tool.search_results) ? tool.search_results : (tool.search_results?.results ?? []);
    for (const result of results) {
      const url = result.url?.trim();
      if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
      seen.add(url);
      sources.push({ title: result.title?.trim() || url, url });
    }
  }
  return sources;
}

const errorBodySchema = z.object({
  error: z.object({
    message: z.string().optional(),
    type: z.string().optional(),
    code: z.string().nullish(),
    failed_generation: z.string().optional(),
  }),
});

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface GroqProviderOptions {
  apiKey?: string | undefined;
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
}

export class GroqProvider implements LLMProvider {
  readonly name = 'groq' as const;
  readonly capabilities = { vision: true, json: true, maxImages: 5, maxImageBytes: 20 * 1024 * 1024 };
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: GroqProviderOptions) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? (() => Date.now());
  }

  isConfigured(): boolean {
    return Boolean(this.options.apiKey);
  }

  async generateStructured<T>(opts: GenerateStructuredOptions<T>): Promise<Result<T>> {
    const model = opts.model ?? '';
    const meta: CallMeta = { provider: 'groq', model, latencyMs: 0, tokensIn: 0, tokensOut: 0 };
    const fail = (error: ProviderError): Result<T> => ({ ok: false, error, meta });

    if (!this.options.apiKey) {
      return fail(new ProviderError({ kind: 'not_configured', message: 'GROQ_API_KEY is not set', provider: 'groq', model }));
    }
    const spec = getModelSpec(model);
    if (!spec || spec.provider !== 'groq') {
      return fail(new ProviderError({ kind: 'unsupported', message: `Unknown Groq model ${model}`, provider: 'groq', model }));
    }
    if ((opts.images?.length ?? 0) > 0 && !spec.vision) {
      return fail(new ProviderError({ kind: 'unsupported', message: `${model} has no vision`, provider: 'groq', model }));
    }

    const jsonSchema = toJsonSchema(opts.providerSchema ?? opts.schema);
    const strict = spec.structured === 'strict';
    const system = strict
      ? opts.system
      : `${opts.system}\n\n${opts.jsonInstructions ?? `JSON schema:\n${JSON.stringify(jsonSchema)}`}`;

    const userContent: string | ContentPart[] =
      opts.images && opts.images.length > 0
        ? [
            { type: 'text', text: opts.user },
            ...opts.images.map(
              (img): ContentPart => ({
                type: 'image_url',
                image_url: { url: `data:${img.mimeType};base64,${img.data.toString('base64')}` },
              }),
            ),
          ]
        : opts.user;

    const params = opts.params ?? {};
    const compound = spec.kind === 'compound';
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      max_completion_tokens: Math.min(opts.maxTokens ?? params.maxOutputTokens ?? 4096, spec.maxOutputTokens),
      stream: false,
      response_format: strict
        ? { type: 'json_schema', json_schema: { name: opts.schemaName ?? 'output', strict: true, schema: forGroqStrict(jsonSchema) } }
        : { type: 'json_object' },
    };
    if (compound) {
      // Agentic system: only the built-in tools we allow; sampling/reasoning knobs are not documented for it.
      if (params.enabledTools && params.enabledTools.length > 0) {
        body['compound_custom'] = { tools: { enabled_tools: params.enabledTools } };
      }
    } else {
      body['temperature'] = params.temperature !== undefined && params.temperature > 0 ? params.temperature : 0.3;
      if (params.reasoningEffort) body['reasoning_effort'] = params.reasoningEffort;
      if (spec.reasoningControl === 'include_reasoning') body['include_reasoning'] = false;
      if (spec.reasoningControl === 'reasoning_format') body['reasoning_format'] = 'hidden';
    }

    const started = this.now();
    const timer = withTimeout(opts.signal, opts.timeoutMs);
    let response: Response;
    let text: string;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.options.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: timer.signal,
      });
      text = await response.text();
    } catch (err) {
      meta.latencyMs = this.now() - started;
      const kind = timer.abortedByCaller() ? 'aborted' : timer.timedOut() ? 'timeout' : 'unavailable';
      return fail(
        new ProviderError({ kind, message: err instanceof Error ? err.message : 'network error', provider: 'groq', model }),
      );
    }
    meta.latencyMs = this.now() - started;
    meta.rateLimit = parseRateLimitHeaders((name) => response.headers.get(name));

    if (!response.ok) return fail(this.httpError(response.status, text, meta, model));

    let parsed: z.infer<typeof chatResponseSchema>;
    try {
      parsed = chatResponseSchema.parse(JSON.parse(text));
    } catch {
      return fail(new ProviderError({ kind: 'unavailable', message: 'Unexpected Groq response shape', provider: 'groq', model }));
    }
    meta.tokensIn = parsed.usage?.prompt_tokens ?? 0;
    meta.tokensOut = parsed.usage?.completion_tokens ?? 0;
    const choice = parsed.choices[0];
    const content = choice?.message.content ?? '';
    const sources = sourcesOf(choice?.message.executed_tools);
    if (sources.length > 0) meta.sources = sources;
    if (choice?.finish_reason === 'length') {
      return fail(
        new ProviderError({
          kind: 'invalid_output',
          message: 'Output truncated (max tokens)',
          provider: 'groq',
          model,
          raw: content,
          issues: ['(root): çıktı yarıda kesildi, daha kısa yanıt ver'],
        }),
      );
    }
    const validated = validateOutput(opts.schema, content, { provider: 'groq', model });
    if (!validated.ok) return fail(validated.error);
    return { ok: true, value: validated.value, raw: content, meta };
  }

  /** Maps a non-2xx Groq response to a ProviderError (json_validate_failed → invalid_output with the raw text). */
  private httpError(status: number, text: string, meta: CallMeta, model: string): ProviderError {
    let parsedError: z.infer<typeof errorBodySchema> | undefined;
    try {
      const candidate = errorBodySchema.safeParse(JSON.parse(text));
      if (candidate.success) parsedError = candidate.data;
    } catch {
      parsedError = undefined;
    }
    const message = parsedError?.error.message ?? `Groq HTTP ${status}`;
    if (status === 400 && parsedError?.error.code === 'json_validate_failed') {
      return new ProviderError({
        kind: 'invalid_output',
        message,
        provider: 'groq',
        model,
        status: 400,
        raw: parsedError.error.failed_generation ?? '',
        issues: ['(root): model çıktısı şemaya uymadı'],
      });
    }
    const kind = kindForStatus(status);
    const retryAfterMs =
      kind === 'rate_limited'
        ? (meta.rateLimit?.retryAfterMs ?? meta.rateLimit?.resetTokensMs ?? meta.rateLimit?.resetRequestsMs)
        : undefined;
    return new ProviderError({
      kind,
      message,
      provider: 'groq',
      model,
      status,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    });
  }

  /** Whisper via `/audio/transcriptions` (multipart). `verbose_json` also returns language and duration. */
  async transcribe(audio: AudioInput, opts: TranscribeOptions): Promise<Result<Transcription>> {
    const model = opts.model;
    const meta: CallMeta = { provider: 'groq', model, latencyMs: 0, tokensIn: 0, tokensOut: 0 };
    const fail = (error: ProviderError): Result<Transcription> => ({ ok: false, error, meta });
    if (!this.options.apiKey) {
      return fail(new ProviderError({ kind: 'not_configured', message: 'GROQ_API_KEY is not set', provider: 'groq', model }));
    }
    const spec = getModelSpec(model);
    if (!spec || spec.provider !== 'groq' || spec.kind !== 'audio') {
      return fail(new ProviderError({ kind: 'unsupported', message: `${model} is not a Groq audio model`, provider: 'groq', model }));
    }
    if (audio.data.length > spec.maxRequestBytes) {
      return fail(new ProviderError({ kind: 'bad_request', message: 'Ses dosyası çok büyük', provider: 'groq', model }));
    }

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio.data)], { type: audio.mimeType }), audio.fileName);
    form.append('model', model);
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0');
    if (opts.language) form.append('language', opts.language);
    if (opts.prompt) form.append('prompt', opts.prompt);

    const started = this.now();
    const timer = withTimeout(opts.signal, opts.timeoutMs);
    let response: Response;
    let text: string;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.options.apiKey}` },
        body: form,
        signal: timer.signal,
      });
      text = await response.text();
    } catch (err) {
      meta.latencyMs = this.now() - started;
      const kind = timer.abortedByCaller() ? 'aborted' : timer.timedOut() ? 'timeout' : 'unavailable';
      return fail(new ProviderError({ kind, message: err instanceof Error ? err.message : 'network error', provider: 'groq', model }));
    }
    meta.latencyMs = this.now() - started;
    meta.rateLimit = parseRateLimitHeaders((name) => response.headers.get(name));
    if (!response.ok) return fail(this.httpError(response.status, text, meta, model));

    let parsed: z.infer<typeof transcriptionSchema>;
    try {
      parsed = transcriptionSchema.parse(JSON.parse(text));
    } catch {
      return fail(new ProviderError({ kind: 'unavailable', message: 'Unexpected Groq transcription shape', provider: 'groq', model }));
    }
    return {
      ok: true,
      value: {
        text: parsed.text.trim(),
        ...(parsed.language ? { language: parsed.language } : {}),
        ...(parsed.duration !== null && parsed.duration !== undefined ? { durationSec: parsed.duration } : {}),
      },
      raw: text,
      meta,
    };
  }

  embed(_texts: string[], _opts?: EmbedOptions): Promise<number[][]> {
    return Promise.reject(
      new ProviderError({ kind: 'unsupported', message: 'Groq does not offer embeddings', provider: 'groq' }),
    );
  }
}
