import { and, desc, eq } from 'drizzle-orm';
import { RequestBudget } from '../../ai/budget.js';
import type { ProviderErrorKind } from '../../ai/errors.js';
import type { PromptRepository } from '../../ai/prompt-repository.js';
import type { AiRouter, AttemptRecord, CallContext } from '../../ai/router.js';
import type { ImageInput } from '../../ai/types.js';
import type { Cache } from '../../cache/cache.js';
import type { Database } from '../../db/client.js';
import { menuItems } from '../../db/schema/index.js';
import { GAP_TEXT } from '../../i18n/tr.js';
import { mapWithConcurrency } from '../../lib/concurrency.js';
import { MIN_BRANCH_ITEMS } from '../branches/branch-menu.js';
import type { VisionExtractor } from '../extraction/vision-extractor.js';
import type { CuisineGraph, CuisineNode } from '../retrieval/cuisine-graph.js';
import type { RetrievalService } from '../retrieval/retrieval.service.js';
import { getTemplates } from '../templates/template-store.js';
import { assessCompleteness, expectationsFor } from './completeness.js';
import { dedupePanelItems } from './dedupe.js';
import { buildQuestions, cuisineQuestions, missingItemQuestion, type QuestionItemInput } from './questions.js';
import {
  MenuIndex,
  type RecommendationCandidate,
  aiRecommendations,
  dbRecommendations,
  wantedRecommendations,
} from './recommend.js';
import {
  type CountsDto,
  type GapEvent,
  type GapItemDto,
  type GapResultDto,
  type GapStats,
  type PanelItem,
  type RecommendationDto,
  type StoredGap,
  panelExtractionSchema,
  panelItemSchema,
} from './schemas.js';
import type { GapStore } from './store.js';

/**
 * Mod 2 — gap analysis of a branch menu from platform panel screenshots, used live during a phone call:
 *  1. panel extraction, one screenshot per call (cached per image hash), 3 in flight
 *  2. dedupe across screenshots (overlapping scrolls, clipped names)
 *  3. template matching without LLMs (exact → alias → trigram) → template-aware completeness
 *  4. counts vs the branch target → DB recommendations → call checklist
 *  5. only if the DB cannot fill the recommendations: `text.gap_suggest`
 * SSE order: run → counts → questions → items → recommendations(db) → recommendations(ai) + questions_append → done.
 */

export interface GapPipelineDeps {
  db: Database;
  router: AiRouter;
  prompts: PromptRepository;
  retrieval: RetrievalService;
  extractor: VisionExtractor;
  store: GapStore;
  cache: Cache;
  cacheTtlSeconds: number;
  budget: { maxLlmCalls: number; maxInputTokens: number };
}

export interface GapRunInput {
  runId: string;
  userId: string;
  branch: { id: string; targetItemCount: number | null };
  cuisine: CuisineNode;
  graph: CuisineGraph;
  images: ImageInput[];
  extraNotes: string | undefined;
  signal: AbortSignal;
  emit: (event: GapEvent) => void;
}

export interface GapPipelineResult {
  status: GapResultDto['status'];
  stats: GapStats;
  tokensIn: number;
  tokensOut: number;
  provider?: string;
  model?: string;
}

export const PANEL_CONCURRENCY = 3;
const CUISINE_TEMPLATE_SAMPLE = 50;
const AI_OFF: ReadonlySet<ProviderErrorKind> = new Set(['local_only', 'quota_exceeded']);

function toDto(rec: RecommendationCandidate): RecommendationDto {
  return { name: rec.name, reason: rec.reason, importance: rec.importance, source: rec.source, templateId: rec.templateId };
}

export class GapPipeline {
  constructor(private readonly deps: GapPipelineDeps) {}

  private async cuisineTemplates(cuisineId: string) {
    const rows = await this.deps.db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(and(eq(menuItems.approved, true), eq(menuItems.cuisineId, cuisineId)))
      .orderBy(desc(menuItems.importance), desc(menuItems.usageCount))
      .limit(CUISINE_TEMPLATE_SAMPLE);
    return getTemplates(
      this.deps.db,
      rows.map((r) => r.id),
    );
  }

  async run(run: GapRunInput): Promise<GapPipelineResult> {
    const { deps } = this;
    const started = Date.now();
    const budget = new RequestBudget(deps.budget.maxLlmCalls, deps.budget.maxInputTokens);
    const ctx: CallContext = { userId: run.userId, runId: run.runId, budget, signal: run.signal };
    let provider: string | undefined;
    let model: string | undefined;
    let aiOff = false;
    let failedImages = 0;
    let extracted = 0;

    const noteAttempts = (attempts: readonly AttemptRecord[]) => {
      const failed = attempts.filter((a) => a.outcome !== 'ok' && a.outcome !== 'skipped');
      if (failed.length > 0 && attempts.some((a) => a.outcome === 'ok')) {
        run.emit({
          type: 'warning',
          code: 'provider_fallback',
          message: GAP_TEXT.providerFallback(failed.map((f) => `${f.provider}: ${f.outcome}`).join(', ')),
        });
      }
    };

    // ---- 1. extraction ------------------------------------------------------------------------------------------
    const perImage: PanelItem[][] = run.images.map(() => []);
    let done = 0;
    run.emit({ type: 'progress', stage: 'extract', message: GAP_TEXT.progressExtract, done, total: run.images.length });
    await mapWithConcurrency(run.images, PANEL_CONCURRENCY, async (image, index) => {
      if (run.signal.aborted) return;
      const result = await deps.extractor.extract(
        image,
        {
          task: 'vision.panel_extract',
          systemKey: 'extract.panel.system',
          userKey: 'extract.panel.user',
          schema: panelExtractionSchema,
          itemSchema: panelItemSchema,
          schemaName: 'panel_extraction',
          cacheNamespace: 'p',
          vars: { cuisine: run.cuisine.name },
        },
        ctx,
      );
      noteAttempts(result.attempts);
      done += 1;
      if (result.ok) {
        perImage[index] = result.items;
        extracted += result.items.length;
        if (result.provider) provider = result.provider;
        if (result.model) model = result.model;
      } else {
        failedImages += 1;
        if (AI_OFF.has(result.error.kind)) aiOff = true;
        else if (result.error.kind !== 'aborted') {
          run.emit({ type: 'warning', code: 'extract_failed', message: GAP_TEXT.extractFailed(result.error.kind) });
        }
      }
      run.emit({ type: 'progress', stage: 'extract', message: GAP_TEXT.progressExtract, done, total: run.images.length });
    });
    if (aiOff) run.emit({ type: 'warning', code: 'ai_unavailable', message: GAP_TEXT.aiUnavailable });

    const entries = dedupePanelItems(perImage);
    if (entries.length === 0 && failedImages < run.images.length) {
      run.emit({ type: 'warning', code: 'no_items', message: GAP_TEXT.noItems });
    }

    // ---- 2. matching + completeness -----------------------------------------------------------------------------
    run.emit({ type: 'progress', stage: 'analyze', message: GAP_TEXT.progressAnalyze });
    const existing = await deps.store.loadBranchItems(run.branch.id);
    const outcome =
      entries.length > 0
        ? await deps.retrieval.match(
            entries.map((e) => e.normalized),
            run.cuisine.id,
            run.graph,
            { useVector: false },
          )
        : undefined;
    const templateIds = [...new Set([...(outcome?.hits.values() ?? [])].map((h) => h.templateId))];
    const templates = new Map((await getTemplates(deps.db, templateIds)).map((t) => [t.id, t]));

    const items: GapItemDto[] = [];
    const questionInputs: QuestionItemInput[] = [];
    for (const entry of entries) {
      const hit = outcome?.hits.get(entry.normalized);
      const template = hit ? templates.get(hit.templateId) : undefined;
      const assessed = assessCompleteness(entry.flags, expectationsFor(template?.payload));
      const item: GapItemDto = {
        name: entry.name,
        normalized: entry.normalized,
        flags: entry.flags,
        completeness: assessed.score,
        status: assessed.status,
        missing: assessed.missing,
        matchedTemplateId: template?.id ?? null,
        templateName: template?.canonicalName ?? null,
        origin: template ? (template.source === 'seed' ? 'seed' : 'db') : null,
        sectionText: entry.sectionText,
        seenIn: entry.seenIn,
      };
      items.push(item);
      questionInputs.push({ item, template: template?.payload, importance: template?.importance ?? 0 });
    }

    // ---- 3. counts ----------------------------------------------------------------------------------------------
    const menu = new MenuIndex();
    const menuNames: string[] = [];
    let current = 0;
    for (const row of existing) {
      if (row.status === 'missing') continue;
      if (menu.add(row.normalizedName, row.matchedItemId)) {
        current += 1;
        menuNames.push(row.rawName);
      }
    }
    for (const item of items) {
      if (menu.add(item.normalized, item.matchedTemplateId)) {
        current += 1;
        menuNames.push(item.name);
      }
    }
    const target = run.branch.targetItemCount ?? Math.max(MIN_BRANCH_ITEMS, run.cuisine.minItemCount);
    const counts: CountsDto = {
      current,
      target,
      missing: Math.max(0, target - current),
      fromScreenshots: items.length,
      cuisineMin: run.cuisine.minItemCount,
      targetOverridden: run.branch.targetItemCount !== null,
    };

    // ---- 4. DB recommendations + checklist ----------------------------------------------------------------------
    const wanted = wantedRecommendations(counts.missing);
    const dbRecs = await dbRecommendations(deps.db, { cuisineId: run.cuisine.id, graph: run.graph, menu, limit: wanted });
    const plan = buildQuestions({
      items: questionInputs,
      recommendations: dbRecs,
      needed: counts.missing,
      cuisine: cuisineQuestions(
        run.cuisine.slug,
        (await this.cuisineTemplates(run.cuisine.id)).map((t) => t.payload),
      ),
    });
    const questions = [...plan.questions];

    run.emit({ type: 'counts', counts });
    run.emit({ type: 'questions', items: plan.questions });
    run.emit({ type: 'items', items });
    run.emit({ type: 'recommendations', source: 'db', items: dbRecs.map(toDto) });

    // ---- 5. AI recommendations (only for what the DB could not fill) ----------------------------------------------
    let aiRecs: RecommendationCandidate[] = [];
    if (dbRecs.length < wanted && !run.signal.aborted) {
      run.emit({ type: 'progress', stage: 'recommend', message: GAP_TEXT.progressRecommend });
      const result = await aiRecommendations(
        {
          router: deps.router,
          prompts: deps.prompts,
          cache: deps.cache,
          ttlSeconds: deps.cacheTtlSeconds,
          retrieval: deps.retrieval,
        },
        {
          cuisine: { id: run.cuisine.id, name: run.cuisine.name },
          graph: run.graph,
          menu,
          menuNames,
          already: dbRecs,
          target,
          current,
          notes: run.extraNotes,
          limit: wanted - dbRecs.length,
        },
        ctx,
      );
      noteAttempts(result.attempts);
      if (result.provider) provider = result.provider;
      if (result.model) model = result.model;
      if (result.error) {
        const kind = result.error.kind;
        if (AI_OFF.has(kind)) {
          if (!aiOff) run.emit({ type: 'warning', code: 'ai_unavailable', message: GAP_TEXT.aiUnavailable });
        } else if (kind !== 'aborted') {
          run.emit({ type: 'warning', code: 'ai_recommendations_failed', message: GAP_TEXT.aiRecommendationsFailed });
        }
      }
      aiRecs = result.items;
      if (aiRecs.length > 0) {
        run.emit({ type: 'recommendations', source: 'ai', items: aiRecs.map(toDto) });
        const keys = new Set(questions.map((q) => q.key));
        const appended = aiRecs
          .slice(0, plan.reservedForAi)
          .map(missingItemQuestion)
          .filter((q) => !keys.has(q.key));
        if (appended.length > 0) {
          questions.push(...appended);
          run.emit({ type: 'questions_append', items: appended });
        }
      }
    }

    // ---- 6. persist ---------------------------------------------------------------------------------------------
    const allFailed = run.images.length > 0 && failedImages === run.images.length;
    const status: GapResultDto['status'] = run.signal.aborted
      ? 'cancelled'
      : allFailed
        ? 'failed'
        : failedImages > 0
          ? 'partial'
          : 'completed';
    const stats: GapStats = {
      llmCalls: budget.calls,
      latencyMs: Date.now() - started,
      screenshots: run.images.length,
      extracted,
      unique: entries.length,
      cacheHit: budget.calls === 0 && failedImages === 0,
    };
    const recommendations = [...dbRecs, ...aiRecs];
    if (status === 'completed' || status === 'partial') {
      const stored: StoredGap = { counts, items, recommendations: recommendations.map(toDto), questions, stats };
      await deps.store.persist({
        runId: run.runId,
        branchId: run.branch.id,
        imageHashes: run.images.map((i) => i.sha256),
        stored,
        items,
        recommendations,
      });
    }
    return {
      status,
      stats,
      tokensIn: budget.inputTokens,
      tokensOut: budget.outputTokens,
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
    };
  }
}
