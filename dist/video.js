// Still for Video: page controller. Captures one tab or plays a file through the comfort filter,
// tunes the filter on the person's own content, runs the blinded check and keeps the local record.
import {
  filterSettings, describeSettings, firstChallenger, vetoFilter, seededOrder, stateKey, GENTLE_PRESET, clamp,
} from './comfort-filter.js';
import {
  createLiveGraph, createTap, snapshot, prepareClip, clipLevelDb, renderClip, weightedLevelDb,
  scaleBuffer, playBuffer, captureTab, reportedLatencyMs, tabAudioSupported,
} from './video-audio.js';
import { PreferenceGP } from './preference-model.js';
import {
  loadVideoState, saveVideoState, freshVideoState, studyExport, summarise, trimModel, validCode, VIDEO_KEY,
} from './video-store.js';

const $ = id => document.getElementById(id);
const say = text => { $('status').textContent = text; };
const nowIso = () => new Date().toISOString();
const CLIP_SECONDS = 6, MIN_CLIP_DB = -55, MIN_ROUNDS = 5, SETTLED_STREAK = 3;
const FEEDBACK_AFTER_S = 45, CHECK_NEW_AUDIO_S = 20, SILENT_RMS = 1e-4;
const STATE_NOTES = {
  calm: 'Calm: your setting as tuned. Quiet sound passes unchanged; only loud moments and harsh bands come down.',
  sensitive: 'Sensitive: stronger softening and sudden sounds held back more. Everything comes down a little; loud moments and harsh bands come down most.',
  very: 'Very sensitive: the strongest softening the speech guard allows. Everything comes down; loud moments come down about 6 dB or more, quiet words less.',
  recovering: 'Recovering: like sensitive, while you ease back in.',
};

/* ---------- Storage that never throws (blocked site data, private modes) ---------- */
const storage = (() => { try { const s = window.localStorage; s.getItem(VIDEO_KEY); return s; } catch { return null; } })();
let data = loadVideoState(storage);
const save = () => { if (!storage || !saveVideoState(storage, data)) $('storage-note').hidden = false; };

let ctx = null, tap = null, live = null, tapLevel = 0;
let source = null; // { kind: 'tab'|'file', stream?, track?, node }
let session = null, sessionTimer = null, fileNode = null;
let activeSinceTune = Infinity; // seconds of audio heard since the last tuning clip or check
let listenHeardS = 0, listeningId = null; // one "listen" = one source, across setting changes
const video = $('video');

/* ---------- Audio setup ---------- */
/** Create and resume the context synchronously inside a click, before any await (Safari needs this). */
function unlockAudio() {
  if (!ctx) ctx = new AudioContext({ latencyHint: 'interactive' });
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}
addEventListener('pointerdown', () => { if (ctx?.state === 'suspended') ctx.resume().catch(() => {}); });
let building = null;
async function ensureAudio() {
  unlockAudio();
  // One shared build, so concurrent callers (a click and the video's play event) never make two graphs.
  building ||= (async () => {
    try {
      tap = await createTap(ctx, 8);
      tap?.port.addEventListener('message', e => { if (e.data?.type === 'level') tapLevel = e.data.rms; });
      tap?.port.start();
    } catch { tap = null; }
    live = createLiveGraph(ctx, tap);
    applySettings();
    live.setVolumeDb(data.volumeDb);
  })();
  await building;
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
}

const usingPersonal = () => !!data.personal.x && document.querySelector('[name=setting]:checked')?.value !== 'preset';
const currentX = () => (usingPersonal() ? data.personal.x : GENTLE_PRESET.slice());
const rate = () => ctx?.sampleRate || 48000;
const currentSettings = () => filterSettings(currentX(), data.state, { rate: rate() });

function applySettings() {
  const st = currentSettings();
  live?.setSettings(st);
  const list = $('setting-list'); list.replaceChildren();
  const head = document.createElement('li');
  head.textContent = usingPersonal() ? 'Your tuned setting:' : data.personal.x ? 'The gentle preset:' : 'The gentle preset (tune it below to make it yours):';
  list.append(head);
  for (const part of describeSettings(st)) { const li = document.createElement('li'); li.textContent = part; list.append(li); }
  if (st.guardScale < .999) { const li = document.createElement('li'); li.textContent = 'Speech guard active: shaping eased back to keep words clear.'; list.append(li); }
}

/* ---------- Sessions: one record per source and setting; time counts only while sound is heard ---------- */
function hearingNow() {
  if (!source || !live || live.muted) return false;
  return source.kind === 'file' ? !video.paused && !video.ended && !video.muted && video.volume > 0 : tapLevel > SILENT_RMS;
}
function startSession() {
  if (!source) return;
  session = {
    id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`, startedAt: nowIso(), durationS: 0, filteredS: 0,
    source: source.kind, content: $('content').value, device: $('device').value, state: data.state, x: currentX(),
    personal: usingPersonal(), volumeDb: data.volumeDb, bypassCount: 0, bypassS: 0, latencyMs: ctx ? reportedLatencyMs(ctx) : null, feedback: null,
    listeningId, localDay: new Date().toLocaleDateString('en-CA'),
  };
  let volumeSum = 0;
  data.sessions.push(session); save();
  clearInterval(sessionTimer);
  let ticks = 0;
  sessionTimer = setInterval(() => {
    if (!session) return;
    if (hearingNow()) {
      session.durationS++; activeSinceTune++; listenHeardS++; volumeSum += data.volumeDb;
      if (live.bypassed) session.bypassS++; else session.filteredS++;
      session.volumeDb = Math.round(volumeSum / session.durationS); // heard-time-weighted volume
    }
    session.content = $('content').value; session.device = $('device').value;
    if (session.latencyMs == null && ctx) session.latencyMs = reportedLatencyMs(ctx);
    if (++ticks % 15 === 0) save();
    if (ticks === 2 || ticks % 30 === 0) renderLatency();
  }, 1000);
}
function endSession(ask = true) {
  if (!session) return;
  clearInterval(sessionTimer);
  const ended = session; session = null;
  // A segment where nothing was heard is not a listening session.
  if (ended.durationS === 0) data.sessions = data.sessions.filter(s => s !== ended && s.id !== ended.id);
  save(); renderSummary();
  if (ask && listenHeardS >= FEEDBACK_AFTER_S) {
    // Feedback covers the whole listen; it is stored on its longest segment.
    const segs = data.sessions.filter(x => x.listeningId === ended.listeningId);
    const longest = segs.reduce((a, b) => (b.durationS > (a?.durationS ?? -1) ? b : a), null);
    if (longest) showFeedback(longest.id);
  }
}
function newListen() { listenHeardS = 0; listeningId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`; activeSinceTune = 0; }
/** A change of state or setting mid-listening starts a new record, so each record has one setting. */
function splitSession() { if (session) { endSession(false); startSession(); } }
addEventListener('pagehide', () => save());

/* ---------- 01 Start: tab or file ---------- */
if (!tabAudioSupported()) {
  $('tab-start').disabled = true;
  $('tab-note').textContent = 'This browser can’t share a tab’s sound. Use Chrome or Edge on a computer, or open a video file instead.';
}

$('tab-start').addEventListener('click', async () => {
  unlockAudio();
  try {
    await ensureAudio(); // before getDisplayMedia uses up the click's permission to start audio
    say('Choose the tab with your video. Keep “Also share tab audio” ticked.');
    const cap = await captureTab();
    stopSource(false);
    const node = ctx.createMediaStreamSource(cap.audioStream);
    source = { kind: 'tab', stream: cap.stream, track: cap.track, node };
    live.attach(node); live.setBypass(false); live.setMuted(false); newListen();
    cap.stream.getTracks().forEach(t => t.addEventListener('ended', () => {
      if (source?.stream === cap.stream) { stopSource(true); hideLive(); say('Sharing stopped, so the video’s own sound is back. Press “Filter a browser tab” to start again.'); }
    }));
    cap.track.addEventListener('mute', () => { if (source?.track === cap.track) say('Paused while the video tab is unavailable.'); });
    cap.track.addEventListener('unmute', () => { if (source?.track === cap.track) say('Filtering the tab again.'); });
    $('player-wrap').hidden = true; video.pause();
    showLive('tab');
    startSession();
    say(cap.suppressed
      ? 'Filtering the tab. Its own sound is silenced, so you hear only the gentler version. Come back to this page to compare with the original.'
      : 'Filtering the tab. If you also hear the original, this browser could not silence it: mute that tab (right-click it, then Mute site).');
    setTimeout(checkSilence, 6000);
  } catch (err) {
    const code = err?.code || err?.name;
    say(code === 'NotAllowedError' ? 'No tab was shared. Press the button again when you are ready.'
      : code === 'InvalidStateError' ? 'Click “Filter a browser tab” again.'
      : code === 'unsupported' ? 'This browser can’t share a tab’s sound. Use Chrome or Edge on a computer, or open a video file instead.'
      : code === 'no-audio' ? 'Still can see the tab but not hear it. Choose the tab again and leave “Also share tab audio” on.'
      : code === 'not-a-tab' ? 'Only a browser tab can share its sound here. Choose the Chrome Tab option, then your video’s tab.'
      : `Could not start: ${err?.message || err}`);
  }
});

function checkSilence() {
  if (source?.kind !== 'tab' || !tap) return;
  if (tapLevel < SILENT_RMS) say('Still hears silence from that tab. Press play there. If it stays silent, the site may block sharing its sound (common with copy-protected video). Try another video or a file.');
}

$('file-button').addEventListener('click', () => { unlockAudio(); $('file-input').click(); });
$('file-input').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  await ensureAudio();
  stopSource(false);
  if (video.src) URL.revokeObjectURL(video.src);
  video.src = URL.createObjectURL(file);
  if (!fileNode) fileNode = ctx.createMediaElementSource(video);
  source = { kind: 'file', node: fileNode };
  live.attach(fileNode); live.setBypass(false); live.setMuted(false); newListen();
  $('player-wrap').hidden = false;
  showLive('file');
  startSession();
  say('Press play on the video. You are hearing the gentler version. Press “Hear original” or B to compare.');
  e.target.value = '';
});
video.addEventListener('play', () => { ensureAudio(); });

function showLive(kind) {
  $('live-source').textContent = kind === 'tab' ? 'the shared tab' : 'this video';
  $('live-panel').hidden = false; $('tune-panel').hidden = false;
  renderCheckAvailability(); renderLatency(); renderBypass();
}
function hideLive() {
  $('live-panel').hidden = true; $('tune-panel').hidden = true; $('check-panel').hidden = true;
  $('player-wrap').hidden = true;
}

function stopSource(ask = true) {
  resetTuner(); cancelCheck(false);
  if (!source) return;
  if (source.kind === 'tab') source.stream.getTracks().forEach(t => t.stop());
  if (source.kind === 'file') video.pause();
  live?.detach(); live?.setBypass(false); live?.setMuted(false);
  source = null;
  endSession(ask);
}
$('stop').addEventListener('click', () => {
  stopSource(true); stopPlayback(); hideLive();
  say('Stopped. Choose a tab or a file to start again.');
  $('tab-start').focus();
});

function renderLatency() {
  if (!ctx) return;
  const ms = reportedLatencyMs(ctx), bt = $('device').value === 'bluetooth';
  const known = ms == null ? 'This browser doesn’t report its output delay.' : `This page adds about ${ms} ms before the sound reaches your speakers.`;
  $('latency-note').textContent = source?.kind === 'tab'
    ? `${known} Capturing the tab adds a little more. Sound can arrive slightly after lips move; a lag under about 125 ms is rarely noticed.${bt ? ' Bluetooth headphones often add 150–350 ms of their own; wired headphones or speakers keep voices closer to lips.' : ''}`
    : `Picture and sound play together on this page. ${known}${bt ? ' Bluetooth headphones may add their own delay.' : ''}`;
}
$('device').addEventListener('change', () => { data.device = $('device').value; save(); renderLatency(); });

/* ---------- Live controls ---------- */
document.querySelectorAll('[name=state]').forEach(input => input.addEventListener('change', () => {
  data.state = stateKey(input.value); save();
  $('state-note').textContent = STATE_NOTES[data.state];
  applySettings(); splitSession();
  if (tuner.clip) nextPair();
}));
document.querySelectorAll('[name=setting]').forEach(input => input.addEventListener('change', () => { applySettings(); splitSession(); }));
$('volume').addEventListener('input', () => {
  data.volumeDb = clamp(Number($('volume').value), -30, 0);
  $('volume-value').textContent = `${data.volumeDb} dB`;
  live?.setVolumeDb(data.volumeDb);
  if (outGain) outGain.gain.setTargetAtTime(10 ** (data.volumeDb / 20), ctx.currentTime, .03);
  save();
});

function setBypass(on) {
  if (!live || !source || on === live.bypassed) return;
  live.setBypass(on);
  if (session && on) session.bypassCount++;
  renderBypass();
  say(on ? 'Original sound. Press again to go back to the gentler version.' : 'Gentler version.');
}
function renderBypass() {
  const on = !!live?.bypassed;
  $('bypass').setAttribute('aria-pressed', String(on));
  $('bypass').querySelector('strong').textContent = on ? 'Hearing the original' : 'Hear original';
  $('bypass').querySelector('small').textContent = data.shortcut ? (on ? 'Press B to go back' : 'Or press B') : (on ? 'Press to go back' : '');
}
$('bypass').addEventListener('click', () => setBypass(!live?.bypassed));
$('shortcut').addEventListener('change', () => { data.shortcut = $('shortcut').checked; save(); renderBypass(); });
addEventListener('keydown', e => {
  if (!data.shortcut || e.repeat || e.key.toLowerCase() !== 'b' || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t.closest?.('textarea, select, [contenteditable]') || (t.matches?.('input') && !['radio', 'checkbox', 'range', 'button', 'submit', 'reset'].includes(t.type))) return;
  if (!source) return;
  e.preventDefault(); setBypass(!live.bypassed);
});

/* ---------- Playback of rendered clips (tuning and check) ---------- */
let outGain = null, current = null, playToken = 0;
function playbackOut() {
  if (!outGain) { outGain = ctx.createGain(); outGain.connect(ctx.destination); }
  outGain.gain.value = 10 ** (data.volumeDb / 20);
  return outGain;
}
function stopPlayback() { playToken++; try { current?.stop(); } catch {} current = null; markPlaying(null); }
function markPlaying(id) {
  ['card-a', 'card-b'].forEach(c => $(c).classList.toggle('playing', c === id));
  document.querySelectorAll('.version').forEach(v => v.classList.toggle('playing', v.id === id));
}
/** Plays buffers in turn. Resolves true only if every one played to the end without being interrupted. */
async function playSeq(items) {
  stopPlayback(); await ensureAudio();
  const token = playToken;
  for (const [id, buffer] of items) {
    if (token !== playToken) return false;
    markPlaying(id);
    await playBuffer(ctx, buffer, playbackOut(), s => { current = s; });
    if (token !== playToken) return false;
    await new Promise(r => setTimeout(r, 400));
  }
  markPlaying(null);
  return token === playToken;
}

/** Scale buffers to the quietest one's A-weighted level (two passes, in case the peak guard bites). */
function matchLoudness(buffers) {
  for (let pass = 0; pass < 2; pass++) {
    const levels = buffers.map(weightedLevelDb), target = Math.min(...levels);
    buffers.forEach((buf, i) => { if (levels[i] - target > .05) scaleBuffer(buf, target - levels[i]); });
  }
  return weightedLevelDb(buffers[0]);
}

async function takeClip() {
  if (!tap) { say('This browser cannot keep a short clip for tuning. Try desktop Chrome or Edge.'); return null; }
  const raw = await snapshot(ctx, tap).catch(() => null);
  if (!raw || raw.duration < 3) { say('Let the video play for a few seconds first, then try again.'); return null; }
  const clip = prepareClip(ctx, raw, CLIP_SECONDS);
  if (clipLevelDb(clip) < MIN_CLIP_DB) { say('The last few seconds were almost silent. Let some speech play, then try again.'); return null; }
  return clip;
}

/* ---------- 02 Tuning on the person's own content ---------- */
const tuner = { clip: null, pair: null, roundsThisClip: 0 };
let model = PreferenceGP.fromJSON(trimModel(data.personal.model || {}));
const vetoed = x => vetoFilter(data.personal.vetoes)(x);

$('clip-take').addEventListener('click', async () => {
  if (!source) { say('Start a tab or a file first.'); return; }
  const clip = await takeClip();
  if (!clip) return;
  if (source.kind === 'file') video.pause();
  live.setMuted(true);
  tuner.clip = clip; tuner.roundsThisClip = 0; activeSinceTune = 0;
  $('tuner').hidden = false; $('tune-done').disabled = false;
  nextPair();
  say(source.kind === 'tab' ? 'Got it. Pause your video while you compare; the live sound is muted until you go back.' : 'Got it. The video is paused while you compare.');
  $('ab-play').focus();
});

function nextPair() {
  stopPlayback();
  const champ = model.champion(vetoed) || data.personal.x || GENTLE_PRESET.slice();
  const fresh = !model.comparisons.length && tuner.roundsThisClip === 0;
  let challenger = fresh ? firstChallenger(champ) : model.nextChallenger({ seed: data.rounds.length * 17 + 5, exclude: vetoed, start: champ });
  if (vetoed(challenger)) challenger = model.nextChallenger({ seed: data.rounds.length * 31 + 7, exclude: vetoed, start: champ });
  const aIsChamp = Math.random() < .5;
  tuner.pair = { a: aIsChamp ? champ : challenger, b: aIsChamp ? challenger : champ, state: data.state, buffers: null, played: false };
  $('desc-a').textContent = 'Press play to hear it'; $('desc-b').textContent = 'Press play to hear it';
  setChoices(false); renderTuner();
}

/** Render A and B offline through the real chain and match their loudness, so only the shaping differs. */
async function pairBuffers(p) {
  if (p.buffers) return p.buffers;
  const r = tuner.clip.sampleRate;
  const [a, b] = await Promise.all([p.a, p.b].map(x => renderClip(tuner.clip, filterSettings(x, p.state, { rate: r }))));
  matchLoudness([a, b]);
  p.buffers = { a, b };
  if (tuner.pair === p) {
    const st = x => describeSettings(filterSettings(x, p.state, { rate: r })).slice(0, 3).join(', ');
    $('desc-a').textContent = st(p.a); $('desc-b').textContent = st(p.b);
  }
  return p.buffers;
}

$('ab-play').addEventListener('click', async () => {
  const p = tuner.pair;
  if (!p) return;
  const { a, b } = await pairBuffers(p);
  if (tuner.pair !== p) return;
  // Only a full, uninterrupted A-then-B of THIS pair unlocks the choice.
  if (await playSeq([['card-a', a], ['card-b', b]]) && tuner.pair === p) { p.played = true; setChoices(true); }
});
$('ab-a').addEventListener('click', async () => { const p = tuner.pair; if (p) { const { a } = await pairBuffers(p); if (tuner.pair === p) playSeq([['card-a', a]]); } });
$('ab-b').addEventListener('click', async () => { const p = tuner.pair; if (p) { const { b } = await pairBuffers(p); if (tuner.pair === p) playSeq([['card-b', b]]); } });
$('ab-stop').addEventListener('click', stopPlayback);

function setChoices(on) { document.querySelectorAll('#tuner .choice').forEach(b => { b.disabled = !on; }); }

document.querySelectorAll('#tuner .choice').forEach(btn => btn.addEventListener('click', () => {
  const p = tuner.pair, choice = btn.dataset.choice;
  if (!p?.played) return;
  stopPlayback();
  if (choice === 'a') model.addComparison(p.a, p.b);
  if (choice === 'b') model.addComparison(p.b, p.a);
  if (choice === 'unclear-a') { data.personal.vetoes = [...data.personal.vetoes, p.a].slice(-50); model.addComparison(p.b, p.a); }
  if (choice === 'unclear-b') { data.personal.vetoes = [...data.personal.vetoes, p.b].slice(-50); model.addComparison(p.a, p.b); }
  data.rounds.push({ at: nowIso(), state: p.state, a: p.a, b: p.b, choice, source: source?.kind || 'file' });
  tuner.roundsThisClip++; activeSinceTune = 0;
  model = PreferenceGP.fromJSON(trimModel(model.toJSON())); // memory and storage hold the same, newest data
  const champ = model.champion(vetoed);
  if (champ) data.personal.x = champ.map(v => Math.round(v * 1000) / 1000);
  data.personal.model = model.toJSON();
  save();
  const personal = document.querySelector('[name=setting][value=personal]');
  personal.disabled = !data.personal.x; if (data.personal.x) personal.checked = true;
  applySettings(); nextPair(); renderSummary(); renderCheckAvailability();
  $('ab-play').focus();
}));

function renderTuner() {
  const n = model.comparisons.length, run = model.streak(vetoed);
  $('tune-pill').textContent = `ROUND ${data.rounds.length}`;
  $('settle-bar').style.width = n ? Math.round(Math.min(1, run / SETTLED_STREAK) * Math.min(1, n / MIN_ROUNDS) * 100) + '%' : '0';
  $('settle-note').textContent = !n ? 'Learning starts after your first choice.'
    : n >= MIN_ROUNDS && run >= SETTLED_STREAK ? 'Settled: your setting has beaten the last few alternatives. You can stop here.'
    : `Your current setting has won ${run} in a row. When it beats ${SETTLED_STREAK} in a row after ${MIN_ROUNDS} rounds, it is settled.`;
}

function resetTuner() {
  stopPlayback();
  tuner.clip = null; tuner.pair = null; tuner.roundsThisClip = 0;
  $('tuner').hidden = true; $('tune-done').disabled = true;
}
$('tune-done').addEventListener('click', () => {
  resetTuner(); live?.setMuted(false);
  tap?.port.postMessage('clear'); // the check must use a moment that was not tuned on
  if (data.personal.x) document.querySelector('[name=setting][value=personal]').checked = true;
  applySettings(); splitSession();
  say(data.personal.x ? 'Now using your setting. Press play on your video.' : 'Back to the gentle preset. Press play on your video.');
  $('clip-take').focus();
});

/* ---------- 03 Blinded check ---------- */
let check = null;
const samePoint = (a, b) => a && b && Math.hypot(...a.map((v, i) => v - b[i])) < .05;

function renderCheckAvailability() {
  const ready = model.comparisons.length >= MIN_ROUNDS && !!data.personal.x && !samePoint(data.personal.x, GENTLE_PRESET);
  $('check-panel').hidden = !source || !ready;
}

$('check-start').addEventListener('click', async () => {
  if (!source) { say('Start a tab or a file first.'); return; }
  if (tuner.clip) { say('Finish tuning first: press “Use my setting and go back”.'); return; }
  if (check) return;
  if (activeSinceTune < CHECK_NEW_AUDIO_S) { say(`Listen to about ${CHECK_NEW_AUDIO_S} more seconds first, so the check uses a moment you didn’t tune on.`); return; }
  const clip = await takeClip();
  if (!clip) return;
  if (source.kind === 'file') video.pause();
  live.setMuted(true);
  const r = clip.sampleRate, conditions = ['quieter', 'preset', 'personal'];
  const buffers = await Promise.all([
    renderClip(clip, null),
    renderClip(clip, filterSettings(GENTLE_PRESET, data.state, { rate: r })),
    renderClip(clip, filterSettings(data.personal.x, data.state, { rate: r })),
  ]);
  const matchedLevelDb = matchLoudness(buffers);
  const order = seededOrder(3, (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0);
  check = {
    at: nowIso(), state: data.state, source: source.kind, matchedLevelDb, personalX: data.personal.x.slice(), presetX: GENTLE_PRESET.slice(),
    roundsBefore: data.rounds.length, versions: order.map((ci, pos) => ({ condition: conditions[ci], position: pos, buffer: buffers[ci], played: false })),
  };
  renderCheck();
  say('Ready. Play each version and rate it. The live sound is muted until you save or cancel.');
});

function renderCheck() {
  const wrap = $('check-versions'); wrap.replaceChildren(); wrap.hidden = false;
  check.versions.forEach((v, pos) => {
    const card = document.createElement('div'); card.className = 'version'; card.id = `version-${pos}`;
    const scale = (key, q, lo, hi) => `<fieldset><legend>Version ${pos + 1}: ${q}</legend><div class="scale5">${[1, 2, 3, 4, 5].map(n =>
      `<label><input type="radio" name="${key}-${pos}" value="${n}" aria-label="${q} ${n} of 5${n === 1 ? `, ${lo}` : n === 5 ? `, ${hi}` : ''}"><span aria-hidden="true">${n}</span></label>`).join('')}</div><div class="ends" aria-hidden="true"><span>${lo}</span><span>${hi}</span></div></fieldset>`;
    card.innerHTML = `<h3>Version ${pos + 1}</h3><button type="button" class="outline">▶ Play version ${pos + 1}</button><p class="micro heard">Not played yet</p>${scale('c', 'comfort', 'harsh', 'very comfortable')}${scale('k', 'clarity', 'words hard to follow', 'words very clear')}<label class="worse"><input type="checkbox"> It made something worse</label>`;
    card.querySelector('button').addEventListener('click', async () => {
      if (await playSeq([[card.id, v.buffer]])) { v.played = true; card.querySelector('.heard').textContent = 'Played'; updateCheckSave(); }
    });
    card.addEventListener('change', updateCheckSave);
    wrap.append(card);
  });
  $('check-save').hidden = false; $('check-cancel').hidden = false; updateCheckSave();
  wrap.querySelector('button').focus();
}
function readRatings() {
  return check.versions.map((v, pos) => ({
    condition: v.condition, position: pos,
    comfort: Number(document.querySelector(`[name=c-${pos}]:checked`)?.value) || null,
    clarity: Number(document.querySelector(`[name=k-${pos}]:checked`)?.value) || null,
    worse: $(`version-${pos}`).querySelector('.worse input').checked,
  }));
}
function updateCheckSave() {
  $('check-save').disabled = !check || !check.versions.every(v => v.played) || readRatings().some(r => !r.comfort || !r.clarity);
}
function cancelCheck(unmute = true) {
  if (!check && $('check-versions').hidden) return;
  const had = !!check;
  stopPlayback(); check = null;
  if (had) { activeSinceTune = 0; tap?.port.postMessage('clear'); } // the next check needs a new moment
  $('check-versions').hidden = true; $('check-versions').replaceChildren(); $('check-save').hidden = true; $('check-cancel').hidden = true;
  if (unmute && !tuner.clip) live?.setMuted(false);
}
$('check-cancel').addEventListener('click', () => { cancelCheck(); say('Check cancelled. Back to live sound.'); $('check-start').focus(); });
$('check-save').addEventListener('click', () => {
  if (!check) return;
  const { versions, ...meta } = check;
  data.checks.push({ ...meta, matchedLevelDb: Math.round(meta.matchedLevelDb * 10) / 10, ratings: readRatings() });
  save(); cancelCheck(); renderSummary();
  say('Saved. Thank you. Results stay hidden here so later checks remain blind.');
  $('check-start').focus();
});

/* ---------- Feedback after listening ---------- */
let feedbackFor = null;
function showFeedback(id) {
  feedbackFor = id;
  document.querySelectorAll('#feedback-panel input').forEach(i => { i.checked = false; });
  $('feedback-panel').hidden = false;
  $('feedback-heading').focus();
}
$('fb-save').addEventListener('click', () => {
  const val = name => document.querySelector(`[name=fb-${name}]:checked`)?.value || null;
  const worse = val('worse');
  const feedback = { comfortable: val('comfortable'), clear: val('clear'), worse: worse ? worse === 'yes' : null };
  const empty = !feedback.comfortable && !feedback.clear && feedback.worse === null;
  const exists = data.sessions.some(s => s.id === feedbackFor);
  if (!empty && exists) data.sessions = data.sessions.map(s => (s.id === feedbackFor ? { ...s, feedback } : s));
  save(); $('feedback-panel').hidden = true; feedbackFor = null; renderSummary();
  say(empty || !exists ? 'Nothing saved.' : worse === 'yes' ? 'Thank you for telling us. Try a more sensitive state, a lower volume, or silence.' : 'Thank you. Saved on this device.');
});
$('fb-skip').addEventListener('click', () => { $('feedback-panel').hidden = true; });

/* ---------- Record, study export, dim ---------- */
function renderSummary() {
  const s = summarise(data);
  const pct = v => (v == null ? '—' : `${Math.round(v * 100)}%`);
  const cells = [
    [s.sessions, 'listening sessions'], [s.days, 'different days'], [s.listenedMinutes, 'minutes listened'], [data.rounds.length, 'tuning choices'],
  ].map(([v, l]) => `<div><strong>${v}</strong><span>${l}</span></div>`).join('');
  const fb = s.sessions ? `<div class="wide"><span>After listening: comfortable ${pct(s.comfortable)}, words clear ${pct(s.clear)}, made something worse ${pct(s.worse)} (of the sessions you rated).</span></div>` : '';
  const checks = s.checks ? `<div class="wide"><span>Blinded checks done: ${s.checks}. Which version was which stays hidden on this page, so later checks remain blind. The study team sees the results.</span></div>` : '';
  $('summary').innerHTML = cells + fb + checks;
  $('participant').value = data.participant;
  $('consent').checked = data.consent.study; $('export').disabled = !data.consent.study;
}
$('participant').addEventListener('change', () => {
  const v = $('participant').value.trim();
  if (validCode(v)) { data.participant = v.toUpperCase(); save(); say('Study code saved.'); }
  else { $('participant').value = data.participant; say('A study code is 4 to 12 letters or digits.'); }
});
$('consent').addEventListener('change', () => {
  data.consent = { study: $('consent').checked, at: $('consent').checked ? nowIso() : null };
  save(); renderSummary();
});
$('export').addEventListener('click', () => {
  save();
  const blob = new Blob([JSON.stringify(studyExport(data), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `still-video-study-${data.participant}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
});
$('clear').addEventListener('click', () => {
  if (!confirm('Clear your Still for Video settings, choices and record from this device? Your study code is kept.')) return;
  const participant = data.participant;
  stopSource(false); hideLive();
  try { storage?.removeItem(VIDEO_KEY); } catch {}
  data = { ...freshVideoState(), participant }; model = new PreferenceGP(); save();
  $('feedback-panel').hidden = true; feedbackFor = null;
  renderAll(); say('Cleared. Your comfort profile on other pages is untouched.');
});

function toggleDim(force) {
  const on = document.body.classList.toggle('dim', force);
  $('dim').textContent = on ? 'Light screen' : 'Dim screen'; $('dim').setAttribute('aria-pressed', String(on));
}
$('dim').addEventListener('click', () => toggleDim());

function renderAll() {
  document.querySelector(`[name=state][value=${data.state}]`).checked = true;
  $('state-note').textContent = STATE_NOTES[data.state];
  $('volume').value = data.volumeDb; $('volume-value').textContent = `${data.volumeDb} dB`;
  $('device').value = data.device; $('shortcut').checked = data.shortcut;
  const personal = document.querySelector('[name=setting][value=personal]');
  personal.disabled = !data.personal.x;
  document.querySelector(`[name=setting][value=${data.personal.x ? 'personal' : 'preset'}]`).checked = true;
  applySettings(); renderSummary(); renderTuner(); renderBypass();
}
renderAll();
