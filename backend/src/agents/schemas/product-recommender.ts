import { z } from 'zod';
import { suggestedOptionGroupSchema } from './option-modifier.js';

/**
 * Product Recommender agent — JSON schema. Proposes products the menu does NOT have.
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
    .max(160)
    .describe('Panele yapıştırılabilir TEK cümle, 60–140 karakter. Reklam dili ve fiyat yok.'),
  portionInfo: z.string().max(60).describe('Porsiyon/hacim bilgisi burada: "1 porsiyon ~180 g", "330 ml". Yoksa boş.'),
  priceRangeHint: z
    .string()
    .max(40)
    .describe('Görüşmede satıcıya sorulacak tahmini aralık, ör. "40–60 TL". Emin değilsen boş bırak.'),
  reason: z.string().min(5).max(120).describe('Tek satır: bu ürün bu mutfakta neden olmalı'),
  importance: z.number().min(0).max(100).describe('0–100; bu mutfakta ne kadar vazgeçilmez'),
  /**
   * The product's own options, in the same answer. A separate call per new product would cost a second round
   * trip inside the live-call budget; asked here it is free, and the card reaches the phone complete —
   * description, portion, options and ingredients — which is exactly what gets typed into the panel.
   * Optional so that a model (or an older recorded answer) that leaves them out still produces the product.
   */
  optionGroups: z.array(suggestedOptionGroupSchema).max(2).nullish().describe('Ürün panele girilirken açılacak 1–2 grup. Yoksa boş dizi.'),
  removableIngredients: z.array(z.string().min(1).max(50)).max(8).nullish().describe('Müşterinin çıkarabileceği malzemeler. Yoksa boş dizi.'),
  extraIngredients: z.array(z.string().min(1).max(50)).max(8).nullish().describe('Ek ücretle eklenebilecek malzemeler. Yoksa boş dizi.'),
});
export type RecommendedProduct = z.infer<typeof recommendedProductSchema>;

export const productRecommenderSchema = z.object({ items: z.array(recommendedProductSchema).max(30) });
export type ProductRecommenderOutput = z.infer<typeof productRecommenderSchema>;

export const PRODUCT_RECOMMENDER_SCHEMA_NAME = 'product_recommendations';
