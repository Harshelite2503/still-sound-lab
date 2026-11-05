/**
 * Style sketch: an original, procedural instrumental built from a chord progression, key,
 * tempo and rhythmic feel. It borrows only uncopyrightable building blocks (triads, tempo,
 * metre); the melody is a seeded random walk over chord tones, never a copy of a song.
 */
import { fft } from './audio-engine.js';
import { aWeightedLevelDb } from './comfort-engine.js';

/** Every sketch, plain or matched, lands on this loudness-weighted level (dB, same weighting as the comfort engine). */
export const SKETCH_LEVEL_DB = -34;

const TAU = 2 * Math.PI;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DEGREES = { I: 0, bII: 1, II: 2, bIII: 3, III: 4, IV: 5, '#IV': 6, V: 7, bVI: 8, VI: 9, bVII: 10, VII: 11 };

/** Rhythmic feels. Keherwa: 8 beats; Dadra: 6 beats. Accents mark the soft percussion. */
export const FEELS = {
  keherwa: { label: 'Keherwa (8 beats)', beats: 8, accents: [1, 0, 0, .5, .7, 0, 0, .4], subdivision: 2 },
  dadra: { label: 'Dadra (6 beats)', beats: 6, accents: [1, 0, .4, .7, 0, .4], subdivision: 2 },
};
export const TEXTURES = { pad: 'Soft pad', santoor: 'Plucked, santoor-like', harmonium: 'Reed, harmonium-like' };

/**
 * A sung-vowel-like timbre for the melody: harmonics falling off gently, shaped by three
 * resonances near 600, 1700 and 2800 Hz (an open "aa"-like vowel). This gives the sketch
 * energy in the 1–4 kHz presence band where real singing lives, without noise or hiss.
 */
/** A soft, breathy-flute-like timbre (bansuri-style) for the plucked santoor texture. */
const FLUTE = [1, .32, .12, .06, .03];

export function voiceHarmonics(f0, rate) {
  const out = [];
  const formant = (f, centre, width) => Math.exp(-.5 * (Math.log2(f / centre) / width) ** 2);
  for (let h = 1; h * f0 < Math.min(6000, rate / 2 - 500) && h <= 24; h++) {
    const f = h * f0;
    out.push(h ** -.7 * (.15 + formant(f, 600, .45) + .7 * formant(f, 1700, .35) + .5 * formant(f, 2800, .3)));
  }
  const top = Math.max(...out);
  return out.map(v => v / top);
}

/** "bVII" → {offset: 10, quality: 'maj'}; "iv" → {offset: 5, quality: 'min'}. */
export function parseRoman(roman) {
  const m = /^([b#]?)([ivIV]+)$/.exec(String(roman).trim());
  if (!m) throw new Error(`Unknown chord numeral: ${roman}`);
  const upper = m[2].toUpperCase();
  const key = (m[1] || '') + upper;
  if (!(key in DEGREES)) throw new Error(`Unknown chord numeral: ${roman}`);
  return { offset: DEGREES[key], quality: m[2] === upper ? 'maj' : 'min' };
}

export function chordName(tonic, roman) {
  const { offset, quality } = parseRoman(roman);
  return PITCH_NAMES[(tonic + offset) % 12] + (quality === 'min' ? 'm' : '');
}

function rng(seed) {
  let s = (Math.floor(seed) >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

/**
 * Render a sketch.
 * @returns {{left: Float32Array, right: Float32Array, rate: number, chords: Array, seconds: number}}
 */
export function renderSketch({
  tonic = 9, progression = ['i', 'bVII', 'bVI', 'V'], bpm = 96, feel = 'keherwa', texture = 'pad',
  melody = true, percussion = 'soft', tuningCents = 0, cycles = 3, seed = 7, rate = 22050, mode = null,
  targetShape = null,
} = {}) {
  const f = FEELS[feel] || FEELS.keherwa;
  if (!Array.isArray(progression) || !progression.length || progression.length > 16) throw new Error('A progression needs 1–16 chords.');
  const chords = progression.map(r => ({ roman: r, ...parseRoman(r) }));
  cycles = clamp(Math.round(Number(cycles) || 1), 1, 8);
  tonic = ((Math.round(Number(tonic) || 0) % 12) + 12) % 12;
  const beat = 60 / clamp(bpm, 50, 160);
  const chordSeconds = beat * f.beats / 2; // two chords per taal cycle
  const total = chordSeconds * chords.length * cycles + 2;
  const n = Math.floor(total * rate);
  const L = new Float32Array(n), R = new Float32Array(n);
  const random = rng(seed);
  const hz = midi => 440 * 2 ** ((midi - 69) / 12 + tuningCents / 1200);
  const timeline = [];

  const addTone = (freq, start, dur, amp, { attack = .02, release = .3, harmonics = [1, .3, .1], pan = 0, vibrato = 0, decay = 0 }) => {
    const i0 = Math.max(0, Math.floor(start * rate)), i1 = Math.min(n, Math.floor((start + dur + release) * rate));
    const gl = Math.sqrt((1 - pan) / 2), gr = Math.sqrt((1 + pan) / 2);
    for (let i = i0; i < i1; i++) {
      const t = i / rate - start;
      const env = (t < attack ? .5 - .5 * Math.cos(Math.PI * t / attack) : 1)
        * (t > dur ? Math.max(0, 1 - (t - dur) / release) : 1) * (decay ? Math.exp(-t * decay) : 1);
      if (env <= 0) continue;
      const ph = TAU * freq * (t + (vibrato ? vibrato * Math.sin(TAU * 5.2 * t) / (TAU * 5.2) : 0));
      let v = 0;
      for (let h = 0; h < harmonics.length; h++) v += harmonics[h] * Math.sin((h + 1) * ph);
      v *= amp * env;
      L[i] += v * gl; R[i] += v * gr;
    }
  };

  const scaleMinor = [0, 2, 3, 5, 7, 8, 10], scaleMajor = [0, 2, 4, 5, 7, 9, 11];
  // Mode from the whole progression: a minor or major chord on the tonic decides; otherwise the first chord.
  const tonicChord = chords.find(c => c.offset === 0);
  const tonicMinor = mode ? mode === 'minor' : tonicChord ? tonicChord.quality === 'min' : chords[0].quality === 'min';
  let melodyMidi = 69 + ((tonic - 9 + 12) % 12) - 12 + 12; // around A4..G#5 region
  for (let cycle = 0; cycle < cycles; cycle++) {
    chords.forEach((c, ci) => {
      const start = 1 + (cycle * chords.length + ci) * chordSeconds;
      const root = (tonic + c.offset) % 12;
      const pcs = [root, (root + (c.quality === 'min' ? 3 : 4)) % 12, (root + 7) % 12];
      timeline.push({ name: PITCH_NAMES[root] + (c.quality === 'min' ? 'm' : ''), roman: c.roman, start, end: start + chordSeconds });
      // Chord voicing around C4–B4 (close position), bass an octave+ below.
      const voices = pcs.map(pc => 60 + ((pc - 0 + 12) % 12) - (pc > 7 ? 12 : 0));
      if (texture === 'pad') voices.forEach((m, k) => addTone(hz(m), start, chordSeconds, .05, { attack: .35, release: .5, harmonics: [1, .35, .12, .05], pan: (k - 1) * .35 }));
      if (texture === 'harmonium') voices.forEach((m, k) => addTone(hz(m), start, chordSeconds, .035, { attack: .12, release: .25, harmonics: [1, .6, .45, .3, .2, .14, .09, .06], pan: (k - 1) * .25 }));
      if (texture === 'santoor') {
        const steps = Math.round(f.beats / 2 * f.subdivision);
        for (let s = 0; s < steps; s++) {
          const m = voices[[0, 1, 2, 1][s % 4]] + (s % 8 >= 4 ? 12 : 0);
          addTone(hz(m), start + s * chordSeconds / steps, .05, .05, { attack: .006, release: .9, decay: 3.2, harmonics: [1, .25, .08, .04], pan: ((s % 3) - 1) * .3 });
        }
      }
      addTone(hz(36 + root + (root > 7 ? 0 : 12)), start, chordSeconds * .9, .09, { attack: .03, release: .3, harmonics: [1, .5, .15], decay: .6 });
      // Soft percussion on the taal accents: a low, pitch-steady "thump" with a gentle attack (no clicks).
      if (percussion !== 'off') {
        const beatsHere = f.beats / 2, offset = ((cycle * chords.length + ci) % 2) * beatsHere;
        for (let b = 0; b < beatsHere; b++) {
          const acc = f.accents[offset + b];
          if (acc > 0) addTone(hz(41 + (acc < .6 ? 7 : 0)), start + b * beat, .04, .12 * acc, { attack: .008, release: .25, decay: 9, harmonics: [1, .2] });
        }
      }
      // Original melody: chord tones on strong beats, scale steps between, small range, seeded.
      if (melody) {
        const scale = (c.quality === 'maj' && c.offset === 7 && tonicMinor) ? [0, 2, 3, 5, 7, 8, 11] : (tonicMinor ? scaleMinor : scaleMajor);
        const notes = Math.max(2, Math.round(f.beats / 2));
        for (let k = 0; k < notes; k++) {
          const strong = k === 0 || (notes > 3 && k === Math.floor(notes / 2));
          const candidates = [];
          for (let m = Math.max(64, melodyMidi - 5); m <= Math.min(81, melodyMidi + 5); m++) {
            const pc = ((m % 12) + 12) % 12, rel = (pc - tonic + 12) % 12;
            if (strong ? pcs.includes(pc) : scale.includes(rel)) candidates.push(m);
          }
          if (!candidates.length) continue;
          // Prefer small steps; occasionally rest.
          const weights = candidates.map(m => Math.exp(-Math.abs(m - melodyMidi) / 2));
          let r = random() * weights.reduce((a, b) => a + b, 0), pick = candidates[0];
          for (let i = 0; i < candidates.length; i++) { r -= weights[i]; if (r <= 0) { pick = candidates[i]; break; } }
          melodyMidi = pick;
          if (!strong && random() < .2) continue;
          const dur = chordSeconds / notes * (random() < .3 ? 1.8 : .9);
          addTone(hz(melodyMidi), start + k * chordSeconds / notes, dur, texture === 'santoor' ? .035 : .03, { attack: .05, release: .35, harmonics: texture === 'santoor' ? FLUTE : voiceHarmonics(hz(melodyMidi), rate), vibrato: .004 });
        }
      }
    });
  }
  // Optional: tilt the whole sketch toward a target long-term spectrum (e.g. a song set's median).
  let match = null;
  if (targetShape) {
    const first = matchSpectrum([L, R], rate, targetShape);
    // The second pass may only use what is left of each band's cap, so the totals hold across both passes.
    const second = matchSpectrum([L, R], rate, targetShape, { usedDb: first.gainsDb, lockedEmpty: first.bandsBefore.map(b => b.empty) });
    match = { ...second, meanAbsErrorBeforeDb: first.meanAbsErrorBeforeDb, coverage: first.coverage, bandsBefore: first.bandsBefore, gainsDb: first.gainsDb.map((g, i) => g + second.gainsDb[i]) };
  }
  // Fades, then normalise to a gentle level with peak headroom (same policy as the comfort engine).
  const fade = Math.floor(1.5 * rate);
  for (let i = 0; i < fade && i < n; i++) { const g = .5 - .5 * Math.cos(Math.PI * i / fade); L[i] *= g; R[i] *= g; L[n - 1 - i] *= g; R[n - 1 - i] *= g; }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  // Normalise loudness, not plain RMS: matching moves energy toward 1–4 kHz where hearing is most
  // sensitive, so a matched sketch at equal RMS would sound louder. Same weighting as the comfort
  // engine; same 0.35 peak ceiling.
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (L[i] + R[i]) / 2;
  const level = aWeightedLevelDb(mono, rate);
  const scale = Math.min(10 ** ((SKETCH_LEVEL_DB - level) / 20), .35 / (peak || 1));
  for (let i = 0; i < n; i++) { L[i] *= scale; R[i] *= scale; }
  return { left: L, right: R, rate, chords: timeline, seconds: total, match };
}

/* ---------------- Spectral matching ---------------- */
/** Third-octave band centres used by Song DNA (63 Hz … 8 kHz). */
export const BAND_CENTRES = (() => { const out = []; for (let fc = 63; fc <= 8000 * 1.01; fc *= 2 ** (1 / 3)) out.push(fc); return out; })();

/**
 * Long-term third-octave spectrum of a signal, as dB relative to its own mean over 200 Hz–4 kHz
 * (the same "shape" normalisation the zone uses, so loudness does not matter).
 */
export function spectrumShape(channels, rate) {
  const N = 4096, hop = 2048, n = channels[0].length, bins = N / 2;
  const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = .5 - .5 * Math.cos(TAU * i / N);
  const ltas = new Float64Array(bins);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let off = 0; off + N <= n; off += hop) {
    for (let i = 0; i < N; i++) { let v = 0; for (const ch of channels) v += ch[off + i]; re[i] = v / channels.length * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 1; k < bins; k++) ltas[k] += re[k] * re[k] + im[k] * im[k];
  }
  const binHz = rate / N;
  const bands = BAND_CENTRES.map(fc => {
    let p = 0;
    for (let k = Math.ceil(fc / 2 ** (1 / 6) / binHz); k <= Math.min(bins - 1, Math.floor(fc * 2 ** (1 / 6) / binHz)); k++) p += ltas[k];
    return { hz: fc, db: 10 * Math.log10(Math.max(p, 1e-20)) };
  });
  return normaliseShape(bands);
}

/**
 * Express band levels relative to the power mean of the 200 Hz–4 kHz bands, ignoring bands more
 * than 40 dB below the loudest (an empty band would otherwise drag a dB average down by tens of dB).
 * The zone figures use the same rule (analysis/plot_song_dna.py shape_db).
 */
export function normaliseShape(bands) {
  const loudest = Math.max(...bands.map(b => b.db));
  const ref = bands.filter(b => b.hz >= 200 && b.hz <= 4100 && b.db > loudest - 40);
  const mean = 10 * Math.log10(ref.reduce((a, b) => a + 10 ** (b.db / 10), 0) / Math.max(1, ref.length));
  return bands.map(b => ({ hz: b.hz, db: b.db - mean, empty: b.db <= loudest - 40 }));
}

/**
 * Gently EQ channels (in place) so their long-term spectrum moves toward `target`
 * ([{hz, db}] shape). Gains are capped at ±maxDb, smoothed across neighbouring bands, and
 * boosts are limited where the signal has little energy (no lifting of a near-silent floor).
 * Zero-phase FFT filtering with zero padding, so there is no wrap-around or click.
 */
export function matchSpectrum(channels, rate, target, { maxDb = 12, quietCapDb = 6, usedDb = null, lockedEmpty = null } = {}) {
  const before = spectrumShape(channels, rate);
  const want = BAND_CENTRES.map(fc => {
    // Interpolate the target at each band centre in log frequency.
    const t = [...target].sort((a, b) => a.hz - b.hz);
    if (fc <= t[0].hz) return t[0].db;
    if (fc >= t[t.length - 1].hz) return t[t.length - 1].db;
    let i = 0; while (t[i + 1].hz < fc) i++;
    const u = Math.log2(fc / t[i].hz) / Math.log2(t[i + 1].hz / t[i].hz);
    return t[i].db + u * (t[i + 1].db - t[i].db);
  });
  // Raw gains; a uniform offset is removed first (loudness is normalised later), so it cannot use up the cap.
  let raw = before.map((b, i) => (b.empty ? 0 : want[i] - b.db));
  const live = raw.filter((g, i) => !before[i].empty).sort((a, b) => a - b);
  const offset = live.length ? live[Math.floor(live.length / 2)] : 0;
  raw = raw.map((g, i) => (before[i].empty ? 0 : g - offset));
  // Per-band limits: ±maxDb overall; quiet bands may be lifted by at most quietCapDb; empty bands only cut.
  // When a previous pass already used part of a band's allowance, only the remainder is available.
  const limits = before.map((b, i) => {
    const prev = usedDb ? usedDb[i] : 0;
    // A band that was empty before any matching stays boost-locked in later passes too.
    const up = b.empty || lockedEmpty?.[i] ? 0 : (b.db < -30 ? Math.min(maxDb, quietCapDb) : maxDb);
    return [Math.min(0, -maxDb - Math.min(0, prev)), Math.max(0, up - Math.max(0, prev))]; // [remaining cut, remaining boost]
  });
  const clampBand = (g, i) => Math.max(limits[i][0], Math.min(limits[i][1], g));
  let gains = raw.map(clampBand);
  // Smooth across neighbours, then clamp again so smoothing cannot exceed any band's limits.
  gains = gains.map((g, i) => (gains[Math.max(0, i - 1)] + 2 * g + gains[Math.min(gains.length - 1, i + 1)]) / 4).map(clampBand);
  const n = channels[0].length;
  let size = 1; while (size < n + 8192) size *= 2;
  const lf = BAND_CENTRES.map(Math.log2);
  const gainAt = hz => {
    if (hz <= 0) return 1;
    const x = Math.log2(Math.max(hz, 1));
    let db;
    // Outside the measured bands, never boost (only follow a cut).
    if (x <= lf[0]) db = Math.min(0, gains[0]);
    else if (x >= lf[lf.length - 1]) db = Math.min(0, gains[gains.length - 1]);
    else { let i = 0; while (lf[i + 1] < x) i++; db = gains[i] + (x - lf[i]) / (lf[i + 1] - lf[i]) * (gains[i + 1] - gains[i]); }
    return 10 ** (db / 20);
  };
  const curve = new Float64Array(size / 2 + 1);
  for (let k = 0; k <= size / 2; k++) curve[k] = gainAt(k * rate / size);
  for (const ch of channels) {
    const re = new Float64Array(size), im = new Float64Array(size);
    for (let i = 0; i < n; i++) re[i] = ch[i];
    fft(re, im);
    for (let k = 0; k <= size / 2; k++) {
      const g = curve[k];
      re[k] *= g; im[k] *= g;
      if (k > 0 && k < size / 2) { re[size - k] *= g; im[size - k] *= g; }
    }
    for (let k = 0; k < size; k++) im[k] = -im[k];
    fft(re, im);
    for (let i = 0; i < n; i++) ch[i] = re[i] / size;
  }
  const after = spectrumShape(channels, rate);
  // Error over bands the sketch actually has (125 Hz–5 kHz), after removing a uniform offset.
  const err = arr => {
    const idx = BAND_CENTRES.map((fc, i) => i).filter(i => BAND_CENTRES[i] >= 125 && BAND_CENTRES[i] <= 5000 && !before[i].empty && !arr[i].empty);
    if (!idx.length) return NaN;
    const d = idx.map(i => arr[i].db - want[i]).sort((a, b) => a - b), med = d[Math.floor(d.length / 2)];
    return d.reduce((s, v) => s + Math.abs(v - med), 0) / d.length;
  };
  const coverage = before.filter((b, i) => BAND_CENTRES[i] >= 125 && BAND_CENTRES[i] <= 5000 && !b.empty).length / BAND_CENTRES.filter(fc => fc >= 125 && fc <= 5000).length;
  return { gainsDb: gains, meanAbsErrorBeforeDb: err(before), meanAbsErrorAfterDb: err(after), coverage, bandsBefore: before };
}
