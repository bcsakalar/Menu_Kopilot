import { and, cosineDistance, desc, eq, inArray, sql } from 'drizzle-orm';
import type { PromptRepository } from '../../ai/prompt-repository.js';
import type { AiRouter, CallContext } from '../../ai/router.js';
import { EMBEDDING } from '../../config/models.js';
import type { Database } from '../../db/client.js';
import { itemAliases, itemEmbeddings, menuItems } from '../../db/schema/index.js';
import type { TemplateSource } from '../templates/template-store.js';
import type { MatchType } from '../suggest/schemas.js';
import type { CuisineGraph } from './cuisine-graph.js';

/**
 * Stage B — retrieval without LLMs (the main token saver). For each normalized name, in order:
 * 1. normalized_name exact → 2. alias exact → 3. pg_trgm similarity > threshold → 4. pgvector cosine > threshold.
 * Only approved templates are ever matched; ties prefer the same / related cuisine.
 */

export interface RetrievalHit {
  templateId: string;
  canonicalName: string;
  cuisineId: string;
  source: TemplateSource;
  matchType: MatchType;
  score: number;
}

export interface NearMiss {
  templateId: string;
  canonicalName: string;
  cuisineId: string;
  score: number;
}

export interface RetrievalOutcome {
  hits: Map<string, RetrievalHit>;
  /** Trigram candidates below the hit threshold (input for the cheap canonicalize step). */
  nearMisses: Map<string, NearMiss[]>;
  embedCalls: number;
}

export interface RetrievalOptions {
  trigramThreshold: number;
  vectorThreshold: number;
  nearMissFloor?: number;
}

interface Candidate {
  templateId: string;
  canonicalName: string;
  cuisineId: string;
  source: TemplateSource;
  importance: number;
  usageCount: number;
  score: number;
}

export class RetrievalService {
  private readonly nearMissFloor: number;

  constructor(
    private readonly db: Database,
    private readonly router: AiRouter,
    private readonly prompts: PromptRepository,
    private readonly options: RetrievalOptions,
  ) {
    this.nearMissFloor = options.nearMissFloor ?? 0.3;
  }

  private pick(candidates: readonly Candidate[], graph: CuisineGraph, cuisineId: string): Candidate | undefined {
    return [...candidates].sort(
      (a, b) =>
        graph.rank(cuisineId, a.cuisineId) - graph.rank(cuisineId, b.cuisineId) ||
        b.score - a.score ||
        b.importance - a.importance ||
        b.usageCount - a.usageCount,
    )[0];
  }

  private hit(candidate: Candidate, matchType: MatchType): RetrievalHit {
    return {
      templateId: candidate.templateId,
      canonicalName: candidate.canonicalName,
      cuisineId: candidate.cuisineId,
      source: candidate.source,
      matchType,
      score: Math.round(candidate.score * 1000) / 1000,
    };
  }

  private readonly columns = {
    templateId: menuItems.id,
    canonicalName: menuItems.canonicalName,
    cuisineId: menuItems.cuisineId,
    source: menuItems.source,
    importance: menuItems.importance,
    usageCount: menuItems.usageCount,
  };

  async match(
    names: readonly string[],
    cuisineId: string,
    graph: CuisineGraph,
    options: { useVector: boolean; ctx?: CallContext } = { useVector: true },
  ): Promise<RetrievalOutcome> {
    const hits = new Map<string, RetrievalHit>();
    const nearMisses = new Map<string, NearMiss[]>();
    let embedCalls = 0;
    const unique = [...new Set(names.filter((n) => n.length > 0))];
    if (unique.length === 0) return { hits, nearMisses, embedCalls };

    // 1. exact normalized name
    const exact = await this.db
      .select({ ...this.columns, name: menuItems.normalizedName })
      .from(menuItems)
      .where(and(eq(menuItems.approved, true), inArray(menuItems.normalizedName, unique)));
    for (const name of unique) {
      const best = this.pick(
        exact.filter((r) => r.name === name).map((r) => ({ ...r, score: 1 })),
        graph,
        cuisineId,
      );
      if (best) hits.set(name, this.hit(best, 'exact'));
    }

    // 2. alias
    let remaining = unique.filter((n) => !hits.has(n));
    if (remaining.length > 0) {
      const aliases = await this.db
        .select({ ...this.columns, alias: itemAliases.normalizedAlias })
        .from(itemAliases)
        .innerJoin(menuItems, eq(itemAliases.menuItemId, menuItems.id))
        .where(and(eq(menuItems.approved, true), inArray(itemAliases.normalizedAlias, remaining)));
      for (const name of remaining) {
        const best = this.pick(
          aliases.filter((r) => r.alias === name).map((r) => ({ ...r, score: 1 })),
          graph,
          cuisineId,
        );
        if (best) hits.set(name, this.hit(best, 'alias'));
      }
    }

    // 3. trigram (names and aliases); also collects near-miss candidates for canonicalization
    remaining = unique.filter((n) => !hits.has(n));
    if (remaining.length > 0) {
      const floor = Math.min(this.nearMissFloor, this.options.trigramThreshold);
      await this.db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL pg_trgm.similarity_threshold = ${floor.toFixed(3)}`));
        for (const name of remaining) {
          const nameSim = sql<number>`similarity(${menuItems.normalizedName}, ${name})`;
          const byName = await tx
            .select({ ...this.columns, score: nameSim })
            .from(menuItems)
            .where(and(eq(menuItems.approved, true), sql`${menuItems.normalizedName} % ${name}`))
            .orderBy(desc(nameSim))
            .limit(5);
          const aliasSim = sql<number>`similarity(${itemAliases.normalizedAlias}, ${name})`;
          const byAlias = await tx
            .select({ ...this.columns, score: aliasSim })
            .from(itemAliases)
            .innerJoin(menuItems, eq(itemAliases.menuItemId, menuItems.id))
            .where(and(eq(menuItems.approved, true), sql`${itemAliases.normalizedAlias} % ${name}`))
            .orderBy(desc(aliasSim))
            .limit(5);
          const merged = new Map<string, Candidate>();
          for (const c of [...byName, ...byAlias]) {
            const score = Number(c.score);
            const prev = merged.get(c.templateId);
            if (!prev || prev.score < score) merged.set(c.templateId, { ...c, score });
          }
          const candidates = [...merged.values()];
          const above = candidates.filter((c) => c.score > this.options.trigramThreshold);
          const best = this.pick(above, graph, cuisineId);
          if (best) {
            hits.set(name, this.hit(best, 'trigram'));
          } else if (candidates.length > 0) {
            nearMisses.set(
              name,
              candidates
                .sort((a, b) => b.score - a.score)
                .map((c) => ({ templateId: c.templateId, canonicalName: c.canonicalName, cuisineId: c.cuisineId, score: c.score })),
            );
          }
        }
      });
    }

    // 4. vector (only when there are embeddings for the current model and providers are usable)
    remaining = unique.filter((n) => !hits.has(n));
    if (remaining.length > 0 && options.useVector) {
      const [indexed] = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(itemEmbeddings)
        .where(and(eq(itemEmbeddings.model, EMBEDDING.model), eq(itemEmbeddings.dim, EMBEDDING.dim)));
      if ((indexed?.n ?? 0) > 0) {
        const texts = await Promise.all(remaining.map(async (name) => (await this.prompts.render('embed.query', { text: name })).text));
        const embedded = await this.router.embed(texts, options.ctx ?? {});
        embedCalls += embedded.attempts.filter((a) => a.outcome !== 'skipped').length;
        if (embedded.ok && embedded.model === EMBEDDING.model && embedded.dim === EMBEDDING.dim) {
          for (const [index, name] of remaining.entries()) {
            const vector = embedded.vectors[index];
            if (!vector) continue;
            const distance = cosineDistance(itemEmbeddings.embedding, vector);
            const rows = await this.db
              .select({ ...this.columns, score: sql<number>`1 - (${distance})` })
              .from(itemEmbeddings)
              .innerJoin(menuItems, eq(itemEmbeddings.menuItemId, menuItems.id))
              .where(
                and(
                  eq(menuItems.approved, true),
                  eq(itemEmbeddings.model, EMBEDDING.model),
                  eq(itemEmbeddings.dim, EMBEDDING.dim),
                ),
              )
              .orderBy(distance)
              .limit(5);
            const above = rows
              .map((r) => ({ ...r, score: Number(r.score) }))
              .filter((r) => r.score > this.options.vectorThreshold);
            const best = this.pick(above, graph, cuisineId);
            if (best) {
              hits.set(name, this.hit(best, 'vector'));
              nearMisses.delete(name);
            }
          }
        }
      }
    }

    return { hits, nearMisses, embedCalls };
  }
}
