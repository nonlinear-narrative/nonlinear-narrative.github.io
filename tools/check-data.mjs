#!/usr/bin/env node
// Validates the site's data against the paper's stated values.
//   node tools/check-data.mjs
// Exits non-zero on any failure. Checks:
//   - every hero order is a permutation of 1..n and reproduces its caption scores;
//   - Figure 2 card positions and gaps follow from the telling order;
//   - shape curves reproduce the Figure 4 τ values;
//   - table internals (pooled row, splits → rates, edge totals) are consistent;
//   - every number printed in index.html with data-k matches paper.json.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../assets/js/metrics.js';
import { fmt, lookup } from '../assets/js/format.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const paper = JSON.parse(read('assets/data/paper.json'));
const hero = JSON.parse(read('assets/data/hero.json'));

let failures = 0, passes = 0;
function check(ok, label, detail = '') {
  if (ok) { passes++; return; }
  failures++;
  console.error(`FAIL  ${label}${detail ? `  (${detail})` : ''}`);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// ---- Figure 2 --------------------------------------------------------------
const f2 = hero.figure2;
const t2 = f2.telling;
check(t2.length === f2.n && M.isPermutation(t2), 'Figure 2 telling is a permutation of 1..18');
const s2 = M.summarize(t2);
check(round(s2.tau, 3) === f2.expected.tau, 'Figure 2 τ = −0.085', `got ${s2.tau}`);
check(round(s2.lis, 2) === f2.expected.lis, 'Figure 2 LIS = 0.50', `got ${s2.lis}`);
check(s2.hops === f2.expected.hops, 'Figure 2 hops = 13', `got ${s2.hops}`);
for (const card of f2.cards) {
  check(t2[card.told - 1] === card.event, `Figure 2 card e${card.event} is told ${String(card.told).padStart(2, '0')}`);
}
const told = f2.cards.map(c => c.told);
const gaps = told.slice(1).map((t, i) => t - told[i] - 1);
check(JSON.stringify(gaps) === JSON.stringify(f2.gaps), 'Figure 2 gaps between cards are +1, +12, +1', `got ${gaps}`);
const open = t2.indexOf(f2.question.opens) + 1, close = t2.indexOf(f2.question.closes) + 1;
check(close - open - 1 === f2.intervening, 'Figure 2 has 16 intervening events', `got ${close - open - 1}`);
check(f2.reveals.from < f2.reveals.to && t2.indexOf(f2.reveals.from) > t2.indexOf(f2.reveals.to),
  'REVEALS runs forward in chronology and backward in the telling');
const roleEvents = Object.values(f2.roles).flat();
check(new Set(roleEvents).size === roleEvents.length, 'Figure 2 roles do not overlap');
check(Object.keys(f2.pictograms.items).length === f2.n, 'Figure 2 has one pictogram description per event');

// ---- Figure 1 --------------------------------------------------------------
for (const t of hero.figure1.tellings) {
  check(t.order.length === hero.figure1.n && M.isPermutation(t.order), `Figure 1 "${t.label}" is a permutation of 1..12`);
  check(round(M.kendallTau(t.order), 2) === t.tau, `Figure 1 "${t.label}" τ = ${t.tau}`, `got ${M.kendallTau(t.order)}`);
}
const [uncued, backward, published] = hero.figure1.tellings;
check(M.discordantPairs(uncued.order) === 1, 'τ = +0.97 is exactly one adjacent swap');
check(M.discordantPairs(published.order) === 62, 'published telling has 62 out-of-order pairs');
check(M.runs(published.order).filter(r => r.length === 2).length === 4, 'published telling keeps four two-event forward runs');
check(uncued.order[uncued.highlight[0] - 1] > uncued.order[uncued.highlight[1] - 1], 'uncued highlight marks the backward step');
check(published.order[published.highlight[1] - 1] === published.order[published.highlight[0] - 1] + 1, 'published highlight marks a forward run');
check(backward.order.every((r, i) => r === 12 - i), 'backward telling is the exact reversal');

// ---- Shapes (Figure 4, Table 5) ---------------------------------------------
const shapes = paper.shapes.items;
check(shapes.reduce((s, x) => s + x.works, 0) === paper.corpus.works, 'shape work counts sum to 83');
for (const s of shapes) {
  const o = s.curve.order;
  check(M.isPermutation(o), `${s.name} curve is a permutation`);
  check(round(M.kendallTau(o), 2) === s.curve.tau, `${s.name} curve τ matches Figure 4`, `got ${M.kendallTau(o)}`);
  const inBand = M.bandHit(M.kendallTau(o), M.lis(o), s.band);
  check(inBand, `${s.name} representative work lies inside its own band`);
}

// ---- Table 1 ----------------------------------------------------------------
const lb = paper.leaderboard;
check(lb.rows.length === 19, 'Table 1 has 19 models');
// The paper pools over valid outputs, not over model rows (make_tables.py), so
// each row is weighted by its valid count; an unweighted mean misses T3/T4 by
// up to 0.003 because the GPT-5.6 models refuse some works.
const pooled = lb.reference.find(r => r.id === 'pooled');
const taskOf = { t1Band: 't1', t1Tau: 't1', t3TauRec: 't3', t3Exact: 't3', t4Acc: 't4', t2TauFree: 't2' };
for (const col of lb.columns) {
  const task = taskOf[col.key];
  const n = lb.rows.reduce((s, r) => s + r.valid[task], 0);
  const mean = lb.rows.reduce((s, r) => s + r[col.key] * r.valid[task], 0) / n;
  check(near(mean, pooled[col.key], 0.0006), `Table 1 pooled ${col.key} equals the valid-output mean within rounding`, `mean ${mean.toFixed(4)} vs ${pooled[col.key]}`);
}
const sorted = lb.rows.every((r, i) => i === 0 || lb.rows[i - 1].t1Band >= r.t1Band);
check(sorted, 'Table 1 rows are sorted by T1 band hit');
check(lb.rows.filter(r => r.t2TauFree > paper.headline.humanTau).length === paper.headline.modelsAboveHuman,
  'all 19 models have T2 τ above the human 0.456');
check(near(Math.min(...lb.rows.map(r => r.t2TauFree)), paper.rq1.freeTauRange[0], 1e-9) &&
  near(Math.max(...lb.rows.map(r => r.t2TauFree)), paper.rq1.freeTauRange[1], 1e-9), 'T2 τ range matches §5.1');
check(near(Math.min(...lb.rows.map(r => r.t1Band)), paper.rq1.bandHitRange[0], 1e-9) &&
  near(Math.max(...lb.rows.map(r => r.t1Band)), paper.rq1.bandHitRange[1], 1e-9), 'band-hit range matches §5.1');

// ---- Table 4 ----------------------------------------------------------------
const c = paper.corpus;
check(c.edgeTypes.reduce((s, e) => s + e.count, 0) === c.edges, 'edge types sum to 3,478');
check(c.media.items.reduce((s, m) => s + m.count, 0) === c.works, 'media counts sum to 83');
check(c.nonlinearWorks + c.chronicleWorks === c.works, '73 nonlinear + 10 chronicle = 83');

// ---- Table 2, Figure 3, Table 13 ------------------------------------------------
for (const cmp of paper.readers.verdicts.comparisons) {
  for (const q of ['better', 'harder', 'ending']) {
    const v = cmp[q];
    check(near(v.w / (v.w + v.l), v.rate, 0.0006), `Table 2 ${cmp.id}/${q} split gives its rate`, `${v.w}/${v.w + v.l}`);
  }
  const total = cmp.better.w + cmp.better.l + cmp.better.t;
  check(['harder', 'ending'].every(q => cmp[q].w + cmp[q].l + cmp[q].t === total), `Table 2 ${cmp.id} has the same item count per question`);
}
for (const row of paper.readers.judgeVsReaders.rows) {
  const [jw, jl] = row.judge, [rw, rl] = row.readers;
  check(near(jw / (jw + jl), row.judgeRate, 0.0006), `Table 13 ${row.id} judge split gives its rate`);
  check(near(rw / (rw + rl), row.readerRate, 0.0006), `Table 13 ${row.id} reader split gives its rate`);
  check(near(row.readerRate - row.judgeRate, row.delta, 0.0011), `Table 13 ${row.id} Δ = readers − judge`);
  const fig = paper.readers.preference.rows.find(r => r.id === row.id);
  check(near(fig.reader[0], row.readerRate, 0.0006) && near(fig.judge[0], row.judgeRate, 0.0006), `Figure 3 ${row.id} agrees with Table 13`);
  check(fig.reader[1] <= fig.reader[0] && fig.reader[0] <= fig.reader[2] && fig.judge[1] <= fig.judge[0] && fig.judge[0] <= fig.judge[2], `Figure 3 ${row.id} intervals contain their estimates`);
  const t2row = paper.readers.verdicts.comparisons.find(r => r.id === row.id);
  check(t2row.better.w === rw && t2row.better.l === rl, `Table 13 ${row.id} reader split matches Table 2`);
}
check(near(1 - paper.readers.verdicts.comparisons[0].better.rate, 0.758, 0.001), 'readers choose the free telling 76% of the time');

// ---- Figure 13 ---------------------------------------------------------------
for (const [i, row] of paper.rq2.confusion.matrix.entries()) {
  const sum = row.reduce((a, b) => a + b, 0);
  check(near(sum, 1, 0.03), `Figure 13 row ${paper.rq2.confusion.labels[i]} sums to 1 within rounding`, sum.toFixed(2));
}

// ---- index.html values ---------------------------------------------------------
const html = read('index.html');
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const tagRe = /<([a-z0-9]+)\b[^>]*\bdata-k="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g;
let printed = 0;
for (const m of html.matchAll(tagRe)) {
  const tag = m[0];
  const path = m[2];
  const format = (/data-f="([^"]+)"/.exec(tag) || [])[1] || 'raw';
  const text = decode(m[3].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  const value = lookup(paper, path);
  check(value !== undefined, `index.html data-k="${path}" exists in paper.json`);
  if (value === undefined) continue;
  const expected = fmt(value, format).replace(/\s+/g, ' ').trim();
  check(text === expected, `index.html ${path} prints ${expected}`, `found "${text}"`);
  printed++;
}
check(printed > 50, 'index.html carries data-k values', `${printed} found`);

console.log(`${passes} checks passed, ${failures} failed; ${printed} printed values compared.`);
process.exit(failures ? 1 : 0);
