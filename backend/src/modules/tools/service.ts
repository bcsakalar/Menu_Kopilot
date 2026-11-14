import { and, eq, ne } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { ingredients, itemAliases, menuItems, optionGroups, options } from '../../db/schema/index.js';
import { cleanItemName } from '../../lib/clean-name.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import { trigrams } from '../../lib/trigram.js';

/**
 * The text tool's dictionary (D-218): every word of the approved pool — product names, descriptions, option and group
 * names, ingredients — in lowercase Turkish, with how often it appears. The browser restores Turkish letters and fixes
 * misspellings from it, so the tool speaks the menu's own vocabulary without a model. Drafts and the archive stay out.
 */

/** How long one list serves before the pool is read again; an approval shows in the tool within this time. */
export const LEXICON_TTL_MS = 10 * 60_000;
/** More than any pool has distinct words; a ceiling, not a target. */
const MAX_WORDS = 30_000;
/**
 * The weakest name likeness still worth showing as a description idea (D-220). Lower than retrieval's hit threshold on
 * purpose: the rep reads every idea before using it; the score goes with it so a bulk fill can ask for more.
 */
export const DESCRIBE_FLOOR = 0.5;
const DESCRIBE_MATCHES = 3;

export interface DescriptionIdea {
  /** The approved template's name. */
  name: string;
  description: string;
  /** 1 for the same name or a known alias, otherwise the trigram likeness of the two names. */
  score: number;
}

interface PoolEntry {
  name: string;
  description: string;
  importance: number;
  keys: { key: string; grams: Set<string> }[];
}

function likeness(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export class ToolsService {
  private cache: { at: number; words: Promise<[string, number][]> } | undefined;
  private pool: { at: number; entries: Promise<PoolEntry[]> } | undefined;

  constructor(
    private readonly db: Database,
    private readonly now: () => number = () => Date.now(),
  ) {}

  lexicon(): Promise<[string, number][]> {
    const now = this.now();
    if (!this.cache || now - this.cache.at >= LEXICON_TTL_MS) {
      const words = this.build();
      this.cache = { at: now, words };
      words.catch(() => {
        if (this.cache?.words === words) this.cache = undefined;
      });
    }
    return this.cache.words;
  }

  /** Read the pool again on the next request. */
  forget(): void {
    this.cache = undefined;
    this.pool = undefined;
  }

  /**
   * Description ideas for product names from the approved pool (D-220), matched the way the analysis matches a menu —
   * the same normalized name, a known alias, then trigram likeness — without a model. Up to three per name, best first.
   */
  async describe(names: readonly string[]): Promise<DescriptionIdea[][]> {
    const entries = await this.poolEntries();
    return names.map((name) => {
      const key = normalizeTr(cleanItemName(name));
      if (key === '') return [];
      const grams = trigrams(key);
      const scored: { entry: PoolEntry; score: number }[] = [];
      for (const entry of entries) {
        let score = 0;
        for (const candidate of entry.keys) {
          score = Math.max(score, candidate.key === key ? 1 : likeness(grams, candidate.grams));
          if (score === 1) break;
        }
        if (score >= DESCRIBE_FLOOR) scored.push({ entry, score });
      }
      scored.sort((a, b) => b.score - a.score || b.entry.importance - a.entry.importance);
      const seen = new Set<string>();
      const ideas: DescriptionIdea[] = [];
      for (const { entry, score } of scored) {
        // Two templates with the same text are one idea.
        if (seen.has(entry.description)) continue;
        seen.add(entry.description);
        ideas.push({ name: entry.name, description: entry.description, score: Math.round(score * 1000) / 1000 });
        if (ideas.length === DESCRIBE_MATCHES) break;
      }
      return ideas;
    });
  }

  private poolEntries(): Promise<PoolEntry[]> {
    const now = this.now();
    if (!this.pool || now - this.pool.at >= LEXICON_TTL_MS) {
      const entries = this.readPool();
      this.pool = { at: now, entries };
      entries.catch(() => {
        if (this.pool?.entries === entries) this.pool = undefined;
      });
    }
    return this.pool.entries;
  }

  private async readPool(): Promise<PoolEntry[]> {
    const usable = and(eq(menuItems.approved, true), ne(menuItems.description, ''));
    const items = await this.db
      .select({ id: menuItems.id, name: menuItems.canonicalName, key: menuItems.normalizedName, description: menuItems.description, importance: menuItems.importance })
      .from(menuItems)
      .where(usable);
    const aliases = await this.db
      .select({ id: itemAliases.menuItemId, key: itemAliases.normalizedAlias })
      .from(itemAliases)
      .innerJoin(menuItems, eq(menuItems.id, itemAliases.menuItemId))
      .where(usable);
    const byItem = new Map<string, string[]>();
    for (const alias of aliases) byItem.set(alias.id, [...(byItem.get(alias.id) ?? []), alias.key]);
    return items.map((item) => ({
      name: item.name,
      description: item.description,
      importance: item.importance,
      keys: [item.key, ...(byItem.get(item.id) ?? [])].map((key) => ({ key, grams: trigrams(key) })),
    }));
  }

  private async build(): Promise<[string, number][]> {
    const approved = eq(menuItems.approved, true);
    const texts: string[] = [];
    const items = await this.db.select({ name: menuItems.canonicalName, description: menuItems.description }).from(menuItems).where(approved);
    for (const item of items) texts.push(item.name, item.description);
    const groups = await this.db.select({ name: optionGroups.name }).from(optionGroups).innerJoin(menuItems, eq(menuItems.id, optionGroups.menuItemId)).where(approved);
    const choices = await this.db
      .select({ name: options.name })
      .from(options)
      .innerJoin(optionGroups, eq(optionGroups.id, options.optionGroupId))
      .innerJoin(menuItems, eq(menuItems.id, optionGroups.menuItemId))
      .where(approved);
    const parts = await this.db.select({ name: ingredients.name }).from(ingredients).innerJoin(menuItems, eq(menuItems.id, ingredients.menuItemId)).where(approved);
    for (const row of [...groups, ...choices, ...parts]) texts.push(row.name);

    const counts = new Map<string, number>();
    for (const text of texts) {
      // Lowercased the Turkish way from the pool's own capitals: "İskender" → "iskender", "Iced" → "ıced" — the browser
      // tells a capitalised foreign word from a Turkish ı by it.
      for (const word of text.toLocaleLowerCase('tr-TR').match(/\p{L}{2,}/gu) ?? []) counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr')).slice(0, MAX_WORDS);
  }
}
