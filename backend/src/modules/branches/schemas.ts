import { z } from 'zod';
import { templatePayloadSchema } from '../../domain/template.js';

export const branchStatusSchema = z.enum(['draft', 'in_progress', 'ready', 'opened']);

export const branchDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  city: z.string().nullable(),
  cuisineId: z.uuid(),
  cuisineName: z.string(),
  status: branchStatusSchema,
  notes: z.string().nullable(),
  /** Manual override; null → automatic target. */
  targetItemCount: z.number().int().nullable(),
  /** targetItemCount ?? max(10, cuisine minimum). */
  effectiveTarget: z.number().int(),
  currentItemCount: z.number().int(),
  missingCount: z.number().int(),
  /** Items recommended by the latest gap analysis that are not on the menu yet. */
  recommendedCount: z.number().int(),
  lastGapAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BranchDto = z.infer<typeof branchDtoSchema>;

const name = z.string().trim().min(2).max(80);
const city = z.string().trim().max(60).nullable();
const notes = z.string().trim().max(1000).nullable();
const target = z.number().int().min(1).max(500).nullable();

export const createBranchSchema = z.object({
  name,
  cuisineId: z.uuid(),
  city: city.optional(),
  notes: notes.optional(),
  targetItemCount: target.optional(),
  status: branchStatusSchema.optional(),
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const menuItemStatusSchema = z.enum(['ok', 'incomplete', 'missing']);

export const branchMenuItemDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  normalizedName: z.string(),
  /** ok / incomplete = on the menu, missing = recommended. */
  status: menuItemStatusSchema,
  source: z.enum(['screenshot', 'suggestion', 'recommendation', 'manual']),
  completeness: z.number(),
  /** Fields not filled on the panel (absent or not visible). */
  missingFields: z.array(z.enum(['description', 'options', 'removables'])),
  reason: z.string().nullable(),
  matchedTemplateId: z.uuid().nullable(),
  /** Accepted card (Mod 1) frozen for this branch. */
  payload: templatePayloadSchema.nullable(),
  /** Matched template content when no card was accepted yet. */
  templatePayload: templatePayloadSchema.nullable(),
  updatedAt: z.string(),
});
export type BranchMenuItemDto = z.infer<typeof branchMenuItemDtoSchema>;

export const branchMenuDtoSchema = z.object({ branch: branchDtoSchema, items: z.array(branchMenuItemDtoSchema) });
export type BranchMenuDto = z.infer<typeof branchMenuDtoSchema>;

export const updateMenuItemSchema = z.object({ status: menuItemStatusSchema });

export const exportQuerySchema = z.object({ format: z.enum(['csv', 'json']).default('csv') });

export const updateBranchSchema = z.object({
  name: name.optional(),
  cuisineId: z.uuid().optional(),
  city: city.optional(),
  notes: notes.optional(),
  /** null resets to the automatic target. */
  targetItemCount: target.optional(),
  status: branchStatusSchema.optional(),
});
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
