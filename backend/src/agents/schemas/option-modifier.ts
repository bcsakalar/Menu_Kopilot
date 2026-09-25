import { z } from 'zod';

/**
 * Option/Modifier agent — JSON schema. Suggests option groups and ingredients for products ALREADY on the menu.
 * Every card names its target product, because on the phone the first question is always "hangi ürün için?".
 *
 * As in the recommender's schema, the bounds are wider than a card's: the answer is parsed in one go, so a single
 * over-long line must not cost the whole batch. The canonical rules are applied per card by the Validator.
 */

export const suggestedOptionSchema = z.object({
  name: z.string().min(1).max(60),
  priceMode: z
    .enum(['free', 'surcharge', 'sets_base'])
    .describe('free = fiyatı değiştirmez; surcharge = ek ücret; sets_base = ürünün TABAN fiyatını belirler (Boy/Porsiyon)'),
});

export const suggestedOptionGroupSchema = z.object({
  name: z.string().min(1).max(60).describe('Ör. Boy, Porsiyon, Ekmek Seçimi, Acı Seviyesi, Sos Seçimi'),
  selectionType: z.enum(['single', 'multi']),
  isRequired: z.boolean(),
  minSelect: z.number().int().min(0).max(15),
  maxSelect: z.number().int().min(1).max(15),
  options: z.array(suggestedOptionSchema).min(1).max(15).describe('Uygun olan her yerde 4–7 opsiyon'),
});
export type SuggestedOptionGroup = z.infer<typeof suggestedOptionGroupSchema>;

export const optionSuggestionSchema = z.object({
  targetName: z.string().min(1).max(120).describe('Menüde ZATEN olan ürünün adı, verilen listeden aynen'),
  optionGroups: z.array(suggestedOptionGroupSchema).max(6),
  removableIngredients: z.array(z.string().max(80)).max(20).describe('Müşterinin çıkarabileceği malzemeler'),
  extraIngredients: z.array(z.string().max(80)).max(20).describe('Ek ücretle eklenebilecek malzemeler'),
  /**
   * The panel description, in the same answer: asking for it separately would be a second round trip per batch.
   * Optional so that an answer (or a recorded one) without it still yields the options.
   */
  description: z
    .string()
    .max(300)
    .nullish()
    .describe('Panele yapıştırılacak açıklama: 6–8 kelime, doğal Türkçe, ürünün ne olduğunu söyler. Reklam dili ve fiyat yok.'),
  reason: z.string().max(200).describe('Tek satır: bu opsiyonlar neden gerekli'),
});
export type OptionSuggestion = z.infer<typeof optionSuggestionSchema>;

export const optionModifierSchema = z.object({ items: z.array(optionSuggestionSchema).max(25) });
export type OptionModifierOutput = z.infer<typeof optionModifierSchema>;

export const OPTION_MODIFIER_SCHEMA_NAME = 'option_suggestions';
