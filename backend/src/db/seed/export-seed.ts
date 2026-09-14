import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../../config/env.js';
import { type TemplateCsvEntry, templatesToCsv } from '../../modules/export/template-csv.js';
import { getTemplates } from '../../modules/templates/template-store.js';
import { createPostgresDb } from '../client.js';
import { cuisines, menuItems } from '../schema/index.js';
import { SEED_CUISINES } from './cuisines.js';
import { SEED_TEMPLATES } from './templates.js';

// Usage: pnpm db:export-seed [--from db|files] [--out exports/seed-templates.csv]
const { values } = parseArgs({
  options: {
    from: { type: 'string', default: 'db' },
    out: { type: 'string', default: 'exports/seed-templates.csv' },
  },
});

function fromFiles(): TemplateCsvEntry[] {
  const names = new Map(SEED_CUISINES.map((c) => [c.slug, c.name]));
  return SEED_TEMPLATES.map((t) => ({
    cuisineName: names.get(t.cuisine) ?? t.cuisine,
    payload: t.payload,
    aliases: t.aliases,
    importance: t.importance,
    source: 'seed',
  }));
}

async function fromDb(): Promise<TemplateCsvEntry[]> {
  const config = loadConfig();
  const handle = createPostgresDb(config.databaseUrl, { max: 1 });
  try {
    const rows = await handle.db
      .select({ id: menuItems.id, cuisineName: cuisines.name })
      .from(menuItems)
      .innerJoin(cuisines, eq(menuItems.cuisineId, cuisines.id))
      .where(eq(menuItems.source, 'seed'))
      .orderBy(cuisines.name, menuItems.canonicalName);
    const records = await getTemplates(
      handle.db,
      rows.map((r) => r.id),
    );
    const cuisineById = new Map(rows.map((r) => [r.id, r.cuisineName]));
    return records.map((r) => ({
      cuisineName: cuisineById.get(r.id) ?? '',
      payload: r.payload,
      aliases: r.aliases,
      importance: r.importance,
      source: r.source,
    }));
  } finally {
    await handle.close();
  }
}

if (values.from !== 'db' && values.from !== 'files') {
  throw new Error('--from must be "db" or "files"');
}
const entries = values.from === 'files' ? fromFiles() : await fromDb();
const outPath = resolve(values.out);
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, templatesToCsv(entries), 'utf8');
console.log(`Exported ${entries.length} seed templates → ${outPath}`);
