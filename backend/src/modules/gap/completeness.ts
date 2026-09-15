import type { TemplatePayload } from '../../domain/template.js';
import { type Flags, type GapField, type GapItemDto, type TriState, gapFieldSchema } from './schemas.js';

/**
 * Completeness of a panel item. Weights: description .40, options .35, removable ingredients .25; a field the
 * screenshot does not show ("unknown") counts half. Fields the matched template does not have (e.g. Ayran has no
 * removable ingredients) are not expected, and the remaining weights are re-normalized.
 */

export const GAP_FIELDS: readonly GapField[] = gapFieldSchema.options;
export const FIELD_WEIGHTS: Readonly<Record<GapField, number>> = { description: 0.4, options: 0.35, removables: 0.25 };
export const COMPLETE_THRESHOLD = 0.85;
const STATE_VALUE: Readonly<Record<TriState, number>> = { present: 1, unknown: 0.5, absent: 0 };

export type Expectations = Readonly<Record<GapField, boolean>>;

export function expectationsFor(template: TemplatePayload | undefined): Expectations {
  if (!template) return { description: true, options: true, removables: true };
  return {
    description: true,
    options: template.optionGroups.length > 0,
    removables: template.removableIngredients.length > 0,
  };
}

export interface Completeness {
  score: number;
  status: GapItemDto['status'];
  missing: GapItemDto['missing'];
}

export function assessCompleteness(flags: Flags, expected: Expectations): Completeness {
  let total = 0;
  let earned = 0;
  const missing: GapItemDto['missing'] = [];
  for (const field of GAP_FIELDS) {
    if (!expected[field]) continue;
    const weight = FIELD_WEIGHTS[field];
    const state = flags[field];
    total += weight;
    earned += weight * STATE_VALUE[state];
    if (state !== 'present') missing.push({ field, state });
  }
  const score = total === 0 ? 1 : Math.round((earned / total) * 1000) / 1000;
  return { score, status: score >= COMPLETE_THRESHOLD ? 'ok' : 'incomplete', missing };
}
