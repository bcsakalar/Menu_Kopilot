import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { TemplateOptionGroup } from '../../domain/template.js';
import { menuCategories } from './categories.js';
import { suggestionItems, suggestionRuns } from './suggestions.js';
import { users } from './users.js';

/**
 * The product-type knowledge base (D-179): cuisine → product type → option templates and typical ingredients.
 * See `domain/product-type.ts` for how a row is used. Seeded from `db/seed/product-types.ts`; a row the user
 * edits keeps `edited_by_user` and is never overwritten by the seed again.
 */
export const productTypes = pgTable('product_types', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  categoryKey: text('category_key').references(() => menuCategories.key, { onDelete: 'set null' }),
  keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
  plain: boolean('plain').notNull().default(false),
  optionGroups: jsonb('option_groups').$type<TemplateOptionGroup[]>().notNull().default([]),
  removable: jsonb('removable').$type<string[]>().notNull().default([]),
  extras: jsonb('extras').$type<string[]>().notNull().default([]),
  forbiddenGroups: jsonb('forbidden_groups').$type<string[]>().notNull().default([]),
  forbiddenIngredients: jsonb('forbidden_ingredients').$type<string[]>().notNull().default([]),
  fallbackDescription: text('fallback_description').notNull().default(''),
  cuisines: jsonb('cuisines').$type<string[]>().notNull().default([]),
  priority: integer('priority').notNull().default(0),
  version: integer('version').notNull().default(1),
  editedByUser: boolean('edited_by_user').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * What the user kept and removed when accepting a card (D-180). One row per option group, ingredient or
 * description; aggregated per product type it tells the pipeline which suggestions this team keeps discarding.
 */
export const suggestionFeedback = pgTable(
  'suggestion_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').references(() => suggestionRuns.id, { onDelete: 'set null' }),
    cardId: uuid('card_id').references(() => suggestionItems.id, { onDelete: 'set null' }),
    productType: text('product_type'),
    /** product | option_group | removable | extra | description */
    kind: text('kind').notNull(),
    value: text('value').notNull(),
    /** accepted | removed | edited */
    action: text('action').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('suggestion_feedback_type_idx').on(t.productType, t.kind, t.value)],
);
