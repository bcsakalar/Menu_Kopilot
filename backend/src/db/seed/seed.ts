import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DEFAULT_ROUTES, TASK_KEYS } from '../../config/models.js';
import { templatePayloadSchema } from '../../domain/template.js';
import { hashPassword } from '../../lib/password.js';
import { normalizeTr } from '../../lib/normalize-tr.js';
import { loadCategoryIndex } from '../../agents/gap-analyst.js';
import { findApprovedByName, insertTemplate, recategorizeTemplates, replaceTemplateContent } from '../../modules/templates/template-store.js';
import type { Database } from '../client.js';
import { cuisineCategories, cuisines, menuCategories, menuItems, productTypes, promptTemplates, providerConfigs, users } from '../schema/index.js';
import { SEED_CATEGORIES, SEED_CUISINE_CATEGORIES } from './categories.js';
import { CUISINE_TARGETS } from './cuisine-targets.js';
import { CATEGORY_DEFAULT_TYPE, CUISINE_DEFAULT_TYPE, PRODUCT_TYPES_VERSION, SEED_PRODUCT_TYPES } from './product-types.js';
import { LEGACY_NOTES, SEED_CUISINES } from './cuisines.js';

/** The opening target every seeded cuisine started with before the researched targets (D-177). */
const LEGACY_MIN_ITEM_COUNT = 10;
import { SEED_PROMPTS } from './prompts.js';
import { SEED_TEMPLATES } from './templates.js';

export interface SeedOptions {
  admin?: { email: string; password: string; name: string };
}

export interface SeedReport {
  adminCreated: boolean;
  cuisinesInserted: number;
  cuisinesUpdated: number;
  templatesInserted: number;
  templatesUpdated: number;
  templatesSkipped: number;
  promptsInserted: number;
  /** Seeded prompt versions that became the active one (a new version of an existing key, or a first activation). */
  promptsActivated: number;
  providerConfigsInserted: number;
  categoriesInserted: number;
  cuisineCategoriesInserted: number;
  templatesCategorized: number;
  /** Product-type rows inserted or refreshed (a user-edited row is left alone). */
  productTypesWritten: number;
  /** Cuisines whose opening target moved to the researched value (never one set by hand). */
  cuisineTargetsApplied: number;
}

/**
 * Idempotent seed. Never overwrites user data:
 * - cuisines are inserted when their slug is missing (user-edited min counts survive); their notes are refreshed only
 *   while they still hold a note written by an earlier seed,
 * - templates are replaced only while still `source='seed'` (user-approved edits survive); seeds the user deleted
 *   (archived: approved=false, source='seed') are not re-inserted,
 * - prompts/provider configs are inserted when missing.
 */
export async function seedDatabase(db: Database, options: SeedOptions = {}): Promise<SeedReport> {
  const report: SeedReport = {
    adminCreated: false,
    cuisinesInserted: 0,
    cuisinesUpdated: 0,
    templatesInserted: 0,
    templatesUpdated: 0,
    templatesSkipped: 0,
    promptsInserted: 0,
    promptsActivated: 0,
    providerConfigsInserted: 0,
    categoriesInserted: 0,
    cuisineCategoriesInserted: 0,
    templatesCategorized: 0,
    productTypesWritten: 0,
    cuisineTargetsApplied: 0,
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

    for (const cuisine of SEED_CUISINES) {
      const refreshed = await tx
        .update(cuisines)
        .set({ notes: cuisine.notes, updatedAt: new Date() })
        .where(and(eq(cuisines.slug, cuisine.slug), inArray(cuisines.notes, [...LEGACY_NOTES])))
        .returning({ id: cuisines.id });
      report.cuisinesUpdated += refreshed.length;
    }

    const cuisineRows = await tx
      .select({ id: cuisines.id, slug: cuisines.slug, categoriesEditedByUser: cuisines.categoriesEditedByUser })
      .from(cuisines);
    const cuisineIdBySlug = new Map(cuisineRows.map((c) => [c.slug, c.id]));
    const userOwnedCategorySets = new Set(cuisineRows.filter((c) => c.categoriesEditedByUser).map((c) => c.id));
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


    // --- categories -------------------------------------------------------------------------------------------
    // Labels and keywords are refreshed on every seed until the user edits a category; from then on the row is
    // theirs. A cuisine's category set is seeded the same way: once the user edited it in settings (even removing a
    // category), the seed leaves the whole set alone, so a removed category does not come back on the next start.
    for (const category of SEED_CATEGORIES) {
      const inserted = await tx
        .insert(menuCategories)
        .values({
          key: category.key,
          label: category.label,
          sortOrder: category.sortOrder,
          keywords: [...category.keywords],
        })
        .onConflictDoUpdate({
          target: menuCategories.key,
          set: { label: category.label, sortOrder: category.sortOrder, keywords: [...category.keywords] },
          setWhere: eq(menuCategories.editedByUser, false),
        })
        .returning({ key: menuCategories.key });
      report.categoriesInserted += inserted.length;
    }

    // --- product-type knowledge base (D-179) ----------------------------------------------------------------------
    // Refreshed on every seed until the user edits a type; from then on the row is theirs.
    for (const type of SEED_PRODUCT_TYPES) {
      const values = {
        label: type.label,
        categoryKey: type.categoryKey,
        keywords: [...type.keywords],
        plain: type.plain,
        optionGroups: [...type.optionGroups],
        removable: [...type.removable],
        extras: [...type.extras],
        forbiddenGroups: [...type.forbiddenGroups],
        forbiddenIngredients: [...(type.forbiddenIngredients ?? [])],
        fallbackDescription: type.fallbackDescription,
        cuisines: [...type.cuisines],
        priority: type.priority ?? 0,
        version: PRODUCT_TYPES_VERSION,
        updatedAt: new Date(),
      };
      const written = await tx
        .insert(productTypes)
        .values({ key: type.key, ...values })
        .onConflictDoUpdate({ target: productTypes.key, set: values, setWhere: eq(productTypes.editedByUser, false) })
        .returning({ key: productTypes.key });
      report.productTypesWritten += written.length;
    }
    for (const [categoryKey, typeKey] of Object.entries(CATEGORY_DEFAULT_TYPE)) {
      await tx
        .update(menuCategories)
        .set({ defaultProductType: typeKey })
        .where(and(eq(menuCategories.key, categoryKey), eq(menuCategories.editedByUser, false)));
    }

    // --- realistic cuisine targets (D-177) --------------------------------------------------------------------------
    // The research numbers and the default product type are descriptive and always refreshed; the opening target
    // itself only while nobody set it by hand.
    for (const [slug, target] of Object.entries(CUISINE_TARGETS)) {
      await tx
        .update(cuisines)
        .set({ typicalItemCount: target.typical, targetNote: target.note, defaultProductType: CUISINE_DEFAULT_TYPE[slug] ?? null })
        .where(eq(cuisines.slug, slug));
      // Only while the target is still the old seeded default (10): anything else was typed by someone — through
      // the app (flagged) or straight into the database (not flagged, but still not ours to replace).
      const moved = await tx
        .update(cuisines)
        .set({ minItemCount: target.target })
        .where(
          and(
            eq(cuisines.slug, slug),
            eq(cuisines.minItemCountEditedByUser, false),
            eq(cuisines.minItemCount, LEGACY_MIN_ITEM_COUNT),
            sql`${cuisines.minItemCount} <> ${target.target}`,
          ),
        )
        .returning({ id: cuisines.id });
      report.cuisineTargetsApplied += moved.length;
    }

    for (const entry of SEED_CUISINE_CATEGORIES) {
      const cuisineId = cuisineIdBySlug.get(entry.cuisine);
      if (!cuisineId || userOwnedCategorySets.has(cuisineId)) continue;
      const sortOrder = SEED_CATEGORIES.find((c) => c.key === entry.category)?.sortOrder ?? 0;
      const inserted = await tx
        .insert(cuisineCategories)
        .values({ cuisineId, categoryKey: entry.category, minItems: entry.minItems, sortOrder })
        .onConflictDoNothing({ target: [cuisineCategories.cuisineId, cuisineCategories.categoryKey] })
        .returning({ id: cuisineCategories.id });
      report.cuisineCategoriesInserted += inserted.length;
    }

    for (const [index, seedTemplate] of SEED_TEMPLATES.entries()) {
      const payload = payloads[index];
      if (!payload) throw new Error('seed payload index out of range');
      const cuisineId = requireCuisine(seedTemplate.cuisine);
      const normalized = normalizeTr(payload.name);
      const existing = await findApprovedByName(tx, cuisineId, normalized);
      // A seed the user deleted is kept archived (approved=false) and must not come back.
      const [archived] = existing
        ? []
        : await tx
            .select({ id: menuItems.id })
            .from(menuItems)
            .where(
              and(
                eq(menuItems.cuisineId, cuisineId),
                eq(menuItems.normalizedName, normalized),
                eq(menuItems.approved, false),
                eq(menuItems.source, 'seed'),
              ),
            )
            .limit(1);
      if (archived) {
        report.templatesSkipped += 1;
      } else if (!existing) {
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


    // --- template categories ----------------------------------------------------------------------------------
    // Every approved template gets a category so the recommender can filter on an index instead of classifying
    // names on every request. Seed templates follow the taxonomy as stored — the user's keyword edits included —
    // and a category that came from accepting a card stays (see recategorizeTemplates).
    report.templatesCategorized = await recategorizeTemplates(tx, await loadCategoryIndex(tx));

    for (const prompt of SEED_PROMPTS) {
      const inserted = await tx
        .insert(promptTemplates)
        .values({ key: prompt.key, version: prompt.version, content: prompt.content, isActive: false })
        .onConflictDoNothing({ target: [promptTemplates.key, promptTemplates.version] })
        .returning({ id: promptTemplates.id });
      report.promptsInserted += inserted.length;
      /**
       * Activate the seeded version when the key has no active version yet, or when what is active is an OLDER
       * version — that is how an improved prompt actually reaches production on a redeploy. A prompt written from
       * the app always lands on a version above the seeded ones, so this never overwrites one; and the row is
       * only activated when it still holds exactly the seeded text, so an inactive draft someone typed under the
       * same version number is left alone.
       */
      const active = await tx
        .select({ id: promptTemplates.id, version: promptTemplates.version })
        .from(promptTemplates)
        .where(and(eq(promptTemplates.key, prompt.key), eq(promptTemplates.isActive, true)))
        .limit(1);
      const current = active[0];
      if (current && current.version >= prompt.version) continue;
      const seeded = await tx
        .select({ id: promptTemplates.id, content: promptTemplates.content })
        .from(promptTemplates)
        .where(and(eq(promptTemplates.key, prompt.key), eq(promptTemplates.version, prompt.version)))
        .limit(1);
      if (seeded[0]?.content !== prompt.content) continue;
      // One active version per key is a unique index: the old one has to step down first.
      if (current) await tx.update(promptTemplates).set({ isActive: false }).where(eq(promptTemplates.id, current.id));
      await tx.update(promptTemplates).set({ isActive: true }).where(eq(promptTemplates.id, seeded[0].id));
      report.promptsActivated += 1;
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
