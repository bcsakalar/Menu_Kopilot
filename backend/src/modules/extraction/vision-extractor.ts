import { type ZodType, z } from 'zod';
import type { ProviderError } from '../../ai/errors.js';
import type { PromptRepository } from '../../ai/prompt-repository.js';
import type { AiRouter, AttemptRecord, CallContext } from '../../ai/router.js';
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
    let result = await this.router.generate(request, ctx);
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
}
