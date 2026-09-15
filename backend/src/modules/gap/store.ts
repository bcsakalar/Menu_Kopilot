import { and, desc, eq, isNotNull } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { branchMenuItems, branchMenuSnapshots, suggestionRuns } from '../../db/schema/index.js';
import { recomputeBranchCount, replaceRecommendations, upsertScreenshotItem } from '../branches/branch-menu.js';
import type { RecommendationCandidate } from './recommend.js';
import { type GapItemDto, type GapResultDto, type GapStats, type StoredGap, storedGapSchema } from './schemas.js';

type RunRow = typeof suggestionRuns.$inferSelect;

export interface BranchMenuRow {
  rawName: string;
  normalizedName: string;
  matchedItemId: string | null;
  status: 'ok' | 'incomplete' | 'missing';
}

/** Persistence of gap runs: suggestion_runs (mode = gap), snapshots and the branch menu. */
export class GapStore {
  constructor(private readonly db: Database) {}

  async createRun(input: {
    userId: string;
    branchId: string;
    cuisineId: string;
    notes: string | null;
    imageHashes: string[];
  }): Promise<string> {
    const [row] = await this.db
      .insert(suggestionRuns)
      .values({
        userId: input.userId,
        branchId: input.branchId,
        cuisineId: input.cuisineId,
        promptText: input.notes,
        imageHashes: input.imageHashes,
        mode: 'gap',
        status: 'running',
        stage: 'init',
      })
      .returning({ id: suggestionRuns.id });
    if (!row) throw new Error('gap run insert failed');
    return row.id;
  }

  async finishRun(
    runId: string,
    patch: {
      status: RunRow['status'];
      stats: GapStats;
      tokensIn: number;
      tokensOut: number;
      provider?: string | undefined;
      model?: string | undefined;
      error?: string | undefined;
    },
  ): Promise<void> {
    await this.db
      .update(suggestionRuns)
      .set({
        status: patch.status,
        stage: patch.status === 'failed' ? 'error' : 'done',
        llmCalls: patch.stats.llmCalls,
        tokensIn: patch.tokensIn,
        tokensOut: patch.tokensOut,
        latencyMs: patch.stats.latencyMs,
        cacheHit: patch.stats.cacheHit,
        error: patch.error ?? null,
        finishedAt: new Date(),
        ...(patch.provider ? { provider: patch.provider } : {}),
        ...(patch.model ? { model: patch.model } : {}),
      })
      .where(eq(suggestionRuns.id, runId));
  }

  async getRunRow(runId: string): Promise<RunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(suggestionRuns)
      .where(and(eq(suggestionRuns.id, runId), eq(suggestionRuns.mode, 'gap')))
      .limit(1);
    return row;
  }

  async loadBranchItems(branchId: string): Promise<BranchMenuRow[]> {
    return this.db
      .select({
        rawName: branchMenuItems.rawName,
        normalizedName: branchMenuItems.normalizedName,
        matchedItemId: branchMenuItems.matchedItemId,
        status: branchMenuItems.status,
      })
      .from(branchMenuItems)
      .where(eq(branchMenuItems.branchId, branchId));
  }

  /** Snapshot + branch menu update in one transaction; returns the snapshot id. */
  async persist(input: {
    runId: string;
    branchId: string;
    imageHashes: string[];
    stored: StoredGap;
    items: readonly GapItemDto[];
    recommendations: readonly RecommendationCandidate[];
  }): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [snapshot] = await tx
        .insert(branchMenuSnapshots)
        .values({
          branchId: input.branchId,
          runId: input.runId,
          source: 'screenshot',
          imageHashes: input.imageHashes,
          parsed: input.stored,
        })
        .returning({ id: branchMenuSnapshots.id });
      if (!snapshot) throw new Error('snapshot insert failed');
      for (const item of input.items) {
        await upsertScreenshotItem(tx, input.branchId, {
          rawName: item.name,
          normalizedName: item.normalized,
          matchedItemId: item.matchedTemplateId,
          status: item.status,
          hasDescription: item.flags.description === 'present',
          hasOptions: item.flags.options === 'present',
          hasRemovables: item.flags.removables === 'present',
          completenessScore: item.completeness,
          flags: { ...item.flags },
          snapshotId: snapshot.id,
        });
      }
      await replaceRecommendations(
        tx,
        input.branchId,
        input.recommendations.map((r) => ({
          name: r.name,
          normalizedName: r.normalized,
          templateId: r.templateId,
          reason: r.reason,
        })),
        snapshot.id,
      );
      await recomputeBranchCount(tx, input.branchId);
      return snapshot.id;
    });
  }

  private parse(parsed: unknown): StoredGap | undefined {
    const result = storedGapSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  }

  async storedForRun(runId: string): Promise<StoredGap | undefined> {
    const [row] = await this.db
      .select({ parsed: branchMenuSnapshots.parsed })
      .from(branchMenuSnapshots)
      .where(eq(branchMenuSnapshots.runId, runId))
      .orderBy(desc(branchMenuSnapshots.createdAt))
      .limit(1);
    return row ? this.parse(row.parsed) : undefined;
  }

  async latestRunIdForBranch(branchId: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ runId: branchMenuSnapshots.runId })
      .from(branchMenuSnapshots)
      .where(and(eq(branchMenuSnapshots.branchId, branchId), isNotNull(branchMenuSnapshots.runId)))
      .orderBy(desc(branchMenuSnapshots.createdAt))
      .limit(1);
    return row?.runId ?? undefined;
  }

  toResult(run: RunRow, stored: StoredGap | undefined): GapResultDto {
    return {
      runId: run.id,
      branchId: run.branchId,
      status: run.status,
      counts: stored?.counts ?? null,
      items: stored?.items ?? [],
      recommendations: stored?.recommendations ?? [],
      questions: stored?.questions ?? [],
      stats: stored?.stats ?? null,
      createdAt: run.createdAt.toISOString(),
    };
  }
}
