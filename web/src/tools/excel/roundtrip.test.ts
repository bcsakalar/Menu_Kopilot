import readXlsxFile from 'read-excel-file/universal';
import writeXlsxFile from 'write-excel-file/universal';
import { describe, expect, it } from 'vitest';
import { applyRules, guessKind, toTable } from './sheet';
import { BASE_LEXICON } from '../text/lexicon';

/** A real .xlsx through the same two libraries the tool uses (D-218): written, read back, fixed, the same shape. */
describe('an Excel file through the tool', () => {
  it('reads back what it wrote, sheet by sheet, and fixes the name and description columns', async () => {
    const blob = await writeXlsxFile([
      {
        sheet: 'Menü',
        data: [
          [{ value: 'Ürün Adı' }, { value: 'Açıklama' }, { value: 'Fiyat' }],
          [{ value: 'cig kofte durum' }, { value: 'TAZE YEŞİLLİK İLE SERVİS EDİLİR' }, { value: 120 }],
          [{ value: 'KOLA 330ML' }, null, { value: 45.5 }],
        ],
      },
      { sheet: 'Notlar', data: [[{ value: 'Not' }], [{ value: 'kampanya yok' }]] },
    ]).toBlob();
    const sheets = await readXlsxFile(blob);
    expect(sheets.map((s) => s.sheet)).toEqual(['Menü', 'Notlar']);
    const table = toTable(sheets[0]!.data);
    expect(table.header).toEqual(['Ürün Adı', 'Açıklama', 'Fiyat']);
    expect(table.rows).toEqual([
      ['cig kofte durum', 'TAZE YEŞİLLİK İLE SERVİS EDİLİR', '120'],
      ['KOLA 330ML', '', '45,5'],
    ]);
    const kinds = new Map(table.header.flatMap((title, index) => (guessKind(title) ? [[index, guessKind(title)!] as const] : [])));
    const fixed = applyRules(table.rows, kinds, { smart: true, lexicon: BASE_LEXICON });
    expect(fixed.rows).toEqual([
      ['Çiğ Köfte Dürüm', 'Taze yeşillik ile servis edilir.', '120'],
      ['Kola (330 ml)', '', '45,5'],
    ]);
  });
});
