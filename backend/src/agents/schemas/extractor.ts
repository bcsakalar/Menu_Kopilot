import { z } from 'zod';

/**
 * Extractor agent — JSON schema. READING ONLY: it never invents, enriches or recommends.
 *
 * One schema covers both inputs, because a menu photo and a panel screenshot carry the same fields with
 * different completeness: a photo usually has a price and no option info, a panel row the opposite. The
 * secondary fields carry defaults so a model that omits one loses that detail instead of losing the product.
 */

export const triStateSchema = z.enum(['present', 'absent', 'unknown']);
export type TriState = z.infer<typeof triStateSchema>;

export const extractedItemSchema = z.object({
  rawName: z.string().min(1).max(120).describe('Ürün adı, ekranda/menüde yazdığı gibi. Gramaj veya fiyat ekleme.'),
  sectionText: z.string().max(80).nullable().default(null).describe('Üstündeki bölüm/kategori başlığı, yoksa null'),
  priceText: z.string().max(40).nullable().default(null).describe('Görünen fiyat metni aynen, yoksa null'),
  descriptionText: z.string().max(300).nullable().default(null).describe('Görünen açıklama metni aynen, yoksa null'),
  description: triStateSchema.default('unknown').describe('Açıklama dolu: present, alan boş: absent, alan görünmüyor: unknown'),
  options: triStateSchema.default('unknown').describe('Opsiyon/seçenek bilgisi için aynı kural'),
  removables: triStateSchema.default('unknown').describe('Çıkarılabilir malzeme bilgisi için aynı kural'),
  optionNames: z.array(z.string().max(60)).max(12).default([]).describe('Görünen opsiyon grubu adları; göremiyorsan boş dizi'),
  confidence: z.number().min(0).max(1),
});
export type ExtractedItem = z.infer<typeof extractedItemSchema>;

export const extractorSchema = z.object({ items: z.array(extractedItemSchema).max(150) });
export type ExtractorOutput = z.infer<typeof extractorSchema>;

export const EXTRACTOR_SCHEMA_NAME = 'menu_extraction';
