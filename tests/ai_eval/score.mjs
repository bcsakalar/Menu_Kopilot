// Scores one evaluation run (results/<label>/*.json) with the hand-written rules in rules.mjs and writes
// results/<label>/summary.json — per-case metrics, aggregates per input × mode, per cuisine, and the worst cases.
//
// usage (repo root): node tests/ai_eval/score.mjs --label baseline [--md]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { itemsOf, MENUS } from './menus.mjs';
import { alienToCuisine, DRINKS, inspectProduct, norm, productKind, sameProduct, words } from './rules.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []),
);
const LABEL = args.label ?? 'baseline';
const DIR = resolve('tests/ai_eval/results', LABEL);
const cuisines = JSON.parse(readFileSync(join(DIR, '_cuisines.json'), 'utf8'));
const slugOf = (id) => cuisines.find((c) => c.id === id)?.slug;
const menuOf = (slug) => MENUS.find((m) => m.slug === slug);

const DESC_MIN = 6;
const DESC_MAX = 8;
/** "En az 6–7 ürün": the acceptance bar a case must clear. */
const COVERAGE_BAR = 6;

function productsOf(r) {
  const cards = r.cards ?? [];
  const fixDescription = new Map();
  for (const c of cards) {
    if (c.section === 'fix' && c.fixKind === 'empty_description' && c.suggestedValue) fixDescription.set(norm(c.targetName ?? c.name), c.suggestedValue);
  }
  const products = [];
  const byName = new Map();
  for (const m of r.menu ?? []) {
    const p = { name: m.name, categoryKey: m.categoryKey, origin: 'menu', optionGroups: [], removableIngredients: [], extraIngredients: [], description: fixDescription.get(norm(m.name)) ?? '' };
    products.push(p);
    byName.set(norm(m.name), p);
  }
  for (const c of cards) {
    if (c.section === 'option') {
      const key = norm(c.targetName ?? c.name);
      // The menu list carries the pool's name ("Klasik Hamburger") when the menu wrote it otherwise ("Klasik Burger");
      // the card targets the menu's own spelling. Matching only the latter counted one product twice, once empty.
      const p =
        byName.get(key) ??
        byName.get(norm(c.name)) ??
        [...byName.values()].find((x) => sameProduct(x.name, c.targetName ?? c.name) || sameProduct(x.name, c.name));
      const target = p ?? { name: c.targetName ?? c.name, categoryKey: c.categoryKey, origin: 'menu', description: '' };
      Object.assign(target, { optionGroups: c.optionGroups, removableIngredients: c.removableIngredients, extraIngredients: c.extraIngredients });
      // Since D-178 the card of a menu product carries its description. Before, the same field held a summary of
      // the card (its group names, or its removables) — that is not a description and must not be counted as one.
      const summary = [(c.optionGroups ?? []).map((g) => g.name).join(', '), (c.removableIngredients ?? []).join(', ')];
      const text = (c.shortDescription ?? '').trim();
      if (text && !summary.includes(text) && !target.description) target.description = text;
      if (!p) products.push(target);
    } else if (c.section === 'new_product') {
      products.push({
        name: c.name,
        categoryKey: c.categoryKey,
        origin: 'new',
        optionGroups: c.optionGroups,
        removableIngredients: c.removableIngredients,
        extraIngredients: c.extraIngredients,
        description: c.shortDescription ?? '',
      });
    }
  }
  return products;
}

function scoreCase(r) {
  const c = r.case;
  const out = { id: c.id, slug: c.slug, kind: c.kind, mode: c.mode, latencyMs: r.latencyMs, status: r.status ?? `http ${r.httpStatus}`, providerTrouble: !!r.providerTrouble };
  if (r.httpStatus !== 200) return { ...out, failed: true, fullCount: 0, products: 0 };

  if (c.kind === 'photo' || c.kind === 'repo') out.cuisineOk = slugOf(r.classification?.cuisineId) === c.slug;
  if (c.kind === 'photo') {
    const expected = itemsOf(menuOf(c.slug));
    const read = (r.menu ?? []).map((m) => m.name);
    out.readCount = read.length;
    out.readRecall = expected.filter((e) => read.some((x) => sameProduct(e, x))).length / expected.length;
    out.readPrecision = read.length ? read.filter((x) => expected.some((e) => sameProduct(e, x))).length / read.length : 0;
  }

  const products = productsOf(r);
  const menuNames = (r.menu ?? []).map((m) => m.name);
  const fresh = products.filter((p) => p.origin === 'new');
  out.menuCount = menuNames.length;
  out.newCount = fresh.length;
  out.newDupMenu = fresh.filter((p) => menuNames.some((m) => sameProduct(m, p.name))).map((p) => p.name);
  out.newDupSelf = fresh.filter((p, i) => fresh.findIndex((q) => norm(q.name) === norm(p.name)) !== i).map((p) => p.name);
  out.newAlien = fresh.filter((p) => alienToCuisine(p.name, c.slug)).map((p) => p.name);

  const detail = [];
  let withOptions = 0, withRemovable = 0, withExtras = 0, withDescription = 0, descInRange = 0, full = 0, groups = 0, options = 0, groupCount = 0;
  const absurd = [], separation = [], weak = [], softViolations = [], preparedNoDesc = [];
  let considered = 0;
  for (const p of products) {
    const kind = productKind(p.name, p.categoryKey);
    const soft = kind === 'soft-drink';
    if (soft) {
      if (p.optionGroups.length > 0 || words(p.description) > 0) softViolations.push(p.name);
      continue;
    }
    considered += 1;
    const inspection = inspectProduct(p);
    const w = words(p.description);
    const hasOpt = p.optionGroups.length > 0;
    const hasRem = p.removableIngredients.length > 0;
    const hasExt = p.extraIngredients.length > 0;
    const hasDesc = w > 0;
    const inRange = w >= DESC_MIN && w <= DESC_MAX;
    withOptions += hasOpt ? 1 : 0;
    withRemovable += hasRem ? 1 : 0;
    withExtras += hasExt ? 1 : 0;
    withDescription += hasDesc ? 1 : 0;
    descInRange += inRange ? 1 : 0;
    if (hasOpt && hasRem && hasExt && inRange) full += 1;
    if (hasOpt) {
      groupCount += 1;
      groups += p.optionGroups.length;
      options += p.optionGroups.reduce((s, g) => s + g.options.length, 0);
    }
    if (DRINKS.has(kind) && !hasDesc) preparedNoDesc.push(p.name);
    absurd.push(...inspection.absurd.map((a) => `${p.name}: ${a}`));
    separation.push(...inspection.separation.map((a) => `${p.name}: ${a}`));
    weak.push(...inspection.weak.map((a) => `${p.name}: ${a}`));
    detail.push({ name: p.name, origin: p.origin, kind, groups: p.optionGroups.map((g) => g.name), removable: p.removableIngredients.length, extras: p.extraIngredients.length, descWords: w });
  }

  const usage = r.usage ?? [];
  Object.assign(out, {
    products: considered,
    withOptions,
    withRemovable,
    withExtras,
    withDescription,
    descInRange,
    fullCount: full,
    groupsPerProduct: groupCount ? groups / groupCount : 0,
    optionsPerGroup: groups ? options / groups : 0,
    absurd,
    separation,
    weak,
    softViolations,
    preparedNoDesc,
    jsonErrors: usage.filter((u) => u.error === 'invalid_output').length,
    repairs: usage.filter((u) => u.task === 'agent.validate').length,
    rateLimited: usage.filter((u) => u.error === 'rate_limited').length,
    timeouts: usage.filter((u) => u.error === 'timeout').length,
    failedSteps: (r.trace ?? []).filter((s) => s.status === 'failed').map((s) => s.agent),
    llmCalls: r.stats?.llmCalls ?? usage.length,
    warnings: (r.warnings ?? []).map((w) => w.code),
    detail,
  });
  return out;
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_') && f !== 'summary.json');
const scored = files.map((f) => scoreCase(JSON.parse(readFileSync(join(DIR, f), 'utf8'))));

// ---- aggregates -------------------------------------------------------------------------------------------------
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (n, d) => (d ? (100 * n) / d : 0);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
function aggregate(rows) {
  const ok = rows.filter((r) => !r.failed);
  const productTotal = ok.reduce((s, r) => s + r.products, 0);
  return {
    cases: rows.length,
    failed: rows.filter((r) => r.failed).length,
    providerTrouble: rows.filter((r) => r.providerTrouble).length,
    medianSec: median(ok.map((r) => r.latencyMs)) / 1000,
    p90Sec: (() => {
      const s = ok.map((r) => r.latencyMs).sort((a, b) => a - b);
      return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] / 1000 : 0;
    })(),
    fullCountMean: mean(ok.map((r) => r.fullCount)),
    casesMeetingBar: pct(ok.filter((r) => r.fullCount >= COVERAGE_BAR).length, ok.length),
    optionsPct: pct(ok.reduce((s, r) => s + r.withOptions, 0), productTotal),
    removablePct: pct(ok.reduce((s, r) => s + r.withRemovable, 0), productTotal),
    extrasPct: pct(ok.reduce((s, r) => s + r.withExtras, 0), productTotal),
    descriptionPct: pct(ok.reduce((s, r) => s + r.withDescription, 0), productTotal),
    descInRangePct: pct(ok.reduce((s, r) => s + r.descInRange, 0), productTotal),
    groupsPerProduct: mean(ok.filter((r) => r.groupsPerProduct).map((r) => r.groupsPerProduct)),
    optionsPerGroup: mean(ok.filter((r) => r.optionsPerGroup).map((r) => r.optionsPerGroup)),
    absurdPerCase: mean(ok.map((r) => r.absurd.length)),
    absurdTotal: ok.reduce((s, r) => s + r.absurd.length, 0),
    separationTotal: ok.reduce((s, r) => s + r.separation.length, 0),
    softViolations: ok.reduce((s, r) => s + r.softViolations.length, 0),
    preparedNoDesc: ok.reduce((s, r) => s + r.preparedNoDesc.length, 0),
    newCountMean: mean(ok.map((r) => r.newCount)),
    newDupMenu: ok.reduce((s, r) => s + r.newDupMenu.length, 0),
    newAlien: ok.reduce((s, r) => s + r.newAlien.length, 0),
    jsonErrors: ok.reduce((s, r) => s + r.jsonErrors, 0),
    repairs: ok.reduce((s, r) => s + r.repairs, 0),
    rateLimited: ok.reduce((s, r) => s + r.rateLimited, 0),
    cuisineAccuracy: (() => {
      const withCuisine = ok.filter((r) => r.cuisineOk !== undefined);
      return withCuisine.length ? pct(withCuisine.filter((r) => r.cuisineOk).length, withCuisine.length) : null;
    })(),
    readRecall: (() => {
      const photo = ok.filter((r) => r.readRecall !== undefined);
      return photo.length ? 100 * mean(photo.map((r) => r.readRecall)) : null;
    })(),
    llmCallsMean: mean(ok.map((r) => r.llmCalls)),
  };
}

const groups = {};
for (const r of scored) (groups[`${r.kind}·${r.mode}`] ??= []).push(r);
const byGroup = Object.fromEntries(Object.entries(groups).map(([k, rows]) => [k, aggregate(rows)]));
const overall = aggregate(scored);

const perCuisine = MENUS.map((m) => {
  const rows = scored.filter((r) => r.slug === m.slug && r.kind !== 'repo');
  const get = (kind, mode) => rows.find((r) => r.kind === kind && r.mode === mode);
  return {
    slug: m.slug,
    textQuick: get('text', 'quick')?.fullCount ?? null,
    textFull: get('text', 'full')?.fullCount ?? null,
    photoQuick: get('photo', 'quick')?.fullCount ?? null,
    photoFull: get('photo', 'full')?.fullCount ?? null,
    single: get('single', 'quick')?.fullCount ?? null,
    absurd: rows.reduce((s, r) => s + (r.absurd?.length ?? 0), 0),
    newFull: get('text', 'full')?.newCount ?? null,
  };
});

// Worst cases: the ones a person would complain about first — nothing complete, nonsense options, failures.
const badness = (r) => (r.failed ? 100 : 0) + Math.max(0, COVERAGE_BAR - r.fullCount) * 3 + (r.absurd?.length ?? 0) * 4 + (r.separation?.length ?? 0) * 2 + (r.newDupMenu?.length ?? 0) * 2 + (r.newAlien?.length ?? 0) * 3;
const worst = [...scored].sort((a, b) => badness(b) - badness(a)).slice(0, 10);

const summary = { label: LABEL, generatedAt: new Date().toISOString(), overall, byGroup, perCuisine, worst, cases: scored };
writeFileSync(join(DIR, 'summary.json'), JSON.stringify(summary, null, 1));

// ---- console / markdown -------------------------------------------------------------------------------------------
const f1 = (x) => (x === null || x === undefined ? '–' : Number.isInteger(x) ? String(x) : x.toFixed(1));
if (args.md === 'true') {
  const cols = ['cases', 'failed', 'providerTrouble', 'medianSec', 'p90Sec', 'fullCountMean', 'casesMeetingBar', 'optionsPct', 'removablePct', 'extrasPct', 'descriptionPct', 'descInRangePct', 'groupsPerProduct', 'optionsPerGroup', 'absurdTotal', 'separationTotal', 'softViolations', 'preparedNoDesc', 'newCountMean', 'newDupMenu', 'newAlien', 'jsonErrors', 'repairs', 'cuisineAccuracy', 'readRecall', 'llmCallsMean'];
  console.log(`| metrik | ${Object.keys(byGroup).sort().join(' | ')} | toplam |`);
  console.log(`|---|${Object.keys(byGroup).map(() => '---:').join('|')}|---:|`);
  for (const col of cols) console.log(`| ${col} | ${Object.keys(byGroup).sort().map((k) => f1(byGroup[k][col])).join(' | ')} | ${f1(overall[col])} |`);
  console.log('\n| mutfak | yazı·hızlı | yazı·tam | foto·hızlı | foto·tam | tek ürün | saçma | yeni ürün (tam) |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of perCuisine) console.log(`| ${row.slug} | ${f1(row.textQuick)} | ${f1(row.textFull)} | ${f1(row.photoQuick)} | ${f1(row.photoFull)} | ${f1(row.single)} | ${row.absurd} | ${f1(row.newFull)} |`);
} else {
  console.log(JSON.stringify({ overall, byGroup }, null, 1));
  console.log('\nEN KÖTÜ 10:');
  for (const r of worst) console.log(`- ${r.id}: tam ${r.fullCount}/${r.products} · saçma ${r.absurd?.length ?? 0} · ayrım ${r.separation?.length ?? 0} · ${r.status}`);
}
