// Number formatting shared by the page and tools/check-data.mjs, so a value
// printed in index.html can be checked against assets/data/paper.json.

export const MINUS = '−';

function signed(text, value, plus) {
  if (value < 0) return MINUS + text.replace('-', '');
  return plus && value > 0 ? '+' + text : text;
}

// Formats: d1/d2/d3 decimals, s2/s3 signed decimals, p0/p1 percent of a share,
// int with thousands separators, raw as-is.
export function fmt(value, format = 'raw') {
  if (value === null || value === undefined) return '—';
  if (typeof value !== 'number') return String(value);
  const m = /^([dsp])(\d)$/.exec(format);
  if (m) {
    const [, kind, digits] = m;
    if (kind === 'p') return signed((value * 100).toFixed(+digits), value, false) + '%';
    const text = value.toFixed(+digits);
    return signed(text, value, kind === 's');
  }
  if (format === 'int') return value.toLocaleString('en-US');
  return String(value);
}

// Resolves "a.b.0.c" against an object.
export function lookup(data, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), data);
}
