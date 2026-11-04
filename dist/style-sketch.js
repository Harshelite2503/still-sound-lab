/**
 * Style sketch: an original, procedural instrumental built from a chord progression, key,
 * tempo and rhythmic feel. It borrows only uncopyrightable building blocks (triads, tempo,
 * metre); the melody is a seeded random walk over chord tones, never a copy of a song.
 */
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
          addTone(hz(melodyMidi), start + k * chordSeconds / notes, dur, .06, { attack: .04, release: .35, harmonics: [1, .18, .06], vibrato: .004 });
        }
      }
    });
  }
  // Fades, then normalise to a gentle level with peak headroom (same policy as the comfort engine).
  const fade = Math.floor(1.5 * rate);
  for (let i = 0; i < fade && i < n; i++) { const g = .5 - .5 * Math.cos(Math.PI * i / fade); L[i] *= g; R[i] *= g; L[n - 1 - i] *= g; R[n - 1 - i] *= g; }
  let sq = 0, peak = 0;
  for (let i = 0; i < n; i++) { sq += L[i] * L[i] + R[i] * R[i]; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const rms = Math.sqrt(sq / (2 * n)) || 1;
  // Same reference level as the comfort engine (−30 dBFS RMS), with the same 0.35 peak ceiling.
  const scale = Math.min(10 ** (-30 / 20) / rms, .35 / (peak || 1));
  for (let i = 0; i < n; i++) { L[i] *= scale; R[i] *= scale; }
  return { left: L, right: R, rate, chords: timeline, seconds: total };
}
