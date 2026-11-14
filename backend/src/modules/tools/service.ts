import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { ingredients, menuItems, optionGroups, options } from '../../db/schema/index.js';

/**
 * The text tool's dictionary (D-218): every word of the approved pool — product names, descriptions, option and group
 * names, ingredients — in lowercase Turkish, with how often it appears. The browser restores Turkish letters and fixes
 * misspellings from it, so the tool speaks the menu's own vocabulary without a model. Drafts and the archive stay out.
 */

/** How long one list serves before the pool is read again; an approval shows in the tool within this time. */
export const LEXICON_TTL_MS = 10 * 60_000;
/** More than any pool has distinct words; a ceiling, not a target. */
const MAX_WORDS = 30_000;

export class ToolsService {
  private cache: { at: number; words: Promise<[string, number][]> } | undefined;

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
