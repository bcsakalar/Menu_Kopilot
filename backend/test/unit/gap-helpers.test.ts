import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SEED_TEMPLATES } from '../../src/db/seed/templates.js';
import type { TemplatePayload } from '../../src/domain/template.js';
import { GAP_TEXT, joinTr } from '../../src/i18n/tr.js';
import { normalizeTr } from '../../src/lib/normalize-tr.js';
import { assessCompleteness, expectationsFor } from '../../src/modules/gap/completeness.js';
import { dedupePanelItems, mergeFlag } from '../../src/modules/gap/dedupe.js';
import {
  MAX_QUESTIONS,
  buildQuestions,
  cuisineQuestions,
  itemQuestion,
  missingItemQuestion,
} from '../../src/modules/gap/questions.js';
import { type StoredMenuRow, mergeWithStoredMenu } from '../../src/modules/gap/menu-merge.js';
import { MenuIndex, wantedRecommendations } from '../../src/modules/gap/recommend.js';
import {
  type GapItemDto,
  type PanelItem,
  type RecommendationDto,
  panelExtractionSchema,
} from '../../src/modules/gap/schemas.js';

function panelFixture(name: string): PanelItem[] {
  const url = new URL(`../fixtures/llm/panel/${name}.json`, import.meta.url);
  return panelExtractionSchema.parse(JSON.parse(readFileSync(url, 'utf8'))).items;
}

function seed(name: string): TemplatePayload {
  const found = SEED_TEMPLATES.find((t) => t.payload.name === name);
  if (!found) throw new Error(`seed ${name} missing`);
  return found.payload;
}

function panelItem(rawName: string, overrides: Partial<PanelItem> = {}): PanelItem {
  return {
    rawName,
    description: 'absent',
    options: 'absent',
    removables: 'absent',
    sectionText: null,
    confidence: 0.9,
    ...overrides,
  };
}

function gapItem(name: string, overrides: Partial<GapItemDto> = {}): GapItemDto {
  return {
    name,
    normalized: normalizeTr(name),
    flags: { description: 'absent', options: 'absent', removables: 'absent' },
    completeness: 0,
    status: 'incomplete',
    missing: [
      { field: 'description', state: 'absent' },
      { field: 'options', state: 'absent' },
      { field: 'removables', state: 'absent' },
    ],
    typed: false,
    matchedTemplateId: null,
    templateName: null,
    origin: null,
    sectionText: null,
    seenIn: 1,
    ...overrides,
  };
}

const rec = (name: string, importance = 70): RecommendationDto => ({
  name,
  reason: `${name} gerekçesi`,
  importance,
  source: 'db',
  templateId: null,
});

describe('dedupePanelItems (acceptance #6)', () => {
  it('reads the two fixture screenshots as 12 unique items', () => {
    const entries = dedupePanelItems([panelFixture('panel-1'), panelFixture('panel-2')]);
    expect(entries.map((e) => e.name)).toEqual([
      'Adana Kebap',
      'Urfa Kebap',
      'Tavuk Şiş',
      'Lahmacun',
      'Kıymalı Pide',
      'Karışık Pide',
      'Ayran',
      'Künefe',
      'Mercimek Çorbası',
      'İçli Köfte',
      'Şalgam',
      'Çoban Salata',
    ]);
    const byName = new Map(entries.map((e) => [e.name, e]));
    expect(byName.get('Kıymalı Pide')?.seenIn).toBe(2);
    expect(byName.get('Karışık Pide')).toMatchObject({ seenIn: 2, truncated: false, normalized: normalizeTr('Karışık Pide') });
    expect(byName.get('Ayran')?.confidence).toBe(0.95);
    expect(byName.get('Adana Kebap')?.seenIn).toBe(1);
  });

  it('counts an item once even when it repeats inside one screenshot', () => {
    const [entry] = dedupePanelItems([[panelItem('Lahmacun'), panelItem('LAHMACUN', { description: 'present' })]]);
    expect(entry).toMatchObject({ seenIn: 1, flags: { description: 'present', options: 'absent', removables: 'absent' } });
  });

  it('merges clipped names (with or without an ellipsis) into the complete one', () => {
    const entries = dedupePanelItems([
      [panelItem('Mercimek Çor...'), panelItem('İskender Keba')],
      [panelItem('Mercimek Çorbası', { options: 'present' }), panelItem('İskender Kebap')],
    ]);
    expect(entries.map((e) => e.name)).toEqual(['Mercimek Çorbası', 'İskender Kebap']);
    expect(entries[0]?.flags.options).toBe('present');
  });

  it('keeps different products apart and drops unreadable rows', () => {
    const entries = dedupePanelItems([
      [
        panelItem('Kıymalı Pide'),
        panelItem('Kaşarlı Pide'),
        panelItem('Tavuk Şiş'),
        panelItem('Tavuk Şiş Dürüm'),
        panelItem('Bulanık', { confidence: 0.1 }),
      ],
    ]);
    expect(entries.map((e) => e.name)).toEqual(['Kıymalı Pide', 'Kaşarlı Pide', 'Tavuk Şiş', 'Tavuk Şiş Dürüm']);
  });

  it('merges flags by information content', () => {
    expect(mergeFlag('unknown', 'absent')).toBe('absent');
    expect(mergeFlag('absent', 'present')).toBe('present');
    expect(mergeFlag('present', 'unknown')).toBe('present');
  });
});

describe('completeness', () => {
  it('weights description .40, options .35, removables .25 (unknown = half)', () => {
    const all = expectationsFor(undefined);
    expect(assessCompleteness({ description: 'present', options: 'present', removables: 'absent' }, all)).toEqual({
      score: 0.75,
      status: 'incomplete',
      missing: [{ field: 'removables', state: 'absent' }],
    });
    expect(assessCompleteness({ description: 'present', options: 'present', removables: 'unknown' }, all)).toMatchObject({
      score: 0.875,
      status: 'ok',
    });
    expect(assessCompleteness({ description: 'present', options: 'present', removables: 'present' }, all)).toMatchObject({
      score: 1,
      status: 'ok',
      missing: [],
    });
  });

  it('does not expect fields the matched template does not have', () => {
    const ayran = expectationsFor(seed('Ayran'));
    expect(ayran).toEqual({ description: true, options: true, removables: false });
    expect(assessCompleteness({ description: 'present', options: 'absent', removables: 'absent' }, ayran)).toEqual({
      score: 0.533,
      status: 'incomplete',
      missing: [{ field: 'options', state: 'absent' }],
    });
    expect(assessCompleteness({ description: 'present', options: 'present', removables: 'absent' }, ayran).status).toBe('ok');
  });
});

describe('cuisine group questions', () => {
  it('asks natural questions for the platform-style group names and the older ones', () => {
    expect(GAP_TEXT.cuisineGroup('Sos Seçimi')).toBe('Sos seçimi var mı?');
    expect(GAP_TEXT.cuisineGroup('Sos')).toBe('Sos seçimi var mı?');
    expect(GAP_TEXT.cuisineGroup('İçecek Seçimi')).toBe('İçecekli menü seçeneği var mı?');
    expect(GAP_TEXT.cuisineGroup('Ekmek Tercihi')).toBe(GAP_TEXT.cuisineGroup('Ekmek Seçimi'));
    expect(GAP_TEXT.cuisineGroup('Hamur Seçimi')).toBe('Hamur seçimi (ince / klasik / kalın) var mı?');
  });

  it('does not say "seçimi" twice for an unknown "… Seçimi" group', () => {
    expect(GAP_TEXT.cuisineGroup('Peynir Seçimi')).toBe('Peynir Seçimi soruluyor mu?');
    expect(GAP_TEXT.cuisineGroup('Kenar')).toBe('Kenar seçimi soruluyor mu?');
  });
});

describe('call checklist', () => {
  it('writes one line per item with template hints and a stable key', () => {
    const q = itemQuestion({ item: gapItem('Lahmacun'), template: seed('Lahmacun'), importance: 80 });
    expect(q).toMatchObject({
      key: 'fields:lahmacun:dor',
      kind: 'missing_field',
      text: 'Lahmacun: açıklamayı, seçenekleri ve çıkarılabilir malzemeleri sor',
      itemName: 'Lahmacun',
    });
    expect(q?.hints[0]).toMatch(/^Boy: Fındık \(Küçük\) \/ Normal \/ Büyük · ayrıca /);
    expect(q?.hints[1]).toBe('Çıkarılabilir: Soğan, Maydanoz, Limon, Marul, Pul Biber');

    const tavuk = itemQuestion({
      item: gapItem('Tavuk Şiş', {
        missing: [
          { field: 'description', state: 'absent' },
          { field: 'removables', state: 'unknown' },
        ],
      }),
      template: undefined,
      importance: 0,
    });
    expect(tavuk).toMatchObject({
      key: 'fields:tavuk sis:dr?',
      text: 'Tavuk Şiş: açıklamayı sor; çıkarılabilir malzemeleri kontrol et',
      hints: [],
    });
    expect(itemQuestion({ item: gapItem('Ayran', { missing: [] }), template: undefined, importance: 0 })).toBeUndefined();
  });

  it('asks "var mı?" for missing items', () => {
    expect(missingItemQuestion(rec('Beyti Sarma'))).toEqual({
      key: 'item:beyti sarma',
      text: 'Beyti Sarma var mı?',
      kind: 'missing_item',
      itemName: 'Beyti Sarma',
      hints: ['Beyti Sarma gerekçesi'],
    });
  });

  it('derives cuisine questions from recurring option groups (no size groups)', () => {
    const kebap = SEED_TEMPLATES.filter((t) => t.cuisine === 'kebap-izgara').map((t) => t.payload);
    const questions = cuisineQuestions('kebap-izgara', kebap);
    expect(questions).toHaveLength(2);
    expect(questions.every((q) => q.kind === 'cuisine' && q.key.startsWith('cuisine:kebap-izgara:'))).toBe(true);
    expect(questions.map((q) => q.text).join(' ')).not.toMatch(/Porsiyon|Boy/);
    expect(questions.map((q) => q.text)).toContain('İçecekli menü seçeneği var mı?');
  });

  it('orders missing items, then item fields, then cuisine questions; caps at 15 and reserves AI slots', () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      gapItem(`Ürün ${String.fromCharCode(65 + i)}`, { completeness: i / 40 }),
    ).map((item) => ({ item, template: undefined, importance: 0 }));
    const cuisine = [
      { key: 'cuisine:x:a', text: 'A?', kind: 'cuisine' as const, itemName: null, hints: [] },
      { key: 'cuisine:x:b', text: 'B?', kind: 'cuisine' as const, itemName: null, hints: [] },
    ];
    const plan = buildQuestions({ items, recommendations: [rec('Beyti Sarma')], needed: 3, cuisine });
    expect(plan.reservedForAi).toBe(2);
    expect(plan.questions).toHaveLength(MAX_QUESTIONS - plan.reservedForAi);
    expect(plan.questions[0]?.text).toBe('Beyti Sarma var mı?');
    expect(plan.questions[1]?.itemName).toBe('Ürün A');
    expect(plan.questions.slice(-2).map((q) => q.kind)).toEqual(['cuisine', 'cuisine']);
    expect(new Set(plan.questions.map((q) => q.key)).size).toBe(plan.questions.length);
  });

  it('fills spare capacity with more recommendations when the target is reached', () => {
    const plan = buildQuestions({
      items: [{ item: gapItem('Lahmacun'), template: undefined, importance: 0 }],
      recommendations: [rec('Beyti Sarma'), rec('Kuzu Şiş'), rec('Ali Nazik')],
      needed: 0,
      cuisine: [],
    });
    expect(plan.reservedForAi).toBe(0);
    expect(plan.questions.map((q) => q.kind)).toEqual(['missing_field', 'missing_item', 'missing_item', 'missing_item']);
  });
});

describe('mergeWithStoredMenu', () => {
  const row = (id: string, name: string, source: StoredMenuRow['source'], templateId: string | null, status: StoredMenuRow['status'] = 'ok'): StoredMenuRow => ({
    id,
    rawName: name,
    normalizedName: normalizeTr(name),
    matchedItemId: templateId,
    status,
    source,
  });
  const product = (name: string, templateId: string | null) => ({ name, normalized: normalizeTr(name), matchedTemplateId: templateId });

  it('counts a re-read product once and keeps stored products that are not on the screenshots', () => {
    const merge = mergeWithStoredMenu(
      [row('r1', 'Lahmacun', 'screenshot', 't-lah'), row('r2', 'Künefe', 'screenshot', 't-kun'), row('r3', 'Ayran', 'recommendation', 't-ay', 'missing')],
      [product('Lahmacun', 't-lah'), product('Ayran', 't-ay')],
    );
    expect(merge).toEqual({ renames: [], current: 3 });
  });

  it('links a card accepted under another name to the panel product (1:1 by template)', () => {
    const merge = mergeWithStoredMenu([row('c1', 'Adana Kebap', 'suggestion', 't-adana')], [product('Adana Dürüm', 't-adana')]);
    expect(merge).toEqual({ renames: [{ rowId: 'c1', rawName: 'Adana Dürüm', normalizedName: 'adana durum' }], current: 1 });
  });

  it('keeps different panel products apart even when they share a template; the card joins the closest one', () => {
    const merge = mergeWithStoredMenu(
      [row('c1', 'Adana Porsiyonu', 'suggestion', 't-adana')],
      [product('Adana Dürüm', 't-adana'), product('Adana Porsiyon', 't-adana')],
    );
    expect(merge).toEqual({ renames: [{ rowId: 'c1', rawName: 'Adana Porsiyon', normalizedName: 'adana porsiyon' }], current: 2 });
  });

  it('counts extra cards of the same template separately', () => {
    const merge = mergeWithStoredMenu(
      [row('c1', 'Adana Kebap', 'suggestion', 't-adana'), row('c2', 'Acılı Adana', 'manual', 't-adana')],
      [product('Adana Dürüm', 't-adana')],
    );
    expect(merge.renames).toHaveLength(1);
    expect(merge.current).toBe(2);
  });
});

describe('recommendation helpers', () => {
  it('wants enough to reach the target plus spares (3–10)', () => {
    expect(wantedRecommendations(0)).toBe(3);
    expect(wantedRecommendations(2)).toBe(4);
    expect(wantedRecommendations(30)).toBe(10);
  });

  it('indexes the menu by name, template and spelling variants', () => {
    const menu = new MenuIndex();
    expect(menu.add('adana kebap', 't1')).toBe(true);
    expect(menu.add('adana', 't1')).toBe(false);
    expect(menu.add('karisik izgara', null)).toBe(true);
    expect(menu.has('urfa kebap')).toBe(false);
    expect(menu.has('karisik izgaras')).toBe(true);
    expect(menu.has('baska', 't1')).toBe(true);
  });

  it('joins Turkish lists', () => {
    expect(joinTr([])).toBe('');
    expect(joinTr(['a'])).toBe('a');
    expect(joinTr(['a', 'b', 'c'])).toBe('a, b ve c');
  });
});
