import { stripPriceAmounts } from './price-guard.js';

/**
 * Cleans a raw menu line into a product name: removes prices, list bullets/numbering and quantity noise
 * ("2 adet", "(1 porsiyon)"). Keeps the original casing for display.
 */
export function cleanItemName(raw: string): string {
  let s = stripPriceAmounts(raw.normalize('NFKC'));
  s = s.replace(/^[\s\-–—•·*#>]+/, ''); // bullets
  s = s.replace(/^\d{1,3}\s*[.)-]\s+/, ''); // "1. ", "2) "
  s = s.replace(/\(\s*\d+(?:[.,]\d+)?\s*(?:adet|porsiyon|kişilik|gr|g|ml)\s*\)/giu, ' ');
  s = s.replace(/^\d+\s*(?:adet|x|×)\s+/iu, '');
  s = s.replace(/\s+[x×]\s*\d+$/iu, '');
  s = s.replace(/\s+\d+(?:[.,]\d+)?\s*(?:adet|porsiyon)$/iu, '');
  s = s.replace(/[\s.,;:!?\-–—]+$/u, '');
  return s.replace(/\s+/g, ' ').trim();
}

/** "adana kebap" → "Adana Kebap" (Turkish-aware), used when the model gives no canonical name. */
export function titleCaseTr(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .split(' ')
    .map((word) => (word.length === 0 ? word : word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1)))
    .join(' ');
}
