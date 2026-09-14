import { createAiServices } from './ai/index.js';
import { buildApp } from './app.js';
import { RedisCache } from './cache/redis-cache.js';
import { loadConfig } from './config/env.js';
import { createPostgresDb } from './db/client.js';
import { seedDatabase } from './db/seed/seed.js';
import { EmbeddingService } from './jobs/embedding.service.js';
import { BullJobQueue, startEmbeddingWorker } from './jobs/queue.js';

const config = loadConfig();
const db = createPostgresDb(config.databaseUrl);
const cache = new RedisCache(config.redisUrl);

await db.migrate();
if (config.seedOnStart) {
  const report = await seedDatabase(db.db, { admin: config.admin });
  console.log(`seed: ${JSON.stringify(report)}`);
}

const ai = createAiServices(config, db.db);
const queue = new BullJobQueue(config.redisUrl);
const app = await buildApp({ config, db, cache, ai, queue });

// ROLE=all (default) runs the embedding worker in the API process — enough for a 1 GB droplet.
const worker =
  config.role === 'api'
    ? undefined
    : startEmbeddingWorker(config.redisUrl, new EmbeddingService(db.db, ai.router, ai.prompts), app.log);
if (worker) {
  await queue.scheduleSweep();
  const missing = await app.services.embedding.findMissing(500);
  if (missing.length > 0) await queue.enqueueEmbedding(missing);
}

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
  } finally {
    await Promise.allSettled([worker?.close(), queue.close(), db.close(), cache.close()]);
  }
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

if (config.role !== 'worker') {
  await app.listen({ host: config.host, port: config.port });
} else {
  app.log.info('worker-only mode: HTTP server not started');
}
