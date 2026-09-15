import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cuisines } from '../../src/db/schema/index.js';
import { containsPriceAmount } from '../../src/lib/price-guard.js';
import type { BranchDto, BranchMenuDto } from '../../src/modules/branches/schemas.js';
import type { GapResultDto } from '../../src/modules/gap/schemas.js';
import type { UsageSummary } from '../../src/modules/usage/schemas.js';
import { FakeProvider, hashEmbedding, okJson } from '../helpers/fake-provider.js';
import { type Fixtures, fixtureImage, fixtureResponder, loadFixtures, multipartBody } from '../helpers/fixtures.js';
import { type TestContext, bearer, createTestApp, loginAs } from '../helpers/test-app.js';

describe('branch menu, export and usage summary', () => {
  let fx: Fixtures;
  let ctx: TestContext;
  let gemini: FakeProvider;
  let token: string;
  let branch: BranchDto;
  let gap: GapResultDto;

  const menu = async () => {
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/branches/${branch.id}/menu`, headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    return res.json<BranchMenuDto>();
  };

  beforeAll(async () => {
    fx = loadFixtures();
    gemini = new FakeProvider('gemini', fixtureResponder(fx), (texts, opts) => texts.map((t) => hashEmbedding(t, opts.dim)));
    const groq = new FakeProvider('groq', fixtureResponder(fx));
    ctx = await createTestApp({ providers: { gemini, groq } });
    token = (await loginAs(ctx)).accessToken;
    const [kebap] = await ctx.db.db.select({ id: cuisines.id }).from(cuisines).where(eq(cuisines.slug, 'kebap-izgara'));
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/branches',
      headers: bearer(token),
      payload: { name: 'Karşıyaka Kebapçısı', cuisineId: kebap?.id, targetItemCount: 14 },
    });
    branch = created.json<BranchDto>();
    const body = multipartBody(
      { branchId: branch.id },
      ['panel-1.png', 'panel-2.png'].map((file) => {
        const image = fixtureImage(fx, file);
        return { name: 'images', filename: file, contentType: image.mimeType, data: image.data };
      }),
    );
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/gap-analysis',
      headers: { ...bearer(token), ...body.headers },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(200);
    gap = res.json<GapResultDto>();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns the stored menu with missing fields and template content', async () => {
    expect(gap.status).toBe('completed');
    const { branch: dto, items } = await menu();
    expect(dto).toMatchObject({ currentItemCount: 12, effectiveTarget: 14, recommendedCount: 4 });
    expect(items.filter((i) => i.status !== 'missing')).toHaveLength(12);
    const adana = items.find((i) => i.name === 'Adana Kebap');
    expect(adana).toMatchObject({ status: 'incomplete', source: 'screenshot', missingFields: ['removables'], payload: null });
    expect(adana?.templatePayload?.removableIngredients).toContain('Soğan');
    // Ayran's template has no removable ingredients → not reported as missing.
    expect(items.find((i) => i.name === 'Ayran')?.missingFields).toEqual(['options']);
    const recommended = items.filter((i) => i.status === 'missing');
    expect(recommended.every((i) => i.source === 'recommendation' && (i.reason ?? '').length > 0)).toBe(true);
  });

  it('turns a recommendation confirmed on the phone into a menu item, and deletes items', async () => {
    const recommended = (await menu()).items.find((i) => i.status === 'missing');
    if (!recommended) throw new Error('no recommendation');
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/branches/${branch.id}/menu/${recommended.id}`,
      headers: bearer(token),
      payload: { status: 'ok' },
    });
    expect(res.statusCode).toBe(200);
    const after = res.json<BranchMenuDto>();
    expect(after.branch.currentItemCount).toBe(13);
    expect(after.items.find((i) => i.id === recommended.id)).toMatchObject({ status: 'ok', source: 'manual' });

    const icli = after.items.find((i) => i.name === 'İçli Köfte');
    const removed = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/branches/${branch.id}/menu/${icli?.id ?? ''}`,
      headers: bearer(token),
    });
    expect(removed.statusCode).toBe(204);
    expect((await menu()).branch.currentItemCount).toBe(12);
  });

  it('exports the menu as Excel-friendly CSV and as JSON, without prices', async () => {
    const csv = await ctx.app.inject({ method: 'GET', url: `/api/v1/branches/${branch.id}/export`, headers: bearer(token) });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('karsiyaka-kebapcisi-menu.csv');
    expect(csv.body.startsWith('﻿Ürün;Durum;Kaynak;İçerik;Eksik Alanlar;Açıklama')).toBe(true);
    expect(csv.body).toContain('Adana Kebap;Eksik bilgi;Panel;Şablon;çıkarılabilir malzemeler;');
    expect(containsPriceAmount(csv.body)).toBe(false);

    const json = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/branches/${branch.id}/export?format=json`,
      headers: bearer(token),
    });
    const parsed = json.json<{ branch: { name: string; target: number }; items: { name: string; contentFrom: string | null }[] }>();
    expect(parsed.branch).toMatchObject({ name: 'Karşıyaka Kebapçısı', target: 14 });
    expect(parsed.items.find((i) => i.name === 'Adana Kebap')?.contentFrom).toBe('template');
    expect(parsed.items.find((i) => i.name === 'Şalgam')?.contentFrom).toBeNull();
  });

  it('summarizes AI usage, cache and DB hit ratios for today', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/suggest',
      headers: bearer(token),
      payload: { cuisineId: branch.cuisineId, promptText: 'Adana Kebap, Lahmacun' },
    });
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/usage/summary?range=today', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const summary = res.json<UsageSummary>();
    expect(summary.totals).toMatchObject({ calls: 2, failed: 0 });
    expect(summary.byTask).toEqual([{ taskKey: 'vision.panel_extract', label: 'Panel ekran görüntüsü okuma', calls: 2, failed: 0 }]);
    expect(summary.byModel[0]).toMatchObject({ provider: 'gemini', calls: 2 });
    expect(summary.runs).toMatchObject({ total: 2, suggest: 1, gap: 1, cacheHit: 1, cacheHitRatio: 0.5 });
    expect(summary.cards).toMatchObject({ total: 2, fromDb: 2, dbHitRatio: 1 });
    expect(summary.quota.callsToday).toBe(2);

    const month = await ctx.app.inject({ method: 'GET', url: '/api/v1/usage/summary?range=month', headers: bearer(token) });
    expect(month.json<UsageSummary>().totals.calls).toBe(2);
  });

  describe('a card accepted under another name than the panel shows is one product', () => {
    const panelRow = (rawName: string) => ({
      rawName,
      description: 'absent',
      options: 'present',
      removables: 'absent',
      sectionText: null,
      confidence: 0.9,
    });

    const createBranch = async (name: string) => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/branches',
        headers: bearer(token),
        payload: { name, cuisineId: branch.cuisineId },
      });
      return res.json<BranchDto>();
    };

    const acceptCard = async (branchId: string, name: string) => {
      const run = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/suggest',
        headers: bearer(token),
        payload: { cuisineId: branch.cuisineId, promptText: name, branchId },
      });
      const card = run.json<{ cards: { id: string }[] }>().cards[0];
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/suggestion-items/${card?.id ?? ''}/accept`,
        headers: bearer(token),
        payload: {},
      });
      expect(res.statusCode).toBe(200);
    };

    /** Gap analysis of a custom panel ("menu-pideci.jpg" stands in as the screenshot). */
    const analyze = async (branchId: string, rows: string[]) => {
      const image = fixtureImage(fx, 'menu-pideci.jpg');
      ctx.cache.clear();
      gemini.setResponder((opts, call) =>
        opts.task === 'vision.panel_extract' ? okJson({ items: rows.map(panelRow) }) : fixtureResponder(fx)(opts, call),
      );
      try {
        const body = multipartBody({ branchId }, [{ name: 'images', filename: 'panel.jpg', contentType: image.mimeType, data: image.data }]);
        const res = await ctx.app.inject({
          method: 'POST',
          url: '/api/v1/gap-analysis',
          headers: { ...bearer(token), ...body.headers },
          payload: body.payload,
        });
        return res.json<GapResultDto>();
      } finally {
        gemini.setResponder(fixtureResponder(fx));
      }
    };

    const onMenu = async (branchId: string) => {
      const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/branches/${branchId}/menu`, headers: bearer(token) });
      const data = res.json<BranchMenuDto>();
      return { count: data.branch.currentItemCount, items: data.items.filter((i) => i.status !== 'missing') };
    };

    it('card first, then the panel shows it as "Adana Dürüm"', async () => {
      const b = await createBranch('Kart Önce Şubesi');
      await acceptCard(b.id, 'Adana Kebap');
      expect((await onMenu(b.id)).count).toBe(1);

      const result = await analyze(b.id, ['Adana Dürüm', 'Lahmacun']);
      expect(result.counts?.current).toBe(2);
      const menu = await onMenu(b.id);
      expect(menu.count).toBe(2);
      expect(menu.items.map((i) => i.name).sort()).toEqual(['Adana Dürüm', 'Lahmacun']);
      expect(menu.items.find((i) => i.name === 'Adana Dürüm')?.payload?.name).toBe('Adana Kebap');
    });

    it('panel first, then the card is attached to the panel row', async () => {
      const b = await createBranch('Panel Önce Şubesi');
      await analyze(b.id, ['Adana Dürüm']);
      expect((await onMenu(b.id)).count).toBe(1);

      await acceptCard(b.id, 'Adana Kebap');
      const menu = await onMenu(b.id);
      expect(menu.count).toBe(1);
      expect(menu.items).toHaveLength(1);
      expect(menu.items[0]).toMatchObject({ name: 'Adana Dürüm', status: 'ok' });
      expect(menu.items[0]?.payload?.name).toBe('Adana Kebap');
    });
  });
});
