import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Live provider smoke tests: `pnpm test:smoke`. Keys come from ../.env (or the shell); tests skip without keys.
if (existsSync('../.env')) process.loadEnvFile('../.env');

export default defineConfig({
  test: {
    include: ['test/smoke/**/*.smoke.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
});
