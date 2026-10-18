// Figure 6's story graph as a web of pixel nodes. One annotated work: fourteen
// events, each numbered by its chronological rank with its telling position in
// small type beside it, joined by the figure's CAUSES, FORESHADOWS and REVEALS
// arrows; each REVEALS arrow carries the reader question q1–q4 it answers.
//
// The web opens as nodes alone. Then the arrows flow out in the story's own
// chronology: the events no arrow reaches send theirs first, each arrow lands
// on its target with a soft ring, and the event it reaches sends out its own.
// As the last arrows land, the web begins, from rest, to drift: a node's place
// carries no data, so each wanders slowly round it while the arrows hold. The
// paper lines the nodes up along chronology; here they rest in a crossing-free
// web. The still frame is the finished web at rest, and once it has been shown
// the opening does not replay.
//
// Unlike the cameos, this scene paints a canvas at device resolution, in
// art-pixel units: nodes and type stay pixel sprites but are placed to the
// device pixel, and the arrows are smooth curves, so the motion glides instead
// of stepping. Pointing at a node lights its arrows and lists them in the tooltip.

import { clamp01, mix, rng, smooth, themeColors } from './pixel.js';
import { showTip, hideTip } from '../tooltip.js';

const DATA = new URL('../../data/story-graph.json', import.meta.url);
const TYPES = ['CAUSES', 'FORESHADOWS', 'REVEALS'];
const TAU = Math.PI * 2;
// The opening, in seconds.
const OPEN = {
  fade: 0.6,            // each node fades in over this long,
  stagger: 0.03,        // one rank after another;
  first: 0.75,          // the first arrows leave,
  roots: 0.14,          // from each event no arrow reaches in turn;
  siblings: 0.08,       // an event's arrows leave this far apart;
  flight: [0.55, 0.7],  // an arrow flies for the first plus the second times its share of the longest;
  ring: 0.8,            // a landing's ring spreads and fades;
  settle: 3,            // the drift grows from nothing over this long, from just before the last landing.
};
const STEPS = 32;       // segments per drawn arrow
const DIM = 0.25;       // what a pointed node leaves of the opacity of everything it does not touch
const FOCUS_MS = 180;   // the dimming fades in and out
const ease = p => (p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? 4 * p * p * p : 1 - (2 - 2 * p) ** 3 / 2);

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
// The direction of the bow at parameter t.
const slope = (p0, c, p1, t) => [2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]), 2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1])];

// ---- the scene -------------------------------------------------------------------
export function createStoryGraph() {
  let graph = null;
  let W = 0, H = 0, K = 1;    // canvas in art pixels; device pixels per art pixel
  let R = 6, big = false, font = FONT.small, dot = disc(6);
  let base = [], drift = [], sides = [], asks = [];
  let start = [], flight = [], landed = 0;     // per arrow: when it leaves and how long it flies; the last landing
  let colors = null, art = null;               // theme colours; the ground and sprites at this size and theme
  let shown = [];                              // node centres in the last frame, for pointing
  let hover = 0;                               // the node pointed at (0: none)
  const focus = { node: 0, from: 0, to: 0, at: 0 };   // the node whose arrows stay lit, and the dimming's fade
  let whole = false, resumed = null;           // the finished web has been shown; when motion came back after it

  function palette() {
    const c = themeColors([
      ['plot', '--plot', '#fffdf4'], ['grid', '--grid', '#d2d8cf'], ['fill', '--fill', '#e9efe8'],
      ['frame', '--frame', '#29434a'], ['frameMid', '--frame-mid', '#9cb4ac'], ['ink', '--ink', '#1e2a32'],
      ['muted', '--muted', '#59666b'], ['accent', '--accent', '#a64a35'], ['accentSoft', '--accent-soft', '#f6d2b8'],
      ['CAUSES', '--series-a', '#1d7a71'], ['FORESHADOWS', '--role-clue', '#a86c1e'],
      ['REVEALS', '--role-explanation', '#d45a3a'], ['question', '--role-explanation-text', '#a64a35'],
    ]);
    const css = rgb => `rgb(${rgb.join(',')})`;
    return {
      plot: css(c.plot), dot: css(mix(c.plot, c.grid, 0.75)), fill: css(c.fill), frame: css(c.frame),
      shadow: css(c.frameMid), ink: css(c.ink), muted: css(c.muted), lit: css(c.accent), litFill: css(c.accentSoft),
      question: css(c.question), CAUSES: css(c.CAUSES), FORESHADOWS: css(c.FORESHADOWS), REVEALS: css(c.REVEALS),
    };
  }

  function place() {
    big = Math.min(W, H) >= 200;
    R = big ? 8 : 6;
    font = big ? FONT.big : FONT.small;
    dot = disc(R);
    // Margins: the node and room to wander; labels choose sides that stay in.
    const amp = Math.max(2, Math.min(9, Math.round(Math.min(W, H) * 0.035)));
    const pad = R + amp + 4;
    base = layout(W, H, { left: pad, right: W - pad, top: pad, bottom: H - pad });
    // Telling positions, then questions, each where it collides least with the
    // nodes, the arrows and the labels placed before it, at rest.
    const curves = graph.edges.map(e => {
      const p0 = base[e.from - 1], p1 = base[e.to - 1], c = control(p0, p1, e.bend);
      return Array.from({ length: 25 }, (_, i) => bezier(p0, c, p1, i / 24));
    });
    const taken = [];
    const clash = (b, own) => {
      const x0 = b.left - 1, y0 = b.top - 1, x1 = b.left + b.w + 1, y1 = b.top + b.h + 1;
      let n = x0 < amp || y0 < amp || x1 > W - amp || y1 > H - amp ? 20 : 0;
      for (const [x, y] of base) if (Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1)) < R + 1.5) n += 8;
      for (const o of taken) if (x0 < o.left + o.w + 1 && o.left - 1 < x1 && y0 < o.top + o.h + 1 && o.top - 1 < y1) n += 8;
      curves.forEach((pts, i) => { if (i !== own && pts.some(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) n += 2; });
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
    // The opening's timing. An event no arrow reaches is reached at the start,
    // any other when its first arrow lands; its own arrows leave once it is
    // reached, and an arrow flies longer the longer it is. Arrows only run
    // forward in chronology, so taking events in rank order times every arrow
    // into an event before any arrow out of it.
    const length = graph.edges.map(e => Math.hypot(base[e.to - 1][0] - base[e.from - 1][0], base[e.to - 1][1] - base[e.from - 1][1]));
    const longest = Math.max(...length);
    start = []; flight = [];
    let roots = 0;
    for (let k = 1; k <= graph.n; k++) {
      const arrivals = graph.edges.flatMap((e, i) => (e.to === k ? [start[i] + flight[i]] : []));
      const reached = arrivals.length ? Math.min(...arrivals) : OPEN.first + OPEN.roots * roots++;
      graph.edges.map((e, i) => i).filter(i => graph.edges[i].from === k)
        .sort((a, b) => graph.edges[a].to - graph.edges[b].to || a - b)
        .forEach((i, j) => {
          start[i] = reached + OPEN.siblings * j;
          flight[i] = OPEN.flight[0] + (OPEN.flight[1] * length[i]) / longest;
        });
    }
    landed = Math.max(...start.map((s, i) => s + flight[i]));
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
    art = null;
  }

  // How far the opening has gone at time t: an arrow's growth (0–1), a node's
  // fade (0–1), and how much of the drift has come in (0–1). Once the finished
  // web has been shown, only the drift comes back, from the moment motion did.
  const grown = (i, t) => (whole ? 1 : ease((t - start[i]) / flight[i]));
  const appeared = (k, t) => (whole ? 1 : ease((t - OPEN.stagger * (k - 1)) / OPEN.fade));
  const swayed = t => (whole ? smooth(resumed, resumed + OPEN.settle, t) : smooth(landed - 0.6, landed - 0.6 + OPEN.settle, t));

  // Node centres at time t: at rest, plus each node's wander as far as the drift has come in.
  function at(t, sway) {
    return base.map(([x, y], i) => {
      const d = drift[i], a = d.amp * sway;
      return [
        x + a * d.sx * (0.56 * Math.sin(d.wx * t) + 0.14 * Math.sin(d.k * d.wx * t)),
        y + a * d.sy * (0.56 * Math.sin(d.wy * t) + 0.14 * Math.sin(d.k * d.wy * t)),
      ];
    });
  }

  // Where node k's telling position goes on side [sx, sy]: the text's box, drawn
  // with a one-pixel border of plot colour.
  function tellingBox(k, [x, y], [sx, sy]) {
    const w = textWidth(FONT.small, String(graph.told[k])), h = FONT.small.h;
    const ax = x + sx * (R + 2.5), ay = y + sy * (R + 2.5);
    return { left: ax - (sx < -0.3 ? w : sx > 0.3 ? 0 : w / 2), top: ay - (sy < -0.3 ? h : sy > 0.3 ? 0 : h / 2), w, h };
  }
  // Where a REVEALS arrow's question goes: beside its bow at parameter t,
  // outside the bow or inside it, kept on the canvas.
  function questionBox(e, P, { t, outside }) {
    const p0 = P[e.from - 1], p1 = P[e.to - 1], c = control(p0, p1, e.bend);
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, side = (Math.sign(e.bend) || 1) * (outside ? 1 : -1);
    const m = bezier(p0, c, p1, t), w = FONT.small.g.q.w + 1 + textWidth(FONT.small, String(e.q)), h = FONT.small.h + 2;
    const cx = m[0] + ((p0[1] - p1[1]) / L) * side * 7, cy = m[1] + ((p1[0] - p0[0]) / L) * side * 7;
    return { left: Math.max(1, Math.min(W - w - 1, cx - w / 2)), top: Math.max(1, Math.min(H - h - 1, cy - h / 2)), w, h };
  }

  // ---- sprites: pixel art at K device pixels per art pixel -----------------------
  function sheet(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * K));
    c.height = Math.max(1, Math.ceil(h * K));
    return c;
  }
  function cells(ctx, list, x0, y0, color) {
    ctx.fillStyle = color;
    for (const [x, y] of list) ctx.fillRect((x0 + x) * K, (y0 + y) * K, K, K);
  }
  function type(ctx, f, s, x0, y0, color) {
    ctx.fillStyle = color;
    for (const ch of s) {
      const g = f.g[ch];
      for (const [x, y] of g.px) ctx.fillRect((x0 + x) * K, (y0 + y) * K, K, K);
      x0 += g.w + 1;
    }
  }
  function label(w, h, draw) {
    const c = sheet(w + 2, h + 2), ctx = c.getContext('2d');
    ctx.fillStyle = colors.plot;
    ctx.fillRect(0, 0, c.width, c.height);
    draw(ctx);
    return c;
  }
  // The ground (plot colour and a faint pixel grid, so the drift reads against
  // fixed ground), each node plain and lit, and the labels.
  function paint() {
    const ground = sheet(W, H), g = ground.getContext('2d');
    g.fillStyle = colors.plot;
    g.fillRect(0, 0, ground.width, ground.height);
    g.fillStyle = colors.dot;
    for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 8) g.fillRect(x * K, y * K, K, K);
    const node = (k, lit) => {
      const c = sheet(2 * R + 1, 2 * R + 2), ctx = c.getContext('2d'), s = String(k), w = textWidth(font, s);
      cells(ctx, dot.all, R, R + 1, colors.shadow);
      cells(ctx, dot.fill, R, R, lit ? colors.litFill : colors.fill);
      cells(ctx, dot.ring, R, R, lit ? colors.lit : colors.frame);
      type(ctx, font, s, R - Math.floor((w - 1) / 2), R - Math.floor((font.h - 1) / 2), colors.ink);
      return c;
    };
    const small = FONT.small;
    art = {
      ground,
      nodes: Array.from({ length: graph.n }, (_, i) => [node(i + 1, false), node(i + 1, true)]),
      told: Array.from({ length: graph.n }, (_, i) => {
        const s = String(graph.told[i + 1]);
        return label(textWidth(small, s), small.h, ctx => type(ctx, small, s, 1, 1, colors.muted));
      }),
      asks: graph.edges.map(e => (e.q ? label(small.g.q.w + 1 + textWidth(small, String(e.q)), small.h + 2, ctx => {
        type(ctx, small, 'q', 1, 1, colors.question);
        type(ctx, small, String(e.q), 2 + small.g.q.w, 3, colors.question);   // the subscript
      }) : null)),
    };
  }

  // One arrow, as far as it has grown: a bowed line from the source's rim whose
  // head flies ahead of it and settles on the target's rim. FORESHADOWS is
  // dashed; REVEALS is heavier.
  function arrow(ctx, e, i, P, t, alpha) {
    const grow = grown(i, t);
    if (grow <= 0) return;
    const p0 = P[e.from - 1], p1 = P[e.to - 1], c = control(p0, p1, e.bend);
    const t0 = leave(p0, c, p1, 0, R + 1.5), t1 = leave(p0, c, p1, 1, R + 1.5);
    const pts = [], len = [0];
    for (let j = 0; j <= STEPS; j++) {
      const q = bezier(p0, c, p1, t0 + ((t1 - t0) * j) / STEPS);
      if (j) len.push(len[j - 1] + Math.hypot(q[0] - pts[j - 1][0], q[1] - pts[j - 1][1]));
      pts.push(q);
    }
    // The point s along the arrow, and the bow's parameter there.
    const along = s => {
      let j = 1;
      while (j < STEPS && len[j] < s) j++;
      const f = clamp01((s - len[j - 1]) / (len[j] - len[j - 1] || 1));
      return { j, x: pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * f, y: pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * f, u: t0 + ((t1 - t0) * (j - 1 + f)) / STEPS };
    };
    const heavy = e.type === 'REVEALS', tip = len[STEPS] * grow;
    // The head grows in over its first few pixels, so nothing pokes out of the source.
    const size = Math.min(1, tip / 8), head = ((big ? 5 : 4) + (heavy ? 1 : 0)) * size, half = ((big ? 3 : 2.5) + (heavy ? 0.5 : 0)) * size;
    const end = along(Math.max(0, tip - head * 0.6));
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ctx.fillStyle = colors[e.type];
    ctx.lineWidth = heavy ? 2 : 1;
    ctx.lineCap = e.type === 'FORESHADOWS' ? 'butt' : 'round';
    ctx.setLineDash(e.type === 'FORESHADOWS' ? [3, 2] : []);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let j = 1; j < end.j; j++) ctx.lineTo(pts[j][0], pts[j][1]);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    const T = along(tip), [dx, dy] = slope(p0, c, p1, T.u), dl = Math.hypot(dx, dy) || 1, fx = dx / dl, fy = dy / dl;
    const bx = T.x - fx * head, by = T.y - fy * head;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(T.x, T.y);
    ctx.lineTo(bx - fy * half, by + fx * half);
    ctx.lineTo(bx + fy * half, by - fx * half);
    ctx.closePath();
    ctx.fill();
  }

  // How far everything a pointed node does not touch has dimmed (0–1); the
  // fade runs only while the web moves.
  function dimming(still) {
    const u = still ? 1 : smooth(0, FOCUS_MS, performance.now() - focus.at);
    if (u >= 1 && !focus.to) focus.node = 0;
    return focus.from + (focus.to - focus.from) * u;
  }

  function draw(ctx, t, still) {
    if (!colors) colors = palette();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (!graph || !base.length) {
      ctx.fillStyle = colors.plot;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      return;
    }
    if (!art) paint();
    // A still frame is the finished web at rest; after one, motion resumes as drift.
    if (still) { whole = true; resumed = null; } else if (whole && resumed === null) resumed = t;
    const P = shown = at(t, still ? 0 : swayed(t));
    const d = dimming(still);
    const joined = e => !focus.node || e.from === focus.node || e.to === focus.node;
    const near = new Set(graph.edges.filter(e => focus.node && joined(e)).flatMap(e => [e.from, e.to]));
    const touched = k => !focus.node || k === focus.node || near.has(k);
    const opacity = on => (on ? 1 : 1 - d * (1 - DIM));
    const px = v => Math.round(v * K);
    ctx.drawImage(art.ground, 0, 0);
    ctx.setTransform(K, 0, 0, K, 0, 0);
    ctx.lineJoin = 'round';
    for (const lit of [false, true]) graph.edges.forEach((e, i) => { if (joined(e) === lit) arrow(ctx, e, i, P, t, opacity(lit)); });
    // Each landing: a ring spreads from the target and fades.
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    if (!whole) {
      graph.edges.forEach((e, i) => {
        const u = (t - start[i] - flight[i]) / OPEN.ring;
        if (u < 0 || u >= 1) return;
        const [x, y] = P[e.to - 1];
        ctx.globalAlpha = 0.6 * (1 - u) * (1 - u) * opacity(joined(e));
        ctx.strokeStyle = colors[e.type];
        ctx.beginPath();
        ctx.arc(x, y, R + 1 + 6 * ease(u), 0, TAU);
        ctx.stroke();
      });
    }
    // Nodes, rising into place as they fade in, then their telling positions.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const rise = k => 3 * (1 - appeared(k, t));
    for (let k = 1; k <= graph.n; k++) {
      const show = appeared(k, t);
      if (show <= 0) continue;
      const [x, y] = P[k - 1], [plain, lit] = art.nodes[k - 1];
      const left = px(x - R - 0.5), top = px(y - R - 0.5 + rise(k));
      ctx.globalAlpha = show * opacity(touched(k));
      ctx.drawImage(plain, left, top);
      if (k === focus.node && d > 0) {
        ctx.globalAlpha = show * d;
        ctx.drawImage(lit, left, top);
      }
    }
    for (let k = 1; k <= graph.n; k++) {
      const show = appeared(k, t);
      if (show <= 0) continue;
      const [x, y] = P[k - 1], b = tellingBox(k, [x, y + rise(k)], sides[k - 1]);
      ctx.globalAlpha = show * opacity(touched(k));
      ctx.drawImage(art.told[k - 1], px(b.left - 1), px(b.top - 1));
    }
    // Each question comes in as its arrow lands.
    for (const lit of [false, true]) {
      graph.edges.forEach((e, i) => {
        if (!e.q || joined(e) !== lit) return;
        const show = whole ? 1 : smooth(start[i] + flight[i], start[i] + flight[i] + 0.5, t);
        if (show <= 0) return;
        const b = questionBox(e, P, asks[i]);
        ctx.globalAlpha = show * opacity(lit);
        ctx.drawImage(art.asks[i], px(b.left - 1), px(b.top - 1));
      });
    }
    ctx.globalAlpha = 1;
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
    vector: true,       // paints its own canvas at device resolution (see index.js)
    fps: 120,           // every display frame
    still: 0,
    share: 0.5,         // the opening waits until half the canvas is on screen
    async load() { graph = await loadGraph(); },
    resize(w, h, k) { W = w; H = h; K = k || 1; if (graph) place(); },
    theme() { colors = palette(); art = null; },
    draw,
    // For the browser checks: node centres and radius, each arrow's growth and
    // the last landing, at time t of an opening that has not been skipped.
    geometry(t) {
      return { r: R, nodes: at(t, swayed(t)), grown: graph.edges.map((e, i) => ease((t - start[i]) / flight[i])), landed };
    },
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
          const d = Math.hypot(px - x, py - y);
          if (d < bestD) { bestD = d; best = i + 1; }
        });
        return best;
      };
      const point = (k, e) => {
        if (k !== hover) {
          const now = dimming(false);
          hover = k;
          if (k) focus.node = k;     // leaving keeps the old node lit while it fades
          Object.assign(focus, { from: now, to: k ? 1 : 0, at: performance.now() });
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
