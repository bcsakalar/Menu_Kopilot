import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '../../src/db/client.js';
import { rollbackMigrations, splitStatements } from '../../src/db/migrations.js';
import { executeRows } from '../../src/db/raw.js';
import { createTestDb } from '../helpers/test-db.js';

async function publicTables(handle: DbHandle): Promise<string[]> {
  const rows = await executeRows(
    handle.db,
    sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
  );
  return rows.map((r) => String(r['table_name']));
}

async function extensions(handle: DbHandle): Promise<string[]> {
  const rows = await executeRows(handle.db, sql`select extname from pg_extension order by extname`);
  return rows.map((r) => String(r['extname']));
}

describe('migrations', () => {
  let handle: DbHandle;

  beforeAll(async () => {
    handle = await createTestDb({ migrate: false });
  });

  afterAll(async () => {
    await handle.close();
  });

  it('applies all migrations (17 tables + extensions)', async () => {
    await handle.migrate();
    const tables = await publicTables(handle);
    expect(tables).toHaveLength(17);
    expect(tables).toContain('menu_items');
    expect(tables).toContain('item_embeddings');
    expect(await extensions(handle)).toEqual(expect.arrayContaining(['pg_trgm', 'vector']));
  });

  it('creates the HNSW and trigram indexes', async () => {
    const rows = await executeRows(
      handle.db,
      sql`select indexname, indexdef from pg_indexes where schemaname = 'public'`,
    );
    const defs = rows.map((r) => String(r['indexdef']));
    expect(defs.some((d) => d.includes('USING hnsw') && d.includes('vector_cosine_ops'))).toBe(true);
    expect(defs.some((d) => d.includes('USING gin') && d.includes('gin_trgm_ops'))).toBe(true);
  });

  it('rolls back step by step and re-applies (up → down → up)', async () => {
    const first = await rollbackMigrations(handle.db, 1);
    expect(first.map((r) => r.tag)).toEqual(['0001_init']);
    expect(await publicTables(handle)).toHaveLength(0);
    expect(await extensions(handle)).toEqual(expect.arrayContaining(['vector']));

    const second = await rollbackMigrations(handle.db, 1);
    expect(second.map((r) => r.tag)).toEqual(['0000_extensions']);
    expect(await extensions(handle)).not.toContain('vector');

    expect(await rollbackMigrations(handle.db, 1)).toEqual([]);

    await handle.migrate();
    expect(await publicTables(handle)).toHaveLength(17);
  });

  it('splits statements on drizzle breakpoints and drops comment-only chunks', () => {
    expect(splitStatements('-- c\nA;\n--> statement-breakpoint\nB;\n--> statement-breakpoint\n-- only comment\n')).toEqual([
      '-- c\nA;',
      'B;',
    ]);
  });
});
