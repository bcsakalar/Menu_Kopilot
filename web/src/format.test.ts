import { describe, expect, it } from 'vitest';
import { parseFrames } from './api';
import { formatCard } from './format';
import type { Card } from './types';

describe('parseFrames', () => {
  it('reads whole frames and keeps an unfinished one for the next chunk', () => {
    const first = parseFrames(': connected\n\nid: 1\nevent: run\ndata: {"type":"run"}\n\nid: 2\nevent: me');
    expect(first.events).toEqual([{ type: 'run' }]);
    const second = parseFrames(`${first.rest}nu\ndata: {"type":"menu"}\n\n`);
    expect(second.events).toEqual([{ type: 'menu' }]);
    expect(second.rest).toBe('');
  });
});

describe('formatCard', () => {
  const card: Card = {
    id: '1',
    runId: 'r',
    section: 'option',
    name: 'Adana Kebap',
    targetName: 'Adana',
    categoryLabel: 'Ana Yemek',
    source: 'db',
    shortDescription: 'Zırh kıymasından acılı kebap',
    portionInfo: '',
    priceRangeHint: '',
    reason: '',
    optionGroups: [
      {
        name: 'Porsiyon',
        selectionType: 'single',
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        options: [
          { name: 'Yarım', priceMode: 'sets_base' },
          { name: 'Tam', priceMode: 'sets_base' },
        ],
      },
    ],
    removableIngredients: ['Soğan'],
    extraIngredients: ['Ekstra Lavaş'],
    fixKind: null,
    currentValue: null,
    suggestedValue: null,
    basedOn: null,
    pitch: '',
  };

  it('titles the card with the menu spelling and skips empty sections', () => {
    expect(formatCard(card)).toBe(
      [
        'Adana',
        'Açıklama: Zırh kıymasından acılı kebap',
        'Opsiyonlar:',
        '- Porsiyon (tek seçim, zorunlu): Yarım [fiyatı belirler], Tam [fiyatı belirler]',
        'Çıkarılabilir: Soğan',
        'Ekstra: Ekstra Lavaş',
      ].join('\n'),
    );
  });
});
