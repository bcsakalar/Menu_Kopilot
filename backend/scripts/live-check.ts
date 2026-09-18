/**
 * Live end-to-end check against a RUNNING server (local Docker or production) over HTTP — the same calls the phone
 * makes. Creates a temporary branch and removes it at the end.
 *
 *   pnpm live:check                                   # http://127.0.0.1:3030, admin from ../.env
 *   pnpm live:check --url https://menu.example.com    # production
 *   pnpm live:check --skip-ai                          # only the parts that need no provider key
 *
 * With provider keys on the server it also runs the AI flows (menu photo, panel screenshots, research, voice) and
 * prints the timings of the acceptance criteria (first card < 6 s, gap analysis p95 < 8 s).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { normalizeTr } from '../src/lib/normalize-tr.js';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: process.env['LIVE_URL'] ?? 'http://127.0.0.1:3030' },
    email: { type: 'string', default: process.env['ADMIN_EMAIL'] ?? '' },
    password: { type: 'string', default: process.env['ADMIN_PASSWORD'] ?? '' },
    'skip-ai': { type: 'boolean', default: false },
    runs: { type: 'string', default: '3' },
  },
});

const base = (args.url ?? '').replace(/\/+$/, '');
const api = `${base}/api/v1`;
const results: { name: string; ok: boolean; detail: string }[] = [];
let token = '';

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

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: Json; text: string }> {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      ...headers,
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

interface SseRun {
  events: { event: string; data: Json; at: number }[];
  total: number;
}

/** Streams an SSE response and timestamps every event (ms since the request started). */
async function sse(path: string, form: FormData): Promise<SseRun> {
  const started = Date.now();
  const response = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' },
    body: form,
  });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${await response.text().catch(() => '')}`);
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  const events: SseRun['events'] = [];
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
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

const PRICE = /\d+(?:[.,]\d+)?\s*(?:tl|₺|try|lira)\b/i;
const fixtures = fileURLToPath(new URL('../test/fixtures/images/', import.meta.url));
const image = (name: string, type: string) => new Blob([readFileSync(`${fixtures}${name}`)], { type });

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
};

console.log(`Menü Kopilot live check → ${base}\n`);

// ---- platform ----------------------------------------------------------------------------------------------------
await step('health/ready: database + redis', async () => {
  const response = await fetch(`${base}/health/ready`);
  const json = (await response.json()) as Json;
  assert(json['status'] === 'ready', JSON.stringify(json));
});

await step('login + me + refresh rotation', async () => {
  assert(args.email && args.password, 'ADMIN_EMAIL / ADMIN_PASSWORD missing (put them in ../.env or pass --email/--password)');
  const login = await call('POST', '/auth/login', { email: args.email, password: args.password, deviceName: 'live-check' });
  assert(login.status === 200, `login ${login.status} ${login.text}`);
  token = String(login.json['accessToken']);
  const me = await call('GET', '/auth/me');
  assert(me.status === 200, `me ${me.status}`);
  const refreshed = await call('POST', '/auth/refresh', { refreshToken: login.json['refreshToken'] });
  assert(refreshed.status === 200, `refresh ${refreshed.status}`);
  const reused = await call('POST', '/auth/refresh', { refreshToken: login.json['refreshToken'] });
  assert(reused.status === 401, `old refresh token must be rejected, got ${reused.status}`);
  token = String(refreshed.json['accessToken']);
});

const unauthorized = await fetch(`${api}/cuisines`);
record('protected routes reject missing token', unauthorized.status === 401, `HTTP ${unauthorized.status}`);

const cuisines = await step('cuisines (12 seeded)', async () => {
  const res = await call('GET', '/cuisines');
  const data = res.json['data'] as Json[];
  assert(data.length >= 12, `only ${data.length}`);
  return data;
});
const kebap = cuisines?.find((c) => c['slug'] === 'kebap-izgara');
const kebapId = str(kebap?.['id']);

// ---- Mod 1 without AI (acceptance #3) ----------------------------------------------------------------------------
await step('suggest: 40 approved templates with ZERO LLM calls', async () => {
  // Approved, not only source=seed: accepting a seed card turns it into source=user (D-019).
  const templates = await call('GET', '/templates?limit=500');
  const seen = new Set<string>();
  const names: string[] = [];
  for (const template of templates.json['data'] as Json[]) {
    const name = String(template['name']);
    if (seen.has(normalizeTr(name)) || names.length === 40) continue;
    seen.add(normalizeTr(name));
    names.push(name);
  }
  assert(names.length === 40, `approved templates: ${names.length}`);
  const run = await call('POST', '/suggest', { cuisineId: kebapId, promptText: names.join('\n') });
  assert(run.status === 200, `HTTP ${run.status} ${run.text.slice(0, 200)}`);
  const cards = run.json['cards'] as Json[];
  assert(cards.length === names.length, `cards ${cards.length}/${names.length}`);
  assert(run.json['llmCalls'] === 0 && run.json['cacheHit'] === true, `llmCalls=${String(run.json['llmCalls'])}`);
  assert(!PRICE.test(run.text), 'price amount in response');
});

await step('suggest over SSE (run → item… → done)', async () => {
  const form = new FormData();
  form.append('cuisineId', kebapId);
  form.append('promptText', 'Adana Dürüm, lahmacun, İSKENDER, kunefe');
  const run = await sse('/suggest', form);
  const names = run.events.map((e) => e.event);
  assert(names[0] === 'run' && names.at(-1) === 'done', names.join(','));
  assert(names.filter((n) => n === 'item').length === 4, `items: ${names.join(',')}`);
});

// ---- branches, export, template pool, settings --------------------------------------------------------------------
const branch = await step('branch create + target override', async () => {
  const created = await call('POST', '/branches', { name: `Canlı Test ${new Date().toISOString().slice(0, 16)}`, cuisineId: kebapId, city: 'İzmir' });
  assert(created.status === 201, `HTTP ${created.status} ${created.text}`);
  const patched = await call('PATCH', `/branches/${String(created.json['id'])}`, { targetItemCount: 14 });
  assert(patched.json['effectiveTarget'] === 14, patched.text);
  return created.json;
});
const branchId = str(branch?.['id']);

await step('branch export CSV (Excel) + JSON', async () => {
  const csv = await fetch(`${api}/branches/${branchId}/export?format=csv`, { headers: { authorization: `Bearer ${token}` } });
  // Read raw bytes: text() would drop the BOM that Turkish Excel needs.
  const bytes = Buffer.from(await csv.arrayBuffer());
  assert(csv.ok && bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), `csv ${csv.status}: no UTF-8 BOM`);
  assert(bytes.subarray(3).toString('utf8').startsWith('Ürün;Durum'), 'csv header');
  const json = await call('GET', `/branches/${branchId}/export?format=json`);
  assert(json.status === 200 && typeof json.json['branch'] === 'object', `json ${json.status}`);
});

await step('template pool search (name + alias, Turkish-insensitive)', async () => {
  const res = await call('GET', `/templates?q=${encodeURIComponent('acılı kebap')}`);
  const names = (res.json['data'] as Json[]).map((t) => t['name']);
  assert(names.includes('Adana Kebap'), JSON.stringify(names));
});

const providers = await step('settings: providers + quota + usage summary', async () => {
  const settings = await call('GET', '/settings/providers');
  const quota = await call('GET', '/settings/quota');
  const usage = await call('GET', '/usage/summary?range=today');
  assert(settings.status === 200 && quota.status === 200 && usage.status === 200, 'settings endpoints');
  return settings.json;
});
const configured = new Set(
  ((providers?.['providers'] as Json[] | undefined) ?? []).filter((p) => p['configured'] === true).map((p) => String(p['name'])),
);
const localOnly = providers?.['localOnlyMode'] === true;
console.log(`\n  providers configured: ${[...configured].join(', ') || 'none'}${localOnly ? ' (LOCAL_ONLY_MODE)' : ''}\n`);

// ---- AI flows -----------------------------------------------------------------------------------------------------
if (args['skip-ai'] || configured.size === 0 || localOnly) {
  await step('without AI: panel screenshots degrade gracefully (warning, no crash)', async () => {
    const form = new FormData();
    form.append('branchId', branchId);
    form.append('images', image('panel-1.png', 'image/png'), 'panel-1.png');
    const run = await sse('/gap-analysis', form);
    const names = run.events.map((e) => e.event);
    assert(names.includes('counts') && names.at(-1) === 'done', names.join(','));
  });
  await step('without AI: voice note / research answer with a clear error', async () => {
    const research = await call('POST', '/research', { branchId });
    assert([409, 429, 503].includes(research.status), `research ${research.status} ${research.text}`);
  });
} else {
  const runs = Math.max(1, Number(args.runs) || 3);

  await step('Mod 1 photo: 15-item menu → cards (first card < 6 s)', async () => {
    const form = new FormData();
    form.append('cuisineId', kebapId);
    form.append('images', image('menu-kebapci.jpg', 'image/jpeg'), 'menu-kebapci.jpg');
    const run = await sse('/suggest', form);
    const items = run.events.filter((e) => e.event === 'item');
    const firstCard = items[0]?.at ?? Number.NaN;
    const done = run.events.find((e) => e.event === 'done')?.data;
    console.log(`      first card ${firstCard} ms · ${items.length} cards · total ${run.total} ms · stats ${JSON.stringify(done?.['stats'])}`);
    assert(items.length >= 10, `only ${items.length} cards`);
    assert(firstCard < 6000, `first card after ${firstCard} ms`);
    assert(!PRICE.test(JSON.stringify(items.map((i) => i.data))), 'price amount in cards');
    for (const item of items) {
      const payload = (item.data['card'] as Json)['payload'] as Json;
      assert(String(payload['description']).length <= 160, `description too long: ${String(payload['name'])}`);
    }
  });

  await step(`Mod 2: 2 panel screenshots → x/target + checklist (p95 < 8 s over ${runs} runs)`, async () => {
    const totals: number[] = [];
    let counts: Json | undefined;
    for (let i = 0; i < runs; i += 1) {
      const form = new FormData();
      form.append('branchId', branchId);
      form.append('images', image('panel-1.png', 'image/png'), 'panel-1.png');
      form.append('images', image('panel-2.png', 'image/png'), 'panel-2.png');
      const run = await sse('/gap-analysis', form);
      const countsEvent = run.events.find((e) => e.event === 'counts');
      counts = countsEvent?.data['counts'] as Json | undefined;
      totals.push(run.total);
      console.log(`      run ${i + 1}: counts after ${countsEvent?.at ?? '-'} ms · done after ${run.total} ms · ${JSON.stringify(counts)}`);
    }
    console.log(`      p95 ${percentile(totals, 95)} ms (first run reads the images, later runs use the cache)`);
    assert(counts && Number(counts['fromScreenshots']) >= 10, `unique items: ${JSON.stringify(counts)}`);
    assert(percentile(totals, 95) < 8000, `p95 ${percentile(totals, 95)} ms`);
  });

  if (configured.has('groq')) {
    await step('research: web search for a real restaurant', async () => {
      const res = await call('POST', '/research', { restaurantName: 'Hacı Abdullah Lokantası', city: 'İstanbul' });
      const details = (res.json['error'] as Json | undefined)?.['details'] as Json | undefined;
      if (res.status === 503 && details?.['status'] === 413) {
        // Free API tiers: compound's own calls exceed Groq's per-minute token limit (D-142). The app gets a clear error.
        console.log('      not available on this API plan (Groq 413 per-minute token limit) — clear error returned');
        return;
      }
      assert(res.status === 200, `HTTP ${res.status} ${res.text.slice(0, 300)}`);
      console.log(`      found=${String(res.json['found'])} items=${(res.json['items'] as Json[]).length} sources=${(res.json['sources'] as Json[]).length}`);
      assert(!PRICE.test(res.text), 'price amount in research result');
    });
  }
}

// ---- cleanup --------------------------------------------------------------------------------------------------------
if (branchId) {
  await step('cleanup: delete the test branch', async () => {
    const res = await call('DELETE', `/branches/${branchId}`);
    assert(res.status === 204, `HTTP ${res.status}`);
  });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? ` — FAILED: ${failed.map((f) => f.name).join('; ')}` : ''}`);
process.exit(failed.length > 0 ? 1 : 0);
