import type { PromptRepository } from '../ai/prompt-repository.js';
import type { AiRouter, AttemptRecord, CallContext, RoutedResult, RouterRequest } from '../ai/router.js';
import { templateOptionGroupSchema, type TemplateOptionGroup, type TemplatePayload } from '../domain/template.js';
import { cleanItemName } from '../lib/clean-name.js';
import { normalizeTr } from '../lib/normalize-tr.js';
import { containsPriceAmount, stripPriceAmounts } from '../lib/price-guard.js';
import { trigramSimilarity } from '../lib/trigram.js';
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
}

export interface ValidationResult {
  newProducts: ValidatedNewProduct[];
  options: OptionCard[];
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
   * Category key → how many products the cuisine is still short of. A category missing from the map is not
   * expected in this cuisine at all; one at 0 is already covered. Both refuse further recommendations.
   */
  categoryQuota: ReadonlyMap<string, number>;
  current: number;
  target: number;
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
      if (trigramSimilarity(name, normalized) >= VARIANT_SIMILARITY) return true;
    }
    return false;
  }
}

function toPayload(item: RecommendedItem, portionExtra: string): TemplatePayload | null {
  const description = stripPriceAmounts(item.shortDescription).trim().slice(0, 160);
  const portionInfo = [item.portionInfo, portionExtra].filter((p) => p.trim().length > 0).join(' · ').slice(0, 80);
  const payload: TemplatePayload = {
    name: item.name,
    description,
    servingNote: '',
    portionInfo: stripPriceAmounts(portionInfo).trim(),
    optionGroups: [],
    removableIngredients: [],
    extraIngredients: [],
    tags: [],
    allergenNotes: [],
    upsellSuggestion: '',
  };
  // The canonical schema is the same one the DB enforces: a payload that fails here would fail on accept.
  return payload.name.length > 0 && !containsPriceAmount(`${payload.name} ${payload.description} ${payload.portionInfo}`)
    ? payload
    : null;
}

/** Drops option groups that break the canonical rules rather than dropping the whole card. */
function validGroups(groups: readonly TemplateOptionGroup[]): { kept: TemplateOptionGroup[]; dropped: number } {
  const kept: TemplateOptionGroup[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const group of groups) {
    const normalized = normalizeTr(group.name);
    if (seen.has(normalized)) {
      dropped += 1;
      continue;
    }
    const parsed = templateOptionGroupSchema.safeParse(group);
    if (!parsed.success) {
      dropped += 1;
      continue;
    }
    seen.add(normalized);
    kept.push(parsed.data);
  }
  // At most one sets_base group per product (the canonical payload rule).
  const baseIndexes = kept.map((g, i) => (g.options.some((o) => o.priceMode === 'sets_base') ? i : -1)).filter((i) => i >= 0);
  if (baseIndexes.length > 1) {
    for (const index of baseIndexes.slice(1).reverse()) {
      kept.splice(index, 1);
      dropped += 1;
    }
  }
  return { kept, dropped };
}

export async function runValidator(
  deps: Pick<AgentDeps, 'tracer'>,
  input: ValidatorInput,
  _run: AgentRunContext,
): Promise<ValidationResult> {
  return deps.tracer.step(
    'validator',
    'Doğrulama',
    { recommended: input.recommended.length, options: input.options.length, target: input.target },
    async () => {
      const dropped: ValidationIssue[] = [];
      const taken = new TakenIndex();
      for (const item of input.existing) taken.add(item.normalized, item.matchedTemplateId);

      // --- new products -------------------------------------------------------------------------------------
      // The last line of defence for the rule the whole redesign exists for: never more of a category than the
      // menu is actually short of. Both recommender paths already respect it; this makes it impossible to skip.
      const quota = new Map(input.categoryQuota);
      const newProducts: ValidatedNewProduct[] = [];
      for (const raw of input.recommended) {
        const template = raw.templateId ? input.templatePayloads?.get(raw.templateId) : undefined;
        // A curated pool name is used as it is; only free model output needs the volume/packaging scrub.
        const { name, movedToPortion } = template ? { name: template.name, movedToPortion: '' } : cleanProductName(raw.name);
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
        if (left <= 0) {
          dropped.push({ card: raw.name, reason: `${raw.categoryKey} kategorisi zaten yeterli` });
          continue;
        }
        const reason = stripPriceAmounts(raw.reason).trim();
        const item: RecommendedItem = {
          ...raw,
          name,
          normalized,
          reason,
          // The pasteable text on the card is exactly what accepting it writes to the pool.
          shortDescription: template?.description || raw.shortDescription,
          portionInfo: template?.portionInfo || raw.portionInfo,
          // A price hint is allowed here on purpose — it is a talking point for the call, never written to a
          // template. `toPayload` strips every amount from what reaches the pool.
          priceRangeHint: raw.priceRangeHint.trim(),
        };
        // Template-backed: the whole curated template, options included. Otherwise a minimal, price-free payload.
        const payload = template ?? toPayload(item, movedToPortion);
        if (!payload) {
          dropped.push({ card: raw.name, reason: 'şema/fiyat kontrolünden geçmedi' });
          continue;
        }
        quota.set(raw.categoryKey, left - 1);
        taken.add(normalized, raw.templateId);
        newProducts.push({ ...item, payload });
      }

      // --- option cards -------------------------------------------------------------------------------------
      const onMenu = new Set(input.existing.map((i) => i.normalized));
      const optionCards: OptionCard[] = [];
      const seenTargets = new Set<string>();
      for (const card of input.options) {
        if (!onMenu.has(card.targetNormalized)) {
          dropped.push({ card: card.targetName, reason: 'opsiyon önerisi menüde olmayan ürüne ait' });
          continue;
        }
        if (seenTargets.has(card.targetNormalized)) {
          dropped.push({ card: card.targetName, reason: 'aynı ürün için ikinci opsiyon kartı' });
          continue;
        }
        const { kept, dropped: badGroups } = validGroups(card.optionGroups as TemplateOptionGroup[]);
        if (badGroups > 0) dropped.push({ card: card.targetName, reason: `${badGroups} opsiyon grubu şemadan geçmedi` });
        const removable = card.removableIngredients.filter((i) => i.trim().length > 0 && !containsPriceAmount(i));
        if (kept.length === 0 && removable.length === 0) {
          dropped.push({ card: card.targetName, reason: 'geçerli opsiyon veya malzeme kalmadı' });
          continue;
        }
        seenTargets.add(card.targetNormalized);
        optionCards.push({
          ...card,
          optionGroups: kept,
          removableIngredients: removable,
          extraIngredients: card.extraIngredients.filter((i) => i.trim().length > 0 && !containsPriceAmount(i)),
        });
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
          dropped: dropped.length,
          reasons: dropped.slice(0, 20),
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
