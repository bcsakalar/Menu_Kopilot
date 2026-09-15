import { z } from 'zod';

export const transcribeFieldsSchema = z.object({
  /** ISO-639-1; the app sends "tr". */
  language: z
    .string()
    .regex(/^[a-z]{2}$/)
    .default('tr'),
  /** Improves recognition of dish names with the cuisine's template names. */
  cuisineId: z.uuid().optional(),
});

export const transcriptionDtoSchema = z.object({
  text: z.string(),
  /** Product names parsed from the text (same rules as the typed prompt). */
  items: z.array(z.string()),
  language: z.string().nullable(),
  durationSec: z.number().nullable(),
  cached: z.boolean(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
});
export type TranscriptionDto = z.infer<typeof transcriptionDtoSchema>;

export const storedTranscriptionSchema = z.object({
  text: z.string(),
  language: z.string().nullable(),
  durationSec: z.number().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
});
export type StoredTranscription = z.infer<typeof storedTranscriptionSchema>;
