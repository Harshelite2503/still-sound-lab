# Still — personal sound lab

A browser-local proof of concept for the hypothesis that acoustic features, personal comfort feedback, and current context can help propose more comfortable audio. It does not diagnose, prevent, or treat migraine.

## Run

No package installation is required. With Python 3 installed, run from this folder:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:4173 in a current browser. Use localhost or HTTPS for microphone access. Directly opening index.html as a file may block ES modules or the microphone.

## Try it

1. Choose **Try a demo**, import an owned audio clip (20 MB / 2 minutes maximum), or record up to 10 seconds. Only the first 30 seconds are analyzed. Nothing autoplays.
2. Inspect the acoustic profile and spectrogram. Choose a sound sketch.
3. Set a low device volume; the app starts at 15% of its own gain. Play, stop, and adjust. The binaural recipe has distinct left/right carriers; stereo headphones are needed. Set beat difference to zero for the otherwise matching same-tone version. This comparison is not blinded or randomized.
4. Optionally select pain before playback, then record comfort and pain afterward. Playback snapshots the before value and context. Save explicitly to retain the check-in on this browser.
5. Export WAV at the current preview gain or export observations as JSON. Device/player volume still affects actual listening level. Silence and stopping early are valid choices.

## Implemented

- Local audio decoding, microphone capture, and a built-in original demo.
- 4096-sample Hann-window FFT, up to 120 sampled time frames, per-channel power averaging, relative log-frequency spectrogram, strongest spectral peak, centroid, flatness, band energy and per-channel peaks. These are descriptive features, not calibrated dB SPL or medical measurements.
- Three rule-based recipes: harmonic tone, filtered noise, and stereo carrier tones. The arbitrary example beat is 6 Hz, not a prescribed therapeutic frequency.
- A peak is octave-folded into a 120–350 Hz base-tone range where needed; it is not claimed to be a melody or the fundamental. Recipe rules are illustrative and unvalidated.
- Suggestions are ordered by a heuristic acoustic score plus 0.65 times the mean comfort rating for that sound type in the same mood/environment. Ratings are -1, 0, or +1. This is a transparent rule, not machine learning or a probability of relief. It generalizes across settings within a type and does not establish an ideal frequency.
- High sensitivity reduces harmonic/noise brightness; it does not alter the pure stereo recipe. Context changes do not promise a mood effect.
- Local-only saved observations (most recent 200), explicit export and clear, dim mode, stop controls, fade-in/out, no autoplay, no external scripts or analytics in app code.

## Deliberately outside this POC

No Shazam-style catalog identification, melody lookup from humming, streaming music catalog, YouTube downloading, neural music generation, trained recommendation model, accounts, cross-device sync, randomized clinical protocol, or therapeutic-frequency detector. A follow-up retrieved three 30-second stereo excerpts and reviewed 600 comment rows (557 distinct IDs). The new reference-study.html reports the measured results. Original YouTube audio and raw comments are not hosted by the app. Microphone recordings do not preserve headphone channel separation.

The research page includes references, study limitations, a product architecture, and a proposed within-person experiment. Comments may inform interviews and hypotheses, not treatment labels.

## Privacy

Application audio stays in browser memory. The app does not transmit audio, notes, or ratings. Saved check-ins include context, settings, duration, optional pain values/notes and three reference descriptors, not raw audio or file names. Explicit Save writes to localStorage; other people using the same browser profile can see these records. Clear removes these browser records, not exported files. The private hosting service separately handles access and ordinary HTTP requests.

## Verification and limits

```sh
node tests/audio-engine.test.mjs
node --check dist/app.js
```

DSP checks cover stereo 220/226 Hz recovery (approximately 220.10/225.99 Hz), anti-phase preservation, silence, octave folding, invalid peak input, bounded synthesis, WAV structure, zero-beat equality, and a 30-second analysis cap. Browser checks covered demo analysis, stereo selection, zero-beat controls, muted playback state, stopping, and saving a synthetic neutral check-in. Acoustic comfort and audible quality were not clinically assessed. Microphone access and user-file ingestion still require testing on the intended device/browser; permission handling and duration limits were code-reviewed. Mobile-width layout was visually inspected; broader device testing remains future work.

## Files

- `dist/index.html`, `dist/style.css`, `dist/app.js`: interface and local feedback loop.
- `dist/audio-engine.js`: audio analysis, synthesis and WAV encoding.
- `dist/research.html`: evidence and experiment notes, checked 4 November 2026.
- `dist/reference-study.html`: local measurements of the three reference excerpts and a qualitative comment review.
- `tests/audio-engine.test.mjs`: signal-processing checks.

This prototype is for comfort exploration alongside usual care. Stop if audio worsens symptoms. A clinician/research partner is needed before testing or making migraine-treatment claims.

## Interactive graphs

Open `graphs.html` for measured left/right spectra, logarithmic or low-frequency views, time-frequency spectrograms, RMS envelopes, and the two detailed stereo tone pairs. PDF downloads and raw plotted measurements are linked on that page. Spectral curves above 650 Hz pool frequency bins; all units and normalization are labeled.

The personal comfort map reads this browser’s notebook or imports a Still JSON export into page memory. It shows observed category counts and means, never an inferred brain optimum. Untested cells are hatched. New playback logs record whether app gain was nonzero at any point; known app-muted sessions are excluded. Legacy exports without that history are retained with unknown audibility.

The complete private research repository includes scripts, samples, comment data and figure exports: https://github.com/Harshelite2503/still-sound-lab .
