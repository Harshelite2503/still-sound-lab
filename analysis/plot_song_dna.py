"""Spectrograms for every song, and the "sound zone" a set of songs shares.

    .venv/bin/python -I analysis/plot_song_dna.py --dir ~/Desktop/songs/Kishore_Kumar_youtube \
        --dna dist/data/song-dna/kishore-kumar.json --contrast data/song-dna/kishore-kumar-comparisons.json \
        --private-out ~/Desktop/songs/Kishore_Kumar_youtube/plots --figures figures/song-dna \
        --zone-out dist/data/song-dna/kishore-kumar-zone.json

Two kinds of output, kept apart on purpose:

* Private, per song (stay next to the audio, never committed): a full-length spectrogram, a
  chromagram and the song's long-term spectrum against the set. Detailed time-frequency pictures
  of a whole song come close to a transcription, so they stay on the owner's machine.
* Shared, aggregate only (committed): where the set as a whole puts its energy (spectral zone),
  which pitch range its tonal energy sits in (register zone), and where the songs fall on
  tempo, brightness and harmony. Nothing in these files can be traced back to one song's melody.

The zone describes the songs, not the listener. Whether it is what the listener likes is a
hypothesis the listener can check in the app by rating the same sketch matched and plain
(their own, unblinded paired ratings).
"""
import argparse
import hashlib
import json
import pathlib
import subprocess

import imageio_ffmpeg
import librosa
import librosa.display
import matplotlib
import numpy as np

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402

SR = 22050
INK, GREEN, MUTED, GOLD, LINE = '#243d32', '#385e47', '#65746b', '#a98b4a', '#d8ddd1'
plt.rcParams.update({'font.family': 'sans-serif', 'font.size': 9, 'axes.edgecolor': LINE, 'axes.labelcolor': INK,
                     'xtick.color': MUTED, 'ytick.color': MUTED, 'axes.titlesize': 11, 'axes.titleweight': 'bold',
                     'figure.facecolor': 'white', 'axes.facecolor': 'white', 'savefig.dpi': 160})


def decode(path):
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32)


def shape_db(bands):
    """Third-octave levels relative to the power mean over 200 Hz–4 kHz (loudness removed).

    Bands more than 40 dB below the loudest are left out of the reference, as in
    dist/style-sketch.js normaliseShape, so an empty band cannot drag the reference down.
    """
    hz = np.array([b['hz'] for b in bands], float)
    db = np.array([b['db'] for b in bands], float)
    keep = (hz >= 200) & (hz <= 4100) & (db > db.max() - 40)
    ref = 10 * np.log10(np.mean(10 ** (db[keep] / 10)))
    return hz, db - ref


def register(y):
    """Tonal energy per semitone, C2 (65 Hz) to B7, from the harmonic part, normalised to sum 1."""
    h = librosa.effects.harmonic(y, margin=2)
    c = np.abs(librosa.cqt(h, sr=SR, hop_length=2048, fmin=librosa.note_to_hz('C2'), n_bins=72, bins_per_octave=12)) ** 2
    e = c.mean(axis=1)
    return e / e.sum()


def percentile_pitch(dist, q):
    """Pitch (in semitone-bin units) below which a fraction q of the energy lies.

    Each bin spans ±0.5 semitone around its centre, so the cumulative mass is placed at bin upper edges.
    """
    cdf = np.concatenate([[0], np.cumsum(dist) / np.sum(dist)])
    edges = np.arange(len(dist) + 1) - .5
    return float(np.interp(q, cdf, edges))


def save(fig, base, formats=('png', 'svg', 'pdf')):
    base.parent.mkdir(parents=True, exist_ok=True)
    for ext in formats:
        fig.savefig(base.with_suffix('.' + ext), bbox_inches='tight')
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', required=True)
    ap.add_argument('--dna', required=True)
    ap.add_argument('--contrast', required=True)
    ap.add_argument('--private-out', required=True)
    ap.add_argument('--figures', required=True)
    ap.add_argument('--zone-out', required=True)
    ap.add_argument('--skip-private', action='store_true', help='Only recompute the shared zone figures and data')
    args = ap.parse_args()
    dna = json.loads(pathlib.Path(args.dna).read_text())
    contrast = json.loads(pathlib.Path(args.contrast).read_text())
    folder = pathlib.Path(args.dir).expanduser()
    by_id = {hashlib.sha1(f.name.encode()).hexdigest()[:12]: f for f in folder.iterdir() if f.is_file()}
    private, figs = pathlib.Path(args.private_out).expanduser(), pathlib.Path(args.figures)
    songs = [s for s in dna['songs'] if not s.get('flags')]

    # ---- Spectral zone from the analyser's own third-octave spectra (same numbers as the app) ----
    hz, _ = shape_db(songs[0]['spectrum']['bandsDb'])
    shapes = np.array([shape_db(s['spectrum']['bandsDb'])[1] for s in songs])
    med, q1, q3 = np.median(shapes, 0), np.percentile(shapes, 25, 0), np.percentile(shapes, 75, 0)
    core = hz[med >= med.max() - 6]
    broad = hz[med >= med.max() - 12]
    peak_hz = float(hz[np.argmax(med)])

    # ---- Per-song private plots and the register (pitch-range) distribution ----
    registers = []
    sheet, axes = plt.subplots(5, 4, figsize=(16, 14))
    for i, s in enumerate(songs):
        y = decode(by_id[s['fileId']])
        reg = register(y)
        registers.append(reg)
        if args.skip_private:
            continue
        mel = librosa.power_to_db(librosa.feature.melspectrogram(y=y, sr=SR, n_fft=4096, hop_length=1024, n_mels=160, fmin=40, fmax=11000), ref=np.max)
        chroma = librosa.feature.chroma_cqt(y=y, sr=SR, hop_length=2048, tuning=s['tuning']['cents'] / 100)
        fig = plt.figure(figsize=(13, 9))
        gs = fig.add_gridspec(3, 2, height_ratios=[2.2, 1, 1.4], width_ratios=[3, 1.2], hspace=.45, wspace=.25)
        ax = fig.add_subplot(gs[0, :])
        librosa.display.specshow(mel, sr=SR, hop_length=1024, x_axis='time', y_axis='mel', fmin=40, fmax=11000, cmap='magma', ax=ax)
        ax.set_title(f"{s['name']} · spectrogram (full length, {s['duration'] / 60:.1f} min)")
        ax.set_ylabel('Frequency (Hz)')
        ax2 = fig.add_subplot(gs[1, :])
        librosa.display.specshow(chroma, sr=SR, hop_length=2048, x_axis='time', y_axis='chroma', cmap='Greens', ax=ax2)
        ax2.set_title(f"Pitch classes over time (key estimate {s['key']['name']}, tuning {s['tuning']['cents']:+.0f} cents)")
        ax3 = fig.add_subplot(gs[2, 0])
        ax3.fill_between(hz, q1, q3, color=GREEN, alpha=.15, label=f'Middle half of your {len(songs)} songs')
        ax3.plot(hz, med, color=GREEN, lw=1.5, label=f'Median of your {len(songs)} songs')
        ax3.plot(hz, shapes[i], color=GOLD, lw=2, label='This song')
        ax3.set_xscale('log'); ax3.set_xlabel('Frequency (Hz)'); ax3.set_ylabel('dB vs 200 Hz–4 kHz mean')
        ax3.set_title('Long-term spectrum vs the set'); ax3.legend(frameon=False, fontsize=8)
        ax4 = fig.add_subplot(gs[2, 1])
        f_reg = librosa.cqt_frequencies(72, fmin=librosa.note_to_hz('C2'))
        ax4.plot(f_reg, reg * 100, color=GOLD, lw=1.6)
        ax4.set_xscale('log'); ax4.set_xlabel('Pitch (Hz)'); ax4.set_ylabel('% of tonal energy'); ax4.set_title('Pitch range')
        save(fig, private / f"{i + 1:02d} {s['name']}", formats=('png',))
        a = axes.flat[i]
        librosa.display.specshow(mel, sr=SR, hop_length=1024, y_axis='mel', fmin=40, fmax=11000, cmap='magma', ax=a)
        a.set_title(s['name'], fontsize=9); a.set_ylabel(''); a.set_yticks([])
        print(f'plotted {s["name"]}', flush=True)
    if args.skip_private:
        plt.close(sheet)
    else:
        sheet.suptitle(f'Spectrograms of all {len(songs)} songs (40 Hz–11 kHz, mel scale, full length)', fontsize=13, fontweight='bold')
        save(sheet, private / '00 all songs', formats=('png',))

    reg = np.array(registers)
    reg_med = np.median(reg, 0)
    reg_med /= reg_med.sum()
    f_reg = librosa.cqt_frequencies(72, fmin=librosa.note_to_hz('C2'))
    note = lambda b: librosa.hz_to_note(float(np.interp(b, np.arange(72), f_reg)))
    hzq = lambda b: float(np.interp(b, np.arange(72), f_reg))
    r50 = (percentile_pitch(reg_med, .25), percentile_pitch(reg_med, .75))
    r80 = (percentile_pitch(reg_med, .10), percentile_pitch(reg_med, .90))

    # ---- Figure 1: spectral zone ----
    fig, ax = plt.subplots(figsize=(10, 5.2))
    for row in shapes:
        ax.plot(hz, row, color=GREEN, alpha=.18, lw=.8)
    ax.fill_between(hz, q1, q3, color=GREEN, alpha=.18, label=f'Middle half of your {len(songs)} songs')
    ax.plot(hz, med, color=GREEN, lw=2.6, label=f'Median of your {len(songs)} songs')
    ax.axvspan(core.min() / 2 ** (1 / 6), core.max() * 2 ** (1 / 6), color=GOLD, alpha=.12, label=f'Core zone: within 6 dB of the peak ({core.min():.0f}–{core.max():.0f} Hz)')
    styles = {'plain': ('#7a6fb0', '--', 'Generated sketch, plain'), 'matched': ('#a98b4a', '-', 'Generated sketch, matched to the zone'), 'ambient': ('#b06f6f', ':', 'Ambient reference')}
    seen = set()
    for c in contrast:
        kind = 'matched' if c['file'].startswith('sketch-matched') else 'plain' if c['file'].startswith('sketch') else 'ambient' if c['file'].endswith('.m4a') else None
        if not kind:
            continue
        chz, cdb = shape_db(c['bandsDb'])
        color, ls, label = styles[kind]
        ax.plot(chz, cdb, color=color, ls=ls, lw=1.6 if kind == 'matched' else 1.3, label=None if kind in seen else label)
        seen.add(kind)
    ax.set_xscale('log'); ax.set_xlim(55, 9000); ax.set_ylim(-45, 15)
    ax.set_xticks([63, 125, 250, 500, 1000, 2000, 4000, 8000]); ax.set_xticklabels(['63', '125', '250', '500', '1k', '2k', '4k', '8k'])
    ax.set_xlabel('Frequency (Hz, third-octave bands)'); ax.set_ylabel('Level (dB, relative to each sound’s 200 Hz–4 kHz power mean)')
    ax.set_title(f'Your sound zone: where your {len(songs)} songs put their energy')
    ax.grid(axis='y', color=LINE, lw=.6); ax.legend(frameon=False, fontsize=8, loc='lower left')
    save(fig, figs / 'spectral-zone')

    # ---- Figure 2: register zone ----
    fig, ax = plt.subplots(figsize=(10, 4.2))
    lo, hi = np.percentile(reg, 25, 0), np.percentile(reg, 75, 0)
    ax.fill_between(f_reg, lo * 100, hi * 100, color=GREEN, alpha=.18, label=f'Middle half of your {len(songs)} songs')
    ax.plot(f_reg, reg_med * 100, color=GREEN, lw=2.4, label='Median')
    ax.axvspan(hzq(r50[0]), hzq(r50[1]), color=GOLD, alpha=.15, label=f'Middle 50% of tonal energy: {note(r50[0])}–{note(r50[1])} ({hzq(r50[0]):.0f}–{hzq(r50[1]):.0f} Hz)')
    ax.set_xscale('log'); ax.set_xlabel('Pitch (Hz)'); ax.set_ylabel('% of tonal energy per semitone')
    ax.set_xticks([65, 131, 262, 523, 1047, 2093, 4186]); ax.set_xticklabels(['C2', 'C3', 'C4\n(middle C)', 'C5', 'C6', 'C7', 'C8'])
    ax.set_title('Where the notes sit: pitch range of the tonal energy (voice and instruments, including overtones)')
    ax.legend(frameon=False, fontsize=8); ax.grid(axis='y', color=LINE, lw=.6)
    save(fig, figs / 'register-zone')

    # ---- Figure 3: feature region (tempo × brightness, harmony) ----
    tempo = np.array([s['tempo']['bpm'] for s in songs]); cent = np.array([s['spectrum']['centroidHz'] for s in songs])
    minor = np.array([s['chords']['minorShare'] for s in songs]) * 100; changes = np.array([s['chords']['changesPerMinute'] for s in songs])
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(12, 5))
    for ax, x, y, xl, yl, cx, cy in ((a1, tempo, cent, 'Tempo (BPM)', 'Brightness: spectral centroid (Hz)', 'tempo', 'centroidHz'),
                                     (a2, minor, changes, 'Minor chords (% of chord time)', 'Chord changes per minute', 'minorShare', 'changesPerMinute')):
        for lo_q, hi_q, alpha, label in ((10, 90, .08, '10th–90th percentile on each axis'), (25, 75, .18, 'Middle half on each axis (your region)')):
            xs, ys = np.percentile(x, [lo_q, hi_q]), np.percentile(y, [lo_q, hi_q])
            ax.add_patch(plt.Rectangle((xs[0], ys[0]), xs[1] - xs[0], ys[1] - ys[0], color=GREEN, alpha=alpha, label=label, lw=0))
        ax.scatter(x, y, color=GREEN, s=30, zorder=3, label='Your songs')
        for c in contrast:
            if c['file'].startswith('sketch') or c['file'].endswith('.m4a'):
                vx = c[cx] * (100 if cx == 'minorShare' else 1)
                matched = c['file'].startswith('sketch-matched')
                ax.scatter(vx, c[cy], marker='x' if c['file'].endswith('.m4a') else '^', color='#b06f6f' if c['file'].endswith('.m4a') else '#a98b4a' if matched else '#7a6fb0', s=40, zorder=3)
        ax.set_xlabel(xl); ax.set_ylabel(yl); ax.grid(color=LINE, lw=.5)
    a1.scatter([], [], marker='x', color='#b06f6f', label='Ambient reference'); a1.scatter([], [], marker='^', color='#7a6fb0', label='Sketch, plain'); a1.scatter([], [], marker='^', color='#a98b4a', label='Sketch, matched')
    a1.legend(frameon=False, fontsize=8, loc='upper left')
    a1.set_title('Pace and brightness'); a2.set_title('Harmony')
    fig.suptitle(f'Your region: where your {len(songs)} songs sit on tempo, brightness and harmony (boxes use each axis separately)', fontweight='bold')
    save(fig, figs / 'feature-region')

    q = lambda a, p: round(float(np.percentile(a, p)), 1)
    zone = {
        'schema': 'still-song-zone-v1', 'artist': dna['artist'], 'songs': len(songs), 'builtFrom': dna['builtAt'],
        'note': 'Aggregate over the set only. Describes the songs, not the listener; the listener can check it with their own (unblinded) paired ratings of matched and plain sketches. Register energy includes overtones, not only sung fundamentals.',
        'spectral': {'bandsHz': hz.tolist(), 'medianDb': np.round(med, 2).tolist(), 'q1Db': np.round(q1, 2).tolist(), 'q3Db': np.round(q3, 2).tolist(),
                     'peakHz': peak_hz, 'coreHz': [float(core.min()), float(core.max())], 'broadHz': [float(broad.min()), float(broad.max())]},
        'register': {'semitoneHz': np.round(f_reg, 2).tolist(), 'medianShare': np.round(reg_med, 5).tolist(),
                     'middle50': {'notes': [note(r50[0]), note(r50[1])], 'hz': [round(hzq(r50[0]), 1), round(hzq(r50[1]), 1)]},
                     'middle80': {'notes': [note(r80[0]), note(r80[1])], 'hz': [round(hzq(r80[0]), 1), round(hzq(r80[1]), 1)]}},
        'region': {'tempoBpm': [q(tempo, 25), q(tempo, 75)], 'centroidHz': [q(cent, 25), q(cent, 75)],
                   'minorPercent': [q(minor, 25), q(minor, 75)], 'changesPerMinute': [q(changes, 25), q(changes, 75)]},
    }
    pathlib.Path(args.zone_out).write_text(json.dumps(zone, indent=1, ensure_ascii=False))
    print(json.dumps({k: v for k, v in zone['spectral'].items() if not isinstance(v, list) or len(v) < 5}, ensure_ascii=False))
    print(json.dumps({k: v for k, v in zone['register'].items() if k.startswith('middle')}, ensure_ascii=False))
    print(json.dumps(zone['region']))


if __name__ == '__main__':
    main()
