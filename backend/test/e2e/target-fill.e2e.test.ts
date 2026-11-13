import { and, desc, eq, ne } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KitchenProfile } from '../../src/agents/kitchen.js';
import { fillGoal } from '../../src/agents/plan.js';
import { loadProductTypeIndex } from '../../src/agents/knowledge.js';
import { cuisines, menuItems } from '../../src/db/schema/index.js';
import { normalizeTr } from '../../src/lib/normalize-tr.js';
import type { AnalyzeResult, CardDto } from '../../src/modules/analyze/schemas.js';
import { FakeProvider, hashEmbedding, okJson, type FakeResponder } from '../helpers/fake-provider.js';
import { fixtureResponder, loadFixtures, multipartBody, parseSse, type Fixtures } from '../helpers/fixtures.js';
import { createTestApp, type TestContext } from '../helpers/test-app.js';

/**
 * D-213: every analysis that starts or grows a menu offers enough to pass the cuisine's target, led by what the rep gave —
 * a typed dish, a product named in a request, a screenshot. The models propose no product here: the template pool alone
 * must keep the promise, in every cuisine, and the kitchen guards must hold however long the list gets.
 */

const noDecision = {
  categoryKey: null,
  productCount: 0,
  targets: [],
  addProducts: [],
  removeProducts: [],
  cuisineSlug: null,
  note: '',
  quickReplies: [],
};

let ctx: TestContext;
let fx: Fixtures;
let decision: Record<string, unknown>;
let classifyAs = 'kebap-izgara';
let chatCalls = 0;
/** The recommend model hangs until its call is cut off, as Gemini does under "high demand". */
let slowRecommend = false;

const responder = (fallback: FakeResponder): FakeResponder => (request, call) => {
  if (request.task === 'agent.chat') {
    chatCalls += 1;
    return okJson(decision);
  }
  if (request.task === 'agent.classify') return okJson({ cuisineSlug: classifyAs, confidence: 0.9, priceSegment: 'orta', reason: 'test' });
  // No model product at all: the pool alone has to fill the menu past its target.
  if (request.task === 'agent.recommend' && slowRecommend) {
    return new Promise((resolve) => request.signal?.addEventListener('abort', () => resolve({ ok: false, kind: 'timeout', message: 'too slow' })));
  }
  if (request.task === 'agent.recommend') return okJson({ items: [] });
  return fallback(request, call);
};

interface Reply {
  text: string;
  result: AnalyzeResult | null;
}

let host = 0;
async function send(fields: Record<string, string>, cookie?: string, image?: Buffer): Promise<{ cookie: string | undefined; message: Reply; conversation: string }> {
  host += 1;
  const body = multipartBody(fields, image ? [{ name: 'images', filename: 'menu.jpg', contentType: 'image/jpeg', data: image }] : []);
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/chat/messages',
    headers: { ...body.headers, ...(cookie ? { cookie } : {}) },
    payload: body.payload,
    remoteAddress: `10.1.${Math.floor(host / 250)}.${host % 250}`,
  });
  expect(res.statusCode, res.body).toBe(200);
  const header = res.headers['set-cookie'];
  const events = parseSse(res.body);
  const message = events.filter((e) => e.event === 'message').map((e) => (e.data as { message: Reply }).message)[0]!;
  const conversation = events.filter((e) => e.event === 'conversation').map((e) => (e.data as { conversation: { id: string } }).conversation.id)[0]!;
  return { cookie: header ? String(header).split(';')[0] : cookie, message, conversation };
}

const products = (result: AnalyzeResult | null): CardDto[] => result?.cards.filter((c) => c.section === 'new_product') ?? [];

/** No product twice, none already on the menu or offered earlier in the call. */
function expectDistinct(result: AnalyzeResult, earlier: readonly string[] = []): void {
  const names = products(result).map((c) => normalizeTr(c.name));
  expect(new Set(names).size, names.join(', ')).toBe(names.length);
  const taken = new Set([...result.menu.map((m) => normalizeTr(m.name)), ...earlier.map(normalizeTr)]);
  expect(names.filter((name) => taken.has(name))).toEqual([]);
}

/** The menu would pass its target if the restaurant took every suggestion. */
function expectPastTarget(result: AnalyzeResult): void {
  const counts = result.counts!;
  expect(counts.current + products(result).length, `${counts.cuisineName}: ${counts.current} + ${products(result).length} vs ${counts.target}`).toBeGreaterThan(counts.target);
}

interface CuisineCase {
  slug: string;
  name: string;
  target: number;
  /** The cuisine's most important dish: the one product a rep would type. */
  dish: string;
}
let cases: CuisineCase[] = [];

beforeAll(async () => {
  fx = loadFixtures();
  const fallback = fixtureResponder(fx);
  const gemini = new FakeProvider('gemini', responder(fallback), (texts, opts) => texts.map((t) => hashEmbedding(t, opts.dim)));
  const groq = new FakeProvider('groq', responder(fallback));
  ctx = await createTestApp({ providers: { gemini, groq } });
  cases = [];
  for (const cuisine of await ctx.db.db.select().from(cuisines)) {
    const [dish] = await ctx.db.db
      .select({ name: menuItems.canonicalName })
      .from(menuItems)
      .where(and(eq(menuItems.cuisineId, cuisine.id), eq(menuItems.approved, true), ne(menuItems.categoryKey, 'icecek')))
      .orderBy(desc(menuItems.importance))
      .limit(1);
    cases.push({ slug: cuisine.slug, name: cuisine.name, target: Math.max(10, cuisine.minItemCount), dish: dish!.name });
  }
}, 120_000);

afterAll(async () => {
  await ctx.close();
});

describe('every cuisine fills past its target from the pool alone', () => {
  it('checks all 26 cuisines', () => {
    expect(cases).toHaveLength(26);
  });

  it('a cuisine named alone, before any menu: exactly the gap plus the overshoot', async () => {
    for (const c of cases) {
      decision = { ...noDecision, action: 'change_cuisine', reply: 'Başlıyorum.', cuisineSlug: c.slug };
      const { message } = await send({ text: `${c.name} için öneri sun` });
      const result = message.result!;
      expect(result.counts!.cuisineName).toBe(c.name);
      expect(products(result).length, c.slug).toBe(fillGoal(0, c.target));
      expectDistinct(result);
      expect(message.text, c.slug).toContain(`**${fillGoal(0, c.target)} yeni ürün** önerdim`);
      expect(message.text, c.slug).toContain(`hedef ${c.target} geçilir`);
      expect(result.warnings.map((w) => w.code)).not.toContain('target_unreachable');
    }
  }, 300_000);

  it("a cuisine's speciality leads its own start: çiğ köfte, tantuni, dondurma are offered, not refused", async () => {
    for (const [slug, word] of [
      ['cigkofte', 'cigkofte'],
      ['tantuni', 'tantuni'],
      ['dondurma', 'dondurma'],
    ] as const) {
      decision = { ...noDecision, action: 'change_cuisine', reply: 'Başlıyorum.', cuisineSlug: slug };
      const { message } = await send({ text: 'öneri sun' });
      const names = products(message.result).map((c) => normalizeTr(c.name));
      expect(names.filter((name) => name.includes(word)).length, `${slug}: ${names.join(', ')}`).toBeGreaterThanOrEqual(3);
    }
  }, 120_000);

  it('one dish typed alone: past the target, its variants first', async () => {
    const before = chatCalls;
    const types = await loadProductTypeIndex(ctx.db.db);
    const pool = await ctx.db.db.select({ name: menuItems.canonicalName }).from(menuItems).where(eq(menuItems.approved, true));
    for (const c of cases) {
      classifyAs = c.slug;
      const { message } = await send({ text: c.dish });
      const result = message.result!;
      expect(result.menu, c.slug).toHaveLength(1);
      expect(result.counts!.cuisineName).toBe(c.name);
      expectPastTarget(result);
      expectDistinct(result);
      // The dish's own variants open the list, then more of its kind, then the rest: never Ayran before them.
      const cards = products(result);
      const kitchen = new KitchenProfile([{ name: result.menu[0]!.name }], types, c.slug);
      const band = (card: CardDto) => (kitchen.variant(card.name) ? 0 : kitchen.close(card.productType ?? '') ? 1 : 2);
      const bands = cards.map(band);
      const list = cards.map((x) => `${x.name}:${band(x)}`).join(', ');
      expect(bands, `${c.slug}: ${list}`).toEqual([...bands].sort((a, b) => a - b));
      // Whenever the pool holds a variant or a product of the dish's kind, the answer carries one.
      const menu = normalizeTr(result.menu[0]!.name);
      const poolHasKind = pool.some(
        (row) => normalizeTr(row.name) !== menu && (kitchen.variant(row.name) || (kitchen.close(types.resolve(row.name, c.slug).type.key) && types.resolve(row.name, c.slug).byName)),
      );
      if (poolHasKind) expect(bands.filter((b) => b < 2).length, `${c.slug}: ${list}`).toBeGreaterThan(0);
    }
    // A product name is understood without the chat model.
    expect(chatCalls).toBe(before);
  }, 300_000);
});

describe('what the rep gives leads the suggestions', () => {
  it('"hamsi" alone: a product, the fish cuisine, hamsi dishes first, then more fish, past the target', async () => {
    classifyAs = 'balik-deniz';
    const before = chatCalls;
    const { message } = await send({ text: 'hamsi' });
    expect(chatCalls).toBe(before);
    const result = message.result!;
    expect(result.counts!.cuisineName).toBe('Balık & Deniz Ürünleri');
    expect(result.menu).toHaveLength(1);
    expectPastTarget(result);
    expectDistinct(result);

    const cards = products(result);
    const types = await loadProductTypeIndex(ctx.db.db);
    // Fish and seafood: the "balık çeşitleri" of a hamsi seller.
    const seafood = new Set(['balik', 'deniz-urunu']);
    const fish = (card: CardDto) => seafood.has(card.productType ?? '') || types.matching(card.name).some((t) => seafood.has(t.key));
    const hamsi = (card: CardDto) => normalizeTr(card.name).includes('hamsi');
    // Every hamsi dish of the pool that is not the menu's own is offered, ahead of everything else.
    const poolHamsi = await ctx.db.db.select({ name: menuItems.canonicalName }).from(menuItems).where(eq(menuItems.approved, true));
    const menu = normalizeTr(result.menu[0]!.name);
    const expected = new Set(poolHamsi.map((r) => normalizeTr(r.name)).filter((n) => n.includes('hamsi') && n !== menu));
    expect(cards.filter(hamsi).map((c) => normalizeTr(c.name)).sort()).toEqual([...expected].sort());
    const firstOther = cards.findIndex((card) => !hamsi(card));
    expect(cards.slice(firstOther).some(hamsi), cards.map((c) => c.name).join(', ')).toBe(false);
    // Then more of its kind: every fish and seafood dish before the first drink, meze or dessert.
    const rest = cards.slice(firstOther);
    const list = rest.map((c) => c.name).join(', ');
    const lastFish = rest.map(fish).lastIndexOf(true);
    const firstNotFish = rest.findIndex((card) => !fish(card));
    expect(rest.filter(fish).length, list).toBeGreaterThanOrEqual(5);
    expect(lastFish, list).toBeLessThan(firstNotFish);
    // The first thing the rep reads names hamsi dishes.
    expect(message.text).toMatch(/Önce şunları teklif et: \*\*Hamsi/u);
  });

  it('"hamsi ile ilgili yemekler öner" before any menu: the fish cuisine, led by hamsi, filled past the target', async () => {
    decision = { ...noDecision, action: 'change_cuisine', reply: 'Başlıyorum.', cuisineSlug: 'balik-deniz' };
    const { message } = await send({ text: 'hamsi ile ilgili yemekler öner' });
    const result = message.result!;
    expect(result.menu).toHaveLength(0);
    const target = result.counts!.target;
    expect(products(result).length).toBe(fillGoal(0, target));
    expectDistinct(result);
    const cards = products(result);
    expect(normalizeTr(cards[0]!.name)).toContain('hamsi');
    expect(cards.slice(0, 2).every((card) => normalizeTr(card.name).includes('hamsi')), cards.map((c) => c.name).join(', ')).toBe(true);
    expect(message.text).toContain('menüsüz başladım');
  });

  it('a request word is no seed and a cuisine word no product: "Kebap" goes to the chat agent, "tatlı" too', async () => {
    decision = { ...noDecision, action: 'change_cuisine', reply: 'Başlıyorum.', cuisineSlug: 'kebap-izgara' };
    const before = chatCalls;
    const { message } = await send({ text: 'Kebap' });
    expect(chatCalls).toBe(before + 1);
    expect(message.result!.menu).toHaveLength(0);
    expectDistinct(message.result!);
    decision = { ...noDecision, action: 'answer', reply: 'Hangi mutfak?' };
    await send({ text: 'tatlı' });
    expect(chatCalls).toBe(before + 2);
  });

  it('a product named after a cuisine start starts the menu in that cuisine and fills past its target', async () => {
    decision = { ...noDecision, action: 'change_cuisine', reply: 'Başlıyorum.', cuisineSlug: 'kebap-izgara' };
    const start = await send({ text: 'Kebap salonuyuz' });
    expect(start.message.result!.menu).toHaveLength(0);
    decision = { ...noDecision, action: 'complete', reply: 'Hazırlıyorum.', targets: ['Adana Kebap'] };
    const { message } = await send({ conversationId: start.conversation, text: 'adana için opsiyon yaz' }, start.cookie);
    const result = message.result!;
    expect(result.counts!.cuisineName).toBe('Kebap');
    expect(result.menu.map((m) => m.name)).toEqual(['Adana Kebap']);
    expectPastTarget(result);
    expect(products(result).length, products(result).map((c) => `${c.name}${c.basedOn ? "←" : ""}`).join(", ")).toBe(fillGoal(1, result.counts!.target));
    expect(result.cards.some((c) => c.section === 'option' && c.targetName === 'Adana Kebap')).toBe(true);
  });

  it('a long list stays inside the kitchen: no döner, tantuni, kokoreç or waffle to a kebap shop', async () => {
    classifyAs = 'kebap-izgara';
    const { message } = await send({ text: 'Adana, Urfa, Lahmacun, Ayran' });
    const result = message.result!;
    expectPastTarget(result);
    expectDistinct(result);
    const names = products(result).map((c) => normalizeTr(c.name));
    expect(names.filter((name) => /\b(doner|iskender|tantuni|kokorec|waffle|kumpir|midye|sushi|dondurma)\b/u.test(name))).toEqual([]);
  });

  it('a screenshot fills past the target too, and a later "Daha fazla ürün öner" brings ten new ones', async () => {
    classifyAs = 'kebap-izgara';
    const image = fx.images.get('menu-kebapci.jpg')!.data;
    const first = await send({ text: '' }, undefined, image);
    const result = first.message.result!;
    expect(result.menu.length).toBeGreaterThan(3);
    expectPastTarget(result);
    expectDistinct(result);
    const offered = products(result).map((c) => c.name);

    const more = await send({ conversationId: first.conversation, text: 'Daha fazla ürün öner' }, first.cookie);
    expect(products(more.message.result)).toHaveLength(10);
    expectDistinct(more.message.result!, offered);
    expect(more.message.text).toContain('ve 7 ürün daha');
  });
});

describe('when the models are too slow', () => {
  it('the deadline cuts them off and the pool still fills the menu past its target', async () => {
    classifyAs = 'balik-deniz';
    slowRecommend = true;
    try {
      // A dish no earlier test asked about: a cached answer would never reach the slow model.
      const { message } = await send({ text: 'Levrek Izgara' });
      const result = message.result!;
      expect(result.warnings.map((w) => w.code)).toContain('slow_providers');
      expect(result.warnings.map((w) => w.code)).not.toContain('target_unreachable');
      expectPastTarget(result);
      expectDistinct(result);
      expect(products(result).length).toBe(fillGoal(1, result.counts!.target));
    } finally {
      slowRecommend = false;
    }
  }, 60_000);
});
