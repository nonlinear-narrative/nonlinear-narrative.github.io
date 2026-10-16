// Page behavior: theme (with a dithered day/night dissolve), the header's
// motion toggle and reading progress, section highlighting, pixel-art cameos,
// shape browser, sortable leaderboard, charts, BibTeX copy. Content is in
// index.html; this module only enhances it, so the page reads the same without
// JavaScript.

import { initTooltip } from './tooltip.js';
import { initHero } from './hero/timeline.js';
import { motionPreference } from './motion.js';
import { initEggs } from './eggs/index.js';
import * as charts from './charts.js';

const root = document.documentElement;
const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
initTooltip(document.querySelector('[data-tooltip]'));

// ---- theme ----------------------------------------------------------------
const themeBtn = document.querySelector('[data-theme-toggle]');
const isDark = () => root.dataset.theme === 'dark' || (!root.dataset.theme && darkScheme.matches);
function themeLabel() {
  const dark = isDark();
  themeBtn.querySelector('use').setAttribute('href', dark ? '#i-sun' : '#i-moon');
  themeBtn.querySelector('span').textContent = dark ? 'Day' : 'Night';
  themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  document.querySelector('meta[name="theme-color"]').content = dark ? '#13252b' : '#f2e9d8';
}
themeBtn.hidden = false;
themeLabel();
themeBtn.addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  const swap = () => {
    root.dataset.theme = next;
    try { localStorage.setItem('nonlinear-theme', next); } catch (_) { /* storage unavailable */ }
    themeLabel();
    charts.redrawAll();
  };
  // The new palette dissolves in through a pixel dither (tokens.css); the
  // cameos repaint inside the update, so they dissolve with everything else.
  if (document.startViewTransition && !motionPreference.reduced) document.startViewTransition(swap);
  else swap();
});
darkScheme.addEventListener('change', () => { if (!root.dataset.theme) { themeLabel(); charts.redrawAll(); } });

// ---- motion: one header switch holds every animation, or plays them again ----
const motionBtn = document.querySelector('[data-motion-toggle]');
function motionLabel() {
  const held = motionPreference.reduced;
  motionBtn.setAttribute('aria-pressed', held ? 'true' : 'false');
  motionBtn.querySelector('use').setAttribute('href', held ? '#i-play' : '#i-pause');
  motionBtn.title = held ? 'Play all motion' : 'Hold all motion';
}
motionBtn.hidden = false;
motionLabel();
motionBtn.addEventListener('click', () => {
  if (motionPreference.reduced) motionPreference.enable();
  else motionPreference.hold();
});
motionPreference.subscribe(motionLabel);

// ---- header height and current section -------------------------------------
const header = document.querySelector('.site-header');
new ResizeObserver(() => root.style.setProperty('--header-h', `${header.offsetHeight}px`)).observe(header);

const navLinks = new Map([...document.querySelectorAll('.site-header nav a')].map(a => [a.getAttribute('href').slice(1), a]));
const sectionMap = [
  ['top', 'overview'], ['overview', 'overview'], ['shapes', 'shapes'], ['corpus', 'shapes'],
  ['benchmark', 'benchmark'], ['findings', 'findings'], ['readers', 'readers'], ['limitations', 'readers'], ['cite', 'cite'],
].map(([id, nav]) => [document.getElementById(id), nav]).filter(([node]) => node);
const progress = document.querySelector('[data-read-progress]');
let ticking = false;
function updateCurrent() {
  ticking = false;
  // Reading progress, stepped to whole two-pixel increments of the bar.
  const room = document.documentElement.scrollHeight - window.innerHeight;
  const steps = Math.max(1, Math.floor(header.offsetWidth / 2));
  const done = room > 0 ? Math.round((window.scrollY / room) * steps) / steps : 1;
  progress.style.transform = `scaleX(${Math.min(1, Math.max(0, done))})`;
  const line = header.offsetHeight + 80;
  let current = null;
  for (const [node, nav] of sectionMap) if (node.getBoundingClientRect().top <= line) current = nav;
  if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) current = 'cite';
  navLinks.forEach((a, id) => {
    if (id === current) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
  });
  const active = navLinks.get(current);
  const nav = active?.parentElement;
  if (active && nav && nav.scrollWidth > nav.clientWidth) {
    const left = active.offsetLeft - nav.offsetLeft;
    if (left < nav.scrollLeft || left + active.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = left - 8;
  }
}
window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(updateCurrent); } }, { passive: true });
updateCurrent();

// ---- Pixel-art cameos (title band and closing shot) ----------------------------
initEggs();

// ---- BibTeX copy -------------------------------------------------------------
document.querySelectorAll('[data-copy]').forEach(btn => {
  btn.hidden = false;
  const status = document.querySelector('[data-copy-status]');
  btn.addEventListener('click', async () => {
    const text = document.getElementById(btn.dataset.copy).textContent;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById(btn.dataset.copy));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      try { ok = document.execCommand('copy'); } catch (__) { ok = false; }
    }
    status.textContent = ok ? 'BibTeX copied.' : 'Select the text above and copy it.';
    btn.classList.toggle('is-copied', ok);
    btn.querySelector('span').textContent = ok ? 'Copied' : 'Copy';
    setTimeout(() => { btn.classList.remove('is-copied'); btn.querySelector('span').textContent = 'Copy'; }, 2000);
  });
});

// ---- Data-driven parts -------------------------------------------------------
if (location.protocol === 'file:') {
  document.querySelector('[data-file-warning]').hidden = false;
} else {
  Promise.all([
    fetch('assets/data/paper.json').then(r => r.json()),
    fetch('assets/data/hero.json').then(r => r.json()),
  ]).then(([paper, hero]) => {
    initHero(document.querySelector('[data-hero]'), hero);
    initShapes(paper);
    initLeaderboard(paper);
    initCharts(paper);
  }).catch(err => {
    console.error(err);
    const warn = document.querySelector('[data-file-warning]');
    warn.textContent = 'The figure data could not be loaded, so the animation and charts are off. The text and tables below are complete.';
    warn.hidden = false;
  });
}

// ---- Shape browser -----------------------------------------------------------
function initShapes(paper) {
  const box = document.querySelector('[data-shapes]');
  const tabs = [...box.querySelectorAll('[role=tab]')];
  const panels = [...box.querySelectorAll('[role=tabpanel]')];
  const status = box.querySelector('[data-shape-status]');
  const play = box.querySelector('[data-shape-play]');
  const controllers = new Map();
  box.classList.add('js-shapes');
  box.querySelector('[data-shape-nav]').hidden = false;
  let index = 0, paused = false;

  function updatePlay() {
    play.hidden = motionPreference.reduced;
    play.textContent = paused ? 'Play' : 'Pause';
    play.setAttribute('aria-label', paused ? 'Play story curve animation' : 'Pause story curve animation');
  }

  function select(i, focus = false) {
    controllers.get(index)?.setActive(false);
    index = (i + tabs.length) % tabs.length;
    tabs.forEach((t, j) => {
      t.setAttribute('aria-selected', j === index ? 'true' : 'false');
      t.tabIndex = j === index ? 0 : -1;
    });
    panels.forEach((p, j) => { if (j === index) p.removeAttribute('data-inactive'); else p.setAttribute('data-inactive', ''); });
    status.textContent = `${index + 1} / ${tabs.length}`;
    if (focus) tabs[index].focus();
    if (!controllers.has(index)) {
      const curve = panels[index].querySelector('[data-curve]');
      controllers.set(index, charts.storyCurve(curve, paper.shapes.items[+curve.dataset.curve], {
        active: false, paused, reducedMotion: motionPreference.reduced,
      }));
    }
    controllers.get(index).setActive(true, { restart: true });
  }
  tabs.forEach((t, i) => t.addEventListener('click', () => select(i)));
  box.querySelector('[role=tablist]').addEventListener('keydown', e => {
    const moves = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (e.key in moves) { e.preventDefault(); select(index + moves[e.key], true); }
    else if (e.key === 'Home') { e.preventDefault(); select(0, true); }
    else if (e.key === 'End') { e.preventDefault(); select(tabs.length - 1, true); }
  });
  box.querySelector('[data-shape-prev]').addEventListener('click', () => select(index - 1));
  box.querySelector('[data-shape-next]').addEventListener('click', () => select(index + 1));
  play.addEventListener('click', () => {
    paused = !paused;
    controllers.forEach(controller => controller.setPaused(paused));
    updatePlay();
  });
  motionPreference.subscribe(() => {
    controllers.forEach(controller => controller.setReducedMotion(motionPreference.reduced));
    updatePlay();
  });
  updatePlay();
  select(0);
}

// ---- Leaderboard: sortable columns and band-hit bars with ±0.11 intervals -----
function initLeaderboard(paper) {
  const table = document.querySelector('[data-leaderboard]');
  const body = table.querySelector('[data-lb-body]');
  const half = paper.leaderboard.bandHitCIHalf;
  const NS = 'http://www.w3.org/2000/svg';

  body.querySelectorAll('tr').forEach(tr => {
    const td = tr.querySelector('td[data-k$=".t1Band"]');
    const v = +td.dataset.v;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 84 14');
    svg.setAttribute('aria-hidden', 'true');
    const rect = (x, w, cls, y = 4, hgt = 6) => {
      const r = document.createElementNS(NS, 'rect');
      Object.entries({ x, y, width: Math.max(0, w), height: hgt, class: cls }).forEach(([k, val]) => r.setAttribute(k, val));
      svg.appendChild(r);
    };
    rect(0, 84, 'c-band-track');
    rect(Math.max(0, v - half) * 84, (Math.min(1, v + half) - Math.max(0, v - half)) * 84, 'c-band-ci', 1, 12);
    rect(0, v * 84, 'c-bar');
    const wrap = document.createElement('span');
    wrap.className = 'band-cell';
    wrap.append(svg, ...td.childNodes);
    td.appendChild(wrap);
  });

  // When the grid is wider than its box it scrolls inside it, and the model
  // column sticks to the left edge; otherwise its header sticks under the page header.
  const box = table.closest('.table-scroll');
  const fit = () => box.classList.toggle('is-overflowing', table.offsetWidth > box.clientWidth + 1);
  const ro = new ResizeObserver(fit);
  ro.observe(box);
  ro.observe(table);
  fit();

  // The sorted column is tinted; data-sorted-col is its position in a row.
  const COLUMN = { model: 1, t1Band: 2, t1Tau: 3, t3TauRec: 4, t3Exact: 5, t4Acc: 6, t2TauFree: 7 };
  table.dataset.sortedCol = String(COLUMN.t1Band);
  const headers = [...table.querySelectorAll('[data-sort]')];
  let state = { key: 't1Band', dir: -1 };
  const value = (tr, key) => (key === 'model'
    ? tr.querySelector('.model-name').textContent.toLowerCase()
    : +tr.querySelector(`td[data-k$=".${key}"]`).dataset.v);
  function sort(key) {
    state = { key, dir: state.key === key ? -state.dir : key === 'model' ? 1 : -1 };
    const rows = [...body.querySelectorAll('tr')];
    rows.sort((a, b) => {
      const va = value(a, key), vb = value(b, key);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return cmp * state.dir || (+a.dataset.index - +b.dataset.index);
    });
    body.append(...rows);
    table.dataset.sortedCol = String(COLUMN[key]);
    headers.forEach(btn => {
      const th = btn.closest('th');
      if (btn.dataset.sort === key) th.setAttribute('aria-sort', state.dir === 1 ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
  }
  headers.forEach(btn => btn.addEventListener('click', () => sort(btn.dataset.sort)));
}

// ---- Charts ------------------------------------------------------------------
function initCharts(paper) {
  const map = {
    'shape-bars': charts.shapeBars,
    floor: charts.floorChart,
    confusion: charts.confusionChart,
    'graph-study': charts.graphStudyChart,
    'cued-split': charts.cuedSplit,
    verdicts: charts.verdictsChart,
    preference: charts.preferenceChart,
    kappa: charts.kappaChart,
  };
  document.querySelectorAll('[data-chart]').forEach(node => {
    const draw = map[node.dataset.chart];
    if (!draw) return;
    // Charts inside closed findings draw when first opened, at their real width.
    const details = node.closest('details');
    if (details && !details.open) {
      details.addEventListener('toggle', function once() {
        if (!details.open) return;
        details.removeEventListener('toggle', once);
        draw(node, paper);
      });
    } else {
      draw(node, paper);
    }
  });
}
