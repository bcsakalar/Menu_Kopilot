import { Check, CircleHelp, X } from 'lucide-react';
import type { Quality, ShareRule } from '../types';

type State = 'ok' | 'miss' | 'unknown';

interface Rule {
  label: string;
  value: string;
  state: State;
  /** What the rule asks, for the tooltip and screen readers. */
  hint: string;
}

const percent = (value: number) => `%${Math.round(value * 100)}`;
const stateOf = (ok: boolean | null): State => (ok === null ? 'unknown' : ok ? 'ok' : 'miss');

function share(label: string, rule: ShareRule, what: string): Rule {
  return {
    label,
    value: rule.known === 0 ? '?' : percent(rule.present / Math.max(1, rule.total)),
    state: stateOf(rule.ok),
    hint:
      rule.ok !== null
        ? `${what} en az ${percent(rule.share)} olmalı: ${rule.present}/${rule.total} ürün.`
        : rule.known === 0
          ? `${what} en az ${percent(rule.share)} olmalı. Bu görüntüde görünmüyor; panelin ekran görüntüsünü yapıştırırsan kontrol ederim.`
          : // Most of the menu was visible; only the typed or unreadable products are open, and they decide the rule.
            `${what} en az ${percent(rule.share)} olmalı: ${rule.present}/${rule.total} ürün; ${rule.total - rule.known} ürünün durumu görünmüyor, panelden kontrol et.`,
  };
}

function rules(quality: Quality): Rule[] {
  return [
    {
      label: 'Ürün',
      value: `${quality.products.current}/${quality.products.target}`,
      state: stateOf(quality.products.ok),
      hint: `Mutfak türünün minimum ürün sayısı ${quality.products.target}; içecekler dahil.`,
    },
    {
      label: 'İçecek',
      value: `${quality.drinks.current}/${quality.drinks.target}`,
      state: stateOf(quality.drinks.ok),
      hint: `İçecek kategorisi olmadan açılmaz; en az ${quality.drinks.target} içecek.`,
    },
    share('Açıklama', quality.descriptions, 'Açıklamalı ürünler'),
    share('Fotoğraf', quality.images, 'Fotoğraflı ürünler'),
    {
      label: 'Yazım',
      value: quality.writing.ok === false ? `${quality.writing.names.length} ürün` : quality.writing.ok ? 'düzgün' : '?',
      state: stateOf(quality.writing.ok),
      hint:
        quality.writing.ok === false
          ? `Tamamı büyük ya da küçük harfle yazılmış: ${quality.writing.names.join(', ')}.`
          : 'Ürün adları tamamen büyük ya da küçük harf olmamalı, imla kurallarına uymalı.',
    },
  ];
}

const ICON: Record<State, typeof Check> = { ok: Check, miss: X, unknown: CircleHelp };

/** The opening rules at a glance: green met, red missed, grey not visible on this input. */
export function OpeningChecklist({ quality }: { quality: Quality }) {
  return (
    <div className="checklist">
      <ul aria-label="Açılış kuralları">
        {rules(quality).map((rule) => {
          const Icon = ICON[rule.state];
          return (
            <li key={rule.label} className={`rule ${rule.state}`} title={rule.hint}>
              <Icon size={13} aria-hidden strokeWidth={2.6} />
              <span>{rule.label}</span>
              <b>{rule.value}</b>
              <span className="sr-only">{rule.hint}</span>
            </li>
          );
        })}
      </ul>
      {quality.extraCuisines.length > 0 && (
        <p className="extra-cuisines">
          Ek mutfak türü: <b>{quality.extraCuisines.map((c) => c.name).join(', ')}</b>
        </p>
      )}
    </div>
  );
}
