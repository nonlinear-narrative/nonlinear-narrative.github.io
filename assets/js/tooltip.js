// One tooltip for the whole page. Content is set with textContent only.

let tip = null;

export function initTooltip(node) {
  tip = node;
}

function fill({ title, value, lines = [] }) {
  tip.replaceChildren();
  if (value !== undefined) {
    const strong = document.createElement('strong');
    strong.textContent = value;
    tip.appendChild(strong);
  }
  if (title) {
    const head = document.createElement(value !== undefined ? 'span' : 'strong');
    head.textContent = title;
    tip.appendChild(head);
  }
  for (const line of lines) {
    const div = document.createElement('div');
    div.textContent = line;
    tip.appendChild(div);
  }
}

export function showTip(content, x, y) {
  if (!tip) return;
  fill(content);
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  const pad = 8;
  let left = x + 14;
  let top = y - r.height - 14;
  if (left + r.width > window.innerWidth - pad) left = x - r.width - 14;
  if (left < pad) left = pad;
  if (top < pad) top = y + 18;
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

export function showTipFor(target, content) {
  const r = target.getBoundingClientRect();
  showTip(content, r.left + r.width / 2, r.top);
}

export function moveTip(x, y, content) {
  if (tip && !tip.hidden) showTip(content, x, y);
}

export function hideTip() {
  if (tip) tip.hidden = true;
}
