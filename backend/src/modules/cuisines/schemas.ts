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
