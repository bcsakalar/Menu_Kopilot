/**
 * Live end-to-end check against a RUNNING server (local Docker or production) over HTTP — the same calls the phone
 * makes, independent of the app. Read-only apart from the analysis runs it starts (and one card it marks skipped):
 * it never accepts a card, so the template pool is left as it was.
 *
 *   pnpm live:check                                   # http://127.0.0.1:3030, admin from ../.env
 *   pnpm live:check --url https://menu.example.com    # production
 *   pnpm live:check --skip-ai                          # only the parts that need no provider key
 *
 * With provider keys on the server it also reads panel screenshots and a menu photo, and prints the end-to-end
 * timings against the 15 s budget.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: process.env['LIVE_URL'] ?? 'http://127.0.0.1:3030' },
    email: { type: 'string', default: process.env['ADMIN_EMAIL'] ?? '' },
    password: { type: 'string', default: process.env['ADMIN_PASSWORD'] ?? '' },
    'skip-ai': { type: 'boolean', default: false },
  },
});

const base = (args.url ?? '').replace(/\/+$/, '');
const api = `${base}/api/v1`;
const results: { name: string; ok: boolean; detail: string }[] = [];
let token = '';
/** The pipeline's end-to-end budget (FAZ 1 requirement). */
const BUDGET_MS = 15_000;

type Json = Record<string, unknown>;

function record(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function step<T>(name: string, body: () => Promise<T>): Promise<T | undefined> {
  const started = Date.now();
  try {
    const value = await body();
    record(name, true, `${Date.now() - started} ms`);
    return value;
  } catch (err) {
    record(name, false, err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Json; text: string }> {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: parseJson(text), text };
}

function parseJson(text: string): Json {
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' ? (value as Json) : {};
  } catch {
    return {};
  }
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const list = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);

interface SseRun {
  events: { event: string; data: Json; at: number }[];
  total: number;
}

/** Streams an SSE response and timestamps every event (ms since the request started). */
async function sse(path: string, init: { method: 'GET' | 'POST'; body?: FormData }): Promise<SseRun> {
  const started = Date.now();
  const response = await fetch(`${api}${path}`, {
    method: init.method,
    headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' },
    ...(init.body ? { body: init.body } : {}),
  });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${await response.text().catch(() => '')}`);
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  const events: SseRun['events'] = [];
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let index = buffer.indexOf('\n\n');
    while (index >= 0) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const data = block
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6))
        .join('\n');
      if (event && data) events.push({ event, data: JSON.parse(data) as Json, at: Date.now() - started });
      index = buffer.indexOf('\n\n');
    }
  }
  return { events, total: Date.now() - started };
}

/** A price AMOUNT. The card's `priceRangeHint` is allowed to carry one (a call note); a template never is. */
const PRICE = /\d+(?:[.,]\d+)?\s*(?:tl|₺|try|lira)\b/i;
/** Packaging or weight glued to a product name ("Ayran (1 L)"): the Validator moves it to the portion field. */
const NAME_NOISE = /[([]?\s*\d+[.,]?\d*\s*(?:l|lt|ml|cl|gr|g|kg|adet|porsiyon)\b/i;
const fixtures = fileURLToPath(new URL('../test/fixtures/images/', import.meta.url));
const image = (name: string, type: string) => new Blob([readFileSync(`${fixtures}${name}`)], { type });

/** The rules every analysis result must keep, whatever the input. */
function checkResult(result: Json): void {
  const menu = list(result['menu']);
  const cards = list(result['cards']);
  const onMenu = new Set(menu.map((m) => str(m['normalized'])));
  for (const card of cards) {
    const section = str(card['section']);
    assert(['new_product', 'option', 'fix'].includes(section), `unknown section ${section}`);
    if (section === 'new_product') {
      assert(!onMenu.has(str(card['name']).toLocaleLowerCase('tr-TR')), `"${str(card['name'])}" is already on the menu`);
      assert(str(card['categoryKey']) !== '', `"${str(card['name'])}" has no category`);
      assert(str(card['reason']) !== '', `"${str(card['name'])}" has no reason`);
      assert(!NAME_NOISE.test(str(card['name'])), `packaging in the name: ${str(card['name'])}`);
    } else {
      assert(onMenu.has(str(card['targetNormalized'])), `${section} card "${str(card['name'])}" is not attached to a menu row`);
    }
    assert(!card['payload'] || !PRICE.test(JSON.stringify(card['payload'])), `price amount in the template of ${str(card['name'])}`);
  }
}

const count = (result: Json, section: string) => list(result['cards']).filter((c) => c['section'] === section).length;

/** Every image must have been read; a skipped one (rate limit, provider down) is named with the server's warning. */
function checkImagesRead(result: Json): void {
  const stats = (result['stats'] ?? {}) as Json;
  const failed = Number(stats['imagesFailed'] ?? 0);
  const warnings = list(result['warnings']).map((w) => `${str(w['code'])}: ${str(w['message'])}`);
  console.log(`      images read ${String(stats['imagesRead'])} · failed ${failed}${warnings.length ? ` · ${warnings.join(' | ')}` : ''}`);
  assert(failed === 0, `${failed} image(s) not read — ${warnings.join(' | ') || 'no warning'} (see the extractor step in /trace)`);
}

console.log(`Menü Kopilot live check → ${base}\n`);

// ---- platform ----------------------------------------------------------------------------------------------------
await step('health + health/ready (database, redis)', async () => {
  const health = (await (await fetch(`${base}/health`)).json()) as Json;
  assert(health['status'] === 'ok', JSON.stringify(health));
  const ready = (await (await fetch(`${base}/health/ready`)).json()) as Json;
  assert(ready['status'] === 'ready', JSON.stringify(ready));
});

await step('login + me', async () => {
  assert(args.email && args.password, 'ADMIN_EMAIL / ADMIN_PASSWORD missing (put them in ../.env or pass --email/--password)');
  const login = await call('POST', '/auth/login', { email: args.email, password: args.password, deviceName: 'live-check' });
  assert(login.status === 200, `login ${login.status} ${login.text}`);
  token = String(login.json['accessToken']);
  const me = await call('GET', '/auth/me');
  assert(me.status === 200, `me ${me.status}`);
});

const unauthorized = await fetch(`${api}/analyze/latest`);
record('protected routes reject a missing token', unauthorized.status === 401, `HTTP ${unauthorized.status}`);

const cuisines = await step('cuisines', async () => {
  const data = list((await call('GET', '/cuisines')).json['data']);
  assert(data.length >= 12, `only ${data.length}`);
  return data;
});
const idOf = (slug: string) => str(cuisines?.find((c) => c['slug'] === slug)?.['id']);
const pideId = idOf('pide-lahmacun');
const kebapId = idOf('kebap-izgara');

await step('category taxonomy + per-cuisine expectations (Postgres, editable)', async () => {
  const categories = list((await call('GET', '/categories')).json['data']);
  assert(categories.length >= 8, `categories: ${categories.length}`);
  assert(categories.some((c) => c['key'] === 'icecek'), 'no drinks category');
  const expected = list((await call('GET', `/cuisines/${pideId}/categories`)).json['data']);
  assert(expected.some((c) => c['categoryKey'] === 'icecek'), `pide expects: ${expected.map((c) => str(c['categoryKey'])).join(',')}`);
});

// ---- analysis of a typed menu (works with or without a provider key) ---------------------------------------------
const typed = await step(`analysis: typed pide menu → three sections (< ${BUDGET_MS} ms)`, async () => {
  const form = new FormData();
  form.append('cuisineId', pideId);
  form.append('menuText', 'Kıymalı Pide, Kaşarlı Pide, Kuşbaşılı Pide, Karışık Pide, Sucuklu Yumurtalı Pide');
  form.append('debug', 'true');
  const started = Date.now();
  const res = await call('POST', '/analyze', form);
  const elapsed = Date.now() - started;
  assert(res.status === 200, `HTTP ${res.status} ${res.text.slice(0, 200)}`);
  const counts = res.json['counts'] as Json;
  assert(list(res.json['menu']).length === 5, `menu: ${list(res.json['menu']).length}`);
  assert(counts['current'] === 5 && counts['target'] === 10 && counts['hardMinimum'] === 10, JSON.stringify(counts));
  assert(list(counts['categories']).some((c) => Number(c['missing']) > 0), 'no open category on a pide-only menu');
  assert(count(res.json, 'new_product') > 0, 'no new product');
  checkResult(res.json);
  const stats = res.json['stats'] as Json;
  console.log(
    `      ${elapsed} ms · ${count(res.json, 'new_product')} new / ${count(res.json, 'option')} option / ${count(res.json, 'fix')} fix · ${String(stats['llmCalls'])} LLM calls`,
  );
  assert(elapsed < BUDGET_MS, `${elapsed} ms`);
  return res.json;
});
const runId = str(typed?.['runId']);

await step('trace: one step per agent, served to the debug screen', async () => {
  const trace = await call('GET', `/analyze/${runId}/trace`);
  const agents = list(trace.json['steps']).map((s) => str(s['agent']));
  for (const agent of ['extractor', 'classifier', 'gap_analyst', 'product_recommender', 'option_modifier', 'validator']) {
    assert(agents.includes(agent), `no ${agent} step (${agents.join(',')})`);
  }
});

await step('resume: latest analysis, snapshot and event replay', async () => {
  const latest = await call('GET', '/analyze/latest');
  assert(latest.json['runId'] === runId, `latest ${str(latest.json['runId'])}`);
  const snapshot = await call('GET', `/analyze/${runId}`);
  assert(snapshot.status === 200, `snapshot ${snapshot.status}`);
  const replay = await sse(`/analyze/${runId}/events`, { method: 'GET' });
  const names = replay.events.map((e) => e.event);
  assert(names.includes('counts') && names.at(-1) === 'done', names.join(','));
});

await step('re-run with another cuisine: the menu is not read again', async () => {
  const form = new FormData();
  form.append('cuisineId', kebapId);
  form.append('fromRunId', runId);
  const res = await call('POST', '/analyze', form);
  assert(res.status === 200, `HTTP ${res.status} ${res.text.slice(0, 200)}`);
  assert((res.json['counts'] as Json)['cuisineId'] === kebapId, 'cuisine not overridden');
  assert(list(res.json['menu']).length === 5, 'menu changed');
  checkResult(res.json);
  const steps = list((await call('GET', `/analyze/${str(res.json['runId'])}/trace`)).json['steps']);
  assert(steps.find((s) => s['agent'] === 'extractor')?.['status'] === 'skipped', 'extractor ran again');
});

await step('SSE: run first, counts before the first card, done last', async () => {
  const form = new FormData();
  form.append('cuisineId', pideId);
  form.append('menuText', 'Lahmacun, Kıymalı Pide');
  const run = await sse('/analyze', { method: 'POST', body: form });
  const names = run.events.map((e) => e.event);
  assert(names[0] === 'run' && names.at(-1) === 'done', names.join(','));
  const firstItem = names.indexOf('item');
  assert(firstItem < 0 || names.indexOf('counts') < firstItem, names.join(','));
  console.log(`      counts after ${run.events.find((e) => e.event === 'counts')?.at ?? '-'} ms · done after ${run.total} ms`);
});

await step('skip marks a card without touching the template pool', async () => {
  const card = list(typed?.['cards']).find((c) => c['status'] === 'pending');
  assert(card, 'no pending card');
  const res = await call('POST', `/suggestion-items/${str(card['id'])}/skip`);
  assert(res.status === 200 && res.json['status'] === 'skipped', `HTTP ${res.status} ${res.text.slice(0, 120)}`);
});

const providers = await step('settings: providers + quota + usage summary', async () => {
  const settings = await call('GET', '/settings/providers');
  const quota = await call('GET', '/settings/quota');
  const usage = await call('GET', '/usage/summary?range=today');
  assert(settings.status === 200 && quota.status === 200 && usage.status === 200, 'settings endpoints');
  return settings.json;
});
const configured = new Set(list(providers?.['providers']).filter((p) => p['configured'] === true).map((p) => str(p['name'])));
const localOnly = providers?.['localOnlyMode'] === true;
console.log(`\n  providers configured: ${[...configured].join(', ') || 'none'}${localOnly ? ' (LOCAL_ONLY_MODE)' : ''}\n`);

// ---- image flows (need a provider key) ----------------------------------------------------------------------------
if (args['skip-ai'] || configured.size === 0 || localOnly) {
  await step('without AI: a screenshot degrades to a warning, not a crash', async () => {
    const form = new FormData();
    form.append('cuisineId', kebapId);
    form.append('images', image('panel-1.png', 'image/png'), 'panel-1.png');
    const run = await sse('/analyze', { method: 'POST', body: form });
    const names = run.events.map((e) => e.event);
    assert(names.includes('warning') && names.at(-1) === 'done', names.join(','));
  });
} else {
  await step(`panel screenshots (2, overlapping) → options and fixes (< ${BUDGET_MS} ms)`, async () => {
    const form = new FormData();
    form.append('cuisineId', kebapId);
    form.append('images', image('panel-1.png', 'image/png'), 'panel-1.png');
    form.append('images', image('panel-2.png', 'image/png'), 'panel-2.png');
    const started = Date.now();
    const res = await call('POST', '/analyze', form);
    const elapsed = Date.now() - started;
    assert(res.status === 200, `HTTP ${res.status} ${res.text.slice(0, 200)}`);
    const names = list(res.json['menu']).map((m) => str(m['normalized']));
    assert(new Set(names).size === names.length, 'a product is counted twice');
    checkResult(res.json);
    checkImagesRead(res.json);
    console.log(
      `      ${elapsed} ms · menu ${names.length} · ${count(res.json, 'new_product')} new / ${count(res.json, 'option')} option / ${count(res.json, 'fix')} fix`,
    );
    assert(count(res.json, 'option') + count(res.json, 'fix') > 0, 'no option or fix card for a panel with empty fields');
    assert(elapsed < BUDGET_MS, `${elapsed} ms`);
  });

  await step(`menu photo (kebapçı) → product list (< ${BUDGET_MS} ms)`, async () => {
    const form = new FormData();
    form.append('cuisineId', kebapId);
    form.append('images', image('menu-kebapci.jpg', 'image/jpeg'), 'menu-kebapci.jpg');
    const started = Date.now();
    const res = await call('POST', '/analyze', form);
    const elapsed = Date.now() - started;
    assert(res.status === 200, `HTTP ${res.status} ${res.text.slice(0, 200)}`);
    checkResult(res.json);
    console.log(`      ${elapsed} ms · menu ${list(res.json['menu']).length} · ${list(res.json['cards']).length} cards`);
    checkImagesRead(res.json);
    assert(list(res.json['menu']).length >= 10, `only ${list(res.json['menu']).length} products read`);
    assert(elapsed < BUDGET_MS, `${elapsed} ms`);
  });
}

// ---- removed surfaces ---------------------------------------------------------------------------------------------
await step('removed endpoints answer 404 (branches, gap analysis, research, suggest)', async () => {
  for (const [method, path] of [
    ['GET', '/branches'],
    ['POST', '/gap-analysis'],
    ['POST', '/research'],
    ['POST', '/suggest'],
  ] as const) {
    const res = await call(method, path, method === 'POST' ? {} : undefined);
    assert(res.status === 404, `${method} ${path} → ${res.status}`);
  }
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? ` — FAILED: ${failed.map((f) => f.name).join('; ')}` : ''}`);
process.exit(failed.length > 0 ? 1 : 0);
