import { readSheet, type SheetData as ReadSheetData } from 'read-excel-file/node';
import writeXlsxFile, { type Row, type SheetData } from 'write-excel-file/node';
import type { z } from 'zod';
import {
  type TemplateOptionGroup,
  type TemplatePayload,
  isBasePriceGroupName,
  templatePayloadSchema,
} from '../../domain/template.js';
import { normalizeTr } from '../../lib/normalize-tr.js';

/**
 * The template pool as a spreadsheet (D-206): one row per product, filled by hand in Excel or Google Sheets.
 * Import and export share this layout, so "Excel'e aktar → düzenle → içe aktar" updates the pool in bulk.
 *
 * Option groups are one cell, one group per line (or separated by ";"):
 *   Porsiyon*: Yarım, 1 Porsiyon (varsayılan), 1,5 Porsiyon
 *   Sos Seçimi+2: Ketçap, Mayonez, Acı Sos
 *   Ekstralar+: Kaşar (+), Sucuk (+)
 * "*" after the group name = zorunlu, "+" = çoklu seçim (an optional number caps it), "(varsayılan)" marks the
 * default option, "(+)" an extra-charge option. A size/portion group (Boy, Porsiyon, Gramaj, Adet…) always sets
 * the base price; any other group does with "(fiyatı belirler)" after its name. Lists are comma separated; a comma
 * between two digits ("1,5 Porsiyon") is part of the text.
 */

export const SHEET_TEMPLATES = 'Şablonlar';
export const SHEET_HELP = 'Nasıl doldurulur';
export const SHEET_CUISINES = 'Mutfaklar';

const COLUMNS = [
  { key: 'cuisine', title: 'Mutfak', width: 22 },
  { key: 'name', title: 'Ürün Adı', width: 28 },
  { key: 'description', title: 'Açıklama', width: 46 },
  { key: 'groups', title: 'Opsiyon Grupları', width: 60 },
  { key: 'removable', title: 'Çıkarılabilir Malzemeler', width: 32 },
  { key: 'extras', title: 'Ekstra Malzemeler', width: 32 },
  { key: 'aliases', title: 'Takma Adlar', width: 28 },
  { key: 'portion', title: 'Porsiyon Bilgisi', width: 20 },
  { key: 'tags', title: 'Etiketler', width: 20 },
  { key: 'allergens', title: 'Alerjenler', width: 20 },
  { key: 'importance', title: 'Önem (0-100)', width: 13 },
] as const;
type ColumnKey = (typeof COLUMNS)[number]['key'];

/** A row of the sheet as text, keyed by column; `row` is the spreadsheet's own row number. */
export interface SheetRow {
  row: number;
  cells: Partial<Record<ColumnKey, string>>;
}

export interface ParsedRow {
  row: number;
  cuisineId: string;
  aliases: string[];
  importance: number | undefined;
  payload: TemplatePayload;
}

export interface RowError {
  row: number;
  name: string;
  message: string;
}

export interface ExportEntry {
  cuisineName: string;
  aliases: readonly string[];
  importance: number;
  payload: TemplatePayload;
}

export interface CuisineRef {
  id: string;
  name: string;
  slug: string;
  templates: number;
  target: number;
}

// ---- text formats -----------------------------------------------------------------------------------------------

/** Splits on commas, except a comma between two digits ("1,5 Porsiyon") or inside parentheses ("Gluten (bulgur, lavaş)"). */
export function splitList(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const [index, char] of [...text].entries()) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    const decimal = /\d/u.test(text[index - 1] ?? '') && /\d/u.test(text[index + 1] ?? '');
    if (char === ',' && depth === 0 && !decimal) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

const DEFAULT_MARK = /\s*\((varsay[ıi]lan)\)\s*$/iu;
/** "Kişilik (fiyatı belirler): 1 Kişilik, 2 Kişilik" — a group that sets the price without a size-like name. */
const BASE_MARK = /\s*\(fiyat[ıi] belirler\)\s*/iu;
const SURCHARGE_MARK = /\s*\((\+|ek [üu]cretli)\)\s*$/iu;

export function parseOptionGroups(text: string): TemplateOptionGroup[] {
  return text
    .split(/[\n;]/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const colon = line.indexOf(':');
      if (colon < 1) throw new Error(`"${line}": grup adından sonra ":" olmalı (örnek: "Porsiyon*: Yarım, Tam")`);
      let head = line.slice(0, colon).trim();
      const setsPrice = BASE_MARK.test(head);
      head = head.replace(BASE_MARK, '').trim();
      const marks = /^(.*?)\s*(\*?)\s*(?:\+(\d*))?\s*(\*?)$/u.exec(head);
      const name = (marks?.[1] ?? head).trim();
      const required = marks?.[2] === '*' || marks?.[4] === '*';
      const multi = marks?.[3] !== undefined;
      const cap = marks?.[3] ? Number(marks[3]) : undefined;
      const base = setsPrice || isBasePriceGroupName(name);
      const extraGroup = /ekstra/u.test(normalizeTr(name));
      const options = splitList(line.slice(colon + 1)).map((raw) => {
        let option = raw;
        let isDefault = false;
        let surcharge = false;
        // The two marks can come in either order: "Kaşar (+) (varsayılan)".
        for (let i = 0; i < 2; i += 1) {
          if (DEFAULT_MARK.test(option)) {
            isDefault = true;
            option = option.replace(DEFAULT_MARK, '');
          }
          if (SURCHARGE_MARK.test(option)) {
            surcharge = true;
            option = option.replace(SURCHARGE_MARK, '');
          }
        }
        const priceMode = base ? 'sets_base' : surcharge || extraGroup ? 'surcharge' : 'free';
        return { name: option.trim(), priceMode, isDefault } as const;
      });
      // A size group is always one required choice that sets the price; the sheet need not say so.
      if (base || !multi) {
        const isRequired = base || required;
        return { name, selectionType: 'single', isRequired, minSelect: isRequired ? 1 : 0, maxSelect: 1, options };
      }
      const maxSelect = Math.max(1, Math.min(cap ?? options.length, options.length));
      return { name, selectionType: 'multi', isRequired: required, minSelect: required ? 1 : 0, maxSelect, options };
    });
}

export function formatOptionGroups(groups: readonly TemplateOptionGroup[]): string {
  return groups
    .map((group) => {
      const setsPrice = group.options.some((o) => o.priceMode === 'sets_base');
      const base = isBasePriceGroupName(group.name) || setsPrice;
      const mark = setsPrice && !isBasePriceGroupName(group.name) ? ' (fiyatı belirler)' : '';
      const required = group.isRequired && !base ? '*' : '';
      const multi =
        group.selectionType === 'multi' ? `+${group.maxSelect < group.options.length ? String(group.maxSelect) : ''}` : '';
      const extraGroup = /ekstra/u.test(normalizeTr(group.name));
      const options = group.options.map(
        (o) =>
          `${o.name}${o.isDefault ? ' (varsayılan)' : ''}${o.priceMode === 'surcharge' && !extraGroup ? ' (+)' : ''}`,
      );
      return `${group.name}${mark}${required}${multi}: ${options.join(', ')}`;
    })
    .join('\n');
}

// ---- reading ----------------------------------------------------------------------------------------------------

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

const HEADER_KEYS = new Map<string, ColumnKey>([
  ...COLUMNS.map((c) => [normalizeTr(c.title), c.key] as [string, ColumnKey]),
  // Short or older spellings people are likely to type.
  ['mutfak turu', 'cuisine'],
  ['urun', 'name'],
  ['opsiyonlar', 'groups'],
  ['cikarilabilir', 'removable'],
  ['ekstralar', 'extras'],
  ['onem', 'importance'],
  ['porsiyon', 'portion'],
]);

/** Reads the "Şablonlar" sheet (or the first sheet) of an .xlsx file into text rows keyed by column. */
export async function readTemplateSheet(file: Buffer): Promise<SheetRow[]> {
  let data: ReadSheetData;
  try {
    data = await readSheet(file, SHEET_TEMPLATES);
  } catch {
    data = await readSheet(file);
  }
  const headerIndex = data.findIndex((row) => row.some((cell) => HEADER_KEYS.get(normalizeTr(cellText(cell))) === 'name'));
  if (headerIndex < 0) throw new Error('"Ürün Adı" başlıklı sütun bulunamadı; örnek dosyadaki başlıkları kullan.');
  const columns = (data[headerIndex] ?? []).map((cell) => HEADER_KEYS.get(normalizeTr(cellText(cell))));
  const rows: SheetRow[] = [];
  for (const [offset, row] of data.slice(headerIndex + 1).entries()) {
    const cells: SheetRow['cells'] = {};
    for (const [index, key] of columns.entries()) {
      if (key) cells[key] = cellText(row[index]);
    }
    if (Object.values(cells).some((v) => v !== '')) rows.push({ row: headerIndex + offset + 2, cells });
  }
  return rows;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Ürün adı',
  description: 'Açıklama',
  portionInfo: 'Porsiyon bilgisi',
  optionGroups: 'Opsiyon grupları',
  removableIngredients: 'Çıkarılabilir malzemeler',
  extraIngredients: 'Ekstra malzemeler',
  tags: 'Etiketler',
  allergenNotes: 'Alerjenler',
};

function issueText(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => {
      const field = FIELD_LABELS[String(issue.path[0] ?? '')] ?? 'Ürün';
      const where = issue.path[0] === 'optionGroups' && typeof issue.path[1] === 'number' ? ` (${issue.path[1] + 1}. grup)` : '';
      const message = issue.code === 'too_big' ? 'çok uzun' : issue.code === 'too_small' ? 'boş ya da çok kısa' : issue.message;
      return `${field}${where}: ${message}`;
    })
    .join('; ');
}

/**
 * Turns sheet rows into validated template payloads. `current` gives the stored payload of a product that already
 * exists, so the fields the sheet does not carry (servis notu, upsell) survive an update.
 */
export function parseTemplateRows(
  rows: readonly SheetRow[],
  cuisines: readonly CuisineRef[],
  current: (cuisineId: string, normalizedName: string) => TemplatePayload | undefined,
): { valid: ParsedRow[]; errors: RowError[] } {
  const byName = new Map<string, CuisineRef>();
  for (const c of cuisines) {
    byName.set(normalizeTr(c.name), c);
    byName.set(normalizeTr(c.slug), c);
  }
  const valid: ParsedRow[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();
  for (const { row, cells } of rows) {
    const name = cells.name ?? '';
    const fail = (message: string) => errors.push({ row, name, message });
    if (name === '') {
      fail('Ürün adı boş');
      continue;
    }
    const cuisine = byName.get(normalizeTr(cells.cuisine ?? ''));
    if (!cuisine) {
      fail(cells.cuisine ? `"${cells.cuisine}" mutfağı bulunamadı ("Mutfaklar" sayfasındaki adlardan birini yaz)` : 'Mutfak boş');
      continue;
    }
    const key = `${cuisine.id}|${normalizeTr(name)}`;
    if (seen.has(key)) {
      fail('Bu ürün dosyada aynı mutfak için ikinci kez var');
      continue;
    }
    seen.add(key);
    let groups: TemplateOptionGroup[];
    try {
      groups = parseOptionGroups(cells.groups ?? '');
    } catch (err) {
      fail(`Opsiyon grupları: ${(err as Error).message}`);
      continue;
    }
    const importanceText = cells.importance ?? '';
    const importance = importanceText === '' ? undefined : Number(importanceText.replace(',', '.'));
    if (importance !== undefined && (!Number.isInteger(importance) || importance < 0 || importance > 100)) {
      fail('Önem 0 ile 100 arasında tam sayı olmalı');
      continue;
    }
    const previous = current(cuisine.id, normalizeTr(name));
    const parsed = templatePayloadSchema.safeParse({
      name,
      description: cells.description ?? '',
      servingNote: previous?.servingNote ?? '',
      portionInfo: cells.portion ?? '',
      optionGroups: groups,
      removableIngredients: splitList(cells.removable ?? ''),
      extraIngredients: splitList(cells.extras ?? '').map((x) => ({ name: x, priceHint: 'ek ücretli' })),
      tags: splitList(cells.tags ?? ''),
      allergenNotes: splitList(cells.allergens ?? ''),
      upsellSuggestion: previous?.upsellSuggestion ?? '',
    });
    if (!parsed.success) {
      fail(issueText(parsed.error));
      continue;
    }
    valid.push({ row, cuisineId: cuisine.id, aliases: splitList(cells.aliases ?? ''), importance, payload: parsed.data });
  }
  return { valid, errors };
}

// ---- writing ----------------------------------------------------------------------------------------------------

const HEADER_STYLE = { fontWeight: 'bold', backgroundColor: '#F4D9C6', wrap: true } as const;

function templateRow(entry: ExportEntry): Row {
  const p = entry.payload;
  const values: Record<ColumnKey, string | number> = {
    cuisine: entry.cuisineName,
    name: p.name,
    description: p.description,
    groups: formatOptionGroups(p.optionGroups),
    removable: p.removableIngredients.join(', '),
    extras: p.extraIngredients.map((x) => x.name).join(', '),
    aliases: entry.aliases.join(', '),
    portion: p.portionInfo,
    tags: p.tags.join(', '),
    allergens: p.allergenNotes.join(', '),
    importance: entry.importance,
  };
  return COLUMNS.map((c) => ({ value: values[c.key], wrap: true, alignVertical: 'top' as const }));
}

const HELP_LINES: readonly string[] = [
  'Her satır bir ürün. "Mutfak" ve "Ürün Adı" zorunlu, diğer sütunlar boş kalabilir.',
  'Mutfak: "Mutfaklar" sayfasındaki adlardan biri, aynen.',
  'Aynı mutfakta aynı isimli ürün varsa güncellenir; yoksa yeni şablon olarak eklenir.',
  'Açıklama: 6–8 kelimelik sade bir cümle. Fiyat ya da TL yazma.',
  'Opsiyon Grupları: her satıra bir grup → "Grup Adı: seçenek, seçenek, seçenek".',
  '   Grup adının sonuna * koyarsan zorunlu olur: "Pişme Derecesi*: Az, Orta, İyi".',
  '   Grup adının sonuna + koyarsan çoklu seçim olur: "Soslar+: Ketçap, Mayonez". "+2" en fazla 2 seçim demek.',
  '   Seçeneğin sonuna (varsayılan) yazarsan önceden seçili gelir; (+) yazarsan ek ücretli olur.',
  '   Boy, Porsiyon, Gramaj, Adet grupları fiyatı belirler ve otomatik olarak zorunludur.',
  '   Başka bir grup da fiyatı belirliyorsa adına (fiyatı belirler) ekle: "Kişilik (fiyatı belirler): 1 Kişilik, 2 Kişilik".',
  'Listeler (malzemeler, takma adlar, etiketler) virgülle ayrılır. "1,5 Porsiyon" gibi sayılardaki virgül bozulmaz.',
  'Önem: 0-100 arası; ürün o mutfak için ne kadar olmazsa olmazsa o kadar yüksek. Boş bırakılabilir.',
  'Paketli içecekler (kola, su, ayran…) için açıklama ve opsiyon boş bırakılır.',
  'Google Sheets: Dosya → İçe aktar ile bu dosyayı aç, doldur, Dosya → İndir → Microsoft Excel (.xlsx).',
  "Bitince Yönetim → Şablon havuzu → \"Excel'den yükle\" ile dosyayı seç; önce önizleme gösterilir.",
];

/** The workbook for both the sample download and the export: templates, how to fill them, and the cuisine list. */
export async function templateWorkbook(entries: readonly ExportEntry[], cuisines: readonly CuisineRef[]): Promise<Buffer> {
  const header: Row = COLUMNS.map((c) => ({ value: c.title, ...HEADER_STYLE }));
  const templates: SheetData = [header, ...entries.map(templateRow)];
  const help: SheetData = [
    [{ value: 'Şablon dosyası nasıl doldurulur', fontWeight: 'bold', fontSize: 14 }],
    ...HELP_LINES.map((line) => [{ value: line, wrap: true }]),
  ];
  const cuisineRows: SheetData = [
    [
      { value: 'Mutfak', ...HEADER_STYLE },
      { value: 'Havuzdaki şablon', ...HEADER_STYLE },
      { value: 'Hedef ürün sayısı', ...HEADER_STYLE },
    ],
    ...cuisines.map((c) => [{ value: c.name }, { value: c.templates }, { value: c.target }]),
  ];
  return writeXlsxFile([
    { sheet: SHEET_TEMPLATES, data: templates, columns: COLUMNS.map((c) => ({ width: c.width })), stickyRowsCount: 1 },
    { sheet: SHEET_HELP, data: help, columns: [{ width: 110 }] },
    { sheet: SHEET_CUISINES, data: cuisineRows, columns: [{ width: 26 }, { width: 18 }, { width: 18 }], stickyRowsCount: 1 },
  ]).toBuffer();
}

/** Example rows for the sample file: one dish with every kind of group, one made drink, one packaged drink. */
export function sampleEntries(cuisines: readonly CuisineRef[]): ExportEntry[] {
  const name = (slug: string, fallback: string) => cuisines.find((c) => c.slug === slug)?.name ?? fallback;
  return [
    {
      cuisineName: name('kebap-izgara', 'Kebap'),
      aliases: ['Adana', 'Acılı Kebap'],
      importance: 95,
      payload: {
        name: 'Adana Kebap',
        description: 'Acılı zırh kıyması közde pişer, lavaşla servis edilir.',
        servingNote: '',
        portionInfo: '1 porsiyon ~180 g',
        optionGroups: parseOptionGroups(
          'Porsiyon: 1 Porsiyon (varsayılan), 1,5 Porsiyon, 2 Porsiyon\nServis Şekli*: Porsiyon (varsayılan), Dürüm, Ekmek Arası\nYanında+2: Közlenmiş Domates, Közlenmiş Biber, Bulgur Pilavı',
        ),
        removableIngredients: ['Soğan', 'Maydanoz', 'Sumak'],
        extraIngredients: [
          { name: 'Ekstra Lavaş', priceHint: 'ek ücretli' },
          { name: 'Ezme', priceHint: 'ek ücretli' },
        ],
        tags: ['Acılı', 'Izgara'],
        allergenNotes: ['Gluten'],
        upsellSuggestion: '',
      },
    },
    {
      cuisineName: name('kafe-icecek', 'Kahve & İçecek'),
      aliases: ['Ev Yapımı Limonata'],
      importance: 70,
      payload: {
        name: 'Limonata',
        description: 'Taze sıkılmış limon ve nane ile hazırlanır.',
        servingNote: '',
        portionInfo: '400 ml',
        optionGroups: parseOptionGroups('Boy: Orta (varsayılan), Büyük\nŞeker: Şekerli (varsayılan), Az Şekerli, Şekersiz'),
        removableIngredients: ['Nane', 'Buz'],
        extraIngredients: [],
        tags: ['Soğuk'],
        allergenNotes: [],
        upsellSuggestion: '',
      },
    },
    {
      cuisineName: name('kebap-izgara', 'Kebap'),
      aliases: [],
      importance: 60,
      payload: {
        name: 'Kola',
        description: '',
        servingNote: '',
        portionInfo: '330 ml kutu',
        optionGroups: [],
        removableIngredients: [],
        extraIngredients: [],
        tags: [],
        allergenNotes: [],
        upsellSuggestion: '',
      },
    },
  ];
}
