import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { branches, cuisines, itemEmbeddings, menuItems, suggestionRuns, usageLog } from '../../src/db/schema/index.js';
import { SEED_TEMPLATES } from '../../src/db/seed/templates.js';
import { containsPriceAmount } from '../../src/lib/price-guard.js';
import type { CardDto, RunDto } from '../../src/modules/suggest/schemas.js';
import { FakeProvider, hashEmbedding, okJson } from '../helpers/fake-provider.js';
import {
  type Fixtures,
  fixtureImage,
  fixtureResponder,
  loadFixtures,
  multipartBody,
  parseSse,
} from '../helpers/fixtures.js';
import { type TestContext, bearer, createTestApp, loginAs } from '../helpers/test-app.js';

interface Harness {
  ctx: TestContext;
  token: string;
  gemini: FakeProvider;
  groq: FakeProvider;
  cuisineId: (slug: string) => Promise<string>;
}

async function harness(fx: Fixtures, env: Record<string, string> = {}, canonical?: Record<string, string>): Promise<Harness> {
  const gemini = new FakeProvider('gemini', fixtureResponder(fx, canonical ? { canonical } : {}), (texts, opts) =>
    texts.map((t) => hashEmbedding(t, opts.dim)),
  );
  const groq = new FakeProvider('groq', fixtureResponder(fx, canonical ? { canonical } : {}));
  const ctx = await createTestApp({ providers: { gemini, groq }, env });
  const token = (await loginAs(ctx)).accessToken;
  const cuisineId = async (slug: string) => {
    const [row] = await ctx.db.db.select({ id: cuisines.id }).from(cuisines).where(eq(cuisines.slug, slug));
    if (!row) throw new Error(`cuisine ${slug} missing`);
    return row.id;
  };
  return { ctx, token, gemini, groq, cuisineId };
}

async function usageCount(h: Harness): Promise<number> {
  const [row] = await h.ctx.db.db.select({ n: sql<number>`count(*)::int` }).from(usageLog);
  return row?.n ?? 0;
}

async function suggestJson(h: Harness, fields: Record<string, string>): Promise<RunDto> {
  const res = await h.ctx.app.inject({ method: 'POST', url: '/api/v1/suggest', headers: bearer(h.token), payload: fields });
  if (res.statusCode !== 200) throw new Error(`suggest failed ${res.statusCode}: ${res.body}`);
  return res.json<RunDto>();
}

async function suggestStream(
  h: Harness,
  fields: Record<string, string>,
  images: { file: string; fx: Fixtures }[],
  url = '/api/v1/suggest',
) {
  const body = multipartBody(
    fields,
    images.map(({ file, fx }) => {
      const image = fixtureImage(fx, file);
      return { name: 'images', filename: file, contentType: image.mimeType, data: image.data };
    }),
  );
  const res = await h.ctx.app.inject({
    method: 'POST',
    url,
    headers: { ...bearer(h.token), ...body.headers, accept: 'text/event-stream' },
    payload: body.payload,
  });
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-type']).toContain('text/event-stream');
  const events = parseSse(res.body);
  const cards = events.filter((e) => e.event === 'item').map((e) => (e.data as { card: CardDto }).card);
  return { events, cards, raw: res.body };
}

function resetResilience(h: Harness) {
  h.ctx.ai.breaker.reset();
  h.ctx.ai.cooldowns.reset();
  h.ctx.cache.clear();
  h.gemini.configured = true;
  h.groq.configured = true;
}

describe('/suggest end-to-end (recorded fixtures, fake providers)', () => {
  let fx: Fixtures;
  let h: Harness;

  beforeAll(async () => {
    fx = loadFixtures();
    h = await harness(fx);
  });

  afterAll(async () => {
    await h.ctx.close();
  });

  beforeEach(() => {
    resetResilience(h);
    h.gemini.setResponder(fixtureResponder(fx));
    h.groq.setResponder(fixtureResponder(fx));
  });

  it('answers all 40 seed templates with ZERO LLM calls (acceptance #3)', async () => {
    const before = await usageCount(h);
    const run = await suggestJson(h, {
      cuisineId: await h.cuisineId('kebap-izgara'),
      promptText: SEED_TEMPLATES.map((t) => t.payload.name).join('\n'),
    });
    expect(run.status).toBe('completed');
    expect(run.cards).toHaveLength(40);
    expect(run.cards.every((c) => c.origin === 'seed' && c.matchType === 'exact')).toBe(true);
    expect(run.llmCalls).toBe(0);
    expect(run.cacheHit).toBe(true);
    expect(await usageCount(h)).toBe(before);
    expect(h.gemini.calls.length + h.groq.calls.length).toBe(0);
  });

  it('resolves aliases and spelling variants without an LLM', async () => {
    const run = await suggestJson(h, {
      cuisineId: await h.cuisineId('kebap-izgara'),
      promptText: 'Adana Dürüm, Lahmajun, Çiğköfte dürüm, İSKENDER, kebap urfa',
    });
    expect(run.cards.map((c) => [c.payload.name, c.matchType])).toEqual([
      ['Adana Kebap', 'alias'],
      ['Lahmacun', 'exact'],
      ['Çiğ Köfte Dürüm', 'exact'],
      ['İskender Kebap', 'alias'],
      ['Urfa Kebap', 'trigram'],
    ]);
    expect(run.llmCalls).toBe(0);
  });

  it('streams a 15-item menu photo: DB cards first, then AI cards; no TL, ≤160 chars, sets_base fixed (#4 #7 #8)', async () => {
    const { events, cards, raw } = await suggestStream(h, { cuisineId: await h.cuisineId('kebap-izgara') }, [
      { file: 'menu-kebapci.jpg', fx },
    ]);
    expect(events[0]?.event).toBe('run');
    expect(events.at(-1)?.event).toBe('done');
    expect(events.some((e) => e.event === 'extracted')).toBe(true);
    expect(cards).toHaveLength(15);

    const seedCards = cards.filter((c) => c.origin === 'seed');
    const aiCards = cards.filter((c) => c.origin === 'ai');
    expect(seedCards).toHaveLength(12);
    expect(aiCards.map((c) => c.payload.name).sort()).toEqual(['Humus', 'Şalgam', 'İçli Köfte'].sort());
    const firstAi = cards.findIndex((c) => c.origin === 'ai');
    expect(cards.slice(0, firstAi).every((c) => c.origin === 'seed')).toBe(true);

    expect(containsPriceAmount(raw)).toBe(false);
    for (const card of cards) expect(card.payload.description.length).toBeLessThanOrEqual(160);
    const salgam = aiCards.find((c) => c.payload.name === 'Şalgam');
    expect(salgam?.payload.optionGroups.find((g) => g.name === 'Boy')?.options.every((o) => o.priceMode === 'sets_base')).toBe(true);
    const humus = aiCards.find((c) => c.payload.name === 'Humus');
    expect(humus?.payload.optionGroups[0]?.options.map((o) => o.name)).toEqual(['Küçük', 'Büyük']);

    const done = events.at(-1)?.data as { stats: { llmCalls: number; dbHits: number; aiItems: number; cacheHit: boolean } };
    // vision + canonicalize ("İçli Köfte" is a near miss of the "Köfte" alias) + one enrichment batch
    const tasks = [...h.gemini.calls, ...h.groq.calls].map((c) => c.task);
    expect(tasks.sort()).toEqual(['text.item_enrich', 'text.normalize_classify', 'vision.menu_extract']);
    expect(done.stats).toMatchObject({ llmCalls: 3, dbHits: 12, aiItems: 3, cacheHit: false });
    const drafts = await h.ctx.db.db.select().from(menuItems).where(eq(menuItems.approved, false));
    expect(drafts.map((d) => d.canonicalName).sort()).toEqual(['Humus', 'Şalgam', 'İçli Köfte'].sort());

    // Same photo again: extraction + enrichment caches → zero LLM calls.
    const again = await suggestStream(h, { cuisineId: await h.cuisineId('kebap-izgara') }, [{ file: 'menu-kebapci.jpg', fx }]);
    const againDone = again.events.at(-1)?.data as { stats: { llmCalls: number; cacheHit: boolean } };
    expect(againDone.stats).toMatchObject({ llmCalls: 0, cacheHit: true });
  });

  it('keeps working when a whole provider is down (fallback, #9)', async () => {
    h.gemini.setResponder(() => ({ ok: false, kind: 'unavailable', status: 503 }));
    const photo = await suggestStream(h, { cuisineId: await h.cuisineId('pide-lahmacun') }, [{ file: 'menu-pideci.jpg', fx }]);
    expect(photo.cards.length).toBeGreaterThanOrEqual(10);
    expect(photo.events.some((e) => e.event === 'warning' && (e.data as { code: string }).code === 'provider_fallback')).toBe(true);
    expect(h.groq.calls.some((c) => c.task === 'vision.menu_extract')).toBe(true);

    resetResilience(h);
    h.gemini.setResponder(fixtureResponder(fx));
    h.groq.configured = false; // key removed → enrichment falls back to Gemini
    const text = await suggestJson(h, { cuisineId: await h.cuisineId('tatli'), promptText: 'Kazandibi, Trileçe' });
    expect(text.cards.map((c) => c.origin)).toEqual(['ai', 'ai']);
    expect(h.gemini.calls.at(-1)?.task).toBe('text.item_enrich');
  });

  it('survives broken JSON: one repair, then needs_review (#10)', async () => {
    const broken = () => ({ ok: true as const, raw: '{"items": [ {"name": "Zıkkım"' });
    h.groq.setResponder((opts, call) => (opts.task === 'text.item_enrich' ? broken() : fixtureResponder(fx)(opts, call)));
    h.gemini.setResponder((opts, call) => (opts.task === 'text.item_enrich' ? broken() : fixtureResponder(fx)(opts, call)));
    const before = h.groq.calls.length;
    const run = await suggestJson(h, { cuisineId: await h.cuisineId('kebap-izgara'), promptText: 'Zıkkım Kebabı, Hünkar Beğendi' });
    expect(run.status).toBe('completed');
    expect(run.cards.map((c) => [c.origin, c.needsReview])).toEqual([
      ['review', true],
      ['review', true],
    ]);
    expect(run.cards[0]?.reviewReason).toContain('doğrulanamadı');
    expect(h.groq.calls.length - before).toBe(2); // first call + exactly one repair
  });

  it('marks unknown items (confidence < 0.5) as "bunu bilmiyorum"', async () => {
    const run = await suggestJson(h, { cuisineId: await h.cuisineId('kebap-izgara'), promptText: 'Ejder Dürümü' });
    expect(run.cards[0]).toMatchObject({ origin: 'review', needsReview: true, reviewReason: 'Bunu bilmiyorum, sen doldur.' });
  });

  it('accepting a card saves an approved template → the next query is a DB hit with cache_hit=true (#11)', async () => {
    const hunkar = {
      name: 'Hünkar Beğendi',
      description: 'Közlenmiş patlıcanlı beşamel beğendi üzerinde tereyağında pişmiş kuzu kuşbaşı; sıcak servis edilir.',
      serving_note: 'Sıcak servis; beğendi tabanı üzerinde et, kapaklı kapta.',
      portion_info: '1 porsiyon ~250 g',
      option_groups: [
        {
          name: 'Porsiyon',
          selection_type: 'single',
          is_required: true,
          min_select: 1,
          max_select: 1,
          options: [
            { name: '1 Porsiyon', price_mode: 'sets_base' },
            { name: '1,5 Porsiyon', price_mode: 'sets_base' },
          ],
        },
      ],
      removable_ingredients: ['Kaşar'],
      extra_ingredients: [],
      tags: ['kırmızı et'],
      allergen_notes: ['Süt ürünü'],
      upsell_suggestion: 'Yanına ayran önerilebilir.',
      confidence: 0.9,
    };
    h.groq.setResponder((opts, call) => (opts.task === 'text.item_enrich' ? okJson({ items: [hunkar] }) : fixtureResponder(fx)(opts, call)));
    const cuisineId = await h.cuisineId('ev-yemekleri');
    const first = await suggestJson(h, { cuisineId, promptText: 'Hünkar Beğendi' });
    const card = first.cards[0];
    expect(card?.origin).toBe('ai');

    const [branch] = await h.ctx.db.db
      .insert(branches)
      .values({ userId: (await h.ctx.db.db.query.users.findFirst())?.id ?? '', name: 'Test Şube', cuisineId })
      .returning();
    const accepted = await h.ctx.app.inject({
      method: 'POST',
      url: `/api/v1/suggestion-items/${card?.id}/accept`,
      headers: bearer(h.token),
      payload: { branchId: branch?.id },
    });
    expect(accepted.statusCode).toBe(200);
    const { templateId } = accepted.json<{ templateId: string }>();
    const [template] = await h.ctx.db.db.select().from(menuItems).where(eq(menuItems.id, templateId));
    expect(template).toMatchObject({ approved: true, source: 'ai' });
    const embeddings = await h.ctx.db.db.select().from(itemEmbeddings).where(eq(itemEmbeddings.menuItemId, templateId));
    expect(embeddings).toHaveLength(1);
    const [branchRow] = await h.ctx.db.db.select().from(branches).where(eq(branches.id, branch?.id ?? ''));
    expect(branchRow?.currentItemCount).toBe(1);

    const second = await suggestJson(h, { cuisineId, promptText: 'hünkar beğendi' });
    expect(second.cards[0]).toMatchObject({ origin: 'db', matchedTemplateId: templateId, matchType: 'exact' });
    expect(second.cacheHit).toBe(true);
    expect(second.llmCalls).toBe(0);
    const [runRow] = await h.ctx.db.db.select().from(suggestionRuns).where(eq(suggestionRuns.id, second.id));
    expect(runRow?.cacheHit).toBe(true);
  });

  it('accepting a seed card (even unedited) makes the template user-owned', async () => {
    const run = await suggestJson(h, { cuisineId: await h.cuisineId('kebap-izgara'), promptText: 'Beyti Sarma' });
    const res = await h.ctx.app.inject({
      method: 'POST',
      url: `/api/v1/suggestion-items/${run.cards[0]?.id}/accept`,
      headers: bearer(h.token),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const next = await suggestJson(h, { cuisineId: await h.cuisineId('kebap-izgara'), promptText: 'Beyti Sarma' });
    expect(next.cards[0]?.origin).toBe('db');
  });

  it('maps near misses with the cheap canonicalize step instead of enrichment', async () => {
    const canonical = { 'adana kebap porsiyonu': 'Adana Kebap' };
    h.gemini.setResponder(fixtureResponder(fx, { canonical }));
    h.groq.setResponder(fixtureResponder(fx, { canonical }));
    const run = await suggestJson(h, { cuisineId: await h.cuisineId('kebap-izgara'), promptText: 'Adana Kebap Porsiyonu' });
    expect(run.cards[0]).toMatchObject({ origin: 'seed', matchType: 'canonical' });
    expect(run.llmCalls).toBe(1);
    expect(h.gemini.calls.at(-1)?.task).toBe('text.normalize_classify');
  });

  it('serves snapshots and re-attaches to finished runs', async () => {
    const run = await suggestJson(h, { cuisineId: await h.cuisineId('kebap-izgara'), promptText: 'Adana, Lahmacun' });
    const snap = await h.ctx.app.inject({ method: 'GET', url: `/api/v1/suggest/${run.id}`, headers: bearer(h.token) });
    expect(snap.json<RunDto>().cards).toHaveLength(2);
    const events = await h.ctx.app.inject({ method: 'GET', url: `/api/v1/suggest/${run.id}/events`, headers: bearer(h.token) });
    const parsed = parseSse(events.body);
    expect(parsed.filter((e) => e.event === 'item')).toHaveLength(2);
    expect(parsed.at(-1)?.event).toBe('done');
  });

  it('can be cancelled while waiting on a provider', async () => {
    h.groq.setResponder(
      (opts) =>
        new Promise((resolve) => {
          opts.signal?.addEventListener('abort', () => resolve({ ok: false, kind: 'aborted' }), { once: true });
        }),
    );
    const started = await h.ctx.app.inject({
      method: 'POST',
      url: '/api/v1/suggest?async=1',
      headers: bearer(h.token),
      payload: { cuisineId: await h.cuisineId('kebap-izgara'), promptText: 'Yavaş Ürün' },
    });
    expect(started.statusCode).toBe(202);
    const { runId } = started.json<{ runId: string }>();
    for (let i = 0; i < 50 && h.groq.calls.every((c) => !c.user.includes('Yavaş Ürün')); i += 1) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const cancel = await h.ctx.app.inject({ method: 'POST', url: `/api/v1/suggest/${runId}/cancel`, headers: bearer(h.token) });
    expect(cancel.json()).toEqual({ cancelled: true });
    let status = 'running';
    for (let i = 0; i < 100 && status === 'running'; i += 1) {
      await new Promise((r) => setTimeout(r, 10));
      const snap = await h.ctx.app.inject({ method: 'GET', url: `/api/v1/suggest/${runId}`, headers: bearer(h.token) });
      status = snap.json<RunDto>().status;
    }
    expect(status).toBe('cancelled');
  });

  it('rejects empty requests and non-image uploads', async () => {
    const empty = await h.ctx.app.inject({
      method: 'POST',
      url: '/api/v1/suggest',
      headers: bearer(h.token),
      payload: { cuisineId: await h.cuisineId('kebap-izgara') },
    });
    expect(empty.statusCode).toBe(400);
    const body = multipartBody({ cuisineId: await h.cuisineId('kebap-izgara') }, [
      { name: 'images', filename: 'x.jpg', contentType: 'image/jpeg', data: Buffer.from('definitely not a jpeg') },
    ]);
    const bad = await h.ctx.app.inject({
      method: 'POST',
      url: '/api/v1/suggest',
      headers: { ...bearer(h.token), ...body.headers },
      payload: body.payload,
    });
    expect(bad.statusCode).toBe(415);
  });
});

describe('/suggest budget, continue and local-only mode', () => {
  let fx: Fixtures;

  beforeAll(() => {
    fx = loadFixtures();
  });

  it('stops at the per-request budget and finishes with "Devam et"', async () => {
    const h = await harness(fx, { REQUEST_MAX_LLM_CALLS: '2' });
    try {
      const images = ['menu-kebapci.jpg', 'menu-pideci.jpg', 'menu-tatli-kafe.jpg'].map((file) => ({ file, fx }));
      const first = await suggestStream(h, { cuisineId: await h.cuisineId('kebap-izgara') }, images);
      const exhausted = first.events.find((e) => e.event === 'budget_exhausted')?.data as {
        pendingItems: number;
        pendingImageHashes: string[];
      };
      expect(exhausted.pendingImageHashes).toHaveLength(1);
      expect(exhausted.pendingItems).toBeGreaterThan(0);
      const runId = (first.events[0]?.data as { runId: string }).runId;

      let snapshot = (await h.ctx.app.inject({ method: 'GET', url: `/api/v1/suggest/${runId}`, headers: bearer(h.token) })).json<RunDto>();
      expect(snapshot.status).toBe('partial');
      const cardsBefore = snapshot.cards.length;

      for (let i = 0; i < 8 && snapshot.status === 'partial'; i += 1) {
        const pendingFiles = images.filter(({ file }) => snapshot.pendingImageHashes.includes(fixtureImage(fx, file).sha256));
        await suggestStream(h, {}, pendingFiles, `/api/v1/suggest/${runId}/continue`);
        snapshot = (await h.ctx.app.inject({ method: 'GET', url: `/api/v1/suggest/${runId}`, headers: bearer(h.token) })).json<RunDto>();
      }
      expect(snapshot.status).toBe('completed');
      expect(snapshot.cards.length).toBeGreaterThan(cardsBefore);
      const orders = snapshot.cards.map((c) => c.sortOrder);
      expect(new Set(orders).size).toBe(orders.length);
    } finally {
      await h.ctx.close();
    }
  });

  it('LOCAL_ONLY_MODE answers only from the DB and never calls providers', async () => {
    const h = await harness(fx, { LOCAL_ONLY_MODE: 'true' });
    try {
      const run = await suggestJson(h, { cuisineId: await h.cuisineId('kebap-izgara'), promptText: 'Adana, Zıkkım Kebabı' });
      expect(run.cards.map((c) => c.origin)).toEqual(['seed', 'review']);
      expect(run.cards[1]?.reviewReason).toContain('Yerel mod');
      const photo = await suggestStream(h, { cuisineId: await h.cuisineId('kebap-izgara') }, [{ file: 'menu-kebapci.jpg', fx }]);
      expect(photo.cards).toHaveLength(0);
      expect(photo.events.some((e) => e.event === 'warning' && (e.data as { code: string }).code === 'images_skipped')).toBe(true);
      expect(h.gemini.calls.length + h.groq.calls.length).toBe(0);
    } finally {
      await h.ctx.close();
    }
  });

  it('without any AI key: DB cards + review cards that say so, no misleading "Devam et"', async () => {
    const h = await harness(fx);
    h.gemini.configured = false;
    h.groq.configured = false;
    try {
      const { events, cards } = await suggestStream(
        h,
        { cuisineId: await h.cuisineId('kebap-izgara'), promptText: 'Adana, Zıkkım Kebabı' },
        [{ file: 'menu-kebapci.jpg', fx }],
      );
      expect(cards.map((c) => c.origin)).toEqual(['seed', 'review']);
      expect(cards[1]?.reviewReason).toContain('AI anahtarı tanımlı değil');
      const codes = events.filter((e) => e.event === 'warning').map((e) => (e.data as { code: string }).code);
      expect(codes).toEqual(expect.arrayContaining(['not_configured', 'images_skipped']));
      expect(events.some((e) => e.event === 'budget_exhausted')).toBe(false);
      expect(h.gemini.calls.length + h.groq.calls.length).toBe(0);
      const done = events.find((e) => e.event === 'done')?.data as { status: string };
      expect(done.status).toBe('completed');
    } finally {
      await h.ctx.close();
    }
  });
});
