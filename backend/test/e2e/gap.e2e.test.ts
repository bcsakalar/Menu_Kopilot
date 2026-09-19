import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { branchMenuItems, branches, cuisines, users } from '../../src/db/schema/index.js';
import { normalizeTr } from '../../src/lib/normalize-tr.js';
import { containsPriceAmount } from '../../src/lib/price-guard.js';
import type { BranchDto } from '../../src/modules/branches/schemas.js';
import type {
  CountsDto,
  GapItemDto,
  GapResultDto,
  GapStats,
  QuestionDto,
  RecommendationDto,
} from '../../src/modules/gap/schemas.js';
import type { CardDto, RunDto } from '../../src/modules/suggest/schemas.js';
import { FakeProvider, type FakeResponder, hashEmbedding, okJson } from '../helpers/fake-provider.js';
import {
  type Fixtures,
  type SseMessage,
  fixtureImage,
  fixtureResponder,
  loadFixtures,
  multipartBody,
  parseSse,
} from '../helpers/fixtures.js';
import { type TestContext, bearer, createTestApp, loginAs } from '../helpers/test-app.js';

interface Harness {
  ctx: TestContext;
  token: string;
  gemini: FakeProvider;
  groq: FakeProvider;
}

const PANELS = ['panel-1.png', 'panel-2.png'];

async function harness(fx: Fixtures, env: Record<string, string> = {}): Promise<Harness> {
  const gemini = new FakeProvider('gemini', fixtureResponder(fx), (texts, opts) => texts.map((t) => hashEmbedding(t, opts.dim)));
  const groq = new FakeProvider('groq', fixtureResponder(fx));
  const ctx = await createTestApp({ providers: { gemini, groq }, env });
  return { ctx, token: (await loginAs(ctx)).accessToken, gemini, groq };
}

async function cuisineId(h: Harness, slug: string): Promise<string> {
  const [row] = await h.ctx.db.db.select({ id: cuisines.id }).from(cuisines).where(eq(cuisines.slug, slug));
  if (!row) throw new Error(`cuisine ${slug} missing`);
  return row.id;
}

async function setCuisineMin(h: Harness, slug: string, minItemCount: number): Promise<void> {
  const res = await h.ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/cuisines/${await cuisineId(h, slug)}`,
    headers: bearer(h.token),
    payload: { minItemCount },
  });
  expect(res.statusCode).toBe(200);
}

async function createBranch(h: Harness, slug: string, name: string, extra: Record<string, unknown> = {}): Promise<BranchDto> {
  const res = await h.ctx.app.inject({
    method: 'POST',
    url: '/api/v1/branches',
    headers: bearer(h.token),
    payload: { name, cuisineId: await cuisineId(h, slug), ...extra },
  });
  expect(res.statusCode).toBe(201);
  return res.json<BranchDto>();
}

async function getBranch(h: Harness, id: string): Promise<BranchDto> {
  const res = await h.ctx.app.inject({ method: 'GET', url: `/api/v1/branches/${id}`, headers: bearer(h.token) });
  expect(res.statusCode).toBe(200);
  return res.json<BranchDto>();
}

interface GapStream {
  events: SseMessage[];
  raw: string;
  runId: string;
  counts: CountsDto;
  questions: QuestionDto[];
  appended: QuestionDto[];
  items: GapItemDto[];
  recommendations: Record<'db' | 'ai', RecommendationDto[]>;
  done: { status: GapResultDto['status']; stats: GapStats };
  warnings: string[];
}

function payloadOf<T>(events: readonly SseMessage[], event: string): T[] {
  return events.filter((e) => e.event === event).map((e) => e.data as T);
}

async function gapStream(
  h: Harness,
  fx: Fixtures,
  branchId: string,
  files: readonly string[] = PANELS,
  fields: Record<string, string> = {},
): Promise<GapStream> {
  const body = multipartBody(
    { branchId, ...fields },
    files.map((file) => {
      const image = fixtureImage(fx, file);
      return { name: 'images', filename: file, contentType: image.mimeType, data: image.data };
    }),
  );
  const res = await h.ctx.app.inject({
    method: 'POST',
    url: '/api/v1/gap-analysis',
    headers: { ...bearer(h.token), ...body.headers, accept: 'text/event-stream' },
    payload: body.payload,
  });
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-type']).toContain('text/event-stream');
  const events = parseSse(res.body);
  const [run] = payloadOf<{ runId: string }>(events, 'run');
  const [counts] = payloadOf<{ counts: CountsDto }>(events, 'counts');
  const [questions] = payloadOf<{ items: QuestionDto[] }>(events, 'questions');
  const [items] = payloadOf<{ items: GapItemDto[] }>(events, 'items');
  const [done] = payloadOf<GapStream['done']>(events, 'done');
  const recs = payloadOf<{ source: 'db' | 'ai'; items: RecommendationDto[] }>(events, 'recommendations');
  if (!run || !counts || !questions || !items || !done) throw new Error(`incomplete stream: ${res.body}`);
  return {
    events,
    raw: res.body,
    runId: run.runId,
    counts: counts.counts,
    questions: questions.items,
    appended: payloadOf<{ items: QuestionDto[] }>(events, 'questions_append').flatMap((q) => q.items),
    items: items.items,
    recommendations: {
      db: recs.filter((r) => r.source === 'db').flatMap((r) => r.items),
      ai: recs.filter((r) => r.source === 'ai').flatMap((r) => r.items),
    },
    done,
    warnings: payloadOf<{ code: string }>(events, 'warning').map((w) => w.code),
  };
}

function panelCalls(provider: FakeProvider): number {
  return provider.calls.filter((c) => c.task === 'vision.panel_extract').length;
}

describe('/gap-analysis end-to-end (recorded panel fixtures)', () => {
  let fx: Fixtures;
  let h: Harness;
  let kebap: BranchDto;
  let first: GapStream;

  beforeAll(async () => {
    fx = loadFixtures();
    h = await harness(fx);
    await setCuisineMin(h, 'kebap-izgara', 14);
    kebap = await createBranch(h, 'kebap-izgara', 'Kadıköy Ocakbaşı', { city: 'İstanbul' });
    first = await gapStream(h, fx, kebap.id);
  });

  afterAll(async () => {
    await h.ctx.close();
  });

  it('streams counts and the call list before items and recommendations', () => {
    const order = first.events.map((e) => e.event);
    expect(order[0]).toBe('run');
    expect(order.at(-1)).toBe('done');
    const at = (event: string) => order.indexOf(event);
    expect(at('counts')).toBeGreaterThan(0);
    expect(at('counts')).toBeLessThan(at('questions'));
    expect(at('questions')).toBeLessThan(at('items'));
    expect(at('items')).toBeLessThan(at('recommendations'));
    expect(first.done.status).toBe('completed');
  });

  it('reads 12 unique items from two overlapping screenshots and shows x/target (#5 #6)', () => {
    expect(first.counts).toEqual({
      current: 12,
      target: 14,
      missing: 2,
      fromScreenshots: 12,
      cuisineMin: 14,
      targetOverridden: false,
    });
    expect(first.items).toHaveLength(12);
    expect(new Set(first.items.map((i) => i.normalized)).size).toBe(12);
    expect(first.items.map((i) => i.name)).toContain('Karışık Pide');
    expect(first.items.some((i) => i.name.includes('…'))).toBe(false);
    expect(first.done.stats).toMatchObject({ llmCalls: 2, screenshots: 2, extracted: 15, unique: 12, cacheHit: false });
    expect(first.done.stats.latencyMs).toBeLessThan(8000);
    expect(panelCalls(h.gemini)).toBe(2);
  });

  it('marks missing fields per item, using the matched template to know what is expected', () => {
    const byName = new Map(first.items.map((i) => [i.name, i]));
    expect(byName.get('Adana Kebap')).toMatchObject({
      status: 'incomplete',
      origin: 'seed',
      templateName: 'Adana Kebap',
      missing: [{ field: 'removables', state: 'absent' }],
    });
    expect(byName.get('Kıymalı Pide')).toMatchObject({ status: 'ok', completeness: 1, missing: [], seenIn: 2 });
    // Ayran's template has no removable ingredients → only the options are missing.
    expect(byName.get('Ayran')?.missing).toEqual([{ field: 'options', state: 'absent' }]);
    expect(byName.get('Tavuk Şiş')?.missing).toEqual([
      { field: 'description', state: 'absent' },
      { field: 'removables', state: 'unknown' },
    ]);
    // Seeded in Meze: a product from another cuisine still counts as matched.
    expect(byName.get('İçli Köfte')).toMatchObject({ origin: 'seed', templateName: 'İçli Köfte' });
    expect(byName.get('İçli Köfte')?.matchedTemplateId).toEqual(expect.any(String));
    expect(byName.get('Karışık Pide')?.seenIn).toBe(2);
  });

  it('recommends missing items from the DB (no AI call) and builds the call list', () => {
    expect(first.recommendations.db).toHaveLength(4);
    expect(first.recommendations.ai).toHaveLength(0);
    const onMenu = new Set(first.items.map((i) => i.normalized));
    for (const rec of first.recommendations.db) {
      expect(rec.templateId).not.toBeNull();
      expect(onMenu.has(normalizeTr(rec.name))).toBe(false);
      expect(rec.reason.length).toBeGreaterThan(0);
    }
    expect(h.gemini.calls.some((c) => c.task === 'text.gap_suggest')).toBe(false);

    const q = first.questions;
    expect(q.length).toBeLessThanOrEqual(15);
    expect(new Set(q.map((x) => x.key)).size).toBe(q.length);
    expect(q.slice(0, 2).map((x) => x.text)).toEqual(first.recommendations.db.slice(0, 2).map((r) => `${r.name} var mı?`));
    expect(q.map((x) => x.text)).toContain('Lahmacun: açıklamayı, seçenekleri ve çıkarılabilir malzemeleri sor');
    expect(q.some((x) => x.kind === 'cuisine')).toBe(true);
    expect(containsPriceAmount(first.raw)).toBe(false);
  });

  it('persists the snapshot and the branch menu', async () => {
    const branch = await getBranch(h, kebap.id);
    expect(branch).toMatchObject({ currentItemCount: 12, effectiveTarget: 14, missingCount: 2, recommendedCount: 4 });
    expect(branch.lastGapAt).not.toBeNull();
    const rows = await h.ctx.db.db
      .select({ status: branchMenuItems.status, source: branchMenuItems.source })
      .from(branchMenuItems)
      .where(eq(branchMenuItems.branchId, kebap.id));
    expect(rows.filter((r) => r.status !== 'missing')).toHaveLength(12);
    expect(rows.filter((r) => r.status === 'missing' && r.source === 'recommendation')).toHaveLength(4);

    const res = await h.ctx.app.inject({ method: 'GET', url: `/api/v1/gap-analysis/${first.runId}`, headers: bearer(h.token) });
    expect(res.statusCode).toBe(200);
    const result = res.json<GapResultDto>();
    expect(result).toMatchObject({ runId: first.runId, branchId: kebap.id, status: 'completed', counts: first.counts });
    expect(result.questions).toEqual(first.questions);
    expect(result.items).toHaveLength(12);

    const latest = await h.ctx.app.inject({
      method: 'GET',
      url: `/api/v1/branches/${kebap.id}/gap/latest`,
      headers: bearer(h.token),
    });
    expect(latest.json<GapResultDto>().runId).toBe(first.runId);
  });

  it('replays a finished analysis over SSE', async () => {
    const res = await h.ctx.app.inject({
      method: 'GET',
      url: `/api/v1/gap-analysis/${first.runId}/events`,
      headers: bearer(h.token),
    });
    const events = parseSse(res.body).map((e) => e.event);
    expect(events[0]).toBe('run');
    expect(events).toContain('counts');
    expect(events.at(-1)).toBe('done');
  });

  it('serves a repeated analysis from the extraction cache without double counting', async () => {
    const before = panelCalls(h.gemini);
    const again = await gapStream(h, fx, kebap.id);
    expect(panelCalls(h.gemini)).toBe(before);
    expect(again.done.stats).toMatchObject({ llmCalls: 0, cacheHit: true });
    expect(again.counts.current).toBe(12);
    expect(again.recommendations.db.map((r) => r.name)).toEqual(first.recommendations.db.map((r) => r.name));
  });

  it('counts a card accepted in Mod 1 for the branch and stops recommending it', async () => {
    const recommended = first.recommendations.db[0];
    if (!recommended) throw new Error('no recommendation');
    const suggest = await h.ctx.app.inject({
      method: 'POST',
      url: '/api/v1/suggest',
      headers: bearer(h.token),
      payload: { cuisineId: await cuisineId(h, 'kebap-izgara'), promptText: recommended.name, branchId: kebap.id },
    });
    const card = suggest.json<RunDto>().cards[0] as CardDto;
    expect(card.origin).toBe('seed');
    const accept = await h.ctx.app.inject({
      method: 'POST',
      url: `/api/v1/suggestion-items/${card.id}/accept`,
      headers: bearer(h.token),
      payload: {},
    });
    expect(accept.statusCode).toBe(200);
    expect((await getBranch(h, kebap.id)).currentItemCount).toBe(13);

    const again = await gapStream(h, fx, kebap.id);
    expect(again.counts).toMatchObject({ current: 13, missing: 1 });
    expect(again.recommendations.db.map((r) => r.name)).not.toContain(recommended.name);
    expect(again.questions.map((q) => q.text)).not.toContain(`${recommended.name} var mı?`);
  });

  it('uses the manual target override', async () => {
    const patch = await h.ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/branches/${kebap.id}`,
      headers: bearer(h.token),
      payload: { targetItemCount: 20 },
    });
    expect(patch.json<BranchDto>()).toMatchObject({ targetItemCount: 20, effectiveTarget: 20 });
    const again = await gapStream(h, fx, kebap.id);
    expect(again.counts).toMatchObject({ target: 20, targetOverridden: true, missing: 7 });
    const reset = await h.ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/branches/${kebap.id}`,
      headers: bearer(h.token),
      payload: { targetItemCount: null },
    });
    expect(reset.json<BranchDto>()).toMatchObject({ targetItemCount: null, effectiveTarget: 14 });
  });

  it('asks text.gap_suggest only for what the DB cannot fill, then caches the answer', async () => {
    // A user cuisine with a single template: the DB fills one slot and the AI is asked for the rest.
    const created = await h.ctx.app.inject({
      method: 'POST',
      url: '/api/v1/cuisines',
      headers: bearer(h.token),
      payload: { name: 'Dürümcü Test', minItemCount: 14 },
    });
    expect(created.statusCode).toBe(201);
    const durumcu = created.json<{ id: string; slug: string }>();
    const zirhDurum = await h.ctx.app.inject({
      method: 'POST',
      url: '/api/v1/templates',
      headers: bearer(h.token),
      payload: {
        cuisineId: durumcu.id,
        aliases: ['Zırhlı Dürüm'],
        importance: 80,
        payload: {
          name: 'Zırh Dürüm',
          description: 'Zırhla çekilmiş kuzu eti közde pişirilir; domates, soğan ve maydanozla lavaşa sarılarak servis edilir.',
          servingNote: 'Sıcak servis; kağıda sarılı gönderilir.',
          portionInfo: '1 adet',
          optionGroups: [],
          removableIngredients: ['Soğan'],
          extraIngredients: [],
          tags: ['dürüm'],
          allergenNotes: ['Gluten (lavaş)'],
          upsellSuggestion: 'Ayran önerilebilir.',
        },
      },
    });
    expect(zirhDurum.statusCode).toBe(201);
    const branch = await createBranch(h, durumcu.slug, 'Moda Dürüm');
    const aiReply: FakeResponder = (opts, call) =>
      opts.task === 'text.gap_suggest'
        ? okJson({
            items: [
              { name: 'Kuzu Dürüm', reason: 'Dürümcülerin temel ürünü', importance: 90 },
              // Alias of the recommended "Zırh Dürüm" → same template, dropped.
              { name: 'Zırhlı Dürüm', reason: 'Zırh kıymalı', importance: 96 },
              { name: 'Adana Kebap', reason: 'Zaten menüde', importance: 95 },
              { name: 'Sebzeli Dürüm 45 TL', reason: 'Etsiz seçenek, 45 TL', importance: 60 },
              { name: 'Kaşarlı Sucuklu Dürüm', reason: 'Peynir sevenler için', importance: 85 },
            ],
          })
        : fixtureResponder(fx)(opts, call);
    h.gemini.setResponder(aiReply);
    try {
      const result = await gapStream(h, fx, branch.id);
      expect(result.recommendations.db.map((r) => r.name)).toEqual(['Zırh Dürüm']);
      expect(result.recommendations.ai.map((r) => r.name)).toEqual(['Kuzu Dürüm', 'Kaşarlı Sucuklu Dürüm', 'Sebzeli Dürüm']);
      expect(result.recommendations.ai.every((r) => r.source === 'ai' && !containsPriceAmount(`${r.name} ${r.reason}`))).toBe(true);
      expect(result.appended.map((q) => q.text)).toEqual(['Kuzu Dürüm var mı?']);
      const order = result.events.map((e) => e.event);
      expect(order.indexOf('questions_append')).toBeGreaterThan(order.lastIndexOf('recommendations'));
      expect(result.done.stats.llmCalls).toBe(1);
      expect(containsPriceAmount(result.raw)).toBe(false);

      const suggestCalls = () => h.gemini.calls.filter((c) => c.task === 'text.gap_suggest').length;
      const before = suggestCalls();
      const again = await gapStream(h, fx, branch.id);
      expect(suggestCalls()).toBe(before);
      expect(again.done.stats.llmCalls).toBe(0);
      expect(again.recommendations.ai.map((r) => r.name)).toEqual(['Kuzu Dürüm', 'Kaşarlı Sucuklu Dürüm', 'Sebzeli Dürüm']);
    } finally {
      h.gemini.setResponder(fixtureResponder(fx));
    }
  });

  it('LOCAL_ONLY_MODE: never calls a provider, uses cached screenshots and the DB', async () => {
    const local = await harness(fx, { LOCAL_ONLY_MODE: 'true' });
    try {
      const branch = await createBranch(local, 'kebap-izgara', 'Yerel Şube');
      const cold = await gapStream(local, fx, branch.id);
      expect(cold.done.status).toBe('failed');
      expect(cold.warnings).toContain('ai_unavailable');
      expect(cold.counts).toMatchObject({ current: 0, target: 10, missing: 10 });
      expect(cold.recommendations.db).toHaveLength(10);

      for (const key of h.ctx.cache.keys().filter((k) => k.startsWith('mk:p:'))) {
        const value = await h.ctx.cache.get(key);
        if (value) await local.ctx.cache.set(key, value, 3600);
      }
      const warm = await gapStream(local, fx, branch.id);
      expect(warm.done.status).toBe('completed');
      expect(warm.items).toHaveLength(12);
      expect(local.gemini.calls.length + local.groq.calls.length).toBe(0);
    } finally {
      await local.ctx.close();
    }
  });

  it('validates input and scopes branches to their owner', async () => {
    const noImages = multipartBody({ branchId: kebap.id }, []);
    const res = await h.ctx.app.inject({
      method: 'POST',
      url: '/api/v1/gap-analysis',
      headers: { ...bearer(h.token), ...noImages.headers },
      payload: noImages.payload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');

    const [other] = await h.ctx.db.db
      .insert(users)
      .values({ email: `other-${randomUUID()}@test.local`, name: 'Başka', passwordHash: 'x' })
      .returning({ id: users.id });
    if (!other) throw new Error('user insert failed');
    const [foreign] = await h.ctx.db.db
      .insert(branches)
      .values({ userId: other.id, name: 'Başkasının Şubesi', cuisineId: await cuisineId(h, 'kebap-izgara') })
      .returning({ id: branches.id });
    if (!foreign) throw new Error('branch insert failed');
    const image = fixtureImage(fx, 'panel-1.png');
    const body = multipartBody({ branchId: foreign.id }, [
      { name: 'images', filename: 'panel-1.png', contentType: image.mimeType, data: image.data },
    ]);
    const denied = await h.ctx.app.inject({
      method: 'POST',
      url: '/api/v1/gap-analysis',
      headers: { ...bearer(h.token), ...body.headers },
      payload: body.payload,
    });
    expect(denied.statusCode).toBe(404);
    const list = await h.ctx.app.inject({ method: 'GET', url: '/api/v1/branches', headers: bearer(h.token) });
    expect(list.json<{ data: BranchDto[] }>().data.some((b) => b.id === foreign.id)).toBe(false);

    const unknownRun = await h.ctx.app.inject({
      method: 'GET',
      url: `/api/v1/gap-analysis/${randomUUID()}`,
      headers: bearer(h.token),
    });
    expect(unknownRun.statusCode).toBe(404);
  });
});

describe('/gap-analysis with typed or dictated products', () => {
  let fx: Fixtures;
  let h: Harness;

  beforeAll(async () => {
    fx = loadFixtures();
    h = await harness(fx);
  });

  afterAll(async () => {
    await h.ctx.close();
  });

  it('works without screenshots and without any AI key: counts, DB recommendations, call list', async () => {
    h.gemini.configured = false;
    h.groq.configured = false;
    try {
      const branch = await createBranch(h, 'kebap-izgara', 'Telefonla Şube');
      const run = await gapStream(h, fx, branch.id, [], { menuText: 'adana kebap, Lahmacun ve ayran var. Bir de zıkkım dürüm' });
      expect(run.done.status).toBe('completed');
      expect(run.done.stats).toMatchObject({ llmCalls: 0, screenshots: 0, typed: 4, unique: 4 });
      expect(run.counts).toMatchObject({ current: 4, target: 10, missing: 6 });
      expect(run.items.map((i) => i.name)).toEqual(['Adana Kebap', 'Lahmacun', 'Ayran', 'Zıkkım Dürüm']);
      expect(run.items.every((i) => i.typed && i.missing.length === 0)).toBe(true);
      expect(run.items.filter((i) => i.matchedTemplateId).map((i) => i.templateName)).toEqual(['Adana Kebap', 'Lahmacun', 'Ayran']);
      expect(run.questions.some((q) => q.kind === 'missing_field')).toBe(false);
      const recommended = run.recommendations.db.map((r) => normalizeTr(r.name));
      expect(recommended.length).toBeGreaterThan(0);
      for (const onMenu of ['Adana Kebap', 'Lahmacun', 'Ayran']) expect(recommended).not.toContain(normalizeTr(onMenu));
      expect(h.gemini.calls.length + h.groq.calls.length).toBe(0);

      expect((await getBranch(h, branch.id)).currentItemCount).toBe(4);
      const rows = await h.ctx.db.db.select().from(branchMenuItems).where(eq(branchMenuItems.branchId, branch.id));
      expect(rows.filter((r) => r.status !== 'missing').every((r) => r.source === 'manual' && r.status === 'incomplete')).toBe(true);
    } finally {
      h.gemini.configured = true;
      h.groq.configured = true;
    }
  });

  it('never overwrites what a card says; a recommended product the user now names moves onto the menu', async () => {
    const branch = await createBranch(h, 'kebap-izgara', 'Karma Şube');
    await h.ctx.db.db.insert(branchMenuItems).values({
      branchId: branch.id,
      rawName: 'Beyti Sarma',
      normalizedName: normalizeTr('Beyti Sarma'),
      status: 'ok',
      source: 'suggestion',
      hasDescription: true,
      hasOptions: true,
      hasRemovables: true,
      completenessScore: 1,
    });
    const first = await gapStream(h, fx, branch.id, [], { menuText: 'Adana Kebap' });
    expect(first.counts.current).toBe(2);
    const recommended = first.recommendations.db.find((r) => normalizeTr(r.name) !== normalizeTr('Beyti Sarma'));
    if (!recommended) throw new Error('expected a DB recommendation');

    const second = await gapStream(h, fx, branch.id, [], { menuText: `Beyti Sarma, ${recommended.name}` });
    expect(second.counts.current).toBe(3);
    const rows = await h.ctx.db.db.select().from(branchMenuItems).where(eq(branchMenuItems.branchId, branch.id));
    const beyti = rows.find((r) => r.normalizedName === normalizeTr('Beyti Sarma'));
    expect(beyti).toMatchObject({ status: 'ok', source: 'suggestion', completenessScore: 1 });
    const moved = rows.find((r) => r.normalizedName === normalizeTr(recommended.name));
    expect(moved).toMatchObject({ status: 'incomplete', source: 'manual' });
    expect((await getBranch(h, branch.id)).currentItemCount).toBe(3);
  });

  it('does not count a typed product twice when a screenshot already shows it', async () => {
    const shots = await gapStream(h, fx, (await createBranch(h, 'kebap-izgara', 'Sadece Görüntü')).id, ['panel-1.png']);
    const seen = shots.items[0];
    if (!seen) throw new Error('panel fixture has no items');
    const mixed = await gapStream(h, fx, (await createBranch(h, 'kebap-izgara', 'Görüntü + Liste')).id, ['panel-1.png'], {
      menuText: `${seen.name.toLocaleLowerCase('tr-TR')}, Zıkkım Dürüm`,
    });
    expect(mixed.items).toHaveLength(shots.items.length + 1);
    expect(mixed.items.filter((i) => i.typed).map((i) => i.name)).toEqual(['Zıkkım Dürüm']);
    expect(mixed.done.stats).toMatchObject({ screenshots: 1, typed: 2 });
  });

  it('needs screenshots or at least one product name', async () => {
    const branch = await createBranch(h, 'kebap-izgara', 'Boş İstek');
    const body = multipartBody({ branchId: branch.id, menuText: ' , ; ' }, []);
    const res = await h.ctx.app.inject({
      method: 'POST',
      url: '/api/v1/gap-analysis',
      headers: { ...bearer(h.token), ...body.headers },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { message: string } }>().error.message).toContain('ürünleri yaz');
  });
});

describe('/branches CRUD', () => {
  let fx: Fixtures;
  let h: Harness;

  beforeAll(async () => {
    fx = loadFixtures();
    h = await harness(fx);
  });

  afterAll(async () => {
    await h.ctx.close();
  });

  it('creates, lists, edits and deletes branches', async () => {
    const created = await createBranch(h, 'doner', 'Bornova Dönerci', { city: 'İzmir', notes: 'Açılış Ekim' });
    expect(created).toMatchObject({
      name: 'Bornova Dönerci',
      city: 'İzmir',
      cuisineName: 'Döner',
      status: 'in_progress',
      targetItemCount: null,
      effectiveTarget: 10,
      currentItemCount: 0,
      missingCount: 10,
      recommendedCount: 0,
      lastGapAt: null,
    });
    const list = await h.ctx.app.inject({ method: 'GET', url: '/api/v1/branches', headers: bearer(h.token) });
    expect(list.json<{ data: BranchDto[] }>().data.map((b) => b.id)).toContain(created.id);

    const patched = await h.ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/branches/${created.id}`,
      headers: bearer(h.token),
      payload: { status: 'ready', targetItemCount: 12, cuisineId: await cuisineId(h, 'kebap-izgara') },
    });
    expect(patched.json<BranchDto>()).toMatchObject({ status: 'ready', effectiveTarget: 12, cuisineName: 'Kebap & Izgara' });

    const noLatest = await h.ctx.app.inject({
      method: 'GET',
      url: `/api/v1/branches/${created.id}/gap/latest`,
      headers: bearer(h.token),
    });
    expect(noLatest.statusCode).toBe(404);

    const removed = await h.ctx.app.inject({ method: 'DELETE', url: `/api/v1/branches/${created.id}`, headers: bearer(h.token) });
    expect(removed.statusCode).toBe(204);
    const gone = await h.ctx.app.inject({ method: 'GET', url: `/api/v1/branches/${created.id}`, headers: bearer(h.token) });
    expect(gone.statusCode).toBe(404);
    const [count] = await h.ctx.db.db
      .select({ n: sql<number>`count(*)::int` })
      .from(branches)
      .where(and(eq(branches.id, created.id)));
    expect(count?.n).toBe(0);
  });

  it('rejects invalid input', async () => {
    const badCuisine = await h.ctx.app.inject({
      method: 'POST',
      url: '/api/v1/branches',
      headers: bearer(h.token),
      payload: { name: 'X Şube', cuisineId: randomUUID() },
    });
    expect(badCuisine.statusCode).toBe(400);
    const badTarget = await h.ctx.app.inject({
      method: 'POST',
      url: '/api/v1/branches',
      headers: bearer(h.token),
      payload: { name: 'X Şube', cuisineId: await cuisineId(h, 'doner'), targetItemCount: 0 },
    });
    expect(badTarget.statusCode).toBe(400);
  });
});
