/**
 * The system never produces prices. These helpers detect and remove currency amounts
 * ("50 TL", "₺45,90", "+15 TL", "(+10)") from generated text. Quantities such as
 * "2 adet", "1,5 porsiyon" or "250 ml" are not prices and are left alone.
 */

// Unicode-aware word boundaries (\b only understands ASCII, Turkish letters break it).
const END = String.raw`(?![\p{L}\p{N}])`;
const START = String.raw`(?<![\p{L}\p{N}])`;

const AMOUNT = String.raw`\d+(?:[.,]\d+)*`;
const CURRENCY = String.raw`(?:₺|(?:tl|try|lira|liralık|türk lirası)${END})`;
const QUANTITY_UNIT = String.raw`(?:adet|porsiyon|gr|g|ml|cl|lt|kg|cm|kişilik)${END}`;

const PRICE_PATTERNS: readonly RegExp[] = [
  // "50 TL", "45,90₺", "10 liralık", "+15 TL"
  new RegExp(String.raw`\+?\s*${AMOUNT}\s*${CURRENCY}`, 'giu'),
  // "₺50", "TL 50"
  new RegExp(String.raw`(?:₺|${START}(?:tl|try)${END})\s*${AMOUNT}`, 'giu'),
  // "(+15)", "( + 10,5 )" — a signed number in parentheses is a price delta in menus
  new RegExp(String.raw`\(\s*\+\s*${AMOUNT}\s*\)`, 'giu'),
  // "+15" right after a word (e.g. "Büyük +15"), unless it is a quantity ("+2 adet")
  new RegExp(String.raw`(?<=\p{L}\s?)\+\s*${AMOUNT}(?![\d.,])(?!\s*${QUANTITY_UNIT})`, 'giu'),
];

export function containsPriceAmount(value: string): boolean {
  return PRICE_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

export function stripPriceAmounts(value: string): string {
  let out = value;
  for (const pattern of PRICE_PATTERNS) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, ' ');
  }
  return out
    .replace(/\(\s*\)/g, ' ') // empty parentheses left behind
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—,:;]+|[\s\-–—,:;]+$/g, '')
    .trim();
}
