import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { cuisines } from './cuisines.js';

/**
 * Menu category taxonomy. Nothing about categories is hard-coded in the pipeline: the Gap Analyst reads the
 * expectations of a cuisine from `cuisine_categories`, and classifies a product name with the `keywords` stored
 * here. Both tables are editable from the settings screen, so the user can retune a cuisine without a redeploy.
 */

export const menuCategories = pgTable(
  'menu_categories',
  {
    /** Stable key used by prompts, schemas and the UI (e.g. `icecek`). */
    key: text('key').primaryKey(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    /**
     * Normalized (normalizeTr) words or phrases. A product whose name contains one of them (as whole tokens) belongs
     * to this category.
     * Order matters only across categories: `cuisine_categories.sort_order` decides which one wins on a tie.
     */
    keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
    /** Set by an edit in settings; from then on the seed (run on every start) no longer refreshes this row. */
    editedByUser: boolean('edited_by_user').notNull().default(false),
  },
  (t) => [index('menu_categories_sort_idx').on(t.sortOrder)],
);

export const cuisineCategories = pgTable(
  'cuisine_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cuisineId: uuid('cuisine_id')
      .notNull()
      .references(() => cuisines.id, { onDelete: 'cascade' }),
    categoryKey: text('category_key')
      .notNull()
      .references(() => menuCategories.key, { onDelete: 'cascade' }),
    /** How many products this cuisine should have in the category for a branch opening. 0 = nice to have. */
    minItems: integer('min_items').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    uniqueIndex('cuisine_categories_cuisine_key_uq').on(t.cuisineId, t.categoryKey),
    index('cuisine_categories_cuisine_idx').on(t.cuisineId, t.sortOrder),
    check('cuisine_categories_min_chk', sql`${t.minItems} >= 0 and ${t.minItems} <= 100`),
  ],
);
