import { z } from 'zod';

export const cuisineDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  parentId: z.uuid().nullable(),
  isSystem: z.boolean(),
  minItemCount: z.number().int(),
  /** max(10, minItemCount) — the branch-opening target for this cuisine. */
  targetItemCount: z.number().int(),
  notes: z.string().nullable(),
  templateCount: z.number().int(),
});
export type CuisineDto = z.infer<typeof cuisineDtoSchema>;

export const createCuisineSchema = z.object({
  name: z.string().trim().min(2).max(60),
  parentId: z.uuid().nullable().optional(),
  minItemCount: z.number().int().min(0).max(500).default(10),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const updateCuisineSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  parentId: z.uuid().nullable().optional(),
  minItemCount: z.number().int().min(0).max(500).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

// ---- category taxonomy and per-cuisine expectations (edited from Ayarlar > Mutfak Türleri) ----------------------

export const categoryDtoSchema = z.object({
  key: z.string(),
  label: z.string(),
  sortOrder: z.number().int(),
  /** normalizeTr'd words or phrases; a product whose name contains one (as whole tokens) belongs to this category. */
  keywords: z.array(z.string()),
});
export type CategoryDto = z.infer<typeof categoryDtoSchema>;

export const updateCategorySchema = z.object({
  label: z.string().trim().min(2).max(40).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  /** Any spelling is accepted ("Şalgam", "ŞALGAM", "Sıcak Çikolata"); it is stored normalized. */
  keywords: z.array(z.string().trim().min(1).max(40)).max(120).optional(),
});

export const cuisineCategoryDtoSchema = z.object({
  categoryKey: z.string(),
  label: z.string(),
  minItems: z.number().int(),
  sortOrder: z.number().int(),
});
export type CuisineCategoryDto = z.infer<typeof cuisineCategoryDtoSchema>;

export const putCuisineCategoriesSchema = z.object({
  /** The complete set for the cuisine: categories left out are removed from its expectations. */
  items: z
    .array(z.object({ categoryKey: z.string().min(1).max(40), minItems: z.number().int().min(0).max(100) }))
    .max(20),
});
