import { PRICE_HINTS, type TemplateOptionGroup, type TemplatePayload } from '../../domain/template.js';
import { toCsv } from '../../lib/csv.js';

/** Flattened, review-friendly CSV of templates (one row per template, Turkish headers). */

export interface TemplateCsvEntry {
  cuisineName: string;
  payload: TemplatePayload;
  aliases: readonly string[];
  importance?: number;
  source?: string;
}

export const TEMPLATE_CSV_HEADER = [
  'Mutfak',
  'Ürün Adı',
  'Takma Adlar',
  'Açıklama',
  'Açıklama Uzunluğu',
  'Servis Notu',
  'Porsiyon',
  'Opsiyon Grupları',
  'Çıkarılabilir Malzemeler',
  'Ekstra Malzemeler',
  'Etiketler',
  'Alerjenler',
  'Upsell',
  'Önem',
  'Kaynak',
] as const;

export function formatOptionGroup(group: TemplateOptionGroup): string {
  const kind = group.selectionType === 'single' ? 'tek seçim' : `çoklu seçim, en fazla ${group.maxSelect}`;
  const required = group.isRequired ? 'zorunlu' : 'isteğe bağlı';
  const opts = group.options
    .map((o) => `${o.name}${o.isDefault ? ' (varsayılan)' : ''} [${PRICE_HINTS[o.priceMode]}]`)
    .join(' | ');
  return `${group.name} (${kind}, ${required}): ${opts}`;
}

export function templatesToCsv(entries: readonly TemplateCsvEntry[]): string {
  const rows = entries.map((e) => [
    e.cuisineName,
    e.payload.name,
    e.aliases.join(', '),
    e.payload.description,
    String(e.payload.description.length),
    e.payload.servingNote,
    e.payload.portionInfo,
    e.payload.optionGroups.map(formatOptionGroup).join('\n'),
    e.payload.removableIngredients.join(', '),
    e.payload.extraIngredients.map((x) => `${x.name} (${x.priceHint})`).join(', '),
    e.payload.tags.join(', '),
    e.payload.allergenNotes.join(', '),
    e.payload.upsellSuggestion,
    e.importance === undefined ? '' : String(e.importance),
    e.source ?? '',
  ]);
  return toCsv(TEMPLATE_CSV_HEADER, rows);
}
