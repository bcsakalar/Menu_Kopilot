import type { CategoryGap } from '../domain/category.js';

/**
 * The run plan — how much work one analysis does, and how that work is split between the cuisine's categories.
 *
 * Two modes, chosen by the user on the home screen:
 *   quick — "öneri versen yeter": a handful of products from DIFFERENT categories plus a few option cards.
 *   full  — "hakikaten işimizi yapalım": recommend until the menu would actually reach the cuisine's minimum,
 *           and ask for options/ingredients on every product whose options are not already known.
 *
 * Everything here is deterministic arithmetic, unit-tested, and shared by the recommender (what to ask for) and
 * the Validator (what may pass). One source of truth, so the two can never disagree about a category's quota.
 */

export const ANALYSIS_MODES = ['quick', 'full'] as const;
export type AnalysisMode = (typeof ANALYSIS_MODES)[number];
export const DEFAULT_MODE: AnalysisMode = 'full';

/** Quick mode: "5-6 ürün, ayrı kategorilerden". */
const QUICK_PRODUCTS = 6;
const QUICK_OPTION_TARGETS = 3;
/** A cuisine with at least this many categories gets one product per category, so the six spread over six. */
const QUICK_SPREAD_CATEGORIES = 5;

/** Full mode never returns less than this, even for a menu that already meets its minimum. */
const FULL_FLOOR = 8;
/** Upper bound on one run: beyond this the list stops being something a person can go through on a call. */
export const MAX_PRODUCTS = 40;
export const MAX_OPTION_TARGETS = 24;

/**
 * A combo/campaign is a package of products the restaurant must already sell, so it is the LAST thing to
 * recommend: only when every real category is full does one of these get a slot.
 */
const LAST_RESORT = new Set(['menu-kampanya']);
/** Its share in the proportional pass: small enough that every real category is served first. */
const LAST_RESORT_WEIGHT = 0.01;

/**
 * The two model agents' shared deadline. Quick stays inside the 15 s end-to-end promise; full is allowed to take
 * longer because it is explicitly the "do the whole job" button, and the phone shows counts and the menu long
 * before this fires.
 */
const QUICK_DEADLINE_MS = 11_000;
const FULL_DEADLINE_MS = 26_000;

/**
 * What the mode costs on top of the configured per-request budget. Full mode asks the option agent in batches and
 * gives the recommender a longer list to fill, so it needs room for those calls; quick mode is the old shape.
 */
export function modeBudget(mode: AnalysisMode): { extraLlmCalls: number; extraInputTokens: number } {
  return mode === 'full' ? { extraLlmCalls: 4, extraInputTokens: 15_000 } : { extraLlmCalls: 0, extraInputTokens: 0 };
}

export interface RunPlan {
  mode: AnalysisMode;
  /** How many new products this run aims for — the sum of the quota below. */
  products: number;
  /** How many menu products may get an option/ingredient card. */
  optionTargets: number;
  /** Category key → how many new products that category may receive. The Validator enforces the same map. */
  quota: Map<string, number>;
  deadlineMs: number;
  /** Model calls this mode may spend on top of the configured per-request budget. */
  extraLlmCalls: number;
}

export interface PlanInput {
  mode: AnalysisMode;
  categories: readonly CategoryGap[];
  /** How many products short of the opening target the menu is. */
  missing: number;
  /** How many products on the menu are waiting for options. */
  needOptions: number;
}

/**
 * Hands out `total` slots over the categories.
 *
 * Pass 1 closes the real gaps, emptiest category first, one slot per pass — so every short category gets its
 * first product before the biggest one gets its second.
 * Pass 2 spends what is left on the cuisine's shape, proportionally (see below). This is what lets a 10-product
 * menu in a 30-product cuisine come back with twenty real suggestions instead of "kategori açığı kapandı, bitti".
 */
export function allocate(categories: readonly CategoryGap[], total: number, capOf: (gap: CategoryGap) => number): Map<string, number> {
  const quota = new Map<string, number>(categories.map((c) => [c.key, 0]));
  let left = Math.max(0, total);
  const give = (key: string): void => {
    quota.set(key, (quota.get(key) ?? 0) + 1);
    left -= 1;
  };

  const open = categories.filter((c) => c.missing > 0);
  const gapLeft = new Map(open.map((c) => [c.key, c.missing]));
  let progressed = true;
  while (left > 0 && progressed) {
    progressed = false;
    for (const category of open) {
      if (left <= 0) break;
      const gap = gapLeft.get(category.key) ?? 0;
      if (gap <= 0 || (quota.get(category.key) ?? 0) >= capOf(category)) continue;
      gapLeft.set(category.key, gap - 1);
      give(category.key);
      progressed = true;
    }
  }

  /**
   * Pass 2 — proportional apportionment (the D'Hondt rule): each slot goes to the category with the best
   * weight / (already given + 1) ratio, where the weight is what the cuisine expects of that category. Mains get
   * the biggest share without ever starving the small ones — handing out six mains in a row and only then
   * looking at the soup left çorba at zero on a 22-product run. A combo weighs almost nothing, so it is reached
   * only when every real category is capped: the user's "son çare".
   */
  const weightOf = (category: CategoryGap): number => (LAST_RESORT.has(category.key) ? LAST_RESORT_WEIGHT : Math.max(1, category.minItems));
  const order = new Map(categories.map((c, index) => [c.key, index]));
  while (left > 0) {
    let best: CategoryGap | undefined;
    let bestScore = 0;
    for (const category of categories) {
      if ((quota.get(category.key) ?? 0) >= capOf(category)) continue;
      const score = weightOf(category) / ((quota.get(category.key) ?? 0) + 1);
      if (
        score > bestScore ||
        (best !== undefined && score === bestScore && weightOf(category) > weightOf(best)) ||
        (best !== undefined && score === bestScore && weightOf(category) === weightOf(best) && order.get(category.key)! < order.get(best.key)!)
      ) {
        best = category;
        bestScore = score;
      }
    }
    if (!best) break;
    give(best.key);
  }
  return quota;
}

export function planRun(input: PlanInput): RunPlan {
  const shape = input.categories.reduce((sum, c) => sum + c.missing, 0);

  if (input.mode === 'quick') {
    // One product per category when the cuisine has enough of them: six suggestions from six different
    // categories, none of them a second copy of something the menu already leans on.
    const perCategory = input.categories.length >= QUICK_SPREAD_CATEGORIES ? 1 : 2;
    const quota = allocate(input.categories, QUICK_PRODUCTS, (c) => (LAST_RESORT.has(c.key) ? 0 : perCategory));
    return {
      mode: 'quick',
      products: sum(quota),
      optionTargets: Math.min(QUICK_OPTION_TARGETS, input.needOptions),
      quota,
      deadlineMs: QUICK_DEADLINE_MS,
      extraLlmCalls: 0,
    };
  }

  // Full: enough to actually reach the opening target (plus two spares), never below the floor.
  const wanted = Math.min(MAX_PRODUCTS, Math.max(FULL_FLOOR, input.missing + 2, shape));
  const quota = allocate(input.categories, wanted, (c) => (LAST_RESORT.has(c.key) ? 1 : Math.max(2, c.minItems * 2)));
  return {
    mode: 'full',
    products: sum(quota),
    optionTargets: Math.min(MAX_OPTION_TARGETS, input.needOptions),
    quota,
    deadlineMs: FULL_DEADLINE_MS,
    extraLlmCalls: modeBudget('full').extraLlmCalls,
  };
}

function sum(quota: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const value of quota.values()) total += value;
  return total;
}

/** One category the run may still add products to: the gap as measured, plus how many slots the plan gave it. */
export interface QuotaRow extends CategoryGap {
  want: number;
}

/** The plan's quota as rows, biggest share first — the order both recommender paths fill in. */
export function quotaRows(categories: readonly CategoryGap[], quota: ReadonlyMap<string, number>): QuotaRow[] {
  return categories
    .map((category) => ({ ...category, want: quota.get(category.key) ?? 0 }))
    .filter((category) => category.want > 0)
    .sort((a, b) => b.want - a.want || b.missing - a.missing);
}
