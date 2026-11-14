import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cuisines } from '../../src/db/schema/index.js';
import { insertTemplate } from '../../src/modules/templates/template-store.js';
import { createTestApp, type TestContext } from '../helpers/test-app.js';

/**
 * The text tool's dictionary (D-218): the words of the approved pool — names, descriptions, options, ingredients — so the
 * browser restores Turkish letters and fixes misspellings from the menu's own vocabulary. Open, read-only, no visitor.
 */

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

const lexicon = async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/tools/lexicon', remoteAddress: '10.60.0.1' });
  expect(res.statusCode, res.body).toBe(200);
  return { res, words: new Map(res.json<{ words: [string, number][] }>().words) };
};

describe('GET /api/v1/tools/lexicon (D-218)', () => {
  it('lists the approved pool’s words in lowercase Turkish, with how often each appears', async () => {
    const { res, words } = await lexicon();
    expect(words.get('köfte') ?? 0).toBeGreaterThan(5);
    expect(words.get('lahmacun') ?? 0).toBeGreaterThan(0);
    // Descriptions, option names and ingredients count too.
    expect(words.get('servis') ?? 0).toBeGreaterThan(0);
    expect(words.get('porsiyon') ?? 0).toBeGreaterThan(0);
    expect(words.get('soğan') ?? 0).toBeGreaterThan(0);
    for (const word of words.keys()) {
      expect(word, word).toBe(word.toLocaleLowerCase('tr-TR'));
      expect(word, word).toMatch(/^\p{L}{2,}$/u);
    }
    // Nobody is made a visitor for reading it, and the browser may keep it for an hour.
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('leaves out what the pool does not approve: a model draft the team has not looked at', async () => {
    const [kebap] = await ctx.db.db.select({ id: cuisines.id }).from(cuisines).where(eq(cuisines.slug, 'kebap-izgara'));
    await insertTemplate(ctx.db.db, {
      cuisineId: kebap!.id,
      payload: {
        name: 'Zıpzıplı Şiş',
        description: 'Zıpzıplı sosla hazırlanır.',
        servingNote: '',
        portionInfo: '',
        optionGroups: [],
        removableIngredients: [],
        extraIngredients: [],
        tags: [],
        allergenNotes: [],
        upsellSuggestion: '',
      },
      source: 'ai',
      approved: false,
      needsReview: true,
    });
    ctx.app.services.tools.forget();
    const { words } = await lexicon();
    expect(words.has('zıpzıplı')).toBe(false);
  });

  it('serves a cached list until it is told the pool changed', async () => {
    const first = await lexicon();
    const second = await lexicon();
    expect(second.res.body).toBe(first.res.body);
  });
});

interface Ideas {
  items: { name: string; ideas: { name: string; description: string; score: number }[] }[];
}

const describeNames = async (names: unknown) => {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/tools/describe', payload: { names }, remoteAddress: '10.60.0.2' });
  return { res, body: res.statusCode === 200 ? res.json<Ideas>() : undefined };
};

describe('POST /api/v1/tools/describe (D-220)', () => {
  it('finds the approved description by the same name, an alias or a loose spelling, in the order asked', async () => {
    const { res, body } = await describeNames(['adana kebap', 'ADANA KEBABI', 'Adana Kebap (1 Porsiyon)', 'adana kebab', 'qxzv wplk']);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(body!.items.map((item) => item.name)).toEqual(['adana kebap', 'ADANA KEBABI', 'Adana Kebap (1 Porsiyon)', 'adana kebab', 'qxzv wplk']);
    for (const item of body!.items.slice(0, 4)) {
      expect(item.ideas[0], item.name).toMatchObject({ name: 'Adana Kebap', score: 1 });
      expect(item.ideas[0]!.description).toContain('kıyma');
    }
    // Nothing alike in the pool: no idea rather than a far-fetched one.
    expect(body!.items[4]!.ideas).toEqual([]);
  });

  it('gives at most three different ideas, best first, none below the floor', async () => {
    const { body } = await describeNames(['kebap', 'tavuk şiş', 'lahmacun']);
    for (const item of body!.items) {
      expect(item.ideas.length).toBeLessThanOrEqual(3);
      expect(new Set(item.ideas.map((idea) => idea.description)).size).toBe(item.ideas.length);
      const scores = item.ideas.map((idea) => idea.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      for (const score of scores) expect(score).toBeGreaterThanOrEqual(0.5);
      for (const idea of item.ideas) expect(idea.description.trim()).not.toBe('');
    }
    expect(body!.items[2]!.ideas[0]?.name).toBe('Lahmacun');
  });

  it('never offers a draft the team has not approved', async () => {
    const [kebap] = await ctx.db.db.select({ id: cuisines.id }).from(cuisines).where(eq(cuisines.slug, 'kebap-izgara'));
    await insertTemplate(ctx.db.db, {
      cuisineId: kebap!.id,
      payload: {
        name: 'Zıpzıplı Köfte',
        description: 'Zıpzıplı köfte taslağı.',
        servingNote: '',
        portionInfo: '',
        optionGroups: [],
        removableIngredients: [],
        extraIngredients: [],
        tags: [],
        allergenNotes: [],
        upsellSuggestion: '',
      },
      source: 'ai',
      approved: false,
      needsReview: true,
    });
    ctx.app.services.tools.forget();
    const { body } = await describeNames(['Zıpzıplı Köfte']);
    expect(body!.items[0]!.ideas.map((idea) => idea.description)).not.toContain('Zıpzıplı köfte taslağı.');
  });

  it('turns away an empty list, an oversized list and a name that is not text', async () => {
    expect((await describeNames([])).res.statusCode).toBe(400);
    expect((await describeNames(Array.from({ length: 501 }, (_, i) => `ürün ${i}`))).res.statusCode).toBe(400);
    expect((await describeNames(['x'.repeat(201)])).res.statusCode).toBe(400);
    expect((await describeNames([42])).res.statusCode).toBe(400);
    // A blank name is simply without ideas.
    const { body } = await describeNames(['   ']);
    expect(body!.items[0]!.ideas).toEqual([]);
  });
});
