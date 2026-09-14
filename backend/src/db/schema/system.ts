import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { suggestionRuns } from './suggestions.js';
import { users } from './users.js';

/** Prompts live in the DB (versioned) so they can be improved without a redeploy. */
export const promptTemplates = pgTable(
  'prompt_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    version: integer('version').notNull(),
    content: text('content').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('prompt_templates_key_version_uq').on(t.key, t.version),
    uniqueIndex('prompt_templates_active_key_uq').on(t.key).where(sql`${t.isActive}`),
  ],
);

/** Task → provider/model routing. Lowest priority value is tried first; the rest form the fallback chain. */
export const providerConfigs = pgTable(
  'provider_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    taskKey: text('task_key').notNull(),
    model: text('model').notNull(),
    params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
    priority: integer('priority').notNull(),
    enabled: boolean('enabled').notNull().default(true),
  },
  (t) => [
    uniqueIndex('provider_configs_task_provider_model_uq').on(t.taskKey, t.provider, t.model),
    index('provider_configs_task_priority_idx').on(t.taskKey, t.priority),
  ],
);

/** One row per provider call attempt (success or failure). */
export const usageLog = pgTable(
  'usage_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    runId: uuid('run_id').references(() => suggestionRuns.id, { onDelete: 'set null' }),
    taskKey: text('task_key').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    success: boolean('success').notNull(),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('usage_log_user_created_idx').on(t.userId, t.createdAt), index('usage_log_created_idx').on(t.createdAt)],
);
