// Scene 1, "Three tellings" (Figure 1): the same 12 events with no backward
// cue, with a backward cue, and as published, each scored by Kendall's τ.
// Wide screens use the figure's layered planes; narrow screens stack them flat.

import { el, set } from './draw.js';
import { kendallTau } from '../metrics.js';
import { MINUS } from '../format.js';

const fmtTau = v => `τ = ${v < 0 ? MINUS : '+'}${Math.abs(v).toFixed(2)}`;

// Plane projection from the figure: told axis u, chronology axis v.
function wideGeometry(n) {
  const u = [320, 112], v = [104, -74];
  const origin = k => [60, 148 + k * 136];
  const pt = (k, i, r) => {
    const [ox, oy] = origin(k);
    return [ox + ((i - 1) / (n - 1)) * u[0] + ((r - 1) / (n - 1)) * v[0], oy + ((i - 1) / (n - 1)) * u[1] + ((r - 1) / (n - 1)) * v[1]];
  };
  const plane = k => {
    const [ox, oy] = origin(k);
    return [[ox, oy], [ox + u[0], oy + u[1]], [ox + u[0] + v[0], oy + u[1] + v[1]], [ox + v[0], oy + v[1]]];
  };
  const labelY = k => 120 + k * 136;
  return { pt, plane, u, v, origin, labelX: 560, labelY, closing: [[560, 506], [560, 526]] };
}

function narrowGeometry(n) {
  const panel = k => ({ x: 14, y: 14 + k * 198, w: 332, h: 186 });
  const pt = (k, i, r) => {
    const p = panel(k);
    return [p.x + 30 + ((i - 1) / (n - 1)) * 130, p.y + 160 - ((r - 1) / (n - 1)) * 132];
  };
  return { pt, panel, labelX: 194, closing: [[180, 640], [180, 660]] };
}

function marker(parent, shape, x, y, s = 4) {
  if (shape === 'square') return el(parent, 'rect', { class: 'h-marker', x: x - s, y: y - s, width: 2 * s, height: 2 * s });
  if (shape === 'triangle') return el(parent, 'polygon', { class: 'h-marker', points: `${x},${y - s - 1} ${x - s - 1},${y + s} ${x + s + 1},${y + s}` });
  return el(parent, 'circle', { class: 'h-marker', cx: x, cy: y, r: s });
}

export function createTellingsScene() {
  let f1, nodes, wide, W;
  // All three Figure 1 tellings contain twelve events. They draw together, one
  // event every STEP, then hold their completed curves and scores long enough
  // to read all three.
  const STEP = 0.45, HOLD = 3.6;
  const DRAW = 11 * STEP;
  return {
    id: 'tellings',
    title: 'Three tellings',
    duration: DRAW + HOLD,
    mount(stage, ctx) {
      f1 = ctx.data.figure1;
      wide = ctx.G.layout === 'wide';
      const n = f1.n;
      W = wide ? wideGeometry(n) : narrowGeometry(n);
      nodes = { blocks: [] };

      f1.tellings.forEach((tell, k) => {
        const g = el(stage, 'g', { class: `u-${tell.id}`, 'data-telling': tell.id });
        const planeG = el(g, 'g');
        if (wide) {
          const corners = W.plane(k);
          el(planeG, 'polygon', { class: 'h-plane', points: corners.map(c => c.join(',')).join(' ') });
          // Grid lines at event ranks 4 and 8, as in the figure.
          for (const r of [4, 8]) {
            const a = W.pt(k, 1, r), b = W.pt(k, n, r);
            el(planeG, 'line', { class: 'h-plane-grid', x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
            const c = W.pt(k, r, 1), d = W.pt(k, r, n);
            el(planeG, 'line', { class: 'h-plane-grid', x1: c[0], y1: c[1], x2: d[0], y2: d[1] });
          }
          const a = W.pt(k, 1, 1), b = W.pt(k, n, n);
          el(planeG, 'line', { class: 'h-diagonal', x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
        } else {
          const p = W.panel(k);
          el(planeG, 'rect', { class: 'h-plane', x: p.x, y: p.y, width: p.w, height: p.h });
          const a = W.pt(k, 1, 1), b = W.pt(k, n, n);
          el(planeG, 'rect', { x: a[0] - 8, y: b[1] - 8, width: b[0] - a[0] + 16, height: a[1] - b[1] + 16, fill: 'var(--card)', class: 'h-window' });
          for (const r of [4, 8]) {
            const y = W.pt(k, 1, r)[1], x = W.pt(k, r, 1)[0];
            el(planeG, 'line', { class: 'h-plane-grid', x1: a[0] - 6, x2: b[0] + 6, y1: y, y2: y });
            el(planeG, 'line', { class: 'h-plane-grid', x1: x, x2: x, y1: b[1] - 6, y2: a[1] + 6 });
          }
          el(planeG, 'line', { class: 'h-diagonal', x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
          el(planeG, 'text', { x: (a[0] + b[0]) / 2, y: a[1] + 20, class: 'h-muted', 'font-size': 10.5, 'text-anchor': 'middle' }, 'telling →');
          el(planeG, 'text', { x: a[0] - 14, y: (a[1] + b[1]) / 2, class: 'h-muted', 'font-size': 10.5, 'text-anchor': 'middle', transform: `rotate(-90 ${a[0] - 14} ${(a[1] + b[1]) / 2})` }, 'chronology →');
        }

        const pts = tell.order.map((r, idx) => W.pt(k, idx + 1, r));
        const [h1, h2] = tell.highlight.map(i => pts[i - 1]);
        const hc = [(h1[0] + h2[0]) / 2, (h1[1] + h2[1]) / 2];
        const callout = el(g, 'ellipse', {
          class: 'h-callout', cx: hc[0], cy: hc[1],
          rx: Math.hypot(h2[0] - h1[0], h2[1] - h1[1]) / 2 + 9, ry: 7,
          transform: `rotate(${(Math.atan2(h2[1] - h1[1], h2[0] - h1[0]) * 180) / Math.PI} ${hc[0]} ${hc[1]})`,
          visibility: 'hidden',
        });
        const line = el(g, 'polyline', { class: `h-trajectory${tell.id === 'backward' ? ' is-dashed' : ''}`, points: '' });
        const markers = pts.map(([x, y]) => marker(g, tell.marker, x, y, wide ? 4 : 3.5));
        const current = el(g, 'circle', { class: 'h-current-point', r: 9, visibility: 'hidden', 'aria-hidden': 'true' });

        // Labels, τ, and a leader to the callout.
        const lx = W.labelX;
        const ly = wide ? W.labelY(k) : W.panel(k).y + 44;
        el(g, 'text', { x: lx, y: ly, class: 'h-tell-label h-role-text', 'font-size': wide ? 21 : 15 }, tell.label);
        const labels = el(g, 'g', { visibility: 'hidden' });
        el(labels, 'text', { x: lx, y: ly + (wide ? 22 : 20), class: 'h-tell-callout h-role-text', 'font-size': wide ? 13 : 12 }, tell.callout);
        const tauText = el(g, 'text', { x: lx, y: ly + (wide ? 54 : 52), class: 'h-tell-tau h-role-text', 'font-size': wide ? 24 : 20 });
        const leader = el(g, 'polyline', {
          class: 'h-leader', visibility: 'hidden',
          points: wide ? `${lx - 6},${ly + 17} ${lx - 26},${ly + 17} ${hc[0]},${hc[1]}` : `${lx - 6},${ly + 16} ${hc[0] + 12},${hc[1]}`,
          style: 'stroke:currentColor;stroke-opacity:.8',
        });
        nodes.blocks.push({ g, line, markers, current, pts, labels, tauText, leader, callout, tau: kendallTau(tell.order), order: tell.order });
      });

      if (wide) {
        // Axis words along the bottom plane, as in the figure.
        const o = W.origin(2);
        const ang = (Math.atan2(W.u[1], W.u[0]) * 180) / Math.PI;
        const angV = (Math.atan2(W.v[1], W.v[0]) * 180) / Math.PI;
        nodes.axes = el(stage, 'g');
        const mx = o[0] + W.u[0] / 2 - 6, my = o[1] + W.u[1] / 2 + 22;
        const t1 = el(nodes.axes, 'text', { x: mx, y: my, 'font-size': 13, 'text-anchor': 'middle', transform: `rotate(${ang} ${mx} ${my})` });
        el(t1, 'tspan', {}, 'telling (');
        el(t1, 'tspan', { class: 'h-italic' }, f1.axes.tellingTerm);
        el(t1, 'tspan', {}, ')');
        // The label sits outward of the left edge, centered short of the corner,
        // and the corner's "12" moves to the corner's right, so the two never meet.
        const len = Math.hypot(W.v[0], W.v[1]);
        const vx = o[0] + W.v[0] * 0.42 + (W.v[1] / len) * 20, vy = o[1] + W.v[1] * 0.42 - (W.v[0] / len) * 20;
        const t2 = el(nodes.axes, 'text', { x: vx, y: vy, 'font-size': 12.5, 'text-anchor': 'middle', transform: `rotate(${angV} ${vx} ${vy})` });
        el(t2, 'tspan', {}, 'chronology (');
        el(t2, 'tspan', { class: 'h-italic' }, f1.axes.chronologyTerm);
        el(t2, 'tspan', {}, ')');
        el(nodes.axes, 'text', { x: o[0] - 12, y: o[1] + 4, class: 'h-muted', 'font-size': 11, 'text-anchor': 'end' }, '1');
        el(nodes.axes, 'text', { x: o[0] + W.u[0] + 4, y: o[1] + W.u[1] + 16, class: 'h-muted', 'font-size': 11 }, String(n));
        el(nodes.axes, 'text', { x: o[0] + W.v[0] + 8, y: o[1] + W.v[1] - 6, class: 'h-muted', 'font-size': 11, 'text-anchor': 'start' }, String(n));
      }
      nodes.closing = el(stage, 'g', { visibility: 'hidden' });
      const anchor = wide ? 'start' : 'middle';
      el(nodes.closing, 'text', { x: W.closing[0][0], y: W.closing[0][1], 'font-size': 13.5, 'text-anchor': anchor }, '+1 denotes chronological order');
      el(nodes.closing, 'text', { x: W.closing[1][0], y: W.closing[1][1], 'font-size': 13.5, 'text-anchor': anchor }, 'and −1 exact reversal.');
    },
    update(t) {
      nodes.blocks.forEach(b => {
        const count = t < 0 ? 0 : Math.min(b.pts.length, Math.floor((t + 1e-8) / STEP) + 1);
        const complete = count === b.pts.length;
        const active = t >= 0 && t < DRAW + HOLD;
        set(b.g, { 'data-visible-points': count, 'data-current-event': count ? b.order[count - 1] : '', 'data-phase': complete ? 'hold' : count ? 'drawing' : 'pending' });
        b.line.setAttribute('points', b.pts.slice(0, count).map(([x, y]) => `${x},${y}`).join(' '));
        b.markers.forEach((m, i) => m.setAttribute('visibility', i < count ? 'visible' : 'hidden'));
        const point = b.pts[count - 1];
        if (point) set(b.current, { cx: point[0], cy: point[1] });
        b.current.setAttribute('visibility', active && count ? 'visible' : 'hidden');

        const on = complete;
        b.callout.setAttribute('visibility', on ? 'visible' : 'hidden');
        b.leader.setAttribute('visibility', on ? 'visible' : 'hidden');
        b.labels.setAttribute('visibility', on ? 'visible' : 'hidden');
        b.tauText.textContent = on ? fmtTau(b.tau) : '';
      });
      nodes.closing.setAttribute('visibility', t >= DRAW ? 'visible' : 'hidden');
    },
  };
}
