import { z } from 'zod';
import { containsPriceAmount } from '../lib/price-guard.js';
import { normalizeTr } from '../lib/normalize-tr.js';

/**
 * Canonical, provider-independent shape of a menu item template (API + DB payloads, camelCase).
 * Every template written to the DB (seed, AI, user edit) passes this schema.
 */

export const PRICE_MODES = ['free', 'surcharge', 'sets_base'] as const;
export type PriceMode = (typeof PRICE_MODES)[number];
export const priceModeSchema = z.enum(PRICE_MODES);

/** Human hint stored next to each option. Never a number. */
export const PRICE_HINTS: Readonly<Record<PriceMode, string>> = {
  free: 'ücretsiz',
  surcharge: 'ek ücretli',
  sets_base: 'tabanı belirler',
};

export const DESCRIPTION_MAX_LENGTH = 160;

const NO_PRICE_MESSAGE = 'Fiyat / TL rakamı içeremez';

const textField = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !containsPriceAmount(v), { message: NO_PRICE_MESSAGE });

const requiredText = (max: number) => textField(max).refine((v) => v.length > 0, { message: 'Boş olamaz' });

export const templateOptionSchema = z.object({
  name: requiredText(60),
  priceMode: priceModeSchema,
  isDefault: z.boolean().default(false),
});
export type TemplateOption = z.infer<typeof templateOptionSchema>;

export const templateOptionGroupSchema = z
  .object({
    name: requiredText(60),
    selectionType: z.enum(['single', 'multi']),
    isRequired: z.boolean(),
    minSelect: z.number().int().min(0),
    maxSelect: z.number().int().min(1),
    options: z.array(templateOptionSchema).min(1).max(15),
  })
  .superRefine((group, ctx) => {
    if (group.selectionType === 'single' && group.maxSelect !== 1) {
      ctx.addIssue({ code: 'custom', path: ['maxSelect'], message: 'Tek seçimli grupta maxSelect 1 olmalı' });
    }
    if (group.minSelect > group.maxSelect) {
      ctx.addIssue({ code: 'custom', path: ['minSelect'], message: 'minSelect maxSelect değerini aşamaz' });
    }
    if (group.maxSelect > group.options.length) {
      ctx.addIssue({ code: 'custom', path: ['maxSelect'], message: 'maxSelect opsiyon sayısını aşamaz' });
    }
    if (group.isRequired !== group.minSelect >= 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['isRequired'],
        message: 'Zorunlu grupta minSelect ≥ 1, zorunlu olmayanda minSelect = 0 olmalı',
      });
    }
    const names = group.options.map((o) => normalizeTr(o.name));
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Aynı opsiyon iki kez var' });
    }
    const setsBase = group.options.filter((o) => o.priceMode === 'sets_base').length;
    if (setsBase > 0) {
      if (setsBase !== group.options.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'Tabanı belirleyen grupta tüm opsiyonlar sets_base olmalı',
        });
      }
      if (group.selectionType !== 'single' || !group.isRequired) {
        ctx.addIssue({ code: 'custom', path: ['selectionType'], message: 'sets_base grubu tek seçimli ve zorunlu olmalı' });
      }
    }
    if (group.selectionType === 'single' && group.options.filter((o) => o.isDefault).length > 1) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Tek seçimli grupta en fazla bir varsayılan olabilir' });
    }
  });
export type TemplateOptionGroup = z.infer<typeof templateOptionGroupSchema>;

export const extraIngredientSchema = z.object({
  name: requiredText(50),
  priceHint: z.enum(['ek ücretli', 'ücretsiz']).default('ek ücretli'),
});
export type ExtraIngredient = z.infer<typeof extraIngredientSchema>;

export const templatePayloadSchema = z
  .object({
    name: requiredText(80),
    description: textField(DESCRIPTION_MAX_LENGTH),
    servingNote: textField(240),
    portionInfo: textField(80),
    optionGroups: z.array(templateOptionGroupSchema).max(12),
    removableIngredients: z.array(requiredText(50)).max(25),
    extraIngredients: z.array(extraIngredientSchema).max(25),
    tags: z.array(requiredText(30)).max(15),
    allergenNotes: z.array(requiredText(60)).max(12),
    upsellSuggestion: textField(140),
  })
  .superRefine((item, ctx) => {
    const setsBaseGroups = item.optionGroups.filter((g) => g.options.some((o) => o.priceMode === 'sets_base'));
    if (setsBaseGroups.length > 1) {
      ctx.addIssue({ code: 'custom', path: ['optionGroups'], message: 'Ürün başına en fazla bir sets_base grubu olabilir' });
    }
    const groupNames = item.optionGroups.map((g) => normalizeTr(g.name));
    if (new Set(groupNames).size !== groupNames.length) {
      ctx.addIssue({ code: 'custom', path: ['optionGroups'], message: 'Aynı isimli iki opsiyon grubu var' });
    }
    const removables = item.removableIngredients.map(normalizeTr);
    if (new Set(removables).size !== removables.length) {
      ctx.addIssue({ code: 'custom', path: ['removableIngredients'], message: 'Tekrarlanan çıkarılabilir malzeme' });
    }
  });
export type TemplatePayload = z.infer<typeof templatePayloadSchema>;
export type TemplatePayloadInput = z.input<typeof templatePayloadSchema>;

/** Option group names that always define the base price (platform: "Boy: Orta" sets the price, not a delta). */
const BASE_PRICE_GROUP = /^(boy|boyut|porsiyon|porsiyon (secimi|boyu)|gramaj|adet|buyukluk|size)\b/;

export function isBasePriceGroupName(name: string): boolean {
  return BASE_PRICE_GROUP.test(normalizeTr(name));
}
