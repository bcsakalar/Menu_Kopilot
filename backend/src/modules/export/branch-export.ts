import type { TemplatePayload } from '../../domain/template.js';
import { toCsv } from '../../lib/csv.js';
import { slugifyTr } from '../../lib/normalize-tr.js';
import type { BranchDto, BranchMenuItemDto } from '../branches/schemas.js';
import { formatOptionGroup } from './template-csv.js';

/**
 * Branch menu export (share from the phone): one row per product with the accepted card, or the matched template
 * when no card was accepted yet. Never contains prices (payloads are price-free by schema).
 */

const STATUS_LABELS: Readonly<Record<BranchMenuItemDto['status'], string>> = {
  ok: 'Tamam',
  incomplete: 'Eksik bilgi',
  missing: 'Önerilen',
};

const SOURCE_LABELS: Readonly<Record<BranchMenuItemDto['source'], string>> = {
  screenshot: 'Panel',
  suggestion: 'Kart',
  recommendation: 'Öneri',
  manual: 'Elle',
};

const FIELD_LABELS: Readonly<Record<BranchMenuItemDto['missingFields'][number], string>> = {
  description: 'açıklama',
  options: 'opsiyonlar',
  removables: 'çıkarılabilir malzemeler',
};

export const BRANCH_CSV_HEADER = [
  'Ürün',
  'Durum',
  'Kaynak',
  'İçerik',
  'Eksik Alanlar',
  'Açıklama',
  'Servis Notu',
  'Porsiyon',
  'Opsiyon Grupları',
  'Çıkarılabilir Malzemeler',
  'Ekstra Malzemeler',
  'Etiketler',
  'Alerjenler',
  'Upsell',
  'Not',
] as const;

const STATUS_ORDER: Readonly<Record<BranchMenuItemDto['status'], number>> = { ok: 0, incomplete: 1, missing: 2 };

export function sortMenuItems(items: readonly BranchMenuItemDto[]): BranchMenuItemDto[] {
  return [...items].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name, 'tr'));
}

function contentOf(item: BranchMenuItemDto): { label: string; payload: TemplatePayload | null } {
  if (item.payload) return { label: 'Onaylı kart', payload: item.payload };
  if (item.templatePayload) return { label: 'Şablon', payload: item.templatePayload };
  return { label: '', payload: null };
}

export function branchMenuToCsv(items: readonly BranchMenuItemDto[]): string {
  const rows = sortMenuItems(items).map((item) => {
    const { label, payload } = contentOf(item);
    return [
      item.name,
      STATUS_LABELS[item.status],
      SOURCE_LABELS[item.source],
      label,
      item.missingFields.map((f) => FIELD_LABELS[f]).join(', '),
      payload?.description ?? '',
      payload?.servingNote ?? '',
      payload?.portionInfo ?? '',
      payload?.optionGroups.map(formatOptionGroup).join('\n') ?? '',
      payload?.removableIngredients.join(', ') ?? '',
      payload?.extraIngredients.map((x) => `${x.name} (${x.priceHint})`).join(', ') ?? '',
      payload?.tags.join(', ') ?? '',
      payload?.allergenNotes.join(', ') ?? '',
      payload?.upsellSuggestion ?? '',
      item.reason ?? '',
    ];
  });
  return toCsv(BRANCH_CSV_HEADER, rows);
}

export function branchMenuToJson(branch: BranchDto, items: readonly BranchMenuItemDto[], exportedAt: Date) {
  return {
    branch: {
      name: branch.name,
      city: branch.city,
      cuisine: branch.cuisineName,
      target: branch.effectiveTarget,
      current: branch.currentItemCount,
    },
    exportedAt: exportedAt.toISOString(),
    items: sortMenuItems(items).map((item) => {
      const { payload } = contentOf(item);
      return {
        name: item.name,
        status: item.status,
        source: item.source,
        missingFields: item.missingFields,
        reason: item.reason,
        content: payload,
        contentFrom: item.payload ? 'card' : item.templatePayload ? 'template' : null,
      };
    }),
  };
}

export function exportFileName(branch: Pick<BranchDto, 'name'>, extension: 'csv' | 'json'): string {
  return `${slugifyTr(branch.name) || 'sube'}-menu.${extension}`;
}
