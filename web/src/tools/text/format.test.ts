import { describe, expect, it } from 'vitest';
import { formatLine, formatText, type FormatOptions } from './format';
import { BASE_LEXICON, Lexicon } from './lexicon';
import { numberSuffix, trCapitalize } from './turkish';

/**
 * The writing rules of the panel, as the team uses them (D-218). Every case is a line a rep pastes; the expected text is
 * exactly what the panel must receive.
 */

const name = (line: string, options: Partial<FormatOptions> = {}) => formatLine(line, { kind: 'name', smart: true, lexicon: BASE_LEXICON, ...options });
const description = (line: string, options: Partial<FormatOptions> = {}) =>
  formatLine(line, { kind: 'description', smart: true, lexicon: BASE_LEXICON, ...options });

describe('product and store names', () => {
  const cases: [string, string][] = [
    // Every word starts with a capital, Turkish letters stay Turkish.
    ['trüflü hamburger', 'Trüflü Hamburger'],
    ['TAVUK ŞİŞ', 'Tavuk Şiş'],
    ['  tavuk   şiş  ', 'Tavuk Şiş'],
    ['İSKENDER', 'İskender'],
    ['ISKENDER', 'İskender'],
    ['izgara köfte', 'Izgara Köfte'],
    // "ve", "ile", "veya" stay small inside a name.
    ['tavuk ve patates', 'Tavuk ve Patates'],
    ['ET İLE PİLAV', 'Et ile Pilav'],
    // Units: small, spaced, in parentheses; a decimal point becomes a comma.
    ['KOLA 330ML', 'Kola (330 ml)'],
    ['izgara kofte 200gr', 'Izgara Köfte (200 gr)'],
    ['su 0.5 lt', 'Su (0,5 lt)'],
    ['ayran 1.5L', 'Ayran (1,5 lt)'],
    ['soda 33CL', 'Soda (33 cl)'],
    ['dana kıyma 1 KG', 'Dana Kıyma (1 kg)'],
    ['köfte 500 GRAM', 'Köfte (500 gr)'],
    ['şalgam 1 litre', 'Şalgam (1 lt)'],
    ['tavuk kanat 200 G', 'Tavuk Kanat (200 gr)'],
    ['Kola (330 ml)', 'Kola (330 ml)'],
    ['KOLA (330 ML)', 'Kola (330 ml)'],
    // Counts and portions are words: a capital, in parentheses.
    ['lahmacun 2 adet', 'Lahmacun (2 Adet)'],
    ['LAHMACUN (2 ADET)', 'Lahmacun (2 Adet)'],
    ['lahmacun 2ad', 'Lahmacun (2 Adet)'],
    ['cookie(5 adet)', 'Cookie (5 Adet)'],
    ['urfa porsiyon', 'Urfa (Porsiyon)'],
    ['Urfa (porsiyon)', 'Urfa (Porsiyon)'],
    ['peynirli pide (1 porsiyon)', 'Peynirli Pide (1 Porsiyon)'],
    ['iskender yarım porsiyon', 'İskender (Yarım Porsiyon)'],
    ['adana 1.5 porsiyon', 'Adana (1,5 Porsiyon)'],
    // A number with "li", "er": apostrophe, small suffix, in vowel harmony with how the number is read.
    ['6 li set', "6'lı Set"],
    ["6'Lİ SET", "6'lı Set"],
    ['10LU paket', "10'lu Paket"],
    ['4 lü menü', "4'lü Menü"],
    ['20 li kutu', "20'li Kutu"],
    ['100 lü', "100'lü"],
    ['3 Er Adet', "3'er Adet"],
    ['2 ser adet', "2'şer Adet"],
    ['6 sar adet', "6'şar Adet"],
    ['10 ar adet', "10'ar Adet"],
    // Joined words are split, missing Turkish letters restored.
    ['çiğköfte dürüm', 'Çiğ Köfte Dürüm'],
    ['kaşarlıtost', 'Kaşarlı Tost'],
    ['büyükboypizza', 'Büyük Boy Pizza'],
    ['cig kofte durum', 'Çiğ Köfte Dürüm'],
    ['kasarli tost', 'Kaşarlı Tost'],
    ['kaşarli tost', 'Kaşarlı Tost'],
    ['sogan halkasi', 'Soğan Halkası'],
    ['KIYMALI PIDE', 'Kıymalı Pide'],
    ['KIZARTMA', 'Kızartma'],
    // A misspelt word the dictionary knows.
    ['patatez kızartması', 'Patates Kızartması'],
    ['hamburgr menü', 'Hamburger Menü'],
    // Foreign words keep a plain I; abbreviations and brands keep their shape.
    ['ICED LATTE', 'Iced Latte'],
    ['CHICKEN WINGS', 'Chicken Wings'],
    ['XL MENÜ', 'XL Menü'],
    ['bbq soslu burger', 'BBQ Soslu Burger'],
    ['coca-cola 1 LT', 'Coca-Cola (1 lt)'],
    ['pizza boy L', 'Pizza Boy L'],
    // Store and branch names: words capitalised, the separator spaced.
    ['mutlu waffle - urfa dürüm', 'Mutlu Waffle - Urfa Dürüm'],
    ['MUTLU WAFFLE -URFA DÜRÜM', 'Mutlu Waffle - Urfa Dürüm'],
    ['mutlu waffle – urfa dürüm', 'Mutlu Waffle - Urfa Dürüm'],
    // Symbols: spaced slash, plus and ampersand between words; fractions stay tight.
    ['ayran/kola', 'Ayran / Kola'],
    ['çorba+pilav', 'Çorba + Pilav'],
    ['pide&lahmacun', 'Pide & Lahmacun'],
    ['1/2 ekmek döner', '1/2 Ekmek Döner'],
    // Punctuation: no space before, one after; a name carries no full stop.
    ['elma , armut .', 'Elma, Armut'],
    ['tavuk,et,köfte', 'Tavuk, Et, Köfte'],
    ['• tavuk dürüm', 'Tavuk Dürüm'],
    ["Ali'nin yeri", "Ali'nin Yeri"],
    // A quantity written first goes after the name it measures.
    ['1 kg baklava', 'Baklava (1 kg)'],
    ['2 adet lahmacun', 'Lahmacun (2 Adet)'],
    // Brands and packaging abbreviations keep their shape; a known flavour word gets its Turkish letters.
    ['coca cola 1.5 L PET', 'Coca-Cola (1,5 lt) PET'],
    ['ADANA DÜRÜM (ACILI)', 'Adana Dürüm (Acılı)'],
  ];
  it.each(cases)('%s → %s', (input, expected) => {
    expect(name(input)).toBe(expected);
  });

  it('is idempotent: a fixed name stays as it is', () => {
    for (const [, expected] of cases) expect(name(expected), expected).toBe(expected);
  });

  it('leaves a word the dictionary does not know as it is written, only re-cased', () => {
    expect(name('mutlu waffle')).toBe('Mutlu Waffle');
    expect(name('burger king')).toBe('Burger King');
    expect(name('gülsoy pastanesi')).toBe('Gülsoy Pastanesi');
  });

  it('does only the casing and the spacing when smart fixes are off', () => {
    expect(name('cig kofte 330ML', { smart: false })).toBe('Cig Kofte (330 ml)');
    expect(name('kaşarlıtost', { smart: false })).toBe('Kaşarlıtost');
  });
});

describe('descriptions', () => {
  const cases: [string, string][] = [
    ['ÖZEL SOSLU IZGARA TAVUK, PİLAV VE SALATA İLE SERVİS EDİLİR', 'Özel soslu ızgara tavuk, pilav ve salata ile servis edilir.'],
    ['antep fıstıklı baklava', 'Antep fıstıklı baklava.'],
    ['200 GR DANA KIYMA ile hazırlanır', '200 gr dana kıyma ile hazırlanır.'],
    ['taze domates,biber ve soğan.yanında ayran', 'Taze domates, biber ve soğan. Yanında ayran.'],
    ['şeklde servis edilir', 'Şekilde servis edilir.'],
    ['türk kahvesi eşliğinde', 'Türk kahvesi eşliğinde.'],
    ['2 ADET KÖFTE VE 1 PORSİYON PİLAV', '2 adet köfte ve 1 porsiyon pilav.'],
    ['Ne güzel!', 'Ne güzel!'],
    ['kasarli tost , cig kofte', 'Kaşarlı tost, çiğ köfte.'],
    ['330 ml kutu kola', '330 ml kutu kola.'],
  ];
  it.each(cases)('%s → %s', (input, expected) => {
    expect(description(input)).toBe(expected);
  });

  it('is idempotent', () => {
    for (const [, expected] of cases) expect(description(expected), expected).toBe(expected);
  });
});

describe('many lines at once', () => {
  it('fixes each line by itself, keeps empty lines, and counts what changed', () => {
    const result = formatText('kola 330ml\n\nAyran (300 ml)\ncig kofte', { kind: 'name', smart: true, lexicon: BASE_LEXICON });
    expect(result.text).toBe('Kola (330 ml)\n\nAyran (300 ml)\nÇiğ Köfte');
    expect(result.changed).toBe(2);
    expect(result.lines.map((l) => l.after)).toEqual(['Kola (330 ml)', '', 'Ayran (300 ml)', 'Çiğ Köfte']);
  });

  it('handles a thousand lines in well under a second', () => {
    const text = Array.from({ length: 1000 }, (_, i) => `cig kofte durum ${i} adet kaşarlıtost 330ML`).join('\n');
    const started = performance.now();
    formatText(text, { kind: 'name', smart: true, lexicon: BASE_LEXICON });
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('the dictionary', () => {
  it('learns words from the pool and prefers the spelling seen most', () => {
    const lexicon = BASE_LEXICON.merge(
      Lexicon.from([
        ['mangalbaşı', 4],
        ['tavukçu', 2],
      ]),
    );
    expect(formatLine('mangalbasi tavukcu', { kind: 'name', smart: true, lexicon })).toBe('Mangalbaşı Tavukçu');
    const contested = Lexicon.from([
      ['kasarli', 1],
      ['kaşarlı', 9],
    ]);
    expect(formatLine('kasarli', { kind: 'name', smart: true, lexicon: contested })).toBe('Kaşarlı');
  });

  it('never corrects toward a word seen only once, nor a word of another first letter', () => {
    const lexicon = Lexicon.from([
      ['kebabı', 1],
      ['lahmacun', 9],
    ]);
    expect(formatLine('kebab', { kind: 'name', smart: true, lexicon })).toBe('Kebab');
    expect(formatLine('ahmacun', { kind: 'name', smart: true, lexicon })).toBe('Ahmacun');
  });
});

describe('Turkish helpers', () => {
  it('capitalises with Turkish letters', () => {
    expect(trCapitalize('istanbul')).toBe('İstanbul');
    expect(trCapitalize('ılık')).toBe('Ilık');
    expect(trCapitalize('çorba')).toBe('Çorba');
  });

  it('reads numbers for vowel harmony', () => {
    expect(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '20', '30', '40', '50', '60', '70', '80', '90', '100', '1000'].map((n) => numberSuffix(n, 'li'))).toEqual([
      'li', 'li', 'lü', 'lü', 'li', 'lı', 'li', 'li', 'lu', 'lu', 'li', 'li', 'lu', 'lı', 'li', 'lı', 'li', 'li', 'lı', 'lü', 'li',
    ]);
    expect(['1', '2', '3', '6', '9', '10', '50', '100'].map((n) => numberSuffix(n, 'er'))).toEqual(['er', 'şer', 'er', 'şar', 'ar', 'ar', 'şer', 'er']);
  });
});
