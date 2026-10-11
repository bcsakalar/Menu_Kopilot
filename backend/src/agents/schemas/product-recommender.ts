import { z } from 'zod';
import { suggestedOptionGroupSchema } from './option-modifier.js';

/**
 * Product Recommender agent — JSON schema. Proposes products the menu does NOT have.
 *
 * The bounds here are deliberately WIDER than what a card may contain. The whole answer is parsed against this
 * schema in one go, so a single item with a too-long description or a third option group used to fail the batch
 * and cost every other product in it (measured on production as `invalid_output`). The exact rules are enforced
 * afterwards, per item, by the agent and the Validator — which drop one card instead of the answer.
 *
 * `name` is the plain canonical product name: no volume, no packaging, no portion, no price. Those belong to
 * `portionInfo` / `priceRangeHint`. The "before" measurement showed 11 % of the model's names carried "(33 cl)",
 * "(1 L)" and similar, which broke both dedupe and template matching — hence the explicit fields here.
 */

export const recommendedProductSchema = z.object({
  name: z.string().min(2).max(80).describe('Sade kanonik ürün adı. Gramaj, hacim, ambalaj, fiyat YAZMA.'),
  categoryKey: z.string().min(1).max(40).describe('Verilen kategori listesinden tam olarak bir anahtar'),
  shortDescription: z
    .string()
    .max(400)
    .describe('Panele yapıştırılabilir TEK cümle, 6–8 kelime. Reklam dili ve fiyat yok.'),
  portionInfo: z.string().max(60).describe('Porsiyon/hacim bilgisi burada: "1 porsiyon ~180 g", "330 ml". Yoksa boş.'),
  priceRangeHint: z
    .string()
    .max(40)
    .describe('Görüşmede satıcıya sorulacak tahmini aralık, ör. "40–60 TL". Emin değilsen boş bırak.'),
  reason: z.string().max(200).describe('Tek satır: bu ürün bu mutfakta neden olmalı'),
  /**
   * D-198. The menu product an ALTERNATIVE is built on ("Adana Kebap" for "Beyti"), spelled as the menu spells it;
   * empty for a product that only fills a category. The agent checks it against the menu — a name that is not there
   * makes the item an ordinary category suggestion.
   */
  basedOn: z.string().max(120).nullish().describe('Alternatifse dayandığı menü ürününün adı (menüdeki yazımıyla); değilse boş'),
  importance: z.number().describe('0–100; bu mutfakta ne kadar vazgeçilmez'),
  /**
   * The product's own options, in the same answer. A separate call per new product would cost a second round
   * trip inside the live-call budget; asked here it is free, and the card reaches the phone complete —
   * description, portion, options and ingredients — which is exactly what gets typed into the panel.
   * Optional so that a model (or an older recorded answer) that leaves them out still produces the product.
   */
  optionGroups: z.array(suggestedOptionGroupSchema).max(4).nullish().describe('Ürün panele girilirken açılacak 2–3 grup. Hazır içecekte boş dizi.'),
  removableIngredients: z.array(z.string().max(80)).max(12).nullish().describe('Müşterinin çıkarabileceği malzemeler. Yoksa boş dizi.'),
  extraIngredients: z.array(z.string().max(80)).max(12).nullish().describe('Ek ücretle eklenebilecek malzemeler. Yoksa boş dizi.'),
});
export type RecommendedProduct = z.infer<typeof recommendedProductSchema>;

export const productRecommenderSchema = z.object({ items: z.array(recommendedProductSchema).max(30) });
export type ProductRecommenderOutput = z.infer<typeof productRecommenderSchema>;

export const PRODUCT_RECOMMENDER_SCHEMA_NAME = 'product_recommendations';
