// Still for Video: what is saved on this device, and the opt-in study export.
// Pure data logic (no DOM), so it runs in Node tests too. Nothing is sent anywhere.
//
// Never stored: audio, tab titles, URLs, file names or free text. Only settings, choices,
// ratings, timings and the coarse context the person chose to give.

import { FILTER_STATES, stateKey, validPoint, GENTLE_PRESET } from './comfort-filter.js';

export const VIDEO_KEY = 'still-video-v1';
export const CONTENT_TYPES = ['lecture', 'tutorial', 'podcast', 'news', 'other', 'unspecified'];
export const DEVICES = ['wired', 'bluetooth', 'speakers', 'unsure'];
export const SOURCES = ['tab', 'file'];
export const CHOICES = ['a', 'b', 'same', 'unclear-a', 'unclear-b'];
export const ANSWERS = ['yes', 'somewhat', 'no'];
export const CONDITIONS = ['quieter', 'preset', 'personal'];
const MAX_SESSIONS = 1000, MAX_ROUNDS = 400, MAX_CHECKS = 200, MAX_VETOES = 50;

const iso = v => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : null);
const bounded = (v, lo, hi, fallback = null) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
const point = v => (validPoint(v) ? v.map(x => round(x)) : null);

/** A participant code: generated here, or typed in from the study team (4–12 letters and digits). */
export const validCode = v => typeof v === 'string' && /^[A-Za-z0-9]{4,12}$/.test(v);

/** A short random code that identifies a participant's export without identifying the person. */
export function participantCode(random = Math.random) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
}

export function freshVideoState(random) {
  return {
    schema: VIDEO_KEY, participant: participantCode(random), dataset: participantCode(random), consent: { study: false, at: null },
    state: 'calm', volumeDb: 0, device: 'unsure', shortcut: true,
    personal: { x: null, model: null, vetoes: [] },
    rounds: [], sessions: [], checks: [],
  };
}

/** Keep only well-formed records. Throws if the object is not Still for Video data at all. */
export function sanitizeVideoState(raw) {
  if (!raw || typeof raw !== 'object' || raw.schema !== VIDEO_KEY) throw new Error('Not Still for Video data');
  const s = freshVideoState();
  if (validCode(raw.participant)) s.participant = raw.participant.toUpperCase();
  s.shortcut = raw.shortcut !== false;
  if (validCode(raw.dataset)) s.dataset = raw.dataset;
  s.consent = { study: raw.consent?.study === true, at: raw.consent?.study === true ? iso(raw.consent.at) : null };
  s.state = stateKey(raw.state);
  s.volumeDb = bounded(raw.volumeDb, -30, 0, 0);
  s.device = pick(raw.device, DEVICES, 'unsure');
  s.personal.x = point(raw.personal?.x);
  if (raw.personal?.model && typeof raw.personal.model === 'object') s.personal.model = raw.personal.model;
  s.personal.vetoes = (Array.isArray(raw.personal?.vetoes) ? raw.personal.vetoes : []).map(point).filter(Boolean).slice(-MAX_VETOES);
  s.rounds = (Array.isArray(raw.rounds) ? raw.rounds : [])
    .filter(r => r && iso(r.at) && point(r.a) && point(r.b) && CHOICES.includes(r.choice))
    .map(r => ({ at: iso(r.at), state: stateKey(r.state), a: point(r.a), b: point(r.b), choice: r.choice, source: pick(r.source, SOURCES, 'file') }))
    .slice(-MAX_ROUNDS);
  s.sessions = (Array.isArray(raw.sessions) ? raw.sessions : [])
    .filter(x => x && iso(x.startedAt) && SOURCES.includes(x.source))
    .map(x => ({
      id: String(x.id || x.startedAt).slice(0, 40),
      startedAt: iso(x.startedAt),
      durationS: Math.round(bounded(x.durationS, 0, 24 * 3600, 0)),
      filteredS: Math.round(bounded(x.filteredS, 0, 24 * 3600, 0)),
      listeningId: typeof x.listeningId === 'string' && /^[a-z0-9]{1,20}$/.test(x.listeningId) ? x.listeningId : null,
      localDay: typeof x.localDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.localDay) ? x.localDay : null,
      source: x.source,
      content: pick(x.content, CONTENT_TYPES, 'unspecified'),
      device: pick(x.device, DEVICES, 'unsure'),
      state: stateKey(x.state),
      x: point(x.x) || point(GENTLE_PRESET.slice()),
      personal: x.personal === true,
      volumeDb: bounded(x.volumeDb, -30, 0, 0),
      bypassCount: Math.round(bounded(x.bypassCount, 0, 1e5, 0)),
      bypassS: Math.round(bounded(x.bypassS, 0, 24 * 3600, 0)),
      latencyMs: bounded(x.latencyMs, 0, 5000, null),
      feedback: cleanFeedback(x.feedback),
    }))
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
    .filter((x, i, all) => all.findIndex(o => o.id === x.id) === i)
    .slice(-MAX_SESSIONS);
  s.checks = (Array.isArray(raw.checks) ? raw.checks : [])
    .filter(c => c && iso(c.at) && Array.isArray(c.ratings))
    .map(c => ({
      at: iso(c.at), state: stateKey(c.state), source: pick(c.source, SOURCES, 'file'),
      matchedLevelDb: bounded(c.matchedLevelDb, -120, 0, null),
      personalX: point(c.personalX), presetX: point(c.presetX),
      roundsBefore: Math.round(bounded(c.roundsBefore, 0, 1e5, 0)),
      ratings: c.ratings
        .filter(r => r && CONDITIONS.includes(r.condition) && Number.isInteger(r.position))
        .map(r => ({
          condition: r.condition, position: bounded(r.position, 0, 2, 0),
          comfort: Number.isInteger(r.comfort) && r.comfort >= 1 && r.comfort <= 5 ? r.comfort : null,
          clarity: Number.isInteger(r.clarity) && r.clarity >= 1 && r.clarity <= 5 ? r.clarity : null,
          worse: r.worse === true,
        }))
        .filter((r, i, all) => all.findIndex(o => o.condition === r.condition) === i),
    }))
    .filter(c => c.ratings.length === CONDITIONS.length)
    .slice(-MAX_CHECKS);
  return s;
}

function cleanFeedback(f) {
  if (!f || typeof f !== 'object') return null;
  const out = { comfortable: pick(f.comfortable, ANSWERS, null), clear: pick(f.clear, ANSWERS, null), worse: typeof f.worse === 'boolean' ? f.worse : null };
  return out.comfortable || out.clear || out.worse !== null ? out : null; // an all-empty answer counts as skipped
}

export function loadVideoState(storage) {
  try { return sanitizeVideoState(JSON.parse(storage?.getItem(VIDEO_KEY) || 'null')); } catch { return freshVideoState(); }
}

export function saveVideoState(storage, state) {
  try { storage.setItem(VIDEO_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

/**
 * Keep a preference model to its most recent comparisons, within the model's own caps (60 points,
 * 120 comparisons). PreferenceGP.fromJSON keeps the oldest data when over the cap, so the page trims
 * to the newest before saving and uses the trimmed model in memory too.
 */
export function trimModel(json, maxPoints = 60, maxComparisons = 120) {
  const points = Array.isArray(json?.points) ? json.points : [], comps = Array.isArray(json?.comparisons) ? json.comparisons : [];
  const kept = [], used = new Set();
  for (let i = comps.length - 1; i >= 0 && kept.length < maxComparisons; i--) {
    const c = comps[i];
    if (!points[c?.w] || !points[c?.l]) continue;
    const extra = [c.w, c.l].filter(k => !used.has(k)).length;
    if (used.size + extra > maxPoints) break;
    used.add(c.w); used.add(c.l); kept.unshift(c);
  }
  const order = [...used].sort((a, b) => a - b), remap = new Map(order.map((k, i) => [k, i]));
  return { ...json, points: order.map(k => points[k]), comparisons: kept.map(c => ({ ...c, w: remap.get(c.w), l: remap.get(c.l) })) };
}

/**
 * The export a participant can choose to send to the study. Requires consent. It links processing
 * choices, context and outcomes, which is what the onboarding comparison needs, and nothing else.
 */
export function studyExport(state, { exportedAt = new Date().toISOString(), appVersion = 'video-0.1' } = {}) {
  if (!state?.consent?.study) throw new Error('Study export needs consent first');
  const s = sanitizeVideoState(state);
  return {
    schema: 'still-video-study-v1', appVersion, exportedAt, participant: s.participant, dataset: s.dataset, consentAt: s.consent.at,
    states: Object.keys(FILTER_STATES),
    personal: { x: s.personal.x, vetoes: s.personal.vetoes, comparisons: s.rounds.length },
    rounds: s.rounds, sessions: s.sessions, checks: s.checks,
  };
}

/** The person's own calendar day for a session (older records without one fall back to the UTC date). */
export const dayOf = x => x.localDay || String(x.startedAt).slice(0, 10);

/** Summaries the page shows the person, and the study uses: return use and check results. */
export function summarise(state, now = Date.now()) {
  const s = state;
  const days = new Set(s.sessions.map(dayOf));
  const listened = s.sessions.reduce((sum, x) => sum + x.durationS, 0);
  const sortedDays = [...days].sort();
  const rated = s.sessions.filter(x => x.feedback);
  const share = (list, f) => (list.length ? list.filter(f).length / list.length : null);
  const byCondition = Object.fromEntries(CONDITIONS.map(c => {
    const r = s.checks.map(k => k.ratings.find(x => x.condition === c)).filter(Boolean);
    const mean = key => { const v = r.map(x => x[key]).filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    return [c, { n: r.length, comfort: mean('comfort'), clarity: mean('clarity'), worse: share(r, x => x.worse) }];
  }));
  const last = s.sessions.at(-1);
  return {
    sessions: s.sessions.length, days: days.size, listenedMinutes: Math.round(listened / 60),
    comfortable: share(rated, x => x.feedback.comfortable === 'yes'), clear: share(rated, x => x.feedback.clear === 'yes'),
    worse: share(rated, x => x.feedback.worse === true), checks: s.checks.length, byCondition,
    returnedLaterDay: sortedDays.length > 1,
    daysSinceLast: last ? Math.floor((now - Date.parse(last.startedAt)) / 864e5) : null,
  };
}
