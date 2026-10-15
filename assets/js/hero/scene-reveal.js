// Scene 2, "The reveal" (Figure 2, bottom): e18 opens the telling and raises
// q1; the question stays open across 16 intervening events; e12 closes it at
// told 18; the REVEALS arrow runs from explanation to consequence.

import { el, set, prog, ease, lerp, snap, pop, stepped, sprite, subLabel, richText, windowFrame, arrowHead, pad2 } from './draw.js';
import { buildRows, settleRows } from './scene-orders.js';

function cardGeometry(layout) {
  if (layout === 'wide') {
    const xs = [24, 262, 500, 738];
    return {
      cards: xs.map(x => ({ x, y: 334, w: 198, h: 124 })),
      dialog: { x: 295, y: 288, w: 370, h: 30, lines: 1 },
      bar: { horizontal: true, y: 250 },
      counter: [480, 278, 'middle'],
      gapLabel: j => [xs[j] + 198 + 20, 386],
      note: (c, j) => [c.x + c.w / 2, 476, 'middle'],
      arrow: { y: 490 },
      label: [480, 514], detail: [[480, 534]],
      // Leaders meet cards 2 and 3 near their outer corners, clear of the dialog.
      leaderX: (c, j) => (j === 1 ? c.x + 38 : j === 2 ? c.x + c.w - 38 : c.x + c.w / 2),
    };
  }
  const ys = [104, 236, 368, 500];
  return {
    cards: ys.map(y => ({ x: 16, y, w: 302, h: 104 })),
    dialog: { x: 10, y: 14, w: 312, h: 52, lines: 2 },
    bar: { horizontal: false, x: 352 },
    counter: [322, 90, 'end'],
    gapLabel: j => [167, ys[j] + 104 + 19],
    note: (c, j) => [c.x + c.w - 10, c.y + 97, 'end'],
    arrow: { x: 8 },
    label: [180, 638], detail: [[180, 658], [180, 674]],
  };
}

export function createRevealScene() {
  let R, G, C, f2, nodes;
  const KEY = new Set([18, 17, 11, 12]);

  return {
    id: 'reveal',
    title: 'The reveal',
    duration: 13.5,
    mount(stage, ctx) {
      G = ctx.G;
      f2 = ctx.data.figure2;
      C = cardGeometry(G.layout);
      R = buildRows(stage, ctx);
      settleRows(R);
      const narrow = G.layout === 'narrow';
      const top = el(stage, 'g', { class: 'h-reveal' });
      nodes = { cards: [], leaders: [], gaps: [], ticks: [] };

      // Pulse rings on the opening and closing events.
      const ring = (k) => {
        const [x, y] = G.tell(R.events.get(k).told);
        return el(top, 'rect', { class: `h-open-head r-${k === 18 ? 'consequence' : 'explanation'}`, x: x - 9, y: y - 9, width: 18, height: 18, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, visibility: 'hidden' });
      };
      nodes.ringOpen = ring(18);
      nodes.ringClose = ring(12);

      // Leaders from told positions to cards, drawn under the dialog.
      const leaders = el(top, 'g');
      f2.cards.forEach((card, j) => {
        const c = C.cards[j];
        const [tx, ty] = G.tell(card.told);
        const from = narrow ? [tx - 8, ty] : [tx, G.tellLabel(card.told)[1] + 6];
        const to = narrow ? [c.x + c.w, c.y + c.h / 2] : [C.leaderX(c, j), c.y];
        nodes.leaders.push(el(leaders, 'line', { class: 'h-leader', x1: from[0], y1: from[1], x2: to[0], y2: to[1], visibility: 'hidden' }));
      });

      // Question-open bar along the telling.
      const qRole = el(top, 'g', { class: 'r-consequence' });
      const first = G.tell(1), last = G.tell(f2.n);
      if (C.bar.horizontal) {
        nodes.bar = el(qRole, 'rect', { class: 'h-open-bar', x: first[0], y: C.bar.y, width: 0, height: 6 });
        nodes.barHead = el(qRole, 'rect', { class: 'h-open-head', x: first[0], y: C.bar.y - 2, width: 4, height: 10 });
        for (let i = 2; i < f2.n; i++) {
          const [x] = G.tell(i);
          nodes.ticks.push(el(qRole, 'rect', { class: 'h-tick', x: x - 2, y: C.bar.y + 10, width: 4, height: 4, visibility: 'hidden' }));
        }
      } else {
        nodes.bar = el(qRole, 'rect', { class: 'h-open-bar', x: C.bar.x, y: first[1], width: 6, height: 0 });
        nodes.barHead = el(qRole, 'rect', { class: 'h-open-head', x: C.bar.x - 2, y: first[1], width: 10, height: 4 });
        for (let i = 2; i < f2.n; i++) {
          const [, y] = G.tell(i);
          nodes.ticks.push(el(qRole, 'rect', { class: 'h-tick', x: C.bar.x - 18, y: y - 2, width: 4, height: 4, visibility: 'hidden' }));
        }
      }
      const [cx, cy, anchor] = C.counter;
      nodes.counter = el(top, 'text', { x: cx, y: cy, class: 'h-muted', 'font-size': 13, 'text-anchor': anchor });

      // Dialog box with the reader question.
      const d = C.dialog;
      nodes.dialog = el(top, 'g', { visibility: 'hidden' });
      el(nodes.dialog, 'rect', { class: 'h-dialog', x: d.x, y: d.y, width: d.w, height: d.h });
      el(nodes.dialog, 'rect', { class: 'h-window-inner', x: d.x + 3, y: d.y + 3, width: d.w - 6, height: d.h - 6 });
      el(nodes.dialog, 'rect', { class: 'h-strip-role r-consequence', x: d.x + 2, y: d.y + 2, width: 5, height: d.h - 4 });
      const full = `${f2.question.text}`;
      const lines = d.lines === 1 ? [full] : ['why is Martin certain', 'Roy is the target?'];
      nodes.qLines = lines.map((line, i) => {
        const y = d.y + 20 + i * 20;
        const parts = i === 0 ? [{ base: 'q', sub: '1' }, ': '] : [];
        const t = richText(nodes.dialog, parts, d.x + 16, y, { class: 'h-dialog-text', 'font-size': narrow ? 14 : 13 }, narrow ? 14 : 13);
        const typed = el(t, 'tspan', {}, '');
        return { typed, line };
      });
      nodes.caret = el(nodes.dialog, 'rect', { class: 'h-caret', x: 0, y: 0, width: 7, height: 12 });

      // Cards.
      f2.cards.forEach((card, j) => {
        const c = C.cards[j];
        const role = card.event === 18 ? 'consequence' : card.event === 12 ? 'explanation' : card.event === 17 ? 'clue' : 'other';
        const g = el(top, 'g', { class: `r-${role}`, visibility: 'hidden' });
        windowFrame(g, c.x, c.y, c.w, c.h, 20);
        el(g, 'rect', { class: 'h-strip-role', x: c.x, y: c.y, width: c.w, height: 4 });
        subLabel(g, 'e', card.event, c.x + 10, c.y + 16, { class: 'h-role-text h-pixel', 'font-size': 15 }, 15);
        el(g, 'text', { x: c.x + c.w - 10, y: c.y + 17, class: 'h-muted', 'font-size': 12, 'text-anchor': 'end' }, `told ${pad2(card.told)}`);
        if (narrow) {
          sprite(g, card.event, c.x + 32, c.y + 58, 32);
          el(g, 'text', { x: c.x + 60, y: c.y + 44, class: 'h-card-title' }, card.title);
          card.lines.forEach((line, i) => el(g, 'text', { x: c.x + 60, y: c.y + 61 + i * 14, class: 'h-card-sub' }, line));
        } else {
          sprite(g, card.event, c.x + c.w / 2, c.y + 48, 36);
          el(g, 'text', { x: c.x + c.w / 2, y: c.y + 85, class: 'h-card-title', 'text-anchor': 'middle' }, card.title);
          card.lines.forEach((line, i) => el(g, 'text', { x: c.x + c.w / 2, y: c.y + 100 + i * 13, class: 'h-card-sub', 'text-anchor': 'middle' }, line));
        }
        nodes.cards.push(g);
      });
      f2.gaps.forEach((gap, j) => {
        const [x, y] = C.gapLabel(j);
        const g = el(top, 'g', { visibility: 'hidden' });
        if (narrow) {
          el(g, 'text', { x, y: y + 4, class: 'h-gap', 'text-anchor': 'middle' }, `… +${gap} …`);
        } else {
          el(g, 'text', { x, y, class: 'h-gap', 'text-anchor': 'middle' }, '…');
          el(g, 'text', { x, y: y + 22, class: 'h-gap', 'text-anchor': 'middle' }, `+${gap}`);
        }
        nodes.gaps.push(g);
      });

      // raises q1 / resolves q1.
      nodes.notes = f2.cards.map((card, j) => {
        if (!card.note) return null;
        const [x, y, anchor] = C.note(C.cards[j], j);
        const role = card.event === 18 ? 'consequence' : 'explanation';
        const [word] = card.note.split(' ');
        const g = el(top, 'g', { class: `r-${role}`, visibility: 'hidden' });
        richText(g, [`${word} `, { base: 'q', sub: '1' }], x, y, { class: 'h-role-text', 'font-size': 13, 'text-anchor': anchor }, 13);
        return g;
      }).filter(Boolean);

      // REVEALS arrow from the explanation's card to the consequence's card.
      const a = el(top, 'g', { class: 'r-explanation' });
      const c1 = C.cards[0], c4 = C.cards[3];
      if (narrow) {
        nodes.arrowGeom = { from: c4.y + c4.h / 2, to: c1.y + c1.h / 2, x: C.arrow.x };
        nodes.arrowLine = el(a, 'line', { class: 'h-arrow', x1: C.arrow.x, x2: C.arrow.x, y1: nodes.arrowGeom.from, y2: nodes.arrowGeom.from });
        nodes.arrowTicks = [
          el(a, 'line', { class: 'h-arrow', x1: C.arrow.x, x2: c1.x, y1: nodes.arrowGeom.to, y2: nodes.arrowGeom.to, visibility: 'hidden' }),
          el(a, 'line', { class: 'h-arrow', x1: C.arrow.x, x2: c4.x, y1: nodes.arrowGeom.from, y2: nodes.arrowGeom.from, visibility: 'hidden' }),
        ];
        nodes.arrowHead = arrowHead(a, C.arrow.x, nodes.arrowGeom.to, 'up', 7);
      } else {
        const y = C.arrow.y;
        nodes.arrowGeom = { from: c4.x + c4.w / 2, to: c1.x + c1.w / 2, y };
        nodes.arrowLine = el(a, 'line', { class: 'h-arrow', x1: nodes.arrowGeom.from, x2: nodes.arrowGeom.from, y1: y, y2: y });
        nodes.arrowTicks = [
          el(a, 'line', { class: 'h-arrow', x1: nodes.arrowGeom.to, x2: nodes.arrowGeom.to, y1: y - 8, y2: y, visibility: 'hidden' }),
          el(a, 'line', { class: 'h-arrow', x1: nodes.arrowGeom.from, x2: nodes.arrowGeom.from, y1: y - 8, y2: y, visibility: 'hidden' }),
        ];
        nodes.arrowHead = arrowHead(a, nodes.arrowGeom.to, y, 'left', 8);
      }
      nodes.label = el(a, 'g', { visibility: 'hidden' });
      richText(nodes.label, ['REVEALS: ', { base: 'e', sub: '12' }, ' explains ', { base: 'e', sub: '18' }], C.label[0], C.label[1], { class: 'h-role-text h-pixel', 'font-size': 17, 'text-anchor': 'middle' }, 17);
      const detail = narrow ? ['Earlier in chronology (12 < 18);', 'later in the telling (18 > 1).'] : [f2.reveals.detail];
      nodes.detail = el(top, 'g', { visibility: 'hidden' });
      detail.forEach((line, i) => el(nodes.detail, 'text', { x: C.detail[i][0], y: C.detail[i][1], class: 'h-muted', 'font-size': 12.5, 'text-anchor': 'middle' }, line));
      nodes.narrow = narrow;
    },
    update(t) {
      const narrow = nodes.narrow;
      // The rows step in, then background events step back; the four card events stay lit.
      const appear = pop(t, 0, 0.4);
      const dim = stepped(prog(t, 0.4, 0.6), 3);
      R.chrome.setAttribute('opacity', narrow ? appear * (1 - dim) : appear);
      R.rows.setAttribute('opacity', appear);
      R.curves.setAttribute('opacity', appear);
      for (const e of R.events.values()) {
        const keep = KEY.has(e.k);
        if (narrow) {
          e.chrono.setAttribute('opacity', 1 - dim);
          e.curveWrap.setAttribute('opacity', 1 - dim);
          e.tell.setAttribute('transform', `translate(${snap(lerp(0, 62, dim))} 0)`);
          for (const child of e.tell.children) if (child.tagName !== 'circle') child.setAttribute('opacity', 1 - dim);
          e.tell.setAttribute('opacity', keep ? 1 : lerp(1, 0.55, dim));
        } else {
          const o = keep ? 1 : lerp(1, 0.4, dim);
          e.chrono.setAttribute('opacity', o);
          e.tell.setAttribute('opacity', o);
          e.curveWrap.setAttribute('opacity', keep ? 1 : lerp(1, 0.5, dim));
        }
      }
      const shift = narrow ? 62 : 0;
      const pulse = (node, start) => {
        const p = prog(t, start, 1.2);
        const on = p > 0 && p < 1 && Math.floor(p * 6) % 2 === 0;
        node.setAttribute('visibility', on ? 'visible' : 'hidden');
        node.setAttribute('transform', `translate(${shift} 0)`);
      };
      pulse(nodes.ringOpen, 0.4);

      // Dialog types out q1.
      nodes.dialog.setAttribute('visibility', t >= 1.0 ? 'visible' : 'hidden');
      const total = nodes.qLines.reduce((s, l) => s + l.line.length, 0);
      let chars = Math.floor(prog(t, 1.3, 2.1) * total);
      let caretAt = null;
      nodes.qLines.forEach(l => {
        const take = Math.max(0, Math.min(l.line.length, chars));
        l.typed.textContent = l.line.slice(0, take);
        chars -= take;
        if (take > 0 || caretAt === null) caretAt = l;
      });
      const typing = t < 3.4;
      const blink = Math.floor(t * 3) % 2 === 0;
      nodes.caret.setAttribute('visibility', t >= 1.0 && (typing || blink) && t < 4.2 ? 'visible' : 'hidden');
      if (caretAt) {
        try {
          const bb = caretAt.typed.parentNode.getBBox();
          set(nodes.caret, { x: snap(bb.x + bb.width + 3), y: bb.y + 3 });
        } catch (_) { /* not rendered yet */ }
      }

      // The question stays open along the telling.
      const pb = ease(prog(t, 3.6, 4.0));
      const first = G.tell(1), last = G.tell(R.n);
      let passed = 0;
      if (C.bar.horizontal) {
        const head = snap(lerp(first[0], last[0], pb));
        set(nodes.bar, { width: Math.max(0, head - first[0]) });
        set(nodes.barHead, { x: head - 2 });
        nodes.ticks.forEach((tick, i) => { const on = head >= G.tell(i + 2)[0]; tick.setAttribute('visibility', on ? 'visible' : 'hidden'); if (on) passed++; });
      } else {
        const head = snap(lerp(first[1], last[1], pb));
        set(nodes.bar, { height: Math.max(0, head - first[1]) });
        set(nodes.barHead, { y: head - 2 });
        nodes.ticks.forEach((tick, i) => { const on = head >= G.tell(i + 2)[1]; tick.setAttribute('visibility', on ? 'visible' : 'hidden'); if (on) passed++; });
      }
      nodes.bar.parentNode.setAttribute('visibility', t >= 3.6 ? 'visible' : 'hidden');
      nodes.counter.textContent = t < 3.6 ? '' : pb >= 1 ? f2.interveningLabel : `${passed} intervening event${passed === 1 ? '' : 's'}`;
      pulse(nodes.ringClose, 7.6);

      // Cards, leaders and gap counts.
      nodes.cards.forEach((card, j) => {
        const a = pop(t, 8.0 + j * 0.45);
        card.setAttribute('visibility', a > 0 ? 'visible' : 'hidden');
        card.setAttribute('opacity', a);
        nodes.leaders[j].setAttribute('visibility', a >= 1 ? 'visible' : 'hidden');
        nodes.leaders[j].setAttribute('transform', `translate(${shift} 0)`);
      });
      if (narrow) nodes.leaders.forEach((l, j) => { l.setAttribute('transform', ''); set(l, { x1: G.tell(f2.cards[j].told)[0] + shift - 16 }); });
      nodes.gaps.forEach(g => g.setAttribute('visibility', t >= 9.9 ? 'visible' : 'hidden'));
      nodes.notes.forEach((g, i) => g.setAttribute('visibility', t >= 10.1 + i * 0.2 ? 'visible' : 'hidden'));

      // REVEALS: explanation → consequence.
      const pa = ease(prog(t, 10.6, 1.0));
      const A = nodes.arrowGeom;
      if (narrow) set(nodes.arrowLine, { y2: snap(lerp(A.from, A.to, pa)) });
      else set(nodes.arrowLine, { x2: snap(lerp(A.from, A.to, pa)) });
      nodes.arrowLine.setAttribute('visibility', pa > 0 ? 'visible' : 'hidden');
      nodes.arrowTicks.forEach(tk => tk.setAttribute('visibility', pa > 0 ? 'visible' : 'hidden'));
      nodes.arrowHead.setAttribute('visibility', pa >= 1 ? 'visible' : 'hidden');
      nodes.label.setAttribute('visibility', t >= 11.7 ? 'visible' : 'hidden');
      nodes.detail.setAttribute('visibility', t >= 12.1 ? 'visible' : 'hidden');
    },
  };
}
