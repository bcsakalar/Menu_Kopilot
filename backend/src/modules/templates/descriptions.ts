import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { acceptableDescription } from '../../agents/grounding.js';
import { generateChecked } from '../../agents/validator.js';
import { RequestBudget } from '../../ai/budget.js';
import type { PromptRepository } from '../../ai/prompt-repository.js';
import type { AiRouter } from '../../ai/router.js';
import type { Database } from '../../db/client.js';
import { cuisines, menuItems } from '../../db/schema/index.js';
import { isGenericDescription } from '../../domain/product-type.js';
import type { JobQueue } from '../../jobs/queue.js';
import { AppError } from '../../lib/errors.js';
import { getAuthUser } from '../../plugins/auth.js';

/**
 * Real descriptions for the pool (D-223). 952 imported templates carry a category's stock sentence instead of a
 * description (D-222 keeps those away from the cards). The admin asks the model for a batch, reads and edits it, and
 * saves what is right: nothing reaches the approved pool unread, and every saved text passes the panel's rules.
 */

/** One model call: about twenty descriptions are a short answer and an easy page to read. */
const MAX_BATCH = 40;
export const DESCRIBE_SCHEMA_NAME = 'template_descriptions';
const answerSchema = z.object({ items: z.array(z.object({ n: z.number().int(), description: z.string().max(300) })).max(MAX_BATCH + 10) });
/** Twenty descriptions are longer than one option card: the task's 6 s attempt would cut them off. */
const TIMEOUT_MS = 25_000;

export interface DescriptionProposal {
  id: string;
  name: string;
  cuisine: string;
  current: string;
  /** Empty when what the model wrote breaks the panel's rules: the admin writes it. */
  proposed: string;
}

/** What may be saved: 6–8 words, Turkish, no ad words, no price, and no category sentence. */
const usable = (text: string, name: string): string | null => (isGenericDescription(text, name) ? null : acceptableDescription(text));

export class DescriptionService {
  constructor(
    private readonly deps: { db: Database; router: AiRouter; prompts: PromptRepository; queue: JobQueue; onChange?: () => void },
  ) {}

  /** Approved templates whose description is a stock sentence, most important first. */
  private async pending(skip: readonly string[] = []) {
    const rows = await this.deps.db
      .select({ id: menuItems.id, name: menuItems.canonicalName, description: menuItems.description, cuisine: cuisines.name })
      .from(menuItems)
      .leftJoin(cuisines, eq(cuisines.id, menuItems.cuisineId))
      .where(eq(menuItems.approved, true))
      .orderBy(desc(menuItems.importance), desc(menuItems.usageCount), menuItems.normalizedName);
    const skipped = new Set(skip);
    return rows.filter((row) => !skipped.has(row.id) && isGenericDescription(row.description, row.name));
  }

  async count(): Promise<{ pending: number }> {
    return { pending: (await this.pending()).length };
  }

  async propose(userId: string, limit: number, skip: readonly string[]): Promise<{ items: DescriptionProposal[]; remaining: number }> {
    const all = await this.pending(skip);
    const batch = all.slice(0, Math.min(limit, MAX_BATCH));
    if (batch.length === 0) return { items: [], remaining: 0 };
    const system = (await this.deps.prompts.render('agent.describe.system')).text;
    const user = (await this.deps.prompts.render('agent.describe.user', { items: batch.map((row, i) => `${i + 1} | ${row.name} | ${row.cuisine ?? '-'}`).join('\n') })).text;
    const { result } = await generateChecked(
      this.deps,
      { task: 'agent.options', schema: answerSchema, schemaName: DESCRIBE_SCHEMA_NAME, system, user, timeoutMs: TIMEOUT_MS },
      { userId, budget: new RequestBudget(2, 12_000) },
    );
    if (!result.ok) throw new AppError('SERVICE_UNAVAILABLE', 'Yapay zekâ şu an açıklama yazamadı; biraz sonra tekrar dene.');
    const written = new Map(result.value.items.map((item) => [item.n, item.description]));
    return {
      items: batch.map((row, i) => ({
        id: row.id,
        name: row.name,
        cuisine: row.cuisine ?? '',
        current: row.description,
        proposed: usable(written.get(i + 1) ?? '', row.name) ?? '',
      })),
      remaining: all.length - batch.length,
    };
  }

  async apply(items: readonly { id: string; description: string }[]): Promise<{ updated: number; rejected: { id: string; reason: string }[] }> {
    const ids = [...new Set(items.map((item) => item.id))];
    const rows = await this.deps.db
      .select({ id: menuItems.id, name: menuItems.canonicalName })
      .from(menuItems)
      .where(and(eq(menuItems.approved, true), inArray(menuItems.id, ids)));
    const names = new Map(rows.map((row) => [row.id, row.name]));
    const rejected: { id: string; reason: string }[] = [];
    const updated: string[] = [];
    for (const item of items) {
      const name = names.get(item.id);
      if (!name) {
        rejected.push({ id: item.id, reason: 'Onaylı şablon bulunamadı' });
        continue;
      }
      const clean = usable(item.description, name);
      if (!clean) {
        rejected.push({ id: item.id, reason: 'Açıklama 6–8 kelime olmalı; ürün adıyla başlayan genel kalıp, reklam dili ve fiyat olmaz' });
        continue;
      }
      await this.deps.db.update(menuItems).set({ description: clean, updatedAt: new Date() }).where(eq(menuItems.id, item.id));
      updated.push(item.id);
    }
    // The description is part of what a template is matched by.
    if (updated.length > 0) {
      await this.deps.queue.enqueueEmbedding(updated);
      this.deps.onChange?.();
    }
    return { updated: updated.length, rejected };
  }
}

export const descriptionRoutes: FastifyPluginAsyncZod<{ service: DescriptionService }> = async (app, { service }) => {
  const security = [{ bearerAuth: [] }];
  const proposal = z.object({ id: z.uuid(), name: z.string(), cuisine: z.string(), current: z.string(), proposed: z.string() });

  app.get(
    '/templates/descriptions',
    {
      schema: {
        tags: ['templates'],
        summary: 'How many approved templates carry a stock sentence instead of a description',
        security,
        response: { 200: z.object({ pending: z.number().int() }) },
      },
    },
    async () => service.count(),
  );

  app.post(
    '/templates/descriptions/propose',
    {
      schema: {
        tags: ['templates'],
        summary: 'Descriptions written by the model for the next batch, to read before saving; writes nothing',
        security,
        body: z.object({ limit: z.number().int().min(1).max(MAX_BATCH).default(20), skip: z.array(z.uuid()).max(5000).default([]) }),
        response: { 200: z.object({ items: z.array(proposal), remaining: z.number().int() }) },
      },
    },
    async (request) => service.propose(getAuthUser(request).id, request.body.limit, request.body.skip),
  );

  app.post(
    '/templates/descriptions/apply',
    {
      schema: {
        tags: ['templates'],
        summary: 'Save the descriptions the admin approved; each must pass the panel rules',
        security,
        body: z.object({ items: z.array(z.object({ id: z.uuid(), description: z.string().trim().min(1).max(300) })).min(1).max(100) }),
        response: { 200: z.object({ updated: z.number().int(), rejected: z.array(z.object({ id: z.uuid(), reason: z.string() })) }) },
      },
    },
    async (request) => service.apply(request.body.items),
  );
};
