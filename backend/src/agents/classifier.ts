import type { AttemptRecord } from '../ai/router.js';
import type { ProductTypeIndex } from '../domain/product-type.js';
import { CLASSIFIER_SCHEMA_NAME, classifierSchema, type PriceSegment } from './schemas/classifier.js';
import { countCalls, type AgentDeps, type AgentRunContext } from './types.js';
import { generateChecked } from './validator.js';

/**
 * Agent 2 — Classifier. Guesses the cuisine and the price segment from the extracted products.
 *
 * The user's own choice always wins: this agent only fills a blank, or flags a disagreement so the result screen
 * can offer "bunu … olarak değiştir". It never silently overrides what the specialist picked, and it is skipped
 * entirely when the user already chose a cuisine and confidence would not change anything.
 */

export interface CuisineOption {
  id: string;
  slug: string;
  name: string;
}

export interface ClassifierInput {
  itemNames: readonly string[];
  options: readonly CuisineOption[];
  /** The cuisine the user picked, if any. */
  selected: CuisineOption | undefined;
  /** The cuisine the menu's product types point at (`guessCuisine`) — the answer when the model has none. */
  guess?: CuisineOption | undefined;
}

/**
 * The cuisine read off the menu without a model (D-187): every product whose NAME identifies its type votes for the
 * cuisines that type is typical of — a full vote for the first (its home cuisine), a third for the others. Before this, a run whose
 * classifier could not answer (providers down, a low-confidence guess) fell back to the first cuisine in the list —
 * kebap — and a pizzeria was offered lahmacun. Undefined when nothing on the menu says anything.
 */
export function guessCuisine(
  itemNames: readonly string[],
  productTypes: Pick<ProductTypeIndex, 'resolve'>,
  options: readonly CuisineOption[],
): CuisineOption | undefined {
  const votes = new Map<string, number>();
  for (const name of itemNames) {
    const { type, byName } = productTypes.resolve(name);
    if (!byName || type.cuisines.length === 0) continue;
    type.cuisines.forEach((slug, index) => votes.set(slug, (votes.get(slug) ?? 0) + (index === 0 ? 1 : 0.3)));
  }
  let best: CuisineOption | undefined;
  let bestVotes = 0;
  for (const option of options) {
    const count = votes.get(option.slug) ?? 0;
    if (count > bestVotes) {
      best = option;
      bestVotes = count;
    }
  }
  return best;
}

export interface ClassifierResult {
  cuisine: CuisineOption;
  priceSegment: PriceSegment;
  confidence: number;
  reason: string;
  /** True when the model proposed a different cuisine than the user's pick (the UI offers a one-tap switch). */
  disagrees: boolean;
  suggested: CuisineOption | null;
  attempts: AttemptRecord[];
  llmCalls: number;
}

/** Below this the model's guess is not worth showing, let alone acting on. */
const MIN_CONFIDENCE = 0.45;
const MAX_ITEMS_IN_PROMPT = 60;

export async function runClassifier(
  deps: Pick<AgentDeps, 'router' | 'prompts' | 'tracer'>,
  input: ClassifierInput,
  run: AgentRunContext,
): Promise<ClassifierResult> {
  const fallback = (reason: string): ClassifierResult => ({
    cuisine: input.selected ?? input.guess ?? input.options[0]!,
    priceSegment: 'orta',
    confidence: 0,
    reason,
    disagrees: false,
    suggested: null,
    attempts: [],
    llmCalls: 0,
  });

  if (input.options.length === 0) return fallback('mutfak türü listesi boş');
  // Nothing to classify from: keep the user's pick.
  if (input.itemNames.length === 0) return fallback('menüde ürün yok');

  return deps.tracer.step(
    'classifier',
    'Mutfak türü',
    { items: input.itemNames.length, selected: input.selected?.slug ?? null },
    async () => {
      const system = (await deps.prompts.render('agent.classify.system')).text;
      const user = (
        await deps.prompts.render('agent.classify.user', {
          items: input.itemNames.slice(0, MAX_ITEMS_IN_PROMPT).join(', '),
          cuisines: input.options.map((c) => `${c.slug} | ${c.name}`).join('\n'),
          selected: input.selected ? `${input.selected.slug} | ${input.selected.name}` : 'seçilmedi',
        })
      ).text;

      const { result, attempts } = await generateChecked(
        deps,
        { task: 'agent.classify', schema: classifierSchema, schemaName: CLASSIFIER_SCHEMA_NAME, system, user },
        run.ctx,
      );
      if (!result.ok) {
        return {
          value: fallback(`sınıflandırma başarısız (${result.error.kind})`),
          status: 'failed' as const,
          error: `${result.error.kind}: ${result.error.message}`,
          attempts,
          output: null,
        };
      }

      // A slug outside the offered list is a hallucination: drop it rather than guessing what was meant.
      const proposed = input.options.find((c) => c.slug === result.value.cuisineSlug) ?? null;
      const trusted = proposed !== null && result.value.confidence >= MIN_CONFIDENCE;
      const cuisine = input.selected ?? (trusted ? proposed : (input.guess ?? input.options[0]!));
      const disagrees = trusted && input.selected !== undefined && proposed.id !== input.selected.id;

      return {
        value: {
          cuisine,
          priceSegment: result.value.priceSegment,
          confidence: result.value.confidence,
          reason: result.value.reason,
          disagrees,
          suggested: trusted ? proposed : null,
          attempts,
          llmCalls: countCalls(attempts),
        },
        attempts,
        output: {
          cuisineSlug: result.value.cuisineSlug,
          resolved: cuisine.slug,
          confidence: result.value.confidence,
          priceSegment: result.value.priceSegment,
          disagrees,
        },
      };
    },
  );
}
