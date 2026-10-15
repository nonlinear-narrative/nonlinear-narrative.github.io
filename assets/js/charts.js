// Redrawn charts. Each chart is drawn at the container's pixel width (so text
// stays legible on phones) and redrawn on resize and theme change. Every mark
// has a hover/focus tooltip; every chart has a table view in the HTML.

import { fmt } from './format.js';
import { showTip, showTipFor, hideTip } from './tooltip.js';

const NS = 'http://www.w3.org/2000/svg';
function el(parent, tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    // Inline style, so a per-layout size beats the class's CSS size.
    if (k === 'font-size') node.style.fontSize = `${v}px`;
    else node.setAttribute(k, v);
  }
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}
function h(parent, tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}
const pct = (v, d = 0) => fmt(v, `p${d}`);
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Hover + focus tooltip on a mark; the hit target can be larger than the mark.
function tip(node, content, highlight) {
  node.setAttribute('tabindex', '0');
  node.setAttribute('role', 'img');
  const label = [content.value, content.title, ...(content.lines || [])].filter(Boolean).join(', ');
  node.setAttribute('aria-label', label);
  node.addEventListener('pointerenter', e => { showTip(content, e.clientX, e.clientY); highlight?.(true); });
  node.addEventListener('pointermove', e => showTip(content, e.clientX, e.clientY));
  node.addEventListener('pointerleave', () => { hideTip(); highlight?.(false); });
  node.addEventListener('focus', () => { showTipFor(node, content); highlight?.(true); });
  node.addEventListener('blur', () => { hideTip(); highlight?.(false); });
}

// Draw on width; redraw on resize and on theme change.
const registry = new Set();
function responsive(container, draw) {
  let last = 0;
  const render = () => {
    const w = Math.floor(container.clientWidth);
    if (!w) return;
    last = w;
    container.replaceChildren();
    draw(container, w);
  };
  const ro = new ResizeObserver(() => {
    const w = Math.floor(container.clientWidth);
    if (w && Math.abs(w - last) > 2) render();
  });
  ro.observe(container);
  registry.add(render);
  render();
}
export function redrawAll() { registry.forEach(r => r()); }

function svgRoot(container, w, height, label) {
  return el(container, 'svg', { width: w, height, viewBox: `0 0 ${w} ${height}`, role: 'group', 'aria-label': label });
}

function legend(container, items) {
  const ul = h(container, 'ul', 'chart-legend');
  for (const item of items) {
    const li = h(ul, 'li');
    const key = h(li, 'span', `legend-key legend-${item.kind || 'rect'} ${item.cls}`);
    key.setAttribute('aria-hidden', 'true');
    li.appendChild(document.createTextNode(item.label));
  }
  return ul;
}

// ---------------------------------------------------------------------------
// RQ1: T1 band hit by requested shape (Table 5), one series, rule shapes marked.
export function shapeBars(container, paper) {
  const order = ['zigzag', 'prolepsis', 'analepsis', 'syllepsis', 'achrony', 'chronicle', 'retrograde'];
  const rows = order.map(k => paper.shapes.items.find(s => s.key === k));
  const rule = new Set(['chronicle', 'retrograde']);
  const pooled = paper.rq1.pooledBandHit, random = paper.rq1.randomBandHit;
  legend(container.parentNode.insertBefore(h(null, 'div', 'legend-wrap'), container), [
    { label: 'band hit when asked for the shape', cls: 'is-a' },
    { label: 'shapes stated as a rule on event ranks', cls: 'is-b' },
  ]);
  responsive(container, (box, w) => {
    const narrow = w < 520;
    const left = narrow ? 92 : 112, right = narrow ? 44 : 190, top = 30, rowH = 34, barH = 18;
    const H = top + rows.length * rowH + 30;
    const svg = svgRoot(box, w, H, 'Bar chart: T1 band hit by requested shape');
    const x = v => left + v * (w - left - right);
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      el(svg, 'line', { class: 'c-grid', x1: x(v), x2: x(v), y1: top - 6, y2: H - 24 });
      el(svg, 'text', { class: 'c-muted', x: x(v), y: H - 8, 'text-anchor': 'middle' }, pct(v));
    }
    const refs = [[random, 'random 8.4%'], [pooled, 'pooled 47.9%']];
    refs.forEach(([v, label], i) => {
      el(svg, 'line', { class: 'c-ref', x1: x(v), x2: x(v), y1: top - 10, y2: H - 24, 'stroke-width': 1.5 });
      el(svg, 'text', { class: 'c-muted', x: x(v) + (i ? 4 : -4), y: top - 14, 'text-anchor': i ? 'start' : 'end' }, label);
    });
    rows.forEach((s, i) => {
      const y = top + i * rowH + (rowH - barH) / 2;
      const isRule = rule.has(s.key);
      el(svg, 'text', { class: 'c-label', x: left - 10, y: y + barH - 4, 'text-anchor': 'end' }, s.name);
      const bw = Math.max(2, x(s.t1.bandHit) - left);
      el(svg, 'rect', { class: `c-bar${isRule ? ' is-b' : ''}`, x: left, y, width: bw, height: barH });
      el(svg, 'text', { class: 'c-value', x: left + bw + 6, y: y + barH - 4 }, pct(s.t1.bandHit, 1));
      if (isRule && !narrow) {
        const what = s.key === 'retrograde' ? 'exact reversals' : 'exact identities';
        el(svg, 'text', { class: 'c-muted', x: left + bw + 58, y: y + barH - 4 }, `${pct(s.t1.exactForm, 1)} ${what}`);
      }
      const hit = el(svg, 'rect', { class: 'c-hit', x: 0, y: y - 6, width: w, height: barH + 12 });
      tip(hit, {
        value: pct(s.t1.bandHit, 1), title: `${s.name}: band hit`,
        lines: [`model τ ${fmt(s.t1.modelTau, 'd3')} · human τ ${fmt(s.t1.humanTau, 'd3')}`, `agreement with gold ${fmt(s.t1.agree, 'd3')}`,
          ...(s.t1.exactForm !== null ? [`${pct(s.t1.exactForm, 1)} ${s.key === 'retrograde' ? 'exact reversals' : 'exact identities'}`] : [])],
      });
    });
  });
}

// ---------------------------------------------------------------------------
// RQ2: the no-story floor (Table 7) as two small dumbbell panels.
export function floorChart(container, paper) {
  const rows = paper.rq2.dedate.rows;
  const pairs = ['as written', 'de-dated'].map(events => ({
    events,
    none: rows.find(r => r.events === events && r.telling.startsWith('shuffled')),
    told: rows.find(r => r.events === events && r.telling.startsWith('gold')),
  }));
  legend(container.parentNode.insertBefore(h(null, 'div', 'legend-wrap'), container), [
    { label: 'no story: events shuffled, no telling', cls: 'is-b', kind: 'dot' },
    { label: 'with the gold told order', cls: 'is-a', kind: 'dot' },
  ]);
  const panels = [
    { key: 'tau', title: 'τ_rec', domain: [0.8, 0.9], ticks: [0.8, 0.85, 0.9], f: 'd3' },
    { key: 'exact', title: 'exact match', domain: [0, 0.25], ticks: [0, 0.1, 0.2], f: 'd3' },
  ];
  responsive(container, (box, w) => {
    const stack = w < 560;
    const pw = stack ? w : (w - 24) / 2;
    const ph = 112;
    const H = stack ? ph * 2 + 16 : ph;
    const svg = svgRoot(box, w, H, 'Dumbbell charts: reconstruction with and without the telling');
    panels.forEach((p, j) => {
      const ox = stack ? 0 : j * (pw + 24), oy = stack ? j * (ph + 16) : 0;
      const left = ox + 92, right = ox + pw - 18;
      const x = v => left + ((v - p.domain[0]) / (p.domain[1] - p.domain[0])) * (right - left);
      el(svg, 'text', { class: 'c-label', x: ox, y: oy + 14 }, p.title === 'τ_rec' ? 'τ rec' : p.title);
      for (const v of p.ticks) {
        el(svg, 'line', { class: 'c-grid', x1: x(v), x2: x(v), y1: oy + 24, y2: oy + ph - 22 });
        el(svg, 'text', { class: 'c-muted', x: x(v), y: oy + ph - 6, 'text-anchor': 'middle' }, fmt(v, p.key === 'tau' ? 'd2' : 'd1'));
      }
      pairs.forEach((pair, i) => {
        const y = oy + 42 + i * 30;
        el(svg, 'text', { class: 'c-text', x: left - 10, y: y + 4, 'text-anchor': 'end' }, pair.events);
        const a = x(pair.none[p.key]), b = x(pair.told[p.key]);
        el(svg, 'line', { x1: a, x2: b, y1: y, y2: y, class: 'c-ref', 'stroke-width': 2 });
        for (const [cx, cls, v, label] of [[a, 'c-b', pair.none[p.key], 'no story'], [b, 'c-a', pair.told[p.key], 'with the telling']]) {
          el(svg, 'circle', { class: `${cls} c-ring`, cx, cy: y, r: 6 });
          const hit = el(svg, 'circle', { class: 'c-hit', cx, cy: y, r: 13 });
          tip(hit, { value: fmt(v, p.f), title: `${p.title === 'τ_rec' ? 'τ rec' : p.title}, ${label}`, lines: [`event list ${pair.events}`] });
        }
        if (i === 0) {
          el(svg, 'text', { class: 'c-muted', x: a, y: y - 11, 'text-anchor': 'middle' }, fmt(pair.none[p.key], p.f));
          el(svg, 'text', { class: 'c-muted', x: b, y: y - 11, 'text-anchor': 'middle' }, fmt(pair.told[p.key], p.f));
        }
      });
    });
  });
}

// ---------------------------------------------------------------------------
// RQ2: T4 confusion heatmap (Figure 13), one sequential hue.
function mix(a, b, t) {
  const pa = a.match(/\w\w/g).map(x => parseInt(x, 16)), pb = b.match(/\w\w/g).map(x => parseInt(x, 16));
  return pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
}
const luminance = rgb => {
  const c = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export function confusionChart(container, paper) {
  const cf = paper.rq2.confusion;
  const short = { Achrony: 'Achr.', Analepsis: 'Anal.', Chronicle: 'Chron.', Prolepsis: 'Prol.', Retrograde: 'Retr.', Syllepsis: 'Syll.', Zigzag: 'Zig.' };
  responsive(container, (box, w) => {
    const narrow = w < 520;
    const left = narrow ? 62 : 104, top = narrow ? 74 : 46;
    const size = Math.min(54, Math.floor((w - left - 8) / 7));
    const H = top + size * 7 + 30;
    const svg = svgRoot(box, w, H, 'Heatmap: T4 confusion, gold rows by predicted columns');
    const c0 = cssVar('--heat-0').replace('#', ''), c1 = cssVar('--heat-1').replace('#', '');
    const ink = cssVar('--ink');
    const heatTextLight = cssVar('--strip-ink'), heatTextDark = cssVar('--ink');
    el(svg, 'text', { class: 'c-muted', x: left + (size * 7) / 2, y: 12, 'text-anchor': 'middle' }, 'predicted →');
    el(svg, 'text', { class: 'c-muted', x: 10, y: top + (size * 7) / 2, 'text-anchor': 'middle', transform: `rotate(-90 10 ${top + (size * 7) / 2})` }, 'gold →');
    cf.labels.forEach((lab, j) => {
      const cx = left + j * size + size / 2;
      if (narrow) el(svg, 'text', { class: 'c-text', x: cx + 4, y: top - 6, 'text-anchor': 'start', 'font-size': 10.5, transform: `rotate(-60 ${cx + 4} ${top - 6})` }, short[lab]);
      else el(svg, 'text', { class: 'c-text', x: cx, y: top - 8, 'text-anchor': 'middle', 'font-size': 11.5 }, lab.slice(0, 6) + (lab.length > 6 ? '.' : ''));
      el(svg, 'text', { class: 'c-text', x: left - 8, y: top + j * size + size / 2 + 4, 'text-anchor': 'end', 'font-size': narrow ? 10.5 : 12 }, narrow ? short[lab] : lab);
    });
    cf.matrix.forEach((row, i) => row.forEach((v, j) => {
      const rgb = mix(c0, c1, Math.sqrt(v));
      const x = left + j * size, y = top + i * size;
      const cell = el(svg, 'rect', { class: 'c-cell', x: x + 1, y: y + 1, width: size - 2, height: size - 2, fill: `rgb(${rgb.join(',')})` });
      if (i === j) el(svg, 'rect', { x: x + 1, y: y + 1, width: size - 2, height: size - 2, fill: 'none', stroke: ink, 'stroke-width': 2, class: 'c-cell c-overlay' });
      if (v >= 0.005) {
        const light = luminance(rgb) < 0.35;
        el(svg, 'text', { class: 'c-cell-text', x: x + size / 2, y: y + size / 2 + 5, 'text-anchor': 'middle', fill: light ? heatTextLight : heatTextDark, 'font-size': narrow ? 12 : 14 }, fmt(v, 'd2').replace(/^0/, ''));
      }
      tip(cell, { value: fmt(v, 'd2'), title: `gold ${cf.labels[i]} → predicted ${cf.labels[j]}`, lines: [i === j ? 'correct label' : 'confusion'] });
    }));
  });
}

// ---------------------------------------------------------------------------
// RQ3: the scaffolding study (Table 8): band hit, full graph emphasized.
export function graphStudyChart(container, paper) {
  const rows = paper.rq3.conditions.rows;
  responsive(container, (box, w) => {
    const narrow = w < 520;
    const left = narrow ? 150 : 220, right = 54, top = 10, rowH = 30, barH = 16;
    const H = top + rows.length * rowH + 14 + 30;
    const svg = svgRoot(box, w, H, 'Bar chart: band hit by scaffolding condition');
    const x = v => left + v * (w - left - right);
    for (const v of [0, 0.5, 1]) {
      el(svg, 'line', { class: 'c-grid', x1: x(v), x2: x(v), y1: top, y2: H - 24 });
      el(svg, 'text', { class: 'c-muted', x: x(v), y: H - 8, 'text-anchor': 'middle' }, pct(v));
    }
    rows.forEach((r, i) => {
      const y = top + i * rowH + (r.group === 'ablation' ? 14 : 0) + (rowH - barH) / 2;
      if (i === 3) el(svg, 'text', { class: 'c-muted', x: 0, y: y - 6 }, 'ablations of G1');
      const name = r.group === 'condition' ? `${r.id} ${r.label}` : r.label.replace(/\s+\/\s+/g, '/');
      el(svg, 'text', { class: 'c-text', x: left - 10, y: y + barH - 3, 'text-anchor': 'end', 'font-size': narrow ? 11 : 12.5, 'font-weight': r.id === 'G1' ? 700 : 400 }, narrow && name.length > 22 ? name.slice(0, 21) + '…' : name);
      const bw = Math.max(2, x(r.bandHit) - left);
      el(svg, 'rect', { class: r.id === 'G1' ? 'c-bar' : 'c-tie', x: left, y, width: bw, height: barH });
      el(svg, 'text', { class: 'c-value', x: left + bw + 6, y: y + barH - 3, 'font-size': 13 }, pct(r.bandHit, 1));
      const hit = el(svg, 'rect', { class: 'c-hit', x: 0, y: y - 6, width: w, height: barH + 12 });
      tip(hit, { value: pct(r.bandHit, 1), title: `${name}: band hit`, lines: [`τ ${fmt(r.tau, 'd3')} · agree ${fmt(r.agree, 'd3')} · PDS ${fmt(r.pds, 'd2')}`] });
    });
  });
}

// ---------------------------------------------------------------------------
// Split bar (HTML): first-named wins | ties | second-named wins.
function splitBar(parent, { w, t, l, firstLabel, secondLabel, title }) {
  const bar = h(parent, 'div', 'split');
  const total = w + t + l;
  const segs = [[w, 'seg-a', `${firstLabel} wins`], [t, 'seg-tie', 'ties'], [l, 'seg-b', `${secondLabel} wins`]];
  for (const [n, cls, label] of segs) {
    const seg = h(bar, 'span', `split-seg ${cls}`);
    seg.style.flexGrow = String(n);
    const share = n / total;
    if (share > 0.09) h(seg, 'span', 'seg-text', String(n));
    tip(seg, { value: String(n), title: `${title}: ${label}`, lines: [`${pct(share)} of ${total} responses`] });
  }
  return bar;
}

export function cuedSplit(container, paper) {
  const j = paper.rq4.judge, r = paper.rq4.readers;
  legend(container, [
    { label: 'instructed wins', cls: 'is-a' }, { label: 'tie', cls: 'is-tie' }, { label: 'left alone wins', cls: 'is-b' },
  ]);
  const grid = h(container, 'div', 'split-grid');
  for (const [name, d] of [['Judge', j], ['Readers', r]]) {
    const row = h(grid, 'div', 'split-row');
    h(row, 'span', 'split-name', name);
    splitBar(row, { w: d.cued, t: d.ties, l: d.free, firstLabel: 'instructed', secondLabel: 'left alone', title: name });
    h(row, 'span', 'split-rate', `${pct(d.cued / (d.cued + d.free))} instructed`);
  }
}

// ---------------------------------------------------------------------------
// Table 2: reader verdicts, three questions per comparison.
export function verdictsChart(container, paper) {
  const v = paper.readers.verdicts;
  legend(container, [
    { label: 'first-named condition wins', cls: 'is-a' }, { label: 'tie', cls: 'is-tie' }, { label: 'second-named wins', cls: 'is-b' },
  ]);
  const q = [['better', 'better story'], ['harder', 'harder to follow'], ['ending', 'better ending']];
  const list = h(container, 'div', 'verdicts');
  for (const c of v.comparisons) {
    const block = h(list, 'div', 'verdict-block');
    const head = h(block, 'p', 'verdict-head');
    h(head, 'span', 'v-first', c.first);
    h(head, 'span', 'v-vs', ' vs. ');
    h(head, 'span', 'v-second', c.second);
    for (const [key, label] of q) {
      const d = c[key];
      const row = h(block, 'div', 'split-row');
      h(row, 'span', 'split-name', label);
      splitBar(row, { w: d.w, t: d.t, l: d.l, firstLabel: c.first, secondLabel: c.second, title: `${c.first} vs. ${c.second}, ${label}` });
      const rate = h(row, 'span', 'split-rate');
      h(rate, 'strong', null, fmt(d.rate, 'd3'));
      h(rate, 'span', 'split-p', ` p ${d.p.startsWith('<') ? d.p.replace('<', '< ') : '= ' + d.p}`);
      if (d.tag) h(rate, 'span', `tag tag-${d.tag}`, v.tags[d.tag]);
    }
    const adj = h(block, 'p', 'verdict-adj');
    adj.append('better story, length-adjusted: ');
    h(adj, 'strong', null, fmt(c.adjRate, 'd3'));
    if (c.adjTag) { adj.append(' '); h(adj, 'span', `tag tag-${c.adjTag}`, v.tags[c.adjTag]); }
  }
}

// ---------------------------------------------------------------------------
// Figure 3: readers and the judge, share favoring the first-named condition.
export function preferenceChart(container, paper) {
  const rows = paper.readers.preference.rows;
  legend(container.parentNode.insertBefore(h(null, 'div', 'legend-wrap'), container), [
    { label: 'human readers (reader-clustered bootstrap 95% interval)', cls: 'is-a', kind: 'dot' },
    { label: 'automated judge (exact binomial 95% interval)', cls: 'is-b', kind: 'diamond' },
  ]);
  responsive(container, (box, w) => {
    const narrow = w < 520;
    const left = narrow ? 124 : 170, right = 20, top = 8, rowH = narrow ? 58 : 50;
    const H = top + rows.length * rowH + 34;
    const svg = svgRoot(box, w, H, 'Dot plot: preference rates of readers and the judge');
    const x = v => left + v * (w - left - right);
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      el(svg, 'line', { class: v === 0.5 ? 'c-ref' : 'c-grid', x1: x(v), x2: x(v), y1: top, y2: H - 26 });
      el(svg, 'text', { class: 'c-muted', x: x(v), y: H - 10, 'text-anchor': 'middle' }, v === 0.5 ? '.5' : String(v));
    }
    rows.forEach((r, i) => {
      const yc = top + i * rowH + rowH / 2;
      el(svg, 'text', { class: 'c-label', x: left - 12, y: yc - 4, 'text-anchor': 'end', 'font-size': narrow ? 13 : 15 }, r.first);
      el(svg, 'text', { class: 'c-text', x: left - 12, y: yc + 12, 'text-anchor': 'end', 'font-size': narrow ? 11 : 12 }, `vs. ${r.second}`);
      const series = [['reader', 'readers', yc - 8, 'a'], ['judge', 'judge', yc + 8, 'b']];
      for (const [key, name, y, s] of series) {
        const [m, lo, hi] = r[key];
        el(svg, 'line', { class: `c-${s}-stroke`, x1: x(lo), x2: x(hi), y1: y, y2: y });
        if (s === 'a') el(svg, 'circle', { class: 'c-a c-ring', cx: x(m), cy: y, r: 5.5 });
        else el(svg, 'rect', { class: 'c-b c-ring', x: x(m) - 5, y: y - 5, width: 10, height: 10, transform: `rotate(45 ${x(m)} ${y})` });
        const right = m < 0.5;
        el(svg, 'text', { class: 'c-muted', x: right ? x(hi) + 6 : x(lo) - 6, y: y + 4, 'text-anchor': right ? 'start' : 'end' }, pct(m));
        const hit = el(svg, 'rect', { class: 'c-hit', x: x(lo) - 8, y: y - 8, width: Math.max(24, x(hi) - x(lo) + 16), height: 16 });
        tip(hit, { value: pct(m), title: `${name}: ${r.first} over ${r.second}`, lines: [`95% interval ${pct(lo)}–${pct(hi)}`] });
      }
    });
  });
  const axisNote = h(null, 'p', 'chart-axis-note', 'Share of decisive verdicts favoring the first-named condition; .5 is no preference.');
  container.after(axisNote);
}

// ---------------------------------------------------------------------------
// Table 13: item-level κ between judge and readers, with 95% CIs.
export function kappaChart(container, paper) {
  const rows = paper.readers.judgeVsReaders.rows;
  responsive(container, (box, w) => {
    const narrow = w < 560;
    const left = narrow ? 124 : 180, right = narrow ? 14 : 200, top = 8, rowH = narrow ? 78 : 46;
    const H = top + rows.length * rowH + 30;
    const svg = svgRoot(box, w, H, 'Forest plot: Cohen’s kappa between judge and readers by comparison');
    const lo = -0.3, hi = 1;
    const x = v => left + ((v - lo) / (hi - lo)) * (w - left - right);
    for (const v of narrow ? [0, 0.5, 1] : [-0.25, 0, 0.25, 0.5, 0.75, 1]) {
      el(svg, 'line', { class: v === 0 ? 'c-ref' : 'c-grid', x1: x(v), x2: x(v), y1: top, y2: H - 24 });
      el(svg, 'text', { class: 'c-muted', x: x(v), y: H - 8, 'text-anchor': 'middle' }, fmt(v, 'd2').replace('0.', '.'));
    }
    rows.forEach((r, i) => {
      const yc = top + i * rowH + (narrow ? 20 : rowH / 2);
      el(svg, 'text', { class: 'c-label', x: left - 12, y: yc - 2, 'text-anchor': 'end', 'font-size': narrow ? 13 : 15 }, r.first);
      el(svg, 'text', { class: 'c-text', x: left - 12, y: yc + 13, 'text-anchor': 'end', 'font-size': narrow ? 11 : 12 }, `vs. ${narrow ? r.second.replace('one layer', 'layer') : r.second}`);
      el(svg, 'line', { class: 'c-a-stroke', x1: x(r.ci[0]), x2: x(r.ci[1]), y1: yc, y2: yc });
      el(svg, 'rect', { class: 'c-a c-ring', x: x(r.kappa) - 5, y: yc - 5, width: 10, height: 10 });
      const verdictX = narrow ? x(r.ci[1]) + 8 : w - right + 16;
      const verdictY = narrow ? yc + 4 : yc + 4;
      const label = `κ ${fmt(r.kappa, 's2')} · ${r.verdict}`;
      if (narrow) {
        el(svg, 'text', { class: 'c-text', x: 8, y: yc + 32, 'font-size': 12, 'font-weight': 500 }, label);
        el(svg, 'text', { class: 'c-muted', x: 8, y: yc + 47 }, `judge ${pct(r.judgeRate)} · readers ${pct(r.readerRate)}`);
      } else {
        el(svg, 'text', { class: 'c-text', x: verdictX, y: verdictY - 6, 'font-size': 13, 'font-weight': 500 }, label);
        el(svg, 'text', { class: 'c-muted', x: verdictX, y: verdictY + 10 }, `judge ${pct(r.judgeRate)} · readers ${pct(r.readerRate)}`);
      }
      const hit = el(svg, 'rect', { class: 'c-hit', x: x(r.ci[0]) - 8, y: yc - 10, width: Math.max(24, x(r.ci[1]) - x(r.ci[0]) + 16), height: 20 });
      tip(hit, { value: `κ ${fmt(r.kappa, 's3')}`, title: `${r.first} vs. ${r.second}`, lines: [`95% CI [${fmt(r.ci[0], 's2')}, ${fmt(r.ci[1], 's2')}], n = ${r.n}`, `verdict: ${r.verdict}`] });
    });
  });
}

// ---------------------------------------------------------------------------
// Story curve for the shape browser: told position across, chronology up.
export function storyCurve(container, shape, { active = true, paused = false, reducedMotion = false } = {}) {
  const order = shape.curve.order;
  const n = order.length;
  const stepMs = 450, holdMs = 1400;
  const cycleMs = (n - 1) * stepMs + holdMs;
  const W = 300, Hh = 280, pad = 30;
  const svg = el(null, 'svg', { class: 'shape-curve-svg', viewBox: `0 0 ${W} ${Hh}`, role: 'img', 'aria-label': `${shape.name} story curve: told order ${order.join(' ')}`, 'data-point-count': n });
  const x = i => pad + ((i - 1) / (n - 1)) * (W - pad - 12);
  const y = r => Hh - pad - ((r - 1) / (n - 1)) * (Hh - pad - 12);
  for (let i = 1; i <= n; i++) {
    el(svg, 'line', { class: 'c-grid', x1: x(i), x2: x(i), y1: y(1) + 4, y2: y(n) - 4, opacity: 0.6 });
    el(svg, 'line', { class: 'c-grid', x1: x(1) - 4, x2: x(n) + 4, y1: y(i), y2: y(i), opacity: 0.6 });
  }
  el(svg, 'line', { class: 'c-axis', x1: x(1) - 8, x2: x(n) + 6, y1: y(1) + 8, y2: y(1) + 8 });
  el(svg, 'line', { class: 'c-axis', x1: x(1) - 8, x2: x(1) - 8, y1: y(1) + 8, y2: y(n) - 6 });
  el(svg, 'line', { x1: x(1), y1: y(1), x2: x(n), y2: y(n), class: 'h-diagonal' });
  el(svg, 'text', { class: 'c-muted', x: (x(1) + x(n)) / 2, y: Hh - 6, 'text-anchor': 'middle' }, 'told position (syuzhet) →');
  el(svg, 'text', { class: 'c-muted', x: 10, y: (y(1) + y(n)) / 2, 'text-anchor': 'middle', transform: `rotate(-90 10 ${(y(1) + y(n)) / 2})` }, 'chronology (fabula) →');
  const line = el(svg, 'polyline', { class: 'c-a-stroke shape-curve-trail', 'stroke-linejoin': 'round', points: '' });
  const dots = order.map((r, i) => {
    const d = el(svg, 'rect', { class: 'c-a shape-curve-point', x: x(i + 1) - 3, y: y(r) - 3, width: 6, height: 6, 'shape-rendering': 'crispEdges' });
    const hit = el(svg, 'rect', { class: 'c-hit', x: x(i + 1) - 8, y: y(r) - 8, width: 16, height: 16 });
    tip(hit, { value: `told ${i + 1}`, title: `chronological rank ${r}`, lines: [shape.name] });
    hit.setAttribute('tabindex', '-1');
    return { mark: d, hit };
  });
  const current = el(svg, 'circle', { class: 'shape-curve-current', r: 7.5, 'aria-hidden': 'true' });
  const full = order.map((r, i) => `${x(i + 1)},${y(r)}`);
  container.prepend(svg);
  let visible = false, elapsed = 0, cycle = 0;
  let raf = null, lastTime = null, destroyed = false, lastCount = -1;
  const canRun = () => active && visible && !paused && !reducedMotion && !document.hidden && !destroyed;

  function render() {
    const count = reducedMotion ? n : Math.min(n, 1 + Math.floor(elapsed / stepMs));
    if (count !== lastCount) {
      line.setAttribute('points', full.slice(0, count).join(' '));
      dots.forEach(({ mark, hit }, i) => {
        const visibility = i < count ? 'visible' : 'hidden';
        mark.setAttribute('visibility', visibility);
        hit.setAttribute('visibility', visibility);
      });
      current.setAttribute('cx', x(count));
      current.setAttribute('cy', y(order[count - 1]));
      lastCount = count;
    }
    current.setAttribute('visibility', reducedMotion ? 'hidden' : 'visible');
    svg.dataset.visiblePoints = String(count);
    svg.dataset.currentPoint = String(count);
    svg.dataset.cycle = String(cycle);
    svg.dataset.playback = reducedMotion ? 'reduced' : paused ? 'paused' : canRun() ? 'running' : 'suspended';
  }

  function advance(now) {
    if (lastTime !== null) elapsed += Math.max(0, now - lastTime);
    lastTime = now;
    if (elapsed >= cycleMs) {
      cycle += Math.floor(elapsed / cycleMs);
      elapsed %= cycleMs;
    }
  }

  function stop() {
    if (raf !== null) {
      advance(performance.now());
      cancelAnimationFrame(raf);
      raf = null;
    }
    lastTime = null;
  }

  function tick(now) {
    raf = null;
    if (!canRun()) { lastTime = null; render(); return; }
    advance(now);
    render();
    raf = requestAnimationFrame(tick);
  }

  function sync() {
    if (!canRun()) stop();
    else if (raf === null) {
      lastTime = performance.now();
      raf = requestAnimationFrame(tick);
    }
    render();
  }

  function restart() {
    stop();
    elapsed = 0;
    cycle = 0;
    sync();
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && entry.intersectionRatio >= 0.35;
    sync();
  }, { threshold: [0, 0.35] });
  observer.observe(container);
  const onVisibilityChange = () => sync();
  document.addEventListener('visibilitychange', onVisibilityChange);
  render();

  return {
    setActive(value, { restart: reset = false } = {}) {
      active = value;
      if (reset) restart(); else sync();
    },
    setPaused(value) { paused = value; sync(); },
    setReducedMotion(value) {
      if (reducedMotion === value) return;
      reducedMotion = value;
      if (!value && !paused) restart(); else sync();
    },
    restart,
    destroy() {
      stop();
      destroyed = true;
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      render();
    },
  };
}
