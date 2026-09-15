import { and, eq, inArray } from 'drizzle-orm';
import { RequestBudget } from '../../ai/budget.js';
import { providerFailure } from '../../ai/errors.js';
import type { PromptRepository } from '../../ai/prompt-repository.js';
import type { AiRouter } from '../../ai/router.js';
import type { WebSource } from '../../ai/types.js';
import { type Cache, getJson, setJson } from '../../cache/cache.js';
import type { Database } from '../../db/client.js';
import { branchMenuItems } from '../../db/schema/index.js';
import { cleanItemName } from '../../lib/clean-name.js';
import { stripContactDetails } from '../../lib/contact-guard.js';
import { notFound } from '../../lib/errors.js';
import { sha256Hex } from '../../lib/images.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import { containsPriceAmount, stripPriceAmounts } from '../../lib/price-guard.js';
import { requireBranch } from '../branches/branch-menu.js';
import { MenuIndex } from '../gap/recommend.js';
import { CuisineGraph } from '../retrieval/cuisine-graph.js';
import type { RetrievalService } from '../retrieval/retrieval.service.js';
import { clampText } from '../suggest/sanitize.js';
import {
  type ResearchRequest,
  type ResearchResultDto,
  type StoredResearch,
  researchEnvelopeSchema,
  researchItemSchema,
  researchLlmSchema,
  researchSourceSchema,
  storedResearchSchema,
} from './schemas.js';

export const RESEARCH_TTL_SECONDS = 7 * 24 * 3600;
export const MAX_RESEARCH_ITEMS = 60;
const MAX_SOURCES = 8;
const SUMMARY_MAX = 300;

function cleanText(value: string, max: number): string {
  const text = clampText(stripContactDetails(stripPriceAmounts(value)), max);
  return containsPriceAmount(text) ? '' : text;
}

/** Web search sources first (real pages), then the ones the model cited; http(s) only, de-duplicated. */
export function mergeSources(tool: readonly WebSource[] | undefined, cited: readonly unknown[]): WebSource[] {
  const out: WebSource[] = [];
  const seen = new Set<string>();
  const push = (title: string, url: string) => {
    const clean = url.trim();
    if (!/^https?:\/\/\S+$/i.test(clean) || seen.has(clean) || out.length >= MAX_SOURCES) return;
    seen.add(clean);
    out.push({ title: clampText(stripContactDetails(title), 120) || clean, url: clean });
  };
  for (const source of tool ?? []) push(source.title, source.url);
  for (const raw of cited) {
    const parsed = researchSourceSchema.safeParse(raw);
    if (parsed.success) push(parsed.data.title ?? parsed.data.url, parsed.data.url);
  }
  return out;
}

/**
 * "Bu restoranı internetten araştır" (Faz 7): Groq compound searches the web (and reads pages) for the restaurant's
 * menu; the answer is cleaned (no prices, no contact details), matched to templates and compared with the branch
 * menu. Results are cached for 7 days per restaurant + city + cuisine + prompt version.
 */
export class ResearchService {
  constructor(
    private readonly deps: {
      db: Database;
      router: AiRouter;
      prompts: PromptRepository;
      retrieval: RetrievalService;
      cache: Cache;
    },
  ) {}

  private async callModel(userId: string, vars: { name: string; city: string; cuisine: string; notes: string }): Promise<StoredResearch> {
    const { router, prompts } = this.deps;
    const system = (await prompts.render('research.system')).text;
    const user = (await prompts.render('research.user', vars)).text;
    // Web pages inflate the prompt tokens of the compound call; one call + one repair at most.
    const ctx = { userId, budget: new RequestBudget(2, 250_000) };
    const request = {
      task: 'research.web' as const,
      schema: researchEnvelopeSchema,
      providerSchema: researchLlmSchema,
      schemaName: 'restaurant_research',
      system,
      user,
    };
    let result = await router.generate(request, ctx);
    if (!result.ok && result.error.kind === 'invalid_output' && result.route) {
      const repair = await prompts.render('repair.user', {
        errors: (result.error.issues ?? []).join('\n'),
        previous: (result.error.raw ?? '').slice(0, 6000),
      });
      result = await router.generateOnRoute({ ...request, user: `${user}\n\n${repair.text}` }, result.route, ctx);
    }
    if (!result.ok) throw providerFailure(result.error, 'İnternet araştırması');

    const value = result.value;
    const seen = new Set<string>();
    const items: StoredResearch['items'] = [];
    for (const raw of value.items) {
      const parsed = researchItemSchema.safeParse(raw);
      if (!parsed.success) continue;
      const name = clampText(cleanItemName(stripContactDetails(stripPriceAmounts(parsed.data.name))), 80);
      const normalized = normalizeTr(name);
      if (name.length < 2 || normalized === '' || seen.has(normalized) || containsPriceAmount(name)) continue;
      seen.add(normalized);
      const section = parsed.data.section ? cleanText(parsed.data.section, 60) : '';
      items.push({ name, section: section || null });
      if (items.length >= MAX_RESEARCH_ITEMS) break;
    }
    const found = value.found && items.length > 0;
    return {
      found,
      summary: cleanText(value.summary, SUMMARY_MAX),
      cuisine: value.cuisine ? cleanText(value.cuisine, 60) || null : null,
      confidence: Math.max(0, Math.min(1, value.confidence)),
      items: found ? items : [],
      sources: mergeSources(result.meta.sources, value.sources),
      provider: result.meta.provider,
      model: result.meta.model,
      researchedAt: new Date().toISOString(),
    };
  }

  async research(userId: string, input: ResearchRequest): Promise<ResearchResultDto> {
    const { db, cache, prompts, retrieval } = this.deps;
    let name = input.restaurantName;
    let city = input.city;
    let cuisineId = input.cuisineId;
    let menu: MenuIndex | undefined;
    if (input.branchId) {
      const branch = await requireBranch(db, input.branchId, userId);
      name ??= branch.name;
      city ??= branch.city ?? undefined;
      cuisineId ??= branch.cuisineId;
      const rows = await db
        .select({ normalizedName: branchMenuItems.normalizedName, matchedItemId: branchMenuItems.matchedItemId })
        .from(branchMenuItems)
        .where(and(eq(branchMenuItems.branchId, branch.id), inArray(branchMenuItems.status, ['ok', 'incomplete'])));
      menu = new MenuIndex();
      for (const row of rows) menu.add(row.normalizedName, row.matchedItemId);
    }
    if (!name) throw notFound('Restoran adı');
    const graph = await CuisineGraph.load(db);
    const cuisine = cuisineId ? graph.get(cuisineId) : undefined;
    if (cuisineId && !cuisine) throw notFound('Mutfak türü');

    const tag = sha256Hex(await prompts.versionTag(['research.system', 'research.user'])).slice(0, 12);
    const key = `mk:r:${sha256Hex(JSON.stringify([normalizeTr(name), normalizeTr(city ?? ''), cuisine?.id ?? '', input.notes ?? ''])).slice(0, 24)}:${tag}`;
    let stored = input.refresh ? undefined : await getJson(cache, key, storedResearchSchema);
    const cached = stored !== undefined;
    if (!stored) {
      stored = await this.callModel(userId, {
        name,
        city: city ?? '-',
        cuisine: cuisine?.name ?? '-',
        notes: input.notes ?? '-',
      });
      await setJson(cache, key, stored, RESEARCH_TTL_SECONDS);
    }

    const normalizedNames = stored.items.map((item) => normalizeTr(item.name));
    const outcome = await retrieval.match(normalizedNames, cuisine?.id ?? '', graph, { useVector: false });
    return {
      restaurantName: name,
      city: city ?? null,
      found: stored.found,
      summary: stored.summary,
      cuisine: stored.cuisine,
      confidence: stored.confidence,
      items: stored.items.map((item, index) => {
        const normalized = normalizedNames[index] ?? '';
        const hit = outcome.hits.get(normalized);
        return {
          name: item.name,
          section: item.section,
          matchedTemplateId: hit?.templateId ?? null,
          templateName: hit?.canonicalName ?? null,
          onMenu: menu ? menu.has(normalized, hit?.templateId ?? null) : null,
        };
      }),
      sources: stored.sources,
      cached,
      provider: stored.provider,
      model: stored.model,
      researchedAt: stored.researchedAt,
    };
  }
}
