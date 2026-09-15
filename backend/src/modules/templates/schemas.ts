import { z } from 'zod';
import { templatePayloadSchema } from '../../domain/template.js';

export const templateSourceSchema = z.enum(['ai', 'user', 'imported', 'seed']);

export const templateDtoSchema = z.object({
  id: z.uuid(),
  cuisineId: z.uuid(),
  cuisineName: z.string(),
  name: z.string(),
  source: templateSourceSchema,
  approved: z.boolean(),
  needsReview: z.boolean(),
  importance: z.number().int(),
  usageCount: z.number().int(),
  aliases: z.array(z.string()),
  payload: templatePayloadSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TemplateDto = z.infer<typeof templateDtoSchema>;

export const templateListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  cuisineId: z.uuid().optional(),
  source: templateSourceSchema.optional(),
  /** `true` (default) = the pool; `false` = drafts / archived seeds; `all` = both. */
  approved: z.enum(['true', 'false', 'all']).default('true'),
  sort: z.enum(['usage', 'name', 'updated']).default('usage'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
export type TemplateListQuery = z.infer<typeof templateListQuerySchema>;

export const templateListSchema = z.object({
  data: z.array(templateDtoSchema),
  meta: z.object({ total: z.number().int(), limit: z.number().int(), offset: z.number().int() }),
});

const aliases = z.array(z.string().trim().min(1).max(80)).max(30);
const importance = z.number().int().min(0).max(100);

export const createTemplateSchema = z.object({
  cuisineId: z.uuid(),
  payload: templatePayloadSchema,
  aliases: aliases.optional(),
  importance: importance.optional(),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z.object({
  payload: templatePayloadSchema.optional(),
  cuisineId: z.uuid().optional(),
  /** Replaces the alias list. */
  aliases: aliases.optional(),
  importance: importance.optional(),
  /** true approves a draft (it joins the pool and gets embedded). */
  approved: z.boolean().optional(),
});
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
