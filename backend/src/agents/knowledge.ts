import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
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

export interface Tally {
  accepted: number;
  removed: number;
}

/** "This team keeps throwing this away": enough evidence, and mostly removals. */
const MIN_REMOVALS = 3;
const REMOVAL_RATE = 0.7;
/** "This team keeps taking this": the mirror image, for what goes to the front (D-194). */
const MIN_ACCEPTS = 3;
const ACCEPT_RATE = 0.7;

/** Enough removals, and mostly removals: the team does not want this. Shared with the "Ekibin sildikleri" screen. */
export const isRejectedTally = (t: Tally | undefined): boolean =>
  t !== undefined && t.removed >= MIN_REMOVALS && t.removed / (t.removed + t.accepted) >= REMOVAL_RATE;
const rejectedTally = isRejectedTally;
const favoredTally = (t: Tally | undefined): boolean =>
  t !== undefined && t.accepted >= MIN_ACCEPTS && t.accepted / (t.removed + t.accepted) >= ACCEPT_RATE;

/** Suggestion kinds a card carries; a product and a description are verdicts of another sort. */
const CARD_KINDS = new Set<string>(['option_group', 'removable', 'extra']);

/**
 * What the team kept and removed (D-180, D-194).
 *
 * Per product type, for what a card suggests: an option group, a removable, an extra that is thrown away again and
 * again is not offered any more; one that is kept again and again goes to the front of its list and is named to the
 * model. Per cuisine, for the products themselves: a product turned down with "Önerme" again and again is not
 * suggested to that kitchen any more. Rows the user took back ("Geri al") are not counted at all.
 */
export class FeedbackIndex {
  constructor(
    private readonly tallies: ReadonlyMap<string, Tally> = new Map(),
    private readonly productTallies: ReadonlyMap<string, Tally> = new Map(),
  ) {}

  private static key(type: string, kind: FeedbackKind, value: string): string {
    return `${type}|${kind}|${normalizeTr(value)}`;
  }

  private static productKey(cuisineId: string, name: string): string {
    return `${cuisineId}|${normalizeTr(name)}`;
  }

  isRejected(type: string | null | undefined, kind: FeedbackKind, value: string): boolean {
    if (!type) return false;
    return rejectedTally(this.tallies.get(FeedbackIndex.key(type, kind, value)));
  }

  isFavored(type: string | null | undefined, kind: FeedbackKind, value: string): boolean {
    if (!type) return false;
    return favoredTally(this.tallies.get(FeedbackIndex.key(type, kind, value)));
  }

  /** The suggestions of one type the team rejects most — handed to the model so it stops proposing them. */
  rejectedFor(type: string): string[] {
    return this.ranked(type, rejectedTally, (t) => t.removed);
  }

  /** The suggestions of one type the team keeps most — handed to the model as what this team wants to see. */
  favoredFor(type: string): string[] {
    return this.ranked(type, favoredTally, (t) => t.accepted);
  }

  /** A product this kitchen's team turned down again and again ("Önerme"). */
  isProductRejected(cuisineId: string | null | undefined, name: string): boolean {
    if (!cuisineId) return false;
    return rejectedTally(this.productTallies.get(FeedbackIndex.productKey(cuisineId, name)));
  }

  /** The products turned down for one cuisine, most often first — named to the model so it does not propose them. */
  rejectedProducts(cuisineId: string | null | undefined): string[] {
    if (!cuisineId) return [];
    const out: { value: string; removed: number }[] = [];
    for (const [key, tally] of this.productTallies) {
      const bar = key.indexOf('|');
      if (key.slice(0, bar) !== cuisineId || !rejectedTally(tally)) continue;
      out.push({ value: key.slice(bar + 1), removed: tally.removed });
    }
    return out.sort((a, b) => b.removed - a.removed).slice(0, 12).map((o) => o.value);
  }

  private ranked(type: string, keep: (t: Tally) => boolean, weight: (t: Tally) => number): string[] {
    const out: { value: string; weight: number }[] = [];
    for (const [key, tally] of this.tallies) {
      const [t, kind, value] = key.split('|');
      if (t !== type || !CARD_KINDS.has(kind ?? '') || !keep(tally)) continue;
      out.push({ value: value ?? '', weight: weight(tally) });
    }
    return out.sort((a, b) => b.weight - a.weight).slice(0, 8).map((o) => o.value);
  }
}

/** Adds one grouped row to a tally map: two spellings of one suggestion ("Ekstra kaşar", "Ekstra Kaşar") add up. */
function addTally(map: Map<string, Tally>, key: string, row: { accepted: number; removed: number }): void {
  const tally = map.get(key) ?? { accepted: 0, removed: 0 };
  map.set(key, { accepted: tally.accepted + row.accepted, removed: tally.removed + row.removed });
}

export async function loadFeedbackIndex(db: Executor, types?: readonly string[]): Promise<FeedbackIndex> {
  const counts = {
    accepted: sql<number>`count(*) filter (where ${suggestionFeedback.action} = 'accepted')::int`,
    removed: sql<number>`count(*) filter (where ${suggestionFeedback.action} = 'removed')::int`,
  };
  const rows = await db
    .select({ type: suggestionFeedback.productType, kind: suggestionFeedback.kind, value: suggestionFeedback.value, ...counts })
    .from(suggestionFeedback)
    .where(
      and(
        isNull(suggestionFeedback.ignoredAt),
        types && types.length > 0 ? inArray(suggestionFeedback.productType, [...types]) : isNotNull(suggestionFeedback.productType),
      ),
    )
    .groupBy(suggestionFeedback.productType, suggestionFeedback.kind, suggestionFeedback.value);
  const tallies = new Map<string, Tally>();
  for (const row of rows) {
    if (!row.type) continue;
    addTally(tallies, `${row.type}|${row.kind}|${normalizeTr(row.value)}`, row);
  }

  const productRows = await db
    .select({ cuisineId: suggestionFeedback.cuisineId, value: suggestionFeedback.value, ...counts })
    .from(suggestionFeedback)
    .where(and(eq(suggestionFeedback.kind, 'product'), isNull(suggestionFeedback.ignoredAt), isNotNull(suggestionFeedback.cuisineId)))
    .groupBy(suggestionFeedback.cuisineId, suggestionFeedback.value);
  const productTallies = new Map<string, Tally>();
  for (const row of productRows) {
    if (!row.cuisineId) continue;
    addTally(productTallies, `${row.cuisineId}|${normalizeTr(row.value)}`, row);
  }
  return new FeedbackIndex(tallies, productTallies);
}
