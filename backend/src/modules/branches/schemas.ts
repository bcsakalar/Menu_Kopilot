import { z } from 'zod';

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
