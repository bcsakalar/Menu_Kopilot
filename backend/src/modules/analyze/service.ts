import { eq } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import type { FastifyBaseLogger } from 'fastify';
import { runAnalysis, type AnalyzePipelineDeps } from '../../agents/pipeline.js';
import { loadCategoryIndex } from '../../agents/gap-analyst.js';
import { loadFeedbackIndex, loadProductTypeIndex } from '../../agents/knowledge.js';
import type { RunFocus } from '../../agents/plan.js';
import { AgentTracer } from '../../agents/tracer.js';
import type { ImageInput } from '../../ai/types.js';
import type { Database, Executor } from '../../db/client.js';
import { menuItems, suggestionItems } from '../../db/schema/index.js';
import type { ProductTypeIndex } from '../../domain/product-type.js';
import { templatePayloadSchema, type TemplatePayload } from '../../domain/template.js';
import type { JobQueue } from '../../jobs/queue.js';
import { AppError, isUniqueViolation, notFound } from '../../lib/errors.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import { sameProductName } from '../../lib/same-product.js';
import { CuisineGraph } from '../retrieval/cuisine-graph.js';
import { addAliases, findApprovedByName, getTemplate, incrementUsage, insertTemplate, replaceTemplateContent } from '../templates/template-store.js';
import type { RunRegistry } from '../../lib/run-registry.js';
import type { Slots } from '../../lib/slots.js';
import { diffFeedback, forgetCardFeedback, recordFeedback } from './feedback.js';
import type { AnalyzeEvent, AnalyzeFields, AnalyzeResult, CardDto, ClassificationDto, HistoryQuery, HistoryResult } from './schemas.js';
import type { AnalyzeStore } from './store.js';

/**
 * Orchestrates analysis runs: starts one, streams its events, answers snapshots and handles accept/skip.
 * The pipeline itself lives in `src/agents/pipeline.ts`; this class owns everything around it (persistence,
 * cancellation, the SSE registry and the template pool writes).
 */

export interface AnalyzeServiceDeps {
  db: Database;
  store: AnalyzeStore;
  registry: RunRegistry<AnalyzeEvent>;
  /** How many analyses run at once; the rest wait their turn (D-214). */
  slots: Slots;
  queue: JobQueue;
  pipelineDeps: Omit<AnalyzePipelineDeps, 'tracer' | 'categories' | 'productTypes' | 'feedback'>;
  log: FastifyBaseLogger;
}

export interface StartedRun {
  runId: string;
  done: Promise<void>;
}

/** Comma / newline separated product names the user typed or dictated. */
export function parseMenuText(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/[,\n;]+/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .slice(0, 120);
}

/** How long one product type index is reused; a seed run while the site is up shows within this time. */
export const PRODUCT_TYPES_TTL_MS = 60_000;

export class AnalyzeService {
  private typeIndex: { at: number; index: Promise<ProductTypeIndex> } | undefined;

  constructor(private readonly deps: AnalyzeServiceDeps) {}

  private productTypes(): Promise<ProductTypeIndex> {
    const now = Date.now();
    if (!this.typeIndex || now - this.typeIndex.at >= PRODUCT_TYPES_TTL_MS) {
      const index = loadProductTypeIndex(this.deps.db);
      this.typeIndex = { at: now, index };
      index.catch(() => {
        if (this.typeIndex?.index === index) this.typeIndex = undefined;
      });
    }
    return this.typeIndex.index;
  }

  async start(
    userId: string,
    fields: AnalyzeFields,
    images: ImageInput[],
    chat: { focus?: RunFocus | undefined; remove?: readonly string[] | undefined; seeds?: readonly string[] | undefined } = {},
  ): Promise<StartedRun> {
    const { db, store, registry } = this.deps;
    const typedNames = parseMenuText(fields.menuText);
    // A re-run (another cuisine picked on the result screen) starts from the product list the earlier run read.
    const earlierItems = fields.fromRunId ? await store.extractedItems(userId, fields.fromRunId) : undefined;
    const removed = chat.remove?.map(normalizeTr) ?? [];
    const reuseItems = earlierItems?.filter((item) => !removed.some((name) => sameProductName(name, item.normalized)));
    if (fields.fromRunId && !reuseItems) {
      throw new AppError('CONFLICT', 'Önceki analizin ürün listesi yok; fotoğrafları veya ürün adlarını yeniden gönder');
    }
    // A cuisine alone is a start too: the rep named it before the menu, and its essentials come first.
    if (images.length === 0 && typedNames.length === 0 && !reuseItems && !fields.cuisineId) {
      throw new AppError('VALIDATION_ERROR', 'En az bir fotoğraf ekle veya ürün adlarını yaz');
    }

    if (this.deps.slots.full) throw new AppError('SERVICE_UNAVAILABLE', 'Şu an çok yoğun; bir dakika sonra tekrar dene');

    const graph = await CuisineGraph.load(db);
    const selectedCuisine = fields.cuisineId ? graph.get(fields.cuisineId) : undefined;
    if (fields.cuisineId && !selectedCuisine) throw notFound('Mutfak türü');
    const cuisineOptions = graph.all.map((c) => ({ id: c.id, slug: c.slug, name: c.name }));
    if (cuisineOptions.length === 0) throw new AppError('CONFLICT', 'Mutfak türü tanımlı değil');

    const runId = await store.createRun({
      userId,
      cuisineId: selectedCuisine?.id ?? null,
      promptText: fields.menuText ?? null,
      imageHashes: images.map((i) => i.sha256),
      analysisMode: fields.mode,
    });
    const controller = registry.create(runId);
    const emit = (event: AnalyzeEvent): void => registry.emit(runId, event);
    emit({ type: 'run', runId });

    const categories = await loadCategoryIndex(db);
    // What the team taught it, read fresh: a day of feedback counts on the next run. Product types change only through
    // a seed, so one index (and what it has matched) serves a minute of analyses.
    const productTypes = await this.productTypes();
    const feedback = await loadFeedbackIndex(db);
    const tracer = new AgentTracer({
      db,
      runId,
      emit: (step) => emit({ type: 'trace', step: { ...step, input: step.input, output: step.output } }),
      onError: (err) => this.deps.log.warn({ err }, 'agent_steps write failed'),
      storePayloads: fields.debug === true,
    });

    // Kept from the stream so a reopened analysis (phone locked mid-call, app restarted) shows the same notices and
    // the same cuisine verdict as the live one did.
    const warnings: { code: string; message: string }[] = [];
    let classification: ClassificationDto | null = null;
    let waited = false;
    const queued = (position: number): void => {
      waited = true;
      emit({ type: 'progress', agent: 'queue', message: position === 1 ? 'Yoğunluk var: sıradaki analiz senin' : `Yoğunluk var: sıradasın, önünde ${position - 1} analiz var` });
    };
    const done = this.deps.slots
      .run(() => {
        if (waited) emit({ type: 'progress', agent: 'queue', message: 'Sıra geldi, menüye bakıyorum' });
        return runAnalysis(
          {
            ...this.deps.pipelineDeps,
            tracer,
            categories,
            productTypes,
            feedback,
            onAgentError: (agent, err) => this.deps.log.error({ err, runId, agent }, 'agent failed, run continues'),
          },
          {
            runId,
            userId,
            images,
            typedNames,
            reuseItems: reuseItems ?? undefined,
            notes: fields.notes,
            mode: fields.mode,
            focus: chat.focus,
            seeds: chat.seeds,
            selectedCuisine,
            cuisineOptions,
            graph,
            signal: controller.signal,
            emit: (event) => {
              if (event.type === 'warning') warnings.push({ code: event.code, message: event.message });
              if (event.type === 'classification') classification = event.classification;
              emit(event);
            },
            saveCards: (cards) => store.insertCards(runId, cards),
          },
        );
      }, { signal: controller.signal, onWait: queued })
      .then(async (result) => {
        await store.finishRun(runId, {
          status: result.status,
          stats: result.stats,
          counts: result.counts,
          classification,
          warnings,
          menu: result.menu,
          extracted: result.extracted,
          ...(result.provider ? { provider: result.provider } : {}),
          ...(result.model ? { model: result.model } : {}),
        });
        emit({ type: 'done', status: result.status, stats: result.stats });
      })
      .catch(async (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.deps.log.error({ err, runId }, 'analysis failed');
        await store.failRun(runId, message).catch(() => undefined);
        emit({ type: 'error', code: 'PIPELINE_FAILED', message: 'Analiz tamamlanamadı' });
      });

    return { runId, done };
  }

  subscribe(runId: string, listener: (event: AnalyzeEvent) => void): (() => void) | undefined {
    return this.deps.registry.subscribe(runId, listener);
  }

  hasLiveEvents(runId: string): boolean {
    return this.deps.registry.has(runId);
  }

  async snapshot(userId: string, runId: string): Promise<AnalyzeResult> {
    const result = await this.deps.store.snapshot(userId, runId);
    if (!result) throw notFound('Analiz');
    return result;
  }

  /** The user's analyses, newest first, filtered by date, cuisine, mode or a product name (D-193). */
  async history(userId: string, query: HistoryQuery): Promise<HistoryResult> {
    return this.deps.store.history(userId, query);
  }

  async latest(userId: string): Promise<AnalyzeResult | null> {
    const runId = await this.deps.store.latestRunId(userId);
    return runId === null ? null : this.deps.store.snapshot(userId, runId);
  }

  async trace(userId: string, runId: string) {
    const trace = await this.deps.store.trace(userId, runId);
    if (!trace) throw notFound('Analiz');
    const totals = trace.steps.reduce(
      (sum, s) => ({
        durationMs: sum.durationMs + s.durationMs,
        tokensIn: sum.tokensIn + s.tokensIn,
        tokensOut: sum.tokensOut + s.tokensOut,
        llmCalls: sum.llmCalls + s.llmCalls,
      }),
      { durationMs: 0, tokensIn: 0, tokensOut: 0, llmCalls: 0 },
    );
    return { runId, steps: trace.steps, totals };
  }

  async cancel(userId: string, runId: string): Promise<{ cancelled: boolean }> {
    const result = await this.deps.store.snapshot(userId, runId);
    if (!result) throw notFound('Analiz');
    return { cancelled: this.deps.registry.cancel(runId) };
  }

  /**
   * Accepts a card into the template pool.
   *
   * Only `new_product` cards create or replace a template — an `option` card enriches the template of the product
   * it targets, and a `fix` card is a note for the call, not a pool write. The payload, when sent, is the card as
   * the user kept it (suggestions tapped away are missing from it); what was kept and what was removed is also
   * recorded for the learning loop (D-180).
   */
  async accept(userId: string, cardId: string, body: { payload?: TemplatePayload | undefined }): Promise<CardDto> {
    const { db, store } = this.deps;
    const existing = await store.setAnswer(userId, cardId, 'yes', body.payload);
    if (!existing) throw notFound('Kart');

    // A fix card is a note for the call ("adı sor"), not something to write into the pool.
    if (existing.section === 'fix') return existing;

    const run = await store.snapshot(userId, existing.runId);
    const cuisineId = run?.counts?.cuisineId;
    if (!cuisineId) throw new AppError('CONFLICT', 'Mutfak türü bilinmiyor');

    let templateId: string | null;
    try {
      templateId = await db.transaction(async (tx) => {
        const id =
          existing.section === 'option'
            ? await this.mergeOptions(tx, existing, body.payload, cuisineId, userId)
            : await this.saveProduct(tx, existing, body.payload, cuisineId, userId);
        const kept = body.payload ?? keptAsSuggested(existing);
        await forgetCardFeedback(tx, cardId, userId);
        await recordFeedback(tx, {
          userId,
          card: existing,
          cuisineId,
          rows: [
            ...(existing.section === 'new_product' ? [{ kind: 'product' as const, value: existing.name, action: 'accepted' as const }] : []),
            ...diffFeedback(existing, kept),
          ],
        });
        return id;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', 'Bu mutfakta aynı isimde onaylı başka bir şablon var');
      throw err;
    }
    if (templateId === null) return existing;

    // What the team takes, again and again, climbs in the pool's own ranking (D-194).
    await incrementUsage(db, [templateId]);
    await db.update(suggestionItems).set({ matchedItemId: templateId }).where(eq(suggestionItems.id, cardId));
    await this.deps.queue.enqueueEmbedding([templateId]);
    return { ...existing, matchedTemplateId: templateId };
  }

  async skip(userId: string, cardId: string): Promise<CardDto> {
    const card = await this.deps.store.setAnswer(userId, cardId, 'no');
    if (!card) throw notFound('Kart');
    await forgetCardFeedback(this.deps.db, cardId, userId);
    // A new product the seller turned down is a signal about the product; a "Hayır" on a menu product's card means
    // the seller does not want to change that product now — not a verdict on each suggestion — so it teaches nothing.
    if (card.section === 'new_product') {
      const cuisineId = await this.deps.store.runCuisineId(card.runId);
      await recordFeedback(this.deps.db, { userId, card, cuisineId, rows: [{ kind: 'product', value: card.name, action: 'removed' }] });
    }
    return card;
  }

  /**
   * "Düşünecek" (D-196): the seller will think about it. Nothing is learned from it and nothing goes into the pool;
   * an earlier answer on the same card stops counting.
   */
  async later(userId: string, cardId: string): Promise<CardDto> {
    const card = await this.deps.store.setAnswer(userId, cardId, 'later');
    if (!card) throw notFound('Kart');
    await forgetCardFeedback(this.deps.db, cardId, userId);
    return card;
  }

  /**
   * A new product goes into the pool. A template the card already points at is only REWRITTEN when the user edited
   * the card; accepting it untouched just approves it (a seed becomes the user's own, so a later re-seed keeps it).
   * Overwriting an existing template with a thinner copy is exactly the data loss this method exists to prevent.
   */
  private async saveProduct(
    tx: Executor,
    card: CardDto,
    edited: TemplatePayload | undefined,
    cuisineId: string,
    userId: string,
  ): Promise<string | null> {
    const source = edited ?? card.payload;
    if (!source) return null;
    const payload = templatePayloadSchema.parse(source);

    const pointed = card.matchedTemplateId ? await getTemplate(tx, card.matchedTemplateId) : undefined;
    const byName = pointed ? undefined : await findApprovedByName(tx, cuisineId, normalizeTr(payload.name));
    const target = pointed ?? (byName ? await getTemplate(tx, byName.id) : undefined);
    let templateId: string;
    if (target) {
      // The card is the template after grounding — a 6-8 word description, groups that fit the product, completed
      // ingredients — so accepting it, edited or not, writes that improved version.
      if (!isDeepStrictEqual(target.payload, payload)) {
        await replaceTemplateContent(tx, target.id, payload, { source: 'user' });
      } else if (target.source === 'seed') {
        await replaceTemplateContent(tx, target.id, target.payload, { source: 'user' });
      }
      templateId = target.id;
    } else {
      templateId = await insertTemplate(tx, {
        cuisineId,
        payload,
        source: edited || card.source !== 'ai' ? 'user' : 'ai',
        approved: true,
        createdBy: userId,
      });
    }
    await addAliases(tx, templateId, [card.name, payload.name], (await getTemplate(tx, templateId))?.canonicalName);
    if (card.categoryKey) await tx.update(menuItems).set({ categoryKey: card.categoryKey }).where(eq(menuItems.id, templateId));
    return templateId;
  }

  /**
   * An option card adds to the template of a product the restaurant already sells: its groups replace groups of the
   * same name, removable/extra ingredients are unioned, and everything else on the template stays as it was. When
   * the pool does not know the product yet, it is created with just these options — so the next call about the
   * same restaurant finds it.
   */
  private async mergeOptions(
    tx: Executor,
    card: CardDto,
    edited: TemplatePayload | undefined,
    cuisineId: string,
    userId: string,
  ): Promise<string> {
    const name = card.targetName ?? card.name;
    const pointed = card.matchedTemplateId ? await getTemplate(tx, card.matchedTemplateId) : undefined;
    const approved = pointed ? undefined : await findApprovedByName(tx, cuisineId, normalizeTr(card.name));
    const template = pointed ?? (approved ? await getTemplate(tx, approved.id) : undefined);
    // What the user kept: the edited payload when the phone sent one, the card as suggested otherwise.
    const source = edited
      ? {
          optionGroups: edited.optionGroups,
          removableIngredients: edited.removableIngredients,
          extraIngredients: edited.extraIngredients.map((e) => e.name),
          description: edited.description,
        }
      : { ...card, description: card.shortDescription };

    let templateId: string;
    if (template) {
      const merged = templatePayloadSchema.parse(mergeOptionCard(template.payload, source));
      if (!isDeepStrictEqual(merged, template.payload) || template.source === 'seed') {
        await replaceTemplateContent(tx, template.id, merged, { source: 'user' });
      }
      templateId = template.id;
    } else {
      const payload = templatePayloadSchema.parse(
        mergeOptionCard(
          {
            name: card.name,
            description: '',
            servingNote: '',
            portionInfo: '',
            optionGroups: [],
            removableIngredients: [],
            extraIngredients: [],
            tags: [],
            allergenNotes: [],
            upsellSuggestion: '',
          },
          source,
        ),
      );
      templateId = await insertTemplate(tx, { cuisineId, payload, source: 'user', approved: true, createdBy: userId });
    }
    // The spelling on the panel ("Adana Kbp") becomes an alias, so it matches straight away next time.
    await addAliases(tx, templateId, [name, card.name], (await getTemplate(tx, templateId))?.canonicalName);
    return templateId;
  }
}

const MAX_GROUPS = 12;
const MAX_INGREDIENTS = 25;

/** The card as the pipeline suggested it, in payload form: what "accepted untouched" means for the feedback diff. */
function keptAsSuggested(card: CardDto): Pick<TemplatePayload, 'optionGroups' | 'removableIngredients' | 'extraIngredients' | 'description'> {
  if (card.payload) return card.payload;
  return {
    optionGroups: card.optionGroups.map((g) => ({ ...g, options: g.options.map((o) => ({ ...o, isDefault: false })) })),
    removableIngredients: card.removableIngredients,
    extraIngredients: card.extraIngredients.map((name) => ({ name, priceHint: 'ek ücretli' as const })),
    description: card.shortDescription,
  };
}

/**
 * Pure merge of an option card into a template payload; exported for the unit tests. A description the user kept
 * replaces the template's: it is the 6-8 word panel line they just approved.
 */
export function mergeOptionCard(
  base: TemplatePayload,
  card: Pick<CardDto, 'optionGroups' | 'removableIngredients' | 'extraIngredients'> & { description?: string | undefined },
): TemplatePayload {
  const incoming = card.optionGroups.map((group) => ({
    ...group,
    options: group.options.map((option) => ({ ...option, isDefault: false })),
  }));
  const incomingNames = new Set(incoming.map((g) => normalizeTr(g.name)));
  // At most one group may set the base price. If the card brings one, it replaces whichever the template had.
  const cardSetsBase = incoming.some((g) => g.options.some((o) => o.priceMode === 'sets_base'));
  const kept = base.optionGroups.filter(
    (g) => !incomingNames.has(normalizeTr(g.name)) && !(cardSetsBase && g.options.some((o) => o.priceMode === 'sets_base')),
  );

  const union = (current: readonly string[], added: readonly string[]): string[] => {
    const seen = new Set(current.map(normalizeTr));
    const out = [...current];
    for (const item of added) {
      if (seen.has(normalizeTr(item))) continue;
      seen.add(normalizeTr(item));
      out.push(item);
    }
    return out.slice(0, MAX_INGREDIENTS);
  };

  const extras = [...base.extraIngredients];
  const extraNames = new Set(extras.map((e) => normalizeTr(e.name)));
  for (const name of card.extraIngredients) {
    if (extraNames.has(normalizeTr(name))) continue;
    extraNames.add(normalizeTr(name));
    extras.push({ name, priceHint: 'ek ücretli' });
  }

  const description = card.description?.trim();
  return {
    ...base,
    ...(description ? { description } : {}),
    optionGroups: [...kept, ...incoming].slice(0, MAX_GROUPS),
    removableIngredients: union(base.removableIngredients, card.removableIngredients),
    extraIngredients: extras.slice(0, MAX_INGREDIENTS),
  };
}
