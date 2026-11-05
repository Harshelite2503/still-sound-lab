// Validates the Song DNA analyser on synthetic songs whose key, chords, tempo and tuning are known.
import assert from 'node:assert/strict';
import { analyzeSong, findAndalusian, romanNumeral, CHORDS, estimateKey, buildProfile, compareToProfile } from '../dist/song-dna.js';

const RATE = 22050;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const parse = name => { const m = name.endsWith('m'); const root = NAMES.indexOf(m ? name.slice(0, -1) : name); return { root, quality: m ? 'min' : 'maj', pcs: [root, (root + (m ? 3 : 4)) % 12, (root + 7) % 12] }; };

/** A small synthetic "song": harmonic-rich chord pad, bass on the root, a melody on chord tones, soft kick on each beat. */
function makeSong({ chords, secondsPerChord = 2.5, bpm = 96, cents = 0, repeats = 6, seed = 1, stereo = 1 }) {
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const total = chords.length * secondsPerChord * repeats, n = Math.floor(total * RATE);
  const L = new Float32Array(n), R = new Float32Array(n);
  const hz = midi => 440 * 2 ** ((midi - 69) / 12 + cents / 1200);
  const truth = [];
  for (let r = 0; r < repeats; r++) chords.forEach((name, ci) => {
    const c = parse(name), t0 = (r * chords.length + ci) * secondsPerChord;
    truth.push({ name, start: t0, end: t0 + secondsPerChord });
    const i0 = Math.floor(t0 * RATE), i1 = Math.min(n, Math.floor((t0 + secondsPerChord) * RATE));
    const voices = c.pcs.map((pc, k) => 48 + 12 + ((pc - 0 + 12) % 12) + (k === 0 ? 0 : 0)).map(m => hz(m));
    const bass = hz(36 + c.root);
    const melody = [hz(72 + c.pcs[0]), hz(72 + c.pcs[1]), hz(72 + c.pcs[2]), hz(72 + c.pcs[1])];
    for (let i = i0; i < i1; i++) {
      const t = i / RATE, local = t - t0;
      const env = Math.min(1, local / .05) * Math.min(1, (secondsPerChord - local) / .05);
      let v = 0;
      for (const f of voices) for (let h = 1; h <= 5; h++) v += .05 / h * Math.sin(2 * Math.PI * f * h * t);
      for (let h = 1; h <= 3; h++) v += .08 / h * Math.sin(2 * Math.PI * bass * h * t);
      const note = melody[Math.floor(local / (secondsPerChord / 4)) % 4];
      v += .05 * Math.sin(2 * Math.PI * note * t) + .02 * Math.sin(4 * Math.PI * note * t);
      L[i] += v * env; R[i] += v * env * stereo;
    }
  });
  // Kick on every beat: decaying 60 Hz thump with a click, plus a little noise.
  const beat = 60 / bpm;
  for (let b = 0; b * beat < total; b++) {
    const i0 = Math.floor(b * beat * RATE);
    for (let j = 0; j < .12 * RATE && i0 + j < n; j++) {
      const t = j / RATE, e = Math.exp(-t * 40);
      const v = .25 * e * Math.sin(2 * Math.PI * 60 * t) + .03 * e * (rand() * 2 - 1);
      L[i0 + j] += v; R[i0 + j] += v;
    }
  }
  return { channels: [L, R], sampleRate: RATE, truth };
}

function chordAccuracy(result, truth) {
  let right = 0, total = 0;
  for (let t = .25; t < truth[truth.length - 1].end; t += .25) {
    const want = truth.find(x => t >= x.start + .3 && t < x.end - .3);
    if (!want) continue;
    const got = result.chords.segments.find(x => t >= x.start && t < x.end);
    total++; if (got?.name === want.name) right++;
  }
  return right / total;
}

// 1. Andalusian cadence in A minor, tuned +18 cents (like a tape running a little fast), 96 BPM.
const andalusian = makeSong({ chords: ['Am', 'G', 'F', 'E'], cents: 18, bpm: 96 });
const a = analyzeSong(andalusian);
assert.equal(a.key.name, 'Am', `key ${a.key.name}`);
assert.ok(Math.abs(a.tuning.cents - 18) < 6, `tuning ${a.tuning.cents.toFixed(1)} cents`);
assert.ok(Math.abs(a.tempo.bpm - 96) < 3 || Math.abs(a.tempo.bpm - 192) < 5 || Math.abs(a.tempo.bpm - 48) < 2, `tempo ${a.tempo.bpm.toFixed(1)}`);
const accA = chordAccuracy(a, andalusian.truth);
assert.ok(accA > .85, `chord accuracy ${accA.toFixed(2)}`);
assert.ok(a.chords.andalusian.full.length >= 4, `andalusian hits ${a.chords.andalusian.full.length}`);
assert.ok(a.chords.fourgrams.some(g => g.progression === 'i → bVII → bVI → V'), JSON.stringify(a.chords.fourgrams.slice(0, 3)));
assert.ok(a.stereo.correlation > .99, 'identical channels should correlate');

// 2. A major-key I–V–vi–IV song in D, in tune, 120 BPM, with no Andalusian cadence.
const pop = makeSong({ chords: ['D', 'A', 'Bm', 'G'], cents: 0, bpm: 120, seed: 9, stereo: .6 });
const p = analyzeSong(pop);
assert.equal(p.key.name, 'D', `key ${p.key.name}`);
assert.ok(Math.abs(p.tuning.cents) < 6, `tuning ${p.tuning.cents.toFixed(1)}`);
assert.ok(Math.abs(p.tempo.bpm - 120) < 3 || Math.abs(p.tempo.bpm - 60) < 2, `tempo ${p.tempo.bpm.toFixed(1)}`);
const accP = chordAccuracy(p, pop.truth);
assert.ok(accP > .85, `chord accuracy ${accP.toFixed(2)}`);
assert.equal(p.chords.andalusian.full.length, 0);
assert.ok(p.chords.fourgrams.some(g => /^(I → V → vi → IV|V → vi → IV → I|vi → IV → I → V|IV → I → V → vi)$/.test(g.progression)));

// 3. Detuning by −35 cents must not shift the detected chords or key.
const flat = analyzeSong(makeSong({ chords: ['Am', 'G', 'F', 'E'], cents: -35, seed: 3 }));
assert.equal(flat.key.name, 'Am'); assert.ok(Math.abs(flat.tuning.cents + 35) < 6, `tuning ${flat.tuning.cents.toFixed(1)}`);

// 4. Regression: a broadband noise floor (as in real recordings) must not pull the key toward
// pitch classes covered by an extra octave at the analysis-range edges (the old A-minor bias).
for (const [chords, want] of [[['F#m', 'E', 'D', 'C#'], 'F#m'], [['C#', 'G#', 'A#m', 'F#'], 'C#']]) {
  const song = makeSong({ chords, seed: 11, cents: -12 });
  let s = 99;
  const noise = () => { s = (s * 48271) % 2147483647; return s / 2147483647 * 2 - 1; };
  for (const ch of song.channels) for (let i = 0; i < ch.length; i++) ch[i] += .05 * noise();
  const r = analyzeSong(song);
  assert.equal(r.key.name, want, `noisy ${want} song read as ${r.key.name} (profile-only ${r.key.profileOnly})`);
  assert.ok(chordAccuracy(r, song.truth) > .8, `noisy ${want} chord accuracy ${chordAccuracy(r, song.truth).toFixed(2)}`);
}

// Helpers.
assert.equal(romanNumeral(CHORDS.find(c => c.name === 'G'), 9), 'bVII');
assert.equal(romanNumeral(CHORDS.find(c => c.name === 'E'), 9), 'V');
assert.equal(romanNumeral(CHORDS.find(c => c.name === 'Am'), 9), 'i');
assert.equal(romanNumeral(CHORDS.find(c => c.name === 'Bm'), 2), 'vi');
const seg = names => names.map((name, i) => ({ ...parse(name), name, start: i * 2, end: i * 2 + 2 }));
assert.equal(findAndalusian(seg(['Dm', 'C', 'A#', 'A'])).full.length, 1, 'transposed Andalusian (Dm C Bb A)');
assert.equal(findAndalusian(seg(['Am', 'G', 'F', 'G'])).full.length, 0);
assert.equal(findAndalusian(seg(['Am', 'G', 'F', 'G'])).partial.length, 1);
assert.equal(estimateKey([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1].map(v => v + .1)).name, 'C');

// Profiles and comparison behave sensibly: a song is closer to a profile of its own kind.
const prof = buildProfile([a, flat, analyzeSong(makeSong({ chords: ['Am', 'G', 'F', 'E'], cents: 5, seed: 5, bpm: 92 }))]);
assert.equal(prof.andalusianSongs, 3);
const self = compareToProfile(analyzeSong(makeSong({ chords: ['Am', 'G', 'F', 'E'], seed: 7, bpm: 94, cents: 10 })), prof);
const other = compareToProfile(p, prof);
assert.ok(self.overall > other.overall, `own-kind ${self.overall.toFixed(2)} vs other ${other.overall.toFixed(2)}`);

console.log(`song DNA ok · Andalusian song: ${a.key.name}, ${a.tuning.cents.toFixed(1)} cents, ${a.tempo.bpm.toFixed(1)} BPM, chords ${(accA * 100).toFixed(0)}% · pop song: ${p.key.name}, ${p.tempo.bpm.toFixed(1)} BPM, chords ${(accP * 100).toFixed(0)}% · compare ${self.overall.toFixed(2)} vs ${other.overall.toFixed(2)}`);

// Closed loop: a generated style sketch is analysed back into the progression it was built from.
const { renderSketch, chordName, parseRoman } = await import('../dist/style-sketch.js');
assert.equal(chordName(9, 'bVII'), 'G'); assert.equal(chordName(9, 'V'), 'E'); assert.equal(chordName(9, 'i'), 'Am');
assert.deepEqual(parseRoman('iv'), { offset: 5, quality: 'min' });
assert.throws(() => parseRoman('X'));
for (const [texture, feel] of [['pad', 'keherwa'], ['santoor', 'dadra'], ['harmonium', 'keherwa']]) {
  const sketch = renderSketch({ tonic: 9, progression: ['i', 'bVII', 'bVI', 'V'], bpm: 92, texture, feel, cycles: 4, seed: 3 });
  let peak = 0; for (const v of sketch.left) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak <= .35 + 1e-6 && sketch.left.every(Number.isFinite), `${texture} peak ${peak}`);
  const back = analyzeSong({ channels: [sketch.left, sketch.right], sampleRate: sketch.rate });
  const acc = chordAccuracy(back, sketch.chords);
  assert.ok(acc > .75, `${texture}/${feel} sketch chords recovered ${acc.toFixed(2)}`);
  assert.ok(back.key.name === 'Am' || (back.key.relativeAmbiguity && back.key.runnerUp === 'Am'), `${texture} sketch key ${back.key.name} (runner-up ${back.key.runnerUp})`);
  assert.ok(back.chords.andalusian.full.length >= 2, `${texture} Andalusian ${back.chords.andalusian.full.length}`);
  console.log(`sketch ${texture}/${feel}: chords recovered ${(acc * 100).toFixed(0)}%, key ${back.key.name}, tempo ${back.tempo.bpm.toFixed(0)}`);
}

// Home note is folded by pitch class only: tuning drift either way must not jump an octave.
const sharpA = analyzeSong(makeSong({ chords: ['Am', 'G', 'F', 'E'], cents: 10, seed: 21 }));
const flatA = analyzeSong(makeSong({ chords: ['Am', 'G', 'F', 'E'], cents: -10, seed: 21 }));
assert.ok(Math.abs(1200 * Math.log2(sharpA.key.tonicHz / flatA.key.tonicHz)) < 40, `tonicHz ${sharpA.key.tonicHz.toFixed(1)} vs ${flatA.key.tonicHz.toFixed(1)}`);
assert.ok(sharpA.tempo.alternatives.every(b => Math.abs(b - sharpA.tempo.bpm / 2) < 1 || Math.abs(b - sharpA.tempo.bpm * 2) < 1));

// Andalusian: "in key" only when the walk starts on the song's home chord.
const segs = names => names.map((name, i) => ({ ...parse(name), name, start: i * 2, end: i * 2 + 2 }));
assert.equal(findAndalusian(segs(['Am', 'G', 'F', 'E']), 9).fullInKey, 1);
assert.equal(findAndalusian(segs(['Bm', 'A', 'G', 'D']), 2).partialInKey, 0, 'vi → V → IV in D is the shape, not the in-key walk');
assert.equal(findAndalusian(segs(['Bm', 'A', 'G', 'D']), 2).partial.length, 1);

// Silence is rejected instead of producing a confident key.
assert.throws(() => analyzeSong({ channels: [new Float32Array(22050 * 20), new Float32Array(22050 * 20)], sampleRate: 22050 }), /silent|quiet/);

// Sketch melody stays in key: the scale follows the whole progression (not just its first chord),
// and register limits never push a note out of key.
function pitchClassEnergy(sig, rate, tonic) {
  const out = new Array(12).fill(0);
  for (let midi = 64; midi <= 81; midi++) {
    const f = 440 * 2 ** ((midi - 69) / 12), w = 2 * Math.cos(2 * Math.PI * f / rate);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < sig.length; i++) { const s0 = sig[i] + w * s1 - s2; s2 = s1; s1 = s0; }
    out[((midi % 12) - tonic + 12) % 12] += s1 * s1 + s2 * s2 - w * s1 * s2;
  }
  const top = Math.max(...out);
  return out.map(v => 10 * Math.log10(v / top + 1e-12));
}
const melodyOnly = renderSketch({ tonic: 9, progression: ['bVII', 'i', 'bVII'], texture: 'none', percussion: 'off', melody: true, cycles: 4, seed: 5 });
const e = pitchClassEnergy(melodyOnly.left, melodyOnly.rate, 9);
assert.ok(e[9] < -25 && e[11] < -25, `A-minor melody over bVII–i must avoid F#/G# (F# ${e[9].toFixed(0)} dB, G# ${e[11].toFixed(0)} dB)`);
for (const [tonic, name] of [[3, 'E♭'], [8, 'A♭']]) {
  const m = renderSketch({ tonic, progression: ['I', 'IV', 'V', 'I'], texture: 'none', percussion: 'off', melody: true, cycles: 4, seed: 6 });
  const pe = pitchClassEnergy(m.left, m.rate, tonic);
  for (const out of [1, 3, 6, 8, 10]) assert.ok(pe[out] < -25, `${name} major melody has an out-of-key note (degree ${out}: ${pe[out].toFixed(0)} dB)`);
}
assert.throws(() => renderSketch({ progression: [] }), /1–16 chords/);
assert.ok(renderSketch({ progression: ['i', 'V', 'i'], cycles: 2.6, feel: 'dadra' }).chords.length === 9);

// Shared comfort rules: a harder state is never louder, fades are never under 3 s.
const cs = await import('../dist/comfort-state.js');
const base = { schema: 'still-profile-v1', baseLevelDb: -10, trims: { attack: -4 }, mode: 'normal', contour: [] };
assert.equal(cs.outputLevelDb(base), -10);
assert.equal(cs.outputLevelDb({ ...base, mode: 'attack' }), -10 - 14 - 4);
assert.equal(cs.outputLevelDb({ ...base, mode: 'attack', trims: { attack: 50 } }), -24, 'trims can only lower');
assert.equal(cs.outputLevelDb(null), 0);
assert.ok(cs.fadeInSeconds(null) >= 3 && cs.fadeInSeconds({ mode: 'attack', answers: { sudden: 4 } }) === 9);

// Published data stays consistent and clean: cross-check matches this build; no file names or timelines.
const fs = await import('node:fs');
const published = JSON.parse(fs.readFileSync(new URL('../dist/data/song-dna/kishore-kumar.json', import.meta.url)));
const raw = fs.readFileSync(new URL('../dist/data/song-dna/kishore-kumar.json', import.meta.url), 'utf8');
assert.ok(!/"file"|segments|mp3\.pm/i.test(raw), 'published profile must not contain file names or chord timelines');
const crosscheck = JSON.parse(fs.readFileSync(new URL('../data/song-dna/kishore-kumar-crosscheck.json', import.meta.url)));
assert.equal(crosscheck.profileBuiltAt, published.builtAt, 'librosa cross-check must be re-run after rebuilding the profile');
for (const row of crosscheck.songs) assert.equal(row.key.js, published.songs.find(s => s.name === row.name)?.key.name, `stale cross-check key for ${row.name}`);
console.log('song DNA extras ok · tonic stable across tuning, in-key Andalusian, silence rejected, sketch melodies in key, comfort rules, data consistent');

// Spectral matching: a sketch moves toward a target long-term spectrum, safely.
const { matchSpectrum, spectrumShape, voiceHarmonics, BAND_CENTRES } = await import('../dist/style-sketch.js');
const target = BAND_CENTRES.map(hz => ({ hz, db: hz < 125 ? -15 : hz <= 2500 ? 0 : -6 * Math.log2(hz / 2500) * 1.5 }));
const plain = renderSketch({ progression: ['i', 'bVII', 'bVI', 'V'], texture: 'harmonium', cycles: 3, seed: 8 });
const matched = renderSketch({ progression: ['i', 'bVII', 'bVI', 'V'], texture: 'harmonium', cycles: 3, seed: 8, targetShape: target });
assert.equal(plain.match, null);
assert.ok(matched.match.meanAbsErrorAfterDb < 2 && matched.match.meanAbsErrorAfterDb < matched.match.meanAbsErrorBeforeDb, `match error ${matched.match.meanAbsErrorBeforeDb.toFixed(1)} → ${matched.match.meanAbsErrorAfterDb.toFixed(1)} dB`);
let mpk = 0; for (const v of matched.left) mpk = Math.max(mpk, Math.abs(v));
assert.ok(mpk <= .35 + 1e-6 && matched.left.every(Number.isFinite), `matched peak ${mpk}`);
assert.ok(matched.match.gainsDb.every(g => Math.abs(g) <= 24 + 1e-9), 'two passes of at most ±12 dB');
const backMatched = analyzeSong({ channels: [matched.left, matched.right], sampleRate: matched.rate });
assert.ok(chordAccuracy(backMatched, matched.chords) > .75, 'matching keeps the harmony recognisable');
// Matching never invents energy where there is none: a pure low tone is not turned into hiss.
const tone = new Float32Array(22050 * 4).map((_, i) => .1 * Math.sin(2 * Math.PI * 220 * i / 22050));
const toneCopy = [Float32Array.from(tone), Float32Array.from(tone)];
matchSpectrum(toneCopy, 22050, BAND_CENTRES.map(hz => ({ hz, db: 0 })));
// Absolute check: the share of energy above 4 kHz stays negligible (a capped boost of a near-empty band).
const { fft } = await import('../dist/audio-engine.js');
const highShare = sig => {
  const N = 65536, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = sig[i] * (.5 - .5 * Math.cos(2 * Math.PI * i / N));
  fft(re, im);
  let hi = 0, all = 0;
  for (let k = 1; k < N / 2; k++) { const p = re[k] ** 2 + im[k] ** 2; all += p; if (k * 22050 / N > 4000) hi += p; }
  return hi / all;
};
assert.ok(highShare(toneCopy[0]) < 1e-6, `energy above 4 kHz after matching: ${highShare(toneCopy[0]).toExponential(2)}`);
void spectrumShape;
const vh = voiceHarmonics(220, 22050);
assert.ok(vh.length > 10 && Math.max(...vh) === 1 && vh.every(v => v >= 0));
console.log(`spectral matching ok · harmonium sketch ${matched.match.meanAbsErrorBeforeDb.toFixed(1)} → ${matched.match.meanAbsErrorAfterDb.toFixed(1)} dB from target`);

// Review fixes: equal loudness for plain vs matched, caps hold across both passes, empty bands only cut.
{
  const { aWeightedLevelDb } = await import('../dist/comfort-engine.js');
  const { SKETCH_LEVEL_DB } = await import('../dist/style-sketch.js');
  const zoneData = JSON.parse(fs.readFileSync(new URL('../dist/data/song-dna/kishore-kumar-zone.json', import.meta.url)));
  const zoneTarget = zoneData.spectral.bandsHz.map((hz, i) => ({ hz, db: zoneData.spectral.medianDb[i] }));
  const weighted = s => { const m = new Float32Array(s.left.length); for (let i = 0; i < m.length; i++) m[i] = (s.left[i] + s.right[i]) / 2; return aWeightedLevelDb(m, s.rate); };
  for (const [texture, melodyOn] of [['pad', true], ['santoor', true], ['harmonium', true], ['pad', false]]) {
    const base = { tonic: 9, progression: ['i', 'bVII', 'bVI', 'V'], bpm: 115, texture, melody: melodyOn, cycles: 3, seed: 3 };
    const p = renderSketch(base), m = renderSketch({ ...base, targetShape: zoneTarget });
    assert.ok(Math.abs(weighted(p) - weighted(m)) < .5, `${texture}: matched ${weighted(m).toFixed(1)} vs plain ${weighted(p).toFixed(1)} dB`);
    assert.ok(weighted(p) <= SKETCH_LEVEL_DB + .5, `${texture} plain level ${weighted(p).toFixed(1)}`);
    const shape = m.match.bandsBefore; // the matcher's own view of the unmatched sketch
    m.match.gainsDb.forEach((g, i) => {
      assert.ok(g <= 12 + 1e-9 && g >= -12 - 1e-9, `${texture} band ${i} total gain ${g.toFixed(1)}`);
      if (shape[i].empty) assert.ok(g <= 1e-9, `${texture} empty band ${BAND_CENTRES[i].toFixed(0)} Hz boosted ${g.toFixed(1)} dB`);
      else if (shape[i].db < -30) assert.ok(g <= 6 + .5, `${texture} quiet band ${BAND_CENTRES[i].toFixed(0)} Hz boosted ${g.toFixed(1)} dB`);
    });
    assert.ok(m.match.meanAbsErrorAfterDb < m.match.meanAbsErrorBeforeDb, `${texture} matching should help`);
  }
  // The zone file must come from the current profile build.
  assert.equal(zoneData.builtFrom, published.builtAt, 'zone file is stale: re-run analysis/plot_song_dna.py');
  assert.equal(zoneData.songs, published.songs.filter(s => !s.flags.length).length);
  console.log('zone and matching safety ok · equal loudness, caps hold across passes, empty bands never boosted');
}

// Song vector index.
{
  const idx = await import('../dist/song-index.js');
  const set = published.songs.filter(s => !s.flags.length);
  const a = idx.buildIndex(set), b = idx.buildIndex(set);
  assert.deepEqual(a.items.map(i => i.vector), b.items.map(i => i.vector), 'index must be deterministic');
  for (const it of a.items) assert.ok(Math.abs(Math.hypot(...it.vector) - 1) < 1e-9, 'unit vectors');
  for (const s of set) {
    const hit = idx.search(a, idx.vectorFor(a, s), { k: 1 })[0];
    assert.equal(hit.name, s.name); assert.ok(hit.similarity > .999999);
  }
  // The key-free block is unchanged by any transposition of the scale profile.
  const prof = set[0].degreeProfile, rotated = prof.map((_, i) => prof[(i + 5) % 12]);
  idx.scaleShape(prof).forEach((v, i) => assert.ok(Math.abs(v - idx.scaleShape(rotated)[i]) < 1e-12));
  // Map: projecting an indexed vector lands on its stored coordinates.
  const p = idx.projectToMap(a, a.items[3].vector);
  assert.ok(Math.abs(p[0] - a.map.coords[3][0]) < 1e-9 && Math.abs(p[1] - a.map.coords[3][1]) < 1e-9);
  // Published index and evaluation come from the current profile build, and beat chance by a wide margin.
  const pubIndex = JSON.parse(fs.readFileSync(new URL('../dist/data/song-dna/kishore-kumar-index.json', import.meta.url)));
  const ev = JSON.parse(fs.readFileSync(new URL('../data/song-dna/kishore-kumar-index-eval.json', import.meta.url)));
  assert.equal(pubIndex.builtFrom, published.builtAt, 'index is stale: re-run analysis/eval_song_index.mjs');
  assert.equal(ev.builtFrom, published.builtAt);
  assert.deepEqual(pubIndex.weights, idx.DEFAULT_WEIGHTS, 'published index uses the default weights');
  // The browser rebuilds the index from code; it must match the published vectors the evaluation describes.
  const rebuilt = idx.buildIndex(set, { weights: pubIndex.weights, name: pubIndex.name });
  assert.deepEqual(rebuilt.items.map(i => i.name), pubIndex.items.map(i => i.name));
  rebuilt.items.forEach((it, i) => it.vector.forEach((v, j) => assert.ok(Math.abs(v - pubIndex.items[i].vector[j]) < 2e-4, 'index code changed: re-run analysis/eval_song_index.mjs')));
  // Each block (except mode) is centred on the set, so its weight measures differences between songs.
  for (const b of ['spectrum', 'scale', 'scaleShape', 'chords']) { const m = a.items[0].blocks[b].map((_, j) => a.items.reduce((s, it) => s + it.blocks[b][j], 0) / a.items.length); assert.ok(m.every(v => Math.abs(v) < 1e-9), `${b} block centred`); }
  assert.ok(ev.results.default.recallAt1 >= 5 * ev.randomBaseline.recallAt1, 'index should find same-song copies far above chance');
  console.log(`song index ok · deterministic, key-free block rotation-invariant, recall@1 ${(ev.results.default.recallAt1 * 100).toFixed(0)}% vs ${(ev.randomBaseline.recallAt1 * 100).toFixed(0)}% chance`);
}
