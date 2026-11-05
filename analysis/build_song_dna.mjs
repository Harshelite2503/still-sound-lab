#!/usr/bin/env node
/**
 * Build a Song DNA profile for one artist from full-length local audio files.
 *
 *   node analysis/build_song_dna.mjs --dir ~/Desktop/songs/Kishore_Kumar --artist "Kishore Kumar" \
 *     --out dist/data/song-dna/kishore-kumar.json [--exclude "remix|DJ_"] [--ffmpeg /path/to/ffmpeg]
 *
 * Audio is decoded with FFmpeg to 22.05 kHz stereo float PCM in memory and analysed with the
 * same code the browser uses (dist/song-dna.js). Only derived features are written; no audio,
 * lyrics or melody is stored.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeSong, buildProfile, compareToProfile, songDistance } from '../dist/song-dna.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, all) => (v.startsWith('--') ? [...acc, [v.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]]] : acc), []));
const dir = args.dir, artist = args.artist || 'Unknown artist', out = args.out;
if (!dir || !out) { console.error('Usage: --dir <folder> --artist <name> --out <json>'); process.exit(1); }
const ffmpeg = args.ffmpeg || process.env.FFMPEG || findFfmpeg();
const RATE = 22050;

function findFfmpeg() {
  const venv = path.resolve('.venv/lib');
  if (fs.existsSync(venv)) for (const py of fs.readdirSync(venv)) {
    const bin = path.join(venv, py, 'site-packages/imageio_ffmpeg/binaries');
    if (fs.existsSync(bin)) { const f = fs.readdirSync(bin).find(x => x.startsWith('ffmpeg')); if (f) return path.join(bin, f); }
  }
  return 'ffmpeg';
}

function decode(file) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, ['-v', 'error', '-i', file, '-ac', '2', '-ar', String(RATE), '-f', 'f32le', '-']);
    const chunks = [];
    let err = '';
    p.stdout.on('data', c => chunks.push(c));
    p.stderr.on('data', c => { err += c; });
    p.on('close', code => {
      if (code !== 0) return reject(new Error(err || `ffmpeg exited ${code}`));
      const buf = Buffer.concat(chunks);
      const all = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
      const n = all.length / 2, L = new Float32Array(n), R = new Float32Array(n);
      for (let i = 0; i < n; i++) { L[i] = all[2 * i]; R[i] = all[2 * i + 1]; }
      resolve([L, R]);
    });
  });
}

/** "Artist_-_Ek_Ladki_Bheegi_Bheegi_Si_(site.tag).mp3" → "Ek Ladki Bheegi Bheegi Si" */
function titleFrom(file) {
  return path.basename(file, path.extname(file))
    .replace(/\([a-z0-9-]+\.[a-z]{2,}\)/gi, '').replace(/\b\d{3}\s*kbps\b/gi, '')
    .replace(/^(kishore[_ ]kumar|dj[_ -]+[a-z]+)[_ -]+-?[_ ]*/i, '').replace(/^-[_ ]*/, '')
    .replace(/^\d{2} (?=\S)/, '').replace(/\([^)]*\)/g, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/ Sad$/i, ' (sad version)');
}

const files = fs.readdirSync(dir).filter(f => /\.(mp3|m4a|wav|flac|ogg|opus|webm|aac)$/i.test(f)).sort();
const exclude = args.exclude ? new RegExp(args.exclude, 'i') : null;
const songs = [];
for (const file of files) {
  const t0 = Date.now();
  const channels = await decode(path.join(dir, file));
  const result = analyzeSong({ channels, sampleRate: RATE, name: titleFrom(file) });
  const flags = [];
  if (exclude?.test(file)) flags.push('excluded-by-pattern');
  if (result.duration < 150) flags.push('short-or-partial');
  // Identify the source by a hash of its file name, so the published data names no download site.
  result.fileId = createHash('sha1').update(file).digest('hex').slice(0, 12); result.flags = flags;
  songs.push(result);
  console.log(`${result.name.padEnd(34)} ${(result.duration / 60).toFixed(2)} min · ${result.key.name.padEnd(3)} (${result.key.profileOnly}) · ${result.tuning.cents.toFixed(0).padStart(3)}¢ · ${result.tempo.bpm.toFixed(0)} BPM · ${(result.chords.minorShare * 100).toFixed(0)}% minor · andalusian ${result.chords.andalusian.full.length}/${result.chords.andalusian.partial.length} · ${result.loudness.integratedLufs.toFixed(1)} LUFS · LRA ${result.loudness.loudnessRangeLu.toFixed(1)} · r ${result.stereo.correlation.toFixed(2)}${flags.length ? ' · ' + flags.join(',') : ''} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

const core = songs.filter(s => !s.flags.length);
const profile = buildProfile(core, { artist });
// Leave-one-out: how close is each core song to a profile built from the others?
const leaveOneOut = core.map(s => ({ name: s.name, overall: compareToProfile(s, buildProfile(core.filter(o => o !== s))).overall }));
const flagged = songs.filter(s => s.flags.length).map(s => ({ name: s.name, flags: s.flags, overall: compareToProfile(s, profile).overall }));
const nearest = core.map(s => ({ name: s.name, closest: core.filter(o => o !== s).map(o => ({ name: o.name, d: songDistance(s, o, profile) })).sort((x, y) => x.d - y.d).slice(0, 2) }));
// Copyright hygiene: keep only summary statistics per song. No per-song chord timeline,
// section order or melody is written (see docs/song-dna-research.md §7).
const strip = s => {
  const { segments, andalusian, ...chords } = s.chords;
  return { ...s, chords: { ...chords, andalusian: { full: andalusian.full.length, partial: andalusian.partial.length, fullInKey: andalusian.fullInKey, partialInKey: andalusian.partialInKey } } };
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({
  schema: 'still-song-dna-v1', artist, builtAt: new Date().toISOString(),
  method: 'Full-length analysis, 22.05 kHz, 4096-point STFT (hop 1024). Tuning from interpolated spectral peaks; key from Krumhansl–Kessler profiles plus chord-function evidence; 24 major/minor triads + no-chord, HMM-smoothed over ~0.37 s windows; tempo from onset-flux autocorrelation with a 110 BPM prior; loudness per ITU-R BS.1770 K-weighting (approximate, at 22.05 kHz).',
  note: 'Derived summary features only. No audio, lyrics, melodies, chord timelines or section order are stored. Chord statistics are automatic estimates (triads only), not transcriptions.',
  profile, leaveOneOut, flagged, nearest,
  songs: songs.map(strip),
}, (k, v) => (typeof v === 'number' ? +v.toFixed(4) : v)));
console.log(`\nProfile from ${core.length} songs (${songs.length - core.length} flagged) → ${out}`);
console.log('Keys:', JSON.stringify(profile.keys), 'Modes:', JSON.stringify(profile.modes));
console.log('Andalusian shape: full in', profile.andalusianSongs, 'songs, full or partial in', profile.andalusianPartialSongs, '· on the home chord (i → ♭VII → ♭VI…):', profile.andalusianPartialInKeySongs, 'songs, full walk', profile.andalusianInKeySongs);
console.log('Top chord roles:', profile.romanShares.slice(0, 8).map(r => `${r.roman} ${(r.share * 100).toFixed(0)}%`).join(', '));
console.log('Common progressions:', profile.progressionsSongsWith.slice(0, 8).map(p => `${p.progression} (${p.songsWith})`).join(' | '));
console.log('Leave-one-out closeness:', leaveOneOut.map(x => x.overall.toFixed(2)).join(' '), '· flagged:', flagged.map(f => `${f.name} ${f.overall.toFixed(2)}`).join(', '));
