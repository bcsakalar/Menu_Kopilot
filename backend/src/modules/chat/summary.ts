import type { AnalyzeResult } from '../analyze/schemas.js';

const TOP_PRODUCTS = 3;
const MAX_REPLIES = 3;

/**
 * The first thing the rep reads on the call, written without a model so it arrives with the cards: where the menu
 * stands, what to bring up first, and the next steps as buttons.
 */
export function summarize(result: AnalyzeResult): { text: string; quickReplies: string[] } {
  const { counts, cards } = result;
  if (!counts || result.menu.length === 0) {
    return {
      text: 'Bu görüntüde menü okuyamadım. Ürünlerin göründüğü bir ekran görüntüsü yapıştır ya da ürün adlarını virgülle yaz.',
      quickReplies: [],
    };
  }
  const products = cards.filter((c) => c.section === 'new_product');
  const options = cards.filter((c) => c.section === 'option');
  const fixes = cards.filter((c) => c.section === 'fix');
  const gaps = counts.categories.filter((c) => c.missing > 0);

  const lines = [`**${counts.cuisineName}** menüsü: ${counts.current} ürün okudum, hedef ${counts.target}.`];
  if (gaps.length > 0) lines.push(`Eksik: ${gaps.map((g) => `${g.label} ${g.present}/${g.minItems}`).join(', ')}.`);
  if (products.length > 0) lines.push(`Önce şunları teklif et: **${products.slice(0, TOP_PRODUCTS).map((c) => c.name).join(', ')}**.`);
  if (options.length > 0) lines.push(`${options.length} ürüne opsiyon, çıkarılabilir ve ekstra malzeme hazırladım.`);
  if (fixes.length > 0) lines.push(`${fixes.length} düzeltme var; görüşme bitmeden sor.`);

  const quickReplies = [...gaps.slice(0, MAX_REPLIES - 1).map((g) => `${g.label} öner`), 'Daha fazla ürün öner'];
  return { text: lines.join('\n'), quickReplies };
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
  return lines.join('\n') || 'Bu istek için yeni ve bu mutfağa uygun bir sonuç çıkmadı. Başka bir kategori dene.';
}
