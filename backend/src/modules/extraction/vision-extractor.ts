import { type ZodType, z } from 'zod';
import type { ProviderError } from '../../ai/errors.js';
import type { PromptRepository } from '../../ai/prompt-repository.js';
import type { AiRouter, AttemptRecord, CallContext, RoutedResult, RouterRequest } from '../../ai/router.js';
import type { ImageInput } from '../../ai/types.js';
import { type Cache, getJson, setJson } from '../../cache/cache.js';
import type { TaskKey } from '../../config/models.js';
import type { PromptKey } from '../../db/seed/prompts.js';
import { sha256Hex } from '../../lib/images.js';
import { itemsEnvelopeSchema } from '../../agents/schemas/shared.js';

/**
 * Stage A — read-only extraction from ONE image per call (long menus break JSON most often with many images).
 * Results are cached per image hash + prompt versions for 30 days, so the same photo never costs twice.
 */

/**
 * A read that has not answered after this long gets company: the same photo starts on the next provider of the chain
 * and the first good answer wins (D-195). Measured on production: a menu photo reads in 4.5 s (median), but one read
 * in eight hung for the whole 18 s timeout before the next provider answered in 2 s — during a call with the seller.
 * Not simply a shorter timeout: a long menu can take 9 s on the first provider, and the next one caps its output
 * (1000 tokens), so cutting the first short would trade a slow full read for a fast partial one.
 */
export const HEDGE_AFTER_MS = 7_000;

export interface VisionExtractSpec<I> {
  task: TaskKey;
  systemKey: PromptKey;
  userKey: PromptKey;
  /** Advertised to the provider (constrained decoding). */
  schema: ZodType<{ items: I[] }>;
  /** Per-item validation; invalid items are dropped instead of failing the image. */
  itemSchema: ZodType<I>;
  schemaName: string;
  cacheNamespace: string;
  vars: Record<string, string>;
}

export type VisionExtractResult<I> =
  | { ok: true; items: I[]; cached: boolean; attempts: AttemptRecord[]; provider?: string; model?: string }
  | { ok: false; error: ProviderError; attempts: AttemptRecord[] };

export class VisionExtractor {
  constructor(
    private readonly router: AiRouter,
    private readonly prompts: PromptRepository,
    private readonly cache: Cache,
    private readonly ttlSeconds: number,
    private readonly hedgeAfterMs: number = HEDGE_AFTER_MS,
  ) {}

  async extract<I>(image: ImageInput, spec: VisionExtractSpec<I>, ctx: CallContext): Promise<VisionExtractResult<I>> {
    const tag = sha256Hex(await this.prompts.versionTag([spec.systemKey, spec.userKey, 'repair.user'])).slice(0, 12);
    const key = `mk:${spec.cacheNamespace}:${image.sha256}:${tag}`;
    const cached = await getJson(this.cache, key, z.object({ items: z.array(spec.itemSchema) }));
    if (cached) return { ok: true, items: cached.items, cached: true, attempts: [] };

    const system = (await this.prompts.render(spec.systemKey)).text;
    const user = (await this.prompts.render(spec.userKey, spec.vars)).text;
    const request = {
      task: spec.task,
      schema: itemsEnvelopeSchema,
      providerSchema: spec.schema,
      schemaName: spec.schemaName,
      system,
      user,
      images: [image],
    };
    let result = await this.hedged(request, ctx);
    const attempts = [...result.attempts];
    if (!result.ok && result.error.kind === 'invalid_output' && result.route) {
      const repair = await this.prompts.render('repair.user', {
        errors: (result.error.issues ?? []).join('\n'),
        previous: (result.error.raw ?? '').slice(0, 6000),
      });
      result = await this.router.generateOnRoute({ ...request, user: `${user}\n\n${repair.text}` }, result.route, ctx);
      attempts.push(...result.attempts);
    }
    if (!result.ok) return { ok: false, error: result.error, attempts };

    const items = result.value.items.flatMap((raw) => {
      const parsed = spec.itemSchema.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    });
    await setJson(this.cache, key, { items }, this.ttlSeconds);
    return { ok: true, items, cached: false, attempts, provider: result.meta.provider, model: result.meta.model };
  }

  /**
   * The chain in order, raced once (see [HEDGE_AFTER_MS]). The first good answer wins and the other call is
   * cancelled. A hedge that fails — a long menu cut by its output cap comes back as invalid JSON — does not end the
   * read: the first call keeps going down its chain as it always did.
   */
  private async hedged<T>(request: RouterRequest<T>, ctx: CallContext): Promise<RoutedResult<T>> {
    const primaryAbort = new AbortController();
    const hedgeAbort = new AbortController();
    const signalFor = (own: AbortController): AbortSignal => (ctx.signal ? AbortSignal.any([ctx.signal, own.signal]) : own.signal);
    const primary = this.router.generate(request, { ...ctx, signal: signalFor(primaryAbort) });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const hedgeDue = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), this.hedgeAfterMs);
    });
    const early = await Promise.race([primary, hedgeDue]);
    clearTimeout(timer);
    if (early !== null) return early;
    if (ctx.signal?.aborted) return primary;

    const hedge = this.router.generate({ ...request, routeOffset: 1 }, { ...ctx, signal: signalFor(hedgeAbort) });
    const winner = await new Promise<'primary' | 'hedge' | null>((resolve) => {
      let failed = 0;
      const settle = (name: 'primary' | 'hedge') => (result: RoutedResult<T>) => {
        if (result.ok) resolve(name);
        else if (++failed === 2) resolve(null);
      };
      void primary.then(settle('primary'));
      void hedge.then(settle('hedge'));
    });
    if (winner === 'primary') {
      hedgeAbort.abort();
      return primary;
    }
    if (winner === 'hedge') {
      // Not awaited: a provider that is slow to notice the cancel must not hold the answer back.
      primaryAbort.abort();
      return hedge;
    }
    const [first, second] = await Promise.all([primary, hedge]);
    return { ...first, attempts: [...first.attempts, ...second.attempts] };
  }
}
