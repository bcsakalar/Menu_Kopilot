import { type AiServices, createAiServices } from '../../src/ai/index.js';
import type { LLMProvider } from '../../src/ai/types.js';
import { type App, buildApp } from '../../src/app.js';
import { MemoryCache } from '../../src/cache/cache.js';
import { type AppConfig, parseEnv } from '../../src/config/env.js';
import type { ProviderName } from '../../src/config/models.js';
import type { DbHandle } from '../../src/db/client.js';
import { seedDatabase } from '../../src/db/seed/seed.js';
import { FakeProvider, hashEmbedding, okJson } from './fake-provider.js';
import { createTestDb } from './test-db.js';

export const TEST_ADMIN = { email: 'admin@test.local', password: 'test-password-123', name: 'Test Admin' };

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'pglite://memory',
    REDIS_URL: 'redis://unused',
    JWT_SECRET: 'test-secret-test-secret-test-secret-123456',
    ADMIN_EMAIL: TEST_ADMIN.email,
    ADMIN_PASSWORD: TEST_ADMIN.password,
    ADMIN_NAME: TEST_ADMIN.name,
    LOG_LEVEL: 'silent',
    ...overrides,
  });
}

export interface TestContext {
  app: App;
  db: DbHandle;
  cache: MemoryCache;
  config: AppConfig;
  ai: AiServices;
  close(): Promise<void>;
}

export interface TestAppOptions {
  seed?: boolean;
  env?: Record<string, string>;
  /** Provider fakes; defaults to fakes that answer `{}` and embed deterministically. */
  providers?: Partial<Record<ProviderName, LLMProvider>>;
}

export function defaultFakeProviders(): { gemini: FakeProvider; groq: FakeProvider } {
  return {
    gemini: new FakeProvider('gemini', () => okJson({}), (texts, opts) => texts.map((t) => hashEmbedding(t, opts.dim))),
    groq: new FakeProvider('groq', () => okJson({})),
  };
}

export async function createTestApp(options: TestAppOptions = {}): Promise<TestContext> {
  const config = testConfig(options.env);
  const db = await createTestDb();
  if (options.seed !== false) {
    await seedDatabase(db.db, { admin: config.admin });
  }
  const cache = new MemoryCache();
  const ai = createAiServices(config, db.db, {
    providers: options.providers ?? defaultFakeProviders(),
    sleep: () => Promise.resolve(),
  });
  const app = await buildApp({ config, db, cache, ai, logger: false });
  await app.ready();
  return {
    app,
    db,
    cache,
    config,
    ai,
    close: async () => {
      await app.close();
      await db.close();
    },
  };
}

export async function loginAs(ctx: TestContext): Promise<{ accessToken: string }> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: TEST_ADMIN.email, password: TEST_ADMIN.password, deviceName: 'vitest' },
  });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  return { accessToken: res.json<{ accessToken: string }>().accessToken };
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
