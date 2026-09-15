/**
 * In-memory trigram similarity mirroring pg_trgm's `similarity()` (words padded with two leading spaces and one
 * trailing space; similarity = |A ∩ B| / |A ∪ B|). Used where SQL is not involved (Mod 2 dedupe, few-shot picks).
 */

export function trigrams(value: string): Set<string> {
  const set = new Set<string>();
  const words = value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0);
  for (const word of words) {
    const padded = `  ${word} `;
    for (let i = 0; i < padded.length - 2; i += 1) {
      set.add(padded.slice(i, i + 3));
    }
  }
  return set;
}

/** Index of the candidate most similar to `value` (first one on ties); -1 for an empty list. */
export function mostSimilarIndex(value: string, candidates: readonly string[]): number {
  let best = -1;
  let bestScore = -1;
  candidates.forEach((candidate, index) => {
    const score = trigramSimilarity(candidate, value);
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / (ta.size + tb.size - shared);
}
