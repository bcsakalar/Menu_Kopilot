import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { RequestBudget } from '../../src/ai/budget.js';
import { CircuitBreaker } from '../../src/ai/circuit-breaker.js';
import { PromptRepository } from '../../src/ai/prompt-repository.js';
import { CallPacer, CooldownTracker } from '../../src/ai/rate-limit.js';
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

  function makeRouter(options: { localOnly?: boolean; dailyCalls?: number; pacer?: CallPacer } = {}): AiRouter {
    return new AiRouter({
      providers: { gemini, groq },
      routes: new RouteRepository(handle.db, 0),
      breaker,
      cooldowns,
      ...(options.pacer ? { pacer: options.pacer } : {}),
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
    // These tests exercise the routing itself: a chain that starts on Groq and falls back to Gemini.
    await handle.db.execute(sql`update provider_configs set priority = case model when 'openai/gpt-oss-120b' then 0 when 'gemini-3.5-flash-lite' then 1 else 2 end where task_key = 'agent.recommend'`);
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
    const result = await makeRouter().generate({ task: 'agent.recommend', schema, system: 's', user: 'u' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.meta.provider).toBe('groq'); // text.item_enrich primary = gpt-oss-120b
    expect(groq.calls[0]?.model).toBe(MODELS.groqGptOss120b);
    expect(groq.calls[0]?.params?.reasoningEffort).toBe('low');
    const rows = await usageRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ taskKey: 'agent.recommend', provider: 'groq', success: true });
  });

  it('falls back when the primary returns 500 (after one same-provider retry)', async () => {
    groq.setResponder(() => ({ ok: false, kind: 'unavailable', status: 500 }));
    const result = await makeRouter().generate({ task: 'agent.recommend', schema, system: 's', user: 'u' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.meta.provider).toBe('gemini');
    expect(groq.calls).toHaveLength(2);
    expect(result.attempts.map((a) => `${a.provider}:${a.outcome}`)).toEqual(['groq:unavailable', 'groq:unavailable', 'gemini:ok']);
    expect(sleeps).toHaveLength(1);
    expect((await usageRows()).map((r) => r.success)).toEqual([false, false, true]);
  });

  it('skips a provider whose key is missing', async () => {
    groq.configured = false;
    const result = await makeRouter().generate({ task: 'agent.recommend', schema, system: 's', user: 'u' });
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
    const result = await router.generate({ task: 'agent.recommend', schema, system: 's', user: 'u' });
    expect(!result.ok && result.error.kind).toBe('not_configured');

    // Only the embed chain lacks a key: that task alone says not_configured.
    groq.configured = true;
    const embed = await makeRouter().embed(['adana']);
    expect(!embed.ok && embed.error.kind).toBe('not_configured');
    expect(gemini.calls.length + groq.calls.length).toBe(0);
  });

  it('starts parallel batches on different providers and still falls back through the whole chain', async () => {
    // The recommend chain is groq (primary) then two gemini routes. Batch 1 starts one step further down, so two
    // calls in flight do not spend the same provider's per-minute allowance — that is what made a full-mode run
    // come back with half its batches rate-limited.
    const router = makeRouter();
    const first = await router.generate({ task: 'agent.recommend', schema, system: 's', user: 'u' });
    const second = await router.generate({ task: 'agent.recommend', schema, system: 's', user: 'u', routeOffset: 1 });
    expect(first.ok && first.meta.provider).toBe('groq');
    expect(second.ok && second.meta.provider).toBe('gemini');

    // A rotated call that fails still walks the rest of the chain, wrapping back to the primary.
    gemini.setResponder(() => ({ ok: false, kind: 'unavailable' }));
    const third = await router.generate({ task: 'agent.recommend', schema, system: 's', user: 'u', routeOffset: 1 });
    expect(third.ok && third.meta.provider).toBe('groq');
  });

  it('retries a short 429 on the same provider and cools down on a long one', async () => {
    let n = 0;
    groq.setResponder(() => (n++ === 0 ? { ok: false, kind: 'rate_limited', retryAfterMs: 1200 } : good));
    const short = await makeRouter().generate({ task: 'agent.recommend', schema, system: 's', user: 'u' });
    expect(short.ok && short.meta.provider).toBe('groq');
    expect(sleeps[0]).toBeGreaterThanOrEqual(1200);

    groq.setResponder(() => ({ ok: false, kind: 'rate_limited', retryAfterMs: 60_000 }));
    const long = await makeRouter().generate({ task: 'agent.recommend', schema, system: 's', user: 'u' });
    expect(long.ok && long.meta.provider).toBe('gemini');
    expect(cooldowns.isCooling(`groq:${MODELS.groqGptOss120b}`)).toBe(true);

    const callsBefore = groq.calls.length;
    const next = await makeRouter().generate({ task: 'agent.recommend', schema, system: 's', user: 'u' });
    expect(next.ok && next.meta.provider).toBe('gemini');
    expect(groq.calls.length).toBe(callsBefore);
    expect(next.attempts[0]).toMatchObject({ outcome: 'skipped', reason: 'cooling_down' });
  });

  it('skips a model at the per-minute ceiling its 429 showed, and uses it again a minute later (D-214)', async () => {
    const pacer = new CallPacer(() => now);
    const router = makeRouter({ pacer });
    const ask = () => router.generate({ task: 'agent.recommend', schema, system: 's', user: 'u' });
    let n = 0;
    // Groq takes three calls in the minute; the fourth is a 429 with a short wait, and its retry goes through.
    groq.setResponder(() => (++n === 4 ? { ok: false, kind: 'rate_limited', retryAfterMs: 1000 } : good));
    for (let i = 0; i < 4; i += 1) {
      const result = await ask();
      expect(result.ok && result.meta.provider).toBe('groq');
    }
    expect(pacer.snapshot()[`groq:${MODELS.groqGptOss120b}`]).toEqual({ inLastMinute: 5, ceiling: 3 });

    const groqCalls = groq.calls.length;
    const paced = await ask();
    expect(paced.ok && paced.meta.provider).toBe('gemini');
    expect(paced.attempts[0]).toMatchObject({ provider: 'groq', outcome: 'skipped', reason: 'paced' });
    expect(groq.calls.length).toBe(groqCalls);

    now += 61_000;
    const again = await ask();
    expect(again.ok && again.meta.provider).toBe('groq');
  });

  it('opens the circuit after 3 consecutive failures and half-opens after 60 s', async () => {
    groq.setResponder(() => ({ ok: false, kind: 'timeout' }));
    const router = makeRouter();
    for (let i = 0; i < 3; i += 1) {
      const r = await router.generate({ task: 'agent.recommend', schema, system: 's', user: 'u' });
      expect(r.ok && r.meta.provider).toBe('gemini');
    }
    expect(breaker.state('groq')).toBe('open');
    const calls = groq.calls.length;
    await router.generate({ task: 'agent.recommend', schema, system: 's', user: 'u' });
    expect(groq.calls.length).toBe(calls); // skipped while open

    now += 60_001;
    groq.setResponder(() => good);
    const trial = await router.generate({ task: 'agent.recommend', schema, system: 's', user: 'u' });
    expect(trial.ok && trial.meta.provider).toBe('groq');
    expect(breaker.state('groq')).toBe('closed');
  });

  it('a whole provider going down keeps vision working through the fallback chain', async () => {
    gemini.setResponder(() => ({ ok: false, kind: 'auth', status: 403 }));
    const result = await makeRouter().generate({ task: 'agent.extract', schema, system: 's', user: 'u', images: [image] });
    expect(result.ok && result.meta.model).toBe(MODELS.groqQwen38);
    expect(breaker.state('gemini')).toBe('open');
  });

  it('returns invalid output to the caller without falling back', async () => {
    groq.setResponder(() => ({ ok: true, raw: '{"items": [' }));
    const result = await makeRouter().generate({ task: 'agent.recommend', schema, system: 's', user: 'u' });
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
    const first = await router.generate({ task: 'agent.recommend', schema, system: 's', user: 'u' });
    expect(first.ok).toBe(false);
    if (first.ok || !first.route) throw new Error('expected a failed routed result');
    groq.setResponder(() => good);
    const repaired = await router.generateOnRoute({ task: 'agent.recommend', schema, system: 's', user: 'u + fix' }, first.route);
    expect(repaired.ok).toBe(true);
    expect(groq.calls.at(-1)?.user).toBe('u + fix');
  });

  it('enforces the per-request budget, LOCAL_ONLY_MODE and the daily quota', async () => {
    const budget = new RequestBudget(1, 25_000);
    const router = makeRouter();
    expect((await router.generate({ task: 'agent.recommend', schema, system: 's', user: 'u' }, { budget })).ok).toBe(true);
    const second = await router.generate({ task: 'agent.recommend', schema, system: 's', user: 'u' }, { budget });
    expect(!second.ok && second.error.kind).toBe('budget_exceeded');

    const local = await makeRouter({ localOnly: true }).generate({ task: 'agent.recommend', schema, system: 's', user: 'u' });
    expect(!local.ok && local.error.kind).toBe('local_only');

    const quota = await makeRouter({ dailyCalls: 1 }).generate({ task: 'agent.recommend', schema, system: 's', user: 'u' });
    expect(!quota.ok && quota.error.kind).toBe('quota_exceeded');
  });

  it('never sends images to text-only models, and needs no JSON instructions for schema-enforcing models', async () => {
    gemini.setResponder(() => ({ ok: false, kind: 'unavailable' }));
    const vision = await makeRouter().generate({ task: 'agent.extract', schema, system: 's', user: 'u', images: [image] });
    expect(vision.ok && vision.meta.model).toBe(MODELS.groqQwen38);
    expect(groq.calls.find((c) => c.model === MODELS.groqQwen38)?.jsonInstructions).toBeUndefined();
  });

  it('moves on when Groq rejects a request larger than the free per-minute token limit', async () => {
    gemini.setResponder((opts) => (opts.model === MODELS.geminiFlashLite ? { ok: false, kind: 'unavailable' } : good));
    groq.setResponder(() => ({ ok: false, kind: 'bad_request', status: 413 }));
    const result = await makeRouter().generate({ task: 'agent.extract', schema, system: 's', user: 'u', images: [image] });
    expect(result.ok && result.meta.model).toBe(MODELS.geminiFlash);
    expect(result.attempts.map((a) => a.model)).toEqual([MODELS.geminiFlashLite, MODELS.geminiFlashLite, MODELS.groqQwen38, MODELS.geminiFlash]);
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
