#!/usr/bin/env node
// Renders the pixel-art cameos' still frames into assets/img/egg-*.png. The
// page shows them where scripts do not run (no JavaScript, or opened from a
// file); run this after changing a scene in assets/js/eggs/.
//   python3 -m http.server 8000            (in the site folder, another terminal)
//   node tools/render-stills.mjs --url http://127.0.0.1:8000/
// Needs Playwright, as tools/verify.mjs does (PLAYWRIGHT_MODULE and CHROME work the same way).
// Frames are pixel art with fewer than 256 colours, so they are written as exact
// indexed PNGs.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const url = args.url || 'http://127.0.0.1:8000/';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

// Size in art pixels; Gargantua's space looks the same by day and by night.
const STILLS = [
  { scene: 'logogram', w: 160, h: 160, night: true },
  { scene: 'gargantua', w: 320, h: 180, night: false },
  { scene: 'epigraph', w: 120, h: 120, night: true },
  { scene: 'shell', w: 640, h: 140, night: true },
  { scene: 'story-graph', w: 520, h: 260, night: true },
];

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}
// RGBA bytes → indexed PNG (palette, per-entry alpha, unfiltered rows).
function indexedPng(w, h, rgba) {
  const index = new Map(), pixels = Buffer.alloc(h * (w + 1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const key = ((rgba[i] << 24) | (rgba[i + 1] << 16) | (rgba[i + 2] << 8) | rgba[i + 3]) >>> 0;
      if (!index.has(key)) index.set(key, index.size);
      pixels[y * (w + 1) + 1 + x] = index.get(key);
    }
  }
  if (index.size > 256) throw new Error(`${index.size} colours do not fit a palette`);
  const plte = Buffer.alloc(index.size * 3), trns = Buffer.alloc(index.size);
  for (const [key, k] of index) {
    plte[k * 3] = key >>> 24; plte[k * 3 + 1] = (key >>> 16) & 255; plte[k * 3 + 2] = (key >>> 8) & 255;
    trns[k] = key & 255;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 3;                                   // 8-bit indices, palette colour
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('tRNS', trns),
    chunk('IDAT', deflateSync(pixels, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ colorScheme: theme });
  await page.goto(url, { waitUntil: 'networkidle' });
  // The page's theme, not the system's, sets the palette.
  await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
  for (const { scene, w, h, night } of STILLS) {
    if (theme === 'dark' && !night) continue;
    const rgba = await page.evaluate(async ({ scene, w, h }) => {
      const { FACTORIES } = await import(new URL('assets/js/eggs/index.js', document.baseURI).href);
      const s = FACTORIES[scene]();
      if (s.load) await s.load();
      s.resize(w, h);
      s.theme();
      const image = new ImageData(w, h);
      s.render(s.still, new Uint32Array(image.data.buffer), true);
      return Array.from(image.data);
    }, { scene, w, h });
    const name = `egg-${scene}${theme === 'dark' ? '-night' : ''}.png`;
    writeFileSync(join(root, 'assets', 'img', name), indexedPng(w, h, rgba));
    console.log(`wrote assets/img/${name}`);
  }
  await page.close();
}
await browser.close();
