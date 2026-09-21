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
import { EXTRACTOR_SCHEMA_NAME, extractorSchema } from '../src/agents/schemas/extractor.js';
import { PRODUCT_RECOMMENDER_SCHEMA_NAME, productRecommenderSchema } from '../src/agents/schemas/product-recommender.js';

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

// Extractor: every menu photo and panel screenshot goes through the same agent now.
for (const file of readdirSync(imageDir).filter((f) => /\.(jpg|png)$/.test(f))) {
  const image = toImageInput(readFileSync(join(imageDir, file)));
  if (!image) continue;
  const started = Date.now();
  const result = await router.generate({
    task: 'agent.extract',
    schema: extractorSchema,
    schemaName: EXTRACTOR_SCHEMA_NAME,
    system: render('agent.extract.system').text,
    user: render('agent.extract.user', { cuisine: 'Genel' }).text,
    images: [image],
  });
  const out = join(fixtures, 'llm', 'extract', file.replace(/\.(jpg|png)$/, '.recorded.json'));
  if (result.ok) {
    writeFileSync(out, `${JSON.stringify(result.value, null, 2)}\n`, 'utf8');
    console.log(`${file}: ${result.value.items.length} items via ${result.meta.model} in ${Date.now() - started} ms → ${out}`);
  } else {
    console.error(`${file}: ${result.error.kind} ${result.error.message}`);
  }
}

// Product Recommender: a pide-only menu, whose open categories are exactly the ones the old recommender ignored.
const started = Date.now();
const recommended = await router.generate({
  task: 'agent.recommend',
  schema: productRecommenderSchema,
  schemaName: PRODUCT_RECOMMENDER_SCHEMA_NAME,
  system: render('agent.recommend.system').text,
  user: render('agent.recommend.user', {
    cuisine: 'Pide & Lahmacun',
    segment: 'orta',
    existing: 'Kıymalı Pide, Kaşarlı Pide, Kuşbaşılı Pide, Karışık Pide, Sucuklu Yumurtalı Pide',
    gaps: ['corba | Çorba | 0/1 | 1 eksik', 'salata-meze | Salata & Meze | 0/1 | 1 eksik', 'icecek | İçecek | 0/2 | 2 eksik', 'tatli | Tatlı | 0/1 | 1 eksik'].join('\n'),
    already: '-',
    target: '10',
    current: '5',
    notes: '-',
    max: '8',
  }).text,
});
if (recommended.ok) {
  const out = join(fixtures, 'llm', 'recommend-items.recorded.json');
  writeFileSync(out, `${JSON.stringify(recommended.value, null, 2)}\n`, 'utf8');
  console.log(`recommend: ${recommended.value.items.length} items via ${recommended.meta.model} in ${Date.now() - started} ms → ${out}`);
} else {
  console.error(`recommend: ${recommended.error.kind} ${recommended.error.message}`);
}
