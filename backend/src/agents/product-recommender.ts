import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AttemptRecord } from '../ai/router.js';
import { getJson, setJson } from '../cache/cache.js';
import { menuItems } from '../db/schema/index.js';
import type { CategoryGap } from '../domain/category.js';
import { sha256Hex } from '../lib/images.js';
import { normalizeTr } from '../lib/normalize-tr.js';
import type { CuisineGraph } from '../modules/retrieval/cuisine-graph.js';
import {
  PRODUCT_RECOMMENDER_SCHEMA_NAME,
  productRecommenderSchema,
  recommendedProductSchema,
  type RecommendedProduct,
} from './schemas/product-recommender.js';
import type { TemplatePayload } from '../domain/template.js';
import { getTemplates } from '../modules/templates/template-store.js';
import { countCalls, type AgentDeps, type AgentRunContext, type ExistingItem } from './types.js';
import { generateChecked } from './validator.js';

/**
 * Agent 4 — Product Recommender. Proposes products the menu does NOT have, spread across the category gaps the
 * Gap Analyst found.
 *
 * Two sources, in this order:
 *  1. approved templates of the same / related cuisines, **filtered by the open categories** — no model call,
 *     deterministic one-line reason, instant. (The old recommender skipped the category filter, which is why it
 *     answered a pide-only menu with six more pides.)
 *  2. the model, for the categories the template pool cannot fill.
 * Model answers are cached per (menu + gaps + prompt version).
 */

export const MIN_RECOMMENDATIONS = 3;
export const MAX_RECOMMENDATIONS = 12;

export interface RecommendedItem {
  name: string;
  normalized: string;
  categoryKey: string;
  shortDescription: string;
  portionInfo: string;
  priceRangeHint: string;
  reason: string;
  importance: number;
  source: 'db' | 'ai';
  templateId: string | null;
}

export interface ProductRecommenderInput {
  cuisine: { id: string; name: string };
  graph: CuisineGraph;
  priceSegment: string;
  existing: readonly ExistingItem[];
  gaps: readonly CategoryGap[];
  current: number;
  target: number;
  notes: string | undefined;
  /** How many recommendations to aim for overall. */
  limit: number;
  /** False when no provider is configured / the quota is spent: only the template pool answers. */
  aiUsable: boolean;
}

export interface ProductRecommenderResult {
  items: RecommendedItem[];
  fromDb: number;
  fromAi: number;
  attempts: AttemptRecord[];
  provider?: string;
  model?: string;
  llmCalls: number;
  cached: boolean;
  error?: string;
  /**
   * Full payloads of the pool templates the items point at. A card built from one must carry the WHOLE template —
   * options included — or editing/accepting it would write a thinned-out copy back over the pool.
   */
  templatePayloads?: ReadonlyMap<string, TemplatePayload>;
}

/** How many to ask for: enough to reach the target plus spares, clamped to a list a person can scan on a phone. */
export function wantedCount(missing: number): number {
  return Math.min(MAX_RECOMMENDATIONS, Math.max(MIN_RECOMMENDATIONS, missing + 2));
}

/**
 * Approved templates of the cuisine family, restricted to the categories that are actually short, and capped per
 * category by that category's own gap. This is the single change that fixes the "six more pides" behaviour.
 */
async function fromTemplates(
  deps: Pick<AgentDeps, 'db' | 'categories'>,
  input: ProductRecommenderInput,
  taken: (normalized: string, templateId: string | null) => boolean,
): Promise<RecommendedItem[]> {
  const openGaps = input.gaps.filter((g) => g.missing > 0);
  if (openGaps.length === 0 || input.limit <= 0) return [];
  const related = input.graph.related(input.cuisine.id, 2);
  if (related.length === 0) return [];

  const rows = await deps.db
    .select({
      id: menuItems.id,
      name: menuItems.canonicalName,
      normalized: menuItems.normalizedName,
      cuisineId: menuItems.cuisineId,
      categoryKey: menuItems.categoryKey,
      description: menuItems.description,
      portionInfo: menuItems.portionInfo,
      importance: menuItems.importance,
      usageCount: menuItems.usageCount,
    })
    .from(menuItems)
    .where(and(eq(menuItems.approved, true), inArray(menuItems.cuisineId, related)))
    .orderBy(desc(menuItems.importance), desc(menuItems.usageCount));

  // Candidates bucketed per open category, each bucket still ordered by importance.
  const buckets = new Map<string, typeof rows>(openGaps.map((g) => [g.key, []]));
  for (const row of rows) {
    // Rows seeded before the taxonomy existed have no category: classify them on the fly.
    const categoryKey = row.categoryKey ?? deps.categories.classify(row.name);
    buckets.get(categoryKey)?.push(row);
  }

  const quota = new Map(openGaps.map((g) => [g.key, g.missing]));
  const cursor = new Map(openGaps.map((g) => [g.key, 0]));
  const ownCuisine = input.cuisine.name;
  const picked: RecommendedItem[] = [];

  /**
   * Round-robin over the open categories, emptiest first (`openGaps` is already in that order), one product per
   * pass. Taking the globally most important rows instead would spend the whole budget on the biggest category
   * and leave the others at zero — that is how a kebab menu ended up with no dessert suggestion at all.
   */
  let progressed = true;
  while (picked.length < input.limit && progressed) {
    progressed = false;
    for (const gap of openGaps) {
      if (picked.length >= input.limit) break;
      const left = quota.get(gap.key) ?? 0;
      if (left <= 0) continue;
      const bucket = buckets.get(gap.key) ?? [];
      let index = cursor.get(gap.key) ?? 0;
      while (index < bucket.length && taken(bucket[index]!.normalized, bucket[index]!.id)) index += 1;
      cursor.set(gap.key, index + 1);
      const row = bucket[index];
      if (!row) continue;

      quota.set(gap.key, left - 1);
      progressed = true;
      const sameCuisine = row.cuisineId === input.cuisine.id;
      picked.push({
        name: row.name,
        normalized: row.normalized,
        categoryKey: gap.key,
        shortDescription: row.description,
        portionInfo: row.portionInfo,
        priceRangeHint: '',
        reason: sameCuisine
          ? `${ownCuisine} menülerinde ${row.importance >= 70 ? 'neredeyse her zaman' : 'sık'} bulunur — ${gap.label} eksik`
          : `${gap.label} kategorisini kapatır (${input.graph.get(row.cuisineId)?.name ?? ownCuisine})`,
        importance: row.importance,
        source: 'db',
        templateId: row.id,
      });
    }
  }
  return picked;
}

export async function runProductRecommender(
  deps: Pick<AgentDeps, 'db' | 'router' | 'prompts' | 'cache' | 'cacheTtlSeconds' | 'retrieval' | 'categories' | 'tracer'>,
  input: ProductRecommenderInput,
  run: AgentRunContext,
): Promise<ProductRecommenderResult> {
  return deps.tracer.step(
    'product_recommender',
    'Yeni ürün önerisi',
    {
      limit: input.limit,
      existing: input.existing.length,
      gaps: input.gaps.filter((g) => g.missing > 0).map((g) => `${g.key}:${g.missing}`),
    },
    async () => {
      // One index of everything that must not be proposed: the menu itself, plus what this run already picked.
      const takenNames = new Set<string>();
      const takenTemplates = new Set<string>();
      for (const item of input.existing) {
        takenNames.add(item.normalized);
        if (item.matchedTemplateId) takenTemplates.add(item.matchedTemplateId);
      }
      const isTaken = (normalized: string, templateId: string | null): boolean =>
        takenNames.has(normalized) || (templateId !== null && takenTemplates.has(templateId));
      const take = (normalized: string, templateId: string | null): void => {
        takenNames.add(normalized);
        if (templateId) takenTemplates.add(templateId);
      };

      const done = (result: ProductRecommenderResult, output: Record<string, unknown>, status?: 'ok' | 'failed') => ({
        value: result,
        attempts: result.attempts,
        output,
        ...(status ? { status } : {}),
        ...(result.error ? { error: result.error } : {}),
      });

      const dbItems = await fromTemplates(deps, input, isTaken);
      for (const item of dbItems) take(item.normalized, item.templateId);

      const remainingGaps = input.gaps
        .map((gap) => ({
          ...gap,
          missing: Math.max(0, gap.missing - dbItems.filter((i) => i.categoryKey === gap.key).length),
        }))
        .filter((gap) => gap.missing > 0);
      const remaining = Math.max(0, input.limit - dbItems.length);

      if (remaining === 0 || remainingGaps.length === 0 || run.signal.aborted || !input.aiUsable) {
        const templatePayloads = await templatePayloadsFor(deps, dbItems);
        return done({ items: dbItems, fromDb: dbItems.length, fromAi: 0, attempts: [], llmCalls: 0, cached: false, templatePayloads }, {
          fromDb: dbItems.length,
          fromAi: 0,
          names: dbItems.map((i) => i.name),
        });
      }

      const cacheKey = `mk:rec:${input.cuisine.id}:${sha256Hex(
        JSON.stringify([
          [...takenNames].sort(),
          remainingGaps.map((g) => `${g.key}:${g.missing}`),
          input.priceSegment,
          input.target,
          remaining,
          input.notes ?? '',
          await deps.prompts.versionTag(['agent.recommend.system', 'agent.recommend.user']),
        ]),
      ).slice(0, 32)}`;

      let raw = await getJson(deps.cache, cacheKey, productRecommenderSchema);
      const cached = raw !== undefined;
      let attempts: AttemptRecord[] = [];
      let provider: string | undefined;
      let model: string | undefined;

      if (!raw) {
        const system = (await deps.prompts.render('agent.recommend.system')).text;
        const user = (
          await deps.prompts.render('agent.recommend.user', {
            cuisine: input.cuisine.name,
            segment: input.priceSegment,
            current: input.current,
            target: input.target,
            existing: input.existing.map((i) => i.canonicalName ?? i.rawName).join(', ') || '-',
            gaps: remainingGaps.map((g) => `${g.key} | ${g.label} | ${g.present}/${g.minItems} | ${g.missing} eksik`).join('\n'),
            already: dbItems.map((i) => i.name).join(', ') || '-',
            notes: input.notes?.trim() || '-',
            max: remaining + 2,
          })
        ).text;

        const request = {
          task: 'agent.recommend' as const,
          schema: productRecommenderSchema,
          schemaName: PRODUCT_RECOMMENDER_SCHEMA_NAME,
          system,
          user,
        };
        // Invalid JSON gets exactly one repair round, owned by the Validator (see generateChecked).
        const checked = await generateChecked(deps, request, run.ctx);
        attempts = checked.attempts;
        const result = checked.result;
        if (!result.ok) {
          const error = `${result.error.kind}: ${result.error.message}`;
          return done(
            {
              items: dbItems,
              fromDb: dbItems.length,
              fromAi: 0,
              attempts,
              llmCalls: countCalls(attempts),
              cached: false,
              error,
              templatePayloads: await templatePayloadsFor(deps, dbItems),
            },
            { fromDb: dbItems.length, fromAi: 0 },
            dbItems.length > 0 ? 'ok' : 'failed',
          );
        }
        provider = result.meta.provider;
        model = result.meta.model;
        raw = result.value;
        await setJson(deps.cache, cacheKey, raw, deps.cacheTtlSeconds);
      }

      // Same two rules as the template path: a category never gets more than it is short of, and the answers are
      // taken emptiest-category-first rather than in the order the model happened to write them. Without the
      // quota the model answers a pide-only menu with two extra salads and no drink; without the ordering it
      // spends the budget on whatever it listed first.
      const quota = new Map(remainingGaps.map((g) => [g.key, g.missing]));
      const allowed = new Set(remainingGaps.map((g) => g.key));
      const priority = new Map(remainingGaps.map((g, index) => [g.key, index]));
      const candidates = raw.items
        .map((candidate) => recommendedProductSchema.safeParse(candidate))
        .flatMap((parsed) => (parsed.success ? [parsed.data] : []))
        .map((data) => toRecommended(data, deps.categories.classify(data.name), allowed))
        .filter((item): item is RecommendedItem => item !== null)
        .sort(
          (a, b) =>
            (priority.get(a.categoryKey) ?? Number.MAX_SAFE_INTEGER) - (priority.get(b.categoryKey) ?? Number.MAX_SAFE_INTEGER) ||
            b.importance - a.importance,
        );

      // Answers the pool already knows are resolved to their template. The card then carries the curated payload
      // instead of a thin one, and a product the menu has under another spelling ("Kadayıf" on the menu, "Tel
      // Kadayıf" in the answer) is caught as the same template rather than slipping through as a new product.
      if (candidates.length > 0) {
        const matched = await deps.retrieval.match(
          candidates.map((c) => c.normalized),
          input.cuisine.id,
          input.graph,
          { useVector: false },
        );
        for (const candidate of candidates) {
          const hit = matched.hits.get(candidate.normalized);
          if (!hit) continue;
          candidate.templateId = hit.templateId;
          candidate.name = hit.canonicalName;
          candidate.normalized = normalizeTr(hit.canonicalName);
        }
      }

      const aiItems: RecommendedItem[] = [];
      for (const item of candidates) {
        if (aiItems.length >= remaining) break;
        const left = quota.get(item.categoryKey);
        if (left === undefined || left <= 0) continue;
        if (isTaken(item.normalized, item.templateId)) continue;
        quota.set(item.categoryKey, left - 1);
        take(item.normalized, item.templateId);
        aiItems.push(item);
      }

      const items = [...dbItems, ...aiItems];
      return done(
        {
          items,
          fromDb: dbItems.length,
          fromAi: aiItems.length,
          attempts,
          llmCalls: countCalls(attempts),
          cached,
          templatePayloads: await templatePayloadsFor(deps, items),
          ...(provider ? { provider } : {}),
          ...(model ? { model } : {}),
        },
        { fromDb: dbItems.length, fromAi: aiItems.length, cached, names: items.map((i) => i.name) },
      );
    },
  );
}

/** Full payloads of the templates the items point at, in one query. */
async function templatePayloadsFor(
  deps: Pick<AgentDeps, 'db'>,
  items: readonly RecommendedItem[],
): Promise<Map<string, TemplatePayload>> {
  const ids = [...new Set(items.flatMap((item) => (item.templateId ? [item.templateId] : [])))];
  if (ids.length === 0) return new Map();
  return new Map((await getTemplates(deps.db, ids)).map((template) => [template.id, template.payload]));
}

/**
 * Shapes one model answer into a card. The category the model claims is trusted only when it is one of the open
 * ones; otherwise the deterministic classifier decides, so a wrong `categoryKey` never corrupts the counters.
 */
function toRecommended(
  raw: RecommendedProduct,
  classified: string,
  allowed: ReadonlySet<string>,
): RecommendedItem | null {
  const name = raw.name.trim();
  if (name.length < 2) return null;
  const categoryKey = allowed.has(raw.categoryKey) ? raw.categoryKey : classified;
  return {
    name,
    normalized: normalizeTr(name),
    categoryKey,
    shortDescription: raw.shortDescription.trim(),
    portionInfo: raw.portionInfo.trim(),
    priceRangeHint: raw.priceRangeHint.trim(),
    reason: raw.reason.trim(),
    importance: Math.round(Math.max(0, Math.min(100, raw.importance))),
    source: 'ai',
    templateId: null,
  };
}
