import { cleanItemName, titleCaseTr } from '../lib/clean-name.js';
import { normalizeTr } from '../lib/normalize-tr.js';
import { trigramSimilarity } from '../lib/trigram.js';
import type { ExtractedItem, TriState } from './schemas/extractor.js';

/**
 * Images overlap (a scrolled panel repeats rows) and clip names at the edges ("Karışık Pi…"). Items from all
 * images are merged so every product is counted once:
 *  1. same normalized name,
 *  2. a clipped name that is a prefix of a full one (marked with "…"/".." or at most 3 characters shorter),
 *  3. near-identical names (trigram ≥ 0.9).
 * Field flags merge by information: present > absent > unknown.
 */

export interface MergedItem {
  name: string;
  normalized: string;
  sectionText: string | null;
  priceText: string | null;
  descriptionText: string | null;
  description: TriState;
  options: TriState;
  removables: TriState;
  optionNames: string[];
  /** How many images showed it. 0 = typed or dictated by the user. */
  seenIn: number;
  confidence: number;
  truncated: boolean;
  typed: boolean;
}

const RANK: Readonly<Record<TriState, number>> = { present: 2, absent: 1, unknown: 0 };
const TRUNCATION = /(?:\.{2,}|…)\s*$/u;
export const MIN_EXTRACT_CONFIDENCE = 0.3;
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

function findMatch(entries: readonly MergedItem[], normalized: string, truncated: boolean): MergedItem | undefined {
  return (
    entries.find((e) => e.normalized === normalized) ??
    entries.find((e) => isClipOf(normalized, e.normalized, truncated) || isClipOf(e.normalized, normalized, e.truncated)) ??
    entries.find((e) => trigramSimilarity(e.normalized, normalized) >= SIMILAR)
  );
}

/** `perImage[i]` = items read from the i-th image, in screen order. */
export function dedupeExtracted(perImage: readonly (readonly ExtractedItem[])[]): MergedItem[] {
  const entries: MergedItem[] = [];
  for (const items of perImage) {
    const seenHere = new Set<MergedItem>();
    for (const item of items) {
      if (item.confidence < MIN_EXTRACT_CONFIDENCE) continue;
      const truncated = TRUNCATION.test(item.rawName);
      const name = cleanItemName(item.rawName.replace(TRUNCATION, ''));
      const normalized = normalizeTr(name);
      if (name.length < 2 || normalized === '') continue;

      const match = findMatch(entries, normalized, truncated);
      if (!match) {
        const entry: MergedItem = {
          name,
          normalized,
          sectionText: item.sectionText,
          priceText: item.priceText,
          descriptionText: item.descriptionText,
          description: item.description,
          options: item.options,
          removables: item.removables,
          optionNames: [...item.optionNames],
          seenIn: 1,
          confidence: item.confidence,
          truncated,
          typed: false,
        };
        entries.push(entry);
        seenHere.add(entry);
        continue;
      }

      match.description = mergeFlag(match.description, item.description);
      match.options = mergeFlag(match.options, item.options);
      match.removables = mergeFlag(match.removables, item.removables);
      match.confidence = Math.max(match.confidence, item.confidence);
      match.sectionText ??= item.sectionText;
      match.priceText ??= item.priceText;
      match.descriptionText ??= item.descriptionText;
      for (const optionName of item.optionNames) {
        if (!match.optionNames.some((existing) => normalizeTr(existing) === normalizeTr(optionName))) {
          match.optionNames.push(optionName);
        }
      }
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

/**
 * Products the user typed or dictated join the extracted entries. A name already read from an image (same
 * matching rules) is not counted twice; a new one enters with unknown fields, because typing a name says
 * nothing about what the panel shows for it.
 */
export function addTypedItems(entries: MergedItem[], typed: readonly string[]): MergedItem[] {
  for (const raw of typed) {
    const name = cleanItemName(raw);
    const normalized = normalizeTr(name);
    if (name.length < 2 || normalized === '') continue;
    if (findMatch(entries, normalized, false)) continue;
    entries.push({
      // "adana kebap" typed in a hurry shows as "Adana Kebap"; a name typed with capitals stays as written.
      name: name === name.toLocaleLowerCase('tr-TR') ? titleCaseTr(name) : name,
      normalized,
      sectionText: null,
      priceText: null,
      descriptionText: null,
      description: 'unknown',
      options: 'unknown',
      removables: 'unknown',
      optionNames: [],
      seenIn: 0,
      confidence: 1,
      truncated: false,
      typed: true,
    });
  }
  return entries;
}
