import { Info } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { formatCard, formatCards, formatGroup } from '../format';
import type { Card, RunResult, Section } from '../types';
import { CopyButton } from './ui';

/** Says nothing the rep can act on during the call: the header already shows how far the menu is from its target. */
const QUIET_WARNINGS: ReadonlySet<string> = new Set(['target_unreachable']);

function SpecRow({ label, copy, children }: { label: string; copy: string; children: ReactNode }) {
  return (
    <div className="spec-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
      <dd className="spec-copy">
        <CopyButton text={copy} label={`${label} kopyala`} compact />
      </dd>
    </div>
  );
}

function ProductCard({ card }: { card: Card }) {
  const title = card.section === 'option' ? (card.targetName ?? card.name) : card.name;
  const meta = [card.basedOn ? `${card.basedOn} alternatifi` : card.categoryLabel, card.portionInfo, card.priceRangeHint && `tahmini ${card.priceRangeHint}`].filter(Boolean).join(' · ');
  const { optionGroups: groups, removableIngredients: removable, extraIngredients: extras } = card;
  return (
    <li className="card">
      <div className="card-head">
        <div className="card-title">
          <h4>{title}</h4>
          {meta && <p className="card-meta">{meta}</p>}
        </div>
        <CopyButton text={formatCard(card)} label={`${title} kartını kopyala`} compact />
      </div>
      {card.pitch && (
        <p className="card-pitch">
          <span>Söyle</span>
          {card.pitch}
        </p>
      )}
      <dl className="spec">
        {card.shortDescription && (
          <SpecRow label="Açıklama" copy={card.shortDescription}>
            {card.shortDescription}
          </SpecRow>
        )}
        {groups.length > 0 && (
          <SpecRow label="Opsiyon" copy={groups.map(formatGroup).join('\n')}>
            {groups.map((group) => (
              <p key={group.name} className="spec-group">
                <b>{group.name}</b> {group.options.map((o) => o.name).join(', ')}
                {group.isRequired && <small>zorunlu</small>}
              </p>
            ))}
          </SpecRow>
        )}
        {removable.length > 0 && (
          <SpecRow label="Çıkarılabilir" copy={removable.join('\n')}>
            {removable.join(', ')}
          </SpecRow>
        )}
        {extras.length > 0 && (
          <SpecRow label="Ekstra" copy={extras.join('\n')}>
            {extras.join(', ')}
          </SpecRow>
        )}
      </dl>
    </li>
  );
}

function FixCard({ card }: { card: Card }) {
  return (
    <li className="card">
      <div className="card-head">
        <div className="card-title">
          <h4>{card.targetName ?? card.name}</h4>
          <p className="card-meta">{card.reason}</p>
        </div>
        <CopyButton text={formatCard(card)} label={`${card.targetName ?? card.name} düzeltmesini kopyala`} compact />
      </div>
      {card.suggestedValue && (
        <p className="card-fix">
          {card.currentValue} → <b>{card.suggestedValue}</b>
        </p>
      )}
    </li>
  );
}

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'new_product', label: 'Yeni ürünler' },
  { key: 'option', label: 'Opsiyon ve malzeme' },
  { key: 'fix', label: 'Düzeltmeler' },
];

/** One analysis in the conversation. Sections are tabs: a 30-card answer must not bury the composer on a call. */
export function RunBlock({ result }: { result: RunResult }) {
  const tabs = SECTIONS.map((section) => ({ ...section, cards: result.cards.filter((c) => c.section === section.key) })).filter((s) => s.cards.length > 0);
  const [selected, setSelected] = useState<Section | null>(null);
  const active = tabs.find((tab) => tab.key === selected) ?? tabs[0];
  // With no card there is nothing to qualify: the answer above already says what happened.
  if (!active) return null;

  return (
    <section className="run" aria-label="Analiz sonucu">
      <div className="tabs" role="tablist">
        {tabs.map((tab) => (
          <button key={tab.key} type="button" role="tab" aria-selected={tab.key === active.key} className="tab" onClick={() => setSelected(tab.key)}>
            {tab.label} <span>{tab.cards.length}</span>
          </button>
        ))}
        <span className="tabs-end">
          <CopyButton text={formatCards(active.cards)} label="Tümünü kopyala" />
        </span>
      </div>
      {result.warnings
        .filter((warning) => !QUIET_WARNINGS.has(warning.code))
        .map((warning) => (
          <p key={warning.code} className="run-note">
            <Info size={14} aria-hidden />
            {warning.message}
          </p>
        ))}
      <ul className="cards">{active.cards.map((card) => (card.section === 'fix' ? <FixCard key={card.id} card={card} /> : <ProductCard key={card.id} card={card} />))}</ul>
    </section>
  );
}
