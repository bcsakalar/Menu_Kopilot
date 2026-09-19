import { z } from 'zod';
import { templatePayloadSchema } from '../../domain/template.js';

// ---------------------------------------------------------------------------------------------------------------
// LLM-facing schemas (snake_case exactly as in the spec). Providers get these for constrained decoding; the
// pipeline validates item by item so one bad item never sinks a batch.
// ---------------------------------------------------------------------------------------------------------------

export const extractionItemSchema = z.object({
  rawName: z.string().min(1).max(120).describe('Ürün adı, menüde yazdığı gibi'),
  priceText: z.string().max(40).nullable().describe('Görünen fiyat metni veya null'),
  sectionText: z.string().max(80).nullable().describe('Bölüm başlığı veya null'),
  confidence: z.number().min(0).max(1),
});
export type ExtractionItem = z.infer<typeof extractionItemSchema>;
export const extractionSchema = z.object({ items: z.array(extractionItemSchema).max(150) });

/** Lenient envelope used for validation; items are parsed one by one. */
export const itemsEnvelopeSchema = z.object({ items: z.array(z.unknown()) });

export const llmOptionSchema = z.object({
  name: z.string(),
  price_mode: z
    .enum(['free', 'surcharge', 'sets_base'])
    .describe('free = ücretsiz; surcharge = ek ücret; sets_base = seçilince ürünün TABAN fiyatını belirler (Boy/Porsiyon)'),
});

export const llmOptionGroupSchema = z.object({
  name: z.string().describe('Ör. Boy, Porsiyon, Ekmek Seçimi, Acı Seviyesi, İçecek Seçimi, Sos Seçimi'),
  selection_type: z.enum(['single', 'multi']),
  is_required: z.boolean(),
  min_select: z.number().int(),
  max_select: z.number().int(),
  options: z.array(llmOptionSchema).describe('Uygun olan her yerde 4–7 opsiyon'),
});

export const llmItemSchema = z.object({
  name: z.string().describe('Ürünün düzgün kanonik adı'),
  description: z.string().describe('TEK cümle, 80–140 karakter, en fazla 160; reklam dili yok, fiyat yok'),
  serving_note: z.string(),
  portion_info: z.string(),
  option_groups: z.array(llmOptionGroupSchema),
  removable_ingredients: z.array(z.string()),
  extra_ingredients: z.array(z.object({ name: z.string(), price_delta_hint: z.string() })),
  tags: z.array(z.string()),
  allergen_notes: z.array(z.string()),
  upsell_suggestion: z.string(),
  confidence: z.number().describe('0–1; bilmediğin ürün için 0.5 altı'),
});
export type LlmItem = z.infer<typeof llmItemSchema>;
export const enrichmentSchema = z.object({ items: z.array(llmItemSchema) });

export const canonicalizeItemSchema = z.object({
  index: z.number().int().describe('Giriş satırının sıra numarası'),
  candidate_id: z.string().nullable().describe('Eşleşen adayın id değeri veya null'),
  is_product: z.boolean(),
  confidence: z.number(),
});
export const canonicalizeSchema = z.object({ items: z.array(canonicalizeItemSchema) });

// ---------------------------------------------------------------------------------------------------------------
// Pipeline / API types
// ---------------------------------------------------------------------------------------------------------------

export const cardOriginSchema = z.enum(['seed', 'db', 'ai', 'review']);
export type CardOrigin = z.infer<typeof cardOriginSchema>;
export const matchTypeSchema = z.enum(['exact', 'alias', 'trigram', 'vector', 'canonical']);
export type MatchType = z.infer<typeof matchTypeSchema>;

/** A name to resolve, from the prompt text or a photo. */
export const parsedNameSchema = z.object({
  rawName: z.string(),
  normalized: z.string(),
  sectionText: z.string().nullable(),
  /** Price seen on the photo — kept only as a raw extraction record, never shown on cards. */
  priceText: z.string().nullable(),
  source: z.enum(['prompt', 'image']),
  imageSha: z.string().nullable(),
});
export type ParsedName = z.infer<typeof parsedNameSchema>;

/** Stored in suggestion_items.payload. */
export const storedCardSchema = z.object({
  template: templatePayloadSchema,
  needsReview: z.boolean(),
  reviewReason: z.string().nullable(),
  confidence: z.number().nullable(),
  matchType: matchTypeSchema.nullable(),
  score: z.number().nullable(),
  sectionText: z.string().nullable(),
  /** Unapproved AI draft template created for this card (approved on accept). */
  draftTemplateId: z.string().nullable(),
  extraction: z.object({ priceText: z.string().nullable(), imageSha: z.string().nullable() }).nullable(),
});
export type StoredCard = z.infer<typeof storedCardSchema>;

export const cardDtoSchema = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  rawName: z.string(),
  origin: cardOriginSchema,
  matchedTemplateId: z.uuid().nullable(),
  matchType: matchTypeSchema.nullable(),
  score: z.number().nullable(),
  needsReview: z.boolean(),
  reviewReason: z.string().nullable(),
  confidence: z.number().nullable(),
  sectionText: z.string().nullable(),
  status: z.enum(['pending', 'accepted', 'skipped']),
  payload: templatePayloadSchema,
  sortOrder: z.number().int(),
});
export type CardDto = z.infer<typeof cardDtoSchema>;

export const runStatsSchema = z.object({
  llmCalls: z.number().int(),
  embedCalls: z.number().int(),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  cacheHit: z.boolean(),
  latencyMs: z.number().int(),
  dbHits: z.number().int(),
  aiItems: z.number().int(),
  reviewItems: z.number().int(),
  pendingItems: z.number().int(),
  pendingImages: z.number().int(),
});
export type RunStats = z.infer<typeof runStatsSchema>;

export const pendingWorkSchema = z.object({
  names: z.array(parsedNameSchema),
  imageHashes: z.array(z.string()),
});
export type PendingWork = z.infer<typeof pendingWorkSchema>;

export const runDtoSchema = z.object({
  id: z.uuid(),
  mode: z.enum(['suggest', 'gap']),
  status: z.enum(['running', 'completed', 'partial', 'failed', 'cancelled']),
  stage: z.string(),
  cuisineId: z.uuid().nullable(),
  branchId: z.uuid().nullable(),
  promptText: z.string().nullable(),
  deepMode: z.boolean(),
  cacheHit: z.boolean(),
  llmCalls: z.number().int(),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  latencyMs: z.number().int().nullable(),
  pendingItems: z.number().int(),
  pendingImageHashes: z.array(z.string()),
  error: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  cards: z.array(cardDtoSchema),
});
export type RunDto = z.infer<typeof runDtoSchema>;

/** SSE events of the suggestion stream (event name = `type`). */
export type SuggestEvent =
  | { type: 'run'; runId: string; cuisineId: string; resumed: boolean; budget: { maxCalls: number; maxInputTokens: number } }
  | { type: 'progress'; stage: 'extract' | 'retrieve' | 'canonicalize' | 'enrich' | 'finalize'; message: string; done?: number; total?: number }
  | { type: 'extracted'; names: string[] }
  | { type: 'item'; card: CardDto }
  | { type: 'warning'; code: string; message: string }
  | { type: 'budget_exhausted'; pendingItems: number; pendingImageHashes: string[]; message: string }
  | { type: 'done'; status: RunDto['status']; stats: RunStats }
  | { type: 'error'; code: string; message: string };

export const suggestFieldsSchema = z.object({
  cuisineId: z.uuid(),
  branchId: z.uuid().optional(),
  promptText: z.string().max(4000).optional(),
  deepMode: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1'),
});
export type SuggestFields = z.infer<typeof suggestFieldsSchema>;

export const acceptBodySchema = z.object({
  payload: templatePayloadSchema.optional(),
  branchId: z.uuid().optional(),
});
