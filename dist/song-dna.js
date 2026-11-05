/**
 * Song DNA: full-length music analysis that runs identically in the browser and in Node.
 *
 * Input: stereo (or mono) PCM at ~22.05 kHz. Output: descriptive features — tuning, key and
 * mode, chords and progressions, tempo, spectral balance, loudness and dynamics, stereo image,
 * repetition and scale-degree usage. These describe the recording. They do not measure the
 * listener, and no feature here is a "healing frequency".
 */
import { fft } from './audio-engine.js';

const TAU = 2 * Math.PI;
export const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DEGREE_NAMES = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];

// Key profiles. Krumhansl & Kessler (1982) probe-tone ratings; widely used, imperfect for modal music.
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export const ANALYSIS = { fftSize: 4096, hop: 1024, chordFrames: 8, minHz: 98, maxHz: 2100 };

const mean = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const median = a => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
export const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y); if (!s.length) return NaN; const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); };
function pearson(a, b) {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}
const rotate = (arr, k) => arr.map((_, i) => arr[(i - k + 12) % 12]);

/* ---------------- Loudness (ITU-R BS.1770 K-weighting, approximate) ---------------- */
function biquad(x, b, a) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
/** K-weighting filter coefficients for any sample rate (high shelf + high pass, BS.1770 prototypes). */
function kWeightingCoefficients(rate) {
  // Stage 1: high shelf. Analog prototype values as in pyloudnorm.
  let G = 3.99984385397, Q = 0.7071752369554193, fc = 1681.9744509555319;
  let K = Math.tan(Math.PI * fc / rate), Vh = 10 ** (G / 20), Vb = Vh ** 0.499666774155;
  let a0 = 1 + K / Q + K * K;
  const shelf = { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
  // Stage 2: high pass.
  Q = 0.5003270373253953; fc = 38.13547087613982; K = Math.tan(Math.PI * fc / rate);
  a0 = 1 + K / Q + K * K;
  const hp = { b: [1, -2, 1], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
  return [shelf, hp];
}
export function loudness(channels, rate) {
  const filters = kWeightingCoefficients(rate);
  const weighted = channels.map(ch => filters.reduce((sig, f) => biquad(sig, f.b, f.a), Float64Array.from(ch)));
  const blockPower = (start, size) => {
    let sum = 0;
    for (const w of weighted) for (let i = start; i < start + size; i++) sum += w[i] * w[i];
    return sum / size;
  };
  const toLufs = p => -0.691 + 10 * Math.log10(Math.max(p, 1e-12));
  const n = weighted[0].length;
  // Momentary 400 ms blocks, 75% overlap → integrated loudness with absolute and relative gating.
  const size400 = Math.round(.4 * rate), step = Math.round(.1 * rate);
  const blocks = [];
  for (let s = 0; s + size400 <= n; s += step) blocks.push(blockPower(s, size400));
  const abs = blocks.filter(p => toLufs(p) > -70);
  const relGate = toLufs(mean(abs)) - 10;
  const gated = abs.filter(p => toLufs(p) > relGate);
  const integrated = gated.length ? toLufs(mean(gated)) : -70;
  // Short-term 3 s loudness → loudness range (EBU Tech 3342: 10th–95th percentile, −20 LU gate).
  const size3 = Math.round(3 * rate), step3 = Math.round(rate);
  const short = [];
  for (let s = 0; s + size3 <= n; s += step3) short.push(toLufs(blockPower(s, size3)));
  const absShort = short.filter(v => v > -70);
  const gateShort = absShort.length ? toLufs(mean(absShort.map(v => 10 ** ((v + .691) / 10)))) - 20 : -70;
  const lraSet = absShort.filter(v => v > gateShort);
  const lra = lraSet.length > 2 ? quantile(lraSet, .95) - quantile(lraSet, .10) : 0;
  let peak = 0, sq = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (v > peak) peak = v; sq += ch[i] * ch[i]; }
  const rmsDb = 10 * Math.log10(Math.max(sq / (n * channels.length), 1e-12));
  const peakDb = 20 * Math.log10(Math.max(peak, 1e-9));
  return { integratedLufs: integrated, loudnessRangeLu: lra, samplePeakDbfs: peakDb, crestDb: peakDb - rmsDb, shortTermLufs: short };
}

/* ---------------- Spectral frames ---------------- */
function hann(n) { const w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = .5 - .5 * Math.cos(TAU * i / n); return w; }

/** Estimate tuning offset (cents from A440 equal temperament) from interpolated spectral peaks. */
function estimateTuning(peaks) {
  let sx = 0, sy = 0;
  for (const { hz, weight } of peaks) {
    const cents = 1200 * Math.log2(hz / 440);
    const phase = TAU * cents / 100; // circular in 100-cent units
    sx += weight * Math.cos(phase); sy += weight * Math.sin(phase);
  }
  const c = Math.atan2(sy, sx) / TAU * 100;
  const strength = Math.hypot(sx, sy) / Math.max(1e-12, peaks.reduce((s, p) => s + p.weight, 0));
  return { cents: ((c + 150) % 100) - 50, strength };
}

/**
 * Pass 1: per-frame magnitude spectra are reduced on the fly to what later stages need:
 * spectral peaks (tuning), log-magnitude bins for chroma (stored compactly), flux (tempo),
 * band energies (spectrum) and centroid.
 */
function spectralPass(mono, rate) {
  const { fftSize: N, hop } = ANALYSIS;
  const win = hann(N), bins = N / 2;
  const frames = Math.max(1, Math.floor((mono.length - N) / hop) + 1);
  const kMin = Math.ceil(ANALYSIS.minHz * N / rate), kMax = Math.min(bins - 2, Math.floor(ANALYSIS.maxHz * N / rate));
  const chromaBins = kMax - kMin + 1;
  const logMag = new Float32Array(frames * chromaBins);
  const flux = new Float32Array(frames), centroid = new Float32Array(frames), energy = new Float32Array(frames);
  const ltas = new Float64Array(bins);
  const peaks = [];
  let prev = new Float32Array(bins);
  const re = new Float64Array(N), im = new Float64Array(N);
  const peakStride = Math.max(1, Math.floor(frames / 1500)); // tuning from ≤1500 frames is plenty
  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    for (let i = 0; i < N; i++) { re[i] = (mono[off + i] || 0) * win[i]; im[i] = 0; }
    fft(re, im);
    let fl = 0, num = 0, den = 0, e = 0;
    const cur = new Float32Array(bins);
    for (let k = 1; k < bins; k++) {
      const mag = Math.hypot(re[k], im[k]);
      const lm = Math.log1p(100 * mag);
      cur[k] = lm;
      const d = lm - prev[k]; if (d > 0) fl += d;
      const p = mag * mag; ltas[k] += p; num += k * p; den += p; e += p;
    }
    for (let k = kMin; k <= kMax; k++) logMag[f * chromaBins + (k - kMin)] = cur[k];
    flux[f] = fl; centroid[f] = den > 0 ? num / den * rate / N : 0; energy[f] = e;
    if (f % peakStride === 0 && e > 0) {
      const lim = Math.min(bins - 2, Math.floor(2000 * N / rate));
      const floor = Math.max(...cur.subarray(kMin, lim)) - 2.5;
      for (let k = Math.max(2, Math.ceil(80 * N / rate)); k < lim; k++) {
        const a = cur[k - 1], b = cur[k], c = cur[k + 1];
        if (b > a && b >= c && b > floor) {
          const delta = .5 * (a - c) / (a - 2 * b + c || 1e-9);
          peaks.push({ hz: (k + Math.max(-.5, Math.min(.5, delta))) * rate / N, weight: b });
        }
      }
    }
    prev = cur;
  }
  return { frames, logMag, chromaBins, kMin, flux, centroid, energy, ltas, peaks, binHz: rate / N };
}

function quantileTyped(arr, q) {
  const s = Float32Array.from(arr).sort();
  return s[Math.floor((s.length - 1) * q)];
}

/** Chroma per frame with tuning applied, then pooled into chord windows. */
function chromaFrames(spec, tuningCents) {
  const { frames, logMag, chromaBins, kMin, binHz } = spec;
  // Pitch class and weight for each bin: cos² falloff within ±0.5 semitone of the tuned centre.
  const map = [];
  for (let j = 0; j < chromaBins; j++) {
    const hz = (kMin + j) * binHz;
    const midi = 69 + 12 * Math.log2(hz / 440) - tuningCents / 100;
    const nearest = Math.round(midi), dist = midi - nearest;
    map.push({ pc: ((nearest % 12) + 12) % 12, w: Math.cos(Math.PI * dist) ** 2 });
  }
  // Each pitch class must get the same total bin weight, or classes covered by an extra octave
  // at the range edges collect more of the broadband noise floor and bias the key.
  const pcWeight = new Float64Array(12);
  for (const m of map) pcWeight[m.pc] += m.w;
  const chroma = new Float32Array(frames * 12);
  const frame = new Float32Array(chromaBins);
  for (let f = 0; f < frames; f++) {
    const base = f * chromaBins;
    for (let j = 0; j < chromaBins; j++) frame[j] = logMag[base + j];
    // Remove this frame's noise floor (its median log magnitude) so only peaks above it vote.
    const floor = quantileTyped(frame, .5);
    for (let j = 0; j < chromaBins; j++) {
      const v = logMag[base + j] - floor;
      if (v > 0) chroma[f * 12 + map[j].pc] += v * map[j].w / pcWeight[map[j].pc];
    }
  }
  return chroma;
}

/* ---------------- Key ---------------- */
export function estimateKey(pcp) {
  const scores = [];
  for (let t = 0; t < 12; t++) {
    scores.push({ tonic: t, mode: 'major', r: pearson(pcp, rotate(KK_MAJOR, t)) });
    scores.push({ tonic: t, mode: 'minor', r: pearson(pcp, rotate(KK_MINOR, t)) });
  }
  scores.sort((a, b) => b.r - a.r);
  const [best, second] = scores;
  const relative = second.mode !== best.mode && ((best.mode === 'minor' && second.tonic === (best.tonic + 3) % 12) || (best.mode === 'major' && second.tonic === (best.tonic + 9) % 12));
  return { tonic: best.tonic, mode: best.mode, name: PITCH_NAMES[best.tonic] + (best.mode === 'minor' ? 'm' : ''), r: best.r, margin: best.r - second.r, runnerUp: PITCH_NAMES[second.tonic] + (second.mode === 'minor' ? 'm' : ''), relativeAmbiguity: relative && best.r - second.r < .05 };
}

/* ---------------- Chords (24 triads + no-chord, HMM-smoothed) ---------------- */
export const CHORDS = [];
for (let r = 0; r < 12; r++) {
  CHORDS.push({ root: r, quality: 'maj', name: PITCH_NAMES[r], pcs: [r, (r + 4) % 12, (r + 7) % 12] });
  CHORDS.push({ root: r, quality: 'min', name: PITCH_NAMES[r] + 'm', pcs: [r, (r + 3) % 12, (r + 7) % 12] });
}
const NO_CHORD = CHORDS.length; // index 24

function chordTemplates() {
  return CHORDS.map(c => {
    const t = new Float64Array(12).fill(0);
    // Root slightly emphasised, as bass and doubling make it the strongest chord tone on average.
    t[c.pcs[0]] = 1.2; t[c.pcs[1]] = 1; t[c.pcs[2]] = 1;
    const norm = Math.hypot(...t);
    return t.map(v => v / norm);
  });
}

export function recognizeChords(windows, { selfProb = .86, kappa = 18, noChordThreshold = .55 } = {}) {
  const T = chordTemplates(), S = CHORDS.length + 1, n = windows.length;
  if (!n) return [];
  const logEmit = windows.map(w => {
    const norm = Math.hypot(...w.chroma) || 1;
    const v = w.chroma.map(x => x / norm);
    const sims = T.map(t => t.reduce((s, x, i) => s + x * v[i], 0));
    const quiet = w.quietness;
    sims.push(noChordThreshold + .3 * quiet);
    return sims.map(s => kappa * s);
  });
  const logStay = Math.log(selfProb), logMove = Math.log((1 - selfProb) / (S - 1));
  let score = logEmit[0].slice();
  const back = [];
  for (let t = 1; t < n; t++) {
    const best = Math.max(...score);
    const bestIdx = score.indexOf(best);
    const next = new Array(S), ptr = new Int16Array(S);
    for (let s = 0; s < S; s++) {
      const stay = score[s] + logStay, move = best + logMove;
      if (stay >= move || bestIdx === s) { next[s] = stay + logEmit[t][s]; ptr[s] = s; }
      else { next[s] = move + logEmit[t][s]; ptr[s] = bestIdx; }
    }
    back.push(ptr); score = next;
  }
  let state = score.indexOf(Math.max(...score));
  const path = new Array(n);
  for (let t = n - 1; t >= 0; t--) { path[t] = state; if (t > 0) state = back[t - 1][state]; }
  // Merge into segments.
  const segments = [];
  for (let t = 0; t < n; t++) {
    const idx = path[t], last = segments[segments.length - 1];
    if (last && last.idx === idx) { last.end = windows[t].end; last.windows++; }
    else segments.push({ idx, start: windows[t].start, end: windows[t].end, windows: 1 });
  }
  return segments.map(s => ({ ...(s.idx === NO_CHORD ? { name: 'N', root: null, quality: null } : { name: CHORDS[s.idx].name, root: CHORDS[s.idx].root, quality: CHORDS[s.idx].quality }), start: s.start, end: s.end }));
}

export function romanNumeral(chord, tonic) {
  if (!chord || chord.root === null) return 'N';
  const deg = DEGREE_NAMES[(chord.root - tonic + 12) % 12];
  return chord.quality === 'min' ? deg.replace(/[IV]+/, m => m.toLowerCase()) : deg;
}

/**
 * Andalusian cadence, key-independent: a minor chord X followed by major chords a whole tone,
 * a minor third... precisely X → (X−2) maj → (X−4) maj → (X−5) maj, e.g. Am → G → F → E.
 * Also counts the common partial form X → (X−2) → (X−4) (Am → G → F).
 */
export function findAndalusian(segments, tonic = null) {
  const seq = segments.filter(s => s.root !== null && s.end - s.start >= .6);
  const collapsed = [];
  for (const s of seq) if (!collapsed.length || collapsed[collapsed.length - 1].name !== s.name) collapsed.push(s);
  const hits = [], partial = [];
  for (let i = 0; i + 2 < collapsed.length; i++) {
    const [a, b, c, d] = collapsed.slice(i, i + 4);
    const step = (x, y, semis, quality) => y && y.quality === quality && (x.root - y.root + 12) % 12 === semis;
    if (a.quality === 'min' && step(a, b, 2, 'maj') && step(b, c, 2, 'maj')) {
      // "In key" means the walk starts on the song's own home chord: i → ♭VII → ♭VI (→ V).
      const inKey = tonic !== null && a.root === tonic;
      if (step(c, d, 1, 'maj')) hits.push({ at: a.start, inKey, chords: [a, b, c, d].map(x => x.name).join(' → ') });
      else partial.push({ at: a.start, inKey, chords: [a, b, c].map(x => x.name).join(' → ') });
    }
  }
  return { full: hits, partial, fullInKey: hits.filter(h => h.inKey).length, partialInKey: partial.filter(h => h.inKey).length };
}

/**
 * Harmonic-function evidence for a key: how well the chords in use fit that key's usual roles
 * (tonic weighted most, then a major dominant, then subdominant and other diatonic chords).
 * This separates relative keys (C major vs A minor) that pitch-class profiles alone confuse.
 */
const FUNCTION_WEIGHTS = {
  major: { I: 2, V: 1.5, IV: 1, ii: .5, vi: .5, iii: .3, V7: 0 },
  minor: { i: 2, V: 1.5, iv: 1, v: .6, bVI: .6, bVII: .6, bIII: .5 },
};
export function chordKeyScores(chordShares) {
  const scores = [];
  for (let tonic = 0; tonic < 12; tonic++) for (const mode of ['major', 'minor']) {
    let score = 0;
    for (const c of chordShares) {
      const chord = CHORDS.find(x => x.name === c.chord);
      score += (FUNCTION_WEIGHTS[mode][romanNumeral(chord, tonic)] || 0) * c.share;
    }
    scores.push({ tonic, mode, score });
  }
  return scores;
}

/** Final key: pitch-class correlation plus chord-function evidence (weighted 0.6). */
export function combineKey(pcp, chordShares) {
  const profileKey = estimateKey(pcp);
  const all = [];
  const fn = chordKeyScores(chordShares);
  for (let t = 0; t < 12; t++) for (const mode of ['major', 'minor']) {
    const r = pearson(pcp, rotate(mode === 'major' ? KK_MAJOR : KK_MINOR, t));
    const f = fn.find(x => x.tonic === t && x.mode === mode).score;
    all.push({ tonic: t, mode, r, f, total: r + .6 * f });
  }
  all.sort((x, y) => y.total - x.total);
  const [best, second] = all;
  const label = k => PITCH_NAMES[k.tonic] + (k.mode === 'minor' ? 'm' : '');
  return { tonic: best.tonic, mode: best.mode, name: label(best), r: best.r, functionScore: best.f, margin: best.total - second.total, runnerUp: label(second), profileOnly: profileKey.name, relativeAmbiguity: best.total - second.total < .05 && second.mode !== best.mode };
}

function ngrams(labels, n) {
  const counts = new Map();
  for (let i = 0; i + n <= labels.length; i++) {
    const g = labels.slice(i, i + n);
    if (g.includes('N')) continue;
    const key = g.join(' → ');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([progression, count]) => ({ progression, count }));
}

/* ---------------- Tempo ---------------- */
/** Global tempo from onset-flux autocorrelation, with a log-normal prior around 110 BPM (Ellis-style). */
export function estimateTempo(flux, framesPerSecond) {
  const n = flux.length;
  // High-pass the flux (subtract a 1 s moving average) and half-wave rectify.
  const w = Math.max(1, Math.round(framesPerSecond));
  const onset = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += flux[i]; if (i >= w) acc -= flux[i - w];
    onset[i] = Math.max(0, flux[i] - acc / Math.min(i + 1, w));
  }
  const minLag = Math.floor(framesPerSecond * 60 / 200), maxLag = Math.ceil(framesPerSecond * 60 / 45);
  const ac = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += onset[i] * onset[i - lag];
    ac[lag] = s / (n - lag);
  }
  let best = minLag, bestScore = -Infinity;
  const candidates = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = 60 * framesPerSecond / lag;
    const prior = Math.exp(-.5 * (Math.log2(bpm / 110) / .9) ** 2);
    const score = ac[lag] * prior;
    if (ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1]) candidates.push({ lag, bpm, strength: ac[lag] });
    if (score > bestScore) { bestScore = score; best = lag; }
  }
  // Parabolic refinement of the chosen lag.
  const a = ac[best - 1], b = ac[best], c = ac[best + 1];
  const delta = (a - 2 * b + c) ? .5 * (a - c) / (a - 2 * b + c) : 0;
  const bpm = 60 * framesPerSecond / (best + Math.max(-.5, Math.min(.5, delta)));
  // Beat trackers often pick half or double time; report those readings, not noise-level peaks.
  const alternatives = [bpm / 2, bpm * 2].filter(b => b >= 45 && b <= 200).map(b => Math.round(b));
  return { bpm, alternatives, onset };
}

/* ---------------- Main ---------------- */
/**
 * @param {{channels: Float32Array[], sampleRate: number, name?: string}} input
 * @returns full feature set (plain JSON)
 */
export function analyzeSong({ channels, sampleRate, name = '' }) {
  if (!channels?.length || !channels[0].length) throw new Error('No audio samples.');
  const rate = sampleRate, n = channels[0].length;
  const mono = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) mono[i] += ch[i] / channels.length;
  const duration = n / rate;
  const spec = spectralPass(mono, rate);
  const framesPerSecond = rate / ANALYSIS.hop;

  // Tuning and chroma.
  const tuning = estimateTuning(spec.peaks);
  const chroma = chromaFrames(spec, tuning.cents);

  // Energy gate: frames quieter than 30 dB below the loud frames do not vote on key/chords.
  const eDb = Array.from(spec.energy, e => 10 * Math.log10(e + 1e-12));
  const loud = quantile(eDb, .9);
  const pcp = new Array(12).fill(0);
  for (let f = 0; f < spec.frames; f++) if (eDb[f] > loud - 30) for (let p = 0; p < 12; p++) pcp[p] += chroma[f * 12 + p];

  // Chord windows: pool CF frames (~0.37 s), with median-like robustness via mean of log chroma.
  const CF = ANALYSIS.chordFrames, windows = [];
  for (let f = 0; f + CF <= spec.frames; f += CF) {
    const c = new Array(12).fill(0);
    let e = 0;
    for (let j = 0; j < CF; j++) { for (let p = 0; p < 12; p++) c[p] += chroma[(f + j) * 12 + p]; e += eDb[f + j]; }
    // Subtract the per-window minimum so broadband noise and percussion raise all classes less.
    const mn = Math.min(...c);
    windows.push({ chroma: c.map(v => v - mn), start: f * ANALYSIS.hop / rate, end: (f + CF) * ANALYSIS.hop / rate, quietness: Math.max(0, Math.min(1, (loud - 25 - e / CF) / 15)) });
  }
  const segments = recognizeChords(windows);
  const voiced = segments.filter(s => s.root !== null);
  const chordTime = new Map();
  for (const s of voiced) chordTime.set(s.name, (chordTime.get(s.name) || 0) + (s.end - s.start));
  const totalChordTime = [...chordTime.values()].reduce((a, b) => a + b, 0) || 1;
  const byName = [...chordTime.entries()].map(([chord, t]) => ({ chord, share: t / totalChordTime }));
  const key = combineKey(pcp, byName);
  const chordShares = byName.map(c => ({ ...c, roman: romanNumeral(CHORDS.find(x => x.name === c.chord), key.tonic) })).sort((a, b) => b.share - a.share);
  const romanSeq = [];
  for (const s of segments) {
    if (s.end - s.start < .6) continue; // ignore flickers shorter than ~2 windows
    const r = romanNumeral(s, key.tonic);
    if (romanSeq[romanSeq.length - 1] !== r) romanSeq.push(r);
  }
  const changes = voiced.length > 1 ? voiced.length / (duration / 60) : 0;

  // Scale-degree usage relative to the tonic.
  const pcpSum = pcp.reduce((a, b) => a + b, 0) || 1;
  const degreeProfile = pcp.map((_, i) => pcp[(i + key.tonic) % 12] / pcpSum);

  // Tempo.
  const tempo = estimateTempo(spec.flux, framesPerSecond);
  // Onset density: peaks of the onset envelope above a local adaptive threshold.
  let onsets = 0;
  const env = tempo.onset, half = Math.round(framesPerSecond * .5);
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] <= env[i - 1] || env[i] < env[i + 1]) continue;
    let s = 0, c = 0;
    for (let j = Math.max(0, i - half); j < Math.min(env.length, i + half); j++) { s += env[j]; c++; }
    if (env[i] > 1.5 * s / c && env[i] > 0) onsets++;
  }

  // Spectrum: long-term average in 1/3-octave bands, tilt and presence.
  const bands = [];
  for (let fc = 63; fc <= 8000 * 1.01; fc *= 2 ** (1 / 3)) {
    const lo = fc / 2 ** (1 / 6), hi = fc * 2 ** (1 / 6);
    let p = 0;
    for (let k = Math.ceil(lo / spec.binHz); k <= Math.min(spec.ltas.length - 1, Math.floor(hi / spec.binHz)); k++) p += spec.ltas[k];
    bands.push({ hz: Math.round(fc), power: p });
  }
  const maxBand = Math.max(...bands.map(b => b.power)) || 1;
  const bandDb = bands.map(b => ({ hz: b.hz, db: 10 * Math.log10(Math.max(b.power / maxBand, 1e-12)) }));
  const fitBands = bandDb.filter(b => b.hz >= 100 && b.hz <= 5000);
  const xs = fitBands.map(b => Math.log2(b.hz)), ys = fitBands.map(b => b.db);
  const mx = mean(xs), my = mean(ys);
  const tilt = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const bandShare = (lo, hi) => bands.filter(b => b.hz >= lo && b.hz < hi).reduce((s, b) => s + b.power, 0) / bands.reduce((s, b) => s + b.power, 0);

  // Stereo image.
  let corr = null, sideToMidDb = null;
  if (channels.length >= 2) {
    const [L, R] = channels;
    let lr = 0, ll = 0, rr = 0, m = 0, sd = 0;
    for (let i = 0; i < n; i++) { lr += L[i] * R[i]; ll += L[i] * L[i]; rr += R[i] * R[i]; m += (L[i] + R[i]) ** 2; sd += (L[i] - R[i]) ** 2; }
    corr = ll && rr ? lr / Math.sqrt(ll * rr) : 1;
    sideToMidDb = 10 * Math.log10(Math.max(sd, 1e-12) / Math.max(m, 1e-12));
  }

  // Repetition: does each ~4.5 s chroma pattern recur at least 10 s away?
  const win = 12, feats = [];
  for (let i = 0; i + win <= windows.length; i += 2) {
    const v = [];
    for (let j = 0; j < win; j++) { const c = windows[i + j].chroma, s = Math.hypot(...c) || 1; for (const x of c) v.push(x / s); }
    const norm = Math.hypot(...v) || 1;
    feats.push({ t: windows[i].start, v: v.map(x => x / norm) });
  }
  let repeated = 0;
  for (let i = 0; i < feats.length; i++) {
    let best = 0;
    for (let j = 0; j < feats.length; j++) {
      if (Math.abs(feats[i].t - feats[j].t) < 10) continue;
      let dot = 0; const a = feats[i].v, b = feats[j].v;
      for (let k = 0; k < a.length; k++) dot += a[k] * b[k];
      if (dot > best) best = dot;
    }
    if (best > .9) repeated++;
  }

  const loud_ = loudness(channels, rate);
  if (loud_.integratedLufs < -60 || !voiced.length) throw new Error('This recording is silent or too quiet to analyse.');
  // Home note folded into one octave starting at A3 (≈214–428 Hz with tuning), by pitch class only.
  const tonicHz = 220 * 2 ** (((key.tonic - 9 + 12) % 12) / 12 + tuning.cents / 1200);
  return {
    name, duration, sampleRate: rate,
    tuning: { cents: tuning.cents, strength: tuning.strength },
    key: { ...key, tonicHz },
    degreeProfile,
    tempo: { bpm: tempo.bpm, alternatives: tempo.alternatives },
    onsetsPerSecond: onsets / duration,
    chords: {
      segments: segments.map(s => ({ name: s.name, start: +s.start.toFixed(2), end: +s.end.toFixed(2) })),
      shares: chordShares.slice(0, 12), uniqueChords: chordShares.filter(c => c.share > .02).length,
      changesPerMinute: changes, minorShare: voiced.reduce((s, v) => s + (v.quality === 'min' ? v.end - v.start : 0), 0) / totalChordTime,
      bigrams: ngrams(romanSeq, 2).slice(0, 40), trigrams: ngrams(romanSeq, 3).slice(0, 60), fourgrams: ngrams(romanSeq, 4).slice(0, 60),
      andalusian: findAndalusian(segments, key.tonic),
    },
    spectrum: {
      bandsDb: bandDb, tiltDbPerOctave: tilt,
      centroidHz: median(Array.from(spec.centroid).filter((_, i) => eDb[i] > loud - 30)),
      lowShare: bandShare(0, 250), midShare: bandShare(250, 2000), presenceShare: bandShare(1000, 4000), highShare: bandShare(4000, 20000),
    },
    loudness: { integratedLufs: loud_.integratedLufs, loudnessRangeLu: loud_.loudnessRangeLu, samplePeakDbfs: loud_.samplePeakDbfs, crestDb: loud_.crestDb },
    stereo: { correlation: corr, sideToMidDb },
    repetition: feats.length ? repeated / feats.length : 0,
  };
}

/* ---------------- Profiles and comparison ---------------- */
/** Scalar features used for profiles and comparison, with labels and units. */
export const PROFILE_FEATURES = [
  { key: 'tempo', label: 'Tempo', unit: 'BPM', get: s => s.tempo.bpm },
  // Display only: tuning wraps at ±50 cents and reflects recording/transfer, not style, so it is not scored.
  { key: 'tuning', label: 'Tuning offset', unit: 'cents', get: s => s.tuning.cents, score: false },
  { key: 'minorShare', label: 'Minor-chord share', unit: '%', scale: 100, get: s => s.chords.minorShare },
  { key: 'changes', label: 'Chord changes', unit: '/min', get: s => s.chords.changesPerMinute },
  { key: 'unique', label: 'Distinct chords', unit: '', get: s => s.chords.uniqueChords },
  { key: 'tilt', label: 'Spectral tilt', unit: 'dB/oct', get: s => s.spectrum.tiltDbPerOctave },
  { key: 'centroid', label: 'Brightness (centroid)', unit: 'Hz', get: s => s.spectrum.centroidHz },
  { key: 'presence', label: 'Vocal-presence band (1–4 kHz)', unit: '%', scale: 100, get: s => s.spectrum.presenceShare },
  { key: 'lufs', label: 'Loudness', unit: 'LUFS', get: s => s.loudness.integratedLufs },
  { key: 'lra', label: 'Loudness range', unit: 'LU', get: s => s.loudness.loudnessRangeLu },
  { key: 'crest', label: 'Peak-to-average (crest)', unit: 'dB', get: s => s.loudness.crestDb },
  { key: 'stereo', label: 'Stereo correlation', unit: '', get: s => s.stereo.correlation ?? 1 },
  { key: 'onsets', label: 'Note/beat events', unit: '/s', get: s => s.onsetsPerSecond },
  { key: 'repetition', label: 'Repetition', unit: '%', scale: 100, get: s => s.repetition },
];

export function buildProfile(songs, { artist = '' } = {}) {
  const stats = {};
  for (const f of PROFILE_FEATURES) {
    const v = songs.map(f.get).filter(Number.isFinite);
    const q1 = quantile(v, .25), q3 = quantile(v, .75);
    stats[f.key] = { median: median(v), q1, q3, min: Math.min(...v), max: Math.max(...v), spread: Math.max((q3 - q1) / 1.349, 1e-6), n: v.length };
  }
  const average = list => { const d = new Array(12).fill(0); for (const s of list) s.degreeProfile.forEach((v, i) => { d[i] += v / Math.max(1, list.length); }); return d; };
  const degree = average(songs);
  const majorSongs = songs.filter(s => s.key.mode === 'major'), minorSongs = songs.filter(s => s.key.mode === 'minor');
  const count = x => (Array.isArray(x) ? x.length : Number(x) || 0);
  const anda = s => s.chords.andalusian;
  const keys = {}, modes = { major: 0, minor: 0 };
  for (const s of songs) { keys[s.key.name] = (keys[s.key.name] || 0) + 1; modes[s.key.mode]++; }
  const romanTotals = new Map(), progressionTotals = new Map();
  for (const s of songs) {
    for (const c of s.chords.shares) romanTotals.set(c.roman, (romanTotals.get(c.roman) || 0) + c.share / songs.length);
    for (const g of new Set([...s.chords.trigrams, ...s.chords.fourgrams].map(x => x.progression))) progressionTotals.set(g, (progressionTotals.get(g) || 0) + 1);
  }
  return {
    artist, songs: songs.length, features: stats, degreeProfile: degree,
    degreeProfileByMode: { major: average(majorSongs), minor: average(minorSongs) }, keys, modes,
    romanShares: [...romanTotals.entries()].sort((a, b) => b[1] - a[1]).map(([roman, share]) => ({ roman, share })),
    progressionsSongsWith: [...progressionTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([progression, songsWith]) => ({ progression, songsWith })),
    // Shape anywhere (minor X → X−2 maj → X−4 maj, e.g. Am → G → F) vs. starting on the song's own home chord.
    andalusianSongs: songs.filter(s => count(anda(s).full) > 0).length,
    andalusianPartialSongs: songs.filter(s => count(anda(s).full) + count(anda(s).partial) > 0).length,
    andalusianInKeySongs: songs.filter(s => (anda(s).fullInKey || 0) > 0).length,
    andalusianPartialInKeySongs: songs.filter(s => (anda(s).fullInKey || 0) + (anda(s).partialInKey || 0) > 0).length,
    tonicHz: songs.map(s => s.key.tonicHz),
  };
}

/** Compare one song to a profile: per-feature robust z-scores, harmonic similarity and an overall closeness. */
export function compareToProfile(song, profile) {
  const rows = PROFILE_FEATURES.map(f => {
    const st = profile.features[f.key], v = f.get(song);
    const z = Number.isFinite(v) && st ? (v - st.median) / st.spread : null;
    return { key: f.key, label: f.label, unit: f.unit, scale: f.scale || 1, value: v, median: st?.median, q1: st?.q1, q3: st?.q3, z, within: st ? v >= st.q1 && v <= st.q3 : false };
  });
  const zs = rows.filter(r => PROFILE_FEATURES.find(f => f.key === r.key).score !== false).map(r => r.z).filter(Number.isFinite).map(z => Math.min(4, Math.abs(z)));
  const featureCloseness = Math.exp(-.5 * mean(zs.map(z => z * z)) / 2);
  // Compare scale-note use with profile songs in the same mode (pooling major and minor blurs both).
  const sameMode = profile.degreeProfileByMode?.[song.key.mode];
  const scaleSimilarity = pearson(song.degreeProfile, sameMode && sameMode.some(v => v > 0) ? sameMode : profile.degreeProfile);
  const shares = new Map(profile.romanShares.map(r => [r.roman, r.share]));
  const songShares = new Map(song.chords.shares.map(c => [c.roman, c.share]));
  const romans = new Set([...shares.keys(), ...songShares.keys()]);
  let dot = 0, na = 0, nb = 0;
  for (const r of romans) { const a = shares.get(r) || 0, b = songShares.get(r) || 0; dot += a * b; na += a * a; nb += b * b; }
  const harmonySimilarity = na && nb ? dot / Math.sqrt(na * nb) : 0;
  const overall = .5 * featureCloseness + .25 * Math.max(0, scaleSimilarity) + .25 * harmonySimilarity;
  return { overall, featureCloseness, scaleSimilarity, harmonySimilarity, rows };
}

/** Euclidean distance between two songs in robust-z feature space (for "closest songs"). */
export function songDistance(a, b, profile) {
  let s = 0, c = 0;
  for (const f of PROFILE_FEATURES) {
    if (f.score === false) continue;
    const st = profile.features[f.key], x = f.get(a), y = f.get(b);
    if (!st || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    s += Math.min(16, ((x - y) / st.spread) ** 2); c++;
  }
  return Math.sqrt(s / Math.max(1, c));
}
