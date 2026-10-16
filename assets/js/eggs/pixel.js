// Shared helpers for the pixel-art cameos: packed colors, ordered dithering,
// gradient noise and theme colors. Every scene draws into a Uint32 view of an
// ImageData at art resolution; CSS scales the canvas up without smoothing.

const LITTLE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

// '#a64a35' → [166, 74, 53]
export function hex(value) {
  let h = String(value).trim().replace('#', '');
  if (h.length === 3) h = h.replace(/./g, c => c + c);
  const n = parseInt(h, 16);
  return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const pack = ([r, g, b], a = 255) => (LITTLE
  ? ((a << 24) | (b << 16) | (g << 8) | r) >>> 0
  : ((r << 24) | (g << 16) | (b << 8) | a) >>> 0);
export const mix = (a, b, t) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t));
export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (e0, e1, v) => { const t = clamp01((v - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// 4×4 Bayer thresholds in (0, 1): the ordered dither of every gradient.
const BAYER = Float32Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], v => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];

// Seeded random stream.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Improved Perlin gradient noise, roughly in [−1, 1].
const PERM = new Uint8Array(512);
{
  const next = rng(20161111);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
function grad3(h, x, y, z) {
  const u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const X = xi & 255, Y = yi & 255, Z = zi & 255;
  x -= xi; y -= yi; z -= zi;
  const u = fade(x), v = fade(y), w = fade(z);
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
  return lerp(
    lerp(lerp(grad3(PERM[AA] & 15, x, y, z), grad3(PERM[BA] & 15, x - 1, y, z), u),
      lerp(grad3(PERM[AB] & 15, x, y - 1, z), grad3(PERM[BB] & 15, x - 1, y - 1, z), u), v),
    lerp(lerp(grad3(PERM[AA + 1] & 15, x, y, z - 1), grad3(PERM[BA + 1] & 15, x - 1, y, z - 1), u),
      lerp(grad3(PERM[AB + 1] & 15, x, y - 1, z - 1), grad3(PERM[BB + 1] & 15, x - 1, y - 1, z - 1), u), v),
    w);
}
function fbm3(x, y, z, octaves = 4) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(x, y, z);
    norm += amp;
    x *= 2.03; y *= 2.03; z *= 1.7; amp *= 0.5;
  }
  return sum / norm;
}

// Tileable fBm texture, 2^sw × 2^sh texels, periodic in both axes, values in [0, 1].
export function tileTexture(sw, sh, cells, octaves = 4, seed = 0) {
  const w = 1 << sw, h = 1 << sh;
  const data = new Float32Array(w * h);
  let lo = Infinity, hi = -Infinity;
  const pw = cells, ph = cells * h / w;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Blend four period-shifted samples so opposite edges meet.
      const fx = x / w, fy = y / h, sx = fx * pw, sy = fy * ph;
      const a = fbm3(sx, sy, seed, octaves), b = fbm3(sx - pw, sy, seed, octaves);
      const c = fbm3(sx, sy - ph, seed, octaves), d = fbm3(sx - pw, sy - ph, seed, octaves);
      const v = lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
      data[y * w + x] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  for (let i = 0; i < data.length; i++) data[i] = (data[i] - lo) / (hi - lo || 1);
  return { data, sw, mw: w - 1, mh: h - 1 };
}

// The fog texture shared by the logogram's mist and the valley.
let FOG = null;
export const fogTexture = () => FOG || (FOG = tileTexture(7, 6, 4, 5, 1.7));

// Bilinear sample of a tile texture; wraps with bit masks (no division).
export function sampleTile(tex, x, y) {
  const xf = Math.floor(x), yf = Math.floor(y), fx = x - xf, fy = y - yf;
  const { data, sw, mw, mh } = tex;
  const x0 = xf & mw, x1 = (xf + 1) & mw, r0 = (yf & mh) << sw, r1 = ((yf + 1) & mh) << sw;
  const a = data[r0 + x0], b = data[r0 + x1], c = data[r1 + x0], d = data[r1 + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// The RGBA pixels of a same-origin image.
export async function loadPixels(url) {
  const img = new Image();
  img.decoding = 'async';
  img.src = url.href || url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

// Area-average a sw × sh field into dw × dh (exact box filter, any ratio).
export function resampleBox(src, sw, sh, dw, dh) {
  const ii = new Float64Array((sw + 1) * (sh + 1));
  for (let y = 0; y < sh; y++) {
    let row = 0;
    for (let x = 0; x < sw; x++) {
      row += src[y * sw + x];
      ii[(y + 1) * (sw + 1) + x + 1] = ii[y * (sw + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(dw * dh);
  const ex = Array.from({ length: dw + 1 }, (_, i) => Math.round(i * sw / dw));
  const ey = Array.from({ length: dh + 1 }, (_, i) => Math.round(i * sh / dh));
  for (let y = 0; y < dh; y++) {
    const y0 = Math.min(ey[y], sh - 1), y1 = Math.max(ey[y + 1], y0 + 1);
    for (let x = 0; x < dw; x++) {
      const x0 = Math.min(ex[x], sw - 1), x1 = Math.max(ex[x + 1], x0 + 1);
      const sum = ii[y1 * (sw + 1) + x1] - ii[y0 * (sw + 1) + x1] - ii[y1 * (sw + 1) + x0] + ii[y0 * (sw + 1) + x0];
      out[y * dw + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

// Bilinear sample of a w × h Float32 field, clamped at the edges.
export function sample(field, w, h, x, y) {
  if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
  if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
  const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, i = yi * w + xi;
  const a = field[i], b = field[i + 1], c = field[i + w], d = field[i + w + 1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// Exact Euclidean distance transform (Felzenszwalb–Huttenlocher) of a mask:
// returns, for every cell, the distance to the nearest cell where mask is set.
export function distance(mask, w, h) {
  const INF = 1e20, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? 0 : INF;
  const n = Math.max(w, h), f = new Float64Array(n), z = new Float64Array(n + 1), v = new Int32Array(n), g = new Float64Array(n);
  const pass = (len, get, set) => {
    for (let q = 0; q < len; q++) f[q] = get(q);
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s;
      do { const p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); } while (s <= z[k] && --k >= 0);
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const p = v[k]; g[q] = (q - p) * (q - p) + f[p]; }
    for (let q = 0; q < len; q++) set(q, g[q]);
  };
  for (let x = 0; x < w; x++) pass(h, y => d[y * w + x], (y, val) => { d[y * w + x] = val; });
  for (let y = 0; y < h; y++) pass(w, x => d[y * w + x], (x, val) => { d[y * w + x] = val; });
  for (let i = 0; i < w * h; i++) d[i] = Math.sqrt(d[i]);
  return d;
}

// Separable box blur of a Float32 field (radius r, `passes` times ≈ Gaussian).
export function blur(src, w, h, r, passes = 2) {
  let a = Float32Array.from(src), b = new Float32Array(w * h);
  const k = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[row + x] = acc * k;
        acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc * k;
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

// Theme colors from the page's CSS custom properties.
export function themeColors(names) {
  const style = getComputedStyle(document.documentElement);
  const out = {};
  for (const [key, prop, fallback] of names) out[key] = hex(style.getPropertyValue(prop) || fallback);
  return out;
}
export function isDarkTheme() {
  const root = document.documentElement;
  return root.dataset.theme === 'dark'
    || (!root.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
