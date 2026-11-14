import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Loading, Page, useLoad } from './pages';

type Range = 'today' | 'week' | 'month';

interface UsageData {
  byModel: { model: string; label: string; calls: number; failed: number; avgLatencyMs: number }[];
  errors: { code: string; count: number }[];
}

interface OverviewData {
  visitors: number;
  conversations: number;
  runs: number;
  cards: number;
  llm: { calls: number; failed: number; tokens: number };
  topCuisines: { name: string; runs: number }[];
  site: { callsToday: number; dailyCalls: number };
  daily: { date: string; runs: number; conversations: number }[];
  quality: { runs: number; products: number; drinks: number; descriptions: number; images: number; writing: number };
  pool: { templates: number; imported: number; drafts: number; cuisines: number; thin: { name: string; templates: number; target: number }[] };
  feedback: { new: number; open: number };
}

interface LoadData {
  analyses: { running: number; waiting: number; size: number; queueMax: number; waitP95Ms: number | null };
  lastQuarter: { runs: number; p50Ms: number | null; p95Ms: number | null; calls: number; failed: number; byProvider: { provider: string; calls: number; failed: number }[] };
  pacing: { model: string; inLastMinute: number; ceiling: number }[];
  quota: { callsToday: number; dailyCalls: number };
  process: { rssMb: number; heapMb: number; eventLoopP99Ms: number; uptimeS: number };
  alerts: { key: 'slow' | 'failing' | 'busy' | 'quota'; since: string }[];
}

const ALERT_LABEL: Record<LoadData['alerts'][number]['key'], string> = {
  slow: 'Analizler yavaş',
  failing: 'Yapay zekâ çağrıları sık başarısız',
  busy: 'Analiz kuyruğu dolu',
  quota: "Günlük yapay zekâ tavanının %80'i doldu",
};
/** How often the load panel refreshes itself while the dashboard is open. */
const LOAD_REFRESH_MS = 15_000;

const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: 'Bugün' },
  { key: 'week', label: '7 gün' },
  { key: 'month', label: 'Bu ay' },
];

const RULES: { key: keyof Omit<OverviewData['quality'], 'runs'>; label: string }[] = [
  { key: 'products', label: 'Ürün sayısı' },
  { key: 'drinks', label: 'En az 10 içecek' },
  { key: 'descriptions', label: '%70 açıklama' },
  { key: 'images', label: '%20 fotoğraf' },
  { key: 'writing', label: 'Yazım düzeni' },
];

const ERROR_LABEL: Record<string, string> = { unavailable: 'yoğunluk', rate_limited: 'hız limiti', timeout: 'zaman aşımı', aborted: 'iptal' };
const n = (value: number) => value.toLocaleString('tr-TR');
const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
const weekday = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('tr-TR', { weekday: 'short' });

function Stat({ label, value, note, onClick }: { label: string; value: number; note?: string | undefined; onClick?: () => void }) {
  const body = (
    <>
      <span>{label}</span>
      <strong>{n(value)}</strong>
      {note && <small>{note}</small>}
    </>
  );
  return onClick ? (
    <button type="button" className="stat link-stat" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="stat">{body}</div>
  );
}

/** Analyses per day, one bar each; every bar names its day and counts on hover and for screen readers. */
function Activity({ days }: { days: OverviewData['daily'] }) {
  const peak = Math.max(1, ...days.map((d) => d.runs));
  const total = days.reduce((sum, d) => sum + d.runs, 0);
  return (
    <section className="panel wide">
      <header className="panel-head">
        <h2>Son 14 gün</h2>
        <span className="muted small">{n(total)} analiz</span>
      </header>
      <ol className="bars" aria-label="Günlük analiz sayısı">
        {days.map((day) => {
          const label = `${dayLabel(day.date)}: ${day.runs} analiz, ${day.conversations} yeni görüşme`;
          return (
            <li key={day.date} title={label} aria-label={label}>
              <span className="bar-value">{day.runs > 0 ? day.runs : ''}</span>
              <span className="bar-track">
                <i style={{ height: `${(day.runs / peak) * 100}%` }} />
              </span>
              <span className="bar-day">{weekday(day.date)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Rules({ quality }: { quality: OverviewData['quality'] }) {
  if (quality.runs === 0) {
    return (
      <section className="panel">
        <h2>Açılış kuralları</h2>
        <p className="muted">Bu dönemde kontrol listesiyle yapılmış analiz yok.</p>
      </section>
    );
  }
  const worst = [...RULES].sort((a, b) => quality[b.key] - quality[a.key])[0];
  return (
    <section className="panel">
      <h2>Açılış kuralları</h2>
      {worst && quality[worst.key] > 0 && (
        <p className="insight">
          En sık eksik kalan: <b>{worst.label}</b> · {quality[worst.key]}/{quality.runs} analiz (%{Math.round((quality[worst.key] / quality.runs) * 100)})
        </p>
      )}
      <ol className="rank">
        {RULES.map((rule) => {
          const share = quality[rule.key] / quality.runs;
          return (
            <li key={rule.key}>
              <span>{rule.label}</span>
              <b>
                {quality[rule.key]}/{quality.runs}
              </b>
              <i className="miss" style={{ width: `${share * 100}%` }} />
            </li>
          );
        })}
      </ol>
      <small className="muted">Analizlerden kaçında kuralın tutmadığı. Açıklama ve fotoğraf yalnızca panel ekran görüntüsünde ölçülür.</small>
    </section>
  );
}

function Pool({ pool, onTemplates }: { pool: OverviewData['pool']; onTemplates: () => void }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Şablon havuzu</h2>
        <button type="button" className="button ghost small" onClick={onTemplates}>
          Excel ile takviye et
          <ArrowRight size={14} />
        </button>
      </header>
      <p className="muted small">
        {n(pool.templates)} şablon, {pool.cuisines} mutfak{pool.imported > 0 ? ` · ${n(pool.imported)} şablon Excel'den geldi` : ''}
      </p>
      {pool.drafts > 0 && (
        <p className="insight">
          <b>{n(pool.drafts)}</b> yapay zekâ önerisi onay bekliyor: Şablon havuzu → Yapay zekâ önerileri.
        </p>
      )}
      {pool.thin.length === 0 ? (
        <p>Her mutfağın havuzu hedefini karşılıyor.</p>
      ) : (
        <>
          <p className="insight">Hedefine en uzak mutfaklar; buraya şablon eklemek önerileri doğrudan zenginleştirir.</p>
          <ol className="rank">
            {pool.thin.map((c) => (
              <li key={c.name}>
                <span>{c.name}</span>
                <b>
                  {c.templates}/{c.target}
                </b>
                <i style={{ width: `${(c.templates / c.target) * 100}%` }} />
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

const sec = (ms: number | null) => (ms === null ? '–' : `${(ms / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn`);

/** The site right now (D-214): analyses running and waiting, how long the last quarter hour took, provider failures. */
function Load() {
  const { data, reload } = useLoad<LoadData>('/admin/load');
  useEffect(() => {
    const timer = setInterval(reload, LOAD_REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);
  if (!data) return null;
  const { analyses, lastQuarter } = data;
  const failShare = lastQuarter.calls > 0 ? Math.round((lastQuarter.failed / lastQuarter.calls) * 100) : 0;
  return (
    <section className="panel wide">
      <header className="panel-head">
        <h2>Anlık yük</h2>
        <span className="muted small">15 saniyede bir yenilenir</span>
      </header>
      {data.alerts.map((alert) => (
        <p key={alert.key} className="error" role="status">
          {ALERT_LABEL[alert.key]} · {timeSince(alert.since)}
        </p>
      ))}
      <div className="stats">
        <Stat label="Çalışan analiz" value={analyses.running} note={`en fazla ${analyses.size}`} />
        <Stat label="Sırada" value={analyses.waiting} note={analyses.waitP95Ms === null ? undefined : `bekleme ${sec(analyses.waitP95Ms)}`} />
        <Stat label="Son 15 dk analiz" value={lastQuarter.runs} note={lastQuarter.runs > 0 ? `çoğu ${sec(lastQuarter.p50Ms)}, en yavaşlar ${sec(lastQuarter.p95Ms)}` : undefined} />
        <Stat label="Son 15 dk YZ çağrısı" value={lastQuarter.calls} note={lastQuarter.calls > 0 ? `%${failShare} hata` : undefined} />
      </div>
      {lastQuarter.byProvider.length > 0 && (
        <p className="muted small">
          {lastQuarter.byProvider.map((row) => `${row.provider}: ${row.calls} çağrı, ${row.failed} hata`).join(' · ')}
          {data.pacing.length > 0 && ` · dakikalık sınıra yakın: ${data.pacing.map((p) => `${p.model} ${p.inLastMinute}/${p.ceiling}`).join(', ')}`}
        </p>
      )}
      <small className="muted">
        Sunucu belleği {data.process.rssMb} MB · gecikme {data.process.eventLoopP99Ms} ms
      </small>
    </section>
  );
}

function timeSince(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return `${minutes} dakikadır`;
}

export function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [range, setRange] = useState<Range>('week');
  const { data, error } = useLoad<OverviewData>(`/admin/overview?range=${range}`);
  const { data: usage } = useLoad<UsageData>(`/usage/summary?range=${range}`);
  const busiest = data?.topCuisines[0]?.runs ?? 1;
  const dailyShare = data ? Math.min(100, (data.site.callsToday / Math.max(1, data.site.dailyCalls)) * 100) : 0;
  return (
    <Page
      title="Pano"
      error={error}
      actions={
        <div className="segmented" role="group" aria-label="Dönem">
          {RANGES.map((r) => (
            <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      }
    >
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="stats">
            <Stat label="Temsilci" value={data.visitors} />
            <Stat label="Görüşme" value={data.conversations} />
            <Stat label="Analiz" value={data.runs} />
            <Stat label="Önerilen kart" value={data.cards} />
            <Stat
              label="Yeni geri bildirim"
              value={data.feedback.new}
              note={data.feedback.open > data.feedback.new ? `${data.feedback.open} açık` : undefined}
              onClick={() => onNavigate('feedback')}
            />
          </div>
          <div className="panels">
            <Load />
            <Activity days={data.daily} />
            <Rules quality={data.quality} />
            <Pool pool={data.pool} onTemplates={() => onNavigate('templates')} />
            <section className="panel">
              <h2>En çok çalışılan mutfaklar</h2>
              {data.topCuisines.length === 0 ? (
                <p className="muted">Bu dönemde analiz yok.</p>
              ) : (
                <ol className="rank">
                  {data.topCuisines.map((cuisine) => (
                    <li key={cuisine.name}>
                      <span>{cuisine.name}</span>
                      <b>{cuisine.runs}</b>
                      <i style={{ width: `${(cuisine.runs / busiest) * 100}%` }} />
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section className="panel">
              <h2>Yapay zekâ</h2>
              <div className="quota">
                <p>
                  Bugün <b>{n(data.site.callsToday)}</b> / {n(data.site.dailyCalls)} çağrı
                  {data.llm.calls > 0 && (
                    <span className="muted">
                      {' '}
                      · dönemde %{Math.round((data.llm.failed / data.llm.calls) * 100)} hata
                    </span>
                  )}
                </p>
                <span className="meter-track" aria-hidden>
                  <b style={{ width: `${dailyShare}%` }} />
                </span>
                <small>Kota dolunca öneriler yalnızca şablon havuzundan gelir.</small>
              </div>
              {usage && usage.byModel.length > 0 && (
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th className="number">Çağrı</th>
                      <th className="number">Hata</th>
                      <th className="number">Süre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.byModel.map((row) => (
                      <tr key={row.model}>
                        <td>{row.label}</td>
                        <td className="number">{row.calls}</td>
                        <td className="number">{row.failed}</td>
                        <td className="number">{(row.avgLatencyMs / 1000).toFixed(1)} sn</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {usage && usage.errors.length > 0 && <p className="muted small">Hatalar: {usage.errors.map((e) => `${ERROR_LABEL[e.code] ?? e.code} ${e.count}`).join(', ')}</p>}
            </section>
          </div>
        </>
      )}
    </Page>
  );
}
