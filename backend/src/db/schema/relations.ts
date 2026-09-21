import { relations } from 'drizzle-orm';
import { agentSteps } from './agents.js';
import { cuisineCategories, menuCategories } from './categories.js';
import { cuisines } from './cuisines.js';
import { ingredients, itemAliases, itemEmbeddings, menuItems, optionGroups, options } from './menu-items.js';
import { suggestionItems, suggestionRuns } from './suggestions.js';
import { devices, users } from './users.js';

export const usersRelations = relations(users, ({ many }) => ({
  devices: many(devices),
}));

export const devicesRelations = relations(devices, ({ one }) => ({
  user: one(users, { fields: [devices.userId], references: [users.id] }),
}));

export const cuisinesRelations = relations(cuisines, ({ one, many }) => ({
  parent: one(cuisines, { fields: [cuisines.parentId], references: [cuisines.id], relationName: 'cuisine_parent' }),
  children: many(cuisines, { relationName: 'cuisine_parent' }),
  menuItems: many(menuItems),
  categories: many(cuisineCategories),
}));

export const menuCategoriesRelations = relations(menuCategories, ({ many }) => ({
  cuisines: many(cuisineCategories),
}));

export const cuisineCategoriesRelations = relations(cuisineCategories, ({ one }) => ({
  cuisine: one(cuisines, { fields: [cuisineCategories.cuisineId], references: [cuisines.id] }),
  category: one(menuCategories, { fields: [cuisineCategories.categoryKey], references: [menuCategories.key] }),
}));

export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  cuisine: one(cuisines, { fields: [menuItems.cuisineId], references: [cuisines.id] }),
  category: one(menuCategories, { fields: [menuItems.categoryKey], references: [menuCategories.key] }),
  optionGroups: many(optionGroups),
  ingredients: many(ingredients),
  aliases: many(itemAliases),
  embeddings: many(itemEmbeddings),
}));

export const optionGroupsRelations = relations(optionGroups, ({ one, many }) => ({
  menuItem: one(menuItems, { fields: [optionGroups.menuItemId], references: [menuItems.id] }),
  options: many(options),
}));

export const optionsRelations = relations(options, ({ one }) => ({
  group: one(optionGroups, { fields: [options.optionGroupId], references: [optionGroups.id] }),
}));

export const ingredientsRelations = relations(ingredients, ({ one }) => ({
  menuItem: one(menuItems, { fields: [ingredients.menuItemId], references: [menuItems.id] }),
}));

export const itemAliasesRelations = relations(itemAliases, ({ one }) => ({
  menuItem: one(menuItems, { fields: [itemAliases.menuItemId], references: [menuItems.id] }),
}));

export const itemEmbeddingsRelations = relations(itemEmbeddings, ({ one }) => ({
  menuItem: one(menuItems, { fields: [itemEmbeddings.menuItemId], references: [menuItems.id] }),
}));

export const suggestionRunsRelations = relations(suggestionRuns, ({ many }) => ({
  items: many(suggestionItems),
  steps: many(agentSteps),
}));

export const suggestionItemsRelations = relations(suggestionItems, ({ one }) => ({
  run: one(suggestionRuns, { fields: [suggestionItems.runId], references: [suggestionRuns.id] }),
  matchedItem: one(menuItems, { fields: [suggestionItems.matchedItemId], references: [menuItems.id] }),
}));

export const agentStepsRelations = relations(agentSteps, ({ one }) => ({
  run: one(suggestionRuns, { fields: [agentSteps.runId], references: [suggestionRuns.id] }),
}));
