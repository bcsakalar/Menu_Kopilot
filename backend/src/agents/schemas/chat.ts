import { z } from 'zod';

/** What one chat message asks for: the answer itself, or which slice of the agents to run. */
export const chatActionSchema = z.enum(['answer', 'recommend', 'complete', 'update_menu', 'change_cuisine']);
export type ChatAction = z.infer<typeof chatActionSchema>;

export const chatDecisionSchema = z.object({
  action: chatActionSchema,
  reply: z.string().min(1).max(1500).describe('Temsilciye kısa Türkçe cevap; markdown yalnızca **kalın** ve - liste'),
  categoryKey: z.string().max(40).nullable().describe('recommend: listedeki kategori anahtarı, tüm menü için null'),
  productCount: z.number().int().min(0).max(10).describe('recommend: kaç ürün; diğerlerinde 0'),
  targets: z.array(z.string().max(80)).max(12).describe('complete: ürünlerin menüdeki yazılışı'),
  addProducts: z.array(z.string().max(80)).max(30).describe('update_menu: menüde olduğu öğrenilen ürünler'),
  removeProducts: z.array(z.string().max(80)).max(30).describe('update_menu: menüde olmadığı öğrenilen ürünler'),
  cuisineSlug: z.string().max(60).nullable().describe('change_cuisine: listeden slug, diğerlerinde null'),
  note: z.string().max(200).describe('recommend: temsilcinin özel isteği (ör. vegan, çocuk menüsü); yoksa boş'),
  quickReplies: z.array(z.string().min(1).max(40)).max(3).describe('Temsilcinin ağzından sıradaki 2-3 kısa adım'),
});
export type ChatDecision = z.infer<typeof chatDecisionSchema>;

export const CHAT_SCHEMA_NAME = 'chat_decision';
