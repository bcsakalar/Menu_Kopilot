import { z } from 'zod';
import { ANALYSIS_MODES, DEFAULT_MODE } from '../../agents/plan.js';
import { AGENT_NAMES } from '../../agents/types.js';
import { templatePayloadSchema } from '../../domain/template.js';

/**
 * API shape of an analysis run. Three sections, one screen:
 *   new_product — products the menu does not have at all
 *   option      — option groups / ingredients for a product already on the menu
 *   fix         — something empty or wrong on a product already on the menu
 */

export const sectionSchema = z.enum(['new_product', 'option', 'fix']);
export type Section = z.infer<typeof sectionSchema>;

/** Missing options are not a fix: they get a card of their own in the "opsiyon" section. */
export const fixKindSchema = z.enum(['empty_description', 'bad_name', 'wrong_category']);
export type FixKind = z.infer<typeof fixKindSchema>;

export const cardSourceSchema = z.enum(['seed', 'db', 'ai', 'review']);

export const optionGroupDtoSchema = z.object({
  name: z.string(),
  selectionType: z.enum(['single', 'multi']),
  isRequired: z.boolean(),
  minSelect: z.number().int(),
  maxSelect: z.number().int(),
  options: z.array(z.object({ name: z.string(), priceMode: z.enum(['free', 'surcharge', 'sets_base']) })),
});

export const cardDtoSchema = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  section: sectionSchema,
  /** Section A: the product name. Sections B/C: still the product name, for the card title. */
  name: z.string(),
  /** Sections B/C: which product already on the menu this card is about. Section A: null. */
  targetName: z.string().nullable(),
  /**
   * Stable join key to `menu[].normalized` for sections B/C. The display name is the canonical one
   * ('Tel Kadayıf') while the menu row is keyed by the normalized raw name ('kadayif'), so a client that
   * matched on the name alone would miss.
   */
  targetNormalized: z.string().nullable(),
  categoryKey: z.string().nullable(),
  categoryLabel: z.string().nullable(),
  source: cardSourceSchema,
  matchedTemplateId: z.uuid().nullable(),
  /** One line, ready to paste into the panel. */
  shortDescription: z.string(),
  portionInfo: z.string(),
  /**
   * Estimated range for the call ("40–60 TL"), never written to a template. Templates stay price-free because
   * the vendor states the price on the phone; this field only opens that conversation.
   */
  priceRangeHint: z.string(),
  /** One line: why this card exists. */
  reason: z.string(),
  importance: z.number().int(),
  /** Section B only. */
  optionGroups: z.array(optionGroupDtoSchema),
  removableIngredients: z.array(z.string()),
  extraIngredients: z.array(z.string()),
  /** Section C only. */
  fixKind: fixKindSchema.nullable(),
  currentValue: z.string().nullable(),
  suggestedValue: z.string().nullable(),
  /** Full template payload written to the pool on accept (section A). */
  payload: templatePayloadSchema.nullable(),
  status: z.enum(['pending', 'accepted', 'skipped']),
  sortOrder: z.number().int(),
});
export type CardDto = z.infer<typeof cardDtoSchema>;

export const categoryCountSchema = z.object({
  key: z.string(),
  label: z.string(),
  present: z.number().int(),
  minItems: z.number().int(),
  missing: z.number().int(),
});
export type CategoryCount = z.infer<typeof categoryCountSchema>;

export const countsDtoSchema = z.object({
  current: z.number().int(),
  target: z.number().int(),
  missing: z.number().int(),
  /** The hard rule: 10 products minimum for any opening. */
  hardMinimum: z.number().int(),
  /** The cuisine's own minimum from `cuisines.min_item_count`. */
  cuisineMin: z.number().int(),
  cuisineName: z.string(),
  cuisineId: z.uuid(),
  categories: z.array(categoryCountSchema),
});
export type CountsDto = z.infer<typeof countsDtoSchema>;

export const menuItemDtoSchema = z.object({
  name: z.string(),
  normalized: z.string(),
  categoryKey: z.string(),
  categoryLabel: z.string(),
  matchedTemplateId: z.uuid().nullable(),
  typed: z.boolean(),
  seenIn: z.number().int(),
});
export type MenuItemDto = z.infer<typeof menuItemDtoSchema>;

export const classificationDtoSchema = z.object({
  cuisineId: z.uuid(),
  cuisineName: z.string(),
  priceSegment: z.string(),
  confidence: z.number(),
  reason: z.string(),
  /** The model proposed a different cuisine than the user's pick; the UI offers a one-tap switch. */
  disagrees: z.boolean(),
  suggestedCuisineId: z.uuid().nullable(),
  suggestedCuisineName: z.string().nullable(),
});
export type ClassificationDto = z.infer<typeof classificationDtoSchema>;

export const traceStepSchema = z.object({
  seq: z.number().int(),
  agent: z.enum(AGENT_NAMES),
  label: z.string(),
  status: z.enum(['ok', 'failed', 'skipped']),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  durationMs: z.number().int(),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  llmCalls: z.number().int(),
  input: z.record(z.string(), z.unknown()).nullable(),
  output: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
});
export type TraceStep = z.infer<typeof traceStepSchema>;

export const analyzeStatsSchema = z.object({
  llmCalls: z.number().int(),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  latencyMs: z.number().int(),
  imagesRead: z.number().int(),
  imagesFailed: z.number().int(),
  /** Products read from images / typed, after dedupe. */
  menuItems: z.number().int(),
  newProducts: z.number().int(),
  optionCards: z.number().int(),
  fixCards: z.number().int(),
  /** Cards the validator refused. */
  dropped: z.number().int(),
  cacheHit: z.boolean(),
});
export type AnalyzeStats = z.infer<typeof analyzeStatsSchema>;

export const analyzeResultSchema = z.object({
  runId: z.uuid(),
  status: z.enum(['running', 'completed', 'partial', 'failed', 'cancelled']),
  counts: countsDtoSchema.nullable(),
  classification: classificationDtoSchema.nullable(),
  menu: z.array(menuItemDtoSchema),
  cards: z.array(cardDtoSchema),
  stats: analyzeStatsSchema.nullable(),
  warnings: z.array(z.object({ code: z.string(), message: z.string() })),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type AnalyzeResult = z.infer<typeof analyzeResultSchema>;

export const traceResultSchema = z.object({
  runId: z.uuid(),
  steps: z.array(traceStepSchema),
  totals: z.object({
    durationMs: z.number().int(),
    tokensIn: z.number().int(),
    tokensOut: z.number().int(),
    llmCalls: z.number().int(),
  }),
});

/** SSE events. Counts arrive before the cards: on a phone call the number is the first thing that matters. */
export type AnalyzeEvent =
  | { type: 'run'; runId: string }
  | { type: 'progress'; agent: string; message: string; done?: number; total?: number }
  | { type: 'classification'; classification: ClassificationDto }
  | { type: 'menu'; items: MenuItemDto[] }
  | { type: 'counts'; counts: CountsDto }
  | { type: 'item'; card: CardDto }
  | { type: 'trace'; step: TraceStep }
  | { type: 'warning'; code: string; message: string }
  | { type: 'done'; status: AnalyzeResult['status']; stats: AnalyzeStats }
  | { type: 'error'; code: string; message: string };

export const analyzeFieldsSchema = z.object({
  /** Optional: the Classifier fills it in when the user did not choose. */
  cuisineId: z.uuid().optional(),
  /** Products the user typed or dictated, comma or newline separated. */
  menuText: z.string().max(4000).optional(),
  notes: z.string().max(1000).optional(),
  /**
   * How much work the run does. `quick` = "öneri versen yeter": a few products from different categories and a
   * couple of option cards. `full` = "hakikaten işimizi yapalım": recommend up to the cuisine's opening minimum
   * and ask for options/ingredients on everything. The app sends one of the two; an older client gets `full`.
   */
  mode: z.enum(ANALYSIS_MODES).default(DEFAULT_MODE),
  /**
   * Re-run an earlier analysis of the same menu — typically with another cuisine picked on the result screen. The
   * earlier run's product list is reused, so no image is read again.
   */
  fromRunId: z.uuid().optional(),
  /** Store agent input/output payloads for the debug screen. */
  debug: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1'),
});
export type AnalyzeFields = z.infer<typeof analyzeFieldsSchema>;

export const acceptBodySchema = z.object({ payload: templatePayloadSchema.optional() });
