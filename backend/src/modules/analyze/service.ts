import { eq } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import type { FastifyBaseLogger } from 'fastify';
import { runAnalysis, type AnalyzePipelineDeps } from '../../agents/pipeline.js';
import { loadCategoryIndex } from '../../agents/gap-analyst.js';
import { AgentTracer } from '../../agents/tracer.js';
import type { ImageInput } from '../../ai/types.js';
import type { Database, Executor } from '../../db/client.js';
import { menuItems, suggestionItems } from '../../db/schema/index.js';
import { templatePayloadSchema, type TemplatePayload } from '../../domain/template.js';
import type { JobQueue } from '../../jobs/queue.js';
import { AppError, isUniqueViolation, notFound } from '../../lib/errors.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import { CuisineGraph } from '../retrieval/cuisine-graph.js';
import { addAliases, findApprovedByName, getTemplate, insertTemplate, replaceTemplateContent } from '../templates/template-store.js';
import type { RunRegistry } from '../../lib/run-registry.js';
import type { AnalyzeEvent, AnalyzeFields, AnalyzeResult, CardDto, ClassificationDto } from './schemas.js';
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
  queue: JobQueue;
  pipelineDeps: Omit<AnalyzePipelineDeps, 'tracer' | 'categories'>;
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

export class AnalyzeService {
  constructor(private readonly deps: AnalyzeServiceDeps) {}

  async start(userId: string, fields: AnalyzeFields, images: ImageInput[]): Promise<StartedRun> {
    const { db, store, registry } = this.deps;
    const typedNames = parseMenuText(fields.menuText);
    // A re-run (another cuisine picked on the result screen) starts from the product list the earlier run read.
    const reuseItems = fields.fromRunId ? await store.extractedItems(userId, fields.fromRunId) : undefined;
    if (fields.fromRunId && !reuseItems) {
      throw new AppError('CONFLICT', 'Önceki analizin ürün listesi yok; fotoğrafları veya ürün adlarını yeniden gönder');
    }
    if (images.length === 0 && typedNames.length === 0 && !reuseItems) {
      throw new AppError('VALIDATION_ERROR', 'En az bir fotoğraf ekle veya ürün adlarını yaz');
    }

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
    });
    const controller = registry.create(runId);
    const emit = (event: AnalyzeEvent): void => registry.emit(runId, event);
    emit({ type: 'run', runId });

    const categories = await loadCategoryIndex(db);
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
    const done = runAnalysis(
      {
        ...this.deps.pipelineDeps,
        tracer,
        categories,
        onAgentError: (agent, err) => this.deps.log.error({ err, runId, agent }, 'agent failed, run continues'),
      },
      {
        runId,
        userId,
        images,
        typedNames,
        reuseItems: reuseItems ?? undefined,
        notes: fields.notes,
        selectedCuisine,
        cuisineOptions,
        graph,
        signal: controller.signal,
        emit: (event) => {
          if (event.type === 'warning') warnings.push({ code: event.code, message: event.message });
          if (event.type === 'classification') classification = event.classification;
          emit(event);
        },
        saveCard: (card) => store.insertCard(runId, card),
      },
    )
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
   * it targets, and a `fix` card is a note for the call, not a pool write.
   */
  async accept(userId: string, cardId: string, body: { payload?: TemplatePayload | undefined }): Promise<CardDto> {
    const { db, store } = this.deps;
    const existing = await store.setAccepted(userId, cardId, true, body.payload);
    if (!existing) throw notFound('Kart');

    // A fix card is a note for the call ("açıklamayı sor"), not something to write into the pool.
    if (existing.section === 'fix') return existing;

    const run = await store.snapshot(userId, existing.runId);
    const cuisineId = run?.counts?.cuisineId;
    if (!cuisineId) throw new AppError('CONFLICT', 'Mutfak türü bilinmiyor');

    let templateId: string | null;
    try {
      templateId = await db.transaction((tx) =>
        existing.section === 'option'
          ? this.mergeOptions(tx, existing, cuisineId, userId)
          : this.saveProduct(tx, existing, body.payload, cuisineId, userId),
      );
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', 'Bu mutfakta aynı isimde onaylı başka bir şablon var');
      throw err;
    }
    if (templateId === null) return existing;

    await db.update(suggestionItems).set({ matchedItemId: templateId }).where(eq(suggestionItems.id, cardId));
    await this.deps.queue.enqueueEmbedding([templateId]);
    return { ...existing, matchedTemplateId: templateId };
  }

  async skip(userId: string, cardId: string): Promise<CardDto> {
    const card = await this.deps.store.setAccepted(userId, cardId, false);
    if (!card) throw notFound('Kart');
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
      if (edited && !isDeepStrictEqual(target.payload, payload)) {
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
  private async mergeOptions(tx: Executor, card: CardDto, cuisineId: string, userId: string): Promise<string> {
    const name = card.targetName ?? card.name;
    const pointed = card.matchedTemplateId ? await getTemplate(tx, card.matchedTemplateId) : undefined;
    const approved = pointed ? undefined : await findApprovedByName(tx, cuisineId, normalizeTr(card.name));
    const template = pointed ?? (approved ? await getTemplate(tx, approved.id) : undefined);

    let templateId: string;
    if (template) {
      const merged = templatePayloadSchema.parse(mergeOptionCard(template.payload, card));
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
          card,
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

/** Pure merge of an option card into a template payload; exported for the unit tests. */
export function mergeOptionCard(base: TemplatePayload, card: Pick<CardDto, 'optionGroups' | 'removableIngredients' | 'extraIngredients'>): TemplatePayload {
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

  return {
    ...base,
    optionGroups: [...kept, ...incoming].slice(0, MAX_GROUPS),
    removableIngredients: union(base.removableIngredients, card.removableIngredients),
    extraIngredients: extras.slice(0, MAX_INGREDIENTS),
  };
}
