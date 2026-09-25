import { asc, eq } from 'drizzle-orm';
import type { Database, Executor } from '../db/client.js';
import { cuisineCategories, menuCategories } from '../db/schema/index.js';
import {
  type CategoryDef,
  CategoryIndex,
  type CategoryExpectation,
  type CategoryGap,
  categoryGaps,
} from '../domain/category.js';
import type { AgentDeps, AgentRunContext, ExistingItem } from './types.js';

/**
 * Agent 3 — Gap Analyst. Compares the menu against the cuisine's expectations from `cuisine_categories`.
 *
 * Deliberately DETERMINISTIC — no model call. This step is counting and set subtraction: a model would be slower
 * (~2.5 s measured), cost tokens, and can get arithmetic wrong, while the whole point of the redesign is an
 * auditable pipeline. It still records a trace step like every other agent, so the debug screen shows its input
 * and output next to the model-backed ones.
 */

export interface GapAnalysis {
  /** max(10, cuisine.min_item_count) — the branch-opening floor. */
  target: number;
  cuisineMin: number;
  current: number;
  missing: number;
  categories: CategoryGap[];
  /**
   * Products on the menu whose card is not known to be complete — options, ingredients or description missing or
   * unknown. The Option/Modifier agent's input, most evidence first. Packaged drinks never appear here.
   */
  needOptions: ExistingItem[];
  /** Products with a suspicious name or a heading that contradicts them — the "Kontrol et" notes. */
  needFixes: ExistingItem[];
}

/** The hard business rule: a branch opening needs at least this many products, whatever the cuisine says. */
export const MIN_BRANCH_ITEMS = 10;

/** A name this short, or written in all caps with no vowels, reads like an abbreviation on the panel. */
const SHORT_NAME = 4;

/** The category taxonomy, read fresh on every run so an edit in settings applies to the next analysis. */
export async function loadCategories(db: Executor): Promise<CategoryDef[]> {
  return db
    .select({
      key: menuCategories.key,
      label: menuCategories.label,
      sortOrder: menuCategories.sortOrder,
      keywords: menuCategories.keywords,
    })
    .from(menuCategories)
    .orderBy(asc(menuCategories.sortOrder));
}

export async function loadCategoryIndex(db: Executor): Promise<CategoryIndex> {
  return new CategoryIndex(await loadCategories(db));
}

export async function loadExpectations(db: Database, cuisineId: string): Promise<CategoryExpectation[]> {
  const rows = await db
    .select({
      key: cuisineCategories.categoryKey,
      label: menuCategories.label,
      minItems: cuisineCategories.minItems,
      sortOrder: cuisineCategories.sortOrder,
    })
    .from(cuisineCategories)
    .innerJoin(menuCategories, eq(menuCategories.key, cuisineCategories.categoryKey))
    .where(eq(cuisineCategories.cuisineId, cuisineId))
    .orderBy(asc(cuisineCategories.sortOrder));
  return rows;
}

export function looksAbbreviated(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length <= SHORT_NAME) return true;
  // "ADANA KBP" — a word with no vowels longer than two letters is almost always a shorthand.
  return trimmed.split(/\s+/u).some((word) => word.length > 2 && !/[aeıioöuüAEIİOÖUÜ]/u.test(word));
}

export interface GapAnalystInput {
  cuisineId: string;
  cuisineMinItemCount: number;
  items: readonly ExistingItem[];
}

export async function runGapAnalyst(
  deps: Pick<AgentDeps, 'db' | 'tracer' | 'productTypes'>,
  input: GapAnalystInput,
  _run: AgentRunContext,
): Promise<GapAnalysis> {
  return deps.tracer.step(
    'gap_analyst',
    'Eksik analizi',
    { items: input.items.length, cuisineId: input.cuisineId },
    async () => {
      const expectations = await loadExpectations(deps.db, input.cuisineId);
      const presentByCategory = new Map<string, number>();
      for (const item of input.items) {
        presentByCategory.set(item.categoryKey, (presentByCategory.get(item.categoryKey) ?? 0) + 1);
      }

      const target = Math.max(MIN_BRANCH_ITEMS, input.cuisineMinItemCount);
      const current = input.items.length;
      const gaps = categoryGaps(expectations, presentByCategory);

      /**
       * Every product whose options are not KNOWN to exist is a candidate for an option card.
       *
       * The old rule only took `absent` (the panel showed an empty options field) plus typed products that
       * matched the pool. A menu photo shows no panel fields at all, so every product came back `unknown` and
       * the whole section stayed empty — measured: 10 products read from a handwritten menu, 0 option cards.
       * "Bilinmiyor" is not evidence that a product has options; for the expert on the phone it is exactly the
       * case worth asking about.
       *
       * Ordered by how much is known: real gaps first, then the unknowns, and inside each group the products
       * the pool already has curated options for — those cards cost no model call and are the richest.
       */
      const optionRank = (item: ExistingItem): number =>
        (item.hasOptions === 'absent' || item.hasDescription === 'absent' ? 0 : 2) + (item.matchedTemplateId !== null ? 0 : 1);
      const complete = (item: ExistingItem): boolean =>
        item.hasOptions === 'present' && item.hasRemovables === 'present' && item.hasDescription === 'present';
      const needOptions = input.items
        // A packaged drink is a plain row on the panel: nothing to ask about (D-175). A prepared one — a latte, a
        // lemonade — has a size, a milk, a description, and is asked about like any dish (D-179).
        .filter((item) => !complete(item) && !deps.productTypes.isPlain(item.productType))
        .map((item, index) => ({ item, index }))
        .sort((a, b) => optionRank(a.item) - optionRank(b.item) || a.index - b.index)
        .map((entry) => entry.item);
      // An empty description is no longer a note of its own: the product's card carries a ready 6–8 word one.
      const needFixes = input.items.filter(
        (item) =>
          item.categoryConflict !== null ||
          looksAbbreviated(item.rawName) ||
          (item.canonicalName !== null && item.canonicalName !== item.rawName),
      );

      const analysis: GapAnalysis = {
        target,
        cuisineMin: input.cuisineMinItemCount,
        current,
        missing: Math.max(0, target - current),
        categories: gaps,
        needOptions,
        needFixes,
      };
      return {
        value: analysis,
        output: {
          current,
          target,
          missing: analysis.missing,
          categories: gaps.map((g) => `${g.key} ${g.present}/${g.minItems}`),
          needOptions: needOptions.length,
          needFixes: needFixes.length,
        },
      };
    },
  );
}
