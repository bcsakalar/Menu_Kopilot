import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { cuisineCategories, cuisines, menuCategories, menuItems, agentSteps } from '../../src/db/schema/index.js';
import { FakeProvider, hashEmbedding } from '../helpers/fake-provider.js';
import { bearer, createTestApp, loginAs, type TestContext } from '../helpers/test-app.js';
import { fixtureImage, fixtureResponder, loadFixtures, multipartBody, parseSse, type Fixtures } from '../helpers/fixtures.js';
import type { AnalyzeResult, CardDto } from '../../src/modules/analyze/schemas.js';

/**
 * End-to-end coverage of the agent pipeline through `POST /api/v1/analyze`.
 * Providers are fakes driven by the recorded fixtures, so these assertions are about the pipeline's own rules:
 * three sections, no duplicate of a product already on the menu, category-aware recommendations, a trace per run.
 */

let ctx: TestContext;
let token: string;
let fx: Fixtures;
let cuisineIdBySlug: Map<string, string>;

async function startApp(responder = fixtureResponder(fx)) {
  const gemini = new FakeProvider('gemini', responder, (texts, opts) => texts.map((t) => hashEmbedding(t, opts.dim)));
  const groq = new FakeProvider('groq', responder);
  return createTestApp({ providers: { gemini, groq } });
}

async function analyze(fields: Record<string, string>, files: { file: string }[] = []): Promise<AnalyzeResult> {
  const body = multipartBody(
    fields,
    files.map((f) => {
      const image = fixtureImage(fx, f.file);
      return { name: 'images', filename: f.file, contentType: image.mimeType, data: Buffer.from(image.data) };
    }),
  );
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/analyze',
    headers: { ...bearer(token), ...body.headers },
    payload: body.payload,
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<AnalyzeResult>();
}

const bySection = (result: AnalyzeResult, section: CardDto['section']): CardDto[] =>
  result.cards.filter((c) => c.section === section);

beforeAll(async () => {
  fx = loadFixtures();
  ctx = await startApp();
  token = (await loginAs(ctx)).accessToken;
  const rows = await ctx.db.db.select({ id: cuisines.id, slug: cuisines.slug }).from(cuisines);
  cuisineIdBySlug = new Map(rows.map((r) => [r.slug, r.id]));
});

afterAll(async () => {
  await ctx.close();
});

describe('category taxonomy seed', () => {
  it('stores the categories and the per-cuisine expectations in Postgres, not in code', async () => {
    const categories = await ctx.db.db.select().from(menuCategories);
    expect(categories.length).toBeGreaterThanOrEqual(8);
    expect(categories.find((c) => c.key === 'icecek')?.keywords).toContain('ayran');

    const pideci = cuisineIdBySlug.get('pide-lahmacun');
    expect(pideci).toBeDefined();
    const expectations = await ctx.db.db
      .select()
      .from(cuisineCategories)
      .where(eq(cuisineCategories.cuisineId, pideci!));
    expect(expectations.map((e) => e.categoryKey).sort()).toEqual(['ana-yemek', 'corba', 'icecek', 'salata-meze', 'tatli']);
    // A drinks target of 2 is what makes a pide-only menu report an open drinks category.
    expect(expectations.find((e) => e.categoryKey === 'icecek')?.minItems).toBe(2);
  });
});

describe('POST /analyze — typed menu', () => {
  it('splits results into the three sections and never repeats a product already on the menu', async () => {
    const result = await analyze({
      cuisineId: cuisineIdBySlug.get('pide-lahmacun')!,
      menuText: 'Kıymalı Pide, Kaşarlı Pide, Kuşbaşılı Pide, Karışık Pide, Sucuklu Yumurtalı Pide',
    });

    expect(result.status).toBe('completed');
    expect(result.menu).toHaveLength(5);
    expect(result.counts).not.toBeNull();
    expect(result.counts!.current).toBe(5);
    expect(result.counts!.target).toBe(10);
    expect(result.counts!.hardMinimum).toBe(10);

    const onMenu = new Set(result.menu.map((m) => m.normalized));
    const newProducts = bySection(result, 'new_product');
    expect(newProducts.length).toBeGreaterThan(0);
    for (const card of newProducts) {
      expect(onMenu.has(card.name.toLocaleLowerCase('tr-TR'))).toBe(false);
      expect(card.categoryKey).not.toBeNull();
      expect(card.reason.length).toBeGreaterThan(0);
    }
    // Every card carries its section, so the screen needs no client-side guessing.
    for (const card of result.cards) expect(['new_product', 'option', 'fix']).toContain(card.section);
  });

  it('fills the OPEN categories instead of piling more of what the menu already has', async () => {
    const result = await analyze({
      cuisineId: cuisineIdBySlug.get('pide-lahmacun')!,
      menuText: 'Kıymalı Pide, Kaşarlı Pide, Kuşbaşılı Pide, Karışık Pide, Sucuklu Yumurtalı Pide',
    });
    const counts = result.counts!;
    const gaps = new Map(counts.categories.map((c) => [c.key, c]));
    // A pide-only menu is two drinks short and, at 5 of an expected 6, one main course short.
    expect(gaps.get('icecek')?.missing).toBe(2);
    expect(gaps.get('ana-yemek')?.missing).toBe(1);

    const newProducts = bySection(result, 'new_product');
    const perCategory = new Map<string, number>();
    for (const card of newProducts) {
      expect(card.categoryKey).not.toBeNull();
      perCategory.set(card.categoryKey!, (perCategory.get(card.categoryKey!) ?? 0) + 1);
    }
    // The old recommender answered this menu with six more pides. The rule that stops it: no category ever gets
    // more recommendations than it is actually short of.
    for (const [key, count] of perCategory) {
      expect(count, `${key} önerileri açığını aşmamalı`).toBeLessThanOrEqual(gaps.get(key)?.missing ?? 0);
    }
    // And the emptiest category is the one that actually gets filled.
    expect(perCategory.get('icecek') ?? 0).toBeGreaterThan(0);
  });

  it('counts the products of a photo and typed products together, without double counting', async () => {
    const result = await analyze(
      {
        cuisineId: cuisineIdBySlug.get('pide-lahmacun')!,
        // "Ayran" is also on the photo: it must be counted once.
        menuText: 'Ayran, Mercimek Çorbası',
      },
      [{ file: 'menu-pideci.jpg' }],
    );
    const names = result.menu.map((m) => m.normalized);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((n) => n === 'ayran')).toHaveLength(1);
    expect(result.menu.find((m) => m.normalized === 'mercimek corba')?.typed).toBe(true);
  });
});

describe('POST /analyze — panel screenshots', () => {
  it('merges overlapping screenshots and raises option cards for products with an empty option field', async () => {
    const result = await analyze({ cuisineId: cuisineIdBySlug.get('kebap-izgara')! }, [
      { file: 'panel-1.png' },
      { file: 'panel-2.png' },
    ]);

    // panel-1 and panel-2 overlap on Kıymalı Pide / Karışık Pide / Ayran, and one name is clipped.
    const names = result.menu.map((m) => m.normalized);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('karisik pide');

    const optionCards = bySection(result, 'option');
    const onMenu = new Set(names);
    expect(optionCards.length).toBeGreaterThan(0);
    for (const card of optionCards) {
      expect(card.targetName).not.toBeNull();
      // `targetNormalized` is the join key: the display name is the canonical one ("Tel Kadayıf") while the menu
      // row is keyed by the normalized raw name ("kadayif"), so matching on the name alone would miss.
      expect(card.targetNormalized).not.toBeNull();
      expect(onMenu.has(card.targetNormalized!)).toBe(true);
      expect(card.optionGroups.length + card.removableIngredients.length).toBeGreaterThan(0);
    }
  });

  it('gives every option and fix card a join key that resolves to a row of the menu', async () => {
    const result = await analyze({ cuisineId: cuisineIdBySlug.get('kebap-izgara')! }, [{ file: 'panel-1.png' }]);
    const onMenu = new Set(result.menu.map((m) => m.normalized));
    const attached = result.cards.filter((c) => c.section !== 'new_product');
    expect(attached.length).toBeGreaterThan(0);
    for (const card of attached) {
      expect(card.targetNormalized, card.name).not.toBeNull();
      expect(onMenu.has(card.targetNormalized!), `${card.name} → ${card.targetNormalized ?? 'null'}`).toBe(true);
    }
    // A new-product card is about nothing on the menu, so it carries no key.
    for (const card of bySection(result, 'new_product')) expect(card.targetNormalized).toBeNull();
  });

  it('raises a fix card for a product whose description field is empty on the panel', async () => {
    const result = await analyze({ cuisineId: cuisineIdBySlug.get('kebap-izgara')! }, [{ file: 'panel-1.png' }]);
    const fixes = bySection(result, 'fix');
    expect(fixes.length).toBeGreaterThan(0);
    // "Tavuk Şiş" and "Lahmacun" have an empty description in panel-1.
    expect(fixes.some((f) => f.fixKind === 'empty_description' || f.fixKind === 'bad_name')).toBe(true);
    for (const fix of fixes) expect(fix.targetName).not.toBeNull();
  });
});

describe('POST /analyze — re-run with another cuisine', () => {
  it('reuses the product list of the earlier run: no image is read again, the evidence carries over', async () => {
    const first = await analyze({ cuisineId: cuisineIdBySlug.get('kebap-izgara')! }, [{ file: 'panel-1.png' }]);
    expect(bySection(first, 'fix').length).toBeGreaterThan(0);

    const second = await analyze({ cuisineId: cuisineIdBySlug.get('pide-lahmacun')!, fromRunId: first.runId });
    expect(second.runId).not.toBe(first.runId);
    // Same menu, measured against the other cuisine.
    expect(second.menu.map((m) => m.normalized).sort()).toEqual(first.menu.map((m) => m.normalized).sort());
    expect(second.counts?.cuisineId).toBe(cuisineIdBySlug.get('pide-lahmacun'));
    expect(second.stats?.imagesRead).toBe(0);
    // The empty descriptions the first run read are still known, so section C is not lost.
    expect(bySection(second, 'fix').map((f) => f.targetNormalized).sort()).toEqual(
      bySection(first, 'fix').map((f) => f.targetNormalized).sort(),
    );

    const trace = await ctx.app.inject({ method: 'GET', url: `/api/v1/analyze/${second.runId}/trace`, headers: bearer(token) });
    const extractor = trace.json<{ steps: { agent: string; status: string }[] }>().steps.find((s) => s.agent === 'extractor');
    expect(extractor?.status).toBe('skipped');
  });

  it('refuses a run it cannot reuse', async () => {
    const body = multipartBody({ fromRunId: '00000000-0000-4000-8000-000000000000' }, []);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/analyze',
      headers: { ...bearer(token), ...body.headers },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('agent trace', () => {
  it('records one step per agent, with timings and model, and serves it to the debug screen', async () => {
    const result = await analyze({
      cuisineId: cuisineIdBySlug.get('pide-lahmacun')!,
      menuText: 'Kıymalı Pide, Kaşarlı Pide',
      debug: 'true',
    });

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/analyze/${result.runId}/trace`,
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    const trace = res.json<{ steps: { agent: string; status: string; durationMs: number; input: unknown }[]; totals: { llmCalls: number } }>();

    const agents = trace.steps.map((s) => s.agent);
    expect(agents).toContain('extractor');
    expect(agents).toContain('gap_analyst');
    expect(agents).toContain('product_recommender');
    expect(agents).toContain('validator');
    for (const step of trace.steps) expect(step.durationMs).toBeGreaterThanOrEqual(0);
    // debug=true stores the payloads so the step can be inspected on the phone.
    expect(trace.steps.some((s) => s.input !== null)).toBe(true);

    const rows = await ctx.db.db.select().from(agentSteps).where(eq(agentSteps.runId, result.runId));
    expect(rows.length).toBe(trace.steps.length);
  });

  it('keeps payloads out of the trace unless debug was requested', async () => {
    const result = await analyze({ cuisineId: cuisineIdBySlug.get('pide-lahmacun')!, menuText: 'Kıymalı Pide' });
    const rows = await ctx.db.db.select().from(agentSteps).where(eq(agentSteps.runId, result.runId));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.input === null && r.output === null)).toBe(true);
  });
});

describe('SSE stream', () => {
  it('sends counts before the cards, so the number is on screen first', async () => {
    const body = multipartBody({ cuisineId: cuisineIdBySlug.get('pide-lahmacun')!, menuText: 'Kıymalı Pide, Kaşarlı Pide' }, []);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/analyze',
      headers: { ...bearer(token), ...body.headers, accept: 'text/event-stream' },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(200);
    const events = parseSse(res.body).map((m) => m.event);
    expect(events[0]).toBe('run');
    expect(events).toContain('counts');
    expect(events.at(-1)).toBe('done');
    expect(events.indexOf('counts')).toBeLessThan(events.indexOf('item'));
  });
});

describe('accept', () => {
  it('writes an accepted new product into the template pool with its category', async () => {
    const result = await analyze({
      cuisineId: cuisineIdBySlug.get('pide-lahmacun')!,
      menuText: 'Kıymalı Pide, Kaşarlı Pide, Kuşbaşılı Pide',
    });
    const card = bySection(result, 'new_product')[0];
    expect(card).toBeDefined();

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/suggestion-items/${card!.id}/accept`,
      headers: bearer(token),
      payload: {},
    });
    expect(res.statusCode, res.body).toBe(200);
    const accepted = res.json<CardDto>();
    expect(accepted.status).toBe('accepted');
    expect(accepted.matchedTemplateId).not.toBeNull();

    const [template] = await ctx.db.db.select().from(menuItems).where(eq(menuItems.id, accepted.matchedTemplateId!));
    expect(template?.approved).toBe(true);
    expect(template?.categoryKey).toBe(card!.categoryKey);
  });
});

describe('degraded modes', () => {
  it('answers from the template pool alone when no provider key is configured', async () => {
    const local = await createTestApp({ env: { LOCAL_ONLY_MODE: 'true' } });
    try {
      const localToken = (await loginAs(local)).accessToken;
      const rows = await local.db.db.select({ id: cuisines.id, slug: cuisines.slug }).from(cuisines);
      const cuisineId = rows.find((r) => r.slug === 'pide-lahmacun')!.id;
      const body = multipartBody({ cuisineId, menuText: 'Kıymalı Pide, Kaşarlı Pide' }, []);
      const res = await local.app.inject({
        method: 'POST',
        url: '/api/v1/analyze',
        headers: { ...bearer(localToken), ...body.headers },
        payload: body.payload,
      });
      expect(res.statusCode, res.body).toBe(200);
      const result = res.json<AnalyzeResult>();
      expect(result.stats?.llmCalls).toBe(0);
      // The DB path still knows what a pide place is missing.
      expect(result.cards.some((c) => c.section === 'new_product')).toBe(true);
    } finally {
      await local.close();
    }
  });

  it('keeps the run alive and reports a partial result when one image cannot be read', async () => {
    const failing = await startApp((opts, call) => {
      if (opts.task === 'agent.extract' && call === 0) return { ok: false, kind: 'unavailable', message: 'boom' };
      return fixtureResponder(fx)(opts, call);
    });
    try {
      const failingToken = (await loginAs(failing)).accessToken;
      const rows = await failing.db.db.select({ id: cuisines.id, slug: cuisines.slug }).from(cuisines);
      const cuisineId = rows.find((r) => r.slug === 'pide-lahmacun')!.id;
      const image = fixtureImage(fx, 'menu-pideci.jpg');
      const body = multipartBody({ cuisineId, menuText: 'Ayran' }, [
        { name: 'images', filename: 'menu-pideci.jpg', contentType: image.mimeType, data: Buffer.from(image.data) },
      ]);
      const res = await failing.app.inject({
        method: 'POST',
        url: '/api/v1/analyze',
        headers: { ...bearer(failingToken), ...body.headers },
        payload: body.payload,
      });
      expect(res.statusCode, res.body).toBe(200);
      const result = res.json<AnalyzeResult>();
      expect(['partial', 'completed']).toContain(result.status);
      // The typed product survived the failed image.
      expect(result.menu.some((m) => m.normalized === 'ayran')).toBe(true);
    } finally {
      await failing.close();
    }
  });
});
