import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { isRejectedTally } from '../../agents/knowledge.js';
import type { Database } from '../../db/client.js';
import { cuisines, productTypes, suggestionFeedback } from '../../db/schema/index.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import type { ForgetBody, LearnedProduct, LearnedSuggestion, LearningResult } from './schemas.js';

const CARD_KINDS = ['option_group', 'removable', 'extra'] as const;

interface Merged {
  value: string;
  accepted: number;
  removed: number;
  lastAt: Date;
}

/** Rows grouped on the spelling they were written with, merged on the normalized one; the newest spelling names it. */
function merge<T extends { value: string; accepted: number; removed: number; lastAt: Date }>(
  rows: readonly T[],
  keyOf: (row: T) => string,
): Map<string, Merged & { row: T }> {
  const out = new Map<string, Merged & { row: T }>();
  for (const row of rows) {
    const key = keyOf(row);
    const seen = out.get(key);
    if (!seen) {
      out.set(key, { value: row.value, accepted: row.accepted, removed: row.removed, lastAt: row.lastAt, row });
      continue;
    }
    const newer = row.lastAt > seen.lastAt;
    out.set(key, {
      value: newer ? row.value : seen.value,
      accepted: seen.accepted + row.accepted,
      removed: seen.removed + row.removed,
      lastAt: newer ? row.lastAt : seen.lastAt,
      row: newer ? row : seen.row,
    });
  }
  return out;
}

/**
 * The team's side of the learning loop (D-194): what the pipeline stopped offering because the team kept throwing it
 * away, and a way to take a verdict back. Shared by the whole team, like the loop itself; nothing is deleted — a
 * taken-back row is marked, and the loop no longer counts it.
 */
export class LearningService {
  constructor(private readonly db: Database) {}

  async rejections(): Promise<LearningResult> {
    const counts = {
      accepted: sql<number>`count(*) filter (where ${suggestionFeedback.action} = 'accepted')::int`,
      removed: sql<number>`count(*) filter (where ${suggestionFeedback.action} = 'removed')::int`,
      lastAt: sql<Date>`max(${suggestionFeedback.createdAt})`.mapWith((v: string | Date) => new Date(v)),
    };

    const productRows = await this.db
      .select({ cuisineId: suggestionFeedback.cuisineId, cuisineName: cuisines.name, value: suggestionFeedback.value, ...counts })
      .from(suggestionFeedback)
      .leftJoin(cuisines, eq(cuisines.id, suggestionFeedback.cuisineId))
      .where(and(eq(suggestionFeedback.kind, 'product'), isNull(suggestionFeedback.ignoredAt), isNotNull(suggestionFeedback.cuisineId)))
      .groupBy(suggestionFeedback.cuisineId, cuisines.name, suggestionFeedback.value);
    const products: LearnedProduct[] = [
      ...merge(productRows, (r) => `${r.cuisineId}|${normalizeTr(r.value)}`).values(),
    ]
      .filter((m) => isRejectedTally(m))
      .map((m) => ({
        cuisineId: m.row.cuisineId ?? '',
        cuisineName: m.row.cuisineName ?? '',
        name: m.value,
        removed: m.removed,
        accepted: m.accepted,
        lastAt: m.lastAt.toISOString(),
      }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));

    const suggestionRows = await this.db
      .select({ productType: suggestionFeedback.productType, kind: suggestionFeedback.kind, value: suggestionFeedback.value, ...counts })
      .from(suggestionFeedback)
      .where(
        and(
          inArray(suggestionFeedback.kind, [...CARD_KINDS]),
          isNull(suggestionFeedback.ignoredAt),
          isNotNull(suggestionFeedback.productType),
        ),
      )
      .groupBy(suggestionFeedback.productType, suggestionFeedback.kind, suggestionFeedback.value);
    const labels = new Map(
      (await this.db.select({ key: productTypes.key, label: productTypes.label }).from(productTypes)).map((t) => [t.key, t.label]),
    );
    const suggestions: LearnedSuggestion[] = [
      ...merge(suggestionRows, (r) => `${r.productType}|${r.kind}|${normalizeTr(r.value)}`).values(),
    ]
      .filter((m) => isRejectedTally(m))
      .map((m) => ({
        productType: m.row.productType ?? '',
        productTypeLabel: labels.get(m.row.productType ?? '') ?? m.row.productType ?? '',
        kind: m.row.kind as LearnedSuggestion['kind'],
        value: m.value,
        removed: m.removed,
        accepted: m.accepted,
        lastAt: m.lastAt.toISOString(),
      }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));

    return { products, suggestions };
  }

  /** "Geri al": the verdict's rows stop counting; the next analysis may suggest the item again. */
  async forget(userId: string, body: ForgetBody): Promise<{ forgotten: number }> {
    const scope =
      body.scope === 'product'
        ? and(eq(suggestionFeedback.kind, 'product'), eq(suggestionFeedback.cuisineId, body.cuisineId))
        : and(eq(suggestionFeedback.kind, body.kind), eq(suggestionFeedback.productType, body.productType));
    const candidates = await this.db
      .select({ id: suggestionFeedback.id, value: suggestionFeedback.value })
      .from(suggestionFeedback)
      .where(and(scope, isNull(suggestionFeedback.ignoredAt)));
    const target = normalizeTr(body.value);
    const ids = candidates.filter((c) => normalizeTr(c.value) === target).map((c) => c.id);
    if (ids.length === 0) return { forgotten: 0 };
    await this.db
      .update(suggestionFeedback)
      .set({ ignoredAt: new Date(), ignoredBy: userId })
      .where(inArray(suggestionFeedback.id, ids));
    return { forgotten: ids.length };
  }
}
