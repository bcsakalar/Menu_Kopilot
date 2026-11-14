/** Turkish letters, casing and number suffixes for the writing rules (D-218). */

const FOLD: Readonly<Record<string, string>> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

export const trLower = (text: string): string => text.toLocaleLowerCase('tr-TR');
export const trUpper = (text: string): string => text.toLocaleUpperCase('tr-TR');

/** The ASCII skeleton of a word: what a keyboard without Turkish letters would have typed. */
export function fold(word: string): string {
  let out = '';
  for (const ch of trLower(word)) out += FOLD[ch] ?? ch;
  return out;
}

/** Letters a Turkish word can only have when it was typed with Turkish letters. */
export const hasTurkishLetters = (word: string): boolean => /[çğıöşüÇĞİÖŞÜâîûÂÎÛ]/u.test(word);

export const isAscii = (word: string): boolean => /^[\x00-\x7f]*$/u.test(word);

/** First letter capital the Turkish way (i → İ, ı → I), the rest as given. */
export function trCapitalize(word: string): string {
  const [first = '', ...rest] = [...word];
  return trUpper(first) + rest.join('');
}

/** First letter capital the plain way (i → I): a foreign word ("Iced", "Italiano"). */
export function plainCapitalize(word: string): string {
  const [first = '', ...rest] = [...word];
  return first.toUpperCase() + rest.join('');
}

/** How each part of a number is read, for vowel harmony: the last word spoken decides the suffix. */
const UNITS = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];

function lastSpokenWord(digits: string): string {
  const n = Number(digits.replace(/\D/gu, ''));
  if (!Number.isFinite(n) || n === 0) return 'sıfır';
  if (n % 10 !== 0) return UNITS[n % 10]!;
  if (n % 100 !== 0) return TENS[(n % 100) / 10]!;
  if (n % 1000 !== 0) return 'yüz';
  if (n % 1_000_000 !== 0) return 'bin';
  if (n % 1_000_000_000 !== 0) return 'milyon';
  return 'milyar';
}

const FRONT = new Set(['e', 'i', 'ö', 'ü']);
const ROUNDED = new Set(['o', 'u', 'ö', 'ü']);
const VOWELS = new Set(['a', 'e', 'ı', 'i', 'o', 'ö', 'u', 'ü']);

/**
 * The suffix a number takes, in harmony with how it is read: 6'lı (altı), 3'lü (üç), 10'lu (on); 2'şer (iki), 3'er (üç),
 * 6'şar (altı), 10'ar (on). `kind` is the suffix family: "li" (with), "lik" (worth), "er" (each).
 */
export function numberSuffix(digits: string, kind: 'li' | 'lik' | 'er'): string {
  const spoken = lastSpokenWord(digits);
  const vowels = [...spoken].filter((ch) => VOWELS.has(ch));
  const last = vowels.at(-1) ?? 'i';
  const front = FRONT.has(last);
  if (kind === 'er') return `${VOWELS.has(spoken.at(-1) ?? '') ? 'ş' : ''}${front ? 'er' : 'ar'}`;
  const vowel = ROUNDED.has(last) ? (front ? 'ü' : 'u') : front ? 'i' : 'ı';
  return kind === 'li' ? `l${vowel}` : `l${vowel}k`;
}

/** Which suffix family a typed suffix belongs to ("LU" → li, "şer" → er), or undefined. */
export function suffixKind(typed: string): 'li' | 'lik' | 'er' | undefined {
  const f = fold(typed);
  if (/^l[iu]$/u.test(f)) return 'li';
  if (/^l[iu]k$/u.test(f)) return 'lik';
  if (/^s?[ea]r$/u.test(f)) return 'er';
  return undefined;
}
