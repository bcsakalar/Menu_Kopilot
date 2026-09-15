import { z } from 'zod';

// ---- LLM-facing (Groq compound, JSON object mode) ------------------------------------------------------------

export const researchLlmSchema = z.object({
  found: z.boolean().describe('Restoran bulunduysa true'),
  summary: z.string().describe('En fazla 300 karakter, restoranın ne sattığı'),
  cuisine: z.string().nullable().describe('Mutfak türü veya null'),
  items: z
    .array(z.object({ name: z.string().describe('Menüdeki ürün adı'), section: z.string().nullable() }))
    .describe('En fazla 60 ürün'),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  confidence: z.number().describe('0–1'),
});

/** Lenient: bad fields degrade to defaults and items are checked one by one instead of failing the call. */
export const researchEnvelopeSchema = z.object({
  found: z.boolean().catch(false),
  summary: z.string().catch(''),
  cuisine: z.string().nullable().catch(null),
  items: z.array(z.unknown()).catch([]),
  sources: z.array(z.unknown()).catch([]),
  confidence: z.number().catch(0.5),
});
export const researchItemSchema = z.object({ name: z.string(), section: z.string().nullish() });
export const researchSourceSchema = z.object({ title: z.string().nullish(), url: z.string() });

// ---- API ------------------------------------------------------------------------------------------------------

export const researchRequestSchema = z
  .object({
    restaurantName: z.string().trim().min(2).max(120).optional(),
    city: z.string().trim().max(60).optional(),
    cuisineId: z.uuid().optional(),
    /** Fills name / city / cuisine from the branch and marks items already on its menu. */
    branchId: z.uuid().optional(),
    notes: z.string().trim().max(300).optional(),
    /** Ignore the 7-day cache. */
    refresh: z.boolean().default(false),
  })
  .refine((v) => v.restaurantName !== undefined || v.branchId !== undefined, {
    message: 'restaurantName veya branchId gerekli',
    path: ['restaurantName'],
  });
export type ResearchRequest = z.infer<typeof researchRequestSchema>;

export const webSourceSchema = z.object({ title: z.string(), url: z.string() });

export const researchItemDtoSchema = z.object({
  name: z.string(),
  section: z.string().nullable(),
  matchedTemplateId: z.uuid().nullable(),
  templateName: z.string().nullable(),
  /** null when no branch was given. */
  onMenu: z.boolean().nullable(),
});

export const researchResultDtoSchema = z.object({
  restaurantName: z.string(),
  city: z.string().nullable(),
  found: z.boolean(),
  summary: z.string(),
  cuisine: z.string().nullable(),
  confidence: z.number(),
  items: z.array(researchItemDtoSchema),
  sources: z.array(webSourceSchema),
  cached: z.boolean(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  researchedAt: z.string(),
});
export type ResearchResultDto = z.infer<typeof researchResultDtoSchema>;

export const storedResearchSchema = z.object({
  found: z.boolean(),
  summary: z.string(),
  cuisine: z.string().nullable(),
  confidence: z.number(),
  items: z.array(z.object({ name: z.string(), section: z.string().nullable() })),
  sources: z.array(webSourceSchema),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  researchedAt: z.string(),
});
export type StoredResearch = z.infer<typeof storedResearchSchema>;
