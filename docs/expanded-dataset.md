# Expanded sound dataset

This expansion adds human-rated synthetic sounds and exact study recordings to the original three YouTube references. It is a research dataset, not a list of verified migraine treatments.

## What was added

| Collection | Included material | What its evidence means |
| --- | --- | --- |
| EmoSynth, corrected Zenodo release | 168 complete WAVs, aggregate emotion labels, measured features | Perceived valence and arousal; no comfort, pain or migraine outcome |
| Stobbe et al. birdsong experiment | Measurements of 60–90 seconds from each of four exact study recordings | The full six-minute conditions were studied for short-term psychological outcomes; the excerpts were not independently tested |

EmoSynth contains sine, square and sawtooth sounds, two envelope codes, two duration codes and 14 frequency indices. The original article and repository description say 144 sounds and 12 frequencies. The corrected archive contains 168 matching audio/label pairs. We retain this discrepancy and measure pitch from the audio instead of applying the old frequency lookup table.

The original study reports 40 annotators. The released labels contain sound-level means and rounded standard deviations on 1–5 scales: valence runs from negative to positive, arousal from weak to strong. The number of contributing listeners for each sound is not supplied. An emotional judgment is not automatically a liking or comfort judgment.

## How the analysis works

Audio is decoded at 44.1 kHz with source channels retained. Hann-windowed Fourier power estimates are averaged across overlapping windows. Channels are combined after calculating power, so opposite-phase stereo does not cancel. Features cover 20–22,050 Hz and include power centroid, 85% roll-off, spectral flatness, band-energy shares and digital RMS/peak levels. These are not calibrated headphone loudness measurements.

The displayed spectrum contains 160 logarithmic bins. Each bin sums its frequency energy; its dB value is relative to the highest-energy bin in that recording. Wider bins cover more frequencies, so this is not power density per Hz. All measurements precede any playback normalization.

For known synthetic tones, an interpolated peak from the full-clip spectrum estimates the dominant tone. It is not a general fundamental-frequency or binaural-beat detector. The frequency chart groups sounds by the source frequency index, gives each sound-level rating mean equal weight, and shows the range across waveform/envelope/duration variants. That range is not a confidence interval. Correlations and rating quartiles use EmoSynth only; study recordings and personal check-ins are never pooled into them.

All downloaded study files are checked against their source SHA-256 hashes. The EmoSynth archive is checked against Zenodo's MD5 and ZIP integrity information. Synthetic checks cover a known tone, opposite-phase stereo, silence, energy normalization and tied ranks. Output JSON rejects non-finite numbers.

## Reproduce

Install the existing `analysis/requirements.txt` in an isolated Python environment, then fetch verified sources into an untracked working directory:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r analysis/requirements.txt
.venv/bin/python analysis/fetch_expanded_sources.py --output-dir work/source-downloads --birdsong-manifest data/expanded-sources/birdsong-manifest.json
.venv/bin/python analysis/analyze_dataset.py --emosynth-dir work/source-downloads/emosynth/emoSynth-DB --birdsong-dir work/source-downloads/birdsong --output-dir figures/expanded
.venv/bin/python analysis/analyze_dataset.py --self-test
```

The complete EmoSynth files are also retained in `samples/emosynth/emoSynth-DB/`. Raw birdsong/traffic MP3s are not committed or hosted. Fetching sources needs internet access and their continued availability; analysis itself uses no network or paid API.

## Attribution and reuse

EmoSynth: Baird, A., Parada-Cabaleiro, E., Fraser, C., Hantke, S., and Schuller, B. (2018), *The Perceived Emotion of Isolated Synthetic Audio: The EmoSynth Dataset and Results*, Audio Mostly. [Paper](https://doi.org/10.1145/3243274.3243277), [corrected dataset](https://zenodo.org/records/3727593), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source WAVs and aggregate labels are unchanged; charts, features and grouping analyses are our derivatives.

Stobbe et al. (2022): [paper](https://www.nature.com/articles/s41598-022-20841-0), [exact study stimuli](https://osf.io/4y3vh/). The public OSF node does not assign an audio reuse license. An article's open-access license does not automatically license its stimulus recordings. We retain local research copies and publish measurements, attribution and links.

`data/expanded-sources/` records provenance, checksums, the version discrepancy and a concise evidence table. Participant-level data are not included. The clinical evidence is mixed and does not validate a universal frequency zone or this app's generated sounds.
