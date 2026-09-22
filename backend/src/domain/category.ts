import { normalizeTr } from '../lib/normalize-tr.js';

/**
 * Category classification for menu items. The taxonomy itself is data (`menu_categories`), so this module only
 * holds the matching rule: a product belongs to the first category — in `sortOrder` order — that owns one of the
 * tokens of its normalized name.
 *
 * Token matching, not substring matching: "Sütlaç" normalizes to `sutlac`, and a substring rule would read the
 * `su` of the drinks category out of it.
 */

export const FALLBACK_CATEGORY = 'ana-yemek';

/**
 * Categories whose products go on the panel as a PLAIN row: the name, and nothing else. On a delivery platform a drink
 * carries neither a description nor option groups — "orası direkt ürün diye geçiyor" — so suggesting either is
 * noise the expert has to skip past on the call (D-175). The rule lives here because three places need it: the
 * Gap Analyst (no option card, no "açıklama boş" fix), the Validator (a new drink's card carries nothing extra)
 * and the recommender's prompt.
 */
export const PLAIN_CATEGORIES: ReadonlySet<string> = new Set(['icecek']);

export function isPlainCategory(categoryKey: string | null | undefined): boolean {
  return categoryKey !== null && categoryKey !== undefined && PLAIN_CATEGORIES.has(categoryKey);
}

export interface CategoryDef {
  key: string;
  label: string;
  sortOrder: number;
  keywords: readonly string[];
}

export interface CategoryExpectation {
  key: string;
  label: string;
  minItems: number;
  sortOrder: number;
}

export class CategoryIndex {
  private readonly ordered: CategoryDef[];
  private readonly byKey: Map<string, CategoryDef>;

  constructor(categories: readonly CategoryDef[]) {
    this.ordered = [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
    this.byKey = new Map(this.ordered.map((c) => [c.key, c]));
  }

  get all(): readonly CategoryDef[] {
    return this.ordered;
  }

  has(key: string): boolean {
    return this.byKey.has(key);
  }

  label(key: string): string {
    return this.byKey.get(key)?.label ?? key;
  }

  /**
   * Category of a product. `sectionText` (the heading above it on the menu photo / in the panel) is trusted first
   * because the restaurant itself wrote it; the product name is the fallback.
   */
  classify(name: string, sectionText?: string | null): string {
    const fromSection = sectionText ? this.match(sectionText) : undefined;
    if (fromSection) return fromSection;
    return this.match(name) ?? FALLBACK_CATEGORY;
  }

  /**
   * The restaurant's own heading and the product's name point at two different categories ("Ayran" under
   * "Tatlılar"). Reported only when BOTH resolve, so a heading the taxonomy does not know ("Ocakbaşı") never
   * raises a false alarm — the user widens the keywords in `menu_categories` to catch more.
   */
  conflict(name: string, sectionText: string | null | undefined): { section: string; name: string } | null {
    if (!sectionText) return null;
    const fromSection = this.match(sectionText);
    const fromName = this.match(name);
    if (!fromSection || !fromName || fromSection === fromName) return null;
    return { section: fromSection, name: fromName };
  }

  /**
   * Whole-token match, so "su" never matches "Sütlaç". A keyword with a space ("sicak cikolata") matches as a phrase
   * of whole tokens, which lets the user add a precise two-word keyword without teaching the index that every
   * "sıcak" product is a drink.
   */
  private match(text: string): string | undefined {
    const normalized = normalizeTr(text);
    const tokens = new Set(normalized.split(' ').filter((t) => t.length > 0));
    if (tokens.size === 0) return undefined;
    const padded = ` ${normalized} `;
    for (const category of this.ordered) {
      if (category.keywords.some((keyword) => (keyword.includes(' ') ? padded.includes(` ${keyword} `) : tokens.has(keyword)))) {
        return category.key;
      }
    }
    return undefined;
  }
}

export interface CategoryGap {
  key: string;
  label: string;
  present: number;
  minItems: number;
  /** How many products are still needed in this category (never negative). */
  missing: number;
}

/**
 * Per-category gap between what the menu has and what the cuisine expects.
 * Sorted by the size of the gap so the recommender fills the emptiest category first; ties keep the
 * user's own category order.
 */
export function categoryGaps(
  expectations: readonly CategoryExpectation[],
  presentByCategory: ReadonlyMap<string, number>,
): CategoryGap[] {
  return expectations
    .map((expectation) => {
      const present = presentByCategory.get(expectation.key) ?? 0;
      return {
        expectation,
        gap: {
          key: expectation.key,
          label: expectation.label,
          present,
          minItems: expectation.minItems,
          missing: Math.max(0, expectation.minItems - present),
        },
      };
    })
    .sort((a, b) => b.gap.missing - a.gap.missing || a.expectation.sortOrder - b.expectation.sortOrder)
    .map((entry) => entry.gap);
}
