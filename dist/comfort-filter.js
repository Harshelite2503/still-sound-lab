// Still for Video: the comfort filter's design, as pure functions that also run in Node.
// It turns a point in a 4-D unit cube (what one person prefers) plus a sensitivity state into
// concrete Web Audio settings, and checks them with the same biquad formulas the Web Audio API
// uses, so tests and the browser agree on what each setting does to the spectrum.
//
// Design rules (see docs/still-for-video.md):
// - It only ever turns things down: every filter band is a cut, never a boost.
// - Speech stays clear: the 1–4 kHz band that carries most speech information is never cut
//   more than SPEECH_GUARD_DB below the 500 Hz band. If a setting would, shaping is scaled back.
// - Sudden peaks are tamed by gentle compression with explicit (not automatic) makeup gain,
//   so quiet words stay audible when the overall level comes down.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** Four things a person can prefer, each 0…1. */
export const DIMENSIONS = [
  { key: 'top', name: 'Top-end softness', low: 'open, airy top end', high: 'soft, rounded top end' },
  { key: 'edge', name: 'Edge and hiss', low: 'edge and s-sounds untouched', high: 'edge and s-sounds softened' },
  { key: 'peaks', name: 'Sudden-sound control', low: 'natural dynamics', high: 'sudden loud moments held back' },
  { key: 'low', name: 'Rumble and boom', low: 'full low end', high: 'rumble and boom reduced' },
];

/**
 * The fixed gentle preset: the strong simple baseline that personal tuning must beat, and the
 * point filtering starts from before any tuning. In calm it gives the research brief's defaults:
 * high shelf −4 dB at 6 kHz, presence −2 dB, s-sounds −2 dB, low cut at 80 Hz, ratio 2:1.
 */
export const GENTLE_PRESET = Object.freeze([2 / 3, .5, 1 / 3, 1 / 3]);

/**
 * How each sensitivity state changes the filter. Shaping is multiplied (more sensitive → stronger
 * cuts, within the caps), peak control is raised, and the output comes down 3 or 6 dB. Migraine
 * sound-aversion thresholds shift by roughly 14–17 dB evenly across 1–8 kHz (pure tones; Ashkenazi
 * et al.), so level matters as much as shaping. The blinded check tests exactly that. Level offsets
 * stay modest because this is speech the person wants to follow, and compression keeps quiet words up.
 */
export const FILTER_STATES = {
  calm: { label: 'Calm', shaping: 1, peaks: 0, levelDb: 0, highShelfCapDb: -6, guardDb: 3 },
  sensitive: { label: 'Sensitive', shaping: 1.35, peaks: .2, levelDb: -3, highShelfCapDb: -7, guardDb: 4 },
  very: { label: 'Very sensitive', shaping: 1.7, peaks: .4, levelDb: -6, highShelfCapDb: -8, guardDb: 4 },
  recovering: { label: 'Recovering', shaping: 1.35, peaks: .2, levelDb: -3, highShelfCapDb: -7, guardDb: 4 },
};
const LEGACY_STATES = { normal: 'calm', warning: 'sensitive', attack: 'very' };
export function stateKey(key) {
  if (key && Object.hasOwn(FILTER_STATES, key)) return key;
  if (key && Object.hasOwn(LEGACY_STATES, key)) return LEGACY_STATES[key];
  return 'calm';
}

/**
 * Hard limits on every cut, whatever the person or state asks for. Caps follow the research brief
 * (docs/still-for-video.md): presence and s-sound dips at most −4 dB, high shelf −6 dB (−8 dB when
 * very sensitive), low cut 60–120 Hz, low shelf at most −3 dB, compression ratio at most 3:1.
 */
export const LIMITS = {
  highShelfDb: -8, presenceDb: -4, sibilanceDb: -4, lowShelfDb: -3, highpassHz: 120,
  ratioMax: 3, thresholdMinDb: -40, makeupMaxDb: 9,
};
export const FREQS = { highShelfHz: 6000, presenceHz: 3200, presenceQ: 1.41, sibilanceHz: 7000, sibilanceQ: 2, lowShelfHz: 200 };
/** Floor: no single speech band (1, 2, 4 kHz) more than this below 500 Hz. Engineering judgement. */
export const SPEECH_GUARD_DB = 6;
export const SPEECH_GUARD_BANDS = [1000, 2000, 4000];
/** Typical speech level in online video, used only to set makeup gain for the compressor. */
export const SPEECH_REF_DBFS = -20;

/**
 * ANSI S3.5-1997 band importance for average speech (as reproduced by MoSQITo and the R SII package;
 * the standard itself was not read). Octave bands sum to 1; one-third-octave bands 160 Hz–8 kHz sum to ~1.
 */
export const SII_OCTAVE_IMPORTANCE = { 250: .0617, 500: .1671, 1000: .2373, 2000: .2648, 4000: .2142, 8000: .0549 };
export const SII_THIRD_OCTAVE_IMPORTANCE = {
  160: .0083, 200: .0095, 250: .0150, 315: .0289, 400: .0440, 500: .0578, 630: .0653, 800: .0711, 1000: .0818,
  1250: .0844, 1600: .0882, 2000: .0898, 2500: .0868, 3150: .0844, 4000: .0771, 5000: .0527, 6300: .0364, 8000: .0185,
};

const isUnit = x => Array.isArray(x) && x.length === 4 && x.every(v => Number.isFinite(v) && v >= 0 && v <= 1);
export const validPoint = isUnit;

/** Settings for one person (x) in one state, before the speech guard. */
function rawSettings(x, state) {
  const s = FILTER_STATES[stateKey(state)];
  const [top, edge, peaks, low] = (isUnit(x) ? x : GENTLE_PRESET).map(v => clamp(Number(v), 0, 1));
  const shape = v => clamp(v * s.shaping, 0, 1);
  const p = clamp(peaks + s.peaks, 0, 1);
  return {
    state: stateKey(state),
    highShelfDb: Math.max(LIMITS.highShelfDb, s.highShelfCapDb, -6 * shape(top) * (s.shaping > 1 ? Math.abs(s.highShelfCapDb) / 6 : 1)),
    presenceDb: Math.max(LIMITS.presenceDb, -4 * shape(edge)),
    sibilanceDb: Math.max(LIMITS.sibilanceDb, -4 * shape(edge)),
    lowShelfDb: Math.max(LIMITS.lowShelfDb, -3 * shape(low)),
    highpassHz: Math.min(LIMITS.highpassHz, 60 + 60 * shape(low)),
    thresholdDb: Math.max(LIMITS.thresholdMinDb, -16 - 14 * p),
    ratio: Math.min(LIMITS.ratioMax, 1.5 + 1.5 * p),
    attack: .006,
    release: .3,
    levelDb: s.levelDb,
  };
}

/** Explicit makeup gain: bring a typical speech level back to where it was before compression. */
export function makeupDb(thresholdDb, ratio) {
  if (SPEECH_REF_DBFS <= thresholdDb) return 0;
  return clamp((1 - 1 / ratio) * (SPEECH_REF_DBFS - thresholdDb), 0, LIMITS.makeupMaxDb);
}

/** The biquad sections a settings object uses, in chain order (Web Audio types and units). */
export function filterSections(st) {
  return [
    { type: 'highpass', frequency: st.highpassHz, Q: -3.0103, gain: 0 }, // Q in dB for highpass: Butterworth (1/√2)
    { type: 'lowshelf', frequency: FREQS.lowShelfHz, Q: 1, gain: st.lowShelfDb },
    { type: 'peaking', frequency: FREQS.presenceHz, Q: FREQS.presenceQ, gain: st.presenceDb },
    { type: 'peaking', frequency: FREQS.sibilanceHz, Q: FREQS.sibilanceQ, gain: st.sibilanceDb },
    { type: 'highshelf', frequency: FREQS.highShelfHz, Q: 1, gain: st.highShelfDb },
  ];
}

/**
 * Biquad coefficients exactly as the Web Audio API defines them (W3C Web Audio API, BiquadFilterNode):
 * A = 10^(G/40), w0 = 2π f0/Fs, alpha_Q = sin(w0)/(2Q), alpha_QdB = sin(w0)/(2·10^(Q/20)),
 * alpha_S = sin(w0)/2 · sqrt((A + 1/A)(1/S − 1) + 2) with S = 1.
 */
export function biquadCoefficients({ type, frequency, Q = 1, gain = 0 }, rate = 48000) {
  const f0 = clamp(frequency, 1, rate / 2 - 1);
  const A = 10 ** (gain / 40), w0 = 2 * Math.PI * f0 / rate, cw = Math.cos(w0), sw = Math.sin(w0);
  const aQ = sw / (2 * Q), aQdB = sw / (2 * 10 ** (Q / 20)), aS = sw / 2 * Math.sqrt(2), sA = Math.sqrt(A);
  switch (type) {
    case 'lowpass': return norm([(1 - cw) / 2, 1 - cw, (1 - cw) / 2], [1 + aQdB, -2 * cw, 1 - aQdB]);
    case 'highpass': return norm([(1 + cw) / 2, -(1 + cw), (1 + cw) / 2], [1 + aQdB, -2 * cw, 1 - aQdB]);
    case 'peaking': return norm([1 + aQ * A, -2 * cw, 1 - aQ * A], [1 + aQ / A, -2 * cw, 1 - aQ / A]);
    case 'lowshelf': return norm(
      [A * ((A + 1) - (A - 1) * cw + 2 * aS * sA), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - 2 * aS * sA)],
      [(A + 1) + (A - 1) * cw + 2 * aS * sA, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - 2 * aS * sA]);
    case 'highshelf': return norm(
      [A * ((A + 1) + (A - 1) * cw + 2 * aS * sA), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - 2 * aS * sA)],
      [(A + 1) - (A - 1) * cw + 2 * aS * sA, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - 2 * aS * sA]);
    default: throw new Error(`Unsupported biquad type ${type}`);
  }
}
function norm(b, a) { return { b: b.map(v => v / a[0]), a: [1, a[1] / a[0], a[2] / a[0]] }; }

/** Magnitude response in dB of one biquad section at hz. */
export function biquadResponseDb(section, hz, rate = 48000) {
  const { b, a } = biquadCoefficients(section, rate);
  const w = 2 * Math.PI * hz / rate, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = b[0] + b[1] * c1 + b[2] * c2, ni = -(b[1] * s1 + b[2] * s2);
  const dr = a[0] + a[1] * c1 + a[2] * c2, di = -(a[1] * s1 + a[2] * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

/** Summed magnitude response (dB) of all filter sections at hz, excluding compression and level. */
export function chainResponseDb(st, hz, rate = 48000) {
  return filterSections(st).reduce((sum, s) => sum + biquadResponseDb(s, hz, rate), 0);
}

/** How far below the 500 Hz band the most-cut speech band (1, 2, 4 kHz) sits, in dB (≤ 0). */
export function speechBandCutDb(st, rate = 48000) {
  const ref = chainResponseDb(st, 500, rate);
  return Math.min(...SPEECH_GUARD_BANDS.map(hz => chainResponseDb(st, hz, rate) - ref));
}

/** Importance-weighted mean gain (dB) over one-third-octave bands in [lo, hi], relative to 500 Hz. */
export function weightedGainDb(st, lo = 160, hi = 8000, rate = 48000) {
  const ref = chainResponseDb(st, 500, rate);
  const bands = Object.entries(SII_THIRD_OCTAVE_IMPORTANCE).map(([hz, w]) => [Number(hz), w]).filter(([hz]) => hz >= lo && hz <= hi);
  const total = bands.reduce((s, [, w]) => s + w, 0);
  return bands.reduce((s, [hz, w]) => s + w * (chainResponseDb(st, hz, rate) - ref), 0) / total;
}

/**
 * Speech-importance-weighted average change across octave bands 250 Hz–8 kHz, relative to 500 Hz.
 * A description of how much of the speech spectrum is touched; not an intelligibility prediction.
 */
export function speechWeightedChangeDb(st, rate = 48000) {
  const ref = chainResponseDb(st, 500, rate);
  return Object.entries(SII_OCTAVE_IMPORTANCE).reduce((sum, [hz, w]) => sum + w * (chainResponseDb(st, Number(hz), rate) - ref), 0);
}

/** Does a setting keep speech clear? Three rules, all relative to the 500 Hz band. */
export function passesSpeechGuard(st, rate = 48000) {
  const g = FILTER_STATES[stateKey(st.state)].guardDb;
  return speechBandCutDb(st, rate) >= -SPEECH_GUARD_DB - 1e-9
    && weightedGainDb(st, 1000, 4000, rate) >= -g - 1e-9
    && weightedGainDb(st, 160, 8000, rate) >= -g - 1e-9;
}

/**
 * Final settings for a person's point x in a state. If the shaping would break the speech guard
 * (any of 1, 2, 4 kHz more than 6 dB below 500 Hz, or the importance-weighted 1–4 kHz or whole-band
 * gain more than 3 dB below it, 4 dB when more sensitive), the presence, s-sound and high-shelf cuts
 * are scaled back together (binary search) until it passes. Compression, low cut and level are never scaled.
 */
export function filterSettings(x, state = 'calm', { rate = 48000 } = {}) {
  const raw = rawSettings(x, state);
  const scaled = k => ({ ...raw, presenceDb: raw.presenceDb * k, sibilanceDb: raw.sibilanceDb * k, highShelfDb: raw.highShelfDb * k });
  let st = raw, guardScale = 1;
  if (!passesSpeechGuard(raw, rate)) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (passesSpeechGuard(scaled(mid), rate)) lo = mid; else hi = mid; }
    guardScale = lo; st = scaled(lo);
  }
  // Makeup never exceeds the state's level cut, so nothing ever comes out louder than the original:
  // in calm quiet sound passes unchanged; in more sensitive states quiet words are lifted back toward,
  // but never above, their original level while loud moments come down.
  const makeup = Math.min(makeupDb(st.thresholdDb, st.ratio), Math.max(0, -st.levelDb));
  return { ...st, makeupDb: makeup, guardScale, x: isUnit(x) ? x.slice() : GENTLE_PRESET.slice() };
}

/** Static compressor curve (hard knee): output level for an input level, before makeup gain. */
export function compressorOutputDb(inputDb, thresholdDb, ratio) {
  return inputDb <= thresholdDb ? inputDb : thresholdDb + (inputDb - thresholdDb) / ratio;
}

/**
 * Web Audio's DynamicsCompressorNode adds its own makeup gain, (1 / full-range gain)^0.6, where the
 * full-range gain is the curve's output for a 0 dBFS input. With knee 0 that is computable exactly,
 * so the chain multiplies by its inverse and applies only the explicit makeup above.
 */
export function automaticMakeupDb(thresholdDb, ratio) {
  return -.6 * compressorOutputDb(0, thresholdDb, ratio);
}

/** Overall static gain (dB) of compression + makeup + state level for an input at inputDb, ignoring EQ. */
export function levelGainDb(st, inputDb) {
  return compressorOutputDb(inputDb, st.thresholdDb, st.ratio) - inputDb + st.makeupDb + st.levelDb;
}

/** Plain-language description of what a setting does. */
export function describeSettings(st) {
  const parts = [];
  const top = -st.highShelfDb, edge = -Math.min(st.presenceDb, st.sibilanceDb), low = -st.lowShelfDb;
  parts.push(top < 2 ? 'top end left open' : top < 6 ? `top end softened by ${top.toFixed(0)} dB` : `top end strongly softened (${top.toFixed(0)} dB)`);
  parts.push(edge < 1.5 ? 'edge and s-sounds untouched' : `edge and s-sounds down ${edge.toFixed(0)} dB`);
  parts.push(st.ratio < 1.8 ? 'natural dynamics' : st.ratio < 3 ? 'sudden loud moments gently held back' : 'sudden loud moments firmly held back');
  parts.push(low < 1 && st.highpassHz < 60 ? 'full low end' : `rumble below ${Math.round(st.highpassHz)} Hz reduced`);
  if (st.levelDb < 0) parts.push(`${-st.levelDb} dB quieter overall`);
  return parts;
}

/**
 * Pick the first comparison for tuning: a point that differs clearly from the start on the two
 * shaping dimensions people notice most (top end and edge), keeping the others.
 */
export function firstChallenger(start = GENTLE_PRESET) {
  const flip = v => (v < .5 ? Math.min(1, v + .35) : Math.max(0, v - .35));
  return [flip(start[0]), flip(start[1]), start[2], start[3]];
}

/** Excludes points within `radius` of any point the person said made words hard to follow. */
export function vetoFilter(vetoes, radius = .15) {
  const list = (Array.isArray(vetoes) ? vetoes : []).filter(isUnit);
  return x => list.some(v => Math.hypot(...v.map((vi, i) => vi - x[i])) < radius);
}

/** A seeded shuffle, used to blind the order of versions in the check. */
export function seededOrder(n, seed) {
  // Mix the seed (murmur3 finaliser) so nearby seeds give unrelated orders, then xorshift32.
  let s = Math.floor(num(seed, 1)) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x85ebca6b) >>> 0; s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35) >>> 0; s = (s ^ (s >>> 16)) >>> 0 || 1;
  const random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}
