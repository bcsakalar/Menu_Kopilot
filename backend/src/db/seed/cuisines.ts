/**
 * System cuisines. min_item_count starts at 10 for every cuisine on purpose: the real per-cuisine
 * minimums are entered by the user from the settings screen (never hard-coded). Re-seeding never
 * overwrites an existing cuisine row.
 */

export const CUISINE_SLUGS = [
  'kebap-izgara',
  'doner',
  'pide-lahmacun',
  'cigkofte',
  'ev-yemekleri',
  'manti-hamur-isleri',
  'tatli',
  'sokak-lezzetleri',
  'burger',
  'pizza',
  'kahvalti',
  'kafe-icecek',
] as const;
export type CuisineSlug = (typeof CUISINE_SLUGS)[number];

export interface SeedCuisine {
  slug: CuisineSlug;
  name: string;
  parentSlug?: CuisineSlug;
  minItemCount: number;
  notes: string;
}

const DEFAULT_NOTE = 'Varsayılan minimum 10; gerçek sayıyı Ayarlar > Mutfak Türleri ekranından gir.';

export const SEED_CUISINES: readonly SeedCuisine[] = [
  { slug: 'kebap-izgara', name: 'Kebap & Izgara', minItemCount: 10, notes: DEFAULT_NOTE },
  { slug: 'doner', name: 'Döner', parentSlug: 'kebap-izgara', minItemCount: 10, notes: DEFAULT_NOTE },
  { slug: 'pide-lahmacun', name: 'Pide & Lahmacun', parentSlug: 'kebap-izgara', minItemCount: 10, notes: DEFAULT_NOTE },
  { slug: 'cigkofte', name: 'Çiğ Köfte', minItemCount: 10, notes: DEFAULT_NOTE },
  { slug: 'ev-yemekleri', name: 'Ev Yemekleri', minItemCount: 10, notes: DEFAULT_NOTE },
  {
    slug: 'manti-hamur-isleri',
    name: 'Mantı & Hamur İşleri',
    parentSlug: 'ev-yemekleri',
    minItemCount: 10,
    notes: DEFAULT_NOTE,
  },
  { slug: 'tatli', name: 'Tatlı & Künefe', minItemCount: 10, notes: DEFAULT_NOTE },
  { slug: 'sokak-lezzetleri', name: 'Sokak Lezzetleri', minItemCount: 10, notes: DEFAULT_NOTE },
  { slug: 'burger', name: 'Burger', minItemCount: 10, notes: DEFAULT_NOTE },
  { slug: 'pizza', name: 'Pizza', minItemCount: 10, notes: DEFAULT_NOTE },
  { slug: 'kahvalti', name: 'Kahvaltı', minItemCount: 10, notes: DEFAULT_NOTE },
  { slug: 'kafe-icecek', name: 'Kafe & İçecek', minItemCount: 10, notes: DEFAULT_NOTE },
];
