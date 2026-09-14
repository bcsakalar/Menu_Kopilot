import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { desc, eq, sql } from 'drizzle-orm';
import { bigint, pgSchema, serial, text } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { Database } from './client.js';
import { MIGRATIONS_FOLDER } from './client.js';
import { executeRows } from './raw.js';

/**
 * Down migrations. drizzle-kit only generates "up" SQL; every migration has a hand-written
 * `drizzle/down/<tag>.sql`. Rolling back runs that file and removes the row from drizzle's journal
 * table so the next `migrate()` re-applies it.
 */

const drizzleSchema = pgSchema('drizzle');
const appliedMigrations = drizzleSchema.table('__drizzle_migrations', {
  id: serial('id').primaryKey(),
  hash: text('hash').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }),
});

const journalSchema = z.object({
  entries: z.array(z.object({ idx: z.number(), when: z.number(), tag: z.string() })),
});

export interface RolledBack {
  tag: string;
}

async function readJournal(folder: string) {
  const raw = await readFile(join(folder, 'meta', '_journal.json'), 'utf8');
  return journalSchema.parse(JSON.parse(raw)).entries;
}

export function splitStatements(sqlText: string): string[] {
  return sqlText
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(--[^\n]*\n?)+$/.test(s));
}

async function journalTableExists(db: Database): Promise<boolean> {
  const rows = await executeRows(db, sql`select to_regclass('drizzle.__drizzle_migrations') is not null as "exists"`);
  return rows[0]?.['exists'] === true;
}

export async function rollbackMigrations(
  db: Database,
  steps: number,
  folder: string = MIGRATIONS_FOLDER,
): Promise<RolledBack[]> {
  if (!(await journalTableExists(db))) return [];
  const journal = await readJournal(folder);
  const done: RolledBack[] = [];

  for (let i = 0; i < steps; i += 1) {
    const [last] = await db
      .select()
      .from(appliedMigrations)
      .orderBy(desc(appliedMigrations.createdAt))
      .limit(1);
    if (!last) break;

    const entry = journal.find((e) => e.when === last.createdAt);
    if (!entry) {
      throw new Error(`Applied migration (created_at=${String(last.createdAt)}) not found in the journal`);
    }
    const downSql = await readFile(join(folder, 'down', `${entry.tag}.sql`), 'utf8');
    const statements = splitStatements(downSql);

    await db.transaction(async (tx) => {
      for (const statement of statements) {
        await tx.execute(sql.raw(statement));
      }
      await tx.delete(appliedMigrations).where(eq(appliedMigrations.id, last.id));
    });
    done.push({ tag: entry.tag });
  }
  return done;
}
