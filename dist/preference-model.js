/**
 * Pairwise preference learning with a Gaussian process (Chu & Ghahramani, ICML 2005).
 *
 * The listener only ever answers "which of these two felt calmer?". A latent comfort
 * function f(x) over the 4-D sound space gets a GP prior; each answer adds a probit
 * likelihood  P(a preferred to b) = Φ((f(a) − f(b)) / (√2 σ)). The posterior mode is found
 * with Newton's method (Laplace approximation). The next comparison pits the current
 * favourite against the point with the highest expected improvement.
 *
 * This describes one person's stated comfort. It is not a model of pain or treatment.
 */
import { rng } from './comfort-engine.js';

const SQRT2 = Math.SQRT2;
/** Size caps keep fitting fast (it is cubic in the number of points). */
export const MAX_POINTS = 60, MAX_COMPARISONS = 120;

export function normPdf(z) { return Math.exp(-.5 * z * z) / Math.sqrt(2 * Math.PI); }

/**
 * Standard normal CDF via erfc (Abramowitz–Stegun 7.1.26). The lower tail is computed
 * directly from erfc, avoiding the 1 − (1 − x) cancellation far below zero.
 */
export function normCdf(z) {
  const t = 1 / (1 + .3275911 * Math.abs(z) / SQRT2);
  const erfc = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? 1 - .5 * erfc : .5 * erfc;
}

/** Numerically safe φ(z)/Φ(z) (inverse Mills ratio), including far negative z. */
function millsRatio(z) {
  if (z < -5) return -z + 1 / -z - 2 / (-z) ** 3;
  return normPdf(z) / Math.max(normCdf(z), 1e-300);
}

/** Solve A X = B for square A (n×n) and B (n×m), by Gaussian elimination with partial pivoting. */
export function solve(A, B) {
  const n = A.length, m = B[0].length;
  const a = A.map(row => Float64Array.from(row));
  const b = B.map(row => Float64Array.from(row));
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    [a[col], a[pivot]] = [a[pivot], a[col]]; [b[col], b[pivot]] = [b[pivot], b[col]];
    const d = a[col][col] || 1e-12;
    for (let r = col + 1; r < n; r++) {
      const factor = a[r][col] / d;
      if (!factor) continue;
      for (let c = col; c < n; c++) a[r][c] -= factor * a[col][c];
      for (let c = 0; c < m; c++) b[r][c] -= factor * b[col][c];
    }
  }
  const x = Array.from({ length: n }, () => new Float64Array(m));
  for (let r = n - 1; r >= 0; r--) {
    for (let c = 0; c < m; c++) {
      let s = b[r][c];
      for (let k = r + 1; k < n; k++) s -= a[r][k] * x[k][c];
      x[r][c] = s / (a[r][r] || 1e-12);
    }
  }
  return x;
}

const distance = (p, q) => Math.sqrt(p.reduce((s, v, i) => s + (v - q[i]) ** 2, 0));

export class PreferenceGP {
  constructor({ dims = 4, lengthscale = .3, signal = 1, noise = .5 } = {}) {
    Object.assign(this, { dims, lengthscale, signal, noise });
    this.points = [];
    this.comparisons = [];
    this.f = [];
    this.dirty = true;
  }

  kernel(p, q) {
    let d2 = 0;
    for (let i = 0; i < this.dims; i++) d2 += (p[i] - q[i]) ** 2;
    return this.signal * Math.exp(-.5 * d2 / (this.lengthscale ** 2));
  }

  /** Add (or find) a point; returns its index. Points closer than 1e-6 are merged. */
  addPoint(x) {
    const point = x.map(v => Math.min(1, Math.max(0, Number(v))));
    const found = this.points.findIndex(p => distance(p, point) < 1e-6);
    if (found >= 0) return found;
    this.points.push(point); this.dirty = true;
    return this.points.length - 1;
  }

  /** Record that `winner` felt calmer than `loser` (points or indices). */
  addComparison(winner, loser, weight = 1) {
    const w = Array.isArray(winner) ? this.addPoint(winner) : winner;
    const l = Array.isArray(loser) ? this.addPoint(loser) : loser;
    if (w === l) return;
    this.comparisons.push({ w, l, weight }); this.dirty = true;
  }

  fit() {
    if (!this.dirty) return this;
    const n = this.points.length;
    if (!n) { this.f = []; this.dirty = false; return this; }
    const K = this.points.map(p => this.points.map(q => this.kernel(p, q)));
    for (let i = 0; i < n; i++) K[i][i] += 1e-6;
    const s = SQRT2 * this.noise;
    let f = new Float64Array(n);
    let W, g;
    for (let iter = 0; iter < 40; iter++) {
      W = Array.from({ length: n }, () => new Float64Array(n));
      g = new Float64Array(n);
      for (const { w, l, weight } of this.comparisons) {
        const z = (f[w] - f[l]) / s;
        const r = millsRatio(z);
        const grad = weight * r / s;
        const hess = weight * r * (z + r) / (s * s);
        g[w] += grad; g[l] -= grad;
        W[w][w] += hess; W[l][l] += hess; W[w][l] -= hess; W[l][w] -= hess;
      }
      // f_new = (I + K W)^-1 K (W f + g)
      const IKW = K.map((row, i) => Float64Array.from({ length: n }, (_, j) => (i === j ? 1 : 0) + row.reduce((acc, kv, m) => acc + kv * W[m][j], 0)));
      const rhs = K.map(row => [row.reduce((acc, kv, m) => acc + kv * (W[m].reduce((a2, wv, j) => a2 + wv * f[j], 0) + g[m]), 0)]);
      const next = solve(IKW, rhs).map(r => r[0]);
      let change = 0;
      for (let i = 0; i < n; i++) { change = Math.max(change, Math.abs(next[i] - f[i])); f[i] = next[i]; }
      if (change < 1e-6) break;
    }
    this.f = Array.from(f);
    this.K = K; this.W = W;
    // Gradient at the mode equals K^-1 f; keep it for predictive means.
    this.alpha = Array.from(solve(K, this.f.map(v => [v])), r => r[0]);
    // (I + W K)^-1 W, used for predictive variance.
    const IWK = W.map((row, i) => Float64Array.from({ length: n }, (_, j) => (i === j ? 1 : 0) + row.reduce((acc, wv, m) => acc + wv * K[m][j], 0)));
    this.varMatrix = solve(IWK, W.map(r => Array.from(r)));
    this.dirty = false;
    return this;
  }

  predict(x) {
    this.fit();
    const n = this.points.length;
    if (!n) return { mean: 0, sd: Math.sqrt(this.signal) };
    const k = this.points.map(p => this.kernel(p, x));
    let mean = 0;
    for (let i = 0; i < n; i++) mean += k[i] * this.alpha[i];
    let quad = 0;
    for (let i = 0; i < n; i++) {
      let row = 0;
      for (let j = 0; j < n; j++) row += this.varMatrix[i][j] * k[j];
      quad += k[i] * row;
    }
    return { mean, sd: Math.sqrt(Math.max(1e-9, this.signal - quad)) };
  }

  /** Index of the compared point with the highest posterior mean, skipping excluded points. */
  championIndex(exclude = () => false) {
    this.fit();
    const used = new Set(this.comparisons.flatMap(c => [c.w, c.l]));
    let best = -1, bestMean = -Infinity;
    for (const i of used) if (!exclude(this.points[i]) && this.f[i] > bestMean) { best = i; bestMean = this.f[i]; }
    return best;
  }

  champion(exclude) { const i = this.championIndex(exclude); return i >= 0 ? this.points[i] : null; }

  /**
   * How many of the most recent comparisons the current champion has won in a row. Each
   * challenger is the model's most promising alternative, so a run of wins is a plain,
   * honest signal that the favourite holds up. (A GP "probability of being best" stays
   * pinned by unexplored regions and was not informative in simulation.)
   */
  streak(exclude = () => false) {
    const c = this.championIndex(exclude);
    if (c < 0) return 0;
    let run = 0;
    for (let i = this.comparisons.length - 1; i >= 0; i--) {
      const { w, l } = this.comparisons[i];
      if (w === c) run++;
      else if (l === c || !exclude(this.points[w])) break;
    }
    return run;
  }

  /**
   * Choose the next sound to compare with the champion: maximize expected improvement
   * over a random pool plus local perturbations of the champion, at least `minDistance` away.
   * Before any data, contrast the starting point along darkness and top end instead.
   */
  nextChallenger({ seed = 1, pool = 384, minDistance = .18, exclude = () => false, start = null } = {}) {
    const random = rng(seed);
    const champ = this.champion(exclude) || start;
    if (!this.comparisons.length && champ) {
      const flip = v => (v < .5 ? Math.min(1, v + .3) : Math.max(0, v - .3));
      const first = [flip(champ[0]), Math.min(1, Math.max(0, champ[1] + (champ[1] < .5 ? .25 : -.25))), champ[2], flip(champ[3])];
      if (!exclude(first)) return first;
    }
    const best = champ ? this.predict(champ).mean : 0;
    const candidates = [];
    for (let i = 0; i < pool; i++) candidates.push(Array.from({ length: this.dims }, () => random()));
    if (champ) for (let i = 0; i < pool / 3; i++) candidates.push(champ.map(v => Math.min(1, Math.max(0, v + .2 * random.gauss()))));
    let pick = null, pickScore = -Infinity;
    for (const x of candidates) {
      if (exclude(x)) continue;
      if (champ && distance(x, champ) < minDistance) continue;
      const { mean, sd } = this.predict(x);
      const z = (mean - best) / sd;
      const ei = (mean - best) * normCdf(z) + sd * normPdf(z);
      if (ei > pickScore) { pickScore = ei; pick = x; }
    }
    return pick || candidates[0];
  }

  toJSON() { return { points: this.points, comparisons: this.comparisons, lengthscale: this.lengthscale, noise: this.noise }; }

  /** Rebuild from saved data. Hyperparameters are bounded; invalid points drop their comparisons; size is capped. */
  static fromJSON(data, options = {}) {
    const bounded = (v, lo, hi, fallback) => (Number.isFinite(v) && v >= lo && v <= hi ? v : fallback);
    const model = new PreferenceGP({
      ...options,
      lengthscale: bounded(data?.lengthscale, .05, 2, options.lengthscale ?? .3),
      noise: bounded(data?.noise, .05, 3, options.noise ?? .5),
    });
    const remap = new Map();
    (Array.isArray(data?.points) ? data.points : []).forEach((p, i) => {
      if (model.points.length >= MAX_POINTS) return;
      if (Array.isArray(p) && p.length === model.dims && p.every(Number.isFinite)) {
        remap.set(i, model.points.length);
        model.points.push(p.map(v => Math.min(1, Math.max(0, v))));
      }
    });
    for (const c of Array.isArray(data?.comparisons) ? data.comparisons : []) {
      if (model.comparisons.length >= MAX_COMPARISONS) break;
      const w = remap.get(c?.w), l = remap.get(c?.l);
      if (w === undefined || l === undefined || w === l) continue;
      model.comparisons.push({ w, l, weight: bounded(c.weight, .1, 3, 1) });
    }
    return model;
  }
}

/**
 * Starting point from the short sensitivity questions (each answer 0–4; higher = more bothered).
 * Pure heuristics to pick a gentle first sound; the comparisons take over from there.
 */
export function startingPoint(answers = {}) {
  const v = key => Math.min(4, Math.max(0, Number(answers[key]) || 0)) / 4;
  const high = v('high'), low = v('low'), pulse = v('pulse');
  return [
    Math.min(.85, Math.max(.15, .5 - .35 * high + .3 * low)),   // tilt: darker if hiss bothers, brighter if rumble bothers
    .35 * (1 - low),                                              // texture: less hum if low sounds bother
    .15 * (1 - pulse),                                            // swell: at most ~1 dB to start; steady if pulsing bothers
    Math.min(.8, Math.max(.1, .5 - .35 * high)),                  // top end: softer if hiss bothers
  ];
}
