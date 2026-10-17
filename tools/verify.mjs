#!/usr/bin/env node
// Browser checks with Playwright and Chromium.
//   python3 -m http.server 8000            (in the site folder, another terminal)
//   node tools/verify.mjs --url http://127.0.0.1:8000/ --out .preview
// Needs Playwright: `npm i -D playwright` here, or PLAYWRIGHT_MODULE=/abs/path/to/playwright.
// CHROME=/path/to/chromium overrides the browser binary.
// Checks, at 360, 768 and 1280 px, in day and night, with and without reduced motion:
//   no sideways page scroll; no console errors; no request leaves the site's origin.
// Then: controls, point-by-point playback/lifecycle checks with a virtual clock,
// the pixel-art cameos' playback (on screen only, still under reduced motion),
// the header's motion toggle, the benchmark grid's sticky header and the reading
// progress bar,
// and screenshots of every hero scene, representative shape loop frames and the cameos.

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const url = args.url || 'http://127.0.0.1:8000/';
const out = args.out || '.preview';
const motionOptInOnly = args.only === 'motion-opt-in';
mkdirSync(out, { recursive: true });

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const origin = new URL(url).origin;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const paper = JSON.parse(readFileSync(join(root, 'assets/data/paper.json'), 'utf8'));
const hero = JSON.parse(readFileSync(join(root, 'assets/data/hero.json'), 'utf8'));
let failures = 0;
const fail = msg => { failures++; console.error(`FAIL  ${msg}`); };
const check = (ok, msg) => { if (!ok) fail(msg); };

async function open(width, theme, motion, { clock = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: motion });
  // Night is the default; day is the theme button's stored choice (kept across reloads).
  if (theme === 'light') await context.addInitScript(() => {
    try { if (!localStorage.getItem('nonlinear-theme')) localStorage.setItem('nonlinear-theme', 'light'); } catch (_) { /* no storage */ }
  });
  const page = await context.newPage();
  const problems = [];
  page.on('console', m => {
    if (m.type() !== 'error') return;
    problems.push(m.text());
  });
  page.on('pageerror', e => problems.push(e.message));
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.origin !== origin) problems.push(`outside request: ${r.url()}`);
  });
  if (clock) {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.addInitScript(() => {
      const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
      const pending = new Set();
      window.requestAnimationFrame = callback => {
        const id = request(time => { pending.delete(id); callback(time); });
        pending.add(id);
        return id;
      };
      window.cancelAnimationFrame = id => { pending.delete(id); cancel(id); };
      window.__verificationRafCount = () => pending.size;
    });
  }
  await page.goto(url, { waitUntil: 'networkidle' });
  return { context, page, problems };
}

// ---- pixel-art cameos (assets/js/eggs/) -----------------------------------------
// The cameos share one animation loop while any of them plays; checks on the
// other components' loops discount it.
const componentRafs = page => page.evaluate(() => window.__verificationRafCount()
  - (document.querySelector('[data-egg][data-playback="playing"]') ? 1 : 0));
// One "Time" logogram is laid out at a time (the backdrop's, or on phones the
// title ring's), so cameos are the laid-out [data-egg] nodes, keyed by scene.
async function eggState(page) {
  return page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-egg]')].filter(node => node.getClientRects().length).map(node => {
    const canvas = node.querySelector('canvas');
    let painted = 0, sum = 0;
    if (canvas && canvas.width) {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]) painted++;
        sum = (sum * 31 + data[i] + data[i + 1] * 3 + data[i + 2] * 7 + data[i + 3]) >>> 0;
      }
      painted /= data.length / 4;
    }
    return [node.dataset.egg, {
      playback: node.dataset.playback, time: +node.dataset.time, painted: +painted.toFixed(3), sum, live: node.classList.contains('is-live'),
      scrolled: node.hasAttribute('data-egg-scroll'), progress: +(node.dataset.progress || 0),
    }];
  })));
}

// ---- matrix -------------------------------------------------------------------
if (!motionOptInOnly) {
for (const width of [360, 768, 1280]) {
  for (const theme of ['light', 'dark']) {
    for (const motion of ['no-preference', 'reduce']) {
      const tag = `${width}-${theme}-${motion === 'reduce' ? 'reduced' : 'motion'}`;
      const { context, page, problems } = await open(width, theme, motion);
      await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
      await page.waitForTimeout(motion === 'reduce' ? 600 : 3500);
      const sw = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
      if (sw > width) fail(`${tag}: page scrolls sideways (${sw} > ${width})`);
      // Charts must have drawn.
      const charts = await page.evaluate(() => [...document.querySelectorAll('[data-chart]')].map(n => [n.dataset.chart, n.childElementCount]));
      for (const [name, count] of charts) if (!count) fail(`${tag}: chart ${name} is empty`);
      // Cameos: drawn (the scroll-written logogram may still be blank at the top), and still under reduced motion.
      for (const [name, egg] of Object.entries(await eggState(page))) {
        const blank = egg.scrolled ? motion === 'reduce' && egg.painted < 0.05 : egg.painted < 0.2;
        if (!egg.live || blank) fail(`${tag}: cameo ${name} is not drawn (${JSON.stringify(egg)})`);
        if (motion === 'reduce' && egg.playback !== 'static') fail(`${tag}: cameo ${name} moves under reduced motion (${egg.playback})`);
      }
      // The title backdrop intentionally crops its masked artwork at the viewport.
      // Other content must fit; the scrollWidth check above also covers the backdrop.
      const overflow = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(n => {
        if (n.closest('.title-backdrop,.title-ring>.egg,.table-scroll,.table-view,.shape-tabs,svg')) return false;
        const r = n.getBoundingClientRect();
        return r.width && r.right > document.documentElement.clientWidth + 1;
      }).slice(0, 5).map(n => `${n.tagName.toLowerCase()}.${[...n.classList].join('.')}`));
      if (overflow.length) fail(`${tag}: elements past the right edge: ${overflow.join(', ')}`);
      for (const p of problems) fail(`${tag}: ${p}`);
      if (width !== 768 || theme === 'light') await page.screenshot({ path: join(out, `page-${tag}.png`), fullPage: true });
      await context.close();
    }
  }
}

// ---- hero: keyboard ----------------------------------------------------------
{
  const { context, page } = await open(1280, 'light', 'no-preference');
  const stage = page.locator('[data-hero-stage]');
  await stage.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await stage.focus();
  const label = () => page.locator('[data-hero-play]').getAttribute('aria-label');
  const before = await label();
  await page.keyboard.press('Space');
  const after = await label();
  if (before === after) fail(`Space did not toggle play (${before} → ${after})`);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const idx = await page.locator('[data-hero-index]').textContent();
  if (!/Scene 2/.test(idx)) fail(`ArrowRight did not move to scene 2 (${idx})`);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);
  if (!/Scene 1/.test(await page.locator('[data-hero-index]').textContent())) fail('ArrowLeft did not return to scene 1');
  // Tab reaches the scene buttons.
  const tabbable = await page.evaluate(() => [...document.querySelectorAll('[data-hero-controls] button')].filter(b => !b.closest('[hidden]')).length);
  if (tabbable < 6) fail(`hero controls: only ${tabbable} visible buttons`);
  await context.close();
}

// ---- default theme: night, whatever the system prefers -------------------------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  // The still each cameo shows before its first live frame, and the page's colors.
  const shown = () => page.evaluate(() => {
    const live = [...document.querySelectorAll('.egg.is-live')];
    live.forEach(n => n.classList.remove('is-live'));
    const stills = [...document.querySelectorAll('[data-egg]')].filter(egg => egg.getClientRects().length).map(egg => [...egg.querySelectorAll('.egg-still')]
      .filter(n => getComputedStyle(n).display !== 'none').map(n => n.querySelector('img').getAttribute('src').split('/').pop()));
    live.forEach(n => n.classList.add('is-live'));
    return { bg: getComputedStyle(document.body).backgroundColor, button: document.querySelector('[data-theme-toggle] span').textContent, stills };
  });
  const night = await shown();
  if (night.bg !== 'rgb(19, 37, 43)' || night.button !== 'Day') fail(`a light system did not open at night (${JSON.stringify(night)})`);
  if (!night.stills.every(s => s.length === 1 && /-night\.png$|^egg-gargantua\.png$/.test(s[0]))) fail(`night shows other stills (${JSON.stringify(night.stills)})`);
  await page.locator('[data-theme-toggle]').click();
  const day = await shown();
  if (day.bg !== 'rgb(242, 233, 216)' || day.button !== 'Night') fail(`theme toggle did not switch to day (${JSON.stringify(day)})`);
  if (!day.stills.every(s => s.length === 1 && !s[0].includes('-night'))) fail(`day shows other stills (${JSON.stringify(day.stills)})`);
  await context.close();
}

// ---- phone title: inside the ring of the "Time" logogram ------------------------
for (const width of [360, 600, 601]) {
  const { context, page, problems } = await open(width, 'dark', 'reduce');
  const t = await page.evaluate(() => {
    const box = s => { const n = document.querySelector(s); const r = n.getBoundingClientRect(); return n.getClientRects().length ? { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 } : null; };
    return { ring: box('.title-ring > .egg'), cell: box('.title-ring'), backdrop: box('.title-backdrop .egg--logogram'), h1: box('#page-title'), subtitle: box('.subtitle'),
      lines: [...document.querySelectorAll('#page-title > span')].map(n => Math.round(n.getBoundingClientRect().top)) };
  });
  const label = `phone title ${width}`;
  if (width > 600) {
    check(!t.ring && t.backdrop, `${label}: the ring logogram shows outside phones, or the backdrop's is gone`);
  } else {
    check(t.ring && !t.backdrop, `${label}: phones should show the ring logogram instead of the backdrop's`);
    if (t.ring) {
      const S = t.cell.w;
      check(Math.abs(t.ring.cx - t.cell.cx) < 1 && Math.abs(t.ring.cy - t.cell.cy) < 1 && Math.abs(t.ring.w - 1.25 * S) < 2, `${label}: logogram is not centred on its ring cell (${JSON.stringify(t)})`);
      check(Math.abs(t.h1.cx - t.cell.cx) < 1 && Math.abs(t.h1.cy - (t.cell.cy - 0.015 * S)) < 1.5, `${label}: title is not centred in the ring (${JSON.stringify(t)})`);
      check(new Set(t.lines).size === 4 && t.h1.w < 0.56 * S && t.h1.h < 0.38 * S, `${label}: title does not fit the ring in four lines (${JSON.stringify(t)})`);
      const subtitleGap = t.subtitle.y - (t.h1.y + t.h1.h);
      check(subtitleGap >= 8 && subtitleGap <= 24, `${label}: subtitle does not sit just below the title (${JSON.stringify(t)})`);
    }
  }
  for (const problem of problems) fail(`${label}: ${problem}`);
  await context.close();
}

// ---- page interactions --------------------------------------------------------
{
  const { context, page } = await open(1280, 'light', 'reduce');
  await page.addStyleTag({ content: '.site-header{position:static!important}' });
  // Theme toggle.
  await page.locator('[data-theme-toggle]').click();
  if (await page.evaluate(() => document.documentElement.dataset.theme) !== 'dark') fail('theme toggle did not switch to dark');
  await page.locator('[data-theme-toggle]').click();
  // Leaderboard sort: τ free descending puts the most chronological model first.
  await page.locator('[data-sort="t2TauFree"]').click();
  const top = await page.locator('[data-lb-body] tr:first-child .model-name').textContent();
  if (top !== 'Gemini 3.6 Flash') fail(`sorting by τ free put ${top} first`);
  if (await page.locator('[data-sort="t2TauFree"]').evaluate(b => b.closest('th').getAttribute('aria-sort')) !== 'descending') fail('aria-sort not set');
  if (await page.locator('[data-leaderboard]').getAttribute('data-sorted-col') !== '7') fail('the sorted grid column is not marked');
  // The grid's header stays in view below the page header while its rows scroll.
  const stuck = await page.evaluate(() => {
    const table = document.querySelector('[data-leaderboard]');
    window.scrollTo({ top: table.getBoundingClientRect().top + window.scrollY + 300, behavior: 'instant' });
    const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h'));
    return { head: table.tHead.getBoundingClientRect().top, want: headerH + 6, overflowing: table.closest('.table-scroll').classList.contains('is-overflowing') };
  });
  if (stuck.overflowing || Math.abs(stuck.head - stuck.want) > 2) fail(`benchmark grid header did not stick (${JSON.stringify(stuck)})`);
  // Every section title carries its pixel icon.
  if (await page.locator('.window-title .h2-icon').count() !== 9) fail('section titles lost their icons');
  // Reading progress fills the header strip's bar at the end of the page.
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.waitForTimeout(150);
  const filled = await page.locator('[data-read-progress]').evaluate(n => getComputedStyle(n).transform);
  if (filled !== 'matrix(1, 0, 0, 1, 0, 0)' && filled !== 'none') fail(`reading progress did not fill (${filled})`);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  // Shape browser: arrow key moves to the next shape and draws its curve.
  await page.locator('#tab-chronicle').focus();
  await page.keyboard.press('ArrowRight');
  if (await page.locator('#tab-analepsis').getAttribute('aria-selected') !== 'true') fail('ArrowRight did not select the next shape');
  if (!(await page.locator('#shape-analepsis svg').count())) fail('shape curve not drawn');
  // Hero: hovering a curve dot in scene 3 shows its ranks.
  await page.locator('[data-scene="2"]').click();
  await page.waitForTimeout(200);
  await page.locator('.h-curve-dot[data-e="18"] .h-hit').hover();
  const heroTip = await page.locator('[data-tooltip]').textContent();
  if (!/chronology 18 · told 1/.test(heroTip)) fail(`hero tooltip shows "${heroTip}"`);
  // Chart tooltip on a heatmap cell.
  await page.evaluate(() => document.querySelectorAll('details.finding').forEach(d => { d.open = true; }));
  await page.waitForTimeout(300);
  await page.locator('[data-chart="confusion"] rect.c-cell[tabindex]').nth(1).hover();
  const cellTip = await page.locator('[data-tooltip]').textContent();
  if (!/Analepsis/.test(cellTip)) fail(`heatmap tooltip shows "${cellTip}"`);
  // BibTeX copy reports an outcome.
  await page.locator('[data-copy]').click();
  await page.waitForTimeout(200);
  if (!(await page.locator('[data-copy-status]').textContent()).trim()) fail('copy gave no status');
  await context.close();
}
}

// ---- animation: advance every RAF, without spending a minute per loop --------
// runFor preserves every frame; fastForward would skip intermediate events.
const advance = (page, ms) => page.clock.runFor(ms);
const clickWithoutScroll = (page, selector) => page.locator(selector).dispatchEvent('click');
// With motion allowed the theme dissolves through a view transition, whose update
// runs on the next rendered frame: wait for the new palette (real time, so it
// also works under the virtual clock).
async function toggleTheme(page) {
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme || '');
  const before = await theme();
  await clickWithoutScroll(page, '[data-theme-toggle]');
  for (let k = 0; k < 80 && await theme() === before; k++) await page.waitForTimeout(25);
}
async function motionPreference(page, value) {
  await page.emulateMedia({ reducedMotion: value });
  await page.waitForTimeout(100); // MatchMedia change arrives from the browser compositor.
  await advance(page, 64);
}
async function center(page, selector) {
  await page.locator(selector).evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await advance(page, 64);
  await page.waitForTimeout(50); // IntersectionObserver is delivered by the real browser.
  await advance(page, 64); // Flush the navigation RAF queued by the real scroll event.
}
async function hidden(page, value) {
  await page.evaluate(value => {
    if (value) Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    else delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
}
async function shapeState(page, key) {
  return page.locator(`#shape-${key} .shape-curve-svg`).evaluate(svg => ({
    count: +svg.dataset.visiblePoints, total: +svg.dataset.pointCount,
    current: +svg.dataset.currentPoint, cycle: +svg.dataset.cycle, playback: svg.dataset.playback,
    points: [...svg.querySelector('.shape-curve-trail').points].map(p => [p.x, p.y]),
    marks: [...svg.querySelectorAll('.shape-curve-point')].filter(n => n.getAttribute('visibility') === 'visible').length,
    ring: [Number(svg.querySelector('.shape-curve-current').getAttribute('cx')), Number(svg.querySelector('.shape-curve-current').getAttribute('cy'))],
    ringVisible: svg.querySelector('.shape-curve-current').getAttribute('visibility') !== 'hidden',
  }));
}
function checkShape(state, shape, count, label) {
  const order = shape.curve.order, n = order.length;
  check(state.count === count && state.current === count && state.marks === count && state.points.length === count,
    `${label}: expected ${count} visible points/current marker, got ${JSON.stringify(state)}`);
  const expected = order.slice(0, count).map((r, i) => [30 + i / (n - 1) * 258, 250 - (r - 1) / (n - 1) * 238]);
  check(state.points.every((p, i) => expected[i] && p.every((v, axis) => Math.abs(v - expected[i][axis]) < 0.01)),
    `${label}: trail differs from the paper's chronological ranks in telling order`);
  if (state.ringVisible) check(state.ring.every((v, axis) => Math.abs(v - expected[count - 1][axis]) < 0.01), `${label}: current-point ring is misplaced`);
}

if (!motionOptInOnly) for (const theme of ['light', 'dark']) {
  const { context, page, problems } = await open(1280, theme, 'no-preference', { clock: true });
  try {
    const shapes = theme === 'light' ? paper.shapes.items : [paper.shapes.items.find(s => s.key === 'zigzag')];
    await page.addStyleTag({ content: '.site-header{position:static!important}' });
    await center(page, '#shape-chronicle [data-curve]');
    for (const shape of shapes) {
      await clickWithoutScroll(page, `#tab-${shape.key}`);
      await center(page, `#shape-${shape.key} [data-curve]`);
      // A newly revealed tab receives its observer callback after layout. Give
      // its first scheduled RAF a frame before sampling 450 ms boundaries.
      await advance(page, 64);
      const state = await shapeState(page, shape.key);
      checkShape(state, shape, 1, `${theme} ${shape.key}: start`);
      check(state.playback === 'running', `${theme} ${shape.key}: visible chart is not running`);
      const middle = Math.floor(shape.curve.order.length / 2);
      for (let point = 2; point <= shape.curve.order.length; point++) {
        await advance(page, 450);
        checkShape(await shapeState(page, shape.key), shape, point, `${theme} ${shape.key}: step ${point}`);
        if (shape.key === 'zigzag' && point === middle) await page.locator('[data-shapes]').screenshot({ path: join(out, `shape-mid-${theme}.png`) });
      }
      if (shape.key === 'zigzag') await page.locator('[data-shapes]').screenshot({ path: join(out, `shape-full-${theme}.png`) });
      await advance(page, 1150);
      checkShape(await shapeState(page, shape.key), shape, shape.curve.order.length, `${theme} ${shape.key}: completed hold`);
      await advance(page, 300);
      const loop = await shapeState(page, shape.key);
      checkShape(loop, shape, 1, `${theme} ${shape.key}: loop restart`);
      check(loop.cycle === 1, `${theme} ${shape.key}: completed curve did not restart exactly once`);
      if (shape.key === 'zigzag') await page.locator('[data-shapes]').screenshot({ path: join(out, `shape-loop-${theme}.png`) });
    }

    if (theme === 'light') {
      await clickWithoutScroll(page, '#tab-chronicle');
      await advance(page, 950);
      await clickWithoutScroll(page, '[data-shape-play]');
      const paused = await shapeState(page, 'chronicle');
      await advance(page, 1400);
      check(JSON.stringify(await shapeState(page, 'chronicle')) === JSON.stringify(paused), 'shapes: Pause did not freeze the curve');
      await clickWithoutScroll(page, '#tab-analepsis');
      await advance(page, 950);
      const nextPaused = await shapeState(page, 'analepsis');
      check(nextPaused.count === 1 && nextPaused.playback === 'paused', 'shapes: Pause did not persist when changing tabs');
      await clickWithoutScroll(page, '[data-shape-play]');
      await advance(page, 950);
      const old = await shapeState(page, 'chronicle');
      await advance(page, 950);
      check(JSON.stringify(await shapeState(page, 'chronicle')) === JSON.stringify(old), 'shapes: inactive tab kept advancing');
      await clickWithoutScroll(page, '#tab-chronicle');
      checkShape(await shapeState(page, 'chronicle'), paper.shapes.items[0], 1, 'shapes: revisited tab restarts');
      await advance(page, 950);

      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await advance(page, 64);
      await page.waitForTimeout(80);
      const offscreen = await shapeState(page, 'chronicle');
      await advance(page, 3000);
      check(offscreen.playback === 'suspended' && JSON.stringify(await shapeState(page, 'chronicle')) === JSON.stringify(offscreen), 'shapes: offscreen curve did not freeze');
      await center(page, '#shape-chronicle [data-curve]');
      await advance(page, 450);
      check((await shapeState(page, 'chronicle')).count === offscreen.count + 1, 'shapes: resuming skipped elapsed offscreen time');

      await hidden(page, true);
      const background = await shapeState(page, 'chronicle');
      await advance(page, 3000);
      check(background.playback === 'suspended' && JSON.stringify(await shapeState(page, 'chronicle')) === JSON.stringify(background), 'shapes: background tab did not freeze');
      await hidden(page, false);
      await advance(page, 450);
      check((await shapeState(page, 'chronicle')).count === background.count + 1, 'shapes: background resume skipped events');

      await motionPreference(page, 'reduce');
      const reduced = await shapeState(page, 'chronicle');
      checkShape(reduced, paper.shapes.items[0], reduced.total, 'shapes: live reduced motion');
      check(reduced.playback === 'reduced' && !reduced.ringVisible && await page.locator('[data-shape-play]').isHidden(), 'shapes: reduced motion did not hide playback with a complete static curve');
      await advance(page, 3000);
      check(JSON.stringify(await shapeState(page, 'chronicle')) === JSON.stringify(reduced), 'shapes: reduced-motion curve still advances');
      await motionPreference(page, 'no-preference');
      checkShape(await shapeState(page, 'chronicle'), paper.shapes.items[0], 1, 'shapes: normal motion restarts');
      await clickWithoutScroll(page, '[data-shape-play]');
      await motionPreference(page, 'reduce');
      await motionPreference(page, 'no-preference');
      check((await shapeState(page, 'chronicle')).playback === 'paused', 'shapes: motion preference change lost explicit Pause');

      await toggleTheme(page);
      await page.setViewportSize({ width: 768, height: 900 });
      await advance(page, 350);
      await page.setViewportSize({ width: 1280, height: 900 });
      await advance(page, 350);
      await center(page, '#shape-chronicle [data-curve]');
      for (const shape of paper.shapes.items) check(await page.locator(`#shape-${shape.key} .shape-curve-svg`).count() === 1, `shapes: ${shape.key} duplicated its SVG on resize/theme changes`);
      check(await page.locator('.shape-curve-svg').count() === 7, 'shapes: revisiting tabs accumulated controllers/SVGs');
      check(await componentRafs(page) === 0, 'shapes: paused charts retained scheduled animation frames');
      await clickWithoutScroll(page, '[data-shape-play]');
      await center(page, '#shape-chronicle [data-curve]');
      for (const shape of paper.shapes.items) await clickWithoutScroll(page, `#tab-${shape.key}`);
      await center(page, '#shape-achrony [data-curve]');
      check(await componentRafs(page) === 1, 'shapes: switching tabs accumulated animation frame loops');
    }
    for (const problem of problems) fail(`shape animation ${theme}: ${problem}`);
  } catch (error) { fail(`shape animation ${theme}: ${error.stack || error.message}`); }
  finally { await context.close(); }
}

async function heroState(page) {
  return page.locator('.h-stage-svg').evaluate(svg => ({
    scene: svg.dataset.scene, time: +svg.dataset.sceneTime, cycle: +svg.dataset.cycle,
    playback: svg.closest('[data-hero]').dataset.playback,
  }));
}
async function advanceHeroTo(page, seconds) {
  const { time } = await heroState(page);
  // Allow one rendering frame at a boundary; every intervening RAF still runs.
  await advance(page, Math.max(0, Math.ceil((seconds - time) * 1000)) + 32);
}
async function curveState(page, selector) {
  return page.locator(selector).evaluate(node => {
    const path = node.matches('polyline') ? node : node.querySelector('polyline.h-trajectory');
    return { count: +node.dataset.visiblePoints, current: +node.dataset.currentEvent, phase: node.dataset.phase,
      points: [...path.points].map(p => [p.x, p.y]) };
  });
}
function checkOrderCurve(state, order, count, point, label, tolerance = 0.01) {
  check(state.count === count && state.points.length === count && state.current === order[count - 1], `${label}: current event or revealed point count is incorrect`);
  check(state.points.every((p, i) => p.every((v, axis) => Math.abs(v - point(i, order[i])[axis]) < tolerance)), `${label}: plotted points differ from the source telling order`);
}

if (!motionOptInOnly) {
  const { context, page, problems } = await open(1280, 'light', 'no-preference', { clock: true });
  try {
    await page.addStyleTag({ content: '.site-header{position:static!important}' });
    await center(page, '[data-hero-stage]');
    await clickWithoutScroll(page, '[data-scene="0"]');
    for (const [k, telling] of hero.figure1.tellings.entries()) {
      const selector = `[data-telling="${telling.id}"]`;
      for (let count = 1; count <= telling.order.length; count++) {
        await advanceHeroTo(page, k * 6.35 + (count - 1) * 0.45 + 0.05);
        const state = await curveState(page, selector);
        checkOrderCurve(state, telling.order, count, (i, rank) => [60 + i / 11 * 320 + (rank - 1) / 11 * 104, 148 + k * 136 + i / 11 * 112 - (rank - 1) / 11 * 74], `overview ${telling.id}: step ${count}`);
        for (const later of hero.figure1.tellings.slice(k + 1)) check((await curveState(page, `[data-telling="${later.id}"]`)).count === 0, `overview: ${later.id} started before ${telling.id} finished`);
      }
      await advanceHeroTo(page, k * 6.35 + 6.25);
      check((await curveState(page, selector)).phase === 'hold', `overview ${telling.id}: completed-state hold is missing`);
    }
    await advance(page, 150);
    check((await heroState(page)).scene === 'reveal', 'overview did not advance from Three tellings to The reveal');
    await advanceHeroTo(page, 13.45);
    check((await heroState(page)).scene === 'reveal', 'overview skipped the reveal before its final frame');
    await advance(page, 150);
    check((await heroState(page)).scene === 'curve', 'overview did not advance to Scoring the order');
    await clickWithoutScroll(page, '[data-scene="2"]');
    const order = hero.figure2.telling;
    for (let count = 1; count <= order.length; count++) {
      await advanceHeroTo(page, (count - 1) * 0.45 + 0.05);
      checkOrderCurve(await curveState(page, '[data-story-curve]'), order, count, (i, rank) => [176 + i * 24, 498 - (rank - 1) * 24], `overview scoring: step ${count}`);
      if (count < order.length) check(await page.locator('.h-panel-value').evaluateAll(nodes => nodes.every(n => getComputedStyle(n).visibility === 'hidden')), 'overview revealed scores before the complete telling');
    }
    await advanceHeroTo(page, 12.0);
    const scores = await page.locator('.h-panel-value').allTextContents();
    check(scores.join('|') === '−0.085|0.50|13', `overview: completed telling scores changed (${scores.join(', ')})`);
    check((await curveState(page, '[data-story-curve]')).phase === 'hold', 'overview scoring: final hold is missing');
    await advanceHeroTo(page, 13.25);
    check((await heroState(page)).scene === 'curve', 'overview reset before its final completed-state hold');
    await advance(page, 180);
    const loop = await heroState(page);
    check(loop.scene === 'tellings' && loop.cycle === 1 && loop.playback === 'playing', 'overview did not loop automatically from its last scene');

    await clickWithoutScroll(page, '[data-hero-play]');
    const paused = await heroState(page);
    await advance(page, 1800);
    check(JSON.stringify(await heroState(page)) === JSON.stringify(paused), 'overview: Pause did not freeze playback');
    await page.locator('[data-hero-scrub]').evaluate(input => { input.value = '800'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    check((await heroState(page)).scene === 'curve' && (await heroState(page)).playback === 'paused', 'overview: scrubbing did not seek while preserving Pause');
    await clickWithoutScroll(page, '[data-hero-replay]');
    check((await heroState(page)).scene === 'tellings' && (await heroState(page)).cycle === 0, 'overview: Replay did not reset the loop');
    await advance(page, 950);
    const speedStart = (await heroState(page)).time;
    await clickWithoutScroll(page, '[data-hero-speed]');
    await advance(page, 1000);
    check(Math.abs((await heroState(page)).time - speedStart - 2) < 0.05, 'overview: 2× speed did not double elapsed story time');
    await clickWithoutScroll(page, '[data-hero-speed]');

    await hidden(page, true);
    const background = await heroState(page);
    await advance(page, 2000);
    check(background.playback === 'suspended' && JSON.stringify(await heroState(page)) === JSON.stringify(background), 'overview: background playback did not freeze');
    await hidden(page, false);
    await advance(page, 500);
    check((await heroState(page)).time - background.time < 0.55, 'overview: background resume skipped story time');
    await center(page, '#shape-chronicle [data-curve]');
    const offscreen = await heroState(page);
    await advance(page, 2000);
    check(offscreen.playback === 'suspended' && JSON.stringify(await heroState(page)) === JSON.stringify(offscreen), 'overview: offscreen playback did not freeze');
    await center(page, '[data-hero-stage]');
    await motionPreference(page, 'reduce');
    const reduced = await heroState(page);
    check(reduced.playback === 'static' && await page.locator('[data-hero-play]').isVisible() && await page.locator('[data-hero-play]').getAttribute('aria-label') === 'Play animation', 'overview: live reduced motion did not offer explicit Play with static diagrams');
    check(await page.locator('[data-hero-replay]').isHidden() && await page.locator('[data-hero-speed]').isHidden() && await page.locator('[data-hero-scrub]').isHidden() && await page.locator('[data-step-controls]').isVisible(), 'overview: reduced motion did not retain only Play and static scene controls');
    for (const telling of hero.figure1.tellings) check((await curveState(page, `[data-telling="${telling.id}"]`)).count === telling.order.length, 'overview: reduced motion did not render complete static tellings');
    await advance(page, 2000);
    check(JSON.stringify(await heroState(page)) === JSON.stringify(reduced), 'overview: reduced-motion scene still advances');
    await motionPreference(page, 'no-preference');
    check((await heroState(page)).time < 0.1 && (await heroState(page)).playback === 'playing', 'overview: normal motion did not restart the visible scene');
    await clickWithoutScroll(page, '[data-hero-play]');
    await motionPreference(page, 'reduce');
    await motionPreference(page, 'no-preference');
    check((await heroState(page)).playback === 'paused', 'overview: motion preference change lost explicit Pause');
    check(await componentRafs(page) === 0, 'overview: suspended/paused components retained animation loops');
    for (const problem of problems) fail(`overview animation: ${problem}`);
  } catch (error) { fail(`overview animation: ${error.stack || error.message}`); }
  finally { await context.close(); }
}

// ---- cameos: play on screen, freeze off screen, hidden and under reduced motion --
if (!motionOptInOnly) for (const theme of ['light', 'dark']) {
  const { context, page, problems } = await open(1280, theme, 'no-preference', { clock: true });
  const label = `cameos ${theme}`;
  try {
    await page.addStyleTag({ content: '.site-header{position:static!important}' });
    await advance(page, 64);
    await page.waitForTimeout(50);
    await advance(page, 64);
    const start = await eggState(page);
    check(start.logogram.playback === 'playing' && start.gargantua.playback === 'playing', `${label}: title cameos are not playing at the top (${JSON.stringify(start)})`);
    check(start.shell.playback === 'suspended', `${label}: the closing shot plays while off-screen (${start.shell.playback})`);
    await advance(page, 6000);
    const title = await eggState(page);
    check(Math.abs(title.logogram.time - start.logogram.time - 6) < 0.2, `${label}: logogram clock did not follow playback (${start.logogram.time} → ${title.logogram.time})`);
    check(title.logogram.sum !== start.logogram.sum && title.gargantua.sum !== start.gargantua.sum, `${label}: title cameos did not redraw while playing`);
    check(title.shell.time === start.shell.time, `${label}: off-screen closing shot advanced`);
    await page.locator('#top').screenshot({ path: join(out, `cameos-title-${theme}.png`) });

    await center(page, '[data-egg="shell"]');
    const bottom = await eggState(page);
    check(bottom.shell.playback === 'playing', `${label}: closing shot did not start on screen (${bottom.shell.playback})`);
    check(bottom.logogram.playback === 'suspended' && bottom.gargantua.playback === 'suspended', `${label}: title cameos kept playing off-screen`);
    await advance(page, 3000);
    const later = await eggState(page);
    check(later.logogram.time === bottom.logogram.time && later.logogram.sum === bottom.logogram.sum, `${label}: off-screen logogram kept changing`);
    check(later.shell.time - bottom.shell.time > 2.8 && later.shell.sum !== bottom.shell.sum, `${label}: closing shot did not advance`);
    await page.locator('.egg-band').screenshot({ path: join(out, `cameos-shell-${theme}.png`) });

    // The epigraph's logogram is written by the scroll: partly while it comes into view, whole once it is in.
    await page.evaluate(() => {
      const node = document.querySelector('[data-egg="epigraph"]');
      window.scrollTo({ top: node.getBoundingClientRect().top + window.scrollY - window.innerHeight + node.offsetHeight * 0.55, behavior: 'instant' });
    });
    await advance(page, 64);
    await page.waitForTimeout(50);
    await advance(page, 64);
    const partly = (await eggState(page)).epigraph;
    check(partly.playback === 'playing' && partly.progress > 0.1 && partly.progress < 0.9, `${label}: epigraph logogram is not partly written mid-scroll (${JSON.stringify(partly)})`);
    await center(page, '.epigraph');
    const whole = (await eggState(page)).epigraph;
    check(whole.progress === 1 && whole.painted > partly.painted, `${label}: epigraph logogram is not whole once in view (${JSON.stringify(whole)})`);
    await page.locator('.epigraph').screenshot({ path: join(out, `cameos-epigraph-${theme}.png`) });
    await center(page, '[data-egg="shell"]');

    await hidden(page, true);
    const away = await eggState(page);
    await advance(page, 2000);
    check(away.shell.playback === 'suspended' && JSON.stringify(await eggState(page)) === JSON.stringify(away), `${label}: background tab kept the closing shot moving`);
    check(await page.evaluate(() => window.__verificationRafCount()) === 0, `${label}: hidden page retained animation frames`);
    await hidden(page, false);
    await advance(page, 500);
    check((await eggState(page)).shell.playback === 'playing', `${label}: closing shot did not resume`);

    // Theme: cameos repaint with the other palette, playing or not.
    const before = await eggState(page);
    await toggleTheme(page);
    const after = await eggState(page);
    for (const name of ['logogram', 'shell']) check(after[name].sum !== before[name].sum, `${label}: ${name} did not repaint on theme change`);
    await toggleTheme(page);

    await motionPreference(page, 'reduce');
    const still = await eggState(page);
    for (const [name, egg] of Object.entries(still)) check(egg.playback === 'static', `${label}: ${name} is not still under reduced motion (${egg.playback})`);
    await advance(page, 2000);
    check(JSON.stringify(await eggState(page)) === JSON.stringify(still), `${label}: still cameos changed under reduced motion`);
    check(await page.evaluate(() => window.__verificationRafCount()) === 0, `${label}: reduced motion retained animation frames`);
    await motionPreference(page, 'no-preference');
    check((await eggState(page)).shell.playback === 'playing', `${label}: closing shot did not resume with motion allowed`);
    for (const problem of problems) fail(`${label}: ${problem}`);
  } catch (error) { fail(`${label}: ${error.stack || error.message}`); }
  finally { await context.close(); }
}

// ---- header motion toggle: holds every animation, remembered, plays again ----
if (!motionOptInOnly) {
  const { context, page, problems } = await open(1280, 'light', 'no-preference', { clock: true });
  const label = 'motion toggle';
  const settle = async () => { await advance(page, 64); await page.waitForTimeout(50); await advance(page, 64); };
  try {
    await settle();
    const button = page.locator('[data-motion-toggle]');
    check(await button.isVisible() && await button.getAttribute('aria-pressed') === 'false', `${label}: motion does not start playing`);
    await button.dispatchEvent('click');
    await settle();
    const held = await eggState(page);
    check(await button.getAttribute('aria-pressed') === 'true' && Object.values(held).every(egg => egg.playback === 'static'), `${label}: Hold did not still the cameos (${JSON.stringify(held)})`);
    check(await page.locator('[data-hero]').getAttribute('data-playback') === 'static' && await page.locator('[data-shape-play]').isHidden(), `${label}: Hold did not still the overview and the shapes`);
    check(await page.evaluate(() => window.__verificationRafCount()) === 0, `${label}: a held page retained animation frames`);
    await page.reload({ waitUntil: 'networkidle' });
    await settle();
    check(await button.getAttribute('aria-pressed') === 'true' && (await eggState(page)).logogram.playback === 'static', `${label}: Hold was not remembered on reload`);
    await button.dispatchEvent('click');
    await settle();
    const played = await eggState(page);
    check(await button.getAttribute('aria-pressed') === 'false' && played.logogram.playback === 'playing', `${label}: Play did not resume (${JSON.stringify(played)})`);
    check(await page.evaluate(() => localStorage.getItem('nonlinear-motion')) === null, `${label}: Play did not forget the hold`);
    for (const problem of problems) fail(`${label}: ${problem}`);
  } catch (error) { fail(`${label}: ${error.stack || error.message}`); }
  finally { await context.close(); }
}

// ---- reduced motion: overview Play enables animation for this page visit -----
async function checkReducedDefaults(page, label) {
  const shape = await shapeState(page, 'chronicle');
  checkShape(shape, paper.shapes.items[0], shape.total, `${label}: complete shape`);
  check(shape.playback === 'reduced' && !shape.ringVisible, `${label}: shape autoplay is not disabled`);
  check(await page.locator('[data-shape-play]').isHidden(), `${label}: shape playback should stay hidden before overview opt-in`);
  check((await heroState(page)).playback === 'static', `${label}: overview autoplay is not disabled`);
  check(await page.locator('[data-hero-play]').isVisible() && await page.locator('[data-hero-play]').getAttribute('aria-label') === 'Play animation', `${label}: overview Play animation is unavailable`);
  check(await page.getByRole('button', { name: 'Play animation', exact: true }).count() === 1 && await page.locator('#overview').getByRole('button', { name: 'Play animation', exact: true }).count() === 1, `${label}: Play animation is not unique to One story, two orders`);
  check(await page.locator('#overview [data-hero-stage]').evaluate(stage => stage.nextElementSibling?.matches('[data-hero-controls]')), `${label}: overview controls should immediately follow the diagram`);
  check(await page.locator('[data-hero-replay]').isHidden() && await page.locator('[data-hero-speed]').isHidden() && await page.locator('[data-hero-scrub]').isHidden() && await page.locator('[data-step-controls]').isVisible(), `${label}: static overview controls are incorrect`);
  for (const telling of hero.figure1.tellings) check((await curveState(page, `[data-telling="${telling.id}"]`)).count === telling.order.length, `${label}: ${telling.id} is not complete`);
  for (const [name, egg] of Object.entries(await eggState(page))) check(egg.playback === 'static', `${label}: cameo ${name} is not still (${egg.playback})`);
}

for (const theme of ['light', 'dark']) {
  const { context, page, problems } = await open(1280, theme, 'reduce', { clock: true });
  const label = `reduced motion, overview Play, ${theme}`;
  const heroProgressed = value => value.playback === 'playing' && value.time >= 0.9 && value.time < 2;
  try {
    await page.addStyleTag({ content: '.site-header{position:static!important}' });
    await checkReducedDefaults(page, label);
    const staticShape = await shapeState(page, 'chronicle'), staticHero = await heroState(page);
    await advance(page, 1600);
    check(JSON.stringify(await shapeState(page, 'chronicle')) === JSON.stringify(staticShape) && JSON.stringify(await heroState(page)) === JSON.stringify(staticHero), `${label}: reduced defaults advanced without consent`);

    // Enter activates the native Play button, including for keyboard users.
    await center(page, '[data-hero-stage]');
    await page.locator('[data-hero-play]').focus();
    await page.keyboard.press('Enter');
    await advance(page, 950);
    const started = await heroState(page);
    check(heroProgressed(started), `${label}: explicit Play did not advance (${JSON.stringify(started)})`);
    check((await shapeState(page, 'chronicle')).playback === 'suspended', `${label}: opt-in did not enable the offscreen shape`);
    check(await page.locator('[data-shape-play]').isVisible() && await page.locator('[data-shape-play]').textContent() === 'Pause', `${label}: ordinary shape Pause was not restored`);
    check(await page.locator('[data-hero-replay]').isVisible() && await page.locator('[data-hero-speed]').isVisible() && await page.locator('[data-hero-scrub]').isVisible(), `${label}: full overview controls were not restored`);
    check(Object.values(await eggState(page)).every(egg => egg.playback !== 'static'), `${label}: overview opt-in did not release the cameos`);

    await center(page, '#shape-chronicle [data-curve]');
    await advance(page, 950);
    const shared = await shapeState(page, 'chronicle');
    check(shared.playback === 'running' && shared.count >= 3 && shared.count < shared.total, `${label}: shapes did not animate after overview opt-in (${JSON.stringify(shared)})`);
    check((await heroState(page)).playback === 'suspended', `${label}: offscreen overview did not suspend`);
    await clickWithoutScroll(page, '[data-shape-play]');
    const paused = await shapeState(page, 'chronicle');
    await advance(page, 1200);
    check(paused.playback === 'paused' && JSON.stringify(await shapeState(page, 'chronicle')) === JSON.stringify(paused), `${label}: ordinary Pause no longer freezes playback`);

    // Changing the OS preference cancels the page override. A subsequent Play
    // in the overview must retain the user's independent shape Pause choice.
    await motionPreference(page, 'no-preference');
    await motionPreference(page, 'reduce');
    await checkReducedDefaults(page, `${label}: changed OS preference`);
    await center(page, '[data-hero-stage]');
    await clickWithoutScroll(page, '[data-hero-play]');
    await advance(page, 950);
    check(heroProgressed(await heroState(page)), `${label}: Play did not restart after an OS preference change`);
    check((await shapeState(page, 'chronicle')).playback === 'paused', `${label}: overview opt-in discarded the shape's explicit Pause`);
    await motionPreference(page, 'no-preference');
    check((await shapeState(page, 'chronicle')).playback === 'paused', `${label}: returning to normal motion discarded explicit Pause`);
    await motionPreference(page, 'reduce');
    await checkReducedDefaults(page, `${label}: second OS change`);
    await clickWithoutScroll(page, '[data-hero-play]');
    await page.reload({ waitUntil: 'networkidle' });
    await checkReducedDefaults(page, `${label}: reload`);
    for (const problem of problems) fail(`${label}: ${problem}`);
  } catch (error) { fail(`${label}: ${error.stack || error.message}`); }
  finally { await context.close(); }
}

// ---- hero: every scene, final frames (reduced motion) and mid frames ---------
if (!motionOptInOnly) for (const width of [1280, 360]) {
  for (const theme of ['light', 'dark']) {
    const { context, page } = await open(width, theme, 'reduce');
    await page.addStyleTag({ content: '.site-header{position:static!important}' });
    const fig = page.locator('[data-hero]');
    for (let i = 0; i < 3; i++) {
      await page.locator(`[data-scene="${i}"]`).click();
      await page.waitForTimeout(250);
      await fig.screenshot({ path: join(out, `hero-final-${i + 1}-${width}-${theme}.png`) });
    }
    await context.close();
  }
  const { context, page } = await open(width, 'light', 'no-preference');
  await page.addStyleTag({ content: '.site-header{position:static!important}' });
  const fig = page.locator('[data-hero]');
  for (const [scene, ms] of [[0, 4500], [1, 300], [1, 2600], [1, 6000], [2, 3000]]) {
    await page.locator(`[data-scene="${scene}"]`).click();
    await page.waitForTimeout(ms);
    await fig.screenshot({ path: join(out, `hero-mid-${scene + 1}-${ms}-${width}.png`) });
  }
  await context.close();
}

await browser.close();
console.log(failures ? `${failures} problem(s); screenshots in ${out}` : `All browser checks passed; screenshots in ${out}`);
process.exit(failures ? 1 : 0);
