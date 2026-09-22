import { describe, expect, it } from 'vitest';
import { isBasePriceGroupName, templatePayloadSchema } from '../../src/domain/template.js';
import { containsPriceAmount } from '../../src/lib/price-guard.js';
import { normalizeTr } from '../../src/lib/normalize-tr.js';
import { CUISINE_SLUGS, SEED_CUISINES } from '../../src/db/seed/cuisines.js';
import { SEED_TEMPLATES } from '../../src/db/seed/templates.js';

describe('seed data', () => {
  it('covers every platform kitchen category with a ready template set', () => {
    expect(SEED_CUISINES).toHaveLength(CUISINE_SLUGS.length);
    expect(new Set(SEED_CUISINES.map((c) => c.slug)).size).toBe(CUISINE_SLUGS.length);
    expect(SEED_TEMPLATES.length).toBeGreaterThanOrEqual(280);
    for (const slug of CUISINE_SLUGS) {
      expect(SEED_TEMPLATES.filter((t) => t.cuisine === slug).length, slug).toBeGreaterThanOrEqual(5);
    }
  });

  it('every cuisine parent exists and cuisine notes fit the settings screen', () => {
    for (const c of SEED_CUISINES) {
      if (c.parentSlug) expect(CUISINE_SLUGS).toContain(c.parentSlug);
      expect(c.parentSlug, c.slug).not.toBe(c.slug);
      expect(c.notes.length, c.slug).toBeGreaterThanOrEqual(80);
      expect(c.notes.length, c.slug).toBeLessThanOrEqual(500);
      expect(containsPriceAmount(c.notes), c.slug).toBe(false);
    }
  });

  it.each(SEED_TEMPLATES.map((t) => [t.payload.name, t] as const))('%s passes the template schema', (_name, t) => {
    const result = templatePayloadSchema.safeParse(t.payload);
    if (!result.success) {
      throw new Error(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
    }
  });

  it('descriptions are a single short sentence (60–160 chars) without ad language', () => {
    for (const t of SEED_TEMPLATES) {
      const d = t.payload.description;
      // A drink goes on the panel as a plain row — name only, no description and no options (D-175).
      if (d.length === 0) {
        expect(t.payload.optionGroups, t.payload.name).toHaveLength(0);
        continue;
      }
      expect(d.length, t.payload.name).toBeGreaterThanOrEqual(60);
      expect(d.length, t.payload.name).toBeLessThanOrEqual(160);
      expect(d).not.toMatch(/eşsiz|muhteşem|enfes|nefis|harika|mükemmel/i);
    }
  });

  it('contains no price amounts anywhere', () => {
    expect(containsPriceAmount(JSON.stringify(SEED_TEMPLATES))).toBe(false);
  });

  it('canonical names are unique within a cuisine and aliases never shadow a canonical name', () => {
    const keys = SEED_TEMPLATES.map((t) => `${t.cuisine}/${normalizeTr(t.payload.name)}`);
    const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(duplicates).toEqual([]);
    // Exact names are matched before aliases in every cuisine, so an alias equal to any canonical name would never
    // reach its own template.
    const names = new Set(SEED_TEMPLATES.map((t) => normalizeTr(t.payload.name)));
    for (const t of SEED_TEMPLATES) {
      const own = normalizeTr(t.payload.name);
      const aliases = t.aliases.map(normalizeTr);
      expect(new Set(aliases).size, `duplicate alias in ${t.payload.name}`).toBe(aliases.length);
      for (const [index, a] of aliases.entries()) {
        if (a === own) continue;
        expect(names.has(a), `${t.aliases[index] ?? a} → ${t.payload.name}`).toBe(false);
      }
    }
  });

  it('a product seeded in several cuisines keeps the same canonical spelling', () => {
    const spellings = new Map<string, Set<string>>();
    for (const t of SEED_TEMPLATES) {
      const key = normalizeTr(t.payload.name);
      spellings.set(key, (spellings.get(key) ?? new Set()).add(t.payload.name));
    }
    for (const [key, set] of spellings) expect(set.size, key).toBe(1);
  });

  it('size/portion groups are the only sets_base groups and are named accordingly', () => {
    for (const t of SEED_TEMPLATES) {
      const setsBase = t.payload.optionGroups.filter((g) => g.options.some((o) => o.priceMode === 'sets_base'));
      expect(setsBase.length, t.payload.name).toBeLessThanOrEqual(1);
      for (const g of t.payload.optionGroups) {
        if (isBasePriceGroupName(g.name)) {
          expect(
            g.options.every((o) => o.priceMode === 'sets_base'),
            `${t.payload.name} / ${g.name}`,
          ).toBe(true);
        }
      }
    }
  });

  it('is generous with options (most groups have 3+ options)', () => {
    const groups = SEED_TEMPLATES.flatMap((t) => t.payload.optionGroups);
    const rich = groups.filter((g) => g.options.length >= 3).length;
    expect(rich / groups.length).toBeGreaterThan(0.75);
  });
});
