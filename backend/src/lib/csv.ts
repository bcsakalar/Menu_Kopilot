/** CSV writer tuned for Turkish Excel: UTF-8 BOM + ';' delimiter, RFC 4180 quoting. */

export interface CsvOptions {
  delimiter?: string;
  bom?: boolean;
}

/** Cells Excel would evaluate as formulas (CSV injection) are prefixed with an apostrophe. */
const FORMULA_START = /^[=+\-@\t\r]/;

function escapeCell(value: string, delimiter: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  const needsQuotes = safe.includes(delimiter) || safe.includes('"') || safe.includes('\n') || safe.includes('\r');
  const escaped = safe.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export function toCsv(header: readonly string[], rows: readonly (readonly string[])[], options: CsvOptions = {}): string {
  const delimiter = options.delimiter ?? ';';
  const lines = [header, ...rows].map((row) => row.map((cell) => escapeCell(cell, delimiter)).join(delimiter));
  const body = lines.join('\r\n') + '\r\n';
  return ((options.bom ?? true) ? '﻿' : '') + body;
}
