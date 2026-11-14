import { checkLine } from '../text/checks';
import { formatLine, type TextKind } from '../text/format';
import type { Lexicon } from '../text/lexicon';
import { fold } from '../text/turkish';

/**
 * The spreadsheet tool's pure parts (D-218): a sheet as text, which columns hold names or descriptions, search, sort,
 * and the writing rules applied to chosen columns. The file never leaves the browser.
 */

export interface Table {
  header: string[];
  rows: string[][];
}

const numberFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 6, useGrouping: false });
const dateFormat = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return numberFormat.format(value);
  if (value instanceof Date) return dateFormat.format(value);
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  return String(value).trim();
}

/** The first row is the header; a column with no title gets one, so every column can be named and chosen. */
export function toTable(data: readonly (readonly unknown[])[]): Table {
  if (data.length === 0) return { header: [], rows: [] };
  const width = Math.max(...data.map((row) => row.length));
  const header = Array.from({ length: width }, (_, i) => cellText(data[0]![i]) || `Sütun ${i + 1}`);
  const rows = data
    .slice(1)
    .map((row) => Array.from({ length: width }, (_, i) => cellText(row[i])))
    .filter((row) => row.some((cell) => cell !== ''));
  return { header, rows };
}

const NAME_HEADERS = ['urun', 'ad', 'adi', 'isim', 'isimi', 'magaza', 'sube', 'restoran', 'baslik', 'product', 'name', 'title', 'store'];
const DESCRIPTION_HEADERS = ['aciklama', 'description', 'icerik', 'detay', 'desc'];

/** Which rules a column wants, read off its title: names, descriptions, or neither (prices, codes, categories). */
export function guessKind(header: string): TextKind | null {
  const words = fold(header).split(/[^a-z0-9]+/u).filter(Boolean);
  if (words.some((word) => DESCRIPTION_HEADERS.includes(word))) return 'description';
  if (words.some((word) => NAME_HEADERS.includes(word))) return 'name';
  return null;
}

/** Rows with the query in any cell, Turkish letters and case ignored. */
export function filterRows(rows: readonly string[][], query: string): string[][] {
  return viewRows(rows, query, null).map((index) => rows[index]!);
}

/** The places (indexes) of the rows to show: those with the query, in the chosen order. */
export function viewRows(rows: readonly string[][], query: string, sort: { column: number; direction: 'asc' | 'desc' } | null): number[] {
  const wanted = fold(query.trim());
  const shown = rows.map((_, index) => index).filter((index) => !wanted || rows[index]!.some((cell) => fold(cell).includes(wanted)));
  if (!sort) return shown;
  const sign = sort.direction === 'asc' ? 1 : -1;
  return shown.sort((x, y) => compareCells(rows[x]![sort.column] ?? '', rows[y]![sort.column] ?? '') * sign);
}

const asNumber = (cell: string): number | undefined => {
  const text = cell.replace(/\s/gu, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/u.test(text) ? Number(text) : undefined;
};

/** Numbers as numbers, text in Turkish alphabetical order. */
function compareCells(a: string, b: string): number {
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== undefined && nb !== undefined) return na - nb;
  return a.localeCompare(b, 'tr', { sensitivity: 'base' });
}

/** Sorted by one column. */
export function sortRows(rows: readonly string[][], column: number, direction: 'asc' | 'desc'): string[][] {
  return viewRows(rows, '', { column, direction }).map((index) => rows[index]!);
}

/** The chosen columns fixed by their rules; how many cells changed. */
export function applyRules(
  rows: readonly string[][],
  columns: ReadonlyMap<number, TextKind>,
  options: { smart: boolean; lexicon?: Lexicon },
): { rows: string[][]; changed: number } {
  let changed = 0;
  const fixed = rows.map((row) =>
    row.map((cell, index) => {
      const kind = columns.get(index);
      if (!kind || cell === '') return cell;
      const after = formatLine(cell, { kind, smart: options.smart, ...(options.lexicon ? { lexicon: options.lexicon } : {}) });
      if (after !== cell) changed += 1;
      return after;
    }),
  );
  return { rows: fixed, changed };
}

/**
 * A CSV file as rows. Excel in Turkish saves with semicolons, most other tools with commas: the first line's count
 * decides. Quoted fields may hold separators, doubled quotes and line breaks.
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/u, '');
  const firstLine = source.split(/\r?\n/u, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/gu)?.length ?? 0) > (firstLine.match(/,/gu)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** The table without the hidden columns, in the sheet's order: what is shown and what is saved. */
export function pickColumns(header: readonly string[], rows: readonly string[][], hidden: ReadonlySet<number>): Table {
  const keep = header.map((_, index) => index).filter((index) => !hidden.has(index));
  return { header: keep.map((index) => header[index]!), rows: rows.map((row) => keep.map((index) => row[index] ?? '')) };
}

/**
 * The file check (D-220): the opening rules (D-206) read off a seller's spreadsheet before it goes to the panel, plus what
 * the panel would turn away. The same numbers as the analysis: 70% of products with a description, 20% with a photo, a
 * drinks section of at least 10.
 */
export const DESCRIPTION_SHARE = 0.7;
export const IMAGE_SHARE = 0.2;
export const MIN_DRINKS = 10;

export interface SheetCheck {
  key: 'products' | 'descriptions' | 'photos' | 'drinks' | 'writing' | 'duplicates' | 'warnings';
  label: string;
  value: string;
  /** Met, missed, or only a count. */
  ok: boolean | null;
  /** The rows to look at: the ones missing it, or the ones at fault. */
  rows: number[];
}

const PHOTO_HEADERS = ['gorsel', 'resim', 'foto', 'fotograf', 'image', 'img', 'photo', 'picture', 'url', 'link'];
const CATEGORY_HEADERS = ['kategori', 'category', 'bolum', 'grup', 'group', 'section'];
const DRINK_WORDS = /icecek|drink|beverage/u;

const headerWords = (header: string): string[] => fold(header).split(/[^a-z0-9]+/u).filter(Boolean);
const findColumn = (header: readonly string[], words: readonly string[]): number => header.findIndex((title) => headerWords(title).some((word) => words.includes(word)));
const percent = (share: number): string => `%${Math.floor(share * 100)}`;
/** "Adana Kebap", "ADANA  KEBAP." and "adana kebap" are the same product written twice. */
const sameName = (name: string): string => fold(name).replace(/[^a-z0-9]+/gu, ' ').trim();

export function checkSheet(table: Table, kinds: readonly (TextKind | 'none')[], options: { smart: boolean; lexicon?: Lexicon }): SheetCheck[] {
  const nameColumn = kinds.indexOf('name');
  if (nameColumn < 0) return [];
  const descriptionColumn = kinds.indexOf('description');
  const products = table.rows.map((row, index) => (row[nameColumn] ? index : -1)).filter((index) => index >= 0);
  const checks: SheetCheck[] = [{ key: 'products', label: 'Ürün', value: products.length.toLocaleString('tr-TR'), ok: null, rows: [] }];
  if (products.length === 0) return checks;

  const share = (column: number, key: 'descriptions' | 'photos', label: string, target: number) => {
    const missing = products.filter((index) => !table.rows[index]![column]);
    const present = (products.length - missing.length) / products.length;
    checks.push({ key, label, value: `${percent(present)} · hedef ${percent(target)}`, ok: present >= target, rows: missing });
  };
  if (descriptionColumn >= 0) share(descriptionColumn, 'descriptions', 'Açıklama', DESCRIPTION_SHARE);
  const photoColumn = findColumn(table.header, PHOTO_HEADERS);
  if (photoColumn >= 0) share(photoColumn, 'photos', 'Fotoğraf', IMAGE_SHARE);
  const categoryColumn = findColumn(table.header, CATEGORY_HEADERS);
  if (categoryColumn >= 0) {
    const drinks = products.filter((index) => DRINK_WORDS.test(fold(table.rows[index]![categoryColumn] ?? '')));
    checks.push({ key: 'drinks', label: 'İçecek', value: `${drinks.length} · en az ${MIN_DRINKS}`, ok: drinks.length >= MIN_DRINKS, rows: drinks });
  }

  const format = { kind: 'name' as const, smart: options.smart, ...(options.lexicon ? { lexicon: options.lexicon } : {}) };
  const unwritten = products.filter((index) => formatLine(table.rows[index]![nameColumn]!, format) !== table.rows[index]![nameColumn]);
  checks.push({ key: 'writing', label: 'Yazım', value: unwritten.length === 0 ? 'kurallara uygun' : `${unwritten.length} ad kurala uymuyor`, ok: unwritten.length === 0, rows: unwritten });

  const groups = new Map<string, number[]>();
  for (const index of products) {
    const key = sameName(table.rows[index]![nameColumn]!);
    groups.set(key, [...(groups.get(key) ?? []), index]);
  }
  const twice = [...groups.values()].filter((group) => group.length > 1);
  checks.push({
    key: 'duplicates',
    label: 'Tekrar',
    value: twice.length === 0 ? 'yok' : `${twice.length} ad birden çok kez`,
    ok: twice.length === 0,
    rows: twice.flat().sort((a, b) => a - b),
  });

  const textColumns = kinds.map((kind, index) => (kind === 'none' ? -1 : index)).filter((index) => index >= 0);
  const flagged = products.filter((index) => textColumns.some((column) => checkLine(table.rows[index]![column] ?? '').length > 0));
  checks.push({
    key: 'warnings',
    label: 'Fiyat, emoji, iletişim',
    value: flagged.length === 0 ? 'yok' : `${flagged.length} satırda`,
    ok: flagged.length === 0,
    rows: flagged,
  });
  return checks;
}

/**
 * Empty descriptions filled from the pool (D-220): `ideas` maps a product name to the approved description chosen for
 * it. A description already written is never replaced.
 */
export function fillDescriptions(
  rows: readonly string[][],
  nameColumn: number,
  descriptionColumn: number,
  ideas: ReadonlyMap<string, string>,
): { rows: string[][]; filled: number[] } {
  const filled: number[] = [];
  const out = rows.map((row, index) => {
    const idea = ideas.get((row[nameColumn] ?? '').trim());
    if (row[descriptionColumn] || !idea) return row;
    filled.push(index);
    return row.map((cell, column) => (column === descriptionColumn ? idea : cell));
  });
  return { rows: out, filled };
}

/** The distinct product names whose description is empty: what to ask the pool for. */
export function namesWithoutDescription(rows: readonly string[][], nameColumn: number, descriptionColumn: number): string[] {
  return [...new Set(rows.filter((row) => !row[descriptionColumn] && (row[nameColumn] ?? '').trim()).map((row) => row[nameColumn]!.trim()))];
}
