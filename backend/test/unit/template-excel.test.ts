import { describe, expect, it } from 'vitest';
import {
  type CuisineRef,
  formatOptionGroups,
  parseOptionGroups,
  parseTemplateRows,
  readTemplateSheet,
  sampleEntries,
  splitList,
  templateWorkbook,
} from '../../src/modules/templates/excel.js';
import { SEED_TEMPLATES } from '../../src/db/seed/templates.js';
import { templatePayloadSchema } from '../../src/domain/template.js';

const CUISINES: CuisineRef[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Kebap', slug: 'kebap-izgara', templates: 26, target: 32 },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Kahve & İçecek', slug: 'kafe-icecek', templates: 21, target: 55 },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Mantı & Makarna', slug: 'manti-hamur-isleri', templates: 40, target: 18 },
];

describe('template spreadsheet format', () => {
  it('splits lists on commas but keeps decimal commas', () => {
    expect(splitList('Yarım, 1 Porsiyon,1,5 Porsiyon , 2 Porsiyon')).toEqual(['Yarım', '1 Porsiyon', '1,5 Porsiyon', '2 Porsiyon']);
    expect(splitList('Gluten (bulgur, lavaş), Süt')).toEqual(['Gluten (bulgur, lavaş)', 'Süt']);
  });

  it('reads group marks: required, multi with a cap, defaults, extra charge, size groups', () => {
    const groups = parseOptionGroups('Porsiyon: Yarım, 1 Porsiyon (varsayılan)\nPişme*: Az, Orta, İyi\nSos+2: Ketçap, Mayonez (+), Acı Sos; Ekstralar+: Kaşar, Sucuk');
    expect(groups.map((g) => [g.name, g.selectionType, g.isRequired, g.minSelect, g.maxSelect])).toEqual([
      ['Porsiyon', 'single', true, 1, 1],
      ['Pişme', 'single', true, 1, 1],
      ['Sos', 'multi', false, 0, 2],
      ['Ekstralar', 'multi', false, 0, 2],
    ]);
    expect(groups[0]?.options.map((o) => [o.priceMode, o.isDefault])).toEqual([
      ['sets_base', false],
      ['sets_base', true],
    ]);
    expect(groups[2]?.options.map((o) => o.priceMode)).toEqual(['free', 'surcharge', 'free']);
    expect(groups[3]?.options.every((o) => o.priceMode === 'surcharge')).toBe(true);
    expect(() => parseOptionGroups('Porsiyon Yarım, Tam')).toThrow(/":"/);
  });

  it('formats every seed template so that parsing it back gives valid groups', () => {
    for (const t of SEED_TEMPLATES) {
      const back = parseOptionGroups(formatOptionGroups(t.payload.optionGroups));
      const parsed = templatePayloadSchema.safeParse({ ...t.payload, optionGroups: back });
      expect(parsed.success, t.payload.name).toBe(true);
      expect(back.map((g) => [g.name, g.selectionType, g.isRequired, g.options.length])).toEqual(
        t.payload.optionGroups.map((g) => [g.name, g.selectionType, g.isRequired && !/^(boy|porsiyon|gramaj|adet)/iu.test(g.name) ? true : g.isRequired, g.options.length]),
      );
    }
  });

  it('reports bad rows with their row number and keeps the good ones', () => {
    const { valid, errors } = parseTemplateRows(
      [
        { row: 2, cells: { cuisine: 'kebap', name: 'Adana Kebap', description: 'Acılı zırh kıyması közde pişer, lavaşla gelir.', groups: 'Porsiyon: Yarım, Tam' } },
        { row: 3, cells: { cuisine: 'Yok Böyle', name: 'Lahmacun' } },
        { row: 4, cells: { cuisine: 'Kebap', name: 'Adana Kebap' } },
        { row: 5, cells: { cuisine: 'Kebap', name: 'Ayran', description: 'Fiyatı 40 TL' } },
        { row: 6, cells: { cuisine: 'Kebap', name: 'Şalgam', importance: '150' } },
        { row: 7, cells: { cuisine: 'Kebap', name: '' } },
      ],
      CUISINES,
      () => undefined,
    );
    expect(valid.map((v) => v.payload.name)).toEqual(['Adana Kebap']);
    expect(errors.map((e) => e.row)).toEqual([3, 4, 5, 6, 7]);
    expect(errors[0]?.message).toMatch(/mutfağı bulunamadı/);
    expect(errors[2]?.message).toMatch(/Açıklama: Fiyat/);
  });

  it('puts a row of the retired "Makarna & İtalyan" under "Mantı & Makarna" (an export taken before D-212)', () => {
    const { valid, errors } = parseTemplateRows(
      [
        { row: 2, cells: { cuisine: 'Makarna & İtalyan', name: 'Lazanya' } },
        { row: 3, cells: { cuisine: 'makarna', name: 'Gnocchi' } },
      ],
      CUISINES,
      () => undefined,
    );
    expect(errors).toEqual([]);
    expect(valid.map((v) => v.cuisineId)).toEqual([CUISINES[2]!.id, CUISINES[2]!.id]);
  });

  it('keeps the serving note and upsell of a product that already exists', () => {
    const { valid } = parseTemplateRows(
      [{ row: 2, cells: { cuisine: 'Kebap', name: 'Ayran' } }],
      CUISINES,
      () => ({ ...sampleEntries(CUISINES)[2]!.payload, servingNote: 'Soğuk servis', upsellSuggestion: 'Yanına lahmacun' }),
    );
    expect(valid[0]?.payload.servingNote).toBe('Soğuk servis');
    expect(valid[0]?.payload.upsellSuggestion).toBe('Yanına lahmacun');
  });

  it('writes a real .xlsx that reads back into the same templates', async () => {
    const entries = sampleEntries(CUISINES);
    const file = await templateWorkbook(entries, CUISINES);
    const rows = await readTemplateSheet(file);
    expect(rows.map((r) => r.row)).toEqual([2, 3, 4]);
    const { valid, errors } = parseTemplateRows(rows, CUISINES, () => undefined);
    expect(errors).toEqual([]);
    expect(valid.map((v) => v.payload)).toEqual(entries.map((e) => e.payload));
    expect(valid[0]?.aliases).toEqual(['Adana', 'Acılı Kebap']);
    expect(valid[0]?.importance).toBe(95);
  });
});
