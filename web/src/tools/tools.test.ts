import { describe, expect, it } from 'vitest';
import { applyRules, filterRows, guessKind, parseCsv, pickColumns, sortRows, toTable, viewRows } from './excel/sheet';
import { containRect, coverRect, customPreset, IMAGE_PRESETS, outputName } from './image/fit';
import { wordDiff } from './text/diff';
import { BASE_LEXICON } from './text/lexicon';

/** The tools page's pure parts (D-218): what changed in a line, the spreadsheet helpers and the image geometry. */

describe('word diff', () => {
  it('marks a fixed word, and tells a word only re-cased from one whose letters or spelling changed', () => {
    expect(wordDiff('cig kofte 330ML', 'Çiğ Köfte (330 ml)')).toEqual([
      { text: 'Çiğ', change: 'fix' },
      { text: 'Köfte', change: 'fix' },
      { text: '(330', change: 'fix' },
      { text: 'ml)', change: 'fix' },
    ]);
    expect(wordDiff('Kola (330 ml)', 'Kola (330 ml)').every((part) => part.change === 'none')).toBe(true);
    expect(wordDiff('TAVUK sis', 'Tavuk Şiş')).toEqual([
      { text: 'Tavuk', change: 'case' },
      { text: 'Şiş', change: 'fix' },
    ]);
    expect(wordDiff('urfa porsiyon', 'Urfa (Porsiyon)')).toEqual([
      { text: 'Urfa', change: 'case' },
      { text: '(Porsiyon)', change: 'case' },
    ]);
  });
});

describe('spreadsheet helpers', () => {
  const sheet = [
    ['Ürün Adı', 'Açıklama', 'Fiyat', null],
    ['cig kofte durum', 'taze yesillik ile servis edilir', 120, null],
    ['KOLA 330ML', null, 45.5, null],
    ['Ayran', 'soğuk', 30, null],
  ];

  it('reads the first row as the header and every cell as text', () => {
    const table = toTable(sheet);
    expect(table.header).toEqual(['Ürün Adı', 'Açıklama', 'Fiyat', 'Sütun 4']);
    expect(table.rows[1]).toEqual(['KOLA 330ML', '', '45,5', '']);
    expect(toTable([]).rows).toEqual([]);
  });

  it('guesses which columns hold names and which descriptions', () => {
    expect(['Ürün Adı', 'ürün', 'İsim', 'Mağaza Adı', 'Şube', 'Product Name', 'Açıklama', 'description', 'Fiyat', 'Kategori'].map(guessKind)).toEqual([
      'name', 'name', 'name', 'name', 'name', 'name', 'description', 'description', null, null,
    ]);
  });

  it('searches without minding case or Turkish letters, and sorts numbers as numbers', () => {
    const { rows } = toTable(sheet);
    expect(filterRows(rows, 'KÖFTE').map((r) => r[0])).toEqual(['cig kofte durum']);
    expect(filterRows(rows, 'soguk').map((r) => r[0])).toEqual(['Ayran']);
    expect(filterRows(rows, '').length).toBe(3);
    expect(sortRows(rows, 2, 'asc').map((r) => r[2])).toEqual(['30', '45,5', '120']);
    expect(sortRows(rows, 0, 'desc').map((r) => r[0])).toEqual(['KOLA 330ML', 'cig kofte durum', 'Ayran']);
  });

  it('gives the rows to show as their places in the sheet, so a fixed cell stays marked after a search or a sort', () => {
    const { rows } = toTable(sheet);
    expect(viewRows(rows, '', null)).toEqual([0, 1, 2]);
    // "l" is in the first two rows only (yeşillik, KOLA); the dearer first.
    expect(viewRows(rows, 'l', { column: 2, direction: 'desc' })).toEqual([0, 1]);
    expect(viewRows(rows, '', { column: 0, direction: 'asc' })).toEqual([2, 0, 1]);
  });

  it('fixes the chosen columns by their kind and leaves the others alone', () => {
    const { rows } = toTable(sheet);
    const fixed = applyRules(rows, new Map([[0, 'name'], [1, 'description']]), { smart: true, lexicon: BASE_LEXICON });
    expect(fixed.rows.map((r) => r[0])).toEqual(['Çiğ Köfte Dürüm', 'Kola (330 ml)', 'Ayran']);
    expect(fixed.rows[0]![1]).toBe('Taze yeşillik ile servis edilir.');
    expect(fixed.rows[1]![1]).toBe('');
    expect(fixed.rows.map((r) => r[2])).toEqual(['120', '45,5', '30']);
    expect(fixed.changed).toBe(4);
  });
});

describe('choosing columns', () => {
  it('keeps the chosen columns, in the sheet’s order, for the table and the saved file', () => {
    const table = toTable([
      ['Kod', 'Ürün Adı', 'Fiyat', 'Açıklama'],
      ['A1', 'Kola', 45, 'Kutu'],
      ['A2', 'Ayran', 30, ''],
    ]);
    expect(pickColumns(table.header, table.rows, new Set([0, 2]))).toEqual({
      header: ['Ürün Adı', 'Açıklama'],
      rows: [
        ['Kola', 'Kutu'],
        ['Ayran', ''],
      ],
    });
    expect(pickColumns(table.header, table.rows, new Set()).header).toEqual(['Kod', 'Ürün Adı', 'Fiyat', 'Açıklama']);
  });
});

describe('CSV files', () => {
  it('reads semicolon and comma files, quoted fields with separators, quotes and line breaks inside', () => {
    expect(parseCsv('Ürün Adı;Fiyat\r\ncig kofte;120\r\n"Kola; kutu";45,5\r\n')).toEqual([
      ['Ürün Adı', 'Fiyat'],
      ['cig kofte', '120'],
      ['Kola; kutu', '45,5'],
    ]);
    expect(parseCsv('ad,açıklama\n"Ayran","soğuk, ""naneli""\nyanında"\n')).toEqual([
      ['ad', 'açıklama'],
      ['Ayran', 'soğuk, "naneli"\nyanında'],
    ]);
    // A byte-order mark from Excel's "CSV UTF-8" is no part of the first title.
    expect(parseCsv('\ufeffad;fiyat\nKola;30')[0]).toEqual(['ad', 'fiyat']);
  });
});

describe('image geometry', () => {
  it('knows the panel formats', () => {
    expect(IMAGE_PRESETS.map((p) => [p.key, p.width, p.height, p.maxKb])).toEqual([
      ['urun', 1000, 1000, 150],
      ['logo', 500, 500, 150],
      ['banner', 1035, 390, 150],
    ]);
  });

  it('crops the middle of a wide photo to fill a square, and of a tall one to fill a banner', () => {
    expect(coverRect(2000, 1000, 1000, 1000)).toEqual({ x: 500, y: 0, width: 1000, height: 1000 });
    expect(coverRect(1000, 2000, 1035, 390)).toEqual({ x: 0, y: 812, width: 1000, height: 377 });
    // Moved towards an edge, never past it.
    expect(coverRect(2000, 1000, 1000, 1000, 0, 0.5)).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
    expect(coverRect(2000, 1000, 1000, 1000, 1, 0.5)).toEqual({ x: 1000, y: 0, width: 1000, height: 1000 });
  });

  it('fits a whole logo inside a banner with even margins', () => {
    expect(containRect(500, 500, 1035, 390)).toEqual({ x: 323, y: 0, width: 390, height: 390 });
    expect(containRect(2000, 1000, 1000, 1000)).toEqual({ x: 0, y: 250, width: 1000, height: 500 });
  });

  it('takes a size of one’s own within sane bounds (D-219)', () => {
    expect(customPreset(800, 300, 120)).toMatchObject({ key: 'ozel', width: 800, height: 300, maxKb: 120 });
    expect(customPreset(9999, 0, 3)).toMatchObject({ width: 4000, height: 16, maxKb: 10 });
    expect(customPreset(Number.NaN, 512.4, 150)).toMatchObject({ width: 16, height: 512 });
    expect(outputName('kapak.jpg', customPreset(800, 300, 150), 'jpeg')).toBe('kapak-ozel-800x300.jpg');
  });

  it('names the file after the format and the size', () => {
    expect(outputName('Logo Final (1).PNG', IMAGE_PRESETS[1]!, 'jpeg')).toBe('logo-final-1-logo-500x500.jpg');
    expect(outputName('banner.webp', IMAGE_PRESETS[2]!, 'png')).toBe('banner-banner-1035x390.png');
  });
});
