import type { CategoryGap } from '../domain/category.js';

/**
 * The run plan — how much work one analysis does, and how that work is split between the cuisine's categories.
 *
 * Two modes, chosen by the user on the home screen:
 *   quick — "öneri versen yeter": enough products to pass the cuisine's target (D-213; ten when the menu already
 *           meets it) — alternatives built on the menu's own products first, then the categories — and a few option
 *           cards.
 *   full  — "hakikaten işimizi yapalım": recommend until the menu would actually reach the cuisine's minimum,
 *           and ask for options/ingredients on every product whose options are not already known.
 *
 * Everything here is deterministic arithmetic, unit-tested, and shared by the recommender (what to ask for) and
 * the Validator (what may pass). One source of truth, so the two can never disagree about a category's quota.
 */

export const ANALYSIS_MODES = ['quick', 'full'] as const;
export type AnalysisMode = (typeof ANALYSIS_MODES)[number];
export const DEFAULT_MODE: AnalysisMode = 'full';

/**
 * Quick mode, D-198: ten new products — six ALTERNATIVES built on the products in the photo (the same meat, dough or
 * dessert base in a form the menu lacks: Adana → Beyti, kokoreç → kokoreç dürüm) and four from the categories the
 * menu is short of, spread over different ones. Before it was six from the category gaps alone, which is how a
 * kokoreç shop was offered waffle and kumpir.
 */
const QUICK_PRODUCTS = 4;
const QUICK_ALTERNATIVES = 6;
/** Full mode: on top of the category quota, alternatives built on the menu's own products. */
const FULL_ALTERNATIVES = 8;
/**
 * D-181. A menu this small is the "ürün ekle" case — one or two products typed in. It gets one more suggestion, and a
 * category may give two: with one product on the menu there is no "second pide" to avoid, only a menu to start.
 */
const SMALL_MENU = 3;
const QUICK_PRODUCTS_SMALL_MENU = 5;
const QUICK_ALTERNATIVES_SMALL_MENU = 5;
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
/**
 * D-213. Every run aims past the cuisine's target, never just to it: the menu should still reach it when the restaurant
 * turns a few suggestions down. A tenth of the target, at least three.
 */
const MIN_OVERSHOOT = 3;
/** A quick run never offers fewer than this, even to a menu that already meets its target. */
export const QUICK_TOTAL = QUICK_PRODUCTS + QUICK_ALTERNATIVES;
/**
 * Alternatives built on the menu's own products, at most, in a run that fills to the target: one model call answers
 * them (see RECOMMEND_BATCH in the recommender) and the category products bring the rest.
 */
const MAX_ALTERNATIVES = 10;
/** Share of a long run that goes to alternatives: the variants of what the rep gave come first ("hamsi çeşitleri"). */
const ALTERNATIVE_SHARE = 0.3;
/**
 * Upper bound on one run. The admin may set a cuisine's minimum up to 500; real targets sit far below this, so it only
 * stops a typo from turning one analysis into hundreds of cards.
 */
export const MAX_PRODUCTS = 120;

/** How far past the target a run aims (D-213). */
export const overshoot = (target: number): number => Math.max(MIN_OVERSHOOT, Math.ceil(target / 10));

/** New products that bring a menu of `current` products past its `target`: the gap plus the overshoot. */
export const fillGoal = (current: number, target: number): number => Math.max(0, target - current) + overshoot(target);

/**
 * D-213. How many new products a run that starts or grows a menu offers: enough to pass the cuisine's target, and never
 * fewer than a quick run's ten. A typed "hamsi", a screenshot of eleven pizzas or a cuisine named alone all get the
 * same rule.
 */
export const fillCount = (current: number, target: number): number => Math.min(MAX_PRODUCTS, Math.max(QUICK_TOTAL, fillGoal(current, target)));

/**
 * A follow-up's share of the same promise: what the menu still needs past the products already offered in this call
 * ("Daha fazla ürün öner" after a short first answer, a second screenshot).
 */
export const topUp = (current: number, target: number, openOffers: number): number =>
  Math.min(MAX_PRODUCTS, Math.max(0, fillGoal(current, target) - openOffers));

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
const QUICK_DEADLINE_MS = 14_000;
const FULL_DEADLINE_MS = 26_000;

/**
 * How long ONE model attempt may take. Quick mode keeps the task default (6 s), which leaves room for a fallback
 * inside its own deadline. Full mode asks for more in a single answer — ten products with their option groups —
 * and measured on production the primary provider needs longer than 6 s for that; cutting it off there wasted the
 * call AND the fallback, so the run came back with pool cards only.
 */
// D-198: one quick answer now carries ten products with their options and ingredients — measured at 3–5 s on the
// primary provider, so 6 s cut off the healthy-but-long ones.
const QUICK_ATTEMPT_MS = 8_000;
const FULL_ATTEMPT_MS = 11_000;

/**
 * What the mode costs on top of the configured per-request budget. Full mode asks the option agent in batches and
 * gives the recommender a longer list to fill, so it needs room for those calls; quick mode is the old shape.
 */
export function modeBudget(mode: AnalysisMode): { extraLlmCalls: number; extraInputTokens: number } {
  // Quick mode's second option batch is the "biraz daha fazlası"; the alternatives (D-198) add one recommend call in
  // call of their own in both modes, with a longer prompt — the kitchen brief. D-213: a quick run fills to the target
  // too, so it may need the category batches the pool cannot answer (up to four, in parallel).
  return mode === 'full' ? { extraLlmCalls: 7, extraInputTokens: 26_000 } : { extraLlmCalls: 6, extraInputTokens: 20_000 };
}

export interface RunPlan {
  mode: AnalysisMode;
  /** How many new products this run aims for from the category quota — the sum of the quota below. */
  products: number;
  /**
   * How many new products are built on the menu's own products (D-198), on top of the quota: alternatives the
   * kitchen can make with what it already has. They are not counted against a category.
   */
  alternatives: number;
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
  /** The cuisine's opening target; current + missing when not given. */
  target?: number;
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

/**
 * A category's ceiling in a run of `wanted` products. Twice what the cuisine expects is enough for a normal menu, but
 * some cuisines ask for far more products than their category table describes — a café with a minimum of 50 has three
 * categories summing to 13, and capping each at double left the run 24 products short of a target it was told to
 * reach. So the ceiling also follows the category's share of what this run needs. A combo is the last resort: one.
 */
function shareCap(categories: readonly CategoryGap[], wanted: number): (c: CategoryGap) => number {
  const shapeTotal = categories.reduce((sum, c) => sum + Math.max(1, c.minItems), 0);
  return (c) => {
    if (LAST_RESORT.has(c.key)) return 1;
    const share = Math.ceil((wanted * Math.max(1, c.minItems)) / Math.max(1, shapeTotal));
    return Math.max(2, c.minItems * 2, share);
  };
}

/**
 * `wanted` slots over the categories under their ceilings — and, when the ceilings together hold less (the combo's
 * share of a long run is one), the rest by the cuisine's shape past them: the run keeps its count (D-213).
 */
function spread(categories: readonly CategoryGap[], wanted: number): Map<string, number> {
  const quota = allocate(categories, wanted, shareCap(categories, wanted));
  const rest = wanted - sum(quota);
  if (rest <= 0) return quota;
  const more = allocate(
    categories.map((c) => ({ ...c, missing: 0 })),
    rest,
    (c) => (LAST_RESORT.has(c.key) ? 0 : Number.POSITIVE_INFINITY),
  );
  for (const [key, count] of more) quota.set(key, (quota.get(key) ?? 0) + count);
  return quota;
}

export function planRun(input: PlanInput): RunPlan {
  const shape = input.categories.reduce((sum, c) => sum + c.missing, 0);
  const current = input.current ?? 0;
  const target = input.target ?? current + input.missing;

  const total = fillCount(current, target);
  if (input.mode === 'quick' && total > QUICK_TOTAL) {
    // D-213: a menu short of its target gets enough to pass it. The variants of what the rep gave lead (a third of the
    // run, up to one model call's worth); the rest follows the cuisine's shape, every short category first.
    const alternatives = Math.min(MAX_ALTERNATIVES, Math.max(QUICK_ALTERNATIVES, Math.round(total * ALTERNATIVE_SHARE)));
    const wanted = total - alternatives;
    const quota = spread(input.categories, wanted);
    return {
      mode: 'quick',
      products: sum(quota),
      alternatives,
      optionTargets: Math.min(MAX_OPTION_TARGETS, input.needOptions),
      modelOptionTargets: Math.min(QUICK_OPTION_TARGETS, input.needOptions),
      optionBatches: QUICK_OPTION_BATCHES,
      quota,
      deadlineMs: QUICK_DEADLINE_MS,
      attemptTimeoutMs: QUICK_ATTEMPT_MS,
      extraLlmCalls: modeBudget('quick').extraLlmCalls,
    };
  }

  if (input.mode === 'quick') {
    // One product per category when the cuisine has enough of them: six suggestions from six different
    // categories, none of them a second copy of something the menu already leans on.
    const small = input.current !== undefined && input.current <= SMALL_MENU;
    const perCategory = !small && input.categories.length >= QUICK_SPREAD_CATEGORIES ? 1 : 2;
    const wanted = small ? QUICK_PRODUCTS_SMALL_MENU : QUICK_PRODUCTS;
    const quota = allocate(input.categories, wanted, (c) => (LAST_RESORT.has(c.key) ? 0 : perCategory));
    // Six is the promise, the spread only a preference: a cuisine with five usable categories (a döner shop) came
    // back with five, an ice-cream shop with two categories with four. Once every category has its share, the rest
    // go out again round by round — the open gaps first, then what the cuisine leans on most — one more per
    // category per round (D-189).
    while (sum(quota) < wanted) {
      const rest = input.categories.map((c) => ({ ...c, missing: Math.max(0, c.missing - (quota.get(c.key) ?? 0)) }));
      const more = allocate(rest, wanted - sum(quota), (c) => (LAST_RESORT.has(c.key) ? 0 : 1));
      if (sum(more) === 0) break;
      for (const [key, count] of more) quota.set(key, (quota.get(key) ?? 0) + count);
    }
    return {
      mode: 'quick',
      products: sum(quota),
      alternatives: small ? QUICK_ALTERNATIVES_SMALL_MENU : QUICK_ALTERNATIVES,
      optionTargets: Math.min(MAX_OPTION_TARGETS, input.needOptions),
      modelOptionTargets: Math.min(QUICK_OPTION_TARGETS, input.needOptions),
      optionBatches: QUICK_OPTION_BATCHES,
      quota,
      deadlineMs: QUICK_DEADLINE_MS,
      attemptTimeoutMs: QUICK_ATTEMPT_MS,
      extraLlmCalls: modeBudget('quick').extraLlmCalls,
    };
  }

  // Full: past the opening target like a quick run (D-213), never below the floor; its alternatives come on top.
  const wanted = Math.min(MAX_PRODUCTS, Math.max(FULL_FLOOR, fillGoal(current, target), shape));
  const quota = spread(input.categories, wanted);
  return {
    mode: 'full',
    products: sum(quota),
    alternatives: FULL_ALTERNATIVES,
    optionTargets: Math.min(MAX_OPTION_TARGETS, input.needOptions),
    modelOptionTargets: Math.min(FULL_OPTION_BATCHES * OPTION_BATCH_SIZE, input.needOptions),
    optionBatches: FULL_OPTION_BATCHES,
    quota,
    deadlineMs: FULL_DEADLINE_MS,
    attemptTimeoutMs: FULL_ATTEMPT_MS,
    extraLlmCalls: modeBudget('full').extraLlmCalls,
  };
}

/**
 * What a chat follow-up asks of a run (D-200): the same agents and the same guards as a first analysis, on the menu the
 * conversation already has, for only what was asked — "tatlı öner", "Adana'ya opsiyon yaz", a second screenshot.
 */
export interface RunFocus {
  /** How many new products to ask for; 0 = none. */
  products: number;
  /** Only this category gets them; null = spread over the menu's gaps. */
  categoryKey: string | null;
  /** Menu products to complete, as the chat names them. */
  targets: readonly string[];
  /** Complete only the products this run's images added to the list. */
  newItemsOnly: boolean;
  /** Everything already offered in this conversation: it is not offered twice. */
  exclude: readonly string[];
  /** The segment the first analysis read; a follow-up does not ask the Classifier again. */
  priceSegment: string;
}

/**
 * A quick run narrowed to the focus. Half of an open request goes to alternatives, as in a first analysis — up to one
 * model call's worth, so a top-up to the target (D-213) spreads the rest over the cuisine's categories.
 */
export function focusPlan(plan: RunPlan, focus: RunFocus, categories: readonly CategoryGap[], targets: number): RunPlan {
  const alternatives = focus.categoryKey ? 0 : Math.min(MAX_ALTERNATIVES, Math.ceil(focus.products / 2));
  const inCategories = focus.products - alternatives;
  const quota = focus.categoryKey
    ? new Map([[focus.categoryKey, focus.products]])
    : allocate(categories, inCategories, (c) => (LAST_RESORT.has(c.key) ? 0 : Math.max(2, inCategories)));
  return { ...plan, products: sum(quota), alternatives, optionTargets: targets, modelOptionTargets: targets, quota };
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
