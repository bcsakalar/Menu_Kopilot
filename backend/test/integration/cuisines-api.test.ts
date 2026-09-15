import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestContext, bearer, createTestApp, loginAs } from '../helpers/test-app.js';

interface CuisineDto {
  id: string;
  name: string;
  slug: string;
  isSystem: boolean;
  minItemCount: number;
  targetItemCount: number;
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

  it('lists the 12 system cuisines with template counts and targets', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/cuisines', headers: bearer(token) });
    const { data } = res.json<{ data: CuisineDto[] }>();
    expect(data).toHaveLength(12);
    const kebap = data.find((c) => c.slug === 'kebap-izgara');
    expect(kebap).toMatchObject({ isSystem: true, minItemCount: 10, targetItemCount: 10, templateCount: 9 });
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
});
