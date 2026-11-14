import { and, eq, inArray } from 'drizzle-orm';
import type { AttemptRecord } from '../ai/router.js';
import type { Executor } from '../db/client.js';
import { cuisines, itemAliases, menuItems } from '../db/schema/index.js';
import type { ProductTypeIndex } from '../domain/product-type.js';
import { normalizeTr } from '../lib/normalize-tr.js';
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

/** Per normalized product name, the cuisines whose approved pool keeps it (by name or by alias). */
export type PoolHomes = ReadonlyMap<string, ReadonlySet<string>>;

/** Where the pool keeps each of these products: one query by name, one by alias (D-217). */
export async function poolHomes(db: Executor, names: readonly string[]): Promise<Map<string, Set<string>>> {
  const unique = [...new Set(names.map(normalizeTr).filter(Boolean))];
  const homes = new Map<string, Set<string>>();
  if (unique.length === 0) return homes;
  const add = (name: string, slug: string): void => {
    const set = homes.get(name) ?? new Set<string>();
    set.add(slug);
    homes.set(name, set);
  };
  const byName = await db
    .select({ name: menuItems.normalizedName, slug: cuisines.slug })
    .from(menuItems)
    .innerJoin(cuisines, eq(cuisines.id, menuItems.cuisineId))
    .where(and(eq(menuItems.approved, true), inArray(menuItems.normalizedName, unique)));
  for (const row of byName) add(row.name, row.slug);
  const byAlias = await db
    .select({ name: itemAliases.normalizedAlias, slug: cuisines.slug })
    .from(itemAliases)
    .innerJoin(menuItems, eq(menuItems.id, itemAliases.menuItemId))
    .innerJoin(cuisines, eq(cuisines.id, menuItems.cuisineId))
    .where(and(eq(menuItems.approved, true), inArray(itemAliases.normalizedAlias, unique)));
  for (const row of byAlias) add(row.name, row.slug);
  return homes;
}

/** A product the pool keeps says more than its type: two votes, shared by the cuisines that keep it (D-217). */
const POOL_VOTE = 2;
/** The pool decides alone when this share of the menu is the leading cuisine's own products… */
const DECISIVE_SHARE = 0.6;
/** …and the leader is this far ahead of the next cuisine. */
const DECISIVE_LEAD = 1.5;
/** Nothing on the menu points anywhere: the mixed world kitchen is the least wrong guess (D-217). */
export const GENERAL_CUISINE = 'dunya-mutfagi';

export interface MenuCuisine {
  guess: CuisineOption | undefined;
  /** Set when the pool alone is clear enough to skip the model: how many products, and what share, back the guess. */
  decisive: { found: number; share: number } | undefined;
}

/**
 * The cuisine read off the menu without a model (D-187, D-217). Each product votes:
 *   - the cuisines whose pool keeps it, two votes shared among them ("Bol Soğanlı Tantuni" is only Tantuni's);
 *   - the cuisines its type is typical of, a full vote for the type's home cuisine and a third for the others. A
 *     type with no cuisine of its own ("Aile" makes "Çiğ Köfte Aile Boyu" a combo) hands the vote to the other types
 *     the name names.
 * Before the pool voted, a meze list ("Haydari, Kısır, Muhammara…") read as kebap, a tantuni as döner, and a name no
 * type knew ("Buffalo Wings") as the first cuisine in the list.
 */
export function readMenuCuisine(
  itemNames: readonly string[],
  productTypes: Pick<ProductTypeIndex, 'resolve' | 'matching'>,
  options: readonly CuisineOption[],
  homes: PoolHomes = new Map(),
): MenuCuisine {
  const votes = new Map<string, number>();
  const vote = (slug: string, weight: number): void => {
    votes.set(slug, (votes.get(slug) ?? 0) + weight);
  };
  for (const name of itemNames) {
    const home = homes.get(normalizeTr(name));
    if (home && home.size > 0) for (const slug of home) vote(slug, POOL_VOTE / home.size);
    const { type, byName } = productTypes.resolve(name);
    const voters = byName && type.cuisines.length > 0 ? [type] : productTypes.matching(name).filter((t) => t.cuisines.length > 0);
    for (const voter of voters) voter.cuisines.forEach((slug, index) => vote(slug, (index === 0 ? 1 : 0.3) / voters.length));
  }
  const ranked = options
    .map((option) => ({ option, votes: votes.get(option.slug) ?? 0 }))
    .filter((entry) => entry.votes > 0)
    .sort((a, b) => b.votes - a.votes);
  const leader = ranked[0];
  if (!leader) return { guess: undefined, decisive: undefined };
  const found = itemNames.filter((name) => homes.get(normalizeTr(name))?.has(leader.option.slug)).length;
  const share = found / Math.max(1, itemNames.length);
  const ahead = leader.votes >= (ranked[1]?.votes ?? 0) * DECISIVE_LEAD;
  const onlyHome = itemNames.length === 1 && found === 1 && homes.get(normalizeTr(itemNames[0]!))?.size === 1;
  const decisive = ahead && ((found >= 2 && share >= DECISIVE_SHARE) || onlyHome) ? { found, share } : undefined;
  return { guess: leader.option, decisive };
}

/** `readMenuCuisine`'s guess alone; undefined when nothing on the menu says anything. */
export function guessCuisine(
  itemNames: readonly string[],
  productTypes: Pick<ProductTypeIndex, 'resolve' | 'matching'>,
  options: readonly CuisineOption[],
  homes: PoolHomes = new Map(),
): CuisineOption | undefined {
  return readMenuCuisine(itemNames, productTypes, options, homes).guess;
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
