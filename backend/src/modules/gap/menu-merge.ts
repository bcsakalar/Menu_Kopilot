import { mostSimilarIndex } from '../../lib/trigram.js';

/**
 * How the products read from the panel combine with the branch menu stored so far (earlier screenshots, cards
 * accepted in Mod 1, recommendations):
 * - the same normalized name is the same product;
 * - different panel names are different products even when they match the same template ("Adana Dürüm" and
 *   "Adana Porsiyon" are two products on the platform);
 * - a card accepted in Mod 1 ("Adana Kebap") is the product the panel shows under another name when the template
 *   links them ("Adana Dürüm"); with several candidates the most similar name wins. The stored card row is then
 *   renamed to the panel name so later screenshots update it instead of adding a duplicate.
 */

export interface StoredMenuRow {
  id: string;
  rawName: string;
  normalizedName: string;
  matchedItemId: string | null;
  status: 'ok' | 'incomplete' | 'missing';
  source: 'screenshot' | 'suggestion' | 'recommendation' | 'manual';
}

export interface PanelProduct {
  name: string;
  normalized: string;
  matchedTemplateId: string | null;
}

export interface MenuMerge {
  renames: { rowId: string; rawName: string; normalizedName: string }[];
  /** Distinct products on the menu after the merge. */
  current: number;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

export function mergeWithStoredMenu(stored: readonly StoredMenuRow[], panel: readonly PanelProduct[]): MenuMerge {
  const storedNames = new Set(stored.map((r) => r.normalizedName));
  const panelNames = new Set(panel.map((p) => p.normalized));
  const onMenu = stored.filter((r) => r.status !== 'missing');

  const newPanelByTemplate = groupBy(
    panel.filter((p) => !storedNames.has(p.normalized)),
    (p) => p.matchedTemplateId,
  );
  const cardRowsByTemplate = groupBy(
    onMenu.filter((r) => r.source !== 'screenshot' && !panelNames.has(r.normalizedName)),
    (r) => r.matchedItemId,
  );

  const renames: MenuMerge['renames'] = [];
  for (const [templateId, products] of newPanelByTemplate) {
    const free = [...products];
    for (const row of cardRowsByTemplate.get(templateId) ?? []) {
      const best = mostSimilarIndex(
        row.normalizedName,
        free.map((p) => p.normalized),
      );
      if (best < 0) break;
      const [product] = free.splice(best, 1);
      if (product) renames.push({ rowId: row.id, rawName: product.name, normalizedName: product.normalized });
    }
  }

  const renamed = new Set(renames.map((r) => r.rowId));
  const storedOnly = onMenu.filter((r) => !panelNames.has(r.normalizedName) && !renamed.has(r.id)).length;
  return { renames, current: panel.length + storedOnly };
}
