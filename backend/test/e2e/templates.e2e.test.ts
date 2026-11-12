import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cuisines, itemEmbeddings, menuItems } from '../../src/db/schema/index.js';
import { seedDatabase } from '../../src/db/seed/seed.js';
import { SEED_TEMPLATES } from '../../src/db/seed/templates.js';
import type { TemplatePayload } from '../../src/domain/template.js';
import { normalizeTr } from '../../src/lib/normalize-tr.js';
import type { TemplateDto } from '../../src/modules/templates/schemas.js';
import { type TestContext, TEST_ADMIN, bearer, createTestApp, loginAs } from '../helpers/test-app.js';

type ListResponse = { data: TemplateDto[]; meta: { total: number; limit: number; offset: number } };

const icliKofte: TemplatePayload = {
  name: 'İçli Köfte',
  description: 'Bulgur hamurunun içi cevizli kıymayla doldurulup kızartılır; limon ve yeşillikle servis edilir.',
  servingNote: 'Sıcak servis; kapaklı kapta limonla gönderilir.',
  portionInfo: '2 adet',
  optionGroups: [
    {
      name: 'Adet',
      selectionType: 'single',
      isRequired: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        { name: '2 Adet', priceMode: 'sets_base', isDefault: true },
        { name: '4 Adet', priceMode: 'sets_base', isDefault: false },
      ],
    },
  ],
  removableIngredients: ['Ceviz'],
  extraIngredients: [],
  tags: ['kızartma'],
  allergenNotes: ['Gluten (bulgur)', 'Kuruyemiş (ceviz)'],
  upsellSuggestion: 'Yanına ayran önerilebilir.',
};

describe('/templates (template pool)', () => {
  let ctx: TestContext;
  let token: string;
  let kebapId: string;

  const list = async (query: string) => {
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/templates?${query}`, headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    return res.json<ListResponse>();
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    token = (await loginAs(ctx)).accessToken;
    const [row] = await ctx.db.db.select({ id: cuisines.id }).from(cuisines).where(eq(cuisines.slug, 'kebap-izgara'));
    if (!row) throw new Error('kebap cuisine missing');
    kebapId = row.id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lists every seed template, sorted and paginated', async () => {
    const all = await list('limit=500');
    expect(all.meta.total).toBe(SEED_TEMPLATES.length);
    expect(all.data.every((t) => t.approved && t.source === 'seed')).toBe(true);
    const page = await list('sort=name&limit=5&offset=5');
    expect(page.data).toHaveLength(5);
    expect(page.meta).toMatchObject({ total: SEED_TEMPLATES.length, limit: 5, offset: 5 });
    const names = (await list('sort=name&limit=500')).data.map((t) => normalizeTr(t.name));
    expect(names).toEqual([...names].sort());
    expect(names.indexOf(normalizeTr('İskender Kebap'))).toBeLessThan(names.indexOf(normalizeTr('Kokoreç')));
  });

  it('searches names and aliases (Turkish-insensitive) and filters by cuisine', async () => {
    expect((await list('q=IskEnder')).data.map((t) => t.name)).toContain('İskender Kebap');
    // "Acılı Kebap" is an alias of Adana Kebap.
    expect((await list(`q=${encodeURIComponent('acılı kebap')}`)).data.map((t) => t.name)).toContain('Adana Kebap');
    const kebap = await list(`cuisineId=${kebapId}&limit=500`);
    expect(kebap.meta.total).toBe(SEED_TEMPLATES.filter((t) => t.cuisine === 'kebap-izgara').length);
    expect(kebap.data.every((t) => t.cuisineName === 'Kebap')).toBe(true);
  });

  it('creates a user template (embedded) and rejects a duplicate name', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/templates',
      headers: bearer(token),
      payload: { cuisineId: kebapId, payload: icliKofte, aliases: ['İçli', 'Içli köfte porsiyon'], importance: 60 },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json<TemplateDto>();
    expect(created).toMatchObject({ name: 'İçli Köfte', source: 'user', approved: true, importance: 60 });
    expect(created.aliases).toHaveLength(2);
    const vectors = await ctx.db.db.select().from(itemEmbeddings).where(eq(itemEmbeddings.menuItemId, created.id));
    expect(vectors).toHaveLength(1);

    const again = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/templates',
      headers: bearer(token),
      payload: { cuisineId: kebapId, payload: icliKofte },
    });
    expect(again.statusCode).toBe(409);

    const priced = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/templates',
      headers: bearer(token),
      payload: { cuisineId: kebapId, payload: { ...icliKofte, name: 'Fiyatlı', description: '2 adet 120 TL' } },
    });
    expect(priced.statusCode).toBe(400);
  });

  it('editing a seed makes it a user template that re-seeding leaves alone; aliases are replaced', async () => {
    const [adana] = (await list(`q=${encodeURIComponent('adana kebap')}`)).data;
    if (!adana) throw new Error('adana missing');
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/templates/${adana.id}`,
      headers: bearer(token),
      payload: { payload: { ...adana.payload, description: 'Acılı kuzu kıyma közde pişer; lavaş ve közlenmiş biberle gelir.' }, aliases: ['Adana'] },
    });
    expect(res.statusCode).toBe(200);
    const edited = res.json<TemplateDto>();
    expect(edited.source).toBe('user');
    expect(edited.aliases).toEqual(['Adana']);

    await seedDatabase(ctx.db.db, { admin: TEST_ADMIN });
    const [row] = await ctx.db.db.select().from(menuItems).where(eq(menuItems.id, adana.id));
    expect(row?.description).toBe('Acılı kuzu kıyma közde pişer; lavaş ve közlenmiş biberle gelir.');
  });

  it('deleting a seed archives it so re-seeding does not bring it back; user templates are deleted', async () => {
    const [katmer] = (await list('q=katmer')).data;
    if (!katmer) throw new Error('katmer missing');
    const res = await ctx.app.inject({ method: 'DELETE', url: `/api/v1/templates/${katmer.id}`, headers: bearer(token) });
    expect(res.json<{ archived: boolean }>().archived).toBe(true);
    expect((await list('q=katmer')).data).toHaveLength(0);
    expect((await list('q=katmer&approved=false')).data.map((t) => t.id)).toEqual([katmer.id]);

    const report = await seedDatabase(ctx.db.db, { admin: TEST_ADMIN });
    expect(report.templatesInserted).toBe(0);
    expect((await list('q=katmer')).data).toHaveLength(0);

    const restore = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/templates/${katmer.id}`,
      headers: bearer(token),
      payload: { approved: true },
    });
    expect(restore.json<TemplateDto>().approved).toBe(true);

    const [icli] = (await list(`q=${encodeURIComponent('içli')}`)).data;
    if (!icli) throw new Error('icli missing');
    const removed = await ctx.app.inject({ method: 'DELETE', url: `/api/v1/templates/${icli.id}`, headers: bearer(token) });
    expect(removed.json<{ archived: boolean }>().archived).toBe(false);
    const gone = await ctx.app.inject({ method: 'GET', url: `/api/v1/templates/${icli.id}`, headers: bearer(token) });
    expect(gone.statusCode).toBe(404);
  });
});
