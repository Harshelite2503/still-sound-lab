#!/usr/bin/env node
/**
 * Test–retest: the same songs analysed from two different sources (e.g. MP3 downloads vs official
 * YouTube audio). Agreement shows which measurements describe the music and which describe the file.
 *
 *   node analysis/compare_sets.mjs <first.json> <second.json> [--out result.json]
 */
import fs from 'node:fs';

const [aPath, bPath] = process.argv.slice(2);
const outIdx = process.argv.indexOf('--out');
const A = JSON.parse(fs.readFileSync(aPath, 'utf8')), B = JSON.parse(fs.readFileSync(bPath, 'utf8'));
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const keyOf = s => { const m = s.endsWith('m'); return [NAMES.indexOf(m ? s.slice(0, -1) : s), m]; };
function relation(a, b) {
  if (a === b) return 'same';
  const [ta, ma] = keyOf(a), [tb, mb] = keyOf(b), d = (tb - ta + 12) % 12;
  if (ma !== mb && ((ma && d === 3) || (!ma && d === 9))) return 'relative';
  if (ma !== mb && d === 0) return 'parallel';
  if (ma === mb && (d === 5 || d === 7)) return 'fifth';
  if (d === 1 || d === 11) return 'semitone';
  return 'other';
}
const norm = t => t.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).join(' ')
  .replace('bhagi', 'bheegi').replace('chaand', 'chand');
const wrap = c => ((c + 50) % 100 + 100) % 100 - 50;
const rows = [];
for (const a of A.songs) {
  const b = B.songs.find(x => norm(x.name) === norm(a.name));
  if (!b) { console.log(`no match for ${a.name}`); continue; }
  const ratio = Math.max(a.tempo.bpm, b.tempo.bpm) / Math.min(a.tempo.bpm, b.tempo.bpm);
  rows.push({
    song: b.name, keyA: a.key.name, keyB: b.key.name, key: relation(a.key.name, b.key.name),
    tuningDiffCents: +wrap(b.tuning.cents - a.tuning.cents).toFixed(1), tuningA: +a.tuning.cents.toFixed(1), tuningB: +b.tuning.cents.toFixed(1),
    tempoA: +a.tempo.bpm.toFixed(1), tempoB: +b.tempo.bpm.toFixed(1), tempo: ratio < 1.04 ? 'same' : Math.abs(ratio - 2) < .08 ? 'octave' : 'different',
    minorShareDiff: +(b.chords.minorShare - a.chords.minorShare).toFixed(3),
    lufsDiff: +(b.loudness.integratedLufs - a.loudness.integratedLufs).toFixed(1),
    centroidRatio: +(b.spectrum.centroidHz / a.spectrum.centroidHz).toFixed(2),
    stereoA: +(a.stereo.correlation ?? 1).toFixed(2), stereoB: +(b.stereo.correlation ?? 1).toFixed(2),
    durationA: +a.duration.toFixed(0), durationB: +b.duration.toFixed(0),
    flagsA: a.flags, flagsB: b.flags,
  });
}
for (const r of rows) console.log(`${r.song.slice(0, 28).padEnd(28)} key ${r.keyA.padEnd(3)}→${r.keyB.padEnd(3)} ${r.key.padEnd(8)} tuning ${String(r.tuningA).padStart(6)}→${String(r.tuningB).padStart(6)}¢ (Δ${r.tuningDiffCents}) tempo ${r.tempoA}→${r.tempoB} ${r.tempo} · LUFS Δ${r.lufsDiff} · stereo ${r.stereoA}→${r.stereoB} · ${r.durationA}s→${r.durationB}s`);
const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
function summarize(set) {
  const count = (k, v) => set.filter(r => r[k] === v).length;
  return {
    n: set.length,
    key: Object.fromEntries(['same', 'relative', 'fifth', 'parallel', 'semitone', 'other'].map(k => [k, count('key', k)])),
    tempo: Object.fromEntries(['same', 'octave', 'different'].map(k => [k, count('tempo', k)])),
    tuningWithin5Cents: set.filter(r => Math.abs(r.tuningDiffCents) <= 5).length,
    medianAbsTuningDiff: median(set.map(r => Math.abs(r.tuningDiffCents))),
    maxAbsLufsDiff: set.length ? Math.max(...set.map(r => Math.abs(r.lufsDiff))) : null,
  };
}
// Pairs flagged in the first set (a remix, an excerpt) are not the same recording; report them apart.
const clean = rows.filter(r => !r.flagsA.length && !r.flagsB.length);
const summary = { allPairs: summarize(rows), sameRecording: summarize(clean) };
console.log(JSON.stringify(summary, null, 1));
if (outIdx > 0) fs.writeFileSync(process.argv[outIdx + 1], JSON.stringify({ first: aPath, second: bPath, summary, songs: rows }, null, 1));
