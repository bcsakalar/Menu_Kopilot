import { z } from 'zod';
import type { ExistingItem } from './types.js';

/**
 * The opening checklist (D-206): the rules a new branch's menu is held to, read off the menu the rep sent.
 *
 *   Ürün sayısı   at least the cuisine's target (drinks count too)
 *   İçecek        a drink section with at least MIN_DRINKS drinks
 *   Açıklama      DESCRIPTION_SHARE of the products carry a description
 *   Fotoğraf      IMAGE_SHARE of the products carry a photo
 *   Yazım düzeni  no product name written ALL CAPS or all lower case
 *   Mutfak türü   extra cuisines the menu's own products point to
 *
 * Descriptions and photos are only visible on a panel screenshot; a typed list or a paper menu says nothing about
 * them, so a rule can come back `null` — "bilinmiyor" — rather than a guess.
 */
export const MIN_DRINKS = 10;
export const DESCRIPTION_SHARE = 0.7;
export const IMAGE_SHARE = 0.2;
/** Products of another cuisine it takes before that cuisine is worth selecting as an extra one. */
export const EXTRA_CUISINE_MIN_ITEMS = 3;
const DRINK_CATEGORY = 'icecek';
/** Categories that say nothing about the kitchen: every cuisine sells drinks, sides and set menus. */
const NEUTRAL_CATEGORIES: ReadonlySet<string> = new Set([DRINK_CATEGORY, 'yan-urun', 'menu-kampanya']);
const MAX_LISTED = 5;

const shareRuleSchema = z.object({
  present: z.number().int(),
  /** Products whose field was visible at all (present + absent). */
  known: z.number().int(),
  total: z.number().int(),
  share: z.number(),
  ok: z.boolean().nullable(),
});

export const qualitySchema = z.object({
  products: z.object({ current: z.number().int(), target: z.number().int(), ok: z.boolean() }),
  drinks: z.object({ current: z.number().int(), target: z.number().int(), ok: z.boolean() }),
  descriptions: shareRuleSchema,
  images: shareRuleSchema,
  writing: z.object({ names: z.array(z.string()), checked: z.number().int(), ok: z.boolean().nullable() }),
  extraCuisines: z.array(z.object({ name: z.string(), count: z.number().int() })),
});
export type MenuQuality = z.infer<typeof qualitySchema>;

type Flag = ExistingItem['hasDescription'];

/** Met for sure, missed for sure, or not visible enough to tell. */
function shareRule(flags: readonly Flag[], share: number): z.infer<typeof shareRuleSchema> {
  const total = flags.length;
  const present = flags.filter((f) => f === 'present').length;
  const known = present + flags.filter((f) => f === 'absent').length;
  const unknown = total - known;
  const ok = total === 0 ? null : present >= share * total ? true : present + unknown < share * total ? false : null;
  return { present, known, total, share, ok };
}

/** "ADANA KEBAP" or "adana kebap": the panel wants "Adana Kebap". Very short names and codes are left alone. */
export function badCasing(name: string): boolean {
  const letters = name.replace(/[^\p{L}]/gu, '');
  if (letters.length < 4) return false;
  return letters === letters.toLocaleUpperCase('tr') || letters === letters.toLocaleLowerCase('tr');
}

export function menuQuality(input: {
  items: readonly ExistingItem[];
  target: number;
  mainCuisineId: string;
  /** The cuisine of the pool template a product matched, if any. */
  cuisineOf: (item: ExistingItem) => string | undefined;
  cuisineName: (id: string) => string | undefined;
}): MenuQuality {
  const { items } = input;
  const drinks = items.filter((item) => item.categoryKey === DRINK_CATEGORY).length;
  // Only what was read off the restaurant's own menu says how it is written; the rep's typing does not.
  const read = items.filter((item) => !item.typed);
  const badNames = read.filter((item) => badCasing(item.rawName)).map((item) => item.rawName);

  const extra = new Map<string, number>();
  for (const item of items) {
    if (NEUTRAL_CATEGORIES.has(item.categoryKey)) continue;
    const cuisine = input.cuisineOf(item);
    if (cuisine !== undefined && cuisine !== input.mainCuisineId) extra.set(cuisine, (extra.get(cuisine) ?? 0) + 1);
  }
  const extraCuisines = [...extra.entries()]
    .filter(([, count]) => count >= EXTRA_CUISINE_MIN_ITEMS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .flatMap(([id, count]) => {
      const name = input.cuisineName(id);
      return name ? [{ name, count }] : [];
    });

  return {
    products: { current: items.length, target: input.target, ok: items.length >= input.target },
    drinks: { current: drinks, target: MIN_DRINKS, ok: drinks >= MIN_DRINKS },
    descriptions: shareRule(
      items.map((item) => item.hasDescription),
      DESCRIPTION_SHARE,
    ),
    images: shareRule(
      items.map((item) => item.hasImage),
      IMAGE_SHARE,
    ),
    writing: { names: badNames.slice(0, MAX_LISTED), checked: read.length, ok: read.length === 0 ? null : badNames.length === 0 },
    extraCuisines,
  };
}
