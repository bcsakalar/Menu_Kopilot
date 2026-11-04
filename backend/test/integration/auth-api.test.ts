import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '../../src/db/schema/index.js';
import { TEST_ADMIN, type TestContext, createTestApp, loginAs } from '../helpers/test-app.js';

describe('auth API', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('serves liveness and readiness', async () => {
    const live = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toMatchObject({ status: 'ok' });

    const ready = await ctx.app.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ready', checks: { database: 'ok', redis: 'ok' } });
  });

  it('rejects wrong credentials with the error envelope', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_ADMIN.email, password: 'wrong-password', deviceName: 'x' },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json<{ error: { code: string; requestId: string } }>();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.requestId).toBeTruthy();
  });

  it('validates the body', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'not-an-email' } });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
  });

  it('logs in, calls /me and logs out', async () => {
    const tokens = await loginAs(ctx);
    const me = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: TEST_ADMIN.email, role: 'admin' });

    const logout = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it('keeps the admin session in an HttpOnly cookie', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^mk_admin=/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    const me = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: cookie.split(';')[0] ?? '' } });
    expect(me.statusCode).toBe(200);
  });

  it('invalidates tokens when token_version is bumped', async () => {
    const tokens = await loginAs(ctx);
    await ctx.db.db.update(users).set({ tokenVersion: 1 }).where(eq(users.email, TEST_ADMIN.email));
    const me = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(me.statusCode).toBe(401);
  });

  it('requires a token for protected routes and exposes OpenAPI', async () => {
    const me = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(me.statusCode).toBe(401);
    const spec = await ctx.app.inject({ method: 'GET', url: '/openapi.json' });
    expect(spec.statusCode).toBe(200);
    expect(spec.json<{ paths: Record<string, unknown> }>().paths).toHaveProperty('/api/v1/auth/login');
  });
});
