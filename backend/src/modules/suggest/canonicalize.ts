import { z } from 'zod';
import type { PromptRepository } from '../../ai/prompt-repository.js';
import type { AiRouter, AttemptRecord, CallContext } from '../../ai/router.js';
import { type Cache, getJson, setJson } from '../../cache/cache.js';
import { sha256Hex } from '../../lib/images.js';
import type { NearMiss } from '../retrieval/retrieval.service.js';
import { canonicalizeItemSchema, canonicalizeSchema, itemsEnvelopeSchema } from './schemas.js';

/**
 * Stage B′ — cheap LLM canonicalization (flash-lite): maps unmatched names onto approved templates when trigram
 * found "near misses". A hit here avoids a far more expensive enrichment call. Decisions (including "no match")
 * are cached per name + candidate set + prompt version, so a repeated menu costs nothing.
 */

export interface CanonicalDecision {
  templateId: string | null;
  isProduct: boolean;
  confidence: number;
}

export const CANONICAL_MIN_CONFIDENCE = 0.8;
/** Only names whose best trigram near miss reaches this score are worth a canonicalize call. */
export const CANONICAL_TRIGGER_SCORE = 0.45;

const decisionSchema = z.object({ templateId: z.string().nullable(), isProduct: z.boolean(), confidence: z.number() });

export interface CanonicalizeDeps {
  router: AiRouter;
  prompts: PromptRepository;
  cache: Cache;
  ttlSeconds: number;
}

export async function canonicalize(
  deps: CanonicalizeDeps,
  cuisineId: string,
  inputs: readonly { name: string; rawName: string }[],
  nearMisses: ReadonlyMap<string, readonly NearMiss[]>,
  ctx: CallContext,
): Promise<{ decisions: Map<string, CanonicalDecision>; attempts: AttemptRecord[] }> {
  const decisions = new Map<string, CanonicalDecision>();
  const tag = sha256Hex(await deps.prompts.versionTag(['canonicalize.system', 'canonicalize.user'])).slice(0, 12);
  const keyOf = (name: string) => {
    const ids = (nearMisses.get(name) ?? []).slice(0, 5).map((m) => m.templateId).sort().join(',');
    return `mk:c:${cuisineId}:${sha256Hex(`${name}|${ids}`).slice(0, 24)}:${tag}`;
  };

  const pending: { name: string; rawName: string }[] = [];
  for (const input of inputs) {
    const cached = await getJson(deps.cache, keyOf(input.name), decisionSchema);
    if (cached) decisions.set(input.name, cached);
    else pending.push(input);
  }

  const candidates = new Map<string, { key: string; templateId: string; canonicalName: string }>();
  for (const input of pending) {
    for (const miss of (nearMisses.get(input.name) ?? []).slice(0, 5)) {
      if (!candidates.has(miss.templateId)) {
        candidates.set(miss.templateId, { key: `c${candidates.size + 1}`, templateId: miss.templateId, canonicalName: miss.canonicalName });
      }
    }
  }
  if (pending.length === 0 || candidates.size === 0) return { decisions, attempts: [] };

  const byKey = new Map([...candidates.values()].map((c) => [c.key, c]));
  const system = (await deps.prompts.render('canonicalize.system')).text;
  const user = (
    await deps.prompts.render('canonicalize.user', {
      candidates: [...candidates.values()].map((c) => `${c.key} | ${c.canonicalName}`).join('\n'),
      inputs: pending.map((input, i) => `${i + 1} | ${input.rawName}`).join('\n'),
    })
  ).text;

  const result = await deps.router.generate(
    {
      task: 'text.normalize_classify',
      schema: itemsEnvelopeSchema,
      providerSchema: canonicalizeSchema,
      schemaName: 'canonical_matches',
      system,
      user,
    },
    ctx,
  );
  if (!result.ok) return { decisions, attempts: result.attempts };

  const answered = new Set<string>();
  for (const raw of result.value.items) {
    const parsed = canonicalizeItemSchema.safeParse(raw);
    if (!parsed.success) continue;
    const input = pending[parsed.data.index - 1];
    if (!input) continue;
    const candidate = parsed.data.candidate_id ? byKey.get(parsed.data.candidate_id) : undefined;
    const decision: CanonicalDecision = {
      templateId: candidate?.templateId ?? null,
      isProduct: parsed.data.is_product,
      confidence: Math.max(0, Math.min(1, parsed.data.confidence)),
    };
    decisions.set(input.name, decision);
    answered.add(input.name);
    await setJson(deps.cache, keyOf(input.name), decision, deps.ttlSeconds);
  }
  // Names the model skipped count as "no match" so they are not asked again.
  for (const input of pending) {
    if (answered.has(input.name)) continue;
    const decision: CanonicalDecision = { templateId: null, isProduct: true, confidence: 0 };
    decisions.set(input.name, decision);
    await setJson(deps.cache, keyOf(input.name), decision, deps.ttlSeconds);
  }
  return { decisions, attempts: result.attempts };
}
