import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { cuisines } from './cuisines.js';
import { fixKind, runMode, runStatus, suggestionItemSource, suggestionSection } from './enums.js';
import { menuItems } from './menu-items.js';
import { users } from './users.js';

export const suggestionRuns = pgTable(
  'suggestion_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cuisineId: uuid('cuisine_id').references(() => cuisines.id, { onDelete: 'set null' }),
    mode: runMode('mode').notNull().default('suggest'),
    promptText: text('prompt_text'),
    imageHashes: jsonb('image_hashes').$type<string[]>().notNull().default([]),
    /** Provider/model of the last successful LLM call in the run (null when served from DB/cache only). */
    provider: text('provider'),
    model: text('model'),
    stage: text('stage').notNull().default('init'),
    status: runStatus('status').notNull().default('running'),
    deepMode: boolean('deep_mode').notNull().default(false),
    latencyMs: integer('latency_ms'),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    llmCalls: integer('llm_calls').notNull().default(0),
    costEstimate: numeric('cost_estimate', { precision: 12, scale: 6 }),
    /** True when the run was answered without any LLM call (DB/cache only). */
    cacheHit: boolean('cache_hit').notNull().default(false),
    /**
     * The menu the run analysed: products read from photos / typed by the user, with their category and the
     * fields the panel screenshot showed as filled. Replaces the old per-branch menu snapshot.
     */
    menuSnapshot: jsonb('menu_snapshot').$type<Record<string, unknown>>(),
    /** Counts against the cuisine target at the end of the run (`current`, `target`, per-category gaps). */
    counts: jsonb('counts').$type<Record<string, unknown>>(),
    /** Work left over when the per-request budget ran out ("Devam et"). */
    pendingWork: jsonb('pending_work').$type<Record<string, unknown>>(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('suggestion_runs_created_at_idx').on(t.createdAt),
    index('suggestion_runs_user_created_idx').on(t.userId, t.createdAt),
  ],
);

export const suggestionItems = pgTable(
  'suggestion_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => suggestionRuns.id, { onDelete: 'cascade' }),
    rawName: text('raw_name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    matchedItemId: uuid('matched_item_id').references(() => menuItems.id, { onDelete: 'set null' }),
    source: suggestionItemSource('source').notNull(),
    /** Which section of the result screen shows this card. */
    section: suggestionSection('section').notNull().default('new_product'),
    /** Category key (`menu_categories.key`) the card belongs to; drives the gap counters. */
    categoryKey: text('category_key'),
    /** For `option` and `fix` cards: the product already on the menu this card is about. */
    targetName: text('target_name'),
    /** For `fix` cards only. */
    fixKind: fixKind('fix_kind'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    /** null = pending, true = accepted (template saved), false = skipped. */
    accepted: boolean('accepted'),
    editedPayload: jsonb('edited_payload').$type<Record<string, unknown>>(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('suggestion_items_run_idx').on(t.runId),
    index('suggestion_items_run_section_idx').on(t.runId, t.section, t.sortOrder),
    index('suggestion_items_matched_idx').on(t.matchedItemId),
  ],
);
