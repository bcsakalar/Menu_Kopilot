import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MODELS, TASK_KEYS } from '../../src/config/models.js';
import { type TestContext, bearer, createTestApp, loginAs } from '../helpers/test-app.js';

interface TaskDto {
  taskKey: string;
  chain: { id: string; priority: number; providerConfigured: boolean }[];
  eligibleModels: { id: string }[];
}

describe('settings & prompts API', () => {
  let ctx: TestContext;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    token = (await loginAs(ctx)).accessToken;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lists routing per task with capability-filtered model choices', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/settings/providers', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ tasks: TaskDto[]; providers: { name: string; configured: boolean }[] }>();
    expect(body.tasks).toHaveLength(TASK_KEYS.length);
    expect(body.tasks.find((t) => t.taskKey === 'audio.transcribe')?.chain.map((c) => c.id)).toEqual([
      MODELS.groqWhisperTurbo,
      MODELS.groqWhisper,
    ]);
    const vision = body.tasks.find((t) => t.taskKey === 'vision.menu_extract');
    expect(vision?.chain.map((c) => c.id)).toEqual([MODELS.geminiFlash, MODELS.groqQwen38, MODELS.groqQwen36]);
    expect(vision?.eligibleModels.map((m) => m.id)).not.toContain(MODELS.groqGptOss120b);
    expect(body.providers.every((p) => p.configured)).toBe(true);
  });

  it('changes the primary model of a task and keeps fallbacks', async () => {
    const res = await ctx.app.inject({
      method: 'PUT',
      url: '/api/v1/settings/providers/vision.menu_extract',
      headers: bearer(token),
      payload: { model: MODELS.groqQwen36 },
    });
    expect(res.statusCode).toBe(200);
    const vision = res.json<{ tasks: TaskDto[] }>().tasks.find((t) => t.taskKey === 'vision.menu_extract');
    expect(vision?.chain.map((c) => c.id)).toEqual([MODELS.groqQwen36, MODELS.geminiFlash, MODELS.groqQwen38]);
    const chain = await ctx.ai.routes.chain('vision.menu_extract');
    expect(chain[0]?.model).toBe(MODELS.groqQwen36);
  });

  it('rejects a model that cannot do the task', async () => {
    const res = await ctx.app.inject({
      method: 'PUT',
      url: '/api/v1/settings/providers/vision.menu_extract',
      headers: bearer(token),
      payload: { model: MODELS.groqGptOss20b },
    });
    expect(res.statusCode).toBe(400);
  });

  it('reports the daily quota', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/settings/quota', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ allowed: true, callsToday: 0, dailyCalls: 300, timezone: 'Europe/Istanbul' });
  });

  it('versions prompts without a redeploy', async () => {
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/prompts',
      headers: bearer(token),
      payload: { key: 'enrich.user', content: 'Yeni sürüm: {{cuisine}}\n{{items}}' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ key: 'enrich.user', version: 2, isActive: true });
    const active = await ctx.ai.prompts.render('enrich.user', { cuisine: 'Kebap', items: '1. Adana' });
    expect(active).toEqual({ text: 'Yeni sürüm: Kebap\n1. Adana', version: 2 });

    const list = await ctx.app.inject({ method: 'GET', url: '/api/v1/prompts', headers: bearer(token) });
    const v1 = list
      .json<{ data: { id: string; key: string; version: number }[] }>()
      .data.find((p) => p.key === 'enrich.user' && p.version === 1);
    const back = await ctx.app.inject({ method: 'POST', url: `/api/v1/prompts/${v1?.id}/activate`, headers: bearer(token) });
    expect(back.statusCode).toBe(200);
    expect((await ctx.ai.prompts.get('enrich.user')).version).toBe(1);
  });

  it('protects settings routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/settings/providers' });
    expect(res.statusCode).toBe(401);
  });
});
