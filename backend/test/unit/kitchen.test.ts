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

// D-213: what the rep gives leads, and the kitchen still decides what is makeable.
describe('kitchen profile — the kind and the variants of what the menu sells', () => {
  it('a balık-ekmek stand grills fish too: the fish its name shows is its kind, not everything fish comes with', () => {
    const stand = kitchen('Balık Ekmek');
    const levrek = fits(stand, 'Levrek Izgara');
    expect(levrek.ok).toBe(true);
    expect(levrek.basedOn).toBe('Balık Ekmek');
    // Between the menu's own type (40) and the rest (15).
    expect(levrek.score).toBe(30);
    expect(stand.close('balik')).toBe(true);
    // Seafood is of the same kind as fish for the order of the call…
    expect(stand.close('deniz-urunu')).toBe(true);
    // …but a speciality still needs its own word on the menu.
    expect(fits(stand, 'Midye Tava').ok).toBe(false);
  });

  it('a type only guessed from the cuisine is no evidence of the same product', () => {
    const hamsi = new KitchenProfile([{ name: 'Hamsi Tava' }], index, 'balik-deniz');
    const { type, byName } = hamsi.typeOf('Kısır');
    expect(byName).toBe(false);
    const kisir = hamsi.fit('Kısır', type.key, byName);
    expect(kisir.score).toBeLessThan(40);
    expect(kisir.basedOn).toBeNull();
  });

  it('a variant carries the menu product’s own word — not its filling, its cooking or its serving', () => {
    const hamsi = kitchen('Hamsi Tava');
    expect(hamsi.variant('Hamsili Pilav')).toBe(true);
    expect(hamsi.variant('Hamsi Buğulama')).toBe(true);
    expect(hamsi.variant('Karides Tava')).toBe(false);
    expect(hamsi.variant('Lüfer Izgara')).toBe(false);
    const tost = kitchen('Kaşarlı Tost');
    expect(tost.variant('Karışık Tost')).toBe(true);
    expect(tost.variant('Kaşarlı Pide')).toBe(false);
    const cheesecake = kitchen('Meyveli Cheesecake');
    expect(cheesecake.variant('San Sebastian Cheesecake')).toBe(true);
    expect(cheesecake.variant('Meyve Suyu')).toBe(false);
    const adana = kitchen('Adana Kebap');
    expect(adana.variant('Adana Dürüm')).toBe(true);
    expect(adana.variant('Urfa Kebap')).toBe(true);
    expect(adana.variant('Beyti')).toBe(false);
    // Seen live (D-222): the sushi bar's Wakame Salatası brought Çoban, Tabule and Gavurdağı Salata as its variants.
    const wakame = kitchen('Wakame Salatası', 'Karides Nigiri');
    expect(wakame.variant('Çoban Salata')).toBe(false);
    expect(wakame.variant('Tabule Salata')).toBe(false);
    expect(wakame.variant('Deniz Yosunu Wakame')).toBe(true);
  });

  it('a start from the cuisine alone adopts the cuisine’s specialities; a menu’s own evidence always wins', () => {
    const empty = kitchen();
    expect(fits(empty, 'Çiğ Köfte Dürüm').ok).toBe(false);
    empty.adoptSpecialties(['Çiğ Köfte Porsiyon', 'Mega Çiğ Köfte Dürüm', 'Ayran']);
    expect(fits(empty, 'Çiğ Köfte Dürüm').ok).toBe(true);
    expect(fits(empty, 'Et Tantuni Dürüm').ok).toBe(false);

    const kebap = kitchen('Adana Kebap');
    kebap.adoptSpecialties(['Tavuk Döner Dürüm']);
    expect(fits(kebap, 'Tavuk Döner Dürüm').ok).toBe(false);
  });
});
