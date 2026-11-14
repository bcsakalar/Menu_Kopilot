import { BASE_COUNT, BASE_WORDS } from './base-words';
import { fold, trLower } from './turkish';

/**
 * The words the text tool knows, keyed by their ASCII skeleton (D-218). It answers three questions without a model:
 *   - how a word typed without Turkish letters is spelt ("kofte" → "köfte"), by the spelling seen most;
 *   - which known word a misspelt one meant ("şeklde" → "şekilde"), only when the answer is clear;
 *   - which known words a run-together word is made of ("kaşarlıtost" → "kaşarlı tost").
 */

interface Entry {
  /** The spelling seen most for this skeleton. */
  best: string;
  bestCount: number;
  /** Every spelling's count added up. */
  total: number;
  /** Came from a Title Case foreign word ("Iced" → "ıced"): capitalised with a plain I. */
  foreign: boolean;
}

/** Turkish words that do begin with ı; any other word the pool spells with an initial ı was a capitalised foreign one. */
const TURKISH_DOTLESS = ['ılık', 'ılıman', 'ızgara', 'ıspanak', 'ıhlamur', 'ıslak', 'ısırgan', 'ırmak', 'ışık', 'ısı', 'ıstakoz', 'ıtır'];

/** A correction needs a word seen more than once: a word seen once may itself be the typo. */
const MIN_TRUSTED = 2;
/** Parts a run-together word may be split into, and their shortest length. */
const MAX_PARTS = 3;
const MIN_PART = 3;

export class Lexicon {
  private readonly byLength = new Map<number, string[]>();

  private constructor(private readonly entries: ReadonlyMap<string, Entry>) {
    for (const key of entries.keys()) {
      const list = this.byLength.get(key.length) ?? [];
      list.push(key);
      this.byLength.set(key.length, list);
    }
  }

  /** Words as they are spelt (any case) with how often they were seen. */
  static from(words: Iterable<readonly [string, number]>): Lexicon {
    const spellings = new Map<string, Map<string, { count: number; foreign: boolean }>>();
    for (const [raw, count] of words) {
      let word = trLower(raw.trim());
      if (!/^[\p{L}]{2,}$/u.test(word) || count <= 0) continue;
      let foreign = false;
      if (word.startsWith('ı') && !TURKISH_DOTLESS.some((stem) => word.startsWith(stem))) {
        word = `i${word.slice(1)}`;
        foreign = true;
      }
      const key = fold(word);
      const forms = spellings.get(key) ?? new Map<string, { count: number; foreign: boolean }>();
      const seen = forms.get(word) ?? { count: 0, foreign };
      forms.set(word, { count: seen.count + count, foreign: seen.foreign || foreign });
      spellings.set(key, forms);
    }
    const entries = new Map<string, Entry>();
    for (const [key, forms] of spellings) {
      let best = '';
      let bestCount = 0;
      let total = 0;
      let foreign = false;
      for (const [form, seen] of forms) {
        total += seen.count;
        // The most seen spelling; on a tie the one with Turkish letters, which nobody types by accident.
        if (seen.count > bestCount || (seen.count === bestCount && form !== key && best === key)) {
          best = form;
          bestCount = seen.count;
          foreign = seen.foreign;
        }
      }
      entries.set(key, { best, bestCount, total, foreign });
    }
    return new Lexicon(entries);
  }

  /** This lexicon with another's words added (counts summed). */
  merge(other: Lexicon): Lexicon {
    const words: [string, number][] = [];
    for (const source of [this, other]) for (const entry of source.entries.values()) words.push([entry.foreign ? `ı${entry.best.slice(1)}` : entry.best, entry.total]);
    return Lexicon.from(words);
  }

  get size(): number {
    return this.entries.size;
  }

  knows(key: string): boolean {
    return this.entries.has(key);
  }

  /** The spelling to use for a skeleton, or undefined for a word the lexicon has never seen. */
  spelling(key: string): string | undefined {
    return this.entries.get(key)?.best;
  }

  isForeign(key: string): boolean {
    return this.entries.get(key)?.foreign ?? false;
  }

  /**
   * The known word a misspelt one meant, by its skeleton, or undefined when there is no clear answer. Conservative on
   * purpose: five letters at least (two edits from eight), the same first letter, a word seen more than once, one best
   * candidate — and never a shorter word the typed one merely extends, which is a Turkish suffix, not a typo
   * ("pastanesi" is no misspelt "pastane").
   */
  correction(key: string): string | undefined {
    if (key.length < 5) return undefined;
    const limit = key.length >= 8 ? 2 : 1;
    const found: { key: string; distance: number; count: number }[] = [];
    for (let length = key.length - limit; length <= key.length + limit; length += 1) {
      for (const candidate of this.byLength.get(length) ?? []) {
        if (candidate[0] !== key[0] || key.startsWith(candidate)) continue;
        const count = this.entries.get(candidate)!.total;
        if (count < MIN_TRUSTED) continue;
        const distance = editDistance(key, candidate, limit);
        if (distance <= limit) found.push({ key: candidate, distance, count });
      }
    }
    if (found.length === 0) return undefined;
    const nearest = Math.min(...found.map((f) => f.distance));
    const ranked = found.filter((f) => f.distance === nearest).sort((x, y) => y.count - x.count);
    // Two equally near words: only a clearly commoner one wins.
    if (ranked.length > 1 && ranked[0]!.count < ranked[1]!.count * 3) return undefined;
    return ranked[0]!.key;
  }

  /** The known words a run-together word is made of, as skeletons, or undefined. Fewer parts first, then the commonest. */
  split(key: string): string[] | undefined {
    if (key.length < MIN_PART * 2) return undefined;
    let best: { parts: string[]; score: number } | undefined;
    const walk = (rest: string, parts: string[]): void => {
      if (rest.length === 0) {
        if (parts.length < 2) return;
        const score = Math.min(...parts.map((p) => this.entries.get(p)!.total)) / parts.length ** 2;
        if (!best || score > best.score) best = { parts: [...parts], score };
        return;
      }
      if (parts.length === MAX_PARTS) return;
      for (let end = MIN_PART; end <= rest.length; end += 1) {
        const head = rest.slice(0, end);
        if (this.entries.has(head)) walk(rest.slice(end), [...parts, head]);
      }
    };
    walk(key, []);
    return best?.parts;
  }
}

/** Optimal string alignment distance (a swap of two letters is one edit), stopping early past `limit`. */
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1]![j]! + 1, row[j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2]![j - 2]! + 1);
      row.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return limit + 1;
    rows.push(row);
  }
  return rows[a.length]![b.length]!;
}

export const BASE_LEXICON = Lexicon.from(
  BASE_WORDS.split(/\s+/u)
    .filter(Boolean)
    .map((word) => [word, BASE_COUNT] as const),
);
