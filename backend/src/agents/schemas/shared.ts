import { z } from 'zod';

/**
 * Small pieces shared by more than one agent.
 *
 * `itemsEnvelopeSchema` is the lenient shape used whenever a provider is asked for a list: the array is validated
 * item by item afterwards, so one malformed entry never sinks a whole batch.
 */

export const itemsEnvelopeSchema = z.object({ items: z.array(z.unknown()) });

/** How a product name was resolved to a template in the pool. */
export const matchTypeSchema = z.enum(['exact', 'alias', 'trigram', 'vector', 'canonical']);
export type MatchType = z.infer<typeof matchTypeSchema>;
