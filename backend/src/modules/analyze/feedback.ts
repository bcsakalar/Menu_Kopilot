import type { Executor } from '../../db/client.js';
import { suggestionFeedback } from '../../db/schema/index.js';
import type { FeedbackKind } from '../../agents/knowledge.js';
import type { TemplatePayload } from '../../domain/template.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import type { CardDto } from './schemas.js';

/**
 * The learning loop (D-180): what the user kept and what they removed when accepting a card.
 *
 * The card holds what the pipeline suggested; the accepted payload is what the user kept after tapping chips away
 * (or the card untouched). The difference, one row per option group / ingredient / description, is written to
 * `suggestion_feedback`. Aggregated per product type (`FeedbackIndex`), it stops the pipeline from offering what
 * this team keeps deleting — and the accepted payload itself goes into the template pool, so the product is known
 * next time.
 */

export interface FeedbackRow {
  kind: FeedbackKind;
  value: string;
  action: 'accepted' | 'removed' | 'edited';
}

/** Kept after the edit: the suggested groups, ingredients and description, compared on their normalized names. */
export function diffFeedback(
  card: Pick<CardDto, 'optionGroups' | 'removableIngredients' | 'extraIngredients' | 'shortDescription'>,
  kept: Pick<TemplatePayload, 'optionGroups' | 'removableIngredients' | 'extraIngredients' | 'description'>,
): FeedbackRow[] {
  const rows: FeedbackRow[] = [];
  const keptGroups = new Set(kept.optionGroups.map((g) => normalizeTr(g.name)));
  const keptRemovable = new Set(kept.removableIngredients.map(normalizeTr));
  const keptExtras = new Set(kept.extraIngredients.map((e) => normalizeTr(e.name)));
  for (const group of card.optionGroups) {
    rows.push({ kind: 'option_group', value: group.name, action: keptGroups.has(normalizeTr(group.name)) ? 'accepted' : 'removed' });
  }
  for (const name of card.removableIngredients) {
    rows.push({ kind: 'removable', value: name, action: keptRemovable.has(normalizeTr(name)) ? 'accepted' : 'removed' });
  }
  for (const name of card.extraIngredients) {
    rows.push({ kind: 'extra', value: name, action: keptExtras.has(normalizeTr(name)) ? 'accepted' : 'removed' });
  }
  const suggested = card.shortDescription.trim();
  if (suggested) {
    const final = kept.description.trim();
    rows.push({
      kind: 'description',
      value: suggested,
      action: final === '' ? 'removed' : normalizeTr(final) === normalizeTr(suggested) ? 'accepted' : 'edited',
    });
  }
  return rows;
}

export async function recordFeedback(
  db: Executor,
  input: { userId: string; card: CardDto; rows: readonly FeedbackRow[] },
): Promise<void> {
  if (input.rows.length === 0) return;
  await db.insert(suggestionFeedback).values(
    input.rows.map((row) => ({
      userId: input.userId,
      runId: input.card.runId,
      cardId: input.card.id,
      productType: input.card.productType,
      kind: row.kind,
      value: row.value.slice(0, 200),
      action: row.action,
    })),
  );
}
