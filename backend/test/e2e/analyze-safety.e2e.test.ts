import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { AiRouter } from '../../src/ai/router.js';
import { cuisines, itemAliases, menuItems } from '../../src/db/schema/index.js';
import { normalizeTr } from '../../src/lib/normalize-tr.js';
import type { AnalyzeResult, CardDto } from '../../src/modules/analyze/schemas.js';
import { getTemplate } from '../../src/modules/templates/template-store.js';
import { FakeProvider, hashEmbedding, okJson, type FakeResponder } from '../helpers/fake-provider.js';
import { fixtureImage, fixtureResponder, loadFixtures, multipartBody, type Fixtures } from '../helpers/fixtures.js';
import { bearer, createTestApp, loginAs, type TestContext } from '../helpers/test-app.js';

/**
 * The guarantees that matter most on a live call, each in its own app so a scripted provider cannot leak:
 * accepting a card never thins out the pool, an agent that throws does not end the run, bad JSON gets exactly one
 * repair round on the Validator's route, and Section C catches what the panel got wrong.
 */

let fx: Fixtures;
const apps: TestContext[] = [];

beforeAll(() => {
  fx = loadFixtures();
});

afterEach(async () => {
  vi.restoreAllMocks();
  while (apps.length > 0) await apps.pop()?.close();
});

interface Harness {
  ctx: TestContext;
  token: string;
  gemini: FakeProvider;
  groq: FakeProvider;
  cuisineId: (slug: string) => string;
}

async function harness(responder: FakeResponder = fixtureResponder(fx)): Promise<Harness> {
  const gemini = new FakeProvider('gemini', responder, (texts, opts) => texts.map((t) => hashEmbedding(t, opts.dim)));
  const groq = new FakeProvider('groq', responder);
  const ctx = await createTestApp({ providers: { gemini, groq } });
  apps.push(ctx);
  const token = (await loginAs(ctx)).accessToken;
  const rows = await ctx.db.db.select({ id: cuisines.id, slug: cuisines.slug }).from(cuisines);
  const ids = new Map(rows.map((r) => [r.slug, r.id]));
  return { ctx, token, gemini, groq, cuisineId: (slug) => ids.get(slug) ?? '' };
}

/**
 * Takes the template pool out of the picture for one run. These tests are about what happens when a MODEL call
 * misbehaves, and a pool rich enough to answer on its own (424 seed templates) means no model call is made at
 * all — which is the right behaviour for a user and useless for this test.
 */
async function emptyPool(h: Harness): Promise<void> {
  await h.ctx.db.db.update(menuItems).set({ approved: false });
}

/**
 * Leaves the pool with a handful of templates for one cuisine: enough that pool cards still appear, too few to
 * fill the run, so the model is asked for the rest. (With the full 424-template pool a five-product pide menu is
 * filled from templates alone — good for the user, but then this test would never reach the model.)
 */
async function keepFewInPool(h: Harness, slug: string, keep: number): Promise<void> {
  const [cuisine] = await h.ctx.db.db.select({ id: cuisines.id }).from(cuisines).where(eq(cuisines.slug, slug)).limit(1);
  const rows = await h.ctx.db.db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(eq(menuItems.cuisineId, cuisine?.id ?? ''))
    .limit(keep);
  await h.ctx.db.db.update(menuItems).set({ approved: false });
  await h.ctx.db.db.update(menuItems).set({ approved: true }).where(inArray(menuItems.id, rows.map((r) => r.id)));
}

async function analyze(h: Harness, fields: Record<string, string>, images: string[] = []): Promise<AnalyzeResult> {
  const body = multipartBody(
    fields,
    images.map((file) => {
      const image = fixtureImage(fx, file);
      return { name: 'images', filename: file, contentType: image.mimeType, data: Buffer.from(image.data) };
    }),
  );
  const res = await h.ctx.app.inject({
    method: 'POST',
    url: '/api/v1/analyze',
    headers: { ...bearer(h.token), ...body.headers },
    payload: body.payload,
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<AnalyzeResult>();
}

async function accept(h: Harness, card: CardDto, payload?: unknown): Promise<CardDto> {
  const res = await h.ctx.app.inject({
    method: 'POST',
    url: `/api/v1/suggestion-items/${card.id}/accept`,
    headers: bearer(h.token),
    payload: payload === undefined ? {} : { payload },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<CardDto>();
}

/** One panel row as the Extractor would read it; everything not given is "unknown". */
const panelRow = (rawName: string, over: Record<string, unknown> = {}) => ({
  rawName,
  sectionText: null,
  priceText: null,
  descriptionText: null,
  description: 'unknown',
  options: 'unknown',
  removables: 'unknown',
  optionNames: [],
  confidence: 0.95,
  ...over,
});

/** A responder whose Extractor reads exactly these rows from any image. */
const readsPanel = (rows: unknown[]): FakeResponder =>
  fixtureResponder(fx, { override: (opts) => (opts.task === 'agent.extract' ? okJson({ items: rows }) : undefined) });

const PIDE_MENU = 'Kıymalı Pide, Kaşarlı Pide, Kuşbaşılı Pide, Karışık Pide, Sucuklu Yumurtalı Pide';

describe('accepting a card never thins out the template pool', () => {
  it('keeps every option group of a pool template when its new-product card is accepted as is', async () => {
    const h = await harness();
    const result = await analyze(h, { cuisineId: h.cuisineId('pide-lahmacun'), menuText: PIDE_MENU });
    const card = result.cards.find((c) => c.section === 'new_product' && c.source === 'db' && c.matchedTemplateId);
    expect(card, 'a pool-backed new product').toBeDefined();

    const before = await getTemplate(h.ctx.db.db, card!.matchedTemplateId!);
    // The card carries the whole template — grounded: every group the pool knows is still there, the description
    // is the 6–8 word panel line, and what the card shows is exactly what accepting writes.
    const groupNames = (payload: { optionGroups: { name: string }[] } | undefined) => payload?.optionGroups.map((g) => g.name) ?? [];
    expect(groupNames(card!.payload!)).toEqual(expect.arrayContaining(groupNames(before?.payload)));
    expect(card!.payload!.removableIngredients).toEqual(expect.arrayContaining(before?.payload.removableIngredients ?? []));

    await accept(h, card!);
    const after = await getTemplate(h.ctx.db.db, card!.matchedTemplateId!);
    expect(after?.payload).toEqual(card!.payload);
    expect(groupNames(after?.payload)).toEqual(expect.arrayContaining(groupNames(before?.payload)));
    expect(after?.source).toBe('user');
  });

  it('merges an option card into the template of the product instead of replacing it', async () => {
    const h = await harness(
      readsPanel([panelRow('Adana Kebap', { sectionText: 'Kebaplar', description: 'present', options: 'absent' })]),
    );
    const result = await analyze(h, { cuisineId: h.cuisineId('kebap-izgara') }, ['panel-1.png']);
    const card = result.cards.find((c) => c.section === 'option');
    expect(card, 'an option card for Adana Kebap').toBeDefined();
    expect(card!.targetNormalized).toBe('adana kebap');

    const before = await getTemplate(h.ctx.db.db, card!.matchedTemplateId!);
    expect(before?.payload.description.length).toBeGreaterThan(20);
    await accept(h, card!);
    const after = await getTemplate(h.ctx.db.db, card!.matchedTemplateId!);
    // The old accept wrote an empty description and no tags over the seed. Now nothing but the options may change.
    expect(after?.payload.description).toBe(before?.payload.description);
    expect(after?.payload.tags).toEqual(before?.payload.tags);
    expect(after?.payload.optionGroups.length).toBeGreaterThan(0);
  });

  it('titles an option card with the panel spelling and keeps it as an alias of the template on accept', async () => {
    const h = await harness(
      readsPanel([panelRow('Adanna Kebap', { sectionText: 'Kebaplar', description: 'present', options: 'absent' })]),
    );
    const result = await analyze(h, { cuisineId: h.cuisineId('kebap-izgara') }, ['panel-1.png']);
    const card = result.cards.find((c) => c.section === 'option' && c.targetNormalized === 'adanna kebap');
    expect(card, 'an option card for the misspelt name').toBeDefined();
    // The panel says "Adanna Kebap": that is what the user searches for; the pool's name travels along.
    expect(card!.targetName).toBe('Adanna Kebap');
    expect(card!.name).toBe('Adana Kebap');

    await accept(h, card!);
    const aliases = await h.ctx.db.db
      .select({ normalized: itemAliases.normalizedAlias })
      .from(itemAliases)
      .where(eq(itemAliases.menuItemId, card!.matchedTemplateId!));
    expect(aliases.map((a) => a.normalized)).toContain('adanna kebap');
  });

  it('creates a template with the suggested options for a product the pool does not know yet', async () => {
    const h = await harness(readsPanel([panelRow('Kuzu Kelle Söğüş', { description: 'present', options: 'absent' })]));
    const result = await analyze(h, { cuisineId: h.cuisineId('kebap-izgara') }, ['panel-1.png']);
    const card = result.cards.find((c) => c.section === 'option' && c.source === 'ai');
    expect(card, 'an AI option card').toBeDefined();

    const accepted = await accept(h, card!);
    const created = await getTemplate(h.ctx.db.db, accepted.matchedTemplateId!);
    expect(created?.canonicalName).toBe('Kuzu Kelle Söğüş');
    expect(created?.payload.optionGroups.map((g) => g.name)).toContain('Porsiyon');
    expect(created?.payload.removableIngredients).toContain('Soğan');
  });
});

describe('fault tolerance', () => {
  it('finishes the run when an agent throws, with the other sections and the counts intact', async () => {
    const h = await harness(readsPanel([panelRow('Adana Kebap', { sectionText: 'Kebaplar', options: 'absent' })]));
    await emptyPool(h);
    // Called with the spied instance as `this` below, so the unbound reference is intended.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = AiRouter.prototype.generate;
    vi.spyOn(AiRouter.prototype, 'generate').mockImplementation(function (this: AiRouter, request, ctx) {
      if (request.task === 'agent.recommend') throw new Error('beklenmeyen hata');
      return original.call(this, request, ctx);
    });

    const result = await analyze(h, { cuisineId: h.cuisineId('kebap-izgara'), menuText: 'Urfa Kebap' }, ['panel-1.png']);
    expect(result.status).toBe('partial');
    expect(result.counts?.current).toBe(2);
    expect(result.cards.some((c) => c.section === 'option')).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('agent_failed');

    const trace = await h.ctx.app.inject({ method: 'GET', url: `/api/v1/analyze/${result.runId}/trace`, headers: bearer(h.token) });
    const steps = trace.json<{ steps: { agent: string; status: string; error: string | null }[] }>().steps;
    const failed = steps.find((s) => s.agent === 'product_recommender');
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toContain('beklenmeyen hata');
    // The steps after it still ran.
    expect(steps.some((s) => s.agent === 'validator' && s.status === 'ok')).toBe(true);
  });
});

describe('request budget', () => {
  it('still lets the agents think when the whole panel comes in five screenshots', async () => {
    // Five images take five extraction calls. With one shared budget of six, the Classifier took the last one and
    // the option agent was refused: the phone got database answers only, exactly for the biggest menus.
    const h = await harness(readsPanel([panelRow('Kuzu Kelle Söğüş', { description: 'present', options: 'absent' })]));
    const result = await analyze(h, { cuisineId: h.cuisineId('kebap-izgara') }, [
      'panel-1.png',
      'panel-2.png',
      'menu-kebapci.jpg',
      'menu-pideci.jpg',
      'menu-tatli-kafe.jpg',
    ]);
    expect(result.stats?.imagesRead).toBe(5);
    expect(result.cards.some((c) => c.section === 'option' && c.source === 'ai')).toBe(true);
    expect(result.warnings.map((w) => w.code)).not.toContain('options_failed');
  });
});

describe("the Validator's single repair round", () => {
  const recorded = () => fx.recommendByCuisine.get(normalizeTr('Pide & Lahmacun'));

  it('repairs invalid JSON once, on the agent.validate route, and uses the repaired answer', async () => {
    const h = await harness(
      fixtureResponder(fx, {
        override: (opts) => {
          // Schema-invalid on purpose: no category, no description, no reason.
          if (opts.task === 'agent.recommend') return okJson({ items: [{ name: 'Mercimek Çorbası' }] });
          if (opts.task === 'agent.validate') return okJson(recorded());
          return undefined;
        },
      }),
    );
    await emptyPool(h);
    const result = await analyze(h, { cuisineId: h.cuisineId('pide-lahmacun'), menuText: PIDE_MENU });
    const calls = [...h.gemini.calls, ...h.groq.calls];
    // Exactly one repair per failed answer: the run asks in batches, and each invalid batch gets its one round.
    const recommends = calls.filter((c) => c.task === 'agent.recommend').length;
    expect(recommends).toBeGreaterThan(0);
    expect(calls.filter((c) => c.task === 'agent.validate')).toHaveLength(recommends);
    expect(result.cards.some((c) => c.section === 'new_product' && c.source === 'ai')).toBe(true);
  });

  it('never tries a second repair: an answer that fails twice is dropped, the pool cards stay', async () => {
    const h = await harness(
      fixtureResponder(fx, {
        override: (opts) =>
          opts.task === 'agent.recommend' || opts.task === 'agent.validate' ? okJson({ items: [{ name: 'x' }] }) : undefined,
      }),
    );
    await keepFewInPool(h, 'pide-lahmacun', 3);
    const result = await analyze(h, { cuisineId: h.cuisineId('pide-lahmacun'), menuText: PIDE_MENU });
    const calls = [...h.gemini.calls, ...h.groq.calls];
    // One repair per failed answer, never a second one for the same answer.
    expect(calls.filter((c) => c.task === 'agent.validate')).toHaveLength(calls.filter((c) => c.task === 'agent.recommend').length);
    const newProducts = result.cards.filter((c) => c.section === 'new_product');
    expect(newProducts.length).toBeGreaterThan(0);
    expect(newProducts.every((c) => c.source === 'db')).toBe(true);
    expect(result.status).toBe('partial');
  });
});

describe('Section C — what the panel got wrong', () => {
  it('flags a product filed under a contradicting heading; a packaged drink gets no card, a dessert its description', async () => {
    const h = await harness(
      readsPanel([
        panelRow('Ayran', { sectionText: 'Tatlılar', description: 'absent', options: 'present', removables: 'present' }),
        panelRow('Künefe', { sectionText: 'Tatlılar', description: 'absent', options: 'present', removables: 'present' }),
      ]),
    );
    const result = await analyze(h, { cuisineId: h.cuisineId('kebap-izgara') }, ['panel-1.png']);
    const fixes = result.cards.filter((c) => c.section === 'fix' && c.targetNormalized === 'ayran');

    const category = fixes.find((c) => c.fixKind === 'wrong_category');
    expect(category, 'wrong_category card').toBeDefined();
    expect(category?.currentValue).toBe('Tatlı');
    expect(category?.suggestedValue).toBe('İçecek');
    // A packaged drink is a plain panel row: no description to ask for, no card of options.
    expect(fixes.some((c) => c.fixKind === 'empty_description')).toBe(false);
    expect(result.cards.some((c) => c.section === 'option' && c.targetNormalized === 'ayran')).toBe(false);

    // The dessert's panel already has options and removables; its card brings only what is missing — the
    // description, from the pool, 6–8 words.
    const kunefe = result.cards.find((c) => c.section === 'option' && c.targetNormalized === 'kunefe');
    expect(kunefe, 'a card for Künefe').toBeDefined();
    expect(kunefe!.optionGroups).toHaveLength(0);
    expect(kunefe!.removableIngredients).toHaveLength(0);
    const count = kunefe!.shortDescription.split(/\s+/u).filter((w) => /\p{L}/u.test(w)).length;
    expect(count, kunefe!.shortDescription).toBeGreaterThanOrEqual(6);
    expect(count, kunefe!.shortDescription).toBeLessThanOrEqual(8);
  });
});

describe('agent trace accounting', () => {
  it('reports tokens for every step that called a model', async () => {
    const h = await harness();
    const result = await analyze(h, { cuisineId: h.cuisineId('pide-lahmacun'), menuText: PIDE_MENU });
    const trace = await h.ctx.app.inject({ method: 'GET', url: `/api/v1/analyze/${result.runId}/trace`, headers: bearer(h.token) });
    const body = trace.json<{ steps: { agent: string; llmCalls: number; tokensIn: number; model: string | null }[]; totals: { llmCalls: number } }>();
    const calling = body.steps.filter((s) => s.llmCalls > 0);
    expect(calling.length).toBeGreaterThan(0);
    for (const step of calling) {
      expect(step.tokensIn, step.agent).toBeGreaterThan(0);
      expect(step.model, step.agent).not.toBeNull();
    }
    expect(body.totals.llmCalls).toBe(calling.reduce((sum, s) => sum + s.llmCalls, 0));
  });
});
