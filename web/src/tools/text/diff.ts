import { fold, trLower } from './turkish';

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

/**
 * Why a line changed (D-220), in the words the team uses: the tool teaches the rules instead of only applying them.
 * Re-casing is left out — every word starting with a capital is the one rule everyone knows.
 */
export type ChangeReason = 'letters' | 'spelling' | 'split' | 'joined' | 'quantity' | 'punctuation';

export const REASON_LABEL: Record<ChangeReason, string> = {
  letters: 'Türkçe karakter',
  spelling: 'Yazım hatası',
  split: 'Ayrı yazım',
  joined: 'Birleşik yazım',
  quantity: 'Sayı ve birim',
  punctuation: 'Noktalama ve boşluk',
};

export interface Change {
  from: string;
  to: string;
  reason: ChangeReason;
}

const letters = (words: readonly string[]): string => trLower(words.join(' ')).replace(/[^\p{L}\p{N}]/gu, '');
const shown = (words: readonly string[]): string => words.join(' ').replace(/^[\s,;:.]+|[\s,;:.]+$/gu, '');
const QUANTITY = /\(\s*\d|\d\s*(?:gr|kg|ml|cl|lt)(?![\p{L}])|\d'/iu;

function reasonOf(from: readonly string[], to: readonly string[]): ChangeReason {
  const a = letters(from);
  const b = letters(to);
  const written = to.join(' ');
  if (/\d/u.test(a) && QUANTITY.test(written)) return 'quantity';
  if (a === b) {
    // A symbol given its spaces ("1/2" → "1 / 2", "-urfa" → "- Urfa") or a mark moved off a word ("elma,armut").
    if (to.some((word) => !/[\p{L}\p{N}]/u.test(word)) || /[\p{L}\p{N}][,.;:!?/+&][\p{L}\p{N}]/u.test(from.join(' '))) return 'punctuation';
    if (to.length > from.length) return 'split';
    if (to.length < from.length) return 'joined';
    return 'punctuation';
  }
  return fold(a) === fold(b) ? 'letters' : 'spelling';
}

export function explainChanges(before: string, after: string): Change[] {
  const a = before.split(/\s+/u).filter(Boolean);
  const b = after.split(/\s+/u).filter(Boolean);
  const ka = a.map(bare);
  const kb = b.map(bare);
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] = ka[i] === kb[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const changes: Change[] = [];
  let gone: string[] = [];
  let added: string[] = [];
  const flush = () => {
    // Only a word that turned into another is explained; a word that only moved ("1 kg baklava") or a lone mark that
    // went away is not a change of spelling.
    // The typed and the fixed words are cut into pieces that spell the same letters (Turkish letters folded), so
    // "coca cola 330ML" → "Coca-Cola (330 ml)" is two changes, not three mismatched pairs. A misspelling ends a piece.
    const from = gone.filter((word) => bare(word) !== '');
    let f = 0;
    let t = 0;
    while (f < from.length && t < added.length) {
      const typed = [from[f++]!];
      const fixed = [added[t++]!];
      for (;;) {
        const left = fold(letters(typed));
        const right = fold(letters(fixed));
        if (left === right) break;
        if (left.length < right.length && right.startsWith(left) && f < from.length) typed.push(from[f++]!);
        else if (right.length < left.length && left.startsWith(right) && t < added.length) fixed.push(added[t++]!);
        else break;
      }
      changes.push({ from: shown(typed), to: shown(fixed), reason: reasonOf(typed, fixed) });
    }
    gone = [];
    added = [];
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && ka[i] === kb[j]) {
      flush();
      i += 1;
      j += 1;
    } else if (j >= b.length || (i < a.length && table[i + 1]![j]! >= table[i]![j + 1]!)) {
      gone.push(a[i]!);
      i += 1;
    } else {
      added.push(b[j]!);
      j += 1;
    }
  }
  flush();
  return changes.filter((change) => change.from !== change.to);
}
