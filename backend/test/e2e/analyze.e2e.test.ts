import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { cuisineCategories, cuisines, menuCategories, menuItems, agentSteps } from '../../src/db/schema/index.js';
import { FakeProvider, hashEmbedding } from '../helpers/fake-provider.js';
import { bearer, createTestApp, loginAs, type TestContext } from '../helpers/test-app.js';
import { fixtureImage, fixtureResponder, loadFixtures, multipartBody, parseSse, type Fixtures } from '../helpers/fixtures.js';
import type { AnalyzeResult, CardDto } from '../../src/modules/analyze/schemas.js';
import { CUISINE_TARGETS } from '../../src/db/seed/cuisine-targets.js';

/** Words the way the panel counts them: 6–8 per description (D-178). */
const words = (text: string): number => text.split(/\s+/u).filter((w) => /\p{L}/u.test(w)).length;

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
    // The realistic opening target of the cuisine (D-177), never below the 10-product rule.
    expect(result.counts!.target).toBe(CUISINE_TARGETS['pide-lahmacun'].target);
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

  it('quick mode: a handful of suggestions spread over the categories, never a second pide', async () => {
    const result = await analyze({
      cuisineId: cuisineIdBySlug.get('pide-lahmacun')!,
      mode: 'quick',
      menuText: 'Kıymalı Pide, Kaşarlı Pide, Kuşbaşılı Pide, Karışık Pide, Sucuklu Yumurtalı Pide',
    });
    const counts = result.counts!;
    const gaps = new Map(counts.categories.map((c) => [c.key, c]));
    // A pide-only menu is two drinks short and, at 5 of an expected 6, one main course short.
    expect(gaps.get('icecek')?.missing).toBe(2);
    expect(gaps.get('ana-yemek')?.missing).toBe(1);

    const perCategory = new Map<string, number>();
    const alternatives = bySection(result, 'new_product').filter((card) => card.basedOn !== null);
    for (const card of bySection(result, 'new_product')) {
      expect(card.categoryKey).not.toBeNull();
      // D-198: the alternatives are built on the menu's own products and counted apart from the category spread.
      if (card.basedOn !== null) continue;
      perCategory.set(card.categoryKey!, (perCategory.get(card.categoryKey!) ?? 0) + 1);
    }
    // Every alternative names a product that is on the menu — and the menu does not get six more pides that way
    // either: at most two of one product type.
    const menuNames = new Set(['Kıymalı Pide', 'Kaşarlı Pide', 'Kuşbaşılı Pide', 'Karışık Pide', 'Sucuklu Yumurtalı Pide']);
    for (const card of alternatives) expect(menuNames.has(card.basedOn!), `${card.name} ← ${card.basedOn}`).toBe(true);
    expect(alternatives.filter((card) => card.productType === 'pide').length).toBeLessThanOrEqual(2);
    // "Öneri versen yeter": six products spread over the categories — the old recommender answered this menu with
    // six more pides. With fewer usable categories than six, a category may give a second, an open gap first (the
    // drinks here, D-189); a main past the first is another kind of main (Lahmacun), never one more pide.
    for (const [key, count] of perCategory) expect(count, `${key} en fazla iki ürün almalı`).toBeLessThanOrEqual(2);
    const morePide = bySection(result, 'new_product').filter((card) => card.basedOn === null && card.productType === 'pide');
    expect(morePide.length, 'ikinci pide yok').toBeLessThanOrEqual(1);
    expect(perCategory.size).toBeGreaterThanOrEqual(3);
    // And the emptiest category is the one that actually gets filled.
    expect(perCategory.get('icecek') ?? 0).toBeGreaterThan(0);
    // Every new product arrives with its four sections — except a packaged drink, which is a plain panel row. A
    // prepared drink (limonata, latte) is not plain: it has a size and a description like any dish.
    for (const card of bySection(result, 'new_product')) {
      if (card.productType === 'mesrubat') {
        expect(card.optionGroups, card.name).toHaveLength(0);
        expect(card.shortDescription, card.name).toBe('');
        continue;
      }
      expect(card.optionGroups.length, card.name).toBeGreaterThan(0);
      expect(card.removableIngredients.length + card.extraIngredients.length, card.name).toBeGreaterThan(0);
      expect(words(card.shortDescription), `${card.name}: ${card.shortDescription}`).toBeGreaterThanOrEqual(6);
      expect(words(card.shortDescription), `${card.name}: ${card.shortDescription}`).toBeLessThanOrEqual(8);
    }
    // "Yalandan olan" still completes several products already on the menu, not two or three.
    expect(bySection(result, 'option')).toHaveLength(5);
  });

  it('full mode: keeps recommending past the category minimums, up to the opening target', async () => {
    const result = await analyze({
      cuisineId: cuisineIdBySlug.get('pide-lahmacun')!,
      mode: 'full',
      menuText: 'Kıymalı Pide, Kaşarlı Pide, Kuşbaşılı Pide, Karışık Pide, Sucuklu Yumurtalı Pide',
    });
    const counts = result.counts!;
    const gaps = new Map(counts.categories.map((c) => [c.key, c]));
    const newProducts = bySection(result, 'new_product');
    const perCategory = new Map<string, number>();
    for (const card of newProducts) perCategory.set(card.categoryKey!, (perCategory.get(card.categoryKey!) ?? 0) + 1);

    // The point of this mode: a category keeps receiving products after its own minimum is covered, because the
    // menu as a whole is still short of the opening target. Before this, the gaps were the ceiling and the run
    // ended with "hedefe N ürün kalıyor".
    const exceeded = [...perCategory].filter(([key, count]) => count > (gaps.get(key)?.missing ?? 0));
    expect(exceeded.length, 'tam modda en az bir kategori kendi açığını aşmalı').toBeGreaterThan(0);
    expect(result.counts!.current + newProducts.length).toBeGreaterThanOrEqual(result.counts!.target);
    expect(result.warnings.some((w) => w.code === 'target_unreachable')).toBe(false);
    // Every product on the menu gets its card, and every suggested product that is not a packaged drink carries
    // its own options.
    expect(bySection(result, 'option')).toHaveLength(result.menu.length);
    expect(newProducts.filter((c) => c.productType !== 'mesrubat').every((c) => c.optionGroups.length > 0)).toBe(true);
    expect(newProducts.filter((c) => c.productType === 'mesrubat').every((c) => c.optionGroups.length === 0)).toBe(true);
    // Still never more of a category than the cuisine's own shape allows, and still spread out.
    for (const [key, count] of perCategory) {
      expect(count, `${key} kategorisi taşmamalı`).toBeLessThanOrEqual(Math.max(2, (gaps.get(key)?.minItems ?? 0) * 2));
    }
    expect(perCategory.size).toBeGreaterThanOrEqual(3);
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

  it('gives a product with an empty panel description a ready 6–8 word one on its own card', async () => {
    const result = await analyze({ cuisineId: cuisineIdBySlug.get('kebap-izgara')! }, [{ file: 'panel-1.png' }]);
    // "Tavuk Şiş" and "Lahmacun" have an empty description in panel-1: no separate "açıklama boş" note any more,
    // the product's card carries the text to paste.
    expect(bySection(result, 'fix').some((f) => f.fixKind === 'empty_description')).toBe(false);
    const described = bySection(result, 'option').filter((c) => c.shortDescription.length > 0);
    expect(described.length).toBeGreaterThan(0);
    for (const card of described) {
      expect(words(card.shortDescription), `${card.name}: ${card.shortDescription}`).toBeGreaterThanOrEqual(6);
      expect(words(card.shortDescription), `${card.name}: ${card.shortDescription}`).toBeLessThanOrEqual(8);
    }
    for (const fix of bySection(result, 'fix')) expect(fix.targetName).not.toBeNull();
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

      // A soup kitchen in quick mode, pool only: six products, none of them twice — "Ayran" is seeded in several
      // related cuisines and was picked twice, the copy then dropped, leaving five (D-189).
      const soups = multipartBody(
        {
          cuisineId: rows.find((r) => r.slug === 'corba')!.id,
          mode: 'quick',
          menuText: 'Mercimek Çorbası, Ezogelin Çorbası, İşkembe Çorbası, Kelle Paça Çorbası, Yayla Çorbası, Tavuk Suyu Çorbası',
        },
        [],
      );
      const soupRes = await local.app.inject({
        method: 'POST',
        url: '/api/v1/analyze',
        headers: { ...bearer(localToken), ...soups.headers },
        payload: soups.payload,
      });
      expect(soupRes.statusCode, soupRes.body).toBe(200);
      const soupNames = soupRes
        .json<AnalyzeResult>()
        .cards.filter((c) => c.section === 'new_product')
        .map((c) => c.name.toLocaleLowerCase('tr-TR'));
      expect(new Set(soupNames).size, soupNames.join(', ')).toBe(soupNames.length);
      // D-198: ten in quick mode — alternatives built on the menu plus the category products.
      expect(soupNames.length, soupNames.join(', ')).toBe(10);

      // A home-cooking menu whose salad category has nothing left in the pool: without a model the slot used to stay
      // empty (five). Quick mode fills it from the other open categories — six, never past the run's total.
      const home = multipartBody(
        {
          cuisineId: rows.find((r) => r.slug === 'ev-yemekleri')!.id,
          mode: 'quick',
          menuText: 'Kuru Fasulye, Tereyağlı Pirinç Pilavı, Karnıyarık, Tavuk Sote, Mercimek Çorbası, Cacık, Ayran',
        },
        [],
      );
      const homeRes = await local.app.inject({
        method: 'POST',
        url: '/api/v1/analyze',
        headers: { ...bearer(localToken), ...home.headers },
        payload: home.payload,
      });
      expect(homeRes.statusCode, homeRes.body).toBe(200);
      const homeNew = homeRes.json<AnalyzeResult>().cards.filter((c) => c.section === 'new_product');
      expect(homeNew.map((c) => c.name), homeNew.map((c) => `${c.name} [${c.categoryKey}]`).join(', ')).toHaveLength(10);
      expect(new Set(homeNew.map((c) => c.name)).size).toBe(10);

      // Two variants of one pool product stay two products: listed by their own names, never "renamed" to the pool's
      // bare "Gözleme", and not asked the filling their name already chose (D-188).
      const variants = multipartBody(
        { cuisineId: rows.find((r) => r.slug === 'manti-hamur-isleri')!.id, mode: 'quick', menuText: 'Peynirli Gözleme, Patatesli Gözleme' },
        [],
      );
      const variantRes = await local.app.inject({
        method: 'POST',
        url: '/api/v1/analyze',
        headers: { ...bearer(localToken), ...variants.headers },
        payload: variants.payload,
      });
      expect(variantRes.statusCode, variantRes.body).toBe(200);
      const variantResult = variantRes.json<AnalyzeResult>();
      expect(variantResult.menu.map((m) => m.name).sort()).toEqual(['Patatesli Gözleme', 'Peynirli Gözleme']);
      expect(variantResult.cards.filter((c) => c.section === 'fix' && c.fixKind === 'bad_name' && c.suggestedValue === 'Gözleme')).toHaveLength(0);
      for (const card of variantResult.cards.filter((c) => c.section === 'option')) {
        expect(card.optionGroups.map((g) => g.name), card.targetName ?? card.name).not.toContain('İç Harç');
      }
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
