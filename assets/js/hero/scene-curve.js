// Scene 3, "Scoring the order": the 18 told events become a story curve
// (told position across, chronological rank up) and the three order scores
// are computed in the browser with the §D formulas.

import { el, set, prog, snap, stepped, roleOf } from './draw.js';
import { summarize, lisIndices, hopPositions } from '../metrics.js';
import { MINUS } from '../format.js';

const fmtSigned = v => (v < 0 ? MINUS : v > 0 ? '+' : '') + Math.abs(v).toFixed(3);

function plotGeometry(layout, n) {
  if (layout === 'wide') {
    const x0 = 176, step = 24, y0 = 498;
    return {
      x: i => x0 + (i - 1) * step, y: r => y0 - (r - 1) * step,
      box: [x0 - 16, y0 - (n - 1) * step - 16, (n - 1) * step + 32, (n - 1) * step + 32],
      xLabel: [x0 + ((n - 1) * step) / 2, 540, 'told position →'],
      yLabel: [132, y0 - ((n - 1) * step) / 2, 'chronological rank →'],
      panels: [0, 1, 2].map(i => ({ x: 652, y: 88 + i * 118, w: 284, h: 104 })),
      hint: [652, 462], hint2: [652, 482],
    };
  }
  const x0 = 60, step = 16, y0 = 368;
  return {
    x: i => x0 + (i - 1) * step, y: r => y0 - (r - 1) * step,
    box: [x0 - 12, y0 - (n - 1) * step - 12, (n - 1) * step + 24, (n - 1) * step + 24],
    xLabel: [x0 + ((n - 1) * step) / 2, 404, 'told position →'],
    yLabel: [26, y0 - ((n - 1) * step) / 2, 'chronological rank →'],
    panels: [0, 1, 2].map(i => ({ x: 14, y: 424 + i * 76, w: 332, h: 66 })),
    hint: [180, 664], hint2: [180, 682],
  };
}

export function createCurveScene() {
  let G, P, f2, order, stats, nodes, lisSet, hops;
  const STEP = 0.45, HOLD = 1.4;
  const COMPLETE = 17 * STEP, SCORE = COMPLETE + 0.2;
  return {
    id: 'curve',
    title: 'Scoring the order',
    duration: SCORE + 4.1 + HOLD,
    mount(stage, ctx) {
      G = ctx.G;
      f2 = ctx.data.figure2;
      order = f2.telling;
      const n = order.length;
      P = plotGeometry(G.layout, n);
      stats = summarize(order);
      lisSet = lisIndices(order);
      hops = hopPositions(order);
      const narrow = G.layout === 'narrow';
      nodes = { dots: [], rings: [], hopMarks: [] };

      // Plot frame and grid.
      const plot = el(stage, 'g', { class: 'h-plot' });
      nodes.plot = plot;
      const [bx, by, bw, bh] = P.box;
      el(plot, 'rect', { x: bx, y: by, width: bw, height: bh, fill: 'var(--card)', class: 'h-window' });
      for (let i = 1; i <= n; i++) {
        el(plot, 'line', { class: 'h-grid', x1: P.x(i), x2: P.x(i), y1: by + 4, y2: by + bh - 4 });
        el(plot, 'line', { class: 'h-grid', x1: bx + 4, x2: bx + bw - 4, y1: P.y(i), y2: P.y(i) });
      }
      const tick = (x, y, text, anchor) => el(plot, 'text', { x, y, class: 'h-muted', 'font-size': 11, 'text-anchor': anchor }, text);
      tick(P.x(1), by + bh + 14, '1', 'middle');
      tick(P.x(n), by + bh + 14, String(n), 'middle');
      tick(bx - 6, P.y(1) + 4, '1', 'end');
      tick(bx - 6, P.y(n) + 4, String(n), 'end');
      el(plot, 'text', { x: P.xLabel[0], y: P.xLabel[1], class: 'h-pixel', 'font-size': 15, 'text-anchor': 'middle' }, P.xLabel[2]);
      el(plot, 'text', { x: P.yLabel[0], y: P.yLabel[1], class: 'h-pixel', 'font-size': 15, 'text-anchor': 'middle', transform: `rotate(-90 ${P.yLabel[0]} ${P.yLabel[1]})` }, P.yLabel[2]);

      nodes.diagonal = el(stage, 'line', { class: 'h-diagonal', x1: P.x(1), y1: P.y(1), x2: P.x(n), y2: P.y(n) });
      nodes.diagLabel = el(stage, 'text', { x: P.x(n) - 4, y: P.y(n) - 8, class: 'h-muted', 'font-size': 11, 'text-anchor': 'end' }, 'chronological telling');
      nodes.path = el(stage, 'polyline', { class: 'h-path', points: '', 'data-story-curve': '' });
      nodes.hopLayer = el(stage, 'g');
      hops.forEach(i => {
        const mx = (P.x(i + 1) + P.x(i + 2)) / 2, my = (P.y(order[i]) + P.y(order[i + 1])) / 2;
        nodes.hopMarks.push(el(nodes.hopLayer, 'rect', { class: 'h-hop', x: snap(mx) - 3, y: snap(my) - 3, width: 6, height: 6, visibility: 'hidden' }));
      });
      nodes.guides = el(stage, 'g', { visibility: 'hidden' });
      nodes.gx = el(nodes.guides, 'line', { class: 'h-guide' });
      nodes.gy = el(nodes.guides, 'line', { class: 'h-guide' });

      const dotsLayer = el(stage, 'g');
      order.forEach((k, idx) => {
        const i = idx + 1;
        const role = roleOf(k, f2.roles);
        const g = el(dotsLayer, 'g', {
          class: `h-ev h-curve-dot r-${role}`, 'data-e': k, tabindex: -1, role: 'img',
          'aria-label': `e${k}: chronology ${k}, told ${i}`,
        });
        const ring = el(g, 'circle', { class: 'h-lis-ring', r: 9, visibility: 'hidden' });
        const dot = el(g, 'circle', { class: 'h-dot', r: k === 12 || k === 18 ? 6.5 : 5 });
        const hit = el(g, 'circle', { class: 'h-hit', r: 13 });
        const to = [P.x(i), P.y(k)];
        [dot, ring, hit].forEach(mark => set(mark, { cx: to[0], cy: to[1] }));
        nodes.dots.push({ g, dot, ring, hit, to, k, i });
        if (lisSet.includes(idx)) nodes.rings.push(ring);
      });
      nodes.dotsLayer = dotsLayer;
      nodes.current = el(stage, 'circle', { class: 'h-current-point', r: 13, 'aria-hidden': 'true' });

      // Score panels.
      nodes.panels = ['Kendall’s τ', 'LIS', 'Hops'].map((label, j) => {
        const p = P.panels[j];
        const g = el(stage, 'g', { visibility: 'hidden' });
        el(g, 'rect', { class: 'h-window', x: p.x, y: p.y, width: p.w, height: p.h });
        el(g, 'rect', { class: 'h-window-inner', x: p.x + 3, y: p.y + 3, width: p.w - 6, height: p.h - 6 });
        el(g, 'text', { x: p.x + 14, y: p.y + (narrow ? 24 : 26), class: 'h-panel-label' }, label);
        const value = el(g, 'text', { x: p.x + p.w - 14, y: p.y + (narrow ? 30 : 42), class: 'h-panel-value', 'text-anchor': 'end', 'font-size': narrow ? 26 : 34 });
        const note = el(g, 'text', { x: p.x + 14, y: p.y + (narrow ? 46 : 66), class: 'h-muted', 'font-size': narrow ? 11 : 12 });
        const meterY = p.y + p.h - (narrow ? 14 : 22);
        const track = el(g, 'rect', { class: 'h-meter-track', x: p.x + 14, y: meterY, width: p.w - 28, height: 6 });
        const fill = el(g, 'rect', { class: `h-meter-fill ${j === 0 ? 'r-consequence' : j === 1 ? 'r-clue' : ''}`, x: p.x + 14, y: meterY, width: 0, height: 6 });
        if (j === 2) fill.setAttribute('style', 'fill:var(--series-b)');
        const mark = el(g, 'rect', { class: 'h-meter-mark', x: p.x + 14, y: meterY - 3, width: 2, height: 12 });
        return { g, value, note, track, fill, mark, p };
      });
      nodes.hint = el(stage, 'text', { x: P.hint[0], y: P.hint[1], class: 'h-muted', 'font-size': 12, 'text-anchor': narrow ? 'middle' : 'start' }, '+1 is chronology, −1 the exact reversal.');
      nodes.hint2 = el(stage, 'text', { x: P.hint2[0], y: P.hint2[1], class: 'h-muted', 'font-size': 12, 'text-anchor': narrow ? 'middle' : 'start' }, narrow ? 'Tap or tab to a dot for its ranks.' : 'Hover or tab to a dot for its ranks.');

      // Hover and focus: guides to both axes plus a tooltip.
      ctx.bindHover(dotsLayer, k => {
        const d = nodes.dots.find(x => x.k === k);
        return { title: `e${k}`, lines: [`chronology ${k} · told ${d.i}`] };
      }, k => {
        const d = nodes.dots.find(x => x.k === k);
        if (!d) { nodes.guides.setAttribute('visibility', 'hidden'); return; }
        const [x, y] = d.to;
        set(nodes.gx, { x1: x, x2: x, y1: y, y2: P.box[1] + P.box[3] });
        set(nodes.gy, { x1: P.box[0], x2: x, y1: y, y2: y });
        nodes.guides.setAttribute('visibility', 'visible');
      });
    },
    update(t) {
      const n = order.length;
      const count = Math.min(n, Math.floor((t + 1e-8) / STEP) + 1);
      const complete = count === n;
      nodes.dots.forEach((d, idx) => {
        set(d.g, { visibility: idx < count ? 'visible' : 'hidden', tabindex: idx < count ? 0 : -1 });
      });
      // Reveal entire segments and their endpoints in told order, one event
      // per beat. The diagonal and axes stay available throughout playback.
      nodes.path.setAttribute('points', nodes.dots.slice(0, count).map(d => d.to.join(',')).join(' '));
      set(nodes.path, { 'data-visible-points': count, 'data-current-event': order[count - 1], 'data-phase': !complete ? 'drawing' : t < SCORE + 4.1 ? 'scoring' : 'hold' });
      const [x, y] = nodes.dots[count - 1].to;
      set(nodes.current, { cx: x, cy: y });

      // τ: count the out-of-order pairs.
      const [pt, pl, ph] = nodes.panels;
      const ptau = prog(t, SCORE + 0.2, 1.0);
      pt.g.setAttribute('visibility', t >= SCORE ? 'visible' : 'hidden');
      const D = Math.round(stepped(ptau, 24) * stats.discordant);
      const tau = 1 - (2 * D) / stats.pairs;
      pt.value.textContent = fmtSigned(tau);
      pt.note.textContent = `${D} of ${stats.pairs} pairs out of order`;
      const tw = pt.p.w - 28;
      set(pt.fill, { width: snap(((tau + 1) / 2) * tw) });
      set(pt.mark, { x: pt.p.x + 14 + tw / 2 - 1 });

      // LIS: ring the longest run told in chronological order, gaps allowed.
      const plis = prog(t, SCORE + 1.5, 1.1);
      pl.g.setAttribute('visibility', t >= SCORE + 1.3 ? 'visible' : 'hidden');
      const shown = Math.round(stepped(plis, nodes.rings.length) * nodes.rings.length);
      nodes.rings.forEach((r, i) => r.setAttribute('visibility', i < shown ? 'visible' : 'hidden'));
      pl.value.textContent = (shown / n).toFixed(2);
      pl.note.textContent = `${shown} of ${n} events in chronological order`;
      set(pl.fill, { width: snap((shown / n) * (pl.p.w - 28)) });
      pl.mark.setAttribute('visibility', 'hidden');

      // Hops: each step that does not continue with the next event.
      const phop = prog(t, SCORE + 2.7, 1.1);
      ph.g.setAttribute('visibility', t >= SCORE + 2.5 ? 'visible' : 'hidden');
      const hopShown = Math.round(stepped(phop, hops.length) * hops.length);
      nodes.hopMarks.forEach((m, i) => m.setAttribute('visibility', i < hopShown ? 'visible' : 'hidden'));
      ph.value.textContent = String(hopShown);
      ph.note.textContent = `${hopShown} of ${n - 1} steps jump`;
      set(ph.fill, { width: snap((hopShown / (n - 1)) * (ph.p.w - 28)) });
      ph.mark.setAttribute('visibility', 'hidden');

      nodes.hint.setAttribute('visibility', t >= SCORE + 3.9 ? 'visible' : 'hidden');
      nodes.hint2.setAttribute('visibility', t >= SCORE + 4.1 ? 'visible' : 'hidden');
    },
  };
}
