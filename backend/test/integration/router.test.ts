import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { RequestBudget } from '../../src/ai/budget.js';
import { CircuitBreaker } from '../../src/ai/circuit-breaker.js';
import { PromptRepository } from '../../src/ai/prompt-repository.js';
import { CooldownTracker } from '../../src/ai/rate-limit.js';
import { RouteRepository } from '../../src/ai/route-repository.js';
import { AiRouter } from '../../src/ai/router.js';
import type { ImageInput } from '../../src/ai/types.js';
import { QuotaService, UsageLogger } from '../../src/ai/usage.js';
import { MODELS } from '../../src/config/models.js';
import type { DbHandle } from '../../src/db/client.js';
import { usageLog } from '../../src/db/schema/index.js';
import { seedDatabase } from '../../src/db/seed/seed.js';
import { FakeProvider, hashEmbedding, okJson } from '../helpers/fake-provider.js';
import { createTestDb } from '../helpers/test-db.js';

const schema = z.object({ items: z.array(z.object({ name: z.string() })) });
const good = okJson({ items: [{ name: 'Adana Kebap' }] });
const image: ImageInput = { data: Buffer.from('img'), mimeType: 'image/jpeg', sha256: 'h', width: 1600, height: 1200 };

describe('AiRouter', () => {
  let handle: DbHandle;
  let now: number;
  let sleeps: number[];
  let gemini: FakeProvider;
  let groq: FakeProvider;
  let breaker: CircuitBreaker;
  let cooldowns: CooldownTracker;

  function makeRouter(options: { localOnly?: boolean; dailyCalls?: number } = {}): AiRouter {
    return new AiRouter({
      providers: { gemini, groq },
      routes: new RouteRepository(handle.db, 0),
      breaker,
      cooldowns,
      usage: new UsageLogger(handle.db),
      quota: new QuotaService(handle.db, { dailyCalls: options.dailyCalls ?? 1000, dailyTokens: 10_000_000, timezone: 'Europe/Istanbul' }),
      prompts: new PromptRepository(handle.db, 0),
      localOnly: options.localOnly ?? false,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      random: () => 0.5,
    });
  }

  async function usageRows() {
    const rows = await handle.db.select().from(usageLog).orderBy(usageLog.createdAt);
    return rows;
  }

  beforeAll(async () => {
    handle = await createTestDb();
    await seedDatabase(handle.db, {});
  });

  afterAll(async () => {
    await handle.close();
  });

  beforeEach(async () => {
    now = 1_000_000;
    sleeps = [];
    gemini = new FakeProvider('gemini', () => good, (texts, opts) => texts.map((t) => hashEmbedding(t, opts.dim)));
    groq = new FakeProvider('groq', () => good);
    breaker = new CircuitBreaker({ now: () => now });
    cooldowns = new CooldownTracker(() => now);
    await handle.db.execute(sql`delete from usage_log`);
  });

  it('serves the primary route and logs usage', async () => {
    const result = await makeRouter().generate({ task: 'text.item_enrich', schema, system: 's', user: 'u' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.meta.provider).toBe('groq'); // text.item_enrich primary = gpt-oss-120b
    expect(groq.calls[0]?.model).toBe(MODELS.groqGptOss120b);
    expect(groq.calls[0]?.params?.reasoningEffort).toBe('low');
    const rows = await usageRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ taskKey: 'text.item_enrich', provider: 'groq', success: true });
  });

  it('falls back when the primary returns 500 (after one same-provider retry)', async () => {
    groq.setResponder(() => ({ ok: false, kind: 'unavailable', status: 500 }));
    const result = await makeRouter().generate({ task: 'text.item_enrich', schema, system: 's', user: 'u' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.meta.provider).toBe('gemini');
    expect(groq.calls).toHaveLength(2);
    expect(result.attempts.map((a) => `${a.provider}:${a.outcome}`)).toEqual(['groq:unavailable', 'groq:unavailable', 'gemini:ok']);
    expect(sleeps).toHaveLength(1);
    expect((await usageRows()).map((r) => r.success)).toEqual([false, false, true]);
  });

  it('skips a provider whose key is missing', async () => {
    groq.configured = false;
    const result = await makeRouter().generate({ task: 'text.item_enrich', schema, system: 's', user: 'u' });
    expect(result.ok && result.meta.provider).toBe('gemini');
    expect(result.attempts[0]).toMatchObject({ provider: 'groq', outcome: 'skipped', reason: 'not_configured' });
    expect(groq.calls).toHaveLength(0);
  });

  it('reports a missing key as not_configured, not as an outage', async () => {
    gemini.configured = false;
    groq.configured = false;
    const router = makeRouter();
    const availability = await router.availability(undefined);
    expect(!availability.ok && availability.error.kind).toBe('not_configured');
    const result = await router.generate({ task: 'text.item_enrich', schema, system: 's', user: 'u' });
    expect(!result.ok && result.error.kind).toBe('not_configured');

    // Only the embed chain lacks a key: that task alone says not_configured.
    groq.configured = true;
    const embed = await makeRouter().embed(['adana']);
    expect(!embed.ok && embed.error.kind).toBe('not_configured');
    expect(gemini.calls.length + groq.calls.length).toBe(0);
  });

  it('retries a short 429 on the same provider and cools down on a long one', async () => {
    let n = 0;
    groq.setResponder(() => (n++ === 0 ? { ok: false, kind: 'rate_limited', retryAfterMs: 1200 } : good));
    const short = await makeRouter().generate({ task: 'text.item_enrich', schema, system: 's', user: 'u' });
    expect(short.ok && short.meta.provider).toBe('groq');
    expect(sleeps[0]).toBeGreaterThanOrEqual(1200);

    groq.setResponder(() => ({ ok: false, kind: 'rate_limited', retryAfterMs: 60_000 }));
    const long = await makeRouter().generate({ task: 'text.item_enrich', schema, system: 's', user: 'u' });
    expect(long.ok && long.meta.provider).toBe('gemini');
    expect(cooldowns.isCooling(`groq:${MODELS.groqGptOss120b}`)).toBe(true);

    const callsBefore = groq.calls.length;
    const next = await makeRouter().generate({ task: 'text.item_enrich', schema, system: 's', user: 'u' });
    expect(next.ok && next.meta.provider).toBe('gemini');
    expect(groq.calls.length).toBe(callsBefore);
    expect(next.attempts[0]).toMatchObject({ outcome: 'skipped', reason: 'cooling_down' });
  });

  it('opens the circuit after 3 consecutive failures and half-opens after 60 s', async () => {
    groq.setResponder(() => ({ ok: false, kind: 'timeout' }));
    const router = makeRouter();
    for (let i = 0; i < 3; i += 1) {
      const r = await router.generate({ task: 'text.item_enrich', schema, system: 's', user: 'u' });
      expect(r.ok && r.meta.provider).toBe('gemini');
    }
    expect(breaker.state('groq')).toBe('open');
    const calls = groq.calls.length;
    await router.generate({ task: 'text.item_enrich', schema, system: 's', user: 'u' });
    expect(groq.calls.length).toBe(calls); // skipped while open

    now += 60_001;
    groq.setResponder(() => good);
    const trial = await router.generate({ task: 'text.item_enrich', schema, system: 's', user: 'u' });
    expect(trial.ok && trial.meta.provider).toBe('groq');
    expect(breaker.state('groq')).toBe('closed');
  });

  it('a whole provider going down keeps vision working through the fallback chain', async () => {
    gemini.setResponder(() => ({ ok: false, kind: 'auth', status: 403 }));
    const result = await makeRouter().generate({ task: 'vision.menu_extract', schema, system: 's', user: 'u', images: [image] });
    expect(result.ok && result.meta.model).toBe(MODELS.groqQwen38);
    expect(breaker.state('gemini')).toBe('open');
  });

  it('returns invalid output to the caller without falling back', async () => {
    groq.setResponder(() => ({ ok: true, raw: '{"items": [' }));
    const result = await makeRouter().generate({ task: 'text.item_enrich', schema, system: 's', user: 'u' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_output');
      expect(result.error.raw).toBe('{"items": [');
      expect(result.route?.provider).toBe('groq');
    }
    expect(gemini.calls).toHaveLength(0);
  });

  it('repairs on the same route with generateOnRoute', async () => {
    const router = makeRouter();
    groq.setResponder(() => ({ ok: true, raw: 'not json' }));
    const first = await router.generate({ task: 'text.item_enrich', schema, system: 's', user: 'u' });
    expect(first.ok).toBe(false);
    if (first.ok || !first.route) throw new Error('expected a failed routed result');
    groq.setResponder(() => good);
    const repaired = await router.generateOnRoute({ task: 'text.item_enrich', schema, system: 's', user: 'u + fix' }, first.route);
    expect(repaired.ok).toBe(true);
    expect(groq.calls.at(-1)?.user).toBe('u + fix');
  });

  it('enforces the per-request budget, LOCAL_ONLY_MODE and the daily quota', async () => {
    const budget = new RequestBudget(1, 25_000);
    const router = makeRouter();
    expect((await router.generate({ task: 'text.item_enrich', schema, system: 's', user: 'u' }, { budget })).ok).toBe(true);
    const second = await router.generate({ task: 'text.item_enrich', schema, system: 's', user: 'u' }, { budget });
    expect(!second.ok && second.error.kind).toBe('budget_exceeded');

    const local = await makeRouter({ localOnly: true }).generate({ task: 'text.item_enrich', schema, system: 's', user: 'u' });
    expect(!local.ok && local.error.kind).toBe('local_only');

    const quota = await makeRouter({ dailyCalls: 1 }).generate({ task: 'text.item_enrich', schema, system: 's', user: 'u' });
    expect(!quota.ok && quota.error.kind).toBe('quota_exceeded');
  });

  it('never sends images to text-only models and renders JSON instructions for JSON-mode models', async () => {
    gemini.setResponder(() => ({ ok: false, kind: 'unavailable' }));
    const vision = await makeRouter().generate({ task: 'vision.menu_extract', schema, system: 's', user: 'u', images: [image] });
    expect(vision.ok && vision.meta.model).toBe(MODELS.groqQwen38);

    groq.setResponder((opts) => (opts.model === MODELS.groqQwen38 ? { ok: false, kind: 'bad_request' } : good));
    const viaQwen36 = await makeRouter().generate({ task: 'vision.menu_extract', schema, system: 's', user: 'u', images: [image] });
    expect(viaQwen36.ok && viaQwen36.meta.model).toBe(MODELS.groqQwen36);
    const qwen36Call = groq.calls.find((c) => c.model === MODELS.groqQwen36);
    expect(qwen36Call?.jsonInstructions).toContain('JSON');
  });

  it('embeds through the embed chain', async () => {
    const result = await makeRouter().embed(['adana', 'lahmacun']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.vectors).toHaveLength(2);
      expect(result.dim).toBe(768);
      expect(result.model).toBe(MODELS.geminiEmbedding);
    }
    gemini.configured = false;
    const missing = await makeRouter().embed(['x']);
    expect(missing.ok).toBe(false);
  });
});
