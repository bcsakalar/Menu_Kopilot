import { ArrowDown, ArrowUp, Check, Database, Download, FileSpreadsheet, Search, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  applyRules,
  checkSheet,
  fillDescriptions,
  guessKind,
  namesWithoutDescription,
  parseCsv,
  pickColumns,
  toTable,
  viewRows,
  type SheetCheck,
  type Table,
} from './excel/sheet';
import { describeNames, SURE_SCORE } from './pool';
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
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  /** The sheet after the rules and the pool: which cells the rules changed, which the pool filled. */
  const [fixed, setFixed] = useState<{ rows: string[][]; cells: Set<string>; filled: Set<string> } | null>(null);
  const [focus, setFocus] = useState<SheetCheck | null>(null);
  const [pool, setPool] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });
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
    setHidden(new Set());
    setFixed(null);
    setFocus(null);
    setPool({ busy: false, message: null });
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
  const focusRows = useMemo(() => (focus ? new Set(focus.rows) : null), [focus]);
  const view = useMemo(() => viewRows(rows, query, sort).filter((index) => !focusRows || focusRows.has(index)), [rows, query, sort, focusRows]);
  const chosen = kinds.some((kind) => kind !== 'none');
  const checks = useMemo(() => (table ? checkSheet({ header: table.header, rows }, kinds, { smart: true, lexicon }) : []), [table, rows, kinds, lexicon]);
  const nameColumn = kinds.indexOf('name');
  const descriptionColumn = kinds.indexOf('description');

  /** The rules' and the pool's work so far, measured against the file as it came. */
  const settle = (next: string[][], filled: Set<string>) => {
    if (!table) return;
    const cells = new Set<string>();
    next.forEach((row, r) => row.forEach((cell, c) => cell !== table.rows[r]![c] && !filled.has(`${r}:${c}`) && cells.add(`${r}:${c}`)));
    setFixed({ rows: next, cells, filled });
    setShowFixed(true);
    setFocus(null);
  };

  const fix = () => {
    if (!table) return;
    const columns = new Map<number, TextKind>();
    kinds.forEach((kind, index) => {
      if (kind !== 'none') columns.set(index, kind);
    });
    // On top of what the pool filled: fixing again never loses it.
    settle(applyRules(fixed?.rows ?? table.rows, columns, { smart: true, lexicon }).rows, fixed?.filled ?? new Set());
  };

  const fillFromPool = async () => {
    if (!table || nameColumn < 0 || descriptionColumn < 0) return;
    const current = fixed?.rows ?? table.rows;
    const names = namesWithoutDescription(current, nameColumn, descriptionColumn);
    if (names.length === 0) {
      setPool({ busy: false, message: 'Boş açıklama yok.' });
      return;
    }
    setPool({ busy: true, message: null });
    try {
      const found = await describeNames(names);
      const ideas = new Map<string, string>();
      names.forEach((name, index) => {
        const best = found[index]?.[0];
        // Only the same product: a merely similar one is left for the rep (the text tool shows those).
        if (best && best.score >= SURE_SCORE) ideas.set(name, best.description);
      });
      const result = fillDescriptions(current, nameColumn, descriptionColumn, ideas);
      const filled = new Set(fixed?.filled ?? []);
      for (const index of result.filled) filled.add(`${index}:${descriptionColumn}`);
      settle(result.rows, filled);
      const left = names.length - ideas.size;
      setPool({
        busy: false,
        message:
          result.filled.length === 0
            ? 'Havuzda bu ürünlerin onaylı açıklaması yok.'
            : `${result.filled.length.toLocaleString('tr-TR')} açıklama havuzdan dolduruldu${left > 0 ? `; ${left.toLocaleString('tr-TR')} ürün havuzda yok` : ''}. Göndermeden önce göz at.`,
      });
    } catch (err) {
      setPool({ busy: false, message: err instanceof Error ? err.message : 'Havuza ulaşılamadı.' });
    }
  };

  const save = () => {
    if (!table || !book) return;
    const base = book.name.replace(/\.[^.]+$/u, '');
    // Only the columns shown are saved, in the sheet's order.
    const picked = pickColumns(table.header, fixed ? fixed.rows : table.rows, hidden);
    void downloadRows(fixed ? `${base}-duzeltilmis` : base, picked.header, picked.rows, book.sheets[sheetIndex]?.name.slice(0, 31) || 'Sayfa1');
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
              setFocus(null);
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

      {checks.length > 0 && (
        <section className="panel sheet-checks" aria-label="Dosya kontrolü">
          <div className="fix-head">
            <h2>Dosya kontrolü</h2>
            <span className="muted small">Açılış kuralları ve panelin kabul etmeyecekleri. Bir maddeye tıkla, o satırlar listelensin.</span>
          </div>
          <div className="check-list">
            {checks.map((check) => (
              <button
                key={check.key}
                type="button"
                className={`check ${check.ok === true ? 'ok' : check.ok === false ? 'missed' : 'info'}`}
                aria-pressed={focus?.key === check.key}
                disabled={check.rows.length === 0}
                onClick={() => {
                  setFocus(focus?.key === check.key ? null : check);
                  setLimit(PAGE);
                }}
              >
                {check.ok === true ? <Check size={14} aria-hidden /> : check.ok === false ? <X size={14} aria-hidden /> : null}
                <span className="check-label">{check.label}</span>
                <span className="check-value">{check.value}</span>
              </button>
            ))}
          </div>
        </section>
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
          {nameColumn >= 0 && descriptionColumn >= 0 && (
            <button type="button" className="button ghost" disabled={pool.busy} onClick={() => void fillFromPool()} title="Açıklaması boş ürünlerin adları havuza sorulur, ekibin onayladığı açıklama yazılır; yazılmış açıklamaya dokunulmaz">
              <Database size={15} aria-hidden />
              {pool.busy ? 'Havuzda aranıyor…' : 'Boş açıklamaları havuzdan doldur'}
            </button>
          )}
          {fixed && (
            <>
              <span className="muted small">
                {fixed.cells.size.toLocaleString('tr-TR')} hücre düzeltildi
                {fixed.filled.size > 0 && <> · <span className="filled-legend">{fixed.filled.size.toLocaleString('tr-TR')} açıklama havuzdan</span></>}
              </span>
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
        {pool.message && (
          <p className="muted small" role="status">
            {pool.message}
          </p>
        )}
      </section>

      <div className="column-picker" role="group" aria-label="Gösterilen sütunlar">
        <span className="muted small">Sütunlar</span>
        {table.header.map((title, index) => (
          <label key={`${title}-${index}`} className={`chip${hidden.has(index) ? '' : ' on'}`}>
            <input
              type="checkbox"
              checked={!hidden.has(index)}
              onChange={() => {
                const next = new Set(hidden);
                if (next.has(index)) next.delete(index);
                else if (next.size < table.header.length - 1) next.add(index);
                setHidden(next);
              }}
            />
            {title}
          </label>
        ))}
        {hidden.size > 0 && <span className="muted small">{hidden.size} sütun gizli; indirilen dosyaya da girmez</span>}
      </div>

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
        {focus && (
          <button type="button" className="chip on focus-chip" onClick={() => setFocus(null)}>
            {focus.label}: {focus.rows.length.toLocaleString('tr-TR')} satır
            <X size={13} aria-label="Tüm satırları göster" />
          </button>
        )}
        <span className="muted small">
          {view.length === table.rows.length ? `${table.rows.length.toLocaleString('tr-TR')} satır` : `${view.length.toLocaleString('tr-TR')} / ${table.rows.length.toLocaleString('tr-TR')} satır`}
        </span>
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="row-number">#</th>
              {table.header.map((title, index) => hidden.has(index) ? null : (
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
                {rows[index]!.map((cell, c) => hidden.has(c) ? null : (
                  <td
                    key={c}
                    className={
                      fixed && showFixed ? (fixed.filled.has(`${index}:${c}`) ? 'filled-cell' : fixed.cells.has(`${index}:${c}`) ? 'fixed-cell' : undefined) : undefined
                    }
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {view.length === 0 && <p className="muted empty-table">{focus ? 'Bu maddede gösterilecek satır kalmadı.' : 'Aramayla eşleşen satır yok.'}</p>}
      </div>
      {view.length > limit && (
        <button type="button" className="button ghost more" onClick={() => setLimit((current) => current + PAGE)}>
          {Math.min(PAGE, view.length - limit).toLocaleString('tr-TR')} satır daha göster ({(view.length - limit).toLocaleString('tr-TR')} kaldı)
        </button>
      )}
    </section>
  );
}
