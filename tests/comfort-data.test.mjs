import assert from 'node:assert/strict';
import { normalizeSessions, mergeSessions, aggregateComfort } from '../dist/comfort-data.js';
const row = (at, comfort, frequency = 220, beatHz = 6) => ({ at, kind: 'binaural', comfort, listenedSeconds: 30, volumeStart: 15, volumeEnd: 15, settings: { frequency, beatHz }, context: { mood: 'calm', environment: 'quiet' } });
const a = row('2026-01-01T00:00:00Z', 1), b = row('2026-01-02T00:00:00Z', -1);
const parsed = normalizeSessions([a, b, { ...a, volumeStart: 0, volumeEnd: 0, hadNonzeroAppGain: false }, { ...a, comfort: 9 }, { ...a, settings: { frequency: 900, beatHz: 6 } }]);
assert.equal(parsed.sessions.length, 2); assert.equal(parsed.excluded, 3);
const merged = mergeSessions(parsed.sessions, normalizeSessions([a]).sessions);
assert.equal(merged.length, 2);
const result = aggregateComfort(merged);
assert.equal(result.cells[6][2].count, 2); assert.equal(result.cells[6][2].mean, 0);
assert.deepEqual(result.cells[6][2].ratings, [1, 0, 1]);
assert.equal(result.cells[0][0].mean, null); // Unobserved is not neutral.
assert.equal(aggregateComfort(merged, { mood: 'low' }).total, 0);
const edge = normalizeSessions([row('2026-01-03T00:00:00Z', 1, 600, 0), row('2026-01-04T00:00:00Z', 0, 100, .5)]).sessions;
const e = aggregateComfort(edge); assert.equal(e.cells[0][9].count, 1); assert.equal(e.cells[1][0].count, 1);
assert.throws(() => normalizeSessions({ schema: 'unrelated', sessions: [a] }));
console.log('PASS: comfort validation, mute exclusions, deduplication, context filters, raw counts, missing-vs-neutral, and edge bins');

assert.equal(normalizeSessions([{...a,volumeStart:0,volumeEnd:0,hadNonzeroAppGain:true}]).sessions.length,1); // Audible between muted endpoints.
assert.equal(normalizeSessions([{...a,volumeStart:0,volumeEnd:0}]).sessions.length,1); // Legacy audibility unknown, never inferred.
