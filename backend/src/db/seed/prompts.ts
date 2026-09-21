/**
 * Initial (v1) prompt templates. Runtime code reads prompts from the `prompt_templates` table, so a new
 * version can be inserted and activated without a redeploy. Seeding only inserts missing (key, version)
 * pairs and activates a key that has no active version — it never overrides an activated newer version.
 * Placeholders use {{name}} syntax.
 */

export interface SeedPrompt {
  key: string;
  version: number;
  content: string;
}

import { AGENT_PROMPTS, AGENT_PROMPT_KEYS } from '../../agents/prompts/index.js';

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

export const SEED_PROMPTS: readonly SeedPrompt[] = PROMPT_KEYS.map((key) => ({ key, version: 1, content: v1[key] }));
