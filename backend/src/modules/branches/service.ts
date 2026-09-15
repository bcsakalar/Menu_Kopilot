import { and, desc, eq, max, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { branchMenuItems, branchMenuSnapshots, branches, cuisines } from '../../db/schema/index.js';
import { AppError, notFound } from '../../lib/errors.js';
import { MIN_BRANCH_ITEMS, requireBranch } from './branch-menu.js';
import type { BranchDto, CreateBranchInput, UpdateBranchInput } from './schemas.js';

/** Branches of the signed-in user (every query is scoped by user id). */
export class BranchService {
  constructor(private readonly db: Database) {}

  private async rows(userId: string, branchId?: string): Promise<BranchDto[]> {
    const rows = await this.db
      .select({
        id: branches.id,
        name: branches.name,
        city: branches.city,
        cuisineId: branches.cuisineId,
        cuisineName: cuisines.name,
        cuisineMin: cuisines.minItemCount,
        status: branches.status,
        notes: branches.notes,
        targetItemCount: branches.targetItemCount,
        currentItemCount: branches.currentItemCount,
        createdAt: branches.createdAt,
        updatedAt: branches.updatedAt,
      })
      .from(branches)
      .innerJoin(cuisines, eq(branches.cuisineId, cuisines.id))
      .where(branchId ? and(eq(branches.userId, userId), eq(branches.id, branchId)) : eq(branches.userId, userId))
      .orderBy(desc(branches.updatedAt));
    if (rows.length === 0) return [];
    const recommended = await this.db
      .select({ branchId: branchMenuItems.branchId, n: sql<number>`count(*)::int` })
      .from(branchMenuItems)
      .innerJoin(branches, eq(branchMenuItems.branchId, branches.id))
      .where(and(eq(branches.userId, userId), eq(branchMenuItems.status, 'missing')))
      .groupBy(branchMenuItems.branchId);
    const lastGap = await this.db
      .select({ branchId: branchMenuSnapshots.branchId, at: max(branchMenuSnapshots.createdAt) })
      .from(branchMenuSnapshots)
      .innerJoin(branches, eq(branchMenuSnapshots.branchId, branches.id))
      .where(eq(branches.userId, userId))
      .groupBy(branchMenuSnapshots.branchId);
    const recommendedBy = new Map(recommended.map((r) => [r.branchId, r.n]));
    const lastGapBy = new Map(lastGap.map((r) => [r.branchId, r.at]));
    return rows.map((r) => {
      const effectiveTarget = r.targetItemCount ?? Math.max(MIN_BRANCH_ITEMS, r.cuisineMin);
      const at = lastGapBy.get(r.id);
      return {
        id: r.id,
        name: r.name,
        city: r.city,
        cuisineId: r.cuisineId,
        cuisineName: r.cuisineName,
        status: r.status,
        notes: r.notes,
        targetItemCount: r.targetItemCount,
        effectiveTarget,
        currentItemCount: r.currentItemCount,
        missingCount: Math.max(0, effectiveTarget - r.currentItemCount),
        recommendedCount: recommendedBy.get(r.id) ?? 0,
        lastGapAt: at ? new Date(at).toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });
  }

  list(userId: string): Promise<BranchDto[]> {
    return this.rows(userId);
  }

  async get(userId: string, branchId: string): Promise<BranchDto> {
    const [branch] = await this.rows(userId, branchId);
    if (!branch) throw notFound('Şube');
    return branch;
  }

  private async requireCuisine(cuisineId: string): Promise<void> {
    const [row] = await this.db.select({ id: cuisines.id }).from(cuisines).where(eq(cuisines.id, cuisineId)).limit(1);
    if (!row) throw new AppError('VALIDATION_ERROR', 'Mutfak türü bulunamadı');
  }

  async create(userId: string, input: CreateBranchInput): Promise<BranchDto> {
    await this.requireCuisine(input.cuisineId);
    const [row] = await this.db
      .insert(branches)
      .values({
        userId,
        name: input.name,
        cuisineId: input.cuisineId,
        city: input.city ?? null,
        notes: input.notes ?? null,
        targetItemCount: input.targetItemCount ?? null,
        status: input.status ?? 'in_progress',
      })
      .returning({ id: branches.id });
    if (!row) throw new AppError('INTERNAL_ERROR', 'Şube kaydedilemedi');
    return this.get(userId, row.id);
  }

  async update(userId: string, branchId: string, input: UpdateBranchInput): Promise<BranchDto> {
    await requireBranch(this.db, branchId, userId);
    if (input.cuisineId) await this.requireCuisine(input.cuisineId);
    await this.db
      .update(branches)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.cuisineId !== undefined ? { cuisineId: input.cuisineId } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.targetItemCount !== undefined ? { targetItemCount: input.targetItemCount } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(branches.id, branchId), eq(branches.userId, userId)));
    return this.get(userId, branchId);
  }

  async remove(userId: string, branchId: string): Promise<void> {
    await requireBranch(this.db, branchId, userId);
    await this.db.delete(branches).where(and(eq(branches.id, branchId), eq(branches.userId, userId)));
  }
}
