import assert from 'node:assert/strict';
import {
  biquadResponseDb, chainResponseDb, filterSettings, filterSections, speechBandCutDb, speechWeightedChangeDb,
  levelGainDb, makeupDb, automaticMakeupDb, compressorOutputDb, describeSettings, firstChallenger, vetoFilter,
  seededOrder, stateKey, GENTLE_PRESET, FILTER_STATES, LIMITS, SPEECH_GUARD_DB, SII_OCTAVE_IMPORTANCE,
  SII_THIRD_OCTAVE_IMPORTANCE, passesSpeechGuard, weightedGainDb,
} from '../dist/comfort-filter.js';
import {
  freshVideoState, sanitizeVideoState, studyExport, summarise, loadVideoState, saveVideoState, participantCode, VIDEO_KEY,
} from '../dist/video-store.js';
import { PreferenceGP } from '../dist/preference-model.js';
import { rng } from '../dist/comfort-engine.js';

const rate = 48000;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a.toFixed(3)} vs ${b.toFixed(3)}`);

// Biquad formulas behave as the Web Audio API defines them.
near(biquadResponseDb({ type: 'peaking', frequency: 3200, Q: .9, gain: -5 }, 3200, rate), -5, 1e-9, 'peaking hits its gain at the centre');
near(biquadResponseDb({ type: 'peaking', frequency: 3200, Q: .9, gain: -5 }, 100, rate), 0, .05, 'peaking leaves far bands alone');
near(biquadResponseDb({ type: 'highshelf', frequency: 6000, Q: 1, gain: -10 }, 6000, rate), -5, .01, 'shelf is at half its gain at the corner (S = 1)');
near(biquadResponseDb({ type: 'highshelf', frequency: 6000, Q: 1, gain: -10 }, 20000, rate), -10, .6, 'high shelf reaches its gain up top');
near(biquadResponseDb({ type: 'highshelf', frequency: 6000, Q: 1, gain: -10 }, 300, rate), 0, .05, 'high shelf leaves the low end');
near(biquadResponseDb({ type: 'lowshelf', frequency: 220, Q: 1, gain: -5 }, 30, rate), -5, .3, 'low shelf reaches its gain at the bottom');
near(biquadResponseDb({ type: 'highpass', frequency: 100, Q: -3.0103, gain: 0 }, 100, rate), -3.01, .02, 'Butterworth high-pass is −3 dB at its corner (Q in dB)');
assert.ok(biquadResponseDb({ type: 'highpass', frequency: 100, Q: -3.0103, gain: 0 }, 25, rate) < -20, 'high-pass removes deep rumble');
near(biquadResponseDb({ type: 'peaking', frequency: 1000, Q: 1, gain: 0 }, 1000, rate), 0, 1e-12, 'zero gain is a pass-through');

// Grid over the person's space and every state.
const grid = [];
for (let i = 0; i < 81; i++) grid.push([i % 3, Math.floor(i / 3) % 3, Math.floor(i / 9) % 3, Math.floor(i / 27) % 3].map(v => v / 2));
const freqs = Array.from({ length: 60 }, (_, i) => 20 * 1000 ** (i / 59)); // 20 Hz … 20 kHz
for (const state of Object.keys(FILTER_STATES)) for (const x of grid) {
  const st = filterSettings(x, state, { rate });
  // Only ever cuts: every section is a cut and the summed response never rises above 0 dB.
  for (const s of filterSections(st)) assert.ok(s.gain <= 0, `section ${s.type} must not boost`);
  for (const hz of freqs) assert.ok(chainResponseDb(st, hz, rate) <= 1e-6, `no boost at ${hz.toFixed(0)} Hz for ${x} ${state}`);
  // Hard limits hold.
  assert.ok(st.highShelfDb >= LIMITS.highShelfDb && st.presenceDb >= LIMITS.presenceDb && st.sibilanceDb >= LIMITS.sibilanceDb && st.lowShelfDb >= LIMITS.lowShelfDb);
  assert.ok(st.highpassHz <= LIMITS.highpassHz && st.ratio <= LIMITS.ratioMax && st.thresholdDb >= LIMITS.thresholdMinDb && st.makeupDb <= LIMITS.makeupMaxDb);
  // The speech guard holds everywhere.
  assert.ok(speechBandCutDb(st, rate) >= -SPEECH_GUARD_DB - 1e-6, `speech guard broken for ${x} ${state}: ${speechBandCutDb(st, rate).toFixed(2)}`);
  // The weighted speech change stays small: the guard keeps most of the speech spectrum's balance.
  assert.ok(speechWeightedChangeDb(st, rate) > -4.5, `speech-weighted change too large for ${x} ${state}`);
  // Never louder than the original, at any level: compression, makeup and state level together never add gain.
  for (let L = -90; L <= 0; L += 2) assert.ok(levelGainDb(st, L) <= 1e-9, `gain above 0 dB at ${L} dBFS for ${x} ${state}`);
  // Loud moments come down at least as much as quiet ones; quiet words are not pushed down more than the state's level cut.
  assert.ok(levelGainDb(st, -4) <= levelGainDb(st, -40) + 1e-9, 'loud moments are held back more than quiet ones');
  assert.ok(levelGainDb(st, -50) >= st.levelDb - 1e-9, 'quiet sound is cut by no more than the state level');
  // The importance-weighted speech guard holds.
  assert.ok(passesSpeechGuard(st, rate), `weighted speech guard broken for ${x} ${state}`);
}
assert.ok(Math.abs(Object.values(SII_OCTAVE_IMPORTANCE).reduce((a, b) => a + b, 0) - 1) < 1e-9, 'importance weights sum to 1');

// More sensitive states are never brighter, louder or less controlled for the same person.
const order = ['calm', 'sensitive', 'very'];
for (const x of grid) {
  const s = order.map(k => filterSettings(x, k, { rate }));
  for (let i = 1; i < s.length; i++) {
    assert.ok(chainResponseDb(s[i], 8000, rate) <= chainResponseDb(s[i - 1], 8000, rate) + 1e-9, `${order[i]} must be no brighter at 8 kHz for ${x}`);
    assert.ok(s[i].levelDb < s[i - 1].levelDb, 'more sensitive is quieter');
    assert.ok(s[i].thresholdDb <= s[i - 1].thresholdDb && s[i].ratio >= s[i - 1].ratio, 'more sensitive holds peaks back more');
  }
}
assert.deepEqual(filterSettings([.3, .3, .3, .3], 'recovering'), { ...filterSettings([.3, .3, .3, .3], 'sensitive'), state: 'recovering' });
assert.equal(stateKey('attack'), 'very'); assert.equal(stateKey('nonsense'), 'calm');

// The gentle preset is audibly gentler up top without touching the middle.
const preset = filterSettings(GENTLE_PRESET, 'calm', { rate });
assert.ok(chainResponseDb(preset, 8000, rate) < -4 && chainResponseDb(preset, 8000, rate) > -12, `preset 8 kHz ${chainResponseDb(preset, 8000, rate).toFixed(1)}`);
near(chainResponseDb(preset, 1000, rate), 0, 1, 'preset leaves 1 kHz nearly untouched');
assert.ok(chainResponseDb(preset, 40, rate) < -3, 'preset reduces deep rumble');
assert.ok(describeSettings(preset).length >= 4 && describeSettings(preset).every(s => typeof s === 'string' && s.length > 5));
// The research brief's defaults: the preset in calm is a −4 dB shelf, −2 dB presence and s-sound dips, 80 Hz low cut, 2:1.
near(preset.highShelfDb, -4, 1e-9, 'preset high shelf'); near(preset.presenceDb, -2, 1e-9, 'preset presence');
near(preset.sibilanceDb, -2, 1e-9, 'preset s-sounds'); near(preset.highpassHz, 80, 1e-9, 'preset low cut'); near(preset.ratio, 2, 1e-9, 'preset ratio');
assert.equal(preset.makeupDb, 0, 'calm never lifts quiet sound');
// When the weighted guard binds, it eases the shaping back to exactly the limit.
const forced = filterSettings([1, 1, 1, 1], 'very', { rate });
assert.ok(passesSpeechGuard(forced, rate));
if (forced.guardScale < 1) near(Math.min(weightedGainDb(forced, 1000, 4000, rate), weightedGainDb(forced, 160, 8000, rate)), -FILTER_STATES.very.guardDb, .02, 'eased to the guard');
near(Object.values(SII_THIRD_OCTAVE_IMPORTANCE).reduce((a, b) => a + b, 0), 1, .01, 'third-octave importance sums to about 1');
assert.deepEqual(filterSettings('bad', 'calm').x, GENTLE_PRESET.slice(), 'invalid points fall back to the preset');

// Compressor bookkeeping: hard-knee curve and the Web Audio automatic makeup it cancels.
assert.equal(compressorOutputDb(-30, -20, 4), -30);
assert.equal(compressorOutputDb(-4, -20, 4), -16);
near(automaticMakeupDb(-20, 4), -.6 * (-20 + 20 / 4), 1e-12, 'automatic makeup = 0.6 × −(curve at 0 dBFS)');
assert.equal(makeupDb(-16, 2), 0, 'no makeup when speech sits below the threshold');

// Tuning helpers.
const fc = firstChallenger(GENTLE_PRESET);
assert.ok(Math.abs(fc[0] - GENTLE_PRESET[0]) >= .3 && Math.abs(fc[1] - GENTLE_PRESET[1]) >= .3 && fc[2] === GENTLE_PRESET[2]);
const veto = vetoFilter([[.9, .9, .5, .5]]);
assert.ok(veto([.88, .92, .5, .5]) && !veto([.5, .4, .5, .3]));
const o = seededOrder(3, 12345);
assert.deepEqual([...o].sort(), [0, 1, 2]); assert.deepEqual(seededOrder(3, 12345), o);
const orders = new Set(Array.from({ length: 60 }, (_, i) => seededOrder(3, i + 1).join('')));
assert.ok(orders.size >= 5, 'blinding uses many different orders');

// Simulated listeners: tuning on content moves each one toward their own hidden favourite.
function simulate(target, seed, rounds = 8) {
  const random = rng(seed);
  const utility = p => -4 * p.reduce((s, v, i) => s + (v - target[i]) ** 2, 0);
  const model = new PreferenceGP();
  let champ = GENTLE_PRESET.slice();
  for (let r = 0; r < rounds; r++) {
    const ch = model.comparisons.length ? model.nextChallenger({ seed: seed * 100 + r, start: champ }) : firstChallenger(champ);
    const prefersChamp = utility(champ) - utility(ch) + .35 * random.gauss() > 0;
    prefersChamp ? model.addComparison(champ, ch) : model.addComparison(ch, champ);
    champ = model.champion();
  }
  return Math.hypot(...champ.map((v, i) => v - target[i]));
}
const people = [[.1, .1, .2, .1], [.9, .8, .5, .3], [.3, .9, .9, .6], [.8, .2, .1, .9], [.6, .6, .8, .1]];
const start = people.map(t => Math.hypot(...GENTLE_PRESET.map((v, i) => v - t[i])));
const learned = people.map((t, i) => simulate(t, i + 1));
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
assert.ok(mean(learned) < mean(start) * .75, `8 rounds should move toward each favourite: ${mean(learned).toFixed(3)} vs ${mean(start).toFixed(3)}`);

/* ---------- Storage and the study export ---------- */
const fixed = (() => { let i = 0; return () => (i++ * .137) % 1; })();
assert.match(participantCode(fixed), /^[A-Z2-9]{8}$/);
const fresh = freshVideoState();
assert.equal(fresh.schema, VIDEO_KEY); assert.equal(fresh.consent.study, false);
assert.throws(() => sanitizeVideoState({ schema: 'other' }));
assert.throws(() => studyExport(fresh), /consent/);

const raw = {
  ...fresh, state: 'attack', volumeDb: -80, device: 'radio',
  consent: { study: true, at: '2026-11-05T10:00:00Z' },
  personal: { x: [.2, .3, .4, .5], vetoes: [[.9, .9, .9, .9], 'bad'], model: { points: [], comparisons: [] } },
  rounds: [{ at: '2026-11-05T10:01:00Z', state: 'sensitive', a: [.1, .1, .1, .1], b: [.2, .2, .2, .2], choice: 'a', source: 'tab', title: 'secret tab title' },
    { at: 'nope', a: [0, 0, 0, 0], b: [1, 1, 1, 1], choice: 'a' }],
  sessions: [
    { id: 's2', startedAt: '2026-11-06T09:00:00Z', durationS: 600, source: 'file', content: 'lecture', device: 'wired', state: 'very', x: [.5, .5, .5, .5], personal: true, volumeDb: -6, bypassCount: 3, bypassS: 20, latencyMs: 30, feedback: { comfortable: 'yes', clear: 'yes', worse: false }, fileName: 'my-private-video.mp4', url: 'https://example.com' },
    { id: 's1', startedAt: '2026-11-05T09:00:00Z', durationS: 1e9, source: 'tab', content: 'gossip', state: 'calm', feedback: { comfortable: 'no', clear: 'somewhat', worse: true, note: 'free text' } },
    { id: 's1', startedAt: '2026-11-05T09:00:00Z', source: 'tab' },
  ],
  checks: [{ at: '2026-11-06T09:30:00Z', state: 'calm', source: 'file', matchedLevelDb: -28.4, ratings: [
    { condition: 'quieter', position: 0, comfort: 2, clarity: 4, worse: false },
    { condition: 'preset', position: 1, comfort: 3, clarity: 4, worse: false },
    { condition: 'personal', position: 2, comfort: 4, clarity: 4, worse: false }] },
  { at: '2026-11-06T09:40:00Z', ratings: [{ condition: 'quieter', position: 0, comfort: 9 }] }],
};
const clean = sanitizeVideoState(raw);
assert.equal(clean.state, 'very'); assert.equal(clean.volumeDb, -30); assert.equal(clean.device, 'unsure');
assert.equal(clean.personal.vetoes.length, 1); assert.equal(clean.rounds.length, 1); assert.equal(clean.rounds[0].title, undefined);
assert.deepEqual(clean.sessions.map(s => s.id), ['s1', 's2'], 'sorted by time, duplicates dropped');
assert.equal(clean.sessions[0].durationS, 24 * 3600); assert.equal(clean.sessions[0].content, 'unspecified');
assert.equal(clean.sessions[1].fileName, undefined); assert.equal(clean.sessions[1].url, undefined);
assert.equal(clean.sessions[0].feedback.note, undefined);
assert.equal(clean.checks.length, 1, 'incomplete checks are dropped');

const exported = studyExport(clean, { exportedAt: '2026-11-07T00:00:00Z' });
const text = JSON.stringify(exported);
for (const banned of ['secret tab title', 'my-private-video', 'example.com', 'free text']) assert.ok(!text.includes(banned), `export must not contain ${banned}`);
assert.equal(exported.participant, clean.participant);
assert.equal(exported.sessions[1].device, 'wired', 'export links device…');
assert.deepEqual(exported.sessions[1].x, [.5, .5, .5, .5], '…and the processing setting to each outcome');
assert.equal(exported.checks[0].ratings.find(r => r.condition === 'personal').comfort, 4);

const sum = summarise(clean, Date.parse('2026-11-08T09:00:00Z'));
assert.equal(sum.sessions, 2); assert.equal(sum.days, 2); assert.equal(sum.daysSinceLast, 2);
assert.equal(sum.comfortable, .5); assert.equal(sum.worse, .5);
assert.equal(sum.byCondition.personal.comfort, 4); assert.equal(sum.byCondition.quieter.comfort, 2);

const { trimModel } = await import('../dist/video-store.js');
const big = { points: Array.from({ length: 150 }, (_, i) => [i / 150, .5, .5, .5]), comparisons: Array.from({ length: 149 }, (_, i) => ({ w: i + 1, l: i })) };
const trimmed = trimModel(big);
assert.ok(trimmed.points.length <= 60 && trimmed.comparisons.length <= 120);
assert.deepEqual(trimmed.points[trimmed.comparisons.at(-1).w], big.points[149], 'the newest comparison survives trimming');
const reloaded = PreferenceGP.fromJSON(trimmed);
assert.equal(reloaded.comparisons.length, trimmed.comparisons.length, 'fromJSON keeps everything a trimmed model holds');
const store = new Map(); const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
assert.ok(saveVideoState(storage, clean));
assert.deepEqual(loadVideoState(storage), clean);
store.set(VIDEO_KEY, '{broken'); assert.equal(loadVideoState(storage).schema, VIDEO_KEY);

console.log(`comfort filter ok · ${grid.length * 4} settings checked · simulated tuning ${mean(start).toFixed(3)} → ${mean(learned).toFixed(3)} from each favourite in 8 rounds`);

/* ---------- Pre-registered study analysis ---------- */
const { analyse, bootstrapCi, CRITERIA } = await import('../analysis/video_study.mjs');
const ci = bootstrapCi([1, 1, 1, 1]); assert.deepEqual(ci, [1, 1]);
function participant(i, gainQuieter, gainPreset, clarityDrop = 0) {
  const checks = [0, 1].map(k => ({ at: '2026-11-10T10:00:00Z', state: 'calm', source: 'tab', matchedLevelDb: -30, ratings: [
    { condition: 'quieter', position: 0, comfort: 2, clarity: 4, worse: false },
    { condition: 'preset', position: 1, comfort: Math.min(5, 2 + gainQuieter - gainPreset + (k ? 0 : 0)), clarity: 4, worse: false },
    { condition: 'personal', position: 2, comfort: Math.min(5, 2 + gainQuieter), clarity: 4 - clarityDrop, worse: false }] }));
  return { schema: 'still-video-study-v1', participant: `P${String(i).padStart(7, '0')}`, checks, sessions: [] };
}
const tooFew = analyse([participant(1, 2, 1)]);
assert.equal(tooFew.verdict.primary, 'not enough participants yet');
const good = analyse(Array.from({ length: 24 }, (_, i) => participant(i, i % 3 === 0 ? 1 : 2, i % 2)));
assert.match(good.verdict.primary, /^met/); assert.equal(good.verdict.safety, 'within limit');
const unclear = analyse(Array.from({ length: 24 }, (_, i) => participant(i, 2, 1, 2)));
assert.equal(unclear.verdict.primary, 'not met', 'comfort gains do not count if clarity drops');
const presetEnough = analyse(Array.from({ length: 24 }, (_, i) => participant(i, 2, 0)));
assert.match(presetEnough.verdict.secondary, /preset may be enough/);
assert.equal(CRITERIA.minParticipants, 20);
console.log('video study analysis ok · criteria fixed before data');
// Re-exports: the newest export of a participant wins, whatever the file order.
const older = { ...participant(99, 0, 0), exportedAt: '2026-11-10T00:00:00Z' };
const newer = { ...participant(99, 2, 1), exportedAt: '2026-11-20T00:00:00Z' };
assert.equal(analyse([newer, older]).comfortVsQuieter.mean, 2, 'newest export kept');
assert.equal(analyse([older, newer]).comfortVsQuieter.mean, 2, 'newest export kept in either order');
// A cleared record (new dataset, same code) or a second browser is merged, not dropped.
const dsA = { ...participant(77, 2, 1), dataset: 'AAAA1111', exportedAt: '2026-11-10T00:00:00Z' };
const dsB = { ...participant(77, 2, 1), dataset: 'BBBB2222', exportedAt: '2026-11-12T00:00:00Z' };
dsA.checks = dsA.checks.map((c, i) => ({ ...c, at: `2026-11-10T10:0${i}:00Z` }));
dsB.checks = dsB.checks.map((c, i) => ({ ...c, at: `2026-11-12T10:0${i}:00Z` }));
const dsAagain = { ...dsA, exportedAt: '2026-11-09T00:00:00Z' };
assert.equal(analyse([dsA, dsB, dsAagain]).checks, 4, 'datasets merged; an older re-export of the same dataset adds nothing');
// Days are the person's own calendar days.
const late = { schema: 'still-video-study-v1', participant: 'TZTEST01', checks: [], sessions: [
  { id: 'a', startedAt: '2026-11-10T23:30:00Z', localDay: '2026-11-10' }, { id: 'b', startedAt: '2026-11-11T00:30:00Z', localDay: '2026-11-10' }] };
assert.equal(analyse([late]).realUse.returnedLaterDay, 0, 'one local evening is one day');
console.log('re-export handling ok');
