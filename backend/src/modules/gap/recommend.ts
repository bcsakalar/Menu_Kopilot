import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ProviderError } from '../../ai/errors.js';
import type { PromptRepository } from '../../ai/prompt-repository.js';
import type { AiRouter, AttemptRecord, CallContext } from '../../ai/router.js';
import { type Cache, getJson, setJson } from '../../cache/cache.js';
import type { Executor } from '../../db/client.js';
import { menuItems } from '../../db/schema/index.js';
import { GAP_TEXT } from '../../i18n/tr.js';
import { cleanItemName } from '../../lib/clean-name.js';
import { sha256Hex } from '../../lib/images.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import { containsPriceAmount, stripPriceAmounts } from '../../lib/price-guard.js';
import { trigramSimilarity } from '../../lib/trigram.js';
import type { CuisineGraph } from '../retrieval/cuisine-graph.js';
import type { RetrievalService } from '../retrieval/retrieval.service.js';
import { itemsEnvelopeSchema } from '../suggest/schemas.js';
import { clampText } from '../suggest/sanitize.js';
import { type RecommendationDto, gapSuggestItemSchema, gapSuggestSchema } from './schemas.js';

/**
 * Recommendations for items the menu lacks. Approved templates of the same / related cuisines come first
 * (no LLM, deterministic one-line reason); only when they are not enough is `text.gap_suggest` asked for the rest,
 * and its answers are matched back to templates. AI answers are cached per menu + prompt version.
 */

export const MIN_RECOMMENDATIONS = 3;
export const MAX_RECOMMENDATIONS = 10;
/** Names at least this similar to a menu item count as the same product (spelling variants). */
const VARIANT_SIMILARITY = 0.8;
const REASON_MAX = 140;

/** How many recommendations to show: enough to reach the target plus spares, 3–10. */
export function wantedRecommendations(missing: number): number {
  return Math.min(MAX_RECOMMENDATIONS, Math.max(MIN_RECOMMENDATIONS, missing + 2));
}

export class MenuIndex {
  private readonly names = new Set<string>();
  private readonly templateIds = new Set<string>();

  /** Adds an item; returns false when it duplicates one already indexed (same name or same template). */
  add(normalized: string, templateId: string | null): boolean {
    const duplicate = this.names.has(normalized) || (templateId !== null && this.templateIds.has(templateId));
    this.names.add(normalized);
    if (templateId) this.templateIds.add(templateId);
    return !duplicate;
  }

  has(normalized: string, templateId: string | null = null): boolean {
    if (templateId && this.templateIds.has(templateId)) return true;
    if (this.names.has(normalized)) return true;
    for (const name of this.names) if (trigramSimilarity(name, normalized) >= VARIANT_SIMILARITY) return true;
    return false;
  }
}

export interface RecommendationCandidate extends RecommendationDto {
  normalized: string;
}

export async function dbRecommendations(
  db: Executor,
  input: { cuisineId: string; graph: CuisineGraph; menu: MenuIndex; limit: number },
): Promise<RecommendationCandidate[]> {
  if (input.limit <= 0) return [];
  const related = input.graph.related(input.cuisineId, 2);
  if (related.length === 0) return [];
  const rows = await db
    .select({
      id: menuItems.id,
      name: menuItems.canonicalName,
      normalized: menuItems.normalizedName,
      cuisineId: menuItems.cuisineId,
      importance: menuItems.importance,
      usageCount: menuItems.usageCount,
    })
    .from(menuItems)
    .where(and(eq(menuItems.approved, true), inArray(menuItems.cuisineId, related)));
  const cuisineName = input.graph.get(input.cuisineId)?.name ?? '';
  return rows
    .filter((r) => !input.menu.has(r.normalized, r.id))
    .sort(
      (a, b) =>
        input.graph.rank(input.cuisineId, a.cuisineId) - input.graph.rank(input.cuisineId, b.cuisineId) ||
        b.importance - a.importance ||
        b.usageCount - a.usageCount ||
        a.name.localeCompare(b.name, 'tr'),
    )
    .slice(0, input.limit)
    .map((r) => ({
      name: r.name,
      normalized: r.normalized,
      reason:
        r.cuisineId === input.cuisineId
          ? GAP_TEXT.reasonSameCuisine(cuisineName, r.importance)
          : GAP_TEXT.reasonRelatedCuisine(input.graph.get(r.cuisineId)?.name ?? cuisineName),
      importance: r.importance,
      source: 'db' as const,
      templateId: r.id,
    }));
}

const cachedSuggestionsSchema = z.array(z.object({ name: z.string(), reason: z.string(), importance: z.number() }));

export interface AiRecommendationDeps {
  router: AiRouter;
  prompts: PromptRepository;
  cache: Cache;
  ttlSeconds: number;
  retrieval: RetrievalService;
}

export interface AiRecommendationInput {
  cuisine: { id: string; name: string };
  graph: CuisineGraph;
  menu: MenuIndex;
  /** Display names of the items on the menu (prompt context). */
  menuNames: readonly string[];
  already: readonly RecommendationCandidate[];
  target: number;
  current: number;
  notes: string | undefined;
  limit: number;
}

export interface AiRecommendationResult {
  items: RecommendationCandidate[];
  attempts: AttemptRecord[];
  cached: boolean;
  error?: ProviderError;
  provider?: string;
  model?: string;
}

function cleanSuggestion(raw: z.infer<typeof gapSuggestItemSchema>) {
  const name = clampText(cleanItemName(stripPriceAmounts(raw.name)), 80);
  let reason = clampText(stripPriceAmounts(raw.reason), REASON_MAX);
  if (containsPriceAmount(reason)) reason = '';
  const importance = Math.round(Math.max(0, Math.min(100, Number.isFinite(raw.importance) ? raw.importance : 50)));
  return { name, reason, importance };
}

export async function aiRecommendations(
  deps: AiRecommendationDeps,
  input: AiRecommendationInput,
  ctx: CallContext,
): Promise<AiRecommendationResult> {
  if (input.limit <= 0) return { items: [], attempts: [], cached: false };
  const menuKey = [...input.menuNames].map(normalizeTr).sort().join('|');
  const alreadyKey = input.already.map((a) => a.normalized).sort().join('|');
  const tag = sha256Hex(await deps.prompts.versionTag(['gap.suggest.system', 'gap.suggest.user'])).slice(0, 12);
  const key = `mk:g:${input.cuisine.id}:${sha256Hex(
    JSON.stringify([menuKey, alreadyKey, input.target, input.current, input.limit, input.notes ?? '']),
  ).slice(0, 24)}:${tag}`;

  let suggestions = await getJson(deps.cache, key, cachedSuggestionsSchema);
  const cached = suggestions !== undefined;
  const attempts: AttemptRecord[] = [];
  let meta: { provider?: string; model?: string } = {};
  if (!suggestions) {
    const system = (await deps.prompts.render('gap.suggest.system')).text;
    const user = (
      await deps.prompts.render('gap.suggest.user', {
        cuisine: input.cuisine.name,
        existing: input.menuNames.join(', ') || '-',
        already: input.already.map((a) => a.name).join(', ') || '-',
        target: input.target,
        current: input.current,
        notes: input.notes?.trim() || '-',
        max: input.limit + 2,
      })
    ).text;
    const request = {
      task: 'text.gap_suggest' as const,
      schema: itemsEnvelopeSchema,
      providerSchema: gapSuggestSchema,
      schemaName: 'gap_suggestions',
      system,
      user,
    };
    let result = await deps.router.generate(request, ctx);
    attempts.push(...result.attempts);
    if (!result.ok && result.error.kind === 'invalid_output' && result.route) {
      const repair = await deps.prompts.render('repair.user', {
        errors: (result.error.issues ?? []).join('\n'),
        previous: (result.error.raw ?? '').slice(0, 4000),
      });
      result = await deps.router.generateOnRoute({ ...request, user: `${user}\n\n${repair.text}` }, result.route, ctx);
      attempts.push(...result.attempts);
    }
    if (!result.ok) return { items: [], attempts, cached: false, error: result.error };
    meta = { provider: result.meta.provider, model: result.meta.model };
    suggestions = result.value.items.flatMap((raw) => {
      const parsed = gapSuggestItemSchema.safeParse(raw);
      if (!parsed.success) return [];
      const cleaned = cleanSuggestion(parsed.data);
      return cleaned.name.length >= 2 ? [cleaned] : [];
    });
    await setJson(deps.cache, key, suggestions, deps.ttlSeconds);
  }

  // Match answers back to approved templates (no vector search: cheap and deterministic).
  const normalizedNames = suggestions.map((s) => normalizeTr(s.name));
  const outcome = await deps.retrieval.match(normalizedNames, input.cuisine.id, input.graph, { useVector: false });
  const taken = new MenuIndex();
  for (const a of input.already) taken.add(a.normalized, a.templateId);
  const items: RecommendationCandidate[] = [];
  for (const [index, suggestion] of suggestions.entries()) {
    const normalized = normalizedNames[index] ?? '';
    if (normalized === '') continue;
    const hit = outcome.hits.get(normalized);
    const templateId = hit?.templateId ?? null;
    if (input.menu.has(normalized, templateId) || taken.has(normalized, templateId)) continue;
    const name = hit?.canonicalName ?? suggestion.name;
    taken.add(normalizeTr(name), templateId);
    taken.add(normalized, templateId);
    items.push({
      name,
      normalized: normalizeTr(name),
      reason: suggestion.reason,
      importance: suggestion.importance,
      source: 'ai',
      templateId,
    });
  }
  items.sort((a, b) => b.importance - a.importance);
  return { items: items.slice(0, input.limit), attempts, cached, ...meta };
}
