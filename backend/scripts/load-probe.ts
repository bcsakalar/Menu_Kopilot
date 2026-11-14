/**
 * Load probe (D-214): N reps send a typed menu at the same moment, with the models off, and the probe measures what one
 * API process itself carries — wall time per answer, CPU per analysis, peak memory. The models are the other limit;
 * this isolates ours, so a change to the pipeline can be measured before and after.
 *
 * It writes visitors, conversations and runs into the database it is given, so point it at a COPY of the template
 * pool, never at production:
 *
 *   DATABASE_URL=<copy> LOCAL_ONLY_MODE=true pnpm probe:load 1 5 10 20
 *
 * Measured on the production pool (1723 templates) on a laptop, before → after D-214: one analysis 650 → ~50 ms of CPU;
 * 20 at once 12.6 → ~1 s each.
 */
import { createAiServices } from '../src/ai/index.js';
import { buildApp } from '../src/app.js';
import { RedisCache } from '../src/cache/redis-cache.js';
import { loadConfig } from '../src/config/env.js';
import { createPostgresDb } from '../src/db/client.js';
import type { JobQueue } from '../src/jobs/queue.js';
import { multipartBody, parseSse } from '../test/helpers/fixtures.js';

const config = loadConfig();
if (!config.providers.localOnlyMode) throw new Error('run with LOCAL_ONLY_MODE=true: the probe must not spend model calls');
const db = createPostgresDb(config.databaseUrl);
const cache = new RedisCache(config.redisUrl);
const ai = createAiServices(config, db.db);
const queue: JobQueue = { enqueueEmbedding: () => Promise.resolve(), close: () => Promise.resolve() };
const app = await buildApp({ config, db, cache, ai, queue, logger: false });

/** Menus of different kitchens; every wave adds a product of its own so no answer comes from the cache. */
const MENUS = [
  'Adana Kebap, Urfa Kebap, Lahmacun, Ayran',
  'Margarita Pizza, Karışık Pizza, Sucuklu Pizza, Kola',
  'Hamsi Tava, Levrek Izgara, Çoban Salata',
  'Kaşarlı Pide, Kıymalı Pide, Çay',
  'Tavuk Döner Dürüm, Et Döner Porsiyon, Ayran',
  'Klasik Hamburger, Cheeseburger, Patates Kızartması',
  'Mercimek Çorbası, Ezogelin Çorbası, Kuru Fasulye',
  'Kayseri Mantısı, Su Böreği, Gözleme',
  'Künefe, Baklava, Sütlaç',
  'Latte, Americano, Cheesecake',
];

let host = 0;
let wave = 0;

async function send(text: string): Promise<{ ms: number; status: number; offered: number }> {
  host += 1;
  const body = multipartBody({ text }, []);
  const started = performance.now();
  // Each rep from an address of its own: the probe measures the pipeline, not the door's limits.
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/chat/messages',
    headers: body.headers,
    payload: body.payload,
    remoteAddress: `10.7.${Math.floor(host / 250)}.${host % 250}`,
  });
  const ms = performance.now() - started;
  const message = parseSse(res.body).find((e) => e.event === 'message')?.data as { message?: { result?: { cards: { section: string }[] } } } | undefined;
  const offered = (message?.message?.result?.cards ?? []).filter((c) => c.section === 'new_product').length;
  return { ms, status: res.statusCode, offered };
}

async function run(n: number): Promise<void> {
  wave += 1;
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  let peakRss = 0;
  const timer = setInterval(() => (peakRss = Math.max(peakRss, process.memoryUsage().rss)), 50);
  const results = await Promise.all(Array.from({ length: n }, (_, i) => send(`${MENUS[i % MENUS.length]}, Özel Ürün ${wave}-${i}`)));
  clearInterval(timer);
  const wall = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const at = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))]! / 1000;
  const cpuMs = (cpu.user + cpu.system) / 1000;
  const offered = results.map((r) => r.offered);
  console.log(
    [
      `N=${String(n).padStart(3)}`,
      `wall=${(wall / 1000).toFixed(1)}s`,
      `p50=${at(0.5).toFixed(1)}s`,
      `p90=${at(0.9).toFixed(1)}s`,
      `cpu/analysis=${(cpuMs / n).toFixed(0)}ms`,
      `rssPeak=${(peakRss / 1_048_576).toFixed(0)}MB`,
      `ok=${results.filter((r) => r.status === 200).length}/${n}`,
      `offered=${Math.min(...offered)}-${Math.max(...offered)}`,
    ].join('  '),
  );
}

await run(1); // warm-up: module loading and the first pool read
for (const n of process.argv.slice(2).map(Number).filter((x) => x > 0)) await run(n);
await app.close();
await Promise.allSettled([db.close(), cache.close()]);
