/**
 * Öneri üreten LLM adımını YALITILMIŞ ölçer — DB kısayolu onu gizlemeden.
 *
 * `/gap-analysis` önce onaylı şablonlardan öneri üretir; seed havuzu dolu olduğu için model hiç çağrılmaz
 * (ölçümde 0 LLM çağrısı). Bu script aynı fixture menüleriyle doğrudan `text.gap_suggest` görevini çağırır, yani
 * "modelin kendi başına ne önerdiğini" gösterir. "Önce/sonra" tablosunda Product Recommender karşılaştırması
 * bu sayılara dayanır.
 *
 *   pnpm probe:recommender --label before
 *   pnpm probe:recommender --label after --runs 2
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createAiServices } from '../src/ai/index.js';
import { RequestBudget } from '../src/ai/budget.js';
import { parseEnv } from '../src/config/env.js';
import { createPostgresDb } from '../src/db/client.js';
import { normalizeTr } from '../src/lib/normalize-tr.js';
import { containsPriceAmount } from '../src/lib/price-guard.js';
import { trigramSimilarity } from '../src/lib/trigram.js';
import { loadCategoryIndex, loadExpectations } from '../src/agents/gap-analyst.js';
import { categoryGaps } from '../src/domain/category.js';
import {
  PRODUCT_RECOMMENDER_SCHEMA_NAME,
  productRecommenderSchema,
  recommendedProductSchema,
} from '../src/agents/schemas/product-recommender.js';

const { values: args } = parseArgs({
  options: {
    label: { type: 'string', default: 'before' },
    runs: { type: 'string', default: '1' },
    only: { type: 'string', default: '' },
    /** Wait between calls — free tiers allow only a few thousand tokens a minute (gpt-oss-120b: 8K). */
    'pause-ms': { type: 'string', default: '0' },
  },
});
const pauseMs = Math.max(0, Number(args['pause-ms']) || 0);
let calls = 0;

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '../test/fixtures/menus');

interface MenuFixture {
  id: string;
  label: string;
  cuisineSlug: string;
  menu: string[];
  expectCategories: string[];
  plausibleAdditions: string[];
  implausible: string[];
}

const SIMILAR = 0.8;
const near = (a: string, b: string): boolean => a === b || trigramSimilarity(a, b) >= SIMILAR;
const inList = (name: string, list: readonly string[]): boolean =>
  list.some((entry) => near(normalizeTr(entry), normalizeTr(name)));

/**
 * Ada karışmış ambalaj/gramaj bilgisi: "Ayran (30l)", "Kola (33 cl)", "Su (0.5 L)". Şemaya göre bu bilgi
 * `portionInfo` alanına ait; adda olması hem dedupe'u hem şablon eşleşmesini bozar. Nesnel ölçülebilir bir kusur.
 */
const NAME_NOISE = /(\(|\b)\d+[.,]?\d*\s*(l|lt|litre|ml|cl|cc|gr|gram|g|kg|adet|porsiyon|dilim|top)\b|\(.*\d.*\)/i;

function hasNameNoise(name: string): boolean {
  return NAME_NOISE.test(name);
}

interface Judged {
  name: string;
  reason: string;
  importance: number;
  duplicate: boolean;
  relevant: boolean;
  nameNoise: boolean;
  usable: boolean;
  why: string;
}

function judge(item: { name: string; reason: string; importance: number }, fx: MenuFixture): Judged {
  const duplicate = inList(item.name, fx.menu);
  const relevant = inList(item.name, fx.plausibleAdditions) && !inList(item.name, fx.implausible);
  const why: string[] = [];
  if (duplicate) why.push('menüde zaten var');
  if (!relevant) why.push('mutfağa alakasız / listede yok');
  if (item.reason.trim().length < 10) why.push('gerekçe yok');
  if (containsPriceAmount(`${item.name} ${item.reason}`)) why.push('fiyat sızıntısı');
  const nameNoise = hasNameNoise(item.name);
  if (nameNoise) why.push('adda gramaj/ambalaj');
  return { ...item, duplicate, relevant, nameNoise, usable: why.length === 0, why: why.join(', ') };
}

async function main(): Promise<void> {
  const config = parseEnv(process.env);
  const db = createPostgresDb(config.databaseUrl, { max: 2 });
  const ai = createAiServices(config, db.db);
  const runs = Math.max(1, Number(args.runs) || 1);
  const only = (args.only ?? '').trim();

  const fixtures = readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(fixturesDir, f), 'utf8')) as MenuFixture)
    .filter((f) => only === '' || f.id === only)
    .sort((a, b) => a.id.localeCompare(b.id));

  const cuisineRows = await db.db.query.cuisines.findMany();
  const bySlug = new Map(cuisineRows.map((c) => [c.slug, c]));
  const categories = await loadCategoryIndex(db.db);

  console.log(`\n=== recommender probe "${args.label}" — ${fixtures.length} fixture × ${runs} koşu ===\n`);
  const all: { id: string; run: number; latencyMs: number; items: Judged[]; error?: string }[] = [];

  for (const fx of fixtures) {
    const cuisine = bySlug.get(fx.cuisineSlug);
    if (!cuisine) {
      console.log(`  ! ${fx.id}: mutfak yok (${fx.cuisineSlug})`);
      continue;
    }
    // The agent is measured with exactly the input the pipeline gives it: the cuisine's category expectations,
    // minus what the fixture menu already covers.
    const expectations = await loadExpectations(db.db, cuisine.id);
    const present = new Map<string, number>();
    for (const name of fx.menu) {
      const key = categories.classify(name);
      present.set(key, (present.get(key) ?? 0) + 1);
    }
    const gaps = categoryGaps(expectations, present).filter((g) => g.missing > 0);

    for (let run = 1; run <= runs; run += 1) {
      const target = Math.max(10, cuisine.minItemCount);
      const system = (await ai.prompts.render('agent.recommend.system')).text;
      const user = (
        await ai.prompts.render('agent.recommend.user', {
          cuisine: cuisine.name,
          segment: 'orta',
          existing: fx.menu.join(', '),
          gaps: gaps.map((g) => `${g.key} | ${g.label} | ${g.present}/${g.minItems} | ${g.missing} eksik`).join('\n') || '-',
          already: '-',
          target,
          current: fx.menu.length,
          notes: '-',
          max: 10,
        })
      ).text;
      if (pauseMs > 0 && calls > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
      calls += 1;
      const started = Date.now();
      const result = await ai.router.generate(
        {
          task: 'agent.recommend',
          schema: productRecommenderSchema,
          schemaName: PRODUCT_RECOMMENDER_SCHEMA_NAME,
          system,
          user,
        },
        { budget: new RequestBudget(4, 200_000) },
      );
      const latencyMs = Date.now() - started;
      if (!result.ok) {
        console.log(`  ✗ ${fx.id} #${run}: ${result.error.kind} — ${result.error.message.slice(0, 120)}`);
        all.push({ id: fx.id, run, latencyMs, items: [], error: result.error.kind });
        continue;
      }
      const items = result.value.items
        .map((raw) => recommendedProductSchema.safeParse(raw))
        .filter((p) => p.success)
        .map((p) => judge({ name: p.data.name, reason: p.data.reason, importance: p.data.importance }, fx));
      all.push({ id: fx.id, run, latencyMs, items });
      const dup = items.filter((i) => i.duplicate).length;
      const irr = items.filter((i) => !i.relevant).length;
      const use = items.filter((i) => i.usable).length;
      console.log(
        `  · ${fx.id} #${run} (${result.meta.provider}/${result.meta.model}, ${latencyMs} ms): ` +
          `${items.length} öneri — ${dup} tekrar, ${irr} alakasız, ${use} kullanılabilir`,
      );
      console.log(`      ${items.map((i) => `${i.name}${i.duplicate ? '⟲' : ''}${i.relevant ? '' : '✗'}`).join(', ')}`);
    }
  }

  const produced = all.reduce((n, r) => n + r.items.length, 0);
  const dup = all.reduce((n, r) => n + r.items.filter((i) => i.duplicate).length, 0);
  const irr = all.reduce((n, r) => n + r.items.filter((i) => !i.relevant).length, 0);
  const use = all.reduce((n, r) => n + r.items.filter((i) => i.usable).length, 0);
  const noise = all.reduce((n, r) => n + r.items.filter((i) => i.nameNoise).length, 0);
  void noise;
  const okRuns = all.filter((r) => !r.error);
  const avg = okRuns.length === 0 ? 0 : Math.round(okRuns.reduce((n, r) => n + r.latencyMs, 0) / okRuns.length);
  const pct = (part: number) => (produced === 0 ? '—' : `${Math.round((part / produced) * 100)}%`);
  console.log(
    `\ntoplam ${produced} öneri — tekrar ${dup} (${pct(dup)}), alakasız ${irr} (${pct(irr)}), ` +
      `kullanılabilir ${use} (${pct(use)}), ortalama ${avg} ms/çağrı\n`,
  );

  const out = join(here, '../exports', `recommender-${args.label}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ label: args.label, at: new Date().toISOString(), runs: all }, null, 2)}\n`, 'utf8');
  console.log(`yazıldı: ${out}\n`);
  await db.close();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err));
  process.exitCode = 1;
});
