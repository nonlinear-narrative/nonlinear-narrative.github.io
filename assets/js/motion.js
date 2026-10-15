// Respect the system preference by default, while allowing an explicit Play
// action to enable the narrative animations for this page visit.
const media = window.matchMedia('(prefers-reduced-motion: reduce)');
const listeners = new Set();
let enabled = false;

const notify = () => listeners.forEach(listener => listener());

export const motionPreference = {
  get reduced() { return media.matches && !enabled; },
  enable() {
    if (!media.matches || enabled) return;
    enabled = true;
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
