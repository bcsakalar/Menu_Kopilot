import { AlertTriangle, Check, ChevronDown, Copy, Download, Eraser } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { checkLine, WARNING_LABEL } from './text/checks';
import { explainChanges, REASON_LABEL, wordDiff, type Change } from './text/diff';
import { formatLine, formatText, type TextKind } from './text/format';
import { useLexicon } from './useLexicon';
import { downloadRows } from './download';
import { describeNames, type DescriptionIdea } from './pool';

/** Names looked up in the pool at once while typing; a longer list belongs in the Excel tool. */
const POOL_NAMES = 20;
const SHOWN_CHANGES = 40;

/**
 * Metin düzeltme (D-218): a product name, a store name or a description, fixed by the panel's writing rules as it is
 * typed. A paste is fixed and copied back at once, so the next paste into the panel is already right.
 */

const KINDS: { key: TextKind; label: string; placeholder: string }[] = [
  { key: 'name', label: 'Ürün ve mağaza adı', placeholder: 'Ürün, mağaza ya da şube adlarını yaz veya yapıştır; her satır ayrı düzeltilir.\nörn. cig kofte durum 2 adet' },
  { key: 'description', label: 'Açıklama', placeholder: 'Ürün açıklamasını yaz veya yapıştır.\nörn. ÖZEL SOSLU IZGARA TAVUK, PİLAV İLE SERVİS EDİLİR' },
];

/** The rules, each shown on a live example: the table can never say something the tool does not do. */
const RULES: { kind: TextKind; rule: string; example: string }[] = [
  { kind: 'name', rule: 'Her kelimenin ilk harfi büyük', example: 'trüflü hamburger ve patates' },
  { kind: 'name', rule: 'Türkçe karakterler tamamlanır', example: 'sogan, yag, izgara' },
  { kind: 'name', rule: 'Birimler küçük: gr, kg, ml, cl, lt', example: '200 GR, 1 KG, 33 CL' },
  { kind: 'name', rule: 'Miktar ve birim parantez içine alınır', example: 'KOLA 330ML' },
  { kind: 'name', rule: 'Ondalık virgülle yazılır', example: 'su 0.5 lt' },
  { kind: 'name', rule: 'Adet ve porsiyon büyük harfle, parantez içinde', example: 'lahmacun 2 adet' },
  { kind: 'name', rule: 'Porsiyon ürün adıdır: parantez içinde ve büyük harfle', example: 'urfa porsiyon' },
  { kind: 'name', rule: 'Miktar adın sonuna gelir', example: '1 kg baklava' },
  { kind: 'name', rule: 'Sayı eki kesme işaretiyle, küçük ve ses uyumuna göre', example: "7'Li, 10'LU, 6 li set" },
  { kind: 'name', rule: 'Dağıtma eki: 3\'er, 2\'şer (ikişer), 6\'şar', example: '3 Er Adet, 2 Ar Adet' },
  { kind: 'name', rule: 'Bitişik yazılan kelimeler ayrılır', example: 'kaşarlıtost' },
  { kind: 'name', rule: 'Yazım hatası düzeltilir', example: 'patatez kızartması' },
  { kind: 'name', rule: 'Mağaza ve şube adı ayracı boşluklu tire', example: 'mutlu waffle -urfa dürüm' },
  { kind: 'name', rule: 'Kısaltma ve marka bozulmaz', example: 'XL MENÜ coca cola' },
  { kind: 'name', rule: '/, + ve & her zaman boşluklu', example: 'coca/cola, 1/2, çorba+pilav' },
  { kind: 'name', rule: 'Parantezden önce boşluk', example: 'cookie(5 adet)' },
  { kind: 'name', rule: 'Noktalamadan önce boşluk yok, sonra var', example: 'merhaba,nasılsın?iyi! elma , armut .' },
  { kind: 'description', rule: 'Yalnızca cümle başı büyük, sonunda nokta', example: 'ÖZEL SOSLU IZGARA TAVUK, PİLAV İLE SERVİS EDİLİR' },
  { kind: 'description', rule: 'Özel adlar büyük kalır', example: 'antep fıstıklı baklava' },
  { kind: 'description', rule: 'Noktalamadan sonra boşluk, önce boşluk yok', example: 'taze domates , biber.yanında ayran' },
  { kind: 'description', rule: 'Yazım hatası düzeltilir', example: 'şeklde servis edilir' },
];

interface Settings {
  kind: TextKind;
  smart: boolean;
  copyOnPaste: boolean;
  /** Text copied anywhere else is fixed and put back on the clipboard when the rep comes back to this tab. */
  autoClipboard: boolean;
}

const SETTINGS_KEY = 'mk-text-tool';

function readSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
    return {
      kind: saved.kind === 'description' ? 'description' : 'name',
      smart: saved.smart !== false,
      copyOnPaste: saved.copyOnPaste !== false,
      autoClipboard: saved.autoClipboard !== false,
    };
  } catch {
    return { kind: 'name', smart: true, copyOnPaste: true, autoClipboard: true };
  }
}

export function TextTool() {
  const { lexicon, words } = useLexicon();
  const [settings, setSettings] = useState<Settings>(readSettings);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  /** The last clipboard text seen or written: the tool's own fixed text is not fixed again. */
  const lastClip = useRef<string | null>(null);

  const update = (patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // A private window: the settings simply do not stay.
      }
      return next;
    });
  };

  const options = useMemo(() => ({ kind: settings.kind, smart: settings.smart, lexicon }), [settings.kind, settings.smart, lexicon]);
  const result = useMemo(() => formatText(text, options), [text, options]);
  const hasText = text.trim().length > 0;
  const warnings = useMemo(() => result.lines.map((line) => checkLine(line.before)), [result]);
  const warned = warnings.filter((found) => found.length > 0).length;

  // Every fix with its rule, the same fix counted once however many lines it is on (D-220).
  const changes = useMemo(() => {
    const seen = new Map<string, Change & { count: number }>();
    for (const line of result.lines) {
      for (const change of explainChanges(line.before, line.after)) {
        const key = `${change.from}→${change.to}`;
        const known = seen.get(key);
        if (known) known.count += 1;
        else seen.set(key, { ...change, count: 1 });
      }
    }
    return [...seen.values()];
  }, [result]);

  // Descriptions the team already approved for these names (D-220): looked up a moment after the typing stops.
  const names = useMemo(
    () => (settings.kind === 'name' ? [...new Set(result.lines.map((line) => line.after.trim()).filter(Boolean))].slice(0, POOL_NAMES) : []),
    [result, settings.kind],
  );
  const namesKey = names.join('\n');
  const [ideas, setIdeas] = useState<{ name: string; ideas: DescriptionIdea[] }[]>([]);
  useEffect(() => {
    if (names.length === 0) {
      setIdeas([]);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      describeNames(names)
        .then((found) => {
          if (live) setIdeas(names.map((name, index) => ({ name, ideas: found[index] ?? [] })));
        })
        // The pool is a help, not a step: without it the tool works as before.
        .catch(() => {
          if (live) setIdeas([]);
        });
    }, 600);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // namesKey stands for names: a new array with the same names must not look the pool up again.
  }, [namesKey]);
  const withIdeas = ideas.filter((item) => item.ideas.length > 0);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 2200);
  };

  const copy = async (value = result.text, message = 'Düzeltilmiş metin panoya kopyalandı') => {
    if (value.trim() === '') return;
    try {
      lastClip.current = value;
      await navigator.clipboard.writeText(value);
      flash(message);
    } catch {
      flash('Kopyalanamadı; metni seçip Ctrl+C ile kopyala');
    }
  };

  // The clipboard, fixed in the background (D-219): the rep copies a name in the panel or a seller's file, comes back to this
  // tab, and the clipboard already holds the fixed text — nothing to paste here first. Off if the browser does not allow it.
  useEffect(() => {
    if (!settings.autoClipboard) return;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== 'visible' || !document.hasFocus()) return;
      busy = true;
      try {
        const clip = await navigator.clipboard.readText();
        // A huge clipboard (a whole document) is not a menu text: left alone.
        if (clip.trim() === '' || clip === lastClip.current || clip.length > 200_000) return;
        const fixed = formatText(clip, options).text;
        lastClip.current = fixed;
        setText(clip);
        if (fixed !== clip) {
          await navigator.clipboard.writeText(fixed);
          flash('Panodaki metin düzeltildi; yapıştırmaya hazır');
        }
      } catch {
        update({ autoClipboard: false });
        flash('Tarayıcı panoyu okumaya izin vermedi; otomatik pano kapatıldı');
      } finally {
        busy = false;
      }
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    void check();
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
    // update and flash are stable enough: re-subscribing on every render would read the clipboard each keystroke.
  }, [settings.autoClipboard, options]);

  const lines = text === '' ? 0 : text.split(/\r?\n/u).filter((line) => line.trim() !== '').length;

  return (
    <section className="admin-page tool-page">
      <header className="page-head">
        <div>
          <h1>Metin düzeltme</h1>
          <p className="admin-intro">Yazdıkça panelin yazım kurallarına göre düzeltilir. Yapay zekâ kullanılmaz; ürün adları yalnızca havuzdaki onaylı açıklamaları bulmak için sunucuya sorulur, saklanmaz.</p>
        </div>
      </header>

      <div className="tool-controls">
        <div className="segmented" role="group" aria-label="Metin türü">
          {KINDS.map((kind) => (
            <button key={kind.key} type="button" aria-pressed={settings.kind === kind.key} onClick={() => update({ kind: kind.key })}>
              {kind.label}
            </button>
          ))}
        </div>
        <label className="switch" title="Türkçe karakter, yazım hatası ve bitişik kelime düzeltmesi">
          <input type="checkbox" checked={settings.smart} onChange={(e) => update({ smart: e.target.checked })} />
          <span aria-hidden />
          Akıllı düzeltme
        </label>
        <label className="switch" title="Başka yerde kopyaladığın metin bu sekmeye dönünce düzeltilip panoya geri yazılır">
          <input type="checkbox" checked={settings.autoClipboard} onChange={(e) => update({ autoClipboard: e.target.checked })} />
          <span aria-hidden />
          Otomatik pano
        </label>
        <label className="switch" title="Yapıştırdığın metnin düzeltilmiş hâli otomatik panoya kopyalanır">
          <input type="checkbox" checked={settings.copyOnPaste} onChange={(e) => update({ copyOnPaste: e.target.checked })} />
          <span aria-hidden />
          Yapıştırınca kopyala
        </label>
      </div>

      <div className="text-panes">
        <div className="text-pane">
          <div className="pane-head">
            <label htmlFor="text-input">Metin</label>
            <span className="muted small">{lines} satır</span>
          </div>
          <textarea
            id="text-input"
            ref={input}
            value={text}
            autoFocus
            spellCheck={false}
            placeholder={KINDS.find((k) => k.key === settings.kind)?.placeholder}
            onPaste={(e) => {
              // Fixed and copied back inside the paste itself, while the browser still counts it as the rep's action: the
              // next Ctrl+V into the panel already carries the fixed text. Only what was pasted is copied.
              const pastedText = e.clipboardData.getData('text');
              if (settings.copyOnPaste && pastedText.trim() !== '') void copy(formatText(pastedText, options).text, 'Yapıştırdığın metin düzeltildi ve panoya kopyalandı');
            }}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void copy();
              }
            }}
          />
        </div>
        <div className="text-pane">
          <div className="pane-head">
            <span className="pane-title">Düzeltilmiş</span>
            {hasText && (
              <span className="muted small">
                {result.changed > 0 ? `${result.changed} satır düzeltildi` : 'Değişiklik yok'}
                {warned > 0 && <span className="warn-count"> · {warned} satıra bak</span>}
              </span>
            )}
            <button type="button" className="button primary small" disabled={!hasText} onClick={() => void copy()}>
              <Copy size={15} aria-hidden />
              Kopyala
            </button>
          </div>
          <div className="text-output" aria-live="polite" aria-label="Düzeltilmiş metin">
            {!hasText && <p className="muted">Düzeltilmiş hâli burada görünür. Değişen kelimeler işaretlenir.</p>}
            {hasText &&
              result.lines.map((line, index) => (
                <Fragment key={index}>
                  <p className="out-line">
                    {line.after === ''
                      ? ' '
                      : wordDiff(line.before, line.after).map((part, i) => (
                          <span key={i} className={part.change === 'fix' ? 'fixed-word' : undefined}>
                            {i > 0 ? ' ' : ''}
                            {part.text}
                          </span>
                        ))}
                  </p>
                  {warnings[index]!.length > 0 && (
                    <p className="line-warning">
                      <AlertTriangle size={13} aria-hidden />
                      {warnings[index]!.map((warning) => WARNING_LABEL[warning]).join(' · ')}
                    </p>
                  )}
                </Fragment>
              ))}
          </div>
        </div>
      </div>

      <div className="tool-actions">
        <button type="button" className="button ghost" disabled={!hasText} onClick={() => void downloadRows('metin-duzeltme', ['Önce', 'Sonra'], result.lines.filter((l) => l.before.trim() !== '').map((l) => [l.before.trim(), l.after]))}>
          <Download size={15} aria-hidden />
          Excel olarak indir
        </button>
        <button
          type="button"
          className="button ghost"
          disabled={!hasText}
          onClick={() => {
            setText('');
            input.current?.focus();
          }}
        >
          <Eraser size={15} aria-hidden />
          Temizle
        </button>
        <span className="muted small tool-meta">Ctrl+Enter: kopyala · Sözlük: {words.toLocaleString('tr-TR')} kelime</span>
        {notice && (
          <span className="tool-notice" role="status">
            <Check size={15} aria-hidden />
            {notice}
          </span>
        )}
      </div>

      {(changes.length > 0 || withIdeas.length > 0) && (
        <div className="tool-insights">
          {changes.length > 0 && (
            <section className="panel insight">
              <div className="fix-head">
                <h2>Ne değişti</h2>
                <span className="muted small">Her düzeltmenin kuralı</span>
              </div>
              <ul className="change-list">
                {changes.slice(0, SHOWN_CHANGES).map((change) => (
                  <li key={`${change.from}→${change.to}`}>
                    <span className="change-from">{change.from}</span>
                    <span aria-hidden>→</span>
                    <span className="sr-only">yerine</span>
                    <strong>{change.to}</strong>
                    <span className="reason">{REASON_LABEL[change.reason]}</span>
                    {change.count > 1 && <span className="muted small">×{change.count}</span>}
                  </li>
                ))}
              </ul>
              {changes.length > SHOWN_CHANGES && <p className="muted small">ve {changes.length - SHOWN_CHANGES} düzeltme daha</p>}
            </section>
          )}
          {withIdeas.length > 0 && (
            <section className="panel insight">
              <div className="fix-head">
                <h2>Havuzdan açıklama</h2>
                <span className="muted small">Ekibin onayladığı şablonlardan; kopyalayıp panele yapıştır</span>
              </div>
              <ul className="idea-list">
                {withIdeas.map((item) => (
                  <li key={item.name}>
                    <strong className="idea-for">{item.name}</strong>
                    <Idea idea={item.ideas[0]!} onCopy={(value) => void copy(value, 'Açıklama panoya kopyalandı')} />
                    {item.ideas.length > 1 && (
                      <details>
                        <summary>{item.ideas.length - 1} öneri daha</summary>
                        {item.ideas.slice(1).map((idea) => (
                          <Idea key={idea.description} idea={idea} onCopy={(value) => void copy(value, 'Açıklama panoya kopyalandı')} />
                        ))}
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <section className="panel rules">
        <button type="button" className="rules-toggle" aria-expanded={rulesOpen} onClick={() => setRulesOpen((open) => !open)}>
          <span>Kurallar</span>
          <ChevronDown size={17} aria-hidden />
        </button>
        {rulesOpen && (
          <table className="mini-table rules-table">
            <thead>
              <tr>
                <th>Kural</th>
                <th>Yazılan</th>
                <th>Düzeltilen</th>
              </tr>
            </thead>
            <tbody>
              {RULES.map((rule) => (
                <tr key={rule.rule + rule.kind}>
                  <td>
                    {rule.rule}
                    <span className="muted small"> · {rule.kind === 'name' ? 'ad' : 'açıklama'}</span>
                  </td>
                  <td className="mono">{rule.example}</td>
                  <td className="mono strong">{formatLine(rule.example, { kind: rule.kind, smart: true, lexicon })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}

function Idea({ idea, onCopy }: { idea: DescriptionIdea; onCopy: (value: string) => void }) {
  return (
    <div className="idea">
      <p>{idea.description}</p>
      <div className="idea-meta">
        <span className="muted small">
          {idea.name}
          {idea.score < 1 ? ` · %${Math.round(idea.score * 100)} benzer` : ' · aynı ürün'}
        </span>
        <button type="button" className="button ghost small" onClick={() => onCopy(idea.description)}>
          <Copy size={14} aria-hidden />
          Kopyala
        </button>
      </div>
    </div>
  );
}
