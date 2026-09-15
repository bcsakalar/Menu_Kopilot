import { z } from 'zod';

export const usageRangeSchema = z.enum(['today', 'month']);

const counters = {
  calls: z.number().int(),
  failed: z.number().int(),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  avgLatencyMs: z.number().int(),
};

export const usageSummarySchema = z.object({
  range: usageRangeSchema,
  from: z.string(),
  timezone: z.string(),
  totals: z.object(counters),
  byModel: z.array(z.object({ provider: z.string(), model: z.string(), label: z.string(), ...counters })),
  byTask: z.array(z.object({ taskKey: z.string(), label: z.string(), calls: z.number().int(), failed: z.number().int() })),
  errors: z.array(z.object({ code: z.string(), count: z.number().int() })),
  runs: z.object({
    total: z.number().int(),
    suggest: z.number().int(),
    gap: z.number().int(),
    /** Runs answered without any external API call. */
    cacheHit: z.number().int(),
    cacheHitRatio: z.number(),
  }),
  cards: z.object({
    total: z.number().int(),
    /** Seed / user-approved templates served from the DB. */
    fromDb: z.number().int(),
    ai: z.number().int(),
    review: z.number().int(),
    dbHitRatio: z.number(),
  }),
  quota: z.object({
    allowed: z.boolean(),
    callsToday: z.number().int(),
    tokensToday: z.number().int(),
    dailyCalls: z.number().int(),
    dailyTokens: z.number().int(),
  }),
});
export type UsageSummary = z.infer<typeof usageSummarySchema>;
