import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { promptTemplates } from '../db/schema/index.js';
import type { PromptKey } from '../db/seed/prompts.js';
import { AppError } from '../lib/errors.js';

/** Replaces {{name}} placeholders; unknown placeholders become empty strings. */
export function renderTemplate(template: string, vars: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, name: string) => {
    const value = vars[name];
    return value === undefined ? '' : String(value);
  });
}

export interface ActivePrompt {
  key: string;
  version: number;
  content: string;
}

/**
 * Reads the active version of each prompt from `prompt_templates` (60 s cache) so prompts can be improved
 * without a redeploy. Prompt versions are part of cache keys: a new version naturally invalidates cached output.
 */
export class PromptRepository {
  private cache: { at: number; prompts: Map<string, ActivePrompt> } | undefined;

  constructor(
    private readonly db: Database,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private async load(): Promise<Map<string, ActivePrompt>> {
    if (this.cache && this.now() - this.cache.at < this.ttlMs) return this.cache.prompts;
    const rows = await this.db
      .select({ key: promptTemplates.key, version: promptTemplates.version, content: promptTemplates.content })
      .from(promptTemplates)
      .where(eq(promptTemplates.isActive, true));
    const prompts = new Map(rows.map((r) => [r.key, r]));
    this.cache = { at: this.now(), prompts };
    return prompts;
  }

  invalidate(): void {
    this.cache = undefined;
  }

  async get(key: PromptKey): Promise<ActivePrompt> {
    const prompt = (await this.load()).get(key);
    if (!prompt) throw new AppError('SERVICE_UNAVAILABLE', `Aktif prompt yok: ${key} (seed çalıştırıldı mı?)`);
    return prompt;
  }

  async render(key: PromptKey, vars: Readonly<Record<string, string | number>> = {}): Promise<{ text: string; version: number }> {
    const prompt = await this.get(key);
    return { text: renderTemplate(prompt.content, vars), version: prompt.version };
  }

  /** e.g. "enrich.system@1,enrich.user@2" — used inside cache keys. */
  async versionTag(keys: readonly PromptKey[]): Promise<string> {
    const prompts = await this.load();
    return keys.map((k) => `${k}@${prompts.get(k)?.version ?? 0}`).join(',');
  }
}
