import { describe, expect, it } from 'vitest';
import { menuProductPitch, newProductPitch, type MenuProductPitchInput, type NewProductPitchInput } from '../../src/agents/pitch.js';

/** The call screen's "neden" and order (D-196): facts only, in the order the expert should bring them up. */

const gaps = [
  { key: 'tatli', label: 'Tatlı', present: 0, minItems: 2, missing: 2 },
  { key: 'icecek', label: 'İçecek', present: 1, minItems: 3, missing: 2 },
  { key: 'ana-yemek', label: 'Ana Yemek', present: 8, minItems: 6, missing: 0 },
];

const base: NewProductPitchInput = {
  categoryKey: 'tatli',
  categoryLabel: 'Tatlı',
  gaps,
  cuisineName: 'Kebap & Izgara',
  importance: 80,
  plain: false,
  answers: undefined,
};

describe('new product: what to say and when', () => {
  it('opens with what the menu has none of, and how common the product is in the cuisine', () => {
    const pitch = newProductPitch(base);
    expect(pitch.text).toBe('Menünüzde hiç tatlı yok; Kebap & Izgara menülerinin çoğunda var.');
    expect(pitch.priority).toBe(108);
  });

  it('a thin category comes after an empty one; a full one after both', () => {
    const thin = newProductPitch({ ...base, categoryKey: 'icecek', categoryLabel: 'İçecek', importance: 60 });
    expect(thin.text).toBe('İçecek tarafınız az (1/3); Kebap & Izgara menülerinde sık görülür.');
    const full = newProductPitch({ ...base, categoryKey: 'ana-yemek', categoryLabel: 'Ana Yemek', importance: 40 });
    expect(full.text).toBe('');
    expect(newProductPitch(base).priority).toBeGreaterThan(thin.priority);
    expect(thin.priority).toBeGreaterThan(full.priority);
  });

  it('says what earlier sellers answered once there is enough of it, and moves a turned-down product to the back', () => {
    const liked = newProductPitch({ ...base, importance: 0, answers: { accepted: 4, removed: 1 } });
    expect(liked.text).toBe('Menünüzde hiç tatlı yok; son 5 satıcıdan 4 tanesi ekledi.');
    expect(liked.priority).toBe(110);
    // Two answers are not a statistic.
    expect(newProductPitch({ ...base, importance: 0, answers: { accepted: 2, removed: 0 } }).text).toBe('Menünüzde hiç tatlı yok.');
    const disliked = newProductPitch({ ...base, answers: { accepted: 0, removed: 4 } });
    expect(disliked.text).not.toContain('satıcı');
    expect(disliked.priority).toBeLessThan(newProductPitch(base).priority - 30);
  });

  it('a packaged drink with nothing else to say is easy to add', () => {
    const drink = newProductPitch({ ...base, categoryKey: 'ana-yemek', categoryLabel: 'Ana Yemek', importance: 0, plain: true });
    expect(drink.text).toBe('Hazır içecek, eklemesi kolay.');
  });
});

describe('product on the menu: the strongest thing its card adds', () => {
  const group = (name: string, priceMode: string) => ({ name, options: [{ name: 'a', priceMode }, { name: 'b', priceMode }] });
  const empty: MenuProductPitchInput = { optionGroups: [], removableIngredients: [], extraIngredients: [], description: '', hadNoOptions: false };

  it('a menu choice grows the basket before anything else', () => {
    const pitch = menuProductPitch({ ...empty, optionGroups: [group('Boy', 'sets_base'), group('Menü', 'surcharge')], extraIngredients: ['Ekstra Et'] });
    expect(pitch.text).toBe('Menü seçeneği (patates, içecek) sepeti büyütür.');
    expect(pitch.priority).toBe(70);
  });

  it('then a drink, a size, an extra, another choice, removables, a description', () => {
    const say = (input: Partial<MenuProductPitchInput>) => menuProductPitch({ ...empty, ...input });
    expect(say({ optionGroups: [group('İçecek Seçimi', 'surcharge')] }).text).toBe('İçecek seçeneği sepeti büyütür.');
    expect(say({ optionGroups: [group('Porsiyon', 'sets_base')] }).text).toBe('Porsiyon seçeneğiyle farklı fiyatlardan satılır.');
    expect(say({ extraIngredients: ['Ekstra Kaşar', 'Sucuk'] }).text).toBe('Ekstra Kaşar gibi ekstralar ek gelir getirir.');
    expect(say({ optionGroups: [group('Acı Seviyesi', 'free')] }).text).toBe('Acı seviyesi seçimi müşterinin işini kolaylaştırır.');
    expect(say({ removableIngredients: ['Soğan'] }).text).toBe('Müşteri istemediği malzemeyi çıkarabilir.');
    expect(say({ description: 'Kısa bir açıklama' }).text).toBe('Kısa açıklama müşterinin karar vermesini kolaylaştırır.');
    expect(say({})).toEqual({ text: '', priority: 0 });
  });

  it('a product the panel shows with no options at all comes a little earlier', () => {
    const plain = menuProductPitch({ ...empty, optionGroups: [group('Porsiyon', 'sets_base')] });
    const bare = menuProductPitch({ ...empty, optionGroups: [group('Porsiyon', 'sets_base')], hadNoOptions: true });
    expect(bare.priority).toBe(plain.priority + 10);
  });
});
