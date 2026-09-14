import { and, asc, eq, max } from 'drizzle-orm';
import type { Database, Executor } from '../../db/client.js';
import { menuItems, suggestionItems, suggestionRuns } from '../../db/schema/index.js';
import { type TemplatePayload, templatePayloadSchema } from '../../domain/template.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import { insertTemplate, replaceTemplateContent } from '../templates/template-store.js';
import {
  type CardDto,
  type CardOrigin,
  type PendingWork,
  type RunDto,
  type RunStats,
  type StoredCard,
  pendingWorkSchema,
  storedCardSchema,
} from './schemas.js';
import { reviewPlaceholder } from './sanitize.js';

export interface NewCard {
  rawName: string;
  normalizedName: string;
  origin: CardOrigin;
  matchedTemplateId: string | null;
  stored: StoredCard;
  sortOrder: number;
}

type ItemRow = typeof suggestionItems.$inferSelect;
type RunRow = typeof suggestionRuns.$inferSelect;

export function parseStoredCard(row: ItemRow): StoredCard {
  const parsed = storedCardSchema.safeParse(row.payload);
  if (parsed.success) return parsed.data;
  return {
    template: reviewPlaceholder(row.rawName),
    needsReview: true,
    reviewReason: 'Kart verisi okunamadı',
    confidence: null,
    matchType: null,
    score: null,
    sectionText: null,
    draftTemplateId: null,
    extraction: null,
  };
}

export function toCardDto(row: ItemRow): CardDto {
  const stored = parseStoredCard(row);
  const edited = row.editedPayload ? templatePayloadSchema.safeParse(row.editedPayload) : undefined;
  return {
    id: row.id,
    runId: row.runId,
    rawName: row.rawName,
    origin: row.source,
    matchedTemplateId: row.matchedItemId,
    matchType: stored.matchType,
    score: stored.score,
    needsReview: stored.needsReview,
    reviewReason: stored.reviewReason,
    confidence: stored.confidence,
    sectionText: stored.sectionText,
    status: row.accepted === null ? 'pending' : row.accepted ? 'accepted' : 'skipped',
    payload: edited?.success ? edited.data : stored.template,
    sortOrder: row.sortOrder,
  };
}

export interface FinishRunPatch {
  status: RunRow['status'];
  stage: string;
  stats: RunStats;
  pendingWork: PendingWork | null;
  provider?: string | undefined;
  model?: string | undefined;
  error?: string | undefined;
}

/** Persistence of runs and suggestion cards (+ unapproved AI drafts in menu_items). */
export class SuggestionStore {
  constructor(private readonly db: Database) {}

  async createRun(input: {
    userId: string;
    cuisineId: string;
    branchId: string | null;
    promptText: string | null;
    imageHashes: string[];
    deepMode: boolean;
    mode: 'suggest' | 'gap';
  }): Promise<string> {
    const [row] = await this.db
      .insert(suggestionRuns)
      .values({
        userId: input.userId,
        cuisineId: input.cuisineId,
        branchId: input.branchId,
        promptText: input.promptText,
        imageHashes: input.imageHashes,
        deepMode: input.deepMode,
        mode: input.mode,
        status: 'running',
        stage: 'init',
      })
      .returning({ id: suggestionRuns.id });
    if (!row) throw new Error('run insert failed');
    return row.id;
  }

  async reopenRun(runId: string, extraImageHashes: string[]): Promise<void> {
    const [run] = await this.db.select().from(suggestionRuns).where(eq(suggestionRuns.id, runId)).limit(1);
    if (!run) return;
    await this.db
      .update(suggestionRuns)
      .set({
        status: 'running',
        stage: 'continue',
        finishedAt: null,
        imageHashes: [...new Set([...run.imageHashes, ...extraImageHashes])],
      })
      .where(eq(suggestionRuns.id, runId));
  }

  async nextSortOrder(runId: string): Promise<number> {
    const [row] = await this.db
      .select({ max: max(suggestionItems.sortOrder) })
      .from(suggestionItems)
      .where(eq(suggestionItems.runId, runId));
    return (row?.max ?? -1) + 1;
  }

  async insertCard(runId: string, card: NewCard): Promise<CardDto> {
    const [row] = await this.db
      .insert(suggestionItems)
      .values({
        runId,
        rawName: card.rawName,
        normalizedName: card.normalizedName,
        matchedItemId: card.matchedTemplateId,
        source: card.origin,
        payload: card.stored,
        sortOrder: card.sortOrder,
      })
      .returning();
    if (!row) throw new Error('card insert failed');
    return toCardDto(row);
  }

  /** One unapproved AI draft per (cuisine, name); refreshed on every new AI answer. */
  async upsertDraft(db: Executor, cuisineId: string, payload: TemplatePayload, userId: string): Promise<string> {
    const normalized = normalizeTr(payload.name);
    const [existing] = await db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(and(eq(menuItems.cuisineId, cuisineId), eq(menuItems.normalizedName, normalized), eq(menuItems.approved, false)))
      .limit(1);
    if (existing) {
      await replaceTemplateContent(db, existing.id, payload, { source: 'ai', needsReview: false });
      return existing.id;
    }
    return insertTemplate(db, { cuisineId, payload, source: 'ai', approved: false, createdBy: userId });
  }

  async finishRun(runId: string, patch: FinishRunPatch): Promise<void> {
    await this.db
      .update(suggestionRuns)
      .set({
        status: patch.status,
        stage: patch.stage,
        llmCalls: patch.stats.llmCalls,
        tokensIn: patch.stats.tokensIn,
        tokensOut: patch.stats.tokensOut,
        latencyMs: patch.stats.latencyMs,
        cacheHit: patch.stats.cacheHit,
        pendingWork: patch.pendingWork ? (patch.pendingWork) : null,
        error: patch.error ?? null,
        finishedAt: new Date(),
        ...(patch.provider ? { provider: patch.provider } : {}),
        ...(patch.model ? { model: patch.model } : {}),
      })
      .where(eq(suggestionRuns.id, runId));
  }

  async getRunRow(runId: string): Promise<RunRow | undefined> {
    const [run] = await this.db.select().from(suggestionRuns).where(eq(suggestionRuns.id, runId)).limit(1);
    return run;
  }

  pendingWorkOf(run: RunRow): PendingWork | null {
    if (!run.pendingWork) return null;
    const parsed = pendingWorkSchema.safeParse(run.pendingWork);
    return parsed.success ? parsed.data : null;
  }

  async getRun(runId: string): Promise<RunDto | undefined> {
    const run = await this.getRunRow(runId);
    if (!run) return undefined;
    const items = await this.db
      .select()
      .from(suggestionItems)
      .where(eq(suggestionItems.runId, runId))
      .orderBy(asc(suggestionItems.sortOrder));
    const pending = this.pendingWorkOf(run);
    return {
      id: run.id,
      mode: run.mode,
      status: run.status,
      stage: run.stage,
      cuisineId: run.cuisineId,
      branchId: run.branchId,
      promptText: run.promptText,
      deepMode: run.deepMode,
      cacheHit: run.cacheHit,
      llmCalls: run.llmCalls,
      tokensIn: run.tokensIn,
      tokensOut: run.tokensOut,
      latencyMs: run.latencyMs,
      pendingItems: pending?.names.length ?? 0,
      pendingImageHashes: pending?.imageHashes ?? [],
      error: run.error,
      createdAt: run.createdAt.toISOString(),
      finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
      cards: items.map(toCardDto),
    };
  }

  async getItem(itemId: string): Promise<{ item: ItemRow; run: RunRow } | undefined> {
    const [row] = await this.db
      .select({ item: suggestionItems, run: suggestionRuns })
      .from(suggestionItems)
      .innerJoin(suggestionRuns, eq(suggestionItems.runId, suggestionRuns.id))
      .where(eq(suggestionItems.id, itemId))
      .limit(1);
    return row;
  }

  async getCard(itemId: string): Promise<CardDto | undefined> {
    const [row] = await this.db.select().from(suggestionItems).where(eq(suggestionItems.id, itemId)).limit(1);
    return row ? toCardDto(row) : undefined;
  }
}
