import { z } from 'zod';

/**
 * What the learning loop has taught itself to stop offering (D-194), as the app's "Ekibin sildikleri" screen shows
 * it, and the "Geri al" that makes it forget.
 */

export const learnedKindSchema = z.enum(['option_group', 'removable', 'extra']);

/** A product the team kept turning down for one cuisine ("Önerme"). */
export const learnedProductSchema = z.object({
  cuisineId: z.uuid(),
  cuisineName: z.string(),
  name: z.string(),
  removed: z.number().int(),
  accepted: z.number().int(),
  lastAt: z.string(),
});
export type LearnedProduct = z.infer<typeof learnedProductSchema>;

/** A card suggestion (a group, a removable, an extra) the team kept deleting for one product type. */
export const learnedSuggestionSchema = z.object({
  productType: z.string(),
  productTypeLabel: z.string(),
  kind: learnedKindSchema,
  value: z.string(),
  removed: z.number().int(),
  accepted: z.number().int(),
  lastAt: z.string(),
});
export type LearnedSuggestion = z.infer<typeof learnedSuggestionSchema>;

export const learningResultSchema = z.object({
  products: z.array(learnedProductSchema),
  suggestions: z.array(learnedSuggestionSchema),
});
export type LearningResult = z.infer<typeof learningResultSchema>;

export const forgetBodySchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('product'), cuisineId: z.uuid(), value: z.string().trim().min(1).max(200) }),
  z.object({
    scope: z.literal('suggestion'),
    productType: z.string().trim().min(1).max(64),
    kind: learnedKindSchema,
    value: z.string().trim().min(1).max(200),
  }),
]);
export type ForgetBody = z.infer<typeof forgetBodySchema>;
