import { parseArgs } from 'node:util';
import { loadConfig } from '../config/env.js';
import { createPostgresDb } from './client.js';
import { rollbackMigrations } from './migrations.js';

// Usage: pnpm db:rollback [--steps 1] [--all]
const { values } = parseArgs({
  options: {
    steps: { type: 'string', default: '1' },
    all: { type: 'boolean', default: false },
  },
});

const steps = values.all ? Number.MAX_SAFE_INTEGER : Number.parseInt(values.steps, 10);
if (!Number.isFinite(steps) || steps < 1) {
  throw new Error('--steps must be a positive integer');
}

const config = loadConfig();
const handle = createPostgresDb(config.databaseUrl, { max: 1 });
try {
  const rolledBack = await rollbackMigrations(handle.db, steps);
  if (rolledBack.length === 0) {
    console.log('Nothing to roll back.');
  } else {
    for (const r of rolledBack) console.log(`Rolled back ${r.tag}`);
  }
} finally {
  await handle.close();
}
