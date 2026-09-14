import {
  DESCRIPTION_MAX_LENGTH,
  type TemplateOptionGroup,
  type TemplatePayload,
  type TemplatePayloadInput,
  isBasePriceGroupName,
} from '../../domain/template.js';
import { cleanItemName, titleCaseTr } from '../../lib/clean-name.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import { stripPriceAmounts } from '../../lib/price-guard.js';
import type { LlmItem } from './schemas.js';

/**
 * Deterministic clean-up of model output before validation, so trivially fixable problems never cost a repair call:
 * prices removed, lengths clamped (description ≤ 160 at a word boundary), option-group rules and the
 * one-sets_base-group rule enforced, duplicates dropped.
 */

const clean = (value: string) => stripPriceAmounts(value.replace(/\s+/g, ' ').trim());

export function clampText(value: string, max: number): string {
  const text = clean(value);
  if (text.length <= max) return text;
  const slice = text.slice(0, max + 1);
  const sentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('; '));
  if (sentenceEnd >= max * 0.6) return slice.slice(0, sentenceEnd + 1).trim();
  const space = slice.lastIndexOf(' ', max - 1);
  const cut = (space > max * 0.5 ? slice.slice(0, space) : text.slice(0, max - 1)).replace(/[\s,;:–—-]+$/u, '');
  return cut.length < max ? `${cut}.` : cut.slice(0, max);
}

export function clampDescription(value: string): string {
  return clampText(value, DESCRIPTION_MAX_LENGTH);
}

function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (k === '' || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function cleanList(values: readonly string[], max: number, cap: number): string[] {
  return uniqueBy(
    values.map((v) => clampText(v, max)).filter((v) => v.length > 0),
    normalizeTr,
  ).slice(0, cap);
}

type GroupDraft = TemplateOptionGroup;

function normalizeGroup(group: LlmItem['option_groups'][number]): GroupDraft | undefined {
  const name = clampText(group.name, 60);
  const options = uniqueBy(
    group.options
      .map((o) => ({ name: clampText(cleanItemName(o.name) || o.name, 60), priceMode: o.price_mode, isDefault: false }))
      .filter((o) => o.name.length > 0),
    (o) => normalizeTr(o.name),
  ).slice(0, 15);
  if (name === '' || options.length === 0) return undefined;

  const selectionType = group.selection_type === 'multi' ? 'multi' : 'single';
  const isRequired = group.is_required;
  const minSelect = isRequired ? Math.max(1, Math.min(group.min_select, options.length)) : 0;
  const maxSelect =
    selectionType === 'single' ? 1 : Math.max(Math.max(minSelect, 1), Math.min(group.max_select, options.length));
  return {
    name,
    selectionType,
    isRequired,
    minSelect: selectionType === 'single' ? Math.min(minSelect, 1) : minSelect,
    maxSelect,
    options,
  };
}

function asBaseGroup(group: GroupDraft): GroupDraft {
  return {
    ...group,
    selectionType: 'single',
    isRequired: true,
    minSelect: 1,
    maxSelect: 1,
    options: group.options.map((o) => ({ ...o, priceMode: 'sets_base' as const })),
  };
}

function withoutBase(group: GroupDraft): GroupDraft {
  return {
    ...group,
    options: group.options.map((o) => (o.priceMode === 'sets_base' ? { ...o, priceMode: 'surcharge' as const } : o)),
  };
}

/** At most one sets_base group: a Boy/Porsiyon-named group wins, else the first group the model marked. */
export function enforceBasePriceRules(groups: readonly GroupDraft[]): GroupDraft[] {
  let baseIndex = groups.findIndex((g) => isBasePriceGroupName(g.name));
  if (baseIndex < 0) baseIndex = groups.findIndex((g) => g.options.some((o) => o.priceMode === 'sets_base'));
  return groups.map((g, i) => (i === baseIndex ? asBaseGroup(g) : withoutBase(g)));
}

/** Returns a candidate payload; callers validate it with `templatePayloadSchema.safeParse`. */
export function sanitizeLlmItem(item: LlmItem, rawName: string): TemplatePayloadInput {
  const name = clampText(cleanItemName(item.name) || titleCaseTr(cleanItemName(rawName)), 80) || titleCaseTr(rawName);
  const groups = uniqueBy(
    item.option_groups.map(normalizeGroup).filter((g): g is GroupDraft => g !== undefined),
    (g) => normalizeTr(g.name),
  ).slice(0, 12);

  return {
    name,
    description: clampDescription(item.description),
    servingNote: clampText(item.serving_note, 240),
    portionInfo: clampText(item.portion_info, 80),
    optionGroups: enforceBasePriceRules(groups),
    removableIngredients: cleanList(item.removable_ingredients, 50, 25),
    extraIngredients: uniqueBy(
      item.extra_ingredients
        .map((e) => ({
          name: clampText(cleanItemName(e.name) || e.name, 50),
          priceHint: /ücretsiz|ucretsiz|free/i.test(e.price_delta_hint) ? ('ücretsiz' as const) : ('ek ücretli' as const),
        }))
        .filter((e) => e.name.length > 0),
      (e) => normalizeTr(e.name),
    ).slice(0, 25),
    tags: cleanList(item.tags, 30, 15),
    allergenNotes: cleanList(item.allergen_notes, 60, 12),
    upsellSuggestion: clampText(item.upsell_suggestion, 140),
  };
}

/** Empty card for items the system does not know ("bunu bilmiyorum, sen doldur"). */
export function reviewPlaceholder(rawName: string): TemplatePayload {
  return {
    name: clampText(titleCaseTr(cleanItemName(rawName) || rawName), 80) || 'Ürün',
    description: '',
    servingNote: '',
    portionInfo: '',
    optionGroups: [],
    removableIngredients: [],
    extraIngredients: [],
    tags: [],
    allergenNotes: [],
    upsellSuggestion: '',
  };
}
