import { RequestBudget } from '../../ai/budget.js';
import type { ProviderErrorKind } from '../../ai/errors.js';
import type { PromptRepository } from '../../ai/prompt-repository.js';
import type { AiRouter, AttemptRecord, CallContext } from '../../ai/router.js';
import type { ImageInput } from '../../ai/types.js';
import type { Cache } from '../../cache/cache.js';
import type { Database } from '../../db/client.js';
import { cleanItemName } from '../../lib/clean-name.js';
import { mapWithConcurrency } from '../../lib/concurrency.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import type { VisionExtractor } from '../extraction/vision-extractor.js';
import type { CuisineGraph } from '../retrieval/cuisine-graph.js';
import type { NearMiss, RetrievalHit, RetrievalService } from '../retrieval/retrieval.service.js';
import { getTemplates, incrementUsage } from '../templates/template-store.js';
import { CANONICAL_MIN_CONFIDENCE, CANONICAL_TRIGGER_SCORE, canonicalize } from './canonicalize.js';
import { type EnrichmentService, type EnrichOutcome, reviewReasonFor } from './enrichment.js';
import { reviewPlaceholder } from './sanitize.js';
import {
  type CardDto,
  type ExtractionItem,
  type ParsedName,
  type PendingWork,
  type RunDto,
  type RunStats,
  type SuggestEvent,
  extractionItemSchema,
  extractionSchema,
} from './schemas.js';
import type { SuggestionStore } from './store.js';

/**
 * /suggest pipeline:
 *  Stage 0  hashes / names from the prompt (no LLM)
 *  Stage A  vision extraction, one image per call, cached per image
 *  Stage B  retrieval (exact → alias → trigram → vector), approved templates only → cards stream immediately
 *  Stage B′ cheap canonicalization for near misses
 *  Stage C  enrichment of the rest in batches [3, 10, 10, …] (2 in flight)
 *  Stage D  validation + one repair + needs_review, drafts written as approved=false
 *  Stage E  every card is streamed as soon as it exists
 */

export interface PipelineRun {
  runId: string;
  userId: string;
  cuisine: { id: string; name: string };
  graph: CuisineGraph;
  deepMode: boolean;
  promptNames: ParsedName[];
  images: ImageInput[];
  sortOrderStart: number;
  signal: AbortSignal;
  emit: (event: SuggestEvent) => void;
}

export interface PipelineResult {
  status: RunDto['status'];
  stats: RunStats;
  pendingWork: PendingWork | null;
  provider?: string;
  model?: string;
  stopReason?: ProviderErrorKind;
}

export interface PipelineDeps {
  db: Database;
  router: AiRouter;
  prompts: PromptRepository;
  retrieval: RetrievalService;
  extractor: VisionExtractor;
  enrichment: EnrichmentService;
  store: SuggestionStore;
  cache: Cache;
  cacheTtlSeconds: number;
  budget: { maxLlmCalls: number; maxInputTokens: number };
}

const FIRST_BATCH = 3;
const BATCH_SIZE = 10;
const MIN_EXTRACT_CONFIDENCE = 0.25;

export function makeBatches<T>(items: readonly T[], first = FIRST_BATCH, size = BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  if (items.length === 0) return batches;
  batches.push(items.slice(0, first));
  for (let i = first; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

export function extractionToParsed(items: readonly ExtractionItem[], imageSha: string): ParsedName[] {
  const out: ParsedName[] = [];
  for (const item of items) {
    if (item.confidence < MIN_EXTRACT_CONFIDENCE) continue;
    const rawName = cleanItemName(item.rawName);
    const normalized = normalizeTr(rawName);
    if (rawName.length < 2 || normalized === '') continue;
    out.push({
      rawName,
      normalized,
      sectionText: item.sectionText,
      priceText: item.priceText,
      source: 'image',
      imageSha,
    });
  }
  return out;
}

const UNAVAILABLE_MESSAGES: Partial<Record<ProviderErrorKind, string>> = {
  local_only: 'Yerel mod açık: yalnızca veritabanı ve önbellekten cevap veriliyor.',
  quota_exceeded: 'Günlük AI kotası doldu: yalnızca veritabanı ve önbellekten cevap veriliyor.',
  not_configured: 'AI anahtarı tanımlı değil: yalnızca veritabanı ve önbellekten cevap veriliyor.',
};

export class SuggestPipeline {
  constructor(private readonly deps: PipelineDeps) {}

  async run(run: PipelineRun): Promise<PipelineResult> {
    const { deps } = this;
    const started = Date.now();
    const budget = new RequestBudget(deps.budget.maxLlmCalls, deps.budget.maxInputTokens);
    const ctx: CallContext = { userId: run.userId, runId: run.runId, budget, signal: run.signal };
    const counters = { dbHits: 0, aiItems: 0, reviewItems: 0, embedCalls: 0 };
    const seen = new Set<string>();
    const toEnrich: ParsedName[] = [];
    const nearMisses = new Map<string, NearMiss[]>();
    const servedTemplateIds: string[] = [];
    const pendingNames: ParsedName[] = [];
    const pendingImages: string[] = [];
    let sortOrder = run.sortOrderStart;
    let lastProvider: string | undefined;
    let lastModel: string | undefined;
    let stopReason: ProviderErrorKind | undefined;

    const noteAttempts = (attempts: readonly AttemptRecord[]) => {
      const failed = attempts.filter((a) => a.outcome !== 'ok' && a.outcome !== 'skipped');
      const ok = attempts.some((a) => a.outcome === 'ok');
      if (ok && failed.length > 0) {
        run.emit({
          type: 'warning',
          code: 'provider_fallback',
          message: `Birincil sağlayıcı yanıt vermedi (${failed.map((f) => `${f.provider}: ${f.outcome}`).join(', ')}); yedek kullanıldı.`,
        });
      }
    };

    const emitCard = async (
      parsed: ParsedName,
      card: Omit<Parameters<SuggestionStore['insertCard']>[1], 'sortOrder' | 'rawName' | 'normalizedName'>,
    ): Promise<CardDto> => {
      const dto = await deps.store.insertCard(run.runId, {
        ...card,
        rawName: parsed.rawName,
        normalizedName: parsed.normalized,
        sortOrder: sortOrder++,
      });
      run.emit({ type: 'item', card: dto });
      return dto;
    };

    const emitHits = async (entries: readonly (readonly [ParsedName, RetrievalHit])[]) => {
      if (entries.length === 0) return;
      const templates = new Map(
        (await getTemplates(deps.db, [...new Set(entries.map(([, h]) => h.templateId))])).map((t) => [t.id, t]),
      );
      for (const [parsed, hit] of entries) {
        const template = templates.get(hit.templateId);
        if (!template) {
          toEnrich.push(parsed);
          continue;
        }
        counters.dbHits += 1;
        servedTemplateIds.push(template.id);
        await emitCard(parsed, {
          origin: template.source === 'seed' ? 'seed' : 'db',
          matchedTemplateId: template.id,
          stored: {
            template: template.payload,
            needsReview: false,
            reviewReason: null,
            confidence: null,
            matchType: hit.matchType,
            score: hit.score,
            sectionText: parsed.sectionText,
            draftTemplateId: null,
            extraction: parsed.source === 'image' ? { priceText: parsed.priceText, imageSha: parsed.imageSha } : null,
          },
        });
      }
    };

    const availability = await deps.router.availability(run.userId);
    const aiUsable = availability.ok;
    if (!availability.ok) {
      stopReason = availability.error.kind;
      run.emit({
        type: 'warning',
        code: availability.error.kind,
        message: UNAVAILABLE_MESSAGES[availability.error.kind] ?? availability.error.message,
      });
    }

    const handleNames = async (names: readonly ParsedName[]) => {
      const fresh: ParsedName[] = [];
      for (const name of names) {
        if (seen.has(name.normalized)) continue;
        seen.add(name.normalized);
        fresh.push(name);
      }
      if (fresh.length === 0) return;
      run.emit({ type: 'progress', stage: 'retrieve', message: `${fresh.length} ürün veritabanında aranıyor` });
      const outcome = await deps.retrieval.match(
        fresh.map((n) => n.normalized),
        run.cuisine.id,
        run.graph,
        { useVector: aiUsable, ctx },
      );
      counters.embedCalls += outcome.embedCalls;
      const hits: (readonly [ParsedName, RetrievalHit])[] = [];
      for (const name of fresh) {
        const hit = outcome.hits.get(name.normalized);
        if (hit) hits.push([name, hit]);
        else {
          toEnrich.push(name);
          const misses = outcome.nearMisses.get(name.normalized);
          if (misses) nearMisses.set(name.normalized, misses);
        }
      }
      await emitHits(hits);
    };

    // ---- Stage 0/B for prompt names --------------------------------------------------------------------
    if (run.promptNames.length > 0) await handleNames(run.promptNames);

    // ---- Stage A (+B per image) -------------------------------------------------------------------------
    if (run.images.length > 0) {
      if (!aiUsable) {
        run.emit({
          type: 'warning',
          code: 'images_skipped',
          message: 'Fotoğraflar okunamadı (AI kapalı). Ürün adlarını yazarak dene.',
        });
      } else {
        let done = 0;
        run.emit({ type: 'progress', stage: 'extract', message: 'Menü fotoğrafları okunuyor', done, total: run.images.length });
        await mapWithConcurrency(run.images, 2, async (image) => {
          if (run.signal.aborted) {
            pendingImages.push(image.sha256);
            return;
          }
          const result = await deps.extractor.extract(
            image,
            {
              task: 'vision.menu_extract',
              systemKey: 'extract.menu.system',
              userKey: 'extract.menu.user',
              schema: extractionSchema,
              itemSchema: extractionItemSchema,
              schemaName: 'menu_extraction',
              cacheNamespace: 'x',
              vars: { cuisine: run.cuisine.name },
            },
            ctx,
          );
          noteAttempts(result.attempts);
          done += 1;
          if (!result.ok) {
            const kind = result.error.kind;
            if (kind === 'budget_exceeded' || kind === 'unavailable' || kind === 'timeout' || kind === 'rate_limited' || kind === 'aborted') {
              pendingImages.push(image.sha256);
              stopReason ??= kind;
            }
            if (kind !== 'budget_exceeded' && kind !== 'aborted') {
              run.emit({ type: 'warning', code: 'extract_failed', message: `Bir fotoğraf okunamadı (${kind}).` });
            }
            return;
          }
          if (result.provider) lastProvider = result.provider;
          if (result.model) lastModel = result.model;
          const names = extractionToParsed(result.items, image.sha256);
          run.emit({ type: 'extracted', names: names.map((n) => n.rawName) });
          run.emit({ type: 'progress', stage: 'extract', message: 'Menü fotoğrafları okunuyor', done, total: run.images.length });
          await handleNames(names);
        });
      }
    }

    // ---- Stage B′ canonicalize near misses ---------------------------------------------------------------
    if (aiUsable && !run.signal.aborted && toEnrich.length > 0 && nearMisses.size > 0 && budget.remainingCalls > 1) {
      const inputs = toEnrich
        .filter((n) => (nearMisses.get(n.normalized)?.[0]?.score ?? 0) >= CANONICAL_TRIGGER_SCORE)
        .map((n) => ({ name: n.normalized, rawName: n.rawName }));
      if (inputs.length > 0) {
        run.emit({ type: 'progress', stage: 'canonicalize', message: 'Benzer şablonlar eşleştiriliyor' });
        const { decisions, attempts } = await canonicalize(
          { router: deps.router, prompts: deps.prompts, cache: deps.cache, ttlSeconds: deps.cacheTtlSeconds },
          run.cuisine.id,
          inputs,
          nearMisses,
          ctx,
        );
        noteAttempts(attempts);
        const mapped: (readonly [ParsedName, RetrievalHit])[] = [];
        const templatesById = new Map(
          [...nearMisses.values()].flat().map((m) => [m.templateId, m] as const),
        );
        for (const parsed of [...toEnrich]) {
          const decision = decisions.get(parsed.normalized);
          if (!decision || decision.confidence < CANONICAL_MIN_CONFIDENCE) continue;
          if (!decision.isProduct) {
            toEnrich.splice(toEnrich.indexOf(parsed), 1);
            run.emit({ type: 'warning', code: 'not_a_product', message: `"${parsed.rawName}" ürün değil gibi görünüyor, atlandı.` });
            continue;
          }
          const miss = decision.templateId ? templatesById.get(decision.templateId) : undefined;
          if (!miss) continue;
          toEnrich.splice(toEnrich.indexOf(parsed), 1);
          mapped.push([
            parsed,
            {
              templateId: miss.templateId,
              canonicalName: miss.canonicalName,
              cuisineId: miss.cuisineId,
              source: 'user',
              matchType: 'canonical',
              score: Math.round(decision.confidence * 1000) / 1000,
            },
          ]);
        }
        await emitHits(mapped);
      }
    }

    // ---- Stage C/D enrichment ------------------------------------------------------------------------
    if (toEnrich.length > 0 && !run.signal.aborted) {
      if (!aiUsable) {
        for (const parsed of toEnrich) {
          counters.reviewItems += 1;
          await this.emitOutcome(run, emitCard, {
            parsed,
            kind: 'review',
            payload: reviewPlaceholder(parsed.rawName),
            confidence: null,
            reviewReason: reviewReasonFor(stopReason),
            fromCache: false,
          });
        }
      } else {
        const batches = makeBatches(toEnrich);
        const examples = await deps.enrichment.buildExamples(
          run.cuisine.id,
          run.graph,
          toEnrich.map((n) => n.normalized),
        );
        let enriched = 0;
        run.emit({ type: 'progress', stage: 'enrich', message: 'Kartlar hazırlanıyor', done: 0, total: toEnrich.length });
        await mapWithConcurrency(batches, 2, async (batch) => {
          if (run.signal.aborted || stopReason === 'budget_exceeded' || stopReason === 'unavailable') {
            pendingNames.push(...batch);
            return;
          }
          const result = await deps.enrichment.enrichBatch(batch, run.cuisine, examples, { deepMode: run.deepMode, ctx });
          noteAttempts(result.attempts);
          if (result.provider) lastProvider = result.provider;
          if (result.model) lastModel = result.model;
          if (result.stopReason) stopReason ??= result.stopReason;
          for (const outcome of result.outcomes) {
            if (outcome.kind === 'pending') {
              pendingNames.push(outcome.parsed);
              continue;
            }
            if (outcome.kind === 'ai') counters.aiItems += 1;
            else counters.reviewItems += 1;
            await this.emitOutcome(run, emitCard, outcome);
          }
          enriched += batch.length;
          run.emit({ type: 'progress', stage: 'enrich', message: 'Kartlar hazırlanıyor', done: enriched, total: toEnrich.length });
        });
      }
    }

    // ---- finalize ----------------------------------------------------------------------------------------
    await incrementUsage(deps.db, servedTemplateIds);
    const pendingWork = pendingNames.length > 0 || pendingImages.length > 0 ? { names: pendingNames, imageHashes: pendingImages } : null;
    if (pendingWork && !run.signal.aborted) {
      run.emit({
        type: 'budget_exhausted',
        pendingItems: pendingNames.length,
        pendingImageHashes: pendingImages,
        message:
          stopReason === 'budget_exceeded'
            ? 'İstek bütçesi doldu. Kalanlar için "Devam et".'
            : 'AI sağlayıcılarına şu an ulaşılamıyor. Kalanlar için sonra "Devam et".',
      });
    }
    const stats: RunStats = {
      llmCalls: budget.calls,
      embedCalls: counters.embedCalls,
      tokensIn: budget.inputTokens,
      tokensOut: budget.outputTokens,
      cacheHit: budget.calls === 0 && counters.embedCalls === 0,
      latencyMs: Date.now() - started,
      dbHits: counters.dbHits,
      aiItems: counters.aiItems,
      reviewItems: counters.reviewItems,
      pendingItems: pendingNames.length,
      pendingImages: pendingImages.length,
    };
    const status: RunDto['status'] = run.signal.aborted ? 'cancelled' : pendingWork ? 'partial' : 'completed';
    return {
      status,
      stats,
      pendingWork,
      ...(lastProvider ? { provider: lastProvider } : {}),
      ...(lastModel ? { model: lastModel } : {}),
      ...(stopReason ? { stopReason } : {}),
    };
  }

  private async emitOutcome(
    run: PipelineRun,
    emitCard: (parsed: ParsedName, card: Omit<Parameters<SuggestionStore['insertCard']>[1], 'sortOrder' | 'rawName' | 'normalizedName'>) => Promise<CardDto>,
    outcome: EnrichOutcome,
  ): Promise<void> {
    const draftTemplateId =
      outcome.kind === 'ai' ? await this.deps.store.upsertDraft(this.deps.db, run.cuisine.id, outcome.payload, run.userId) : null;
    await emitCard(outcome.parsed, {
      origin: outcome.kind === 'ai' ? 'ai' : 'review',
      matchedTemplateId: null,
      stored: {
        template: outcome.payload,
        needsReview: outcome.kind !== 'ai',
        reviewReason: outcome.reviewReason,
        confidence: outcome.confidence,
        matchType: null,
        score: null,
        sectionText: outcome.parsed.sectionText,
        draftTemplateId,
        extraction:
          outcome.parsed.source === 'image' ? { priceText: outcome.parsed.priceText, imageSha: outcome.parsed.imageSha } : null,
      },
    });
  }
}
