import { RequestBudget } from '../ai/budget.js';
import type { ProviderErrorKind } from '../ai/errors.js';
import type { AiRouter, CallContext } from '../ai/router.js';
import type { ImageInput } from '../ai/types.js';
import type { VisionExtractor } from '../modules/extraction/vision-extractor.js';
import type { CuisineGraph, CuisineNode } from '../modules/retrieval/cuisine-graph.js';
import type { AnalyzeEvent, CardDto, CountsDto, MenuItemDto } from '../modules/analyze/schemas.js';
import { normalizeTr } from '../lib/normalize-tr.js';
import { namesVariant, variantConflict } from '../lib/same-product.js';
import { reconcileCategory } from '../domain/product-type.js';
import { guessCuisine, runClassifier, type ClassifierResult, type CuisineOption } from './classifier.js';
import { addTypedItems, type MergedItem } from './dedupe.js';
import { runExtractor } from './extractor.js';
import { looksAbbreviated, MIN_BRANCH_ITEMS, runGapAnalyst } from './gap-analyst.js';
import { runOptionModifier, type OptionModifierResult } from './option-modifier.js';
import { modeBudget, planRun, quotaRows, type AnalysisMode } from './plan.js';
import { runProductRecommender, type ProductRecommenderResult } from './product-recommender.js';
import { AGENT_LABELS, type AgentDeps, type AgentName, type AgentRunContext, type ExistingItem } from './types.js';
import { runValidator, type ValidatedNewProduct, type ValidatedOptionCard, type ValidationResult } from './validator.js';

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
  /**
   * How much work this run does: `quick` answers with a handful of suggestions, `full` fills the menu up to the
   * cuisine's opening minimum and asks for options on everything. The user picks it on the home screen.
   */
  mode: AnalysisMode;
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
const MAX_FIX_CARDS = 12;
/** Input tokens one image read may use on top of the agents' budget (a 15-item menu photo measured 2.3–3.7 k). */
const IMAGE_TOKEN_ALLOWANCE = 4_000;

export async function runAnalysis(deps: AnalyzePipelineDeps, input: AnalyzeRunInput): Promise<AnalyzeRunResult> {
  const started = Date.now();
  // The configured budget is what the agents may spend; reading an image is paid on top (one call, a few thousand
  // tokens each). A shared budget let five screenshots starve the recommender and the option agent.
  const extra = modeBudget(input.mode);
  const budget = new RequestBudget(
    deps.budget.maxLlmCalls + input.images.length + extra.extraLlmCalls,
    deps.budget.maxInputTokens + input.images.length * IMAGE_TOKEN_ALLOWANCE + extra.extraInputTokens,
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
  // What the menu's product types say, without a model: the answer whenever the Classifier has none (D-187).
  const guess = guessCuisine(merged.map((i) => i.name), deps.productTypes, input.cuisineOptions);
  /** The user's pick, or the menu's own guess, or the first cuisine — used whenever the Classifier cannot answer. */
  const keepSelection = (reason: string): ClassifierResult => ({
    cuisine: selectedOption ?? guess ?? input.cuisineOptions[0]!,
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
          () => runClassifier(deps, { itemNames: merged.map((i) => i.name), options: input.cuisineOptions, selected: selectedOption, guess }, run),
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

  const cuisineSlug = classification.cuisine.slug;
  const existing: ExistingItem[] = merged.map((item) => {
    // A fuzzy match that changes what the product IS ("Levrek Buğulama" → Levrek Izgara) is no match: the product
    // keeps its own name and gets a card for its own type instead of another dish's options and a wrong rename.
    const found = matched?.hits.get(item.normalized);
    const fuzzy = found !== undefined && found.matchType !== 'exact' && found.matchType !== 'alias';
    const hit = fuzzy && variantConflict(item.normalized, normalizeTr(found.canonicalName)) ? undefined : found;
    // Understanding layer (D-179): what KIND of product this is decides which options can apply at all — and, where
    // a stray keyword misfiled it ("Tavuk Suyu Çorbası" as a drink), which category it counts in.
    const keywordCategory = deps.categories.classify(item.name, item.sectionText);
    const resolved = deps.productTypes.resolve(hit?.canonicalName ?? item.name, cuisineSlug, keywordCategory);
    const categoryKey = reconcileCategory(
      keywordCategory,
      deps.categories.headingCategory(item.sectionText) !== undefined,
      resolved,
      (key) => deps.categories.has(key),
    );
    return {
      rawName: item.name,
      normalized: item.normalized,
      canonicalName: hit?.canonicalName ?? null,
      matchedTemplateId: hit?.templateId ?? null,
      categoryKey,
      productType: resolved.type.key,
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
    // The pool's spelling, unless the menu's name is a variant of it: "Peynirli Gözleme" and "Patatesli Gözleme" are
    // two products, not "Gözleme" twice (D-188).
    name: item.canonicalName !== null && !namesVariant(item.normalized, normalizeTr(item.canonicalName)) ? item.canonicalName : item.rawName,
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
        // Even without the category table every product still gets its card (packaged drinks excepted).
        needOptions: existing.filter((item) => !deps.productTypes.isPlain(item.productType)),
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
  /**
   * The run plan: how many products to ask for, which categories they come from and how many products get an
   * option card. In `full` mode the quota goes past the per-category minimums until the menu would actually
   * reach the cuisine's opening target — a 10-product menu in a 30-product cuisine is 20 products short, and
   * before this the answer was capped at three cards by the category gaps alone.
   */
  const plan = planRun({
    mode: input.mode,
    categories: analysis.categories,
    current: analysis.current,
    missing: analysis.missing,
    needOptions: analysis.needOptions.length,
  });
  const categoryQuota = plan.quota;
  /** The menu products this run completes: options, removable and extra ingredients, description. */
  const optionTargets = analysis.needOptions.slice(0, plan.optionTargets);
  input.emit({
    type: 'progress',
    agent: 'product_recommender',
    message:
      plan.mode === 'full'
        ? `${plan.products} ürün ve ${plan.optionTargets} ürün için opsiyon hazırlanıyor`
        : 'Eksik ürünler ve opsiyonlar hazırlanıyor',
  });

  /**
   * Hard deadline over the two model-backed agents. Per-attempt timeouts alone are not enough: a three-entry
   * chain where every provider is slow can still stack up (measured once at 23 s, which is unusable mid-call).
   * When it fires, both agents return what they already have from the template pool and the run finishes
   * `partial`. Counts, the menu and the DB cards are already on screen by then — this only cuts the tail.
   */
  const deadline = AbortSignal.timeout(plan.deadlineMs);
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
            quota: quotaRows(analysis.categories, plan.quota),
            current: analysis.current,
            target: analysis.target,
            notes: input.notes,
            limit: plan.products,
            attemptTimeoutMs: plan.attemptTimeoutMs,
            aiUsable,
            fillUp: plan.mode === 'quick',
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
            targets: optionTargets,
            limit: plan.optionTargets,
            modelLimit: plan.modelOptionTargets,
            attemptTimeoutMs: plan.attemptTimeoutMs,
            maxBatches: plan.optionBatches,
            aiUsable,
          },
          boundedRun,
        ),
      (): OptionModifierResult => ({ items: [], fromDb: 0, fromAi: 0, attempts: [], llmCalls: 0 }),
    ),
  ]);
  if (deadline.aborted && !input.signal.aborted) {
    warn('slow_providers', `AI sağlayıcıları ${Math.round(plan.deadlineMs / 1000)} sn içinde cevap vermedi; veritabanı önerileriyle devam edildi.`);
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
          optionTargets,
          categoryQuota,
          current: analysis.current,
          target: analysis.target,
          cuisineSlug,
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
  for (const card of fixCards(deps, analysis.needFixes)) await push(card);

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
    // A new product reaches the phone complete: description, portion AND the options/ingredients it should open
    // with. They come from the payload, which is exactly what accepting the card writes to the pool — so what the
    // expert reads on the call and what lands in the panel are the same text.
    optionGroups: item.payload.optionGroups,
    removableIngredients: [...item.payload.removableIngredients],
    extraIngredients: item.payload.extraIngredients.map((i) => i.name),
    fixKind: null,
    currentValue: null,
    suggestedValue: null,
    payload: item.payload,
    productType: item.productType,
    confidence: item.confidence,
    status: 'pending',
  };
}

function optionCard(
  deps: Pick<AgentDeps, 'categories'>,
  card: ValidatedOptionCard,
  existing: readonly ExistingItem[],
): Omit<CardDto, 'id' | 'runId' | 'sortOrder'> {
  const target = existing.find((i) => i.normalized === card.targetNormalized);
  const categoryKey = target?.categoryKey ?? null;
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
    // The product description (6-8 words), one of the four sections of the card. Empty when the panel screenshot
    // already showed one.
    shortDescription: card.description,
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
    productType: card.productType,
    confidence: card.confidence,
    status: 'pending',
  };
}

/**
 * Section C is entirely deterministic: a shorthand name, a canonical rename and a heading that contradicts the
 * product are facts the extractor and the matcher already established, so no model is asked to restate them. One
 * card per problem (a product can have two) and, wherever the pool knows the product, the card carries the fix
 * itself (the canonical spelling), not just the complaint. An empty description is no longer one of them: the
 * card of the product carries a ready 6-8 word description (D-178).
 */
function fixCards(deps: Pick<AgentDeps, 'categories'>, items: readonly ExistingItem[]): Omit<CardDto, 'id' | 'runId' | 'sortOrder'>[] {
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
      productType: item.productType,
      confidence: null,
      status: 'pending' as const,
    };

    // The name first: a canonical rename is a one-word edit on the panel. Not when the menu's name is the pool's
    // plus what makes it one variant ("Peynirli Gözleme" / "Gözleme"): two such rows would both become "Gözleme".
    if (
      item.canonicalName !== null &&
      normalizeTr(item.canonicalName) !== normalizeTr(item.rawName) &&
      !namesVariant(item.normalized, normalizeTr(item.canonicalName))
    ) {
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
  }
  return cards;
}
