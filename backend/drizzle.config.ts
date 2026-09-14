import { defineConfig } from 'drizzle-kit';

// Only used by `pnpm db:generate` (offline SQL generation); runtime migrations use src/db/migrate.ts.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
});
