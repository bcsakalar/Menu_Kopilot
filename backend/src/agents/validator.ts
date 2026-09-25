import type { PromptRepository } from '../ai/prompt-repository.js';
import type { AiRouter, AttemptRecord, CallContext, RoutedResult, RouterRequest } from '../ai/router.js';
import { templatePayloadSchema, type ExtraIngredient, type TemplatePayload } from '../domain/template.js';
import { cleanItemName } from '../lib/clean-name.js';
import { normalizeTr } from '../lib/normalize-tr.js';
import { containsPriceAmount, stripPriceAmounts } from '../lib/price-guard.js';
import { sameProductName } from '../lib/same-product.js';
import { trigramSimilarity } from '../lib/trigram.js';
import { ground } from './grounding.js';
import type { OptionCard } from './option-modifier.js';
import type { RecommendedItem } from './product-recommender.js';
import type { AgentDeps, AgentRunContext, ExistingItem } from './types.js';

/**
 * Agent 6 — Validator. The only gate between the agents and the screen.
 *
 * Everything here is DETERMINISTIC and runs in code, by design: duplicate detection, schema conformance,
 * cuisine/category fit and the minimum-target check are exactly the things a model gets subtly wrong, and a live
 * phone call cannot pay 2.5 s for a second opinion. The Validator's only model call is `generateChecked` below:
 * ONE repair round, on its own small-model route, and only when an agent's answer failed the JSON schema.
 *
 * Since D-179 it also grounds every card in the knowledge base (see `grounding.ts`): option groups that cannot
 * apply to the product type are deleted, ingredients are separated from options, thin sections are completed from
 * the type, descriptions are brought to 6–8 words — and every menu product the plan promised a card gets one.
 *
 * Card-level failures drop that card, never the run.
 */

/** Names at least this similar to something on the menu are the same product (spelling variants). */
const VARIANT_SIMILARITY = 0.8;

/**
 * Volume / weight / packaging that the model keeps writing into the name. Measured at 11 % of answers before the
 * redesign; it breaks dedupe ("Ayran (1 L)" no longer matches "Ayran") and template lookup.
 */
const NAME_NOISE =
  /\s*[([]?\s*\d+[.,]?\d*\s*(?:l|lt|litre|ml|cl|cc|gr|gram|g|kg|adet|porsiyon|dilim|top|kişilik)\b\s*[)\]]?/giu;
/** Leftover empty brackets after the noise is cut, plus doubled spaces. */
const EMPTY_BRACKETS = /\s*[([]\s*[)\]]/gu;

export interface NameCleanResult {
  name: string;
  /** Text removed from the name; moved into `portionInfo` so the information is not lost. */
  movedToPortion: string;
}

/** "Ayran (1 L)" → { name: "Ayran", movedToPortion: "1 L" }. */
export function cleanProductName(raw: string): NameCleanResult {
  const stripped = stripPriceAmounts(raw);
  const matches = stripped.match(NAME_NOISE) ?? [];
  const name = cleanItemName(
    stripped.replace(NAME_NOISE, ' ').replace(EMPTY_BRACKETS, ' ').replace(/\s{2,}/gu, ' ').trim(),
  );
  const movedToPortion = matches
    .map((m) => m.replace(/[()[\]]/gu, '').trim())
    .filter((m) => m.length > 0)
    .join(', ');
  return { name, movedToPortion };
}

export interface ValidationIssue {
  card: string;
  reason: string;
}

export interface ValidatedNewProduct extends RecommendedItem {
  /** Template payload written to the pool when the user taps "Ekle". Always price-free. */
  payload: TemplatePayload;
  /** Product type from the knowledge base. */
  productType: string;
  /** 0–100: how sure the pipeline is about the card. */
  confidence: number;
}

/**
 * The card for a product ALREADY on the menu, after grounding: its options, what can be taken out and added, and
 * a 6–8 word description — the four sections the phone shows for every product.
 */
export interface ValidatedOptionCard extends Omit<OptionCard, 'description'> {
  productType: string;
  /** 6–8 words, or '' when the panel already has a description. */
  description: string;
  confidence: number;
}

export interface ValidationResult {
  newProducts: ValidatedNewProduct[];
  options: ValidatedOptionCard[];
  dropped: ValidationIssue[];
  /** True when the surviving new products still cannot bring the menu to the target. */
  targetUnreachable: boolean;
  reachable: number;
}

export interface ValidatorInput {
  existing: readonly ExistingItem[];
  recommended: readonly RecommendedItem[];
  options: readonly OptionCard[];
  /**
   * The menu products this run promised a card to (the plan's option targets). One that reaches the Validator with
   * no usable card — the model skipped it, timed out, or everything it said was wrong for the product — gets one
   * built from the knowledge base, so the promised coverage holds whatever the providers did.
   */
  optionTargets?: readonly ExistingItem[] | undefined;
  /**
   * Category key → how many products the cuisine is still short of. A category missing from the map is not
   * expected in this cuisine at all; one at 0 is already covered. Both refuse further recommendations.
   */
  categoryQuota: ReadonlyMap<string, number>;
  current: number;
  target: number;
  /** The cuisine's slug: breaks ties when a product name matches two product types. */
  cuisineSlug?: string | null | undefined;
  /** Pool templates the recommendations point at; a template-backed card carries the whole template. */
  templatePayloads?: ReadonlyMap<string, TemplatePayload> | undefined;
}

/** Index of everything already on the menu or already accepted in this run. */
class TakenIndex {
  private readonly names = new Set<string>();
  private readonly templateIds = new Set<string>();

  add(normalized: string, templateId: string | null): void {
    this.names.add(normalized);
    if (templateId) this.templateIds.add(templateId);
  }

  has(normalized: string, templateId: string | null): boolean {
    if (templateId !== null && this.templateIds.has(templateId)) return true;
    if (this.names.has(normalized)) return true;
    for (const name of this.names) {
      if (trigramSimilarity(name, normalized) >= VARIANT_SIMILARITY || sameProductName(name, normalized)) return true;
    }
    return false;
  }
}

/** The same product as a plain panel row: name and portion, no description, no options, no ingredients. */
function plainRow(payload: TemplatePayload): TemplatePayload {
  return { ...payload, description: '', servingNote: '', optionGroups: [], removableIngredients: [], extraIngredients: [], upsellSuggestion: '' };
}

/** Extras as the payload stores them: the pool's own price hints are kept for names it already had. */
function extrasPayload(names: readonly string[], pool: readonly ExtraIngredient[] = []): ExtraIngredient[] {
  const known = new Map(pool.map((e) => [normalizeTr(e.name), e]));
  return names.map((name) => known.get(normalizeTr(name)) ?? { name, priceHint: 'ek ücretli' as const });
}

type Deps = Pick<AgentDeps, 'tracer' | 'productTypes' | 'feedback'>;

interface BuiltProduct {
  payload: TemplatePayload;
  productType: string;
  confidence: number;
  notes: string[];
}

/**
 * A new product's payload: the curated template when the pool has one, the model's answer otherwise — grounded in
 * both cases, so a pool row with an empty extras list or a 14-word description reaches the phone complete too.
 */
function newProductPayload(
  deps: Deps,
  item: RecommendedItem,
  pool: TemplatePayload | undefined,
  portionExtra: string,
  cuisineSlug: string | null | undefined,
): BuiltProduct | null {
  const { type, byName } = deps.productTypes.resolve(item.name, cuisineSlug, item.categoryKey);
  const portionInfo = stripPriceAmounts([item.portionInfo, portionExtra].filter((p) => p.trim().length > 0).join(' · '))
    .trim()
    .slice(0, 80);
  const base: TemplatePayload = pool
    ? { ...pool, portionInfo: pool.portionInfo || portionInfo }
    : {
        name: item.name,
        description: '',
        servingNote: '',
        portionInfo,
        optionGroups: [],
        removableIngredients: [],
        extraIngredients: [],
        tags: [],
        allergenNotes: [],
        upsellSuggestion: '',
      };
  if (base.name.length === 0 || containsPriceAmount(`${base.name} ${base.portionInfo}`)) return null;
  // A packaged drink goes on the panel as a plain row: name and volume, nothing else (D-175).
  if (type.plain) return { payload: plainRow(base), productType: type.key, confidence: byName ? 95 : 70, notes: [] };

  const grounded = ground(
    {
      optionGroups: pool ? pool.optionGroups : item.optionGroups,
      removable: pool ? pool.removableIngredients : item.removableIngredients,
      extras: pool ? pool.extraIngredients.map((e) => e.name) : item.extraIngredients,
      description: pool?.description || item.shortDescription,
    },
    {
      productName: base.name,
      type,
      byName,
      source: pool ? 'pool' : 'model',
      want: { options: true, ingredients: true, description: true },
      feedback: deps.feedback,
    },
  );
  const payload: TemplatePayload = {
    ...base,
    description: grounded.description,
    optionGroups: grounded.optionGroups,
    removableIngredients: grounded.removable,
    extraIngredients: extrasPayload(grounded.extras, pool?.extraIngredients),
  };
  // The canonical schema is the one the DB enforces: a payload that fails here would fail on accept. The options
  // are the risky part; without them the product itself still reaches the phone.
  if (templatePayloadSchema.safeParse(payload).success) {
    return { payload, productType: type.key, confidence: grounded.confidence, notes: grounded.notes };
  }
  const bare: TemplatePayload = { ...payload, optionGroups: [] };
  return templatePayloadSchema.safeParse(bare).success
    ? { payload: bare, productType: type.key, confidence: Math.min(grounded.confidence, 50), notes: [...grounded.notes, 'opsiyonlar şemadan geçmedi'] }
    : null;
}

export async function runValidator(deps: Deps, input: ValidatorInput, _run: AgentRunContext): Promise<ValidationResult> {
  return deps.tracer.step(
    'validator',
    'Doğrulama',
    { recommended: input.recommended.length, options: input.options.length, target: input.target },
    async () => {
      const dropped: ValidationIssue[] = [];
      const grounding: string[] = [];
      const taken = new TakenIndex();
      for (const item of input.existing) {
        taken.add(item.normalized, item.matchedTemplateId);
        // "Mercimek" on the menu matched the pool's "Mercimek Çorbası": that spelling is on the menu too.
        if (item.canonicalName) taken.add(normalizeTr(item.canonicalName), null);
      }

      // --- new products -------------------------------------------------------------------------------------
      // The last line of defence for the rule the whole redesign exists for: never more of a category than the
      // menu is actually short of. Both recommender paths already respect it; this makes it impossible to skip.
      const quota = new Map(input.categoryQuota);
      const runTotal = [...input.categoryQuota.values()].reduce((sum, want) => sum + want, 0);
      const newProducts: ValidatedNewProduct[] = [];
      for (const raw of input.recommended) {
        const pool = raw.templateId ? input.templatePayloads?.get(raw.templateId) : undefined;
        // A curated pool name is used as it is; only free model output needs the volume/packaging scrub.
        const { name, movedToPortion } = pool ? { name: pool.name, movedToPortion: '' } : cleanProductName(raw.name);
        if (name.length < 2) {
          dropped.push({ card: raw.name, reason: 'ad çok kısa' });
          continue;
        }
        const normalized = normalizeTr(name);
        if (taken.has(normalized, raw.templateId)) {
          dropped.push({ card: raw.name, reason: 'menüde zaten var' });
          continue;
        }
        const left = quota.get(raw.categoryKey);
        if (left === undefined) {
          dropped.push({ card: raw.name, reason: `kategori bu mutfakta yok (${raw.categoryKey})` });
          continue;
        }
        // A quick run's fill-up may go past its category, never past the run's total (D-189).
        if (left <= 0 && (!raw.overQuota || newProducts.length >= runTotal)) {
          dropped.push({ card: raw.name, reason: `${raw.categoryKey} kategorisi zaten yeterli` });
          continue;
        }
        const built = newProductPayload(deps, { ...raw, name }, pool, movedToPortion, input.cuisineSlug);
        if (!built) {
          dropped.push({ card: raw.name, reason: 'şema/fiyat kontrolünden geçmedi' });
          continue;
        }
        grounding.push(...built.notes.map((n) => `${name}: ${n}`));
        quota.set(raw.categoryKey, Math.max(0, left - 1));
        taken.add(normalized, raw.templateId);
        newProducts.push({
          ...raw,
          name,
          normalized,
          reason: stripPriceAmounts(raw.reason).trim(),
          // The pasteable text on the card is exactly what accepting it writes to the pool.
          shortDescription: built.payload.description,
          portionInfo: built.payload.portionInfo,
          // A price hint is allowed here on purpose — it is a talking point for the call, never written to a
          // template. The payload carries no amount at all.
          priceRangeHint: raw.priceRangeHint.trim(),
          optionGroups: built.payload.optionGroups,
          removableIngredients: [...built.payload.removableIngredients],
          extraIngredients: built.payload.extraIngredients.map((e) => e.name),
          payload: built.payload,
          productType: built.productType,
          confidence: built.confidence,
        });
      }

      // --- cards for the products on the menu ---------------------------------------------------------------
      const onMenu = new Map(input.existing.map((i) => [i.normalized, i]));
      const optionCards: ValidatedOptionCard[] = [];
      const seenTargets = new Set<string>();
      const groundCard = (card: OptionCard, item: ExistingItem, source: 'pool' | 'model' | 'kb'): ValidatedOptionCard | null => {
        const productName = item.canonicalName ?? item.rawName;
        const resolved = deps.productTypes.resolve(productName, input.cuisineSlug, item.categoryKey);
        const type = deps.productTypes.get(item.productType) ?? resolved.type;
        const grounded = ground(
          {
            optionGroups: card.optionGroups,
            removable: card.removableIngredients,
            extras: card.extraIngredients,
            description: card.description ?? null,
          },
          {
            // The restaurant's own name says what the product is ("Peynirli Gözleme"); the pool's name ("Gözleme")
            // is kept alongside so a choice either of them makes is not asked again.
            productName: item.rawName,
            alsoNamed: item.canonicalName,
            type,
            byName: resolved.byName && resolved.type.key === type.key,
            source,
            // What the panel screenshot already shows filled is not asked about again.
            want: {
              options: item.hasOptions !== 'present',
              ingredients: item.hasRemovables !== 'present',
              description: item.hasDescription !== 'present',
            },
            feedback: deps.feedback,
          },
        );
        grounding.push(...grounded.notes.map((n) => `${card.targetName}: ${n}`));
        const empty =
          grounded.optionGroups.length === 0 && grounded.removable.length === 0 && grounded.extras.length === 0 && !grounded.description;
        if (empty) return null;
        return {
          ...card,
          optionGroups: grounded.optionGroups,
          removableIngredients: grounded.removable,
          extraIngredients: grounded.extras,
          description: grounded.description,
          productType: type.key,
          confidence: grounded.confidence,
        };
      };

      for (const card of input.options) {
        const item = onMenu.get(card.targetNormalized);
        if (!item) {
          dropped.push({ card: card.targetName, reason: 'opsiyon önerisi menüde olmayan ürüne ait' });
          continue;
        }
        // The last line of defence for the plain-row rule: a packaged drink never gets a card (D-175).
        if (deps.productTypes.isPlain(item.productType)) {
          dropped.push({ card: card.targetName, reason: 'hazır içecek panelde düz ürün olarak girilir' });
          continue;
        }
        if (seenTargets.has(card.targetNormalized)) {
          dropped.push({ card: card.targetName, reason: 'aynı ürün için ikinci opsiyon kartı' });
          continue;
        }
        const grounded = groundCard(card, item, card.source === 'db' ? 'pool' : 'model');
        if (!grounded) {
          dropped.push({ card: card.targetName, reason: 'geçerli opsiyon veya malzeme kalmadı' });
          continue;
        }
        seenTargets.add(card.targetNormalized);
        optionCards.push(grounded);
      }

      // --- coverage: every product the plan promised a card gets one ------------------------------------------
      let completed = 0;
      for (const item of input.optionTargets ?? []) {
        if (seenTargets.has(item.normalized) || deps.productTypes.isPlain(item.productType)) continue;
        const card = groundCard(
          {
            targetName: item.canonicalName ?? item.rawName,
            targetNormalized: item.normalized,
            matchedTemplateId: item.matchedTemplateId,
            optionGroups: [],
            removableIngredients: [],
            extraIngredients: [],
            description: null,
            reason: 'Bu tür ürünlerde standart olan opsiyon ve malzemeler',
            source: 'db',
          },
          item,
          'kb',
        );
        if (!card) continue;
        seenTargets.add(item.normalized);
        optionCards.push(card);
        completed += 1;
      }

      const reachable = input.current + newProducts.length;
      const result: ValidationResult = {
        newProducts,
        options: optionCards,
        dropped,
        reachable,
        targetUnreachable: reachable < input.target,
      };
      return {
        value: result,
        status: 'ok' as const,
        output: {
          kept: newProducts.length,
          options: optionCards.length,
          completedFromKnowledge: completed,
          dropped: dropped.length,
          reasons: dropped.slice(0, 20),
          grounding: grounding.slice(0, 40),
          reachable,
          target: input.target,
        },
      };
    },
  );
}

// ---- the Validator's single model round -------------------------------------------------------------------------

export interface CheckedGeneration<T> {
  result: RoutedResult<T>;
  /** Every attempt, the repair round included — hand these to the tracer. */
  attempts: AttemptRecord[];
  repaired: boolean;
}

/**
 * Calls a model and, when its answer fails the JSON schema (the deterministic check), gives it exactly ONE repair
 * round. The repair runs on the Validator's own route, `agent.validate` — a small model by default, because putting
 * an answer back into shape is mechanical work. There is never a second round: a live call cannot wait for one, and
 * an answer that fails twice is dropped, not shown.
 */
export async function generateChecked<T>(
  deps: { router: AiRouter; prompts: PromptRepository },
  request: RouterRequest<T>,
  ctx: CallContext,
): Promise<CheckedGeneration<T>> {
  const first = await deps.router.generate(request, ctx);
  const attempts = [...first.attempts];
  if (first.ok || first.error.kind !== 'invalid_output') return { result: first, attempts, repaired: false };

  const repair = await deps.prompts.render('repair.user', {
    errors: (first.error.issues ?? []).join('\n'),
    previous: (first.error.raw ?? '').slice(0, 4000),
  });
  const second = await deps.router.generate({ ...request, task: 'agent.validate', user: `${request.user}\n\n${repair.text}` }, ctx);
  attempts.push(...second.attempts);
  return { result: second, attempts, repaired: true };
}
