import { describe, expect, it } from 'vitest';
import { badCasing, menuQuality } from '../../src/agents/quality.js';
import type { ExistingItem } from '../../src/agents/types.js';

const item = (rawName: string, over: Partial<ExistingItem> = {}): ExistingItem => ({
  rawName,
  normalized: rawName.toLocaleLowerCase('tr'),
  canonicalName: null,
  matchedTemplateId: null,
  categoryKey: 'ana-yemek',
  productType: 'genel',
  sectionText: null,
  hasDescription: 'unknown',
  hasOptions: 'unknown',
  hasRemovables: 'unknown',
  hasImage: 'unknown',
  typed: false,
  seenIn: 1,
  priceText: null,
  optionNames: [],
  categoryConflict: null,
  ...over,
});

const quality = (items: ExistingItem[], cuisineOf: (i: ExistingItem) => string | undefined = () => undefined) =>
  menuQuality({ items, target: 12, mainCuisineId: 'kebap', cuisineOf, cuisineName: (id) => ({ pide: 'Pide & Lahmacun', tatli: 'Tatlı' })[id] });

describe('the opening checklist', () => {
  it('counts products against the target and drinks against ten', () => {
    const menu = [...Array.from({ length: 8 }, (_, i) => item(`Kebap ${i}`)), ...Array.from({ length: 4 }, (_, i) => item(`İçecek ${i}`, { categoryKey: 'icecek' }))];
    const q = quality(menu);
    expect(q.products).toEqual({ current: 12, target: 12, ok: true });
    expect(q.drinks).toEqual({ current: 4, target: 10, ok: false });
  });

  it('says met, missed or unknown for descriptions and photos', () => {
    const seen = (flag: ExistingItem['hasDescription']) => item('Adana', { hasDescription: flag, hasImage: flag });
    // 7 of 10 described: met. 1 of 10 with a photo and nothing unknown: missed.
    const met = quality([...Array.from({ length: 7 }, () => seen('present')), ...Array.from({ length: 3 }, () => seen('absent'))]);
    expect(met.descriptions.ok).toBe(true);
    const photos = quality([seen('present'), ...Array.from({ length: 9 }, () => seen('absent'))]);
    expect(photos.images).toMatchObject({ present: 1, known: 10, total: 10, ok: false });
    // A typed list or a paper menu shows neither: no verdict.
    expect(quality([seen('unknown'), seen('unknown')]).descriptions.ok).toBeNull();
    // 5 described, 5 not visible: could still reach 70 %, so no verdict either.
    expect(quality([...Array.from({ length: 5 }, () => seen('present')), ...Array.from({ length: 5 }, () => seen('unknown'))]).descriptions.ok).toBeNull();
  });

  it('flags names in all caps or all lower case, but not what the rep typed', () => {
    expect(badCasing('ADANA KEBAP')).toBe(true);
    expect(badCasing('adana kebap')).toBe(true);
    expect(badCasing('Adana Kebap')).toBe(false);
    expect(badCasing('XL')).toBe(false);
    const q = quality([item('İSKENDER'), item('Lahmacun'), item('ayran', { typed: true })]);
    expect(q.writing).toEqual({ names: ['İSKENDER'], checked: 2, ok: false });
    expect(quality([item('ayran', { typed: true })]).writing.ok).toBeNull();
  });

  it('suggests an extra cuisine once three dishes point to it, ignoring drinks and sides', () => {
    const menu = [
      item('Lahmacun'),
      item('Kıymalı Pide'),
      item('Kaşarlı Pide'),
      item('Künefe'),
      item('Ayran', { categoryKey: 'icecek' }),
      item('Patates', { categoryKey: 'yan-urun' }),
      item('Adana'),
    ];
    const cuisineOf = (i: ExistingItem) =>
      ({ Lahmacun: 'pide', 'Kıymalı Pide': 'pide', 'Kaşarlı Pide': 'pide', Künefe: 'tatli', Ayran: 'pide', Patates: 'pide', Adana: 'kebap' })[i.rawName];
    expect(quality(menu, cuisineOf).extraCuisines).toEqual([{ name: 'Pide & Lahmacun', count: 3 }]);
  });
});
