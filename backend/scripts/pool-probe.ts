/**
 * Pool probe (D-217): with the models OFF, what does every cuisine get from the template pool alone? For each cuisine
 * it sends four messages through the real chat door — the cuisine named with no menu, one product typed alone, a
 * five-product menu and a menu three products short of the target — and checks each answer: did it reach the
 * target's fill goal, did the cuisine come out right, how much came from the cuisine's own pool, any duplicates.
 *
 * PROBE_AI=1 with LOCAL_ONLY_MODE=false runs the same cases with the models on (real calls).
 *
 * It writes visitors, conversations and runs into the database it is given, so point it at a COPY of the pool:
 *
 *   DATABASE_URL=<copy> LOCAL_ONLY_MODE=true pnpm probe:pool            (every cuisine)
 *   DATABASE_URL=<copy> LOCAL_ONLY_MODE=true pnpm probe:pool pizza meze  (some)
 *
 * The output prints targets: keep it out of the repository, they are company-internal (D-207).
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { fillGoal } from '../src/agents/plan.js';
import { createAiServices } from '../src/ai/index.js';
import { buildApp } from '../src/app.js';
import { RedisCache } from '../src/cache/redis-cache.js';
import { loadConfig } from '../src/config/env.js';
import { createPostgresDb } from '../src/db/client.js';
import { cuisines, menuItems } from '../src/db/schema/index.js';
import type { JobQueue } from '../src/jobs/queue.js';
import { sameProductName } from '../src/lib/same-product.js';
import { normalizeTr } from '../src/lib/normalize-tr.js';
import type { CardDto, CountsDto } from '../src/modules/analyze/schemas.js';
import { multipartBody, parseSse } from '../test/helpers/fixtures.js';

const config = loadConfig();
// PROBE_AI=1 measures the pool and the models together; it spends real model calls.
if (!config.providers.localOnlyMode && process.env.PROBE_AI !== '1') throw new Error('run with LOCAL_ONLY_MODE=true (the pool alone) or PROBE_AI=1 (with the models)');
const db = createPostgresDb(config.databaseUrl);
const cache = new RedisCache(config.redisUrl);
const ai = createAiServices(config, db.db);
const queue: JobQueue = { enqueueEmbedding: () => Promise.resolve(), close: () => Promise.resolve() };
const app = await buildApp({ config, db, cache, ai, queue, logger: false });

interface Answer {
  text: string;
  cards: CardDto[];
  counts: CountsDto | null;
}

let host = 0;
async function send(text: string): Promise<Answer> {
  host += 1;
  const body = multipartBody({ text }, []);
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/chat/messages',
    headers: body.headers,
    payload: body.payload,
    remoteAddress: `10.8.${Math.floor(host / 250)}.${host % 250}`,
  });
  const message = parseSse(res.body).find((e) => e.event === 'message')?.data as
    | { message: { text: string; result: { cards: CardDto[]; counts: CountsDto | null } | null } }
    | undefined;
  return { text: message?.message.text ?? `HTTP ${res.statusCode}`, cards: message?.message.result?.cards ?? [], counts: message?.message.result?.counts ?? null };
}

const wanted = new Set(process.argv.slice(2));
const all = await db.db.select({ id: cuisines.id, slug: cuisines.slug, name: cuisines.name, target: cuisines.minItemCount }).from(cuisines).orderBy(cuisines.name);
const kitchens = all.filter((c) => wanted.size === 0 || wanted.has(c.slug));
const owner = new Map(
  (await db.db.select({ id: menuItems.id, cuisineId: menuItems.cuisineId }).from(menuItems).where(eq(menuItems.approved, true))).map((r) => [r.id, r.cuisineId]),
);

let short = 0;
let wrong = 0;
let dupes = 0;
let cases = 0;
for (const kitchen of kitchens) {
  // The cuisine's own pool, most important first, its mains before drinks: what a real menu of the kitchen sells.
  const own = await db.db
    .select({ name: menuItems.canonicalName, category: menuItems.categoryKey })
    .from(menuItems)
    .where(and(eq(menuItems.approved, true), eq(menuItems.cuisineId, kitchen.id), sql`coalesce(${menuItems.categoryKey}, '') <> 'icecek'`))
    .orderBy(desc(menuItems.importance), desc(menuItems.usageCount));
  const names = own.map((r) => r.name);
  const scenarios: [string, string, number][] = [
    ['start', `${kitchen.name} için öneri sun`, 0],
    ['single', names[0] ?? kitchen.name, 1],
    ['small', names.slice(0, 5).join(', '), 5],
    ['near', names.slice(0, Math.max(5, kitchen.target - 3)).join(', '), Math.max(5, kitchen.target - 3)],
  ];
  for (const [label, text, typed] of scenarios) {
    if (typed > names.length) continue;
    cases += 1;
    const answer = await send(text);
    const offered = answer.cards.filter((c) => c.section === 'new_product');
    const current = answer.counts?.current ?? typed;
    const goal = fillGoal(current, kitchen.target);
    const ownShare = offered.filter((c) => c.matchedTemplateId && owner.get(c.matchedTemplateId) === kitchen.id).length;
    const fromAi = offered.filter((c) => !c.matchedTemplateId).length;
    const cuisineOk = answer.counts?.cuisineName === kitchen.name;
    const typedNames = text.split(',').map((s) => s.trim());
    const dup = offered.filter((c, i) => offered.some((o, j) => j < i && sameProductName(normalizeTr(o.name), normalizeTr(c.name))) || typedNames.some((t) => sameProductName(normalizeTr(t), normalizeTr(c.name))));
    const missing = Math.max(0, goal - offered.length);
    if (missing > 0) short += 1;
    if (!cuisineOk) wrong += 1;
    if (dup.length > 0) dupes += 1;
    const others = offered.filter((c) => c.matchedTemplateId && owner.get(c.matchedTemplateId) !== kitchen.id).slice(0, 4).map((c) => c.name);
    // PROBE_SHOW=slug:scenario lists every offered card with its cuisine and category, for a closer look.
    if (process.env.PROBE_SHOW === `${kitchen.slug}:${label}`) {
      const slugOf = new Map(all.map((c) => [c.id, c.slug]));
      for (const c of offered) console.log(`    ${c.name} | ${slugOf.get(owner.get(c.matchedTemplateId ?? '') ?? '') ?? 'ai'} | ${c.categoryKey ?? '-'}`);
      console.log(`    typed: ${text}`);
    }
    console.log(
      [
        kitchen.slug.padEnd(20),
        label.padEnd(6),
        `menu=${String(current).padStart(2)}`,
        `goal=${String(goal).padStart(2)}`,
        `offered=${String(offered.length).padStart(2)}`,
        missing > 0 ? `SHORT ${missing}` : 'ok',
        cuisineOk ? '' : `CUISINE=${answer.counts?.cuisineName ?? '-'} for "${text.slice(0, 70)}"`,
        `own=${Math.round((ownShare / Math.max(1, offered.length)) * 100)}%`,
        fromAi > 0 ? `ai=${fromAi}` : '',
        dup.length > 0 ? `DUP ${dup.map((c) => c.name).join('/')}` : '',
        others.length > 0 ? `other: ${others.join(', ')}` : '',
        offered.length === 0 ? `reply: ${answer.text.slice(0, 80)}` : '',
      ]
        .filter(Boolean)
        .join('  '),
    );
  }
}
console.log(`\n${cases} cases: ${short} short of the goal, ${wrong} with the wrong cuisine, ${dupes} with duplicates`);
await app.close();
await Promise.allSettled([db.close(), cache.close()]);
