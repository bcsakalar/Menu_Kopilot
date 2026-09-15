import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Executor } from '../../db/client.js';
import { branchMenuItems, branches, cuisines } from '../../db/schema/index.js';
import type { TemplatePayload } from '../../domain/template.js';
import { notFound } from '../../lib/errors.js';
import { mostSimilarIndex } from '../../lib/trigram.js';

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

/**
 * A card accepted in Mod 1 for the branch. When the menu has no row with the card's name but panel rows matched to
 * the same template exist ("Adana Dürüm" ↔ card "Adana Kebap"), the card is attached to the most similar panel row
 * that has no card yet instead of adding a second product; otherwise it is upserted by name.
 */
export async function attachAcceptedCard(
  db: Executor,
  branchId: string,
  card: { name: string; normalizedName: string; templateId: string; payload: TemplatePayload },
): Promise<void> {
  const [sameName] = await db
    .select({ id: branchMenuItems.id })
    .from(branchMenuItems)
    .where(and(eq(branchMenuItems.branchId, branchId), eq(branchMenuItems.normalizedName, card.normalizedName)))
    .limit(1);
  if (!sameName) {
    const panelRows = await db
      .select({ id: branchMenuItems.id, normalizedName: branchMenuItems.normalizedName })
      .from(branchMenuItems)
      .where(
        and(
          eq(branchMenuItems.branchId, branchId),
          eq(branchMenuItems.matchedItemId, card.templateId),
          eq(branchMenuItems.source, 'screenshot'),
          inArray(branchMenuItems.status, ['ok', 'incomplete']),
          isNull(branchMenuItems.payload),
        ),
      );
    const row = panelRows[mostSimilarIndex(card.normalizedName, panelRows.map((r) => r.normalizedName))];
    if (row) {
      await db
        .update(branchMenuItems)
        .set({
          status: 'ok',
          payload: card.payload,
          hasDescription: card.payload.description.length > 0,
          hasOptions: card.payload.optionGroups.length > 0,
          hasRemovables: card.payload.removableIngredients.length > 0,
          completenessScore: 1,
          // The card covers the content; the next screenshot analysis refreshes the panel flags.
          flags: null,
          updatedAt: new Date(),
        })
        .where(eq(branchMenuItems.id, row.id));
      return;
    }
  }
  await upsertBranchItem(db, branchId, {
    rawName: card.name,
    normalizedName: card.normalizedName,
    matchedItemId: card.templateId,
    status: 'ok',
    source: 'suggestion',
    hasDescription: card.payload.description.length > 0,
    hasOptions: card.payload.optionGroups.length > 0,
    hasRemovables: card.payload.removableIngredients.length > 0,
    completenessScore: 1,
    payload: card.payload,
  });
}

/**
 * A product read from a panel screenshot. The panel is the truth for status/flags, but an accepted card payload
 * (Mod 1) is kept, and a previous recommendation ("missing") turns into a screenshot item.
 */
export async function upsertScreenshotItem(
  db: Executor,
  branchId: string,
  item: Omit<BranchItemInput, 'source' | 'payload' | 'reason'> & { status: 'ok' | 'incomplete' },
): Promise<void> {
  const now = new Date();
  await db
    .insert(branchMenuItems)
    .values({
      branchId,
      rawName: item.rawName,
      normalizedName: item.normalizedName,
      matchedItemId: item.matchedItemId,
      status: item.status,
      source: 'screenshot',
      hasDescription: item.hasDescription,
      hasOptions: item.hasOptions,
      hasRemovables: item.hasRemovables,
      completenessScore: item.completenessScore,
      flags: item.flags ?? null,
      snapshotId: item.snapshotId ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [branchMenuItems.branchId, branchMenuItems.normalizedName],
      set: {
        rawName: item.rawName,
        matchedItemId: sql`coalesce(excluded.matched_item_id, ${branchMenuItems.matchedItemId})`,
        status: item.status,
        source: sql`case when ${branchMenuItems.source} = 'recommendation' then 'screenshot'::branch_item_source else ${branchMenuItems.source} end`,
        hasDescription: item.hasDescription,
        hasOptions: item.hasOptions,
        hasRemovables: item.hasRemovables,
        completenessScore: item.completenessScore,
        flags: item.flags ?? null,
        reason: null,
        snapshotId: item.snapshotId ?? null,
        updatedAt: now,
      },
    });
}

/** Replaces the branch's previous recommendations with new ones (never touches items on the menu). */
export async function replaceRecommendations(
  db: Executor,
  branchId: string,
  items: readonly { name: string; normalizedName: string; templateId: string | null; reason: string }[],
  snapshotId: string | null,
): Promise<void> {
  await db
    .delete(branchMenuItems)
    .where(
      and(
        eq(branchMenuItems.branchId, branchId),
        eq(branchMenuItems.status, 'missing'),
        eq(branchMenuItems.source, 'recommendation'),
      ),
    );
  if (items.length === 0) return;
  await db
    .insert(branchMenuItems)
    .values(
      items.map((item) => ({
        branchId,
        rawName: item.name,
        normalizedName: item.normalizedName,
        matchedItemId: item.templateId,
        status: 'missing' as const,
        source: 'recommendation' as const,
        completenessScore: 0,
        reason: item.reason,
        snapshotId,
      })),
    )
    .onConflictDoNothing({ target: [branchMenuItems.branchId, branchMenuItems.normalizedName] });
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
