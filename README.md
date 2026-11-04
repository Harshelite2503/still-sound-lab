# Still — personal sound lab

A private, research-informed prototype for exploring comforting sound. It combines a local audio analyzer and sound generator with measured reference recordings, interactive graphs, and a personal feedback notebook.

**Live private prototype:** https://comfort-sound-lab-harsh-nov26.harshelite-gupta.chatgpt.site  
**Interactive graphs:** https://comfort-sound-lab-harsh-nov26.harshelite-gupta.chatgpt.site/graphs.html

The app uses no paid AI API, API key, or neural music model. Its browser code performs the audio work locally. ChatGPT sign-in gates access to the hosted site.

## What the graphs mean

- **Frequency spectra:** frequency energy in the left and right channels, including a low-frequency close-up. A spectral peak is a component of a sound, not a measurement of brain activity.
- **Spectrograms:** how that energy changes during each measured 30-second excerpt.
- **RMS envelopes:** digital signal level over time, in dBFS; these are not calibrated sound-pressure levels at the ear.
- **Stereo pair close-ups:** the first reference has approximately 171.5/168.5 Hz and 82.5/82.0 Hz ear-separated tones. Their differences are about 3.0 and 0.5 Hz. These measurements do not establish pain relief or entrainment.
- **Personal comfort map:** observed ratings from the listener's own Still notebook. Untested combinations remain empty; cells show raw counts and means, with context filters. No simulated outcomes, smoothing, or population optimum is inserted.

We do not have EEG measurements, a verified population response dataset, or a clinical trial. A universal “brain sweet spot” cannot be inferred from these recordings or YouTube comments. The testable product hypothesis is that acoustic features plus the person's feedback and current context can improve comfort recommendations.

## Run locally

No JavaScript dependency installation is needed. From the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:4173 and choose **Try a demo**, an audio clip, or a short microphone recording. Open `/graphs.html` to explore the measured references. Localhost or HTTPS is needed for microphone permissions. A direct `file://` launch may block modules or data loading.

The original app analyzes the first 30 seconds of files no longer than two minutes and no larger than 20 MB. Sound generation is procedural: harmonic tones, filtered noise, or stereo carrier tones. Its 6 Hz default is an illustrative setting, not a medical prescription. No sound starts automatically.

## Reproduce the analysis and figures

Python 3.13 was used for the supplied exports. Create an isolated environment:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r analysis/requirements.txt
.venv/bin/python analysis/analyze_references.py
.venv/bin/python analysis/build_graphs.py --audio-dir samples --output-dir figures
```

The three bounded source excerpts are in `samples/`. `analysis/fetch_references.py` can retrieve them again with yt-dlp; retrieval requires internet access and source availability. Re-running a comment sample later may return a different set of comments.

After rebuilding, copy `figures/chart-data.json` to `dist/data/chart-data.json` and the figure PDFs to `dist/downloads/` to update the website's graphs and downloads. The exact processing choices and normalization are recorded in the chart data and `docs/methods.md`.

## Checks

```sh
npm test
```

DSP checks exercise stereo carrier recovery, anti-phase preservation, silence, synthesis bounds, WAV encoding, zero-beat equality, and analysis duration limits. Comfort-map tests exercise malformed/known-app-muted record rejection, deduplication, context filtering, boundary bins, and the distinction between an unobserved cell and a neutral observation. The graph builder includes numerical and synthetic-signal checks.

## Repository contents

| Path | Contents |
| --- | --- |
| `dist/` | Complete buildless website and interactive graphs |
| `analysis/` | Reproducible decoding, spectral analysis, figure generation, and retrieval scripts |
| `samples/` | Three attributed 30-second YouTube audio excerpts |
| `data/` | Measurements, public metadata, qualitative findings, and author-profile-free public comment sample |
| `figures/` | PNG/SVG/PDF scientific figures, plotted CSVs, and chart JSON |
| `docs/` | Methods, source provenance, and study boundaries |
| `tests/` | Signal-processing and personal-feedback tests |

## Data boundaries

The comment sample contains 100 top and 100 recent top-level rows per source: 600 rows, 557 distinct comment IDs. Comment IDs are not verified unique people; repeated text, promotional posts, selection bias, and unverified outcomes remain. The qualitative review records hypotheses and counterexamples, not treatment labels or a success rate. Public comment text may contain personal disclosures, so this repository should remain private.

Personal listening ratings and notes are saved only in the user's browser when they choose Save. The graph page can read that local notebook or import the user's JSON export into page memory. Those personal records are not in this repository and are never uploaded by the app. Credentials, signed download URLs, runtime logs, temporary environments, and the separate Sites deployment identity are also excluded.

Source recordings and comments remain attributed to their original creators. This repository does not relicense third-party material. Only derived measurements and paraphrased findings are hosted on the private site.

Comfort, pain relief, brain response, and migraine prevention are different outcomes. This prototype explores comfort alongside usual care; it makes no treatment claim.
