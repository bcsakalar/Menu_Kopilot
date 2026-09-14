import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { PromptRepository } from '../ai/prompt-repository.js';
import type { AiRouter } from '../ai/router.js';
import { EMBEDDING } from '../config/models.js';
import type { Database } from '../db/client.js';
import { itemEmbeddings, menuItems } from '../db/schema/index.js';
import { sha256Hex } from '../lib/images.js';
import { getTemplates } from '../modules/templates/template-store.js';

export interface EmbedReport {
  embedded: number;
  unchanged: number;
  failed: number;
  error?: string;
}

/**
 * Computes document embeddings for APPROVED templates only (drafts never enter the vector index).
 * Stores model + dim per row; unchanged input (same hash) is never re-embedded.
 */
export class EmbeddingService {
  constructor(
    private readonly db: Database,
    private readonly router: AiRouter,
    private readonly prompts: PromptRepository,
  ) {}

  private async documentText(template: { canonicalName: string; aliases: string[]; payload: { description: string; tags: string[] } }) {
    const body = [template.canonicalName, template.payload.description, template.aliases.join(', '), template.payload.tags.join(', ')]
      .filter((s) => s.length > 0)
      .join('. ');
    return (await this.prompts.render('embed.document', { title: template.canonicalName, text: body })).text;
  }

  async embedTemplates(ids: readonly string[]): Promise<EmbedReport> {
    const report: EmbedReport = { embedded: 0, unchanged: 0, failed: 0 };
    if (ids.length === 0) return report;
    const templates = (await getTemplates(this.db, ids)).filter((t) => t.approved);
    if (templates.length === 0) return report;

    const existing = await this.db
      .select({ menuItemId: itemEmbeddings.menuItemId, inputHash: itemEmbeddings.inputHash })
      .from(itemEmbeddings)
      .where(
        and(
          inArray(
            itemEmbeddings.menuItemId,
            templates.map((t) => t.id),
          ),
          eq(itemEmbeddings.model, EMBEDDING.model),
          eq(itemEmbeddings.dim, EMBEDDING.dim),
        ),
      );
    const hashById = new Map(existing.map((e) => [e.menuItemId, e.inputHash]));

    const work: { id: string; text: string; hash: string }[] = [];
    for (const template of templates) {
      const text = await this.documentText(template);
      const hash = sha256Hex(`${EMBEDDING.model}:${EMBEDDING.dim}:${text}`);
      if (hashById.get(template.id) === hash) report.unchanged += 1;
      else work.push({ id: template.id, text, hash });
    }
    if (work.length === 0) return report;

    const result = await this.router.embed(work.map((w) => w.text));
    if (!result.ok) {
      report.failed = work.length;
      report.error = `${result.error.kind}: ${result.error.message}`;
      return report;
    }
    for (const [index, w] of work.entries()) {
      const vector = result.vectors[index];
      if (!vector || vector.length !== EMBEDDING.dim) {
        report.failed += 1;
        continue;
      }
      await this.db
        .insert(itemEmbeddings)
        .values({ menuItemId: w.id, model: result.model, dim: result.dim, embedding: vector, inputHash: w.hash })
        .onConflictDoUpdate({
          target: [itemEmbeddings.menuItemId, itemEmbeddings.model, itemEmbeddings.dim],
          set: { embedding: vector, inputHash: w.hash, createdAt: new Date() },
        });
      report.embedded += 1;
    }
    return report;
  }

  /** Approved templates without an embedding for the current model (sweeper input). */
  async findMissing(limit = 100): Promise<string[]> {
    const rows = await this.db
      .select({ id: menuItems.id })
      .from(menuItems)
      .leftJoin(
        itemEmbeddings,
        and(
          eq(itemEmbeddings.menuItemId, menuItems.id),
          eq(itemEmbeddings.model, EMBEDDING.model),
          eq(itemEmbeddings.dim, EMBEDDING.dim),
        ),
      )
      .where(and(eq(menuItems.approved, true), isNull(itemEmbeddings.id)))
      .orderBy(sql`${menuItems.updatedAt} desc`)
      .limit(limit);
    return rows.map((r) => r.id);
  }
}
