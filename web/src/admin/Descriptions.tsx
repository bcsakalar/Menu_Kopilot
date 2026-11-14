import { Check, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ApiError, post } from '../api';

interface Proposal {
  id: string;
  name: string;
  cuisine: string;
  current: string;
  proposed: string;
}

interface Row extends Proposal {
  text: string;
  keep: boolean;
  /** Why the server turned the text down, to fix and save again. */
  reason?: string;
}

const BATCH = 20;
const words = (text: string) => text.split(/\s+/u).filter(Boolean).length;

/**
 * Real descriptions for the pool (D-223): the imported templates whose description is only a category's stock sentence.
 * The model writes a batch, the admin reads and edits it, and only what is ticked is saved.
 */
export function Descriptions({ onSaved }: { onSaved: () => void }) {
  const [pending, setPending] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [skip, setSkip] = useState<string[]>([]);
  const [busy, setBusy] = useState<'propose' | 'apply' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const count = () =>
    api<{ pending: number }>('/templates/descriptions')
      .then((result) => setPending(result.pending))
      .catch(() => setPending(null));
  useEffect(() => {
    void count();
  }, []);

  const propose = async () => {
    setBusy('propose');
    setError(null);
    setMessage(null);
    // What is still on screen unsaved is not asked for again in this sitting.
    const passed = [...skip, ...rows.map((row) => row.id)];
    try {
      const result = await post<{ items: Proposal[]; remaining: number }>('/templates/descriptions/propose', { limit: BATCH, skip: passed });
      setSkip(passed);
      setRows(result.items.map((item) => ({ ...item, text: item.proposed, keep: item.proposed !== '' })));
      if (result.items.length === 0) setMessage('Bu oturumda yazılacak açıklama kalmadı.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Öneri alınamadı.');
    } finally {
      setBusy(null);
    }
  };

  const chosen = rows.filter((row) => row.keep && row.text.trim() !== '');

  const apply = async () => {
    if (chosen.length === 0) return;
    setBusy('apply');
    setError(null);
    try {
      const result = await post<{ updated: number; rejected: { id: string; reason: string }[] }>('/templates/descriptions/apply', {
        items: chosen.map((row) => ({ id: row.id, description: row.text.trim() })),
      });
      const reasons = new Map(result.rejected.map((r) => [r.id, r.reason]));
      // Saved rows leave; turned-down ones stay with the reason; unticked ones are skipped for this sitting.
      setSkip((current) => [...current, ...rows.filter((row) => !row.keep).map((row) => row.id)]);
      setRows(rows.filter((row) => reasons.has(row.id)).map((row) => ({ ...row, reason: reasons.get(row.id) })));
      setMessage(`${result.updated} açıklama kaydedildi.${result.rejected.length > 0 ? ` ${result.rejected.length} tanesi kurallara uymadı; düzeltip tekrar kaydet.` : ''}`);
      onSaved();
      void count();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kaydedilemedi.');
    } finally {
      setBusy(null);
    }
  };

  const update = (id: string, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  return (
    <section className="panel descriptions" aria-label="Açıklamalar">
      <div className="descriptions-head">
        <div>
          <h2>Açıklamalar</h2>
          <p className="muted small">
            {pending === null
              ? 'Sayılıyor…'
              : pending === 0
                ? 'Havuzdaki bütün açıklamalar ürüne özel.'
                : `${pending.toLocaleString('tr-TR')} şablonun açıklaması ürün adı ve genel bir kategori cümlesinden ibaret; kartlarda şimdilik ürün tipinin açıklaması kullanılıyor. Yapay zekâya yazdır, okuyup kaydet.`}
          </p>
        </div>
        <button type="button" className="button primary" disabled={busy !== null || pending === 0} onClick={() => void propose()}>
          <Sparkles size={15} aria-hidden />
          {busy === 'propose' ? 'Yazılıyor…' : rows.length > 0 ? `Sonraki ${BATCH}` : `${BATCH} açıklama yazdır`}
        </button>
      </div>

      {rows.length > 0 && (
        <>
          <table className="mini-table descriptions-table">
            <thead>
              <tr>
                <th aria-label="Kaydedilsin" />
                <th>Ürün</th>
                <th>Şimdiki</th>
                <th>Yeni açıklama</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input type="checkbox" checked={row.keep} aria-label={`${row.name} kaydedilsin`} onChange={(e) => update(row.id, { keep: e.target.checked })} />
                  </td>
                  <td>
                    <strong>{row.name}</strong>
                    <span className="muted small block">{row.cuisine}</span>
                  </td>
                  <td className="muted small">{row.current}</td>
                  <td>
                    <textarea
                      rows={3}
                      value={row.text}
                      aria-label={`${row.name} için yeni açıklama`}
                      placeholder="Yapay zekâ kurala uygun yazamadı; sen yaz"
                      onChange={(e) => update(row.id, { text: e.target.value, keep: e.target.value.trim() !== '', reason: undefined })}
                    />
                    <span className={`small ${words(row.text) >= 6 && words(row.text) <= 8 ? 'muted' : 'warning'}`}>{words(row.text)} kelime · 6–8 olmalı</span>
                    {row.reason && <span className="small error-text block">{row.reason}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="descriptions-actions">
            <button type="button" className="button primary" disabled={busy !== null || chosen.length === 0} onClick={() => void apply()}>
              <Check size={15} aria-hidden />
              {busy === 'apply' ? 'Kaydediliyor…' : `Seçilenleri kaydet (${chosen.length})`}
            </button>
            <span className="muted small">İşaretini kaldırdıkların bu oturumda tekrar gelmez.</span>
          </div>
        </>
      )}
      {message && (
        <p className="muted small" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
