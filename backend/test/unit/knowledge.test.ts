import { describe, expect, it } from 'vitest';
import { asRemovable, acceptableDescription, ground, type RawOptionGroup } from '../../src/agents/grounding.js';
import { FeedbackIndex } from '../../src/agents/knowledge.js';
import { splitBatches } from '../../src/agents/option-modifier.js';
import { CUISINE_SLUGS } from '../../src/db/seed/cuisines.js';
import { CUISINE_TARGETS } from '../../src/db/seed/cuisine-targets.js';
import { CATEGORY_DEFAULT_TYPE, CUISINE_DEFAULT_TYPE, SEED_PRODUCT_TYPES } from '../../src/db/seed/product-types.js';
import { SEED_TEMPLATES } from '../../src/db/seed/templates.js';
import { countWords, fitDescription, isForbiddenGroup, ProductTypeIndex, reconcileCategory } from '../../src/domain/product-type.js';
import { sameProductName, variantConflict } from '../../src/lib/same-product.js';
import { templateOptionGroupSchema } from '../../src/domain/template.js';
import { normalizeTr } from '../../src/lib/normalize-tr.js';
import { diffFeedback } from '../../src/modules/analyze/feedback.js';

const index = new ProductTypeIndex(
  SEED_PRODUCT_TYPES,
  new Map(Object.entries(CUISINE_DEFAULT_TYPE)),
  new Map(Object.entries(CATEGORY_DEFAULT_TYPE)),
);
const type = (key: string) => index.get(key)!;

const group = (name: string, options: string[], over: Partial<RawOptionGroup> = {}): RawOptionGroup => ({
  name,
  selectionType: 'single',
  isRequired: false,
  minSelect: 0,
  maxSelect: 1,
  options: options.map((o) => ({ name: o, priceMode: 'free' as const })),
  ...over,
});

const want = { options: true, ingredients: true, description: true };

describe('knowledge base — product types', () => {
  it('every seeded row is usable: valid groups, 6–8 word fallback, known category', () => {
    for (const t of SEED_PRODUCT_TYPES) {
      for (const g of t.optionGroups) expect(templateOptionGroupSchema.safeParse(g).success, `${t.key} / ${g.name}`).toBe(true);
      if (t.plain) {
        expect(t.optionGroups, t.key).toHaveLength(0);
        expect(t.fallbackDescription, t.key).toBe('');
        continue;
      }
      expect(countWords(t.fallbackDescription), `${t.key}: ${t.fallbackDescription}`).toBeGreaterThanOrEqual(6);
      expect(countWords(t.fallbackDescription), `${t.key}: ${t.fallbackDescription}`).toBeLessThanOrEqual(8);
      // A type never forbids a group it opens with itself.
      for (const g of t.optionGroups) expect(isForbiddenGroup(index.get(t.key)!, g.name), `${t.key} / ${g.name}`).toBe(false);
      expect(t.removable.length + t.extras.length, t.key).toBeGreaterThan(0);
    }
    expect(new Set(SEED_PRODUCT_TYPES.map((t) => t.key)).size).toBe(SEED_PRODUCT_TYPES.length);
  });

  it('knows what a product is from its name — the form before the filling', () => {
    const cases: [string, string][] = [
      ['Adana Kebap', 'kebap-porsiyon'],
      ['Kaburga Dolması', 'et-yemegi'],
      ['Tavuk Döner Dürüm', 'durum'],
      ['İskender', 'doner-porsiyon'],
      ['Mercimek Çorbası', 'corba'],
      ['Künefe', 'tatli-serbetli'],
      ['Sütlaç', 'tatli-sutlu'],
      ['Latte', 'sicak-kahve'],
      ['Türk Kahvesi', 'sicak-kahve'],
      ['Ice Latte', 'soguk-icecek'],
      ['Limonata', 'soguk-icecek'],
      ['Kola', 'mesrubat'],
      ['Ayran', 'mesrubat'],
      ['Su Böreği', 'borek-gozleme'],
      ['Karışık Pizza', 'pizza'],
      ['Lahmacun', 'lahmacun'],
    ];
    for (const [name, key] of cases) expect(index.classify(name).key, name).toBe(key);
  });

  it('packaged drinks are plain rows; prepared drinks are not', () => {
    expect(index.classify('Kola').plain).toBe(true);
    expect(index.classify('Ayran').plain).toBe(true);
    expect(index.classify('Maden Suyu').plain).toBe(true);
    expect(index.classify('Latte').plain).toBe(false);
    expect(index.classify('Limonata').plain).toBe(false);
  });

  it('falls back on the cuisine when the name says nothing, and says so', () => {
    const resolved = index.resolve('Karışık', 'pide-lahmacun');
    expect(resolved.byName).toBe(false);
    expect(resolved.type.key).toBe(CUISINE_DEFAULT_TYPE['pide-lahmacun']);
  });

  it('classifies every pool template to a type of its own category family', () => {
    for (const t of SEED_TEMPLATES) {
      const found = index.classify(t.payload.name, t.cuisine);
      expect(found, `${t.cuisine} / ${t.payload.name}`).toBeDefined();
      // A pool drink with no description is exactly a plain type, and the other way round.
      if (t.payload.description === '') expect(found.plain, `${t.payload.name} → ${found.key}`).toBe(true);
    }
  });

  it('forbids the groups a person would call nonsense', () => {
    expect(isForbiddenGroup(type('corba'), 'Pişirme Derecesi')).toBe(true);
    expect(isForbiddenGroup(type('tatli-serbetli'), 'Ekmek Seçimi')).toBe(true);
    expect(isForbiddenGroup(type('tatli-serbetli'), 'Acı Seviyesi')).toBe(true);
    expect(isForbiddenGroup(type('kebap-porsiyon'), 'Süt Seçimi')).toBe(true);
    expect(isForbiddenGroup(type('salata'), 'İçecek Seçimi')).toBe(true);
    expect(isForbiddenGroup(type('sicak-kahve'), 'Süt Seçimi')).toBe(false);
    expect(isForbiddenGroup(type('steak'), 'Pişirme Derecesi')).toBe(false);
  });

  it('has a realistic opening target for every cuisine, never below the 10-product rule', () => {
    for (const slug of CUISINE_SLUGS) {
      const t = CUISINE_TARGETS[slug];
      expect(t, slug).toBeDefined();
      expect(t.target, slug).toBeGreaterThanOrEqual(10);
      expect(t.target, slug).toBeLessThanOrEqual(t.typical);
    }
  });
});

describe('descriptions — 6 to 8 words', () => {
  it('keeps a description that already fits', () => {
    expect(fitDescription('Acılı zırh kıyması közde pişer, lavaşla servis edilir')).toBe(
      'Acılı zırh kıyması közde pişer, lavaşla servis edilir.',
    );
  });

  it('cuts a long one at a clause boundary rather than mid-thought', () => {
    const fitted = fitDescription('İnce açılmış hamur üzerine kıymalı harç, taş fırında pişirilir ve yanında limon ile maydanoz gelir');
    expect(fitted).not.toBeNull();
    expect(countWords(fitted!)).toBeGreaterThanOrEqual(6);
    expect(countWords(fitted!)).toBeLessThanOrEqual(8);
    expect(fitted!.endsWith(' ve.')).toBe(false);
  });

  it('never pads a short one', () => {
    expect(fitDescription('Lezzetli kebap')).toBeNull();
  });

  it('refuses English, ASCII-folded Turkish and ad language', () => {
    expect(acceptableDescription('Grilled chicken served with rice and salad today')).toBeNull();
    expect(acceptableDescription('Izgarada pisen kiymali kofte, pilav ve sogan ile')).toBeNull();
    expect(acceptableDescription('Eşsiz lezzette muhteşem kebap, lavaş ve közle birlikte')).toBeNull();
    expect(acceptableDescription('Izgarada pişen köfte, pilav ve közlenmiş biberle')).toBe('Izgarada pişen köfte, pilav ve közlenmiş biberle.');
  });
});

describe('grounding a suggestion in the product type', () => {
  it('deletes the absurd groups and completes what is left from the type', () => {
    const result = ground(
      {
        optionGroups: [group('Acı Seviyesi', ['Acısız', 'Acılı']), group('Ekmek Seçimi', ['Lavaş', 'Somun'])],
        removable: [],
        extras: [],
        description: null,
      },
      { productName: 'Künefe', type: type('tatli-serbetli'), byName: true, source: 'model', want },
    );
    expect(result.optionGroups.map((g) => g.name)).not.toContain('Acı Seviyesi');
    expect(result.optionGroups.map((g) => g.name)).not.toContain('Ekmek Seçimi');
    expect(result.optionGroups.length).toBeGreaterThan(0);
    expect(result.removable.length).toBeGreaterThan(0);
    expect(result.extras.length).toBeGreaterThan(0);
    expect(countWords(result.description)).toBeGreaterThanOrEqual(6);
    expect(result.filled).toEqual(expect.arrayContaining(['options', 'removable', 'extras', 'description']));
    expect(result.confidence).toBeLessThan(84);
  });

  it('moves ingredient lists out of the options, into their own sections', () => {
    const result = ground(
      {
        optionGroups: [
          group('Porsiyon', ['1 Porsiyon', '1,5 Porsiyon'], { isRequired: true, minSelect: 1 }),
          group('Çıkarılacak Malzemeler', ['Soğansız', 'Domatessiz', 'Turşusuz'], { selectionType: 'multi', maxSelect: 3 }),
          group('Ekstra Malzemeler', ['Ekstra Kaşar', 'Ekstra Et'], { selectionType: 'multi', maxSelect: 2 }),
          group('Yanında', ['Közlenmiş Biber', 'Ekstra Lavaş', 'Sumaklı Soğan'], { selectionType: 'multi', maxSelect: 3 }),
        ],
        removable: ['Maydanoz', 'Ekstra Yoğurt'],
        extras: ['Acısız'],
        description: 'Acılı zırh kıyması közde pişer, lavaşla servis edilir.',
      },
      { productName: 'Adana Kebap', type: type('kebap-porsiyon'), byName: true, source: 'model', want },
    );
    const groups = result.optionGroups.map((g) => g.name);
    expect(groups).not.toContain('Çıkarılacak Malzemeler');
    expect(groups).not.toContain('Ekstra Malzemeler');
    expect(result.removable).toEqual(expect.arrayContaining(['Soğan', 'Domates', 'Turşu', 'Maydanoz', 'Acı']));
    expect(result.extras).toEqual(expect.arrayContaining(['Ekstra Kaşar', 'Ekstra Et', 'Ekstra Lavaş', 'Ekstra Yoğurt']));
    expect(result.optionGroups.find((g) => g.name === 'Yanında')?.options.map((o) => o.name)).toEqual(['Közlenmiş Biber', 'Sumaklı Soğan']);
    // Nothing was missing: the model's own description stays.
    expect(result.description).toBe('Acılı zırh kıyması közde pişer, lavaşla servis edilir.');
  });

  it('builds a whole card from the type when nothing was proposed', () => {
    const result = ground(
      { optionGroups: [], removable: [], extras: [], description: null },
      { productName: 'Mercimek Çorbası', type: type('corba'), byName: true, source: 'kb', want },
    );
    expect(result.optionGroups.map((g) => g.name)).toEqual(type('corba').optionGroups.map((g) => g.name));
    expect(result.removable.length).toBeGreaterThan(0);
    expect(result.extras.length).toBeGreaterThan(0);
    expect(result.description).toBe(type('corba').fallbackDescription);
  });

  it('keeps a packaged drink a plain row whatever was proposed', () => {
    const result = ground(
      { optionGroups: [group('Boy', ['Küçük', 'Büyük'])], removable: ['Buz'], extras: ['Limon'], description: 'Soğuk servis edilen gazlı içecek, buzla birlikte.' },
      { productName: 'Kola', type: type('mesrubat'), byName: true, source: 'model', want },
    );
    expect(result).toMatchObject({ optionGroups: [], removable: [], extras: [], description: '' });
  });

  it('takes nothing savory onto a dessert and never lists one thing in both sections', () => {
    const result = ground(
      {
        optionGroups: [group('Yanında', ['Kaymak', 'Turşu', 'Dondurma'], { selectionType: 'multi', maxSelect: 2 })],
        removable: ['Soğan', 'Antep Fıstığı'],
        extras: ['Antep Fıstığı', 'Kaymak'],
        description: null,
      },
      { productName: 'Baklava', type: type('tatli-serbetli'), byName: true, source: 'model', want },
    );
    expect(result.optionGroups.flatMap((g) => g.options.map((o) => o.name))).not.toContain('Turşu');
    expect(result.removable).not.toContain('Soğan');
    expect(result.extras).not.toContain('Antep Fıstığı');
  });

  it('leaves out what the panel already shows filled', () => {
    const result = ground(
      { optionGroups: [], removable: [], extras: [], description: null },
      { productName: 'Lahmacun', type: type('lahmacun'), byName: true, source: 'kb', want: { options: false, ingredients: true, description: false } },
    );
    expect(result.optionGroups).toHaveLength(0);
    expect(result.description).toBe('');
    expect(result.removable.length).toBeGreaterThan(0);
  });

  it('stops offering what this team keeps deleting for the product type', () => {
    const feedback = new FeedbackIndex(
      new Map([
        ['kebap-porsiyon|option_group|servis sekli', { accepted: 1, removed: 6 }],
        ['kebap-porsiyon|removable|maydanoz', { accepted: 0, removed: 4 }],
      ]),
    );
    const result = ground(
      { optionGroups: [], removable: [], extras: [], description: null },
      { productName: 'Urfa Kebap', type: type('kebap-porsiyon'), byName: true, source: 'kb', want, feedback },
    );
    expect(result.optionGroups.map((g) => g.name)).not.toContain('Servis Şekli');
    expect(result.removable).not.toContain('Maydanoz');
    expect(feedback.rejectedFor('kebap-porsiyon')).toEqual(expect.arrayContaining([normalizeTr('Servis Şekli')]));
    // Two removals are not yet a pattern.
    expect(new FeedbackIndex(new Map([['corba|extra|limon', { accepted: 0, removed: 2 }]])).isRejected('corba', 'extra', 'Limon')).toBe(false);
  });

  it('drops a choice the product name already made, and never adds it back from the type', () => {
    const fish = ground(
      {
        optionGroups: [group('Pişirme Şekli', ['Izgara', 'Fırında', 'Buğulama']), group('Garnitür', ['Roka', 'Patates'], { selectionType: 'multi', maxSelect: 2 })],
        removable: ['Soğan'],
        extras: ['Ekstra Limon'],
        description: null,
      },
      { productName: 'Somon Izgara', type: type('balik'), byName: true, source: 'model', want },
    );
    expect(fish.optionGroups.map((g) => g.name)).not.toContain('Pişirme Şekli');
    const pasta = ground(
      { optionGroups: [group('Makarna Türü', ['Spagetti', 'Penne', 'Fettuccine'])], removable: [], extras: [], description: null },
      { productName: 'Penne Arrabbiata', type: type('makarna'), byName: true, source: 'model', want },
    );
    expect(pasta.optionGroups.map((g) => g.name)).not.toContain('Makarna Türü');
    expect(pasta.optionGroups.length).toBeGreaterThan(0);
  });

  it('never charges for "nothing", but keeps a paid option that merely ends in "-sız"', () => {
    const result = ground(
      {
        optionGroups: [
          { ...group('Sos', ['Sossuz', 'Mantar Sosu', 'Karabiber Sosu']), options: [{ name: 'Sossuz', priceMode: 'surcharge' }, { name: 'Mantar Sosu', priceMode: 'surcharge' }, { name: 'Karabiber Sosu', priceMode: 'surcharge' }] },
          { ...group('İçecek Seçimi', ['Ayran', 'Şalgam (Acısız)']), options: [{ name: 'Ayran', priceMode: 'surcharge' }, { name: 'Şalgam (Acısız)', priceMode: 'surcharge' }] },
        ],
        removable: [],
        extras: [],
        description: null,
      },
      { productName: 'Antrikot', type: type('steak'), byName: true, source: 'pool', want },
    );
    const option = (g: string, o: string) => result.optionGroups.find((x) => x.name === g)?.options.find((x) => x.name === o);
    expect(option('Sos', 'Sossuz')?.priceMode).toBe('free');
    expect(option('Sos', 'Mantar Sosu')?.priceMode).toBe('surcharge');
    expect(option('İçecek Seçimi', 'Şalgam (Acısız)')?.priceMode).toBe('surcharge');
  });

  it('borrows only the size choice from a type the name did not identify — never its sauces or ingredients', () => {
    // "Közlenmiş Sebze" filed under ara sıcak: the snack type's ranch and garlic are someone else's.
    const weak = ground(
      { optionGroups: [], removable: [], extras: [], description: 'Odun ateşinde közlenen mevsim sebzeleri, sıcak servis.' },
      { productName: 'Közlenmiş Sebzeler', type: type('ara-sicak'), byName: false, source: 'model', want },
    );
    expect(weak.optionGroups.every((g) => g.options.every((o) => o.priceMode === 'sets_base'))).toBe(true);
    expect(weak.removable).toEqual([]);
    expect(weak.extras).toEqual([]);
    expect(weak.description).toBe('Odun ateşinde közlenen mevsim sebzeleri, sıcak servis.');
    expect(weak.confidence).toBeLessThan(75);
    // A garnish is not a plate of fries: no dips, one portion choice.
    expect(index.classify('Mantar Sote').key).toBe('garnitur');
    expect(index.classify('Patates Püresi').key).toBe('garnitur');
    expect(index.classify('Patates Kızartması').key).toBe('yan-urun');
    expect(index.classify('Browni').key).toBe('tatli-pasta');
  });

  it('keeps meat and cheese off a çiğ köfte, and a box cutter off a cake', () => {
    const cig = ground(
      { optionGroups: [], removable: ['Marul'], extras: ['Ekstra Et', 'Ekstra Kaşar', 'Ekstra Lavaş'], description: null },
      { productName: 'Çiğ Köfte Dürüm', type: type('cig-kofte'), byName: true, source: 'model', want },
    );
    expect(cig.extras).toEqual(['Ekstra Lavaş']);
    const cake = ground(
      { optionGroups: [], removable: [], extras: ['Maket Bıçak', 'Ekstra Mum'], description: null },
      { productName: 'Yaş Pasta', type: type('tatli-pasta'), byName: true, source: 'pool', want },
    );
    expect(cake.extras).not.toContain('Maket Bıçak');
    expect(cake.extras).toContain('Ekstra Mum');
  });

  it('reads the "…sız" options a customer ticks as the ingredient itself', () => {
    expect(asRemovable('Soğansız')).toBe('Soğan');
    expect(asRemovable('Domatessiz')).toBe('Domates');
    expect(asRemovable('Turşusuz')).toBe('Turşu');
    expect(asRemovable('Turşu olmasın')).toBe('Turşu');
    expect(asRemovable('Maydanoz')).toBe('Maydanoz');
  });
});

describe('understanding — same product or another one', () => {
  const n = (text: string) => normalizeTr(text);

  it('a longer spelling of the same product is the same product', () => {
    expect(sameProductName(n('Mercimek'), n('Mercimek Çorbası'))).toBe(true);
    expect(sameProductName(n('Portakal Suyu'), n('Taze Sıkma Portakal Suyu'))).toBe(true);
    expect(sameProductName(n('Su'), n('Doğal Kaynak Suyu'))).toBe(true);
    // …but a word that changes what is sold keeps them apart.
    expect(sameProductName(n('Latte'), n('Ice Latte'))).toBe(false);
    expect(sameProductName(n('Cheeseburger'), n('Double Cheeseburger'))).toBe(false);
  });

  it('a bare product name already on the menu is not suggested again', () => {
    expect(sameProductName(n('Et Tantuni Dürüm'), n('Tantuni'))).toBe(true);
    expect(sameProductName(n('Peynirli Poğaça'), n('Poğaça'))).toBe(true);
  });

  it('refuses a close match that is another dish: another cooking, filling, meat or form', () => {
    expect(variantConflict(n('Levrek Buğulama'), n('Levrek Izgara'))).toBe(true);
    expect(variantConflict(n('Kıymalı Pide'), n('Kaşarlı Pide'))).toBe(true);
    expect(variantConflict(n('Tavuk Döner Dürüm'), n('Et Döner Dürüm'))).toBe(true);
    expect(variantConflict(n('Çiğ Köfte Kase'), n('Çiğ Köfte Dürüm'))).toBe(true);
    expect(variantConflict(n('Fıstıklı Kadayıf Dolması'), n('Tel Kadayıf'))).toBe(true);
  });

  it('accepts the everyday short and long names of one product', () => {
    expect(variantConflict(n('Adana'), n('Adana Kebap'))).toBe(false);
    expect(variantConflict(n('Kalamar Kızartma'), n('Kalamar Tava'))).toBe(false);
    expect(variantConflict(n('Yumurtalı Sucuk'), n('Sucuklu Yumurta'))).toBe(false);
    expect(variantConflict(n('Tavuk Şiş Porsiyon'), n('Tavuk Şiş'))).toBe(false);
    expect(variantConflict(n('Midye'), n('Midye Dolma'))).toBe(false);
    expect(variantConflict(n('Falafel Wrap'), n('Falafel Dürüm'))).toBe(false);
  });

  it('files a soup under soup and a chicken dish under mains, whatever stray word the keyword table saw', () => {
    const known = () => true;
    const soup = index.resolve('Tavuk Suyu Çorbası');
    expect(soup.type.key).toBe('corba');
    expect(reconcileCategory('icecek', false, soup, known)).toBe('corba');
    const chicken = index.resolve('Tatlı Ekşi Soslu Tavuk');
    expect(reconcileCategory('tatli', false, chicken, known)).toBe(chicken.type.categoryKey);
    expect(chicken.type.categoryKey).not.toBe('tatli');
    // The restaurant's own heading still wins, and a category the drink/dessert confusion does not touch stays.
    expect(reconcileCategory('icecek', true, soup, known)).toBe('icecek');
    expect(reconcileCategory('ara-sicak', false, index.resolve('Mercimek Çorbası'), known)).toBe('ara-sicak');
  });
});

describe('option batches', () => {
  it('splits evenly so two parallel calls take the same time', () => {
    expect(splitBatches([1, 2, 3, 4, 5, 6, 7], 2).map((b) => b.length)).toEqual([4, 3]);
    expect(splitBatches(Array.from({ length: 13 }, (_, i) => i), 5).map((b) => b.length)).toEqual([5, 5, 3]);
    expect(splitBatches(Array.from({ length: 40 }, (_, i) => i), 4).map((b) => b.length)).toEqual([6, 6, 6, 6]);
    expect(splitBatches([], 3)).toEqual([]);
  });
});

describe('learning — what the user kept', () => {
  it('records removed suggestions and an edited description', () => {
    const rows = diffFeedback(
      {
        optionGroups: [
          { name: 'Porsiyon', selectionType: 'single', isRequired: true, minSelect: 1, maxSelect: 1, options: [{ name: '1 Porsiyon', priceMode: 'sets_base' }] },
          { name: 'İçecek Seçimi', selectionType: 'single', isRequired: false, minSelect: 0, maxSelect: 1, options: [{ name: 'Ayran', priceMode: 'surcharge' }] },
        ],
        removableIngredients: ['Soğan', 'Maydanoz'],
        extraIngredients: ['Ekstra Lavaş'],
        shortDescription: 'Acılı zırh kıyması közde pişer, lavaşla servis edilir.',
      },
      {
        optionGroups: [
          { name: 'Porsiyon', selectionType: 'single', isRequired: true, minSelect: 1, maxSelect: 1, options: [{ name: '1 Porsiyon', priceMode: 'sets_base', isDefault: false }] },
        ],
        removableIngredients: ['soğan'],
        extraIngredients: [{ name: 'Ekstra Lavaş', priceHint: 'ek ücretli' }],
        description: 'Acılı Adana, közde pişer, lavaşla servis edilir.',
      },
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { kind: 'option_group', value: 'Porsiyon', action: 'accepted' },
        { kind: 'option_group', value: 'İçecek Seçimi', action: 'removed' },
        { kind: 'removable', value: 'Soğan', action: 'accepted' },
        { kind: 'removable', value: 'Maydanoz', action: 'removed' },
        { kind: 'extra', value: 'Ekstra Lavaş', action: 'accepted' },
        { kind: 'description', value: 'Acılı zırh kıyması közde pişer, lavaşla servis edilir.', action: 'edited' },
      ]),
    );
  });
});
