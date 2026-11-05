import assert from 'node:assert/strict';
import {
  renderComfortLoop, renderBand, renderHuggins, paramsFromX, describeX, contourEqDb, contourCeilingDb,
  aWeightedLevelDb, spectralSlopeDb, applyFades, REFERENCE_DBFS, CONTOUR_BANDS, MODES, PEAK_LIMIT,
} from '../dist/comfort-engine.js';
import { PreferenceGP, startingPoint, normCdf, solve } from '../dist/preference-model.js';
import { rng } from '../dist/comfort-engine.js';

const rate = 44100;

// Parameter mapping covers the documented ranges.
assert.deepEqual(paramsFromX([0, 0, 0, 0]), { tiltDbPerOctave: -9, tonal: 0, swellDb: 0, cutoffHz: 300 });
const top = paramsFromX([1, 1, 1, 1]);
assert.equal(top.tiltDbPerOctave, -1.5); assert.equal(top.swellDb, 6); assert.ok(Math.abs(top.cutoffHz - 6000) < 1e-6);
assert.ok(describeX([.1, .1, 0, .2]).tilt.includes('dark'));

// Requested spectral tilt is what comes out (pure noise, open top end, measured 100–1500 Hz).
for (const [x0, expected] of [[0, -9], [.4, -6], [.8, -3]]) {
  const sound = renderComfortLoop([x0, 0, 0, 1], { rate, seed: 11 });
  const slope = spectralSlopeDb(sound.left, rate, 100, 1500);
  assert.ok(Math.abs(slope - expected) < 1.2, `tilt ${expected} measured ${slope.toFixed(2)}`);
}

// Every render lands on the same A-weighted reference level, whatever its colour or texture.
const levels = [[0, 0, 0, 0], [1, 0, 0, 1], [.5, 1, 0, .5], [.3, .5, 1, .3]].map(x => {
  const s = renderComfortLoop(x, { rate, seed: 3 });
  return aWeightedLevelDb(s.left, rate);
});
for (const level of levels) assert.ok(Math.abs(level - REFERENCE_DBFS) < 1, `level ${level.toFixed(2)} dBFS`);

// Loops are seamless: the jump across the loop boundary is no bigger than typical adjacent steps.
for (const x of [[.5, .5, 1, .5], [.2, 1, .5, .3]]) {
  const s = renderComfortLoop(x, { rate, seed: 9 });
  const steps = [];
  for (let i = 1; i < s.left.length; i++) steps.push(Math.abs(s.left[i] - s.left[i - 1]));
  steps.sort((a, b) => a - b);
  const boundary = Math.abs(s.left[0] - s.left[s.left.length - 1]);
  assert.ok(boundary <= steps[Math.floor(steps.length * .999)], 'loop boundary must not click');
  assert.ok(s.left.every(Number.isFinite) && s.right.every(Number.isFinite));
  assert.ok(s.left.every(v => Math.abs(v) <= .5));
}

// Attack mode caps the swell and softens the top end.
const attack = renderComfortLoop([.9, 0, 1, 1], { rate, mode: 'very', seed: 2 });
assert.equal(attack.params.swellDb, MODES.very.swellCapDb);
const normal = renderComfortLoop([.9, 0, 1, 1], { rate, mode: 'calm', seed: 2 });
// States are named by sensitivity; keys saved by earlier versions still map to the right state.
assert.deepEqual(Object.keys(MODES), ['calm', 'sensitive', 'very', 'recovering']);
assert.ok(Object.values(MODES).every(m => !/attack|migraine|warning|normal day/i.test(m.label)), 'state labels must not name disease phases');
assert.equal(renderComfortLoop([.9, 0, 1, 1], { rate, mode: 'attack', seed: 2 }).params.swellDb, MODES.very.swellCapDb, 'legacy key attack maps to very sensitive');
assert.ok(spectralSlopeDb(attack.left, rate, 1000, 8000) < spectralSlopeDb(normal.left, rate, 1000, 8000) - .5);

// Personal contour EQ only ever turns bands down, by at most 12 dB, relative to the median band.
const contour = CONTOUR_BANDS.map(hz => ({ hz, ceilingDb: hz >= 4000 ? -10 : 0 }));
assert.equal(contourCeilingDb(contour), 0);
assert.equal(contourEqDb(500, contour), 0);
assert.equal(contourEqDb(8000, contour), -10);
assert.ok(contourEqDb(3000, contour) < 0 && contourEqDb(3000, contour) > -10);
assert.equal(contourEqDb(8000, CONTOUR_BANDS.map(hz => ({ hz, ceilingDb: hz === 8000 ? -40 : 0 }))), -12);
assert.equal(contourEqDb(1000, []), 0);
const eqd = renderComfortLoop([1, 0, 0, 1], { rate, seed: 4, contour });
const flat = renderComfortLoop([1, 0, 0, 1], { rate, seed: 4 });
assert.ok(spectralSlopeDb(eqd.left, rate, 1000, 8000) < spectralSlopeDb(flat.left, rate, 1000, 8000) - 1);

// Calibration bands and the headphone check stimulus share the reference level.
for (const hz of [125, 1000, 8000]) assert.ok(Math.abs(aWeightedLevelDb(renderBand(hz, { rate }).left, rate) - REFERENCE_DBFS) < 1);
const hp = renderHuggins(true, { rate }), ref = renderHuggins(false, { rate });
assert.ok(hp.left.some((v, i) => Math.abs(v - hp.right[i]) > 1e-4), 'Huggins stimulus must differ between ears');
assert.ok(ref.left.every((v, i) => v === ref.right[i]), 'Reference intervals are identical in both ears');
const faded = applyFades(new Float32Array(1000).fill(1), 1000, .1);
assert.equal(faded[0], 0); assert.equal(faded[999], 0); assert.equal(faded[500], 1);

// No render ever needs clipping: every corner of the parameter cube, in every mode, stays under the peak limit.
for (const mode of Object.keys(MODES)) for (let i = 0; i < 16; i++) {
  const x = [i & 1, (i >> 1) & 1, (i >> 2) & 1, (i >> 3) & 1];
  const s = renderComfortLoop(x, { rate: 48000, mode, seed: 6, log2Length: 16 });
  assert.ok(s.left.every(v => Math.abs(v) <= PEAK_LIMIT + 1e-6) && s.right.every(v => Math.abs(v) <= PEAK_LIMIT + 1e-6));
  assert.ok(s.headroomDb <= 0 && s.headroomDb > -3, `corner ${x} ${mode} needed ${s.headroomDb.toFixed(2)} dB`);
}
for (const hz of CONTOUR_BANDS) assert.equal(renderBand(hz, { rate }).headroomDb, 0, `band ${hz} must not need scaling`);

// Linear algebra and maths helpers.
assert.ok(Math.abs(normCdf(-9) / 1.1286e-19 - 1) < .05, 'lower tail must not lose precision');
assert.ok(Math.abs(normCdf(0) - .5) < 1e-7 && Math.abs(normCdf(1.96) - .975) < 1e-4);
const x = solve([[4, 1], [2, 3]], [[1], [2]]);
assert.ok(Math.abs(x[0][0] - .1) < 1e-9 && Math.abs(x[1][0] - .6) < 1e-9);

// Questionnaire start points stay inside the unit cube and react to answers.
const hissSensitive = startingPoint({ high: 4 }), rumbleSensitive = startingPoint({ low: 4 });
assert.ok(hissSensitive[0] < rumbleSensitive[0] && hissSensitive[3] < startingPoint({})[3]);
assert.ok([hissSensitive, rumbleSensitive, startingPoint({ pulse: 4 })].flat().every(v => v >= 0 && v <= 1));

// Simulated listeners: does the learner find each person's own favourite in ~16 comparisons?
// Each simulated person has a different hidden favourite and answers with probit noise.
function simulate(target, seed, rounds = 16, learn = true) {
  const random = rng(seed);
  const utility = p => -4 * p.reduce((s, v, i) => s + (v - target[i]) ** 2, 0);
  const answer = (a, b) => utility(a) - utility(b) + .35 * random.gauss() > 0;
  const model = new PreferenceGP();
  let champ = [.5, .3, .2, .5];
  for (let r = 0; r < rounds; r++) {
    const challenger = learn ? model.nextChallenger({ seed: seed * 100 + r }) : Array.from({ length: 4 }, () => random());
    const [w, l] = answer(champ, challenger) ? [champ, challenger] : [challenger, champ];
    model.addComparison(w, l);
    champ = model.champion();
  }
  return { error: Math.sqrt(champ.reduce((s, v, i) => s + (v - target[i]) ** 2, 0)), model };
}
const people = [[.1, .1, 0, .2], [.9, .2, .1, .9], [.5, .9, .8, .4], [.2, .6, .1, .3], [.7, .1, .6, .7], [.4, .4, .3, .1]];
const learned = people.map((t, i) => simulate(t, i + 1).error);
const randomSearch = people.map((t, i) => simulate(t, i + 1, 16, false).error);
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const start = mean(people.map(t => Math.sqrt(t.reduce((s, v, i) => s + (v - [.5, .3, .2, .5][i]) ** 2, 0))));
assert.ok(mean(learned) < start * .6, `learner should move toward each person's favourite: ${mean(learned).toFixed(3)} vs start ${start.toFixed(3)}`);
assert.ok(mean(learned) <= mean(randomSearch) + .02, `active learning ${mean(learned).toFixed(3)} vs random ${mean(randomSearch).toFixed(3)}`);
const { model } = simulate(people[0], 1);
assert.ok(Number.isInteger(model.streak()) && model.streak() >= 0);
const restored = PreferenceGP.fromJSON(JSON.parse(JSON.stringify(model)));
assert.deepEqual(restored.champion(), model.champion());
assert.equal(PreferenceGP.fromJSON({ points: [[2, 0, 0]], comparisons: [{ w: 0, l: 5 }] }).points.length, 0);
// Dropping an invalid point must not shift other comparisons onto the wrong sounds.
const remapped = PreferenceGP.fromJSON({ points: [[.1, .1, .1, .1], 'bad', [.9, .9, .9, .9], [.5, .5, .5, .5]], comparisons: [{ w: 2, l: 3 }, { w: 1, l: 0 }], noise: -4, lengthscale: 1e9 });
assert.deepEqual(remapped.comparisons, [{ w: 1, l: 2, weight: 1 }]);
assert.deepEqual(remapped.points[remapped.comparisons[0].w], [.9, .9, .9, .9]);
assert.equal(remapped.noise, .5); assert.equal(remapped.lengthscale, .3);
const huge = PreferenceGP.fromJSON({ points: Array.from({ length: 500 }, (_, i) => [i / 500, .5, .5, .5]), comparisons: Array.from({ length: 499 }, (_, i) => ({ w: i, l: i + 1 })) });
assert.ok(huge.points.length <= 60 && huge.comparisons.length <= 120);
// Before any data, the first challenger contrasts the questionnaire's starting point.
const startX = startingPoint({ high: 4 });
const firstChallenger = new PreferenceGP().nextChallenger({ start: startX });
assert.ok(Math.abs(firstChallenger[0] - startX[0]) > .2 && firstChallenger[2] === startX[2]);
// Vetoed regions are never offered.
const vetoModel = PreferenceGP.fromJSON(model.toJSON());
const avoid = x => x[0] < .5;
for (let i = 0; i < 5; i++) assert.ok(!avoid(vetoModel.nextChallenger({ seed: i, exclude: avoid })));

console.log(`comfort engine ok · simulated listeners: start ${start.toFixed(3)} → learned ${mean(learned).toFixed(3)} (random ${mean(randomSearch).toFixed(3)}) distance from their favourite`);
