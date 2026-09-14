import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ProviderErrorKind } from '../../ai/errors.js';
import type { PromptRepository } from '../../ai/prompt-repository.js';
import type { AiRouter, AttemptRecord, CallContext, RoutedResult } from '../../ai/router.js';
import { type Cache, getJson, setJson } from '../../cache/cache.js';
import type { Database } from '../../db/client.js';
import { menuItems } from '../../db/schema/index.js';
import { type TemplatePayload, templatePayloadSchema } from '../../domain/template.js';
import { sha256Hex } from '../../lib/images.js';
import { trigramSimilarity } from '../../lib/trigram.js';
import type { CuisineGraph } from '../retrieval/cuisine-graph.js';
import { getTemplates } from '../templates/template-store.js';
import { formatZodIssuesShort } from './format.js';
import { enrichmentSchema, itemsEnvelopeSchema, llmItemSchema, type ParsedName } from './schemas.js';
import { reviewPlaceholder, sanitizeLlmItem } from './sanitize.js';

/**
 * Stage C + D — enrichment of unmatched names in batches, strict validation per item, ONE repair attempt for
 * invalid items, then `needs_review` placeholders. Validated AI cards are cached per cuisine + name.
 */

export const REVIEW_CONFIDENCE = 0.5;

export type EnrichKind = 'ai' | 'review' | 'pending';

export interface EnrichOutcome {
  parsed: ParsedName;
  kind: EnrichKind;
  payload: TemplatePayload;
  confidence: number | null;
  reviewReason: string | null;
  fromCache: boolean;
}

export interface EnrichBatchResult {
  outcomes: EnrichOutcome[];
  attempts: AttemptRecord[];
  /** Why items were left pending/review when the LLM could not be used. */
  stopReason?: ProviderErrorKind;
  provider?: string;
  model?: string;
}

const cachedCardSchema = z.object({ payload: templatePayloadSchema, confidence: z.number().nullable() });

const REVIEW_REASONS: Partial<Record<ProviderErrorKind, string>> = {
  local_only: 'Yerel mod açık: AI kullanılmadı, alanları sen doldur.',
  quota_exceeded: 'Günlük AI kotası doldu: alanları sen doldur.',
  invalid_output: 'AI çıktısı doğrulanamadı: alanları sen doldur.',
  content_blocked: 'AI bu ürün için yanıt vermedi: alanları sen doldur.',
};
const UNKNOWN_REASON = 'Bunu bilmiyorum, sen doldur.';

export class EnrichmentService {
  constructor(
    private readonly db: Database,
    private readonly router: AiRouter,
    private readonly prompts: PromptRepository,
    private readonly cache: Cache,
    private readonly ttlSeconds: number,
  ) {}

  private async cacheKey(cuisineId: string, normalized: string): Promise<string> {
    const tag = sha256Hex(await this.prompts.versionTag(['enrich.system', 'enrich.user', 'repair.user'])).slice(0, 12);
    return `mk:e:${cuisineId}:${sha256Hex(normalized).slice(0, 24)}:${tag}`;
  }

  /** Up to 3 approved templates most similar to the batch (same/related cuisine first) as abbreviated few-shots. */
  async buildExamples(cuisineId: string, graph: CuisineGraph, names: readonly string[]): Promise<string> {
    const related = graph.related(cuisineId);
    const rows = await this.db
      .select({ id: menuItems.id, name: menuItems.normalizedName, cuisineId: menuItems.cuisineId, importance: menuItems.importance })
      .from(menuItems)
      .where(and(eq(menuItems.approved, true), inArray(menuItems.cuisineId, related.length > 0 ? related : [cuisineId])));
    const scored = rows
      .map((r) => ({
        id: r.id,
        score:
          Math.max(0, ...names.map((n) => trigramSimilarity(n, r.name))) +
          (r.cuisineId === cuisineId ? 0.2 : 0) +
          r.importance / 1000,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (scored.length === 0) return '';
    const templates = await getTemplates(
      this.db,
      scored.map((s) => s.id),
    );
    const examples = templates.map((t) => ({
      name: t.payload.name,
      description: t.payload.description,
      serving_note: t.payload.servingNote,
      portion_info: t.payload.portionInfo,
      option_groups: t.payload.optionGroups.slice(0, 3).map((g) => ({
        name: g.name,
        selection_type: g.selectionType,
        is_required: g.isRequired,
        min_select: g.minSelect,
        max_select: g.maxSelect,
        options: g.options.slice(0, 5).map((o) => ({ name: o.name, price_mode: o.priceMode })),
      })),
      removable_ingredients: t.payload.removableIngredients.slice(0, 4),
      extra_ingredients: t.payload.extraIngredients.slice(0, 3).map((e) => ({ name: e.name, price_delta_hint: e.priceHint })),
      tags: t.payload.tags,
      upsell_suggestion: t.payload.upsellSuggestion,
    }));
    return `Onaylı örnek kartlar (kısaltılmış):\n${examples.map((e) => JSON.stringify(e)).join('\n')}`;
  }

  private review(parsed: ParsedName, reason: string, payload?: TemplatePayload, confidence: number | null = null): EnrichOutcome {
    return {
      parsed,
      kind: 'review',
      payload: payload ?? reviewPlaceholder(parsed.rawName),
      confidence,
      reviewReason: reason,
      fromCache: false,
    };
  }

  private pending(parsed: ParsedName): EnrichOutcome {
    return { parsed, kind: 'pending', payload: reviewPlaceholder(parsed.rawName), confidence: null, reviewReason: null, fromCache: false };
  }

  /** Validates one raw model item; returns the outcome or the issues for the repair prompt. */
  private validate(raw: unknown, parsed: ParsedName): { ok: true; outcome: EnrichOutcome } | { ok: false; issues: string[] } {
    const item = llmItemSchema.safeParse(raw);
    if (!item.success) return { ok: false, issues: formatZodIssuesShort(item.error) };
    const payload = templatePayloadSchema.safeParse(sanitizeLlmItem(item.data, parsed.rawName));
    if (!payload.success) return { ok: false, issues: formatZodIssuesShort(payload.error) };
    const confidence = Math.max(0, Math.min(1, item.data.confidence));
    if (confidence < REVIEW_CONFIDENCE) {
      return { ok: true, outcome: this.review(parsed, UNKNOWN_REASON, payload.data, confidence) };
    }
    return {
      ok: true,
      outcome: { parsed, kind: 'ai', payload: payload.data, confidence, reviewReason: null, fromCache: false },
    };
  }

  /** Pairs returned items with requested names (by order, falling back to name similarity). */
  private align(items: readonly unknown[], targets: readonly ParsedName[]): unknown[] {
    if (items.length === targets.length) return [...items];
    const names = items.map((it) =>
      typeof it === 'object' && it !== null && 'name' in it && typeof it.name === 'string' ? it.name : '',
    );
    const used = new Set<number>();
    return targets.map((t, index) => {
      let bestIndex = -1;
      let bestScore = 0.45;
      names.forEach((n, i) => {
        if (used.has(i)) return;
        const score = trigramSimilarity(n, t.rawName);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      });
      if (bestIndex < 0 && index < items.length && !used.has(index)) bestIndex = index;
      if (bestIndex < 0) return undefined;
      used.add(bestIndex);
      return items[bestIndex];
    });
  }

  async enrichBatch(
    targets: readonly ParsedName[],
    cuisine: { id: string; name: string },
    examples: string,
    options: { deepMode: boolean; ctx: CallContext },
  ): Promise<EnrichBatchResult> {
    const outcomes = new Map<number, EnrichOutcome>();
    const attempts: AttemptRecord[] = [];

    // Cached AI cards first.
    const toCall: number[] = [];
    for (const [index, parsed] of targets.entries()) {
      const cached = await getJson(this.cache, await this.cacheKey(cuisine.id, parsed.normalized), cachedCardSchema);
      if (cached) {
        outcomes.set(index, { parsed, kind: 'ai', payload: cached.payload, confidence: cached.confidence, reviewReason: null, fromCache: true });
      } else {
        toCall.push(index);
      }
    }
    if (toCall.length === 0) return { outcomes: targets.map((_, i) => outcomes.get(i) as EnrichOutcome), attempts };

    const callTargets = toCall.map((i) => targets[i] as ParsedName);
    const system = (await this.prompts.render('enrich.system')).text;
    const itemsText = callTargets
      .map((t, i) => `${i + 1}. ${t.rawName}${t.sectionText ? ` (bölüm: ${t.sectionText})` : ''}`)
      .join('\n');
    const user = (await this.prompts.render('enrich.user', { cuisine: cuisine.name, examples, items: itemsText })).text;
    const request = {
      task: options.deepMode ? ('deep.analyze' as const) : ('text.item_enrich' as const),
      schema: itemsEnvelopeSchema,
      providerSchema: enrichmentSchema,
      schemaName: 'menu_items',
      system,
      user,
      maxTokens: Math.min(16_000, 700 + callTargets.length * 1100),
    };

    let result: RoutedResult<z.infer<typeof itemsEnvelopeSchema>> = await this.router.generate(request, options.ctx);
    attempts.push(...result.attempts);
    let repaired = false;
    if (!result.ok && result.error.kind === 'invalid_output' && result.route) {
      // Whole output unreadable → one repair with the raw text.
      const repair = await this.prompts.render('repair.user', {
        errors: (result.error.issues ?? []).join('\n'),
        previous: (result.error.raw ?? '').slice(0, 12_000),
      });
      result = await this.router.generateOnRoute({ ...request, user: `${user}\n\n${repair.text}` }, result.route, options.ctx);
      attempts.push(...result.attempts);
      repaired = true;
    }

    if (!result.ok) {
      const kind = result.error.kind;
      for (const [k, index] of toCall.entries()) {
        const parsed = callTargets[k] as ParsedName;
        const reason = REVIEW_REASONS[kind];
        outcomes.set(index, reason ? this.review(parsed, reason) : this.pending(parsed));
      }
      return { outcomes: targets.map((_, i) => outcomes.get(i) as EnrichOutcome), attempts, stopReason: kind };
    }

    const aligned = this.align(result.value.items, callTargets);
    const invalid: { k: number; issues: string[]; raw: unknown }[] = [];
    for (const [k, raw] of aligned.entries()) {
      const parsed = callTargets[k] as ParsedName;
      if (raw === undefined) {
        invalid.push({ k, issues: ['(root): bu ürün çıktıda yok'], raw: { name: parsed.rawName } });
        continue;
      }
      const validated = this.validate(raw, parsed);
      if (validated.ok) outcomes.set(toCall[k] as number, validated.outcome);
      else invalid.push({ k, issues: validated.issues, raw });
    }

    // ONE repair attempt for the invalid items only (never an infinite retry loop).
    if (invalid.length > 0 && !repaired && result.route) {
      const repairTargets = invalid.map((x) => callTargets[x.k] as ParsedName);
      const repair = await this.prompts.render('repair.user', {
        errors: invalid.map((x, i) => `${i + 1}. ${callTargets[x.k]?.rawName}: ${x.issues.join('; ')}`).join('\n'),
        previous: JSON.stringify({ items: invalid.map((x) => x.raw) }).slice(0, 12_000),
      });
      const repairUser = (
        await this.prompts.render('enrich.user', {
          cuisine: cuisine.name,
          examples: '',
          items: repairTargets.map((t, i) => `${i + 1}. ${t.rawName}`).join('\n'),
        })
      ).text;
      const second = await this.router.generateOnRoute(
        { ...request, user: `${repairUser}\n\n${repair.text}`, maxTokens: Math.min(16_000, 700 + repairTargets.length * 1100) },
        result.route,
        options.ctx,
      );
      attempts.push(...second.attempts);
      const secondItems = second.ok ? this.align(second.value.items, repairTargets) : [];
      for (const [i, x] of invalid.entries()) {
        const parsed = callTargets[x.k] as ParsedName;
        const raw = secondItems[i];
        const validated = raw === undefined ? undefined : this.validate(raw, parsed);
        outcomes.set(
          toCall[x.k] as number,
          validated?.ok ? validated.outcome : this.review(parsed, REVIEW_REASONS.invalid_output ?? UNKNOWN_REASON),
        );
      }
    } else {
      for (const x of invalid) {
        const parsed = callTargets[x.k] as ParsedName;
        outcomes.set(toCall[x.k] as number, this.review(parsed, REVIEW_REASONS.invalid_output ?? UNKNOWN_REASON));
      }
    }

    // Cache validated AI cards (not review placeholders — another model may know them).
    for (const index of toCall) {
      const outcome = outcomes.get(index);
      if (outcome?.kind === 'ai') {
        await setJson(
          this.cache,
          await this.cacheKey(cuisine.id, outcome.parsed.normalized),
          { payload: outcome.payload, confidence: outcome.confidence },
          this.ttlSeconds,
        );
      }
    }
    return {
      outcomes: targets.map((_, i) => outcomes.get(i) as EnrichOutcome),
      attempts,
      provider: result.meta.provider,
      model: result.meta.model,
    };
  }
}
