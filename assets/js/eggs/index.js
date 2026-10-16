// Pixel-art cameos from two films about time: from Arrival, the heptapod
// logograms for "Time" (title) and "There is no linear time" (epigraph) and the
// Montana shell; from Interstellar, Gargantua and the Endurance. Each [data-egg]
// element gets a canvas drawn at art resolution (--egg-px CSS pixels per art
// pixel, rounded to whole device pixels) and scaled up without smoothing.
//
// One requestAnimationFrame loop advances every visible scene and redraws it
// at the scene's own pixel frame rate. A scene's clock stops while it is
// off-screen or the tab is hidden. Scenes marked data-egg-scroll are written by
// the page's scroll instead. Reduced motion shows one still frame until the
// page's Play opt-in (motion.js) enables movement.

import { motionPreference } from '../motion.js';
import { createLogogram, NO_LINEAR_TIME } from './logogram.js';
import { createGargantua } from './gargantua.js';
import { createShell } from './shell.js';

export const FACTORIES = {
  logogram: () => createLogogram(),
  epigraph: () => createLogogram(NO_LINEAR_TIME),
  gargantua: () => createGargantua(),
  shell: () => createShell(),
};

// How far a scroll-written scene is written: nothing while its top is below the
// viewport, complete once it and a little more of the page have scrolled in.
function scrollProgress(node) {
  const r = node.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  return Math.max(0, Math.min(1, (vh - r.top) / (r.height + Math.min(vh * 0.25, 220))));
}

// A fresh task (not a timer, so it is not throttled), letting the page paint
// and respond between scene set-ups.
const nextTask = () => new Promise(resolve => {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => resolve();
  channel.port2.postMessage(0);
});

export function initEggs(root = document) {
  const items = [];
  let raf = 0;

  function draw(item) {
    const still = motionPreference.reduced;
    const t = still ? item.scene.still : item.t;
    if (item.scrolled) item.scene.scroll = item.progress = scrollProgress(item.node);
    item.scene.render(t, item.data, still);
    item.ctx.putImageData(item.image, 0, 0);
    item.node.dataset.time = t.toFixed(2);
    if (item.scrolled) item.node.dataset.progress = item.progress.toFixed(2);
    if (!item.live) { item.live = true; item.node.classList.add('is-live'); }
  }

  function fit(item) {
    const rect = item.node.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return false;
    const cssPx = parseFloat(getComputedStyle(item.node).getPropertyValue('--egg-px')) || 2;
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.round(cssPx * dpr));          // device pixels per art pixel
    const w = Math.max(8, Math.floor(rect.width * dpr / k));
    const h = Math.max(8, Math.floor(rect.height * dpr / k));
    if (w === item.w && h === item.h && k === item.k) return false;
    Object.assign(item, { w, h, k });
    item.canvas.width = w;
    item.canvas.height = h;
    item.canvas.style.width = `${(w * k) / dpr}px`;
    item.image = item.ctx.createImageData(w, h);
    item.data = new Uint32Array(item.image.data.buffer);
    item.scene.resize(w, h);
    item.frame = -1;
    return true;
  }

  function loop(now) {
    raf = 0;
    let any = false;
    for (const item of items) {
      if (!item.running) continue;
      any = true;
      if (item.last !== null) item.t += Math.min(0.1, (now - item.last) / 1000);
      item.last = now;
      const frame = Math.floor(item.t * item.scene.fps);
      const moved = item.scrolled && Math.abs(scrollProgress(item.node) - item.progress) > 0.002;
      if (frame !== item.frame || moved) { item.frame = frame; draw(item); }
    }
    if (any) raf = requestAnimationFrame(loop);
  }

  function sync() {
    const reduced = motionPreference.reduced;
    let any = false;
    for (const item of items) {
      if (!item.ready || !item.w) { item.node.dataset.playback = 'loading'; continue; }
      const run = !reduced && item.visible && !document.hidden;
      if (run !== item.running) { item.running = run; item.last = null; }
      const mode = reduced ? 'static' : run ? 'playing' : 'suspended';
      if (mode !== item.mode) {
        item.mode = mode;
        item.node.dataset.playback = mode;
        if (mode !== 'playing') draw(item);      // still frame, or the frame where time stopped
      }
      any = any || run;
    }
    if (any && !raf) raf = requestAnimationFrame(loop);
    else if (!any && raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  const io = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const item = items.find(it => it.node === entry.target);
      if (item) item.visible = entry.isIntersecting;
    }
    sync();
  });

  let resizeTimer = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    // Re-tracing Gargantua takes a few tens of milliseconds: wait for the layout to settle.
    resizeTimer = setTimeout(() => {
      for (const item of items) if (item.ready && fit(item)) { draw(item); item.mode = null; }
      sync();
    }, items.some(it => it.w) ? 160 : 0);
  });

  let setup = Promise.resolve();
  for (const node of root.querySelectorAll('[data-egg]')) {
    const make = FACTORIES[node.dataset.egg];
    if (!make) continue;
    const canvas = document.createElement('canvas');
    canvas.className = 'egg-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    node.appendChild(canvas);
    const item = {
      node, canvas, ctx: canvas.getContext('2d'), scene: make(),
      scrolled: node.hasAttribute('data-egg-scroll'), progress: 0,
      t: 0, last: null, frame: -1, visible: false, running: false, mode: null,
      ready: false, live: false, w: 0, h: 0, k: 0, image: null, data: null,
    };
    items.push(item);
    node.dataset.playback = 'loading';
    setup = setup.then(() => item.scene.load?.()).then(nextTask).then(() => {
      item.ready = true;
      item.scene.theme();
      if (fit(item)) draw(item);
      sync();
    }).catch(error => {
      console.error(error);
      canvas.remove();
      node.dataset.playback = 'failed';
    });
    io.observe(node);
    ro.observe(node);
  }

  // Theme: every scene reads its colors from the page's custom properties.
  const retheme = () => {
    for (const item of items) {
      if (!item.ready) continue;
      item.scene.theme();
      if (item.w) draw(item);
    }
  };
  new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
  document.addEventListener('visibilitychange', sync);
  motionPreference.subscribe(sync);
  return items;
}
