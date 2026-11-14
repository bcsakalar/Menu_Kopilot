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
