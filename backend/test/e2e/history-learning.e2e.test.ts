import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { cuisines, menuItems, suggestionFeedback, users } from '../../src/db/schema/index.js';
import type { AnalyzeResult, CardDto, HistoryResult } from '../../src/modules/analyze/schemas.js';
import type { LearningResult } from '../../src/modules/learning/schemas.js';
import { multipartBody } from '../helpers/fixtures.js';
import { bearer, createTestApp, loginAs, type TestContext } from '../helpers/test-app.js';

/**
 * The analysis history (D-193) and the second pass of the learning loop (D-194), end to end. The app runs without a
 * provider key, so every answer comes from the template pool and the same menu gets the same suggestions: what
 * changes between two runs is only what the team taught.
 */

let ctx: TestContext;
let token: string;
let cuisineIdBySlug: Map<string, string>;

const PIDE_MENU = 'Kıymalı Pide, Kaşarlı Pide, Kuşbaşılı Pide, Karışık Pide, Sucuklu Yumurtalı Pide';
const SOUP_MENU = 'Mercimek Çorbası, Ezogelin Çorbası, İşkembe Çorbası, Kelle Paça Çorbası, Yayla Çorbası';
const PIZZA_MENU = 'Margherita, Karışık Pizza, Sucuklu Pizza';

beforeAll(async () => {
  ctx = await createTestApp({ env: { LOCAL_ONLY_MODE: 'true' } });
  token = (await loginAs(ctx)).accessToken;
  const rows = await ctx.db.db.select({ id: cuisines.id, slug: cuisines.slug }).from(cuisines);
  cuisineIdBySlug = new Map(rows.map((r) => [r.slug, r.id]));
});

afterAll(async () => {
  await ctx.close();
});

const cuisine = (slug: string): string => cuisineIdBySlug.get(slug)!;

async function analyze(fields: Record<string, string>): Promise<AnalyzeResult> {
  const body = multipartBody(fields, []);
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/analyze', headers: { ...bearer(token), ...body.headers }, payload: body.payload });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<AnalyzeResult>();
}

async function get<T>(url: string): Promise<T> {
  const res = await ctx.app.inject({ method: 'GET', url, headers: bearer(token) });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<T>();
}

async function post<T>(url: string, payload: unknown = {}): Promise<T> {
  const res = await ctx.app.inject({ method: 'POST', url, headers: bearer(token), payload: payload as Record<string, unknown> });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<T>();
}

const newProducts = (result: AnalyzeResult): CardDto[] => result.cards.filter((c) => c.section === 'new_product');

describe('learning — the second pass (D-194)', () => {
  it('stops suggesting a product the team turned down three times for a kitchen, until someone takes it back', async () => {
    const pide = cuisine('pide-lahmacun');
    const first = await analyze({ cuisineId: pide, mode: 'quick', menuText: PIDE_MENU });
    const target = newProducts(first)[0]!;
    expect(target).toBeDefined();

    for (let round = 0; round < 3; round += 1) {
      const run = round === 0 ? first : await analyze({ cuisineId: pide, mode: 'quick', menuText: PIDE_MENU });
      const card = newProducts(run).find((c) => c.name === target.name);
      expect(card, `run ${round + 1} still suggests ${target.name}`).toBeDefined();
      await post(`/api/v1/suggestion-items/${card!.id}/skip`);
    }

    const after = await analyze({ cuisineId: pide, mode: 'quick', menuText: PIDE_MENU });
    expect(newProducts(after).map((c) => c.name)).not.toContain(target.name);
    // The slot is not lost: another product takes it.
    expect(newProducts(after)).toHaveLength(newProducts(first).length);

    const learned = await get<LearningResult>('/api/v1/learning');
    expect(learned.products).toEqual(
      expect.arrayContaining([expect.objectContaining({ cuisineId: pide, name: target.name, removed: 3, accepted: 0 })]),
    );
    expect(learned.products[0]?.cuisineName).toBe('Pide & Lahmacun');

    // "Geri al": the verdict stops counting — its rows stay, marked.
    expect(await post('/api/v1/learning/forget', { scope: 'product', cuisineId: pide, value: target.name })).toEqual({ forgotten: 3 });
    const back = await analyze({ cuisineId: pide, mode: 'quick', menuText: PIDE_MENU });
    expect(newProducts(back).map((c) => c.name)).toContain(target.name);
    expect((await get<LearningResult>('/api/v1/learning')).products.map((p) => p.name)).not.toContain(target.name);
    const rows = await ctx.db.db.select({ ignoredAt: suggestionFeedback.ignoredAt }).from(suggestionFeedback).where(eq(suggestionFeedback.kind, 'product'));
    expect(rows.filter((r) => r.ignoredAt !== null)).toHaveLength(3);
  });

  it('lists the card suggestions the team keeps deleting per product type, and forgets one on request', async () => {
    const [user] = await ctx.db.db.select({ id: users.id }).from(users).limit(1);
    await ctx.db.db.insert(suggestionFeedback).values(
      ['Ekstra Mısır', 'Ekstra Mısır', 'ekstra mısır', 'Ekstra Mısır'].map((value, i) => ({
        userId: user!.id,
        productType: 'pide',
        kind: 'extra',
        value,
        action: i < 3 ? 'removed' : 'accepted',
      })),
    );
    const learned = await get<LearningResult>('/api/v1/learning');
    // Two spellings of one suggestion add up; three removals against one acceptance is a verdict.
    expect(learned.suggestions).toEqual([
      expect.objectContaining({ productType: 'pide', productTypeLabel: 'Pide', kind: 'extra', removed: 3, accepted: 1 }),
    ]);

    await post('/api/v1/learning/forget', { scope: 'suggestion', productType: 'pide', kind: 'extra', value: 'EKSTRA MISIR' });
    expect((await get<LearningResult>('/api/v1/learning')).suggestions).toEqual([]);
  });

  it('counts an accepted product as a use of its template, which ranks it higher in the pool', async () => {
    const run = await analyze({ cuisineId: cuisine('pizza'), mode: 'quick', menuText: PIZZA_MENU });
    const card = newProducts(run).find((c) => c.matchedTemplateId !== null)!;
    const usage = async () =>
      (await ctx.db.db.select({ usage: menuItems.usageCount }).from(menuItems).where(eq(menuItems.id, card.matchedTemplateId!)))[0]!.usage;
    const before = await usage();
    await post(`/api/v1/suggestion-items/${card.id}/accept`);
    expect(await usage()).toBe(before + 1);
  });
});

describe('analysis history (D-193)', () => {
  it('keeps every analysis with its date and time, and filters by mode, cuisine, a product name and a date range', async () => {
    const soup = await analyze({ cuisineId: cuisine('corba'), mode: 'full', menuText: SOUP_MENU });
    const all = await get<HistoryResult>('/api/v1/analyze/history?limit=100');

    // Newest first, each with its time, cuisine, mode and what it produced.
    const times = all.items.map((i) => Date.parse(i.createdAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    const latest = all.items[0]!;
    expect(latest).toEqual(
      expect.objectContaining({
        runId: soup.runId,
        status: soup.status,
        mode: 'full',
        cuisineId: cuisine('corba'),
        cuisineName: 'Çorba',
        menuCount: 5,
        productNames: ['Mercimek Çorbası', 'Ezogelin Çorbası', 'İşkembe Çorbası', 'Kelle Paça Çorbası', 'Yayla Çorbası'],
        newProducts: newProducts(soup).length,
      }),
    );
    expect(latest.finishedAt).not.toBeNull();
    expect(latest.newProducts).toBeGreaterThan(0);
    // The pide runs of the learning test: one skipped product each, the last one untouched.
    const pideRuns = all.items.filter((i) => i.cuisineId === cuisine('pide-lahmacun'));
    expect(pideRuns.map((i) => i.skipped)).toEqual([0, 0, 1, 1, 1]);

    const full = await get<HistoryResult>('/api/v1/analyze/history?mode=full');
    expect(full.items.map((i) => i.runId)).toEqual([soup.runId]);
    const pizza = await get<HistoryResult>(`/api/v1/analyze/history?cuisineId=${cuisine('pizza')}`);
    expect(pizza.items).toHaveLength(1);
    expect(pizza.items[0]?.accepted).toBe(1);
    const byProduct = await get<HistoryResult>(`/api/v1/analyze/history?q=${encodeURIComponent('ezogelin')}`);
    expect(byProduct.items.map((i) => i.runId)).toEqual([soup.runId]);
    const byCuisine = await get<HistoryResult>(`/api/v1/analyze/history?q=${encodeURIComponent('Pide')}`);
    expect(byCuisine.items.length).toBeGreaterThanOrEqual(pideRuns.length);

    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect((await get<HistoryResult>(`/api/v1/analyze/history?from=${encodeURIComponent(future)}`)).items).toEqual([]);
    const past = new Date(Date.parse(all.items[all.items.length - 1]!.createdAt) - 1).toISOString();
    expect((await get<HistoryResult>(`/api/v1/analyze/history?to=${encodeURIComponent(past)}`)).items).toEqual([]);
  });

  it('pages by time, so nothing is shown twice or skipped', async () => {
    const all = (await get<HistoryResult>('/api/v1/analyze/history?limit=100')).items.map((i) => i.runId);
    const seen: string[] = [];
    let before: string | null = null;
    do {
      const query = before ? `&before=${encodeURIComponent(before)}` : '';
      const page: HistoryResult = await get<HistoryResult>(`/api/v1/analyze/history?limit=3${query}`);
      expect(page.items.length).toBeLessThanOrEqual(3);
      seen.push(...page.items.map((i) => i.runId));
      before = page.nextBefore;
    } while (before);
    expect(seen).toEqual(all);
  });

  it('refuses a malformed filter', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/analyze/history?mode=slow', headers: bearer(token) });
    expect(res.statusCode).toBe(400);
  });
});
