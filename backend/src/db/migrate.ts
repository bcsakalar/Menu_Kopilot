import { loadConfig } from '../config/env.js';
import { createPostgresDb } from './client.js';

const config = loadConfig();
const handle = createPostgresDb(config.databaseUrl, { max: 1 });
try {
  await handle.migrate();
  console.log('Migrations applied.');
} finally {
  await handle.close();
}
