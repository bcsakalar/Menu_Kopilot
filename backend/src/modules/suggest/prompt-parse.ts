import { cleanItemName } from '../../lib/clean-name.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import type { ParsedName } from './schemas.js';

/**
 * Free text → product names without any LLM ("adana kebap, lahmacun, künefe var" → 3 names).
 * Splits on lines, commas, semicolons, slashes, "+" and the conjunctions "ve"/"ile"; strips filler words.
 */

const SPLIT = /\r?\n|[,;/+•·]|\s+ve\s+|\s+ile\s+|\s+&\s+/giu;
const TRAILING_FILLER =
  /\s+(?:da|de)?\s*(?:var(?:dır)?|mevcut|satıyoruz|satılıyor|yapıyoruz|yapılıyor|olacak|lazım|istiyorum|eklenecek)\s*[.!]*$/iu;
const LEADING_FILLER = /^(?:bir de|ayrıca|menüde|menüye|menümüzde|ve|ile|ek olarak|bunlara ek olarak|bir|birde)\s+/iu;

export const MAX_PROMPT_ITEMS = 60;

export function parsePromptItems(text: string | undefined): ParsedName[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: ParsedName[] = [];
  for (const part of text.split(SPLIT)) {
    let s = part.trim();
    for (let i = 0; i < 2; i += 1) {
      s = s.replace(TRAILING_FILLER, '').replace(LEADING_FILLER, '').trim();
    }
    const name = cleanItemName(s);
    if (name.length < 2 || name.length > 60 || !/\p{L}/u.test(name)) continue;
    const normalized = normalizeTr(name);
    if (normalized === '' || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push({ rawName: name, normalized, sectionText: null, priceText: null, source: 'prompt', imageSha: null });
    if (out.length >= MAX_PROMPT_ITEMS) break;
  }
  return out;
}
