// Journal logic: episode grouping, honest metrics, privacy of the pilot summary.
import assert from 'node:assert/strict';
import {
  freshJournal, sanitizeJournal, episodes, metrics, pilotSummary, pendingFollowUp, mergeJournals, firstUseMs, JOURNAL_KEY,
} from '../dist/journal-store.js';

const H = 3600e3, D = 24 * H;
const t0 = Date.parse('2026-09-01T08:00:00Z');
const iso = ms => new Date(ms).toISOString();
const s = (ms, extra = {}) => ({ id: `s${ms}`, at: iso(ms), state: 'attack', choice: 'comfort', durationS: 1200, ...extra });

// Rejects anything that is not a journal; drops malformed records.
assert.throws(() => sanitizeJournal({ schema: 'other' }));
const dirty = sanitizeJournal({ schema: JOURNAL_KEY, sessions: [s(t0), { at: 'nope', state: 'attack', choice: 'comfort' }, { ...s(t0 + H), state: 'normal' }, s(t0)], missed: [{ at: 'x' }, { at: iso(t0 + 5 * D) }] });
assert.equal(dirty.sessions.length, 1, 'invalid, non-headache and duplicate sessions are dropped');
assert.equal(dirty.missed.length, 1);
assert.equal(dirty.sessions[0].followUp, null);

// Sessions within 12 h of the previous one's end are one episode; a later one starts a new episode.
const j = freshJournal();
j.sessions.push(
  s(t0, { choice: 'silence', durationS: 600 }),
  s(t0 + 2 * H, { followUp: 'better' }),
  s(t0 + 2 * H + 20 * 60e3 + 11 * H),            // 11 h after the previous ended: same episode
  s(t0 + 3 * D, { state: 'warning', worse: true, followUp: 'worse', durationS: 30 }),
  s(t0 + 10 * D, { choice: 'softer', followUp: 'same' }),
);
j.missed.push({ at: iso(t0 + 20 * D) }, { at: iso(t0 + 3 * D + H) });   // second one is the same day as a used episode
const eps = episodes(j);
assert.equal(eps.length, 3);
assert.equal(eps[0].sessions.length, 3);
assert.equal(eps[0].darkS, 600);
assert.equal(eps[0].listeningS, 2400);
assert.deepEqual(eps[0].choices, { silence: 1, comfort: 2, softer: 0 });
assert.equal(eps[1].worse, true);

const m = metrics(j, t0 + 30 * D);
assert.equal(m.usedEpisodes, 3);
assert.equal(m.missedEpisodes, 1, 'a "missed" note on a day Still was used is not double-counted');
assert.equal(m.repeatUse, true);
assert.equal(m.shareUsed, .75);
assert.equal(m.worseSessions, 1);
assert.deepEqual(m.followUps, { better: 1, same: 1, worse: 1, skipped: 0 });
assert.equal(metrics(j, t0 + 75 * D).usedEpisodes, 0, 'old episodes fall out of the 60-day window');
assert.equal(metrics(freshJournal()).shareUsed, null);

// Pilot summary: day offsets only, no dates, ids, levels or free text.
assert.throws(() => pilotSummary(j, '  '));
const p = pilotSummary(j, 'P-017<script>', t0 + 30 * D);
assert.equal(p.participant, 'P-017script');
assert.equal(p.daysSinceFirstUse, 30);
assert.deepEqual(p.episodes.map(e => e.day), [0, 3, 10]);
assert.deepEqual(p.missedDays, [20]);
const text = JSON.stringify(p);
assert.ok(!/20\d\d-\d\d-\d\d/.test(text), 'no calendar dates in the pilot summary');
assert.ok(!/levelDb|"id"|"at"/.test(text), 'no ids, timestamps or sound levels in the pilot summary');
assert.equal(firstUseMs(j), t0);

// Follow-up prompt: only for the latest unanswered session within 24 h.
const k = freshJournal();
k.sessions.push(s(t0, { durationS: 600 }));
assert.equal(pendingFollowUp(k, t0 + H)?.id, `s${t0}`);
assert.equal(pendingFollowUp(k, t0 + 2 * D), null);
k.sessions[0].followUp = 'skipped';
assert.equal(pendingFollowUp(k, t0 + H), null);

// Merging a backup keeps each session once.
const merged = mergeJournals(j, sanitizeJournal({ schema: JOURNAL_KEY, sessions: j.sessions, missed: j.missed }));
assert.equal(merged.sessions.length, j.sessions.length);
assert.equal(merged.missed.length, 2);

console.log('journal ok');
