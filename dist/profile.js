import {
  renderComfortLoop, renderBand, renderHuggins, applyFades, describeX, paramsFromX,
  contourEqDb, contourCeilingDb, createSafetyChain, CONTOUR_BANDS, MODES, clamp, modeKey,
} from './comfort-engine.js';
import { PreferenceGP, startingPoint } from './preference-model.js';
import * as levels from './comfort-state.js';

const $ = id => document.getElementById(id);
const KEY = 'still-profile-v1';
const dbToAmp = db => 10 ** (db / 20);
const tick = () => new Promise(r => setTimeout(r, 20));
const now = () => new Date().toISOString();

const QUESTIONS = [
  { key: 'sudden', text: 'Sudden or sharp sounds, like a door or a notification ping' },
  { key: 'high', text: 'High, hissy or bright sounds' },
  { key: 'low', text: 'Low rumbling or humming' },
  { key: 'pulse', text: 'Pulsing, wobbling or rhythmic sounds' },
];
const SCALE = ['Not at all', 'A little', 'Moderately', 'A lot', 'Severely'];
const BAND_NAMES = { 125: 'deep hum', 250: 'low voice', 500: 'warm middle', 1000: 'middle', 2000: 'presence', 4000: 'hiss and edge', 8000: 'air and sizzle' };
const CONTOUR_START_DB = -30, CONTOUR_CAP_DB = 6, CONTOUR_RATE_DB_PER_S = 2.5;
const LEVEL_MIN_DB = -40, WORSE_STEP_DB = 4;
const MIN_ROUNDS = 8, SETTLED_STREAK = 4;

/* ---------- Profile storage ---------- */
// Levels: one base level for feeling calm, plus a per-state trim that can only make that state
// quieter. Output = min(base, contour cap) + state offset + trim, so a more sensitive state is never louder.
function freshProfile() {
  return {
    schema: KEY, answers: {}, device: 'headphones', reference: null, headphones: null, contour: [],
    tuner: { model: null, history: [], vetoes: [] },
    baseLevelDb: 0, trims: { calm: 0, sensitive: 0, very: 0, recovering: 0 },
    mode: 'calm', events: [],
  };
}

const isPoint = v => Array.isArray(v) && v.length === 4 && v.every(x => Number.isFinite(x) && x >= 0 && x <= 1);

function sanitize(raw) {
  if (!raw || typeof raw !== 'object' || raw.schema !== KEY) throw new Error('Not a Still comfort profile');
  const p = freshProfile();
  for (const q of QUESTIONS) if (Number.isInteger(raw.answers?.[q.key]) && raw.answers[q.key] >= 0 && raw.answers[q.key] <= 4) p.answers[q.key] = raw.answers[q.key];
  if (['headphones', 'speakers', 'unsure'].includes(raw.device)) p.device = raw.device;
  if (typeof raw.reference?.at === 'string') p.reference = { at: raw.reference.at };
  if (typeof raw.headphones?.passed === 'boolean') p.headphones = { passed: raw.headphones.passed, correct: clamp(Number(raw.headphones.correct) || 0, 0, 6), at: String(raw.headphones.at || '') };
  p.contour = (Array.isArray(raw.contour) ? raw.contour : [])
    .filter(b => CONTOUR_BANDS.includes(b?.hz) && Number.isFinite(b.ceilingDb))
    .map(b => ({ hz: b.hz, ceilingDb: clamp(b.ceilingDb, CONTOUR_START_DB, CONTOUR_CAP_DB), at: String(b.at || '') }))
    .filter((b, i, all) => all.findIndex(o => o.hz === b.hz) === i);
  if (raw.tuner?.model && typeof raw.tuner.model === 'object') p.tuner.model = PreferenceGP.fromJSON(raw.tuner.model).toJSON();
  p.tuner.history = (Array.isArray(raw.tuner?.history) ? raw.tuner.history : [])
    .filter(h => h && typeof h === 'object' && ['a', 'b', 'same', 'neither'].includes(h.choice) && isPoint(h.a) && isPoint(h.b))
    .map(h => ({ at: String(h.at || ''), mode: modeKey(h.mode), a: h.a, b: h.b, choice: h.choice })).slice(-500);
  p.tuner.vetoes = (Array.isArray(raw.tuner?.vetoes) ? raw.tuner.vetoes : []).filter(isPoint).slice(-50);
  if (Number.isFinite(raw.baseLevelDb)) p.baseLevelDb = clamp(raw.baseLevelDb, LEVEL_MIN_DB, CONTOUR_CAP_DB);
  // Earlier versions saved disease-phase keys (normal, warning, attack); map them to sensitivity states.
  for (const [k, v] of Object.entries(raw.trims || {})) if (Number.isFinite(v)) p.trims[modeKey(k)] = clamp(v, -30, 0);
  p.mode = modeKey(raw.mode);
  p.events = (Array.isArray(raw.events) ? raw.events : [])
    .filter(e => e && typeof e === 'object' && ['listen', 'worse'].includes(e.type))
    .map(e => ({ type: e.type, at: String(e.at || ''), mode: modeKey(e.mode), x: isPoint(e.x) ? e.x : null, levelDb: Number.isFinite(e.levelDb) ? e.levelDb : null }))
    .slice(-200);
  return p;
}

function load() {
  try { return sanitize(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return freshProfile(); }
}

let profile = load();
let model = profile.tuner.model ? PreferenceGP.fromJSON(profile.tuner.model) : new PreferenceGP();
let saveWarned = false;

function save() {
  profile.tuner.model = model.toJSON();
  try { localStorage.setItem(KEY, JSON.stringify(profile)); saveWarned = false; return true; } catch {
    if (!saveWarned) say('This browser is not letting Still save, so your profile will be lost when you close the page. Use Export profile to keep a copy.');
    saveWarned = true;
    return false;
  }
}

function say(message) { $('status').textContent = message; }

/* ---------- Audio ---------- */
// Every sound goes source → gain → safety chain (limiter with makeup gain cancelled, then a
// −3 dBFS hard clip). Only one sound plays at a time. Each play() takes a token; anything that
// stops or replaces the sound bumps it, so a play() still preparing never starts late.
let ctx, output, active = null, playToken = 0;
function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    output = createSafetyChain(ctx);
  }
  return ctx;
}

function toBuffer(sound) {
  const c = audio();
  const buffer = c.createBuffer(2, sound.left.length, sound.rate);
  buffer.getChannelData(0).set(sound.left); buffer.getChannelData(1).set(sound.right);
  return buffer;
}

/** The gain value the schedule is at right now (AudioParam.value can lag behind scheduled ramps). */
function currentAmp(handle) {
  if (!handle || !ctx) return 0;
  const t = ctx.currentTime;
  if (t >= handle.rampEnd) return handle.toAmp;
  if (t <= handle.rampStart) return handle.fromAmp;
  return handle.fromAmp + (handle.toAmp - handle.fromAmp) * (t - handle.rampStart) / (handle.rampEnd - handle.rampStart);
}

function rampTo(handle, amp, seconds) {
  const t = ctx.currentTime, from = currentAmp(handle);
  handle.gain.gain.cancelScheduledValues(t);
  handle.gain.gain.setValueAtTime(from, t);
  handle.gain.gain.linearRampToValueAtTime(amp, t + Math.max(.02, seconds));
  Object.assign(handle, { fromAmp: from, toAmp: amp, rampStart: t, rampEnd: t + Math.max(.02, seconds) });
}

/**
 * Play a buffer. Resolves to a handle (or null if cancelled while preparing). handle.done
 * resolves when the sound ends or is stopped, so callers waiting on it never hang.
 */
async function play(buffer, { loop = false, levelDb = 0, fadeIn = 2, kind = 'sound' } = {}) {
  stopAll(.15);
  const token = ++playToken;
  const c = audio();
  await c.resume();
  if (token !== playToken) return null;
  const source = c.createBufferSource(), gain = c.createGain();
  source.buffer = buffer; source.loop = loop;
  let finish;
  const handle = { source, gain, kind, token, done: new Promise(r => { finish = r; }), fromAmp: 0, toAmp: 0, rampStart: 0, rampEnd: 0 };
  handle.finish = () => { if (handle.finished) return; handle.finished = true; if (active === handle) active = null; finish(); };
  gain.gain.setValueAtTime(0, c.currentTime);
  source.connect(gain); gain.connect(output);
  rampTo(handle, dbToAmp(levelDb), fadeIn);
  source.onended = handle.finish;
  source.start();
  active = handle;
  return handle;
}

function stopAll(fade = .4) {
  playToken++;
  const handle = active;
  if (!handle || !ctx) return;
  active = null;
  rampTo(handle, 0, fade);
  handle.source.onended = null;
  try { handle.source.stop(ctx.currentTime + fade + .05); } catch {}
  handle.finish();
  if (handle.kind === 'listen') clearTimeout(sleepTimer);
}

function setActiveLevel(levelDb, seconds = .4) {
  if (!active || !ctx) return;
  // Ramp from where the sound actually is, over the rest of any fade-in, so turning it down
  // during a fade takes effect immediately instead of being overridden by the old ramp.
  const remaining = Math.max(seconds, active.rampEnd - ctx.currentTime);
  rampTo(active, dbToAmp(levelDb), Math.min(remaining, 1.5));
}

/* ---------- Levels and modes ---------- */
const mode = () => MODES[modeKey(profile.mode)];
// Level and fade rules live in comfort-state.js so every page plays at the same level.
const capDb = () => levels.capDb(profile);
const baseDb = () => levels.baseDb(profile);
const outputLevelDb = () => levels.outputLevelDb(profile);
const fadeInSeconds = () => levels.fadeInSeconds(profile);
const listening = () => active?.kind === 'listen';
const fmtDb = db => `${db > 0 ? '+' : ''}${db.toFixed(0)} dB`;

function renderMode() {
  for (const input of document.querySelectorAll('[name=mode]')) input.checked = input.value === profile.mode;
  const m = mode();
  const quiet = profile.mode === 'very';
  document.body.classList.toggle('quiet-mode', quiet);
  $('quiet-panel').hidden = !quiet;
  if (quiet && !document.body.classList.contains('dim')) toggleDim(true);
  $('mode-note').textContent = profile.mode === 'calm'
    ? 'Calm: sounds play at your saved level.'
    : `${m.label}: sounds play at least ${Math.abs(m.offsetDb)} dB quieter than when you feel calm, with a softer top end${m.swellCapDb < 3 ? ' and almost no swell' : ''}. These are cautious starting points; you can go quieter still.`;
  const x = championX();
  $('quiet-detail').textContent = x
    ? `Plays your ${titleFor(x).toLowerCase()} sound at ${fmtDb(outputLevelDb())} relative to your quiet reference, with a ${fadeInSeconds().toFixed(1)}-second fade-in.`
    : `No comfort sound yet, so a gentle, dark default plays at ${fmtDb(outputLevelDb())} relative to your quiet reference. Silence is always fine.`;
  renderLevel();
}

/* ---------- 01 Questions ---------- */
function renderQuestions() {
  const box = $('questions');
  box.replaceChildren();
  for (const q of QUESTIONS) {
    const wrap = document.createElement('div');
    wrap.className = 'question';
    const p = document.createElement('p');
    p.id = 'q-' + q.key; p.textContent = q.text;
    const scale = document.createElement('div');
    scale.className = 'scale'; scale.setAttribute('role', 'radiogroup'); scale.setAttribute('aria-labelledby', p.id);
    SCALE.forEach((label, value) => {
      const l = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio'; input.name = 'q-' + q.key; input.value = value;
      input.checked = profile.answers[q.key] === value;
      input.addEventListener('change', () => {
        profile.answers[q.key] = value; save(); renderFingerprint(); renderMode();
        if (Object.keys(profile.answers).length === QUESTIONS.length && !model.comparisons.length) say('Thanks. Your first comparison will start from a sound shaped by these answers.');
      });
      const span = document.createElement('span'); span.textContent = label;
      l.append(input, span); scale.append(l);
    });
    wrap.append(p, scale); box.append(wrap);
  }
  $('device').value = profile.device;
}
$('device').addEventListener('change', () => { profile.device = $('device').value; save(); renderFingerprint(); });

/* ---------- 02 Reference ---------- */
let referenceBuffer = null;
const referencePlaying = () => active?.kind === 'reference';
function renderReferenceButton() { $('ref-play').textContent = referencePlaying() ? '■ Stop reference' : '▶ Play reference'; }
$('ref-play').addEventListener('click', async () => {
  if (referencePlaying()) { stopAll(); renderReferenceButton(); return; }
  say('Playing a soft, steady hush. Turn your device volume up or down until it is quiet but clear.');
  referenceBuffer ||= toBuffer(renderComfortLoop([.8, 0, 0, .75], { rate: audio().sampleRate, log2Length: 18, seed: 31 }));
  const handle = await play(referenceBuffer, { loop: true, levelDb: 0, fadeIn: 2, kind: 'reference' });
  if (!handle) return;
  renderReferenceButton(); $('ref-save').disabled = false;
  handle.done.then(renderReferenceButton);
});
$('ref-save').addEventListener('click', () => {
  stopAll(); renderReferenceButton();
  profile.reference = { at: now() }; save(); renderReference();
  say('Reference saved. Leave your device volume where it is for the rest of the profile.');
});
function renderReference() {
  $('ref-note').textContent = profile.reference
    ? `Set ${new Date(profile.reference.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}. If you change headphones or device volume, set it again.`
    : 'Not set yet. Until then, “0 dB” simply means the app’s default level.';
}

/* ---------- 03 Headphone check ---------- */
const hp = { run: 0, round: 0, correct: 0, target: 0, buffers: null, busy: false };
async function playTrial() {
  const run = hp.run;
  hp.busy = true;
  document.querySelectorAll('.hp-answer').forEach(b => { b.disabled = true; });
  const rate = audio().sampleRate;
  if (!hp.buffers) {
    hp.target = Math.floor(Math.random() * 3);
    hp.buffers = [0, 1, 2].map(i => toBuffer(renderHuggins(i === hp.target, { rate, seed: 100 + hp.round * 3 + i })));
  }
  for (let i = 0; i < 3; i++) {
    const button = document.querySelector(`.hp-answer[data-answer="${i}"]`);
    button.classList.add('holding');
    const handle = await play(hp.buffers[i], { fadeIn: .02, levelDb: 0, kind: 'headphones' });
    if (handle) await handle.done;
    button.classList.remove('holding');
    // Interrupted (another sound, a restart or Stop): leave the trial ready to replay.
    if (!handle || run !== hp.run || handle.token !== playToken) { if (run === hp.run) endTrialPlayback(); return; }
    await new Promise(r => setTimeout(r, 450));
    if (run !== hp.run) return;
  }
  endTrialPlayback();
}
function endTrialPlayback() {
  hp.busy = false;
  document.querySelectorAll('.hp-answer').forEach(b => { b.disabled = false; b.classList.remove('holding'); });
}
$('hp-start').addEventListener('click', () => {
  stopAll(.05);
  Object.assign(hp, { run: hp.run + 1, round: 0, correct: 0, buffers: null });
  $('hp-trial').hidden = false; $('hp-start').textContent = 'Restart check';
  $('hp-round').textContent = 'Round 1 of 6 · which hiss contained a faint tone?';
  playTrial();
});
$('hp-replay').addEventListener('click', () => { if (!hp.busy && hp.buffers) playTrial(); });
document.querySelectorAll('.hp-answer').forEach(button => button.addEventListener('click', () => {
  if (hp.busy || !hp.buffers) return;
  if (Number(button.dataset.answer) === hp.target) hp.correct++;
  hp.round++; hp.buffers = null;
  if (hp.round >= 6) {
    const passed = hp.correct >= 5;
    profile.headphones = { passed, correct: hp.correct, at: now() }; save();
    $('hp-trial').hidden = true; $('hp-start').textContent = 'Check again';
    renderHeadphones(); renderFingerprint();
    say(passed ? 'Headphones confirmed. Stereo experiments will reach each ear separately.' : 'Not confirmed. That is fine; stereo experiments may not work as intended on this setup.');
    return;
  }
  $('hp-round').textContent = `Round ${hp.round + 1} of 6 · which hiss contained a faint tone?`;
  playTrial();
}));
function renderHeadphones() {
  const h = profile.headphones;
  $('hp-note').textContent = !h ? 'Not checked.' : h.passed ? `Headphones confirmed (${h.correct} of 6).` : `Not confirmed (${h.correct} of 6). Speakers, or a single earbud, can cause this.`;
}

/* ---------- 04 Comfort contour ---------- */
const bandBuffers = {};
let hold = null;
function bandRow(hz) {
  const row = document.createElement('div');
  row.className = 'band'; row.dataset.hz = hz;
  const name = document.createElement('div');
  const strong = document.createElement('strong'); strong.textContent = hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`;
  const small = document.createElement('small'); small.textContent = BAND_NAMES[hz];
  name.append(strong, small);
  const level = document.createElement('div'); level.className = 'level';
  level.append(document.createElement('i'), document.createElement('b'));
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'outline'; button.textContent = 'Hold to listen';
  button.setAttribute('aria-label', `Hold to play the ${hz} hertz band. Release when it stops feeling gentle.`);
  const value = document.createElement('small'); value.className = 'band-value';
  row.append(name, level, button, value);
  button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture?.(e.pointerId); startHold(hz, row); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => endHold());
  button.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startHold(hz, row); } });
  button.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); endHold(); } });
  button.addEventListener('blur', () => endHold());
  button.addEventListener('contextmenu', e => e.preventDefault());
  return row;
}
const levelFraction = db => (db - CONTOUR_START_DB) / (CONTOUR_CAP_DB - CONTOUR_START_DB);
async function startHold(hz, row) {
  if (hold) return;
  const c = audio();
  bandBuffers[hz] ||= toBuffer(renderBand(hz, { rate: c.sampleRate }));
  const mine = hold = { hz, row, start: 0, frame: 0, handle: null };
  const handle = await play(bandBuffers[hz], { loop: true, levelDb: CONTOUR_START_DB, fadeIn: .08, kind: 'contour' });
  if (hold !== mine || !handle) { if (handle && active === handle) stopAll(.06); return; }
  const duration = (CONTOUR_CAP_DB - CONTOUR_START_DB) / CONTOUR_RATE_DB_PER_S, t = c.currentTime;
  handle.gain.gain.cancelScheduledValues(t);
  handle.gain.gain.setValueAtTime(dbToAmp(CONTOUR_START_DB), t);
  handle.gain.gain.exponentialRampToValueAtTime(dbToAmp(CONTOUR_CAP_DB), t + duration);
  // Track the exponential ramp for currentAmp(): approximate with the level at release time.
  Object.assign(handle, { fromAmp: dbToAmp(CONTOUR_START_DB), toAmp: dbToAmp(CONTOUR_START_DB), rampStart: t, rampEnd: t });
  mine.start = t; mine.handle = handle;
  row.querySelector('button').classList.add('holding');
  row.querySelector('button').textContent = 'Release when not gentle';
  const update = () => {
    if (hold !== mine) return;
    const db = currentHoldDb();
    handle.fromAmp = handle.toAmp = dbToAmp(db);
    row.querySelector('.level i').style.width = (levelFraction(db) * 100) + '%';
    if (db >= CONTOUR_CAP_DB - .05) { endHold(true); return; }
    mine.frame = requestAnimationFrame(update);
  };
  update();
}
function currentHoldDb() {
  if (!hold?.start || !ctx) return CONTOUR_START_DB;
  return Math.min(CONTOUR_CAP_DB, CONTOUR_START_DB + (ctx.currentTime - hold.start) * CONTOUR_RATE_DB_PER_S);
}
function endHold(reachedCap = false) {
  if (!hold) return;
  const { hz, row, frame, start, handle } = hold;
  const db = currentHoldDb();
  cancelAnimationFrame(frame);
  hold = null;
  if (handle) { handle.fromAmp = handle.toAmp = dbToAmp(db); if (active === handle) stopAll(.06); } else stopAll(.06);
  const button = row.querySelector('button');
  button.classList.remove('holding'); button.textContent = 'Hold to listen';
  if (!start || db < CONTOUR_START_DB + 1) { say('Released very early, so nothing was saved for that band. Hold a little longer if you can hear it comfortably.'); renderContour(); return; }
  const entry = { hz, ceilingDb: Math.round(db), at: now() };
  profile.contour = [...profile.contour.filter(b => b.hz !== hz), entry].sort((a, b) => a.hz - b.hz);
  save(); renderContour(); renderLevel(); renderFingerprint();
  const name = hz >= 1000 ? hz / 1000 + ' kHz' : hz + ' Hz';
  say(reachedCap ? `${name} stayed gentle up to the safe cap. Saved at +${CONTOUR_CAP_DB} dB.` : `Saved: ${name} stayed gentle up to ${fmtDb(entry.ceilingDb)} relative to your reference.`);
}
function renderContour() {
  const box = $('bands');
  if (!box.children.length) CONTOUR_BANDS.forEach(hz => box.append(bandRow(hz)));
  for (const row of box.children) {
    const hz = Number(row.dataset.hz), saved = profile.contour.find(b => b.hz === hz);
    row.classList.toggle('done', !!saved);
    row.querySelector('.level i').style.width = saved ? (levelFraction(saved.ceilingDb) * 100) + '%' : '0';
    row.querySelector('.level b').style.left = saved ? `calc(${levelFraction(saved.ceilingDb) * 100}% - 1px)` : '0';
    const eq = saved && profile.contour.length >= 3 ? contourEqDb(hz, profile.contour) : 0;
    row.querySelector('.band-value').textContent = saved
      ? `Gentle up to ${fmtDb(saved.ceilingDb)}${eq < -.5 ? ` · Still turns this band down ${Math.abs(eq).toFixed(0)} dB` : ''}`
      : 'Not measured yet';
  }
  $('contour-pill').textContent = `${profile.contour.length} OF ${CONTOUR_BANDS.length} BANDS`;
  drawContour();
}
function drawContour() {
  const svg = $('contour-chart'), ns = 'http://www.w3.org/2000/svg';
  svg.replaceChildren();
  const W = 420, H = 220, L = 46, R = 14, T = 14, B = 34;
  const x = hz => L + (Math.log2(hz / 125) / Math.log2(8000 / 125)) * (W - L - R);
  const y = db => T + (CONTOUR_CAP_DB - db) / (CONTOUR_CAP_DB - CONTOUR_START_DB) * (H - T - B);
  const el = (name, attrs, text) => { const e = document.createElementNS(ns, name); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; svg.append(e); return e; };
  for (const db of [6, 0, -10, -20, -30]) {
    el('line', { x1: L, x2: W - R, y1: y(db), y2: y(db), class: db === 0 ? 'zero' : 'grid' });
    el('text', { x: L - 8, y: y(db) + 3, 'text-anchor': 'end' }, db === 0 ? 'ref' : (db > 0 ? '+' : '') + db);
  }
  for (const hz of CONTOUR_BANDS) el('text', { x: x(hz), y: H - 12, 'text-anchor': 'middle' }, hz >= 1000 ? hz / 1000 + 'k' : String(hz));
  el('text', { x: W - R, y: H - 1, 'text-anchor': 'end' }, 'Hz');
  const pts = profile.contour.map(b => [x(b.hz), y(b.ceilingDb)]);
  if (pts.length >= 2) el('polyline', { points: pts.map(p => p.join(',')).join(' '), class: 'line' });
  for (const [px, py] of pts) el('circle', { cx: px, cy: py, r: 4.5, class: 'dot' });
  if (!pts.length) el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle' }, 'Your contour appears as you measure bands');
  svg.setAttribute('aria-label', profile.contour.length
    ? 'Comfort contour: ' + profile.contour.map(b => `${b.hz} hertz ${b.ceilingDb} decibels`).join(', ')
    : 'Comfort contour chart, no bands measured yet');
}

/* ---------- 05 Tuner ---------- */
const near = (p, q, d = .15) => Math.sqrt(p.reduce((s, v, i) => s + (v - q[i]) ** 2, 0)) < d;
const vetoed = x => profile.tuner.vetoes.some(v => near(v, x));
const championX = () => model.champion(vetoed);
const contourOrNull = () => (profile.contour.length >= 3 ? profile.contour : null);
let pair = null;
const roundCount = () => profile.tuner.history.length;

/** A safe start: the questionnaire point, or the nearest point to it outside every vetoed region. */
function safeStart() {
  const start = startingPoint(profile.answers);
  if (!vetoed(start)) return start;
  let best = null, bestDist = Infinity;
  for (let i = 0; i < 400; i++) {
    const x = start.map((v, d) => clamp(v + ((i * 0.618 * (d + 1)) % 1 - .5) * Math.min(1, .2 + i / 200), 0, 1));
    const dist = Math.sqrt(x.reduce((s, v, d) => s + (v - start[d]) ** 2, 0));
    if (!vetoed(x) && dist < bestDist) { best = x; bestDist = dist; }
  }
  return best || [.2, .1, 0, .2];
}

function nextPair() {
  const champ = championX() || safeStart();
  const challenger = model.nextChallenger({ seed: roundCount() * 17 + 3, exclude: vetoed, start: champ });
  const aIsChamp = Math.random() < .5;
  pair = { a: aIsChamp ? champ : challenger, b: aIsChamp ? challenger : champ, buffers: null, started: false, played: false, seed: 50 + roundCount() };
  $('desc-a').textContent = 'Press play to hear it'; $('desc-b').textContent = 'Press play to hear it';
}
function resetTuner() {
  sequence++;
  if (active?.kind === 'clip') stopAll(.3);
  pair = null;
  enableChoices(false);
  $('ab-replay-a').disabled = true; $('ab-replay-b').disabled = true;
  document.querySelectorAll('.ab-card').forEach(c => c.classList.remove('playing'));
  $('desc-a').textContent = '—'; $('desc-b').textContent = '—';
}
function shortDescription(x) {
  const d = describeX(x);
  return `${d.tilt.split(',')[0]} · ${d.texture.split(' (')[0]} · ${d.motion.replace(', like breathing', '').replace(', with no swell', '')}`;
}
async function preparePair() {
  if (pair.buffers) return;
  say('Preparing two sounds…'); await tick();
  if (!pair) return;
  const rate = audio().sampleRate;
  const opts = { rate, log2Length: 18, seed: pair.seed, contour: contourOrNull(), mode: profile.mode };
  const sounds = [pair.a, pair.b].map(x => renderComfortLoop(x, opts));
  // Keep A and B at matched loudness even if one render needed peak headroom.
  const floor = Math.min(...sounds.map(s => s.headroomDb));
  pair.trims = sounds.map(s => floor - s.headroomDb);
  pair.buffers = sounds.map(s => toBuffer({ ...s, left: applyFades(s.left, rate, 1), right: applyFades(s.right, rate, 1) }));
}
let sequence = 0;
async function playClip(which) {
  const token = ++sequence;
  await preparePair();
  if (token !== sequence || !pair) return false;
  pair.started = true;
  $('choice-neither').disabled = false;
  const card = $('card-' + which), index = which === 'a' ? 0 : 1;
  card.classList.add('playing');
  say(`Playing ${which.toUpperCase()}…`);
  const handle = await play(pair.buffers[index], { levelDb: outputLevelDb() + pair.trims[index], fadeIn: .02, kind: 'clip' });
  if (handle) await handle.done;
  card.classList.remove('playing');
  if (token !== sequence || !pair || !handle) return false;
  $('desc-' + which).textContent = shortDescription(pair[which]);
  return true;
}
$('ab-play').addEventListener('click', async () => {
  if (!pair) nextPair();
  if (!await playClip('a')) return;
  const token = sequence;
  await new Promise(r => setTimeout(r, 600));
  if (token !== sequence) return;
  if (!await playClip('b')) return;
  pair.played = true;
  enableChoices(true);
  $('ab-replay-a').disabled = false; $('ab-replay-b').disabled = false;
  say('Which felt calmer? Replay either one if you are unsure.');
});
$('ab-replay-a').addEventListener('click', () => { if (pair) playClip('a'); });
$('ab-replay-b').addEventListener('click', () => { if (pair) playClip('b'); });
$('ab-stop').addEventListener('click', () => { sequence++; stopAll(); document.querySelectorAll('.ab-card').forEach(c => c.classList.remove('playing')); say('Stopped. Quiet is a valid choice.'); });
function enableChoices(on) { document.querySelectorAll('.choice').forEach(b => { b.disabled = !on; }); }

document.querySelectorAll('.choice').forEach(button => button.addEventListener('click', () => {
  const choice = button.dataset.choice;
  if (!pair || (choice === 'neither' ? !pair.started : !pair.played)) return;
  sequence++; stopAll(choice === 'neither' ? .3 : .6);
  if (choice === 'a') model.addComparison(pair.a, pair.b);
  if (choice === 'b') model.addComparison(pair.b, pair.a);
  if (choice === 'neither') profile.tuner.vetoes = [...profile.tuner.vetoes, pair.a, pair.b].slice(-50);
  profile.tuner.history.push({ at: now(), mode: profile.mode, a: pair.a, b: pair.b, choice });
  save();
  resetTuner(); renderTuner(); renderFingerprint(); renderMode();
  say(choice === 'neither' ? 'Both noted as unpleasant. Still will not offer sounds close to either again. Take a break if you need one.'
    : settled() ? 'Your favourite keeps winning. Your profile looks settled; keep refining, or listen to your comfort sound below.'
    : 'Noted. Press play for the next pair when you are ready.');
}));
const settled = () => model.comparisons.length >= MIN_ROUNDS && model.streak(vetoed) >= SETTLED_STREAK;
function renderTuner() {
  $('tuner-pill').textContent = `ROUND ${roundCount()}`;
  const n = model.comparisons.length, run = model.streak(vetoed);
  $('confidence-bar').style.width = n ? Math.round(Math.min(1, run / SETTLED_STREAK) * Math.min(1, n / MIN_ROUNDS) * 100) + '%' : '0';
  $('confidence-note').textContent = !n ? 'Learning starts after your first choice.'
    : settled() ? `Settled: your favourite has beaten the last ${run} challengers in a row. You can stop here.`
    : n < MIN_ROUNDS ? `${n} choice${n === 1 ? '' : 's'} so far. Your current favourite has won ${run} in a row. A few more help separate a real preference from chance.`
    : `Your current favourite has won ${run} in a row. When it beats ${SETTLED_STREAK} challengers in a row, your profile is settled.`;
}

/* ---------- 06 Fingerprint and listening ---------- */
function titleFor(x) {
  const p = paramsFromX(x);
  const colour = p.tiltDbPerOctave < -6.5 ? 'Deep' : p.tiltDbPerOctave < -4 ? 'Balanced' : 'Airy';
  const texture = p.tonal < .3 ? 'hush' : p.tonal < .7 ? 'hush with a low hum' : 'hum';
  const motion = Math.min(p.swellDb, mode().swellCapDb) < 1.5 ? 'steady' : 'slowly swelling';
  return `${colour}, ${motion} ${texture}`;
}
function renderFingerprint() {
  const x = championX();
  const list = $('fp-list');
  list.replaceChildren();
  const item = (label, text) => { const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = label + ' '; li.append(b, text); list.append(li); };
  $('fp-title').textContent = x ? titleFor(x) : 'Not built yet';
  if (x) {
    const d = describeX(x);
    item('Colour:', `${d.tilt} (${d.params.tiltDbPerOctave.toFixed(1)} dB per octave).`);
    item('Texture:', d.texture + '.');
    item('Movement:', d.motion + (Math.min(d.params.swellDb, mode().swellCapDb) < d.params.swellDb ? `, kept to ${mode().swellCapDb} dB in this state.` : '.'));
    item('Top end:', `${d.top}, softening above about ${Math.round(d.params.cutoffHz / 50) * 50} Hz.`);
  } else item('Your comfort sound:', 'compare a few pairs in step 05 and it appears here.');
  if (profile.contour.length >= 3) {
    const turned = profile.contour.map(b => ({ ...b, eq: contourEqDb(b.hz, profile.contour) })).filter(b => b.eq < -.5);
    item('Sensitive bands:', turned.length
      ? `${turned.map(b => (b.hz >= 1000 ? b.hz / 1000 + ' kHz' : b.hz + ' Hz')).join(', ')}. Still turns ${turned.length === 1 ? 'this band' : 'these bands'} down by up to ${Math.abs(Math.min(...turned.map(b => b.eq))).toFixed(0)} dB.`
      : 'your measured bands felt similar, so no personal EQ is applied.');
  } else item('Sensitive bands:', 'measure at least three bands in step 04 to add a personal EQ.');
  if ((profile.answers.sudden ?? 0) >= 2) item('Sudden sounds:', `your comfort sound fades in over ${fadeInSeconds().toFixed(1)} seconds in this state.`);
  if (profile.tuner.vetoes.length) item('Ruled out:', `${profile.tuner.vetoes.length} sound${profile.tuner.vetoes.length === 1 ? '' : 's'} you marked unpleasant, and anything close to them.`);
  item('Headphones:', profile.headphones ? (profile.headphones.passed ? 'confirmed.' : 'not confirmed, so stereo experiments may not work as intended.') : 'not checked.');
  const worse = profile.events.filter(e => e.type === 'worse').length;
  if (worse) item('Made it worse:', `${worse} time${worse === 1 ? '' : 's'}. Each one lowered the level for that state by ${WORSE_STEP_DB} dB.`);
  $('fp-play').disabled = false;
  renderLevel();
}
function renderLevel() {
  const cap = capDb(), m = mode();
  const max = profile.mode === 'calm' ? cap : baseDb() + m.offsetDb;
  $('level').min = String(LEVEL_MIN_DB);
  $('level').max = String(Math.floor(max));
  $('level').value = String(Math.round(outputLevelDb()));
  $('level-value').textContent = fmtDb(outputLevelDb());
  $('level-note').textContent = profile.mode === 'calm'
    ? `Relative to your quiet reference. Capped at ${fmtDb(cap)}${profile.contour.length >= 3 ? ' from your comfort contour' : ''}.`
    : `Relative to your quiet reference. In “${m.label.toLowerCase()}” it can only go below your calm level minus ${Math.abs(m.offsetDb)} dB.`;
}
$('level').addEventListener('input', () => {
  const value = Number($('level').value);
  if (profile.mode === 'calm') profile.baseLevelDb = clamp(value, LEVEL_MIN_DB, capDb());
  else profile.trims[profile.mode] = clamp(value - (baseDb() + mode().offsetDb), -30, 0);
  save(); renderLevel(); renderMode();
  if (listening()) setActiveLevel(outputLevelDb());
});

let sleepTimer = 0;
async function startListening() {
  const x = championX() || [.25, .15, 0, .3];
  stopAll(.3);
  const token = playToken;
  say('Preparing your comfort sound…'); await tick();
  if (token !== playToken) return;
  const rate = audio().sampleRate;
  const sound = renderComfortLoop(x, { rate, log2Length: 19, seed: 21, contour: contourOrNull(), mode: profile.mode });
  if (token !== playToken) return;
  const level = outputLevelDb();
  const handle = await play(toBuffer(sound), { loop: true, levelDb: level, fadeIn: fadeInSeconds(), kind: 'listen' });
  if (!handle) return;
  clearTimeout(sleepTimer);
  const minutes = Number($('timer').value);
  if (minutes) sleepTimer = setTimeout(() => { if (active === handle) stopAll(60); }, Math.max(0, minutes * 60 - 60) * 1000);
  profile.events.push({ type: 'listen', at: now(), mode: profile.mode, x, levelDb: level }); save();
  say(`Playing ${championX() ? 'your comfort sound' : 'a gentle default'} at ${fmtDb(level)} relative to your reference, fading in over ${fadeInSeconds().toFixed(1)} s.${minutes ? ` It fades out over the last minute of ${minutes}.` : ''}`);
}
function stopListening(message = 'Fading to silence.') { clearTimeout(sleepTimer); stopAll(3); if (message) say(message); }
$('fp-play').addEventListener('click', startListening);
$('fp-stop').addEventListener('click', () => stopListening());
$('quiet-play').addEventListener('click', startListening);
$('quiet-stop').addEventListener('click', () => stopListening());
$('fp-worse').addEventListener('click', () => {
  clearTimeout(sleepTimer); stopAll(1.5);
  const before = outputLevelDb();
  profile.events.push({ type: 'worse', at: now(), mode: profile.mode, x: championX(), levelDb: before });
  if (profile.mode === 'calm') profile.baseLevelDb = clamp(baseDb() - WORSE_STEP_DB, LEVEL_MIN_DB, CONTOUR_CAP_DB);
  else profile.trims[profile.mode] = clamp((profile.trims[profile.mode] ?? 0) - WORSE_STEP_DB, -30, 0);
  save(); renderFingerprint(); renderMode();
  const lowered = before - outputLevelDb();
  say(`Stopped. Silence may be best right now. ${lowered > 0 ? `Still lowered the level for this state by ${lowered.toFixed(0)} dB.` : 'The level for this state is already at its minimum.'} If symptoms are new or unusual, seek care.`);
});

/* ---------- Mode, dim, data ---------- */
document.querySelectorAll('[name=mode]').forEach(input => input.addEventListener('change', () => {
  const wasListening = listening();
  profile.mode = input.value; save();
  if (hold) endHold();
  stopAll(wasListening ? 2 : .3);
  resetTuner(); renderMode(); renderFingerprint();
  if (wasListening) say('State changed. Press play again to hear the sound adjusted for it.');
}));
function toggleDim(force) {
  const on = document.body.classList.toggle('dim', force);
  $('dim').textContent = on ? 'Light screen' : 'Dim screen'; $('dim').setAttribute('aria-pressed', String(on));
}
$('dim').addEventListener('click', () => toggleDim());

function download(blob, name) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
$('export').addEventListener('click', () => {
  save();
  download(new Blob([JSON.stringify({ ...profile, exportedAt: now(), purpose: 'Personal sound comfort profile. Describes stated comfort on one device; not a hearing test or treatment record.' }, null, 2)], { type: 'application/json' }), 'still-comfort-profile.json');
});
$('import').addEventListener('change', async e => {
  const file = e.target.files?.[0]; e.target.value = '';
  if (!file) return;
  try {
    if (file.size > 2e6) throw new Error('too large');
    // Validate everything first; only replace the current profile once all of it is usable.
    const next = sanitize(JSON.parse(await file.text()));
    const nextModel = next.tuner.model ? PreferenceGP.fromJSON(next.tuner.model) : new PreferenceGP();
    nextModel.fit();
    stopAll(.3); resetTuner();
    profile = next; model = nextModel;
    save(); renderAll(); say('Profile imported.');
  } catch { say('That file is not a usable Still comfort profile export. Your current profile was not changed.'); }
});
$('clear').addEventListener('click', () => {
  if (!confirm('Clear your comfort profile from this browser? Exported files are not affected.')) return;
  stopListening('');
  resetTuner();
  profile = freshProfile(); model = new PreferenceGP();
  try { localStorage.removeItem(KEY); } catch {}
  renderAll(); say('Profile cleared from this browser.');
});
window.addEventListener('pagehide', () => stopAll(.05));
document.addEventListener('visibilitychange', () => { if (document.hidden && hold) endHold(); });

function renderAll() { renderQuestions(); renderReference(); renderHeadphones(); renderContour(); renderTuner(); renderFingerprint(); renderMode(); }
renderAll();
