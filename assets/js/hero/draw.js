// Drawing helpers shared by the hero scenes.

import { spritePath } from './sprites.js';

export const NS = 'http://www.w3.org/2000/svg';

export function el(parent, tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    // Inline style, so a per-layout size beats the class's CSS size.
    if (k === 'font-size') node.style.fontSize = `${v}px`;
    else node.setAttribute(k, v);
  }
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

export function set(node, attrs) {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
}

// ---- time ----
export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const prog = (t, start, dur) => clamp01((t - start) / dur);
export const ease = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
export const lerp = (a, b, p) => a + (b - a) * p;
// Positions snap to a 2-unit grid so motion steps like a sprite.
export const snap = v => Math.round(v / 2) * 2;
// Appearance in a few discrete steps: 0, 1/n, …, 1.
export const stepped = (p, n = 3) => (p >= 1 ? 1 : Math.floor(p * n) / n);
export const pop = (t, start, dur = 0.24) => stepped(prog(t, start, dur), 3);

// ---- geometry ----
export function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}
export const curveD = (p0, p1, p2, p3) => `M${p0[0]} ${p0[1]}C${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]} ${p3[0]} ${p3[1]}`;

// ---- marks ----
// A pictogram centered at (cx, cy), `size` units wide.
export function sprite(parent, event, cx, cy, size, cls = '') {
  const s = size / 16;
  return el(parent, 'path', {
    class: `h-sprite ${cls}`.trim(),
    d: spritePath(event),
    transform: `translate(${snap(cx - size / 2)} ${snap(cy - size / 2)}) scale(${s})`,
  });
}

// "e" with a subscript index, e.g. e₁₈. Returns the <text>.
export function subLabel(parent, base, index, x, y, attrs = {}, size = 12) {
  const t = el(parent, 'text', { x, y, ...attrs });
  el(t, 'tspan', {}, base);
  el(t, 'tspan', { 'font-size': Math.round(size * 0.74), dy: Math.round(size * 0.28) }, String(index));
  return t;
}

// Text with q₁ / e₁₈ style tokens: "q1: why …" → q + sub(1) + rest.
export function richText(parent, parts, x, y, attrs = {}, size = 13) {
  const t = el(parent, 'text', { x, y, ...attrs });
  for (const part of parts) {
    if (typeof part === 'string') { el(t, 'tspan', {}, part); continue; }
    el(t, 'tspan', {}, part.base);
    el(t, 'tspan', { 'font-size': Math.round(size * 0.74), dy: Math.round(size * 0.28) }, part.sub);
    el(t, 'tspan', { dy: -Math.round(size * 0.28) }, ' ');
  }
  return t;
}

// Pixel window: frame, inner light line, title strip.
export function windowFrame(parent, x, y, w, h, strip = 20) {
  const g = el(parent, 'g');
  el(g, 'rect', { class: 'h-window', x, y, width: w, height: h });
  el(g, 'rect', { class: 'h-window-inner', x: x + 3, y: y + 3, width: w - 6, height: h - 6 });
  if (strip) {
    el(g, 'rect', { class: 'h-strip', x: x + 2, y: y + 2, width: w - 4, height: strip });
    el(g, 'line', { class: 'h-strip-rule', x1: x + 2, x2: x + w - 2, y1: y + strip + 2, y2: y + strip + 2 });
  }
  return g;
}

// Pixel arrowhead pointing in direction dir ('left' | 'right' | 'up' | 'down') with tip at (x, y).
export function arrowHead(parent, x, y, dir, size = 8, cls = 'h-arrow-head') {
  const s = size;
  const pts = {
    left: `${x},${y} ${x + s},${y - s / 1.6} ${x + s},${y + s / 1.6}`,
    right: `${x},${y} ${x - s},${y - s / 1.6} ${x - s},${y + s / 1.6}`,
    up: `${x},${y} ${x - s / 1.6},${y + s} ${x + s / 1.6},${y + s}`,
    down: `${x},${y} ${x - s / 1.6},${y - s} ${x + s / 1.6},${y - s}`,
  }[dir];
  return el(parent, 'polygon', { class: cls, points: pts });
}

export function roleOf(event, roles) {
  for (const [role, list] of Object.entries(roles)) if (list.includes(event)) return role;
  return 'other';
}

export const pad2 = n => String(n).padStart(2, '0');
