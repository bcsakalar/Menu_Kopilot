import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCategoryIndex } from '../../src/agents/gap-analyst.js';
import { cuisines, menuCategories, menuItems } from '../../src/db/schema/index.js';
import { insertTemplate } from '../../src/modules/templates/template-store.js';
import { SEED_CATEGORIES } from '../../src/db/seed/categories.js';
import { CUISINE_SLUGS } from '../../src/db/seed/cuisines.js';
import { CUISINE_TARGETS } from '../../src/db/seed/cuisine-targets.js';
import { SEED_TEMPLATES } from '../../src/db/seed/templates.js';
import { type TestContext, bearer, createTestApp, loginAs } from '../helpers/test-app.js';

interface CategoryDto {
  key: string;
  label: string;
  sortOrder: number;
  keywords: string[];
}

interface CuisineCategoryDto {
  categoryKey: string;
  label: string;
  minItems: number;
  sortOrder: number;
}

interface CuisineDto {
  id: string;
  name: string;
  slug: string;
  isSystem: boolean;
  minItemCount: number;
  targetItemCount: number;
  typicalItemCount: number | null;
  targetNote: string | null;
  templateCount: number;
}

describe('cuisines API', () => {
  let ctx: TestContext;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    token = (await loginAs(ctx)).accessToken;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lists every system cuisine with template counts and targets', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/cuisines', headers: bearer(token) });
    const { data } = res.json<{ data: CuisineDto[] }>();
    expect(data).toHaveLength(CUISINE_SLUGS.length);
    const kebap = data.find((c) => c.slug === 'kebap-izgara');
    const kebapTemplates = SEED_TEMPLATES.filter((t) => t.cuisine === 'kebap-izgara').length;
    // The realistic opening target (D-177): a kebab house carries ~35 products and opens with 20.
    expect(kebap).toMatchObject({
      isSystem: true,
      minItemCount: CUISINE_TARGETS['kebap-izgara'].target,
      targetItemCount: CUISINE_TARGETS['kebap-izgara'].target,
      typicalItemCount: CUISINE_TARGETS['kebap-izgara'].typical,
      templateCount: kebapTemplates,
    });
    expect(kebap?.targetNote?.length).toBeGreaterThan(10);
    expect(data.every((c) => c.templateCount >= 5)).toBe(true);
    // Never below the 10-product rule.
    expect(data.every((c) => c.targetItemCount >= 10)).toBe(true);
  });

  it('lets the user set the real minimum product count (target = max(10, min))', async () => {
    const list = (await ctx.app.inject({ method: 'GET', url: '/api/v1/cuisines', headers: bearer(token) })).json<{
      data: CuisineDto[];
    }>();
    const pizza = list.data.find((c) => c.slug === 'pizza');
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/cuisines/${pizza?.id}`,
      headers: bearer(token),
      payload: { minItemCount: 16, notes: 'platform pizza minimumu' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ minItemCount: 16, targetItemCount: 16 });

    const low = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/cuisines/${pizza?.id}`,
      headers: bearer(token),
      payload: { minItemCount: 6 },
    });
    expect(low.json()).toMatchObject({ minItemCount: 6, targetItemCount: 10 });

    const rename = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/cuisines/${pizza?.id}`,
      headers: bearer(token),
      payload: { name: 'Pizzacı' },
    });
    expect(rename.statusCode).toBe(403);
  });

  it('creates, edits and deletes a user cuisine', async () => {
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/cuisines',
      headers: bearer(token),
      payload: { name: 'Mangal & Et Lokantası', minItemCount: 12 },
    });
    expect(created.statusCode).toBe(201);
    const cuisine = created.json<CuisineDto>();
    expect(cuisine).toMatchObject({ slug: 'mangal-et-lokantasi', isSystem: false, targetItemCount: 12 });

    const duplicate = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/cuisines',
      headers: bearer(token),
      payload: { name: 'Mangal & Et Lokantası' },
    });
    expect(duplicate.statusCode).toBe(409);

    const deleted = await ctx.app.inject({ method: 'DELETE', url: `/api/v1/cuisines/${cuisine.id}`, headers: bearer(token) });
    expect(deleted.statusCode).toBe(204);
  });

  describe('category templates (editable without a deploy)', () => {
    const cuisineId = async (slug: string): Promise<string> => {
      const list = (await ctx.app.inject({ method: 'GET', url: '/api/v1/cuisines', headers: bearer(token) })).json<{ data: CuisineDto[] }>();
      const found = list.data.find((c) => c.slug === slug);
      if (!found) throw new Error(`${slug} missing`);
      return found.id;
    };

    it('lists the taxonomy in menu order', async () => {
      const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/categories', headers: bearer(token) });
      expect(res.statusCode).toBe(200);
      const { data } = res.json<{ data: CategoryDto[] }>();
      expect(data.map((c) => c.key)).toEqual([...SEED_CATEGORIES].sort((a, b) => a.sortOrder - b.sortOrder).map((c) => c.key));
      expect(data.find((c) => c.key === 'icecek')?.keywords).toContain('ayran');
    });

    it('stores keywords the way the classifier reads them, and the next run uses them', async () => {
      // Before: "Hardaliye" is not a known drink, so it lands in the fallback category.
      const before0 = await loadCategoryIndex(ctx.db.db);
      expect(before0.classify('Hardaliye')).toBe('ana-yemek');
      expect(before0.classify('Sıcak Hardaliye')).toBe('ana-yemek');

      const before = (await ctx.app.inject({ method: 'GET', url: '/api/v1/categories', headers: bearer(token) })).json<{ data: CategoryDto[] }>();
      const drinks = before.data.find((c) => c.key === 'icecek');
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: '/api/v1/categories/icecek',
        headers: bearer(token),
        payload: { keywords: [...(drinks?.keywords ?? []), 'HARDALIYE', 'Sıcak Hardaliye', 'hardaliye'] },
      });
      expect(res.statusCode).toBe(200);
      const updated = res.json<CategoryDto>();
      // Normalized, phrases kept whole, no duplicates.
      expect(updated.keywords).toEqual(expect.arrayContaining(['hardaliye', 'sicak hardaliye']));
      expect(updated.keywords).not.toContain('sicak');
      expect(new Set(updated.keywords).size).toBe(updated.keywords.length);
      const [edited] = await ctx.db.db.select({ owned: menuCategories.editedByUser }).from(menuCategories).where(eq(menuCategories.key, 'icecek'));
      expect(edited?.owned).toBe(true);

      // No restart: the index is read per run. The phrase matches only as a phrase.
      const after = await loadCategoryIndex(ctx.db.db);
      expect(after.classify('Hardaliye')).toBe('icecek');
      expect(after.classify('Sıcak Hardaliye')).toBe('icecek');
      expect(after.classify('Sıcak Sandviç')).not.toBe('icecek');
    });

    it('moves seed templates to the category a new keyword points at, and leaves a user decision alone', async () => {
      const cuisineId = (await ctx.db.db.select({ id: cuisines.id }).from(cuisines).limit(1))[0]?.id ?? '';
      const payload = (name: string) => ({
        name,
        description: 'Fermente çay içeceği, soğuk servis edilir.',
        servingNote: '',
        portionInfo: '',
        optionGroups: [],
        removableIngredients: [],
        extraIngredients: [],
        tags: [],
        allergenNotes: [],
        upsellSuggestion: '',
      });
      const seedId = await insertTemplate(ctx.db.db, { cuisineId, payload: payload('Zencefilli Demirhindi'), source: 'seed', approved: true });
      const userId = await insertTemplate(ctx.db.db, { cuisineId, payload: payload('Demirhindi Tabağı'), source: 'user', approved: true });
      // What accepting a card does: the user's template carries the card's category.
      await ctx.db.db.update(menuItems).set({ categoryKey: 'tatli' }).where(eq(menuItems.id, userId));

      const drinks = (await ctx.app.inject({ method: 'GET', url: '/api/v1/categories', headers: bearer(token) }))
        .json<{ data: CategoryDto[] }>()
        .data.find((c) => c.key === 'icecek');
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: '/api/v1/categories/icecek',
        headers: bearer(token),
        payload: { keywords: [...(drinks?.keywords ?? []), 'demirhindi'] },
      });
      expect(res.statusCode).toBe(200);

      const category = async (id: string) =>
        (await ctx.db.db.select({ key: menuItems.categoryKey }).from(menuItems).where(eq(menuItems.id, id)))[0]?.key;
      expect(await category(seedId)).toBe('icecek');
      expect(await category(userId)).toBe('tatli');
    });

    it('rejects an unknown category', async () => {
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: '/api/v1/categories/yok-boyle',
        headers: bearer(token),
        payload: { label: 'Yok' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('reads and replaces what a cuisine is expected to have', async () => {
      const id = await cuisineId('pide-lahmacun');
      const current = await ctx.app.inject({ method: 'GET', url: `/api/v1/cuisines/${id}/categories`, headers: bearer(token) });
      expect(current.statusCode).toBe(200);
      expect(current.json<{ data: CuisineCategoryDto[] }>().data.map((c) => `${c.categoryKey}:${c.minItems}`)).toEqual([
        'corba:1',
        'ana-yemek:6',
        'salata-meze:1',
        'tatli:1',
        'icecek:2',
      ]);

      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/v1/cuisines/${id}/categories`,
        headers: bearer(token),
        payload: {
          items: [
            { categoryKey: 'icecek', minItems: 3 },
            { categoryKey: 'ana-yemek', minItems: 8 },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      // Sorted by the taxonomy's menu order, whatever order the screen sent.
      expect(res.json<{ data: CuisineCategoryDto[] }>().data.map((c) => `${c.categoryKey}:${c.minItems}`)).toEqual([
        'ana-yemek:8',
        'icecek:3',
      ]);
      // The set is now the user's: the seed that runs on every start will not re-add what was removed.
      const [row] = await ctx.db.db.select({ owned: cuisines.categoriesEditedByUser }).from(cuisines).where(eq(cuisines.id, id));
      expect(row?.owned).toBe(true);
    });

    it('refuses unknown or repeated categories and leaves the set untouched', async () => {
      const id = await cuisineId('burger');
      const before = (await ctx.app.inject({ method: 'GET', url: `/api/v1/cuisines/${id}/categories`, headers: bearer(token) })).json<{
        data: CuisineCategoryDto[];
      }>();
      const unknown = await ctx.app.inject({
        method: 'PUT',
        url: `/api/v1/cuisines/${id}/categories`,
        headers: bearer(token),
        payload: { items: [{ categoryKey: 'uzay-yemegi', minItems: 1 }] },
      });
      expect(unknown.statusCode).toBe(400);
      const repeated = await ctx.app.inject({
        method: 'PUT',
        url: `/api/v1/cuisines/${id}/categories`,
        headers: bearer(token),
        payload: {
          items: [
            { categoryKey: 'icecek', minItems: 1 },
            { categoryKey: 'icecek', minItems: 2 },
          ],
        },
      });
      expect(repeated.statusCode).toBe(400);
      const after = (await ctx.app.inject({ method: 'GET', url: `/api/v1/cuisines/${id}/categories`, headers: bearer(token) })).json<{
        data: CuisineCategoryDto[];
      }>();
      expect(after.data).toEqual(before.data);
    });

    it('protects the category routes', async () => {
      expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/categories' })).statusCode).toBe(401);
    });
  });
});
