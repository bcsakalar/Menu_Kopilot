import { desc, eq, sql } from 'drizzle-orm';
import type { AttemptRecord } from '../ai/router.js';
import { getJson, setJson } from '../cache/cache.js';
import { menuItems } from '../db/schema/index.js';
import { sha256Hex } from '../lib/images.js';
import { normalizeTr } from '../lib/normalize-tr.js';
import { sameProductName, variantConflict } from '../lib/same-product.js';
import type { CuisineGraph } from '../modules/retrieval/cuisine-graph.js';
import type { KitchenProfile } from './kitchen.js';
import type { QuotaRow } from './plan.js';
import type { SuggestedOptionGroup } from './schemas/option-modifier.js';
import {
  PRODUCT_RECOMMENDER_SCHEMA_NAME,
  productRecommenderSchema,
  recommendedProductSchema,
  type ProductRecommenderOutput,
  type RecommendedProduct,
} from './schemas/product-recommender.js';
import type { TemplatePayload } from '../domain/template.js';
import { getTemplates } from '../modules/templates/template-store.js';
import { countCalls, type AgentDeps, type AgentRunContext, type ExistingItem } from './types.js';
import { generateChecked } from './validator.js';

/**
 * Agent 4 — Product Recommender. Proposes products the menu does NOT have, and only products THIS kitchen can make.
 *
 * Two kinds of suggestion (D-198):
 *  - ALTERNATIVES, built on a product of the menu — the same meat, dough or dessert base in a form the menu lacks
 *    (Adana → Beyti, kokoreç → kokoreç dürüm), or what is always sold with it. Asked of the model on every run,
 *    because only a model reads "Baco Tavuk Dürüm" and knows what else that kitchen can sell; the pool's
 *    closest products stand in when the model cannot answer.
 *  - CATEGORY products, for the categories the Gap Analyst found short: the pool first (no model call, instant),
 *    then the model for what the pool cannot fill — in batches, run in parallel.
 * Every candidate, from either source, passes the kitchen profile (see `kitchen.ts`): a product of another shop —
 * waffle for a kokoreççi, döner for a kebapçı without a döner machine — is never proposed. Among the makeable ones
 * the pool ranks the closest to the menu first, then the most common in the cuisine.
 * Model answers are cached per (menu + that batch's request + prompt version).
 */

/** Products one model call is asked for. Above this an answer starts arriving late, or not at all. */
const RECOMMEND_BATCH = 10;
/** Category batches in full mode; the alternatives batch comes on top. */
const MAX_GAP_BATCHES = 4;
/** A product of the cuisine's own pool (or a related one) ranks a little higher than one from elsewhere. */
const RELATED_BONUS = 5;
/**
 * Alternatives of one product type, at most: a pide shop gets two more pides and then lahmacun, gözleme or çorba —
 * not six pides, the very answer the category plan was built to stop.
 */
const alternativesPerType = (alternatives: number): number => Math.max(2, Math.ceil(alternatives / 3));

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
  /** Options the product should open with. Pool items carry the curated set; model answers carry their own. */
  optionGroups: SuggestedOptionGroup[];
  removableIngredients: string[];
  extraIngredients: string[];
  /** A quick-mode fill-up past its category's quota (see `fillUp` in the input); the Validator lets it through. */
  overQuota?: boolean;
  /**
   * D-198. The menu product this one is built on, as the menu spells it ("Adana Kebap" for "Beyti"); null for a
   * product that only fills a category.
   */
  basedOn: string | null;
  /** An alternative of a menu product: outside the category quota, up to the plan's `alternatives`. */
  alternative?: boolean;
}

export interface ProductRecommenderInput {
  cuisine: { id: string; name: string; slug?: string | null };
  graph: CuisineGraph;
  priceSegment: string;
  existing: readonly ExistingItem[];
  /** What the menu shows this kitchen can make (D-198). */
  kitchen: KitchenProfile;
  /** Every category of the cuisine (key, label): an alternative may land in one the quota does not open. */
  categories: readonly { key: string; label: string }[];
  /**
   * How many products each category may receive in THIS run. In quick mode it is one per category across a few of
   * them; in full mode it goes past the category minimums until the menu would reach the cuisine's target. Both
   * paths below fill exactly this, and the Validator enforces the same map.
   */
  quota: readonly QuotaRow[];
  current: number;
  target: number;
  notes: string | undefined;
  /** How many category products to aim for overall (the sum of the quota). */
  limit: number;
  /** How many alternatives built on the menu's own products to aim for, on top of `limit` (D-198). */
  alternatives: number;
  /** How long one model attempt may take; the mode decides (see `plan.ts`). */
  attemptTimeoutMs: number;
  /** False when no provider is configured / the quota is spent: only the template pool answers. */
  aiUsable: boolean;
  /**
   * Quick mode (D-189): when the pool and the model together leave the run short — a category with nothing left in
   * the pool, a model that did not answer — more pool products of the other open categories fill it, past their
   * quota. The count is the promise of "öneri versen yeter"; the spread is only a preference.
   */
  fillUp?: boolean;
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

interface PoolRow {
  id: string;
  name: string;
  normalized: string;
  cuisineId: string | null;
  categoryKey: string;
  description: string;
  portionInfo: string;
  importance: number;
  /** From the cuisine itself or a close relative. */
  related: boolean;
  /** Kitchen fit (D-198): only makeable rows are kept. */
  score: number;
  basedOn: string | null;
  /** The template's product type is one the menu already sells. */
  sameType: boolean;
  typeKey: string;
}

/**
 * Every approved template this kitchen can make, ranked: closest to the menu first, then a related cuisine's, then
 * the most important — every time the team accepts a template it climbs a little, up to ten acceptances (D-194).
 */
async function loadPool(deps: Pick<AgentDeps, 'db' | 'categories'>, input: ProductRecommenderInput): Promise<PoolRow[]> {
  const related = new Set(input.graph.related(input.cuisine.id, 2));
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
    .where(eq(menuItems.approved, true))
    .orderBy(desc(sql`${menuItems.importance} + least(${menuItems.usageCount}, 10) * 3`), desc(menuItems.usageCount));

  const pool: PoolRow[] = [];
  for (const row of rows) {
    // Rows seeded before the taxonomy existed have no category: classify them on the fly.
    const categoryKey = row.categoryKey ?? deps.categories.classify(row.name);
    const { type, byName } = input.kitchen.typeOf(row.name, categoryKey);
    const fit = input.kitchen.fit(row.name, type.key, byName);
    if (!fit.ok || input.kitchen.coversDrink(row.name, type.key)) continue;
    const inRelated = row.cuisineId !== null && related.has(row.cuisineId);
    pool.push({
      id: row.id,
      name: row.name,
      normalized: row.normalized,
      cuisineId: row.cuisineId,
      categoryKey,
      description: row.description,
      portionInfo: row.portionInfo,
      importance: row.importance,
      related: inRelated,
      score: fit.score + (inRelated ? RELATED_BONUS : 0),
      basedOn: fit.basedOn,
      sameType: input.kitchen.types.has(type.key),
      typeKey: type.key,
    });
  }
  // Stable: rows of equal fit keep the importance order of the query.
  return pool.sort((a, b) => b.score - a.score);
}

function poolItem(row: PoolRow, categoryKey: string, reason: string, extra: Partial<RecommendedItem> = {}): RecommendedItem {
  return {
    name: row.name,
    normalized: row.normalized,
    categoryKey,
    shortDescription: row.description,
    portionInfo: row.portionInfo,
    priceRangeHint: '',
    reason,
    importance: row.importance,
    source: 'db',
    templateId: row.id,
    // Left empty on purpose: the card is built from the WHOLE curated template (see `templatePayloadsFor`),
    // so its options and ingredients come from the pool payload rather than from a thinned-out copy here.
    optionGroups: [],
    removableIngredients: [],
    extraIngredients: [],
    basedOn: null,
    ...extra,
  };
}

/**
 * Pool products for the open categories, capped per category by that category's quota. The category filter is
 * what fixes the "six more pides" behaviour; the quota is what lets a menu that is twenty products short actually
 * get twenty suggestions; the kitchen filter (in `loadPool`) is what keeps another shop's products out.
 */
function fromTemplates(
  deps: Pick<AgentDeps, 'feedback'>,
  input: ProductRecommenderInput,
  pool: readonly PoolRow[],
  quotaRows: readonly QuotaRow[],
  limit: number,
  taken: (normalized: string, templateId: string | null) => boolean,
): RecommendedItem[] {
  if (quotaRows.length === 0 || limit <= 0) return [];

  // Candidates bucketed per open category, each bucket in pool order (closest to the menu first). A category
  // product comes from the cuisine's own family — an unrelated cuisine's soup is not this kitchen's soup.
  const buckets = new Map<string, PoolRow[]>(quotaRows.map((g) => [g.key, []]));
  for (const row of pool) if (row.related) buckets.get(row.categoryKey)?.push(row);
  // A product the sellers of this kitchen kept turning down goes to the back of its category — never away: when
  // nothing else fits, it is still better than an empty slot (D-196).
  for (const [key, bucket] of buckets) {
    const turnedDown = (row: PoolRow) => deps.feedback.isProductRejected(input.cuisine.id, row.normalized);
    buckets.set(key, [...bucket.filter((row) => !turnedDown(row)), ...bucket.filter(turnedDown)]);
  }

  const quota = new Map(quotaRows.map((g) => [g.key, g.want]));
  const cursor = new Map(quotaRows.map((g) => [g.key, 0]));
  const ownCuisine = input.cuisine.name;
  const picked: RecommendedItem[] = [];

  /**
   * Round-robin over the open categories, emptiest first (`quotaRows` is already in that order), one product per
   * pass. Taking the globally best rows instead would spend the whole budget on the biggest category and leave the
   * others at zero — that is how a kebap menu ended up with no dessert suggestion at all.
   */
  let progressed = true;
  while (picked.length < limit && progressed) {
    progressed = false;
    for (const gap of quotaRows) {
      if (picked.length >= limit) break;
      const left = quota.get(gap.key) ?? 0;
      if (left <= 0) continue;
      const bucket = buckets.get(gap.key) ?? [];
      let index = cursor.get(gap.key) ?? 0;
      // A product seeded in several related cuisines is several rows ("Ayran" of kebap, of çorba…): once is enough.
      const already = (normalized: string): boolean => picked.some((p) => p.normalized === normalized || sameProductName(p.normalized, normalized));
      while (index < bucket.length && (taken(bucket[index]!.normalized, bucket[index]!.id) || already(bucket[index]!.normalized))) index += 1;
      cursor.set(gap.key, index + 1);
      const row = bucket[index];
      if (!row) continue;

      quota.set(gap.key, left - 1);
      progressed = true;
      const sameCuisine = row.cuisineId === input.cuisine.id;
      const reason = row.basedOn
        ? `${row.basedOn} yapan mutfak bunu da yapar — ${gap.label} ${gap.missing > 0 ? 'eksik' : 'tarafını güçlendirir'}`
        : sameCuisine
          ? `${ownCuisine} menülerinde ${row.importance >= 70 ? 'neredeyse her zaman' : 'sık'} bulunur${
              gap.missing > 0 ? ` — ${gap.label} eksik` : ` — ${gap.label} tarafını güçlendirir`
            }`
          : `${gap.label} kategorisini ${gap.missing > 0 ? 'kapatır' : 'genişletir'} (${input.graph.get(row.cuisineId ?? '')?.name ?? ownCuisine})`;
      picked.push(poolItem(row, gap.key, reason));
    }
  }
  return picked;
}

/**
 * The pool's alternatives: products of the same type as one on the menu, or sharing its meat, dough or filling —
 * the closest first. They stand in when the model cannot answer, so even an offline run proposes "Beyti" to the
 * kebap shop rather than whatever the cuisine sells most.
 */
function alternativesFromPool(
  pool: readonly PoolRow[],
  count: number,
  taken: (normalized: string, templateId: string | null) => boolean,
  perType: Map<string, number>,
  maxPerType: number,
): RecommendedItem[] {
  const picked: RecommendedItem[] = [];
  for (const row of pool) {
    if (picked.length >= count) break;
    if (!row.basedOn || (!row.sameType && row.score < 30)) continue;
    if ((perType.get(row.typeKey) ?? 0) >= maxPerType) continue;
    if (taken(row.normalized, row.id) || picked.some((p) => p.normalized === row.normalized || sameProductName(p.normalized, row.normalized))) continue;
    perType.set(row.typeKey, (perType.get(row.typeKey) ?? 0) + 1);
    picked.push(
      poolItem(row, row.categoryKey, row.sameType ? `${row.basedOn} ile aynı ocaktan çıkar` : `${row.basedOn} malzemesiyle yapılır`, {
        basedOn: row.basedOn,
        alternative: true,
      }),
    );
  }
  return picked;
}

/** The menu product a model's `basedOn` names, however the model spelled it ("Adana" for "Adana Kebap"). */
function menuProduct(existing: readonly ExistingItem[], name: string | null | undefined): ExistingItem | undefined {
  const wanted = normalizeTr(name ?? '');
  if (wanted.length < 2) return undefined;
  const spellings = (item: ExistingItem): string[] => [item.normalized, ...(item.canonicalName ? [normalizeTr(item.canonicalName)] : [])];
  return (
    existing.find((item) => spellings(item).includes(wanted)) ??
    existing.find((item) => spellings(item).some((s) => sameProductName(s, wanted))) ??
    existing.find((item) => spellings(item).some((s) => s.includes(wanted) || wanted.includes(s)))
  );
}

interface Batch {
  gaps: QuotaRow[];
  alternatives: number;
}

export async function runProductRecommender(
  deps: Pick<AgentDeps, 'db' | 'router' | 'prompts' | 'cache' | 'cacheTtlSeconds' | 'retrieval' | 'categories' | 'tracer' | 'feedback'>,
  input: ProductRecommenderInput,
  run: AgentRunContext,
): Promise<ProductRecommenderResult> {
  return deps.tracer.step(
    'product_recommender',
    'Yeni ürün önerisi',
    {
      limit: input.limit,
      alternatives: input.alternatives,
      existing: input.existing.length,
      quota: input.quota.map((g) => `${g.key}:${g.want}`),
      kitchen: [...input.kitchen.types],
    },
    async () => {
      // One index of everything that must not be proposed: the menu itself, plus what this run already picked.
      const takenNames = new Set<string>();
      const takenTemplates = new Set<string>();
      for (const item of input.existing) {
        takenNames.add(item.normalized);
        // The pool's spelling of a menu product ("Mercimek" → "Mercimek Çorbası") is on the menu too: the same
        // product seeded in another cuisine has another template id, so the id alone does not catch it.
        if (item.canonicalName) takenNames.add(normalizeTr(item.canonicalName));
        if (item.matchedTemplateId) takenTemplates.add(item.matchedTemplateId);
      }
      // What the sellers of this kitchen kept turning down is named to the model and goes to the back (D-196).
      const rejectedProducts = deps.feedback.rejectedProducts(input.cuisine.id);
      const isTaken = (normalized: string, templateId: string | null): boolean =>
        takenNames.has(normalized) ||
        (templateId !== null && takenTemplates.has(templateId)) ||
        [...takenNames].some((name) => sameProductName(name, normalized));
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

      const pool = await loadPool(deps, input);
      const dbItems = fromTemplates(deps, input, pool, input.quota, input.limit, isTaken);
      for (const item of dbItems) take(item.normalized, item.templateId);

      const remainingGaps = input.quota
        .map((gap) => ({ ...gap, want: Math.max(0, gap.want - dbItems.filter((i) => i.categoryKey === gap.key).length) }))
        .filter((gap) => gap.want > 0);
      const remaining = Math.max(0, input.limit - dbItems.length);
      const total = input.limit + input.alternatives;

      /** Alternatives per product type so far: the model's and the pool's share one cap. */
      const perType = new Map<string, number>();
      const maxPerType = alternativesPerType(input.alternatives);
      /** The pool's alternatives, for whatever the model did not cover. */
      const poolAlternatives = (have: number): RecommendedItem[] => {
        const items = alternativesFromPool(pool, input.alternatives - have, isTaken, perType, maxPerType);
        for (const item of items) take(item.normalized, item.templateId);
        return items;
      };
      /** Quick mode's fill-up: more pool products past their category's quota until the run has its count. */
      const fillUp = (items: RecommendedItem[]): RecommendedItem[] => {
        if (!input.fillUp || items.length >= total || run.signal.aborted) return items;
        const open = input.quota.map((gap) => ({ ...gap, want: total }));
        const extra = fromTemplates(deps, input, pool, open, total - items.length, isTaken);
        for (const item of extra) take(item.normalized, item.templateId);
        return [...items, ...extra.map((item) => ({ ...item, overQuota: true }))];
      };
      const finish = (items: RecommendedItem[]): RecommendedItem[] => fillUp(items);

      const wantsModel = input.aiUsable && !run.signal.aborted && (input.alternatives > 0 || (remaining > 0 && remainingGaps.length > 0));
      if (!wantsModel) {
        const items = finish([...poolAlternatives(0), ...dbItems]);
        const templatePayloads = await templatePayloadsFor(deps, items);
        return done({ items, fromDb: items.length, fromAi: 0, attempts: [], llmCalls: 0, cached: false, templatePayloads }, {
          fromDb: items.length,
          fromAi: 0,
          names: items.map((i) => i.name),
        });
      }

      /**
       * One model call per group of categories. A café that is 43 products short used to go out as a single
       * "give me 40 products, each with its options" call: measured on production it took 33 s and came back
       * failed. Split into batches of ~10 it is several short calls that run in parallel — the same wall clock as
       * one call, and each answer is small enough that a provider actually finishes it. The alternatives ride in the
       * first batch when the run is small (quick mode: one call), and get a batch of their own in a long run.
       */
      const gapBatches: QuotaRow[][] = [];
      let current: QuotaRow[] = [];
      let currentWant = 0;
      for (const gap of remainingGaps) {
        current.push(gap);
        currentWant += gap.want;
        if (currentWant >= RECOMMEND_BATCH) {
          gapBatches.push(current);
          current = [];
          currentWant = 0;
        }
      }
      if (current.length > 0) gapBatches.push(current);
      const plannedGaps = gapBatches.slice(0, MAX_GAP_BATCHES);
      // The alternatives always get a call of their own: two short answers in parallel, on different providers,
      // arrive sooner than one long one — measured on production, ten products with their options in one answer ran
      // past the 8 s attempt on both the first and the second provider.
      const batches: Batch[] = [
        ...(input.alternatives > 0 ? [{ gaps: [], alternatives: input.alternatives }] : []),
        ...plannedGaps.map((gaps) => ({ gaps, alternatives: 0 })),
      ];

      const kitchenBrief = input.kitchen.describe();
      const categoryList = input.categories.map((c) => `${c.key} | ${c.label}`).join(', ') || '-';
      const system = (await deps.prompts.render('agent.recommend.system')).text;
      const promptTag = await deps.prompts.versionTag(['agent.recommend.system', 'agent.recommend.user']);
      const runs = await Promise.all(
        batches.map(async (batch, batchIndex) => {
          const want = batch.gaps.reduce((sum, g) => sum + g.want, 0) + batch.alternatives;
          const cacheKey = `mk:rec:${input.cuisine.id}:${sha256Hex(
            JSON.stringify([
              [...takenNames].sort(),
              batch.gaps.map((g) => `${g.key}:${g.want}`),
              batch.alternatives,
              kitchenBrief,
              input.priceSegment,
              input.target,
              input.notes ?? '',
              rejectedProducts,
              promptTag,
            ]),
          ).slice(0, 32)}`;
          const hit = await getJson(deps.cache, cacheKey, productRecommenderSchema);
          if (hit) return { value: hit, attempts: [] as AttemptRecord[], cached: true, error: undefined, meta: undefined };

          const user = (
            await deps.prompts.render('agent.recommend.user', {
              cuisine: input.cuisine.name,
              segment: input.priceSegment,
              current: input.current,
              target: input.target,
              existing: input.existing.map((i) => i.canonicalName ?? i.rawName).join(', ') || '-',
              kitchen: kitchenBrief.makes,
              avoid: kitchenBrief.avoid,
              alternatives: batch.alternatives,
              categories: categoryList,
              gaps:
                batch.gaps
                  .map((g) => `${g.key} | ${g.label} | menüde ${g.present}, mutfak minimumu ${g.minItems} | bu koşuda ${g.want} ürün iste`)
                  .join('\n') || '- (bu çağrıda kategori önerisi yok, yalnızca alternatif)',
              already: dbItems.map((i) => i.name).join(', ') || '-',
              rejected: rejectedProducts.join(', ') || '-',
              notes: input.notes?.trim() || '-',
              max: want + 2,
            })
          ).text;
          // Invalid JSON gets exactly one repair round, owned by the Validator (see generateChecked).
          const checked = await generateChecked(
            deps,
            {
              task: 'agent.recommend' as const,
              schema: productRecommenderSchema,
              schemaName: PRODUCT_RECOMMENDER_SCHEMA_NAME,
              system,
              user,
              timeoutMs: input.attemptTimeoutMs,
              // Batches in flight at the same time start on different providers (see RouterRequest.routeOffset).
              routeOffset: batchIndex,
            },
            run.ctx,
          );
          if (!checked.result.ok) {
            return {
              value: undefined,
              attempts: checked.attempts,
              cached: false,
              error: `${checked.result.error.kind}: ${checked.result.error.message}`,
              meta: undefined,
            };
          }
          await setJson(deps.cache, cacheKey, checked.result.value, deps.cacheTtlSeconds);
          return {
            value: checked.result.value,
            attempts: checked.attempts,
            cached: false,
            error: undefined,
            meta: checked.result.meta,
          };
        }),
      );

      const attempts = runs.flatMap((r) => r.attempts);
      const answered = runs.flatMap((r) => (r.value ? [r.value] : []));
      const cached = runs.length > 0 && runs.every((r) => r.cached);
      const provider = runs.find((r) => r.meta)?.meta?.provider;
      const model = runs.find((r) => r.meta)?.meta?.model;
      if (answered.length === 0) {
        const error = runs.find((r) => r.error)?.error ?? 'model cevabı yok';
        const items = finish([...poolAlternatives(0), ...dbItems]);
        return done(
          {
            items,
            fromDb: items.length,
            fromAi: 0,
            attempts,
            llmCalls: countCalls(attempts),
            cached: false,
            error,
            templatePayloads: await templatePayloadsFor(deps, items),
          },
          { fromDb: items.length, fromAi: 0, names: items.map((i) => i.name) },
          items.length > 0 ? 'ok' : 'failed',
        );
      }

      const { alternatives: aiAlternatives, categoryItems: aiItems, refused } = await pickModelItems(deps, input, answered, {
        remainingGaps,
        remaining,
        isTaken,
        take,
        perType,
        maxPerType,
      });
      const fallbackAlternatives = aiAlternatives.length < input.alternatives ? poolAlternatives(aiAlternatives.length) : [];
      const items = finish([...aiAlternatives, ...fallbackAlternatives, ...dbItems, ...aiItems]);
      const fromAi = aiAlternatives.length + aiItems.length;
      return done(
        {
          items,
          fromDb: items.length - fromAi,
          fromAi,
          attempts,
          llmCalls: countCalls(attempts),
          cached,
          templatePayloads: await templatePayloadsFor(deps, items),
          ...(provider ? { provider } : {}),
          ...(model ? { model } : {}),
        },
        {
          fromDb: items.length - fromAi,
          fromAi,
          alternatives: items.filter((i) => i.alternative).map((i) => `${i.name} ← ${i.basedOn}`),
          cached,
          batches: batches.length,
          ...(batches.length - answered.length > 0 ? { failedBatches: batches.length - answered.length } : {}),
          ...(refused.length > 0 ? { notForThisKitchen: refused } : {}),
          names: items.map((i) => i.name),
        },
      );
    },
  );
}

/**
 * Sorts the model's answers into alternatives and category products. Every answer passes the kitchen first; an
 * alternative must name a product that is really on the menu, or it is judged as a category product.
 */
async function pickModelItems(
  deps: Pick<AgentDeps, 'retrieval' | 'categories' | 'feedback'>,
  input: ProductRecommenderInput,
  answered: readonly ProductRecommenderOutput[],
  context: {
    remainingGaps: readonly QuotaRow[];
    remaining: number;
    isTaken: (normalized: string, templateId: string | null) => boolean;
    take: (normalized: string, templateId: string | null) => void;
    perType: Map<string, number>;
    maxPerType: number;
  },
): Promise<{ alternatives: RecommendedItem[]; categoryItems: RecommendedItem[]; refused: string[] }> {
  const known = new Set(input.categories.map((c) => c.key));
  // Same two rules as the template path: a category never gets more than it is short of, and the answers are taken
  // emptiest-category-first rather than in the order the model happened to write them.
  const quota = new Map(context.remainingGaps.map((g) => [g.key, g.want]));
  const allowed = new Set([...known, ...context.remainingGaps.map((g) => g.key)]);
  const priority = new Map(context.remainingGaps.map((g, index) => [g.key, index]));
  const refused: string[] = [];
  const candidates = answered
    .flatMap((a) => a.items)
    .map((candidate) => recommendedProductSchema.safeParse(candidate))
    .flatMap((parsed) => (parsed.success ? [parsed.data] : []))
    .map((data) => toRecommended(data, deps.categories.classify(data.name), allowed))
    .filter((item): item is RecommendedItem => item !== null)
    .filter((item) => {
      const { type, byName } = input.kitchen.typeOf(item.name, item.categoryKey);
      const fit = input.kitchen.fit(item.name, type.key, byName);
      if (fit.ok && !input.kitchen.coversDrink(item.name, type.key)) return true;
      refused.push(`${item.name}: ${fit.reason ?? 'menüde zaten var'}`);
      return false;
    })
    .map((item) => {
      // An alternative names a product that is really on the menu, in the menu's own spelling.
      const base = menuProduct(input.existing, item.basedOn);
      return { ...item, basedOn: base ? base.rawName : null };
    })
    .sort(
      (a, b) =>
        Number(b.basedOn !== null) - Number(a.basedOn !== null) ||
        (priority.get(a.categoryKey) ?? Number.MAX_SAFE_INTEGER) - (priority.get(b.categoryKey) ?? Number.MAX_SAFE_INTEGER) ||
        Number(deps.feedback.isProductRejected(input.cuisine.id, a.normalized)) -
          Number(deps.feedback.isProductRejected(input.cuisine.id, b.normalized)) ||
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
      // "Levrek Buğulama" proposed by the model is not the pool's "Levrek Izgara", however close the letters.
      const fuzzy = hit.matchType !== 'exact' && hit.matchType !== 'alias';
      if (fuzzy && variantConflict(candidate.normalized, normalizeTr(hit.canonicalName))) continue;
      candidate.templateId = hit.templateId;
      candidate.name = hit.canonicalName;
      candidate.normalized = normalizeTr(hit.canonicalName);
    }
  }

  const alternatives: RecommendedItem[] = [];
  const categoryItems: RecommendedItem[] = [];
  for (const item of candidates) {
    if (context.isTaken(item.normalized, item.templateId)) continue;
    const typeKey = input.kitchen.typeOf(item.name, item.categoryKey).type.key;
    if (item.basedOn !== null && alternatives.length < input.alternatives && (context.perType.get(typeKey) ?? 0) < context.maxPerType) {
      context.take(item.normalized, item.templateId);
      context.perType.set(typeKey, (context.perType.get(typeKey) ?? 0) + 1);
      alternatives.push({ ...item, alternative: true });
      continue;
    }
    if (categoryItems.length >= context.remaining) continue;
    const left = quota.get(item.categoryKey);
    if (left === undefined || left <= 0) continue;
    quota.set(item.categoryKey, left - 1);
    context.take(item.normalized, item.templateId);
    categoryItems.push(item);
  }
  return { alternatives, categoryItems, refused };
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
 * Shapes one model answer into a card. The category the model claims is trusted only when it is one of the known
 * ones; otherwise the deterministic classifier decides, so a wrong `categoryKey` never corrupts the counters.
 */
function toRecommended(raw: RecommendedProduct, classified: string, allowed: ReadonlySet<string>): RecommendedItem | null {
  const name = raw.name.trim();
  if (name.length < 2) return null;
  const categoryKey = allowed.has(raw.categoryKey) ? raw.categoryKey : classified;
  return {
    name,
    normalized: normalizeTr(name),
    categoryKey,
    // The wire schema accepts more than a card shows (see its header): trim here rather than lose the product.
    shortDescription: raw.shortDescription.trim().slice(0, 160),
    portionInfo: raw.portionInfo.trim(),
    priceRangeHint: raw.priceRangeHint.trim(),
    reason: raw.reason.trim().slice(0, 120),
    importance: Math.round(Math.max(0, Math.min(100, raw.importance))),
    source: 'ai',
    templateId: null,
    // A new product is useless on the panel without its options — "Lahmacun" alone, with no Boy and no
    // "Yanında ayran", is half a menu row. The Validator is what decides which of these survive.
    optionGroups: raw.optionGroups ?? [],
    removableIngredients: (raw.removableIngredients ?? []).map((i) => i.trim()).filter((i) => i.length > 0),
    extraIngredients: (raw.extraIngredients ?? []).map((i) => i.trim()).filter((i) => i.length > 0),
    basedOn: raw.basedOn?.trim() || null,
  };
}
