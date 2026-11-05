"""Check that two folders hold the same songs: align chroma sequences with DTW.

Each matched pair's alignment similarity is compared with every mismatched pair (song i vs all
song j) as a baseline. A pair of the same song should score far above every mismatched pair.
Speed differences (tape/transfer) are tolerated by DTW; a different performance or arrangement
scores lower. Chroma follows harmony and timing, so a remix built on the original vocal also
passes: this confirms the same song and arrangement, not the same master.

    .venv/bin/python -I analysis/same_recording_check.py --a ~/Desktop/songs/Kishore_Kumar \
        --b ~/Desktop/songs/Kishore_Kumar_youtube --out data/song-dna/kishore-kumar-same-recording.json
"""
import argparse, json, pathlib, re, subprocess
import imageio_ffmpeg, librosa, numpy as np

SR = 11025


def decode(path):
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32)


def chroma(path):
    y = decode(path)
    c = librosa.feature.chroma_cqt(y=y, sr=SR, hop_length=4096, tuning=librosa.estimate_tuning(y=y, sr=SR))
    c = librosa.decompose.nn_filter(c, aggregate=np.median, metric='cosine')  # light smoothing
    return librosa.util.normalize(c, norm=2, axis=0)


def similarity(ca, cb):
    """Mean cosine similarity along the DTW path, allowing a transposition of the second file."""
    best = -1
    for shift in (0, -1, 1):
        cs = np.roll(cb, shift, axis=0)
        D, wp = librosa.sequence.dtw(X=ca, Y=cs, metric='cosine', subseq=False)
        sims = np.sum(ca[:, wp[:, 0]] * cs[:, wp[:, 1]], axis=0)
        best = max(best, float(np.mean(sims)))
    return best


def norm(t):
    t = re.sub(r'^\d{1,3}[ ._-]+', '', t.lower())
    words = re.sub(r'[^a-z ]', ' ', t).split()
    return ' '.join(words[:2]).replace('bhagi', 'bheegi').replace('chaand', 'chand')


def files(folder):
    out = {}
    for f in sorted(pathlib.Path(folder).expanduser().iterdir()):
        if f.suffix.lower() in ('.mp3', '.webm', '.m4a', '.opus'):
            name = re.sub(r'\(.*?\)|kishore[_ ]kumar[_ ]-?|dj[_ -]+lodhi[_ -]+-?', ' ', f.stem, flags=re.I).replace('_', ' ')
            out[norm(name.strip(' -'))] = f
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--a', required=True); ap.add_argument('--b', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    fa, fb = files(args.a), files(args.b)
    keys = [k for k in fa if k in fb]
    print('matched', len(keys), 'missing:', sorted(set(fa) ^ set(fb)))
    ca = {k: chroma(fa[k]) for k in keys}
    cb = {k: chroma(fb[k]) for k in keys}
    rows = []
    for i, k in enumerate(keys):
        same = similarity(ca[k], cb[k])
        others = [similarity(ca[k], cb[o]) for o in keys if o != k]
        rows.append({'song': k, 'same': round(same, 3), 'mismatched_max': round(max(others), 3), 'mismatched_mean': round(float(np.mean(others)), 3),
                     'margin': round(same - max(others), 3)})
        print(f"{k:22} same {same:.3f} · mismatched max {max(others):.3f} mean {np.mean(others):.3f} · margin {same - max(others):+.3f}", flush=True)
    pathlib.Path(args.out).write_text(json.dumps({'method': 'DTW-aligned CQT chroma (hop 0.37 s at 11.025 kHz), mean cosine along the path, best of ±1 semitone; baseline = every mismatched song per row. Confirms the same song and arrangement, not the same master (a remix on the original vocal also passes).', 'songs': rows}, indent=1))


if __name__ == '__main__':
    main()
