#!/usr/bin/env node
/** Compare audio files with a Song DNA profile: node analysis/compare_songs.mjs <profile.json> <file>... */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeSong, compareToProfile, songDistance } from '../dist/song-dna.js';

const [profilePath, ...files] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
const core = data.songs.filter(s => !s.flags.length);
const venv = path.resolve('.venv/lib');
let ffmpeg = 'ffmpeg';
if (fs.existsSync(venv)) for (const py of fs.readdirSync(venv)) { const bin = path.join(venv, py, 'site-packages/imageio_ffmpeg/binaries'); if (fs.existsSync(bin)) ffmpeg = path.join(bin, fs.readdirSync(bin).find(x => x.startsWith('ffmpeg'))); }
const decode = file => new Promise((resolve, reject) => {
  const p = spawn(ffmpeg, ['-v', 'error', '-i', file, '-ac', '2', '-ar', '22050', '-f', 'f32le', '-']);
  const chunks = []; p.stdout.on('data', c => chunks.push(c));
  p.on('close', code => { if (code) return reject(new Error('decode failed')); const b = Buffer.concat(chunks); const a = new Float32Array(b.buffer, b.byteOffset, b.length / 4); const n = a.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = a[2 * i]; R[i] = a[2 * i + 1]; } resolve([L, R]); });
});
const rows = [];
for (const file of files) {
  const song = analyzeSong({ channels: await decode(file), sampleRate: 22050, name: path.basename(file) });
  const c = compareToProfile(song, data.profile);
  const closest = core.map(s => ({ n: s.name, d: songDistance(song, s, data.profile) })).sort((a, b) => a.d - b.d)[0];
  const label = path.basename(file).replace(/\([^)]*\)/g, '').replace(/[_ ]+/g, ' ').trim();
  rows.push({ file: label, tempo: song.tempo.bpm, centroidHz: song.spectrum.centroidHz, minorShare: song.chords.minorShare, changesPerMinute: song.chords.changesPerMinute, bandsDb: song.spectrum.bandsDb, overall: c.overall, features: c.featureCloseness, scale: c.scaleSimilarity, harmony: c.harmonySimilarity, key: song.key.name, bpm: song.tempo.bpm, closest: closest.n });
  console.log(`${label.slice(0, 44).padEnd(44)} ${(c.overall * 100).toFixed(0).padStart(3)}%  (features ${(c.featureCloseness * 100).toFixed(0)}%, scale ${(c.scaleSimilarity * 100).toFixed(0)}%, chords ${(c.harmonySimilarity * 100).toFixed(0)}%) · ${song.key.name} · ${song.tempo.bpm.toFixed(0)} BPM · nearest: ${closest.n}`);
}
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(rows, null, 1));
