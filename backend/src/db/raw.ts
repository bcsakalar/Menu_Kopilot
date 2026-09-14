import type { SQL } from 'drizzle-orm';
import type { Executor } from './client.js';

/**
 * db.execute() returns different shapes per driver (postgres.js: array, PGlite: { rows }).
 * Use this for the few raw statements that need their rows; prefer the query builder elsewhere.
 */
export async function executeRows(db: Executor, query: SQL): Promise<Record<string, unknown>[]> {
  const result: unknown = await db.execute(query);
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (typeof result === 'object' && result !== null && 'rows' in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  throw new Error('Unexpected db.execute() result shape');
}
