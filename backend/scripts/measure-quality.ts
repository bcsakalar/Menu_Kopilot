/**
 * Öneri kalitesi ölçüm koşusu — "önce/sonra" tablosunun veri kaynağı.
 *
 * `test/fixtures/menus/*.json` içindeki her menü girdisini ÇALIŞAN bir sunucuya gönderir (Docker veya prod) ve
 * her öneriyi üç kovaya ayırır:
 *   duplicate   — girdide zaten olan ürün (normalize isim eşitliği veya trigram ≥ 0.8)
 *   irrelevant  — mutfak grafiğinde (rank ≤ 2) onaylı şablona oturmayan ve fixture'ın makul listesinde de olmayan
 *   usable      — şemadan geçen, gerekçesi/açıklaması dolu, fiyat sızdırmayan, doğrudan panele girilebilir öneri
 *
 *   pnpm measure --label before                 # http://127.0.0.1:3030
 *   pnpm measure --label after --url https://…
 *   pnpm measure --label before --only kebapci
 *
 * Çıktı: `backend/exports/quality-<label>.json` + konsolda tablo. Aynı fixture'lar iki kez koşulunca
 * `scripts/compare-quality.ts` iki dosyayı yan yana koyar.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { normalizeTr } from '../src/lib/normalize-tr.js';
import { trigramSimilarity } from '../src/lib/trigram.js';
import { containsPriceAmount } from '../src/lib/price-guard.js';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: process.env['LIVE_URL'] ?? 'http://127.0.0.1:3030' },
    email: { type: 'string', default: process.env['ADMIN_EMAIL'] ?? '' },
    password: { type: 'string', default: process.env['ADMIN_PASSWORD'] ?? '' },
    label: { type: 'string', default: 'before' },
    only: { type: 'string', default: '' },
    out: { type: 'string', default: '' },
  },
});

const base = (args.url ?? '').replace(/\/+$/, '');
const api = `${base}/api/v1`;
const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '../test/fixtures/menus');
let token = '';

// ---- fixture ---------------------------------------------------------------------------------------------------

interface MenuFixture {
  id: string;
  label: string;
  cuisineSlug: string;
  note: string;
  menu: string[];
  expectCategories: string[];
  presentCategories: string[];
  plausibleAdditions: string[];
  implausible: string[];
}

function loadFixtures(): MenuFixture[] {
  const only = (args.only ?? '').trim();
  return readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(fixturesDir, f), 'utf8')) as MenuFixture)
    .filter((f) => only === '' || f.id === only)
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ---- http ------------------------------------------------------------------------------------------------------

type Json = Record<string, unknown>;

/** Narrow an unknown JSON field to a string without stringifying objects. */
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Json; text: string }> {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: Json = {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object') json = parsed as Json;
  } catch {
    /* non-JSON body */
  }
  return { status: response.status, json, text };
}

async function form(path: string, fields: Record<string, string>): Promise<{ status: number; json: Json; text: string }> {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  const response = await fetch(`${api}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: data });
  const text = await response.text();
  let json: Json = {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object') json = parsed as Json;
  } catch {
    /* non-JSON body */
  }
  return { status: response.status, json, text };
}

// ---- classification --------------------------------------------------------------------------------------------

const SIMILAR = 0.8;

/** Girdide zaten var mı? (aynı isim veya yazım varyantı) */
function isDuplicate(name: string, menu: readonly string[]): boolean {
  const normalized = normalizeTr(name);
  if (normalized === '') return false;
  return menu.some((existing) => {
    const other = normalizeTr(existing);
    return other === normalized || trigramSimilarity(other, normalized) >= SIMILAR;
  });
}

function inList(name: string, list: readonly string[]): boolean {
  const normalized = normalizeTr(name);
  return list.some((entry) => {
    const other = normalizeTr(entry);
    return other === normalized || trigramSimilarity(other, normalized) >= SIMILAR;
  });
}

const CATEGORY_HINTS: readonly (readonly [string, readonly string[]])[] = [
  ['corba', ['corba', 'mercimek', 'ezogelin', 'yayla', 'iskembe', 'paca', 'tarhana', 'dugun']],
  ['icecek', ['ayran', 'salgam', 'kola', 'gazoz', 'soda', 'maden', 'limonata', 'suyu', 'sahlep', 'cay', 'kahve',
    'latte', 'americano', 'espresso', 'cappuccino', 'mocha', 'frappe', 'milkshake', 'smoothie', 'brew', 'filtre',
    'icecek', 'macchiato', 'menengic', 'fanta', 'sprite', 'su', 'sut', 'boza', 'cikolata']],
  ['tatli', ['kunefe', 'baklava', 'sutlac', 'kazandibi', 'trilece', 'profiterol', 'sufle', 'katmer', 'kadayif',
    'sobiyet', 'magnolia', 'cheesecake', 'brownie', 'tiramisu', 'supangle', 'tavukgogsu', 'dondurma', 'helva',
    'revani', 'asure', 'kemalpasa', 'tatli', 'pasta', 'kurabiye', 'muffin', 'cookie', 'waffle', 'sekerpare',
    'lokma', 'magnolya', 'donut', 'kaymak']],
  ['salata-meze', ['salata', 'ezme', 'cacik', 'haydari', 'humus', 'piyaz', 'turs', 'meze', 'coban', 'sezar',
    'roka', 'mevsim', 'sarma', 'gavurdagi', 'sarimsakli', 'atom', 'muhammara', 'babagannus']],
  ['ara-sicak', ['icli', 'sigara', 'patates', 'halka', 'kanat', 'citir', 'nugget', 'kizartma', 'borek', 'gozleme',
    'kalamar', 'midye', 'falafel', 'nachos', 'sogan', 'mucver', 'pacanga']],
  ['atistirmalik', ['tost', 'sandvic', 'kruvasan', 'pogaca', 'simit', 'acma', 'bagel', 'wrap', 'kumru', 'bazlama']],
];

/**
 * Ölçüm amaçlı kategori tahmini. Anahtarlar `src/db/seed/categories.ts` ile birebir aynı, böylece "önce" ve
 * "sonra" koşuları aynı taksonomiyle ölçülür. "Sonra" koşusunda pipeline kategoriyi kendisi üretir; bu harita
 * o zaman bağımsız bir doğrulama olarak kalır. Token eşleşmesi kullanılıyor: "Sütlaç" (`sutlac`) içindeki `su`
 * içecek sayılmasın diye.
 */
function categoryOf(name: string): string {
  const tokens = new Set(normalizeTr(name).split(' '));
  for (const [category, hints] of CATEGORY_HINTS) {
    if (hints.some((hint) => tokens.has(hint))) return category;
  }
  return 'ana-yemek';
}

/** Girdide hiç karşılanmayan, fixture'ın beklediği kategoriler. */
function openCategories(fx: MenuFixture): string[] {
  const covered = new Set(fx.menu.map(categoryOf));
  return fx.expectCategories.filter((c) => !covered.has(c) && c !== 'ana-yemek');
}

interface Verdict {
  name: string;
  category: string;
  duplicate: boolean;
  relevant: boolean;
  usable: boolean;
  why: string;
}

/**
 * Bir öneri (yeni ürün) "doğrudan kullanılabilir" sayılır: menüde yok, mutfağa uygun, adı düzgün ve gerekçesi
 * dolu/fiyatsız.
 */
function judgeRecommendation(
  rec: { name: string; reason: string; source: string; templateId: string | null },
  fx: MenuFixture,
): Verdict {
  const duplicate = isDuplicate(rec.name, fx.menu);
  // Şablon havuzunda karşılığı olan öneri tanım gereği bu mutfak ailesine ait; yoksa fixture listesine bakılır.
  const relevant = (rec.templateId !== null || inList(rec.name, fx.plausibleAdditions)) && !inList(rec.name, fx.implausible);
  const reasons: string[] = [];
  if (duplicate) reasons.push('menüde zaten var');
  if (!relevant) reasons.push('mutfağa alakasız');
  if (rec.reason.trim().length < 10) reasons.push('gerekçe yok');
  if (containsPriceAmount(`${rec.name} ${rec.reason}`)) reasons.push('fiyat sızıntısı');
  if (rec.name.trim().length < 3) reasons.push('ad çok kısa');
  return { name: rec.name, category: categoryOf(rec.name), duplicate, relevant, usable: reasons.length === 0, why: reasons.join(', ') };
}

// ---- run -------------------------------------------------------------------------------------------------------

interface ModeResult {
  produced: number;
  duplicates: number;
  irrelevant: number;
  usable: number;
  latencyMs: number;
  llmCalls: number;
  /** Girdide açık olan kategoriler ve bunlardan kaçını öneri kapattı. */
  openCategories: string[];
  coveredCategories: string[];
  verdicts: Verdict[];
  error?: string;
  extra?: Json;
}

interface FixtureResult {
  id: string;
  label: string;
  cuisineSlug: string;
  menuSize: number;
  suggest: ModeResult;
  gap: ModeResult;
}

const empty = (error?: string): ModeResult => ({
  produced: 0,
  duplicates: 0,
  irrelevant: 0,
  usable: 0,
  latencyMs: 0,
  llmCalls: 0,
  openCategories: [],
  coveredCategories: [],
  verdicts: [],
  ...(error ? { error } : {}),
});

function tally(verdicts: Verdict[], fx: MenuFixture, latencyMs: number, llmCalls: number, extra?: Json): ModeResult {
  const open = openCategories(fx);
  const produced = new Set(verdicts.filter((v) => !v.duplicate).map((v) => v.category));
  return {
    produced: verdicts.length,
    duplicates: verdicts.filter((v) => v.duplicate).length,
    irrelevant: verdicts.filter((v) => !v.relevant).length,
    usable: verdicts.filter((v) => v.usable).length,
    latencyMs,
    llmCalls,
    openCategories: open,
    coveredCategories: open.filter((c) => produced.has(c)),
    verdicts,
    ...(extra ? { extra } : {}),
  };
}

/**
 * Tek uçtan uca analiz: `POST /analyze`. Bölümler ayrı sayılır — "yeni ürün" bölümü eski Mod 2'nin,
 * "opsiyon" + "düzeltme" bölümleri eski Mod 1'in karşılığı, ama artık tek koşuda ve tek ekranda.
 */
async function runAnalyze(fx: MenuFixture, cuisineId: string): Promise<{ newProducts: ModeResult; support: ModeResult }> {
  const started = Date.now();
  const response = await form('/analyze', { cuisineId, menuText: fx.menu.join(', ') });
  const latencyMs = Date.now() - started;
  if (response.status !== 200) {
    const failed = empty(`HTTP ${response.status}: ${response.text.slice(0, 200)}`);
    return { newProducts: failed, support: failed };
  }

  const cards = Array.isArray(response.json['cards']) ? (response.json['cards'] as Json[]) : [];
  const stats = (response.json['stats'] ?? {}) as Json;
  const counts = (response.json['counts'] ?? {}) as Json;
  const menu = Array.isArray(response.json['menu']) ? (response.json['menu'] as Json[]) : [];
  const llmCalls = typeof stats['llmCalls'] === 'number' ? stats['llmCalls'] : 0;

  const newCards = cards.filter((c) => c['section'] === 'new_product');
  const supportCards = cards.filter((c) => c['section'] !== 'new_product');

  const newVerdicts = newCards.map((card) =>
    judgeRecommendation(
      {
        name: str(card['name']),
        reason: str(card['reason']),
        source: str(card['source']),
        templateId: typeof card['matchedTemplateId'] === 'string' ? card['matchedTemplateId'] : null,
      },
      fx,
    ),
  );

  // Opsiyon/düzeltme kartları "ürün önerisi" değil: hedef ürün menüde mi ve kartın içi dolu mu diye ölçülür.
  const onMenu = new Set(menu.map((m) => str(m['normalized'])));
  const supportVerdicts: Verdict[] = supportCards.map((card) => {
    const target = str(card['targetName']);
    const groups = Array.isArray(card['optionGroups']) ? card['optionGroups'].length : 0;
    const removables = Array.isArray(card['removableIngredients']) ? card['removableIngredients'].length : 0;
    const hasBody = card['section'] === 'fix' ? str(card['reason']).length > 0 : groups + removables > 0;
    const relevant = onMenu.has(normalizeTr(target));
    const why = [relevant ? '' : 'menüde olmayan ürüne ait', hasBody ? '' : 'içerik yok'].filter((r) => r !== '').join(', ');
    return { name: target || str(card['name']), category: categoryOf(target), duplicate: false, relevant, usable: why === '', why };
  });

  return {
    newProducts: tally(newVerdicts, fx, latencyMs, llmCalls, {
      current: Number(counts['current'] ?? 0),
      target: Number(counts['target'] ?? 0),
      fromDb: newCards.filter((c) => c['source'] === 'db').length,
      fromAi: newCards.filter((c) => c['source'] === 'ai').length,
      dropped: Number(stats['dropped'] ?? 0),
    }),
    support: tally(supportVerdicts, fx, latencyMs, llmCalls, {
      options: supportCards.filter((c) => c['section'] === 'option').length,
      fixes: supportCards.filter((c) => c['section'] === 'fix').length,
    }),
  };
}

// ---- main ------------------------------------------------------------------------------------------------------

function pct(part: number, whole: number): string {
  return whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`;
}

async function main(): Promise<void> {
  const fixtures = loadFixtures();
  if (fixtures.length === 0) throw new Error(`fixture bulunamadı: ${fixturesDir}`);

  const login = await call('POST', '/auth/login', {
    email: args.email,
    password: args.password,
    deviceName: 'measure-quality',
  });
  if (login.status !== 200) throw new Error(`giriş başarısız (${login.status}): ${login.text.slice(0, 200)}`);
  token = str(login.json['accessToken']);

  const cuisines = await call('GET', '/cuisines');
  const list = Array.isArray(cuisines.json['data']) ? (cuisines.json['data'] as Json[]) : [];
  const bySlug = new Map(list.map((c) => [str(c['slug']), str(c['id'])]));

  console.log(`\n=== ölçüm "${args.label}" — ${base} — ${fixtures.length} fixture ===\n`);
  const results: FixtureResult[] = [];
  for (const fx of fixtures) {
    const cuisineId = bySlug.get(fx.cuisineSlug);
    if (!cuisineId) {
      console.log(`  ! ${fx.id}: mutfak türü yok (${fx.cuisineSlug})`);
      continue;
    }
    process.stdout.write(`  · ${fx.id} … `);
    const { newProducts, support } = await runAnalyze(fx, cuisineId);
    results.push({ id: fx.id, label: fx.label, cuisineSlug: fx.cuisineSlug, menuSize: fx.menu.length, suggest: support, gap: newProducts });
    console.log(
      `${newProducts.produced} yeni ürün (${newProducts.duplicates} tekrar, ${newProducts.irrelevant} alakasız, ` +
        `${newProducts.usable} kullanılabilir) · ${support.produced} opsiyon/düzeltme (${support.usable} kullanılabilir) · ` +
        `${newProducts.latencyMs} ms, ${newProducts.llmCalls} LLM`,
    );
    console.log(
      `      açık kategori: ${newProducts.openCategories.join(', ') || '—'} → kapanan: ` +
        `${newProducts.coveredCategories.join(', ') || 'hiçbiri'}`,
    );
    if (newProducts.error) console.log(`      hata: ${newProducts.error}`);
  }

  const sum = (pick: (r: FixtureResult) => ModeResult, field: keyof ModeResult): number =>
    results.reduce((total, r) => total + Number(pick(r)[field] ?? 0), 0);

  const table = [
    ['', 'üretilen', 'tekrar', 'alakasız', 'kullanılabilir', 'toplam süre'],
    [
      'Opsiyon+Düzeltme',
      String(sum((r) => r.suggest, 'produced')),
      `${sum((r) => r.suggest, 'duplicates')} (${pct(sum((r) => r.suggest, 'duplicates'), sum((r) => r.suggest, 'produced'))})`,
      String(sum((r) => r.suggest, 'irrelevant')),
      `${sum((r) => r.suggest, 'usable')} (${pct(sum((r) => r.suggest, 'usable'), sum((r) => r.suggest, 'produced'))})`,
      `${sum((r) => r.suggest, 'latencyMs')} ms`,
    ],
    [
      'Yeni ürün',
      String(sum((r) => r.gap, 'produced')),
      `${sum((r) => r.gap, 'duplicates')} (${pct(sum((r) => r.gap, 'duplicates'), sum((r) => r.gap, 'produced'))})`,
      `${sum((r) => r.gap, 'irrelevant')} (${pct(sum((r) => r.gap, 'irrelevant'), sum((r) => r.gap, 'produced'))})`,
      `${sum((r) => r.gap, 'usable')} (${pct(sum((r) => r.gap, 'usable'), sum((r) => r.gap, 'produced'))})`,
      `${sum((r) => r.gap, 'latencyMs')} ms`,
    ],
  ];
  console.log('');
  for (const row of table) console.log(row.map((cell) => cell.padEnd(16)).join(''));
  const openTotal = results.reduce((n, r) => n + r.gap.openCategories.length, 0);
  const coveredTotal = results.reduce((n, r) => n + r.gap.coveredCategories.length, 0);
  console.log(`
kategori açığı: ${coveredTotal}/${openTotal} kapandı (${pct(coveredTotal, openTotal)})`);
  const llm = results.reduce((n, r) => n + r.suggest.llmCalls + r.gap.llmCalls, 0);
  console.log(`toplam LLM çağrısı: ${llm}`);

  const outPath = args.out || join(here, '../exports', `quality-${args.label}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    `${JSON.stringify({ label: args.label, url: base, at: new Date().toISOString(), results }, null, 2)}\n`,
    'utf8',
  );
  console.log(`\nyazıldı: ${outPath}\n`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
