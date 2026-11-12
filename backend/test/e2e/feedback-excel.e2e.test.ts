import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { conversations, menuItems, users } from '../../src/db/schema/index.js';
import type { ImportReport } from '../../src/modules/templates/schemas.js';
import { multipartBody } from '../helpers/fixtures.js';
import { type TestContext, bearer, createTestApp, loginAs } from '../helpers/test-app.js';

/** D-206: what reps tell the team, and the template pool as a spreadsheet. */
describe('feedback and the Excel template pool', () => {
  let ctx: TestContext;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    token = (await loginAs(ctx)).accessToken;
  });

  afterAll(async () => {
    await ctx.close();
  });

  const upload = async (file: Buffer, dryRun: boolean) => {
    const body = multipartBody({}, [{ name: 'file', filename: 'sablon.xlsx', contentType: 'application/octet-stream', data: file }]);
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/templates/excel/import?dryRun=${String(dryRun)}`,
      headers: { ...bearer(token), ...body.headers },
      payload: body.payload,
    });
    return res;
  };

  it('a visitor sends feedback; a foreign conversation is not attached; the panel reads and closes it', async () => {
    const [stranger] = await ctx.db.db.insert(users).values({ email: 'stranger@visitor.local', name: 'Ziyaretçi', passwordHash: 'x' }).returning({ id: users.id });
    const [foreign] = await ctx.db.db.insert(conversations).values({ userId: stranger!.id, title: 'Başkasının görüşmesi' }).returning({ id: conversations.id });

    const sent = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/feedback',
      payload: { kind: 'oneri', message: 'İçecek önerileri daha çok olsun', name: 'Ayşe', conversationId: foreign!.id },
    });
    expect(sent.statusCode).toBe(201);
    expect(String(sent.headers['set-cookie'])).toMatch(/^mk_visitor=/);

    const tooShort = await ctx.app.inject({ method: 'POST', url: '/api/v1/feedback', payload: { kind: 'hata', message: 'a' } });
    expect(tooShort.statusCode).toBe(400);

    const cookie = String(sent.headers['set-cookie']).split(';')[0]!;
    const asVisitor = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/feedback', headers: { cookie } });
    expect([401, 403]).toContain(asVisitor.statusCode);

    const list = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/feedback', headers: bearer(token) });
    expect(list.statusCode).toBe(200);
    const body = list.json<{ data: { id: string; status: string; conversationId: string | null; authorName: string }[]; counts: Record<string, number> }>();
    expect(body.counts).toEqual({ new: 1, seen: 0, done: 0 });
    expect(body.data[0]).toMatchObject({ status: 'new', conversationId: null, authorName: 'Ayşe' });

    const done = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/feedback/${body.data[0]!.id}`,
      headers: bearer(token),
      payload: { status: 'done', adminNote: 'İçecek şablonları eklendi' },
    });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ status: 'done', adminNote: 'İçecek şablonları eklendi' });
  });

  it('the sample previews, imports once, and a second import changes nothing', async () => {
    const sample = await ctx.app.inject({ method: 'GET', url: '/api/v1/templates/excel/sample', headers: bearer(token) });
    expect(sample.statusCode).toBe(200);
    expect(sample.headers['content-type']).toContain('spreadsheetml');
    const file = sample.rawPayload;

    const preview = await upload(file, true);
    expect(preview.statusCode).toBe(200);
    const planned = preview.json<ImportReport>();
    expect(planned).toMatchObject({ dryRun: true, rows: 3, errors: [] });
    // Adana Kebap and Ayran-like rows may already be seeds; Limonata is new to its cuisine either way.
    expect(planned.created + planned.updated + planned.unchanged).toBe(3);
    const before = await ctx.db.db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.source, 'imported'));
    expect(before).toHaveLength(0);

    const real = await upload(file, false);
    expect(real.json<ImportReport>()).toMatchObject({ dryRun: false, created: planned.created, updated: planned.updated });
    const imported = await ctx.db.db.select({ name: menuItems.canonicalName }).from(menuItems).where(eq(menuItems.source, 'imported'));
    expect(imported.length).toBe(planned.created + planned.updated);

    const again = await upload(file, false);
    expect(again.json<ImportReport>()).toMatchObject({ created: 0, updated: 0, unchanged: 3 });
  });

  it('an export of the whole pool re-imports without a single change', async () => {
    const exported = await ctx.app.inject({ method: 'GET', url: '/api/v1/templates/excel/export', headers: bearer(token) });
    expect(exported.statusCode).toBe(200);
    const report = (await upload(exported.rawPayload, true)).json<ImportReport>();
    expect(report.errors).toEqual([]);
    expect(report.items.filter((i) => i.action !== 'same').map((i) => `${i.cuisine}/${i.name}`)).toEqual([]);
    expect(report.unchanged).toBeGreaterThan(400);
  });

  it('a file that is not a spreadsheet gets a plain answer', async () => {
    const res = await upload(Buffer.from('ad,soyad\nx,y'), true);
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { message: string } }>().error.message).toMatch(/xlsx/);
  });
});
