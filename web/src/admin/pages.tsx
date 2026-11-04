import { ArrowLeft, Check, Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, patch, post, put } from '../api';
import { RunBlock } from '../chat/RunBlock';
import { RichText } from '../chat/ui';
import { groupRule, timeLabel } from '../format';
import type { Conversation, OptionGroup } from '../types';

/** One fetch with its loading and error states; `reload` after a write. */
function useLoad<T>(path: string): { data: T | null; error: string | null; reload: () => void } {
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

function Page({ title, intro, children, error }: { title: string; intro?: string; children: ReactNode; error?: string | null }) {
  return (
    <section className="admin-page">
      <h1>{title}</h1>
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

const Loading = () => <div className="skeleton" aria-label="Yükleniyor" />;

// ---- Genel bakış ---------------------------------------------------------------------------------------------------

interface UsageData {
  byModel: { model: string; label: string; calls: number; failed: number; avgLatencyMs: number }[];
  errors: { code: string; count: number }[];
}

interface OverviewData {
  visitors: number;
  conversations: number;
  runs: number;
  cards: { total: number; accepted: number; rejected: number; later: number };
  llm: { calls: number; failed: number; tokens: number };
  drafts: number;
  topCuisines: { name: string; runs: number }[];
  site: { callsToday: number; dailyCalls: number };
}

export function Overview() {
  const [range, setRange] = useState<'today' | 'month'>('today');
  const { data, error } = useLoad<OverviewData>(`/admin/overview?range=${range}`);
  const { data: usage } = useLoad<UsageData>(`/usage/summary?range=${range}`);
  const answered = data ? data.cards.accepted + data.cards.rejected + data.cards.later : 0;
  const rows: [string, string | number][] = data
    ? [
        ['Temsilci', data.visitors],
        ['Görüşme', data.conversations],
        ['Analiz', data.runs],
        ['Önerilen kart', data.cards.total],
        ['Evet oranı', answered ? `%${Math.round((data.cards.accepted / answered) * 100)} (${data.cards.accepted}/${answered})` : 'cevap yok'],
        ['AI çağrısı', data.llm.failed ? `${data.llm.calls} (${data.llm.failed} hatalı)` : data.llm.calls],
        ['Token', data.llm.tokens.toLocaleString('tr-TR')],
      ]
    : [];
  return (
    <Page title="Genel bakış" error={error}>
      <div className="segmented" role="group" aria-label="Dönem">
        <button type="button" aria-pressed={range === 'today'} onClick={() => setRange('today')}>
          Bugün
        </button>
        <button type="button" aria-pressed={range === 'month'} onClick={() => setRange('month')}>
          Bu ay
        </button>
      </div>
      {!data && !error && <Loading />}
      {data && (
        <div className="overview">
          <table className="facts">
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <h2>Site kotası</h2>
            <p>
              Bugün {data.site.callsToday} / {data.site.dailyCalls} AI çağrısı. Dolunca öneriler yalnızca şablon havuzundan gelir.
            </p>
            {data.drafts > 0 && <p>Onay bekleyen {data.drafts} yeni ürün var; Şablon havuzundan bakabilirsin.</p>}
            <h2>En çok çalışılan mutfaklar</h2>
            {data.topCuisines.length === 0 ? (
              <p>Bu dönemde analiz yok.</p>
            ) : (
              <ol className="plain-list">
                {data.topCuisines.map((c) => (
                  <li key={c.name}>
                    {c.name} <span>{c.runs}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
      {usage && usage.byModel.length > 0 && (
        <>
          <h2>Modeller</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Model</th>
                <th className="number">Çağrı</th>
                <th className="number">Hata</th>
                <th className="number">Ortalama süre</th>
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
          {usage.errors.length > 0 && <p className="muted">Hatalar: {usage.errors.map((e) => `${e.code} (${e.count})`).join(', ')}</p>}
        </>
      )}
    </Page>
  );
}

// ---- Görüşmeler ----------------------------------------------------------------------------------------------------

interface ConversationRow {
  id: string;
  title: string;
  messages: number;
  visitor: string;
  updatedAt: string;
}

function ConversationView({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, error } = useLoad<Conversation>(`/admin/conversations/${id}`);
  return (
    <Page title={data?.title ?? 'Görüşme'} error={error}>
      <button type="button" className="button ghost" onClick={onBack}>
        <ArrowLeft size={16} />
        Listeye dön
      </button>
      <div className="thread admin-thread">
        {data?.messages.map((message) =>
          message.role === 'user' ? (
            <div key={message.id} className="message user">
              {message.imageCount > 0 && <p className="image-note">{message.imageCount} ekran görüntüsü</p>}
              {message.text && <p>{message.text}</p>}
            </div>
          ) : (
            <div key={message.id} className="message assistant">
              <RichText text={message.text} />
              {message.result && <RunBlock result={message.result} />}
            </div>
          ),
        )}
      </div>
    </Page>
  );
}

export function Conversations() {
  const { data, error } = useLoad<{ data: ConversationRow[] }>('/admin/conversations?limit=100');
  const [open, setOpen] = useState<string | null>(null);
  if (open) return <ConversationView id={open} onBack={() => setOpen(null)} />;
  return (
    <Page title="Görüşmeler" intro="Sitedeki bütün görüşmeler, en yeni üstte. Ekran görüntüleri saklanmaz, yalnızca sayıları görünür." error={error}>
      {!data && !error && <Loading />}
      {data && data.data.length === 0 && <p>Henüz görüşme yok.</p>}
      {data && data.data.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Görüşme</th>
              <th>Tarayıcı</th>
              <th className="number">Mesaj</th>
              <th>Son</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((row) => (
              <tr key={row.id}>
                <td>
                  <button type="button" className="link" onClick={() => setOpen(row.id)}>
                    {row.title}
                  </button>
                </td>
                <td className="muted">{row.visitor}</td>
                <td className="number">{row.messages}</td>
                <td className="muted">{timeLabel(row.updatedAt)}</td>
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
  payload: { description: string; optionGroups: OptionGroup[]; removableIngredients: string[]; extraIngredients: { name: string }[] };
}

const SOURCE_LABEL: Record<Template['source'], string> = { ai: 'AI', user: 'Ekip', imported: 'İçe aktarma', seed: 'Hazır' };

function TemplateDetail({ template }: { template: Template }) {
  const { description, optionGroups, removableIngredients, extraIngredients } = template.payload;
  return (
    <div className="template-detail">
      {description && <p>{description}</p>}
      {optionGroups.map((group) => (
        <p key={group.name}>
          <strong>{group.name}</strong> ({groupRule(group)}): {group.options.map((o) => o.name).join(', ')}
        </p>
      ))}
      {removableIngredients.length > 0 && <p>Çıkarılabilir: {removableIngredients.join(', ')}</p>}
      {extraIngredients.length > 0 && <p>Ekstra: {extraIngredients.map((e) => e.name).join(', ')}</p>}
    </div>
  );
}

export function Templates() {
  const [view, setView] = useState<'true' | 'false'>('true');
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const params = new URLSearchParams({ approved: view, limit: '100', ...(submitted ? { q: submitted } : {}) });
  const { data, error, reload } = useLoad<{ data: Template[]; meta: { total: number } }>(`/templates?${params.toString()}`);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = (action: Promise<unknown>) => {
    setActionError(null);
    action.then(reload).catch((err: unknown) => setActionError(err instanceof ApiError ? err.message : 'İşlem yapılamadı.'));
  };

  return (
    <Page
      title="Şablon havuzu"
      intro="Temsilcilerin Evet dediği yeni ürünler önce onaya düşer. Onayladığın ürün havuza girer ve sonraki önerilerde AI'sız gelir."
      error={error ?? actionError}
    >
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Şablon durumu">
          <button type="button" aria-pressed={view === 'true'} onClick={() => setView('true')}>
            Havuzdakiler
          </button>
          <button type="button" aria-pressed={view === 'false'} onClick={() => setView('false')}>
            Onay bekleyenler
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(query.trim());
          }}
        >
          <input type="search" placeholder="Ürün ara ve Enter'a bas" aria-label="Ürün ara" value={query} onChange={(e) => setQuery(e.target.value)} />
        </form>
      </div>
      {!data && !error && <Loading />}
      {data && data.data.length === 0 && <p>{view === 'false' ? 'Onay bekleyen ürün yok.' : 'Bu aramayla ürün bulunamadı.'}</p>}
      {data && data.data.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Ürün</th>
              <th>Mutfak</th>
              <th>Kaynak</th>
              <th className="number">Kullanım</th>
              <th aria-label="İşlemler" />
            </tr>
          </thead>
          <tbody>
            {data.data.map((template) => (
              <tr key={template.id}>
                <td>
                  <button type="button" className="link" aria-expanded={open === template.id} onClick={() => setOpen(open === template.id ? null : template.id)}>
                    {template.name}
                  </button>
                  {open === template.id && <TemplateDetail template={template} />}
                </td>
                <td className="muted">{template.cuisineName}</td>
                <td className="muted">{SOURCE_LABEL[template.source]}</td>
                <td className="number">{template.usageCount}</td>
                <td className="row-actions">
                  {!template.approved && (
                    <button type="button" className="button ghost" onClick={() => run(patch(`/templates/${template.id}`, { approved: true }))}>
                      <Check size={15} />
                      Onayla
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

// ---- Promptlar -----------------------------------------------------------------------------------------------------

interface PromptRow {
  id: string;
  key: string;
  version: number;
  content: string;
  isActive: boolean;
}

function PromptEditor({ prompt, versions, onSaved }: { prompt: PromptRow; versions: PromptRow[]; onSaved: () => void }) {
  const [content, setContent] = useState(prompt.content);
  const [state, setState] = useState<string | null>(null);
  const act = (action: Promise<unknown>) => {
    action
      .then(() => {
        setState('Kaydedildi, en geç bir dakika içinde devreye girer.');
        onSaved();
      })
      .catch((err: unknown) => setState(err instanceof ApiError ? err.message : 'Kaydedilemedi.'));
  };
  return (
    <div className="editor">
      <h2>{prompt.key}</h2>
      <textarea aria-label="Prompt metni" rows={18} value={content} onChange={(e) => setContent(e.target.value)} />
      <div className="editor-actions">
        <button type="button" className="button primary" disabled={content === prompt.content} onClick={() => act(post('/prompts', { key: prompt.key, content, activate: true }))}>
          Yeni sürüm olarak kaydet
        </button>
        {versions.length > 1 && (
          <select aria-label="Eski sürüme dön" value={prompt.id} onChange={(e) => act(post(`/prompts/${e.target.value}/activate`))}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                Sürüm {v.version}
                {v.isActive ? ' (aktif)' : ''}
              </option>
            ))}
          </select>
        )}
        {state && <span className="muted">{state}</span>}
      </div>
    </div>
  );
}

export function Prompts() {
  const { data, error, reload } = useLoad<{ data: PromptRow[] }>('/prompts');
  const [key, setKey] = useState<string | null>(null);
  const active = data?.data.filter((p) => p.isActive) ?? [];
  const selected = active.find((p) => p.key === key);
  return (
    <Page title="Promptlar" intro="Modellere giden metinler. Kaydetmek yeni sürüm açar, eskisi silinmez." error={error}>
      {!data && !error && <Loading />}
      {data && (
        <div className="split">
          <ul className="prompt-list">
            {active.map((prompt) => (
              <li key={prompt.id}>
                <button type="button" className={prompt.key === key ? 'active' : ''} onClick={() => setKey(prompt.key)}>
                  {prompt.key} <span>v{prompt.version}</span>
                </button>
              </li>
            ))}
          </ul>
          {selected ? (
            <PromptEditor key={selected.id} prompt={selected} versions={data.data.filter((p) => p.key === selected.key)} onSaved={reload} />
          ) : (
            <p className="muted">Düzenlemek için bir prompt seç.</p>
          )}
        </div>
      )}
    </Page>
  );
}
