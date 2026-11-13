import { ArrowLeft, Check, Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, patch, post, put } from '../api';
import { RunBlock } from '../chat/RunBlock';
import { RichText } from '../chat/ui';
import { dateTimeLabel, groupRule, timeLabel } from '../format';
import { ExcelTools } from './ExcelTools';
import type { Conversation, OptionGroup, RunResult } from '../types';

/** One fetch with its loading and error states; `reload` after a write. */
export function useLoad<T>(path: string): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setError(null);
    api<T>(path)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Yüklenemedi.'));
  }, [path]);
  useEffect(reload, [reload]);
  return { data, error, reload };
}

export function Page({ title, intro, actions, children, error }: { title: string; intro?: string; actions?: ReactNode; children: ReactNode; error?: string | null }) {
  return (
    <section className="admin-page">
      <header className="page-head">
        <h1>{title}</h1>
        {actions}
      </header>
      {intro && <p className="admin-intro">{intro}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {children}
    </section>
  );
}

export const Loading = () => <div className="skeleton" aria-label="Yükleniyor" />;

// ---- Görüşmeler ----------------------------------------------------------------------------------------------------

interface ConversationRow {
  id: string;
  title: string;
  messages: number;
  visitor: string;
  updatedAt: string;
  createdAt: string;
}

function runSummary(result: RunResult): string {
  const count = (section: string) => result.cards.filter((c) => c.section === section).length;
  return [
    [count('new_product'), 'yeni ürün'],
    [count('option'), 'opsiyon kartı'],
    [count('fix'), 'düzeltme'],
  ]
    .filter(([value]) => value)
    .map(([value, label]) => `${value} ${label}`)
    .join(' · ');
}

export function ConversationView({
  row,
  onBack,
  backLabel = 'Görüşmeler',
}: {
  row: Pick<ConversationRow, 'id' | 'title'> & Partial<ConversationRow>;
  onBack: () => void;
  backLabel?: string;
}) {
  const { data, error } = useLoad<Conversation>(`/admin/conversations/${row.id}`);
  return (
    <section className="admin-page">
      <button type="button" className="back" onClick={onBack}>
        <ArrowLeft size={16} />
        {backLabel}
      </button>
      <header className="page-head">
        <div>
          <h1>{data?.title ?? row.title}</h1>
          <p className="admin-intro">
            {[row.createdAt ? dateTimeLabel(row.createdAt) : null, `${row.messages ?? data?.messages.length ?? 0} mesaj`, row.visitor ? `Tarayıcı ${row.visitor}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <Loading />}
      <ol className="timeline">
        {data?.messages.map((message, index) => (
          <li key={message.id} className={`turn ${message.role}`}>
            <div className="turn-who">
              <b>{message.role === 'user' ? 'Temsilci' : 'Asistan'}</b>
              <time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time>
            </div>
            <div className="turn-body">
              {message.imageCount > 0 && <p className="muted">{message.imageCount} ekran görüntüsü</p>}
              {message.text && <RichText text={message.text} />}
              {message.result && message.result.cards.length > 0 && (
                <details open={index === 1}>
                  <summary>{runSummary(message.result)}</summary>
                  <RunBlock result={message.result} />
                </details>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Conversations() {
  const { data, error } = useLoad<{ data: ConversationRow[] }>('/admin/conversations?limit=100');
  const [open, setOpen] = useState<ConversationRow | null>(null);
  if (open) return <ConversationView row={open} onBack={() => setOpen(null)} />;
  return (
    <Page title="Görüşmeler" intro="Sitedeki bütün görüşmeler, en yeni üstte." error={error}>
      {!data && !error && <Loading />}
      {data && data.data.length === 0 && <p className="muted">Henüz görüşme yok. Sitede ilk menü yapıştırıldığında burada görünür.</p>}
      {data && data.data.length > 0 && (
        <table className="table rows">
          <thead>
            <tr>
              <th>Görüşme</th>
              <th>Başladı</th>
              <th>Son mesaj</th>
              <th className="number">Mesaj</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((row) => (
              <tr key={row.id} onClick={() => setOpen(row)}>
                <td>
                  <button type="button" className="link" onClick={() => setOpen(row)}>
                    {row.title}
                  </button>
                </td>
                <td className="muted">{dateTimeLabel(row.createdAt)}</td>
                <td className="muted">{dateTimeLabel(row.updatedAt)}</td>
                <td className="number">{row.messages}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Page>
  );
}

// ---- Şablon havuzu -------------------------------------------------------------------------------------------------

interface Template {
  id: string;
  name: string;
  cuisineName: string;
  source: 'ai' | 'user' | 'imported' | 'seed';
  approved: boolean;
  needsReview: boolean;
  usageCount: number;
  aliases: string[];
  payload: {
    description: string;
    portionInfo: string;
    optionGroups: OptionGroup[];
    removableIngredients: string[];
    extraIngredients: { name: string }[];
  };
}

const SOURCE_LABEL: Record<Template['source'], string> = { ai: 'AI', user: 'Ekip', imported: 'İçe aktarma', seed: 'Hazır' };
const PAGE_SIZE = 100;

function TemplateDetail({ template }: { template: Template }) {
  const { description, portionInfo, optionGroups, removableIngredients, extraIngredients } = template.payload;
  const empty = !description && optionGroups.length === 0 && removableIngredients.length === 0 && extraIngredients.length === 0;
  return (
    <div className="template-detail">
      {description && <p>{description}</p>}
      {portionInfo && <p>Porsiyon: {portionInfo}</p>}
      {optionGroups.map((group) => (
        <p key={group.name}>
          <strong>{group.name}</strong> ({groupRule(group)}): {group.options.map((o) => o.name).join(', ')}
        </p>
      ))}
      {removableIngredients.length > 0 && <p>Çıkarılabilir: {removableIngredients.join(', ')}</p>}
      {extraIngredients.length > 0 && <p>Ekstra: {extraIngredients.map((e) => e.name).join(', ')}</p>}
      {template.aliases.length > 0 && <p>Takma adlar: {template.aliases.join(', ')}</p>}
      {empty && <p>Açıklama ve opsiyon yok (paketli ürün).</p>}
    </div>
  );
}

export function Templates() {
  const [view, setView] = useState<'true' | 'false'>('true');
  const [cuisineId, setCuisineId] = useState('');
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(0);
  const params = new URLSearchParams({
    approved: view,
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
    ...(cuisineId ? { cuisineId } : {}),
    ...(submitted ? { q: submitted } : {}),
  });
  const { data, error, reload } = useLoad<{ data: Template[]; meta: { total: number } }>(`/templates?${params.toString()}`);
  const cuisineList = useLoad<{ data: Cuisine[] }>('/cuisines').data?.data ?? [];
  const [actionError, setActionError] = useState<string | null>(null);
  const total = data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // A new filter starts from the first page.
  const filter = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(0);
  };

  const turn = (to: number) => {
    setPage(to);
    // The panel scrolls inside its main column; a new page starts at the top of the list.
    document.querySelector('.admin-main')?.scrollTo({ top: 0 });
  };

  const pager = total > PAGE_SIZE && (
    <div className="pager">
      <button type="button" className="button ghost" disabled={page === 0} onClick={() => turn(page - 1)}>
        Önceki
      </button>
      <span className="muted">
        Sayfa {page + 1} / {pages}
      </span>
      <button type="button" className="button ghost" disabled={page + 1 >= pages} onClick={() => turn(page + 1)}>
        Sonraki
      </button>
    </div>
  );

  const run = (action: Promise<unknown>) => {
    setActionError(null);
    action.then(reload).catch((err: unknown) => setActionError(err instanceof ApiError ? err.message : 'İşlem yapılamadı.'));
  };

  return (
    <Page
      title="Şablon havuzu"
      intro="Havuzdaki ürünler önerilerde yapay zekâya sorulmadan gelir. Toplu ekleme ve güncelleme için Excel kullan: örneği indir, doldur, yükle. Sildiğin ürün arşive düşer, oradan geri alabilirsin."
      error={error ?? actionError}
    >
      <ExcelTools onImported={reload} />
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Şablon durumu">
          <button type="button" aria-pressed={view === 'true'} onClick={() => filter(setView)('true')}>
            Havuzdakiler
          </button>
          <button type="button" aria-pressed={view === 'false'} onClick={() => filter(setView)('false')}>
            Arşiv
          </button>
        </div>
        <div className="toolbar-filters">
          <select aria-label="Mutfak" value={cuisineId} onChange={(e) => filter(setCuisineId)(e.target.value)}>
            <option value="">Tüm mutfaklar</option>
            {cuisineList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.templateCount})
              </option>
            ))}
          </select>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              filter(setSubmitted)(query.trim());
            }}
          >
            <input type="search" placeholder="Ürün ara ve Enter'a bas" aria-label="Ürün ara" value={query} onChange={(e) => setQuery(e.target.value)} />
          </form>
        </div>
      </div>
      {!data && !error && <Loading />}
      {data && data.data.length === 0 && <p>{view === 'false' ? 'Arşivde ürün yok.' : 'Bu filtreyle ürün bulunamadı.'}</p>}
      {data && data.data.length > 0 && (
        <>
          <p className="muted">
            {total} şablon
            {total > PAGE_SIZE && ` · ${page * PAGE_SIZE + 1}–${Math.min(total, (page + 1) * PAGE_SIZE)} arası gösteriliyor`}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Ürün ve içeriği</th>
                <th aria-label="İşlemler" />
              </tr>
            </thead>
            <tbody>
              {data.data.map((template) => (
                <tr key={template.id}>
                  <td>
                    <strong>{template.name}</strong>
                    <span className="muted small template-meta">
                      {template.cuisineName} · {SOURCE_LABEL[template.source]}
                      {template.usageCount > 0 && ` · ${template.usageCount} kez kullanıldı`}
                    </span>
                    <TemplateDetail template={template} />
                  </td>
                  <td className="row-actions">
                    {!template.approved && (
                      <button type="button" className="button ghost" onClick={() => run(patch(`/templates/${template.id}`, { approved: true }))}>
                        <Check size={15} />
                        Havuza al
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-button small"
                      aria-label={`${template.name} şablonunu sil`}
                      onClick={() => run(api(`/templates/${template.id}`, { method: 'DELETE' }))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pager}
        </>
      )}
    </Page>
  );
}

// ---- Mutfak türleri ------------------------------------------------------------------------------------------------

interface Cuisine {
  id: string;
  name: string;
  minItemCount: number;
  targetItemCount: number;
  templateCount: number;
}

interface CuisineCategory {
  categoryKey: string;
  label: string;
  minItems: number;
}

function CuisineEditor({ cuisine, onSaved }: { cuisine: Cuisine; onSaved: () => void }) {
  const { data, error } = useLoad<{ data: CuisineCategory[] }>(`/cuisines/${cuisine.id}/categories`);
  const [minimum, setMinimum] = useState(cuisine.minItemCount);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [state, setState] = useState<string | null>(null);
  const categories = (data?.data ?? []).map((c) => ({ ...c, minItems: edits[c.categoryKey] ?? c.minItems }));

  const save = async () => {
    setState('Kaydediliyor…');
    try {
      await patch(`/cuisines/${cuisine.id}`, { minItemCount: minimum });
      await put(`/cuisines/${cuisine.id}/categories`, { items: categories.map(({ categoryKey, minItems }) => ({ categoryKey, minItems })) });
      setState('Kaydedildi.');
      onSaved();
    } catch (err) {
      setState(err instanceof ApiError ? err.message : 'Kaydedilemedi.');
    }
  };

  return (
    <div className="editor">
      <h2>{cuisine.name}</h2>
      {error && <p className="error">{error}</p>}
      <label className="number-field">
        Hedef ürün sayısı
        <input type="number" min={0} max={500} value={minimum} onChange={(e) => setMinimum(Number(e.target.value))} />
      </label>
      {categories.map((category) => (
        <label key={category.categoryKey} className="number-field">
          {category.label}
          <input
            type="number"
            min={0}
            max={100}
            value={category.minItems}
            onChange={(e) => setEdits({ ...edits, [category.categoryKey]: Number(e.target.value) })}
          />
        </label>
      ))}
      <div className="editor-actions">
        <button type="button" className="button primary" onClick={() => void save()}>
          Kaydet
        </button>
        {state && <span className="muted">{state}</span>}
      </div>
    </div>
  );
}

export function Cuisines() {
  const { data, error, reload } = useLoad<{ data: Cuisine[] }>('/cuisines');
  const [openId, setOpenId] = useState<string | null>(null);
  const selected = data?.data.find((c) => c.id === openId);
  return (
    <Page title="Mutfak türleri" intro="Her mutfağın hedef ürün sayısı ve kategori minimumları. Eksik analizi bu tabloya bakar; değişiklik bir sonraki analizde geçerlidir." error={error}>
      {!data && !error && <Loading />}
      {data && (
        <div className="split">
          <table className="table">
            <thead>
              <tr>
                <th>Mutfak</th>
                <th className="number">Hedef</th>
                <th className="number">Şablon</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((cuisine) => (
                <tr key={cuisine.id} className={cuisine.id === openId ? 'selected' : ''}>
                  <td>
                    <button type="button" className="link" onClick={() => setOpenId(cuisine.id)}>
                      {cuisine.name}
                    </button>
                  </td>
                  <td className="number">{cuisine.targetItemCount}</td>
                  <td className="number">{cuisine.templateCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {selected ? <CuisineEditor key={selected.id} cuisine={selected} onSaved={reload} /> : <p className="muted">Düzenlemek için bir mutfak seç.</p>}
        </div>
      )}
    </Page>
  );
}

// ---- Öğrenilenler --------------------------------------------------------------------------------------------------

interface Learned {
  products: { cuisineId: string; cuisineName: string; name: string; removed: number; accepted: number }[];
  suggestions: { productType: string; productTypeLabel: string; kind: 'option_group' | 'removable' | 'extra'; value: string; removed: number; accepted: number }[];
}

export function Learning() {
  const { data, error, reload } = useLoad<Learned>('/learning');
  const forget = (body: unknown) => {
    void post('/learning/forget', body).then(reload);
  };
  return (
    <Page title="Öğrenilenler" intro="Restoranların sürekli Hayır dediği ürünler listenin sonuna düşer. Yanlış öğrenildiyse geri al." error={error}>
      {!data && !error && <Loading />}
      {data && data.products.length === 0 && data.suggestions.length === 0 && <p>Henüz öğrenilen bir şey yok. Bir ürün en az 3 kez reddedilince burada görünür.</p>}
      {data && data.products.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Ürün</th>
              <th>Mutfak</th>
              <th className="number">Hayır</th>
              <th className="number">Evet</th>
              <th aria-label="İşlemler" />
            </tr>
          </thead>
          <tbody>
            {data.products.map((row) => (
              <tr key={`${row.cuisineId}-${row.name}`}>
                <td>{row.name}</td>
                <td className="muted">{row.cuisineName}</td>
                <td className="number">{row.removed}</td>
                <td className="number">{row.accepted}</td>
                <td className="row-actions">
                  <button type="button" className="button ghost" onClick={() => forget({ scope: 'product', cuisineId: row.cuisineId, value: row.name })}>
                    <Undo2 size={15} />
                    Geri al
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && data.suggestions.length > 0 && (
        <>
          <h2>Silinen malzeme ve opsiyonlar</h2>
          <table className="table">
            <tbody>
              {data.suggestions.map((row) => (
                <tr key={`${row.productType}-${row.kind}-${row.value}`}>
                  <td>{row.value}</td>
                  <td className="muted">{row.productTypeLabel}</td>
                  <td className="number">{row.removed}</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => forget({ scope: 'suggestion', productType: row.productType, kind: row.kind, value: row.value })}
                    >
                      <Undo2 size={15} />
                      Geri al
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Page>
  );
}

// ---- Modeller ------------------------------------------------------------------------------------------------------

interface ProviderSettings {
  localOnlyMode: boolean;
  providers: { name: string; configured: boolean; circuit: 'closed' | 'open' | 'half_open' }[];
  tasks: {
    taskKey: string;
    label: string;
    chain: { id: string; label: string; enabled: boolean; providerConfigured: boolean }[];
    eligibleModels: { id: string; label: string }[];
  }[];
}

export function Models() {
  const { data, error, reload } = useLoad<ProviderSettings>('/settings/providers');
  const [actionError, setActionError] = useState<string | null>(null);
  const setPrimary = (taskKey: string, model: string) => {
    setActionError(null);
    put(`/settings/providers/${taskKey}`, { model })
      .then(reload)
      .catch((err: unknown) => setActionError(err instanceof ApiError ? err.message : 'Model değiştirilemedi.'));
  };
  return (
    <Page title="Modeller" intro="Her görevin birincil modeli. Cevap vermezse sıradaki model devreye girer." error={error ?? actionError}>
      {!data && !error && <Loading />}
      {data && (
        <>
          <p className="muted">
            {data.providers.map((p) => `${p.name === 'gemini' ? 'Gemini' : 'Groq'}: ${!p.configured ? 'anahtar yok' : p.circuit === 'closed' ? 'çalışıyor' : 'geçici olarak kapalı'}`).join(' · ')}
            {data.localOnlyMode && ' · Yerel mod açık, AI kullanılmıyor'}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Görev</th>
                <th>Birincil model</th>
                <th>Yedekler</th>
              </tr>
            </thead>
            <tbody>
              {data.tasks.map((task) => (
                <tr key={task.taskKey}>
                  <td>{task.label}</td>
                  <td>
                    <select aria-label={`${task.label} birincil model`} value={task.chain[0]?.id} onChange={(e) => setPrimary(task.taskKey, e.target.value)}>
                      {task.eligibleModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="muted">{task.chain.slice(1).map((c) => c.label).join(', ') || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Page>
  );
}
