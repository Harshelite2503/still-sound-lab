#!/usr/bin/env node
/**
 * Build the song vector index and test it honestly: can it find the same song from a different copy?
 *
 *   node analysis/eval_song_index.mjs --index-set dist/data/song-dna/kishore-kumar.json \
 *     --queries data/song-dna/kishore-kumar-first-set.json \
 *     --out-index dist/data/song-dna/kishore-kumar-index.json --out-eval data/song-dna/kishore-kumar-index-eval.json
 *
 * The index is built from one set of recordings; each song in a second, independently obtained set
 * is used as a query. A useful index ranks the same song's other copy first. Blocks are also tested
 * alone and removed one at a time (ablation), against a random baseline.
 */
import fs from 'node:fs';
import { buildIndex, vectorFor, search, serialiseIndex, DEFAULT_WEIGHTS } from '../dist/song-index.js';

const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const base = JSON.parse(fs.readFileSync(arg('index-set'), 'utf8'));
const queries = JSON.parse(fs.readFileSync(arg('queries'), 'utf8'));
const norm = t => t.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).join(' ').replace('bhagi', 'bheegi').replace('chaand', 'chand');
const songs = base.songs.filter(s => !s.flags?.length);
const pairs = queries.songs.map(q => ({ q, twin: songs.find(s => norm(s.name) === norm(q.name)) })).filter(p => p.twin);
const same = pairs.filter(p => !p.q.flags?.length), other = pairs.filter(p => p.q.flags?.length);

/** Fair rank: 1 + songs scored strictly higher + half the other songs tied with the twin (ties never favour it). */
const fairRank = (scores, twinName) => {
  const t = scores.find(s => s.name === twinName).score;
  return 1 + scores.filter(s => s.score > t + 1e-12).length + .5 * scores.filter(s => s.name !== twinName && Math.abs(s.score - t) <= 1e-12).length;
};
function summarise(ranks) {
  return {
    recallAt1: ranks.filter(r => r === 1).length / ranks.length,
    recallAt3: ranks.filter(r => r <= 3).length / ranks.length,
    meanReciprocalRank: ranks.reduce((s, r) => s + 1 / r, 0) / ranks.length,
    ranks,
  };
}
/** Simple lookups the vector index must beat to be worth its dimensions. */
function lookup(scoreFn, set = same) {
  return summarise(set.map(({ q, twin }) => fairRank(songs.map(s => ({ name: s.name, score: scoreFn(q, s) })), twin.name)));
}
function evaluate(weights, set = same) {
  const index = buildIndex(songs, { weights });
  const ranks = set.map(({ q, twin }) => { const v = vectorFor(index, q); return fairRank(index.items.map(i => ({ name: i.name, score: i.vector.reduce((a, x, j) => a + x * v[j], 0) })), twin.name); });
  return summarise(ranks);
}
const fmt = r => `recall@1 ${(r.recallAt1 * 100).toFixed(0).padStart(3)}%  recall@3 ${(r.recallAt3 * 100).toFixed(0).padStart(3)}%  MRR ${r.meanReciprocalRank.toFixed(2)}`;
const blocks = Object.keys(DEFAULT_WEIGHTS);
const results = { default: evaluate(DEFAULT_WEIGHTS) };
for (const b of blocks) results[`only:${b}`] = evaluate(Object.fromEntries(blocks.map(k => [k, k === b ? 1 : 0])));
for (const b of blocks) results[`without:${b}`] = evaluate({ ...DEFAULT_WEIGHTS, [b]: 0 });
results.equalWeights = evaluate(Object.fromEntries(blocks.map(k => [k, 1])));
results.musicOnly = evaluate({ ...DEFAULT_WEIGHTS, production: 0, spectrum: 0 });
const baselines = {
  'lookup:key+tempo': lookup((q, s) => (q.key.name === s.key.name ? 1000 : 0) - Math.abs(q.tempo.bpm - s.tempo.bpm)),
  'lookup:tempo': lookup((q, s) => -Math.abs(q.tempo.bpm - s.tempo.bpm)),
  'lookup:key': lookup((q, s) => (q.key.name === s.key.name ? 1 : 0)),
};
const n = songs.length;
const random = { recallAt1: 1 / n, recallAt3: 3 / n, meanReciprocalRank: Array.from({ length: n }, (_, i) => 1 / (i + 1)).reduce((a, b) => a + b, 0) / n };

console.log(`Index of ${n} songs; ${same.length} same-recording queries from an independent copy.`);
console.log(`random baseline     ${fmt({ ...random })}`);
for (const [k, r] of Object.entries(baselines)) console.log(`${k.padEnd(20)}${fmt(r)}`);
for (const [k, r] of Object.entries(results)) console.log(`${k.padEnd(20)}${fmt(r)}`);

const index = buildIndex(songs, { weights: DEFAULT_WEIGHTS, name: base.artist });
const flaggedQueries = other.map(({ q, twin }) => {
  const hits = search(index, vectorFor(index, q), { k: 3 });
  return { query: q.name, flags: q.flags, expected: twin.name, rank: search(index, vectorFor(index, q), { k: n }).findIndex(r => r.name === twin.name) + 1, top3: hits.map(h => `${h.name} ${h.similarity.toFixed(2)}`) };
});
console.log('Remix / excerpt queries:', flaggedQueries.map(f => `${f.query} → rank ${f.rank} of ${n}`).join('; '));
const neighbours = index.items.map(i => ({ song: i.name, nearest: search(index, i.vector, { k: 3, exclude: i.name }).map(h => ({ name: h.name, similarity: +h.similarity.toFixed(3) })) }));
const misses = same.map((p, i) => ({ query: p.q.name, rank: results.default.ranks[i] })).filter(m => m.rank > 1);
console.log('Default-index misses:', misses.map(m => `${m.query} (rank ${m.rank})`).join(', ') || 'none');
console.log(`Map: first two components explain ${(index.map.explained[0] * 100).toFixed(0)}% and ${(index.map.explained[1] * 100).toFixed(0)}% of the variance.`);

const pick = r => ({ recallAt1: r.recallAt1, recallAt3: r.recallAt3, meanReciprocalRank: r.meanReciprocalRank });
const evaluation = { songs: n, queries: same.length, randomBaseline: random, results: { default: pick(results.default), 'only:production': pick(results['only:production']), 'lookup:key+tempo': pick(baselines['lookup:key+tempo']) } };
fs.writeFileSync(arg('out-index'), JSON.stringify({ ...serialiseIndex(index), builtFrom: base.builtAt, evaluation }));
fs.writeFileSync(arg('out-eval'), JSON.stringify({
  method: 'Index built from the official-upload set; each song from the independently obtained first set queried by cosine similarity; rank of its twin recorded. Ablations: each block alone and removed in turn.',
  songs: n, queries: same.length, randomBaseline: random,
  baselines,
  scope: 'Identification test: every query is the same recording from a different source. It does not test whether neighbours of different songs sound alike to listeners.',
  results: Object.fromEntries(Object.entries(results).map(([k, r]) => [k, { ...r, ranks: r.ranks }])),
  misses, flaggedQueries, neighbours, mapExplained: index.map.explained, builtFrom: base.builtAt,
}, null, 1));
