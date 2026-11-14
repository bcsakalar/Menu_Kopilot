import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cuisines, menuItems } from '../../src/db/schema/index.js';
import type { TemplatePayload } from '../../src/domain/template.js';
import { insertTemplate } from '../../src/modules/templates/template-store.js';
import { FakeProvider, hashEmbedding, okJson, type FakeResponder } from '../helpers/fake-provider.js';
import { fixtureResponder, loadFixtures } from '../helpers/fixtures.js';
import { bearer, createTestApp, loginAs, type TestContext } from '../helpers/test-app.js';

/**
 * Real descriptions for the pool (D-223): 952 imported templates carry a category's stock sentence ("Tavuk Şiş,
 * baharatlı dana veya kuzu etinin kıyma…"). The admin asks the model for a batch, reads and edits it, and saves what
 * is right; nothing reaches the approved pool unread.
 */

let ctx: TestContext;
let token: string;
/** What the fake model writes for a product, by name; a name not here gets an ad-worded sentence the rules turn away. */
const WRITES: Record<string, string> = {
  'Zırh Tavuk Şiş': 'Marine tavuk göğsü şişte pişer, lavaşla servis edilir.',
  'Zırh Kebap Dürüm': 'Közde zırh kıyması lavaşa sarılır, közle gelir.',
};
let modelCalls = 0;
let modelDown = false;

const responder =
  (fallback: FakeResponder): FakeResponder =>
  (request, call) => {
    if (request.schemaName !== 'template_descriptions') return fallback(request, call);
    modelCalls += 1;
    if (modelDown) return { ok: false, kind: 'unavailable', message: 'high demand' };
    const lines = request.user.split('\n').filter((line) => /^\d+ \| /u.test(line));
    return okJson({
      items: lines.map((line) => {
        const [n, name] = line.split(' | ');
        return { n: Number(n), description: WRITES[name!] ?? 'Eşsiz lezzette muhteşem bir ürün, mutlaka deneyin.' };
      }),
    });
  };

const payload = (name: string, description: string): TemplatePayload => ({
  name,
  description,
  servingNote: '',
  portionInfo: '',
  optionGroups: [],
  removableIngredients: [],
  extraIngredients: [],
  tags: [],
  allergenNotes: [],
  upsellSuggestion: '',
});

const ids: Record<string, string> = {};

beforeAll(async () => {
  const fallback = fixtureResponder(loadFixtures());
  ctx = await createTestApp({
    providers: {
      gemini: new FakeProvider('gemini', responder(fallback), (texts, opts) => texts.map((t) => hashEmbedding(t, opts.dim))),
      groq: new FakeProvider('groq', responder(fallback)),
    },
  });
  token = (await loginAs(ctx)).accessToken;
  const [kebap] = await ctx.db.db.select({ id: cuisines.id }).from(cuisines).where(eq(cuisines.slug, 'kebap-izgara'));
  const add = async (name: string, description: string, approved = true, importance = 50) => {
    ids[name] = await insertTemplate(ctx.db.db, {
      cuisineId: kebap!.id,
      payload: payload(name, description),
      source: 'imported',
      approved,
      needsReview: false,
      importance,
    });
  };
  await add('Zırh Tavuk Şiş', 'Zırh Tavuk Şiş, baharatlı dana veya kuzu etinin kıyma, şiş ya da parça et formunda hazırlanır.', true, 90);
  await add('Zırh Kebap Dürüm', 'Zırh Kebap Dürüm, lavaş içine ürün adına uygun et ve garnitür konularak sarılır.', true, 80);
  await add('Zırh Karışık Izgara', 'Zırh Karışık Izgara, baharatlı dana veya kuzu etinin kıyma, şiş ya da parça et formunda.', true, 70);
  // A draft is not the pool's: it is left to the review queue.
  await add('Zırh Taslak Kebap', 'Zırh Taslak Kebap, ürün adına uygun malzemelerle hazırlanır.', false);
});

afterAll(async () => {
  await ctx.close();
});

const inject = (method: 'GET' | 'POST', url: string, payloadBody?: unknown, auth = true) =>
  ctx.app.inject({ method, url: `/api/v1${url}`, ...(auth ? { headers: bearer(token) } : {}), ...(payloadBody ? { payload: payloadBody } : {}) });

const descriptionOf = async (id: string) => (await ctx.db.db.select({ d: menuItems.description }).from(menuItems).where(eq(menuItems.id, id)))[0]?.d;

describe('real descriptions for the pool (D-223)', () => {
  it('counts the approved templates whose description is a stock sentence, and only those', async () => {
    const res = await inject('GET', '/templates/descriptions');
    expect(res.statusCode, res.body).toBe(200);
    // The seed's own descriptions are real: only the three imported approved ones count, not the draft.
    expect(res.json<{ pending: number }>().pending).toBe(3);
  });

  it('proposes descriptions for the most important first, and offers only what passes the rules', async () => {
    modelCalls = 0;
    const res = await inject('POST', '/templates/descriptions/propose', { limit: 2 });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json<{ items: { id: string; name: string; cuisine: string; current: string; proposed: string }[]; remaining: number }>();
    expect(body.items.map((item) => item.name)).toEqual(['Zırh Tavuk Şiş', 'Zırh Kebap Dürüm']);
    expect(body.items[0]).toMatchObject({ id: ids['Zırh Tavuk Şiş'], cuisine: 'Kebap', proposed: 'Marine tavuk göğsü şişte pişer, lavaşla servis edilir.' });
    expect(body.items[0]!.current).toContain('baharatlı dana veya kuzu');
    expect(body.remaining).toBe(1);
    expect(modelCalls).toBe(1);
    // Proposing writes nothing.
    expect(await descriptionOf(ids['Zırh Tavuk Şiş']!)).toContain('baharatlı dana veya kuzu');
  });

  it('leaves the proposal empty when the model writes something the panel would refuse', async () => {
    const res = await inject('POST', '/templates/descriptions/propose', { limit: 5, skip: [ids['Zırh Tavuk Şiş'], ids['Zırh Kebap Dürüm']] });
    const body = res.json<{ items: { name: string; proposed: string }[]; remaining: number }>();
    expect(body.items).toEqual([expect.objectContaining({ name: 'Zırh Karışık Izgara', proposed: '' })]);
    expect(body.remaining).toBe(0);
  });

  it('saves what the admin approves, edited or not, and turns away what breaks the rules', async () => {
    const res = await inject('POST', '/templates/descriptions/apply', {
      items: [
        { id: ids['Zırh Tavuk Şiş'], description: 'Marine tavuk göğsü şişte pişer, lavaşla servis edilir.' },
        // Edited by the admin before saving.
        { id: ids['Zırh Kebap Dürüm'], description: 'Közde zırh kıyması lavaşa sarılır, közlenmiş biberle.' },
        { id: ids['Zırh Karışık Izgara'], description: 'Zırh Karışık Izgara, ürün adına uygun etlerle.' },
        { id: ids['Zırh Taslak Kebap'], description: 'Közde pişen kıyma kebabı, lavaş ve közle.' },
      ],
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json<{ updated: number; rejected: { id: string; reason: string }[] }>();
    expect(body.updated).toBe(2);
    expect(body.rejected.map((r) => r.id).sort()).toEqual([ids['Zırh Karışık Izgara'], ids['Zırh Taslak Kebap']].sort());
    expect(await descriptionOf(ids['Zırh Tavuk Şiş']!)).toBe('Marine tavuk göğsü şişte pişer, lavaşla servis edilir.');
    expect(await descriptionOf(ids['Zırh Kebap Dürüm']!)).toBe('Közde zırh kıyması lavaşa sarılır, közlenmiş biberle.');
    // The stock sentence and the draft are untouched.
    expect(await descriptionOf(ids['Zırh Karışık Izgara']!)).toContain('baharatlı dana veya kuzu');
    expect(await descriptionOf(ids['Zırh Taslak Kebap']!)).toContain('ürün adına uygun');

    const count = await inject('GET', '/templates/descriptions');
    expect(count.json<{ pending: number }>().pending).toBe(1);
  });

  it('says the model is unavailable instead of proposing empty descriptions', async () => {
    modelDown = true;
    try {
      const res = await inject('POST', '/templates/descriptions/propose', { limit: 5 });
      expect(res.statusCode).toBe(503);
    } finally {
      modelDown = false;
    }
  });

  it('is the admin’s alone, and validates what it is sent', async () => {
    expect((await inject('GET', '/templates/descriptions', undefined, false)).statusCode).toBe(401);
    expect((await inject('POST', '/templates/descriptions/apply', { items: [] })).statusCode).toBe(400);
    expect((await inject('POST', '/templates/descriptions/propose', { limit: 500 })).statusCode).toBe(400);
  });
});
