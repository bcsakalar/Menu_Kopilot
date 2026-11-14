import { Check, ChevronDown, Copy, Download, Eraser } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { wordDiff } from './text/diff';
import { formatLine, formatText, type TextKind } from './text/format';
import { useLexicon } from './useLexicon';
import { downloadRows } from './download';

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
  { kind: 'name', rule: 'Her kelime büyük harfle başlar; "ve", "ile" küçük kalır', example: 'tavuk ve patates dürüm' },
  { kind: 'name', rule: 'Türkçe karakterler tamamlanır', example: 'cig kofte durum' },
  { kind: 'name', rule: 'Birim parantez içinde ve küçük harfle', example: 'KOLA 330ML' },
  { kind: 'name', rule: 'Ondalık virgülle yazılır', example: 'su 0.5 lt' },
  { kind: 'name', rule: 'Adet ve porsiyon büyük harfle, parantez içinde', example: 'lahmacun 2 adet' },
  { kind: 'name', rule: 'Porsiyon ürün adıdır: parantez içinde ve büyük harfle', example: 'urfa porsiyon' },
  { kind: 'name', rule: 'Miktar adın sonuna gelir', example: '1 kg baklava' },
  { kind: 'name', rule: 'Sayı eki kesme işaretiyle ve ses uyumuna göre', example: '6 li set, 2 ser adet' },
  { kind: 'name', rule: 'Bitişik yazılan kelimeler ayrılır', example: 'kaşarlıtost' },
  { kind: 'name', rule: 'Yazım hatası düzeltilir', example: 'patatez kızartması' },
  { kind: 'name', rule: 'Mağaza ve şube adı ayracı boşluklu tire', example: 'mutlu waffle -urfa dürüm' },
  { kind: 'name', rule: 'Kısaltma ve marka bozulmaz', example: 'XL MENÜ coca cola' },
  { kind: 'name', rule: '/, + ve & iki yanında boşluk; kesir bitişik', example: 'ayran/kola 1/2 ekmek' },
  { kind: 'description', rule: 'Yalnızca cümle başı büyük, sonunda nokta', example: 'ÖZEL SOSLU IZGARA TAVUK, PİLAV İLE SERVİS EDİLİR' },
  { kind: 'description', rule: 'Özel adlar büyük kalır', example: 'antep fıstıklı baklava' },
  { kind: 'description', rule: 'Noktalamadan sonra boşluk, önce boşluk yok', example: 'taze domates , biber.yanında ayran' },
  { kind: 'description', rule: 'Yazım hatası düzeltilir', example: 'şeklde servis edilir' },
];

interface Settings {
  kind: TextKind;
  smart: boolean;
  copyOnPaste: boolean;
}

const SETTINGS_KEY = 'mk-text-tool';

function readSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
    return { kind: saved.kind === 'description' ? 'description' : 'name', smart: saved.smart !== false, copyOnPaste: saved.copyOnPaste !== false };
  } catch {
    return { kind: 'name', smart: true, copyOnPaste: true };
  }
}

export function TextTool() {
  const { lexicon, words } = useLexicon();
  const [settings, setSettings] = useState<Settings>(readSettings);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

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

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 2200);
  };

  const copy = async (value = result.text, message = 'Düzeltilmiş metin panoya kopyalandı') => {
    if (value.trim() === '') return;
    try {
      await navigator.clipboard.writeText(value);
      flash(message);
    } catch {
      flash('Kopyalanamadı; metni seçip Ctrl+C ile kopyala');
    }
  };

  const lines = text === '' ? 0 : text.split(/\r?\n/u).filter((line) => line.trim() !== '').length;

  return (
    <section className="admin-page tool-page">
      <header className="page-head">
        <div>
          <h1>Metin düzeltme</h1>
          <p className="admin-intro">Yazdıkça panelin yazım kurallarına göre düzeltilir. Yapay zekâ kullanılmaz, metin bilgisayarından çıkmaz.</p>
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
            {hasText && <span className="muted small">{result.changed > 0 ? `${result.changed} satır düzeltildi` : 'Değişiklik yok'}</span>}
            <button type="button" className="button primary small" disabled={!hasText} onClick={() => void copy()}>
              <Copy size={15} aria-hidden />
              Kopyala
            </button>
          </div>
          <div className="text-output" aria-live="polite" aria-label="Düzeltilmiş metin">
            {!hasText && <p className="muted">Düzeltilmiş hâli burada görünür. Değişen kelimeler işaretlenir.</p>}
            {hasText &&
              result.lines.map((line, index) => (
                <p key={index} className="out-line">
                  {line.after === ''
                    ? ' '
                    : wordDiff(line.before, line.after).map((part, i) => (
                        <span key={i} className={part.change === 'fix' ? 'fixed-word' : undefined}>
                          {i > 0 ? ' ' : ''}
                          {part.text}
                        </span>
                      ))}
                </p>
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
