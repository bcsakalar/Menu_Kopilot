// Runs the evaluation matrix against a running backend (the real pipeline, real providers) and stores one JSON per
// case under tests/ai_eval/results/<label>/. Nothing here scores — score.mjs does that — so a run can be re-scored
// after the rules change without paying for the model calls again.
//
// Matrix: 27 cuisines × {text, photo} × {quick, full}  +  27 "ürün ekle" single-product cases  +  the 3 real photos
// in backend/test/fixtures/images × {quick, full}.  = 141 cases.
//
// Rate limits: one case at a time, a pause after every case (longer after a full-mode one), and a long cool-down
// whenever the providers pushed back (429 / timeout / an agent that fell back to the pool). Cache: a case whose
// result file exists is skipped, so an interrupted run resumes where it stopped (--force re-runs).
//
// usage (repo root, local stack up):
//   node --env-file=.env tests/ai_eval/run.mjs --label baseline
//   node --env-file=.env tests/ai_eval/run.mjs --label after --only kebap-izgara,burger --force
//   node --env-file=.env tests/ai_eval/run.mjs --label after --no-retry --pause 2   (providers out of quota)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MENUS, REPO_PHOTOS } from './menus.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, arg, i, all) => {
    if (arg.startsWith('--')) acc.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
  }, []),
);
const LABEL = args.label ?? 'baseline';
const BASE = `${args.base ?? process.env.EVAL_BASE_URL ?? 'http://127.0.0.1:3030'}/api/v1`;
const OUT = resolve('tests/ai_eval/results', LABEL);
const ONLY = args.only ? new Set(args.only.split(',')) : null;
const KINDS = new Set((args.kinds ?? 'text,photo,single,repo').split(','));
const MODES = (args.modes ?? 'quick,full').split(',');
const FORCE = args.force === 'true';
// With every provider out of its daily quota the retry only waits: --no-retry measures the fallback path as it is.
const RETRY = args['no-retry'] !== 'true';
// Seconds between cases (default: 6 quick, 12 full — free-tier rate limits).
const PAUSE = args.pause !== undefined ? Number(args.pause) * 1000 : null;
const USE_DOCKER = args.docker !== 'false';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

// ---- auth + reference data --------------------------------------------------------------------------------------
async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, deviceName: 'ai-eval' }),
  });
  const body = await res.json();
  if (!body.accessToken) throw new Error(`login failed: ${JSON.stringify(body).slice(0, 200)}`);
  return { authorization: `Bearer ${body.accessToken}` };
}

let auth = await login();
const cuisines = (await (await fetch(`${BASE}/cuisines`, { headers: auth })).json()).data;
const idOf = (slug) => cuisines.find((c) => c.slug === slug)?.id;
writeFileSync(join(OUT, '_cuisines.json'), JSON.stringify(cuisines.map((c) => ({ id: c.id, slug: c.slug, name: c.name, minItemCount: c.minItemCount })), null, 1));

// ---- the matrix -------------------------------------------------------------------------------------------------
const cases = [];
for (const menu of MENUS) {
  if (ONLY && !ONLY.has(menu.slug)) continue;
  for (const mode of MODES) {
    if (KINDS.has('text')) cases.push({ id: `${menu.slug}__text__${mode}`, slug: menu.slug, kind: 'text', mode, cuisineId: idOf(menu.slug), menuText: menu.typed });
    // Photos go in without a cuisine: the representative usually just points the camera. The classifier's answer
    // is part of what is measured.
    if (KINDS.has('photo')) cases.push({ id: `${menu.slug}__photo__${mode}`, slug: menu.slug, kind: 'photo', mode, image: `tests/ai_eval/images/${menu.slug}.jpg` });
  }
  if (KINDS.has('single')) cases.push({ id: `${menu.slug}__single`, slug: menu.slug, kind: 'single', mode: 'quick', cuisineId: idOf(menu.slug), menuText: menu.single });
}
if (KINDS.has('repo')) {
  for (const photo of REPO_PHOTOS) {
    if (ONLY && !ONLY.has(photo.slug)) continue;
    for (const mode of MODES) cases.push({ id: `${photo.id}__${mode}`, slug: photo.slug, kind: 'repo', mode, image: photo.file });
  }
}

// ---- helpers ----------------------------------------------------------------------------------------------------
/** Every model attempt of a run, straight from the local usage log: the only place JSON repairs and 429s show. */
function usageFor(runId) {
  if (!USE_DOCKER) return null;
  try {
    const out = execFileSync(
      'docker',
      ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'menu', '-d', 'menu_kopilot', '-At', '-F', '|', '-c',
        `select task_key, provider, model, success, coalesce(error_code,''), tokens_in, tokens_out, latency_ms from usage_log where run_id = '${runId}' order by created_at`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return out
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [task, provider, model, success, error, tokensIn, tokensOut, latencyMs] = line.split('|');
        return { task, provider, model, ok: success === 't', error: error || null, tokensIn: +tokensIn, tokensOut: +tokensOut, latencyMs: +latencyMs };
      });
  } catch {
    return null;
  }
}

const compactCard = (c) => ({
  section: c.section,
  name: c.name,
  targetName: c.targetName,
  categoryKey: c.categoryKey,
  source: c.source,
  shortDescription: c.shortDescription,
  portionInfo: c.portionInfo,
  optionGroups: (c.optionGroups ?? []).map((g) => ({
    name: g.name,
    selectionType: g.selectionType,
    isRequired: g.isRequired,
    options: g.options.map((o) => [o.name, o.priceMode]),
  })),
  removableIngredients: c.removableIngredients ?? [],
  extraIngredients: c.extraIngredients ?? [],
  fixKind: c.fixKind,
  currentValue: c.currentValue,
  suggestedValue: c.suggestedValue,
  reason: c.reason,
  // Present since the knowledge base (D-179); undefined on the baseline, which predates it.
  productType: c.productType ?? null,
  confidence: c.confidence ?? null,
});

async function runCase(c) {
  const form = new FormData();
  form.append('mode', c.mode);
  form.append('debug', 'true');
  if (c.cuisineId) form.append('cuisineId', c.cuisineId);
  if (c.menuText) form.append('menuText', c.menuText);
  if (c.image) form.append('images', new Blob([readFileSync(c.image)], { type: 'image/jpeg' }), 'menu.jpg');

  const started = Date.now();
  let res = await fetch(`${BASE}/analyze`, { method: 'POST', headers: auth, body: form });
  if (res.status === 401) {
    auth = await login();
    res = await fetch(`${BASE}/analyze`, { method: 'POST', headers: auth, body: form });
  }
  const latencyMs = Date.now() - started;
  const body = await res.json().catch(() => ({}));
  if (res.status !== 200) return { case: c, httpStatus: res.status, latencyMs, error: JSON.stringify(body).slice(0, 400) };

  const trace = await (await fetch(`${BASE}/analyze/${body.runId}/trace`, { headers: auth })).json().catch(() => null);
  return {
    case: c,
    httpStatus: 200,
    latencyMs,
    runId: body.runId,
    status: body.status,
    warnings: body.warnings ?? [],
    classification: body.classification,
    counts: body.counts,
    stats: body.stats,
    menu: (body.menu ?? []).map((m) => ({ name: m.name, categoryKey: m.categoryKey, matched: m.matchedTemplateId !== null, typed: m.typed })),
    cards: (body.cards ?? []).map(compactCard),
    trace: (trace?.steps ?? []).map((s) => ({
      agent: s.agent,
      status: s.status,
      provider: s.provider,
      model: s.model,
      durationMs: s.durationMs,
      llmCalls: s.llmCalls,
      tokensIn: s.tokensIn,
      tokensOut: s.tokensOut,
      error: s.error,
      output: s.output,
    })),
    usage: usageFor(body.runId),
  };
}

/**
 * The providers cost the run something the user would see: a section fell back to the pool, or the whole request
 * failed. A 429 or a timeout that the next provider in the chain absorbed is NOT trouble — it is recorded in
 * `usage` and counted by the scorer, but the answer the user got was complete.
 */
const troubled = (r) =>
  r.httpStatus !== 200 ||
  (r.warnings ?? []).some((w) => ['slow_providers', 'recommend_failed', 'options_failed', 'agent_failed', 'ai_off'].includes(w.code)) ||
  (r.usage ?? []).some((u) => u.error === 'quota_exceeded');

// ---- run --------------------------------------------------------------------------------------------------------
console.log(`${cases.length} vaka → ${OUT}`);
let done = 0;
for (const c of cases) {
  const file = join(OUT, `${c.id}.json`);
  if (!FORCE && existsSync(file)) {
    done += 1;
    continue;
  }
  let result = await runCase(c);
  // One retry after a cool-down when the providers were the problem, so a rate-limit window does not decide the score.
  if (RETRY && troubled(result)) {
    console.log(`  ${c.id}: sağlayıcı sıkıntısı, 75 sn bekleyip bir kez daha`);
    await sleep(75_000);
    const retry = await runCase(c);
    retry.retried = true;
    retry.firstAttempt = { status: result.status, warnings: result.warnings, httpStatus: result.httpStatus };
    result = retry;
  }
  result.providerTrouble = troubled(result);
  writeFileSync(file, JSON.stringify(result, null, 1));
  done += 1;
  const newCount = (result.cards ?? []).filter((x) => x.section === 'new_product').length;
  const optCount = (result.cards ?? []).filter((x) => x.section === 'option').length;
  console.log(
    `[${done}/${cases.length}] ${c.id}  ${(result.latencyMs / 1000).toFixed(1)} sn  ${result.status ?? result.httpStatus}  yeni ${newCount} · opsiyon ${optCount}${result.providerTrouble ? '  (sağlayıcı sıkıntısı)' : ''}`,
  );
  await sleep(PAUSE ?? (c.mode === 'full' ? 12_000 : 6_000));
}
console.log('bitti');
