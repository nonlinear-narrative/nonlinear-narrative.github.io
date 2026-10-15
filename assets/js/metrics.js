// Order metrics from the paper's formal appendix (§D).
// A telling is a permutation: order[i] is the chronological rank of the event
// told at position i + 1, so chronology is [1, 2, ..., n].
// Pure functions with no DOM access, shared by the page and tools/check-data.mjs.

export function isPermutation(order) {
  const n = order.length;
  const seen = new Set(order);
  return seen.size === n && order.every(r => Number.isInteger(r) && r >= 1 && r <= n);
}

// D(σ): told-position pairs i < j with σ(i) > σ(j).
export function discordantPairs(order) {
  let d = 0;
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) if (order[i] > order[j]) d++;
  }
  return d;
}

// τ(σ) = 1 − 2 D(σ) / C(n, 2): +1 is chronology, −1 the exact reversal.
export function kendallTau(order) {
  const n = order.length;
  const pairs = (n * (n - 1)) / 2;
  return 1 - (2 * discordantPairs(order)) / pairs;
}

// Told positions (0-based) of one longest increasing subsequence. Its events
// need not be adjacent in the telling.
export function lisIndices(order) {
  const tails = [];   // index into order of the smallest tail for each length
  const prev = new Array(order.length).fill(-1);
  order.forEach((value, i) => {
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (order[tails[mid]] < value) lo = mid + 1; else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  });
  const out = [];
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) out.push(i);
  return out.reverse();
}

// LIS(σ) = ℓ(σ) / n.
export function lis(order) {
  return order.length ? lisIndices(order).length / order.length : 0;
}

// Position i < n is a hop when σ(i + 1) ≠ σ(i) + 1. Returns 0-based positions.
export function hopPositions(order) {
  const out = [];
  for (let i = 0; i + 1 < order.length; i++) if (order[i + 1] !== order[i] + 1) out.push(i);
  return out;
}

export function hops(order) {
  return hopPositions(order).length;
}

// Maximal hop-free stretches, as arrays of chronological ranks.
export function runs(order) {
  const out = [];
  let current = [];
  order.forEach((rank, i) => {
    if (i > 0 && rank !== order[i - 1] + 1) { out.push(current); current = []; }
    current.push(rank);
  });
  if (current.length) out.push(current);
  return out;
}

export function inverse(order) {
  const inv = new Array(order.length);
  order.forEach((rank, i) => { inv[rank - 1] = i + 1; });
  return inv;
}

// (a ∘ b)(i) = a(b(i)).
export function compose(a, b) {
  return b.map(r => a[r - 1]);
}

// Agreement of a model order with the gold telling: τ((σ*)⁻¹ ∘ σ̂).
export function agreement(gold, model) {
  return kendallTau(compose(inverse(gold), model));
}

// Band hit: both τ and LIS inside the min–max range of the gold tellings.
export function bandHit(tau, lisValue, band) {
  return tau >= band.tau[0] && tau <= band.tau[1] && lisValue >= band.lis[0] && lisValue <= band.lis[1];
}

export function summarize(order) {
  return {
    n: order.length,
    tau: kendallTau(order),
    discordant: discordantPairs(order),
    pairs: (order.length * (order.length - 1)) / 2,
    lis: lis(order),
    lisLength: lisIndices(order).length,
    hops: hops(order),
  };
}
