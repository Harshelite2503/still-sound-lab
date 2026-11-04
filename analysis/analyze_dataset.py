"""Analyze the corrected EmoSynth release and four Stobbe et al. study stimuli.

No network calls. Input audio is decoded locally; output contains measurements and
published aggregate ratings only. No EEG, clinical classification, or inference of
therapeutic frequencies. See --help for portable input paths.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import wave

import imageio_ffmpeg
import numpy as np

RATE = 44100
MAX_FFT = 131072
EDGES = np.geomspace(20, RATE / 2, 161)
BIRD_IDS = {
    'birdsong-low': ('Birdsong · lower diversity', 'k73rg'),
    'birdsong-high': ('Birdsong · higher diversity', 'szbgx'),
    'traffic-low': ('Traffic · lower diversity', '7x6hp'),
    'traffic-high': ('Traffic · higher diversity', '8ydjb'),
}


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def decode(path, start=0, seconds=None):
    command = [imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-nostats', '-i', str(path)]
    if start:
        command += ['-ss', str(start)]
    if seconds is not None:
        command += ['-t', str(seconds)]
    command += ['-f', 'f32le', '-acodec', 'pcm_f32le', '-ar', str(RATE), 'pipe:1']
    result = subprocess.run(command, capture_output=True, check=True)
    details = result.stderr.decode(errors='replace')
    input_details = details.split('Output #')[0]
    audio_line = next(line for line in input_details.splitlines() if 'Audio:' in line)
    if path.suffix.lower() == '.wav':
        with wave.open(str(path)) as wav:
            channels = wav.getnchannels()
            source_rate = wav.getframerate()
            source_duration = wav.getnframes() / source_rate
    else:
        channel_match = re.search(r'\b(mono|stereo|\d+ channels)\b', audio_line)
        if not channel_match:
            raise ValueError(f'Cannot establish original channels: {audio_line}')
        channels = {'mono': 1, 'stereo': 2}.get(channel_match[1])
        if channels is None:
            channels = int(channel_match[1].split()[0])
        source_rate = int(re.search(r'(\d+) Hz', audio_line)[1])
        match = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', input_details)
        source_duration = (int(match[1]) * 3600 + int(match[2]) * 60 + float(match[3])) if match else None
    values = np.frombuffer(result.stdout, dtype='<f4').reshape(-1, channels).astype(np.float64)
    if len(values) < 2048 or not np.isfinite(values).all():
        raise ValueError(f'Audio is too short or non-finite: {path}')
    return values, {'source_channels': channels, 'source_sample_rate_hz': source_rate,
                    'sample_rate_hz': RATE, 'source_duration_seconds': source_duration,
                    'analyzed_seconds': round(len(values) / RATE, 6)}


def spectrum(audio):
    """Mean one-sided Hann PSD; preserve channels until power is calculated."""
    size = min(MAX_FFT, 2 ** int(math.floor(math.log2(len(audio)))))
    starts = list(range(0, len(audio) - size + 1, size // 2))
    if starts[-1] != len(audio) - size:
        starts.append(len(audio) - size)
    window = np.hanning(size)
    powers = []
    for start in starts:
        block = audio[start:start + size]
        block = block - block.mean(axis=0)
        power = np.abs(np.fft.rfft(block * window[:, None], axis=0)) ** 2
        power /= RATE * np.sum(window ** 2)
        power[1:-1] *= 2
        powers.append(power.mean(axis=1))
    return np.fft.rfftfreq(size, 1 / RATE), np.mean(powers, axis=0), size, len(starts)


def measure(audio):
    if audio.ndim == 1:
        audio = audio[:, None]
    frequencies, power, size, windows = spectrum(audio)
    mask = frequencies >= 20
    f, p = frequencies[mask], power[mask]
    total = p.sum()
    rms = float(np.sqrt(np.mean(audio ** 2)))
    peak = float(np.max(np.abs(audio)))
    silent = bool(peak < 1e-12 or total < 1e-30)
    if silent:
        features = {'centroid_hz': None, 'rolloff85_hz': None, 'flatness': None,
                    'dominant_hz': None, 'band_energy': {'low': 0, 'mid': 0, 'high': 0}}
    else:
        index = int(np.argmax(p))
        # Full-clip Hann FFT provides the tone estimate for these known synthetic
        # stimuli; its dominant peak is not a general-purpose fundamental estimator.
        full = audio - audio.mean(axis=0)
        full_power = (np.abs(np.fft.rfft(full * np.hanning(len(full))[:, None], axis=0)) ** 2).mean(axis=1)
        full_frequency = np.fft.rfftfreq(len(full), 1 / RATE)
        peak_index = int(np.argmax(np.where(full_frequency >= 20, full_power, 0)))
        dominant = full_frequency[peak_index]
        if 0 < peak_index < len(full_power) - 1:
            a, b, c = np.log(np.maximum(full_power[peak_index - 1:peak_index + 2], 1e-100))
            denominator = a - 2 * b + c
            delta = np.clip(.5 * (a - c) / denominator, -.5, .5) if abs(denominator) > 1e-12 else 0
            dominant += float(delta * RATE / len(full))
        rolloff = min(int(np.searchsorted(np.cumsum(p), .85 * total)), len(f) - 1)
        features = {
            'centroid_hz': round(float(np.dot(f, p) / total), 4),
            'rolloff85_hz': round(float(f[rolloff]), 4),
            'flatness': float(np.exp(np.mean(np.log(np.maximum(p, 1e-100)))) / np.mean(p)),
            'dominant_hz': round(float(dominant), 4),
            'band_energy': {'low': round(float(p[f < 250].sum() / total), 8),
                            'mid': round(float(p[(f >= 250) & (f < 2000)].sum() / total), 8),
                            'high': round(float(p[f >= 2000].sum() / total), 8)},
        }
    features.update({'rms_dbfs': round(float(20 * np.log10(rms)), 4) if rms else None,
                     'peak_dbfs': round(float(20 * np.log10(peak)), 4) if peak else None,
                     'samples_at_or_above_full_scale': int(np.sum(np.abs(audio) >= 1)),
                     'silent': silent, 'fft_size': size, 'fft_windows': windows})
    shares = []
    for i, (low, high) in enumerate(zip(EDGES[:-1], EDGES[1:])):
        selection = (frequencies >= low) & ((frequencies <= high) if i == len(EDGES) - 2 else (frequencies < high))
        shares.append(float(power[selection].sum() / total) if not silent else 0)
    shares = np.asarray(shares)
    relative = (np.full(len(shares), -80.0) if silent else
                np.maximum(-80, 10 * np.log10(np.maximum(shares, 1e-100) / max(float(shares.max()), 1e-100))))
    return features, {'frequency_hz': np.round(np.sqrt(EDGES[:-1] * EDGES[1:]), 4).tolist(),
                      'power_share': np.round(shares, 9).tolist(),
                      'relative_db': np.round(relative, 3).tolist()}


def rankdata(values):
    values = np.asarray(values, dtype=float)
    order = np.argsort(values, kind='stable')
    result = np.empty(len(values), dtype=float)
    i = 0
    while i < len(values):
        j = i + 1
        while j < len(values) and values[order[j]] == values[order[i]]:
            j += 1
        result[order[i:j]] = (i + j - 1) / 2 + 1
        i = j
    return result


def spearman(x, y):
    a, b = rankdata(x), rankdata(y)
    if len(a) < 2 or np.std(a) == 0 or np.std(b) == 0:
        return None
    return round(float(np.corrcoef(a, b)[0, 1]), 6)


def summarize(items):
    rows = [x for x in items if x['collection'] == 'emosynth']
    valence = [x['ratings']['valence_mean'] for x in rows]
    correlations = []
    for key, getter in [('centroid_hz', lambda x: x['features']['centroid_hz']),
                        ('low_energy_share', lambda x: x['features']['band_energy']['low']),
                        ('dominant_hz', lambda x: x['features']['dominant_hz']),
                        ('arousal_mean', lambda x: x['ratings']['arousal_mean'])]:
        correlations.append({'feature': key, 'spearman_rho': spearman(valence, [getter(x) for x in rows]), 'n_stimuli': len(rows)})
    cuts = np.quantile(valence, [.25, .5, .75])
    groups = []
    bins = np.searchsorted(cuts, valence, side='left')
    for index in range(4):
        selected = [item for item, group in zip(rows, bins) if group == index]
        groups.append({'quartile': index + 1, 'n_stimuli': len(selected),
                       'valence_range': [min(x['ratings']['valence_mean'] for x in selected), max(x['ratings']['valence_mean'] for x in selected)],
                       'mean_band_energy': {band: round(float(np.mean([x['features']['band_energy'][band] for x in selected])), 8) for band in ['low', 'mid', 'high']},
                       'median_band_energy': {band: round(float(np.median([x['features']['band_energy'][band] for x in selected])), 8) for band in ['low', 'mid', 'high']}})
    carriers = []
    for index in sorted({x['generation']['frequency_index'] for x in rows}):
        selected = [x for x in rows if x['generation']['frequency_index'] == index]
        carriers.append({'frequency_index': index, 'estimated_frequency_hz': round(float(np.median([x['features']['dominant_hz'] for x in selected])), 4),
                         'frequency_estimate_range_hz': [min(x['features']['dominant_hz'] for x in selected), max(x['features']['dominant_hz'] for x in selected)],
                         'n_stimuli': len(selected), 'mean_valence': round(float(np.mean([x['ratings']['valence_mean'] for x in selected])), 6),
                         'mean_arousal': round(float(np.mean([x['ratings']['arousal_mean'] for x in selected])), 6),
                         'valence_range': [min(x['ratings']['valence_mean'] for x in selected), max(x['ratings']['valence_mean'] for x in selected)]})
    return {'emosynth': {'n_stimuli': len(rows), 'correlations': correlations,
                         'valence_quartile_cutpoints': cuts.tolist(), 'valence_quartiles': groups,
                         'carrier_groups': carriers,
                         'interpretation': 'Descriptive associations within this synthetic collection only. Means give each stimulus equal weight; stimulus-level rating counts are unavailable. Related parameter combinations are not independent participants. No p-values, treatment effect, or optimum are inferred.'}}


def validate():
    t = np.arange(RATE * 4) / RATE
    sine = .1 * np.sin(2 * np.pi * 220 * t)
    opposite = np.column_stack([sine, -sine])
    measured, displayed = measure(opposite)
    assert abs(measured['dominant_hz'] - 220) < .05, measured
    assert abs(measured['centroid_hz'] - 220) < .1, measured
    assert measured['band_energy']['low'] > .999
    assert abs(sum(measured['band_energy'].values()) - 1) < 1e-6
    assert abs(sum(displayed['power_share']) - 1) < 1e-6
    silence, silent_plot = measure(np.zeros((RATE, 2)))
    assert silence['silent'] and silence['centroid_hz'] is None
    assert sum(silent_plot['power_share']) == 0
    assert max(silent_plot['relative_db']) == -80
    json.dumps({'signal': measured, 'silence': silence, 'plot': displayed}, allow_nan=False)
    assert rankdata([3, 1, 1, 2]).tolist() == [4, 1.5, 1.5, 3]
    assert spearman([1, 2, 2, 4], [4, 3, 3, 1]) == -1
    assert spearman([1, 1], [1, 2]) is None
    return {'status': 'passed', 'anti_phase_tone_hz': measured['dominant_hz'],
            'energy_share_sum': sum(displayed['power_share']),
            'checks': ['anti-phase stereo power preservation', 'known-tone frequency/centroid', 'normalized band/spectrum energy', 'silence yields no fictional tone', 'average ranks for ties', 'constant-rank correlation is undefined']}


def write_figures(data, out):
    import os
    import tempfile
    # Keep plotting caches out of the user's home directory and the deliverables.
    cache = tempfile.mkdtemp(prefix='still-plot-cache-')
    os.environ.setdefault('MPLCONFIGDIR', cache)
    os.environ.setdefault('XDG_CACHE_HOME', cache)
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    rows = [x for x in data['items'] if x['collection'] == 'emosynth']
    plt.rcParams.update({'font.size': 11, 'axes.spines.top': False, 'axes.spines.right': False,
                         'font.family': 'DejaVu Sans', 'figure.facecolor': '#f6f5ed', 'axes.facecolor': '#f6f5ed'})
    fig, axes = plt.subplots(1, 3, figsize=(17, 5.8), gridspec_kw={'width_ratios': [1.2, 1, 1]})
    colors = {'sine': '#257589', 'square': '#ac664b', 'sawtooth': '#718443'}
    for waveform, color in colors.items():
        subset = [x for x in rows if x['generation']['waveform'] == waveform]
        axes[0].scatter([x['features']['dominant_hz'] for x in subset], [x['ratings']['valence_mean'] for x in subset], s=25, alpha=.7, color=color, label=waveform.capitalize())
    axes[0].set(xscale='log', xlabel='Measured dominant tone (Hz, log scale)', ylabel='Mean perceived valence (1–5)', ylim=(1, 5), title='Frequency is only one sound parameter')
    axes[0].legend(frameon=False, fontsize=9)
    axes[0].grid(alpha=.15)
    x = [r['features']['centroid_hz'] for r in rows]
    y = [r['ratings']['valence_mean'] for r in rows]
    axes[1].scatter(x, y, s=24, color='#385e47', alpha=.65)
    rho = data['summary']['emosynth']['correlations'][0]['spearman_rho']
    axes[1].set(xscale='log', xlabel='Spectral centroid (Hz, log scale)', ylabel='Mean perceived valence (1–5)', ylim=(1, 5), title=f'Brightness association: Spearman ρ = {rho:.2f}')
    axes[1].grid(alpha=.15)
    qs = data['summary']['emosynth']['valence_quartiles']
    bottom = np.zeros(4)
    for band, color, label in [('low', '#385e47', '20–250 Hz'), ('mid', '#7da092', '250–2,000 Hz'), ('high', '#cfad7f', '2,000–22,050 Hz')]:
        values = np.array([q['mean_band_energy'][band] * 100 for q in qs])
        axes[2].bar(range(4), values, bottom=bottom, color=color, label=label, width=.7)
        bottom += values
    axes[2].set(xticks=range(4), xticklabels=[f'Q{q["quartile"]}\nn={q["n_stimuli"]}' for q in qs], ylim=(0, 100), ylabel='Mean share of spectral energy (%)', xlabel='Increasing mean valence →', title='Energy distribution across rating groups')
    axes[2].legend(frameon=False, fontsize=9, loc='upper center', bbox_to_anchor=(.5, -.2), ncol=1)
    fig.suptitle(f'EmoSynth · {len(rows)} measured stimuli with human emotion ratings', x=.045, ha='left', fontsize=19, color='#243d32')
    fig.text(.045, .035, 'Each point is a stimulus, not a participant. Ratings describe perceived emotion; they do not measure personal comfort, migraine relief or an optimal frequency.\nCorrected Zenodo release: 168 files; the 2018 paper describes 144. Source: Baird et al., DOI 10.1145/3243274.3243277 · CC BY 4.0.', fontsize=10, color='#5e6b60')
    fig.subplots_adjust(top=.8, bottom=.29, left=.06, right=.985, wspace=.35)
    for extension in ['png', 'pdf', 'svg']:
        fig.savefig(out / f'expanded-frequency-ratings.{extension}', dpi=180)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--emosynth-dir', type=Path, help='Extracted emoSynth-DB directory (contains all_data/)')
    parser.add_argument('--birdsong-dir', type=Path, help='Directory containing four named MP3s and OSF files.json')
    parser.add_argument('--output-dir', type=Path)
    parser.add_argument('--skip-figures', action='store_true')
    parser.add_argument('--self-test', action='store_true', help='Run synthetic DSP and rank checks without any downloaded audio')
    args = parser.parse_args()
    if args.self_test:
        print(json.dumps(validate(), indent=2))
        return
    if not all([args.emosynth_dir, args.birdsong_dir, args.output_dir]):
        parser.error('--emosynth-dir, --birdsong-dir and --output-dir are required unless --self-test is used')
    args.output_dir.mkdir(parents=True, exist_ok=True)
    validation = validate()
    label_path = args.emosynth_dir / 'all_data' / 'audio_labels.csv'
    with label_path.open(newline='') as handle:
        labels = list(csv.DictReader(handle))
    audio_dir = args.emosynth_dir / 'all_data' / 'wavs'
    if len({x['audio_file'] for x in labels}) != len(labels):
        raise ValueError('Duplicate stimulus IDs in aggregate ratings')
    expected = {x['audio_file'] for x in labels}
    actual = {x.name for x in audio_dir.glob('*.wav')}
    if expected != actual:
        raise ValueError(f'Audio/rating mismatch: missing={expected-actual}, unlabelled={actual-expected}')
    items = []
    wave_names = {'s': 'sine', 'sq': 'square', 'sw': 'sawtooth'}
    for label in sorted(labels, key=lambda r: r['audio_file']):
        filename = label['audio_file']
        path = audio_dir / filename
        match = re.fullmatch(r'(s|sq|sw)(\d+)_a([01])_d([12])\.wav', filename)
        if not match:
            raise ValueError(f'Unrecognized parameter filename: {filename}')
        audio, metadata = decode(path)
        features, plot = measure(audio)
        ratings = {'valence_mean': float(label['valence']), 'arousal_mean': float(label['arousal']),
                   'valence_sd': float(label['round_val_sd']), 'arousal_sd': float(label['round_ar_sd']), 'n': None}
        if not all(1 <= ratings[key] <= 5 for key in ['valence_mean', 'arousal_mean']):
            raise ValueError(f'Rating outside documented scale: {filename}')
        items.append({'id': 'emosynth-' + path.stem, 'collection': 'emosynth',
                      'title': f'{wave_names[match[1]].capitalize()} · {features["dominant_hz"]:.1f} Hz · {match[0][:-4]}',
                      'source_url': 'https://zenodo.org/records/3727593', 'source_file': filename,
                      'source_sha256': digest(path), 'excerpt': {'start_seconds': 0, 'end_seconds': metadata['analyzed_seconds']},
                      'audio': metadata, 'ratings': ratings,
                      'generation': {'waveform': wave_names[match[1]], 'frequency_index': int(match[2]), 'envelope_code': 'a' + match[3], 'duration_code': 'd' + match[4], 'dominant_tone_estimate_hz': features['dominant_hz']},
                      'features': features, 'spectrum': plot})
    # Hash verification detects partial downloads before any measurements are used.
    records = json.loads((args.birdsong_dir / 'files.json').read_text())['data']
    file_metadata = {r['attributes']['guid']: r['attributes'] for r in records}
    for identifier, (title, guid) in BIRD_IDS.items():
        path = args.birdsong_dir / (identifier + '.mp3')
        source_hash = digest(path)
        if source_hash != file_metadata[guid]['extra']['hashes']['sha256']:
            raise ValueError(f'Incomplete or altered OSF file: {path.name}')
        audio, metadata = decode(path, 60, 30)
        if not 29.9 <= metadata['analyzed_seconds'] <= 30.1:
            raise ValueError('Unexpected study excerpt length')
        features, plot = measure(audio)
        items.append({'id': identifier, 'collection': 'birdsong-trial', 'title': title,
                      'source_url': 'https://osf.io/' + guid + '/', 'source_file': path.name,
                      'source_sha256': source_hash, 'excerpt': {'start_seconds': 60, 'end_seconds': 90},
                      'audio': metadata, 'ratings': None, 'generation': None, 'features': features, 'spectrum': plot})
    data = {'schema_version': 1, 'analysis_date': '2026-11-04', 'validation': validation,
            'methods': {'sample_rate_hz': RATE, 'frequency_range_hz': [20, RATE / 2],
                        'band_definitions_hz': {'low': [20, 250], 'mid': [250, 2000], 'high': [2000, RATE / 2]},
                        'spectral_method': 'One-sided Hann-window PSD averaged over 50%-overlapping windows plus final endpoint. FFT size min(131072, largest power of two within clip). Channels averaged after power, preserving anti-phase energy.',
                        'display': '160 logarithmic bands from 20 Hz to 22050 Hz. power_share is integrated energy per band divided by total in that range; relative_db uses the strongest displayed energy band as 0 dB. Unequal band widths mean this is band energy, not power density.',
                        'dominant_tone': 'Interpolated strongest peak in the full-clip Hann spectrum above 20 Hz. Suitable as a tone estimate for known synthetic stimuli, not a general fundamental or binaural-beat detector.',
                        'levels': 'RMS and peak are digital dBFS, not calibrated loudness at the ear. No waveform normalization precedes measurements.',
                        'ratings': 'Provided aggregate perceived-valence/arousal means on 1–5 scales. SDs are rounded source SDs. Forty annotators in the study; per-stimulus n is not provided. No individual ratings are redistributed.',
                        'release_difference': f'The 2018 paper and landing-page prose describe 144 stimuli. The corrected Zenodo archive analyzed here contains {len(labels)} WAVs and {len(labels)} matching rating rows: 14 frequency indices × 3 waveforms × 2 envelope codes × 2 duration codes.',
                        'birdsong_interval': 'Only 60–90 seconds of each source is measured. The randomized study exposed participants to six minutes; an excerpt is not a tested intervention in itself.'},
            'collections': [{'id': 'emosynth', 'label': 'EmoSynth · human emotion ratings', 'count': len(labels), 'license': 'CC BY 4.0', 'source_url': 'https://zenodo.org/records/3727593', 'paper_url': 'https://doi.org/10.1145/3243274.3243277', 'evidence': 'Perceived valence/arousal judgments, not pain or migraine outcomes', 'rating_scale': {'min': 1, 'max': 5, 'valence': 'Low = negative; high = positive', 'arousal': 'Low = low arousal; high = high arousal'}},
                            {'id': 'birdsong-trial', 'label': 'Birdsong / traffic · randomized study stimuli', 'count': 4, 'license': 'No license assigned in OSF metadata; raw recordings are not redistributed', 'source_url': 'https://osf.io/4y3vh/', 'paper_url': 'https://www.nature.com/articles/s41598-022-20841-0', 'evidence': 'Exact stimuli from a six-minute randomized study of anxiety and related outcomes; no per-clip comfort ratings or migraine claim', 'rating_scale': None}],
            'items': items, 'summary': summarize(items)}
    for item in items:
        if not item['features']['silent']:
            assert abs(sum(item['features']['band_energy'].values()) - 1) < 1e-6
            assert abs(sum(item['spectrum']['power_share']) - 1) < 1e-6
    (args.output_dir / 'dataset-analysis.json').write_text(json.dumps(data, separators=(',', ':'), allow_nan=False))
    columns = ['id', 'collection', 'source_file', 'source_url', 'source_sha256', 'source_channels', 'source_duration_seconds', 'analyzed_seconds', 'start_seconds', 'end_seconds', 'waveform', 'frequency_index', 'envelope_code', 'duration_code', 'valence_mean', 'arousal_mean', 'valence_sd', 'arousal_sd', 'rating_n', 'centroid_hz', 'dominant_hz', 'rolloff85_hz', 'flatness', 'low_energy_share', 'mid_energy_share', 'high_energy_share', 'rms_dbfs', 'peak_dbfs']
    with (args.output_dir / 'dataset-features.csv').open('w', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for item in items:
            row = {key: item[key] for key in ['id', 'collection', 'source_file', 'source_url', 'source_sha256']}
            row.update({key: item['audio'][key] for key in ['source_channels', 'source_duration_seconds', 'analyzed_seconds']})
            row.update(item['excerpt'])
            if item['generation']:
                row.update({key: item['generation'][key] for key in ['waveform', 'frequency_index', 'envelope_code', 'duration_code']})
            if item['ratings']:
                row.update({key: item['ratings'][key] for key in ['valence_mean', 'arousal_mean', 'valence_sd', 'arousal_sd']})
            row['rating_n'] = ''
            row.update({key: item['features'][key] for key in ['centroid_hz', 'dominant_hz', 'rolloff85_hz', 'flatness', 'rms_dbfs', 'peak_dbfs']})
            row.update({band + '_energy_share': value for band, value in item['features']['band_energy'].items()})
            writer.writerow(row)
    if not args.skip_figures:
        write_figures(data, args.output_dir)
    print(json.dumps({'count': len(items), 'emosynth': len(labels), 'study_recordings': 4, 'validation': validation, 'summary': data['summary']}, indent=2))


if __name__ == '__main__':
    main()
