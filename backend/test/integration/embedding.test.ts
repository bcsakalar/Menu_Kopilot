import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CircuitBreaker } from '../../src/ai/circuit-breaker.js';
import { ProviderError } from '../../src/ai/errors.js';
import { PromptRepository } from '../../src/ai/prompt-repository.js';
import { CooldownTracker } from '../../src/ai/rate-limit.js';
import { RouteRepository } from '../../src/ai/route-repository.js';
import { AiRouter } from '../../src/ai/router.js';
import { QuotaService, UsageLogger } from '../../src/ai/usage.js';
import type { DbHandle } from '../../src/db/client.js';
import { menuItems } from '../../src/db/schema/index.js';
import { seedDatabase } from '../../src/db/seed/seed.js';
import { EmbeddingService } from '../../src/jobs/embedding.service.js';
import { FakeProvider, hashEmbedding, okJson } from '../helpers/fake-provider.js';
import { createTestDb } from '../helpers/test-db.js';

describe('EmbeddingService', () => {
  let handle: DbHandle;
  let ids: string[];

  function embeddingService(gemini: FakeProvider, localOnly = false): EmbeddingService {
    const router = new AiRouter({
      providers: { gemini },
      routes: new RouteRepository(handle.db, 0),
      breaker: new CircuitBreaker(),
      cooldowns: new CooldownTracker(),
      usage: new UsageLogger(handle.db),
      quota: new QuotaService(handle.db, { dailyCalls: 1000, dailyTokens: 10_000_000, timezone: 'Europe/Istanbul' }),
      prompts: new PromptRepository(handle.db, 0),
      localOnly,
      sleep: () => Promise.resolve(),
      random: () => 0.5,
    });
    return new EmbeddingService(handle.db, router, new PromptRepository(handle.db, 0));
  }

  const working = () => new FakeProvider('gemini', () => okJson({}), (texts, opts) => texts.map((t) => hashEmbedding(t, opts.dim)));

  beforeAll(async () => {
    handle = await createTestDb();
    await seedDatabase(handle.db, {});
    ids = (await handle.db.select({ id: menuItems.id }).from(menuItems).limit(3)).map((row) => row.id);
  });

  afterAll(async () => {
    await handle.close();
  });

  it('does not ask for retries while the key is missing or local-only mode is on', async () => {
    const unconfigured = working();
    unconfigured.configured = false;
    const noKey = await embeddingService(unconfigured).embedTemplates(ids);
    expect(noKey).toMatchObject({ embedded: 0, failed: 3, retryable: false });
    expect(noKey.error).toContain('not_configured');

    const localOnly = await embeddingService(working(), true).embedTemplates(ids);
    expect(localOnly).toMatchObject({ embedded: 0, failed: 3, retryable: false });
  });

  it('retries a provider outage and embeds once the provider is back; unchanged input is skipped', async () => {
    const down = new FakeProvider('gemini', () => okJson({}), () => {
      throw new ProviderError({ kind: 'unavailable', message: 'HTTP 503' });
    });
    const outage = await embeddingService(down).embedTemplates(ids);
    expect(outage).toMatchObject({ embedded: 0, failed: 3, retryable: true });

    const service = embeddingService(working());
    expect(await service.embedTemplates(ids)).toMatchObject({ embedded: 3, failed: 0 });
    expect(await service.embedTemplates(ids)).toMatchObject({ embedded: 0, unchanged: 3, failed: 0 });
  });
});
