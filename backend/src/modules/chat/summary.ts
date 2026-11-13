import { AI_BUSY } from '../../agents/chat.js';
import type { AnalyzeResult, CountsDto } from '../analyze/schemas.js';

const TOP_PRODUCTS = 3;
const MAX_REPLIES = 3;
export const MORE_PRODUCTS = 'Daha fazla ürün öner';
/** The run had no model to ask: saying "nothing fits" then would be a wrong verdict on the menu. */
const AI_TROUBLE: ReadonlySet<string> = new Set(['recommend_failed', 'options_failed', 'slow_providers', 'agent_failed', 'extract_failed']);

const percent = (part: number, total: number) => `%${Math.round((part / Math.max(1, total)) * 100)}`;

/** The opening rules the menu misses for sure; a rule this input cannot show is left to the checklist (D-206). */
export function openingGaps(quality: CountsDto['quality']): string[] {
  if (!quality) return [];
  const gaps: string[] = [];
  if (!quality.drinks.ok) gaps.push(`içecek ${quality.drinks.current}/${quality.drinks.target}`);
  const share = (rule: typeof quality.descriptions, label: string) => {
    if (rule.ok === false) gaps.push(`${label} ${percent(rule.present, rule.total)} (en az ${percent(rule.share, 1)})`);
  };
  share(quality.descriptions, 'açıklama');
  share(quality.images, 'fotoğraf');
  if (quality.writing.ok === false) gaps.push('yazım düzeni');
  return gaps;
}

/** A model call failed for want of capacity (overloaded, rate-limited), not because of the menu. */
export const aiTrouble = (result: AnalyzeResult): boolean => result.warnings.some((w) => AI_TROUBLE.has(w.code));
export const aiBusy = (result: AnalyzeResult): boolean => result.cards.length === 0 && aiTrouble(result);

/** The next steps as buttons: the categories the menu is short of, then more of anything. */
export function nextSteps(result: AnalyzeResult): string[] {
  const gaps = result.counts?.categories.filter((c) => c.missing > 0) ?? [];
  return [...gaps.slice(0, MAX_REPLIES - 1).map((g) => `${g.label} öner`), MORE_PRODUCTS];
}

/**
 * The first thing the rep reads on the call, written without a model so it arrives with the cards: where the menu
 * stands, what to bring up first, and the next steps as buttons.
 */
export function summarize(result: AnalyzeResult): { text: string; quickReplies: string[] } {
  const { counts, cards } = result;
  if (!counts || result.menu.length === 0) {
    return {
      // Nothing read because every model was busy says so: "no menu here" sent reps hunting for a better screenshot.
      text: aiTrouble(result)
        ? `${AI_BUSY} Görüntüyü yeniden yapıştır ya da ürün adlarını virgülle yaz.`
        : 'Bu görüntüde menü okuyamadım. Ürünlerin göründüğü bir ekran görüntüsü yapıştır ya da ürün adlarını virgülle yaz.',
      quickReplies: [],
    };
  }
  const products = cards.filter((c) => c.section === 'new_product');
  // The gaps stand in the header and the card counts on the tabs: this answer says only what they cannot.
  const lines = [`**${counts.cuisineName}** menüsü: ${counts.current} ürün okudum, hedef ${counts.target}.`];
  if (products.length > 0) lines.push(`Önce şunları teklif et: **${products.slice(0, TOP_PRODUCTS).map((c) => c.name).join(', ')}**.`);
  const missing = openingGaps(counts.quality);
  if (missing.length > 0) lines.push(`Açılış kurallarında eksik: ${missing.join(', ')}.`);
  const extra = counts.quality?.extraCuisines ?? [];
  if (extra.length > 0) lines.push(`Ek mutfak türü olarak seç: **${extra.map((c) => c.name).join(', ')}**.`);

  return { text: lines.join('\n'), quickReplies: nextSteps(result) };
}

/** The answer when a request needs a menu or a cuisine and the message gave neither: never a bare "Bakıyorum.". */
export const ASK_MENU =
  'Menünün ekran görüntüsünü yapıştır, ürünleri yaz (ör. "California Roll, Somon Maki") ya da mutfak türünü söyle (ör. "Uzak Doğu"); hemen başlarım.';

/** A start from the cuisine alone ("Uzak Doğu için öneri sun"), before any menu: its target and what such menus carry. */
export function fromCuisine(result: AnalyzeResult): { text: string; quickReplies: string[] } {
  const products = result.cards.filter((c) => c.section === 'new_product');
  if (!result.counts || products.length === 0) return { text: aiBusy(result) ? AI_BUSY : ASK_MENU, quickReplies: [] };
  const lines = [
    `**${result.counts.cuisineName}** için menüsüz başladım: hedef ${result.counts.target} ürün.`,
    `Bu mutfağın menülerinde en sık görülenler: **${products.slice(0, TOP_PRODUCTS).map((c) => c.name).join(', ')}**.`,
    'Menünün ekran görüntüsünü yapıştırırsan ya da ürünleri yazarsan eksikleri tam çıkarırım.',
  ];
  return { text: lines.join('\n'), quickReplies: nextSteps(result) };
}

/**
 * What a follow-up run brought, from the run itself: a lead-in the model writes before the agents have run named
 * products that the guards then dropped, so the sentence and the cards disagreed.
 */
export function followUp(result: AnalyzeResult, lead = ''): string {
  const named = (section: 'new_product' | 'option'): string =>
    result.cards
      .filter((c) => c.section === section)
      .slice(0, TOP_PRODUCTS)
      .map((c) => c.targetName ?? c.name)
      .join(', ');
  const products = named('new_product');
  const options = named('option');
  const lines = [
    ...(lead ? [lead] : []),
    ...(options ? [`**${options}** için opsiyon ve malzemeleri hazırladım.`] : []),
    ...(products ? [`Önerim: **${products}**.`] : []),
  ];
  if (lines.length > 0) return lines.join('\n');
  return aiBusy(result) ? AI_BUSY : 'Bu istek için yeni ve bu mutfağa uygun bir sonuç çıkmadı. Başka bir kategori dene.';
}
