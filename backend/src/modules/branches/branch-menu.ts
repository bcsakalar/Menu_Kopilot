import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Executor } from '../../db/client.js';
import { branchMenuItems, branches, cuisines } from '../../db/schema/index.js';
import type { TemplatePayload } from '../../domain/template.js';
import { notFound } from '../../lib/errors.js';

/** Branch menu helpers shared by Mod 1 (accepted cards) and Mod 2 (panel screenshots / recommendations). */

export const MIN_BRANCH_ITEMS = 10;

export interface BranchItemInput {
  rawName: string;
  normalizedName: string;
  matchedItemId: string | null;
  status: 'ok' | 'incomplete' | 'missing';
  source: 'screenshot' | 'suggestion' | 'recommendation' | 'manual';
  hasDescription: boolean;
  hasOptions: boolean;
  hasRemovables: boolean;
  completenessScore: number;
  flags?: Record<string, string> | null;
  reason?: string | null;
  payload?: TemplatePayload | null;
  snapshotId?: string | null;
}

export async function requireBranch(db: Executor, branchId: string, userId: string) {
  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, branchId), eq(branches.userId, userId)))
    .limit(1);
  if (!branch) throw notFound('Şube');
  return branch;
}

/** Effective target = manual override or max(10, cuisine minimum). */
export async function effectiveTarget(db: Executor, branchId: string): Promise<number> {
  const [row] = await db
    .select({ override: branches.targetItemCount, cuisineMin: cuisines.minItemCount })
    .from(branches)
    .innerJoin(cuisines, eq(branches.cuisineId, cuisines.id))
    .where(eq(branches.id, branchId))
    .limit(1);
  if (!row) throw notFound('Şube');
  return row.override ?? Math.max(MIN_BRANCH_ITEMS, row.cuisineMin);
}

export async function upsertBranchItem(db: Executor, branchId: string, item: BranchItemInput): Promise<void> {
  const values = {
    branchId,
    rawName: item.rawName,
    normalizedName: item.normalizedName,
    matchedItemId: item.matchedItemId,
    status: item.status,
    source: item.source,
    hasDescription: item.hasDescription,
    hasOptions: item.hasOptions,
    hasRemovables: item.hasRemovables,
    completenessScore: item.completenessScore,
    flags: item.flags ?? null,
    reason: item.reason ?? null,
    payload: item.payload ? (item.payload as unknown as Record<string, unknown>) : null,
    snapshotId: item.snapshotId ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(branchMenuItems)
    .values(values)
    .onConflictDoUpdate({ target: [branchMenuItems.branchId, branchMenuItems.normalizedName], set: values });
}

/** current_item_count = items on the menu (ok + incomplete). */
export async function recomputeBranchCount(db: Executor, branchId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(branchMenuItems)
    .where(and(eq(branchMenuItems.branchId, branchId), inArray(branchMenuItems.status, ['ok', 'incomplete'])));
  const count = row?.n ?? 0;
  await db.update(branches).set({ currentItemCount: count, updatedAt: new Date() }).where(eq(branches.id, branchId));
  return count;
}
