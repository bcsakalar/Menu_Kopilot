import type { Card, OptionGroup } from './types';

/** A long panel screenshot must stay legible for the model, while staying under the API's per-file limit. */
const MAX_IMAGE_SIDE = 3000;
const JPEG_QUALITY = 0.86;

/** Re-encoding also drops EXIF, so a phone photo's location never leaves the browser. */
export async function shrinkImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Görüntü okunamadı'))), 'image/jpeg', JPEG_QUALITY);
  });
}

const PRICE_LABEL: Record<OptionGroup['options'][number]['priceMode'], string> = {
  free: 'ücretsiz',
  surcharge: 'ek ücretli',
  sets_base: 'fiyatı belirler',
};

export const groupRule = (group: OptionGroup): string =>
  `${group.selectionType === 'single' ? 'tek seçim' : `en çok ${group.maxSelect}`}, ${group.isRequired ? 'zorunlu' : 'isteğe bağlı'}`;

export const formatGroup = (group: OptionGroup): string =>
  `${group.name} (${groupRule(group)}): ${group.options.map((o) => `${o.name} [${PRICE_LABEL[o.priceMode]}]`).join(', ')}`;

/** What gets pasted into the restaurant panel: plain text, in the order the panel asks for it. */
export function formatCard(card: Card): string {
  if (card.section === 'fix') return `${card.targetName ?? card.name}: ${card.suggestedValue ? `${card.currentValue} → ${card.suggestedValue}` : card.reason}`;
  const lines = [card.targetName ?? card.name];
  if (card.shortDescription) lines.push(`Açıklama: ${card.shortDescription}`);
  if (card.portionInfo) lines.push(`Porsiyon: ${card.portionInfo}`);
  if (card.optionGroups.length > 0) lines.push('Opsiyonlar:', ...card.optionGroups.map((g) => `- ${formatGroup(g)}`));
  if (card.removableIngredients.length > 0) lines.push(`Çıkarılabilir: ${card.removableIngredients.join(', ')}`);
  if (card.extraIngredients.length > 0) lines.push(`Ekstra: ${card.extraIngredients.join(', ')}`);
  return lines.join('\n');
}

export const formatCards = (cards: readonly Card[]): string => cards.map(formatCard).join('\n\n');

export function timeLabel(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat('tr-TR', sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' }).format(date);
}

export const dateTimeLabel = (iso: string): string =>
  new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
