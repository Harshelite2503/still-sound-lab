# Still — find sounds that feel comforting

Still helps you explore comforting sounds and frequency zones. Bring a sound you like, explore its frequencies, try a generated sound, and save how it felt.

[Open the private app](https://comfort-sound-lab-harsh-nov26.harshelite-gupta.chatgpt.site) · [Explore the graphs](https://comfort-sound-lab-harsh-nov26.harshelite-gupta.chatgpt.site/graphs.html)

**No paid API or API key is needed.** Audio processing and sound generation run in your browser.

## What is a “sweet frequency zone”?

A zone means a **range of frequencies**. A personal sweet zone would be a range you repeatedly rate as comforting under similar conditions. An audio file alone cannot reveal a universal best range.

Two different numbers matter for stereo tones:

| Measurement | Meaning | Example from our first reference clip |
| --- | --- | --- |
| Sound frequency | The tone sent to each ear | About 82.5 Hz left and 82 Hz right |
| Beat difference | The gap between those tones | 0.5 Hz |

The clip also contains tones near 171.5 and 168.5 Hz, a 3 Hz difference. These are **measured sound components**, not proven comfort zones or brain measurements. The current controls cover 100–600 Hz tones and 0–12 Hz differences in 1 Hz steps, so they cannot recreate the ~82 Hz pair or its 0.5 Hz spacing.

The personal map groups stereo sessions into 50 Hz sound-frequency bands and 1 Hz beat-difference bands, with zero kept separate. Cells show ratings and counts; untested cells stay empty. Grouping widths are display choices, not medical categories.

## How it works

1. **Bring a sound.** Try the demo, choose an audio file, or record up to 10 seconds of humming or nearby audio. Files can be up to 20 MB and two minutes; analysis uses the first 30 seconds.
2. **Measure it.** A Fourier transform splits the sound into frequency components. The app measures prominent tones, brightness, texture, and low/mid/high energy. A spectrogram shows how frequencies change over time.
3. **Try a sound sketch.** Simple rules create three options: warm harmonic tones, rainlike filtered noise, and separate left/right tones. These are procedural sounds, not AI-generated songs or Shazam matches. Stereo headphones are needed for the binaural experiment.
4. **Save your response.** Choose uncomfortable, neutral, or comforting, alongside your mood and environment. Start quietly; nothing autoplays.
5. **Compare your observations.** The graphs show patterns in your saved ratings. Suggestions are reordered using an acoustic score plus `0.65 × average comfort rating` for that sound type in the same mood/environment. This currently learns a preference for a **sound type**, not an optimal frequency zone.

## How it is built

- **Website:** plain HTML, CSS, and JavaScript; no framework or build step.
- **Audio:** the browser's Web Audio API, a JavaScript Fourier transform, and local sound synthesis.
- **Graphs:** Canvas charts, measured JSON data, and your local ratings.
- **Reference analysis:** Python, NumPy, Matplotlib, FFmpeg, and yt-dlp for three 30-second source excerpts.
- **Storage:** browser `localStorage` for explicitly saved check-ins. Audio stays in memory; audio, notes, and ratings are not uploaded by the app.

The private hosted version uses ChatGPT sign-in. Personal listening logs are not included in this repository.

## Run it locally

From the repository folder, with Python 3 installed:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open [localhost:4173](http://127.0.0.1:4173). Microphone access needs localhost or HTTPS. Run `npm test` with Node.js installed. No JavaScript dependencies are needed.

## Where things live

| Folder | Contents |
| --- | --- |
| [dist/](dist/) | Complete website and audio engine |
| [analysis/](analysis/) | Scripts that reproduce the measurements and figures |
| [samples/](samples/) / [data/](data/) | Reference excerpts, measurements, and sampled public comments |
| [figures/](figures/) | PDF, PNG, SVG, CSV, and JSON exports |
| [tests/](tests/) | Audio and feedback-map checks |

See [methods](docs/methods.md) and [prototype details](docs/prototype-notes.md) for research and technical explanations. Comments generate hypotheses, not evidence of effectiveness. Source material belongs to its creators. This prototype explores comfort, not migraine treatment effects.
