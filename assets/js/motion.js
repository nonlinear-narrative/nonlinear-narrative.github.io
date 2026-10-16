// One switch for all motion on the page. By default it follows the system's
// reduced-motion preference; an explicit Play (the overview's button or the
// header's motion toggle) enables motion for this page visit, and the header's
// toggle can also hold every animation still, which the page remembers.
const media = window.matchMedia('(prefers-reduced-motion: reduce)');
const STORE = 'nonlinear-motion';
const listeners = new Set();
let enabled = false;            // Play chosen over a reduced-motion system preference
let held = false;               // the reader held all motion from the header
try { held = localStorage.getItem(STORE) === 'held'; } catch (_) { /* storage unavailable */ }

const notify = () => listeners.forEach(listener => listener());
function remember(value) {
  try {
    if (value) localStorage.setItem(STORE, 'held');
    else localStorage.removeItem(STORE);
  } catch (_) { /* storage unavailable */ }
}

export const motionPreference = {
  get reduced() { return held || (media.matches && !enabled); },
  get held() { return held; },
  // Play: start motion now, whatever held it.
  enable() {
    const was = this.reduced;
    if (held) { held = false; remember(false); }
    if (media.matches) enabled = true;
    if (was !== this.reduced) notify();
  },
  // Hold every animation still (the header's toggle), until Play.
  hold() {
    if (held) return;
    held = true;
    remember(true);
    notify();
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

// An explicit system preference change takes precedence over the page opt-in.
media.addEventListener('change', () => {
  enabled = false;
  notify();
});
