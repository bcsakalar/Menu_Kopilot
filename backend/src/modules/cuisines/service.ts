import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Database } from '../../db/client.js';
import { cuisineCategories, cuisines, menuCategories, menuItems } from '../../db/schema/index.js';
import { AppError, notFound } from '../../lib/errors.js';
import { normalizeTr, slugifyTr } from '../../lib/normalize-tr.js';
import { MIN_BRANCH_ITEMS, loadCategories, loadCategoryIndex, loadExpectations } from '../../agents/gap-analyst.js';
import { recategorizeTemplates } from '../templates/template-store.js';
import type {
  CategoryDto,
  CuisineCategoryDto,
  CuisineDto,
  createCuisineSchema,
  putCuisineCategoriesSchema,
  updateCategorySchema,
  updateCuisineSchema,
} from './schemas.js';

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
    const [usedByTemplate] = await this.db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.cuisineId, id)).limit(1);
    if (usedByTemplate) {
      throw new AppError('CONFLICT', 'Bu mutfak türü şablonlarda kullanılıyor');
    }
    await this.db.delete(cuisines).where(eq(cuisines.id, id));
  }

  // ---- categories ------------------------------------------------------------------------------------------

  async listCategories(): Promise<CategoryDto[]> {
    return (await loadCategories(this.db)).map((c) => ({ ...c, keywords: [...c.keywords] }));
  }

  /**
   * Keywords are stored the way the classifier compares them: normalized ("Şalgam" → "salgam"). A multi-word keyword
   * stays one phrase ("Sıcak Çikolata" → "sicak cikolata"), matched as whole tokens in order.
   */
  async updateCategory(key: string, input: z.infer<typeof updateCategorySchema>): Promise<CategoryDto> {
    const [existing] = await this.db.select({ key: menuCategories.key }).from(menuCategories).where(eq(menuCategories.key, key)).limit(1);
    if (!existing) throw notFound('Kategori');
    const keywords =
      input.keywords === undefined
        ? undefined
        : [...new Set(input.keywords.map((k) => normalizeTr(k)).filter((k) => k.length >= 2))];
    await this.db
      .update(menuCategories)
      .set({
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(keywords !== undefined ? { keywords } : {}),
        editedByUser: true,
      })
      .where(eq(menuCategories.key, key));
    // The pool follows at once: seed templates are re-classified with the new keywords (the recommender reads them).
    if (keywords !== undefined) await recategorizeTemplates(this.db, await loadCategoryIndex(this.db));
    const updated = (await this.listCategories()).find((c) => c.key === key);
    if (!updated) throw notFound('Kategori');
    return updated;
  }

  /** What the Gap Analyst expects from this cuisine: category → minimum products. */
  async cuisineCategories(cuisineId: string): Promise<CuisineCategoryDto[]> {
    await this.get(cuisineId);
    const rows = await loadExpectations(this.db, cuisineId);
    return rows.map(({ key, ...rest }) => ({ categoryKey: key, ...rest }));
  }

  /** Replaces the whole expectation set of a cuisine in one transaction (the screen always sends the full list). */
  async replaceCuisineCategories(cuisineId: string, input: z.infer<typeof putCuisineCategoriesSchema>): Promise<CuisineCategoryDto[]> {
    await this.get(cuisineId);
    const keys = [...new Set(input.items.map((i) => i.categoryKey))];
    if (keys.length !== input.items.length) throw new AppError('VALIDATION_ERROR', 'Aynı kategori iki kez var');
    const known = keys.length === 0 ? [] : await this.db.select({ key: menuCategories.key, sortOrder: menuCategories.sortOrder }).from(menuCategories).where(inArray(menuCategories.key, keys));
    const order = new Map(known.map((k) => [k.key, k.sortOrder]));
    const unknown = keys.filter((k) => !order.has(k));
    if (unknown.length > 0) throw new AppError('VALIDATION_ERROR', `Bilinmeyen kategori: ${unknown.join(', ')}`);
    await this.db.transaction(async (tx) => {
      await tx.update(cuisines).set({ categoriesEditedByUser: true, updatedAt: new Date() }).where(eq(cuisines.id, cuisineId));
      await tx.delete(cuisineCategories).where(eq(cuisineCategories.cuisineId, cuisineId));
      if (input.items.length === 0) return;
      await tx.insert(cuisineCategories).values(
        input.items.map((item) => ({ cuisineId, categoryKey: item.categoryKey, minItems: item.minItems, sortOrder: order.get(item.categoryKey) ?? 0 })),
      );
    });
    return this.cuisineCategories(cuisineId);
  }
}
