# Measurement and interpretation

These figures describe the source audio. No EEG, neural response, patient outcome, or treatment effect was measured.

## Sources and intervals

Retrieved on 4 November 2026 with yt-dlp 2026.10.26:

| Recording | URL | Requested excerpt |
| --- | --- | --- |
| Migraine/binaural reference | https://www.youtube.com/watch?v=fyGmSFUPo8o | 32:48–33:18 |
| Handpan reference | https://www.youtube.com/watch?v=Ttaf1IYt6F4 | 01:00–01:30 |
| Singing-bowl reference | https://www.youtube.com/watch?v=6Kj-ye-aYBA | 01:00–01:30 |

All three are stereo AAC excerpts decoded locally to 44.1 kHz PCM. The analysis is limited to these 30-second samples. Encoding and requested cut boundaries limit precision; results should not be extrapolated to the whole recordings.

## Reproduce the measurements and figures

Run from the repository root. Python 3.13 was used for the supplied exports:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r analysis/requirements.txt
.venv/bin/python analysis/analyze_references.py
.venv/bin/python analysis/build_graphs.py --audio-dir samples --output-dir figures
```

The three bounded excerpts are already in `samples/`. To retrieve them again, run `.venv/bin/python analysis/fetch_references.py`; this needs internet access and source availability. A later comment retrieval may return different comments.

After rebuilding, copy `figures/chart-data.json` to `dist/data/chart-data.json`, `figures/reference-audio-overview.pdf` to `dist/downloads/reference-overview.pdf`, and `figures/stereo-tone-pairs.pdf` to `dist/downloads/stereo-tone-pairs.pdf` to update the website.

## Plots

The mean spectra use Hann-windowed, overlapping FFT power estimates. Both channels use the same per-recording reference for relative dB, preserving inter-channel differences. Upper-frequency display bins are pooled for a compact interactive file; detailed low-frequency bins and CSVs are retained. Spectrograms use shorter windows to reveal changes over time. The chart JSON records the actual FFT settings, frame axes, normalization and floors used.

The first recording's pair close-ups use the entire excerpt's Hann-windowed spectrum to distinguish the approximately 0.5 Hz pair. Full-record bin spacing is about 0.0333 Hz; interpolated estimates are not equivalent to calibrated accuracy. Independent band-specific tracking checks that switching strongest peaks is not mistaken for a changing beat.

Relative spectral dB, digital dBFS, and physical headphone dB SPL are different quantities. The graphs cannot determine a safe or comfortable listening level at a person's ear. Per-recording normalization also prevents using spectral peak heights to compare absolute levels between recordings; the RMS plot reports digital level separately.

## Personal observations

Comfort ratings are ordinal: uncomfortable −1, neutral 0, comforting +1. Means are used only as an exploratory display. Each map cell includes a count and can show raw category totals. Carrier bands are 50 Hz wide; beat-difference bands are 1 Hz wide, with zero kept separate. These are arbitrary display groups, not therapeutic intervals.

Only explicit stereo-tone check-ins with valid settings and a positive logged listening duration enter the map. Known app-muted and malformed records are excluded. New sessions record whether app gain was ever above zero during playback, and freeze the stop volume. Legacy exports without this history are retained with unknown audibility. Other sound types remain in the type summary. Duplicate exported records are merged by timestamp, sound type and settings. Import only the same person's records; the prototype does not implement cohort analysis.

No interpolation, smoothing, prediction, confidence region, or population optimum is drawn. A missing observation is different from a neutral response. Context filters cannot eliminate confounding from volume, sensitivity, duration, expectations, medication or natural symptom change.

## Why this is not a brain-frequency map

A systematic review of 14 EEG studies found inconsistent support for binaural-beat entrainment. Even evidence of entrainment would be separate from evidence of comfort or migraine relief. See Ingendoh et al. (2023): https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0286023 .

Before investigating a clinical effect, use a prespecified, clinician-supported study with repeated within-person comparisons, suitable controls, consent and appropriate research review. The research pages describe a possible design; this app does not implement that trial.
