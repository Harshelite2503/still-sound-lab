// Headache-episode journal: pure data logic shared by the quiet room, the journal page and tests.
// No DOM access here, so it runs in Node too. Everything is stored on this device only.

export const JOURNAL_KEY = 'still-journal-v1';
/** Sessions closer together than this belong to the same episode. A display and counting rule, not a clinical definition. */
export const EPISODE_GAP_HOURS = 12;
/** The pilot's main question: did someone come back to Still during separate headaches within this window? */
export const WINDOW_DAYS = 60;
export const STATES = ['attack', 'warning', 'recovering'];
export const CHOICES = ['silence', 'comfort', 'softer'];
export const FOLLOW_UPS = ['better', 'same', 'worse', 'skipped'];
const MAX_SESSIONS = 1000, MAX_MISSED = 500;
const HOUR = 3600e3, DAY = 24 * HOUR;

const time = iso => Date.parse(iso);
const validIso = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const num = (v, lo, hi, fallback = 0) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

export function freshJournal() {
  return { schema: JOURNAL_KEY, sessions: [], missed: [] };
}

/** Keep only well-formed records. Throws if the object is not a Still journal at all. */
export function sanitizeJournal(raw) {
  if (!raw || typeof raw !== 'object' || raw.schema !== JOURNAL_KEY) throw new Error('Not a Still journal');
  const j = freshJournal();
  j.sessions = (Array.isArray(raw.sessions) ? raw.sessions : [])
    .filter(s => s && validIso(s.at) && STATES.includes(s.state) && CHOICES.includes(s.choice))
    .map(s => ({
      id: String(s.id || s.at).slice(0, 40),
      at: new Date(time(s.at)).toISOString(),
      state: s.state,
      choice: s.choice,
      durationS: Math.round(num(s.durationS, 0, 24 * 3600)),
      levelDb: Number.isFinite(s.levelDb) ? Math.round(num(s.levelDb, -80, 10) * 10) / 10 : null,
      worse: s.worse === true,
      followUp: FOLLOW_UPS.includes(s.followUp) ? s.followUp : null,
    }))
    .sort((a, b) => time(a.at) - time(b.at))
    .filter((s, i, all) => all.findIndex(o => o.id === s.id) === i)
    .slice(-MAX_SESSIONS);
  j.missed = (Array.isArray(raw.missed) ? raw.missed : [])
    .filter(m => m && validIso(m.at))
    .map(m => ({ at: new Date(time(m.at)).toISOString() }))
    .sort((a, b) => time(a.at) - time(b.at))
    .slice(-MAX_MISSED);
  return j;
}

export function loadJournal(storage) {
  try { return sanitizeJournal(JSON.parse(storage.getItem(JOURNAL_KEY) || 'null')); } catch { return freshJournal(); }
}

export function saveJournal(storage, journal) {
  try { storage.setItem(JOURNAL_KEY, JSON.stringify(journal)); return true; } catch { return false; }
}

/** Merge two journals (for importing a backup), keeping each session once. */
export function mergeJournals(a, b) {
  return sanitizeJournal({ schema: JOURNAL_KEY, sessions: [...a.sessions, ...b.sessions], missed: dedupeMissed([...a.missed, ...b.missed]) });
}
function dedupeMissed(list) {
  const seen = new Set();
  return list.filter(m => { const k = String(m.at).slice(0, 10); if (seen.has(k)) return false; seen.add(k); return true; });
}

const sessionEnd = s => time(s.at) + s.durationS * 1000;

/**
 * Group sessions into episodes: a new episode starts when a session begins more than
 * EPISODE_GAP_HOURS after the previous one ended. Returns oldest first.
 */
export function episodes(journal) {
  const out = [];
  for (const s of [...journal.sessions].sort((a, b) => time(a.at) - time(b.at))) {
    const last = out[out.length - 1];
    if (last && time(s.at) - last.endMs <= EPISODE_GAP_HOURS * HOUR) {
      last.sessions.push(s); last.endMs = Math.max(last.endMs, sessionEnd(s));
    } else out.push({ startMs: time(s.at), endMs: sessionEnd(s), sessions: [s] });
  }
  return out.map(e => ({
    start: new Date(e.startMs).toISOString(),
    end: new Date(e.endMs).toISOString(),
    sessions: e.sessions,
    listeningS: e.sessions.reduce((sum, s) => sum + (s.choice === 'silence' ? 0 : s.durationS), 0),
    darkS: e.sessions.reduce((sum, s) => sum + (s.choice === 'silence' ? s.durationS : 0), 0),
    choices: countBy(e.sessions, 'choice', CHOICES),
    followUps: countBy(e.sessions.filter(s => s.followUp), 'followUp', FOLLOW_UPS),
    worse: e.sessions.some(s => s.worse || s.followUp === 'worse'),
  }));
}

function countBy(list, key, keys) {
  const counts = Object.fromEntries(keys.map(k => [k, 0]));
  for (const item of list) if (item[key] in counts) counts[item[key]]++;
  return counts;
}

/** Missed headaches that do not overlap a used episode (a note on the same day as a used episode is ignored). */
function trueMissed(journal) {
  const usedDays = new Set(episodes(journal).flatMap(e => e.sessions.map(s => s.at.slice(0, 10))));
  return dedupeMissed(journal.missed).filter(m => !usedDays.has(m.at.slice(0, 10)));
}

/** First day this person used the journal at all, as a timestamp (or null). */
export function firstUseMs(journal) {
  const all = [...journal.sessions.map(s => time(s.at)), ...journal.missed.map(m => time(m.at))];
  return all.length ? Math.min(...all) : null;
}

/** Summary numbers for the journal page, over the last `windowDays` before `nowMs`. */
export function metrics(journal, nowMs = Date.now(), windowDays = WINDOW_DAYS) {
  const since = nowMs - windowDays * DAY;
  const eps = episodes(journal).filter(e => time(e.start) >= since && time(e.start) <= nowMs);
  const missed = trueMissed(journal).filter(m => time(m.at) >= since && time(m.at) <= nowMs);
  const sessions = eps.flatMap(e => e.sessions);
  const followed = sessions.filter(s => s.followUp && s.followUp !== 'skipped');
  return {
    windowDays,
    usedEpisodes: eps.length,
    missedEpisodes: missed.length,
    shareUsed: eps.length + missed.length ? eps.length / (eps.length + missed.length) : null,
    repeatUse: eps.length >= 2,
    sessions: sessions.length,
    choices: countBy(sessions, 'choice', CHOICES),
    followUps: countBy(followed, 'followUp', FOLLOW_UPS),
    worseSessions: sessions.filter(s => s.worse || s.followUp === 'worse').length,
    medianListeningMin: median(eps.map(e => e.listeningS / 60)),
  };
}

function median(values) {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b), m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** The most recent session that ended in the last `hours` and has no follow-up yet, if any. */
export function pendingFollowUp(journal, nowMs = Date.now(), hours = 24) {
  for (let i = journal.sessions.length - 1; i >= 0; i--) {
    const s = journal.sessions[i];
    if (nowMs - sessionEnd(s) > hours * HOUR) return null;
    if (!s.followUp && s.durationS > 0) return s;
    if (s.followUp) return null;
  }
  return null;
}

/**
 * A privacy-minimal export for a pilot study. No calendar dates, notes, device details or sound
 * settings: only whole-day offsets from first use, plus the categories the person tapped.
 */
export function pilotSummary(journal, participant, nowMs = Date.now()) {
  const code = String(participant || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
  if (!code) throw new Error('A participant code is needed');
  const first = firstUseMs(journal);
  const day = ms => (first === null ? null : Math.floor((ms - first) / DAY));
  return {
    schema: 'still-pilot-summary-v1',
    participant: code,
    daysSinceFirstUse: first === null ? null : day(nowMs),
    episodes: episodes(journal).map(e => ({
      day: day(time(e.start)),
      sessions: e.sessions.length,
      listeningMin: Math.round(e.listeningS / 6) / 10,
      darkScreenMin: Math.round(e.darkS / 6) / 10,
      states: [...new Set(e.sessions.map(s => s.state))],
      choices: e.choices,
      followUps: e.followUps,
      worse: e.worse,
    })),
    missedDays: trueMissed(journal).map(m => day(time(m.at))),
  };
}
