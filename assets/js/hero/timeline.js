// Hero engine and controller. One requestAnimationFrame loop advances a clock;
// every frame is drawn from the current time alone, so play, pause, replay,
// speed, scrubbing and jumping to a scene all reduce to setting that time.

import { el } from './draw.js';
import { rowGeometry } from './scene-orders.js';
import { createRevealScene } from './scene-reveal.js';
import { createCurveScene } from './scene-curve.js';
import { createTellingsScene } from './scene-tellings.js';
import { showTip, showTipFor, hideTip } from '../tooltip.js';
import { motionPreference } from '../motion.js';

export class Timeline {
  constructor(durations, onRender, onState) {
    this.durations = durations;
    this.starts = [];
    let acc = 0;
    for (const d of durations) { this.starts.push(acc); acc += d; }
    this.total = acc;
    this.t = 0;
    this.speed = 1;
    this.playing = false;
    this.cycle = 0;
    this.last = null;
    this.onRender = onRender;
    this.onState = onState;
    this.tick = this.tick.bind(this);
  }
  sceneAt(t) {
    for (let i = this.durations.length - 1; i >= 0; i--) if (t >= this.starts[i]) return i;
    return 0;
  }
  sceneEnd(i) { return this.starts[i] + this.durations[i] - 1e-3; }
  play() {
    if (this.playing) return;
    if (this.t >= this.total) { this.t = 0; this.onRender(this.t); }
    this.playing = true;
    this.last = null;
    this.raf = requestAnimationFrame(this.tick);
    this.onState();
  }
  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.last = null;
    this.onState();
  }
  seek(t) {
    this.t = Math.max(0, Math.min(this.total, t));
    this.last = null;
    this.onRender(this.t);
    this.onState();
  }
  tick(now) {
    if (!this.playing) return;
    if (this.last !== null) this.t += Math.min(0.1, (now - this.last) / 1000) * this.speed;
    this.last = now;
    if (this.t >= this.total) {
      this.cycle += Math.floor(this.t / this.total);
      this.t %= this.total;
    }
    this.onRender(this.t);
    this.raf = requestAnimationFrame(this.tick);
  }
}

const NARRATION = [
  {
    title: 'Three tellings.',
    text: 'Every story has two orders: chronology (fabula), the order things happened, and the telling (syuzhet), the order they are narrated. One 12-event work, plotted telling across and chronology up, as a model tells it without a backward cue, as a model tells it with one, and as its author published it.',
  },
  {
    title: 'The reveal.',
    text: 'Eighteen events of one corpus work, in chronology and in the work’s telling. The telling opens on the consequence, e18, which raises q1: why is Martin certain Roy is the target? The explanation, e12, happened first but is told last, after 16 intervening events.',
  },
  {
    title: 'Scoring the order.',
    text: 'Each told event becomes a point: told position across, chronological rank up, so a chronological telling is the diagonal. Kendall’s τ, LIS and hops are arithmetic on this permutation.',
  },
];

export function initHero(figure, data) {
  const stageEl = figure.querySelector('[data-hero-stage]');
  const controls = figure.querySelector('[data-hero-controls]');
  const narration = figure.querySelector('[data-hero-narration]');
  const indexLabel = figure.closest('.hero-window')?.querySelector('[data-hero-index]');
  const playBtn = controls.querySelector('[data-hero-play]');
  const replayBtn = controls.querySelector('[data-hero-replay]');
  const speedBtn = controls.querySelector('[data-hero-speed]');
  const backBtn = controls.querySelector('[data-hero-back]');
  const nextBtn = controls.querySelector('[data-hero-next]');
  const sceneBtns = [...controls.querySelectorAll('[data-scene]')];
  const scrub = controls.querySelector('[data-hero-scrub]');
  const motionGroup = controls.querySelector('[data-motion-controls]');
  const stepGroup = controls.querySelector('[data-step-controls]');

  const mqNarrow = window.matchMedia('(max-width: 899px)');
  let layout = mqNarrow.matches ? 'narrow' : 'wide';
  let reduced = motionPreference.reduced;

  const svg = el(null, 'svg', {
    class: 'h-svg h-stage-svg',
    'aria-label': 'Animated redraw of Figures 2 and 1. The caption below describes every scene.',
    role: 'group',
  });
  const stage = el(svg, 'g');
  stageEl.replaceChildren(svg);

  // Figure 1 first: it introduces fabula and syuzhet; Figure 2 follows from its reveal.
  const scenes = [createTellingsScene(), createRevealScene(), createCurveScene()];
  let mounted = -1;
  let clearHover = () => {};

  // Hover and focus on anything carrying data-e.
  function bindHover(container, contentFn, onHighlight) {
    let current = null;
    const highlight = (k, evt, target) => {
      current = k;
      svg.classList.add('has-hl');
      svg.querySelectorAll('[data-e]').forEach(n => n.classList.toggle('is-hl', +n.dataset.e === k));
      onHighlight?.(k);
      const content = contentFn(k);
      if (evt && evt.clientX !== undefined && evt.type !== 'focusin') showTip(content, evt.clientX, evt.clientY);
      else showTipFor(target, content);
    };
    const clear = () => {
      current = null;
      svg.classList.remove('has-hl');
      svg.querySelectorAll('.is-hl').forEach(n => n.classList.remove('is-hl'));
      onHighlight?.(null);
      hideTip();
    };
    clearHover = clear;
    container.addEventListener('pointerover', e => {
      const g = e.target.closest('[data-e]');
      if (g && container.contains(g) && +g.dataset.e !== current) highlight(+g.dataset.e, e, g);
    });
    container.addEventListener('pointermove', e => {
      if (current !== null && e.pointerType !== 'touch') showTip(contentFn(current), e.clientX, e.clientY);
    });
    container.addEventListener('pointerout', e => {
      if (e.pointerType === 'touch') return;
      const to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('[data-e]') : null;
      if (!to || !container.contains(to)) clear();
    });
    container.addEventListener('focusin', e => {
      const g = e.target.closest('[data-e]');
      if (g) highlight(+g.dataset.e, e, g);
    });
    container.addEventListener('focusout', clear);
  }
  // A tap outside any event dismisses a touch tooltip.
  svg.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' && !e.target.closest('[data-e]')) clearHover();
  });

  const ctx = { data, G: rowGeometry(layout), bindHover };

  function applyLayout() {
    ctx.G = rowGeometry(layout);
    svg.setAttribute('viewBox', `0 0 ${ctx.G.W} ${ctx.G.H}`);
    stageEl.classList.toggle('is-narrow', layout === 'narrow');
    mounted = -1;
  }

  let shownScene = -1;
  function sceneUI(idx) {
    if (idx === shownScene) return;
    shownScene = idx;
    sceneBtns.forEach((b, i) => b.setAttribute('aria-current', i === idx ? 'true' : 'false'));
    const n = NARRATION[idx];
    narration.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = `${idx + 1}/${scenes.length} ${n.title}`;
    narration.append(strong, document.createTextNode(n.text));
    if (indexLabel) indexLabel.textContent = `Scene ${idx + 1} / ${scenes.length} · ${scenes[idx].title}`;
    backBtn.disabled = idx === 0;
    nextBtn.disabled = idx === scenes.length - 1;
  }

  function render(t) {
    const idx = timeline.sceneAt(t);
    svg.dataset.scene = scenes[idx].id;
    svg.dataset.sceneTime = (t - timeline.starts[idx]).toFixed(3);
    svg.dataset.cycle = String(timeline.cycle);
    svg.dataset.totalDuration = String(timeline.total);
    if (idx !== mounted) {
      clearHover();
      stage.replaceChildren();
      scenes[idx].mount(stage, ctx);
      mounted = idx;
    }
    scenes[idx].update(Math.min(t - timeline.starts[idx], scenes[idx].duration));
    sceneUI(idx);
    if (document.activeElement !== scrub) scrub.value = String(Math.round((t / timeline.total) * 1000));
  }

  function setPlayButton() {
    const playing = timeline.playing;
    const ended = timeline.t >= timeline.total;
    const label = reduced ? 'Play animation' : playing ? 'Pause' : ended ? 'Play again' : 'Play';
    playBtn.querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
    playBtn.querySelector('span').textContent = label;
    playBtn.setAttribute('aria-label', label);
    figure.dataset.playback = reduced ? 'static' : playing ? 'playing' : userPaused ? 'paused' : 'suspended';
  }

  const timeline = new Timeline(scenes.map(s => s.duration), render, setPlayButton);

  // ---- controls ----
  let userPaused = false;
  let visible = false;

  function syncPlayback() {
    if (visible && !document.hidden && !reduced && !userPaused) timeline.play();
    else timeline.pause();
    setPlayButton();
  }

  function goScene(i) {
    i = Math.max(0, Math.min(scenes.length - 1, i));
    if (reduced) { timeline.seek(timeline.sceneEnd(i)); return; }
    timeline.seek(timeline.starts[i]);
    userPaused = false;
    syncPlayback();
  }

  playBtn.addEventListener('click', () => {
    if (reduced) {
      userPaused = false;
      motionPreference.enable();
      return;
    }
    userPaused = timeline.playing;
    syncPlayback();
  });
  replayBtn.addEventListener('click', () => { userPaused = false; timeline.cycle = 0; timeline.seek(0); syncPlayback(); });
  speedBtn.addEventListener('click', () => {
    timeline.speed = timeline.speed === 1 ? 2 : 1;
    speedBtn.textContent = `${timeline.speed}×`;
    speedBtn.setAttribute('aria-label', `Speed: ${timeline.speed}×, switch to ${timeline.speed === 1 ? 2 : 1}×`);
  });
  sceneBtns.forEach((b, i) => b.addEventListener('click', () => goScene(i)));
  backBtn.addEventListener('click', () => goScene(timeline.sceneAt(timeline.t) - 1));
  nextBtn.addEventListener('click', () => goScene(timeline.sceneAt(timeline.t) + 1));
  scrub.addEventListener('input', () => timeline.seek((+scrub.value / 1000) * timeline.total));

  figure.addEventListener('keydown', e => {
    const tag = e.target.tagName;
    if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'INPUT' && tag !== 'SUMMARY' && !reduced) {
      e.preventDefault();
      playBtn.click();
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && tag !== 'INPUT') {
      e.preventDefault();
      goScene(timeline.sceneAt(timeline.t) + (e.key === 'ArrowRight' ? 1 : -1));
    }
  });
  // The stage takes focus so its keys work without a control focused.
  stageEl.tabIndex = 0;
  stageEl.setAttribute('aria-label', 'Animation stage. Space plays or pauses; left and right arrows change scene.');

  // ---- motion preference ----
  function applyMotion() {
    figure.classList.toggle('reduced', reduced);
    motionGroup.hidden = false;
    replayBtn.hidden = reduced;
    speedBtn.hidden = reduced;
    stepGroup.hidden = !reduced;
    scrub.closest('.scrubber').hidden = reduced;
    if (reduced) {
      timeline.pause();
      timeline.seek(timeline.sceneEnd(timeline.sceneAt(timeline.t)));
      stageEl.setAttribute('aria-label', 'Story diagram. Left and right arrows change scene.');
      svg.setAttribute('aria-label', 'Static redraw of Figures 2 and 1. The caption below describes every scene.');
    } else {
      if (!userPaused) timeline.seek(timeline.starts[timeline.sceneAt(timeline.t)]);
      stageEl.setAttribute('aria-label', 'Animation stage. Space plays or pauses; left and right arrows change scene.');
      svg.setAttribute('aria-label', 'Animated redraw of Figures 2 and 1. The caption below describes every scene.');
    }
    syncPlayback();
  }

  // ---- pause when offscreen or hidden ----
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) {
      visible = entry.isIntersecting && entry.intersectionRatio >= 0.35;
      syncPlayback();
    }
  }, { threshold: [0, 0.35] });
  io.observe(stageEl);
  document.addEventListener('visibilitychange', syncPlayback);

  mqNarrow.addEventListener('change', () => { layout = mqNarrow.matches ? 'narrow' : 'wide'; applyLayout(); render(timeline.t); });
  motionPreference.subscribe(() => { reduced = motionPreference.reduced; applyMotion(); });

  controls.hidden = false;
  applyLayout();
  applyMotion();
  if (!reduced) timeline.seek(0);
  return timeline;
}
