/**
 * Personal comfort sound engine.
 *
 * Every sound is built in the frequency domain, so its spectral tilt, top-end
 * softness and personal EQ are exact, and every buffer loops without a click.
 * Levels are relative digital levels, never calibrated dB SPL.
 */
import { fft } from './audio-engine.js';

const TAU = 2 * Math.PI;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dbToAmp = db => 10 ** (db / 20);

/** Reference level for every rendered sound: weighted RMS per channel, in dBFS (see loudnessWeightPower). */
export const REFERENCE_DBFS = -30;

/** Rendered buffers never peak above this; louder renders are scaled down as a whole (never clipped). */
export const PEAK_LIMIT = .35;

/** Low-frequency boost that loudness matching may apply, at most (dB). Plain A-weighting would give +16 dB at 125 Hz. */
export const MAX_LOW_COMPENSATION_DB = 8;

/** Calibration bands, in Hz. Seven half-octave bands across the speech/music range. */
export const CONTOUR_BANDS = [125, 250, 500, 1000, 2000, 4000, 8000];

/** Listening states. Offsets are starting points relative to a normal day, not clinical thresholds. */
export const MODES = {
  normal: { label: 'Normal day', offsetDb: 0, shelfDb: 0, swellCapDb: 6, fadeSeconds: 3 },
  warning: { label: 'Warning signs', offsetDb: -6, shelfDb: -3, swellCapDb: 3, fadeSeconds: 4 },
  attack: { label: 'During an attack', offsetDb: -14, shelfDb: -6, swellCapDb: 1, fadeSeconds: 6 },
  recovering: { label: 'Recovering', offsetDb: -6, shelfDb: -3, swellCapDb: 3, fadeSeconds: 4 },
};

export function rng(seed = 1) {
  let state = (Math.floor(Number(seed) || 1) >>> 0) || 1;
  const next = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  next.gauss = () => {
    const u = Math.max(next(), 1e-12), v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  };
  return next;
}

/** IEC 61672 A-weighting, as linear power gain. */
export function aWeightPower(hz) {
  if (hz <= 0) return 0;
  const f2 = hz * hz;
  const ra = (12194 ** 2 * f2 * f2) /
    ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return (ra * 10 ** (2 / 20)) ** 2;
}

/**
 * Loudness-matching weight: A-weighting, but never discounting a frequency by more than
 * MAX_LOW_COMPENSATION_DB. Plain A-weighting over-boosts dark sounds, which would make them
 * digitally hot (and clip) at the same nominal level.
 */
export function loudnessWeightPower(hz) {
  if (hz <= 0) return 0;
  return Math.max(aWeightPower(hz), 10 ** (-MAX_LOW_COMPENSATION_DB / 10));
}

/**
 * One safety chain for every sound Still plays: compressor-limiter with its automatic makeup gain
 * cancelled, then a hard clip at -3 dBFS for transients that slip through the 2 ms attack.
 * Returns the node to connect sources into.
 */
export function createSafetyChain(ctx, { thresholdDb = -6, ratio = 20, clipDb = -3 } = {}) {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = thresholdDb; limiter.knee.value = 0; limiter.ratio.value = ratio;
  limiter.attack.value = .002; limiter.release.value = .25;
  // Web Audio applies makeup gain = (1/fullRangeGain)^0.6; undo it so quiet sounds are not raised.
  const fullRangeOutDb = thresholdDb + (0 - thresholdDb) / ratio;
  const trim = ctx.createGain();
  trim.gain.value = 10 ** (0.6 * fullRangeOutDb / 20);
  const clip = ctx.createWaveShaper();
  const ceiling = 10 ** (clipDb / 20), curve = new Float32Array(4097);
  for (let i = 0; i < curve.length; i++) curve[i] = clamp(i / 2048 - 1, -ceiling, ceiling);
  clip.curve = curve;
  limiter.connect(trim); trim.connect(clip); clip.connect(ctx.destination);
  return limiter;
}

/** Map a point in the 4-D unit cube to synthesis settings. */
export function paramsFromX(x) {
  const [a, b, c, d] = x.map(v => clamp(Number(v) || 0, 0, 1));
  return {
    tiltDbPerOctave: -9 + 7.5 * a,          // -9 (very dark) … -1.5 (bright, near white)
    tonal: b,                               // 0 = air/rain-like noise, 1 = soft harmonic hum
    swellDb: 6 * c,                         // depth of one slow rise and fall every 6–12 s
    cutoffHz: 300 * 20 ** d,                // 300 … 6000 Hz soft top-end
  };
}

/** Plain-language description of a point, used for the fingerprint card. */
export function describeX(x) {
  const p = paramsFromX(x);
  const tilt = p.tiltDbPerOctave < -6.5 ? 'deep and dark, like distant surf or brown noise'
    : p.tiltDbPerOctave < -4 ? 'balanced, close to pink noise or steady rain'
    : 'airy and open, closer to white noise or a fan';
  const texture = p.tonal < .3 ? 'mostly noise-like (air, rain)'
    : p.tonal < .7 ? 'a blend of soft noise and a low hum' : 'mostly a soft, steady hum';
  const motion = p.swellDb < 1 ? 'steady, with no swell' : p.swellDb < 1.5 ? 'almost steady' : p.swellDb < 4 ? 'a gentle, slow swell' : 'a noticeable slow swell, like breathing';
  const top = p.cutoffHz < 900 ? 'very soft top end' : p.cutoffHz < 2500 ? 'softened top end' : 'open top end';
  return { tilt, texture, motion, top, params: p };
}

/** Personal EQ from a comfort contour: bands marked less comfortable are turned down, never boosted. */
export function contourEqDb(hz, contour) {
  const pts = (contour || []).filter(p => Number.isFinite(p?.hz) && Number.isFinite(p?.ceilingDb)).sort((p, q) => p.hz - q.hz);
  if (pts.length < 2 || hz <= 0) return 0;
  const sorted = pts.map(p => p.ceilingDb).sort((p, q) => p - q);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const lf = Math.log2(hz);
  let ceiling;
  if (lf <= Math.log2(pts[0].hz)) ceiling = pts[0].ceilingDb;
  else if (lf >= Math.log2(pts[pts.length - 1].hz)) ceiling = pts[pts.length - 1].ceilingDb;
  else {
    let i = 0;
    while (Math.log2(pts[i + 1].hz) < lf) i++;
    const t = (lf - Math.log2(pts[i].hz)) / (Math.log2(pts[i + 1].hz) - Math.log2(pts[i].hz));
    ceiling = pts[i].ceilingDb + t * (pts[i + 1].ceilingDb - pts[i].ceilingDb);
  }
  return clamp(ceiling - median, -12, 0);
}

/** The overall comfortable ceiling, in dB relative to the reference. */
export function contourCeilingDb(contour) {
  const values = (contour || []).map(p => p?.ceilingDb).filter(Number.isFinite).sort((p, q) => p - q);
  if (!values.length) return 0;
  return values.length % 2 ? values[(values.length - 1) / 2] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
}

function shapeAmplitude(hz, p, opts) {
  if (hz < 20) return 0;
  const tilt = (hz / 1000) ** (p.tiltDbPerOctave / 6.0206);
  const lowpass = 1 / Math.sqrt(1 + (hz / p.cutoffHz) ** 4);
  const highpass = 1 / Math.sqrt(1 + (40 / hz) ** 4);
  const mode = MODES[opts.mode] || MODES.normal;
  const shelf = mode.shelfDb ? dbToAmp(mode.shelfDb / (1 + (3000 / hz) ** 2)) : 1;
  const eq = opts.contour ? dbToAmp(contourEqDb(hz, opts.contour)) : 1;
  return tilt * lowpass * highpass * shelf * eq;
}

/** Inverse real FFT of a Hermitian spectrum given for bins 0..n/2. */
function inverseReal(re, im) {
  const n = re.length;
  for (let k = 1; k < n / 2; k++) { re[n - k] = re[k]; im[n - k] = -im[k]; }
  im[0] = 0; im[n / 2] = 0;
  for (let k = 0; k < n; k++) im[k] = -im[k];
  fft(re, im);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = re[i] / n;
  return out;
}

function aWeightedPower(re, im, n, rate) {
  let sum = 0;
  for (let k = 1; k < n / 2; k++) sum += loudnessWeightPower(k * rate / n) * (re[k] * re[k] + im[k] * im[k]);
  // Parseval for a real signal: mean square = 2 * sum(|X_k|^2) / n^2 over positive bins.
  return 2 * sum / (n * n);
}

function scaleSpectrum(re, im, factor) {
  for (let k = 0; k < re.length; k++) { re[k] *= factor; im[k] *= factor; }
}

/**
 * Render a seamless stereo loop.
 * @param {number[]} x point in [0,1]^4 (see paramsFromX)
 * @param {{rate?:number, log2Length?:number, seed?:number, contour?:Array, mode?:string, toneHz?:number}} opts
 */
export function renderComfortLoop(x, opts = {}) {
  const rate = opts.rate || 44100;
  const n = 2 ** clamp(Math.round(opts.log2Length || 18), 12, 20);
  const p = paramsFromX(x);
  const mode = MODES[opts.mode] || MODES.normal;
  const swellDb = Math.min(p.swellDb, mode.swellCapDb);
  const random = rng(opts.seed ?? 7);
  const toneHz = clamp(Number(opts.toneHz) || 110, 55, 330);
  const half = n / 2;
  const target = 10 ** (REFERENCE_DBFS / 10);

  // Noise layer: shared + independent components give a natural, not-too-wide stereo image.
  const layers = [];
  const shared = Array.from({ length: half + 1 }, () => [random.gauss(), random.gauss()]);
  for (let c = 0; c < 2; c++) {
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let k = 1; k < half; k++) {
      const amp = shapeAmplitude(k * rate / n, p, opts) / Math.SQRT2;
      re[k] = amp * (Math.SQRT1_2 * shared[k][0] + Math.SQRT1_2 * random.gauss());
      im[k] = amp * (Math.SQRT1_2 * shared[k][1] + Math.SQRT1_2 * random.gauss());
    }
    layers.push({ re, im });
  }
  // Tonal layer: harmonics placed exactly on FFT bins, so they loop cleanly; same phase in both ears.
  const tone = { re: new Float64Array(n), im: new Float64Array(n) };
  for (let h = 1; h <= 16; h++) {
    const k = Math.round(h * toneHz * n / rate);
    if (k <= 0 || k >= half) break;
    const amp = shapeAmplitude(k * rate / n, p, opts) / Math.sqrt(h) * n / 2;
    const phase = TAU * random();
    tone.re[k] += amp * Math.cos(phase); tone.im[k] += amp * Math.sin(phase);
  }
  const tonePower = aWeightedPower(tone.re, tone.im, n, rate);
  const channels = layers.map(layer => {
    const noisePower = aWeightedPower(layer.re, layer.im, n, rate);
    const noiseGain = noisePower > 0 ? Math.sqrt((1 - p.tonal) * target / noisePower) : 0;
    const toneGain = tonePower > 0 ? Math.sqrt(p.tonal * target / tonePower) : 0;
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      re[k] = layer.re[k] * noiseGain + tone.re[k] * toneGain;
      im[k] = layer.im[k] * noiseGain + tone.im[k] * toneGain;
    }
    // Noise and tone are independent, so their powers add. Renormalize exactly anyway.
    const total = aWeightedPower(re, im, n, rate);
    if (total > 0) scaleSpectrum(re, im, Math.sqrt(target / total));
    return inverseReal(re, im);
  });
  // Slow swell, an integer number of cycles per loop so the loop stays seamless.
  if (swellDb > 0) {
    const seconds = n / rate;
    const cycles = Math.max(1, Math.round(seconds * 0.1));
    const gains = new Float32Array(n);
    let meanSquare = 0;
    for (let i = 0; i < n; i++) {
      const g = dbToAmp(-swellDb * (1 - Math.cos(TAU * cycles * i / n)) / 2);
      gains[i] = g; meanSquare += g * g / n;
    }
    const norm = 1 / Math.sqrt(meanSquare);
    for (const ch of channels) for (let i = 0; i < n; i++) ch[i] *= gains[i] * norm;
  }
  const headroomDb = peakGuard(channels);
  return { left: channels[0], right: channels[1], rate, params: { ...p, swellDb }, seconds: n / rate, headroomDb };
}

/** Scale all channels down together if any sample exceeds PEAK_LIMIT. Returns the reduction in dB (≤ 0). */
function peakGuard(channels) {
  let peak = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  if (peak <= PEAK_LIMIT) return 0;
  const scale = PEAK_LIMIT / peak;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= scale;
  return 20 * Math.log10(scale);
}

/** Raised-cosine fade in/out, for short comparison clips (not for loops). */
export function applyFades(samples, rate, fadeSeconds = 1.2) {
  const out = new Float32Array(samples);
  const len = Math.min(Math.floor(fadeSeconds * rate), Math.floor(out.length / 2));
  for (let i = 0; i < len; i++) {
    const g = .5 - .5 * Math.cos(Math.PI * i / len);
    out[i] *= g; out[out.length - 1 - i] *= g;
  }
  return out;
}

/** Half-octave noise band for the comfort contour, at the shared weighted reference level. */
export function renderBand(centerHz, opts = {}) {
  const rate = opts.rate || 44100;
  const n = 2 ** (opts.log2Length || 16);
  const random = rng(opts.seed ?? Math.round(centerHz));
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let k = 1; k < n / 2; k++) {
    const hz = k * rate / n;
    const w = Math.exp(-.5 * (Math.log2(hz / centerHz) / .18) ** 2);
    re[k] = w * random.gauss(); im[k] = w * random.gauss();
  }
  const power = aWeightedPower(re, im, n, rate);
  scaleSpectrum(re, im, Math.sqrt(10 ** (REFERENCE_DBFS / 10) / power));
  const mono = inverseReal(re, im);
  const headroomDb = peakGuard([mono]);
  return { left: mono, right: mono, rate, seconds: n / rate, headroomDb };
}

/**
 * Huggins-pitch headphone check stimulus (Milne et al., 2021): identical noise in both ears,
 * except a narrow band around 600 Hz whose phase is inverted in one ear. Over headphones a
 * faint pitch appears; over speakers it largely disappears.
 */
export function renderHuggins(withPitch, opts = {}) {
  const rate = opts.rate || 44100;
  const n = 2 ** (opts.log2Length || 15);
  const random = rng(opts.seed ?? 3);
  const centre = opts.centerHz || 600, bw = .06;
  const l = { re: new Float64Array(n), im: new Float64Array(n) };
  const r = { re: new Float64Array(n), im: new Float64Array(n) };
  for (let k = 1; k < n / 2; k++) {
    const hz = k * rate / n;
    const amp = hz < 60 || hz > 8000 ? 0 : 1;
    const a = amp * random.gauss(), b = amp * random.gauss();
    const flip = withPitch && hz >= centre * (1 - bw) && hz <= centre * (1 + bw) ? -1 : 1;
    l.re[k] = a; l.im[k] = b; r.re[k] = flip * a; r.im[k] = flip * b;
  }
  const power = aWeightedPower(l.re, l.im, n, rate);
  const factor = Math.sqrt(10 ** ((REFERENCE_DBFS - 4) / 10) / power);
  scaleSpectrum(l.re, l.im, factor); scaleSpectrum(r.re, r.im, factor);
  return {
    left: applyFades(inverseReal(l.re, l.im), rate, .05),
    right: applyFades(inverseReal(r.re, r.im), rate, .05),
    rate, seconds: n / rate,
  };
}

/** Weighted RMS level of a rendered channel, in dBFS (spectral estimate, same weighting as rendering). */
export function aWeightedLevelDb(samples, rate) {
  let n = 1;
  while (n * 2 <= samples.length) n *= 2;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = samples[i];
  fft(re, im);
  return 10 * Math.log10(Math.max(aWeightedPower(re, im, n, rate), 1e-30));
}

/** Least-squares spectral slope, in dB per octave, over a frequency range. */
export function spectralSlopeDb(samples, rate, loHz = 100, hiHz = 4000) {
  const size = 8192, hop = 4096, window = new Float64Array(size);
  for (let i = 0; i < size; i++) window[i] = .5 - .5 * Math.cos(TAU * i / (size - 1));
  const power = new Float64Array(size / 2);
  let frames = 0;
  for (let start = 0; start + size <= samples.length; start += hop) {
    const re = new Float64Array(size), im = new Float64Array(size);
    for (let i = 0; i < size; i++) re[i] = samples[start + i] * window[i];
    fft(re, im);
    for (let k = 1; k < size / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  // Average in octave-spaced bands so low frequencies are not outweighed by the many high bins.
  const xs = [], ys = [];
  for (let lo = loHz; lo * 2 ** (1 / 3) <= hiHz; lo *= 2 ** (1 / 3)) {
    const hi = lo * 2 ** (1 / 3);
    let sum = 0, count = 0;
    for (let k = Math.ceil(lo * size / rate); k < hi * size / rate; k++) { sum += power[k]; count++; }
    if (count) { xs.push(Math.log2(Math.sqrt(lo * hi))); ys.push(10 * Math.log10(sum / count / frames)); }
  }
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return num / den;
}
