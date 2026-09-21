import { z } from 'zod';

/**
 * Option/Modifier agent — JSON schema. Suggests option groups and ingredients for products ALREADY on the menu.
 * Every card names its target product, because on the phone the first question is always "hangi ürün için?".
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
  options: z.array(suggestedOptionSchema).min(2).max(10).describe('Uygun olan her yerde 4–7 opsiyon'),
});

export const optionSuggestionSchema = z.object({
  targetName: z.string().min(1).max(120).describe('Menüde ZATEN olan ürünün adı, verilen listeden aynen'),
  optionGroups: z.array(suggestedOptionGroupSchema).max(4),
  removableIngredients: z.array(z.string().min(1).max(50)).max(12).describe('Müşterinin çıkarabileceği malzemeler'),
  extraIngredients: z.array(z.string().min(1).max(50)).max(12).describe('Ek ücretle eklenebilecek malzemeler'),
  reason: z.string().max(120).describe('Tek satır: bu opsiyonlar neden gerekli'),
});
export type OptionSuggestion = z.infer<typeof optionSuggestionSchema>;

export const optionModifierSchema = z.object({ items: z.array(optionSuggestionSchema).max(25) });
export type OptionModifierOutput = z.infer<typeof optionModifierSchema>;

export const OPTION_MODIFIER_SCHEMA_NAME = 'option_suggestions';
