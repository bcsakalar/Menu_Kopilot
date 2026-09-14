/**
 * Canonical matching key for Turkish menu item names.
 *
 * Steps: NFKC → tr-TR lowercase → Turkish/diacritic folding → punctuation to spaces → multi-word variants
 * → per-token variants and suffix simplification (plural, possessive). The result is idempotent:
 * normalizeTr(normalizeTr(x)) === normalizeTr(x).
 */

const CHAR_FOLD: Readonly<Record<string, string>> = {
  ı: 'i',
  ş: 's',
  ğ: 'g',
  ü: 'u',
  ö: 'o',
  ç: 'c',
  â: 'a',
  î: 'i',
  û: 'u',
};

/** Multi-word spellings collapsed to one token (applied on the folded string). */
const PHRASE_VARIANTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bcig kofte\b/g, 'cigkofte'],
  [/\bcigkofteler\b/g, 'cigkofte'],
  [/\bpatates kizartmasi\b/g, 'patates kizartma'],
];

/** Whole-token spelling variants (folded form → canonical folded form). */
const TOKEN_VARIANTS: Readonly<Record<string, string>> = {
  kebab: 'kebap',
  kebabi: 'kebap',
  kebaplar: 'kebap',
  kebaplari: 'kebap',
  kebabs: 'kebap',
  shish: 'sis',
  shis: 'sis',
  lahmajun: 'lahmacun',
  lahmacunlar: 'lahmacun',
  boregi: 'borek',
  borekler: 'borek',
  ekmegi: 'ekmek',
  tavugu: 'tavuk',
  sutlaci: 'sutlac',
  kaymagi: 'kaymak',
  pilavi: 'pilav',
  baligi: 'balik',
  cayi: 'cay',
  sosu: 'sos',
  peyniri: 'peynir',
  sucugu: 'sucuk',
  kasari: 'kasar',
  ayrani: 'ayran',
  salgami: 'salgam',
  doneri: 'doner',
  cigkofteci: 'cigkofte',
  hamburgerler: 'hamburger',
  pizzza: 'pizza',
  piza: 'pizza',
  // Protected words that merely look like a possessive suffix.
  tiramisu: 'tiramisu',
};

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

function foldChars(input: string): string {
  let out = '';
  for (const ch of input) {
    out += CHAR_FOLD[ch] ?? ch;
  }
  // Strip remaining combining marks (e.g. "i̇" produced by non-Turkish lowercasing, é → e).
  return out.normalize('NFD').replace(/\p{M}+/gu, '');
}

function simplifyToken(token: string): string {
  const variant = TOKEN_VARIANTS[token];
  if (variant !== undefined) return variant;

  // Plural + possessive: pideleri → pide, kebaplari handled above.
  if (token.length >= 7 && (token.endsWith('lari') || token.endsWith('leri'))) {
    return token.slice(0, -4);
  }
  // Plural: lahmacunlar → lahmacun, pideler → pide (keep at least 3 letters).
  if (token.length >= 6 && (token.endsWith('lar') || token.endsWith('ler'))) {
    return token.slice(0, -3);
  }
  // Compound possessive after a vowel: corbasi → corba, kahvesi → kahve, mantisi → manti.
  if (token.length >= 6 && (token.endsWith('si') || token.endsWith('su'))) {
    const before = token.at(-3);
    if (before !== undefined && VOWELS.has(before)) {
      return token.slice(0, -2);
    }
  }
  return token;
}

function normalizeOnce(input: string): string {
  let s = input.normalize('NFKC').toLocaleLowerCase('tr-TR');
  s = foldChars(s);
  s = s.replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (s === '') return '';
  for (const [pattern, replacement] of PHRASE_VARIANTS) {
    s = s.replace(pattern, replacement);
  }
  return s
    .split(' ')
    .map(simplifyToken)
    .filter((t) => t.length > 0)
    .join(' ');
}

export function normalizeTr(input: string): string {
  // A second pass makes chained simplifications (e.g. "cig kofteler" → "cig kofte" → "cigkofte") stable.
  const first = normalizeOnce(input);
  const second = normalizeOnce(first);
  return second;
}

/** Slug for URLs / cuisine keys: folded + lowercased, no suffix simplification, spaces → dashes. */
export function slugifyTr(input: string): string {
  const folded = foldChars(input.normalize('NFKC').toLocaleLowerCase('tr-TR'));
  return folded
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}
