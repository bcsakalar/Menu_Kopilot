// Side-by-side table of two or more scored runs, for the reports.
//
//   node tests/ai_eval/compare.mjs baseline after [after-model]
//   node tests/ai_eval/compare.mjs baseline after --group text·full

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const groupIndex = argv.indexOf('--group');
const group = groupIndex >= 0 ? argv[groupIndex + 1] : null;
const labels = argv.filter((a, i) => !a.startsWith('--') && (groupIndex < 0 || i !== groupIndex + 1));

const summaries = labels.map((label) => JSON.parse(readFileSync(join('tests', 'ai_eval', 'results', label, 'summary.json'), 'utf8')));
const rowsOf = (s) => (group ? s.byGroup[group] ?? {} : s.overall);

const METRICS = [
  ['cases', 'senaryo', 0],
  ['providerTrouble', 'sağlayıcı sıkıntısı', 0],
  ['medianSec', 'süre medyan (sn)', 1],
  ['p90Sec', 'süre p90 (sn)', 1],
  ['fullCountMean', 'senaryo başına tam ürün', 1],
  ['casesMeetingBar', '≥6 tam ürün veren senaryo %', 1],
  ['optionsPct', 'opsiyonu olan ürün %', 1],
  ['removablePct', 'çıkarılabiliri olan ürün %', 1],
  ['extrasPct', 'ekstrası olan ürün %', 1],
  ['descriptionPct', 'açıklaması olan ürün %', 1],
  ['descInRangePct', 'açıklaması 6–8 kelime %', 1],
  ['groupsPerProduct', 'ürün başına grup', 1],
  ['optionsPerGroup', 'grup başına seçenek', 1],
  ['absurdTotal', 'saçma grup (kural)', 0],
  ['separationTotal', 'opsiyon–malzeme karışması', 0],
  ['softViolations', 'paketli içecekte açıklama/opsiyon', 0],
  ['preparedNoDesc', 'açıklamasız hazırlanan içecek', 0],
  ['newCountMean', 'senaryo başına yeni ürün', 1],
  ['newDupMenu', 'menüdekinin tekrarı/varyantı', 0],
  ['newAlien', 'mutfağa yabancı yeni ürün', 0],
  ['jsonErrors', 'JSON hatası', 0],
  ['cuisineAccuracy', 'mutfak doğruluğu %', 1],
  ['readRecall', 'menü okuma %', 1],
  ['llmCallsMean', 'senaryo başına model çağrısı', 1],
];

const format = (value, digits) => (value === undefined || value === null || Number.isNaN(value) ? '–' : Number(value).toFixed(digits).replace('.', ','));
console.log(`| metrik | ${labels.join(' | ')} |`);
console.log(`|---|${labels.map(() => '---:').join('|')}|`);
for (const [key, title, digits] of METRICS) {
  console.log(`| ${title} | ${summaries.map((s) => format(rowsOf(s)[key], digits)).join(' | ')} |`);
}
