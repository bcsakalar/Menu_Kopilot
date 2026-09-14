import { fileURLToPath } from 'node:url';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Schema = typeof schema;

/** Driver-agnostic database type (postgres.js in runtime, PGlite in tests). */
export type Database = PgDatabase<PgQueryResultHKT, Schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Anything that can run queries: the root db or a transaction. */
export type Executor = Database | Transaction;

export interface DbHandle {
  db: Database;
  migrate(): Promise<void>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

/** src/db → ../../drizzle and dist/db → ../../drizzle resolve to the same folder. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export function createPostgresDb(url: string, options: { max?: number } = {}): DbHandle {
  const client = postgres(url, {
    max: options.max ?? 10,
    onnotice: () => undefined,
  });
  const db = drizzle(client, { schema });
  return {
    db,
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    ping: async () => {
      await client`select 1`;
    },
    close: () => client.end({ timeout: 5 }),
  };
}
