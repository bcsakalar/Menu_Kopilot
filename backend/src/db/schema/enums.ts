import { pgEnum } from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['admin', 'uzman']);

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

/**
 * Which section of the result screen a card belongs to:
 * new_product — not on the menu at all, proposed as an addition
 * option      — an option group / ingredient set for a product already on the menu
 * fix         — something wrong or empty on a product already on the menu
 */
export const suggestionSection = pgEnum('suggestion_section', ['new_product', 'option', 'fix']);

/** What a `fix` card is about. */
export const fixKind = pgEnum('fix_kind', ['empty_description', 'bad_name', 'wrong_category']);

export const agentStepStatus = pgEnum('agent_step_status', ['ok', 'failed', 'skipped']);
