import { isBasePriceGroupName, type TemplatePayload } from '../../domain/template.js';
import { GAP_TEXT } from '../../i18n/tr.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import type { GapField, GapItemDto, QuestionDto, RecommendationDto } from './schemas.js';

/**
 * Deterministic "Çağrıda sor" checklist (no LLM). Priority:
 *  1. missing items needed to reach the target ("Ayran var mı?"), up to 6 — slots not filled by DB recommendations
 *     are reserved for AI recommendations that arrive later (`questions_append`),
 *  2. one line per item with missing fields, least complete first, with template hints,
 *  3. up to 2 cuisine-wide questions ("Acı seviyesi soruluyor mu?"),
 *  4. leftover recommendations.
 * At most 15 questions. Keys are stable so ticks on the phone survive a re-run.
 */

export const MAX_QUESTIONS = 15;
export const MAX_MISSING_ITEM_QUESTIONS = 6;
export const MAX_CUISINE_QUESTIONS = 2;
const HINT_OPTIONS = 4;
const HINT_GROUPS = 3;
const HINT_REMOVABLES = 5;

export interface QuestionItemInput {
  item: GapItemDto;
  template: TemplatePayload | undefined;
  importance: number;
}

const FIELD_CODE: Readonly<Record<GapField, string>> = { description: 'd', options: 'o', removables: 'r' };

function baseGroup(template: TemplatePayload) {
  return template.optionGroups.find((g) => g.options.some((o) => o.priceMode === 'sets_base')) ?? template.optionGroups[0];
}

export function itemQuestion({ item, template }: QuestionItemInput): QuestionDto | undefined {
  if (item.missing.length === 0) return undefined;
  const absent = item.missing.filter((m) => m.state === 'absent').map((m) => m.field);
  const unknown = item.missing.filter((m) => m.state === 'unknown').map((m) => m.field);
  const hints: string[] = [];
  if (template && item.missing.some((m) => m.field === 'options')) {
    const base = baseGroup(template);
    if (base) {
      const others = template.optionGroups.filter((g) => g !== base).map((g) => g.name).slice(0, HINT_GROUPS);
      hints.push(GAP_TEXT.optionsHint(base.name, base.options.slice(0, HINT_OPTIONS).map((o) => o.name), others));
    }
  }
  if (template && item.missing.some((m) => m.field === 'removables') && template.removableIngredients.length > 0) {
    hints.push(GAP_TEXT.removablesHint(template.removableIngredients.slice(0, HINT_REMOVABLES)));
  }
  const code = item.missing.map((m) => `${FIELD_CODE[m.field]}${m.state === 'unknown' ? '?' : ''}`).join('');
  return {
    key: `fields:${item.normalized}:${code}`,
    text: GAP_TEXT.itemFields(item.name, absent, unknown),
    kind: 'missing_field',
    itemName: item.name,
    hints,
  };
}

export function missingItemQuestion(rec: RecommendationDto): QuestionDto {
  return {
    key: `item:${normalizeTr(rec.name)}`,
    text: GAP_TEXT.missingItem(rec.name),
    kind: 'missing_item',
    itemName: rec.name,
    hints: rec.reason ? [rec.reason] : [],
  };
}

/** Option groups that recur in the cuisine's templates (≥ 2 templates and ≥ 30 %), size/portion groups excluded. */
export function cuisineQuestions(cuisineSlug: string, templates: readonly TemplatePayload[], max = MAX_CUISINE_QUESTIONS): QuestionDto[] {
  const groups = new Map<string, { name: string; count: number; options: string[] }>();
  for (const template of templates) {
    const seen = new Set<string>();
    for (const group of template.optionGroups) {
      const allBase = group.options.every((o) => o.priceMode === 'sets_base');
      if (allBase || isBasePriceGroupName(group.name)) continue;
      const key = normalizeTr(group.name);
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = groups.get(key);
      if (entry) entry.count += 1;
      else groups.set(key, { name: group.name, count: 1, options: group.options.map((o) => o.name) });
    }
  }
  const minCount = Math.max(2, Math.ceil(templates.length * 0.3));
  return [...groups.entries()]
    .filter(([, g]) => g.count >= minCount)
    .sort(([ka, a], [kb, b]) => b.count - a.count || ka.localeCompare(kb))
    .slice(0, max)
    .map(([key, g]) => ({
      key: `cuisine:${cuisineSlug}:${key}`,
      text: GAP_TEXT.cuisineGroup(g.name),
      kind: 'cuisine' as const,
      itemName: null,
      hints: [g.options.slice(0, 5).join(' / ')],
    }));
}

function byPriority(a: QuestionItemInput, b: QuestionItemInput): number {
  const incomplete = (x: QuestionItemInput) => (x.item.status === 'incomplete' ? 0 : 1);
  return incomplete(a) - incomplete(b) || a.item.completeness - b.item.completeness || b.importance - a.importance;
}

export interface QuestionPlan {
  questions: QuestionDto[];
  /** Missing-item slots kept free for AI recommendations. */
  reservedForAi: number;
}

export function buildQuestions(input: {
  items: readonly QuestionItemInput[];
  /** DB recommendations in rank order. */
  recommendations: readonly RecommendationDto[];
  /** counts.missing */
  needed: number;
  cuisine: readonly QuestionDto[];
}): QuestionPlan {
  const missingSlots = Math.min(MAX_MISSING_ITEM_QUESTIONS, input.needed);
  const tier1 = input.recommendations.slice(0, missingSlots).map(missingItemQuestion);
  const reservedForAi = missingSlots - tier1.length;
  const cuisineReserve = Math.min(MAX_CUISINE_QUESTIONS, input.cuisine.length);

  const fieldQuestions = [...input.items]
    .sort(byPriority)
    .map(itemQuestion)
    .filter((q): q is QuestionDto => q !== undefined);
  let capacity = MAX_QUESTIONS - missingSlots - cuisineReserve;
  const tier2 = fieldQuestions.slice(0, Math.max(0, capacity));
  const tier3 = input.cuisine.slice(0, cuisineReserve);
  capacity = MAX_QUESTIONS - tier1.length - reservedForAi - tier2.length - tier3.length;
  const extraFields = fieldQuestions.slice(tier2.length, tier2.length + Math.max(0, capacity));
  capacity -= extraFields.length;
  const tier4 = input.recommendations.slice(missingSlots, missingSlots + Math.max(0, capacity)).map(missingItemQuestion);

  const questions: QuestionDto[] = [];
  const keys = new Set<string>();
  for (const q of [...tier1, ...tier2, ...extraFields, ...tier3, ...tier4]) {
    if (keys.has(q.key)) continue;
    keys.add(q.key);
    questions.push(q);
  }
  return { questions, reservedForAi };
}
