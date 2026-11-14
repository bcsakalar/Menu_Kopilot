import { ArrowDown, ArrowUp, Download, FileSpreadsheet, Search, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { applyRules, guessKind, parseCsv, toTable, viewRows, type Table } from './excel/sheet';
import type { TextKind } from './text/format';
import { downloadRows } from './download';
import { useLexicon } from './useLexicon';

/**
 * Excel (D-218): open a seller's spreadsheet in the browser, search and sort it, and fix its name and description columns
 * by the panel's writing rules — then save it back as .xlsx. The file is never uploaded.
 */

interface Workbook {
  name: string;
  sheets: { name: string; table: Table }[];
}

type ColumnKind = TextKind | 'none';
const PAGE = 300;
const MAX_BYTES = 30 * 1024 * 1024;

async function readWorkbook(file: File): Promise<Workbook> {
  const name = file.name;
  if (file.size > MAX_BYTES) throw new Error('Dosya 30 MB’tan büyük; daha küçük bir parçasını yükle.');
  if (/\.csv$/iu.test(name)) return { name, sheets: [{ name: 'CSV', table: toTable(parseCsv(await file.text())) }] };
  if (/\.xls$/iu.test(name)) throw new Error('Eski .xls biçimi açılamıyor. Excel’de Farklı Kaydet → Excel Çalışma Kitabı (.xlsx) seçip yükle.');
  if (!/\.xlsx$/iu.test(name)) throw new Error('Yalnızca .xlsx ve .csv dosyaları açılır.');
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheets = await readXlsxFile(file);
  return { name, sheets: sheets.map((sheet) => ({ name: sheet.sheet, table: toTable(sheet.data) })) };
}

export function ExcelTool() {
  const { lexicon } = useLexicon();
  const [book, setBook] = useState<Workbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ column: number; direction: 'asc' | 'desc' } | null>(null);
  const [kinds, setKinds] = useState<ColumnKind[]>([]);
  const [fixed, setFixed] = useState<{ rows: string[][]; cells: Set<string>; changed: number } | null>(null);
  const [showFixed, setShowFixed] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const table = book?.sheets[sheetIndex]?.table ?? null;

  const choose = (index: number, workbook = book) => {
    const next = workbook?.sheets[index]?.table;
    setSheetIndex(index);
    setKinds(next ? next.header.map((title) => guessKind(title) ?? 'none') : []);
    setFixed(null);
    setSort(null);
    setQuery('');
    setLimit(PAGE);
  };

  const open = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const workbook = await readWorkbook(file);
      if (workbook.sheets.every((sheet) => sheet.table.rows.length === 0 && sheet.table.header.length === 0)) throw new Error('Dosyada okunacak satır yok.');
      setBook(workbook);
      choose(0, workbook);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dosya okunamadı.');
    } finally {
      setBusy(false);
    }
  };

  const rows = table ? (fixed && showFixed ? fixed.rows : table.rows) : [];
  const view = useMemo(() => viewRows(rows, query, sort), [rows, query, sort]);
  const chosen = kinds.some((kind) => kind !== 'none');

  const fix = () => {
    if (!table) return;
    const columns = new Map<number, TextKind>();
    kinds.forEach((kind, index) => {
      if (kind !== 'none') columns.set(index, kind);
    });
    const result = applyRules(table.rows, columns, { smart: true, lexicon });
    const cells = new Set<string>();
    result.rows.forEach((row, r) => row.forEach((cell, c) => cell !== table.rows[r]![c] && cells.add(`${r}:${c}`)));
    setFixed({ rows: result.rows, cells, changed: result.changed });
    setShowFixed(true);
  };

  const save = () => {
    if (!table || !book) return;
    const base = book.name.replace(/\.[^.]+$/u, '');
    void downloadRows(fixed ? `${base}-duzeltilmis` : base, table.header, fixed ? fixed.rows : table.rows, book.sheets[sheetIndex]?.name.slice(0, 31) || 'Sayfa1');
  };

  const sortBy = (column: number) =>
    setSort((current) => (current?.column !== column ? { column, direction: 'asc' } : current.direction === 'asc' ? { column, direction: 'desc' } : null));

  if (!book || !table) {
    return (
      <section className="admin-page tool-page">
        <header className="page-head">
          <div>
            <h1>Excel</h1>
            <p className="admin-intro">Satıcının gönderdiği dosyayı aç, ara, sırala; ürün adı ve açıklama sütunlarını kurallarla düzeltip yeniden indir.</p>
          </div>
        </header>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <label
          className={`dropzone${dragging ? ' dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void open(e.dataTransfer.files[0]);
          }}
        >
          <FileSpreadsheet size={28} aria-hidden />
          <strong>{busy ? 'Okunuyor…' : 'Dosyayı buraya bırak ya da seç'}</strong>
          <span className="muted small">.xlsx veya .csv · dosya bilgisayarından çıkmaz</span>
          <input type="file" accept=".xlsx,.csv" onChange={(e) => void open(e.target.files?.[0])} />
        </label>
      </section>
    );
  }

  const shown = view.slice(0, limit);

  return (
    <section className="admin-page tool-page wide">
      <header className="page-head">
        <div>
          <h1>Excel</h1>
          <p className="admin-intro">
            <b>{book.name}</b> · {table.rows.length.toLocaleString('tr-TR')} satır, {table.header.length} sütun
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="button ghost" onClick={save}>
            <Download size={15} aria-hidden />
            {fixed ? 'Düzeltilmiş hâlini indir' : 'İndir'}
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Dosyayı kapat"
            title="Başka dosya aç"
            onClick={() => {
              setBook(null);
              setFixed(null);
            }}
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {book.sheets.length > 1 && (
        <div className="segmented sheet-tabs" role="group" aria-label="Sayfa">
          {book.sheets.map((sheet, index) => (
            <button key={sheet.name} type="button" aria-pressed={index === sheetIndex} onClick={() => choose(index)}>
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      <section className="panel fix-panel">
        <div className="fix-head">
          <h2>Kurallarla düzelt</h2>
          <span className="muted small">Ad sütunları ürün/mağaza adı, açıklama sütunları açıklama kurallarıyla düzeltilir.</span>
        </div>
        <div className="column-kinds">
          {table.header.map((title, index) => (
            <label key={`${title}-${index}`}>
              <span>{title}</span>
              <select
                value={kinds[index] ?? 'none'}
                onChange={(e) => {
                  const next = [...kinds];
                  next[index] = e.target.value as ColumnKind;
                  setKinds(next);
                }}
              >
                <option value="none">Dokunma</option>
                <option value="name">Ad</option>
                <option value="description">Açıklama</option>
              </select>
            </label>
          ))}
        </div>
        <div className="fix-actions">
          <button type="button" className="button primary" disabled={!chosen} onClick={fix}>
            <Sparkles size={15} aria-hidden />
            Düzelt
          </button>
          {fixed && (
            <>
              <span className="muted small">{fixed.changed.toLocaleString('tr-TR')} hücre düzeltildi</span>
              <div className="segmented" role="group" aria-label="Görünüm">
                <button type="button" aria-pressed={!showFixed} onClick={() => setShowFixed(false)}>
                  Önce
                </button>
                <button type="button" aria-pressed={showFixed} onClick={() => setShowFixed(true)}>
                  Sonra
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="toolbar">
        <label className="search">
          <Search size={15} aria-hidden />
          <input
            type="search"
            placeholder="Tabloda ara"
            aria-label="Tabloda ara"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
          />
        </label>
        <span className="muted small">
          {view.length === table.rows.length ? `${table.rows.length.toLocaleString('tr-TR')} satır` : `${view.length.toLocaleString('tr-TR')} / ${table.rows.length.toLocaleString('tr-TR')} satır`}
        </span>
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="row-number">#</th>
              {table.header.map((title, index) => (
                <th key={`${title}-${index}`} aria-sort={sort?.column === index ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => sortBy(index)}>
                    {title}
                    {sort?.column === index && (sort.direction === 'asc' ? <ArrowUp size={13} aria-hidden /> : <ArrowDown size={13} aria-hidden />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((index) => (
              <tr key={index}>
                <td className="row-number">{index + 2}</td>
                {rows[index]!.map((cell, c) => (
                  <td key={c} className={fixed && showFixed && fixed.cells.has(`${index}:${c}`) ? 'fixed-cell' : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {view.length === 0 && <p className="muted empty-table">Aramayla eşleşen satır yok.</p>}
      </div>
      {view.length > limit && (
        <button type="button" className="button ghost more" onClick={() => setLimit((current) => current + PAGE)}>
          {Math.min(PAGE, view.length - limit).toLocaleString('tr-TR')} satır daha göster ({(view.length - limit).toLocaleString('tr-TR')} kaldı)
        </button>
      )}
    </section>
  );
}
