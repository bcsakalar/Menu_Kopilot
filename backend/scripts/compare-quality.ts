/**
 * "Önce/sonra" tablosunu iki ölçüm dosyasından üretir.
 *
 *   pnpm compare                                  # exports/quality-before.json ↔ quality-after.json
 *   pnpm compare --before X.json --after Y.json
 *
 * Kategori kapsamı iki dosyada da BURADAN, fixture'ların güncel `expectCategories` anahtarlarıyla yeniden
 * hesaplanır. "Önce" koşusu sırasında fixture'lar hâlâ eski, serbest metin kategori adlarını taşıyordu; iki koşuyu
 * aynı paydada karşılaştırabilmek için ham öneri adlarından tekrar sınıflandırılıyor.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CategoryIndex } from '../src/domain/category.js';
import { SEED_CATEGORIES } from '../src/db/seed/categories.js';

const { values: args } = parseArgs({
  options: {
    before: { type: 'string', default: '' },
    after: { type: 'string', default: '' },
    out: { type: 'string', default: '' },
  },
});

const here = dirname(fileURLToPath(import.meta.url));
const exportsDir = join(here, '../exports');
const fixturesDir = join(here, '../test/fixtures/menus');

interface Verdict {
  name: string;
  duplicate: boolean;
  relevant: boolean;
  usable: boolean;
  why: string;
}

interface ModeResult {
  produced: number;
  duplicates: number;
  irrelevant: number;
  usable: number;
  latencyMs: number;
  llmCalls: number;
  verdicts: Verdict[];
}

interface FixtureResult {
  id: string;
  label: string;
  suggest: ModeResult;
  gap: ModeResult;
}

interface QualityFile {
  label: string;
  at: string;
  results: FixtureResult[];
}

interface MenuFixture {
  id: string;
  label: string;
  menu: string[];
  expectCategories: string[];
}

const categories = new CategoryIndex(
  SEED_CATEGORIES.map((c) => ({ key: c.key, label: c.label, sortOrder: c.sortOrder, keywords: [...c.keywords] })),
);

const fixtures = new Map(
  readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(fixturesDir, f), 'utf8')) as MenuFixture)
    .map((f) => [f.id, f]),
);

/** Open categories of a fixture and how many of them the run's suggestions actually covered. */
function coverage(file: QualityFile): { open: number; covered: number; perFixture: Map<string, { open: string[]; covered: string[] }> } {
  let open = 0;
  let covered = 0;
  const perFixture = new Map<string, { open: string[]; covered: string[] }>();
  for (const result of file.results) {
    const fixture = fixtures.get(result.id);
    if (!fixture) continue;
    const present = new Set(fixture.menu.map((name) => categories.classify(name)));
    const openKeys = fixture.expectCategories.filter((key) => !present.has(key) && key !== 'ana-yemek');
    const produced = new Set(result.gap.verdicts.filter((v) => !v.duplicate).map((v) => categories.classify(v.name)));
    const hit = openKeys.filter((key) => produced.has(key));
    open += openKeys.length;
    covered += hit.length;
    perFixture.set(result.id, { open: openKeys, covered: hit });
  }
  return { open, covered, perFixture };
}

function totals(file: QualityFile, pick: (r: FixtureResult) => ModeResult) {
  return file.results.reduce(
    (sum, r) => {
      const m = pick(r);
      return {
        produced: sum.produced + m.produced,
        duplicates: sum.duplicates + m.duplicates,
        irrelevant: sum.irrelevant + m.irrelevant,
        usable: sum.usable + m.usable,
        latencyMs: sum.latencyMs + m.latencyMs,
        llmCalls: sum.llmCalls + m.llmCalls,
      };
    },
    { produced: 0, duplicates: 0, irrelevant: 0, usable: 0, latencyMs: 0, llmCalls: 0 },
  );
}

const pct = (part: number, whole: number): string => (whole === 0 ? '—' : `%${Math.round((part / whole) * 100)}`);
const ratio = (part: number, whole: number): string => `${part}/${whole} (${pct(part, whole)})`;

function main(): void {
  const beforePath = args.before || join(exportsDir, 'quality-before.json');
  const afterPath = args.after || join(exportsDir, 'quality-after.json');
  const before = JSON.parse(readFileSync(beforePath, 'utf8')) as QualityFile;
  const after = JSON.parse(readFileSync(afterPath, 'utf8')) as QualityFile;

  const beforeNew = totals(before, (r) => r.gap);
  const afterNew = totals(after, (r) => r.gap);
  const beforeSupport = totals(before, (r) => r.suggest);
  const afterSupport = totals(after, (r) => r.suggest);
  const beforeCoverage = coverage(before);
  const afterCoverage = coverage(after);

  const rows: (readonly [string, string, string])[] = [
    ['Yeni ürün önerisi (adet)', String(beforeNew.produced), String(afterNew.produced)],
    ['— menüde zaten olan', ratio(beforeNew.duplicates, beforeNew.produced), ratio(afterNew.duplicates, afterNew.produced)],
    ['— mutfağa alakasız', ratio(beforeNew.irrelevant, beforeNew.produced), ratio(afterNew.irrelevant, afterNew.produced)],
    ['— doğrudan kullanılabilir', ratio(beforeNew.usable, beforeNew.produced), ratio(afterNew.usable, afterNew.produced)],
    ['Kategori açığı kapatma', ratio(beforeCoverage.covered, beforeCoverage.open), ratio(afterCoverage.covered, afterCoverage.open)],
    ['Opsiyon/düzeltme kartı', String(beforeSupport.produced), String(afterSupport.produced)],
    ['— kullanılabilir', ratio(beforeSupport.usable, beforeSupport.produced), ratio(afterSupport.usable, afterSupport.produced)],
    ['Uçtan uca süre (4 fixture)', `${beforeNew.latencyMs} ms`, `${afterNew.latencyMs} ms`],
    ['LLM çağrısı', String(beforeNew.llmCalls + beforeSupport.llmCalls), String(afterNew.llmCalls + afterSupport.llmCalls)],
  ];

  const width = Math.max(...rows.map((r) => r[0].length)) + 2;
  const lines = [
    `| ${'Ölçüt'.padEnd(width)} | ${'Önce'.padEnd(18)} | ${'Sonra'.padEnd(18)} |`,
    `| ${'-'.repeat(width)} | ${'-'.repeat(18)} | ${'-'.repeat(18)} |`,
    ...rows.map((r) => `| ${r[0].padEnd(width)} | ${r[1].padEnd(18)} | ${r[2].padEnd(18)} |`),
  ];
  console.log(`\n=== "${before.label}" (${before.at}) → "${after.label}" (${after.at}) ===\n`);
  console.log(lines.join('\n'));

  console.log('\nFixture bazında kategori kapsamı:');
  for (const [id, fixture] of fixtures) {
    const b = beforeCoverage.perFixture.get(id);
    const a = afterCoverage.perFixture.get(id);
    if (!b || !a) continue;
    console.log(
      `  ${fixture.label.padEnd(24)} açık: ${b.open.join(', ') || '—'}\n` +
        `  ${' '.repeat(24)} önce kapanan: ${b.covered.join(', ') || 'hiçbiri'}\n` +
        `  ${' '.repeat(24)} sonra kapanan: ${a.covered.join(', ') || 'hiçbiri'}`,
    );
  }

  if (args.out) {
    writeFileSync(args.out, `${lines.join('\n')}\n`, 'utf8');
    console.log(`\nyazıldı: ${args.out}`);
  }
  console.log('');
}

main();
