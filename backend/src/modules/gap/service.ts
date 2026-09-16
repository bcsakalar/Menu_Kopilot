import type { ImageInput } from '../../ai/types.js';
import type { Database } from '../../db/client.js';
import { AppError, notFound } from '../../lib/errors.js';
import { requireBranch } from '../branches/branch-menu.js';
import { CuisineGraph } from '../retrieval/cuisine-graph.js';
import { parsePromptItems } from '../suggest/prompt-parse.js';
import type { RunRegistry } from '../suggest/run-registry.js';
import type { GapPipeline, GapPipelineResult } from './pipeline.js';
import type { GapEvent, GapResultDto, GapStats } from './schemas.js';
import type { GapStore } from './store.js';

export interface StartedGapRun {
  runId: string;
  done: Promise<GapPipelineResult | undefined>;
}

const EMPTY_STATS: GapStats = { llmCalls: 0, latencyMs: 0, screenshots: 0, extracted: 0, unique: 0, cacheHit: false, typed: 0 };

/** Orchestrates gap-analysis runs (start / snapshot / latest / cancel). No HTTP types here. */
export class GapService {
  constructor(
    private readonly deps: {
      db: Database;
      store: GapStore;
      pipeline: GapPipeline;
      registry: RunRegistry<GapEvent>;
      log?: { error: (obj: object, msg: string) => void };
    },
  ) {}

  async start(
    userId: string,
    fields: { branchId: string; extraNotes?: string | undefined; menuText?: string | undefined },
    images: ImageInput[],
  ): Promise<StartedGapRun> {
    const typedItems = parsePromptItems(fields.menuText);
    if (images.length === 0 && typedItems.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Panel ekran görüntüsü ekle ya da menüdeki ürünleri yaz');
    }
    const branch = await requireBranch(this.deps.db, fields.branchId, userId);
    const graph = await CuisineGraph.load(this.deps.db);
    const cuisine = graph.get(branch.cuisineId);
    if (!cuisine) throw notFound('Mutfak türü');
    const notes = fields.extraNotes?.trim() ? fields.extraNotes.trim() : undefined;
    const { store, registry, pipeline } = this.deps;
    const runId = await store.createRun({
      userId,
      branchId: branch.id,
      cuisineId: cuisine.id,
      notes: notes ?? null,
      imageHashes: images.map((i) => i.sha256),
    });
    const controller = registry.create(runId);
    registry.emit(runId, { type: 'run', runId, branchId: branch.id });
    const done = pipeline
      .run({
        runId,
        userId,
        branch: { id: branch.id, targetItemCount: branch.targetItemCount },
        cuisine,
        graph,
        images,
        typedItems,
        extraNotes: notes,
        signal: controller.signal,
        emit: (event) => registry.emit(runId, event),
      })
      .then(async (result) => {
        await store.finishRun(runId, {
          status: result.status,
          stats: result.stats,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          provider: result.provider,
          model: result.model,
        });
        registry.emit(runId, { type: 'done', status: result.status, stats: result.stats });
        return result;
      })
      .catch(async (err: unknown) => {
        this.deps.log?.error({ err, runId }, 'gap pipeline failed');
        const message = err instanceof AppError ? err.message : 'Menü analizi sırasında beklenmeyen bir hata oluştu';
        await store
          .finishRun(runId, {
            status: 'failed',
            stats: EMPTY_STATS,
            tokensIn: 0,
            tokensOut: 0,
            error: err instanceof Error ? err.message : String(err),
          })
          .catch(() => undefined);
        registry.emit(runId, { type: 'error', code: 'INTERNAL_ERROR', message });
        return undefined;
      });
    return { runId, done };
  }

  async snapshot(userId: string, runId: string): Promise<GapResultDto> {
    const run = await this.deps.store.getRunRow(runId);
    if (!run || run.userId !== userId) throw notFound('Menü analizi');
    return this.deps.store.toResult(run, await this.deps.store.storedForRun(runId));
  }

  async latest(userId: string, branchId: string): Promise<GapResultDto> {
    await requireBranch(this.deps.db, branchId, userId);
    const runId = await this.deps.store.latestRunIdForBranch(branchId);
    if (!runId) throw notFound('Bu şube için menü analizi');
    return this.snapshot(userId, runId);
  }

  async cancel(userId: string, runId: string): Promise<{ cancelled: boolean }> {
    const run = await this.deps.store.getRunRow(runId);
    if (!run || run.userId !== userId) throw notFound('Menü analizi');
    return { cancelled: this.deps.registry.cancel(runId) };
  }

  subscribe(runId: string, listener: (event: GapEvent) => void): (() => void) | undefined {
    return this.deps.registry.subscribe(runId, listener);
  }

  hasLiveEvents(runId: string): boolean {
    return this.deps.registry.has(runId);
  }
}
