import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { CallPacer } from '../../src/ai/rate-limit.js';
import { suggestionRuns, usageLog, users } from '../../src/db/schema/index.js';
import { Slots } from '../../src/lib/slots.js';
import { LoadMonitor, type LoadSnapshot } from '../../src/modules/admin/load.js';
import type { CardDto } from '../../src/modules/analyze/schemas.js';
import { FakeProvider, hashEmbedding, type FakeResponder } from '../helpers/fake-provider.js';
import { fixtureResponder, loadFixtures, multipartBody, parseSse } from '../helpers/fixtures.js';
import { bearer, createTestApp, loginAs, type TestContext } from '../helpers/test-app.js';

/**
 * Many reps at once (D-214): one analysis slot and one place in the queue, a model that answers only when the test
 * lets it, and what the reps and the admin see while the site is full.
 */

let ctx: TestContext;
let admin: string;
let open: () => void = () => undefined;
let gate: Promise<void> = Promise.resolve();
let entered: () => void = () => undefined;
let firstCall: Promise<void> = Promise.resolve();

const gated = (fallback: FakeResponder): FakeResponder => async (request, call) => {
  entered();
  await gate;
  return fallback(request, call);
};

function closeGate(): void {
  gate = new Promise((resolve) => (open = resolve));
  firstCall = new Promise((resolve) => (entered = resolve));
}

async function send(text: string, address: string) {
  const body = multipartBody({ text }, []);
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/chat/messages', headers: body.headers, payload: body.payload, remoteAddress: address });
  const events = parseSse(res.body);
  const message = events.filter((e) => e.event === 'message').map((e) => e.data as { message: { text: string; result: { cards: CardDto[] } | null } })[0]?.message;
  const queue = events.filter((e) => e.event === 'progress' && (e.data as { agent: string }).agent === 'queue').map((e) => (e.data as { message: string }).message);
  const items = events.filter((e) => e.event === 'item').map((e) => (e.data as { card: CardDto }).card);
  return { status: res.statusCode, message, queue, items };
}

async function load(): Promise<LoadSnapshot> {
  const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/load', headers: bearer(admin) });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<LoadSnapshot>();
}

async function until(check: (load: LoadSnapshot) => boolean): Promise<LoadSnapshot> {
  for (let i = 0; i < 200; i += 1) {
    const current = await load();
    if (check(current)) return current;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('load never reached the expected state');
}

beforeAll(async () => {
  const fx = loadFixtures();
  const fallback = fixtureResponder(fx);
  const gemini = new FakeProvider('gemini', gated(fallback), (texts, opts) => texts.map((t) => hashEmbedding(t, opts.dim)));
  const groq = new FakeProvider('groq', gated(fallback));
  ctx = await createTestApp({ providers: { gemini, groq }, env: { ANALYSIS_CONCURRENCY: '1', ANALYSIS_QUEUE_MAX: '1' } });
  admin = (await loginAs(ctx)).accessToken;
});

afterAll(async () => {
  open();
  await ctx.close();
});

afterEach(() => open());

describe('a full site (D-214)', () => {
  it('queues the second analysis with its place, turns the third away kindly, and then answers both', async () => {
    closeGate();
    const first = send('Levrek Izgara, Çoban Salata, Ayran', '10.20.0.1');
    await firstCall;
    const second = send('Kıymalı Pide, Kaşarlı Pide, Çay', '10.20.0.2');
    const waiting = await until((l) => l.analyses.waiting === 1);
    expect(waiting.analyses).toMatchObject({ running: 1, waiting: 1, size: 1, queueMax: 1 });

    const third = await send('Mercimek Çorbası, Ezogelin Çorbası', '10.20.0.3');
    expect(third.status).toBe(200);
    expect(third.message?.text).toBe('Şu an çok yoğunuz. Bir dakika sonra tekrar gönderir misin?');
    expect(third.message?.result).toBeNull();
    // Turned away before anything ran: no third analysis was stored.
    const runs = await ctx.db.db.select({ prompt: suggestionRuns.promptText }).from(suggestionRuns);
    expect(runs.map((r) => r.prompt)).not.toContain('Mercimek Çorbası, Ezogelin Çorbası');

    open();
    const [a, b] = await Promise.all([first, second]);
    expect(a.queue).toEqual([]);
    expect(b.queue).toEqual(['Yoğunluk var: sıradaki analiz senin', 'Sıra geldi, menüye bakıyorum']);
    for (const answer of [a, b]) {
      expect(answer.status).toBe(200);
      expect(answer.message?.result?.cards.length ?? 0).toBeGreaterThan(0);
    }
    const after = await load();
    expect(after.analyses).toMatchObject({ running: 0, waiting: 0 });
    expect(after.analyses.waitP95Ms).toBeGreaterThanOrEqual(0);
    expect(after.lastQuarter.runs).toBeGreaterThanOrEqual(2);
  });

  it('stores a run’s cards in one write, in the order streamed, each with its own id', async () => {
    const answer = await send('Adana Kebap, Urfa Kebap, Lahmacun, Ayran', '10.20.0.4');
    expect(answer.items.length).toBeGreaterThan(10);
    expect(answer.items.map((c) => c.sortOrder)).toEqual(answer.items.map((_, i) => i));
    expect(new Set(answer.items.map((c) => c.id)).size).toBe(answer.items.length);
    // The answer's cards are the streamed ones, id for id.
    expect(answer.message?.result?.cards.map((c) => c.id)).toEqual(answer.items.map((c) => c.id));
  });

  it('shows the load only to the admin', async () => {
    const visitor = multipartBody({ text: 'Tost, Ayran' }, []);
    const first = await ctx.app.inject({ method: 'POST', url: '/api/v1/chat/messages', headers: visitor.headers, payload: visitor.payload, remoteAddress: '10.20.0.5' });
    const cookie = String(first.headers['set-cookie']).split(';')[0]!;
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/load', headers: { cookie } })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/load' })).statusCode).toBe(401);
  });
});

describe('load alerts (D-214)', () => {
  const silent = { warn: () => undefined } as unknown as FastifyBaseLogger;
  const sent: { body: string; priority: string }[] = [];
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    sent.push({ body: init.body as string, priority: (init.headers as Record<string, string>).Priority! });
    return new Response('ok');
  }) as unknown as typeof fetch;

  async function adminId(): Promise<string> {
    const [row] = await ctx.db.db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
    return row!.id;
  }

  it('sends one notice when analyses turn slow and one when they recover, not one a minute', async () => {
    sent.length = 0;
    await ctx.db.db.execute(sql`delete from suggestion_runs`);
    const userId = await adminId();
    await ctx.db.db.insert(suggestionRuns).values(Array.from({ length: 6 }, () => ({ userId, status: 'completed' as const, latencyMs: 25_000 })));
    const monitor = new LoadMonitor({ db: ctx.db.db, slots: new Slots(4, 4), pacer: new CallPacer(), siteQuota: () => ctx.ai.quota.site(), ntfyUrl: 'https://ntfy.test/topic', log: silent, fetch: fakeFetch });

    await monitor.check();
    await monitor.check();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ priority: 'high' });
    expect(sent[0]!.body).toContain('Analizler yavaşladı');
    expect(sent[0]!.body).toContain('25,0 sn');
    expect((await monitor.snapshot()).alerts.map((a) => a.key)).toEqual(['slow']);

    // Five slow runs are not a trend: below MIN_RUNS the alert is over.
    await ctx.db.db.execute(sql`delete from suggestion_runs`);
    await monitor.check();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({ body: 'Düzeldi: analizler yine normal sürede bitiyor.', priority: 'default' });
    monitor.stop();
  });

  it('counts only provider failures toward the failing alert, never calls we cut off ourselves', async () => {
    sent.length = 0;
    await ctx.db.db.execute(sql`delete from usage_log`);
    const row = (success: boolean, errorCode: string | null) => ({ taskKey: 'agent.recommend', provider: 'gemini', model: 'm', success, errorCode });
    // 20 calls: 6 overloaded (30%, not above it) and 4 aborted by our own deadline.
    await ctx.db.db.insert(usageLog).values([
      ...Array.from({ length: 10 }, () => row(true, null)),
      ...Array.from({ length: 6 }, () => row(false, 'unavailable')),
      ...Array.from({ length: 4 }, () => row(false, 'aborted')),
    ]);
    const monitor = new LoadMonitor({ db: ctx.db.db, slots: new Slots(4, 4), pacer: new CallPacer(), siteQuota: () => ctx.ai.quota.site(), ntfyUrl: 'https://ntfy.test/topic', log: silent, fetch: fakeFetch });
    await monitor.check();
    expect(sent).toHaveLength(0);
    expect((await monitor.snapshot()).lastQuarter).toMatchObject({ calls: 20, failed: 6 });

    await ctx.db.db.insert(usageLog).values(row(false, 'rate_limited'));
    await monitor.check();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toBe('Yapay zekâ çağrılarının %33\'i başarısız (son 15 dakika, 21 çağrı). Öneriler daha çok havuzdan geliyor.');
    monitor.stop();
  });

  it('calls the queue full only when analyses are still waiting at the next check', async () => {
    sent.length = 0;
    await ctx.db.db.execute(sql`delete from suggestion_runs`);
    await ctx.db.db.execute(sql`delete from usage_log`);
    const slots = new Slots(1, 5);
    let release: () => void = () => undefined;
    const running = slots.run(() => new Promise<void>((resolve) => (release = resolve)));
    const waiting = slots.run(() => Promise.resolve());
    const monitor = new LoadMonitor({ db: ctx.db.db, slots, pacer: new CallPacer(), siteQuota: () => ctx.ai.quota.site(), ntfyUrl: 'https://ntfy.test/topic', log: silent, fetch: fakeFetch });

    await monitor.check();
    expect(sent).toHaveLength(0);
    await monitor.check();
    expect(sent.map((s) => s.body)).toEqual(['Analiz kuyruğu dolu: 1 analiz çalışıyor, 1 analiz sırada.']);

    release();
    await Promise.all([running, waiting]);
    await monitor.check();
    expect(sent.map((s) => s.body).at(-1)).toBe('Düzeldi: analiz kuyruğu boşaldı.');
    monitor.stop();
  });

  it('warns once the site has used 80 % of its daily model ceiling, and again when the day turns (D-216)', async () => {
    sent.length = 0;
    await ctx.db.db.execute(sql`delete from suggestion_runs`);
    await ctx.db.db.execute(sql`delete from usage_log`);
    let today = { callsToday: 7_999, dailyCalls: 10_000 };
    const monitor = new LoadMonitor({
      db: ctx.db.db,
      slots: new Slots(4, 4),
      pacer: new CallPacer(),
      siteQuota: () => Promise.resolve(today),
      ntfyUrl: 'https://ntfy.test/topic',
      log: silent,
      fetch: fakeFetch,
    });
    await monitor.check();
    expect(sent).toHaveLength(0);
    today = { callsToday: 8_000, dailyCalls: 10_000 };
    await monitor.check();
    await monitor.check();
    expect(sent.map((s) => s.body)).toEqual([
      "Günlük yapay zekâ tavanının %80'i kullanıldı (8000/10000 çağrı). Dolarsa ekran görüntüleri gece yarısına kadar okunamaz; tavan GLOBAL_DAILY_LLM_CALL_QUOTA ile yükseltilir.",
    ]);
    expect((await monitor.snapshot()).quota).toEqual(today);
    today = { callsToday: 12, dailyCalls: 10_000 };
    await monitor.check();
    expect(sent.at(-1)).toEqual({ body: 'Düzeldi: günlük yapay zekâ kotası yenilendi.', priority: 'default' });
    monitor.stop();
  });

  it('stays silent without an ntfy address, and keeps counting', async () => {
    const calls: string[] = [];
    const monitor = new LoadMonitor({
      db: ctx.db.db,
      slots: new Slots(1, 1),
      pacer: new CallPacer(), siteQuota: () => ctx.ai.quota.site(),
      ntfyUrl: undefined,
      log: silent,
      fetch: (async (url: string) => {
        calls.push(url);
        return new Response('ok');
      }) as unknown as typeof fetch,
    });
    const userId = await adminId();
    await ctx.db.db.insert(suggestionRuns).values(Array.from({ length: 6 }, () => ({ userId, status: 'completed' as const, latencyMs: 30_000 })));
    await monitor.check();
    expect(calls).toEqual([]);
    expect((await monitor.snapshot()).alerts.map((a) => a.key)).toEqual(['slow']);
    monitor.stop();
  });
});
