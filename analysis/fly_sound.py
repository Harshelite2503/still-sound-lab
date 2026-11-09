"""Drive the fly whole-brain LIF model with sounds and look for patterns.

Pipeline: sound waveform -> two band envelopes -> time-varying Poisson rates into the
fly's auditory Johnston's organ neurons (JO-A: higher band, JO-B: lower band) -> whole-brain
simulation -> responses of every neuron, grouped by FlyWire cell type.

This is a toy transduction model on a model brain. It shows how the connectome routes and
filters patterned input; it is not a measurement of a real fly, and not of a human.

Usage: python analysis/fly_sound.py --data <folder with connectome + annotations> --out figures/fly-sound
"""
from __future__ import annotations

import argparse, json, time
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.signal import butter, sosfiltfilt

from fly_lif import FlyBrain

FS = 8000  # Hz, sound sample rate
DT_MS = 0.1

# Sound -> JO firing. EVIDENCE: JO-B prefers below ~100 Hz, JO-A above ~100 Hz (Ishikawa 2017; JO-A
# best near 400 Hz, Matsuo 2014); JO responds to movement in both directions (full-wave). JUDGEMENT:
# each JO neuron gets its own best frequency (log-uniform in its range), a half-octave band-pass
# channel, full-wave rectification, a 90 Hz envelope low-pass and a sigmoid in dB over ~40 dB to
# 0-200 Hz. JO single-neuron rates are unmeasured, so absolute levels are arbitrary: we sweep level.
BEST_FREQ = {'JO-B': (30, 150), 'JO-A': (150, 800)}
N_CHANNELS = 16
CHANNELS = np.geomspace(30, 800, N_CHANNELS)
RATE_MAX = 200.0      # Hz
L50_DB = -30.0        # band level (dB re full scale) giving half the max rate
SLOPE_DB = 9.0        # sigmoid scale: 10-90% over ~40 dB
ENV_LP_HZ = 90.0

# ---------- sounds ----------
def silence(t_s): return np.zeros(int(t_s * FS))

def pulse_train(ipi_ms=None, t_s=1.5, carrier=250.0, sigma_ms=4.0, amp=.5, centres=None):
    """Pulse song: Gabor pulses (~16 ms long, 250 Hz carrier) at a fixed gap, or at given centres."""
    x, t = silence(t_s), np.arange(int(t_s * FS)) / FS
    for c in (np.arange(.02, t_s, ipi_ms / 1000) if centres is None else centres):
        x += amp * np.exp(-.5 * ((t - c) / (sigma_ms / 1000)) ** 2) * np.sin(2 * np.pi * carrier * (t - c))
    return x

def shuffled_pulses(ipi_ms=36, t_s=1.5, seed=7, lo=16, hi=96):
    """Same number of pulses as the regular train, gaps drawn at random between lo and hi ms."""
    n = len(np.arange(.02, t_s, ipi_ms / 1000)); rng = np.random.default_rng(seed)
    gaps = rng.uniform(lo, hi, n - 1); gaps *= (t_s - .04) * 1000 / gaps.sum() if gaps.sum() > (t_s - .04) * 1000 else 1
    return pulse_train(centres=.02 + np.concatenate([[0], np.cumsum(gaps) / 1000]), t_s=t_s)

def tone(f, t_s=1.5, amp=.3): return amp * np.sin(2 * np.pi * f * np.arange(int(t_s * FS)) / FS)

def noise(t_s=1.5, amp=.15, seed=0, lo=50, hi=1500):
    rng = np.random.default_rng(seed)
    x = rng.standard_normal(int(t_s * FS))
    x = sosfiltfilt(butter(4, [lo, hi], 'bandpass', fs=FS, output='sos'), x)
    return amp * x / np.sqrt(np.mean(x ** 2))

def am(x, f_mod, depth=1.0):
    t = np.arange(len(x)) / FS
    return x * (1 - depth / 2 + depth / 2 * np.sin(2 * np.pi * f_mod * t - np.pi / 2))

def bang(t_s=1.5, at=.5, dur=.05, amp=.8):
    x = silence(t_s); n0, n1 = int(at * FS), int((at + dur) * FS)
    x[n0:n1] = noise(dur + .01, amp=amp, seed=3)[: n1 - n0] * np.hanning(n1 - n0)
    return x


def sound_set():
    S = {
        # fly courtship song (Baker et al. 2022 test set: gaps 16-96 ms, tones 100-800 Hz)
        'pulse song, 16 ms gaps': pulse_train(16),
        'pulse song, 36 ms gaps (natural)': pulse_train(36),
        'pulse song, 56 ms gaps': pulse_train(56),
        'pulse song, 79 ms gaps': pulse_train(79),
        'pulse song, 96 ms gaps': pulse_train(96),
        'pulse song, shuffled gaps': shuffled_pulses(36),
        'sine song, 150 Hz': tone(150),
        'tone 100 Hz': tone(100), 'tone 300 Hz': tone(300), 'tone 800 Hz': tone(800),
        # sounds that matter for sound-sensitive people (heard by a fly as near-field vibration)
        'steady noise, quiet': noise(amp=.01),
        'steady noise': noise(amp=.05),
        'steady noise, loud': noise(amp=.25),
        'noise, slow swell (0.5 Hz)': am(noise(amp=.05), .5),
        'noise, flutter (10 Hz)': am(noise(amp=.05), 10),
        'sudden bang': bang(),
        'high hiss (2-4 kHz)': noise(lo=2000, hi=3900, amp=.05),
    }
    return S


def channel_rates(x: np.ndarray) -> np.ndarray:
    """Rate (Hz) per filter channel per simulation step: band-pass, full-wave rectify, low-pass, sigmoid in dB."""
    n_steps = int(round(len(x) / FS * 1000 / DT_MS))
    lp = butter(2, ENV_LP_HZ, 'lowpass', fs=FS, output='sos')
    out = np.zeros((N_CHANNELS, n_steps))
    t_sim = np.arange(n_steps) * DT_MS / 1000; t_snd = np.arange(len(x)) / FS
    for c, f in enumerate(CHANNELS):
        y = sosfiltfilt(butter(2, [f / 2 ** .25, f * 2 ** .25], 'bandpass', fs=FS, output='sos'), x)
        env = np.maximum(sosfiltfilt(lp, np.abs(y)) * np.pi / 2, 0)  # mean |sine| -> amplitude
        level = 20 * np.log10(env / np.sqrt(2) + 1e-12)               # RMS level, dB re full scale
        r = RATE_MAX / (1 + np.exp(-(level - L50_DB) / SLOPE_DB))
        out[c] = np.interp(t_sim, t_snd, r)
    return out


def assign_channels(n_by_group: dict[str, int], seed: int = 0) -> dict[str, np.ndarray]:
    """Each JO neuron's channel, from a best frequency drawn log-uniformly in its subtype's range."""
    rng = np.random.default_rng(seed); out = {}
    for g, n in n_by_group.items():
        lo, hi = BEST_FREQ[g]
        bf = np.exp(rng.uniform(np.log(lo), np.log(hi), n))
        out[g] = np.abs(np.log(bf)[:, None] - np.log(CHANNELS)[None, :]).argmin(1)
    return out


# Controls: the same average input to each JO group as a patterned sound, with the pattern removed.
CONTROLS = {
    'control: 36 ms pulse input, no pattern': 'pulse song, 36 ms gaps (natural)',
    'control: flutter input, no pattern': 'noise, flutter (10 Hz)',
    'control: bang input, spread out': 'sudden bang',
}


def all_inputs(n_steps: int) -> dict[str, np.ndarray]:
    """Channel rates for every sound, plus controls with the same mean per channel and no pattern."""
    S = sound_set()
    rates = {k: channel_rates(x)[:, :n_steps] for k, x in S.items()}
    for ctrl, src in CONTROLS.items():
        rates[ctrl] = np.repeat(rates[src].mean(1, keepdims=True), n_steps, 1)
    return rates


# ---------- experiment ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True)
    ap.add_argument('--out', default='figures/fly-sound')
    ap.add_argument('--trials', type=int, default=6)
    ap.add_argument('--inh-scale', type=float, default=1.0, help='scale inhibitory synapses (1 = published model)')
    ap.add_argument('--only', nargs='*', help='run only these sounds')
    args = ap.parse_args()
    data, out = Path(args.data), Path(args.out); out.mkdir(parents=True, exist_ok=True)

    fb = FlyBrain(data / '2025_Completeness_783.csv', data / '2025_Connectivity_783.parquet', {'inh_scale': args.inh_scale})
    ann = pd.read_csv(data / 'annotations.tsv', sep='\t', low_memory=False, usecols=['root_id', 'cell_type', 'hemibrain_type', 'super_class', 'cell_class', 'cell_sub_class', 'side', 'top_nt'])
    ann = ann.drop_duplicates('root_id').set_index('root_id')
    aud = ann[ann.cell_sub_class.eq('auditory')]
    groups = {
        'JO-A': fb.idx(aud.index[aud.cell_type.astype(str).str.startswith('JO-A')]),
        'JO-B': fb.idx(aud.index[aud.cell_type.astype(str).str.startswith('JO-B')]),
    }
    print({k: len(v) for k, v in groups.items()})
    chan = assign_channels({g: len(v) for g, v in groups.items()})
    by_channel = {c: np.concatenate([groups[g][chan[g] == c] for g in groups]) for c in range(N_CHANNELS)}
    by_channel = {c: v for c, v in by_channel.items() if len(v)}

    t_ms = 1500.0
    n_steps = int(t_ms / DT_MS)
    inputs = all_inputs(n_steps)
    sounds = [k for k in inputs if not args.only or k in args.only]
    bin_ms = 5.0
    nb = int(t_ms / bin_ms)
    results = {}
    for name in sounds:
        rates = inputs[name]
        drive = {f'ch{c}': (idxs, rates[c]) for c, idxs in by_channel.items()}
        counts = np.zeros(fb.n); psth = {}
        t0 = time.time()
        for tr in range(args.trials):
            st, si, _ = fb.run(t_ms, drive, seed=1000 + tr)
            counts += np.bincount(si, minlength=fb.n)
            b = (st * DT_MS // bin_ms).astype(int)
            key = si.astype(np.int64) * nb + b
            u, c = np.unique(key, return_counts=True)
            for kk, cc in zip(u, c):
                psth[kk] = psth.get(kk, 0) + cc
        jo_in = {g: float(np.mean([rates[c].mean() for c in chan[g]])) for g in groups}
        results[name] = dict(rate=counts / args.trials / (t_ms / 1000), psth=psth, jo_rate=jo_in)
        print(f'{name}: {time.time() - t0:.0f}s, active {(counts > 0).sum()}', flush=True)

    # Save compact results: rates per neuron per sound for neurons active anywhere, PSTHs for those neurons.
    R = np.array([results[s]['rate'] for s in sounds])
    keep = np.flatnonzero(R.max(0) > 0)
    np.savez_compressed(out / 'responses.npz', sounds=np.array(list(sounds)), neuron=keep, flywire_id=fb.ids[keep],
                        rate=R[:, keep], trials=args.trials, t_ms=t_ms, bin_ms=bin_ms)
    psth = np.zeros((len(sounds), len(keep), nb), np.float32)
    pos = {n: i for i, n in enumerate(keep)}
    for si_, s in enumerate(sounds):
        for kk, cc in results[s]['psth'].items():
            n, b = divmod(int(kk), nb)
            if n in pos and b < nb: psth[si_, pos[n], b] = cc / args.trials / (bin_ms / 1000)
    np.save(out / 'psth.npy', psth)
    json.dump({'inh_scale': args.inh_scale, 'best_freq': BEST_FREQ, 'channels_hz': CHANNELS.round(1).tolist(), 'rate_max': RATE_MAX, 'l50_db': L50_DB,
               'slope_db': SLOPE_DB, 'env_lp_hz': ENV_LP_HZ, 'trials': args.trials,
               'jo_per_channel': {int(c): int(len(v)) for c, v in by_channel.items()},
               'jo_counts': {k: int(len(v)) for k, v in groups.items()},
               'jo_mean_rate': {s: results[s]['jo_rate'] for s in sounds}}, open(out / 'run.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
