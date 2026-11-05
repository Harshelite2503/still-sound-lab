/**
 * Song vector index: every analysed song becomes a fixed-length, explainable vector, so songs can
 * be searched by similarity (cosine), mapped in 2-D, and compared with a listener's taste.
 *
 * Deterministic and interpretable by design: each block of the vector is a measurement Song DNA
 * already validates (dist/song-dna.js). It answers "what sounds like this?", not "will this be a
 * hit?" — audio alone predicts popularity poorly (docs/song-dna-research.md).
 */
import { PROFILE_FEATURES } from './song-dna.js';
import { normaliseShape } from './style-sketch.js';

const DEGREES = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
/** Chord-role vocabulary: 12 degrees × major/minor (e.g. "bVII", "vi"). */
export const ROMAN_VOCAB = DEGREES.flatMap(d => [d, d.replace(/[IV]+/, m => m.toLowerCase())]);

/** Musical measures describe the composition and performance; they were stable across two copies of the same recordings. */
const MUSICAL = ['tempo', 'minorShare', 'changes', 'unique', 'onsets', 'repetition'];
/** Production measures describe the master or transfer (loudness, width, brightness) and change between copies. */
const PRODUCTION = ['tilt', 'centroid', 'presence', 'lufs', 'lra', 'crest', 'stereo'];

/** Default block weights (relative importance after each block is unit-normalised). */
export const DEFAULT_WEIGHTS = { musical: 1, production: .5, spectrum: .7, scale: 1, chords: 1, mode: .4, scaleShape: 1 };

const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y); const p = (s.length - 1) * q, lo = Math.floor(p); return s[lo] + (s[Math.ceil(p)] - s[lo]) * (p - lo); };
const unit = v => { const n = Math.hypot(...v); return n > 0 ? v.map(x => x / n) : v.map(() => 0); };
export const cosine = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

/** Blocks centred on the indexed set's mean before unit-normalising (else a shared offset dominates their cosine). */
const CENTRED = ['spectrum', 'scale', 'scaleShape', 'chords'];

/**
 * Normalisation learned from the indexed set: robust centring for scalar features (median, IQR/1.349)
 * and a mean vector for each profile-like block, so every block measures differences between songs.
 */
export function fitNormalisation(songs) {
  const out = {};
  for (const key of [...MUSICAL, ...PRODUCTION]) {
    const f = PROFILE_FEATURES.find(x => x.key === key);
    const v = songs.map(f.get).filter(Number.isFinite);
    out[key] = { centre: median(v), spread: Math.max((quantile(v, .75) - quantile(v, .25)) / 1.349, 1e-6) };
  }
  const raw = songs.map(s => songBlocks(s, out, null));
  out.blockMeans = Object.fromEntries(CENTRED.map(b => [b, raw[0][b].map((_, j) => raw.reduce((a, r) => a + r[b][j], 0) / raw.length)]));
  return out;
}

/**
 * Key-free description of the 12-note profile: magnitudes of its discrete Fourier transform
 * (coefficients 1–6). Rotating the profile, i.e. any key-estimate error, leaves them unchanged.
 */
export function scaleShape(profile) {
  const out = [];
  for (let k = 1; k <= 6; k++) {
    let re = 0, im = 0;
    profile.forEach((v, n) => { re += v * Math.cos(2 * Math.PI * k * n / 12); im -= v * Math.sin(2 * Math.PI * k * n / 12); });
    out.push(Math.hypot(re, im));
  }
  return out;
}

/** Blocks for one analysed song (centred on the index's block means when given). */
export function songBlocks(song, norm, means = norm.blockMeans) {
  const z = key => {
    const f = PROFILE_FEATURES.find(x => x.key === key), v = f.get(song), n = norm[key];
    return Number.isFinite(v) ? Math.max(-3, Math.min(3, (v - n.centre) / n.spread)) : 0;
  };
  const shape = normaliseShape(song.spectrum.bandsDb).map(b => Math.max(-40, b.db) / 10);
  const shares = new Map((song.chords.shares || []).map(c => [c.roman, c.share]));
  const blocks = {
    musical: MUSICAL.map(z),
    production: PRODUCTION.map(z),
    spectrum: shape,
    scale: song.degreeProfile.map(v => v * 12 - 1),
    scaleShape: scaleShape(song.degreeProfile).map(v => v * 12),
    chords: ROMAN_VOCAB.map(r => shares.get(r) || 0),
    mode: [song.key.mode === 'minor' ? 1 : -1],
  };
  if (means) for (const b of CENTRED) blocks[b] = blocks[b].map((v, j) => v - means[b][j]);
  return blocks;
}

/** Weighted, unit-length vector: each block is normalised, scaled by its weight, then the whole is normalised. */
export function blocksToVector(blocks, weights = DEFAULT_WEIGHTS) {
  const parts = [];
  for (const [name, w] of Object.entries(weights)) {
    if (!w || !blocks[name]) continue;
    const b = name === 'mode' ? blocks[name] : unit(blocks[name]);
    parts.push(...b.map(x => x * w));
  }
  return unit(parts);
}

export function buildIndex(songs, { weights = DEFAULT_WEIGHTS, name = '' } = {}) {
  const norm = fitNormalisation(songs);
  const items = songs.map(s => {
    const blocks = songBlocks(s, norm);
    return { name: s.name, key: s.key.name, tempo: s.tempo.bpm, blocks, vector: blocksToVector(blocks, weights) };
  });
  const index = { schema: 'still-song-index-v1', name, weights, norm, dims: items[0]?.vector.length || 0, items };
  index.map = fitMap(items.map(i => i.vector));
  return index;
}

/** Vector for a new song in an existing index's space (same normalisation and weights). */
export function vectorFor(index, song) { return blocksToVector(songBlocks(song, index.norm), index.weights); }

/** Nearest neighbours by cosine similarity. */
export function search(index, vector, { k = 5, exclude = null } = {}) {
  return index.items.filter(i => i.name !== exclude).map(i => ({ name: i.name, key: i.key, similarity: cosine(i.vector, vector) }))
    .sort((a, b) => b.similarity - a.similarity || a.name.localeCompare(b.name)).slice(0, k);
}

/** Centroid of the set (or weighted subset): a "taste vector". */
export function centroid(vectors, weights = null) {
  const out = new Array(vectors[0].length).fill(0);
  vectors.forEach((v, i) => { const w = weights ? weights[i] : 1; v.forEach((x, j) => { out[j] += w * x; }); });
  return unit(out);
}

/** 2-D map by PCA (power iteration, deterministic start), with the projection kept for new songs. */
export function fitMap(vectors) {
  const n = vectors.length, d = vectors[0].length;
  const mean = new Array(d).fill(0);
  vectors.forEach(v => v.forEach((x, j) => { mean[j] += x / n; }));
  const X = vectors.map(v => v.map((x, j) => x - mean[j]));
  const comps = [];
  for (let c = 0; c < 2; c++) {
    let w = Array.from({ length: d }, (_, j) => Math.sin(j + 1 + c));
    for (let it = 0; it < 200; it++) {
      const scores = X.map(r => r.reduce((s, x, j) => s + x * w[j], 0));
      let next = new Array(d).fill(0);
      X.forEach((r, i) => r.forEach((x, j) => { next[j] += x * scores[i]; }));
      for (const p of comps) { const dot = next.reduce((s, x, j) => s + x * p[j], 0); next = next.map((x, j) => x - dot * p[j]); }
      w = unit(next);
    }
    comps.push(w);
  }
  const project = v => comps.map(p => v.reduce((s, x, j) => s + (x - mean[j]) * p[j], 0));
  const coords = vectors.map(project);
  const total = X.reduce((s, r) => s + r.reduce((a, x) => a + x * x, 0), 0);
  const explained = comps.map(p => X.reduce((s, r) => s + r.reduce((a, x, j) => a + x * p[j], 0) ** 2, 0) / (total || 1));
  return { mean, components: comps, coords, explained };
}

export function projectToMap(index, vector) {
  const { mean, components } = index.map;
  return components.map(p => vector.reduce((s, x, j) => s + (x - mean[j]) * p[j], 0));
}

/** Compact form for the browser (vectors rounded; blocks kept for explanations). */
export function serialiseIndex(index) {
  const r = v => v.map(x => +x.toFixed(4));
  return {
    ...index,
    items: index.items.map(i => ({ ...i, vector: r(i.vector), blocks: Object.fromEntries(Object.entries(i.blocks).map(([k, v]) => [k, r(v)])) })),
    map: { ...index.map, mean: r(index.map.mean), components: index.map.components.map(r), coords: index.map.coords.map(r) },
  };
}
