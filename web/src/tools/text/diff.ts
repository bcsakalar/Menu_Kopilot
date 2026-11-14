import { trLower } from './turkish';

/**
 * The words of a fixed line, each with what happened to it (D-218):
 *   - "none": as typed;
 *   - "case": the same word, only re-cased or put in brackets ("TAVUK" → "Tavuk", "porsiyon" → "(Porsiyon)");
 *   - "fix": letters, spelling or a unit changed ("cig" → "Çiğ", "330ML" → "(330 ml)").
 * The tool highlights only the fixes: a column re-cased word by word would otherwise be all highlight.
 */
export type WordChange = 'none' | 'case' | 'fix';

const bare = (word: string): string => trLower(word).replace(/^[([{"']+|[)\]}"'.,;:!?]+$/gu, '');

export function wordDiff(before: string, after: string): { text: string; change: WordChange }[] {
  const a = before.split(/\s+/u).filter(Boolean);
  const b = after.split(/\s+/u).filter(Boolean);
  // Longest common subsequence of whole words.
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const typed = new Set(a.map(bare));
  const out: { text: string; change: WordChange }[] = [];
  let i = 0;
  let j = 0;
  while (j < b.length) {
    if (i < a.length && a[i] === b[j]) {
      out.push({ text: b[j]!, change: 'none' });
      i += 1;
      j += 1;
    } else if (i < a.length && table[i + 1]![j]! >= table[i]![j + 1]!) {
      i += 1;
    } else {
      out.push({ text: b[j]!, change: typed.has(bare(b[j]!)) ? 'case' : 'fix' });
      j += 1;
    }
  }
  return out;
}
