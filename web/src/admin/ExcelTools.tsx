import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { ApiError, upload } from '../api';

interface ImportReport {
  dryRun: boolean;
  rows: number;
  created: number;
  updated: number;
  unchanged: number;
  items: { row: number; name: string; cuisine: string; action: 'create' | 'update' | 'same' }[];
  errors: { row: number; name: string; message: string }[];
}

const ACTION_LABEL = { create: 'Yeni', update: 'Güncellenecek', same: 'Aynı' } as const;
const PREVIEW_ROWS = 60;

/**
 * The pool as a spreadsheet (D-206): the sample to fill in, the pool to edit, and an upload that always shows what
 * it would do before it does it.
 */
export function ExcelTools({ onImported }: { onImported: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (chosen: File, dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', chosen);
      const result = await upload<ImportReport>(`/templates/excel/import?dryRun=${String(dryRun)}`, form);
      setReport(result);
      if (!dryRun) onImported();
    } catch (err) {
      setReport(null);
      setError(err instanceof ApiError ? err.message : 'Dosya yüklenemedi.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setReport(null);
    setError(null);
    if (input.current) input.current.value = '';
  };

  const changes = report ? report.created + report.updated : 0;
  const listed = report?.items.filter((i) => i.action !== 'same').slice(0, PREVIEW_ROWS) ?? [];

  return (
    <div className="excel">
      <div className="excel-actions">
        <a className="button ghost" href="/api/v1/templates/excel/sample" download>
          <FileSpreadsheet size={15} />
          Örnek Excel
        </a>
        <a className="button ghost" href="/api/v1/templates/excel/export" download>
          <Download size={15} />
          Havuzu Excel'e aktar
        </a>
        <button type="button" className="button primary" onClick={() => input.current?.click()} disabled={busy}>
          <Upload size={15} />
          Excel'den yükle
        </button>
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            if (!chosen) return;
            setFile(chosen);
            void send(chosen, true);
          }}
        />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {busy && <p className="muted small">Dosya okunuyor…</p>}
      {report && file && (
        <section className="import-report" aria-live="polite">
          <header>
            <h2>{report.dryRun ? `Önizleme: ${file.name}` : `${file.name} yüklendi`}</h2>
            <p>
              {report.rows} satır · <b>{report.created}</b> yeni · <b>{report.updated}</b> güncelleme · {report.unchanged} aynı
              {report.errors.length > 0 && (
                <>
                  {' '}
                  · <b className="danger">{report.errors.length} hatalı</b>
                </>
              )}
            </p>
          </header>
          {report.errors.length > 0 && (
            <table className="mini-table">
              <thead>
                <tr>
                  <th className="number">Satır</th>
                  <th>Ürün</th>
                  <th>Sorun</th>
                </tr>
              </thead>
              <tbody>
                {report.errors.map((e) => (
                  <tr key={`${e.row}-${e.name}`}>
                    <td className="number">{e.row}</td>
                    <td>{e.name || '—'}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {report.dryRun && listed.length > 0 && (
            <details>
              <summary>{changes} değişikliği gör</summary>
              <ul className="import-items">
                {listed.map((item) => (
                  <li key={item.row}>
                    <span className={`tag ${item.action}`}>{ACTION_LABEL[item.action]}</span>
                    {item.name} <span className="muted">· {item.cuisine}</span>
                  </li>
                ))}
                {changes > listed.length && <li className="muted">ve {changes - listed.length} ürün daha</li>}
              </ul>
            </details>
          )}
          <div className="dialog-actions">
            <button type="button" className="button ghost" onClick={reset}>
              {report.dryRun ? 'Vazgeç' : 'Kapat'}
            </button>
            {report.dryRun && (
              <button type="button" className="button primary" disabled={busy || changes === 0} onClick={() => void send(file, false)}>
                {changes === 0 ? 'Değişiklik yok' : `${changes} şablonu kaydet`}
              </button>
            )}
          </div>
          {report.dryRun && report.errors.length > 0 && changes > 0 && (
            <small className="muted">Hatalı satırlar atlanır; düzeltip dosyayı tekrar yükleyebilirsin.</small>
          )}
        </section>
      )}
    </div>
  );
}
