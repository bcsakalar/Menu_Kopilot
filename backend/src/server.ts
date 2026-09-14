import { buildApp } from './app.js';
import { RedisCache } from './cache/redis-cache.js';
import { loadConfig } from './config/env.js';
import { createPostgresDb } from './db/client.js';
import { seedDatabase } from './db/seed/seed.js';

const config = loadConfig();
const db = createPostgresDb(config.databaseUrl);
const cache = new RedisCache(config.redisUrl);

await db.migrate();
if (config.seedOnStart) {
  const report = await seedDatabase(db.db, { admin: config.admin });
  console.log(`seed: ${JSON.stringify(report)}`);
}

const app = await buildApp({ config, db, cache });

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
  } finally {
    await Promise.allSettled([db.close(), cache.close()]);
  }
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: config.host, port: config.port });
