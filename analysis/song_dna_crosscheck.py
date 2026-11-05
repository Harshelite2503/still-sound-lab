"""Independent cross-check of the JavaScript Song DNA analyser with librosa.

Different code, different algorithms (constant-Q chroma, librosa tuning and beat tracking),
same files. Agreement means the measurement is robust; disagreement marks songs whose key,
tuning or tempo should be read with caution.

    .venv/bin/python analysis/song_dna_crosscheck.py --dir ~/Desktop/songs/Kishore_Kumar \
        --dna dist/data/song-dna/kishore-kumar.json --out data/song-dna/kishore-kumar-crosscheck.json
"""
import argparse
import hashlib
import json
import pathlib
import subprocess

import imageio_ffmpeg
import librosa
import numpy as np

KK_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KK_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
SR = 22050


def decode(path):
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32)


def key_from_chroma(pcp):
    scores = []
    for t in range(12):
        for mode, prof in (('major', KK_MAJOR), ('minor', KK_MINOR)):
            scores.append((np.corrcoef(pcp, np.roll(prof, t))[0, 1], t, mode))
    scores.sort(reverse=True)
    r, t, mode = scores[0]
    return NAMES[t] + ('m' if mode == 'minor' else ''), float(r), float(r - scores[1][0])


def relation(a, b):
    """How two key labels relate: same, relative, parallel, fifth, semitone or other."""
    def parse(k):
        m = k.endswith('m')
        return NAMES.index(k[:-1] if m else k), m
    if a == b:
        return 'same'
    (ta, ma), (tb, mb) = parse(a), parse(b)
    d = (tb - ta) % 12
    if ma != mb and ((ma and d == 3) or (not ma and d == 9)):
        return 'relative'
    if ma != mb and d == 0:
        return 'parallel'
    if ma == mb and d in (5, 7):
        return 'fifth'
    if ma == mb and d in (1, 11):
        return 'semitone'
    return 'other'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', required=True)
    ap.add_argument('--dna', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    dna = json.loads(pathlib.Path(args.dna).read_text())
    folder = pathlib.Path(args.dir).expanduser()
    # The published data stores a hash of each file name, not the name itself.
    by_id = {hashlib.sha1(f.name.encode()).hexdigest()[:12]: f for f in folder.iterdir() if f.is_file()}
    rows = []
    for song in dna['songs']:
        y = decode(by_id[song['fileId']])
        harmonic = librosa.effects.harmonic(y, margin=3)
        tuning = float(librosa.estimate_tuning(y=harmonic, sr=SR))  # fraction of a semitone
        chroma = librosa.feature.chroma_cqt(y=harmonic, sr=SR, tuning=tuning, hop_length=2048)
        key, r, margin = key_from_chroma(chroma.sum(axis=1))
        tempo, _ = librosa.beat.beat_track(y=y, sr=SR, hop_length=512)
        tempo = float(np.atleast_1d(tempo)[0])
        js = song
        bpm_js = js['tempo']['bpm']
        ratio = max(tempo, bpm_js) / max(1e-6, min(tempo, bpm_js))
        rows.append({
            'name': js['name'], 'flags': js.get('flags', []),
            'tuning_cents': {'js': round(js['tuning']['cents'], 1), 'librosa': round(tuning * 100, 1)},
            'key': {'js': js['key']['name'], 'js_profile_only': js['key']['profileOnly'], 'librosa': key, 'librosa_r': round(r, 3), 'librosa_margin': round(margin, 3),
                    'relation': relation(js['key']['name'], key), 'relation_profile_only': relation(js['key']['profileOnly'], key)},
            'tempo_bpm': {'js': round(bpm_js, 1), 'librosa': round(tempo, 1),
                          'agreement': 'same' if ratio < 1.04 else 'octave' if abs(ratio - 2) < .08 else 'triple-ratio' if abs(ratio - 1.5) < .06 else 'different'},
        })
        print(f"{js['name'][:30]:30} tuning {rows[-1]['tuning_cents']} · key js {js['key']['name']}/{js['key']['profileOnly']} librosa {key} ({rows[-1]['key']['relation']}) · tempo {rows[-1]['tempo_bpm']}")
    summary = {
        'songs': len(rows),
        'tuning_mean_abs_diff_cents': round(float(np.mean([min(abs(r['tuning_cents']['js'] - r['tuning_cents']['librosa']), 100 - abs(r['tuning_cents']['js'] - r['tuning_cents']['librosa'])) for r in rows])), 1),
        'key_relations_final': {k: sum(r['key']['relation'] == k for r in rows) for k in ('same', 'relative', 'parallel', 'fifth', 'semitone', 'other')},
        'key_relations_profile_only': {k: sum(r['key']['relation_profile_only'] == k for r in rows) for k in ('same', 'relative', 'parallel', 'fifth', 'semitone', 'other')},
        'tempo_agreement': {k: sum(r['tempo_bpm']['agreement'] == k for r in rows) for k in ('same', 'octave', 'triple-ratio', 'different')},
    }
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({'librosa_version': librosa.__version__, 'profileBuiltAt': dna['builtAt'], 'summary': summary, 'songs': rows}, indent=1))
    print(json.dumps(summary, indent=1))


if __name__ == '__main__':
    main()
