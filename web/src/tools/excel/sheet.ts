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
