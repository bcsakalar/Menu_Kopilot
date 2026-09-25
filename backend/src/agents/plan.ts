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
/**
 * D-181. A menu this small is the "ürün ekle" case — one or two products typed in. It gets one more suggestion, and a
 * category may give two: with one product on the menu there is no "second pide" to avoid, only a menu to start.
 */
const SMALL_MENU = 3;
const QUICK_PRODUCTS_SMALL_MENU = 7;
/**
 * D-181. Quick mode asks the MODEL about this many menu products; every other product still gets its card, from the pool
 * or the knowledge base, at no model cost. "Yalandan olan" mode is the old shape plus a little more: three cards
 * were too few to be useful on a call, and seven fit in the same two parallel calls.
 */
const QUICK_OPTION_TARGETS = 7;
/** Model calls the option agent may make, in parallel. */
const QUICK_OPTION_BATCHES = 2;
const FULL_OPTION_BATCHES = 5;
/** Products per option call (the option agent's batch size). */
const OPTION_BATCH_SIZE = 6;
/** A cuisine with at least this many categories gets one product per category, so the six spread over six. */
const QUICK_SPREAD_CATEGORIES = 5;

/** Full mode never returns less than this, even for a menu that already meets its minimum. */
const FULL_FLOOR = 8;
/** Upper bound on one run: beyond this the list stops being something a person can go through on a call. */
export const MAX_PRODUCTS = 40;
/** Full mode completes every menu product up to here; the ones past the model batches come from the knowledge base. */
export const MAX_OPTION_TARGETS = 40;

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
 * How long ONE model attempt may take. Quick mode keeps the task default (6 s), which leaves room for a fallback
 * inside its own deadline. Full mode asks for more in a single answer — ten products with their option groups —
 * and measured on production the primary provider needs longer than 6 s for that; cutting it off there wasted the
 * call AND the fallback, so the run came back with pool cards only.
 */
const QUICK_ATTEMPT_MS = 6_000;
const FULL_ATTEMPT_MS = 11_000;

/**
 * What the mode costs on top of the configured per-request budget. Full mode asks the option agent in batches and
 * gives the recommender a longer list to fill, so it needs room for those calls; quick mode is the old shape.
 */
export function modeBudget(mode: AnalysisMode): { extraLlmCalls: number; extraInputTokens: number } {
  // Quick mode's second option batch is the "biraz daha fazlası": one call on top of the old shape.
  return mode === 'full' ? { extraLlmCalls: 6, extraInputTokens: 20_000 } : { extraLlmCalls: 1, extraInputTokens: 4_000 };
}

export interface RunPlan {
  mode: AnalysisMode;
  /** How many new products this run aims for — the sum of the quota below. */
  products: number;
  /** How many menu products get a card (options, ingredients, description) — all of them, up to the cap. */
  optionTargets: number;
  /** How many of those the model is asked about; the rest are completed from the pool and the knowledge base. */
  modelOptionTargets: number;
  /** How many model calls the option agent may make for them (in parallel); the rest is completed from the KB. */
  optionBatches: number;
  /** Category key → how many new products that category may receive. The Validator enforces the same map. */
  quota: Map<string, number>;
  deadlineMs: number;
  /** How long one model attempt may take, handed to the two model-backed agents. */
  attemptTimeoutMs: number;
  /** Model calls this mode may spend on top of the configured per-request budget. */
  extraLlmCalls: number;
}

export interface PlanInput {
  mode: AnalysisMode;
  categories: readonly CategoryGap[];
  /** How many products the menu already has. */
  current?: number;
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
    const small = input.current !== undefined && input.current <= SMALL_MENU;
    const perCategory = !small && input.categories.length >= QUICK_SPREAD_CATEGORIES ? 1 : 2;
    const wanted = small ? QUICK_PRODUCTS_SMALL_MENU : QUICK_PRODUCTS;
    const quota = allocate(input.categories, wanted, (c) => (LAST_RESORT.has(c.key) ? 0 : perCategory));
    // Six is the promise, the spread only a preference: a cuisine with five usable categories (a döner shop) came
    // back with five. Once every category has its one, the rest go out again — the open gaps first, then what the
    // cuisine leans on most — at most one more each (D-189).
    if (sum(quota) < wanted && perCategory === 1) {
      const rest = input.categories.map((c) => ({ ...c, missing: Math.max(0, c.missing - (quota.get(c.key) ?? 0)) }));
      const second = allocate(rest, wanted - sum(quota), (c) => (LAST_RESORT.has(c.key) ? 0 : 1));
      for (const [key, count] of second) quota.set(key, (quota.get(key) ?? 0) + count);
    }
    return {
      mode: 'quick',
      products: sum(quota),
      optionTargets: Math.min(MAX_OPTION_TARGETS, input.needOptions),
      modelOptionTargets: Math.min(QUICK_OPTION_TARGETS, input.needOptions),
      optionBatches: QUICK_OPTION_BATCHES,
      quota,
      deadlineMs: QUICK_DEADLINE_MS,
      attemptTimeoutMs: QUICK_ATTEMPT_MS,
      extraLlmCalls: modeBudget('quick').extraLlmCalls,
    };
  }

  // Full: enough to actually reach the opening target (plus two spares), never below the floor.
  const wanted = Math.min(MAX_PRODUCTS, Math.max(FULL_FLOOR, input.missing + 2, shape));
  /**
   * A category's ceiling. Twice what the cuisine expects is enough for a normal menu, but some cuisines ask for
   * far more products than their category table describes — a café with a minimum of 50 has three categories
   * summing to 13, and capping each at double left the run 24 products short of a target it was told to reach.
   * So the ceiling also follows the category's share of what this run needs.
   */
  const shapeTotal = input.categories.reduce((sum, c) => sum + Math.max(1, c.minItems), 0);
  const capOf = (c: CategoryGap): number => {
    if (LAST_RESORT.has(c.key)) return 1;
    const share = Math.ceil((wanted * Math.max(1, c.minItems)) / Math.max(1, shapeTotal));
    return Math.max(2, c.minItems * 2, share);
  };
  const quota = allocate(input.categories, wanted, capOf);
  return {
    mode: 'full',
    products: sum(quota),
    optionTargets: Math.min(MAX_OPTION_TARGETS, input.needOptions),
    modelOptionTargets: Math.min(FULL_OPTION_BATCHES * OPTION_BATCH_SIZE, input.needOptions),
    optionBatches: FULL_OPTION_BATCHES,
    quota,
    deadlineMs: FULL_DEADLINE_MS,
    attemptTimeoutMs: FULL_ATTEMPT_MS,
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
