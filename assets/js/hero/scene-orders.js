// Figure 2's two rows (chronology above, telling below; side by side when
// narrow): geometry, builder and settled state, shared by the reveal and
// scoring scenes.

import { el, set, curveD, sprite, subLabel, arrowHead, roleOf } from './draw.js';

export function rowGeometry(layout) {
  if (layout === 'wide') {
    const x = i => 150 + (i - 1) * 46;
    return {
      layout, W: 960, H: 560,
      chrono: k => [x(k), 90],
      tell: i => [x(i), 184],
      spriteSize: 28,
      chronoSprite: k => [x(k), 64],
      tellSprite: i => [x(i), 208],
      chronoLabel: k => [x(k), 113],
      tellLabel: i => [x(i), 241],
      labelAnchor: 'middle',
      curve: (a, b) => [a, [a[0], a[1] + 48], [b[0], b[1] - 48], b],
      lines: [[140, 90, 944, 90, 'right'], [140, 184, 944, 184, 'right']],
      rowLabels: [
        { text: 'Chronology', x: 22, y: 86, anchor: 'start', termY: 104 },
        { text: 'Telling', x: 22, y: 180, anchor: 'start', termY: 198 },
      ],
      legend: [[196, 24], [366, 24], [536, 24], [736, 24]],
      counter: [944, 146, 'end'],
    };
  }
  const y = i => 112 + (i - 1) * 32;
  return {
    layout, W: 360, H: 700,
    chrono: k => [78, y(k)],
    tell: i => [282, y(i)],
    spriteSize: 24,
    chronoSprite: k => [22, y(k)],
    tellSprite: i => [336, y(i)],
    chronoLabel: k => [40, y(k) + 4],
    tellLabel: i => [294, y(i) + 4],
    labelAnchor: 'start',
    curve: (a, b) => [a, [a[0] + 92, a[1]], [b[0] - 92, b[1]], b],
    lines: [[78, 98, 78, 670, 'down'], [282, 98, 282, 670, 'down']],
    rowLabels: [
      { text: 'Chronology', x: 14, y: 74, anchor: 'start', termY: 90 },
      { text: 'Telling', x: 346, y: 74, anchor: 'end', termY: 90 },
    ],
    legend: [[18, 20], [190, 20], [18, 40], [190, 40]],
    counter: [180, 690, 'middle'],
  };
}

// Builds both rows, the connecting curves and one travelling token per event.
export function buildRows(stage, ctx) {
  const { data, G } = ctx;
  const f2 = data.figure2;
  const n = f2.n;
  const telling = f2.telling;
  const toldOf = new Map(telling.map((e, i) => [e, i + 1]));
  const key = new Set([...f2.roles.consequence, ...f2.roles.explanation]);

  const chrome = el(stage, 'g', { class: 'h-chrome' });
  const legend = el(chrome, 'g');
  f2.legend.forEach((item, i) => {
    const [lx, ly] = G.legend[i];
    const g = el(legend, 'g', { class: `r-${item.role}` });
    el(g, 'rect', { class: 'h-strip-role', x: lx, y: ly - 5, width: 8, height: 8 });
    el(g, 'text', { x: lx + 14, y: ly + 3, class: 'h-muted', 'font-size': 13 }, item.label);
  });
  for (const [x1, y1, x2, y2, dir] of G.lines) {
    el(chrome, 'line', { class: 'h-line', x1, y1, x2, y2 });
    arrowHead(chrome, x2 + (dir === 'right' ? 4 : 0), y2 + (dir === 'down' ? 4 : 0), dir, 7, 'h-arrow-head h-chrome-head');
  }
  const rowLabels = G.rowLabels.map((r, i) => {
    const g = el(chrome, 'g');
    el(g, 'text', { x: r.x, y: r.y, class: 'h-pixel', 'font-size': 18, 'text-anchor': r.anchor, 'font-weight': 700 }, r.text);
    el(g, 'text', { x: r.x, y: r.termY, class: 'h-muted h-italic', 'font-size': 13, 'text-anchor': r.anchor }, i === 0 ? f2.rows.chronology.term : f2.rows.telling.term);
    return g;
  });

  const curves = el(stage, 'g', { class: 'h-curves' });
  const rows = el(stage, 'g', { class: 'h-rows' });
  const tokens = el(stage, 'g', { class: 'h-tokens' });

  const events = new Map();
  for (let k = 1; k <= n; k++) {
    const role = roleOf(k, f2.roles);
    const told = toldOf.get(k);
    const big = key.has(k);
    const r = big ? 6.5 : 4.5;
    const pts = G.curve(G.chrono(k), G.tell(told));
    const curveWrap = el(curves, 'g', { class: `h-ev r-${role}`, 'data-e': k });
    const curve = el(curveWrap, 'path', {
      class: `h-curve${big ? ' is-key' : ''}${role === 'clue' ? ' is-clue' : ''}`,
      d: curveD(...pts), pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1,
    });

    const makeSlot = (pos, spritePos, labelPos, extra) => {
      const g = el(rows, 'g', { class: `h-ev r-${role} ${extra}`, 'data-e': k });
      const lw = k > 9 ? 26 : 18;
      const [lx, ly] = labelPos;
      const bgx = G.labelAnchor === 'middle' ? lx - lw / 2 : lx - 2;
      el(g, 'rect', { class: 'h-label-bg', x: bgx, y: ly - 11, width: lw, height: 15 });
      subLabel(g, 'e', k, lx, ly, { class: 'h-elabel', 'text-anchor': G.labelAnchor }, 12);
      sprite(g, k, spritePos[0], spritePos[1], G.spriteSize);
      el(g, 'circle', { class: 'h-dot', cx: pos[0], cy: pos[1], r });
      const hb = G.layout === 'wide'
        ? { x: pos[0] - 22, y: Math.min(pos[1], spritePos[1]) - 18, width: 44, height: 76 }
        : { x: Math.min(pos[0], spritePos[0], labelPos[0]) - 14, y: pos[1] - 15, width: 92, height: 30 };
      el(g, 'rect', { class: 'h-hit', ...hb });
      return g;
    };
    const chrono = makeSlot(G.chrono(k), G.chronoSprite(k), G.chronoLabel(k), 'h-chrono');
    const tell = makeSlot(G.tell(told), G.tellSprite(told), G.tellLabel(told), 'h-tell');

    const token = el(tokens, 'g', { class: `r-${role}`, visibility: 'hidden' });
    const tokenSprite = el(token, 'path', { class: 'h-sprite', d: sprite(null, k, 0, 0, G.spriteSize).getAttribute('d') });
    el(token, 'circle', { class: 'h-dot', cx: 0, cy: 0, r: r + 1 });
    events.set(k, { k, role, told, big, curve, curveWrap, chrono, tell, token, tokenSprite, pts });
  }

  ctx.bindHover(rows, k => {
    const e = events.get(k);
    const pict = f2.pictograms.items[k];
    return { title: `e${k}`, lines: [`chronology ${k} · told ${e.told}`, `pictogram: ${pict}`] };
  });

  return { chrome, legend, rowLabels, curves, rows, tokens, events, telling, n };
}

// Places every event in its final, landed state.
export function settleRows(R) {
  for (const e of R.events.values()) {
    set(e.curve, { 'stroke-dashoffset': 0 });
    e.chrono.setAttribute('opacity', 1);
    e.tell.setAttribute('opacity', 1);
    e.token.setAttribute('visibility', 'hidden');
  }
}
