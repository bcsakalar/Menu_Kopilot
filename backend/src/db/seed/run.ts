import { loadConfig } from '../../config/env.js';
import { createPostgresDb } from '../client.js';
import { seedDatabase } from './seed.js';

const config = loadConfig();
const handle = createPostgresDb(config.databaseUrl, { max: 1 });
try {
  await handle.migrate();
  const report = await seedDatabase(handle.db, { admin: config.admin });
  console.log('Seed finished:', JSON.stringify(report));
} finally {
  await handle.close();
}
