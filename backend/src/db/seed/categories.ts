import type { CuisineSlug } from './cuisines.js';

/**
 * Menu category taxonomy and the per-cuisine expectations behind the Gap Analyst.
 *
 * These are SEED values, not rules: they land in `menu_categories` / `cuisine_categories` and are edited from
 * Ayarlar > Mutfak Türleri afterwards. Re-seeding never overwrites a row the user changed (see `seedCategories`).
 * Nothing in the pipeline hard-codes a category or a minimum — every number below is read back from Postgres.
 */

export const CATEGORY_KEYS = [
  'ana-yemek',
  'corba',
  'ara-sicak',
  'salata-meze',
  'yan-urun',
  'tatli',
  'icecek',
  'atistirmalik',
  'menu-kampanya',
] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export interface SeedCategory {
  key: CategoryKey;
  label: string;
  sortOrder: number;
  /** normalizeTr'lenmiş TEK token'lar. Ürün adının token'larından biri buradaysa ürün bu kategoriye girer. */
  keywords: readonly string[];
}

export const SEED_CATEGORIES: readonly SeedCategory[] = [
  {
    key: 'corba',
    label: 'Çorba',
    sortOrder: 10,
    keywords: ['corba', 'mercimek', 'ezogelin', 'yayla', 'iskembe', 'paca', 'tarhana', 'dugun', 'tavuksuyu'],
  },
  {
    key: 'ana-yemek',
    label: 'Ana Yemek',
    sortOrder: 20,
    // Deliberately empty: "ana yemek" is the fallback when nothing else matches, so it needs no keywords.
    keywords: [],
  },
  {
    key: 'ara-sicak',
    label: 'Ara Sıcak',
    sortOrder: 30,
    keywords: [
      'icli', 'sigara', 'patates', 'halka', 'kanat', 'citir', 'nugget', 'kizartma', 'borek', 'gozleme',
      'kalamar', 'midye', 'falafel', 'nachos', 'sogan', 'mucver', 'pacanga',
    ],
  },
  {
    key: 'salata-meze',
    label: 'Salata & Meze',
    sortOrder: 40,
    keywords: [
      'salata', 'ezme', 'cacik', 'haydari', 'humus', 'piyaz', 'turs', 'meze', 'coban', 'sezar', 'roka',
      'mevsim', 'sarma', 'gavurdagi', 'sarimsakli', 'atom', 'muhammara', 'babagannus',
    ],
  },
  {
    key: 'yan-urun',
    label: 'Yan Ürün',
    sortOrder: 50,
    keywords: ['pilav', 'bulgur', 'garnitur', 'ekmek', 'lavas', 'sos', 'ketcap', 'mayonez', 'tereyagi'],
  },
  {
    key: 'tatli',
    label: 'Tatlı',
    sortOrder: 60,
    keywords: [
      'kunefe', 'baklava', 'sutlac', 'kazandibi', 'trilece', 'profiterol', 'sufle', 'katmer', 'kadayif',
      'sobiyet', 'magnolia', 'cheesecake', 'brownie', 'tiramisu', 'supangle', 'tavukgogsu', 'dondurma',
      'helva', 'revani', 'asure', 'kemalpasa', 'tatli', 'pasta', 'kurabiye', 'muffin', 'cookie', 'waffle',
      'sekerpare', 'lokma', 'sarma', 'magnolya', 'donut', 'kaymak', 'kek', 'tart', 'turta', 'ekler', 'cupcake',
      'makaron',
    ],
  },
  {
    key: 'icecek',
    label: 'İçecek',
    sortOrder: 70,
    keywords: [
      'ayran', 'salgam', 'kola', 'gazoz', 'soda', 'maden', 'limonata', 'suyu', 'sahlep', 'cay', 'kahve',
      'latte', 'americano', 'espresso', 'cappuccino', 'mocha', 'frappe', 'milkshake', 'smoothie', 'brew',
      'filtre', 'icecek', 'macchiato', 'menengic', 'fanta', 'sprite', 'su', 'sut', 'boza', 'cikolata',
      // A drink that lands in another category would be offered a description and options it never gets on the
      // panel (D-175), so the spellings the model actually writes matter: "Salep" without the h, şerbetler,
      // nektarlar, kefir.
      'salep', 'oralet', 'serbet', 'nektar', 'kefir', 'shake', 'kombucha', 'nane-limon', 'ihlamur',
    ],
  },
  {
    key: 'atistirmalik',
    label: 'Atıştırmalık',
    sortOrder: 80,
    keywords: ['tost', 'sandvic', 'kruvasan', 'pogaca', 'simit', 'acma', 'bagel', 'wrap', 'kumru', 'bazlama'],
  },
  {
    key: 'menu-kampanya',
    label: 'Menü & Kampanya',
    sortOrder: 90,
    keywords: ['menu', 'kampanya', 'kombo', 'set', 'paket', 'ikili', 'aile'],
  },
];

export interface SeedCuisineCategory {
  cuisine: CuisineSlug;
  category: CategoryKey;
  minItems: number;
}

/**
 * Per-cuisine expectation table. `minItems` is "how many products this cuisine should have in this category
 * for a branch opening". The sum is usually a little above the cuisine's `min_item_count` on purpose: the
 * minimum is a floor, the category table is the shape of a complete menu.
 */
function spread(cuisine: CuisineSlug, entries: readonly (readonly [CategoryKey, number])[]): SeedCuisineCategory[] {
  return entries.map(([category, minItems]) => ({ cuisine, category, minItems }));
}

const FOOD_BASE: readonly (readonly [CategoryKey, number])[] = [
  ['ana-yemek', 5],
  ['icecek', 2],
  ['tatli', 1],
];

export const SEED_CUISINE_CATEGORIES: readonly SeedCuisineCategory[] = [
  ...spread('kebap-izgara', [['ana-yemek', 6], ['corba', 1], ['ara-sicak', 1], ['salata-meze', 2], ['icecek', 2], ['tatli', 1]]),
  ...spread('doner', [['ana-yemek', 6], ['ara-sicak', 1], ['salata-meze', 1], ['yan-urun', 1], ['icecek', 2], ['menu-kampanya', 1]]),
  ...spread('pide-lahmacun', [['ana-yemek', 6], ['corba', 1], ['salata-meze', 1], ['icecek', 2], ['tatli', 1]]),
  ...spread('kofte', [['ana-yemek', 5], ['corba', 1], ['salata-meze', 2], ['yan-urun', 1], ['icecek', 2], ['tatli', 1]]),
  ...spread('cigkofte', [['ana-yemek', 4], ['salata-meze', 1], ['icecek', 2], ['tatli', 1], ['menu-kampanya', 1]]),
  ...spread('ev-yemekleri', [['ana-yemek', 6], ['corba', 2], ['salata-meze', 2], ['yan-urun', 1], ['icecek', 2], ['tatli', 1]]),
  ...spread('corba', [['corba', 6], ['ana-yemek', 2], ['yan-urun', 1], ['icecek', 2]]),
  ...spread('manti-hamur-isleri', [['ana-yemek', 5], ['corba', 1], ['salata-meze', 1], ['icecek', 2], ['tatli', 1]]),
  ...spread('tatli', [['tatli', 7], ['icecek', 3]]),
  ...spread('dondurma', [['tatli', 6], ['icecek', 3]]),
  ...spread('sokak-lezzetleri', [['ana-yemek', 5], ['ara-sicak', 2], ['icecek', 2], ['tatli', 1]]),
  ...spread('tantuni', [['ana-yemek', 4], ['salata-meze', 1], ['icecek', 2], ['tatli', 1], ['menu-kampanya', 1]]),
  ...spread('burger', [['ana-yemek', 5], ['ara-sicak', 2], ['yan-urun', 1], ['icecek', 2], ['menu-kampanya', 1]]),
  ...spread('tavuk', [['ana-yemek', 5], ['ara-sicak', 2], ['yan-urun', 1], ['icecek', 2], ['menu-kampanya', 1]]),
  ...spread('pizza', [['ana-yemek', 6], ['ara-sicak', 1], ['salata-meze', 1], ['icecek', 2], ['tatli', 1]]),
  ...spread('makarna', [['ana-yemek', 6], ['salata-meze', 1], ['icecek', 2], ['tatli', 1]]),
  ...spread('steak', [['ana-yemek', 5], ['ara-sicak', 1], ['salata-meze', 1], ['yan-urun', 2], ['icecek', 2]]),
  ...spread('kahvalti', [['ana-yemek', 5], ['ara-sicak', 2], ['atistirmalik', 2], ['icecek', 3]]),
  ...spread('tost-sandvic', [['atistirmalik', 6], ['ara-sicak', 1], ['icecek', 3]]),
  ...spread('pastane-firin', [['atistirmalik', 5], ['tatli', 4], ['icecek', 2]]),
  ...spread('borek', [['atistirmalik', 5], ['corba', 1], ['tatli', 1], ['icecek', 3]]),
  ...spread('kafe-icecek', [['icecek', 8], ['atistirmalik', 3], ['tatli', 2]]),
  ...spread('balik-deniz', [['ana-yemek', 5], ['corba', 1], ['ara-sicak', 1], ['salata-meze', 3], ['icecek', 2]]),
  ...spread('meze', [['salata-meze', 7], ['ara-sicak', 2], ['icecek', 2]]),
  ...spread('salata-saglikli', [['salata-meze', 6], ['ana-yemek', 2], ['icecek', 2], ['atistirmalik', 1]]),
  ...spread('uzak-dogu', [['ana-yemek', 6], ['ara-sicak', 2], ['salata-meze', 1], ['icecek', 2]]),
  ...spread('dunya-mutfagi', [...FOOD_BASE, ['ara-sicak', 2], ['salata-meze', 1]]),
];
