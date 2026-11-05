# Still — find sounds that feel comforting

Still helps you explore comforting sounds and frequency zones. Bring a sound you like, explore its frequencies, try a generated sound, and save how it felt.

[Open the private app](https://comfort-sound-lab-harsh-nov26.harshelite-gupta.chatgpt.site) · [Explore the graphs](https://comfort-sound-lab-harsh-nov26.harshelite-gupta.chatgpt.site/graphs.html)

**New: [sound dataset explorer](https://comfort-sound-lab-harsh-nov26.harshelite-gupta.chatgpt.site/library.html).** Compare 168 human-rated synthetic sounds and four birdsong/traffic study recordings. See frequency-group ratings, individual spectra and source evidence. Emotion ratings and study outcomes stay separate; these are not verified migraine-relief tracks. See [dataset methods and reproduction steps](docs/expanded-dataset.md).

**No paid API or API key is needed.** Audio processing and sound generation run in your browser.

## Your comfort profile (new)

People differ. The same sound can be calming to one person and painful to another, and the same person reacts differently from one day to the next. Across 168 simple synthetic sounds in the EmoSynth dataset, listeners' pleasantness ratings had an average standard deviation of 1.2 on a 1–5 scale. The [comfort profile](dist/profile.html) learns each person's own comfort instead of assuming one "healing" sound:

1. **Four questions.** Sudden, hissy, rumbling and pulsing sounds. The answers pick a gentle first sound and longer fades. They are not a diagnosis.
2. **A quiet reference.** You set your device volume against a soft hush. All later levels are relative to it, because a browser cannot measure loudness at your ears.
3. **Headphone check (optional).** A Huggins-pitch test (Milne et al., 2021) confirms headphones before stereo experiments.
4. **Comfort contour.** Press and hold for each of seven bands (125 Hz–8 kHz). The sound rises slowly from very quiet, stops when you let go, and never passes a safe cap. Bands you mark lower are turned down in every sound, by at most 12 dB.
5. **Find your comfort sound.** Six-second A/B pairs at matched loudness: "which felt calmer?". A Gaussian-process preference model learns across four dimensions: darkness (spectral tilt), noise versus hum, slow swell, and softness of the top end. Each new pair is chosen where the model expects to learn most.
6. **Your sound fingerprint.** A plain-language summary and a seamless loop of your comfort sound, with a sleep timer and a "this is making it worse" button.

A state selector, named by how sensitive to sound you feel (calm, sensitive, very sensitive, recovering), adjusts playback across Still. When you feel very sensitive, the screen dims, only play and fade-to-silence remain, sounds play 14 dB quieter with a softer top end, and binaural sketches are hidden. States are deliberately not named after migraine phases: under FDA's 2026 wellness guidance, features tied to a disease can make an app a medical device. The offsets are cautious starting points drawn from group studies, not measurements of you.

The [research page](dist/research.html#profile-evidence) lists the evidence behind each design choice. [docs/product-strategy.md](docs/product-strategy.md) is the full fact-checked strategy and roadmap, including myths to avoid. Its claims were checked against original sources by an independent review pass.

## Song DNA (new)

Do your favourite songs share something your brain likes? [Song DNA](dist/songs.html) measures full-length songs (key, chords, tempo, tuning, loudness, stereo, repetition) with one analyser that runs in Node and in the browser. It then lets you compare any song you own, or make an original style sketch from the same building blocks.

First profile: 20 full-length Kishore Kumar songs from official label uploads; 18 were checked against a second copy of the same recording ([report](docs/song-dna.md), [evidence](docs/song-dna-research.md)).
- **No special frequency.** Home notes fall on 9 of the 12 notes. Even the same recording's tuning differs between copies, by up to about 50 cents.
- **Shared vocabulary.** A 10/10 major/minor split. The ♭VII chord (G with A as home) fills more than 3% of chord time in 13 of 20 songs. The Andalusian walk (Am → G → F → E) on the home chord appears in only 1.
- **An era's sound.** Moderate tempos around 118 BPM, and mono-like transfers.

- **Your sound zone.** Together the songs keep their energy even from 159 Hz to 2.5 kHz, and half of their tonal energy lies between F♯3 and A4 ([charts](figures/song-dna/)). Style sketches can be matched to this zone, and **Make one for me** learns from your ratings which progressions, textures and feels calm you.

- **Song vector index.** Every song is a 78-dimensional vector you can search by similarity. Given another copy of one of the 20 songs, it ranks that song first 94% of the time, against 83% for matching key and tempo and 5% by chance. Whether its neighbours sound alike to listeners hasn't been tested yet. It does not predict hits.

Only derived numbers and aggregate charts are stored, never audio, melodies, chord timelines or per-song spectrograms.

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
| [dist/](dist/) | Complete website, audio engine, comfort engine (`comfort-engine.js`) and preference learner (`preference-model.js`) |
| [analysis/](analysis/) | Scripts that reproduce the measurements and figures |
| [samples/](samples/) / [data/](data/) | Reference excerpts, measurements, and sampled public comments |
| [figures/](figures/) | PDF, PNG, SVG, CSV, and JSON exports |
| [tests/](tests/) | Audio, feedback-map, comfort engine, preference learner, Song DNA and claims-linter checks |

See [methods](docs/methods.md) and [prototype details](docs/prototype-notes.md) for research and technical explanations. Comments generate hypotheses, not evidence of effectiveness. Source material belongs to its creators. This prototype explores comfort, not migraine treatment effects.
