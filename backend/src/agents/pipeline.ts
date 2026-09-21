import { RequestBudget } from '../ai/budget.js';
import type { ProviderErrorKind } from '../ai/errors.js';
import type { AiRouter, CallContext } from '../ai/router.js';
import type { ImageInput } from '../ai/types.js';
import type { VisionExtractor } from '../modules/extraction/vision-extractor.js';
import type { CuisineGraph, CuisineNode } from '../modules/retrieval/cuisine-graph.js';
import type { AnalyzeEvent, CardDto, CountsDto, MenuItemDto } from '../modules/analyze/schemas.js';
import { normalizeTr } from '../lib/normalize-tr.js';
import { getTemplates } from '../modules/templates/template-store.js';
import { runClassifier, type ClassifierResult, type CuisineOption } from './classifier.js';
import { addTypedItems, type MergedItem } from './dedupe.js';
import { runExtractor } from './extractor.js';
import { looksAbbreviated, MIN_BRANCH_ITEMS, runGapAnalyst } from './gap-analyst.js';
import { runOptionModifier, type OptionCard, type OptionModifierResult } from './option-modifier.js';
import {
  MAX_RECOMMENDATIONS,
  runProductRecommender,
  wantedCount,
  type ProductRecommenderResult,
} from './product-recommender.js';
import { AGENT_LABELS, type AgentDeps, type AgentName, type AgentRunContext, type ExistingItem } from './types.js';
import { runValidator, type ValidatedNewProduct, type ValidationResult } from './validator.js';

/**
 * The analysis pipeline — six agents, one run.
 *
 *   1 Extractor          images + typed names → deduped product list          (vision model, 3 in flight)
 *   2 Classifier         product list         → cuisine + price segment       (cheap model; user's pick wins)
 *   3 Gap Analyst        list + cuisine table → per-category gaps             (deterministic, no model)
 *   4 Product Recommender gaps                → products the menu LACKS       (templates first, then model)
 *   5 Option/Modifier    products on the menu → option groups + ingredients   (templates first, then model)
 *   6 Validator          everything           → what reaches the screen       (deterministic, no model)
 *
 * 4 and 5 are independent and run in PARALLEL — that is what keeps a normal menu under the 15 s budget.
 * Every step is traced (`agent_steps`), and a failing step degrades the result instead of ending the run: an
 * expected failure (provider down, bad JSON) comes back from the agent as data, an unexpected one is caught by
 * `safely` and replaced by that step's fallback.
 */

export interface AnalyzePipelineDeps extends AgentDeps {
  extractor: VisionExtractor;
  router: AiRouter;
  budget: { maxLlmCalls: number; maxInputTokens: number };
  /** Unexpected agent exceptions, for the server log. The run itself carries on. */
  onAgentError?: (agent: AgentName | 'matching', err: unknown) => void;
}

export interface AnalyzeRunInput {
  runId: string;
  userId: string;
  images: readonly ImageInput[];
  typedNames: readonly string[];
  /**
   * The product list of an earlier run of the same menu. Set when the user re-runs with another cuisine from the
   * result screen: the Extractor is skipped (no second vision call) and the evidence it read — empty
   * descriptions, missing options — carries over, so sections B and C stay as informed as the first run.
   */
  reuseItems?: readonly MergedItem[] | undefined;
  notes: string | undefined;
  /** The cuisine the user picked; the Classifier fills the blank when it is undefined. */
  selectedCuisine: CuisineNode | undefined;
  cuisineOptions: readonly CuisineOption[];
  graph: CuisineGraph;
  signal: AbortSignal;
  emit: (event: AnalyzeEvent) => void;
  /** Persists one card and returns its DTO (with the generated id). */
  saveCard: (card: Omit<CardDto, 'id' | 'runId'>) => Promise<CardDto>;
}

export interface AnalyzeRunResult {
  status: 'completed' | 'partial' | 'failed' | 'cancelled';
  counts: CountsDto | null;
  menu: MenuItemDto[];
  /** The deduplicated product list with its evidence, stored so a re-run can skip the Extractor. */
  extracted: MergedItem[];
  cards: CardDto[];
  stats: {
    llmCalls: number;
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    imagesRead: number;
    imagesFailed: number;
    menuItems: number;
    newProducts: number;
    optionCards: number;
    fixCards: number;
    dropped: number;
    cacheHit: boolean;
  };
  provider?: string;
  model?: string;
}

const AI_OFF: ReadonlySet<ProviderErrorKind> = new Set(['local_only', 'quota_exceeded', 'not_configured']);
const AI_OFF_MESSAGE = 'AI kapalı (anahtar/kota): yalnızca veritabanından cevap veriliyor.';
/** Asking for options on more than this makes the call unscannable and the request slow. */
const MAX_OPTION_TARGETS = 8;
const MAX_FIX_CARDS = 12;
/**
 * The two model agents get this long, together, before the pipeline ships what it has. Sized above a single
 * attempt timeout (6 s) on purpose: a rate-limited primary must still leave room for one fallback. Extraction
 * and classification take ~1–4 s before this point, so the 15 s end-to-end target holds.
 */
const RECOMMEND_DEADLINE_MS = 11_000;
/** Input tokens one image read may use on top of the agents' budget (a 15-item menu photo measured 2.3–3.7 k). */
const IMAGE_TOKEN_ALLOWANCE = 4_000;

/**
 * How many new products to ask for. The product-count gap alone is not enough: a menu can be 4 products short of
 * the target while its categories are 7 short, because the category table describes the SHAPE of a complete menu,
 * not just its size. Taking the larger of the two is what lets every open category get at least one card.
 */
function recommendationLimit(analysis: { missing: number; categories: readonly { missing: number }[] }): number {
  const shape = analysis.categories.reduce((sum, c) => sum + c.missing, 0);
  return Math.min(MAX_RECOMMENDATIONS, Math.max(wantedCount(analysis.missing), shape));
}

export async function runAnalysis(deps: AnalyzePipelineDeps, input: AnalyzeRunInput): Promise<AnalyzeRunResult> {
  const started = Date.now();
  // The configured budget is what the agents may spend; reading an image is paid on top (one call, a few thousand
  // tokens each). A shared budget let five screenshots starve the recommender and the option agent.
  const budget = new RequestBudget(
    deps.budget.maxLlmCalls + input.images.length,
    deps.budget.maxInputTokens + input.images.length * IMAGE_TOKEN_ALLOWANCE,
  );
  const ctx: CallContext = { userId: input.userId, runId: input.runId, budget, signal: input.signal };
  const run: AgentRunContext = { runId: input.runId, userId: input.userId, ctx, signal: input.signal };
  const warn = (code: string, message: string): void => input.emit({ type: 'warning', code, message });

  /**
   * Runs one step so that an exception inside it degrades the result instead of ending the run. The tracer has
   * already written the failed step (with its error) when this catches; this only adds the warning the phone
   * shows and hands back the step's fallback. Expected failures (provider down, bad JSON) never get here — the
   * agents return those as data. This is for the unexpected ones.
   */
  const failures: string[] = [];
  const safely = async <T>(agent: AgentName | 'matching', work: () => Promise<T>, fallback: () => T): Promise<T> => {
    try {
      return await work();
    } catch (err) {
      const label = agent === 'matching' ? 'Şablon eşleştirme' : AGENT_LABELS[agent];
      failures.push(agent);
      warn('agent_failed', `${label} adımı hata verdi; kalan adımlarla devam edildi.`);
      deps.onAgentError?.(agent, err);
      return fallback();
    }
  };

  const availability = await deps.router.availability(input.userId);
  const aiUsable = availability.ok;
  if (!aiUsable) warn(availability.error.kind, AI_OFF.has(availability.error.kind) ? AI_OFF_MESSAGE : availability.error.message);

  // ---- 1. Extractor -------------------------------------------------------------------------------------------
  const cuisineNameForExtract = input.selectedCuisine?.name ?? '';
  const reuse = input.reuseItems;
  const extraction = await safely(
    'extractor',
    async () => {
      if (reuse) {
        await deps.tracer.skip('extractor', AGENT_LABELS.extractor, 'önceki analizin ürün listesi kullanıldı');
        return { items: addTypedItems([...reuse], input.typedNames), imagesRead: 0, imagesFailed: 0, extractedRaw: 0, attempts: [], llmCalls: 0 };
      }
      return aiUsable
        ? runExtractor(deps, { images: input.images, typedNames: input.typedNames, cuisineName: cuisineNameForExtract }, run, (done, total) =>
            input.emit({ type: 'progress', agent: 'extractor', message: 'Menü okunuyor', done, total }),
          )
        : runExtractor(deps, { images: [], typedNames: input.typedNames, cuisineName: cuisineNameForExtract }, run);
    },
    // The typed products need no model: they survive even when image reading blows up.
    () => ({
      items: addTypedItems([], input.typedNames),
      imagesRead: 0,
      imagesFailed: input.images.length,
      extractedRaw: 0,
      attempts: [],
      llmCalls: 0,
    }),
  );
  if (!aiUsable && input.images.length > 0) {
    warn('images_skipped', 'Fotoğraflar okunamadı (AI kapalı). Ürün adlarını yazarak dene.');
  }
  if (extraction.imagesFailed > 0) {
    warn('extract_failed', `${extraction.imagesFailed} görüntü okunamadı; kalanlarla devam edildi.`);
  }

  const merged = extraction.items;
  if (merged.length === 0) {
    warn('no_items', 'Menüde ürün bulunamadı. Fotoğraf ekle veya ürün adlarını yaz.');
  }

  // ---- 2. Classifier ------------------------------------------------------------------------------------------
  const selectedOption = input.selectedCuisine
    ? { id: input.selectedCuisine.id, slug: input.selectedCuisine.slug, name: input.selectedCuisine.name }
    : undefined;
  /** The user's pick, or the first cuisine when there is none — used whenever the Classifier cannot answer. */
  const keepSelection = (reason: string): ClassifierResult => ({
    cuisine: selectedOption ?? input.cuisineOptions[0]!,
    priceSegment: 'orta',
    confidence: 0,
    reason,
    disagrees: false,
    suggested: null,
    attempts: [],
    llmCalls: 0,
  });
  const classification =
    aiUsable && merged.length > 0
      ? await safely(
          'classifier',
          () => runClassifier(deps, { itemNames: merged.map((i) => i.name), options: input.cuisineOptions, selected: selectedOption }, run),
          () => keepSelection('sınıflandırma hata verdi'),
        )
      : keepSelection(aiUsable ? 'menüde ürün yok' : 'AI kapalı');

  const cuisineNode = input.graph.get(classification.cuisine.id);
  const cuisineMin = cuisineNode?.minItemCount ?? MIN_BRANCH_ITEMS;
  input.emit({
    type: 'classification',
    classification: {
      cuisineId: classification.cuisine.id,
      cuisineName: classification.cuisine.name,
      priceSegment: classification.priceSegment,
      confidence: classification.confidence,
      reason: classification.reason,
      disagrees: classification.disagrees,
      suggestedCuisineId: classification.suggested?.id ?? null,
      suggestedCuisineName: classification.suggested?.name ?? null,
    },
  });

  // ---- matching against the template pool (no model call) -----------------------------------------------------
  const matched =
    merged.length > 0
      ? await safely(
          'matching',
          () => deps.retrieval.match(merged.map((i) => i.normalized), classification.cuisine.id, input.graph, { useVector: false }),
          // Without matches every product is simply "unknown to the pool": options and fixes get thinner, nothing breaks.
          () => undefined,
        )
      : undefined;

  const existing: ExistingItem[] = merged.map((item) => {
    const hit = matched?.hits.get(item.normalized);
    return {
      rawName: item.name,
      normalized: item.normalized,
      canonicalName: hit?.canonicalName ?? null,
      matchedTemplateId: hit?.templateId ?? null,
      categoryKey: deps.categories.classify(item.name, item.sectionText),
      categoryConflict: deps.categories.conflict(item.name, item.sectionText),
      sectionText: item.sectionText,
      hasDescription: item.description,
      hasOptions: item.options,
      hasRemovables: item.removables,
      typed: item.typed,
      seenIn: item.seenIn,
      priceText: item.priceText,
      optionNames: item.optionNames,
    };
  });

  const menu: MenuItemDto[] = existing.map((item) => ({
    name: item.canonicalName ?? item.rawName,
    normalized: item.normalized,
    categoryKey: item.categoryKey,
    categoryLabel: deps.categories.label(item.categoryKey),
    matchedTemplateId: item.matchedTemplateId,
    typed: item.typed,
    seenIn: item.seenIn,
  }));
  input.emit({ type: 'menu', items: menu });

  // ---- 3. Gap Analyst -----------------------------------------------------------------------------------------
  const analysis = await safely(
    'gap_analyst',
    () => runGapAnalyst(deps, { cuisineId: classification.cuisine.id, cuisineMinItemCount: cuisineMin, items: existing }, run),
    // The count against the target is plain arithmetic and must reach the screen even if the category table fails.
    () => {
      const target = Math.max(MIN_BRANCH_ITEMS, cuisineMin);
      return {
        target,
        cuisineMin,
        current: existing.length,
        missing: Math.max(0, target - existing.length),
        categories: [],
        needOptions: [],
        needFixes: [],
      };
    },
  );
  const counts: CountsDto = {
    current: analysis.current,
    target: analysis.target,
    missing: analysis.missing,
    hardMinimum: MIN_BRANCH_ITEMS,
    cuisineMin: analysis.cuisineMin,
    cuisineName: classification.cuisine.name,
    cuisineId: classification.cuisine.id,
    categories: analysis.categories,
  };
  input.emit({ type: 'counts', counts });

  // ---- 4 + 5 in parallel --------------------------------------------------------------------------------------
  const categoryQuota = new Map(analysis.categories.map((c) => [c.key, c.missing]));
  input.emit({ type: 'progress', agent: 'product_recommender', message: 'Eksik ürünler ve opsiyonlar hazırlanıyor' });

  /**
   * Hard deadline over the two model-backed agents. Per-attempt timeouts alone are not enough: a three-entry
   * chain where every provider is slow can still stack up (measured once at 23 s, which is unusable mid-call).
   * When it fires, both agents return what they already have from the template pool and the run finishes
   * `partial`. Counts, the menu and the DB cards are already on screen by then — this only cuts the tail.
   */
  const deadline = AbortSignal.timeout(RECOMMEND_DEADLINE_MS);
  const bounded = AbortSignal.any([input.signal, deadline]);
  const boundedRun: AgentRunContext = { ...run, signal: bounded, ctx: { ...ctx, signal: bounded } };

  const [recommendation, optionResult] = await Promise.all([
    safely(
      'product_recommender',
      () =>
        runProductRecommender(
          deps,
          {
            cuisine: { id: classification.cuisine.id, name: classification.cuisine.name },
            graph: input.graph,
            priceSegment: classification.priceSegment,
            existing,
            gaps: analysis.categories,
            current: analysis.current,
            target: analysis.target,
            notes: input.notes,
            limit: recommendationLimit(analysis),
            aiUsable,
          },
          boundedRun,
        ),
      (): ProductRecommenderResult => ({ items: [], fromDb: 0, fromAi: 0, attempts: [], llmCalls: 0, cached: false }),
    ),
    safely(
      'option_modifier',
      () =>
        runOptionModifier(
          deps,
          {
            cuisine: { id: classification.cuisine.id, name: classification.cuisine.name },
            targets: analysis.needOptions,
            limit: MAX_OPTION_TARGETS,
            aiUsable,
          },
          boundedRun,
        ),
      (): OptionModifierResult => ({ items: [], fromDb: 0, fromAi: 0, attempts: [], llmCalls: 0 }),
    ),
  ]);
  if (deadline.aborted && !input.signal.aborted) {
    warn('slow_providers', `AI sağlayıcıları ${Math.round(RECOMMEND_DEADLINE_MS / 1000)} sn içinde cevap vermedi; veritabanı önerileriyle devam edildi.`);
  } else {
    if (recommendation.error) warn('recommend_failed', 'Yeni ürün önerisi alınamadı; veritabanı önerileriyle devam edildi.');
    if (optionResult.error) warn('options_failed', 'Opsiyon önerisi alınamadı; kalan bölümler gösteriliyor.');
  }

  // ---- 6. Validator -------------------------------------------------------------------------------------------
  const validated = await safely(
    'validator',
    () =>
      runValidator(
        deps,
        {
          existing,
          recommended: recommendation.items,
          options: optionResult.items,
          categoryQuota,
          current: analysis.current,
          target: analysis.target,
          templatePayloads: recommendation.templatePayloads,
        },
        run,
      ),
    // Nothing unvalidated ever reaches the screen: if the gate itself breaks, sections A and B stay empty.
    (): ValidationResult => ({
      newProducts: [],
      options: [],
      dropped: [],
      reachable: analysis.current,
      targetUnreachable: analysis.current < analysis.target,
    }),
  );
  if (validated.targetUnreachable) {
    warn(
      'target_unreachable',
      `Öneriler kabul edilse bile ${validated.reachable}/${analysis.target} ürün olur — hedefe ${analysis.target - validated.reachable} ürün kalıyor.`,
    );
  }

  // ---- cards --------------------------------------------------------------------------------------------------
  const cards: CardDto[] = [];
  let sortOrder = 0;
  const push = async (card: Omit<CardDto, 'id' | 'runId' | 'sortOrder'>): Promise<void> => {
    const saved = await input.saveCard({ ...card, sortOrder: sortOrder++ });
    cards.push(saved);
    input.emit({ type: 'item', card: saved });
  };

  for (const item of validated.newProducts) await push(newProductCard(deps, item));
  for (const card of validated.options) await push(optionCard(deps, card, existing));
  // Pool descriptions for the fix cards: an empty panel description comes with a ready-to-paste one when possible.
  const fixDescriptions = await safely(
    'matching',
    async () => {
      const ids = [...new Set(analysis.needFixes.flatMap((i) => (i.matchedTemplateId ? [i.matchedTemplateId] : [])))];
      const templates = ids.length === 0 ? [] : await getTemplates(deps.db, ids);
      return new Map(templates.filter((t) => t.payload.description.trim() !== '').map((t) => [t.id, t.payload.description]));
    },
    () => new Map<string, string>(),
  );
  for (const card of fixCards(deps, analysis.needFixes, fixDescriptions)) await push(card);

  // ---- finalize -----------------------------------------------------------------------------------------------
  const llmCalls = deps.tracer.totals.llmCalls;
  const status: AnalyzeRunResult['status'] = input.signal.aborted
    ? 'cancelled'
    : merged.length === 0 && input.images.length > 0 && extraction.imagesFailed === input.images.length
      ? 'failed'
      : extraction.imagesFailed > 0 ||
          recommendation.error !== undefined ||
          optionResult.error !== undefined ||
          failures.length > 0
        ? 'partial'
        : 'completed';

  return {
    status,
    counts,
    menu,
    extracted: merged,
    cards,
    stats: {
      llmCalls,
      tokensIn: budget.inputTokens,
      tokensOut: budget.outputTokens,
      latencyMs: Date.now() - started,
      imagesRead: extraction.imagesRead,
      imagesFailed: extraction.imagesFailed,
      menuItems: existing.length,
      newProducts: validated.newProducts.length,
      optionCards: validated.options.length,
      fixCards: cards.filter((c) => c.section === 'fix').length,
      dropped: validated.dropped.length,
      cacheHit: llmCalls === 0,
    },
    ...(extraction.provider ? { provider: extraction.provider } : {}),
    ...(extraction.model ? { model: extraction.model } : {}),
  };
}

function newProductCard(deps: Pick<AgentDeps, 'categories'>, item: ValidatedNewProduct): Omit<CardDto, 'id' | 'runId' | 'sortOrder'> {
  return {
    section: 'new_product',
    name: item.name,
    targetName: null,
    targetNormalized: null,
    categoryKey: item.categoryKey,
    categoryLabel: deps.categories.label(item.categoryKey),
    source: item.source === 'db' ? 'db' : 'ai',
    matchedTemplateId: item.templateId,
    shortDescription: item.shortDescription,
    portionInfo: item.portionInfo,
    priceRangeHint: item.priceRangeHint,
    reason: item.reason,
    importance: item.importance,
    optionGroups: [],
    removableIngredients: [],
    extraIngredients: [],
    fixKind: null,
    currentValue: null,
    suggestedValue: null,
    payload: item.payload,
    status: 'pending',
  };
}

function optionCard(
  deps: Pick<AgentDeps, 'categories'>,
  card: OptionCard,
  existing: readonly ExistingItem[],
): Omit<CardDto, 'id' | 'runId' | 'sortOrder'> {
  const target = existing.find((i) => i.normalized === card.targetNormalized);
  const categoryKey = target?.categoryKey ?? null;
  const groupNames = card.optionGroups.map((g) => g.name).join(', ');
  return {
    section: 'option',
    // Titled with the spelling on the panel — what the user looks for during the call ("Kadayıf") — while `name`
    // carries the pool's spelling ("Tel Kadayıf"): accepting writes that template and keeps the panel spelling as
    // its alias, so the product matches directly next time.
    name: target?.canonicalName ?? card.targetName,
    targetName: target?.rawName ?? card.targetName,
    targetNormalized: card.targetNormalized,
    categoryKey,
    categoryLabel: categoryKey ? deps.categories.label(categoryKey) : null,
    source: card.source === 'db' ? 'db' : 'ai',
    matchedTemplateId: card.matchedTemplateId,
    shortDescription: groupNames || card.removableIngredients.join(', '),
    portionInfo: '',
    priceRangeHint: '',
    reason: card.reason,
    importance: 0,
    optionGroups: card.optionGroups,
    removableIngredients: card.removableIngredients,
    extraIngredients: card.extraIngredients,
    fixKind: null,
    currentValue: null,
    suggestedValue: null,
    payload: null,
    status: 'pending',
  };
}

/**
 * Section C is entirely deterministic: an empty description, a shorthand name, a canonical rename and a heading that
 * contradicts the product are all facts the extractor and the matcher already established, so no model is asked to
 * restate them. One card per problem — a product can have two — and, wherever the pool knows the product, the card
 * carries the fix itself (the curated description, the canonical spelling), not just the complaint.
 */
function fixCards(
  deps: Pick<AgentDeps, 'categories'>,
  items: readonly ExistingItem[],
  descriptions: ReadonlyMap<string, string>,
): Omit<CardDto, 'id' | 'runId' | 'sortOrder'>[] {
  const cards: Omit<CardDto, 'id' | 'runId' | 'sortOrder'>[] = [];
  const push = (card: Omit<CardDto, 'id' | 'runId' | 'sortOrder'>): void => {
    if (cards.length < MAX_FIX_CARDS) cards.push(card);
  };

  for (const item of items) {
    const base = {
      section: 'fix' as const,
      name: item.canonicalName ?? item.rawName,
      targetName: item.rawName,
      targetNormalized: item.normalized,
      categoryKey: item.categoryKey,
      categoryLabel: deps.categories.label(item.categoryKey),
      source: (item.matchedTemplateId ? 'db' : 'review') as CardDto['source'],
      matchedTemplateId: item.matchedTemplateId,
      portionInfo: '',
      priceRangeHint: '',
      importance: 0,
      optionGroups: [],
      removableIngredients: [],
      extraIngredients: [],
      payload: null,
      status: 'pending' as const,
    };

    // The name first: a canonical rename is a one-word edit on the panel.
    if (item.canonicalName !== null && normalizeTr(item.canonicalName) !== normalizeTr(item.rawName)) {
      push({
        ...base,
        shortDescription: item.canonicalName,
        reason: 'Havuzdaki kanonik ada göre düzeltilebilir',
        fixKind: 'bad_name',
        currentValue: item.rawName,
        suggestedValue: item.canonicalName,
      });
    } else if (looksAbbreviated(item.rawName)) {
      push({
        ...base,
        shortDescription: item.rawName,
        reason: 'Ad kısaltma gibi görünüyor, satıcıya tam adını sor',
        fixKind: 'bad_name',
        currentValue: item.rawName,
        suggestedValue: null,
      });
    }

    const conflict = item.categoryConflict;
    if (conflict) {
      const from = deps.categories.label(conflict.section);
      const to = deps.categories.label(conflict.name);
      push({
        ...base,
        shortDescription: `${from} → ${to}`,
        reason: 'Ürün adı başka bir kategoriye işaret ediyor; panelde doğru bölümde mi, sor',
        fixKind: 'wrong_category',
        currentValue: from,
        suggestedValue: to,
      });
    }

    if (item.hasDescription === 'absent') {
      const suggestion = item.matchedTemplateId ? descriptions.get(item.matchedTemplateId) : undefined;
      push({
        ...base,
        shortDescription: suggestion ?? 'Açıklama alanı boş',
        reason: suggestion
          ? 'Panelde açıklama boş; havuzdaki onaylı açıklama önerildi'
          : 'Panelde açıklama boş; ürünün içeriğini sor ve gir',
        fixKind: 'empty_description',
        currentValue: null,
        suggestedValue: suggestion ?? null,
      });
    }
  }
  return cards;
}
