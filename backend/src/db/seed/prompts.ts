/**
 * Seeded prompt templates. Runtime code reads prompts from the `prompt_templates` table, so a new
 * version can be inserted and activated without a redeploy. Seeding only inserts missing (key, version)
 * pairs and activates a key that has no active version — it never overrides an activated newer version.
 * Placeholders use {{name}} syntax.
 */

export interface SeedPrompt {
  key: string;
  version: number;
  content: string;
}

import { AGENT_PROMPTS, AGENT_PROMPT_KEYS, AGENT_PROMPT_VERSIONS } from '../../agents/prompts/index.js';

export const PROMPT_KEYS = [
  ...AGENT_PROMPT_KEYS,
  'repair.user',
  'json.instructions',
  'embed.query',
  'embed.document',
  'transcribe.vocabulary',
] as const;
export type PromptKey = (typeof PROMPT_KEYS)[number];

const v1: Record<PromptKey, string> = {
  ...AGENT_PROMPTS,
  'repair.user': `Önceki yanıtın beklenen şemaya uymadı. Hatalar:
{{errors}}

Önceki yanıtın:
{{previous}}

Aynı içeriği koruyarak SADECE hataları düzelt ve şemaya uyan geçerli JSON döndür.`,

  'json.instructions': `Yanıtını yalnızca aşağıdaki JSON şemasına uyan TEK bir JSON nesnesi olarak ver. Açıklama, markdown veya kod bloğu ekleme.
JSON şeması:
{{schema}}`,

  'embed.query': `task: search result | query: {{text}}`,

  'embed.document': `title: {{title}} | text: {{text}}`,

  // Whisper "prompt": vocabulary + style hint (≤ 224 tokens). Comma-separated names make the transcript split well.
  'transcribe.vocabulary': `Restoran menüsü ürünleri, virgülle ayrılmış: {{names}}.`,

};

/** Bumped whenever the text of a key changes; everything else stays at the version it was seeded with. */
const VERSIONS: Record<PromptKey, number> = {
  ...AGENT_PROMPT_VERSIONS,
  'repair.user': 1,
  'json.instructions': 1,
  'embed.query': 1,
  'embed.document': 1,
  'transcribe.vocabulary': 1,
};

export const SEED_PROMPTS: readonly SeedPrompt[] = PROMPT_KEYS.map((key) => ({
  key,
  version: VERSIONS[key],
  content: v1[key],
}));
