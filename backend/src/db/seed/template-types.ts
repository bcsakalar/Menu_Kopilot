import type { TemplateOptionGroup, TemplatePayload } from '../../domain/template.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import type { CuisineSlug } from './cuisines.js';

export interface SeedTemplate {
  cuisine: CuisineSlug;
  /** 0–100: how essential the item is for its cuisine (drives gap-analysis recommendations). */
  importance: number;
  aliases: readonly string[];
  payload: TemplatePayload;
}

interface SeedTemplateInput {
  cuisine: CuisineSlug;
  importance: number;
  aliases: readonly string[];
  name: string;
  description: string;
  servingNote: string;
  portionInfo: string;
  groups: readonly TemplateOptionGroup[];
  removable: readonly string[];
  extras: readonly string[];
  tags: readonly string[];
  allergens: readonly string[];
  upsell: string;
}

/**
 * Aliases that normalize to the product's own name or to an earlier alias add nothing: matching already works on the
 * normalized form (e.g. "Adana Kebabı" → "adana kebap"). They are dropped here so every stored alias is distinct.
 */
function distinctAliases(name: string, aliases: readonly string[]): string[] {
  const seen = new Set([normalizeTr(name)]);
  return aliases.filter((alias) => {
    const key = normalizeTr(alias);
    if (key.length === 0 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function template(input: SeedTemplateInput): SeedTemplate {
  return {
    cuisine: input.cuisine,
    importance: input.importance,
    aliases: distinctAliases(input.name, input.aliases),
    payload: {
      name: input.name,
      description: input.description,
      servingNote: input.servingNote,
      portionInfo: input.portionInfo,
      optionGroups: [...input.groups],
      removableIngredients: [...input.removable],
      extraIngredients: input.extras.map((name) => ({ name, priceHint: 'ek ücretli' as const })),
      tags: [...input.tags],
      allergenNotes: [...input.allergens],
      upsellSuggestion: input.upsell,
    },
  };
}
