import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  vector,
} from 'drizzle-orm/pg-core';
import { cuisines } from './cuisines.js';
import { ingredientKind, menuItemSource, priceMode, selectionType } from './enums.js';
import { users } from './users.js';

export const EMBEDDING_DIM = 768;
export const DESCRIPTION_MAX = 160;

/** Canonical template pool. Only approved rows are ever used for retrieval (Stage B). */
export const menuItems = pgTable(
  'menu_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    canonicalName: text('canonical_name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    cuisineId: uuid('cuisine_id')
      .notNull()
      .references(() => cuisines.id, { onDelete: 'restrict' }),
    description: varchar('description', { length: DESCRIPTION_MAX }).notNull().default(''),
    servingNote: text('serving_note').notNull().default(''),
    portionInfo: text('portion_info').notNull().default(''),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    allergenNotes: jsonb('allergen_notes').$type<string[]>().notNull().default([]),
    upsellSuggestion: text('upsell_suggestion').notNull().default(''),
    source: menuItemSource('source').notNull(),
    approved: boolean('approved').notNull().default(false),
    needsReview: boolean('needs_review').notNull().default(false),
    /** 0–100 prior: how essential this item is for its cuisine ("almost always on the menu"). */
    importance: smallint('importance').notNull().default(0),
    usageCount: integer('usage_count').notNull().default(0),
    qualityScore: real('quality_score'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('menu_items_normalized_name_trgm_idx').using('gin', t.normalizedName.op('gin_trgm_ops')),
    uniqueIndex('menu_items_cuisine_name_approved_uq').on(t.cuisineId, t.normalizedName, t.approved),
    index('menu_items_cuisine_usage_idx').on(t.cuisineId, t.approved, t.usageCount),
    check('menu_items_description_len_chk', sql`char_length(${t.description}) <= 160`),
    check('menu_items_importance_chk', sql`${t.importance} between 0 and 100`),
  ],
);

export const optionGroups = pgTable(
  'option_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    selectionType: selectionType('selection_type').notNull(),
    isRequired: boolean('is_required').notNull().default(false),
    minSelect: integer('min_select').notNull().default(0),
    /** No upper bound on purpose: 5–7 options per group is normal and preferred. */
    maxSelect: integer('max_select').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    index('option_groups_item_idx').on(t.menuItemId),
    check('option_groups_select_chk', sql`${t.minSelect} >= 0 and ${t.maxSelect} >= 1 and ${t.maxSelect} >= ${t.minSelect}`),
  ],
);

export const options = pgTable(
  'options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    optionGroupId: uuid('option_group_id')
      .notNull()
      .references(() => optionGroups.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isDefault: boolean('is_default').notNull().default(false),
    priceMode: priceMode('price_mode').notNull().default('free'),
    /** "ücretsiz" | "ek ücretli" | "tabanı belirler" — never a number. */
    priceHint: text('price_hint').notNull().default('ücretsiz'),
  },
  (t) => [index('options_group_idx').on(t.optionGroupId)],
);

export const ingredients = pgTable(
  'ingredients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: ingredientKind('kind').notNull(),
    /** Kept for the spec; the system never fills in amounts (the vendor states prices on the phone). */
    priceDelta: numeric('price_delta', { precision: 10, scale: 2 }),
    priceHint: text('price_hint'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('ingredients_item_idx').on(t.menuItemId)],
);

export const itemAliases = pgTable(
  'item_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    normalizedAlias: text('normalized_alias').notNull(),
  },
  (t) => [
    uniqueIndex('item_aliases_item_alias_uq').on(t.menuItemId, t.normalizedAlias),
    index('item_aliases_normalized_idx').on(t.normalizedAlias),
    index('item_aliases_normalized_trgm_idx').using('gin', t.normalizedAlias.op('gin_trgm_ops')),
  ],
);

export const itemEmbeddings = pgTable(
  'item_embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    /** Vector spaces of different models are incompatible: always filter by model + dim. */
    model: text('model').notNull(),
    dim: integer('dim').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIM }).notNull(),
    /** sha256 of the embedded text; unchanged input → no re-embedding. */
    inputHash: text('input_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('item_embeddings_item_model_uq').on(t.menuItemId, t.model, t.dim),
    index('item_embeddings_hnsw_idx')
      .using('hnsw', t.embedding.op('vector_cosine_ops'))
      .with({ m: 16, ef_construction: 64 }),
  ],
);
