import { pgEnum } from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['admin', 'uzman']);

export const branchStatus = pgEnum('branch_status', ['draft', 'in_progress', 'ready', 'opened']);

export const snapshotSource = pgEnum('snapshot_source', ['screenshot', 'manual', 'import']);

/** ok/incomplete = on the branch menu, missing = recommended but not on the menu yet. */
export const branchItemStatus = pgEnum('branch_item_status', ['ok', 'incomplete', 'missing']);

export const branchItemSource = pgEnum('branch_item_source', ['screenshot', 'suggestion', 'recommendation', 'manual']);

export const menuItemSource = pgEnum('menu_item_source', ['ai', 'user', 'imported', 'seed']);

export const selectionType = pgEnum('selection_type', ['single', 'multi']);

/**
 * free      : 0 TL, does not change the price
 * surcharge : adds an extra charge on top of the item price
 * sets_base : selecting it DEFINES the item's base price (e.g. "Boy: Orta")
 */
export const priceMode = pgEnum('price_mode', ['free', 'surcharge', 'sets_base']);

export const ingredientKind = pgEnum('ingredient_kind', ['removable', 'extra', 'base']);

export const runMode = pgEnum('run_mode', ['suggest', 'gap']);

export const runStatus = pgEnum('run_status', ['running', 'completed', 'partial', 'failed', 'cancelled']);

/** Where a suggestion card came from: seed template, user-approved DB template, AI, or unknown (needs review). */
export const suggestionItemSource = pgEnum('suggestion_item_source', ['seed', 'db', 'ai', 'review']);
