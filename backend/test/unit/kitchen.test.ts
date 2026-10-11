import { describe, expect, it } from 'vitest';
import { KitchenProfile } from '../../src/agents/kitchen.js';
import { CATEGORY_DEFAULT_TYPE, CUISINE_DEFAULT_TYPE, SEED_PRODUCT_TYPES } from '../../src/db/seed/product-types.js';
import { ProductTypeIndex, reconcileCategory } from '../../src/domain/product-type.js';

const index = new ProductTypeIndex(
  SEED_PRODUCT_TYPES,
  new Map(Object.entries(CUISINE_DEFAULT_TYPE)),
  new Map(Object.entries(CATEGORY_DEFAULT_TYPE)),
);
const kitchen = (...names: string[]) => new KitchenProfile(names.map((name) => ({ name })), index);
const fits = (profile: KitchenProfile, name: string) => {
  const { type, byName } = profile.typeOf(name);
  return profile.fit(name, type.key, byName);
};

// D-198: the products production suggested to these menus, and what fits them instead.
describe('kitchen profile — only what this kitchen can make', () => {
  it('a kokoreç shop gets kokoreç alternatives and drinks, never another street shop’s products', () => {
    const kokorec = kitchen('Tam Ekmek Kokoreç', 'Yarım Ekmek Kokoreç', 'Çeyrek Ekmek İzmir Kokoreç', 'Ayran', 'Şalgam Suyu', 'Coca Cola');
    for (const name of ['Waffle', 'Kumpir', 'Midye Tava', 'Midye Dolma', 'Et Tantuni Dürüm']) {
      expect(fits(kokorec, name).ok, name).toBe(false);
    }
    const durum = fits(kokorec, 'Kokoreç Dürüm');
    expect(durum.ok).toBe(true);
    expect(durum.basedOn).toMatch(/Kokoreç/u);
    expect(fits(kokorec, 'Gazoz').ok).toBe(true);
  });

  it('a kebap shop gets Beyti and lahmacun, not döner it has no machine for', () => {
    const kebap = kitchen('Adana Kebap', 'Urfa Kebap', 'Tavuk Şiş', 'Mercimek Çorbası', 'Ayran');
    expect(fits(kebap, 'Tavuk Döner Dürüm').ok).toBe(false);
    expect(fits(kebap, 'İskender').ok).toBe(false);
    const beyti = fits(kebap, 'Beyti');
    expect(beyti.ok).toBe(true);
    expect(beyti.basedOn).not.toBeNull();
    expect(fits(kebap, 'Lahmacun').ok).toBe(true);
    // Closer to the menu ranks higher: another kebap before a side.
    expect(beyti.score).toBeGreaterThan(fits(kebap, 'Lahmacun').score);
  });

  it('a şam tatlısı shop gets its own family, not ice cream or künefe it does not make', () => {
    const tatli = kitchen('Şam Tatlısı', 'Kaymaklı Beleme', 'Üstü Fıstıklı Şam Tatlısı');
    expect(fits(tatli, 'Top Dondurma').ok).toBe(false);
    expect(fits(tatli, 'Künefe').ok).toBe(false);
    expect(fits(tatli, 'Revani').ok).toBe(true);
  });

  it('a drink the menu lists under a brand is not suggested again', () => {
    const menu = kitchen('Kıymalı Pide', 'Ayran Özerhisar', 'Coca Cola', 'Fanta');
    expect(menu.coversDrink('Ayran', 'mesrubat')).toBe(true);
    expect(menu.coversDrink('Kutu İçecek', 'mesrubat')).toBe(true);
    expect(menu.coversDrink('Şalgam Suyu', 'mesrubat')).toBe(false);
  });

  it('briefs the model with what the menu makes and the specialities it does not show', () => {
    const brief = kitchen('Adana Kebap', 'Lahmacun').describe();
    expect(brief.makes).toContain('Adana Kebap');
    expect(brief.avoid).toContain('döner');
    expect(brief.avoid).not.toContain('kebap');
  });

  it('a main dish served in bread is counted as a main, not as a side', () => {
    expect(reconcileCategory('yan-urun', false, index.resolve('Tam Ekmek Kokoreç'), () => true)).toBe('ana-yemek');
    // The restaurant's own heading still decides.
    expect(reconcileCategory('yan-urun', true, index.resolve('Tam Ekmek Kokoreç'), () => true)).toBe('yan-urun');
  });
});
