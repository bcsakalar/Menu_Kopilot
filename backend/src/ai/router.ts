import { type ProviderName, TASK_TIMEOUT_MS, type TaskKey, getModelSpec } from '../config/models.js';
import type { PromptKey } from '../db/seed/prompts.js';
import { RequestBudget, estimateRequestTokens, estimateTextTokens } from './budget.js';
import type { CircuitBreaker } from './circuit-breaker.js';
import { ProviderError, type ProviderErrorKind } from './errors.js';
import { describeSchema, toJsonSchema } from './json-schema.js';
import { type CooldownTracker, backoffDelayMs, sleep as defaultSleep } from './rate-limit.js';
import type { ResolvedRoute } from './route-repository.js';
import type { AudioInput, CallMeta, GenerateStructuredOptions, LLMProvider, Result, Transcription } from './types.js';
import type { QuotaStatus, UsageSink } from './usage.js';

export type RouterRequest<T> = Omit<GenerateStructuredOptions<T>, 'model' | 'params' | 'signal' | 'timeoutMs' | 'jsonInstructions'>;

export interface CallContext {
  userId?: string | undefined;
  runId?: string | undefined;
  budget?: RequestBudget | undefined;
  signal?: AbortSignal | undefined;
}

export interface AttemptRecord {
  provider: ProviderName;
  model: string;
  outcome: 'ok' | 'skipped' | ProviderErrorKind;
  reason?: string;
  latencyMs?: number;
}

/** The error once a chain is exhausted without a usable answer: "no key for any route" is not a transient outage. */
function exhaustedError(attempts: readonly AttemptRecord[], lastError: ProviderError | undefined, message: string): ProviderError {
  if (lastError) return lastError;
  const unconfigured = attempts.length > 0 && attempts.every((a) => a.outcome === 'skipped' && a.reason === 'not_configured');
  return unconfigured
    ? new ProviderError({ kind: 'not_configured', message: 'Bu görev için AI anahtarı tanımlı değil' })
    : new ProviderError({ kind: 'unavailable', message });
}

export type RoutedResult<T> =
  | { ok: true; value: T; raw: string; meta: CallMeta; route: ResolvedRoute; attempts: AttemptRecord[] }
  | { ok: false; error: ProviderError; route?: ResolvedRoute; attempts: AttemptRecord[] };

export type EmbedResult =
  | { ok: true; vectors: number[][]; model: string; dim: number; attempts: AttemptRecord[] }
  | { ok: false; error: ProviderError; attempts: AttemptRecord[] };

export interface RouteSource {
  chain(task: TaskKey): Promise<ResolvedRoute[]>;
}

export interface PromptRenderer {
  render(key: PromptKey, vars?: Readonly<Record<string, string | number>>): Promise<{ text: string; version: number }>;
}

export interface AiRouterDeps {
  providers: Partial<Record<ProviderName, LLMProvider>>;
  routes: RouteSource;
  breaker: CircuitBreaker;
  cooldowns: CooldownTracker;
  usage: UsageSink;
  quota?: { status(userId: string | undefined): Promise<QuotaStatus> };
  prompts?: PromptRenderer;
  localOnly: boolean;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  /** 429s asking to wait at most this long are retried on the same provider once. */
  maxInlineRetryMs?: number;
  /** Auth failures (bad key) take the provider out for this long. */
  authTripMs?: number;
}

/**
 * Task router: resolves the provider chain for a task from `provider_configs`, skips providers that are
 * unconfigured / circuit-open / cooling down / incapable, and falls back down the chain on provider errors.
 * Invalid model output is returned to the caller, which owns the single repair attempt.
 */
export class AiRouter {
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly random: () => number;
  private readonly maxInlineRetryMs: number;
  private readonly authTripMs: number;

  constructor(private readonly deps: AiRouterDeps) {
    this.sleep = deps.sleep ?? defaultSleep;
    this.random = deps.random ?? Math.random;
    this.maxInlineRetryMs = deps.maxInlineRetryMs ?? 3000;
    this.authTripMs = deps.authTripMs ?? 10 * 60_000;
  }

  get localOnly(): boolean {
    return this.deps.localOnly;
  }

  isProviderConfigured(name: ProviderName): boolean {
    return this.deps.providers[name]?.isConfigured() ?? false;
  }

  /** Cheap pre-flight used by pipelines to decide between LLM and DB-only mode. */
  async availability(userId: string | undefined): Promise<{ ok: true } | { ok: false; error: ProviderError }> {
    if (this.deps.localOnly) {
      return { ok: false, error: new ProviderError({ kind: 'local_only', message: 'LOCAL_ONLY_MODE açık' }) };
    }
    if (!Object.values(this.deps.providers).some((provider) => provider?.isConfigured())) {
      return {
        ok: false,
        error: new ProviderError({ kind: 'not_configured', message: 'AI anahtarı tanımlı değil (GEMINI_API_KEY / GROQ_API_KEY)' }),
      };
    }
    if (this.deps.quota) {
      const status = await this.deps.quota.status(userId);
      if (!status.allowed) {
        return { ok: false, error: new ProviderError({ kind: 'quota_exceeded', message: 'Günlük kota doldu' }) };
      }
    }
    return { ok: true };
  }

  private skipReason(route: ResolvedRoute, request: { images?: RouterRequest<unknown>['images'] }): string | undefined {
    const provider = this.deps.providers[route.provider];
    if (!provider || !provider.isConfigured()) return 'not_configured';
    const spec = getModelSpec(route.model);
    if (!spec) return 'unknown_model';
    const images = request.images ?? [];
    if (images.length > 0) {
      if (!spec.vision) return 'no_vision';
      if (images.length > spec.maxImages) return 'too_many_images';
      const bytes = images.reduce((sum, img) => sum + img.data.length, 0);
      // base64 inflates payloads by ~4/3.
      if (Math.ceil((bytes * 4) / 3) > spec.maxRequestBytes) return 'request_too_large';
    }
    if (this.deps.breaker.state(route.provider) === 'open') return 'circuit_open';
    if (this.deps.cooldowns.isCooling(`${route.provider}:${route.model}`)) return 'cooling_down';
    return undefined;
  }

  private async jsonInstructionsFor<T>(request: RouterRequest<T>): Promise<string | undefined> {
    if (!this.deps.prompts) return undefined;
    const schema = describeSchema(toJsonSchema(request.providerSchema ?? request.schema));
    try {
      return (await this.deps.prompts.render('json.instructions', { schema })).text;
    } catch {
      return undefined;
    }
  }

  private async tryRoute<T>(
    request: RouterRequest<T>,
    route: ResolvedRoute,
    ctx: CallContext,
    attempts: AttemptRecord[],
  ): Promise<Result<T>> {
    const provider = this.deps.providers[route.provider];
    const spec = getModelSpec(route.model);
    const meta: CallMeta = { provider: route.provider, model: route.model, latencyMs: 0, tokensIn: 0, tokensOut: 0 };
    const fail = (kind: ProviderErrorKind, message: string): Result<T> => ({
      ok: false,
      error: new ProviderError({ kind, message, provider: route.provider, model: route.model }),
      meta,
    });
    if (!provider) return fail('not_configured', 'provider missing');

    const estimate = estimateRequestTokens(spec, request.system, request.user, request.images ?? []);
    const jsonInstructions = spec?.structured === 'json_object' ? await this.jsonInstructionsFor(request) : undefined;
    let last: Result<T> = fail('unavailable', 'not attempted');

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (ctx.signal?.aborted) return fail('aborted', 'cancelled');
      if (ctx.budget && !ctx.budget.canAfford(estimate)) return fail('budget_exceeded', 'İstek bütçesi doldu');
      if (!this.deps.breaker.canRequest(route.provider)) return fail('unavailable', 'circuit open');

      const result = await provider.generateStructured({
        ...request,
        model: route.model,
        params: route.params,
        timeoutMs: TASK_TIMEOUT_MS[request.task],
        ...(ctx.signal ? { signal: ctx.signal } : {}),
        ...(jsonInstructions ? { jsonInstructions } : {}),
      });
      last = result;
      const tokensIn = result.meta.tokensIn > 0 ? result.meta.tokensIn : estimate;
      // Only calls the model actually processed count toward the per-request budget (a 503 or 429 costs nothing).
      const processed = result.ok || result.error.kind === 'invalid_output' || result.meta.tokensOut > 0;
      if (processed) ctx.budget?.charge(tokensIn, result.meta.tokensOut);
      await this.deps.usage.log({
        userId: ctx.userId,
        runId: ctx.runId,
        taskKey: request.task,
        provider: route.provider,
        model: route.model,
        tokensIn,
        tokensOut: result.meta.tokensOut,
        latencyMs: result.meta.latencyMs,
        success: result.ok,
        errorCode: result.ok ? undefined : result.error.kind,
      });
      attempts.push({
        provider: route.provider,
        model: route.model,
        outcome: result.ok ? 'ok' : result.error.kind,
        latencyMs: result.meta.latencyMs,
      });

      if (result.ok) {
        this.deps.breaker.recordSuccess(route.provider);
        this.deps.cooldowns.observe(`${route.provider}:${route.model}`, result.meta.rateLimit);
        return result;
      }

      const error = result.error;
      switch (error.kind) {
        case 'rate_limited': {
          this.deps.breaker.release(route.provider);
          const wait = error.retryAfterMs;
          if (attempt === 0 && wait !== undefined && wait <= this.maxInlineRetryMs) {
            try {
              await this.sleep(wait + Math.round(this.random() * 250), ctx.signal);
            } catch {
              return fail('aborted', 'cancelled');
            }
            continue;
          }
          this.deps.cooldowns.cooldown(`${route.provider}:${route.model}`, wait ?? 30_000);
          return result;
        }
        case 'unavailable': {
          this.deps.breaker.recordFailure(route.provider);
          if (attempt === 0 && this.deps.breaker.state(route.provider) === 'closed') {
            try {
              await this.sleep(backoffDelayMs(0, { random: this.random }), ctx.signal);
            } catch {
              return fail('aborted', 'cancelled');
            }
            continue;
          }
          return result;
        }
        case 'timeout':
          // No same-provider retry: a slow provider should hand over to the next one immediately.
          this.deps.breaker.recordFailure(route.provider);
          return result;
        case 'auth':
        case 'not_configured':
          this.deps.breaker.trip(route.provider, this.authTripMs);
          return result;
        case 'invalid_output':
        case 'bad_request':
        case 'unsupported':
        case 'content_blocked':
        case 'aborted':
        case 'local_only':
        case 'quota_exceeded':
        case 'budget_exceeded':
          this.deps.breaker.release(route.provider);
          return result;
      }
    }
    return last;
  }

  /** Runs the task down its provider chain until one succeeds. */
  async generate<T>(request: RouterRequest<T>, ctx: CallContext = {}): Promise<RoutedResult<T>> {
    const attempts: AttemptRecord[] = [];
    const available = await this.availability(ctx.userId);
    if (!available.ok) return { ok: false, error: available.error, attempts };

    const chain = await this.deps.routes.chain(request.task);
    let lastError: ProviderError | undefined;
    let lastRoute: ResolvedRoute | undefined;
    for (const route of chain) {
      const skip = this.skipReason(route, request);
      if (skip) {
        attempts.push({ provider: route.provider, model: route.model, outcome: 'skipped', reason: skip });
        continue;
      }
      const result = await this.tryRoute(request, route, ctx, attempts);
      if (result.ok) return { ...result, route, attempts };
      lastError = result.error;
      lastRoute = route;
      const kind = result.error.kind;
      if (kind === 'invalid_output' || kind === 'aborted' || kind === 'budget_exceeded') {
        return { ok: false, error: result.error, route, attempts };
      }
    }
    return {
      ok: false,
      error: exhaustedError(attempts, lastError, 'Bu görev için kullanılabilir sağlayıcı yok (limit/devre)'),
      ...(lastRoute ? { route: lastRoute } : {}),
      attempts,
    };
  }

  /** Single attempt on a specific route — used for the one repair call after invalid output. */
  async generateOnRoute<T>(request: RouterRequest<T>, route: ResolvedRoute, ctx: CallContext = {}): Promise<RoutedResult<T>> {
    const attempts: AttemptRecord[] = [];
    const available = await this.availability(ctx.userId);
    if (!available.ok) return { ok: false, error: available.error, attempts };
    const skip = this.skipReason(route, request);
    if (skip) {
      attempts.push({ provider: route.provider, model: route.model, outcome: 'skipped', reason: skip });
      return { ok: false, error: new ProviderError({ kind: 'unavailable', message: skip }), route, attempts };
    }
    const result = await this.tryRoute(request, route, ctx, attempts);
    return result.ok ? { ...result, route, attempts } : { ok: false, error: result.error, route, attempts };
  }

  /** Embeddings down the `embed` chain. Not charged to the per-request LLM budget. */
  async embed(texts: string[], ctx: CallContext = {}): Promise<EmbedResult> {
    const attempts: AttemptRecord[] = [];
    if (texts.length === 0) return { ok: true, vectors: [], model: '', dim: 0, attempts };
    const available = await this.availability(ctx.userId);
    if (!available.ok) return { ok: false, error: available.error, attempts };

    let lastError: ProviderError | undefined;
    for (const route of await this.deps.routes.chain('embed')) {
      const skip = this.skipReason(route, {});
      const provider = this.deps.providers[route.provider];
      if (skip || !provider) {
        attempts.push({ provider: route.provider, model: route.model, outcome: 'skipped', reason: skip ?? 'missing' });
        continue;
      }
      if (!this.deps.breaker.canRequest(route.provider)) continue;
      const dim = route.params.dim ?? 768;
      const started = Date.now();
      const tokensIn = texts.reduce((sum, t) => sum + estimateTextTokens(t), 0);
      try {
        const vectors = await provider.embed(texts, {
          model: route.model,
          dim,
          timeoutMs: TASK_TIMEOUT_MS.embed,
          ...(ctx.signal ? { signal: ctx.signal } : {}),
        });
        this.deps.breaker.recordSuccess(route.provider);
        await this.deps.usage.log({
          userId: ctx.userId,
          runId: ctx.runId,
          taskKey: 'embed',
          provider: route.provider,
          model: route.model,
          tokensIn,
          tokensOut: 0,
          latencyMs: Date.now() - started,
          success: true,
        });
        attempts.push({ provider: route.provider, model: route.model, outcome: 'ok' });
        return { ok: true, vectors, model: route.model, dim, attempts };
      } catch (err) {
        const error =
          err instanceof ProviderError
            ? err
            : new ProviderError({ kind: 'unavailable', message: err instanceof Error ? err.message : String(err) });
        lastError = error;
        await this.deps.usage.log({
          userId: ctx.userId,
          runId: ctx.runId,
          taskKey: 'embed',
          provider: route.provider,
          model: route.model,
          tokensIn,
          tokensOut: 0,
          latencyMs: Date.now() - started,
          success: false,
          errorCode: error.kind,
        });
        attempts.push({ provider: route.provider, model: route.model, outcome: error.kind });
        if (error.kind === 'rate_limited') {
          this.deps.breaker.release(route.provider);
          this.deps.cooldowns.cooldown(`${route.provider}:${route.model}`, error.retryAfterMs ?? 30_000);
        } else if (error.kind === 'auth' || error.kind === 'not_configured') {
          this.deps.breaker.trip(route.provider, this.authTripMs);
        } else if (error.kind === 'unavailable' || error.kind === 'timeout') {
          this.deps.breaker.recordFailure(route.provider);
        } else {
          this.deps.breaker.release(route.provider);
        }
        if (error.kind === 'aborted') break;
      }
    }
    return {
      ok: false,
      error: exhaustedError(attempts, lastError, 'Embedding sağlayıcısı yok'),
      attempts,
    };
  }

  /** Speech-to-text down the `audio.transcribe` chain (voice notes). Not charged to a request budget. */
  async transcribe(
    audio: AudioInput,
    request: { language?: string | undefined; prompt?: string | undefined },
    ctx: CallContext = {},
  ): Promise<TranscribeResult> {
    const attempts: AttemptRecord[] = [];
    const available = await this.availability(ctx.userId);
    if (!available.ok) return { ok: false, error: available.error, attempts };

    let lastError: ProviderError | undefined;
    for (const route of await this.deps.routes.chain('audio.transcribe')) {
      const provider = this.deps.providers[route.provider];
      const skip = this.skipReason(route, {}) ?? (provider?.transcribe ? undefined : 'no_audio_support');
      if (skip || !provider?.transcribe) {
        attempts.push({ provider: route.provider, model: route.model, outcome: 'skipped', reason: skip ?? 'missing' });
        continue;
      }
      if (!this.deps.breaker.canRequest(route.provider)) continue;
      const result = await provider.transcribe(audio, {
        model: route.model,
        timeoutMs: TASK_TIMEOUT_MS['audio.transcribe'],
        ...(request.language ? { language: request.language } : {}),
        ...(request.prompt ? { prompt: request.prompt } : {}),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      });
      await this.deps.usage.log({
        userId: ctx.userId,
        runId: ctx.runId,
        taskKey: 'audio.transcribe',
        provider: route.provider,
        model: route.model,
        tokensIn: 0,
        tokensOut: result.ok ? estimateTextTokens(result.value.text) : 0,
        latencyMs: result.meta.latencyMs,
        success: result.ok,
        errorCode: result.ok ? undefined : result.error.kind,
      });
      attempts.push({
        provider: route.provider,
        model: route.model,
        outcome: result.ok ? 'ok' : result.error.kind,
        latencyMs: result.meta.latencyMs,
      });
      if (result.ok) {
        this.deps.breaker.recordSuccess(route.provider);
        this.deps.cooldowns.observe(`${route.provider}:${route.model}`, result.meta.rateLimit);
        return { ok: true, value: result.value, provider: route.provider, model: route.model, attempts };
      }
      const error = result.error;
      lastError = error;
      if (error.kind === 'rate_limited') {
        this.deps.breaker.release(route.provider);
        this.deps.cooldowns.cooldown(`${route.provider}:${route.model}`, error.retryAfterMs ?? 30_000);
      } else if (error.kind === 'auth' || error.kind === 'not_configured') {
        this.deps.breaker.trip(route.provider, this.authTripMs);
      } else if (error.kind === 'unavailable' || error.kind === 'timeout') {
        this.deps.breaker.recordFailure(route.provider);
      } else {
        // The recording itself is the problem (too large, unreadable, cancelled): another model will not help.
        this.deps.breaker.release(route.provider);
        return { ok: false, error, attempts };
      }
    }
    return {
      ok: false,
      error: exhaustedError(attempts, lastError, 'Ses tanıma sağlayıcısı yok (limit/devre)'),
      attempts,
    };
  }
}

export type TranscribeResult =
  | { ok: true; value: Transcription; provider: ProviderName; model: string; attempts: AttemptRecord[] }
  | { ok: false; error: ProviderError; attempts: AttemptRecord[] };

export { RequestBudget };
