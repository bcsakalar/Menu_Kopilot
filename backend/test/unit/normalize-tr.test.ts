import { describe, expect, it } from 'vitest';
import { normalizeTr, slugifyTr } from '../../src/lib/normalize-tr.js';

describe('normalizeTr', () => {
  it.each([
    ['Adana Kebap', 'adana kebap'],
    ['ADANA KEBABI', 'adana kebap'],
    ['Adana Kebab', 'adana kebap'],
    ['adana   kebap!!', 'adana kebap'],
    ['Dürüm', 'durum'],
    ['DÜRÜM', 'durum'],
    ['Çiğ Köfte', 'cigkofte'],
    ['cig kofte', 'cigkofte'],
    ['Çiğköfte', 'cigkofte'],
    ['Çiğ Köfteler', 'cigkofte'],
    ['Lahmacunlar', 'lahmacun'],
    ['Pideleri', 'pide'],
    ['Mercimek Çorbası', 'mercimek corba'],
    ['İSKENDER', 'iskender'],
    ['ISKENDER', 'iskender'],
    ['Iskender', 'iskender'],
    ['Pide (Kıymalı)', 'pide kiymali'],
    ['Kıymalı Pide', 'kiymali pide'],
    ['Şiş Köfte', 'sis kofte'],
    ['Chicken Shish', 'chicken sis'],
    ['Künefe', 'kunefe'],
    ['Su Böreği', 'su borek'],
    ['Fırın Sütlaç', 'firin sutlac'],
    ['Türk Kahvesi', 'turk kahve'],
    ['Kayseri Mantısı', 'kayseri manti'],
    ['Tereyağlı Pirinç Pilavı', 'tereyagli pirinc pilav'],
    ['Çoban Salatası', 'coban salata'],
    ['Tiramisu', 'tiramisu'],
    ['Sucuklu Yumurtalı Pide', 'sucuklu yumurtali pide'],
    ['Fıstıklı Baklava', 'fistikli baklava'],
    ['Kaşarlı Pide', 'kasarli pide'],
    ['Şalgam', 'salgam'],
    ['Tavuk Döner Dürüm', 'tavuk doner durum'],
    ['Lahmajun', 'lahmacun'],
    ['Café Latté', 'cafe latte'],
    ['2\'li Lahmacun', '2 li lahmacun'],
    ['', ''],
    ['   ', ''],
    ['!!!', ''],
  ])('%s → %s', (input, expected) => {
    expect(normalizeTr(input)).toBe(expected);
  });

  it('is idempotent', () => {
    const samples = [
      'Adana Kebabı',
      'Çiğ Köfteler',
      'Mercimek Çorbası',
      'Su Böreği',
      'Kuşbaşılı Pide',
      'Patates Kızartması',
      'Türk Kahvesi',
      'Pideleri',
      'Karışık Izgara',
      'Beyti Sarma',
    ];
    for (const s of samples) {
      const once = normalizeTr(s);
      expect(normalizeTr(once)).toBe(once);
    }
  });

  it('treats Turkish and ASCII spellings the same', () => {
    expect(normalizeTr('Kuşbaşılı Pide')).toBe(normalizeTr('Kusbasili Pide'));
    expect(normalizeTr('Ali Nazik')).toBe(normalizeTr('ALİ NAZİK'));
    expect(normalizeTr('Çöp Şiş')).toBe(normalizeTr('cop sis'));
  });
});

describe('slugifyTr', () => {
  it('folds Turkish characters without stripping suffixes', () => {
    expect(slugifyTr('Ev Yemekleri')).toBe('ev-yemekleri');
    expect(slugifyTr('Pide & Lahmacun')).toBe('pide-lahmacun');
    expect(slugifyTr('  Çiğ Köfte  ')).toBe('cig-kofte');
  });
});
