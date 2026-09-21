import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { agentStepStatus } from './enums.js';
import { suggestionRuns } from './suggestions.js';

/**
 * One row per agent step of an analysis run — the audit trail behind the hidden debug screen.
 * Input and output are stored trimmed (see `AgentTracer.MAX_PAYLOAD`), never the raw image bytes.
 */
export const agentSteps = pgTable(
  'agent_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => suggestionRuns.id, { onDelete: 'cascade' }),
    /** Order within the run; parallel steps share no sequence but keep their start order. */
    seq: integer('seq').notNull(),
    /** `extractor` | `classifier` | `gap_analyst` | `product_recommender` | `option_modifier` | `validator` */
    agent: text('agent').notNull(),
    status: agentStepStatus('status').notNull(),
    provider: text('provider'),
    model: text('model'),
    durationMs: integer('duration_ms').notNull().default(0),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    /** How many model calls this step made (0 for the deterministic ones). */
    llmCalls: integer('llm_calls').notNull().default(0),
    input: jsonb('input').$type<Record<string, unknown>>(),
    output: jsonb('output').$type<Record<string, unknown>>(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('agent_steps_run_seq_idx').on(t.runId, t.seq)],
);
