import { analyzeSong, compareToProfile, songDistance, PROFILE_FEATURES, PITCH_NAMES } from './song-dna.js';
import { renderSketch, chordName, normaliseShape, FEELS, TEXTURES } from './style-sketch.js';
import { createSafetyChain, MODES } from './comfort-engine.js';
import { readComfortProfile, outputLevelDb, fadeInSeconds, modeOf, PROFILE_KEY } from './comfort-state.js';
import { encodeWav } from './audio-engine.js';

const $ = id => document.getElementById(id);
const say = m => { $('status').textContent = m; };
const pct = v => `${Math.round(v * 100)}%`;
const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const DEGREE_LABELS = ['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'];
const ns = 'http://www.w3.org/2000/svg';
const RATINGS_KEY = 'still-sketch-ratings-v1';
let data, core, profile, zone = null;

function svgEl(svg, name, attrs, text) { const e = document.createElementNS(ns, name); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; svg.append(e); return e; }
function bars(container, rows, { max } = {}) {
  container.replaceChildren();
  const top = max ?? Math.max(...rows.map(r => r.value), 1e-9);
  for (const r of rows) {
    const row = document.createElement('div'); row.className = 'bar-row';
    const label = document.createElement('span'); label.textContent = r.label;
    const track = document.createElement('div'); track.className = 'bar-track';
    const fill = document.createElement('i'); fill.style.width = `${(r.value / top) * 100}%`; if (r.highlight) fill.className = 'hl';
    track.append(fill);
    const val = document.createElement('small'); val.textContent = r.text;
    row.append(label, track, val); container.append(row);
  }
}
const featureValue = (f, v) => (Number.isFinite(v) ? (f.scale ? (v * f.scale).toFixed(0) : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)) + (f.unit ? ' ' + f.unit : '') : '—');

/* ---------------- Profile ---------------- */
function renderFrequencies() {
  const svg = $('freq-chart'); svg.replaceChildren();
  const W = 460, H = 190, L = 20, R = 20, T = 20, B = 40;
  // Columns centred on each note: tonicHz is folded by pitch class (A3 … G#4) and ±50 cents of tuning.
  const lo = 220 * 2 ** (-1 / 24);
  const x = hz => L + Math.log2(hz / lo) * (W - L - R);
  for (let i = 0; i <= 12; i++) {
    svgEl(svg, 'line', { x1: x(lo * 2 ** (i / 12)), x2: x(lo * 2 ** (i / 12)), y1: T, y2: H - B, class: 'grid' });
    if (i < 12) svgEl(svg, 'text', { x: x(220 * 2 ** (i / 12)), y: H - B + 16, 'text-anchor': 'middle' }, PITCH_NAMES[(9 + i) % 12]);
  }
  svgEl(svg, 'text', { x: L, y: H - 6 }, '≈214 Hz'); svgEl(svg, 'text', { x: W - R, y: H - 6, 'text-anchor': 'end' }, '≈428 Hz');
  core.forEach((s, i) => {
    const cy = T + 10 + (i % 6) * ((H - B - T - 20) / 5);
    const c = svgEl(svg, 'circle', { cx: x(s.key.tonicHz), cy, r: 5, class: s.key.mode === 'minor' ? 'dot minor' : 'dot major' });
    svgEl(c, 'title', {}, `${s.name}: ${s.key.name}, ${s.key.tonicHz.toFixed(1)} Hz (${s.tuning.cents > 0 ? '+' : ''}${s.tuning.cents.toFixed(0)} cents)`);
  });
  const hzs = core.map(s => s.key.tonicHz), cents = core.map(s => s.tuning.cents);
  const off = cents.filter(c => Math.abs(c) >= 20).length;
  const columns = new Set(core.map(s => s.key.tonic)).size;
  $('freq-answer').textContent = 'No single one.';
  $('freq-detail').textContent = `Their home notes fall on ${columns} of the 12 notes of the octave, and ${off} of ${core.length} are tuned 20+ cents away from modern A = 440 Hz.`;
  const near432 = cents.filter(c => Math.abs(c - 1200 * Math.log2(432 / 440)) <= 10).length;
  $('freq-text').textContent = `Each dot is one song’s home note (tonic), folded into one octave from A to G♯. Filled dots are minor keys. Tuning offsets range from ${Math.min(...cents).toFixed(0)} to +${Math.max(...cents).toFixed(0)} cents, possibly from tape or transfer speed and instrument tuning (not verified for these recordings). ${near432} of ${core.length} sit within 10 cents of “432 Hz” tuning, about what chance would give. If one frequency were the secret, the dots would bunch together. They don’t.`;
  svg.setAttribute('aria-label', `Home notes of ${core.length} songs: ${core.map(s => `${s.key.name} ${s.key.tonicHz.toFixed(0)} hertz`).join(', ')}`);
}

function renderKeys() {
  const { modes, keys } = profile;
  $('mode-title').textContent = modes.minor === modes.major ? `${modes.major} major, ${modes.minor} minor` : modes.minor > modes.major ? `${modes.minor} of ${core.length} in minor keys` : `${modes.major} of ${core.length} in major keys`;
  const minorChord = profile.features.minorShare.median;
  $('mode-text').textContent = `Minor chords fill a median ${pct(minorChord)} of chord time, across ${Object.keys(keys).length} different keys. Several minor-key songs still move to a major V chord (E in A minor), the bright pull back home. Read the exact letters loosely: key finders often land a fifth away or on the relative major/minor.`;
  bars($('key-bars'), Object.entries(keys).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ label: k, value: n, text: `${n} song${n === 1 ? '' : 's'}`, highlight: k.endsWith('m') })));
}

function renderRomans() {
  bars($('roman-bars'), profile.romanShares.slice(0, 9).map(r => ({ label: r.roman.replace(/b/g, '♭'), value: r.share, text: pct(r.share), highlight: ['i', 'bVII', 'bVI', 'V'].includes(r.roman) })));
}

function renderDegrees() {
  const svg = $('degree-chart'); svg.replaceChildren();
  const W = 460, H = 190, L = 14, B = 26, T = 12, bw = (W - 2 * L) / 12;
  const { major, minor } = profile.degreeProfileByMode;
  const top = Math.max(...major, ...minor);
  for (let i = 0; i < 12; i++) {
    for (const [k, v] of [[0, major[i]], [1, minor[i]]]) {
      const h = (v / top) * (H - B - T);
      svgEl(svg, 'rect', { x: L + i * bw + 3 + k * (bw - 6) / 2, y: H - B - h, width: (bw - 6) / 2 - 1, height: h, rx: 2, class: k ? 'bar minor' : 'bar majorbar' });
    }
    svgEl(svg, 'text', { x: L + i * bw + bw / 2, y: H - 8, 'text-anchor': 'middle' }, DEGREE_LABELS[i]);
  }
  const fmtP = a => a.map((v, i) => `${DEGREE_LABELS[i]} ${(v * 100).toFixed(0)}%`).join(', ');
  svg.setAttribute('aria-label', `Scale-note energy. Major-key songs: ${fmtP(major)}. Minor-key songs: ${fmtP(minor)}.`);
}

function renderAndalusian() {
  const n = x => (Array.isArray(x) ? x.length : Number(x) || 0);
  const shape = core.filter(s => n(s.chords.andalusian.full) + n(s.chords.andalusian.partial) > 0);
  const inKey = core.filter(s => (s.chords.andalusian.fullInKey || 0) + (s.chords.andalusian.partialInKey || 0) > 0);
  const full = core.filter(s => n(s.chords.andalusian.full) > 0);
  $('andalusian-pill').textContent = `${inKey.length} IN KEY · ${shape.length} AS A SHAPE · OF ${core.length}`;
  $('andalusian-text').textContent = `Am → G → F → E is i → ♭VII → ♭VI → V: a stepwise walk down from the home chord to a bright major V. Flamenco, “Hit the Road Jack” and many film songs use it. In these ${core.length} recordings, the walk starting on the song’s own home chord (i → ♭VII → ♭VI) was found in ${inKey.length}${inKey.length ? ` (${inKey.map(s => s.name).join(', ')})` : ''}. The same shape (a minor chord, then two major chords each a whole step lower) appears somewhere in ${shape.length}, but usually on other degrees, such as vi → V → IV in a major key. The complete four-chord walk, in any position, appears in ${full.length}. Songs that have it use it only 1–3 times, so it is an occasional colour, not a formula. Automatic chord labels make mistakes, so treat these counts as rough.`;
  const list = $('progressions'); list.replaceChildren();
  for (const p of profile.progressionsSongsWith.slice(0, 10)) {
    const div = document.createElement('div'); div.className = 'prog';
    const b = document.createElement('b'); b.textContent = p.progression.replace(/b/g, '♭');
    const s = document.createElement('small'); s.textContent = `in ${p.songsWith} songs · with A as home: ${p.progression.split(' → ').map(r => { try { return chordName(9, r); } catch { return r; } }).join(' → ')}`;
    div.append(b, s); list.append(div);
  }
}

function renderFeatureTable() {
  const t = $('feature-table'); t.replaceChildren();
  const head = t.insertRow(); ['Measure', 'Typical (middle half)', 'Median', 'What it means'].forEach(h => { const th = document.createElement('th'); th.textContent = h; head.append(th); });
  const MEANING = {
    tempo: 'Moderate walking-to-swinging pace. Beat trackers can double or halve tempo.',
    tuning: 'Distance from A = 440 Hz tuning. Shown, not scored: possibly tape/transfer speed or instrument tuning (not verified).',
    minorShare: 'How much of the chord time is minor.', changes: 'How often the harmony moves.',
    unique: 'Chords that fill at least 2% of the song.', tilt: 'Balance across 1/3-octave bands (100 Hz–5 kHz). 0 ≈ pink noise; more negative is darker.',
    centroid: 'Spectral centre of mass (brightness).', presence: 'Energy share where voices are most audible.',
    lufs: 'Average loudness of this file. Remasters can change it a lot.', lra: 'How much the loudness moves between quiet and loud parts.',
    crest: 'Peaks versus average in these files. Higher means less squashed by compression; remasters change it.', stereo: '1 = mono-like. Lower = wider stereo.',
    onsets: 'Note and beat attacks per second.', repetition: 'Share of ~4-second passages that recur later.',
  };
  for (const f of PROFILE_FEATURES) {
    const st = profile.features[f.key]; const r = t.insertRow();
    r.insertCell().textContent = f.label;
    r.insertCell().textContent = `${featureValue(f, st.q1)} – ${featureValue(f, st.q3)}`;
    r.insertCell().textContent = featureValue(f, st.median);
    r.insertCell().textContent = MEANING[f.key] || '';
  }
}

function renderSongTable() {
  const t = $('song-table'); t.replaceChildren();
  const head = t.insertRow(); ['Song', 'Length', 'Key', 'Tuning', 'Tempo', 'Minor', 'Andalusian', 'Loudness', 'Closest in set'].forEach(h => { const th = document.createElement('th'); th.textContent = h; head.append(th); });
  for (const s of data.songs) {
    const r = t.insertRow(); if (s.flags.length) r.className = 'flagged';
    const near = data.nearest.find(n => n.name === s.name);
    [s.name + (s.flags.length ? ' *' : ''), `${Math.floor(s.duration / 60)}:${String(Math.round(s.duration % 60)).padStart(2, '0')}`, s.key.name, `${s.tuning.cents > 0 ? '+' : ''}${s.tuning.cents.toFixed(0)}¢`, `${s.tempo.bpm.toFixed(0)}`, pct(s.chords.minorShare),
      s.chords.andalusian.fullInKey ? 'full, in key' : s.chords.andalusian.partialInKey ? 'partial, in key' : s.chords.andalusian.full || s.chords.andalusian.partial ? 'shape only' : '—', `${s.loudness.integratedLufs.toFixed(1)} LUFS`, near ? near.closest.map(c => c.name).join(', ') : '—'].forEach(v => { r.insertCell().textContent = v; });
  }
  $('flag-note').textContent = data.flagged.length ? `* Left out of the profile: ${data.flagged.map(f => `${f.name} (${f.flags.includes('short-or-partial') ? 'short, low-quality excerpt' : 'DJ remix, not the original recording'})`).join('; ')}.` : '';
}

function chordColour(name) {
  if (name === 'N') return 'transparent';
  const minor = name.endsWith('m'), root = PITCH_NAMES.indexOf(minor ? name.slice(0, -1) : name);
  return `hsl(${(root * 30 + 90) % 360} ${minor ? 28 : 42}% ${minor ? 42 : 60}%)`;
}
function renderTimeline(song) {
  const box = $('timeline'); box.replaceChildren();
  const total = song.duration;
  for (const seg of song.chords.segments) {
    const d = document.createElement('i');
    d.style.left = `${(seg.start / total) * 100}%`; d.style.width = `${((seg.end - seg.start) / total) * 100}%`;
    d.style.background = chordColour(seg.name);
    d.title = `${seg.name} · ${seg.start.toFixed(1)}–${seg.end.toFixed(1)} s`;
    if ((seg.end - seg.start) / total > .025) d.textContent = seg.name;
    box.append(d);
  }
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', `Chord timeline for ${song.name}: ${song.chords.shares.slice(0, 5).map(c => `${c.chord} ${pct(c.share)}`).join(', ')}`);
}

/* ---------------- Compare ---------------- */
async function decodeToAnalysisRate(file) {
  const raw = await file.arrayBuffer();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const decoded = await ctx.decodeAudioData(raw);
    if (decoded.duration > 12 * 60) throw new Error('Please choose a song shorter than 12 minutes.');
    const rate = 22050, length = Math.ceil(decoded.duration * rate);
    const off = new OfflineAudioContext(2, length, rate);
    const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
    const out = await off.startRendering();
    return { channels: [out.getChannelData(0), out.getChannelData(1)], sampleRate: rate };
  } finally { ctx.close?.(); }
}

let analysisToken = 0;
$('compare-file').addEventListener('change', async e => {
  const file = e.target.files?.[0]; e.target.value = '';
  if (!file) return;
  const token = ++analysisToken;
  if (file.size > 60 * 1024 * 1024) { say('Please choose a file under 60 MB.'); return; }
  try {
    say('Decoding the whole song in this browser…'); await new Promise(r => setTimeout(r, 30));
    $('compare-file').disabled = true;
    const pcm = await decodeToAnalysisRate(file);
    if (token !== analysisToken) return;
    say('Measuring key, chords, tempo and sound… the page may pause briefly.'); await new Promise(r => setTimeout(r, 30));
    const t0 = performance.now();
    const song = analyzeSong({ ...pcm, name: file.name.replace(/\.[^.]+$/, '') });
    const cmp = compareToProfile(song, profile);
    if (token !== analysisToken) return;
    renderCompare(song, cmp);
    say(`Analysed ${(song.duration / 60).toFixed(1)} minutes in ${((performance.now() - t0) / 1000).toFixed(1)} s. Nothing was uploaded.`);
  } catch (err) { say(err.message || 'This file could not be decoded here. Try an MP3 or WAV.'); }
  finally { if (token === analysisToken) $('compare-file').disabled = false; }
});

function renderCompare(song, cmp) {
  $('compare-result').hidden = false;
  $('compare-score').textContent = pct(cmp.overall);
  const loo = data.leaveOneOut.map(x => x.overall).sort((a, b) => a - b);
  const typical = [loo[Math.floor(loo.length * .25)], loo[Math.floor(loo.length * .75)]];
  $('compare-context').textContent = `For reference: each of the ${core.length} profile songs, compared with the other ${core.length - 1}, scores ${pct(typical[0])}–${pct(typical[1])} (middle half); three calm ambient recordings scored 21–39%. Half the score is 13 measured features (tempo, loudness, brightness, chord density, repetition…), so a song with the same chords in a modern mix can score low.`;
  $('compare-title').textContent = song.name;
  renderTimeline(song);
  const facts = $('compare-facts'); facts.replaceChildren();
  const closest = core.map(s => ({ s, d: songDistance(song, s, profile) })).sort((a, b) => a.d - b.d).slice(0, 3);
  const add = t => { const li = document.createElement('li'); li.textContent = t; facts.append(li); };
  add(`Key ${song.key.name}${song.key.relativeAmbiguity ? ` (or ${song.key.runnerUp})` : ''}, tuned ${song.tuning.cents > 0 ? '+' : ''}${song.tuning.cents.toFixed(0)} cents from A440; home note ≈ ${song.key.tonicHz.toFixed(0)} Hz.`);
  add(`${song.tempo.bpm.toFixed(0)} BPM, ${pct(song.chords.minorShare)} minor chords, ${song.chords.uniqueChords} main chords.`);
  const an = song.chords.andalusian;
  add(an.fullInKey ? `Contains the Andalusian walk on its home chord (${an.full.find(h => h.inKey).chords}).` : an.partialInKey ? `Contains part of the Andalusian walk on its home chord (${an.partial.find(h => h.inKey).chords}).` : an.full.length + an.partial.length ? `Has the Andalusian shape on other degrees (${(an.full[0] || an.partial[0]).chords}).` : 'No Andalusian walk detected.');
  add(`Scale-note similarity ${pct(Math.max(0, cmp.scaleSimilarity))}, chord-role similarity ${pct(cmp.harmonySimilarity)}.`);
  add(`Closest profile songs: ${closest.map(c => c.s.name).join(', ')}.`);
  const t = $('compare-table'); t.replaceChildren();
  const head = t.insertRow(); ['Measure', 'Your song', 'Profile middle half', ''].forEach(h => { const th = document.createElement('th'); th.textContent = h; head.append(th); });
  for (const r of cmp.rows) {
    const f = PROFILE_FEATURES.find(x => x.key === r.key); const row = t.insertRow();
    row.insertCell().textContent = r.label;
    row.insertCell().textContent = featureValue(f, r.value);
    row.insertCell().textContent = `${featureValue(f, r.q1)} – ${featureValue(f, r.q3)}`;
    row.insertCell().textContent = !Number.isFinite(r.z) ? '—' : r.within ? 'within' : r.value > r.q3 ? 'higher' : 'lower';
  }
}

/* ---------------- Style sketch ---------------- */
// Playback follows the comfort profile (comfort-state.js): same output level, at least a 3 s
// fade-in, the state's softer top end, and a level slider that can only go quieter.
let ctx, output, shelf, active = null, lastSketch = null, sketchSeed = 7, playToken = 0;
const dbToAmp = db => 10 ** (db / 20);
function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    output = createSafetyChain(ctx);
    shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 3000; shelf.connect(output);
  }
  return ctx;
}
const comfort = () => readComfortProfile();
const sketchLevelDb = () => outputLevelDb(comfort()) + Number($('sk-level').value);
function applyShelf() { if (shelf) shelf.gain.setTargetAtTime(MODES[modeOf(comfort())].shelfDb, ctx.currentTime, .2); }
function currentAmp(h) {
  const t = ctx.currentTime;
  if (t >= h.rampEnd) return h.toAmp;
  if (t <= h.rampStart) return h.fromAmp;
  return h.fromAmp + (h.toAmp - h.fromAmp) * (t - h.rampStart) / (h.rampEnd - h.rampStart);
}
function rampTo(h, amp, seconds) {
  const t = ctx.currentTime, from = currentAmp(h), end = t + Math.max(.02, seconds);
  h.gain.gain.cancelScheduledValues(t); h.gain.gain.setValueAtTime(from, t); h.gain.gain.linearRampToValueAtTime(amp, end);
  Object.assign(h, { fromAmp: from, toAmp: amp, rampStart: t, rampEnd: end });
}
function stopSketch(fade = 1.5) {
  playToken++;
  const h = active; active = null;
  if (!h || !ctx) return;
  rampTo(h, 0, fade);
  h.src.onended = null;
  try { h.src.stop(ctx.currentTime + fade + .05); } catch {}
}
function setSketchLevel() {
  if (!active || !ctx) return;
  rampTo(active, dbToAmp(sketchLevelDb()), Math.min(1.5, Math.max(.4, active.rampEnd - ctx.currentTime)));
}
function sketchParams() {
  const prog = JSON.parse($('sk-progression').value);
  return { tonic: Number($('sk-key').value), progression: prog, bpm: Number($('sk-bpm').value), feel: $('sk-feel').value, texture: $('sk-texture').value, percussion: $('sk-perc').value, melody: $('sk-melody').checked, matched: !!(zone && $('sk-match').checked), seed: sketchSeed, cycles: 3, v: 2 };
}
async function playSketch() {
  stopSketch(.3);
  const token = playToken;
  const params = sketchParams();
  say('Composing…'); await new Promise(r => setTimeout(r, 20));
  if (token !== playToken) return;
  const c = audio(); await c.resume();
  if (token !== playToken) return;
  // Render at 22.05 kHz (all musical content is below 11 kHz) so spectral matching stays fast; the browser resamples.
  const s = renderSketch({ ...params, rate: 22050, targetShape: params.matched ? zoneTarget() : null });
  if (token !== playToken) return;
  const buffer = c.createBuffer(2, s.left.length, s.rate);
  buffer.getChannelData(0).set(s.left); buffer.getChannelData(1).set(s.right);
  applyShelf();
  const src = c.createBufferSource(), gain = c.createGain();
  src.buffer = buffer; gain.gain.setValueAtTime(0, c.currentTime);
  src.connect(gain); gain.connect(shelf);
  const h = { src, gain, fromAmp: 0, toAmp: 0, rampStart: 0, rampEnd: 0 };
  const level = sketchLevelDb(), fade = fadeInSeconds(comfort());
  rampTo(h, dbToAmp(level), fade);
  src.onended = () => { if (active === h) active = null; };
  src.start(); active = h;
  lastSketch = { buffer, params, levelDb: level };
  $('sk-download').disabled = false;
  const mode = MODES[modeOf(comfort())];
  $('sk-chords').textContent = `Playing ${s.seconds.toFixed(0)} s: ${s.chords.slice(0, params.progression.length).map(x => x.name).join(' → ')} (repeats), ${params.bpm} BPM, ${FEELS[params.feel].label}, at ${level > 0 ? '+' : ''}${level.toFixed(0)} dB relative to your quiet reference with a ${fade.toFixed(1)} s fade-in${mode.offsetDb ? ` (${mode.label.toLowerCase()})` : ''}.`;
  if (s.match) $('sk-chords').textContent += ` Matched to your songs' sound: on average ${s.match.meanAbsErrorAfterDb.toFixed(1)} dB from their median spectrum (was ${s.match.meanAbsErrorBeforeDb.toFixed(1)} dB)${s.match.coverage < .95 ? `, across the ${Math.round(s.match.coverage * 100)}% of bands this texture fills` : ''}. Plain and matched versions play at the same loudness.`;
  say('Your sketch fades in. Rate it below to teach Still your taste.');
}
function readRatings() {
  try { const r = JSON.parse(localStorage.getItem(RATINGS_KEY) || '[]'); return Array.isArray(r) ? r.filter(x => x && Array.isArray(x.params?.progression) && [-1, 0, 1].includes(x.rating)) : []; } catch { return []; }
}
function renderTaste() {
  const ratings = readRatings();
  if (!ratings.length) { $('sk-taste').textContent = 'No ratings yet.'; return; }
  const by = new Map();
  for (const r of ratings) { const k = r.params.progression.join(' → '); const v = by.get(k) || { n: 0, sum: 0 }; v.n++; v.sum += r.rating; by.set(k, v); }
  const best = [...by.entries()].sort((a, b) => b[1].sum / b[1].n - a[1].sum / a[1].n)[0];
  $('sk-taste').textContent = `${ratings.length} rating${ratings.length === 1 ? '' : 's'} saved on this device. Highest so far: ${best[0].replace(/b/g, '♭')} (${best[1].n} rating${best[1].n === 1 ? '' : 's'}). With more ratings, Still can learn which progressions, tempos and textures calm you.`;
  renderZoneTest(ratings);
}
const current = ratings => ratings.filter(r => r.params.v === 2 && typeof r.params.matched === 'boolean');
function renderZoneTest(ratings = readRatings()) {
  if (!zone) return;
  // Paired comparisons only: the same sketch (same seed and settings) heard both ways. Anything else
  // mixes in other differences (progression, texture, tempo) and cannot say what matching did.
  const same = (a, b) => ['progression', 'tonic', 'bpm', 'feel', 'texture', 'percussion', 'melody', 'seed'].every(k => JSON.stringify(a[k]) === JSON.stringify(b[k]));
  const rs = current(ratings), diffs = [];
  for (const m of rs.filter(r => r.params.matched)) {
    const p = [...rs].reverse().find(r => !r.params.matched && same(r.params, m.params));
    if (p) diffs.push(m.rating - p.rating);
  }
  const mean = diffs.reduce((a, b) => a + b, 0) / Math.max(1, diffs.length);
  $('zone-test').textContent = !diffs.length
    ? 'No paired comparison yet. Play a sketch, rate it, press “Hear the other version”, and rate that too: same notes, only the zone matching changes.'
    : `${diffs.length} paired comparison${diffs.length === 1 ? '' : 's'}: matched minus plain averages ${mean > 0 ? '+' : ''}${mean.toFixed(2)} (scale −2 to +2). ${diffs.length < 6 ? 'Too few to tell yet.' : Math.abs(mean) < .3 ? 'No clear preference so far.' : mean > 0 ? 'So far you tend to rate the matched version higher.' : 'So far you tend to rate the plain version higher.'} You know which version is playing, so this is a personal check, not a blinded test.`;
}

/* ---------------- Your sound zone ---------------- */
function zoneTarget() { return zone.spectral.bandsHz.map((hz, i) => ({ hz, db: zone.spectral.medianDb[i] })); }
function renderZone() {
  if (!zone) { $('zone').hidden = true; return; }
  const sp = zone.spectral, rg = zone.register;
  $('zone-count').textContent = String(zone.songs);
  const fmtHz = v => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} kHz` : `${Math.round(v)} Hz`);
  $('zone-summary').textContent = `Across your ${zone.songs} songs, relative to each song’s own 200 Hz–4 kHz level, the energy is spread fairly evenly from about ${fmtHz(sp.coreHz[0])} to ${fmtHz(sp.coreHz[1])} (the core zone, within 6 dB of the peak), then falls away: highs are soft and the deepest bass is rolled off. Half of the tonal energy (voice and instruments, including overtones) lies between ${rg.middle50.notes[0]} and ${rg.middle50.notes[1]} (${Math.round(rg.middle50.hz[0])}–${Math.round(rg.middle50.hz[1])} Hz), the range of the singing voice and the instruments around it. The middle half of the songs’ tempos run ${zone.region.tempoBpm[0].toFixed(0)}–${zone.region.tempoBpm[1].toFixed(0)} BPM. This is a region, not a single frequency, and it describes the songs, not your brain.`;
  // Spectral chart.
  const svg = $('zone-spectrum'); svg.replaceChildren();
  const W = 520, H = 240, L = 40, R = 12, T = 12, B = 30, lo = 55, hi = 9000, dbLo = -40, dbHi = 12;
  const x = hz => L + Math.log(hz / lo) / Math.log(hi / lo) * (W - L - R);
  const y = db => T + (dbHi - Math.max(dbLo, Math.min(dbHi, db))) / (dbHi - dbLo) * (H - T - B);
  for (const hz of [63, 125, 250, 500, 1000, 2000, 4000, 8000]) { svgEl(svg, 'line', { x1: x(hz), x2: x(hz), y1: T, y2: H - B, class: 'grid' }); svgEl(svg, 'text', { x: x(hz), y: H - 12, 'text-anchor': 'middle' }, hz >= 1000 ? `${hz / 1000}k` : String(hz)); }
  for (const db of [0, -12, -24, -36]) svgEl(svg, 'text', { x: L - 6, y: y(db) + 3, 'text-anchor': 'end' }, `${db}`);
  svgEl(svg, 'rect', { x: x(sp.coreHz[0] / 2 ** (1 / 6)), y: T, width: x(sp.coreHz[1] * 2 ** (1 / 6)) - x(sp.coreHz[0] / 2 ** (1 / 6)), height: H - T - B, class: 'core' });
  const pts = arr => sp.bandsHz.map((hz, i) => `${x(hz).toFixed(1)},${y(arr[i]).toFixed(1)}`);
  svgEl(svg, 'polygon', { points: [...pts(sp.q3Db), ...pts(sp.q1Db).reverse()].join(' '), class: 'iqr' });
  for (const s of core) {
    const b = normaliseShape(s.spectrum.bandsDb);
    svgEl(svg, 'polyline', { points: b.map(v => `${x(v.hz).toFixed(1)},${y(v.db).toFixed(1)}`).join(' '), class: 'song' });
  }
  svgEl(svg, 'polyline', { points: pts(sp.medianDb).join(' '), class: 'median' });
  svgEl(svg, 'text', { x: x(Math.sqrt(sp.coreHz[0] * sp.coreHz[1])), y: T + 12, 'text-anchor': 'middle', class: 'label' }, `core zone ${fmtHz(sp.coreHz[0])}–${fmtHz(sp.coreHz[1])}`);
  svg.setAttribute('aria-label', `Median spectrum of your songs: ${sp.bandsHz.map((hz, i) => `${fmtHz(hz)} ${sp.medianDb[i].toFixed(0)} dB`).join(', ')}`);
  // Register chart.
  const rsv = $('zone-register'); rsv.replaceChildren();
  const f = rg.semitoneHz, share = rg.medianShare, top = Math.max(...share);
  const rx = hz => L + Math.log(hz / f[0]) / Math.log(f[f.length - 1] / f[0]) * (W - L - R);
  const ry = v => T + (1 - v / top) * (H - T - B);
  for (const [hz, name] of [[65.4, 'C2'], [130.8, 'C3'], [261.6, 'C4'], [523.3, 'C5'], [1046.5, 'C6'], [2093, 'C7'], [3951, 'B7']]) { svgEl(rsv, 'line', { x1: rx(hz), x2: rx(hz), y1: T, y2: H - B, class: 'grid' }); svgEl(rsv, 'text', { x: rx(hz), y: H - 12, 'text-anchor': 'middle' }, name); }
  svgEl(rsv, 'rect', { x: rx(rg.middle50.hz[0]), y: T, width: rx(rg.middle50.hz[1]) - rx(rg.middle50.hz[0]), height: H - T - B, class: 'core' });
  svgEl(rsv, 'polygon', { points: [`${rx(f[0])},${ry(0)}`, ...f.map((hz, i) => `${rx(hz).toFixed(1)},${ry(share[i]).toFixed(1)}`), `${rx(f[f.length - 1])},${ry(0)}`].join(' '), class: 'iqr' });
  svgEl(rsv, 'polyline', { points: f.map((hz, i) => `${rx(hz).toFixed(1)},${ry(share[i]).toFixed(1)}`).join(' '), class: 'median' });
  svgEl(rsv, 'text', { x: (rx(rg.middle50.hz[0]) + rx(rg.middle50.hz[1])) / 2, y: T + 12, 'text-anchor': 'middle', class: 'label' }, `${rg.middle50.notes[0]}–${rg.middle50.notes[1]}`);
  rsv.setAttribute('aria-label', `Middle half of the tonal energy lies between ${rg.middle50.notes[0]} and ${rg.middle50.notes[1]}, ${Math.round(rg.middle50.hz[0])} to ${Math.round(rg.middle50.hz[1])} hertz`);
  // Heart of the zone.
  const heart = [...data.leaveOneOut].sort((a, b) => b.overall - a.overall).slice(0, 5);
  $('zone-heart').replaceChildren(...heart.map(h => { const li = document.createElement('li'); li.append(h.name + ' '); const sm = document.createElement('small'); sm.textContent = `${pct(h.overall)} closeness to the rest`; li.append(sm); return li; }));
  $('zone-others').textContent = String(zone.songs - 1);
  renderZoneTest();
}

/* ---------------- Make one for me (factorised Thompson sampling over your ratings) ---------------- */
function gammaSample(k) {
  if (k < 1) return gammaSample(k + 1) * Math.random() ** (1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { const u1 = Math.random() || 1e-12, u2 = Math.random(); x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0);
    v = v ** 3; const u = Math.random();
    if (u < 1 - .0331 * x ** 4 || Math.log(u) < .5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
const betaSample = (a, b) => { const x = gammaSample(a); return x / (x + gammaSample(b)); };
function pickFor(factor, options, ratings, prior = {}) {
  let best = null, bestScore = -1;
  for (const o of options) {
    let good = prior[o] || 0, bad = 0;
    for (const r of ratings) if (String(factor(r.params)) === String(o)) { if (r.rating > 0) good++; else if (r.rating < 0) bad++; else { good += .5; bad += .5; } }
    const score = betaSample(1 + good, 1 + bad);
    if (score > bestScore) { bestScore = score; best = o; }
  }
  return best;
}
function makeForMe() {
  const ratings = readRatings();
  const progs = [...$('sk-progression').options].map(o => o.value);
  // A small head start for your own favourite triads, so the first pick reflects what you told us.
  const prog = pickFor(p => JSON.stringify(p.progression), progs, ratings, { [progs[0]]: 1 });
  const texture = pickFor(p => p.texture, Object.keys(TEXTURES), ratings);
  const feel = pickFor(p => p.feel, Object.keys(FEELS), ratings);
  const matched = zone ? pickFor(p => p.matched, [true, false], current(ratings), { true: .5 }) : false;
  // Key: one of the home notes your songs use most; tempo: inside your songs' middle-half range.
  const tonicCounts = new Map(); core.forEach(s => tonicCounts.set(s.key.tonic, (tonicCounts.get(s.key.tonic) || 0) + 1));
  const tonics = [...tonicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(t => t[0]);
  const tonic = tonics[Math.floor(Math.random() * tonics.length)];
  const [t0, t1] = zone ? zone.region.tempoBpm : [profile.features.tempo.q1, profile.features.tempo.q3];
  const bpm = Math.round(t0 + Math.random() * (t1 - t0));
  $('sk-progression').value = prog; $('sk-texture').value = texture; $('sk-feel').value = feel; $('sk-key').value = String(tonic);
  $('sk-bpm').value = String(bpm); $('sk-bpm-value').textContent = `${bpm} BPM`; $('sk-match').checked = matched;
  sketchSeed++;
  const romans = JSON.parse(prog);
  const progLabel = `${romans.join(' → ').replace(/b/g, '♭')} (${romans.map(r => chordName(tonic, r)).join(' → ')})`;
  $('sk-why').textContent = `Picked for you: ${progLabel}; ${TEXTURES[texture].toLowerCase()}; ${FEELS[feel].label}; ${PITCH_NAMES[tonic]} as home (one of your songs’ most common home notes); ${bpm} BPM (inside your songs’ range); ${matched ? 'matched to your songs’ sound' : 'plain sound, to keep testing the zone'}. ${ratings.length ? `Based on your ${ratings.length} rating${ratings.length === 1 ? '' : 's'}, and still trying new combinations now and then.` : 'No ratings yet, so this is a first guess. Rate it to steer the next one.'}`;
  playSketch();
}
function setupSketch() {
  const presets = [
    { label: 'Your triads: Am → G → F → E (i → ♭VII → ♭VI → V)', prog: ['i', 'bVII', 'bVI', 'V'] },
    ...profile.progressionsSongsWith.filter(p => p.progression.split(' → ').length >= 3).slice(0, 4).map(p => ({ label: `From the profile: ${p.progression.replace(/b/g, '♭')} (${p.songsWith} songs)`, prog: p.progression.split(' → ') })),
    { label: 'i → ♭VI → ♭VII → i', prog: ['i', 'bVI', 'bVII', 'i'] },
    { label: 'Contrast, modern pop: I → V → vi → IV', prog: ['I', 'V', 'vi', 'IV'] },
  ].filter((p, i, all) => all.findIndex(o => o.prog.join() === p.prog.join()) === i);
  $('sk-progression').replaceChildren(...presets.map(p => { const o = document.createElement('option'); o.value = JSON.stringify(p.prog); o.textContent = p.label; return o; }));
  $('sk-key').replaceChildren(...PITCH_NAMES.map((n, i) => { const o = document.createElement('option'); o.value = i; o.textContent = n; o.selected = i === 9; return o; }));
  $('sk-feel').replaceChildren(...Object.entries(FEELS).map(([k, v]) => { const o = document.createElement('option'); o.value = k; o.textContent = v.label; return o; }));
  $('sk-texture').replaceChildren(...Object.entries(TEXTURES).map(([k, v]) => { const o = document.createElement('option'); o.value = k; o.textContent = v; return o; }));
  const bpm = Math.round(profile.features.tempo.median);
  $('sk-bpm').value = String(Math.min(110, bpm)); $('sk-bpm-value').textContent = `${$('sk-bpm').value} BPM`;
  $('sk-bpm').addEventListener('input', () => { $('sk-bpm-value').textContent = `${$('sk-bpm').value} BPM`; });
  const renderLevelLabel = () => { const v = Number($('sk-level').value); $('sk-level-value').textContent = v ? `${v} dB` : 'Your level'; };
  renderLevelLabel();
  $('sk-level').addEventListener('input', () => { renderLevelLabel(); setSketchLevel(); });
  $('sk-play').addEventListener('click', () => { $('sk-why').textContent = ''; playSketch(); });
  $('sk-forme').addEventListener('click', makeForMe);
  // Same sketch (same seed and settings), other version: the only fair way to judge the zone matching.
  $('sk-flip').addEventListener('click', () => { if (!lastSketch || !zone) { say('Play a sketch first.'); return; } $('sk-match').checked = !lastSketch.params.matched; $('sk-why').textContent = `Same sketch, now ${$('sk-match').checked ? 'matched to your songs’ sound' : 'plain'}. Rate this one too.`; playSketch(); });
  if (!zone) { $('sk-match').checked = false; $('sk-match').disabled = true; $('sk-flip').disabled = true; }
  $('sk-new').addEventListener('click', () => { sketchSeed++; playSketch(); });
  $('sk-stop').addEventListener('click', () => { stopSketch(); say('Fading out.'); });
  $('sk-download').addEventListener('click', () => {
    if (!lastSketch) return;
    // Export at the level it was played at, so the file is never louder than the preview.
    const src = lastSketch.buffer, g = dbToAmp(lastSketch.levelDb);
    const out = audio().createBuffer(2, src.length, src.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const i = src.getChannelData(ch), o = out.getChannelData(ch); for (let k = 0; k < i.length; k++) o[k] = Math.max(-1, Math.min(1, i[k] * g)); }
    const url = URL.createObjectURL(encodeWav(out)); const a = document.createElement('a');
    a.href = url; a.download = `still-sketch-${lastSketch.params.progression.join('-')}-${lastSketch.params.bpm}bpm.wav`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    say('WAV saved at the level you heard (before your device volume).');
  });
  document.querySelectorAll('.sk-rate').forEach(b => b.addEventListener('click', () => {
    if (!lastSketch) { say('Play a sketch first, then rate it.'); return; }
    const ratings = readRatings();
    ratings.push({ at: new Date().toISOString(), rating: Number(b.dataset.rating), params: lastSketch.params, state: modeOf(comfort()) });
    try { localStorage.setItem(RATINGS_KEY, JSON.stringify(ratings.slice(-500))); say('Rating saved on this device.'); } catch { say('This browser is not letting Still save ratings.'); }
    renderTaste();
  }));
  // A state change on the profile page (e.g. to "during an attack") applies here at once.
  window.addEventListener('storage', e => { if (e.key === PROFILE_KEY && active) { applyShelf(); setSketchLevel(); say('Your comfort state changed, so the sketch level was adjusted.'); } });
  renderTaste();
}

$('dim').addEventListener('click', () => { const on = document.body.classList.toggle('dim'); $('dim').textContent = on ? 'Light screen' : 'Dim screen'; $('dim').setAttribute('aria-pressed', String(on)); });
window.addEventListener('pagehide', () => stopSketch(.05));

try {
  data = await (await fetch('data/song-dna/kishore-kumar.json')).json();
  try { zone = await (await fetch('data/song-dna/kishore-kumar-zone.json')).json(); if (zone?.schema !== 'still-song-zone-v1') zone = null; } catch { zone = null; }
  core = data.songs.filter(s => !s.flags.length); profile = data.profile;
  $('song-count').textContent = String(core.length);
  $('artist-eyebrow').textContent = data.artist.toUpperCase();
  renderFrequencies(); renderKeys(); renderRomans(); renderDegrees(); renderAndalusian(); renderFeatureTable(); renderSongTable(); setupSketch(); renderZone();
  say(`Profile of ${core.length} full-length ${data.artist} songs. Choose a song below to compare, or make a sketch.`);
} catch (err) { say('Could not load the Song DNA profile: ' + err.message); }
