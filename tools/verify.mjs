#!/usr/bin/env node
// Browser checks with Playwright and Chromium.
//   python3 -m http.server 8000            (in the site folder, another terminal)
//   node tools/verify.mjs --url http://127.0.0.1:8000/ --out .preview
// Needs Playwright: `npm i -D playwright` here, or PLAYWRIGHT_MODULE=/abs/path/to/playwright.
// CHROME=/path/to/chromium overrides the browser binary.
// Checks, at 360, 768 and 1280 px, in day and night, with and without reduced motion:
//   no sideways page scroll; no console errors; no request leaves the site's origin.
// Then: controls, point-by-point playback/lifecycle checks with a virtual clock,
// and screenshots of every hero scene and representative shape loop frames.

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
      // Anything wider than its section is clipped or overflows.
      const overflow = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(n => {
        if (n.closest('.table-scroll,.table-view,.shape-tabs,svg')) return false;
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

      await clickWithoutScroll(page, '[data-theme-toggle]');
      await page.setViewportSize({ width: 768, height: 900 });
      await advance(page, 350);
      await page.setViewportSize({ width: 1280, height: 900 });
      await advance(page, 350);
      await center(page, '#shape-chronicle [data-curve]');
      for (const shape of paper.shapes.items) check(await page.locator(`#shape-${shape.key} .shape-curve-svg`).count() === 1, `shapes: ${shape.key} duplicated its SVG on resize/theme changes`);
      check(await page.locator('.shape-curve-svg').count() === 7, 'shapes: revisiting tabs accumulated controllers/SVGs');
      check(await page.evaluate(() => window.__verificationRafCount()) === 0, 'shapes: paused charts retained scheduled animation frames');
      await clickWithoutScroll(page, '[data-shape-play]');
      await center(page, '#shape-chronicle [data-curve]');
      for (const shape of paper.shapes.items) await clickWithoutScroll(page, `#tab-${shape.key}`);
      await center(page, '#shape-achrony [data-curve]');
      check(await page.evaluate(() => window.__verificationRafCount()) === 1, 'shapes: switching tabs accumulated animation frame loops');
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
    check(await page.evaluate(() => window.__verificationRafCount()) === 0, 'overview: suspended/paused components retained animation loops');
    for (const problem of problems) fail(`overview animation: ${problem}`);
  } catch (error) { fail(`overview animation: ${error.stack || error.message}`); }
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
