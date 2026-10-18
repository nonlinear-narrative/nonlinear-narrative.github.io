// Figure 6's story graph as a web of pixel nodes. One annotated work: fourteen
// events, each numbered by its chronological rank with its telling position in
// small type beside it, joined by the figure's CAUSES, FORESHADOWS and REVEALS
// arrows; each REVEALS arrow carries the reader question q1–q4 it answers. The
// paper lines the nodes up along chronology. Here they rest in a crossing-free
// web, and since a node's place carries no data, each one wanders slowly round
// it while the arrows hold. The still frame is the web at rest. Pointing at a
// node lights its arrows and lists them in the tooltip.

import { mix, pack, rng, themeColors } from './pixel.js';
import { showTip, hideTip } from '../tooltip.js';

const DATA = new URL('../../data/story-graph.json', import.meta.url);
const TYPES = ['CAUSES', 'FORESHADOWS', 'REVEALS'];
const TAU = Math.PI * 2;

// Pixel type: 5×7 digits number the nodes on roomy canvases; 3×5 digits number
// them on small ones and give every telling position. q heads the questions.
const FONTS = {
  big: {
    0: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    3: ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
    4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  },
  small: {
    0: ['###', '#.#', '#.#', '#.#', '###'],
    1: ['.#.', '##.', '.#.', '.#.', '###'],
    2: ['###', '..#', '###', '#..', '###'],
    3: ['###', '..#', '.##', '..#', '###'],
    4: ['#.#', '#.#', '###', '..#', '..#'],
    5: ['###', '#..', '###', '..#', '###'],
    6: ['###', '#..', '###', '#.#', '###'],
    7: ['###', '..#', '..#', '.#.', '.#.'],
    8: ['###', '#.#', '###', '#.#', '###'],
    9: ['###', '#.#', '###', '..#', '###'],
    q: ['.##', '#.#', '#.#', '.##', '..#'],
  },
};
const FONT = Object.fromEntries(Object.entries(FONTS).map(([name, glyphs]) => [name, {
  h: glyphs[0].length,
  g: Object.fromEntries(Object.entries(glyphs).map(([ch, rows]) => [ch, {
    w: rows[0].length,
    px: rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === '#' ? [[x, y]] : []))),
  }])),
}]));
const textWidth = (font, s) => [...s].reduce((w, ch) => w + font.g[ch].w + 1, -1);
// Where a node's telling position may sit, in order of preference: below it,
// as in the paper, then round the node.
const SIDES = [[0, 1], [0.7, 0.7], [-0.7, 0.7], [1, 0], [-1, 0], [0.7, -0.7], [-0.7, -0.7], [0, -1]];
// Where a question may sit beside its REVEALS bow: outside it at the middle
// first, then further along, then inside.
const ASKS = [0.5, 0.4, 0.6, 0.3, 0.7].map(t => ({ t, outside: true })).concat({ t: 0.5, outside: false });

// ---- the figure's data ---------------------------------------------------------
let GRAPH = null;
function loadGraph() {
  if (!GRAPH) {
    GRAPH = fetch(DATA).then(r => {
      if (!r.ok) throw new Error(`${DATA.pathname}: ${r.status}`);
      return r.json();
    }).then(({ figure6: f }) => {
      const told = [];
      f.telling.forEach((k, i) => { told[k] = i + 1; });
      const edges = TYPES.flatMap(type => f.edges[type].map(([from, to, q = 0]) => ({ type, from, to, q })));
      // Two arrows between one pair bow apart, the forward relation one way and
      // REVEALS the other (the paper draws them above and below its line).
      for (const e of edges) {
        const twin = edges.some(o => o !== e && o.from === e.from && o.to === e.to);
        e.bend = e.type === 'REVEALS' ? (twin ? -0.24 : -0.16) : twin ? 0.16 : 0.08;
      }
      return { n: f.n, told, edges };
    });
  }
  return GRAPH;
}

// ---- layout --------------------------------------------------------------------
// The web at rest, for the canvas's three shapes (2:1 wide, 4:3, 4:5 on
// phones), as fractions of the box: node e(i+1) is entry i. Each is the best of
// a search over force-directed layouts started from crossing-free drawings
// (the graph is planar), kept crossing-free and clear of arrows they do not
// join, then scored on even spacing and arrow lengths.
const RESTING = [
  { aspect: 2, nodes: [[0.098, 0.253], [0, 0.421], [0.524, 0.508], [1, 0.002], [0.323, 0.705], [0.382, 0.353], [0.562, 0], [0.631, 0.347], [0.805, 0.167], [0.741, 0.698], [0.891, 0.618], [0.69, 0.963], [0.413, 1], [0.218, 0.773]] },
  { aspect: 4 / 3, nodes: [[0.039, 0.118], [0, 0.368], [0.066, 1], [0.334, 0.303], [0.913, 0.643], [0.62, 0.855], [0.5, 0.725], [0.272, 0.675], [0.486, 0.443], [0.293, 0.114], [0.592, 0.099], [0.724, 0], [1, 0.359], [0.989, 0.809]] },
  { aspect: 0.8, nodes: [[0.187, 0], [0, 0.085], [0.671, 0.698], [0.015, 1], [0.843, 0.342], [0.875, 0.546], [0.634, 0.84], [0.481, 0.637], [0.237, 0.811], [0.236, 0.496], [0.014, 0.588], [0.242, 0.348], [0.644, 0.228], [1, 0.292]] },
];
// The resting layout nearest the canvas's shape, stretched to fill a box.
function layout(w, h, box) {
  const { nodes } = RESTING.reduce((best, l) => (Math.abs(Math.log(l.aspect * h / w)) < Math.abs(Math.log(best.aspect * h / w)) ? l : best));
  return nodes.map(([x, y]) => [box.left + x * (box.right - box.left), box.top + y * (box.bottom - box.top)]);
}

// ---- pixel geometry ------------------------------------------------------------
function disc(r) {
  const fill = [], ring = [];
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y);
      if (d <= r + 0.5) (d > r - 0.5 ? ring : fill).push([x, y]);
    }
  }
  return { fill, ring, all: fill.concat(ring) };
}

// The control point of an arrow's bow: off the midpoint, square to the chord,
// by `bend` of the chord's length (positive bows to the right of travel, on screen).
const control = (p0, p1, bend) => [(p0[0] + p1[0]) / 2 - (p1[1] - p0[1]) * bend, (p0[1] + p1[1]) / 2 + (p1[0] - p0[0]) * bend];
const bezier = (p0, c, p1, t) => {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
};
// The parameter where the curve is `dist` from the end point `end` (0 or 1).
function leave(p0, c, p1, end, dist) {
  const at = end ? p1 : p0;
  let lo = end ? 0.5 : 0, hi = end ? 1 : 0.5;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2, q = bezier(p0, c, p1, mid);
    const far = Math.hypot(q[0] - at[0], q[1] - at[1]) > dist;
    if (far === !end) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
// The pixels of a curve from t0 to t1, one pixel wide with no doubled corners.
function trace(p0, c, p1, t0, t1) {
  const steps = Math.max(2, Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 3 * Math.abs(t1 - t0)) + 4);
  const raw = [];
  for (let s = 0; s <= steps; s++) {
    const [x, y] = bezier(p0, c, p1, t0 + ((t1 - t0) * s) / steps);
    const px = Math.floor(x), py = Math.floor(y), last = raw[raw.length - 1];
    if (!last || last[0] !== px || last[1] !== py) raw.push([px, py]);
  }
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const prev = out[out.length - 1], next = raw[i + 1];
    if (prev && next && Math.abs(prev[0] - next[0]) === 1 && Math.abs(prev[1] - next[1]) === 1) continue;
    out.push(raw[i]);
  }
  return out;
}

// ---- the scene -------------------------------------------------------------------
export function createStoryGraph() {
  let graph = null;
  let W = 0, H = 0, R = 6, big = false, font = FONT.small, dot = disc(6);
  let base = [], drift = [], sides = [], asks = [];
  let colors = null;
  let shown = [];             // node centres in the last frame, for pointing
  let hover = 0;              // the node pointed at, by rank (0: none)

  function palette() {
    const c = themeColors([
      ['plot', '--plot', '#fffdf4'], ['grid', '--grid', '#d2d8cf'], ['fill', '--fill', '#e9efe8'],
      ['frame', '--frame', '#29434a'], ['frameMid', '--frame-mid', '#9cb4ac'], ['ink', '--ink', '#1e2a32'],
      ['muted', '--muted', '#59666b'], ['accent', '--accent', '#a64a35'], ['accentSoft', '--accent-soft', '#f6d2b8'],
      ['CAUSES', '--series-a', '#1d7a71'], ['FORESHADOWS', '--role-clue', '#a86c1e'],
      ['REVEALS', '--role-explanation', '#d45a3a'], ['question', '--role-explanation-text', '#a64a35'],
    ]);
    // Everything not joined to the node pointed at fades toward the plot.
    const pair = rgb => [pack(rgb), pack(mix(rgb, c.plot, 0.7))];
    return {
      plot: pack(c.plot), dot: pack(mix(c.plot, c.grid, 0.75)), lit: pack(c.accent), litFill: pack(c.accentSoft),
      fill: pair(c.fill), frame: pair(c.frame), shadow: pair(c.frameMid), ink: pair(c.ink), muted: pair(c.muted),
      question: pair(c.question), CAUSES: pair(c.CAUSES), FORESHADOWS: pair(c.FORESHADOWS), REVEALS: pair(c.REVEALS),
    };
  }

  function place() {
    big = Math.min(W, H) >= 200;
    R = big ? 8 : 6;
    font = big ? FONT.big : FONT.small;
    dot = disc(R);
    // Margins: the node and room to wander; labels choose sides that stay in.
    const amp = Math.max(2, Math.min(10, Math.round(Math.min(W, H) * 0.035)));
    const pad = R + amp + 4;
    base = layout(W, H, { left: pad, right: W - pad - 1, top: pad, bottom: H - pad - 1 });
    // Telling positions, then questions, each where it collides least with the
    // nodes, the arrows and the labels placed before it, at rest.
    const curves = graph.edges.map(e => {
      const p0 = base[e.from - 1].map(v => v + 0.5), p1 = base[e.to - 1].map(v => v + 0.5), c = control(p0, p1, e.bend);
      return Array.from({ length: 25 }, (_, i) => bezier(p0, c, p1, i / 24));
    });
    const taken = [];
    const clash = (b, own) => {
      const x0 = b.left - 1, y0 = b.top - 1, x1 = b.left + b.w, y1 = b.top + b.h;
      let n = x0 < amp || y0 < amp || x1 >= W - amp || y1 >= H - amp ? 20 : 0;
      for (const [x, y] of base) {
        const dx = Math.max(x0 - x - 0.5, 0, x + 0.5 - x1 - 1), dy = Math.max(y0 - y - 0.5, 0, y + 0.5 - y1 - 1);
        if (Math.hypot(dx, dy) < R + 1) n += 8;
      }
      for (const o of taken) if (x0 <= o.left + o.w && o.left - 1 <= x1 && y0 <= o.top + o.h && o.top - 1 <= y1) n += 8;
      curves.forEach((pts, i) => { if (i !== own && pts.some(([x, y]) => x >= x0 && x <= x1 + 1 && y >= y0 && y <= y1 + 1)) n += 2; });
      return n;
    };
    const choose = (options, boxOf, own = -1) => {
      let best = options[0], least = Infinity;
      for (const option of options) {
        const n = clash(boxOf(option), own);
        if (n < least) { least = n; best = option; }
      }
      taken.push(boxOf(best));
      return best;
    };
    sides = base.map((p, i) => choose(SIDES, side => tellingBox(i + 1, p, side)));
    asks = graph.edges.map((e, i) => (e.q ? choose(ASKS, ask => questionBox(e, base, ask), i) : null));
    // Each node wanders on its own slow Lissajous path, never far enough to
    // touch a neighbour wandering toward it.
    const next = rng(6);
    drift = base.map(([x, y], i) => {
      let near = Infinity;
      base.forEach(([u, v], j) => { if (j !== i) near = Math.min(near, Math.hypot(u - x, v - y)); });
      return {
        amp: Math.max(0, Math.min(amp, (near - 2 * R - 4) / 2)),
        sx: next() < 0.5 ? -1 : 1, sy: next() < 0.5 ? -1 : 1,
        wx: TAU / (10 + 8 * next()), wy: TAU / (12 + 9 * next()), k: 2.2 + 0.9 * next(),
      };
    });
  }

  // Node centres at time t, on whole pixels, so the web steps like sprites.
  function at(t) {
    return base.map(([x, y], i) => {
      const d = drift[i];
      const ox = d.amp * d.sx * (0.56 * Math.sin(d.wx * t) + 0.14 * Math.sin(d.k * d.wx * t));
      const oy = d.amp * d.sy * (0.56 * Math.sin(d.wy * t) + 0.14 * Math.sin(d.k * d.wy * t));
      return [Math.round(x + ox), Math.round(y + oy)];
    });
  }

  function put(out, x, y, c) {
    if (x >= 0 && y >= 0 && x < W && y < H) out[y * W + x] = c;
  }
  function stamp(out, cells, x, y, c) {
    for (const [dx, dy] of cells) put(out, x + dx, y + dy, c);
  }
  function text(out, f, s, x, y, c) {
    for (const ch of s) {
      const g = f.g[ch];
      for (const [dx, dy] of g.px) put(out, x + dx, y + dy, c);
      x += g.w + 1;
    }
  }
  function box(out, x, y, w, h, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(out, i, j, c);
  }
  function triangle(out, a, b, d, c) {
    const edge = (p, q, x, y) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    const area = edge(a, b, d[0], d[1]);
    for (let y = Math.floor(Math.min(a[1], b[1], d[1])); y <= Math.ceil(Math.max(a[1], b[1], d[1])); y++) {
      for (let x = Math.floor(Math.min(a[0], b[0], d[0])); x <= Math.ceil(Math.max(a[0], b[0], d[0])); x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = edge(a, b, px, py) * area, w1 = edge(b, d, px, py) * area, w2 = edge(d, a, px, py) * area;
        if (w0 >= 0 && w1 >= 0 && w2 >= 0) put(out, x, y, c);
      }
    }
  }

  // One arrow: a bowed pixel line from the source's rim to an arrowhead at the
  // target's rim. FORESHADOWS is dashed; REVEALS is heavier.
  function arrow(out, e, P, faded) {
    const a = P[e.from - 1], b = P[e.to - 1];
    const p0 = [a[0] + 0.5, a[1] + 0.5], p1 = [b[0] + 0.5, b[1] + 0.5], c = control(p0, p1, e.bend);
    const heavy = e.type === 'REVEALS';
    const head = (big ? 5 : 4) + (heavy ? 1 : 0), half = (big ? 3 : 2.5) + (heavy ? 0.5 : 0);
    const color = colors[e.type][faded ? 1 : 0];
    const t0 = leave(p0, c, p1, 0, R + 1.5), tip = leave(p0, c, p1, 1, R + 1.5), t1 = leave(p0, c, p1, 1, R + head);
    trace(p0, c, p1, t0, t1).forEach(([x, y], i) => {
      if (e.type === 'FORESHADOWS' && i % 5 > 2) return;
      put(out, x, y, color);
      if (heavy) { put(out, x + 1, y, color); put(out, x, y + 1, color); put(out, x + 1, y + 1, color); }
    });
    const T = bezier(p0, c, p1, tip), back = bezier(p0, c, p1, tip - 0.03);
    const ux = T[0] - back[0], uy = T[1] - back[1], ul = Math.hypot(ux, uy) || 1;
    const fx = ux / ul, fy = uy / ul, bx = T[0] - fx * head, by = T[1] - fy * head;
    triangle(out, T, [bx - fy * half, by + fx * half], [bx + fy * half, by - fx * half], color);
  }

  // Where node k's telling position goes on side [sx, sy]: the text's box,
  // drawn with a one-pixel border of plot colour.
  function tellingBox(k, [x, y], [sx, sy]) {
    const w = textWidth(FONT.small, String(graph.told[k])), h = FONT.small.h;
    const ax = x + 0.5 + sx * (R + 2.5), ay = y + 0.5 + sy * (R + 2.5);
    return { left: Math.round(ax - (sx < -0.3 ? w : sx > 0.3 ? 0 : w / 2)), top: Math.round(ay - (sy < -0.3 ? h : sy > 0.3 ? 0 : h / 2)), w, h };
  }
  // Where a REVEALS arrow's question goes: beside its bow at parameter t,
  // outside the bow or inside it, kept on the canvas.
  function questionBox(e, P, { t, outside }) {
    const p0 = P[e.from - 1].map(v => v + 0.5), p1 = P[e.to - 1].map(v => v + 0.5), c = control(p0, p1, e.bend);
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, side = (Math.sign(e.bend) || 1) * (outside ? 1 : -1);
    const m = bezier(p0, c, p1, t), w = FONT.small.g.q.w + 1 + textWidth(FONT.small, String(e.q)), h = FONT.small.h + 2;
    const cx = m[0] + ((p0[1] - p1[1]) / L) * side * 7, cy = m[1] + ((p1[0] - p0[0]) / L) * side * 7;
    return { left: Math.max(1, Math.min(W - w - 1, Math.round(cx - w / 2))), top: Math.max(1, Math.min(H - h - 1, Math.round(cy - h / 2))), w, h };
  }

  // q, then the question's number as a subscript.
  function question(out, e, P, faded) {
    const { left, top, w, h } = questionBox(e, P, asks[graph.edges.indexOf(e)]);
    box(out, left - 1, top - 1, w + 2, h + 2, colors.plot);
    const c = colors.question[faded];
    text(out, FONT.small, 'q', left, top, c);
    text(out, FONT.small, String(e.q), left + FONT.small.g.q.w + 1, top + 2, c);
  }

  function render(t, out, still) {
    if (!colors) colors = palette();
    out.fill(colors.plot);
    // A faint pixel grid, so the drift reads against fixed ground.
    for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 8) out[y * W + x] = colors.dot;
    if (!graph || !base.length) return;
    const P = shown = at(still ? 0 : t);
    const joined = e => !hover || e.from === hover || e.to === hover;
    const near = new Set(graph.edges.filter(e => hover && joined(e)).flatMap(e => [e.from, e.to]));
    for (const lit of [false, true]) for (const e of graph.edges) if (joined(e) === lit) arrow(out, e, P, !lit);
    for (let k = 1; k <= graph.n; k++) {
      const [x, y] = P[k - 1], pointed = k === hover, faded = hover && !pointed && !near.has(k) ? 1 : 0;
      stamp(out, dot.all, x, y + 1, colors.shadow[faded]);
      stamp(out, dot.fill, x, y, pointed ? colors.litFill : colors.fill[faded]);
      stamp(out, dot.ring, x, y, pointed ? colors.lit : colors.frame[faded]);
      const s = String(k), w = textWidth(font, s);
      text(out, font, s, x - Math.floor((w - 1) / 2), y - Math.floor((font.h - 1) / 2), colors.ink[faded]);
    }
    // Telling positions, small, each on its node's clearest side.
    for (let k = 1; k <= graph.n; k++) {
      const faded = hover && k !== hover && !near.has(k) ? 1 : 0;
      const { left, top, w, h } = tellingBox(k, P[k - 1], sides[k - 1]);
      box(out, left - 1, top - 1, w + 2, h + 2, colors.plot);
      text(out, FONT.small, String(graph.told[k]), left, top, colors.muted[faded]);
    }
    for (const lit of [false, true]) for (const e of graph.edges) if (e.q && joined(e) === lit) question(out, e, P, lit ? 0 : 1);
  }

  // What the tooltip says about node k: its two positions, its arrows by type
  // (← in, → out) and the questions it raises or resolves.
  function describe(k) {
    const other = e => `e${e.from === k ? e.to : e.from}${e.q ? ` (q${e.q})` : ''}`;
    const lines = [];
    for (const type of TYPES) {
      const into = graph.edges.filter(e => e.type === type && e.to === k), out = graph.edges.filter(e => e.type === type && e.from === k);
      const parts = [into.length ? `← ${into.map(other).join(', ')}` : '', out.length ? `→ ${out.map(other).join(', ')}` : ''].filter(Boolean);
      if (parts.length) lines.push(`${type} ${parts.join(' · ')}`);
    }
    const raises = graph.edges.filter(e => e.q && e.to === k).map(e => `q${e.q}`);
    const resolves = graph.edges.filter(e => e.q && e.from === k).map(e => `q${e.q}`);
    const qs = [raises.length ? `raises ${raises.join(', ')}` : '', resolves.length ? `resolves ${resolves.join(', ')}` : ''].filter(Boolean);
    if (qs.length) lines.push(qs.join(' · '));
    return { value: `e${k}`, title: `chronological rank ${k} · told ${graph.told[k]}`, lines };
  }

  return {
    id: 'story-graph',
    fps: 10,
    still: 0,
    async load() { graph = await loadGraph(); },
    resize(w, h) { W = w; H = h; if (graph) place(); },
    theme() { colors = palette(); },
    render,
    // Node centres and radius at time t, for the browser checks.
    geometry(t) { return { r: R, nodes: at(t) }; },
    // Pointing (mouse, pen or a tap) lights a node's arrows; the scheduler
    // passes `redraw` so a still web answers too.
    attach(node, redraw) {
      const pick = e => {
        const canvas = node.querySelector('canvas');
        if (!canvas || !shown.length) return 0;
        const r = canvas.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
        let best = 0, bestD = R + 4;
        shown.forEach(([px, py], i) => {
          const d = Math.hypot(px + 0.5 - x, py + 0.5 - y);
          if (d < bestD) { bestD = d; best = i + 1; }
        });
        return best;
      };
      const point = (k, e) => {
        if (k !== hover) {
          hover = k;
          if (k) node.dataset.hover = String(k); else delete node.dataset.hover;
          redraw();
        }
        if (k) showTip(describe(k), e.clientX, e.clientY); else hideTip();
      };
      node.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') point(pick(e), e); });
      node.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') point(0, e); });
      node.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') point(pick(e), e); });
      // A tap elsewhere on the page lets go.
      document.addEventListener('pointerdown', e => { if (hover && !node.contains(e.target)) point(0, e); });
    },
  };
}
