import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GENERAL_CUISINE, readMenuCuisine } from '../../src/agents/classifier.js';
import { loadProductTypeIndex } from '../../src/agents/knowledge.js';
import { cuisines, menuItems } from '../../src/db/schema/index.js';
import type { CardDto, CountsDto } from '../../src/modules/analyze/schemas.js';
import { insertTemplate } from '../../src/modules/templates/template-store.js';
import { FakeProvider, hashEmbedding, okJson, type FakeResponder } from '../helpers/fake-provider.js';
import { multipartBody, parseSse } from '../helpers/fixtures.js';
import { bearer, createTestApp, loginAs, type TestContext } from '../helpers/test-app.js';

/**
 * D-217: the template pool and the models as one system. The pool answers what it can and answers it in the
 * cuisine's own voice; the models fill what the pool cannot, and what they write is kept for the team to approve,
 * so the pool grows from real calls. Nothing here depends on whether a model answers.
 */

let ctx: TestContext;
let admin: string;
let host = 0;
const taskCalls = new Map<string, number>();
/** What the recommend model answers with; empty by default (the pool alone). */
let modelProducts: Record<string, unknown>[] = [];

const responder: FakeResponder = (request) => {
  taskCalls.set(request.task, (taskCalls.get(request.task) ?? 0) + 1);
  if (request.task === 'agent.classify') return okJson({ cuisineSlug: 'kebap-izgara', confidence: 0.9, priceSegment: 'orta', reason: 'fake' });
  if (request.task === 'agent.recommend') return okJson({ items: modelProducts });
  if (request.task === 'agent.chat') return okJson({ action: 'answer', reply: 'Menüyü yapıştır.', categoryKey: null, productCount: 0, targets: [], addProducts: [], removeProducts: [], cuisineSlug: null, note: '', quickReplies: [] });
  return okJson({ items: [] });
};

interface Reply {
  text: string;
  result: { cards: CardDto[]; counts: CountsDto | null } | null;
}

async function send(text: string): Promise<Reply> {
  host += 1;
  const body = multipartBody({ text }, []);
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/chat/messages', headers: body.headers, payload: body.payload, remoteAddress: `10.50.0.${host}` });
  expect(res.statusCode).toBe(200);
  return (parseSse(res.body).find((e) => e.event === 'message')?.data as { message: Reply }).message;
}

const products = (reply: Reply): CardDto[] => reply.result?.cards.filter((c) => c.section === 'new_product') ?? [];

async function cuisineOf(slug: string): Promise<{ id: string; name: string }> {
  const [row] = await ctx.db.db.select({ id: cuisines.id, name: cuisines.name }).from(cuisines).where(eq(cuisines.slug, slug));
  return row!;
}

async function ownerOf(cards: readonly CardDto[]): Promise<Map<string, string | null>> {
  const ids = cards.flatMap((c) => (c.matchedTemplateId ? [c.matchedTemplateId] : []));
  const rows = ids.length > 0 ? await ctx.db.db.select({ id: menuItems.id, cuisineId: menuItems.cuisineId }).from(menuItems).where(sql`${menuItems.id} in ${ids}`) : [];
  return new Map(rows.map((r) => [r.id, r.cuisineId]));
}

beforeAll(async () => {
  const gemini = new FakeProvider('gemini', responder, (texts, opts) => texts.map((t) => hashEmbedding(t, opts.dim)));
  const groq = new FakeProvider('groq', responder);
  ctx = await createTestApp({ providers: { gemini, groq } });
  admin = (await loginAs(ctx)).accessToken;
});

afterAll(async () => {
  await ctx.close();
});

describe('the pool answers in the cuisine’s own voice (D-217)', () => {
  it('starts a pide shop with its own pides and lahmacun, not the parent kebap kitchen’s best sellers', async () => {
    const pide = await cuisineOf('pide-lahmacun');
    const reply = await send('Pide & Lahmacun için öneri sun');
    expect(reply.result?.counts?.cuisineName).toBe('Pide & Lahmacun');
    const offered = products(reply);
    const owner = await ownerOf(offered);
    const mains = offered.filter((c) => c.categoryKey === 'ana-yemek');
    const ownMains = mains.filter((c) => owner.get(c.matchedTemplateId ?? '') === pide.id);
    expect(mains.length).toBeGreaterThan(0);
    // Before D-217 a single pide stood among Adana, Urfa and döner.
    expect(ownMains.length / mains.length, mains.map((c) => c.name).join(', ')).toBeGreaterThanOrEqual(0.8);
    // The first mains the rep reads are the shop's own.
    expect(mains.slice(0, 3).every((c) => owner.get(c.matchedTemplateId ?? '') === pide.id), mains.slice(0, 3).map((c) => c.name).join(', ')).toBe(true);
  });

  it('reads a meze list as meze from the pool and does not ask the classify model', async () => {
    const before = taskCalls.get('agent.classify') ?? 0;
    const meze = await ctx.db.db
      .select({ name: menuItems.canonicalName })
      .from(menuItems)
      .innerJoin(cuisines, eq(cuisines.id, menuItems.cuisineId))
      .where(and(eq(menuItems.approved, true), eq(cuisines.slug, 'meze'), eq(menuItems.categoryKey, 'salata-meze')))
      .limit(5);
    expect(meze.length).toBe(5);
    const reply = await send(meze.map((m) => m.name).join(', '));
    expect(reply.result?.counts?.cuisineName).toBe('Meze');
    expect(taskCalls.get('agent.classify') ?? 0).toBe(before);
  });

  it('still asks the classify model when the pool is not clear', async () => {
    const before = taskCalls.get('agent.classify') ?? 0;
    await send('Ev Usulü Özel Tabak, Şefin Karışığı, Günün Yemeği');
    expect(taskCalls.get('agent.classify') ?? 0).toBe(before + 1);
  });
});

describe('reading the cuisine without a model (D-217)', () => {
  const options = [
    { id: '1', slug: 'kebap-izgara', name: 'Kebap' },
    { id: '2', slug: 'meze', name: 'Meze' },
    { id: '3', slug: 'tantuni', name: 'Tantuni' },
    { id: '4', slug: 'doner', name: 'Döner' },
    { id: '5', slug: 'cigkofte', name: 'Çiğ Köfte' },
    { id: '6', slug: GENERAL_CUISINE, name: 'Dünya Mutfağı & Cafe' },
  ];
  const homes = (entries: [string, string[]][]) => new Map(entries.map(([name, slugs]) => [name, new Set(slugs)]));

  it('lets the pool decide a list it keeps in one cuisine, and a single product only that cuisine keeps', async () => {
    const types = await loadProductTypeIndex(ctx.db.db);
    const list = ['Haydari', 'Kısır', 'Muhammara', 'Paçanga Böreği', 'Sigara Böreği'];
    // Homes are keyed by the normalized name, the way poolHomes builds them.
    const normalizedHomes = homes([['haydari', ['meze']], ['kisir', ['meze']], ['muhammara', ['meze']], ['pacanga borek', ['meze']], ['sigara borek', ['meze', 'kebap-izgara']]]);
    const decided = readMenuCuisine(list, types, options, normalizedHomes);
    expect(decided.guess?.slug).toBe('meze');
    expect(decided.decisive).toEqual({ found: 5, share: 1 });

    const tantuni = readMenuCuisine(['Bol Soğanlı Tantuni'], types, options, homes([['bol soganli tantuni', ['tantuni']]]));
    expect(tantuni.guess?.slug).toBe('tantuni');
    expect(tantuni.decisive).toBeDefined();
    // Without the pool, the dürüm type's home cuisine (döner) used to win: the type alone is no decision.
    expect(readMenuCuisine(['Bol Soğanlı Tantuni'], types, options).decisive).toBeUndefined();
  });

  it('hands a comboless name\'s vote to the other types it names, and guesses nothing when nothing points anywhere', async () => {
    const types = await loadProductTypeIndex(ctx.db.db);
    // "Aile" makes it a combo, a type with no cuisine; the çiğ köfte in the name still votes.
    expect(readMenuCuisine(['Çiğ Köfte Aile Boyu'], types, options).guess?.slug).toBe('cigkofte');
    expect(readMenuCuisine(['Buffalo Wings'], types, options).guess).toBeUndefined();
  });

  it('does not decide alone when the pool keeps the menu in two cuisines alike', async () => {
    const types = await loadProductTypeIndex(ctx.db.db);
    const both = homes([['ayran', ['kebap-izgara', 'doner']], ['kola', ['kebap-izgara', 'doner']]]);
    expect(readMenuCuisine(['Ayran', 'Kola'], types, options, both).decisive).toBeUndefined();
  });
});

describe('the fill reaches past the open categories with the cuisine’s own products (D-217)', () => {
  it('offers a café’s own products of other categories when its drink and dessert categories run out', async () => {
    const cafe = await cuisineOf('kafe-icecek');
    const payload = (name: string) => ({
      name,
      description: 'Ekşi mayalı ekmekte peynir ve yeşilliklerle hazırlanır.',
      servingNote: '',
      portionInfo: '1 porsiyon',
      optionGroups: [],
      removableIngredients: [],
      extraIngredients: [],
      tags: [],
      allergenNotes: [],
      upsellSuggestion: '',
    });
    const own = ['Kafe Usulü Peynirli Sandviç', 'Kafe Usulü Hindili Sandviç', 'Kafe Usulü Sebzeli Sandviç'];
    for (const name of own) {
      const id = await insertTemplate(ctx.db.db, { cuisineId: cafe.id, payload: payload(name), source: 'user', approved: true });
      await ctx.db.db.update(menuItems).set({ categoryKey: 'ana-yemek' }).where(eq(menuItems.id, id));
    }
    // A target no café pool reaches: every open category runs dry first.
    await ctx.db.db.update(cuisines).set({ minItemCount: 200 }).where(eq(cuisines.id, cafe.id));
    const reply = await send('Kahve & İçecek için öneri sun');
    const names = products(reply).map((c) => c.name);
    for (const name of own) expect(names, names.join(', ')).toContain(name);
  });

  it('files a drink stored as a main under drinks', async () => {
    const cafe = await cuisineOf('kafe-icecek');
    const id = await insertTemplate(ctx.db.db, {
      cuisineId: cafe.id,
      payload: { name: 'Buzlu Fındıklı Latte', description: '', servingNote: '', portionInfo: '', optionGroups: [], removableIngredients: [], extraIngredients: [], tags: [], allergenNotes: [], upsellSuggestion: '' },
      source: 'imported',
      approved: true,
    });
    await ctx.db.db.update(menuItems).set({ categoryKey: 'ana-yemek', importance: 100 }).where(eq(menuItems.id, id));
    const card = products(await send('Kahve & İçecek için öneri sun')).find((c) => c.name === 'Buzlu Fındıklı Latte');
    expect(card?.categoryKey).toBe('icecek');
  });
});

describe('what the models write grows the pool through the team (D-217)', () => {
  const draft = (name: string) => ({
    name,
    categoryKey: 'ana-yemek',
    shortDescription: 'Közlenmiş biber ve yoğurtla servis edilen kuzu şiş.',
    portionInfo: '1 porsiyon ~200 g',
    priceRangeHint: '',
    reason: 'Kebapçıda aranır',
    // An alternative of a menu product, as the model writes them: outside the category quota the pool fills.
    basedOn: 'Adana Kebap',
    importance: 70,
    optionGroups: [],
    removableIngredients: ['Soğan'],
    extraIngredients: [],
  });

  it('keeps each model product as a draft, counts repeats, lists them for the admin and never offers them unapproved', async () => {
    const kebap = await cuisineOf('kebap-izgara');
    modelProducts = [draft('Yoğurtlu Kuzu Şiş Özel'), draft('Közlü Patlıcanlı Şiş Özel')];
    const first = await send('Adana Kebap, Urfa Kebap, Ayran');
    expect(first.result?.counts?.cuisineName).toBe('Kebap');
    expect(products(first).filter((c) => c.source === 'ai').map((c) => c.name)).toEqual(expect.arrayContaining(['Yoğurtlu Kuzu Şiş Özel']));

    const rows = async () =>
      ctx.db.db
        .select({ name: menuItems.canonicalName, approved: menuItems.approved, review: menuItems.needsReview, source: menuItems.source, count: menuItems.usageCount, id: menuItems.id })
        .from(menuItems)
        .where(and(eq(menuItems.cuisineId, kebap.id), sql`${menuItems.canonicalName} like '%Şiş Özel'`));
    const drafts = await rows();
    expect(drafts.map((d) => d.name).sort()).toEqual(['Közlü Patlıcanlı Şiş Özel', 'Yoğurtlu Kuzu Şiş Özel']);
    expect(drafts.every((d) => !d.approved && d.review && d.source === 'ai' && d.count === 1)).toBe(true);

    modelProducts = [draft('Yoğurtlu Kuzu Şiş Özel')];
    await send('Adana Kebap, Beyti, Ayran');
    expect((await rows()).find((d) => d.name === 'Yoğurtlu Kuzu Şiş Özel')?.count).toBe(2);

    const listed = await ctx.app.inject({ method: 'GET', url: '/api/v1/templates?approved=review', headers: bearer(admin) });
    expect(listed.statusCode).toBe(200);
    const listedNames = listed.json<{ data: { name: string }[] }>().data.map((t) => t.name);
    expect(listedNames.slice(0, 1)).toEqual(['Yoğurtlu Kuzu Şiş Özel']);
    // The archive is what the admin removed, not the drafts.
    const archive = await ctx.app.inject({ method: 'GET', url: '/api/v1/templates?approved=false', headers: bearer(admin) });
    expect(archive.json<{ data: { name: string }[] }>().data.map((t) => t.name)).not.toContain('Yoğurtlu Kuzu Şiş Özel');
    const overview = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/overview', headers: bearer(admin) });
    expect(overview.json<{ pool: { drafts: number } }>().pool.drafts).toBeGreaterThanOrEqual(2);

    // The pool alone (the model writes nothing now) offers no draft.
    modelProducts = [];
    const poolOnly = await send('Adana Kebap, Kuzu Şiş, Ayran');
    expect(products(poolOnly).map((c) => c.name)).not.toContain('Közlü Patlıcanlı Şiş Özel');
  });

  it('offers a draft from the pool once the admin approves it, and never drafts again what the admin archived', async () => {
    const kebap = await cuisineOf('kebap-izgara');
    const [approve] = await ctx.db.db.select({ id: menuItems.id }).from(menuItems).where(and(eq(menuItems.cuisineId, kebap.id), eq(menuItems.canonicalName, 'Yoğurtlu Kuzu Şiş Özel')));
    const [reject] = await ctx.db.db.select({ id: menuItems.id }).from(menuItems).where(and(eq(menuItems.cuisineId, kebap.id), eq(menuItems.canonicalName, 'Közlü Patlıcanlı Şiş Özel')));
    expect((await ctx.app.inject({ method: 'PATCH', url: `/api/v1/templates/${approve!.id}`, headers: bearer(admin), payload: { approved: true } })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: 'DELETE', url: `/api/v1/templates/${reject!.id}`, headers: bearer(admin) })).statusCode).toBe(200);
    // Make the approved one the pool's first choice for a kebap menu, so the assertion does not hang on ranking.
    await ctx.db.db.update(menuItems).set({ importance: 100, usageCount: 10 }).where(eq(menuItems.id, approve!.id));

    modelProducts = [draft('Közlü Patlıcanlı Şiş Özel')];
    const reply = await send('Adana Kebap, Urfa Kebap, Lahmacun');
    const card = products(reply).find((c) => c.name === 'Yoğurtlu Kuzu Şiş Özel');
    expect(card?.source).toBe('db');
    const rejected = await ctx.db.db
      .select({ approved: menuItems.approved, review: menuItems.needsReview, count: menuItems.usageCount })
      .from(menuItems)
      .where(and(eq(menuItems.cuisineId, kebap.id), eq(menuItems.canonicalName, 'Közlü Patlıcanlı Şiş Özel')));
    expect(rejected).toEqual([{ approved: false, review: false, count: 1 }]);
  });
});
