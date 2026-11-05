// Quiet room: the one-tap page for hard headache moments.
// Silence first, then the person's own comfort sound (from the comfort profile), then a softer version.
// No prompts while anything plays; an optional one-tap check-in appears only afterwards.
import { renderComfortLoop, createSafetyChain, contourCeilingDb, describeX, MODES, CONTOUR_BANDS, clamp } from './comfort-engine.js';
import { PreferenceGP } from './preference-model.js';
import { loadJournal, saveJournal, pendingFollowUp } from './journal-store.js';

const $ = id => document.getElementById(id);
const PROFILE_KEY = 'still-profile-v1';
const DEFAULT_X = [.25, .15, 0, .3];          // same gentle dark default as the profile page
const CONTOUR_CAP_DB = 6, LEVEL_MIN_DB = -40, WORSE_STEP_DB = 4, SOFTER_DB = -6;
const dbToAmp = db => 10 ** (db / 20);
const storage = (() => { try { return window.localStorage; } catch { return null; } })();
const memory = new Map();
const store = storage || { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };

/* ---------- Profile (read-mostly; written only to lower a level after "making it worse") ---------- */
function readRawProfile() {
  try {
    const raw = JSON.parse(store.getItem(PROFILE_KEY) || 'null');
    return raw && raw.schema === PROFILE_KEY ? raw : null;
  } catch { return null; }
}

function profileInfo() {
  const raw = readRawProfile() || {};
  const contour = (Array.isArray(raw.contour) ? raw.contour : [])
    .filter(b => CONTOUR_BANDS.includes(b?.hz) && Number.isFinite(b.ceilingDb));
  const vetoes = (Array.isArray(raw.tuner?.vetoes) ? raw.tuner.vetoes : []).filter(v => Array.isArray(v) && v.length === 4);
  const near = (p, q) => Math.hypot(...p.map((v, i) => v - q[i])) < .15;
  let champion = null;
  try { if (raw.tuner?.model) champion = PreferenceGP.fromJSON(raw.tuner.model).champion(x => vetoes.some(v => near(v, x))); } catch {}
  const cap = Math.min(CONTOUR_CAP_DB, contour.length >= 3 ? contourCeilingDb(contour) : CONTOUR_CAP_DB);
  const base = Math.min(Number.isFinite(raw.baseLevelDb) ? clamp(raw.baseLevelDb, LEVEL_MIN_DB, CONTOUR_CAP_DB) : 0, cap);
  const trims = raw.trims && typeof raw.trims === 'object' ? raw.trims : {};
  const sudden = Number.isInteger(raw.answers?.sudden) ? clamp(raw.answers.sudden, 0, 4) : 0;
  return { exists: !!raw.schema, hasReference: !!raw.reference, contour: contour.length >= 3 ? contour : null, champion, base, trims, sudden };
}

// Mirrors the profile page: a harder state is never louder than a normal day.
function levelFor(info, state) {
  const trim = Number.isFinite(info.trims[state]) ? clamp(info.trims[state], -30, 0) : 0;
  return info.base + MODES[state].offsetDb + trim;
}

function lowerStateLevel(state) {
  const raw = readRawProfile() || { schema: PROFILE_KEY };
  raw.trims = { normal: 0, warning: 0, attack: 0, recovering: 0, ...(raw.trims || {}) };
  const before = Number.isFinite(raw.trims[state]) ? raw.trims[state] : 0;
  raw.trims[state] = clamp(before - WORSE_STEP_DB, -30, 0);
  try { store.setItem(PROFILE_KEY, JSON.stringify(raw)); } catch {}
  return before - raw.trims[state];
}

/* ---------- Journal ---------- */
let journal = loadJournal(store);
let session = null;   // the session in progress: { id, at, state, choice, startMs, levelDb, worse }
let lastSessionId = null;

function startSession(choice, levelDb = null) {
  endSession({ ask: false });
  const at = new Date();
  session = { id: `${at.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: at.toISOString(), state: currentState(), choice, startMs: Date.now(), levelDb, worse: false };
}

function endSession({ ask = true } = {}) {
  if (!session) return;
  const s = session; session = null;
  const durationS = Math.round((Date.now() - s.startMs) / 1000);
  if (durationS < 3 && !s.worse) return;   // an accidental tap is not a session
  journal = loadJournal(store);             // another tab may have written since
  journal.sessions.push({ id: s.id, at: s.at, state: s.state, choice: s.choice, durationS, levelDb: s.levelDb, worse: s.worse, followUp: s.worse ? 'worse' : null });
  if (!saveJournal(store, journal)) say('This browser is not letting Still save the journal.');
  lastSessionId = s.id;
  if (ask && !s.worse) showCheck();
}

/* ---------- Audio: one safety chain, one sound at a time, always fading ---------- */
let ctx, output, active = null, token = 0, sleepTimer = 0;
function audio() {
  if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); output = createSafetyChain(ctx); }
  return ctx;
}

function fadeOut(seconds) {
  token++;
  clearTimeout(sleepTimer);
  const h = active; active = null;
  if (!h || !ctx) return;
  const t = ctx.currentTime;
  h.gain.gain.cancelScheduledValues(t);
  h.gain.gain.setValueAtTime(h.gain.gain.value, t);
  h.gain.gain.linearRampToValueAtTime(0, t + seconds);
  try { h.source.stop(t + seconds + .05); } catch {}
}

async function playSound(choice) {
  const info = profileInfo();
  const state = currentState();
  let x = info.champion || DEFAULT_X;
  let level = levelFor(info, state);
  if (choice === 'softer') { x = [Math.max(0, x[0] - .2), x[1], 0, Math.max(0, x[3] - .25)]; level += SOFTER_DB; }
  fadeOut(.3);
  const mine = token;
  showPlaying('Preparing…');
  startSession(choice, level);
  await new Promise(r => setTimeout(r, 30));
  const c = audio();
  await c.resume();
  if (mine !== token) return;
  const sound = renderComfortLoop(x, { rate: c.sampleRate, log2Length: 19, seed: 21, contour: info.contour, mode: state });
  if (mine !== token) return;
  const buffer = c.createBuffer(2, sound.left.length, sound.rate);
  buffer.getChannelData(0).set(sound.left); buffer.getChannelData(1).set(sound.right);
  const source = c.createBufferSource(), gain = c.createGain();
  source.buffer = buffer; source.loop = true;
  const fadeIn = MODES[state].fadeSeconds + .75 * info.sudden;
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(dbToAmp(level), c.currentTime + fadeIn);
  source.connect(gain); gain.connect(output);
  source.start();
  active = { source, gain };
  const minutes = Number($('timer').value);
  if (minutes) sleepTimer = setTimeout(() => { if (mine === token) { fadeOut(60); setTimeout(() => { endSession({ ask: false }); showChoices(); say('Faded to silence. Rest well.'); }, 61e3); } }, Math.max(0, minutes - 1) * 60e3);
  const what = choice === 'softer' ? 'A softer, darker version' : info.champion ? 'Your comfort sound' : 'A gentle, dark default';
  showPlaying(`${what} is fading in over ${fadeIn.toFixed(0)} seconds${minutes ? `, and fades out by itself after ${minutes} minutes` : ''}. Turn your device volume down if it is too much.`);
}

/* ---------- Dark screen ---------- */
function showDark(withSound) {
  if (!withSound) { fadeOut(2); startSession('silence'); }
  $('dark').hidden = false;
  $('dark').focus();
}
function hideDark() {
  if ($('dark').hidden) return;
  $('dark').hidden = true;
  if (session?.choice === 'silence') { endSession(); showChoices(); }
}
$('dark').addEventListener('click', hideDark);
$('dark').addEventListener('keydown', hideDark);

/* ---------- UI ---------- */
function say(text) { $('status').textContent = text; }
function currentState() { return document.querySelector('[name=state]:checked')?.value || 'attack'; }

function showPlaying(text) {
  $('playing').hidden = false; $('playing-text').textContent = text;
  document.querySelectorAll('.qr-choice').forEach(b => { b.setAttribute('aria-pressed', String(b.id === `go-${session?.choice}`)); });
  if (!$('dark-while')) {
    const b = document.createElement('button');
    b.id = 'dark-while'; b.type = 'button'; b.className = 'qr-worse'; b.textContent = 'Dark screen while it plays';
    b.addEventListener('click', () => showDark(true));
    $('worse').before(b);
  }
  $('check').hidden = true;
}
function showChoices() {
  $('playing').hidden = true;
  document.querySelectorAll('.qr-choice').forEach(b => b.setAttribute('aria-pressed', 'false'));
}
function showCheck() { $('check').hidden = false; }

$('go-dark').addEventListener('click', () => { showChoices(); showDark(false); });
$('go-comfort').addEventListener('click', () => playSound('comfort'));
$('go-softer').addEventListener('click', () => playSound('softer'));
$('stop').addEventListener('click', () => { fadeOut(3); endSession(); showChoices(); say('Fading to silence.'); });
$('worse').addEventListener('click', () => {
  fadeOut(1.5);
  const state = session?.state || currentState();
  if (session) session.worse = true;
  endSession({ ask: false });
  const lowered = lowerStateLevel(state);
  showChoices();
  say(`Stopped. Silence may be best right now.${lowered ? ` Next time this state starts ${lowered} dB quieter.` : ''} If this headache is new or different, get medical advice.`);
});

document.querySelectorAll('[name=state]').forEach(input => input.addEventListener('change', () => {
  if (active || session) { fadeOut(2); endSession({ ask: false }); showChoices(); say('State changed. Press a choice again to hear it adjusted.'); }
  renderDetail();
}));

document.querySelectorAll('[data-follow]').forEach(button => button.addEventListener('click', () => {
  journal = loadJournal(store);
  const s = journal.sessions.find(x => x.id === lastSessionId) || pendingFollowUp(journal);
  if (s) { s.followUp = button.dataset.follow; saveJournal(store, journal); }
  $('check').hidden = true;
  say(button.dataset.follow === 'skipped' ? 'Okay. Rest well.' : 'Noted. Rest well.');
}));

function renderDetail() {
  const info = profileInfo();
  const level = levelFor(info, currentState());
  const ref = info.hasReference ? 'your quiet reference' : 'the default level';
  $('comfort-detail').textContent = info.champion
    ? `Your tuned sound: ${describeX(info.champion).tilt}. Plays ${Math.abs(level).toFixed(0)} dB below ${ref}.`
    : `No comfort profile yet, so a gentle, dark default plays ${Math.abs(level).toFixed(0)} dB below ${ref}. Build a profile on a calmer day.`;
}

window.addEventListener('pagehide', () => { fadeOut(.05); endSession({ ask: false }); });
renderDetail();
const pending = pendingFollowUp(journal);
if (pending) { lastSessionId = pending.id; showCheck(); }
