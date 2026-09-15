import { isDeepStrictEqual } from 'node:util';
import { eq } from 'drizzle-orm';
import type { ImageInput } from '../../ai/types.js';
import type { Database } from '../../db/client.js';
import { menuItems, suggestionItems } from '../../db/schema/index.js';
import { type TemplatePayload, templatePayloadSchema } from '../../domain/template.js';
import { AppError, isUniqueViolation, notFound } from '../../lib/errors.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import type { JobQueue } from '../../jobs/queue.js';
import { attachAcceptedCard, recomputeBranchCount, requireBranch } from '../branches/branch-menu.js';
import { CuisineGraph } from '../retrieval/cuisine-graph.js';
import { addAliases, findApprovedByName, getTemplate, insertTemplate, replaceTemplateContent } from '../templates/template-store.js';
import type { PipelineResult, SuggestPipeline } from './pipeline.js';
import { parsePromptItems } from './prompt-parse.js';
import type { RunRegistry } from './run-registry.js';
import type { CardDto, ParsedName, RunDto, SuggestEvent, SuggestFields } from './schemas.js';
import { parseStoredCard, type SuggestionStore } from './store.js';

export interface StartedRun {
  runId: string;
  done: Promise<PipelineResult | undefined>;
}

/** Orchestrates runs (start / continue / cancel / snapshot) and card decisions (accept / skip). No HTTP types here. */
export class SuggestService {
  constructor(
    private readonly deps: {
      db: Database;
      store: SuggestionStore;
      pipeline: SuggestPipeline;
      registry: RunRegistry<SuggestEvent>;
      queue: JobQueue;
      budget: { maxLlmCalls: number; maxInputTokens: number };
      log?: { error: (obj: object, msg: string) => void };
    },
  ) {}

  private async launch(
    runId: string,
    userId: string,
    cuisine: { id: string; name: string },
    graph: CuisineGraph,
    input: { promptNames: ParsedName[]; images: ImageInput[]; deepMode: boolean; resumed: boolean },
  ): Promise<StartedRun> {
    const { registry, store, pipeline } = this.deps;
    const controller = registry.create(runId);
    registry.emit(runId, {
      type: 'run',
      runId,
      cuisineId: cuisine.id,
      resumed: input.resumed,
      budget: { maxCalls: this.deps.budget.maxLlmCalls, maxInputTokens: this.deps.budget.maxInputTokens },
    });
    const sortOrderStart = await store.nextSortOrder(runId);
    const done = pipeline
      .run({
        runId,
        userId,
        cuisine,
        graph,
        deepMode: input.deepMode,
        promptNames: input.promptNames,
        images: input.images,
        sortOrderStart,
        signal: controller.signal,
        emit: (event) => registry.emit(runId, event),
      })
      .then(async (result) => {
        await store.finishRun(runId, {
          status: result.status,
          stage: 'done',
          stats: result.stats,
          pendingWork: result.pendingWork,
          provider: result.provider,
          model: result.model,
        });
        registry.emit(runId, { type: 'done', status: result.status, stats: result.stats });
        return result;
      })
      .catch(async (err: unknown) => {
        this.deps.log?.error({ err, runId }, 'suggest pipeline failed');
        const message = err instanceof AppError ? err.message : 'Öneri hazırlanırken beklenmeyen bir hata oluştu';
        await store
          .finishRun(runId, {
            status: 'failed',
            stage: 'error',
            stats: {
              llmCalls: 0,
              embedCalls: 0,
              tokensIn: 0,
              tokensOut: 0,
              cacheHit: false,
              latencyMs: 0,
              dbHits: 0,
              aiItems: 0,
              reviewItems: 0,
              pendingItems: 0,
              pendingImages: 0,
            },
            pendingWork: null,
            error: err instanceof Error ? err.message : String(err),
          })
          .catch(() => undefined);
        registry.emit(runId, { type: 'error', code: 'INTERNAL_ERROR', message });
        return undefined;
      });
    return { runId, done };
  }

  async start(userId: string, fields: SuggestFields, images: ImageInput[]): Promise<StartedRun> {
    const graph = await CuisineGraph.load(this.deps.db);
    const cuisine = graph.get(fields.cuisineId);
    if (!cuisine) throw notFound('Mutfak türü');
    if (fields.branchId) await requireBranch(this.deps.db, fields.branchId, userId);
    const promptNames = parsePromptItems(fields.promptText);
    if (promptNames.length === 0 && images.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Ürün adları yaz veya menü fotoğrafı ekle');
    }
    const runId = await this.deps.store.createRun({
      userId,
      cuisineId: cuisine.id,
      branchId: fields.branchId ?? null,
      promptText: fields.promptText ?? null,
      imageHashes: images.map((i) => i.sha256),
      deepMode: fields.deepMode,
      mode: 'suggest',
    });
    return this.launch(runId, userId, { id: cuisine.id, name: cuisine.name }, graph, {
      promptNames,
      images,
      deepMode: fields.deepMode,
      resumed: false,
    });
  }

  /** "Devam et": processes the run's pending names and the re-uploaded pending images with a fresh budget. */
  async continueRun(userId: string, runId: string, images: ImageInput[]): Promise<StartedRun> {
    const run = await this.deps.store.getRunRow(runId);
    if (!run || run.userId !== userId) throw notFound('Öneri');
    if (this.deps.registry.isActive(runId)) throw new AppError('CONFLICT', 'Bu öneri hâlâ çalışıyor');
    const pending = this.deps.store.pendingWorkOf(run);
    if (!pending || (pending.names.length === 0 && pending.imageHashes.length === 0)) {
      throw new AppError('CONFLICT', 'Devam edilecek iş yok');
    }
    if (!run.cuisineId) throw new AppError('CONFLICT', 'Mutfak türü silinmiş');
    const graph = await CuisineGraph.load(this.deps.db);
    const cuisine = graph.get(run.cuisineId);
    if (!cuisine) throw notFound('Mutfak türü');
    const wanted = new Set(pending.imageHashes);
    const pendingImages = images.filter((img) => wanted.has(img.sha256));
    const missing = pending.imageHashes.filter((h) => !pendingImages.some((img) => img.sha256 === h));
    if (missing.length > 0 && pending.names.length === 0 && pendingImages.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Bekleyen fotoğrafları tekrar gönder', { missingImageHashes: missing });
    }
    await this.deps.store.reopenRun(runId, []);
    return this.launch(runId, userId, { id: cuisine.id, name: cuisine.name }, graph, {
      promptNames: pending.names,
      images: pendingImages,
      deepMode: run.deepMode,
      resumed: true,
    });
  }

  async snapshot(userId: string, runId: string): Promise<RunDto> {
    const run = await this.deps.store.getRun(runId);
    const row = await this.deps.store.getRunRow(runId);
    if (!run || !row || row.userId !== userId) throw notFound('Öneri');
    return run;
  }

  async cancel(userId: string, runId: string): Promise<{ cancelled: boolean }> {
    const row = await this.deps.store.getRunRow(runId);
    if (!row || row.userId !== userId) throw notFound('Öneri');
    return { cancelled: this.deps.registry.cancel(runId) };
  }

  subscribe(runId: string, listener: (event: SuggestEvent) => void): (() => void) | undefined {
    return this.deps.registry.subscribe(runId, listener);
  }

  hasLiveEvents(runId: string): boolean {
    return this.deps.registry.has(runId);
  }

  /** Approves a card: template saved (approved), alias + embedding job, optional branch menu entry. */
  async accept(
    userId: string,
    itemId: string,
    body: { payload?: TemplatePayload | undefined; branchId?: string | undefined },
  ): Promise<{ card: CardDto; templateId: string }> {
    const { db, store } = this.deps;
    const found = await store.getItem(itemId);
    if (!found || found.run.userId !== userId) throw notFound('Kart');
    const { item, run } = found;
    const stored = parseStoredCard(item);
    const current = item.editedPayload ? templatePayloadSchema.safeParse(item.editedPayload) : undefined;
    const payload = templatePayloadSchema.parse(body.payload ?? (current?.success ? current.data : stored.template));
    if (payload.description.trim() === '' && payload.optionGroups.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Kart boş: en azından açıklama veya bir opsiyon grubu doldur');
    }
    const edited = !isDeepStrictEqual(payload, stored.template);
    const branchId = body.branchId ?? run.branchId ?? undefined;
    if (branchId) await requireBranch(db, branchId, userId);

    let templateId: string;
    try {
      templateId = await db.transaction(async (tx) => {
        let targetId: string | undefined;
        if (item.matchedItemId) {
          const template = await getTemplate(tx, item.matchedItemId);
          if (template) {
            if (!isDeepStrictEqual(template.payload, payload) || template.source === 'seed') {
              await replaceTemplateContent(tx, template.id, payload, { source: 'user' });
            }
            targetId = template.id;
          }
        }
        if (!targetId) {
          const cuisineId = run.cuisineId;
          if (!cuisineId) throw new AppError('CONFLICT', 'Mutfak türü silinmiş');
          const normalized = normalizeTr(payload.name);
          const approved = await findApprovedByName(tx, cuisineId, normalized);
          const draftId = stored.draftTemplateId;
          const source = edited || item.source === 'review' ? ('user' as const) : ('ai' as const);
          if (approved) {
            await replaceTemplateContent(tx, approved.id, payload, { source: 'user' });
            targetId = approved.id;
            if (draftId && draftId !== approved.id) await tx.delete(menuItems).where(eq(menuItems.id, draftId));
          } else if (draftId && (await getTemplate(tx, draftId))) {
            await replaceTemplateContent(tx, draftId, payload, { approved: true, source, needsReview: false });
            targetId = draftId;
          } else {
            targetId = await insertTemplate(tx, { cuisineId, payload, source, approved: true, createdBy: userId });
          }
        }
        await addAliases(tx, targetId, [item.rawName, payload.name], (await getTemplate(tx, targetId))?.canonicalName);
        await tx
          .update(suggestionItems)
          .set({ accepted: true, editedPayload: edited ? (payload) : null, matchedItemId: targetId })
          .where(eq(suggestionItems.id, itemId));
        if (branchId) {
          await attachAcceptedCard(tx, branchId, {
            name: payload.name,
            normalizedName: normalizeTr(payload.name),
            templateId: targetId,
            payload,
          });
          await recomputeBranchCount(tx, branchId);
        }
        return targetId;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('CONFLICT', 'Bu mutfakta aynı isimde onaylı başka bir şablon var');
      }
      throw err;
    }

    await this.deps.queue.enqueueEmbedding([templateId]);
    const card = await store.getCard(itemId);
    if (!card) throw notFound('Kart');
    return { card, templateId };
  }

  async skip(userId: string, itemId: string): Promise<CardDto> {
    const found = await this.deps.store.getItem(itemId);
    if (!found || found.run.userId !== userId) throw notFound('Kart');
    await this.deps.db.update(suggestionItems).set({ accepted: false }).where(eq(suggestionItems.id, itemId));
    const card = await this.deps.store.getCard(itemId);
    if (!card) throw notFound('Kart');
    return card;
  }
}
