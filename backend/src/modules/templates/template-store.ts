import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Executor } from '../../db/client.js';
import { ingredients, itemAliases, menuItems, optionGroups, options } from '../../db/schema/index.js';
import { PRICE_HINTS, type TemplatePayload } from '../../domain/template.js';
import { normalizeTr } from '../../lib/normalize-tr.js';

/**
 * Persistence for menu item templates (menu_items + option_groups + options + ingredients + aliases).
 * Shared by the seed, AI drafts, approvals and the template pool API.
 */

export type TemplateSource = 'ai' | 'user' | 'imported' | 'seed';

export interface TemplateRecord {
  id: string;
  cuisineId: string;
  canonicalName: string;
  normalizedName: string;
  source: TemplateSource;
  approved: boolean;
  needsReview: boolean;
  importance: number;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
  aliases: string[];
  payload: TemplatePayload;
}

export interface NewTemplate {
  cuisineId: string;
  payload: TemplatePayload;
  source: TemplateSource;
  approved: boolean;
  needsReview?: boolean;
  importance?: number;
  aliases?: readonly string[];
  createdBy?: string | null;
}

async function insertChildren(db: Executor, menuItemId: string, payload: TemplatePayload): Promise<void> {
  for (const [groupIndex, group] of payload.optionGroups.entries()) {
    const [row] = await db
      .insert(optionGroups)
      .values({
        menuItemId,
        name: group.name,
        selectionType: group.selectionType,
        isRequired: group.isRequired,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        sortOrder: groupIndex,
      })
      .returning({ id: optionGroups.id });
    if (!row) throw new Error('option group insert returned no row');
    if (group.options.length > 0) {
      await db.insert(options).values(
        group.options.map((option, optionIndex) => ({
          optionGroupId: row.id,
          name: option.name,
          sortOrder: optionIndex,
          isDefault: option.isDefault,
          priceMode: option.priceMode,
          priceHint: PRICE_HINTS[option.priceMode],
        })),
      );
    }
  }

  const ingredientRows = [
    ...payload.removableIngredients.map((name, index) => ({
      menuItemId,
      name,
      kind: 'removable' as const,
      priceHint: null,
      sortOrder: index,
    })),
    ...payload.extraIngredients.map((extra, index) => ({
      menuItemId,
      name: extra.name,
      kind: 'extra' as const,
      priceHint: extra.priceHint,
      sortOrder: index,
    })),
  ];
  if (ingredientRows.length > 0) {
    await db.insert(ingredients).values(ingredientRows);
  }
}

async function deleteChildren(db: Executor, menuItemId: string): Promise<void> {
  await db.delete(optionGroups).where(eq(optionGroups.menuItemId, menuItemId));
  await db.delete(ingredients).where(eq(ingredients.menuItemId, menuItemId));
}

function itemColumns(payload: TemplatePayload) {
  return {
    canonicalName: payload.name,
    normalizedName: normalizeTr(payload.name),
    description: payload.description,
    servingNote: payload.servingNote,
    portionInfo: payload.portionInfo,
    tags: payload.tags,
    allergenNotes: payload.allergenNotes,
    upsellSuggestion: payload.upsellSuggestion,
  };
}

export async function insertTemplate(db: Executor, input: NewTemplate): Promise<string> {
  const [row] = await db
    .insert(menuItems)
    .values({
      ...itemColumns(input.payload),
      cuisineId: input.cuisineId,
      source: input.source,
      approved: input.approved,
      needsReview: input.needsReview ?? false,
      importance: input.importance ?? 0,
      createdBy: input.createdBy ?? null,
    })
    .returning({ id: menuItems.id });
  if (!row) throw new Error('menu item insert returned no row');
  await insertChildren(db, row.id, input.payload);
  if (input.aliases && input.aliases.length > 0) {
    await addAliases(db, row.id, input.aliases, input.payload.name);
  }
  return row.id;
}

export async function replaceTemplateContent(
  db: Executor,
  id: string,
  payload: TemplatePayload,
  patch: Partial<Pick<NewTemplate, 'source' | 'approved' | 'needsReview' | 'importance' | 'cuisineId'>> = {},
): Promise<void> {
  await db
    .update(menuItems)
    .set({
      ...itemColumns(payload),
      ...(patch.source !== undefined ? { source: patch.source } : {}),
      ...(patch.approved !== undefined ? { approved: patch.approved } : {}),
      ...(patch.needsReview !== undefined ? { needsReview: patch.needsReview } : {}),
      ...(patch.importance !== undefined ? { importance: patch.importance } : {}),
      ...(patch.cuisineId !== undefined ? { cuisineId: patch.cuisineId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(menuItems.id, id));
  await deleteChildren(db, id);
  await insertChildren(db, id, payload);
}

/** Adds aliases (ignores ones equal to the canonical name or already present). */
export async function addAliases(
  db: Executor,
  menuItemId: string,
  aliases: readonly string[],
  canonicalName?: string,
): Promise<number> {
  const canonical = canonicalName ? normalizeTr(canonicalName) : undefined;
  const seen = new Set<string>();
  const rows: { menuItemId: string; alias: string; normalizedAlias: string }[] = [];
  for (const alias of aliases) {
    const normalized = normalizeTr(alias);
    if (normalized === '' || normalized === canonical || seen.has(normalized)) continue;
    seen.add(normalized);
    rows.push({ menuItemId, alias: alias.trim(), normalizedAlias: normalized });
  }
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(itemAliases)
    .values(rows)
    .onConflictDoNothing({ target: [itemAliases.menuItemId, itemAliases.normalizedAlias] })
    .returning({ id: itemAliases.id });
  return inserted.length;
}

export async function getTemplates(db: Executor, ids: readonly string[]): Promise<TemplateRecord[]> {
  if (ids.length === 0) return [];
  const rows = await db.query.menuItems.findMany({
    where: inArray(menuItems.id, [...ids]),
    with: {
      optionGroups: {
        orderBy: (g, { asc }) => [asc(g.sortOrder)],
        with: { options: { orderBy: (o, { asc }) => [asc(o.sortOrder)] } },
      },
      ingredients: { orderBy: (i, { asc }) => [asc(i.sortOrder)] },
      aliases: true,
    },
  });
  const byId = new Map(
    rows.map((row) => {
      const record: TemplateRecord = {
        id: row.id,
        cuisineId: row.cuisineId,
        canonicalName: row.canonicalName,
        normalizedName: row.normalizedName,
        source: row.source,
        approved: row.approved,
        needsReview: row.needsReview,
        importance: row.importance,
        usageCount: row.usageCount,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        aliases: row.aliases.map((a) => a.alias),
        payload: {
          name: row.canonicalName,
          description: row.description,
          servingNote: row.servingNote,
          portionInfo: row.portionInfo,
          optionGroups: row.optionGroups.map((g) => ({
            name: g.name,
            selectionType: g.selectionType,
            isRequired: g.isRequired,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            options: g.options.map((o) => ({ name: o.name, priceMode: o.priceMode, isDefault: o.isDefault })),
          })),
          removableIngredients: row.ingredients.filter((i) => i.kind === 'removable').map((i) => i.name),
          extraIngredients: row.ingredients
            .filter((i) => i.kind === 'extra')
            .map((i) => ({ name: i.name, priceHint: i.priceHint === 'ücretsiz' ? ('ücretsiz' as const) : ('ek ücretli' as const) })),
          tags: row.tags,
          allergenNotes: row.allergenNotes,
          upsellSuggestion: row.upsellSuggestion,
        },
      };
      return [row.id, record] as const;
    }),
  );
  // Preserve the requested order.
  return ids.map((id) => byId.get(id)).filter((r): r is TemplateRecord => r !== undefined);
}

export async function getTemplate(db: Executor, id: string): Promise<TemplateRecord | undefined> {
  const [record] = await getTemplates(db, [id]);
  return record;
}

export async function findApprovedByName(
  db: Executor,
  cuisineId: string,
  normalizedName: string,
): Promise<{ id: string; source: TemplateSource } | undefined> {
  const [row] = await db
    .select({ id: menuItems.id, source: menuItems.source })
    .from(menuItems)
    .where(
      and(eq(menuItems.cuisineId, cuisineId), eq(menuItems.normalizedName, normalizedName), eq(menuItems.approved, true)),
    )
    .limit(1);
  return row;
}

export async function incrementUsage(db: Executor, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(menuItems)
    .set({ usageCount: sql`${menuItems.usageCount} + 1` })
    .where(inArray(menuItems.id, [...ids]));
}
