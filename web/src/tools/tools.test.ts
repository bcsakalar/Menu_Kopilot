import { describe, expect, it } from 'vitest';
import {
  applyRules,
  checkSheet,
  fillDescriptions,
  filterRows,
  guessKind,
  namesWithoutDescription,
  parseCsv,
  pickColumns,
  sortRows,
  toTable,
  viewRows,
} from './excel/sheet';
import { containRect, contentRect, coverRect, customPreset, enlargement, IMAGE_PRESETS, outputName } from './image/fit';
import { checkLine } from './text/checks';
import { explainChanges, wordDiff } from './text/diff';
import { formatLine } from './text/format';
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

describe('why a line changed (D-220)', () => {
  const why = (typed: string, kind: 'name' | 'description' = 'name') => explainChanges(typed, formatLine(typed, { kind, smart: true, lexicon: BASE_LEXICON }));

  it('names the rule behind each real change, word by word', () => {
    expect(why('sogan, yag, izgara')).toEqual([
      { from: 'sogan', to: 'Soğan', reason: 'letters' },
      { from: 'yag', to: 'Yağ', reason: 'letters' },
      // ızgara: the capital I is the dotless one.
      { from: 'izgara', to: 'Izgara', reason: 'letters' },
    ]);
    expect(why('patatez kızartması')).toEqual([{ from: 'patatez', to: 'Patates', reason: 'spelling' }]);
    expect(why('kaşarlıtost')).toEqual([{ from: 'kaşarlıtost', to: 'Kaşarlı Tost', reason: 'split' }]);
    expect(why('coca cola')).toEqual([{ from: 'coca cola', to: 'Coca-Cola', reason: 'joined' }]);
    expect(why('KOLA 330ML')).toEqual([{ from: '330ML', to: '(330 ml)', reason: 'quantity' }]);
    // Two changes side by side stay two, each with its own rule.
    expect(why('coca cola 330ML')).toEqual([
      { from: 'coca cola', to: 'Coca-Cola', reason: 'joined' },
      { from: '330ML', to: '(330 ml)', reason: 'quantity' },
    ]);
    expect(why('patatez kizartmasi')).toEqual([
      { from: 'patatez', to: 'Patates', reason: 'spelling' },
      { from: 'kizartmasi', to: 'Kızartması', reason: 'letters' },
    ]);
    expect(why("6 li set")).toEqual([{ from: '6 li', to: "6'lı", reason: 'quantity' }]);
    expect(why('1/2 ekmek döner')).toEqual([{ from: '1/2', to: '1 / 2', reason: 'punctuation' }]);
    expect(why('mutlu waffle -urfa dürüm')).toEqual([{ from: '-urfa', to: '- Urfa', reason: 'punctuation' }]);
  });

  it('says nothing about re-casing, brackets around a typed word or a word that only moved', () => {
    expect(why('TAVUK DÜRÜM')).toEqual([]);
    expect(why('urfa porsiyon')).toEqual([]);
    expect(why('lahmacun 2 adet')).toEqual([]);
    expect(why('1 kg baklava')).toEqual([]);
    expect(why('Kola (330 ml)')).toEqual([]);
    expect(why('elma , armut .')).toEqual([]);
  });

  it('explains a description the same way', () => {
    expect(why('taze yesillik ile servis edilir', 'description')).toEqual([{ from: 'yesillik', to: 'yeşillik', reason: 'letters' }]);
  });
});

describe('what the rules cannot fix (D-220)', () => {
  it('flags a price, an emoji, contact details and a doubled word', () => {
    expect(checkLine('Adana Kebap 250 TL')).toEqual(['price']);
    expect(checkLine('Lahmacun ₺45')).toEqual(['price']);
    expect(checkLine('Pizza 🍕')).toEqual(['emoji']);
    expect(checkLine('Sipariş için 0532 123 45 67')).toEqual(['contact']);
    expect(checkLine('www.ornek.com adresinden')).toEqual(['contact']);
    expect(checkLine('instagram @ornekburger')).toEqual(['contact']);
    expect(checkLine('bilgi@ornek.com')).toEqual(['contact']);
    expect(checkLine('Tavuk Tavuk Dürüm')).toEqual(['repeat']);
    expect(checkLine('Burger 🍔 99 TL')).toEqual(['price', 'emoji']);
  });

  it('leaves quantities, sizes, numbers and ordinary text alone', () => {
    for (const fine of ['Lahmacun (2 Adet)', 'Kola (330 ml)', 'Su (0,5 lt)', '1 / 2 Ekmek Döner', '6\'lı Set', 'Mega Menü', 'Adana Kebap (1 Porsiyon)', 'Taze domates ve biber ile servis edilir.', 'XL Pizza (32 cm)']) {
      expect(checkLine(fine), fine).toEqual([]);
    }
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

describe('the file check (D-220)', () => {
  const drinks = Array.from({ length: 9 }, (_, i) => [`İçecek ${i + 1}`, 'Soğuk servis edilir.', 'İçecekler', 'https://ornek/x.jpg']);
  const table = {
    header: ['Ürün Adı', 'Açıklama', 'Kategori', 'Görsel'],
    rows: [
      ['Adana Kebap', 'Acılı kıyma.', 'Kebaplar', ''],
      ['ADANA KEBAP', '', 'Kebaplar', ''],
      ['cig kofte durum', '', 'Dürümler', ''],
      ['Lahmacun 50 TL', 'İnce hamur 🍕', 'Pideler', ''],
      ['', 'satır notu', '', ''],
      ...drinks,
    ],
  };
  const kinds = ['name', 'description', 'none', 'none'] as const;
  const checks = checkSheet(table, kinds, { smart: true, lexicon: BASE_LEXICON });
  const check = (key: string) => checks.find((item) => item.key === key)!;

  it('reads the opening rules off the sheet: products, descriptions, photos, drinks', () => {
    expect(checks.map((item) => item.key)).toEqual(['products', 'descriptions', 'photos', 'drinks', 'writing', 'duplicates', 'warnings']);
    // A row without a name is not a product.
    expect(check('products')).toMatchObject({ value: '13', ok: null });
    // 11 of 13 described: 84%, the target is 70%.
    expect(check('descriptions')).toMatchObject({ value: '%84 · hedef %70', ok: true, rows: [1, 2] });
    // 9 of 13 with a photo: 69%, the target is 20%.
    expect(check('photos')).toMatchObject({ value: '%69 · hedef %20', ok: true, rows: [0, 1, 2, 3] });
    // 9 drinks: one short of the 10 the opening wants.
    expect(check('drinks')).toMatchObject({ value: '9 · en az 10', ok: false });
    expect(check('drinks').rows).toHaveLength(9);
  });

  it('finds the names the rules would change, the same product twice, and a price or emoji', () => {
    // The price in 'Lahmacun 50 TL' is the warnings' business, not a writing rule.
    expect(check('writing')).toMatchObject({ value: '2 ad kurala uymuyor', ok: false, rows: [1, 2] });
    expect(check('duplicates')).toMatchObject({ value: '1 ad birden çok kez', ok: false, rows: [0, 1] });
    expect(check('warnings')).toMatchObject({ value: '1 satırda', ok: false, rows: [3] });
  });

  it('misses the description rule below 70%, and says nothing without a name column', () => {
    const thin = { header: ['Ürün', 'Açıklama'], rows: [['A Ürünü', 'Var.'], ['B Ürünü', ''], ['C Ürünü', '']] };
    const result = checkSheet(thin, ['name', 'description'], { smart: true });
    expect(result.find((item) => item.key === 'descriptions')).toMatchObject({ value: '%33 · hedef %70', ok: false, rows: [1, 2] });
    // No photo or category column: those rules are not guessed.
    expect(result.map((item) => item.key)).not.toContain('photos');
    expect(result.map((item) => item.key)).not.toContain('drinks');
    expect(checkSheet(thin, ['none', 'description'], { smart: true })).toEqual([]);
  });

  it('passes a clean sheet', () => {
    const clean = { header: ['Ürün', 'Açıklama'], rows: [['Adana Kebap', 'Acılı kıyma.'], ['Ayran (300 ml)', 'Soğuk.']] };
    const result = checkSheet(clean, ['name', 'description'], { smart: true, lexicon: BASE_LEXICON });
    expect(result.filter((item) => item.ok === false)).toEqual([]);
  });
});

describe('filling descriptions from the pool (D-220)', () => {
  const rows = [
    ['Adana Kebap', ''],
    ['Urfa Kebap', 'Bizim açıklamamız.'],
    ['Bilinmeyen Ürün', ''],
    ['Adana Kebap', ''],
    ['', ''],
  ];

  it('asks the pool once per name, only for empty descriptions', () => {
    expect(namesWithoutDescription(rows, 0, 1)).toEqual(['Adana Kebap', 'Bilinmeyen Ürün']);
  });

  it('fills only the empty ones it has an idea for, never a written description', () => {
    const ideas = new Map([
      ['Adana Kebap', 'Acılı kıyma şişte pişer.'],
      ['Urfa Kebap', 'Havuzun Urfa açıklaması.'],
    ]);
    const result = fillDescriptions(rows, 0, 1, ideas);
    expect(result.filled).toEqual([0, 3]);
    expect(result.rows.map((row) => row[1])).toEqual(['Acılı kıyma şişte pişer.', 'Bizim açıklamamız.', '', 'Acılı kıyma şişte pişer.', '']);
    // The input is left as it was.
    expect(rows[0]![1]).toBe('');
  });
});

describe('image margins and enlargement (D-220)', () => {
  /** A width × height RGBA image of one colour, with a box of another. */
  const image = (width: number, height: number, background: number[], box?: { x: number; y: number; w: number; h: number; color: number[] }) => {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const inside = box && x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
        pixels.set(inside ? box.color : background, (y * width + x) * 4);
      }
    }
    return pixels;
  };
  const white = [255, 255, 255, 255];
  const red = [200, 30, 30, 255];

  it('finds a logo inside a plain white or transparent border', () => {
    expect(contentRect(image(40, 30, white, { x: 10, y: 5, w: 12, h: 8, color: red }), 40, 30)).toEqual({ x: 10, y: 5, width: 12, height: 8 });
    expect(contentRect(image(40, 30, [0, 0, 0, 0], { x: 3, y: 4, w: 30, h: 20, color: red }), 40, 30)).toEqual({ x: 3, y: 4, width: 30, height: 20 });
    // Near-white paper with JPEG noise is still margin.
    expect(contentRect(image(20, 20, [250, 248, 252, 255], { x: 5, y: 5, w: 4, h: 4, color: red }), 20, 20)).toEqual({ x: 5, y: 5, width: 4, height: 4 });
  });

  it('leaves an image whole when its corners differ or nothing stands out', () => {
    // A photo: one corner is part of the picture.
    expect(contentRect(image(20, 20, white, { x: 0, y: 0, w: 6, h: 6, color: red }), 20, 20)).toEqual({ x: 0, y: 0, width: 20, height: 20 });
    expect(contentRect(image(20, 20, white), 20, 20)).toEqual({ x: 0, y: 0, width: 20, height: 20 });
  });

  it('measures how much the image is enlarged in the frame', () => {
    expect(enlargement(500, 500, 1000, 1000, 'cover')).toBe(2);
    expect(enlargement(2000, 1000, 1000, 1000, 'cover')).toBe(1);
    expect(enlargement(400, 200, 1035, 390, 'contain')).toBeCloseTo(1.95, 2);
    expect(enlargement(3000, 3000, 1000, 1000, 'contain')).toBeCloseTo(0.333, 2);
  });
});
