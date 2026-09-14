import type { TemplateOptionGroup, TemplatePayload } from '../../domain/template.js';
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

export function template(input: SeedTemplateInput): SeedTemplate {
  return {
    cuisine: input.cuisine,
    importance: input.importance,
    aliases: input.aliases,
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
