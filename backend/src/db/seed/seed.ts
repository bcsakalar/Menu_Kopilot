import { and, eq, isNull, sql } from 'drizzle-orm';
import { DEFAULT_ROUTES, TASK_KEYS } from '../../config/models.js';
import { templatePayloadSchema } from '../../domain/template.js';
import { hashPassword } from '../../lib/password.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import { findApprovedByName, insertTemplate, replaceTemplateContent } from '../../modules/templates/template-store.js';
import type { Database } from '../client.js';
import { cuisines, menuItems, promptTemplates, providerConfigs, users } from '../schema/index.js';
import { SEED_CUISINES } from './cuisines.js';
import { SEED_PROMPTS } from './prompts.js';
import { SEED_TEMPLATES } from './templates.js';

export interface SeedOptions {
  admin?: { email: string; password: string; name: string };
}

export interface SeedReport {
  adminCreated: boolean;
  cuisinesInserted: number;
  templatesInserted: number;
  templatesUpdated: number;
  templatesSkipped: number;
  promptsInserted: number;
  providerConfigsInserted: number;
}

/**
 * Idempotent seed. Never overwrites user data:
 * - cuisines are inserted when their slug is missing (user-edited min counts survive),
 * - templates are replaced only while still `source='seed'` (user-approved edits survive),
 * - prompts/provider configs are inserted when missing.
 */
export async function seedDatabase(db: Database, options: SeedOptions = {}): Promise<SeedReport> {
  const report: SeedReport = {
    adminCreated: false,
    cuisinesInserted: 0,
    templatesInserted: 0,
    templatesUpdated: 0,
    templatesSkipped: 0,
    promptsInserted: 0,
    providerConfigsInserted: 0,
  };

  // Validate everything up-front so a broken seed never half-applies.
  const payloads = SEED_TEMPLATES.map((t) => templatePayloadSchema.parse(t.payload));
  const passwordHash = options.admin ? await hashPassword(options.admin.password) : undefined;

  await db.transaction(async (tx) => {
    if (options.admin && passwordHash) {
      const inserted = await tx
        .insert(users)
        .values({ email: options.admin.email.toLowerCase(), name: options.admin.name, role: 'admin', passwordHash })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id });
      report.adminCreated = inserted.length > 0;
    }

    for (const cuisine of SEED_CUISINES) {
      const inserted = await tx
        .insert(cuisines)
        .values({
          name: cuisine.name,
          slug: cuisine.slug,
          isSystem: true,
          minItemCount: cuisine.minItemCount,
          notes: cuisine.notes,
        })
        .onConflictDoNothing({ target: cuisines.slug })
        .returning({ id: cuisines.id });
      report.cuisinesInserted += inserted.length;
    }

    const cuisineRows = await tx.select({ id: cuisines.id, slug: cuisines.slug }).from(cuisines);
    const cuisineIdBySlug = new Map(cuisineRows.map((c) => [c.slug, c.id]));
    const requireCuisine = (slug: string): string => {
      const id = cuisineIdBySlug.get(slug);
      if (!id) throw new Error(`Seed cuisine missing: ${slug}`);
      return id;
    };

    for (const cuisine of SEED_CUISINES) {
      if (!cuisine.parentSlug) continue;
      await tx
        .update(cuisines)
        .set({ parentId: requireCuisine(cuisine.parentSlug) })
        .where(and(eq(cuisines.slug, cuisine.slug), isNull(cuisines.parentId)));
    }

    for (const [index, seedTemplate] of SEED_TEMPLATES.entries()) {
      const payload = payloads[index];
      if (!payload) throw new Error('seed payload index out of range');
      const cuisineId = requireCuisine(seedTemplate.cuisine);
      const existing = await findApprovedByName(tx, cuisineId, normalizeTr(payload.name));
      if (!existing) {
        await insertTemplate(tx, {
          cuisineId,
          payload,
          source: 'seed',
          approved: true,
          importance: seedTemplate.importance,
          aliases: seedTemplate.aliases,
        });
        report.templatesInserted += 1;
      } else if (existing.source === 'seed') {
        await replaceTemplateContent(tx, existing.id, payload, { importance: seedTemplate.importance });
        report.templatesUpdated += 1;
      } else {
        report.templatesSkipped += 1;
      }
    }

    for (const prompt of SEED_PROMPTS) {
      const inserted = await tx
        .insert(promptTemplates)
        .values({ key: prompt.key, version: prompt.version, content: prompt.content, isActive: false })
        .onConflictDoNothing({ target: [promptTemplates.key, promptTemplates.version] })
        .returning({ id: promptTemplates.id });
      report.promptsInserted += inserted.length;
      // Activate this version only when the key has no active version yet.
      const active = await tx
        .select({ id: promptTemplates.id })
        .from(promptTemplates)
        .where(and(eq(promptTemplates.key, prompt.key), eq(promptTemplates.isActive, true)))
        .limit(1);
      if (active.length === 0) {
        await tx
          .update(promptTemplates)
          .set({ isActive: true })
          .where(and(eq(promptTemplates.key, prompt.key), eq(promptTemplates.version, prompt.version)));
      }
    }

    for (const task of TASK_KEYS) {
      for (const [priority, route] of DEFAULT_ROUTES[task].entries()) {
        const inserted = await tx
          .insert(providerConfigs)
          .values({
            taskKey: task,
            provider: route.provider,
            model: route.model,
            params: { ...route.params },
            priority,
            enabled: true,
          })
          .onConflictDoNothing({ target: [providerConfigs.taskKey, providerConfigs.provider, providerConfigs.model] })
          .returning({ id: providerConfigs.id });
        report.providerConfigsInserted += inserted.length;
      }
    }
  });

  return report;
}

export async function countSeedTemplates(db: Database): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(menuItems)
    .where(eq(menuItems.source, 'seed'));
  return row?.count ?? 0;
}
