// The heptapod shell from Arrival over its Montana valley, in pixel art. The
// shell's outline is measured from the film's poster: a tall, asymmetric lens,
// its left side bulging, its right side nearly straight, lighter at the rims
// and the base where it catches the sky and the fog. A cloud bank rests on a
// long slope that rises from the valley floor to the ridge on the right, and
// streams down it; fog rolls through the valley; a tandem-rotor Chinook flies
// in from the lower left toward the shell, shrinking with distance, as in the
// poster; lights by the camp sparkle on the valley floor like lights on water.
//
// Everything that does not move (sky, ranges, valley, the shell's shading) is
// laid out once per size; a frame samples the drifting fog textures and draws
// the helicopter and the sparkles.

import { bayer, rng, pack, hex, smooth, tileTexture, fogTexture, sampleTile, isDarkTheme, themeColors, noise3 } from './pixel.js';

let PUFFS = null;
const puffTexture = () => PUFFS || (PUFFS = tileTexture(7, 6, 7, 4, 9.2));

// The shell's outline from the poster: [height 0 top … 1 base, left edge,
// right edge], in widths from the widest row's centre.
const PROFILE = [
  [0.00, 0.190, 0.190], [0.05, -0.061, 0.364], [0.10, -0.177, 0.411], [0.15, -0.262, 0.432], [0.20, -0.330, 0.455],
  [0.25, -0.385, 0.470], [0.30, -0.419, 0.483], [0.35, -0.458, 0.491], [0.40, -0.483, 0.494], [0.45, -0.487, 0.500],
  [0.50, -0.496, 0.500], [0.55, -0.496, 0.500], [0.60, -0.491, 0.494], [0.65, -0.474, 0.487], [0.70, -0.459, 0.470],
  [0.75, -0.427, 0.457], [0.80, -0.384, 0.431], [0.85, -0.328, 0.406], [0.90, -0.260, 0.374], [0.95, -0.165, 0.332],
  [1.00, 0.060, 0.060],
];
const ASPECT = 3.18;                       // height over widest width, as in the poster

// The top of the cloud bank, [x, y] as fractions of the scene: flat along the
// valley floor from just right of the shell, then climbing to the ridge.
const SLOPE = [
  [0.300, 0.656], [0.360, 0.645], [0.410, 0.643], [0.450, 0.635], [0.500, 0.608], [0.550, 0.568],
  [0.600, 0.514], [0.650, 0.430], [0.700, 0.376], [0.750, 0.318], [0.800, 0.268], [0.880, 0.226], [1.000, 0.200],
];

// The Chinook's flight: in perspective from the lower left toward a vanishing
// point at the shell's base (fractions of the scene), depth 1 → 6.
const FLIGHT = { cycle: 31, duration: 18, still: 0.22, from: [-0.06, 0.7], to: [0.236, 0.585], size: 2.6 };

function profileAt(v) {
  const k = Math.min(PROFILE.length - 2, Math.floor(v * 20));
  const f = v * 20 - k, a = PROFILE[k], b = PROFILE[k + 1];
  return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
function slopeAt(u) {
  if (u <= SLOPE[0][0]) return SLOPE[0][1];
  for (let k = 1; k < SLOPE.length; k++) {
    if (u <= SLOPE[k][0]) {
      const [x0, y0] = SLOPE[k - 1], [x1, y1] = SLOPE[k], f = (u - x0) / (x1 - x0);
      return y0 + (y1 - y0) * (f * f * (3 - 2 * f));
    }
  }
  return SLOPE[SLOPE.length - 1][1];
}

function palette() {
  const dark = isDarkTheme();
  const t = themeColors([['bg', '--bg', '#f2e9d8']]);
  const P = list => list.map(c => pack(typeof c === 'string' ? hex(c) : c));
  if (!dark) {
    return {
      dark,
      sky: P([t.bg, '#ebe8de', '#e0e4de', '#d2dcd8']),
      far: P(['#b4c4c3', '#a3b5b5', '#93a7a8']),
      hills: P(['#94a596', '#82958a', '#70847a']),
      valley: P(['#a6ae8b', '#949e7e', '#818c70']),
      fog: P(['#b9c5c3', '#d6ddd9', '#ecede6', '#fbf9f2']),
      end: pack(t.bg),
      streak: pack(hex('#ecede6')),
      // Neutral charcoal, as in the poster: dark core, lighter rims and base.
      shell: P(['#101416', '#161b1e', '#1d2326', '#262c2f', '#30373a', '#3d4447', '#4d5557', '#62696a']),
      heli: P(['#2b302b', '#41473f', '#6b7166', '#8f9488']),
      rotor: pack(hex('#3a3f39')),
      beacon: pack(hex('#c8553d')),
      spark: P(['#c9c6ae', '#d8cdb1', '#f6eddb', '#fffdf4']),
      tent: pack(hex('#fff7e8')),
    };
  }
  return {
    dark,
    sky: P([t.bg, '#142a30', '#172f35', '#1a333a']),
    far: P(['#24444a', '#1f3c42', '#1b353b']),
    hills: P(['#17302f', '#142a2b', '#122527']),
    valley: P(['#183031', '#152b2c', '#132627']),
    fog: P(['#2b484b', '#46625f', '#6a8580', '#9ab0a8']),
    end: pack(t.bg),
    streak: pack(hex('#3a5558')),
    shell: P(['#04080a', '#070d10', '#0b1316', '#10191c', '#162125', '#1e2c30', '#28393d', '#36494c']),
    heli: P(['#050a0c', '#0c1518', '#1f3236', '#2f4649']),
    rotor: pack(hex('#0f1a1d')),
    beacon: pack(hex('#f08a68')),
    spark: P(['#4c5c4a', '#9c7c42', '#e7c56b', '#fff4d0']),
    tent: pack(hex('#1f3236')),
  };
}

export function createShell() {
  let W = 0, H = 0, colors = null;
  let ground, ridgeFar, ridgeNear, ridgeRight, cloudTop, cloudDepth, cloudX0, cloudY0;
  let shell, shellMask, tents, sparks, base;
  let sky, skyAt = NaN;                 // base plus high cloud, redrawn twice a second
  let mistRows, bankRows, streakRows;
  const fogA = fogTexture(), fogB = puffTexture();

  function layout() {
    const next = rng(2016);
    ground = Math.round(H * 0.64);                  // valley floor
    ridgeFar = new Float32Array(W); ridgeNear = new Float32Array(W); ridgeRight = new Float32Array(W);
    cloudTop = new Float32Array(W); cloudDepth = new Float32Array(W);
    const ridged = v => 1 - Math.abs(v);
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      // Distant range: sharp peaks, highest on the left, fading toward the ridge.
      const p = ridged(noise3(x * 0.022, 1.3, 0.2)) * 0.75 + ridged(noise3(x * 0.07, 4.1, 0.6)) * 0.25;
      ridgeFar[x] = ground - H * 0.04 - H * (0.06 + 0.17 * p * p) * (0.5 + 0.5 * smooth(0.75, 0.1, u));
      // Rolling foothills.
      const q = noise3(x * 0.018, 9.7, 0.3) * 0.7 + noise3(x * 0.06, 2.2, 0.8) * 0.3;
      ridgeNear[x] = ground - H * (0.035 + 0.035 * q);
      // The cloud bank's slope, and the ridge it rests on.
      cloudTop[x] = slopeAt(u) * H;
      cloudDepth[x] = H * (0.05 + 0.48 * smooth(0.42, 0.95, u));
      ridgeRight[x] = u > 0.44 ? Math.min(ground, cloudTop[x] + H * (0.07 + 0.03 * noise3(x * 0.08, 5.5, 0.1))) : ground;
    }
    cloudX0 = Math.floor(SLOPE[0][0] * W);
    let topMin = H;
    for (let x = cloudX0; x < W; x++) topMin = Math.min(topMin, cloudTop[x]);
    cloudY0 = Math.max(0, Math.floor(topMin - H * 0.08));

    // Shell: the poster's outline, scaled to the scene.
    const sh = Math.round(H * 0.54), sw = sh / ASPECT;
    const sx = W * (W > 360 ? 0.255 : 0.29);
    const bottom = ground - Math.max(2, Math.round(H * 0.045));
    shell = { x: sx, top: bottom - sh, h: sh, w: sw, bottom };
    shellMask = new Float32Array(W * H);
    for (let y = Math.max(0, shell.top); y < Math.min(H, shell.bottom); y++) {
      const v = (y + 0.5 - shell.top) / sh;
      const [l, r] = profileAt(v);
      const xl = sx + l * sw, xr = sx + r * sw;
      for (let x = Math.max(0, Math.floor(xl)); x <= Math.min(W - 1, Math.ceil(xr)); x++) {
        const px = x + 0.5;
        if (px < xl || px > xr) continue;
        const a = (px - xl) / Math.max(1, xr - xl);            // 0 left rim … 1 right rim
        // Dark core; the left rim catches the sky, a thin right rim, a paler base
        // over the fog, a faint stony mottle.
        let lvl = 1.1 + 3.6 * smooth(0.17, 0, a) + 1.6 * smooth(0.9, 1, a)
          + 1.7 * smooth(0.74, 1, v) + 1 * smooth(0.07, 0, v)
          + 0.9 * (sampleTile(fogA, x * 2.3, y * 0.9) - 0.5);
        shellMask[y * W + x] = 1 + lvl;
      }
    }
    // Tents by day; sparkling lights on the valley floor right of the shell.
    tents = [];
    for (let k = 0; k < Math.max(3, Math.round(W / 90)); k++) {
      tents.push([Math.round(W * (0.3 + next() * 0.12)), ground + 3 + Math.round(next() * H * 0.06)]);
    }
    sparks = [];
    for (let k = 0; k < Math.max(7, Math.round(W / 46)); k++) {
      sparks.push({
        x: Math.round(W * (0.305 + next() * 0.16)), y: Math.round(H * (0.668 + next() * 0.075)),
        ph: next() * Math.PI * 2, sp: 0.55 + next() * 0.9, big: next() < 0.35,
      });
    }
    mistRows = new Float32Array(H); bankRows = new Float32Array(H); streakRows = new Float32Array(H);
    for (let y = 0; y < H; y++) {
      mistRows[y] = smooth(ground - H * 0.07, ground - H * 0.01, y) * (1 - smooth(ground + H * 0.02, ground + H * 0.1, y));
      bankRows[y] = smooth(0.74, 0.93, y / H);
      streakRows[y] = smooth(0.06, 0.18, y / H) * (1 - smooth(0.24, 0.36, y / H));
    }
    sky = new Uint32Array(W * H);
    composeBase();
  }

  function composeBase() {
    const c = colors;
    base = new Uint32Array(W * H);
    for (let y = 0; y < H; y++) {
      const sl = smooth(0, ground - H * 0.1, y) * (c.sky.length - 1);
      for (let x = 0; x < W; x++) {
        const b = bayer(x, y);
        let px = c.sky[Math.min(c.sky.length - 1, Math.floor(sl + b * 0.999))];
        if (y >= ridgeFar[x]) px = c.far[Math.min(2, Math.floor((y - ridgeFar[x]) / (H * 0.06) + b * 0.9))];
        if (y >= ridgeNear[x]) px = c.hills[Math.min(2, Math.floor((y - ridgeNear[x]) / (H * 0.03) + b * 0.9))];
        if (y >= ridgeRight[x]) px = c.hills[Math.min(2, 1 + Math.floor((y - ridgeRight[x]) / (H * 0.12) + b * 0.9))];
        if (y >= ground) {
          // Fields: patches of darker grass across the floor.
          const f = noise3(x * 0.05, y * 0.35, 3.3) * 0.9 + noise3(x * 0.16, y * 0.8, 8.1) * 0.35;
          px = c.valley[Math.max(0, Math.min(2, Math.floor((y - ground) / (H * 0.08) + f * 1.1 + b * 0.9)))];
        }
        base[y * W + x] = px;
      }
    }
    if (!c.dark) for (const [x, y] of tents) if (x > 0 && x < W - 1 && y > 0 && y < H) { base[y * W + x] = c.tent; base[y * W + x + 1] = c.tent; }
    skyAt = NaN;
  }

  // Base layers plus thin high cloud drifting across the sky.
  function drawSky(drift) {
    sky.set(base);
    const streak = colors.streak;
    for (let y = Math.floor(H * 0.06); y < Math.floor(H * 0.36); y++) {
      const env = streakRows[y];
      if (env <= 0) continue;
      for (let x = 0; x < W; x++) {
        if (y >= ridgeFar[x] - 2) continue;
        const s = sampleTile(fogB, x * 0.3 + drift * 0.5, y * 1.5) * env - 0.4;
        if (s > 0 && bayer(x, y) < s * 3) sky[y * W + x] = streak;
      }
    }
  }

  // A Chinook seen from behind and to the left, flying away toward the shell,
  // as in the poster: a fuselage tapering into the distance with its dark rear
  // ramp toward us, a tall rear pylon with an engine pod, a smaller front pylon,
  // and two three-bladed rotors seen almost edge-on, so each blade's length
  // pulses as it turns. Drawn from polygons in sprite units at any scale.
  function drawHeli(out, cx, cy, s, t, still, fade) {
    const c = colors, [dark, body, light, edge] = c.heli;
    const put = (X, Y, color) => {
      if (X < 0 || Y < 0 || X >= W || Y >= H) return;
      if (fade < 1 && bayer(X, Y) > fade) return;
      out[Y * W + X] = color;
    };
    const poly = (pts, color) => {
      const P = pts.map(([x, y]) => [cx + x * s, cy + y * s]);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      for (let Y = Math.floor(y0); Y <= Math.ceil(y1); Y++) {
        for (let X = Math.floor(x0); X <= Math.ceil(x1); X++) {
          const px = X + 0.5, py = Y + 0.5;
          let inside = true;
          for (let i = 0; i < P.length && inside; i++) {
            const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
            if ((bx - ax) * (py - ay) - (by - ay) * (px - ax) < 0) inside = false;
          }
          if (inside) put(X, Y, color);
        }
      }
    };
    const dot = (x, y, color) => put(Math.round(cx + x * s), Math.round(cy + y * s), color);
    // Fuselage (clockwise quads in screen space), roof light, belly shade.
    poly([[-8, -2], [7, -1.3], [7, 1.5], [-8, 2.2]], body);
    poly([[-8, -2], [7, -1.3], [7, -0.8], [-8, -1.4]], light);
    poly([[-8, 1.6], [7, 1.1], [7, 1.5], [-8, 2.2]], dark);
    poly([[-8.4, -2], [-7, -2], [-7, 2.2], [-8.4, 2.2]], dark);          // rear ramp face
    // Pylons, engine pod, hubs.
    poly([[-7.6, -2], [-7.1, -4.3], [-4.9, -4.3], [-4.3, -1.8]], body);
    poly([[-7.1, -4.3], [-4.9, -4.3], [-4.9, -3.8], [-7.1, -3.8]], edge);
    poly([[-6.9, -3.3], [-4.2, -3.3], [-4.2, -2.4], [-6.9, -2.4]], dark);
    poly([[4.5, -1.4], [4.9, -2.8], [6.5, -2.8], [6.9, -1.3]], body);
    if (s >= 1.6) for (let k = -3; k <= 3; k += 1.5) dot(k, -0.2, light);   // cabin windows
    dot(-6, 2.7, dark); dot(-3.6, 2.7, dark); dot(4.2, 2.3, dark);       // wheels
    // Rotors: three blades each, the disc nearly edge-on.
    const spin = still ? 0.4 : t * 7.3;
    const rotor = (hx, hy, R, phase) => {
      for (let k = 0; k < 3; k++) {
        const a = spin + phase + k * 2.094;
        const ex = Math.cos(a) * R, ey = Math.sin(a) * R * 0.1;
        const n = Math.max(2, Math.round(Math.abs(ex) * s));
        for (let j = 1; j <= n; j++) dot(hx + ex * j / n, hy + ey * j / n, c.rotor);
      }
      dot(hx, hy, dark);
    };
    rotor(-6, -4.6, 11, 0);
    rotor(5.7, -3.1, 9, 1);
    // Anti-collision beacon on the rear pylon.
    if (!still && (t % 1.3) < 0.14) dot(-6, -4.9, c.beacon);
  }

  return {
    id: 'shell',
    fps: 8,
    still: 6,
    resize(w, h) { W = w; H = h; if (!colors) colors = palette(); layout(); },
    theme() { colors = palette(); if (W) composeBase(); },
    render(t, out, still) {
      if (!colors) { colors = palette(); composeBase(); }
      const c = colors, fog = c.fog, nf = fog.length;
      const drift = t * 1.2;
      const skyFrame = still ? -1 : Math.floor(t * 2);
      if (skyFrame !== skyAt) { drawSky(still ? 0 : skyFrame / 2 * 1.2); skyAt = skyFrame; }
      out.set(sky);

      // Shell, hanging almost still, with cloud reflections on its gloss.
      const bob = still ? 0 : Math.round(Math.sin(t * Math.PI * 2 / 14) * 0.7);
      const xs0 = Math.max(0, Math.floor(shell.x - shell.w * 0.6)), xs1 = Math.min(W, Math.ceil(shell.x + shell.w * 0.6));
      for (let sy = Math.max(0, shell.top); sy < Math.min(H, shell.bottom); sy++) {
        const y = sy + bob;
        if (y < 0 || y >= H) continue;
        for (let x = xs0; x < xs1; x++) {
          const m = shellMask[sy * W + x];
          if (!m) continue;
          let lvl = m - 1;
          const side = smooth(shell.x, shell.x - shell.w * 0.4, x);
          if (side > 0) lvl += side * Math.max(0, sampleTile(fogA, x * 1.1 + drift * 0.8, sy * 0.45 - drift * 0.15) - 0.6) * 3.5;
          out[y * W + x] = c.shell[Math.max(0, Math.min(c.shell.length - 1, Math.floor(lvl + bayer(x, y) - 0.5)))];
        }
      }
      // Ground mist along the valley floor, thin, drifting right.
      for (let y = Math.max(0, Math.floor(ground - H * 0.07)); y < Math.min(H, Math.ceil(ground + H * 0.1)); y++) {
        const env = mistRows[y];
        if (env <= 0) continue;
        for (let x = 0; x < W; x++) {
          const lvl = (sampleTile(fogA, x * 0.45 - drift * 1.4, y * 1.8 + 7) * env - 0.42) * 6;
          if (lvl <= 0) continue;
          const b = bayer(x, y);
          if (lvl > b) out[y * W + x] = fog[Math.min(nf - 1, Math.floor(lvl - b) + 1)];
        }
      }
      // The cloud bank: billowing along its slope, streaming downhill.
      for (let x = cloudX0; x < W; x++) {
        const top = cloudTop[x], depth = cloudDepth[x];
        const start = smooth(SLOPE[0][0] * W, SLOPE[0][0] * W + W * 0.05, x);
        const y1 = Math.min(H, Math.ceil(Math.min(top + depth * 1.2, ground + H * 0.12)));
        for (let y = Math.max(cloudY0, Math.floor(top - H * 0.08)); y < y1; y++) {
          const dy = y - top;
          const puff = sampleTile(fogB, x * 0.4 - drift * 0.3, y * 0.6 - t * 0.5);
          // Puffs lift and drop the surface; below it the cloud thins as it falls.
          const d = (dy + H * 0.06 * (puff - 0.5)) / depth;
          const env = smooth(-0.04, 0.1, d) * (1 - smooth(0.55, 1.2, d)) * start;
          if (env <= 0) continue;
          const stream = sampleTile(fogA, x * 0.6 + dy * 0.35 + drift * 0.2, dy * 0.42 - t * 1.6);
          const lvl = ((0.5 * stream + 0.5 * puff + 0.14) * env - 0.26) * 6.5;
          if (lvl <= 0) continue;
          const b = bayer(x, y);
          if (lvl > b) out[y * W + x] = fog[Math.max(0, Math.min(nf - 1, Math.floor((lvl - b) * 0.75 + 1.3 - d * 1.2)))];
        }
      }
      // The Chinook, flying away from us toward the shell's base: its depth grows
      // steadily, so it shrinks and slows on screen as a real one would.
      const ft = still ? FLIGHT.still : (t % FLIGHT.cycle) / FLIGHT.duration;
      if (ft < 1) {
        const z = 1 + 5 * ft, [x0, y0] = FLIGHT.from, [vx, vy] = FLIGHT.to;
        const hx = W * (vx + (x0 - vx) / z), hy = H * (vy + (y0 - vy) / z) + Math.sin(t * 1.7) * 0.6;
        drawHeli(out, hx, hy, (H / 150) * FLIGHT.size / z, t, still, 1 - smooth(0.88, 1, ft));
      }
      // Lights by the camp, sparkling on the valley floor like lights on water:
      // each brightens and dims, glows softly when bright, opens into a small
      // four-point star at its peak, and lays a broken, swaying reflection below.
      const [glow, dim, mid, hot] = c.spark;
      const put = (X, Y, color) => { if (X >= 0 && Y >= 0 && X < W && Y < H) out[Y * W + X] = color; };
      for (const sp of sparks) {
        const tw = still ? 0.72 : 0.5 + 0.5 * Math.sin(t * sp.sp + sp.ph);
        const lum = 0.35 + 0.65 * tw;
        if (lum > 0.55) {
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (bayer(sp.x + dx, sp.y + dy) < (lum - 0.55) * 2.4) put(sp.x + dx, sp.y + dy, glow);
        }
        if (tw > 0.86) {
          const arm = sp.big && tw > 0.95 ? 2 : 1;
          for (let k = 1; k <= arm; k++) {
            const col = k === 1 ? mid : dim;
            put(sp.x - k, sp.y, col); put(sp.x + k, sp.y, col); put(sp.x, sp.y - k, col); put(sp.x, sp.y + k, col);
          }
        }
        put(sp.x, sp.y, lum > 0.75 ? hot : lum > 0.5 ? mid : dim);
        const sway = still ? 0 : Math.round(Math.sin(t * 2.1 + sp.ph * 3) * 0.7);
        for (let k = 0; k < 3; k++) {
          const ry = sp.y + 3 + k;
          if (bayer(sp.x, ry) < lum * 0.85 - k * 0.22) put(sp.x + (k % 2 ? -sway : sway), ry, k ? glow : dim);
        }
      }
      // Foreground fog bank, rolling left to right and dissolving into the page:
      // in its lowest rows, gaps in the fog open onto the page, not the valley.
      const open = Math.floor(H * 0.86);
      for (let y = Math.floor(H * 0.74); y < H; y++) {
        const env = bankRows[y], tail = smooth(0.9, 1, y / H);
        const ya = y * 0.9, yb = y * 1.2 + 11;
        for (let x = 0; x < W; x++) {
          const i = y * W + x, b = bayer(x, y);
          if (tail > b) { out[i] = c.end; continue; }
          const d = (0.62 * sampleTile(fogA, x * 0.3 + drift * 2, ya) + 0.38 * sampleTile(fogB, x * 0.55 + drift * 3 + 40, yb)) * env + env * 0.4;
          const lvl = (d - 0.5) * 7;
          if (lvl > b) out[i] = fog[Math.min(nf - 1, Math.floor((lvl - b) * 0.7) + 1)];
          else if (y >= open) out[i] = c.end;
        }
      }
    },
  };
}
