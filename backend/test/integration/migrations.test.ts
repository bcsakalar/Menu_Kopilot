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

  it('applies all migrations (22 tables + extensions)', async () => {
    await handle.migrate();
    const tables = await publicTables(handle);
    expect(tables).toHaveLength(22);
    // 0008: the reps' feedback.
    expect(tables).toContain('feedback');
    // 0004: the product-type knowledge base and the feedback log of the learning loop.
    expect(tables).toEqual(expect.arrayContaining(['product_types', 'suggestion_feedback']));
    expect(tables).toContain('menu_items');
    expect(tables).toContain('item_embeddings');
    // 0005: the history's mode filter and the learning loop's cuisine and "Geri al" columns.
    const columns = await executeRows(
      handle.db,
      sql`select table_name, column_name from information_schema.columns where table_schema = 'public'
          and (table_name, column_name) in (('suggestion_runs', 'analysis_mode'), ('suggestion_feedback', 'cuisine_id'),
                                            ('suggestion_feedback', 'ignored_at'), ('suggestion_feedback', 'ignored_by'))`,
    );
    expect(columns).toHaveLength(4);
    // 0006: the seller's answer on the call.
    const answers = await executeRows(
      handle.db,
      sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'suggestion_items'
          and column_name in ('answer', 'answered_at')`,
    );
    expect(answers).toHaveLength(2);
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
    // 0003 to 0010 sit on top of 0002, so all nine come off before the vision routes can be re-tested.
    expect((await rollbackMigrations(handle.db, 9)).map((r) => r.tag)).toEqual([
      '0010_merge_pasta_cuisine',
      '0009_drink_minimum',
      '0008_feedback_cuisine_names',
      '0007_web_chat',
      '0006_seller_answers',
      '0005_learning_history',
      '0004_product_types',
      '0003_agents_categories',
      '0002_vision_routes',
    ]);
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

    expect((await rollbackMigrations(handle.db, 9)).map((r) => r.tag)).toEqual([
      '0010_merge_pasta_cuisine',
      '0009_drink_minimum',
      '0008_feedback_cuisine_names',
      '0007_web_chat',
      '0006_seller_answers',
      '0005_learning_history',
      '0004_product_types',
      '0003_agents_categories',
      '0002_vision_routes',
    ]);
    expect((await chain('vision.menu_extract')).map((r) => r['model'])).toEqual([
      'gemini-3.8-flash',
      'qwen/qwen3.8-27b',
      'qwen/qwen3.6-27b',
    ]);
    await executeRows(handle.db, sql`delete from provider_configs returning id`);
    await handle.migrate();
  });

  it('rolls back step by step and re-applies (up → down → up)', async () => {
    // 0010 and 0009 only change rows.
    const pasta = await rollbackMigrations(handle.db, 1);
    expect(pasta.map((r) => r.tag)).toEqual(['0010_merge_pasta_cuisine']);
    expect(await publicTables(handle)).toHaveLength(22);

    const drinks = await rollbackMigrations(handle.db, 1);
    expect(drinks.map((r) => r.tag)).toEqual(['0009_drink_minimum']);
    expect(await publicTables(handle)).toHaveLength(22);

    // 0008 takes the feedback table with it.
    const feedback = await rollbackMigrations(handle.db, 1);
    expect(feedback.map((r) => r.tag)).toEqual(['0008_feedback_cuisine_names']);
    expect(await publicTables(handle)).toHaveLength(21);

    // 0007 takes the two chat tables with it.
    const chat = await rollbackMigrations(handle.db, 1);
    expect(chat.map((r) => r.tag)).toEqual(['0007_web_chat']);
    expect(await publicTables(handle)).toHaveLength(19);

    // 0006 and 0005 only add columns.
    const answers = await rollbackMigrations(handle.db, 1);
    expect(answers.map((r) => r.tag)).toEqual(['0006_seller_answers']);
    expect(await publicTables(handle)).toHaveLength(19);

    const history = await rollbackMigrations(handle.db, 1);
    expect(history.map((r) => r.tag)).toEqual(['0005_learning_history']);
    expect(await publicTables(handle)).toHaveLength(19);

    // 0004 takes its two tables with it.
    const knowledge = await rollbackMigrations(handle.db, 1);
    expect(knowledge.map((r) => r.tag)).toEqual(['0004_product_types']);
    expect(await publicTables(handle)).toHaveLength(17);

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
    expect(await publicTables(handle)).toHaveLength(22);
  });

  it('0009 raises the drink expectation to at least ten (a coffee house 25) and never lowers a higher one', async () => {
    expect((await rollbackMigrations(handle.db, 2)).map((r) => r.tag)).toEqual(['0010_merge_pasta_cuisine', '0009_drink_minimum']);
    await executeRows(handle.db, sql`insert into menu_categories (key, label, sort_order) values ('icecek', 'İçecek', 70) on conflict do nothing returning key`);
    await executeRows(
      handle.db,
      sql`insert into cuisines (slug, name, categories_edited_by_user) values
        ('kebap-izgara', 'Kebap', false), ('kafe-icecek', 'Kahve & İçecek', false), ('pizza', 'Pizza', true), ('tatli', 'Tatlı', true) returning id`,
    );
    await executeRows(
      handle.db,
      sql`insert into cuisine_categories (cuisine_id, category_key, min_items)
          select id, 'icecek', case when slug = 'tatli' then 12 else 2 end from cuisines returning id`,
    );
    await handle.migrate();
    const rows = await executeRows(
      handle.db,
      sql`select c.slug, cc.min_items from cuisine_categories cc join cuisines c on c.id = cc.cuisine_id order by c.slug`,
    );
    expect(rows.map((r) => [r['slug'], r['min_items']])).toEqual([
      ['kafe-icecek', 25],
      ['kebap-izgara', 10],
      ['pizza', 10],
      ['tatli', 12],
    ]);
    await executeRows(handle.db, sql`delete from cuisines returning id`);
    await executeRows(handle.db, sql`delete from menu_categories returning key`);
  });

  it('0010 folds "Makarna & İtalyan" into "Mantı & Makarna": templates, runs, learning and product types move', async () => {
    expect((await rollbackMigrations(handle.db, 1)).map((r) => r.tag)).toEqual(['0010_merge_pasta_cuisine']);
    const [pasta, manti] = (
      await executeRows(
        handle.db,
        sql`insert into cuisines (slug, name) values ('makarna', 'Makarna & İtalyan'), ('manti-hamur-isleri', 'Mantı & Makarna') returning id`,
      )
    ).map((r) => String(r['id']));
    await executeRows(handle.db, sql`insert into menu_categories (key, label, sort_order) values ('ana-yemek', 'Ana Yemek', 10) returning key`);
    await executeRows(handle.db, sql`insert into cuisine_categories (cuisine_id, category_key, min_items) values (${pasta}, 'ana-yemek', 6) returning id`);
    // Lazanya moves; both kitchens carry Kola (one copy stays); the pasta kitchen's archived Su does not clash with
    // the other's approved Su.
    await executeRows(
      handle.db,
      sql`insert into menu_items (canonical_name, normalized_name, cuisine_id, source, approved) values
        ('Lazanya', 'lazanya', ${pasta}, 'seed', true), ('Kola', 'kola', ${pasta}, 'seed', true), ('Su', 'su', ${pasta}, 'seed', false),
        ('Kola', 'kola', ${manti}, 'seed', true), ('Su', 'su', ${manti}, 'seed', true) returning id`,
    );
    const [user] = await executeRows(handle.db, sql`insert into users (email, name, password_hash) values ('m@test.local', 'M', 'x') returning id`);
    const counts = JSON.stringify({ cuisineId: pasta, cuisineName: 'Makarna & İtalyan', current: 3 });
    await executeRows(handle.db, sql`insert into suggestion_runs (user_id, cuisine_id, counts) values (${user?.['id']}, ${pasta}, ${counts}::jsonb) returning id`);
    await executeRows(
      handle.db,
      sql`insert into suggestion_feedback (user_id, cuisine_id, kind, value, action) values (${user?.['id']}, ${pasta}, 'product', 'Lazanya', 'removed') returning id`,
    );
    await executeRows(handle.db, sql`insert into product_types (key, label, cuisines) values ('makarna', 'Makarna', '["makarna", "pizza"]') returning key`);

    await handle.migrate();
    const items = await executeRows(
      handle.db,
      sql`select m.canonical_name, m.approved, c.slug from menu_items m join cuisines c on c.id = m.cuisine_id order by m.canonical_name, m.approved`,
    );
    expect(items.map((r) => [r['canonical_name'], r['approved'], r['slug']])).toEqual([
      ['Kola', true, 'manti-hamur-isleri'],
      ['Lazanya', true, 'manti-hamur-isleri'],
      ['Su', false, 'manti-hamur-isleri'],
      ['Su', true, 'manti-hamur-isleri'],
    ]);
    expect((await executeRows(handle.db, sql`select slug from cuisines`)).map((r) => r['slug'])).toEqual(['manti-hamur-isleri']);
    expect(await executeRows(handle.db, sql`select id from cuisine_categories`)).toEqual([]);
    const [run] = await executeRows(handle.db, sql`select cuisine_id, counts from suggestion_runs`);
    expect(run?.['cuisine_id']).toBe(manti);
    expect(run?.['counts']).toEqual({ cuisineId: manti, cuisineName: 'Mantı & Makarna', current: 3 });
    expect((await executeRows(handle.db, sql`select cuisine_id from suggestion_feedback`))[0]?.['cuisine_id']).toBe(manti);
    const [type] = await executeRows(handle.db, sql`select cuisines from product_types where key = 'makarna'`);
    expect([...(type?.['cuisines'] as string[])].sort()).toEqual(['manti-hamur-isleri', 'pizza']);

    for (const table of ['suggestion_feedback', 'suggestion_runs', 'users', 'menu_items', 'product_types', 'cuisines', 'menu_categories']) {
      await executeRows(handle.db, sql`delete from ${sql.identifier(table)} returning 1`);
    }
  });

  it('splits statements on drizzle breakpoints and drops comment-only chunks', () => {
    expect(splitStatements('-- c\nA;\n--> statement-breakpoint\nB;\n--> statement-breakpoint\n-- only comment\n')).toEqual([
      '-- c\nA;',
      'B;',
    ]);
  });
});
