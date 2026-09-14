import { relations } from 'drizzle-orm';
import { branches, branchMenuItems, branchMenuSnapshots } from './branches.js';
import { cuisines } from './cuisines.js';
import { ingredients, itemAliases, itemEmbeddings, menuItems, optionGroups, options } from './menu-items.js';
import { suggestionItems, suggestionRuns } from './suggestions.js';
import { devices, users } from './users.js';

export const usersRelations = relations(users, ({ many }) => ({
  devices: many(devices),
  branches: many(branches),
}));

export const devicesRelations = relations(devices, ({ one }) => ({
  user: one(users, { fields: [devices.userId], references: [users.id] }),
}));

export const cuisinesRelations = relations(cuisines, ({ one, many }) => ({
  parent: one(cuisines, { fields: [cuisines.parentId], references: [cuisines.id], relationName: 'cuisine_parent' }),
  children: many(cuisines, { relationName: 'cuisine_parent' }),
  menuItems: many(menuItems),
}));

export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  cuisine: one(cuisines, { fields: [menuItems.cuisineId], references: [cuisines.id] }),
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

export const branchesRelations = relations(branches, ({ one, many }) => ({
  user: one(users, { fields: [branches.userId], references: [users.id] }),
  cuisine: one(cuisines, { fields: [branches.cuisineId], references: [cuisines.id] }),
  snapshots: many(branchMenuSnapshots),
  items: many(branchMenuItems),
}));

export const branchMenuSnapshotsRelations = relations(branchMenuSnapshots, ({ one }) => ({
  branch: one(branches, { fields: [branchMenuSnapshots.branchId], references: [branches.id] }),
}));

export const branchMenuItemsRelations = relations(branchMenuItems, ({ one }) => ({
  branch: one(branches, { fields: [branchMenuItems.branchId], references: [branches.id] }),
  matchedItem: one(menuItems, { fields: [branchMenuItems.matchedItemId], references: [menuItems.id] }),
}));

export const suggestionRunsRelations = relations(suggestionRuns, ({ many }) => ({
  items: many(suggestionItems),
}));

export const suggestionItemsRelations = relations(suggestionItems, ({ one }) => ({
  run: one(suggestionRuns, { fields: [suggestionItems.runId], references: [suggestionRuns.id] }),
  matchedItem: one(menuItems, { fields: [suggestionItems.matchedItemId], references: [menuItems.id] }),
}));
