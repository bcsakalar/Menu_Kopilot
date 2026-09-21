import { z } from 'zod';

/**
 * Classifier agent — JSON schema. Guesses the cuisine and the price segment from the products already on the menu.
 * `cuisineSlug` is constrained to the slugs the caller passes in the prompt; an answer outside that list is
 * rejected by the validator and the pipeline falls back to the user's own choice.
 */

export const priceSegmentSchema = z.enum(['ekonomik', 'orta', 'ust']);
export type PriceSegment = z.infer<typeof priceSegmentSchema>;

export const classifierSchema = z.object({
  cuisineSlug: z.string().min(1).max(60).describe('Verilen listeden tam olarak bir slug'),
  confidence: z.number().min(0).max(1).describe('0–1; emin değilsen 0.5 altı ver'),
  priceSegment: priceSegmentSchema.describe('Menünün fiyat segmenti: ekonomik | orta | ust'),
  reason: z.string().max(160).describe('Tek cümle gerekçe, fiyat rakamı yazma'),
});
export type ClassifierOutput = z.infer<typeof classifierSchema>;

export const CLASSIFIER_SCHEMA_NAME = 'cuisine_classification';
