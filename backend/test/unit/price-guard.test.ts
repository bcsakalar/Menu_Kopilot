import { describe, expect, it } from 'vitest';
import { containsPriceAmount, stripPriceAmounts } from '../../src/lib/price-guard.js';

describe('containsPriceAmount', () => {
  it.each([
    '50 TL',
    '45,90₺',
    '₺50',
    'TL 120',
    'Büyük (+15 TL)',
    'Büyük (+15)',
    'Ekstra peynir +10',
    '10 liralık',
    '1.250,00 TL',
    '75 türk lirası',
  ])('flags "%s"', (value) => {
    expect(containsPriceAmount(value)).toBe(true);
  });

  it.each([
    '2 adet',
    '1,5 porsiyon',
    '1 porsiyon ~180 g',
    'Ayran 250 ml',
    'Ekstra +2 adet lavaş',
    '+25 adet',
    'Lahmacun (2 adet)',
    'Acılı',
    'ek ücretli',
    '4 kişilik',
  ])('does not flag "%s"', (value) => {
    expect(containsPriceAmount(value)).toBe(false);
  });
});

describe('stripPriceAmounts', () => {
  it.each([
    ['Büyük (+15 TL)', 'Büyük'],
    ['Büyük (+15)', 'Büyük'],
    ['Kaşar ekle - 10 TL', 'Kaşar ekle'],
    ['Porsiyon 120 TL, yanında pilav', 'Porsiyon, yanında pilav'],
    ['₺45 değerinde menü', 'değerinde menü'],
    ['2 adet', '2 adet'],
  ])('%s → %s', (input, expected) => {
    expect(stripPriceAmounts(input)).toBe(expected);
  });

  it('leaves text without prices untouched', () => {
    const text = 'Közde pişirilen acılı kuzu kıyma, lavaş ve sumaklı soğanla.';
    expect(stripPriceAmounts(text)).toBe(text);
  });
});
