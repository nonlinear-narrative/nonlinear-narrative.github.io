// Gargantua and the Endurance from Interstellar, in pixel art, traced from a
// still of the film: the Endurance on the left, a small planet in the middle,
// and the lensed edge of Gargantua's disk sweeping across the right, framed and
// seen exactly as in the still.
//
// assets/img/gargantua-trace.png holds the still's light (red) and warmth
// (green) with the ship, planet and stars lifted out; each is mapped to the
// page's palette with an ordered dither. The disk's filaments flow along their
// own streaks: assets/img/gargantua-flow.png gives the streak directions,
// measured from the still and turned anticlockwise round the hole, and two
// copies of the light, offset along them half a cycle apart, are cross-faded
// (a flow map), so the motion loops without drifting. Stars and the planet sit
// where the still has them; the Endurance is redrawn in 3D at the still's
// place, turns slowly about its axis, and its four engines pulse.

import { bayer, pack, hex, clamp01, loadPixels, resampleBox, sample } from './pixel.js';

const TRACE = new URL('../../img/gargantua-trace.png', import.meta.url);
const FLOW = new URL('../../img/gargantua-flow.png', import.meta.url);
const TAU = Math.PI * 2;

// Positions in the still, as fractions of its width (x, r) and height (y).
const SHIP = { x: 0.2015, y: 0.413, r: 0.095 };
const PLANET = { x: 0.5076, y: 0.4829, r: 0.0131 };
// Stars: x, y, brightness (0 faint … 2 bright), tint (0 white, 1 blue, 2 warm).
const STARS = [
  [0.0169, 0.0856, 2, 0], [0.0674, 0.0185, 2, 0], [0.0346, 0.2653, 2, 0], [0.2331, 0.0171, 2, 0],
  [0.0729, 0.0875, 2, 0], [0.0635, 0.5551, 2, 0], [0.0154, 0.9704, 2, 0], [0.1201, 0.1755, 2, 0],
  [0.0841, 0.2505, 2, 0], [0.1271, 0.6537, 1, 0], [0.3227, 0.1218, 1, 0], [0.0784, 0.5014, 1, 0],
  [0.0852, 0.5722, 1, 0], [0.0706, 0.8824, 1, 0], [0.2438, 0.1093, 1, 0], [0.3779, 0.2023, 1, 0],
  [0.1349, 0.8731, 1, 2], [0.0638, 0.9181, 1, 0], [0.2010, 0.9218, 1, 0], [0.3539, 0.1343, 1, 0],
  [0.2508, 0.7366, 1, 0], [0.1714, 0.1111, 1, 2], [0.0721, 0.3213, 1, 0], [0.4250, 0.1162, 1, 0],
  [0.3917, 0.2657, 1, 0], [0.4042, 0.0477, 1, 0], [0.0807, 0.5843, 1, 0], [0.1615, 0.8199, 1, 0],
  [0.0440, 0.0940, 0, 0], [0.2880, 0.6292, 0, 0], [0.3378, 0.7088, 0, 0], [0.4716, 0.2444, 0, 0],
  [0.3516, 0.3000, 0, 0], [0.1135, 0.6750, 0, 0], [0.3641, 0.1852, 0, 2], [0.3388, 0.4907, 0, 0],
  [0.3456, 0.4963, 0, 0], [0.2299, 0.6866, 0, 0], [0.3581, 0.5708, 0, 0], [0.3513, 0.0259, 0, 0],
  [0.2062, 0.7685, 0, 0], [0.3461, 0.2042, 0, 0], [0.4607, 0.1111, 0, 0], [0.3628, 0.1574, 0, 0],
];

// Space and the hole's shadow (cool), the disk from ember to white-hot (warm):
// the page's teal, terracotta, coral, gold and cream.
const COOL = ['#04080a', '#0a1418', '#0e1c21', '#132529', '#1a3035', '#223b40', '#2d494d', '#3d5a5c'];
const WARM = ['#0b171c', '#2b1a1d', '#5a2622', '#843526', '#a64a35', '#d45a3a', '#f08a68', '#f2a86f', '#e7c56b', '#f4dca0', '#fff1d6', '#fffdf4'];
const PALETTE = {
  cool: Uint32Array.from(COOL, c => pack(hex(c))),
  warm: Uint32Array.from(WARM, c => pack(hex(c))),
  stars: ['#f6eddb', '#9fe8dc', '#e7c56b'].map(c => pack(hex(c))),
  faint: pack(hex('#5f7479')),
  planet: ['#081014', '#0f1b20', '#3d4a4c', '#c9c2b2', '#fff7e8'].map(c => pack(hex(c))),
  // Hull: cold shade on the far side, warm light from the disk on the near side.
  hull: ['#071114', '#172226', '#2f3638', '#575752', '#8d806c', '#c8ae86', '#f3dfb8', '#fffaf0'].map(c => pack(hex(c))),
  glow: ['#2f6f6c', '#4cc0b1', '#9fe8dc', '#f2fffc'].map(c => pack(hex(c))),
};

// Warm ramp position for each light level (a contrast curve that keeps the filaments).
const WARM_LEVEL = Float32Array.from({ length: 256 }, (_, k) => Math.pow(k / 255, 1.5) * (WARM.length - 1));

let ASSETS = null;
async function loadAssets() {
  if (ASSETS) return ASSETS;
  const [trace, flow] = await Promise.all([loadPixels(TRACE), loadPixels(FLOW)]);
  const n = trace.width * trace.height, m = flow.width * flow.height;
  const light = new Float32Array(n), warmth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    light[i] = trace.data[i * 4] / 255;
    warmth[i] = (trace.data[i * 4 + 1] - 128) / 600;
  }
  const fx = new Float32Array(m), fy = new Float32Array(m), fc = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    fx[i] = (flow.data[i * 4] - 128) / 127;
    fy[i] = (flow.data[i * 4 + 1] - 128) / 127;
    fc[i] = flow.data[i * 4 + 2] / 255;
  }
  ASSETS = { light, warmth, tw: trace.width, th: trace.height, fx, fy, fc, fw: flow.width, fh: flow.height };
  return ASSETS;
}

// ---- small raster helpers --------------------------------------------------------
function fillQuad(out, W, H, pts, shade) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(W - 1, Math.ceil(x1)); y1 = Math.min(H - 1, Math.ceil(y1));
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n]; area += ax * by - bx * ay; }
  const sgn = area >= 0 ? 1 : -1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      let inside = true;
      for (let i = 0; i < n && inside; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
        if (sgn * ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) < 0) inside = false;
      }
      if (inside) out[y * W + x] = shade(x, y, px, py);
    }
  }
}
function line(out, W, H, ax, ay, bx, by, color) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
  for (let i = 0; i <= n; i++) {
    const x = Math.floor(ax + (bx - ax) * i / n), y = Math.floor(ay + (by - ay) * i / n);
    if (x >= 0 && y >= 0 && x < W && y < H) out[y * W + x] = color;
  }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));

export function createGargantua() {
  let W = 0, H = 0;
  let light, warmth, flowX, flowY, flowing, flowList, still0, stars;

  // The still's pixel at light level L: warm where the still is warm or bright,
  // cool (space, haze, shadow) elsewhere, ordered-dithered between bands.
  function shade(L, w, x, y) {
    const b = bayer(x, y), { cool, warm } = PALETTE;
    const k = clamp01(w / 0.045 + (L - 0.5) / 0.22);
    if (k > b) return warm[Math.min(warm.length - 1, Math.floor(WARM_LEVEL[Math.max(0, Math.min(255, (L * 255) | 0))] + b))];
    return cool[Math.min(cool.length - 1, Math.floor(L * 2 * (cool.length - 1) + b))];
  }

  function prepare() {
    const a = ASSETS;
    light = resampleBox(a.light, a.tw, a.th, W, H);
    warmth = resampleBox(a.warmth, a.tw, a.th, W, H);
    // Flow per art pixel: streak direction scaled by how clearly streaked the light is.
    flowX = new Float32Array(W * H); flowY = new Float32Array(W * H); flowing = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W * a.fw - 0.5, v = (y + 0.5) / H * a.fh - 0.5;
        const i = y * W + x, c = sample(a.fc, a.fw, a.fh, u, v);
        let dx = sample(a.fx, a.fw, a.fh, u, v), dy = sample(a.fy, a.fw, a.fh, u, v);
        const len = Math.hypot(dx, dy) || 1;
        const reach = (W / 213) * 3 * (0.35 + 0.65 * clamp01(c * 1.6));
        flowX[i] = dx / len * reach; flowY[i] = dy / len * reach;
        flowing[i] = light[i] > 0.16 ? 1 : 0;
      }
    }
    // The still itself, once; frames redraw only the pixels that flow.
    still0 = new Uint32Array(W * H);
    const list = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        still0[i] = shade(light[i], warmth[i], x, y);
        if (flowing[i]) list.push(i);
      }
    }
    flowList = Int32Array.from(list);
    stars = STARS.map(([sx, sy, b, tint], k) => ({
      x: Math.min(W - 1, Math.floor(sx * W)), y: Math.min(H - 1, Math.floor(sy * H)), b, tint,
      ph: (k * 2.399) % TAU, sp: 0.3 + ((k * 0.618) % 1) * 0.7,
    }));
  }

  // ---- the Endurance ------------------------------------------------------------
  // Twelve box modules on a ring seen almost face-on, lit from the right by the
  // disk; four carry engines (at three, five, nine and eleven o'clock, as in the
  // still). The docked Ranger and Lander sit on the hub, which one tunnel joins
  // to the ring at four o'clock.
  function drawEndurance(out, t, still) {
    const { hull, glow } = PALETTE;
    const R = SHIP.r * W;
    const spin = -Math.PI / 2 + (still ? 0 : t * (TAU / 120));
    const bob = still ? 0 : Math.round(Math.sin(t * TAU / 13) * 0.55);
    const C = [SHIP.x * W, SHIP.y * H + bob, 0];
    const A = norm([0.1, -0.14, 1]);                  // ring axis, toward the viewer
    const U = norm(cross([0, 1, 0], A)), V = cross(A, U);
    // The disk lights the ship from the right and, through its glow, from the front.
    const lightDir = norm([1, 0.05, 0.75]);
    const ht = R * 0.24, hr = R * 0.19, ha = R * 0.16;
    const ENGINES = new Set([3, 5, 9, 11]);
    const items = [], boxes = [], engines = [];
    const at = th => [add(scale(U, Math.cos(th)), scale(V, Math.sin(th))), add(scale(U, -Math.sin(th)), scale(V, Math.cos(th)))];
    const mods = [];
    for (let i = 0; i < 12; i++) {
      const [rho, tan] = at(spin + i * TAU / 12);
      mods.push({ i, P: add(C, scale(rho, R)), rho, tan });
    }
    for (let i = 0; i < 12; i++) {
      const a = mods[i], b = mods[(i + 1) % 12];
      const p = add(a.P, scale(a.tan, ht)), q = add(b.P, scale(b.tan, -ht));
      items.push({ z: (p[2] + q[2]) / 2 - 1, draw: () => line(out, W, H, p[0], p[1], q[0], q[1], hull[3]) });
    }
    const [hubRho, hubTan] = at(spin + 4 * TAU / 12);
    const tunnelEnd = add(C, scale(hubRho, R - hr));
    items.push({ z: C[2] - 1, draw: () => {
      line(out, W, H, C[0], C[1], tunnelEnd[0], tunnelEnd[1], hull[4]);
      line(out, W, H, C[0], C[1] + 1, tunnelEnd[0], tunnelEnd[1] + 1, hull[2]);
    } });
    boxes.push({ P: add(C, scale(A, R * 0.05)), ax: [hubTan, hubRho, A], h: [R * 0.12, R * 0.12, R * 0.16], kind: 'hub' });
    boxes.push({ P: add(add(C, scale(hubTan, R * 0.3)), scale(A, R * 0.12)), ax: [hubTan, hubRho, A], h: [R * 0.27, R * 0.09, R * 0.08], kind: 'ranger' });
    boxes.push({ P: add(add(C, scale(hubTan, -R * 0.29)), scale(A, R * 0.1)), ax: [hubTan, hubRho, A], h: [R * 0.25, R * 0.12, R * 0.1], kind: 'lander' });
    for (const m of mods) boxes.push({ P: m.P, ax: [m.tan, m.rho, A], h: [ht, hr, ha], kind: ENGINES.has(m.i) ? 'engine' : m.i % 2 ? 'ribbed' : 'plain', i: m.i });

    for (const box of boxes) {
      const [ex, ey, ez] = box.ax, [hx, hy, hz] = box.h;
      const faces = [
        [ex, ey, ez, hx, hy, hz], [scale(ex, -1), ey, ez, hx, hy, hz],
        [ey, ex, ez, hy, hx, hz], [scale(ey, -1), ex, ez, hy, hx, hz],
        [ez, ex, ey, hz, hx, hy], [scale(ez, -1), ex, ey, hz, hx, hy],
      ];
      items.push({ z: box.P[2], draw: () => {
        for (let f = 0; f < 6; f++) {
          const [nrm, s1, s2, hn, h1, h2] = faces[f];
          if (nrm[2] <= 0.04) continue;                       // faces turned away
          const c0 = add(box.P, scale(nrm, hn));
          const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(c0, add(scale(s1, a * h1), scale(s2, b * h2))));
          const lam = Math.max(0, dot(nrm, lightDir));
          const craft = box.kind === 'ranger' || box.kind === 'lander';
          const base = lam * 5 + (craft ? 0.8 : 0);
          const o = corners[0], du = sub(corners[1], o), dv = sub(corners[3], o);
          const det = du[0] * dv[1] - du[1] * dv[0];
          fillQuad(out, W, H, corners.map(q => [q[0], q[1]]), (x, y, px, py) => {
            let level = base;
            if (Math.abs(det) > 1e-6) {
              const qx = px - o[0], qy = py - o[1];
              const s = (qx * dv[1] - qy * dv[0]) / det, v = (du[0] * qy - du[1] * qx) / det;
              const rim = Math.min(s, 1 - s, v, 1 - v) < 0.16;
              // Bevel: edges toward the light catch it, the others fall into shade.
              if (rim) level += px > c0[0] ? 2 : -1.3;
              if (f === 4 && box.kind === 'ribbed' && !rim && Math.floor(s * 5) % 2 === 1) level += 2.3;
              if (f === 4 && box.kind === 'plain' && !rim && v > 0.42 && v < 0.6) level -= 0.9;
              if (f === 2 && !rim && Math.floor(s * 4) % 2 === 1) level -= 1;
            }
            return hull[Math.max(0, Math.min(hull.length - 1, Math.floor(level + bayer(x, y) - 0.5)))];
          });
          if (box.kind === 'engine' && f === 4) {
            for (const [a, b] of [[-0.42, -0.3], [0.42, -0.3], [0, 0.42]]) {
              const q = add(c0, add(scale(s1, a * h1), scale(s2, b * h2)));
              engines.push([q[0], q[1], box.i]);
            }
          }
        }
      } });
    }
    items.sort((p, q) => p.z - q.z);
    for (const it of items) it.draw();
    // Keep the engines lit, with a little slow shimmer above their steady core.
    for (const [x, y, i] of engines) {
      const pulse = still ? 0.85 : 0.8 + 0.12 * Math.sin(t * 0.7 + i * 1.9) + 0.05 * Math.sin(t * 1.4 + i * 0.6);
      const gx = Math.floor(x), gy = Math.floor(y);
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const X = gx + dx, Y = gy + dy;
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const d = Math.hypot(dx, dy);
          const v = pulse * (d === 0 ? 4 : d <= 1 ? 2.2 : d <= 1.5 ? 1.35 : d <= 2.3 ? 0.85 : 0.5);
          const li = Math.floor(v + bayer(X, Y) - 0.5);
          if (li >= 1) out[Y * W + X] = glow[Math.min(glow.length - 1, li)];
        }
      }
      if (pulse > 0.94) {
        for (const d of [-4, 4]) {
          const X = gx + d;
          if (X >= 0 && X < W && gy >= 0 && gy < H) out[gy * W + X] = glow[1];
        }
      }
    }
  }

  // The small planet: dark, with a thin crescent lit by the disk on its right.
  function drawPlanet(out) {
    const { planet } = PALETTE;
    const r = Math.max(2.2, PLANET.r * W), cx = PLANET.x * W, cy = PLANET.y * H;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r, d = Math.hypot(dx, dy);
        if (d > 1) continue;
        // Light from the right: the terminator bends with the sphere.
        const lit = dx - Math.sqrt(Math.max(0, 1 - dy * dy)) * 0.62;
        const level = lit > 0.18 ? 4 : lit > 0.08 ? 3 : lit > -0.02 ? 2 : d > 0.86 ? 1 : 0;
        out[y * W + x] = planet[level];
      }
    }
  }

  return {
    id: 'gargantua',
    fps: 10,
    still: 0,
    async load() { await loadAssets(); },
    resize(w, h) { W = w; H = h; prepare(); },
    theme() {},
    render(t, out, still) {
      out.set(still0);
      if (!still) {
        // Two copies of the light, offset along the streaks half a cycle apart.
        // The cosine eases each copy fully out before it wraps, so the disk's
        // filaments keep moving without a sharp change at either handoff.
        const cycle = 3.6;
        const f0 = (t / cycle) % 1, f1 = (f0 + 0.5) % 1;
        const blend = 0.5 + 0.5 * Math.cos(f0 * TAU);
        const xMax = W - 1.001, yMax = H - 1.001;
        for (let n = 0; n < flowList.length; n++) {
          const i = flowList[n], y = (i / W) | 0, x = i - y * W;
          const dx = flowX[i], dy = flowY[i];
          let L = 0;
          for (let k = 0; k < 2; k++) {
            const f = k ? f1 : f0;
            let sx = x - dx * f, sy = y - dy * f;
            sx = sx < 0 ? 0 : sx > xMax ? xMax : sx;
            sy = sy < 0 ? 0 : sy > yMax ? yMax : sy;
            const xi = sx | 0, yi = sy | 0, fx = sx - xi, fy = sy - yi, j = yi * W + xi;
            const a = light[j], b = light[j + 1], c = light[j + W], d = light[j + W + 1];
            const v = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
            L += k ? v * blend : v * (1 - blend);
          }
          out[i] = shade(L, warmth[i], x, y);
        }
      }
      // Stars twinkle slowly without blinking out; only the brightest flare.
      for (const s of stars) {
        const i = s.y * W + s.x;
        if (light[i] > 0.14) continue;
        const tw = still ? 1 : Math.sin(t * s.sp + s.ph);
        if (s.b === 0) { if (tw > -0.2) out[i] = PALETTE.faint; continue; }
        out[i] = tw > -0.5 ? PALETTE.stars[s.tint] : PALETTE.faint;
        if (s.b === 2 && tw > 0.76) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const X = s.x + dx, Y = s.y + dy;
            if (X >= 0 && Y >= 0 && X < W && Y < H) out[Y * W + X] = PALETTE.faint;
          }
        }
      }
      drawPlanet(out);
      drawEndurance(out, t, still);
      // Pixel-rounded corners.
      for (const [x, y] of [[0, 0], [1, 0], [0, 1], [W - 1, 0], [W - 2, 0], [W - 1, 1], [0, H - 1], [1, H - 1], [0, H - 2], [W - 1, H - 1], [W - 2, H - 1], [W - 1, H - 2]]) out[y * W + x] = 0;
    },
  };
}
