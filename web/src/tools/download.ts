/** A table saved as an .xlsx file in the browser (D-218); the library loads only when a file is saved. */
export async function downloadRows(baseName: string, header: readonly string[], rows: readonly (readonly string[])[], sheet = 'Sayfa1'): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const bold = (value: string) => ({ value, fontWeight: 'bold' as const });
  const data = [header.map(bold), ...rows.map((row) => row.map((value) => ({ value })))];
  const stamp = new Date().toISOString().slice(0, 10);
  await writeXlsxFile(data, { sheet }).toFile(`${baseName}-${stamp}.xlsx`);
}
