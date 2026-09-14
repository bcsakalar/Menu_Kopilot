import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { type DbHandle, MIGRATIONS_FOLDER } from '../../src/db/client.js';
import * as schema from '../../src/db/schema/index.js';

/** In-process Postgres (WASM) with pgvector + pg_trgm; no Docker needed. */
export async function createTestDb(options: { migrate?: boolean } = {}): Promise<DbHandle> {
  const pg = new PGlite({ extensions: { vector, pg_trgm } });
  const db = drizzle(pg, { schema });
  const handle: DbHandle = {
    db,
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    ping: async () => {
      await pg.query('select 1');
    },
    close: () => pg.close(),
  };
  if (options.migrate !== false) {
    await handle.migrate();
  }
  return handle;
}
