import { z } from 'zod';
import { TASK_KEYS } from '../../config/models.js';

export const providerNameSchema = z.enum(['gemini', 'groq']);
export const taskKeySchema = z.enum(TASK_KEYS);

export const modelOptionSchema = z.object({
  id: z.string(),
  provider: providerNameSchema,
  label: z.string(),
  preview: z.boolean(),
});

export const routeDtoSchema = modelOptionSchema.extend({
  priority: z.number().int(),
  enabled: z.boolean(),
  providerConfigured: z.boolean(),
});

export const taskSettingsSchema = z.object({
  taskKey: taskKeySchema,
  label: z.string(),
  chain: z.array(routeDtoSchema),
  eligibleModels: z.array(modelOptionSchema),
});

export const providerSettingsSchema = z.object({
  localOnlyMode: z.boolean(),
  providers: z.array(
    z.object({
      name: providerNameSchema,
      configured: z.boolean(),
      circuit: z.enum(['closed', 'open', 'half_open']),
    }),
  ),
  tasks: z.array(taskSettingsSchema),
});
export type ProviderSettings = z.infer<typeof providerSettingsSchema>;

export const setPrimaryParamsSchema = z.object({ taskKey: taskKeySchema });
export const setPrimaryBodySchema = z.object({ model: z.string().min(1).max(100) });

export const quotaSchema = z.object({
  allowed: z.boolean(),
  callsToday: z.number().int(),
  dailyCalls: z.number().int(),
  tokensToday: z.number().int(),
  dailyTokens: z.number().int(),
  timezone: z.string(),
  localOnlyMode: z.boolean(),
});
