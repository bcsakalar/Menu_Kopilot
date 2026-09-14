import { describe, expect, it } from 'vitest';
import { isBasePriceGroupName, templatePayloadSchema } from '../../src/domain/template.js';
import { containsPriceAmount } from '../../src/lib/price-guard.js';
import { normalizeTr } from '../../src/lib/normalize-tr.js';
import { CUISINE_SLUGS, SEED_CUISINES } from '../../src/db/seed/cuisines.js';
import { SEED_TEMPLATES } from '../../src/db/seed/templates.js';

describe('seed data', () => {
  it('has 12 cuisines and 40 templates', () => {
    expect(SEED_CUISINES).toHaveLength(12);
    expect(new Set(SEED_CUISINES.map((c) => c.slug)).size).toBe(12);
    expect(SEED_TEMPLATES).toHaveLength(40);
  });

  it('every cuisine parent exists', () => {
    for (const c of SEED_CUISINES) {
      if (c.parentSlug) expect(CUISINE_SLUGS).toContain(c.parentSlug);
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
      expect(d.length, t.payload.name).toBeGreaterThanOrEqual(60);
      expect(d.length, t.payload.name).toBeLessThanOrEqual(160);
      expect(d).not.toMatch(/eşsiz|muhteşem|enfes|nefis|harika|mükemmel/i);
    }
  });

  it('contains no price amounts anywhere', () => {
    expect(containsPriceAmount(JSON.stringify(SEED_TEMPLATES))).toBe(false);
  });

  it('canonical names are unique and aliases do not shadow another canonical name', () => {
    const names = SEED_TEMPLATES.map((t) => normalizeTr(t.payload.name));
    expect(new Set(names).size).toBe(names.length);
    for (const t of SEED_TEMPLATES) {
      const own = normalizeTr(t.payload.name);
      for (const alias of t.aliases) {
        const a = normalizeTr(alias);
        if (a === own) continue;
        expect(names.includes(a), `${alias} → ${t.payload.name}`).toBe(false);
      }
    }
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
