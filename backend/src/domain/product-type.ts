import { normalizeTr } from '../lib/normalize-tr.js';
import type { TemplateOptionGroup } from './template.js';

/**
 * Product types — the middle layer of the knowledge base: cuisine → PRODUCT TYPE → option templates and typical
 * ingredients (D-179).
 *
 * The option agent used to see a bare product name and invent option groups for it; nothing stopped it from giving a
 * soup a "Pişirme Derecesi" or a baklava an "Ekmek Seçimi", and nothing filled the gap when it answered with nothing.
 * A type knows, for every product that belongs to it:
 *   - the option groups such a product normally opens with on the panel,
 *   - what a customer typically takes out (çıkarılabilir) and adds for a fee (ekstra),
 *   - which option groups can NEVER apply (the validator drops them, whoever proposed them),
 *   - whether it is a plain panel row at all (packaged drinks: no description, no options),
 *   - a 6–8 word description that is true for any product of the type, used only as a last resort.
 * It is given to the model as context, enforced by the validator, and used to complete a card deterministically.
 *
 * The rows live in Postgres (`product_types`, seeded from `db/seed/product-types.ts`, versioned, editable), so the
 * knowledge base grows without a deploy; this module is the pure logic around them.
 */

export interface ProductTypeDef {
  key: string;
  label: string;
  /** The menu category a product of this type normally lands in. */
  categoryKey: string;
  /** Normalized words / phrases that identify the type in a product name (see `matchScore`). */
  keywords: readonly string[];
  /** A plain panel row: no description, no options, no ingredients (packaged / poured drinks). */
  plain: boolean;
  optionGroups: readonly TemplateOptionGroup[];
  removable: readonly string[];
  extras: readonly string[];
  /** Option-group names (or their first words) that never fit this type: "Pişirme Derecesi", "Süt Seçimi". */
  forbiddenGroups: readonly string[];
  /** `forbiddenGroups` normalized for matching; the index fills it in. */
  forbiddenKeys?: readonly string[];
  /**
   * Ingredients the type never contains and is never sold with: meat on a çiğ köfte (it is meatless by definition),
   * onion or pickles on a dessert or in a coffee. Dropped from options, removables and extras alike.
   */
  forbiddenIngredients?: readonly string[];
  /** 6–8 words, true for every product of the type; used only when nothing better exists. */
  fallbackDescription: string;
  /** Cuisines where the type is typical; breaks ties when a name matches two types. */
  cuisines: readonly string[];
  /**
   * Added to the keyword score. The FORM of a product decides its options more than its filling: "Tavuk Döner
   * Dürüm" is a dürüm (boy, lavaş, menü), not a döner portion; "Döner Menü" is a combo. Form types rank higher.
   */
  priority?: number;
}

/**
 * What a sweet product is never sold with: onion, pickles, bread, meat. The dessert and drink types forbid it, and
 * grounding forbids it for any product whose NAME is sweet ("Kakaolu Çörek" in the bakery type, D-188).
 */
export const SAVORY_INGREDIENTS: readonly string[] = [
  'Soğan', 'Sarımsak', 'Acı Sos', 'Turşu', 'Ketçap', 'Mayonez', 'Domates', 'Biber', 'Maydanoz', 'Lavaş', 'Pilav',
  'Patates', 'Ekmek', 'Köfte', 'Et', 'Sucuk', 'Kaşar', 'Kıyma',
];

const tokenize = (text: string): string[] => normalizeTr(text).split(' ').filter(Boolean);

/**
 * How strongly a product name points at a type. A phrase keyword ("kutu icecek") must appear as consecutive words;
 * a single word matches a whole word, or a word it starts ("kebap" ↔ "kebabi" is covered by listing both). Longer
 * keywords score higher, so "ekmek arasi" beats "ekmek" and "tavuk doner" beats "tavuk".
 */
export function matchScore(name: string, type: Pick<ProductTypeDef, 'keywords'>): number {
  const words = tokenize(name);
  const joined = ` ${words.join(' ')} `;
  let best = 0;
  for (const keyword of type.keywords) {
    const k = keyword.trim();
    if (!k) continue;
    if (joined.includes(` ${k} `)) best = Math.max(best, k.split(' ').length * 10 + k.length);
  }
  return best;
}

export class ProductTypeIndex {
  private readonly byKey: Map<string, ProductTypeDef>;
  readonly types: readonly ProductTypeDef[];

  constructor(
    types: readonly ProductTypeDef[],
    /** The type an unrecognized product of a cuisine most likely is ("Karışık" in a pide shop is a pide). */
    private readonly cuisineDefault: ReadonlyMap<string, string> = new Map(),
    /** The type an unrecognized product of a menu category most likely is. */
    private readonly categoryDefault: ReadonlyMap<string, string> = new Map(),
  ) {
    // Keywords and forbidden fragments are written in plain Turkish ("çiğ köfte", "Pişirme Derecesi") and compared
    // in the same normalized form product names get ("cigkofte", "pisirme derecesi").
    this.types = types.map((t) => ({
      ...t,
      keywords: t.keywords.map(normalizeTr).filter(Boolean),
      forbiddenKeys: t.forbiddenGroups.map(normalizeTr).filter(Boolean),
    }));
    this.byKey = new Map(this.types.map((t) => [t.key, t]));
  }

  get(key: string | null | undefined): ProductTypeDef | undefined {
    return key ? this.byKey.get(key) : undefined;
  }

  /**
   * The type of a product. Name first (the most specific keyword wins; a tie goes to the type typical for the
   * cuisine), then the menu category, then the cuisine's default. Never throws and always answers: a product with
   * no clue at all gets the generic dish type, which carries only safe, generic suggestions.
   */
  classify(name: string, cuisineSlug?: string | null, categoryKey?: string | null): ProductTypeDef {
    return this.resolve(name, cuisineSlug, categoryKey).type;
  }

  /**
   * `classify`, plus whether the NAME decided it. A type guessed from the category or the cuisine is a weaker
   * ground for suggestions, and the card's confidence says so.
   */
  resolve(name: string, cuisineSlug?: string | null, categoryKey?: string | null): { type: ProductTypeDef; byName: boolean } {
    let best: ProductTypeDef | undefined;
    let bestScore = 0;
    for (const type of this.types) {
      const score = matchScore(name, type);
      if (score === 0) continue;
      const bonus = (cuisineSlug && type.cuisines.includes(cuisineSlug) ? 1 : 0) + (type.priority ?? 0);
      if (score + bonus > bestScore) {
        best = type;
        bestScore = score + bonus;
      }
    }
    if (best) return { type: best, byName: true };
    const byCategory = categoryKey ? this.get(this.categoryDefault.get(categoryKey)) : undefined;
    if (byCategory) return { type: byCategory, byName: false };
    const byCuisine = cuisineSlug ? this.get(this.cuisineDefault.get(cuisineSlug)) : undefined;
    return { type: byCuisine ?? this.get(GENERIC_TYPE) ?? this.types[0]!, byName: false };
  }

  /** Plain panel row (packaged / poured drink): no description, no options, no ingredients. */
  isPlain(key: string | null | undefined): boolean {
    return this.get(key)?.plain === true;
  }
}

export const GENERIC_TYPE = 'tabak-yemek';

/** The two categories a stray keyword most often gets wrong — and the two that change what a card may carry. */
const DECISIVE_CATEGORIES = new Set(['icecek', 'tatli']);
/**
 * D-198: the sides a main dish gets filed under because of the bread or the meze it comes with — "Tam Ekmek Kokoreç"
 * as a side ("ekmek"), "Atom Kokoreç" as a meze ("atom"). Counted there, a kokoreç shop read as "no main course at
 * all" and was offered Turşu Tabağı and Mısır as mains.
 */
const SIDE_CATEGORIES = new Set(['yan-urun', 'salata-meze']);

/**
 * The menu category of a product, reconciled with its type (D-183). The keyword index takes the first category any word of
 * the name matches, so "Tavuk Suyu Çorbası" became a drink ("su") and "Tatlı Ekşi Soslu Tavuk" a dessert ("tatlı");
 * the type index weighs whole phrases and knows both are dishes. When the restaurant's own heading did not decide,
 * and the NAME identified the type, the type's category wins — only for the drink/dessert confusions, so the gap
 * counts of every other category stay exactly as the keyword table says.
 */
export function reconcileCategory(
  keywordCategory: string,
  headingDecided: boolean,
  resolved: { type: Pick<ProductTypeDef, 'categoryKey'>; byName: boolean },
  known: (key: string) => boolean,
): string {
  const typeCategory = resolved.type.categoryKey;
  if (headingDecided || !resolved.byName || typeCategory === keywordCategory || !known(typeCategory)) return keywordCategory;
  if (typeCategory === 'ana-yemek' && SIDE_CATEGORIES.has(keywordCategory)) return typeCategory;
  return DECISIVE_CATEGORIES.has(keywordCategory) || DECISIVE_CATEGORIES.has(typeCategory) ? typeCategory : keywordCategory;
}

/** An option group's name matches a forbidden fragment of the type. */
export function isForbiddenGroup(type: Pick<ProductTypeDef, 'forbiddenGroups' | 'forbiddenKeys'>, groupName: string): boolean {
  const name = ` ${normalizeTr(groupName)} `;
  const keys = type.forbiddenKeys ?? type.forbiddenGroups.map(normalizeTr);
  return keys.some((fragment) => fragment.length > 0 && name.includes(` ${fragment}`));
}

/** Words in a description, the way a person counts them (punctuation does not count). */
export function countWords(text: string): number {
  return text.split(/\s+/u).filter((w) => /\p{L}/u.test(w)).length;
}

export const DESCRIPTION_MIN_WORDS = 6;
export const DESCRIPTION_MAX_WORDS = 8;

/**
 * Brings a description to the panel's 6–8 words when that can be done honestly: extra words are cut at the last
 * clause boundary that still leaves at least six words, otherwise at eight words. A description that is too short
 * is NOT padded with filler — the caller replaces it instead. Returns null when no acceptable form exists.
 */
export function fitDescription(text: string): string | null {
  const clean = text.replace(/\s+/gu, ' ').trim().replace(/[.;,:]+$/u, '');
  if (!clean) return null;
  const words = clean.split(' ');
  const count = countWords(clean);
  const inRange = (t: string) => countWords(t) >= DESCRIPTION_MIN_WORDS && countWords(t) <= DESCRIPTION_MAX_WORDS;
  if (inRange(clean)) return `${clean}.`;
  if (count < DESCRIPTION_MIN_WORDS) return null;
  // Too long: a clause boundary (",", ";") that keeps 6–8 words reads naturally…
  for (let end = Math.min(words.length, DESCRIPTION_MAX_WORDS); end >= DESCRIPTION_MIN_WORDS; end -= 1) {
    if (!/[,;:]$/u.test(words[end - 1] ?? '')) continue;
    const head = words.slice(0, end).join(' ').replace(/[,;:]+$/u, '');
    if (inRange(head)) return `${head}.`;
  }
  // …otherwise cut at a word that can end a phrase: never on "ve", "ile", "ya da".
  for (let end = Math.min(words.length, DESCRIPTION_MAX_WORDS); end >= DESCRIPTION_MIN_WORDS; end -= 1) {
    const last = normalizeTr(words[end - 1] ?? '');
    if (DANGLING.has(last)) continue;
    const head = words.slice(0, end).join(' ').replace(/[,;:]+$/u, '');
    if (inRange(head)) return `${head}.`;
  }
  return null;
}

const DANGLING = new Set(['ve', 'ile', 'ya', 'da', 'de', 'veya', 'ya da', 'icin', 'olarak', 'gibi', 'bir']);
