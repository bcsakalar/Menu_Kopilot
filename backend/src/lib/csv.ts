/** CSV writer tuned for Turkish Excel: UTF-8 BOM + ';' delimiter, RFC 4180 quoting. */

export interface CsvOptions {
  delimiter?: string;
  bom?: boolean;
}

function escapeCell(value: string, delimiter: string): string {
  const needsQuotes = value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r');
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export function toCsv(header: readonly string[], rows: readonly (readonly string[])[], options: CsvOptions = {}): string {
  const delimiter = options.delimiter ?? ';';
  const lines = [header, ...rows].map((row) => row.map((cell) => escapeCell(cell, delimiter)).join(delimiter));
  const body = lines.join('\r\n') + '\r\n';
  return (options.bom ?? true ? '﻿' : '') + body;
}
