// Manual review sample: N products with options, drawn the same way from any run, written as markdown for a person
// to read and judge. The acceptance criterion "absürt opsiyon ≈ 0" is checked by reading these, not by the rules.
//
//   node tests/ai_eval/sample.mjs --label baseline --n 40 > docs/ai-eval/sample-baseline.md

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { norm } from './rules.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : null)).filter(Boolean));
const LABEL = args.label ?? 'after';
const N = Number(args.n ?? 40);
const DIR = join('tests', 'ai_eval', 'results', LABEL);

/** Deterministic: the same seed draws the same products from two runs of the same menus. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_') && f !== 'summary.json').sort();
const pool = [];
const seen = new Set();
for (const file of files) {
  const r = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  for (const c of r.cards ?? []) {
    if (c.section === 'fix' || (c.optionGroups ?? []).length === 0) continue;
    const key = norm(c.targetName ?? c.name);
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push({ case: file.replace('.json', ''), card: c });
  }
}
pool.sort((a, b) => norm(a.card.targetName ?? a.card.name).localeCompare(norm(b.card.targetName ?? b.card.name)));
const random = rng(20260924);
const picked = [];
while (picked.length < Math.min(N, pool.length)) {
  const index = Math.floor(random() * pool.length);
  const [item] = pool.splice(index, 1);
  picked.push(item);
}

console.log(`# Manuel örneklem — ${LABEL}\n`);
console.log(`${pool.length + picked.length} farklı üründen ${picked.length} tanesi, sabit tohumla rastgele seçildi.\n`);
for (const [i, { case: id, card }] of picked.entries()) {
  const title = card.targetName ?? card.name;
  console.log(`## ${i + 1}. ${title} (${card.section === 'new_product' ? 'yeni ürün' : 'menüde'} · ${id})\n`);
  for (const g of card.optionGroups) {
    const options = g.options.map(([name, mode]) => (mode === 'sets_base' ? `${name}*` : mode === 'surcharge' ? `${name}+` : name)).join(', ');
    console.log(`- **${g.name}**: ${options}`);
  }
  console.log(`- Çıkarılabilir: ${(card.removableIngredients ?? []).join(', ') || '—'}`);
  console.log(`- Ekstra: ${(card.extraIngredients ?? []).join(', ') || '—'}`);
  console.log(`- Açıklama: ${card.shortDescription || '—'}`);
  console.log('');
}
