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

  it('0002 moves a vision chain seeded before it to Flash-Lite first and drops qwen3.6', async () => {
    const chain = (task: string) =>
      executeRows(handle.db, sql`select model, params from provider_configs where task_key = ${task} order by priority`);
    // 0003 sits on top of 0002, so both come off before the vision routes can be re-tested.
    expect((await rollbackMigrations(handle.db, 2)).map((r) => r.tag)).toEqual(['0003_agents_categories', '0002_vision_routes']);
    // The vision chain as the first seed wrote it.
    await executeRows(
      handle.db,
      sql`insert into provider_configs (task_key, provider, model, params, priority) values
        ('vision.menu_extract', 'gemini', 'gemini-3.8-flash', '{"thinkingLevel":"low","maxOutputTokens":4096}', 0),
        ('vision.menu_extract', 'groq', 'qwen/qwen3.8-27b', '{"reasoningEffort":"none","maxOutputTokens":4096}', 1),
        ('vision.menu_extract', 'groq', 'qwen/qwen3.6-27b', '{"reasoningEffort":"none","maxOutputTokens":4096}', 2)`,
    );
    await handle.migrate();
    const rows = await chain('vision.menu_extract');
    expect(rows.map((r) => r['model'])).toEqual(['gemini-3.5-flash-lite', 'qwen/qwen3.8-27b', 'gemini-3.8-flash']);
    expect(rows[1]?.['params']).toEqual({ reasoningEffort: 'none', maxOutputTokens: 1000 });
    // No routes yet (fresh install): left to the seed.
    expect(await chain('vision.panel_extract')).toEqual([]);

    expect((await rollbackMigrations(handle.db, 2)).map((r) => r.tag)).toEqual(['0003_agents_categories', '0002_vision_routes']);
    expect((await chain('vision.menu_extract')).map((r) => r['model'])).toEqual([
      'gemini-3.8-flash',
      'qwen/qwen3.8-27b',
      'qwen/qwen3.6-27b',
    ]);
    await executeRows(handle.db, sql`delete from provider_configs returning id`);
    await handle.migrate();
  });

  it('rolls back step by step and re-applies (up → down → up)', async () => {
    // 0003 restores the branch tables as empty structures, so the table count is the same on both sides of it.
    const agents = await rollbackMigrations(handle.db, 1);
    expect(agents.map((r) => r.tag)).toEqual(['0003_agents_categories']);
    expect(await publicTables(handle)).toHaveLength(17);

    const vision = await rollbackMigrations(handle.db, 1);
    expect(vision.map((r) => r.tag)).toEqual(['0002_vision_routes']);
    expect(await publicTables(handle)).toHaveLength(17);

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
