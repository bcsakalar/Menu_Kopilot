import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { cuisines } from './cuisines.js';
import { branchItemSource, branchItemStatus, branchStatus, snapshotSource } from './enums.js';
import { menuItems } from './menu-items.js';
import { suggestionRuns } from './suggestions.js';
import { users } from './users.js';

export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    city: text('city'),
    cuisineId: uuid('cuisine_id')
      .notNull()
      .references(() => cuisines.id, { onDelete: 'restrict' }),
    status: branchStatus('status').notNull().default('in_progress'),
    notes: text('notes'),
    /** Manual override. null → automatic target = max(10, cuisine.min_item_count). */
    targetItemCount: integer('target_item_count'),
    currentItemCount: integer('current_item_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('branches_user_idx').on(t.userId),
    check('branches_target_chk', sql`${t.targetItemCount} is null or ${t.targetItemCount} >= 1`),
  ],
);

export const branchMenuSnapshots = pgTable(
  'branch_menu_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').references((): AnyPgColumn => suggestionRuns.id, { onDelete: 'set null' }),
    source: snapshotSource('source').notNull(),
    imageHashes: jsonb('image_hashes').$type<string[]>().notNull().default([]),
    parsed: jsonb('parsed').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('branch_menu_snapshots_branch_idx').on(t.branchId, t.createdAt)],
);

export const branchMenuItems = pgTable(
  'branch_menu_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    snapshotId: uuid('snapshot_id').references(() => branchMenuSnapshots.id, { onDelete: 'set null' }),
    rawName: text('raw_name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    matchedItemId: uuid('matched_item_id').references(() => menuItems.id, { onDelete: 'set null' }),
    hasDescription: boolean('has_description').notNull().default(false),
    hasOptions: boolean('has_options').notNull().default(false),
    hasRemovables: boolean('has_removables').notNull().default(false),
    /** Tri-state detail from the screenshot: { description, options, removables: present|absent|unknown }. */
    flags: jsonb('flags').$type<Record<string, string>>(),
    completenessScore: real('completeness_score').notNull().default(0),
    status: branchItemStatus('status').notNull(),
    source: branchItemSource('source').notNull(),
    /** One-line rationale for recommended (missing) items. */
    reason: text('reason'),
    /** Frozen, accepted card payload used for the branch export. */
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('branch_menu_items_branch_name_uq').on(t.branchId, t.normalizedName),
    index('branch_menu_items_status_idx').on(t.branchId, t.status),
  ],
);
