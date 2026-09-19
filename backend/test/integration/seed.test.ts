import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '../../src/db/client.js';
import { cuisines, menuItems, promptTemplates, providerConfigs, users } from '../../src/db/schema/index.js';
import { countSeedTemplates, seedDatabase } from '../../src/db/seed/seed.js';
import { LEGACY_NOTES, SEED_CUISINES } from '../../src/db/seed/cuisines.js';
import { SEED_PROMPTS } from '../../src/db/seed/prompts.js';
import { SEED_TEMPLATES } from '../../src/db/seed/templates.js';
import { DEFAULT_ROUTES, TASK_KEYS } from '../../src/config/models.js';
import { templatesToCsv } from '../../src/modules/export/template-csv.js';
import { getTemplates, replaceTemplateContent } from '../../src/modules/templates/template-store.js';
import { verifyPassword } from '../../src/lib/password.js';
import { containsPriceAmount } from '../../src/lib/price-guard.js';
import { createTestDb } from '../helpers/test-db.js';

const admin = { email: 'Admin@Test.local', password: 'test-password-123', name: 'Test Admin' };

describe('seedDatabase', () => {
  let handle: DbHandle;

  beforeAll(async () => {
    handle = await createTestDb();
  });

  afterAll(async () => {
    await handle.close();
  });

  it('inserts every cuisine, all seed templates, prompts, routes and the admin user', async () => {
    const report = await seedDatabase(handle.db, { admin });
    const routeCount = TASK_KEYS.reduce((sum, t) => sum + DEFAULT_ROUTES[t].length, 0);
    expect(report).toEqual({
      adminCreated: true,
      cuisinesInserted: SEED_CUISINES.length,
      cuisinesUpdated: 0,
      templatesInserted: SEED_TEMPLATES.length,
      templatesUpdated: 0,
      templatesSkipped: 0,
      promptsInserted: SEED_PROMPTS.length,
      providerConfigsInserted: routeCount,
    });
    expect(await countSeedTemplates(handle.db)).toBe(SEED_TEMPLATES.length);

    const approved = await handle.db
      .select({ count: sql<number>`count(*)::int` })
      .from(menuItems)
      .where(eq(menuItems.approved, true));
    expect(approved[0]?.count).toBe(SEED_TEMPLATES.length);

    const [user] = await handle.db.select().from(users).where(eq(users.email, 'admin@test.local'));
    expect(user?.role).toBe('admin');
    expect(await verifyPassword(admin.password, user?.passwordHash ?? '')).toBe(true);

    const active = await handle.db.select().from(promptTemplates).where(eq(promptTemplates.isActive, true));
    expect(active).toHaveLength(SEED_PROMPTS.length);

    const doner = await handle.db.query.cuisines.findFirst({ where: eq(cuisines.slug, 'doner'), with: { parent: true } });
    expect(doner?.parent?.slug).toBe('kebap-izgara');
    const meze = await handle.db.query.cuisines.findFirst({ where: eq(cuisines.slug, 'meze'), with: { parent: true } });
    expect(meze?.parent?.slug).toBe('balik-deniz');

    const configs = await handle.db.select().from(providerConfigs).where(eq(providerConfigs.taskKey, 'vision.menu_extract'));
    expect(configs.map((c) => c.priority).sort()).toEqual([0, 1, 2]);
  });

  it('round-trips template payloads through the tables', async () => {
    const rows = await handle.db.select({ id: menuItems.id, name: menuItems.canonicalName }).from(menuItems);
    const records = await getTemplates(
      handle.db,
      rows.map((r) => r.id),
    );
    const slugById = new Map((await handle.db.select({ id: cuisines.id, slug: cuisines.slug }).from(cuisines)).map((c) => [c.id, c.slug]));
    expect(records).toHaveLength(SEED_TEMPLATES.length);
    for (const record of records) {
      // The same product may be seeded in several cuisines (Ayran, Patates Kızartması …).
      const seed = SEED_TEMPLATES.find((t) => t.payload.name === record.canonicalName && t.cuisine === slugById.get(record.cuisineId));
      expect(seed, record.canonicalName).toBeDefined();
      expect(record.payload).toEqual(seed?.payload);
      expect(record.source).toBe('seed');
    }
  });

  it('is idempotent and never overwrites user-edited templates or cuisine minimums', async () => {
    const [adana] = await handle.db.select().from(menuItems).where(eq(menuItems.canonicalName, 'Adana Kebap'));
    if (!adana) throw new Error('Adana missing');
    const [record] = await getTemplates(handle.db, [adana.id]);
    if (!record) throw new Error('Adana record missing');
    const edited = { ...record.payload, description: 'Kullanıcının düzenlediği açıklama: acılı kıyma, lavaş ve közle.' };
    await replaceTemplateContent(handle.db, adana.id, edited, { source: 'user' });
    await handle.db.update(cuisines).set({ minItemCount: 14 }).where(eq(cuisines.slug, 'kebap-izgara'));

    const report = await seedDatabase(handle.db, { admin });
    expect(report.adminCreated).toBe(false);
    expect(report.cuisinesInserted).toBe(0);
    expect(report.templatesInserted).toBe(0);
    expect(report.cuisinesUpdated).toBe(0);
    expect(report.templatesUpdated).toBe(SEED_TEMPLATES.length - 1);
    expect(report.templatesSkipped).toBe(1);
    expect(report.promptsInserted).toBe(0);
    expect(report.providerConfigsInserted).toBe(0);

    const [after] = await getTemplates(handle.db, [adana.id]);
    expect(after?.payload.description).toBe(edited.description);
    expect(after?.source).toBe('user');
    const [kebap] = await handle.db.select().from(cuisines).where(eq(cuisines.slug, 'kebap-izgara'));
    expect(kebap?.minItemCount).toBe(14);
  });

  it('refreshes cuisine notes an earlier seed wrote, never notes the user edited', async () => {
    const legacy = LEGACY_NOTES[0] ?? '';
    await handle.db.update(cuisines).set({ notes: legacy }).where(eq(cuisines.slug, 'pizza'));
    await handle.db.update(cuisines).set({ notes: 'Kendi notum: kenar sosu mutlaka sorulsun.' }).where(eq(cuisines.slug, 'burger'));

    const report = await seedDatabase(handle.db, { admin });
    expect(report.cuisinesUpdated).toBe(1);

    const rows = await handle.db.select({ slug: cuisines.slug, notes: cuisines.notes }).from(cuisines);
    const notes = new Map(rows.map((r) => [r.slug, r.notes]));
    expect(notes.get('pizza')).toBe(SEED_CUISINES.find((c) => c.slug === 'pizza')?.notes);
    expect(notes.get('burger')).toBe('Kendi notum: kenar sosu mutlaka sorulsun.');
  });

  it('exports a review CSV with BOM, semicolons and no prices', () => {
    const csv = templatesToCsv(
      SEED_TEMPLATES.map((t) => ({ cuisineName: t.cuisine, payload: t.payload, aliases: t.aliases, importance: t.importance, source: 'seed' })),
    );
    expect(csv.startsWith('﻿Mutfak;Ürün Adı;')).toBe(true);
    expect(csv).toContain('Porsiyon (tek seçim, zorunlu): Yarım Porsiyon [tabanı belirler]');
    expect(containsPriceAmount(csv)).toBe(false);
    // header + one row per template (multi-line cells are quoted, so count logical rows by record separator)
    expect(csv.split('\r\n').filter((l) => l.length > 0).length).toBe(SEED_TEMPLATES.length + 1);
  });
});
