/**
 * What the rules cannot fix and the rep should look at (D-220): a price, an emoji, a phone number or a web address in a
 * name or a description, or a word written twice. Flagged, never removed: only the rep knows what was meant.
 */
export type Warning = 'price' | 'emoji' | 'contact' | 'repeat';

export const WARNING_LABEL: Record<Warning, string> = {
  price: 'Fiyat yazılmış; fiyat panelde ayrı girilir',
  emoji: 'Emoji ya da simge var',
  contact: 'Telefon, e-posta, site ya da sosyal medya adresi var',
  repeat: 'Aynı kelime art arda iki kez yazılmış',
};

// Unicode-aware edges: \\b only knows ASCII letters. Quantities ("2 adet", "330 ml") are not prices.
const END = String.raw`(?![\p{L}\p{N}])`;
const START = String.raw`(?<![\p{L}\p{N}])`;
const PRICE = new RegExp(
  String.raw`\d+(?:[.,]\d+)*\s*(?:₺|(?:tl|try|lira|liralık)${END})|(?:₺|${START}tl${END})\s*\d`,
  'iu',
);
const EMOJI = /\p{Extended_Pictographic}/u;
const CONTACT = new RegExp(
  [
    String.raw`(?:https?:\/\/|www\.)\S+`,
    String.raw`\S+@\S+\.\p{L}{2,}`,
    // A Turkish mobile number, spaced or not: 0532 123 45 67, +90 532 1234567, 5321234567.
    String.raw`(?<!\d)(?:\+?90\s?)?0?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)`,
    String.raw`(?:^|\s)@[\p{L}\p{N}_.]{3,}`,
  ].join('|'),
  'iu',
);

export function checkLine(text: string): Warning[] {
  const found: Warning[] = [];
  if (PRICE.test(text)) found.push('price');
  if (EMOJI.test(text)) found.push('emoji');
  if (CONTACT.test(text)) found.push('contact');
  const words = text
    .toLocaleLowerCase('tr-TR')
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length > 1);
  if (words.some((word, index) => index > 0 && word === words[index - 1])) found.push('repeat');
  return found;
}
