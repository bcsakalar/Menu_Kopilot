import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { templatePayloadSchema } from '../../src/domain/template.js';
import { cleanItemName, titleCaseTr } from '../../src/lib/clean-name.js';
import { sniffImage } from '../../src/lib/images.js';
import { containsPriceAmount } from '../../src/lib/price-guard.js';
import { trigramSimilarity } from '../../src/lib/trigram.js';
import { extractionToParsed, makeBatches } from '../../src/modules/suggest/pipeline.js';
import { parsePromptItems } from '../../src/modules/suggest/prompt-parse.js';
import { clampDescription, enforceBasePriceRules, reviewPlaceholder, sanitizeLlmItem } from '../../src/modules/suggest/sanitize.js';
import { llmItemSchema } from '../../src/modules/suggest/schemas.js';

const enrichItems = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/llm/enrich-items.json', import.meta.url)), 'utf8'),
) as Record<string, unknown>;

describe('parsePromptItems', () => {
  it('splits free text into product names without an LLM', () => {
    expect(parsePromptItems('adana kebap, lahmacun, künefe var').map((n) => n.rawName)).toEqual([
      'adana kebap',
      'lahmacun',
      'künefe',
    ]);
  });

  it('handles lines, conjunctions, bullets, quantities, prices and duplicates', () => {
    const text = '- Tavuk döner ve et döner\n2 adet Lahmacun 90 TL\nbir de ayran da var\n• Lahmacun\nKünefe;Katmer + Sütlaç';
    expect(parsePromptItems(text).map((n) => n.rawName)).toEqual([
      'Tavuk döner',
      'et döner',
      'Lahmacun',
      'ayran',
      'Künefe',
      'Katmer',
      'Sütlaç',
    ]);
  });

  it('ignores empty input and noise', () => {
    expect(parsePromptItems(undefined)).toEqual([]);
    expect(parsePromptItems(' , ; 123 , a ')).toEqual([]);
  });
});

describe('cleanItemName & titleCaseTr', () => {
  it.each([
    ['İçli Köfte (2 adet)', 'İçli Köfte'],
    ['1. Adana Kebap - 320 TL', 'Adana Kebap'],
    ['Lahmacun x2', 'Lahmacun'],
    ['• Künefe', 'Künefe'],
  ])('%s → %s', (input, expected) => {
    expect(cleanItemName(input)).toBe(expected);
  });

  it('title-cases Turkish correctly', () => {
    expect(titleCaseTr('iskender kebap')).toBe('İskender Kebap');
    expect(titleCaseTr('ISPANAKLI PİDE')).toBe('Ispanaklı Pide');
  });
});

describe('trigramSimilarity', () => {
  it('mirrors pg_trgm behaviour on typical names', () => {
    expect(trigramSimilarity('urfa kebap', 'kebap urfa')).toBe(1);
    expect(trigramSimilarity('karisik pizza', 'karisik pide')).toBeLessThan(0.72);
    expect(trigramSimilarity('adana kebap', 'adana kebap')).toBe(1);
    expect(trigramSimilarity('', 'x')).toBe(0);
  });
});

describe('sanitize', () => {
  it('clamps descriptions to 160 characters at a word boundary', () => {
    const long = 'Haşlanmış nohut, tahin, limon ve sarımsakla pürüzsüz kıvamda ezilir; üzerine zeytinyağı ve pul biber gezdirilerek sıcak pide ile birlikte servis edilen geleneksel meze tabağı.';
    const clamped = clampDescription(long);
    expect(clamped.length).toBeLessThanOrEqual(160);
    expect(long.startsWith(clamped.replace(/\.$/, ''))).toBe(true);
    expect(clampDescription('Kısa açıklama.')).toBe('Kısa açıklama.');
  });

  it('keeps exactly one sets_base group, preferring Boy/Porsiyon', () => {
    const groups = enforceBasePriceRules([
      {
        name: 'Acılık',
        selectionType: 'single',
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        options: [
          { name: 'Acısız', priceMode: 'sets_base', isDefault: false },
          { name: 'Acılı', priceMode: 'sets_base', isDefault: false },
        ],
      },
      {
        name: 'Boy',
        selectionType: 'multi',
        isRequired: false,
        minSelect: 0,
        maxSelect: 2,
        options: [
          { name: 'Küçük', priceMode: 'surcharge', isDefault: false },
          { name: 'Büyük', priceMode: 'surcharge', isDefault: false },
        ],
      },
    ]);
    expect(groups[0]?.options.map((o) => o.priceMode)).toEqual(['surcharge', 'surcharge']);
    expect(groups[1]).toMatchObject({ selectionType: 'single', isRequired: true, minSelect: 1, maxSelect: 1 });
    expect(groups[1]?.options.every((o) => o.priceMode === 'sets_base')).toBe(true);
  });

  it('turns the flawed Humus fixture into a valid, price-free template', () => {
    const humus = llmItemSchema.parse(enrichItems['humus']);
    const payload = templatePayloadSchema.parse(sanitizeLlmItem(humus, 'Humus'));
    expect(payload.description.length).toBeLessThanOrEqual(160);
    expect(payload.optionGroups[0]?.options.map((o) => o.name)).toEqual(['Küçük', 'Büyük']);
    expect(payload.extraIngredients[0]?.name).toBe('Ekstra Pide');
    expect(containsPriceAmount(JSON.stringify(payload))).toBe(false);
  });

  it('fixes a Boy group the model marked as surcharge (Şalgam fixture)', () => {
    const salgam = llmItemSchema.parse(enrichItems['salgam']);
    const payload = templatePayloadSchema.parse(sanitizeLlmItem(salgam, 'Şalgam'));
    const boy = payload.optionGroups.find((g) => g.name === 'Boy');
    const acilik = payload.optionGroups.find((g) => g.name === 'Acılık');
    expect(boy?.options.every((o) => o.priceMode === 'sets_base')).toBe(true);
    expect(acilik?.options.some((o) => o.priceMode === 'sets_base')).toBe(false);
  });

  it('every enrichment fixture sanitizes into a valid template', () => {
    for (const [key, raw] of Object.entries(enrichItems)) {
      const item = llmItemSchema.parse(raw);
      const result = templatePayloadSchema.safeParse(sanitizeLlmItem(item, key));
      expect(result.success, key).toBe(true);
    }
  });

  it('builds an empty review placeholder with a readable name', () => {
    expect(reviewPlaceholder('zıkkım kebabı')).toMatchObject({ name: 'Zıkkım Kebabı', description: '', optionGroups: [] });
  });
});

describe('pipeline helpers', () => {
  it('batches first 3 then 10', () => {
    expect(makeBatches([...Array(25).keys()]).map((b) => b.length)).toEqual([3, 10, 10, 2]);
    expect(makeBatches([])).toEqual([]);
  });

  it('turns extraction output into cleaned names and drops low-confidence noise', () => {
    const parsed = extractionToParsed(
      [
        { rawName: 'İçli Köfte (2 adet)', priceText: '70 TL', sectionText: 'ARA SICAKLAR', confidence: 0.95 },
        { rawName: '???', priceText: null, sectionText: null, confidence: 0.1 },
      ],
      'sha',
    );
    expect(parsed).toEqual([
      {
        rawName: 'İçli Köfte',
        normalized: 'icli kofte',
        sectionText: 'ARA SICAKLAR',
        priceText: '70 TL',
        source: 'image',
        imageSha: 'sha',
      },
    ]);
  });
});

describe('sniffImage', () => {
  it('detects JPEG and PNG by magic bytes with dimensions', () => {
    const jpeg = readFileSync(fileURLToPath(new URL('../fixtures/images/menu-kebapci.jpg', import.meta.url)));
    expect(sniffImage(jpeg)).toEqual({ mimeType: 'image/jpeg', width: 1200, height: 1600 });
    const png = readFileSync(fileURLToPath(new URL('../fixtures/images/panel-1.png', import.meta.url)));
    expect(sniffImage(png)?.mimeType).toBe('image/png');
    expect(sniffImage(Buffer.from('not an image at all'))).toBeUndefined();
  });
});
