import type { ProductTypeDef, ProductTypeIndex } from '../domain/product-type.js';
import { normalizeTr } from '../lib/normalize-tr.js';
import { baseWord } from '../lib/same-product.js';

/**
 * What THIS kitchen can make (D-198).
 *
 * The user's complaint on the field: a photo of a kokoreç shop came back with Waffle, Kumpir and Midye Tava, a kebap
 * shop with Tavuk Döner Dürüm, a şam tatlısı shop with Top Dondurma — products of another shop, because the pool was
 * read per cuisine ("Sokak Lezzetleri" holds the kokoreççi, the midyeci and the kumpirci alike) and ordered by how
 * common a product is, not by whether this restaurant can make it.
 *
 * The profile reads the menu itself: the product types it sells (a kebap shop has a mangal, a pide shop a stone oven),
 * the ingredient and form words of its products (tavuk, kıyma, kokoreç, lavaş, irmik…) and the speciality words that
 * need their own equipment and know-how (döner, tantuni, midye, kumpir…). A new product must be makeable with what
 * the menu shows; among the makeable ones, the closer it is to a product on the menu, the earlier it comes — that
 * is what makes a suggestion an *alternative* the seller can say yes to on the call.
 *
 * Deterministic and cheap: it ranks the pool, briefs the model, and is the Validator's last check on both.
 */

/** Sold by any restaurant: a fridge of drinks and a kettle are not a kitchen. */
const UNIVERSAL_TYPES: ReadonlySet<string> = new Set(['mesrubat', 'cay']);
/** Types that say nothing about the kitchen: a combo of what is there, and the generic fallback dish. */
const UNINFORMATIVE_TYPES: ReadonlySet<string> = new Set(['mesrubat', 'cay', 'menu-kampanya', 'tabak-yemek']);

// Shared "also makes" sets. A savory kitchen can plate a salad, a side and a combo; a pot dessert (sütlaç,
// kazandibi) is bought in or made in a pot almost anywhere; a fryer is in most fast kitchens.
const SIDES = ['salata', 'garnitur', 'menu-kampanya', 'tabak-yemek'];
const FRYER = ['yan-urun', 'ara-sicak'];
const POT_DESSERT = ['tatli-sutlu'];
const HOT_DRINKS = ['cay', 'sicak-kahve'];
const GRILL = ['kebap-porsiyon', 'kofte-porsiyon', 'tavuk-izgara', 'cokertme'];

/**
 * Product type → the types a kitchen that sells it can ALSO make with the same people, equipment and stock. Read as
 * "a kebap shop can also sell dürüm, lahmacun, çorba, künefe", never "a kebap shop can also sell döner": a döner
 * needs its own machine. A type missing here makes only itself (plus the universal drinks).
 */
const ALSO_MAKES: Readonly<Record<string, readonly string[]>> = {
  'kebap-porsiyon': [...GRILL, 'durum', 'ekmek-arasi', 'lahmacun', 'pide', 'corba', 'meze', 'pilav-ustu', ...FRYER, 'tatli-serbetli', ...POT_DESSERT, ...SIDES],
  'kofte-porsiyon': [...GRILL, 'durum', 'ekmek-arasi', 'corba', 'meze', 'pilav-ustu', ...FRYER, ...POT_DESSERT, ...SIDES],
  'tavuk-izgara': [...GRILL, 'durum', 'ekmek-arasi', 'corba', 'meze', 'pilav-ustu', ...FRYER, ...POT_DESSERT, ...SIDES],
  cokertme: [...GRILL, 'et-yemegi', 'corba', 'meze', ...FRYER, 'tatli-serbetli', ...POT_DESSERT, ...SIDES],
  'doner-porsiyon': ['durum', 'ekmek-arasi', 'pilav-ustu', 'corba', ...FRYER, ...POT_DESSERT, ...SIDES],
  durum: ['ekmek-arasi', 'pilav-ustu', ...FRYER, ...POT_DESSERT, ...SIDES],
  'ekmek-arasi': ['durum', ...FRYER, ...SIDES],
  'pilav-ustu': ['corba', 'meze', ...POT_DESSERT, ...SIDES],
  steak: ['burger', 'kofte-porsiyon', 'tavuk-izgara', 'makarna', 'bowl', 'corba', ...FRYER, 'tatli-pasta', ...SIDES],
  'tavuk-citir': ['burger', 'durum', 'ekmek-arasi', ...FRYER, ...SIDES, 'soguk-icecek'],
  burger: ['tavuk-citir', 'durum', 'ekmek-arasi', 'tost-sandvic', ...FRYER, 'tatli-pasta', ...SIDES, 'soguk-icecek'],
  pizza: ['makarna', ...FRYER, 'tatli-pasta', ...SIDES, 'soguk-icecek'],
  pide: ['lahmacun', 'borek-gozleme', 'corba', 'meze', 'tatli-serbetli', ...POT_DESSERT, ...SIDES],
  lahmacun: ['pide', 'corba', 'meze', 'tatli-serbetli', ...POT_DESSERT, ...SIDES],
  'cig-kofte': ['durum', 'meze', 'bowl', ...POT_DESSERT, 'salata', 'menu-kampanya'],
  'et-yemegi': ['corba', 'pilav-ustu', 'kofte-porsiyon', 'makarna', 'manti', 'borek-gozleme', 'meze', 'yan-urun', 'tatli-serbetli', ...POT_DESSERT, ...SIDES],
  balik: ['deniz-urunu', 'midye', 'ekmek-arasi', 'meze', 'corba', ...FRYER, 'tatli-serbetli', ...POT_DESSERT, ...SIDES],
  'deniz-urunu': ['balik', 'midye', 'meze', ...FRYER, ...SIDES],
  midye: ['deniz-urunu'],
  makarna: ['pizza', 'bowl', 'corba', 'manti', 'ara-sicak', 'tatli-pasta', ...SIDES],
  manti: ['borek-gozleme', 'corba', 'et-yemegi', 'makarna', 'meze', ...POT_DESSERT, ...SIDES],
  'borek-gozleme': ['manti', 'firin', 'kahvalti-tabagi', 'yumurta', 'corba', 'pide', 'tost-sandvic', ...HOT_DRINKS, ...POT_DESSERT, 'salata'],
  firin: ['borek-gozleme', 'tatli-pasta', 'tost-sandvic', 'kahvalti-tabagi', ...HOT_DRINKS, ...POT_DESSERT, 'soguk-icecek'],
  'kahvalti-tabagi': ['yumurta', 'borek-gozleme', 'tost-sandvic', 'firin', 'salata', ...HOT_DRINKS, 'soguk-icecek'],
  yumurta: ['kahvalti-tabagi', 'borek-gozleme', 'tost-sandvic', 'firin', 'salata', ...HOT_DRINKS, 'soguk-icecek'],
  'tost-sandvic': ['kahvalti-tabagi', 'yumurta', 'yan-urun', 'salata', 'menu-kampanya', ...HOT_DRINKS, 'soguk-icecek'],
  corba: ['et-yemegi', 'pilav-ustu', 'meze', ...POT_DESSERT, ...SIDES],
  salata: ['bowl', 'meze'],
  bowl: ['salata', 'soguk-icecek'],
  meze: ['salata', 'ara-sicak'],
  'ara-sicak': ['yan-urun', 'meze'],
  'yan-urun': ['ara-sicak'],
  kumpir: ['tatli-pasta', 'soguk-icecek', 'salata'],
  sushi: ['wok', 'bowl', 'corba', 'ara-sicak', 'salata'],
  wok: ['sushi', 'bowl', 'corba', 'ara-sicak', 'salata'],
  meksika: ['burger', 'durum', 'tavuk-citir', 'bowl', ...FRYER, ...SIDES],
  'tatli-serbetli': ['tatli-sutlu', 'dondurma', ...HOT_DRINKS, 'soguk-icecek'],
  'tatli-sutlu': ['tatli-pasta', ...HOT_DRINKS, 'soguk-icecek'],
  'tatli-pasta': ['tatli-sutlu', 'dondurma', 'firin', ...HOT_DRINKS, 'soguk-icecek', 'soguk-kahve'],
  dondurma: ['soguk-icecek', 'tatli-pasta'],
  'sicak-kahve': ['soguk-kahve', 'soguk-icecek', 'tatli-pasta', 'firin', 'tost-sandvic', 'cay'],
  'soguk-kahve': ['sicak-kahve', 'soguk-icecek', 'tatli-pasta', 'firin', 'cay'],
  'soguk-icecek': ['sicak-kahve', 'cay'],
};

/**
 * Words that name a speciality — its own machine, its own master, its own stock. A product with one of these words is
 * suggested only to a menu that already shows the word: "Et Tantuni Dürüm" is a dürüm, but a kokoreççi has no
 * tantuni sac. Normalized, base forms.
 */
const SPECIALTIES: ReadonlyMap<string, string> = new Map([
  ['doner', 'döner'],
  ['iskender', 'döner'],
  ['tantuni', 'tantuni'],
  ['kokorec', 'kokoreç'],
  ['midye', 'midye'],
  ['kumpir', 'kumpir'],
  ['waffle', 'waffle'],
  ['kunefe', 'künefe'],
  ['dondurma', 'dondurma'],
  ['sushi', 'sushi'],
  ['cigkofte', 'çiğ köfte'],
  ['iskembe', 'işkembe'],
  ['kelle', 'kelle paça'],
  ['paca', 'kelle paça'],
  ['katmer', 'katmer'],
]);
/** Specialities that come with each other: a döner shop's "İskender", a kelle-paça shop's "Paça". */
const SPECIALTY_ALSO: Readonly<Record<string, readonly string[]>> = {
  kunefe: ['katmer'],
  katmer: ['kunefe'],
};

/** Words that never tell one product from another: sizes, serving words, filler. */
const NOISE_WORDS: ReadonlySet<string> = new Set([
  'menu', 'porsiyon', 'servis', 'tabak', 'tabagi', 'buyuk', 'kucuk', 'orta', 'boy', 'adet', 'tam', 'yarim', 'ceyrek',
  'cift', 'tek', 'sade', 'ozel', 'usta', 'ev', 'yapimi', 'usulu', 'klasik', 'geleneksel', 'taze', 'sikma', 've', 'ile',
  'bol', 'mini', 'maxi', 'mega', 'super', 'extra', 'ekstra', 'special', 'spesiyal', 'lezzet', 'nefis', 'gunun',
  'tatli', 'corba', 'icecek', 'kutu', 'sise', 'litre', 'litrelik', 'cl', 'ml', 'lt',
]);

/** Packaged soft-drink brands and words: a menu with any of them has "Kutu İçecek" already. */
const SOFT_DRINK_WORDS: ReadonlySet<string> = new Set([
  'kola', 'cola', 'coca', 'pepsi', 'fanta', 'sprite', 'gazoz', 'yedigun', 'fuse', 'lipton', 'tea', 'icecek', 'schweppes',
]);
/** Generic drink rows the pool carries; they add nothing to a menu that already lists its soft drinks. */
const GENERIC_DRINK_ROWS: ReadonlySet<string> = new Set(['kutu icecek', 'kutu kola', 'gazli icecek', 'sise icecek']);

const words = (normalized: string): string[] =>
  normalized
    .split(' ')
    .filter((word) => word.length >= 3 && !/^\d/u.test(word))
    .map(baseWord)
    .filter((word) => !NOISE_WORDS.has(word));

export interface KitchenItem {
  /** The product as the menu (or the pool's canonical spelling) names it. */
  name: string;
}

export interface KitchenFit {
  /** The kitchen can make it with what the menu shows. */
  ok: boolean;
  /** Higher = closer to what the restaurant already makes. Ranks the makeable candidates. */
  score: number;
  /** The menu product it is closest to — what makes it an alternative ("Adana Kebap" for "Beyti"); null if none. */
  basedOn: string | null;
  /** Why not, when `ok` is false (for the trace). */
  reason?: string;
}

export class KitchenProfile {
  /** Product types the menu shows by name (a type guessed from a category or cuisine is not evidence). */
  readonly types = new Set<string>();
  /** Every type this kitchen can make: its own, what they come with, the universal drinks. */
  readonly reachable = new Set<string>(UNIVERSAL_TYPES);
  /** Speciality words the menu shows. */
  readonly specialties = new Set<string>();
  private readonly products: { name: string; words: Set<string>; type: string | null }[] = [];
  private readonly examples = new Map<string, string[]>();
  private softDrinks = false;

  constructor(
    items: readonly KitchenItem[],
    private readonly productTypes: ProductTypeIndex,
    private readonly cuisineSlug: string | null = null,
  ) {
    for (const item of items) {
      const normalized = normalizeTr(item.name);
      const own = words(normalized);
      const resolved = productTypes.resolve(item.name, cuisineSlug);
      const type = resolved.byName ? resolved.type.key : null;
      this.products.push({ name: item.name, words: new Set(own), type });
      for (const word of normalized.split(' ').map(baseWord)) {
        if (SPECIALTIES.has(word)) {
          this.specialties.add(word);
          for (const also of SPECIALTY_ALSO[word] ?? []) this.specialties.add(also);
        }
        if (SOFT_DRINK_WORDS.has(word)) this.softDrinks = true;
      }
      if (type === null || UNINFORMATIVE_TYPES.has(type)) continue;
      this.types.add(type);
      const list = this.examples.get(type) ?? [];
      if (list.length < 3) list.push(item.name);
      this.examples.set(type, list);
    }
    for (const type of this.types) {
      this.reachable.add(type);
      for (const also of ALSO_MAKES[type] ?? []) this.reachable.add(also);
    }
  }

  /** False when the menu shows no product type at all (only drinks, brand names): nothing to judge by. */
  get informative(): boolean {
    return this.types.size > 0;
  }

  /** The product type of a candidate name, and whether the name decided it. */
  typeOf(name: string, categoryKey?: string | null): { type: ProductTypeDef; byName: boolean } {
    return this.productTypes.resolve(name, this.cuisineSlug, categoryKey);
  }

  /**
   * Can this kitchen make the product, and how close is it to what the menu already sells.
   * `type` is the candidate's resolved product type; `byName` false means the type is only a guess.
   */
  fit(name: string, type: string, byName = true): KitchenFit {
    const normalized = normalizeTr(name);
    const own = words(normalized);
    const all = normalized.split(' ').map(baseWord);
    const missing = all.find((word) => SPECIALTIES.has(word) && !this.specialties.has(word));
    const closest = this.closest(own, type);
    const basedOn = closest && closest.shared > 0 ? closest.name : null;
    const shared = closest?.shared ?? 0;
    const sameType = this.types.has(type);

    if (missing && !sameType) {
      return { ok: false, score: 0, basedOn, reason: `${SPECIALTIES.get(missing)} menüde yok` };
    }
    if (missing && sameType && shared === 0) {
      // Same family, but a speciality the menu does not show ("Fıstıklı Künefe" to a baklava shop is fine only
      // because baklava shops do künefe — see SPECIALTY_ALSO; a "Döner Pide" to a pide shop is not).
      return { ok: false, score: 0, basedOn, reason: `${SPECIALTIES.get(missing)} menüde yok` };
    }
    const reachable = !this.informative || this.reachable.has(type) || (!byName && shared > 0);
    if (!reachable) return { ok: false, score: 0, basedOn, reason: 'bu mutfağın ürünü değil' };

    const universal = UNIVERSAL_TYPES.has(type);
    const score = (sameType ? 40 : universal ? 5 : 15) + Math.min(3, shared) * 15;
    return { ok: true, score, basedOn: sameType || shared > 0 ? (basedOn ?? this.examples.get(type)?.[0] ?? null) : null };
  }

  /**
   * A drink the menu already lists under another name: "Ayran" next to "Ayran Özerhisar", "Kutu İçecek" next to
   * Coca Cola and Fanta. Brands add words without making another product.
   */
  coversDrink(name: string, type: string): boolean {
    if (!UNIVERSAL_TYPES.has(type) && type !== 'mesrubat') return false;
    const normalized = normalizeTr(name);
    if (GENERIC_DRINK_ROWS.has(normalized)) return this.softDrinks;
    const own = normalized.split(' ').filter(Boolean);
    if (own.length === 0) return false;
    return this.products.some((product) => {
      const menuWords = normalizeTr(product.name).split(' ');
      return own.every((word) => menuWords.includes(word));
    });
  }

  /** The menu product sharing the most ingredient/form words with a candidate; same type breaks ties. */
  private closest(own: readonly string[], type: string): { name: string; shared: number } | null {
    let best: { name: string; shared: number; same: boolean } | null = null;
    for (const product of this.products) {
      const shared = own.filter((word) => product.words.has(word)).length;
      const same = product.type === type;
      if (!best || shared > best.shared || (shared === best.shared && same && !best.same)) best = { name: product.name, shared, same };
    }
    return best;
  }

  /**
   * The brief for the model: what the kitchen makes (by type, with examples), and the specialities it does NOT
   * show — the products it must not be offered.
   */
  describe(): { makes: string; avoid: string } {
    const makes = [...this.types]
      .map((key) => `${this.productTypes.get(key)?.label ?? key}: ${(this.examples.get(key) ?? []).join(', ')}`)
      .join('\n');
    const absent = [...new Set([...SPECIALTIES].filter(([word]) => !this.specialties.has(word)).map(([, label]) => label))];
    return { makes: makes || '-', avoid: absent.join(', ') || '-' };
  }
}
