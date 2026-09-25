import { and, asc, desc, eq, gte, ilike, inArray, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { agentSteps, cuisines, menuItems, suggestionItems, suggestionRuns } from '../../db/schema/index.js';
import type { MergedItem } from '../../agents/dedupe.js';
import type { AgentName } from '../../agents/types.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import { templatePayloadSchema } from '../../domain/template.js';
import type {
  AnalyzeResult,
  AnalyzeStats,
  CardDto,
  ClassificationDto,
  CountsDto,
  HistoryItem,
  HistoryQuery,
  HistoryResult,
  MenuItemDto,
  TraceStep,
} from './schemas.js';

/** `%` and `_` typed into the search box are letters, not wildcards. */
const likePattern = (text: string): string => `%${text.replace(/[\\%_]/gu, (c) => `\\${c}`)}%`;
const asInt = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null);

/** Persistence for analysis runs: the run row, its cards, its menu snapshot and its agent trace. */
export class AnalyzeStore {
  constructor(private readonly db: Database) {}

  async createRun(input: {
    userId: string;
    cuisineId: string | null;
    promptText: string | null;
    imageHashes: string[];
    analysisMode?: 'quick' | 'full' | undefined;
  }): Promise<string> {
    const [row] = await this.db
      .insert(suggestionRuns)
      .values({
        userId: input.userId,
        cuisineId: input.cuisineId,
        mode: 'suggest',
        analysisMode: input.analysisMode ?? null,
        promptText: input.promptText,
        imageHashes: input.imageHashes,
        status: 'running',
        stage: 'extract',
      })
      .returning({ id: suggestionRuns.id });
    if (!row) throw new Error('run insert failed');
    return row.id;
  }

  /** Card payloads keep the whole DTO: the result screen renders straight from it, with no second lookup. */
  async insertCard(runId: string, card: Omit<CardDto, 'id' | 'runId'>): Promise<CardDto> {
    const [row] = await this.db
      .insert(suggestionItems)
      .values({
        runId,
        rawName: card.name,
        normalizedName: normalizeTr(card.name),
        matchedItemId: card.matchedTemplateId,
        source: card.source,
        section: card.section,
        categoryKey: card.categoryKey,
        targetName: card.targetName,
        fixKind: card.fixKind,
        payload: { ...card },
        productType: card.productType,
        confidence: card.confidence,
        sortOrder: card.sortOrder,
      })
      .returning({ id: suggestionItems.id });
    if (!row) throw new Error('card insert failed');
    return { ...card, id: row.id, runId };
  }

  async finishRun(
    runId: string,
    input: {
      status: AnalyzeResult['status'];
      stats: AnalyzeStats;
      counts: CountsDto | null;
      classification: ClassificationDto | null;
      warnings: { code: string; message: string }[];
      menu: MenuItemDto[];
      extracted: MergedItem[];
      provider?: string | undefined;
      model?: string | undefined;
      error?: string | undefined;
    },
  ): Promise<void> {
    await this.db
      .update(suggestionRuns)
      .set({
        status: input.status,
        stage: 'done',
        latencyMs: input.stats.latencyMs,
        llmCalls: input.stats.llmCalls,
        tokensIn: input.stats.tokensIn,
        tokensOut: input.stats.tokensOut,
        cacheHit: input.stats.cacheHit,
        provider: input.provider ?? null,
        model: input.model ?? null,
        counts:
          input.counts === null
            ? null
            : { ...input.counts, stats: input.stats, classification: input.classification, warnings: input.warnings },
        menuSnapshot: { items: input.menu, extracted: input.extracted },
        error: input.error ?? null,
        finishedAt: new Date(),
        ...(input.counts ? { cuisineId: input.counts.cuisineId } : {}),
      })
      .where(eq(suggestionRuns.id, runId));
  }

  async failRun(runId: string, message: string): Promise<void> {
    await this.db
      .update(suggestionRuns)
      .set({ status: 'failed', stage: 'done', error: message, finishedAt: new Date() })
      .where(eq(suggestionRuns.id, runId));
  }

  async snapshot(userId: string, runId: string): Promise<AnalyzeResult | null> {
    const [run] = await this.db
      .select()
      .from(suggestionRuns)
      .where(and(eq(suggestionRuns.id, runId), eq(suggestionRuns.userId, userId)))
      .limit(1);
    if (!run) return null;

    const rows = await this.db
      .select()
      .from(suggestionItems)
      .where(eq(suggestionItems.runId, runId))
      .orderBy(asc(suggestionItems.sortOrder));

    const stored: Record<string, unknown> = run.counts ?? {};
    const { stats, classification, warnings, ...counts } = stored as {
      stats?: AnalyzeStats;
      classification?: ClassificationDto | null;
      warnings?: { code: string; message: string }[];
    } & Record<string, unknown>;
    const snapshot = (run.menuSnapshot ?? {}) as { items?: MenuItemDto[] };

    return {
      runId: run.id,
      status: run.status,
      counts: Object.keys(counts).length > 0 ? (counts as unknown as CountsDto) : null,
      classification: classification ?? null,
      menu: snapshot.items ?? [],
      cards: rows.map((row) => ({
        ...(row.payload as unknown as CardDto),
        // Cards stored before the knowledge base have neither field in their payload.
        productType: row.productType ?? null,
        confidence: row.confidence ?? null,
        id: row.id,
        runId,
        status: row.accepted === null ? 'pending' : row.accepted ? 'accepted' : 'skipped',
        ...(row.editedPayload ? { payload: row.editedPayload as unknown as CardDto['payload'] } : {}),
      })),
      stats: stats ?? null,
      warnings: warnings ?? [],
      error: run.error,
      createdAt: run.createdAt.toISOString(),
    };
  }

  /**
   * The product list an earlier run read, with its evidence — what a re-run with another cuisine starts from.
   * Null when the run is not the user's, is still running, or predates this field.
   */
  async extractedItems(userId: string, runId: string): Promise<MergedItem[] | null> {
    const [run] = await this.db
      .select({ status: suggestionRuns.status, menuSnapshot: suggestionRuns.menuSnapshot })
      .from(suggestionRuns)
      .where(and(eq(suggestionRuns.id, runId), eq(suggestionRuns.userId, userId)))
      .limit(1);
    if (!run || run.status === 'running') return null;
    const extracted = (run.menuSnapshot as { extracted?: MergedItem[] } | null)?.extracted;
    return Array.isArray(extracted) && extracted.length > 0 ? extracted : null;
  }

  /** Most recent run of the user — what the result screen restores on a cold open. */
  /**
   * The user's runs, newest first, filtered and paged (D-193). The card counts come from one grouped query over the
   * page, not one per row.
   */
  async history(userId: string, query: HistoryQuery): Promise<HistoryResult> {
    const conditions: SQL[] = [eq(suggestionRuns.userId, userId)];
    if (query.before) conditions.push(lt(suggestionRuns.createdAt, new Date(query.before)));
    if (query.from) conditions.push(gte(suggestionRuns.createdAt, new Date(query.from)));
    if (query.to) conditions.push(lte(suggestionRuns.createdAt, new Date(query.to)));
    if (query.cuisineId) conditions.push(eq(suggestionRuns.cuisineId, query.cuisineId));
    if (query.mode) conditions.push(eq(suggestionRuns.analysisMode, query.mode));
    if (query.q) {
      const pattern = likePattern(query.q);
      const match = or(
        ilike(suggestionRuns.promptText, pattern),
        ilike(cuisines.name, pattern),
        sql`${suggestionRuns.menuSnapshot}::text ilike ${pattern}`,
      );
      if (match) conditions.push(match);
    }

    const rows = await this.db
      .select({
        id: suggestionRuns.id,
        createdAt: suggestionRuns.createdAt,
        finishedAt: suggestionRuns.finishedAt,
        status: suggestionRuns.status,
        mode: suggestionRuns.analysisMode,
        cuisineId: suggestionRuns.cuisineId,
        cuisineName: cuisines.name,
        menuSnapshot: suggestionRuns.menuSnapshot,
        counts: suggestionRuns.counts,
      })
      .from(suggestionRuns)
      .leftJoin(cuisines, eq(cuisines.id, suggestionRuns.cuisineId))
      .where(and(...conditions))
      .orderBy(desc(suggestionRuns.createdAt))
      .limit(query.limit + 1);
    const page = rows.slice(0, query.limit);

    const ids = page.map((r) => r.id);
    const tallies =
      ids.length === 0
        ? []
        : await this.db
            .select({
              runId: suggestionItems.runId,
              newProducts: sql<number>`count(*) filter (where ${suggestionItems.section} = 'new_product')::int`,
              menuCards: sql<number>`count(*) filter (where ${suggestionItems.section} = 'option')::int`,
              accepted: sql<number>`count(*) filter (where ${suggestionItems.accepted} = true and ${suggestionItems.section} <> 'fix')::int`,
              skipped: sql<number>`count(*) filter (where ${suggestionItems.accepted} = false and ${suggestionItems.section} <> 'fix')::int`,
            })
            .from(suggestionItems)
            .where(inArray(suggestionItems.runId, ids))
            .groupBy(suggestionItems.runId);
    const byRun = new Map(tallies.map((t) => [t.runId, t]));

    const items: HistoryItem[] = page.map((row) => {
      const menu = ((row.menuSnapshot as { items?: MenuItemDto[] } | null)?.items ?? []).map((i) => i.name);
      const counts = (row.counts ?? {}) as { current?: unknown; target?: unknown };
      const tally = byRun.get(row.id);
      return {
        runId: row.id,
        createdAt: row.createdAt.toISOString(),
        finishedAt: row.finishedAt?.toISOString() ?? null,
        status: row.status,
        mode: row.mode === 'quick' || row.mode === 'full' ? row.mode : null,
        cuisineId: row.cuisineId,
        cuisineName: row.cuisineName ?? null,
        productNames: menu.slice(0, 5),
        menuCount: menu.length,
        newProducts: tally?.newProducts ?? 0,
        menuCards: tally?.menuCards ?? 0,
        accepted: tally?.accepted ?? 0,
        skipped: tally?.skipped ?? 0,
        current: asInt(counts.current),
        target: asInt(counts.target),
      };
    });
    const last = page[page.length - 1];
    return { items, nextBefore: rows.length > query.limit && last ? last.createdAt.toISOString() : null };
  }

  /** The cuisine the run settled on (the classifier's, once the run finished; the user's pick before that). */
  async runCuisineId(runId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ cuisineId: suggestionRuns.cuisineId })
      .from(suggestionRuns)
      .where(eq(suggestionRuns.id, runId))
      .limit(1);
    return row?.cuisineId ?? null;
  }

  async latestRunId(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: suggestionRuns.id })
      .from(suggestionRuns)
      .where(eq(suggestionRuns.userId, userId))
      .orderBy(desc(suggestionRuns.createdAt))
      .limit(1);
    return row?.id ?? null;
  }

  async trace(userId: string, runId: string): Promise<{ steps: TraceStep[] } | null> {
    const [run] = await this.db
      .select({ id: suggestionRuns.id })
      .from(suggestionRuns)
      .where(and(eq(suggestionRuns.id, runId), eq(suggestionRuns.userId, userId)))
      .limit(1);
    if (!run) return null;
    const rows = await this.db.select().from(agentSteps).where(eq(agentSteps.runId, runId)).orderBy(asc(agentSteps.seq));
    return {
      steps: rows.map((row) => ({
        seq: row.seq,
        agent: row.agent as AgentName,
        label: row.agent,
        status: row.status,
        provider: row.provider,
        model: row.model,
        durationMs: row.durationMs,
        tokensIn: row.tokensIn,
        tokensOut: row.tokensOut,
        llmCalls: row.llmCalls,
        input: row.input ?? null,
        output: row.output ?? null,
        error: row.error,
      })),
    };
  }

  /** Marks a card accepted/skipped and returns it. */
  async setAccepted(userId: string, cardId: string, accepted: boolean, payload?: unknown): Promise<CardDto | null> {
    const [row] = await this.db
      .select({ item: suggestionItems, runUser: suggestionRuns.userId })
      .from(suggestionItems)
      .innerJoin(suggestionRuns, eq(suggestionRuns.id, suggestionItems.runId))
      .where(eq(suggestionItems.id, cardId))
      .limit(1);
    if (!row || row.runUser !== userId) return null;

    const edited = payload === undefined ? undefined : templatePayloadSchema.parse(payload);
    await this.db
      .update(suggestionItems)
      .set({ accepted, ...(edited ? { editedPayload: edited } : {}) })
      .where(eq(suggestionItems.id, cardId));

    const card = row.item.payload as unknown as CardDto;
    return {
      ...card,
      id: row.item.id,
      runId: row.item.runId,
      status: accepted ? 'accepted' : 'skipped',
      ...(edited ? { payload: edited } : {}),
    };
  }

  /** Category of an approved template, used to backfill `menu_items.category_key` on accept. */
  async setTemplateCategory(templateId: string, categoryKey: string): Promise<void> {
    await this.db.update(menuItems).set({ categoryKey }).where(eq(menuItems.id, templateId));
  }
}
