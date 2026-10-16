// Heptapod logograms from Arrival, traced from reference images (ink coverage,
// ring centred) and drawn as pixel ink. "Time" crowns the title: each cycle its
// ink is sprayed round the circle in one sweep, lives with a slow curl-noise
// drift that moves the splatter tips more than the ring, then thins into smoke
// and is written again, on a glowing screen as in the film. "There is no linear
// time" sits above the epigraph in plain ink: the page's scroll writes it, so
// scrolling back unwrites it. Still frames show the traced shapes exactly.

import { clamp01, smooth, bayer, mix, pack, noise3, sample, distance, blur, fogTexture, sampleTile, isDarkTheme, themeColors, loadPixels, resampleBox } from './pixel.js';

const PHASES = { write: 3.4, live: 36, fade: 4.2, rest: 1.6 };
const CYCLE = PHASES.write + PHASES.live + PHASES.fade + PHASES.rest;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// ring: radius as a fraction of the square; gap: the ring's open end (screen
// angle, y down); fill: the square as a fraction of the canvas.
export const TIME = { src: new URL('../../img/logogram-time.png', import.meta.url), ring: 0.35, gap: 85 * DEG, fill: 0.8, mist: true, scroll: false };
export const NO_LINEAR_TIME = { src: new URL('../../img/logogram-no-linear-time.png', import.meta.url), ring: 0.3558, gap: 80 * DEG, fill: 0.96, mist: false, scroll: true };

const COVERAGE = new Map();
function loadCoverage(src) {
  if (!COVERAGE.has(src.href)) {
    COVERAGE.set(src.href, loadPixels(src).then(({ data, width }) => {
      const cov = new Float32Array(width * width);
      for (let i = 0; i < cov.length; i++) cov[i] = 1 - data[i * 4] / 255;
      return { cov, n: width };
    }));
  }
  return COVERAGE.get(src.href);
}

export function createLogogram(options = TIME) {
  const { ring: RING, gap: GAP, fill: FILL, mist: MIST, scroll: SCROLL } = options;
  let source = null;
  let W = 0, H = 0, S = 0, ox = 0, oy = 0;
  let cov, inside, nearInk, arrival, tendril, halo, haloWide, mistShape, mistBuf, fogTex;
  let mistAt = NaN;    // mist frame last drawn (it changes four times a second)
  let colors = null;
  // Coarse flow grid (curl noise), refreshed per frame.
  const CELL = 4;
  let gw = 0, gh = 0, flowX, flowY, breath;

  function palette() {
    const dark = isDarkTheme();
    const t = themeColors([['bg', '--bg', '#f2e9d8'], ['ink', '--ink', '#1e2a32']]);
    if (!MIST) {
      // Ink straight on the page: dark by day, cream by night.
      return {
        dark, gain: 0, lift: 0, mist: [],
        ink: pack(t.ink), mid: pack(mix(t.ink, t.bg, 0.3)), smoke: pack(mix(t.ink, t.bg, 0.62)),
      };
    }
    if (!dark) {
      const white = [255, 253, 246];
      return {
        dark, gain: 2.7, lift: -0.1,
        mist: [0.34, 0.62, 0.88].map(k => pack(mix(t.bg, white, k))),
        ink: pack(t.ink), mid: pack(mix(t.ink, t.bg, 0.28)), smoke: pack(mix(t.ink, t.bg, 0.62)),
      };
    }
    // Night: the screen glows in a dark chamber, as in the film.
    const screen = [218, 220, 209];
    const inkDark = [15, 29, 34];
    return {
      dark, gain: 6.1, lift: 0.2,
      mist: [0.1, 0.22, 0.37, 0.53, 0.7, 0.86].map(k => pack(mix(t.bg, screen, k))),
      ink: pack(inkDark), mid: pack(mix(inkDark, screen, 0.3)), smoke: pack(mix(inkDark, screen, 0.58)),
    };
  }

  function prepare() {
    const n = S;
    cov = resampleBox(source.cov, source.n, source.n, n, n);
    const ink = new Uint8Array(n * n), paper = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) { ink[i] = cov[i] >= 0.2 ? 1 : 0; paper[i] = 1 - ink[i]; }
    inside = distance(paper, n, n);          // depth inside the ink: thin strokes fade first
    nearInk = distance(ink, n, n);           // how far ink (or its smoke) could have to drift
    arrival = new Float32Array(n * n);
    tendril = new Float32Array(n * n);
    const c = n / 2, R = RING * n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x, dx = x + 0.5 - c, dy = y + 0.5 - c;
        const r = Math.hypot(dx, dy);
        let a = Math.atan2(dy, dx) - GAP - 0.12;
        a = ((a % TAU) + TAU) % TAU;
        const sweep = a / (TAU - 0.3);
        const off = Math.abs(r - R) / (n / 2);
        tendril[i] = smooth(0.05, 0.24, off);
        // Ink travels round the ring, then bursts outward into the splatters.
        arrival[i] = clamp01(0.62 * clamp01(sweep) + 0.3 * smooth(0, 0.3, off) + 0.08 * (noise3(x * 0.13, y * 0.13, 7.1) * 0.5 + 0.5));
      }
    }
    halo = blur(cov, n, n, Math.max(1, Math.round(n / 70)), 2);
    haloWide = blur(cov, n, n, Math.max(2, Math.round(n / 26)), 2);
    // The mist: a soft disc behind the logogram.
    mistShape = new Float32Array(W * H);
    const mx = W / 2, my = H / 2, rad = Math.min(W, H) / 2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x + 0.5 - mx, y + 0.5 - my) / rad;
        mistShape[y * W + x] = 1 - smooth(0.62, 1, d);
      }
    }
    mistBuf = new Uint32Array(W * H);
    mistAt = NaN;
    fogTex = fogTexture();
    gw = Math.ceil(n / CELL) + 3; gh = gw;
    flowX = new Float32Array(gw * gh); flowY = new Float32Array(gw * gh); breath = new Float32Array(gw * gh);
  }

  // Curl of a slowly evolving noise potential: swirling, incompressible drift.
  function updateFlow(t) {
    const L = S * 0.16, k = 1 / L, e = 0.5;
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const x = (gx - 1) * CELL, y = (gy - 1) * CELL, z = t * 0.07;
        const n1 = noise3((x + e) * k, y * k, z), n2 = noise3((x - e) * k, y * k, z);
        const n3 = noise3(x * k, (y + e) * k, z), n4 = noise3(x * k, (y - e) * k, z);
        // Gradient in noise units (about ±1.5), so one unit of drift ≈ one art pixel.
        const i = gy * gw + gx;
        flowX[i] = (n3 - n4) / (2 * e * k) * 0.75;
        flowY[i] = -(n1 - n2) / (2 * e * k) * 0.75;
        breath[i] = noise3(x * 0.09, y * 0.09, t * 0.35 + 11);
      }
    }
  }
  const gridAt = (field, x, y) => sample(field, gw, gh, x / CELL + 1, y / CELL + 1);

  // The screen's mist: a soft disc of light with fog drifting through it.
  function drawMist(tm) {
    const { mist, gain, lift } = colors;
    const s1 = tm * 1.1, s2 = tm * 0.7;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = y * W + x, ms = MIST ? mistShape[o] : 0;
        let px = 0;
        if (ms > 0) {
          const f = 0.5 * sampleTile(fogTex, x * 0.9 + s1, y * 0.9 - s1 * 0.35)
            + 0.5 * sampleTile(fogTex, x * 0.55 - s2 + 31, y * 0.55 + s2 * 0.2 + 17);
          const level = ms * gain * (0.84 + 0.28 * f) + lift, fl = Math.floor(level);
          const li = Math.min(mist.length, fl + (level - fl > bayer(x, y) ? 1 : 0));
          if (li > 0) px = mist[li - 1];
        }
        mistBuf[o] = px;
      }
    }
  }

  function phaseAt(t) {
    let u = ((t % CYCLE) + CYCLE) % CYCLE;
    if (u < PHASES.write) return { name: 'write', p: u / PHASES.write };
    u -= PHASES.write;
    if (u < PHASES.live) return { name: 'live', p: u / PHASES.live };
    u -= PHASES.live;
    if (u < PHASES.fade) return { name: 'fade', p: u / PHASES.fade };
    return { name: 'rest', p: (u - PHASES.fade) / PHASES.rest };
  }

  return {
    id: 'logogram',
    fps: 12,
    still: PHASES.write + 6,      // a calm moment of the live phase
    scroll: 0,          // write progress, set by the scheduler for scroll-written logograms
    async load() { source = await loadCoverage(options.src); },
    resize(w, h) {
      W = w; H = h;
      S = Math.max(24, Math.floor(Math.min(w, h) * FILL));
      ox = Math.floor((W - S) / 2); oy = Math.floor((H - S) / 2);
      prepare();
    },
    theme() { colors = palette(); mistAt = NaN; },
    render(t, out, still) {
      if (!colors) colors = palette();
      // Scroll-written: the page's scroll sets how far the ink has travelled.
      const ph = still ? { name: 'live', p: 0.2 }
        : SCROLL ? (this.scroll < 1 ? { name: 'write', p: this.scroll } : { name: 'live', p: 0.5 })
          : phaseAt(t);
      const n = S;
      // Phase parameters: drift amplitude, write front, erosion depth, smoke.
      let ampBase = 0.35, ampTip = 1.7, front = 2, erode = -1, smoke = 0.2, haloMix = 0, ink = 1, spread = 0;
      if (ph.name === 'write') {
        front = ph.p * 1.08;
        ampBase = 0.25; ampTip = 1.2; smoke = 0.42;
      } else if (ph.name === 'fade') {
        const p = ph.p;
        erode = Math.pow(p, 1.6) * 0.09 * n;     // depth (art px) of ink already dissolved
        ampBase = 0.35 + p * 2.4; ampTip = 1.7 + p * 3.5;
        smoke = (0.2 + 0.6 * Math.sin(Math.min(1, p * 1.4) * Math.PI / 2)) * (1 - smooth(0.62, 1, p));
        haloMix = smooth(0, 0.7, p);
        spread = 0.16 * smooth(0, 1, p);
      } else if (ph.name === 'rest') {
        ink = 0; smoke = 0;
      }
      if (still) { ampBase = 0; ampTip = 0; smoke = 0; }
      // Settling: the first seconds of life drift a little more, like fresh ink.
      if (ph.name === 'live') {
        const settle = 1 - smooth(0, 0.08, ph.p);
        ampTip += settle * 0.8;
        smoke += settle * 0.2;
        if (!MIST) smoke = 0;               // on the plain page the settled ink is crisp
      }
      if (!still) updateFlow(t); else { flowX.fill(0); flowY.fill(0); breath.fill(0); }

      const { ink: cInk, mid: cMid, smoke: cSmoke } = colors;
      const mistFrame = still ? -1 : Math.floor(t * 4);
      if (mistFrame !== mistAt) { drawMist(still ? 0 : mistFrame / 4); mistAt = mistFrame; }
      out.set(mistBuf);
      if (!ink) return;
      const wispShift = t * 2.3, c0 = n / 2;
      // Pixels farther from the ink than the drift and smoke can carry it stay as they are.
      const reach = ph.name === 'fade' ? 16 : smoke > 0 ? 9 : ampBase + ampTip + 1.5;
      for (let ly = Math.max(0, -oy); ly < Math.min(n, H - oy); ly++) {
        const y = ly + oy;
        for (let lx = Math.max(0, -ox); lx < Math.min(n, W - ox); lx++) {
          const x = lx + ox, i = ly * n + lx;
          if (nearInk[i] > reach) continue;
          const amp = ampBase + ampTip * tendril[i];
          const fx = gridAt(flowX, lx, ly) * amp, fy = gridAt(flowY, lx, ly) * amp;
          const sx = lx + fx, sy = ly + fy;
          const cv = sample(cov, n, n, sx, sy);
          const d = 0.05 * gridAt(breath, lx, ly);
          let tone = 0;
          if (cv >= 0.2 + d) tone = cv >= 0.42 + d ? 3 : 2;
          else if (cv >= 0.07 + d && bayer(x, y) < 0.5) tone = 1;
          if (!tone && !(smoke > 0)) continue;
          // Wisps: fine fog texture carried by the same flow as the ink.
          const wisp = sampleTile(fogTex, lx * 2.1 + fx * 3 + wispShift, ly * 2.1 + fy * 3 - wispShift * 0.6);
          if (tone) {
            if (arrival[i] > front) tone = arrival[i] < front + 0.06 && bayer(x, y) < 0.55 * wisp * wisp + 0.05 ? 1 : 0;
            if (erode >= 0 && tone) {
              const depth = sample(inside, n, n, sx, sy) + 1.4 * gridAt(breath, lx, ly);
              if (depth < erode) tone = depth > erode - 1.8 && bayer(x, y) < 0.25 + 0.5 * wisp ? 1 : 0;
              else if (depth < erode + 1.2 && tone > 2) tone = 2;
            }
          }
          const o = y * W + x;
          if (tone === 3) out[o] = cInk;
          else if (tone === 2) out[o] = cMid;
          else if (tone === 1) out[o] = cSmoke;
          else if (smoke > 0) {
            // Smoke: a faint halo that drifts further than the ink and, as
            // the logogram dissolves, spreads outward from the ring.
            let hx = lx + fx * 2.6, hy = ly + fy * 2.6;
            if (spread > 0) { hx = c0 + (hx - c0) * (1 - spread); hy = c0 + (hy - c0) * (1 - spread); }
            let h = sample(halo, n, n, hx, hy);
            if (haloMix > 0) h = h * (1 - haloMix) + sample(haloWide, n, n, hx + fx * 1.5, hy + fy * 1.5) * haloMix * 1.15;
            if (front < 1.5 && arrival[i] > front + 0.1) h = 0;
            const sm = smooth(0.04, 0.2, h) * (1 - 0.55 * smooth(0.3, 0.6, h)) * smoke * (0.15 + 1.7 * wisp * wisp);
            if (sm > 0 && bayer(x + 1, y + 2) < sm * 0.5) out[o] = cSmoke;
          }
        }
      }
    },
  };
}
