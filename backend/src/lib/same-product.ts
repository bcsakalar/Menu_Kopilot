/**
 * Two normalized product names that are the same product written longer or shorter: "mercimek" and "mercimek
 * corba" (Mercimek Çorbası), "portakal su" and "taze sikma portakal su". One name contains the other and the extra
 * words say nothing about WHAT the product is — its category word or a serving qualifier.
 *
 * Deliberately narrow: "latte" / "ice latte", "cheeseburger" / "double cheeseburger" and "tavuklu pizza" /
 * "barbeku tavuklu pizza" stay different products, because the extra word changes what is sold.
 */
const GENERIC_WORDS = new Set([
  'corba',
  'tatli',
  'taze',
  'sikma',
  'ev',
  'yapimi',
  'ozel',
  'klasik',
  'geleneksel',
  'usulu',
  'porsiyon',
  'bardak',
  // water is water, wherever it springs from
  'dogal',
  'kaynak',
  'sise',
  'pet',
]);

/**
 * Word families that tell two products apart even when every other word is shared: "Levrek Buğulama" is not
 * "Levrek Izgara", "Kıymalı Pide" is not "Kaşarlı Pide", "Tavuk Dürüm" is not "Et Dürüm". Base forms of normalized
 * words (see `baseWord`).
 */
const DISTINGUISHING_SLOTS: readonly (readonly string[])[] = [
  // how it is cooked
  ['izgara', 'bugulama', 'tava', 'firin', 'haslama', 'sote', 'guvec'],
  // what it is made of, what it is filled or topped with
  [
    'tavuk', 'et', 'dana', 'kuzu', 'balik', 'somon', 'levrek', 'cipura', 'hamsi', 'karides', 'kalamar', 'ciger', 'sucuk',
    'kofte', 'kiyma', 'kasar', 'kusbasi', 'peynir', 'karisik', 'yumurta', 'pastirma', 'kavurma', 'ispanak', 'patates',
    'mantar', 'fistik', 'ceviz', 'cikolata', 'kaymak', 'sade',
  ],
  // what form it is sold in
  ['durum', 'kase', 'wrap', 'tost', 'sandvic', 'sis', 'ekmek', 'pide', 'lahmacun'],
];
/** Words whose mere presence makes another product: a "Kadayıf Dolması" is not a "Tel Kadayıf". */
const PRESENCE_WORDS = ['dolma'];
/** Two spellings of one thing. */
const SYNONYMS: Readonly<Record<string, string>> = {
  firinda: 'firin',
  kizartma: 'tava',
  kizarmis: 'tava',
  durumu: 'durum',
  wrap: 'durum',
  suyu: 'su',
};

/** "sucuklu" → "sucuk", "kasarli" → "kasar", "firinda" → "firin": the word the family lists. */
export function baseWord(word: string): string {
  const synonym = SYNONYMS[word];
  if (synonym) return synonym;
  return word.length > 4 && /(li|lu)$/u.test(word) ? word.slice(0, -2) : word === 'etli' ? 'et' : word;
}

/**
 * Two names that share most of their letters but name different products (D-182) — the guard a fuzzy match must
 * pass. True when, within one word family above, EACH name carries a word the other does not ("Levrek Buğulama" /
 * "Levrek Izgara", "Kıymalı Pide" / "Kaşarlı Pide"), or only one of them is a "dolma". A name that only adds a word
 * ("Tavuk Şiş" / "Tavuk Şiş Porsiyon", "Adana" / "Adana Kebap") passes.
 */
export function variantConflict(a: string, b: string): boolean {
  const wordsA = new Set(a.split(' ').filter(Boolean).map(baseWord));
  const wordsB = new Set(b.split(' ').filter(Boolean).map(baseWord));
  for (const slot of DISTINGUISHING_SLOTS) {
    const onlyA = slot.some((word) => wordsA.has(word) && !wordsB.has(word));
    const onlyB = slot.some((word) => wordsB.has(word) && !wordsA.has(word));
    if (onlyA && onlyB) return true;
  }
  // A bare head noun ("Midye", "Dolma") is the everyday short name of the dolma, not another product.
  if (wordsA.size < 2 || wordsB.size < 2) return false;
  return PRESENCE_WORDS.some((word) => wordsA.has(word) !== wordsB.has(word));
}

export function sameProductName(a: string, b: string): boolean {
  if (a === b) return true;
  const wordsA = a.split(' ').filter(Boolean).map((word) => SYNONYMS[word] ?? word);
  const wordsB = b.split(' ').filter(Boolean).map((word) => SYNONYMS[word] ?? word);
  const [short, long] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  if (short.length === 0 || short.length === long.length) return false;
  const shortSet = new Set(short);
  if (!short.every((word) => long.includes(word))) return false;
  const extra = long.filter((word) => !shortSet.has(word));
  if (extra.every((word) => GENERIC_WORDS.has(word))) return true;
  // A bare name ("Tantuni", "Poğaça") is the product line of a longer name that only adds its meat, filling, cooking
  // or form ("Et Tantuni Dürüm", "Peynirli Poğaça") — suggesting it next to that is suggesting the same thing.
  return short.length === 1 && (short[0]?.length ?? 0) >= 4 && extra.every((word) => GENERIC_WORDS.has(word) || SLOT_WORDS.has(baseWord(word)));
}

const SLOT_WORDS = new Set(DISTINGUISHING_SLOTS.flat());
