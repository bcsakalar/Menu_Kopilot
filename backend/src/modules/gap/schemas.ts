import { z } from 'zod';

// ---- LLM-facing ------------------------------------------------------------------------------------------------

export const triStateSchema = z.enum(['present', 'absent', 'unknown']);
export type TriState = z.infer<typeof triStateSchema>;

export const panelItemSchema = z.object({
  rawName: z.string().min(1).max(120).describe('Ürün adı, ekranda yazdığı gibi (kesikse görünen kısım)'),
  description: triStateSchema.describe('Açıklama dolu: present, boş: absent, görünmüyor: unknown'),
  options: triStateSchema.describe('Opsiyon/seçenek bilgisi: present | absent | unknown'),
  removables: triStateSchema.describe('Çıkarılabilir malzeme bilgisi: present | absent | unknown'),
  sectionText: z.string().max(80).nullable(),
  confidence: z.number().min(0).max(1),
});
export type PanelItem = z.infer<typeof panelItemSchema>;
export const panelExtractionSchema = z.object({ items: z.array(panelItemSchema).max(150) });

/** Lenient on purpose: names/reasons are cleaned and clamped after parsing instead of failing the call. */
export const gapSuggestItemSchema = z.object({
  name: z.string().min(1).describe('Önerilen ürünün düzgün Türkçe adı'),
  reason: z.string().describe('Tek satır gerekçe, en fazla 90 karakter'),
  importance: z.number().describe('0–100 önem'),
});
export const gapSuggestSchema = z.object({ items: z.array(gapSuggestItemSchema) });

// ---- API / events ----------------------------------------------------------------------------------------------

export const gapFieldSchema = z.enum(['description', 'options', 'removables']);
export type GapField = z.infer<typeof gapFieldSchema>;

export const flagsSchema = z.object({ description: triStateSchema, options: triStateSchema, removables: triStateSchema });
export type Flags = z.infer<typeof flagsSchema>;

export const gapItemDtoSchema = z.object({
  name: z.string(),
  normalized: z.string(),
  flags: flagsSchema,
  completeness: z.number(),
  status: z.enum(['ok', 'incomplete']),
  missing: z.array(z.object({ field: gapFieldSchema, state: z.enum(['absent', 'unknown']) })),
  matchedTemplateId: z.uuid().nullable(),
  templateName: z.string().nullable(),
  origin: z.enum(['seed', 'db']).nullable(),
  sectionText: z.string().nullable(),
  seenIn: z.number().int(),
  /** Typed or dictated by the user, not read from a screenshot: its panel fields are unknown. */
  typed: z.boolean().default(false),
});
export type GapItemDto = z.infer<typeof gapItemDtoSchema>;

export const recommendationDtoSchema = z.object({
  name: z.string(),
  reason: z.string(),
  importance: z.number(),
  source: z.enum(['db', 'ai']),
  templateId: z.uuid().nullable(),
});
export type RecommendationDto = z.infer<typeof recommendationDtoSchema>;

export const questionDtoSchema = z.object({
  /** Stable across runs (checklist ticks are stored per key on the phone). */
  key: z.string(),
  text: z.string(),
  kind: z.enum(['missing_item', 'missing_field', 'cuisine']),
  itemName: z.string().nullable(),
  /** Short hints from the matched template (option names, removable ingredients) or the recommendation reason. */
  hints: z.array(z.string()),
});
export type QuestionDto = z.infer<typeof questionDtoSchema>;

export const countsDtoSchema = z.object({
  current: z.number().int(),
  target: z.number().int(),
  missing: z.number().int(),
  fromScreenshots: z.number().int(),
  cuisineMin: z.number().int(),
  targetOverridden: z.boolean(),
});
export type CountsDto = z.infer<typeof countsDtoSchema>;

export const gapStatsSchema = z.object({
  llmCalls: z.number().int(),
  latencyMs: z.number().int(),
  screenshots: z.number().int(),
  extracted: z.number().int(),
  unique: z.number().int(),
  cacheHit: z.boolean(),
  /** Products typed or dictated by the user. */
  typed: z.number().int().default(0),
});
export type GapStats = z.infer<typeof gapStatsSchema>;

export const gapResultDtoSchema = z.object({
  runId: z.uuid(),
  /** null when the branch was deleted after the run. */
  branchId: z.uuid().nullable(),
  status: z.enum(['running', 'completed', 'partial', 'failed', 'cancelled']),
  counts: countsDtoSchema.nullable(),
  items: z.array(gapItemDtoSchema),
  recommendations: z.array(recommendationDtoSchema),
  questions: z.array(questionDtoSchema),
  stats: gapStatsSchema.nullable(),
  createdAt: z.string(),
});
export type GapResultDto = z.infer<typeof gapResultDtoSchema>;

/** Stored in branch_menu_snapshots.parsed. */
export const storedGapSchema = z.object({
  counts: countsDtoSchema,
  items: z.array(gapItemDtoSchema),
  recommendations: z.array(recommendationDtoSchema),
  questions: z.array(questionDtoSchema),
  stats: gapStatsSchema,
});
export type StoredGap = z.infer<typeof storedGapSchema>;

/** SSE events of the gap analysis stream; counts + questions come first (most useful on the phone). */
export type GapEvent =
  | { type: 'run'; runId: string; branchId: string }
  | { type: 'progress'; stage: 'extract' | 'analyze' | 'recommend'; message: string; done?: number; total?: number }
  | { type: 'counts'; counts: CountsDto }
  | { type: 'questions'; items: QuestionDto[] }
  | { type: 'items'; items: GapItemDto[] }
  | { type: 'recommendations'; source: 'db' | 'ai'; items: RecommendationDto[] }
  | { type: 'questions_append'; items: QuestionDto[] }
  | { type: 'warning'; code: string; message: string }
  | { type: 'done'; status: GapResultDto['status']; stats: GapStats }
  | { type: 'error'; code: string; message: string };

export const gapFieldsSchema = z.object({
  branchId: z.uuid(),
  extraNotes: z.string().max(1000).optional(),
  /** Products on the menu, typed or dictated ("adana, urfa, ayran") — works without screenshots and without AI. */
  menuText: z.string().max(4000).optional(),
});
