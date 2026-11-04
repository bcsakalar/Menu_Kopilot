import { useState } from 'react';
import { formatCard, formatCards, formatGroup, groupRule, priceLabel } from '../format';
import type { Answer, Card, RunResult, Section } from '../types';
import { CopyButton } from './ui';

const ANSWERS: { answer: Answer; status: Card['status']; label: string }[] = [
  { answer: 'accept', status: 'accepted', label: 'Evet' },
  { answer: 'later', status: 'later', label: 'Düşünecek' },
  { answer: 'skip', status: 'skipped', label: 'Hayır' },
];

function AnswerButtons({ card, onAnswer }: { card: Card; onAnswer: (card: Card, answer: Answer) => void }) {
  return (
    <div className="answers" role="group" aria-label={`${card.name}: restoranın cevabı`}>
      {ANSWERS.map(({ answer, status, label }) => (
        <button key={answer} type="button" className={`answer ${status}`} aria-pressed={card.status === status} onClick={() => onAnswer(card, answer)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Column({ title, copy, children }: { title: string; copy: string; children: React.ReactNode }) {
  return (
    <div className="detail-column">
      <div className="detail-title">
        <span>{title}</span>
        <CopyButton text={copy} label={`${title} kopyala`} compact />
      </div>
      {children}
    </div>
  );
}

function Details({ card }: { card: Card }) {
  const { optionGroups, removableIngredients: removable, extraIngredients: extras } = card;
  if (optionGroups.length === 0 && removable.length === 0 && extras.length === 0) return null;
  return (
    <div className="details">
      {optionGroups.length > 0 && (
        <Column title="Opsiyonlar" copy={optionGroups.map(formatGroup).join('\n')}>
          {optionGroups.map((group) => (
            <div key={group.name} className="group">
              <div className="group-name">
                {group.name} <small>{groupRule(group)}</small>
              </div>
              <div className="group-options">{group.options.map((o) => o.name).join(', ')}</div>
              <small>{priceLabel(group)}</small>
            </div>
          ))}
        </Column>
      )}
      {removable.length > 0 && (
        <Column title="Çıkarılabilir" copy={removable.join('\n')}>
          <p>{removable.join(', ')}</p>
        </Column>
      )}
      {extras.length > 0 && (
        <Column title="Ekstra malzeme" copy={extras.join('\n')}>
          <p>{extras.join(', ')}</p>
        </Column>
      )}
    </div>
  );
}

function ProductRow({ card, onAnswer }: { card: Card; onAnswer?: ((card: Card, answer: Answer) => void) | undefined }) {
  const title = card.section === 'option' ? (card.targetName ?? card.name) : card.name;
  return (
    <li className={`card status-${card.status}`}>
      <div className="card-head">
        <div className="card-title">
          <h4>{title}</h4>
          <span className="card-meta">
            {[card.basedOn ? `${card.basedOn} alternatifi` : card.categoryLabel, card.priceRangeHint && `tahmini ${card.priceRangeHint}`, card.portionInfo]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <div className="card-actions">
          <CopyButton text={formatCard(card)} label={`${title} kartını kopyala`} compact />
          {onAnswer && <AnswerButtons card={card} onAnswer={onAnswer} />}
        </div>
      </div>
      {card.shortDescription && <p className="card-description">{card.shortDescription}</p>}
      {card.pitch && <p className="card-pitch">{card.pitch}</p>}
      <Details card={card} />
    </li>
  );
}

function FixRow({ card, onAnswer }: { card: Card; onAnswer?: ((card: Card, answer: Answer) => void) | undefined }) {
  return (
    <li className={`card status-${card.status}`}>
      <div className="card-head">
        <div className="card-title">
          <h4>{card.targetName ?? card.name}</h4>
          <span className="card-meta">{card.reason}</span>
        </div>
        <div className="card-actions">{onAnswer && <AnswerButtons card={card} onAnswer={onAnswer} />}</div>
      </div>
      {card.suggestedValue ? (
        <p className="card-description">
          {card.currentValue} → <strong>{card.suggestedValue}</strong>
        </p>
      ) : null}
    </li>
  );
}

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'new_product', label: 'Yeni ürünler' },
  { key: 'option', label: 'Opsiyon ve malzeme' },
  { key: 'fix', label: 'Düzeltmeler' },
];

/** One analysis in the conversation. Sections are tabs: a 30-card answer must not bury the composer on a call. */
export function RunBlock({ result, onAnswer }: { result: RunResult; onAnswer?: (card: Card, answer: Answer) => void }) {
  const tabs = SECTIONS.map((section) => ({ ...section, cards: result.cards.filter((c) => c.section === section.key) })).filter((s) => s.cards.length > 0);
  const [selected, setSelected] = useState<Section | null>(null);
  const active = tabs.find((tab) => tab.key === selected) ?? tabs[0];

  return (
    <section className="run" aria-label="Analiz sonucu">
      {result.warnings.map((warning) => (
        <p key={warning.code} className="notice">
          {warning.message}
        </p>
      ))}
      {active && (
        <>
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
          <ul className="cards">
            {active.cards.map((card) =>
              card.section === 'fix' ? <FixRow key={card.id} card={card} onAnswer={onAnswer} /> : <ProductRow key={card.id} card={card} onAnswer={onAnswer} />,
            )}
          </ul>
        </>
      )}
    </section>
  );
}
