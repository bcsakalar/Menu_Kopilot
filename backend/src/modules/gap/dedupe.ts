import { cleanItemName } from '../../lib/clean-name.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import { trigramSimilarity } from '../../lib/trigram.js';
import type { Flags, PanelItem, TriState } from './schemas.js';

/**
 * Panel screenshots overlap (scrolling repeats rows) and clip names at the edges ("Karışık Pi…"). Items from all
 * screenshots are merged so every product is counted once:
 *  1. same normalized name,
 *  2. a clipped name that is a prefix of a full one (marked with "…"/"..", or at most 3 characters shorter),
 *  3. near-identical names (trigram ≥ 0.9).
 * Field flags are merged by information: present > absent > unknown.
 */

export interface MenuEntry {
  name: string;
  normalized: string;
  flags: Flags;
  sectionText: string | null;
  /** Number of screenshots the item appeared in. */
  seenIn: number;
  confidence: number;
  truncated: boolean;
}

const RANK: Readonly<Record<TriState, number>> = { present: 2, absent: 1, unknown: 0 };
const TRUNCATION = /(?:\.{2,}|…)\s*$/u;
export const MIN_PANEL_CONFIDENCE = 0.3;
const SIMILAR = 0.9;
const MIN_PREFIX = 5;
const UNMARKED_CLIP = 3;

export function mergeFlag(a: TriState, b: TriState): TriState {
  return RANK[a] >= RANK[b] ? a : b;
}

function isClipOf(short: string, long: string, shortIsMarked: boolean): boolean {
  if (short.length < MIN_PREFIX || short.length >= long.length || !long.startsWith(short)) return false;
  return shortIsMarked || long.length - short.length <= UNMARKED_CLIP;
}

function findMatch(entries: readonly MenuEntry[], normalized: string, truncated: boolean): MenuEntry | undefined {
  return (
    entries.find((e) => e.normalized === normalized) ??
    entries.find((e) => isClipOf(normalized, e.normalized, truncated) || isClipOf(e.normalized, normalized, e.truncated)) ??
    entries.find((e) => trigramSimilarity(e.normalized, normalized) >= SIMILAR)
  );
}

/** `screenshots[i]` = items read from the i-th screenshot, in screen order. */
export function dedupePanelItems(screenshots: readonly (readonly PanelItem[])[]): MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const items of screenshots) {
    const seenHere = new Set<MenuEntry>();
    for (const item of items) {
      if (item.confidence < MIN_PANEL_CONFIDENCE) continue;
      const truncated = TRUNCATION.test(item.rawName);
      const name = cleanItemName(item.rawName.replace(TRUNCATION, ''));
      const normalized = normalizeTr(name);
      if (name.length < 2 || normalized === '') continue;

      const match = findMatch(entries, normalized, truncated);
      if (!match) {
        const entry: MenuEntry = {
          name,
          normalized,
          flags: { description: item.description, options: item.options, removables: item.removables },
          sectionText: item.sectionText,
          seenIn: 1,
          confidence: item.confidence,
          truncated,
        };
        entries.push(entry);
        seenHere.add(entry);
        continue;
      }

      match.flags = {
        description: mergeFlag(match.flags.description, item.description),
        options: mergeFlag(match.flags.options, item.options),
        removables: mergeFlag(match.flags.removables, item.removables),
      };
      match.confidence = Math.max(match.confidence, item.confidence);
      match.sectionText ??= item.sectionText;
      if (!seenHere.has(match)) {
        match.seenIn += 1;
        seenHere.add(match);
      }
      // Keep the complete spelling rather than a clipped one.
      if (!truncated && (match.truncated || normalized.length > match.normalized.length)) {
        match.name = name;
        match.normalized = normalized;
        match.truncated = false;
      }
    }
  }
  return entries;
}
