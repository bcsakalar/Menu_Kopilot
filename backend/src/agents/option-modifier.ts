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

export async function runOptionModifier(
  deps: Pick<AgentDeps, 'db' | 'router' | 'prompts' | 'categories' | 'tracer'>,
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
          reason: 'Havuzdaki onaylı karttan alındı',
          source: 'db',
        });
      }

      const covered = new Set(dbCards.map((c) => c.targetNormalized));
      const forModel = targets.filter((t) => !covered.has(t.normalized));
      if (forModel.length === 0 || run.signal.aborted || !input.aiUsable) {
        return {
          value: { ...empty, items: dbCards, fromDb: dbCards.length } satisfies OptionModifierResult,
          output: { fromDb: dbCards.length, fromAi: 0, names: dbCards.map((c) => c.targetName) },
        };
      }

      // --- the rest go to the model, in small batches ------------------------------------------------------
      const examples = await exampleTemplates(deps, input.cuisine.id);
      const system = (await deps.prompts.render('agent.options.system')).text;
      const batches: ExistingItem[][] = [];
      for (let i = 0; i < forModel.length && batches.length < MAX_BATCHES; i += BATCH) {
        batches.push(forModel.slice(i, i + BATCH));
      }

      const runs = await Promise.all(
        batches.map(async (batch, batchIndex) => {
          const user = (
            await deps.prompts.render('agent.options.user', {
              cuisine: input.cuisine.name,
              items: batch
                .map((t) => {
                  const name = t.canonicalName ?? t.rawName;
                  const known = t.optionNames.length > 0 ? ` (ekranda görünen gruplar: ${t.optionNames.join(', ')})` : '';
                  return `- ${name}${known}`;
                })
                .join('\n'),
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
        const target = byNormalized.get(normalizeTr(parsed.data.targetName));
        if (!target || aiCards.some((c) => c.targetNormalized === target.normalized)) continue;
        if (parsed.data.optionGroups.length === 0 && parsed.data.removableIngredients.length === 0) continue;
        aiCards.push({
          targetName: target.canonicalName ?? target.rawName,
          targetNormalized: target.normalized,
          matchedTemplateId: target.matchedTemplateId,
          optionGroups: parsed.data.optionGroups,
          removableIngredients: parsed.data.removableIngredients,
          extraIngredients: parsed.data.extraIngredients,
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
