/**
 * Re-records the LLM fixtures against the real providers (needs GEMINI_API_KEY and/or GROQ_API_KEY in ../.env).
 * Writes *.recorded.json next to the hand-authored fixtures so they can be compared before replacing them.
 *
 *   pnpm fixtures:record
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CircuitBreaker } from '../src/ai/circuit-breaker.js';
import { GeminiProvider } from '../src/ai/providers/gemini.provider.js';
import { GroqProvider } from '../src/ai/providers/groq.provider.js';
import { CooldownTracker } from '../src/ai/rate-limit.js';
import { AiRouter } from '../src/ai/router.js';
import { renderTemplate } from '../src/ai/prompt-repository.js';
import { parseEnv } from '../src/config/env.js';
import { DEFAULT_ROUTES, type TaskKey } from '../src/config/models.js';
import { SEED_PROMPTS, type PromptKey } from '../src/db/seed/prompts.js';
import { toImageInput } from '../src/lib/images.js';
import { enrichmentSchema, extractionSchema, itemsEnvelopeSchema } from '../src/modules/suggest/schemas.js';

const config = parseEnv({ ...process.env, DATABASE_URL: process.env['DATABASE_URL'] ?? 'unused' });
if (!config.providers.geminiApiKey && !config.providers.groqApiKey) {
  console.error('No provider keys found (GEMINI_API_KEY / GROQ_API_KEY). Nothing to record.');
  process.exit(1);
}

const prompts = new Map(SEED_PROMPTS.map((p) => [p.key, p.content]));
const render = (key: PromptKey, vars: Record<string, string> = {}) => ({
  text: renderTemplate(prompts.get(key) ?? '', vars),
  version: 1,
});

const router = new AiRouter({
  providers: {
    gemini: new GeminiProvider({ apiKey: config.providers.geminiApiKey }),
    groq: new GroqProvider({ apiKey: config.providers.groqApiKey }),
  },
  routes: {
    chain: (task: TaskKey) =>
      Promise.resolve(DEFAULT_ROUTES[task].map((r, i) => ({ id: undefined, ...r, priority: i, enabled: true }))),
  },
  breaker: new CircuitBreaker(),
  cooldowns: new CooldownTracker(),
  usage: { log: () => Promise.resolve() },
  prompts: { render: (key, vars) => Promise.resolve(render(key, Object.fromEntries(Object.entries(vars ?? {}).map(([k, v]) => [k, String(v)])))) },
  localOnly: false,
});

const fixtures = fileURLToPath(new URL('../test/fixtures/', import.meta.url));
const imageDir = join(fixtures, 'images');

for (const file of readdirSync(imageDir).filter((f) => f.startsWith('menu-') && f.endsWith('.jpg'))) {
  const image = toImageInput(readFileSync(join(imageDir, file)));
  if (!image) continue;
  const started = Date.now();
  const result = await router.generate({
    task: 'vision.menu_extract',
    schema: itemsEnvelopeSchema,
    providerSchema: extractionSchema,
    schemaName: 'menu_extraction',
    system: render('extract.menu.system').text,
    user: render('extract.menu.user', { cuisine: 'Genel' }).text,
    images: [image],
  });
  const out = join(fixtures, 'llm', 'extract', file.replace('.jpg', '.recorded.json'));
  if (result.ok) {
    writeFileSync(out, `${JSON.stringify(result.value, null, 2)}\n`, 'utf8');
    console.log(`${file}: ${result.value.items.length} items via ${result.meta.model} in ${Date.now() - started} ms → ${out}`);
  } else {
    console.error(`${file}: ${result.error.kind} ${result.error.message}`);
  }
}

const unknownNames = ['İçli Köfte', 'Humus', 'Şalgam', 'Kazandibi', 'Trileçe', 'Çoban Salata'];
const started = Date.now();
const enriched = await router.generate({
  task: 'text.item_enrich',
  schema: itemsEnvelopeSchema,
  providerSchema: enrichmentSchema,
  schemaName: 'menu_items',
  system: render('enrich.system').text,
  user: render('enrich.user', {
    cuisine: 'Kebap & Izgara',
    examples: '',
    items: unknownNames.map((n, i) => `${i + 1}. ${n}`).join('\n'),
  }).text,
});
if (enriched.ok) {
  const out = join(fixtures, 'llm', 'enrich-items.recorded.json');
  writeFileSync(out, `${JSON.stringify(enriched.value, null, 2)}\n`, 'utf8');
  console.log(`enrichment: ${unknownNames.length} items via ${enriched.meta.model} in ${Date.now() - started} ms → ${out}`);
} else {
  console.error(`enrichment: ${enriched.error.kind} ${enriched.error.message}`);
}
