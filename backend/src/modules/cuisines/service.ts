import { asc, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Database } from '../../db/client.js';
import { branches, cuisines, menuItems } from '../../db/schema/index.js';
import { AppError, notFound } from '../../lib/errors.js';
import { slugifyTr } from '../../lib/normalize-tr.js';
import { MIN_BRANCH_ITEMS } from '../branches/branch-menu.js';
import type { CuisineDto, createCuisineSchema, updateCuisineSchema } from './schemas.js';

/** Cuisine types; per-cuisine minimum product counts are user data (edited in settings), never hard-coded. */
export class CuisineService {
  constructor(private readonly db: Database) {}

  async list(): Promise<CuisineDto[]> {
    const rows = await this.db
      .select({
        id: cuisines.id,
        name: cuisines.name,
        slug: cuisines.slug,
        parentId: cuisines.parentId,
        isSystem: cuisines.isSystem,
        minItemCount: cuisines.minItemCount,
        notes: cuisines.notes,
      })
      .from(cuisines)
      .orderBy(asc(cuisines.name));
    const counts = await this.db
      .select({ cuisineId: menuItems.cuisineId, n: sql<number>`count(*)::int` })
      .from(menuItems)
      .where(eq(menuItems.approved, true))
      .groupBy(menuItems.cuisineId);
    const countById = new Map(counts.map((c) => [c.cuisineId, c.n]));
    return rows.map((r) => ({
      ...r,
      templateCount: countById.get(r.id) ?? 0,
      targetItemCount: Math.max(MIN_BRANCH_ITEMS, r.minItemCount),
    }));
  }

  private async get(id: string): Promise<CuisineDto> {
    const found = (await this.list()).find((c) => c.id === id);
    if (!found) throw notFound('Mutfak türü');
    return found;
  }

  async create(userId: string, input: z.infer<typeof createCuisineSchema>): Promise<CuisineDto> {
    const slug = slugifyTr(input.name);
    if (slug === '') throw new AppError('VALIDATION_ERROR', 'Geçerli bir mutfak adı gir');
    const [existing] = await this.db.select({ id: cuisines.id }).from(cuisines).where(eq(cuisines.slug, slug)).limit(1);
    if (existing) throw new AppError('CONFLICT', 'Bu isimde bir mutfak türü zaten var');
    if (input.parentId) await this.get(input.parentId);
    const [row] = await this.db
      .insert(cuisines)
      .values({
        name: input.name,
        slug,
        parentId: input.parentId ?? null,
        isSystem: false,
        createdBy: userId,
        minItemCount: input.minItemCount,
        notes: input.notes ?? null,
      })
      .returning({ id: cuisines.id });
    if (!row) throw new AppError('INTERNAL_ERROR', 'Mutfak türü kaydedilemedi');
    return this.get(row.id);
  }

  async update(id: string, input: z.infer<typeof updateCuisineSchema>): Promise<CuisineDto> {
    const current = await this.get(id);
    if (input.parentId === id) throw new AppError('VALIDATION_ERROR', 'Mutfak kendi üst türü olamaz');
    if (input.parentId) await this.get(input.parentId);
    if (current.isSystem && input.name !== undefined && input.name !== current.name) {
      throw new AppError('FORBIDDEN', 'Sistem mutfak türlerinin adı değiştirilemez; minimum sayı ve not düzenlenebilir');
    }
    await this.db
      .update(cuisines)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.minItemCount !== undefined ? { minItemCount: input.minItemCount } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedAt: new Date(),
      })
      .where(eq(cuisines.id, id));
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const current = await this.get(id);
    if (current.isSystem) throw new AppError('FORBIDDEN', 'Sistem mutfak türleri silinemez');
    const [usedByBranch] = await this.db.select({ id: branches.id }).from(branches).where(eq(branches.cuisineId, id)).limit(1);
    const [usedByTemplate] = await this.db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.cuisineId, id)).limit(1);
    if (usedByBranch || usedByTemplate) {
      throw new AppError('CONFLICT', 'Bu mutfak türü şube veya şablonlarda kullanılıyor');
    }
    await this.db.delete(cuisines).where(eq(cuisines.id, id));
  }
}
