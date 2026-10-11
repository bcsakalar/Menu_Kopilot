import { describe, expect, it } from 'vitest';
import { addTypedItems, dedupeExtracted, mergeFlag } from '../../src/agents/dedupe.js';
import { looksAbbreviated } from '../../src/agents/gap-analyst.js';
import type { ExtractedItem } from '../../src/agents/schemas/extractor.js';
import { allocate, planRun, quotaRows } from '../../src/agents/plan.js';
import { cleanProductName } from '../../src/agents/validator.js';
import { CategoryIndex, categoryGaps, FALLBACK_CATEGORY } from '../../src/domain/category.js';
import { SEED_CATEGORIES } from '../../src/db/seed/categories.js';
import { templatePayloadSchema, type TemplatePayload } from '../../src/domain/template.js';
import { mergeOptionCard } from '../../src/modules/analyze/service.js';

const item = (rawName: string, over: Partial<ExtractedItem> = {}): ExtractedItem => ({
  rawName,
  sectionText: null,
  priceText: null,
  descriptionText: null,
  description: 'unknown',
  options: 'unknown',
  removables: 'unknown',
  optionNames: [],
  confidence: 0.9,
  ...over,
});

const index = new CategoryIndex(SEED_CATEGORIES.map((c) => ({ ...c, keywords: [...c.keywords] })));

describe('category classification', () => {
  it('matches on whole tokens, so "Sütlaç" is not read as a drink because of "su"', () => {
    expect(index.classify('Sütlaç')).toBe('tatli');
    expect(index.classify('Su')).toBe('icecek');
    expect(index.classify('Sucuklu Yumurtalı Pide')).toBe(FALLBACK_CATEGORY);
  });

  it('trusts the section heading the restaurant wrote over the product name', () => {
    // "Karışık" alone says nothing; the heading does.
    expect(index.classify('Karışık', 'İçecekler')).toBe('icecek');
    expect(index.classify('Künefe', 'Tatlılar')).toBe('tatli');
  });

  it('falls back to the main-course category when nothing matches', () => {
    expect(index.classify('Adana Kebap')).toBe(FALLBACK_CATEGORY);
    expect(index.classify('')).toBe(FALLBACK_CATEGORY);
  });

  it('classifies the drinks and desserts a pide menu is missing', () => {
    expect(index.classify('Ayran')).toBe('icecek');
    expect(index.classify('Şalgam Suyu')).toBe('icecek');
    expect(index.classify('Mercimek Çorbası')).toBe('corba');
    expect(index.classify('Çoban Salata')).toBe('salata-meze');
    expect(index.classify('Künefe')).toBe('tatli');
  });

  it('counts the cakes of a café as desserts, not as main courses', () => {
    expect(index.classify('Islak Kek')).toBe('tatli');
    expect(index.classify('Limonlu Tart')).toBe('tatli');
  });
});

describe('categoryGaps', () => {
  const expectations = [
    { key: 'ana-yemek', label: 'Ana Yemek', minItems: 6, sortOrder: 20 },
    { key: 'icecek', label: 'İçecek', minItems: 2, sortOrder: 70 },
    { key: 'tatli', label: 'Tatlı', minItems: 1, sortOrder: 60 },
  ];

  it('reports what each category is short of, emptiest first', () => {
    const gaps = categoryGaps(expectations, new Map([['ana-yemek', 5]]));
    expect(gaps.map((g) => `${g.key}:${g.missing}`)).toEqual(['icecek:2', 'ana-yemek:1', 'tatli:1']);
  });

  it('never reports a negative gap for an over-covered category', () => {
    const gaps = categoryGaps(expectations, new Map([['ana-yemek', 12]]));
    expect(gaps.find((g) => g.key === 'ana-yemek')).toMatchObject({ present: 12, missing: 0 });
  });
});

describe('dedupe across images', () => {
  it('counts a product once when two screenshots overlap and merges what each one showed', () => {
    const merged = dedupeExtracted([
      [item('Kıymalı Pide', { description: 'present', options: 'unknown' })],
      [item('Kıymalı Pide', { description: 'unknown', options: 'absent', optionNames: ['Boy'] })],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ seenIn: 2, description: 'present', options: 'absent', optionNames: ['Boy'] });
  });

  it('joins a clipped name to its full spelling and keeps the full one', () => {
    const merged = dedupeExtracted([[item('Karışık Pi…')], [item('Karışık Pide')]]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.name).toBe('Karışık Pide');
  });

  it('keeps genuinely different products apart', () => {
    const merged = dedupeExtracted([[item('Tavuk Şiş'), item('Adana Kebap')]]);
    expect(merged.map((m) => m.name)).toEqual(['Tavuk Şiş', 'Adana Kebap']);
  });

  it('drops low-confidence reads', () => {
    expect(dedupeExtracted([[item('Bulanık', { confidence: 0.1 })]])).toHaveLength(0);
  });

  it('merges flags by information: present beats absent beats unknown', () => {
    expect(mergeFlag('unknown', 'absent')).toBe('absent');
    expect(mergeFlag('absent', 'present')).toBe('present');
    expect(mergeFlag('present', 'unknown')).toBe('present');
  });
});

describe('typed products', () => {
  it('does not count a typed product that a screenshot already showed', () => {
    const entries = addTypedItems(dedupeExtracted([[item('Ayran')]]), ['ayran', 'Künefe']);
    expect(entries.map((e) => e.name)).toEqual(['Ayran', 'Künefe']);
    expect(entries[1]).toMatchObject({ typed: true, seenIn: 0, options: 'unknown' });
  });

  it('title-cases a name typed in a hurry but leaves a deliberate spelling alone', () => {
    const entries = addTypedItems([], ['adana kebap', 'XL Burger']);
    expect(entries.map((e) => e.name)).toEqual(['Adana Kebap', 'XL Burger']);
  });
});

describe('validator — product name cleaning', () => {
  it('moves the packaging out of the name and into the portion field', () => {
    expect(cleanProductName('Ayran (1 L)')).toEqual({ name: 'Ayran', movedToPortion: '1 L' });
    expect(cleanProductName('Kola (33 cl)')).toEqual({ name: 'Kola', movedToPortion: '33 cl' });
    expect(cleanProductName('Su (500 ml)')).toEqual({ name: 'Su', movedToPortion: '500 ml' });
    expect(cleanProductName('Ayran 300 ml')).toEqual({ name: 'Ayran', movedToPortion: '300 ml' });
  });

  it('leaves a clean name untouched', () => {
    expect(cleanProductName('Adana Kebap')).toEqual({ name: 'Adana Kebap', movedToPortion: '' });
  });

  it('strips price amounts from the name as well', () => {
    expect(cleanProductName('Ayran 40 TL').name).toBe('Ayran');
  });
});

describe('gap analyst — name heuristics', () => {
  it('spots shorthand names worth asking about on the call', () => {
    expect(looksAbbreviated('ADANA KBP')).toBe(true);
    expect(looksAbbreviated('Pide')).toBe(true);
    expect(looksAbbreviated('Adana Kebap')).toBe(false);
    expect(looksAbbreviated('Sucuklu Yumurtalı Pide')).toBe(false);
  });
});

describe('run plan — how many products and from which categories', () => {
  // A kebab shop's category table: the shape of a complete menu, 17 products across seven categories.
  const kebap = categoryGaps(
    [
      { key: 'ana-yemek', label: 'Ana Yemek', minItems: 6, sortOrder: 2 },
      { key: 'ara-sicak', label: 'Ara Sıcak', minItems: 2, sortOrder: 3 },
      { key: 'salata-meze', label: 'Salata & Meze', minItems: 2, sortOrder: 4 },
      { key: 'corba', label: 'Çorba', minItems: 1, sortOrder: 1 },
      { key: 'tatli', label: 'Tatlı', minItems: 2, sortOrder: 5 },
      { key: 'icecek', label: 'İçecek', minItems: 3, sortOrder: 6 },
      { key: 'menu-kampanya', label: 'Menü & Kampanya', minItems: 1, sortOrder: 7 },
    ],
    new Map([
      ['ana-yemek', 5],
      ['icecek', 2],
      ['salata-meze', 1],
      ['corba', 1],
      ['tatli', 1],
    ]),
  );

  it('quick mode: ten suggestions — six alternatives, four spread over different categories, no combos, every menu product completed', () => {
    const plan = planRun({ mode: 'quick', categories: kebap, current: 8, missing: 20, needOptions: 10 });
    // D-198: alternatives built on the menu's own products, on top of the category spread.
    expect(plan.alternatives).toBe(6);
    expect(plan.products).toBe(4);
    // Every menu product gets its four sections; the model is asked about seven, in two parallel calls at most,
    // and the pool and the knowledge base complete the rest at no model cost.
    expect(plan.optionTargets).toBe(10);
    expect(plan.modelOptionTargets).toBe(7);
    expect(plan.optionBatches).toBe(2);
    // One per category — the user's "5 farklı kategoriden 5-6 ürün".
    expect([...plan.quota.values()].every((v) => v <= 1)).toBe(true);
    expect(quotaRows(kebap, plan.quota)).toHaveLength(4);
    expect(plan.quota.get('menu-kampanya')).toBe(0);
  });

  it('quick mode still spreads its four category products when the cuisine has few categories', () => {
    // A döner shop: five categories besides the combo, one of them already full.
    const doner = categoryGaps(
      [
        { key: 'ana-yemek', label: 'Ana Yemek', minItems: 6, sortOrder: 1 },
        { key: 'ara-sicak', label: 'Ara Sıcak', minItems: 1, sortOrder: 2 },
        { key: 'salata-meze', label: 'Salata & Meze', minItems: 1, sortOrder: 3 },
        { key: 'yan-urun', label: 'Yan Ürün', minItems: 1, sortOrder: 4 },
        { key: 'icecek', label: 'İçecek', minItems: 2, sortOrder: 5 },
        { key: 'menu-kampanya', label: 'Menü & Kampanya', minItems: 1, sortOrder: 6 },
      ],
      new Map([
        ['ana-yemek', 4],
        ['yan-urun', 1],
        ['icecek', 2],
      ]),
    );
    const plan = planRun({ mode: 'quick', categories: doner, current: 7, missing: 7, needOptions: 5 });
    expect(plan.products).toBe(4);
    expect(plan.alternatives).toBe(6);
    expect(plan.quota.get('menu-kampanya')).toBe(0);
    // Still spread first: four different categories, none with two.
    expect([...plan.quota.values()].every((v) => v <= 1)).toBe(true);
    expect(quotaRows(doner, plan.quota)).toHaveLength(4);
  });

  it('quick mode gives its four category products to a kitchen with only two categories', () => {
    // An ice-cream shop: desserts and drinks, nothing else.
    const icecream = categoryGaps(
      [
        { key: 'tatli', label: 'Tatlı', minItems: 6, sortOrder: 1 },
        { key: 'icecek', label: 'İçecek', minItems: 3, sortOrder: 2 },
      ],
      new Map([
        ['tatli', 3],
        ['icecek', 1],
      ]),
    );
    const plan = planRun({ mode: 'quick', categories: icecream, current: 4, missing: 5, needOptions: 3 });
    expect(plan.products).toBe(4);
    expect(plan.quota.get('tatli')).toBe(2);
    expect(plan.quota.get('icecek')).toBe(2);
    // A kitchen with nothing but combos to offer gets none: the loop ends instead of spinning.
    const combos = categoryGaps([{ key: 'menu-kampanya', label: 'Menü & Kampanya', minItems: 1, sortOrder: 1 }], new Map());
    expect(planRun({ mode: 'quick', categories: combos, current: 4, missing: 1, needOptions: 0 }).products).toBe(0);
  });

  it('quick mode on a one-product menu ("ürün ekle"): ten suggestions, half of them alternatives', () => {
    const plan = planRun({ mode: 'quick', categories: kebap, current: 1, missing: 19, needOptions: 1 });
    expect(plan.products).toBe(5);
    expect(plan.alternatives).toBe(5);
    expect([...plan.quota.values()].every((v) => v <= 2)).toBe(true);
    expect(plan.quota.get('menu-kampanya')).toBe(0);
    expect(plan.optionTargets).toBe(1);
  });

  it('full mode: fills to the opening target, not just to the category minimums', () => {
    // 10 products in a 30-product cuisine. The category gaps alone sum to 5 — the old cap.
    const shape = kebap.reduce((sum, c) => sum + c.missing, 0);
    expect(shape).toBeLessThan(10);
    const plan = planRun({ mode: 'full', categories: kebap, missing: 20, needOptions: 10 });
    expect(plan.products).toBe(22);
    expect(plan.optionTargets).toBe(10);
    // Every short category is served, and the surplus follows the cuisine's shape: mains get the largest share.
    expect(plan.quota.get('corba')).toBeGreaterThan(0);
    expect(plan.quota.get('ana-yemek')).toBeGreaterThan(plan.quota.get('tatli')!);
    // Combos are the last resort: at most one, and only because everything else is capped.
    expect(plan.quota.get('menu-kampanya')).toBeLessThanOrEqual(1);
  });

  it('full mode still answers a menu that already meets its minimum', () => {
    const full = categoryGaps(
      [
        { key: 'ana-yemek', label: 'Ana Yemek', minItems: 6, sortOrder: 2 },
        { key: 'icecek', label: 'İçecek', minItems: 3, sortOrder: 6 },
      ],
      new Map([
        ['ana-yemek', 6],
        ['icecek', 3],
      ]),
    );
    const plan = planRun({ mode: 'full', categories: full, missing: 0, needOptions: 0 });
    expect(plan.products).toBe(8);
    expect(plan.optionTargets).toBe(0);
  });

  it('follows the cuisine minimum when its category table asks for far less', () => {
    // A café whose opening minimum is 50 but whose three categories sum to 13: capping each category at twice
    // its own minimum would answer a 10-product menu with 26 suggestions and still report "hedefe ulaşılamıyor".
    const kafe = categoryGaps(
      [
        { key: 'icecek', label: 'İçecek', minItems: 8, sortOrder: 1 },
        { key: 'atistirmalik', label: 'Atıştırmalık', minItems: 3, sortOrder: 2 },
        { key: 'tatli', label: 'Tatlı', minItems: 2, sortOrder: 3 },
      ],
      new Map([
        ['icecek', 8],
        ['atistirmalik', 1],
      ]),
    );
    const plan = planRun({ mode: 'full', categories: kafe, missing: 40, needOptions: 10 });
    expect(plan.products).toBe(40);
    expect(plan.quota.get('icecek')).toBeGreaterThan(16);
  });

  it('never gives a category more than its cap, even when the target cannot be reached', () => {
    const tiny = categoryGaps([{ key: 'tatli', label: 'Tatlı', minItems: 2, sortOrder: 1 }], new Map());
    const quota = allocate(tiny, 30, (c) => c.minItems * 2);
    expect(quota.get('tatli')).toBe(4);
  });
});

describe('category conflict (Section C "yanlış kategori")', () => {
  it('reports a heading that contradicts the product name', () => {
    expect(index.conflict('Ayran', 'Tatlılar')).toEqual({ section: 'tatli', name: 'icecek' });
    expect(index.conflict('Künefe', 'İçecekler')).toEqual({ section: 'icecek', name: 'tatli' });
  });

  it('stays quiet when either side is unknown or both agree', () => {
    // "Ocakbaşı" maps to nothing: no evidence, no alarm.
    expect(index.conflict('Ayran', 'Ocakbaşı')).toBeNull();
    expect(index.conflict('Adana Kebap', 'Tatlılar')).toBeNull();
    expect(index.conflict('Künefe', 'Tatlılar')).toBeNull();
    expect(index.conflict('Ayran', null)).toBeNull();
  });
});

describe('merging an option card into a template', () => {
  const base: TemplatePayload = {
    name: 'Adana Kebap',
    description: 'Acılı zırh kıyması, közde pişirilir; lavaş, közlenmiş domates ve biberle.',
    servingNote: 'Sıcak servis',
    portionInfo: '1 porsiyon ~180 g',
    optionGroups: [
      {
        name: 'Porsiyon',
        selectionType: 'single',
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        options: [
          { name: '1 Porsiyon', priceMode: 'sets_base', isDefault: true },
          { name: '1,5 Porsiyon', priceMode: 'sets_base', isDefault: false },
        ],
      },
      {
        name: 'Acı Seviyesi',
        selectionType: 'single',
        isRequired: false,
        minSelect: 0,
        maxSelect: 1,
        options: [
          { name: 'Acılı', priceMode: 'free', isDefault: false },
          { name: 'Acısız', priceMode: 'free', isDefault: false },
        ],
      },
    ],
    removableIngredients: ['Soğan'],
    extraIngredients: [{ name: 'Ekstra Lavaş', priceHint: 'ek ücretli' }],
    tags: ['acılı', 'kırmızı et'],
    allergenNotes: ['gluten'],
    upsellSuggestion: 'Yanına ayran',
  };

  it('keeps everything the card does not touch', () => {
    const merged = mergeOptionCard(base, { optionGroups: [], removableIngredients: ['Maydanoz'], extraIngredients: [] });
    expect(merged.description).toBe(base.description);
    expect(merged.tags).toEqual(base.tags);
    expect(merged.optionGroups).toEqual(base.optionGroups);
    expect(merged.removableIngredients).toEqual(['Soğan', 'Maydanoz']);
  });

  it('replaces a group of the same name and never ends up with two base-price groups', () => {
    const merged = mergeOptionCard(base, {
      optionGroups: [
        {
          name: 'Boy',
          selectionType: 'single',
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          options: [
            { name: 'Yarım', priceMode: 'sets_base' },
            { name: 'Tam', priceMode: 'sets_base' },
          ],
        },
        {
          name: 'acı seviyesi',
          selectionType: 'single',
          isRequired: false,
          minSelect: 0,
          maxSelect: 1,
          options: [
            { name: 'Az Acılı', priceMode: 'free' },
            { name: 'Çok Acılı', priceMode: 'free' },
          ],
        },
      ],
      removableIngredients: ['soğan'],
      extraIngredients: ['Ekstra Lavaş', 'Ekstra Közlenmiş Biber'],
    });
    // The card's "Boy" sets the base price now; the template's "Porsiyon" had to go.
    expect(merged.optionGroups.map((g) => g.name)).toEqual(['Boy', 'acı seviyesi']);
    expect(merged.optionGroups.filter((g) => g.options.some((o) => o.priceMode === 'sets_base'))).toHaveLength(1);
    // Case/diacritic-insensitive unions: no duplicate "Soğan", no duplicate "Ekstra Lavaş".
    expect(merged.removableIngredients).toEqual(['Soğan']);
    expect(merged.extraIngredients.map((e) => e.name)).toEqual(['Ekstra Lavaş', 'Ekstra Közlenmiş Biber']);
    // And it is still a valid template.
    expect(templatePayloadSchema.safeParse(merged).success).toBe(true);
  });
});
