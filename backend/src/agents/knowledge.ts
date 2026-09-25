import { inArray, isNotNull, sql } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { cuisines, menuCategories, productTypes, suggestionFeedback } from '../db/schema/index.js';
import { ProductTypeIndex, type ProductTypeDef } from '../domain/product-type.js';
import { normalizeTr } from '../lib/normalize-tr.js';

/**
 * Runtime access to the knowledge base (D-179) and to what the team has taught it (D-180). Both are read fresh
 * for every analysis, like the category taxonomy, so an edit or a day of feedback applies to the next call.
 */

export async function loadProductTypeIndex(db: Executor): Promise<ProductTypeIndex> {
  const rows = await db.select().from(productTypes);
  const types: ProductTypeDef[] = rows.map((r) => ({
    key: r.key,
    label: r.label,
    categoryKey: r.categoryKey ?? 'ana-yemek',
    keywords: r.keywords,
    plain: r.plain,
    optionGroups: r.optionGroups,
    removable: r.removable,
    extras: r.extras,
    forbiddenGroups: r.forbiddenGroups,
    forbiddenIngredients: r.forbiddenIngredients,
    fallbackDescription: r.fallbackDescription,
    cuisines: r.cuisines,
    priority: r.priority,
  }));
  const cuisineDefaults = await db
    .select({ slug: cuisines.slug, type: cuisines.defaultProductType })
    .from(cuisines)
    .where(isNotNull(cuisines.defaultProductType));
  const categoryDefaults = await db
    .select({ key: menuCategories.key, type: menuCategories.defaultProductType })
    .from(menuCategories)
    .where(isNotNull(menuCategories.defaultProductType));
  return new ProductTypeIndex(
    types,
    new Map(cuisineDefaults.map((c) => [c.slug, c.type!])),
    new Map(categoryDefaults.map((c) => [c.key, c.type!])),
  );
}

export type FeedbackKind = 'product' | 'option_group' | 'removable' | 'extra' | 'description';

interface Tally {
  accepted: number;
  removed: number;
}

/** The thresholds for "this team keeps throwing this away": enough evidence, and mostly removals. */
const MIN_REMOVALS = 3;
const REMOVAL_RATE = 0.7;

/**
 * What the team kept and removed, per product type. The pipeline asks one question of it — "does the team
 * usually throw this suggestion away for this kind of product?" — and stops offering what the answer is yes for.
 */
export class FeedbackIndex {
  constructor(private readonly tallies: ReadonlyMap<string, Tally> = new Map()) {}

  private static key(type: string, kind: FeedbackKind, value: string): string {
    return `${type}|${kind}|${normalizeTr(value)}`;
  }

  isRejected(type: string | null | undefined, kind: FeedbackKind, value: string): boolean {
    if (!type) return false;
    const tally = this.tallies.get(FeedbackIndex.key(type, kind, value));
    if (!tally || tally.removed < MIN_REMOVALS) return false;
    return tally.removed / (tally.removed + tally.accepted) >= REMOVAL_RATE;
  }

  /** The suggestions of one type the team rejects most — handed to the model so it stops proposing them. */
  rejectedFor(type: string): string[] {
    const out: { value: string; removed: number }[] = [];
    for (const [key, tally] of this.tallies) {
      const [t, kind, value] = key.split('|');
      if (t !== type || kind === 'product' || kind === 'description') continue;
      if (tally.removed >= MIN_REMOVALS && tally.removed / (tally.removed + tally.accepted) >= REMOVAL_RATE) {
        out.push({ value: value ?? '', removed: tally.removed });
      }
    }
    return out.sort((a, b) => b.removed - a.removed).slice(0, 8).map((o) => o.value);
  }
}

export async function loadFeedbackIndex(db: Executor, types?: readonly string[]): Promise<FeedbackIndex> {
  const rows = await db
    .select({
      type: suggestionFeedback.productType,
      kind: suggestionFeedback.kind,
      value: suggestionFeedback.value,
      accepted: sql<number>`count(*) filter (where ${suggestionFeedback.action} = 'accepted')::int`,
      removed: sql<number>`count(*) filter (where ${suggestionFeedback.action} = 'removed')::int`,
    })
    .from(suggestionFeedback)
    .where(types && types.length > 0 ? inArray(suggestionFeedback.productType, [...types]) : isNotNull(suggestionFeedback.productType))
    .groupBy(suggestionFeedback.productType, suggestionFeedback.kind, suggestionFeedback.value);
  const tallies = new Map<string, Tally>();
  for (const row of rows) {
    if (!row.type) continue;
    tallies.set(`${row.type}|${row.kind}|${normalizeTr(row.value)}`, { accepted: row.accepted, removed: row.removed });
  }
  return new FeedbackIndex(tallies);
}
