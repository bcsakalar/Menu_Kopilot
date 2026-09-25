import { and, desc, eq } from 'drizzle-orm';
import type { AttemptRecord } from '../ai/router.js';
import { menuItems } from '../db/schema/index.js';
import { normalizeTr } from '../lib/normalize-tr.js';
import { getTemplates } from '../modules/templates/template-store.js';
import {
  OPTION_MODIFIER_SCHEMA_NAME,
  optionModifierSchema,
  optionSuggestionSchema,
  type OptionSuggestion,
} from './schemas/option-modifier.js';
import { countCalls, type AgentDeps, type AgentRunContext, type ExistingItem } from './types.js';
import { generateChecked } from './validator.js';

/**
 * Agent 5 — Option/Modifier. Option groups and ingredients for products the restaurant ALREADY sells.
 *
 * Template first: a product that matches an approved template already has a curated option set, so it is copied
 * straight out of the pool with no model call. Only products the pool does not know reach the model.
 */

export interface OptionCard {
  targetName: string;
  targetNormalized: string;
  matchedTemplateId: string | null;
  optionGroups: OptionSuggestion['optionGroups'];
  removableIngredients: string[];
  extraIngredients: string[];
  /** The proposed panel description (6–8 words); the Validator decides whether it is usable. */
  description: string | null;
  reason: string;
  source: 'db' | 'ai';
}

export interface OptionModifierInput {
  cuisine: { id: string; name: string };
  /** Products on the menu whose option info is missing. */
  targets: readonly ExistingItem[];
  limit: number;
  /** How long one model attempt may take; the mode decides (see `plan.ts`). */
  attemptTimeoutMs: number;
  /** How many model calls this agent may make (they run in parallel); the mode decides. */
  maxBatches?: number;
  /**
   * How many of the products the pool does not know go to the model. The others get no card here; the Validator
   * builds theirs from the knowledge base (coverage guarantee), so quick mode stays two calls on a long menu.
   */
  modelLimit?: number;
  /** False when no provider is configured / the quota is spent: only the template pool answers. */
  aiUsable: boolean;
}

export interface OptionModifierResult {
  items: OptionCard[];
  fromDb: number;
  fromAi: number;
  attempts: AttemptRecord[];
  provider?: string;
  model?: string;
  llmCalls: number;
  error?: string;
}

const EXAMPLE_TEMPLATES = 3;
/**
 * Products per model call. One call for twenty products answers with twenty thin cards (and, on a free tier,
 * runs into the per-minute output limit mid-answer); batches of this size come back complete and run in
 * parallel, so "tam" mode costs the same wall clock as "yeter" mode did.
 */
const BATCH = 6;
const MAX_BATCHES = 4;

/**
 * Splits the products into at most `maxBatches` calls of at most BATCH each, evenly: seven products are 4 + 3, not
 * 6 + 1 — the slower of two parallel calls decides the wall clock, so the two should be the same size.
 */
export function splitBatches<T>(items: readonly T[], maxBatches: number): T[][] {
  const capped = items.slice(0, BATCH * Math.max(1, maxBatches));
  const count = Math.min(Math.max(1, maxBatches), Math.ceil(capped.length / BATCH));
  if (capped.length === 0) return [];
  const size = Math.ceil(capped.length / count);
  const out: T[][] = [];
  for (let i = 0; i < capped.length; i += size) out.push(capped.slice(i, i + size));
  return out;
}

/** The knowledge-base context for the products of one batch: each product type once, however many products share it. */
function typeGuide(deps: Pick<AgentDeps, 'productTypes' | 'feedback'>, batch: readonly ExistingItem[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const item of batch) {
    const type = deps.productTypes.get(item.productType);
    if (!type || seen.has(type.key)) continue;
    seen.add(type.key);
    const groups = type.optionGroups
      .map((g) => {
        const kind = g.options.some((o) => o.priceMode === 'sets_base') ? 'taban fiyat' : g.selectionType === 'single' ? 'tek seçim' : 'çoklu seçim';
        return `${g.name} [${kind}${g.isRequired ? ', zorunlu' : ''}]: ${g.options.map((o) => o.name).join(', ')}`;
      })
      .join(' | ');
    const rejected = deps.feedback.rejectedFor(type.key);
    const favored = deps.feedback.favoredFor(type.key);
    lines.push(
      [
        `${type.key} — ${type.label}`,
        `  tipik gruplar: ${groups || '-'}`,
        `  tipik çıkarılabilir: ${type.removable.join(', ') || '-'}`,
        `  tipik ekstra: ${type.extras.join(', ') || '-'}`,
        `  bu tipte ASLA olmayan gruplar: ${type.forbiddenGroups.join(', ') || '-'}`,
        ...(rejected.length > 0 ? [`  ekibin sürekli sildiği öneriler (önerme): ${rejected.join(', ')}`] : []),
        ...(favored.length > 0 ? [`  ekibin hep kabul ettiği öneriler (uygunsa öner): ${favored.join(', ')}`] : []),
      ].join('\n'),
    );
  }
  return lines.join('\n') || '-';
}

export async function runOptionModifier(
  deps: Pick<AgentDeps, 'db' | 'router' | 'prompts' | 'categories' | 'tracer' | 'productTypes' | 'feedback'>,
  input: OptionModifierInput,
  run: AgentRunContext,
): Promise<OptionModifierResult> {
  const empty: OptionModifierResult = { items: [], fromDb: 0, fromAi: 0, attempts: [], llmCalls: 0 };
  if (input.targets.length === 0 || input.limit <= 0) {
    await deps.tracer.skip('option_modifier', 'Opsiyon & malzeme', 'opsiyonu eksik ürün yok');
    return empty;
  }

  return deps.tracer.step(
    'option_modifier',
    'Opsiyon & malzeme',
    { targets: input.targets.length, limit: input.limit },
    async () => {
      const targets = input.targets.slice(0, input.limit);

      // --- from the template pool (no model call) -----------------------------------------------------------
      const withTemplate = targets.filter((t) => t.matchedTemplateId !== null);
      const templates = await getTemplates(
        deps.db,
        withTemplate.map((t) => t.matchedTemplateId!),
      );
      const templateById = new Map(templates.map((t) => [t.id, t]));
      const dbCards: OptionCard[] = [];
      for (const target of withTemplate) {
        const template = templateById.get(target.matchedTemplateId!);
        if (!template) continue;
        const payload = template.payload;
        if (payload.optionGroups.length === 0 && payload.removableIngredients.length === 0) continue;
        dbCards.push({
          targetName: target.canonicalName ?? target.rawName,
          targetNormalized: target.normalized,
          matchedTemplateId: template.id,
          optionGroups: payload.optionGroups.map((group) => ({
            name: group.name,
            selectionType: group.selectionType,
            isRequired: group.isRequired,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            options: group.options.map((option) => ({ name: option.name, priceMode: option.priceMode })),
          })),
          removableIngredients: [...payload.removableIngredients],
          extraIngredients: payload.extraIngredients.map((i) => i.name),
          description: payload.description || null,
          reason: 'Bu ürün için kayıtlı kart',
          source: 'db',
        });
      }

      const covered = new Set(dbCards.map((c) => c.targetNormalized));
      const forModel = targets.filter((t) => !covered.has(t.normalized)).slice(0, input.modelLimit ?? targets.length);
      if (forModel.length === 0 || run.signal.aborted || !input.aiUsable) {
        return {
          value: { ...empty, items: dbCards, fromDb: dbCards.length } satisfies OptionModifierResult,
          output: { fromDb: dbCards.length, fromAi: 0, names: dbCards.map((c) => c.targetName) },
        };
      }

      // --- the rest go to the model, in small batches ------------------------------------------------------
      const examples = await exampleTemplates(deps, input.cuisine.id);
      const system = (await deps.prompts.render('agent.options.system')).text;
      const batches = splitBatches(forModel, input.maxBatches ?? MAX_BATCHES);

      const runs = await Promise.all(
        batches.map(async (batch, batchIndex) => {
          const user = (
            await deps.prompts.render('agent.options.user', {
              cuisine: input.cuisine.name,
              items: batch
                .map((t) => {
                  const name = t.canonicalName ?? t.rawName;
                  const known = t.optionNames.length > 0 ? ` (ekranda görünen gruplar: ${t.optionNames.join(', ')})` : '';
                  return `- ${name} [tip: ${t.productType}]${known}`;
                })
                .join('\n'),
              types: typeGuide(deps, batch),
              examples,
              max: batch.length,
            })
          ).text;
          // Invalid JSON gets exactly one repair round, owned by the Validator (see generateChecked).
          return generateChecked(
            deps,
            {
              task: 'agent.options' as const,
              schema: optionModifierSchema,
              schemaName: OPTION_MODIFIER_SCHEMA_NAME,
              system,
              user,
              timeoutMs: input.attemptTimeoutMs,
              // Batches in flight at the same time start on different providers (see RouterRequest.routeOffset).
              routeOffset: batchIndex,
            },
            run.ctx,
          );
        }),
      );

      const attempts = runs.flatMap((r) => r.attempts);
      const llmCalls = countCalls(attempts);
      const ok = runs.flatMap((r) => (r.result.ok ? [r.result] : []));
      if (ok.length === 0) {
        const first = runs[0]?.result;
        const error = first && !first.ok ? `${first.error.kind}: ${first.error.message}` : 'model cevabı yok';
        return {
          value: { ...empty, items: dbCards, fromDb: dbCards.length, attempts, llmCalls, error } satisfies OptionModifierResult,
          status: dbCards.length > 0 ? ('ok' as const) : ('failed' as const),
          error,
          attempts,
          output: { fromDb: dbCards.length, fromAi: 0 },
        };
      }

      // The model may only answer for products it was given; anything else is a hallucinated target. The prompt
      // lists the canonical spelling ("Tel Kadayıf") while the menu row is keyed by the raw one ("kadayif"), so an
      // answer is matched on either.
      const byNormalized = new Map<string, ExistingItem>();
      for (const target of forModel) {
        byNormalized.set(target.normalized, target);
        if (target.canonicalName) byNormalized.set(normalizeTr(target.canonicalName), target);
      }
      const aiCards: OptionCard[] = [];
      for (const candidate of ok.flatMap((r) => r.value.items)) {
        const parsed = optionSuggestionSchema.safeParse(candidate);
        if (!parsed.success) continue;
        // The prompt writes "Adana Kebap [tip: kebap-porsiyon]"; a model that copies the tag along still means the product.
        const target = byNormalized.get(normalizeTr(parsed.data.targetName.replace(/\s*\[[^\]]*\]\s*$/u, '')));
        if (!target || aiCards.some((c) => c.targetNormalized === target.normalized)) continue;
        // An answer with nothing in it is not a card; the Validator builds this product's card from the knowledge
        // base instead (coverage guarantee), so skipping here loses nothing.
        const description = parsed.data.description?.trim() || null;
        if (parsed.data.optionGroups.length === 0 && parsed.data.removableIngredients.length === 0 && !description) continue;
        aiCards.push({
          targetName: target.canonicalName ?? target.rawName,
          targetNormalized: target.normalized,
          matchedTemplateId: target.matchedTemplateId,
          optionGroups: parsed.data.optionGroups,
          removableIngredients: parsed.data.removableIngredients,
          extraIngredients: parsed.data.extraIngredients,
          description,
          reason: parsed.data.reason,
          source: 'ai',
        });
      }

      const items = [...dbCards, ...aiCards];
      const failed = runs.length - ok.length;
      return {
        value: {
          items,
          fromDb: dbCards.length,
          fromAi: aiCards.length,
          attempts,
          llmCalls,
          provider: ok[0]!.meta.provider,
          model: ok[0]!.meta.model,
        } satisfies OptionModifierResult,
        attempts,
        output: {
          fromDb: dbCards.length,
          fromAi: aiCards.length,
          batches: batches.length,
          ...(failed > 0 ? { failedBatches: failed } : {}),
          names: items.map((c) => c.targetName),
        },
      };
    },
  );
}

/** A few rich templates of the cuisine, as a style reference for the model. */
async function exampleTemplates(deps: Pick<AgentDeps, 'db'>, cuisineId: string): Promise<string> {
  const rows = await deps.db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(eq(menuItems.approved, true), eq(menuItems.cuisineId, cuisineId)))
    .orderBy(desc(menuItems.importance))
    .limit(EXAMPLE_TEMPLATES);
  if (rows.length === 0) return '-';
  const templates = await getTemplates(
    deps.db,
    rows.map((r) => r.id),
  );
  return templates
    .filter((t) => t.payload.optionGroups.length > 0)
    .map((t) => {
      const groups = t.payload.optionGroups
        .map((g) => `    ${g.name} (${g.selectionType}${g.isRequired ? ', zorunlu' : ''}): ${g.options.map((o) => o.name).join(', ')}`)
        .join('\n');
      return `  ${t.payload.name}\n${groups}`;
    })
    .join('\n') || '-';
}
