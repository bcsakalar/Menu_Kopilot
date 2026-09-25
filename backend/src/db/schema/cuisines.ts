import { sql } from 'drizzle-orm';
import { type AnyPgColumn, boolean, check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const cuisines = pgTable(
  'cuisines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    parentId: uuid('parent_id').references((): AnyPgColumn => cuisines.id, { onDelete: 'set null' }),
    isSystem: boolean('is_system').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    /** Minimum product count expected for a branch opening in this cuisine (user-editable, never hard-coded). */
    minItemCount: integer('min_item_count').notNull().default(10),
    /** Set when the user changes the target in settings; the seed's realistic targets never replace it (D-177). */
    minItemCountEditedByUser: boolean('min_item_count_edited_by_user').notNull().default(false),
    /** A realistic product count for a delivery menu of this cuisine (the research behind the target). */
    typicalItemCount: integer('typical_item_count'),
    /** Why the target is what it is — shown next to it in settings. */
    targetNote: text('target_note'),
    /** The product type an unrecognized product of this cuisine most likely is ("Karışık" in a pide shop). */
    defaultProductType: text('default_product_type'),
    notes: text('notes'),
    /** The user edited which categories this cuisine needs (cuisine_categories); the seed no longer touches them. */
    categoriesEditedByUser: boolean('categories_edited_by_user').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cuisines_parent_idx').on(t.parentId),
    check('cuisines_min_item_count_chk', sql`${t.minItemCount} >= 0`),
  ],
);
