# Song DNA: 18 Kishore Kumar songs, measured end to end

This report covers 20 Kishore Kumar recordings: 18 full-length originals form the profile, plus a DJ remix and a short excerpt analysed separately. It sets out what the songs share, what they don't, and what we can and can't conclude. The evidence behind every interpretation is in [song-dna-research.md](song-dna-research.md): a fact-checked brief built from peer-reviewed and primary sources.

## Short answer

**It is not a frequency.**
- The songs' home notes fall on 9 of the 12 notes of the octave.
- Eleven of 18 are tuned 20 or more cents away from A = 440 Hz, in both directions (−46 to +44 cents). This might come from tape or transfer speed, or from instrument tuning; that isn't verified for these recordings.
- Only 3 sit within 10 cents of "432 Hz" tuning, about what chance would give (3.6 expected if tunings were spread evenly).

Many people do remember the exact pitch of recordings they know well (Levitin 1994; Frieler et al. 2013). The originals may therefore feel "right" because of memory, not because the brain is built to prefer one frequency.

**What they share is a harmonic vocabulary and an era's sound:**
- **Moderate, steady tempos.** Median 118 BPM; the middle half run 109–125 BPM. These are not slow songs.
- **An even split of major and minor keys.** 9 and 9, across 15 keys, with clear modes within each song. Major-key songs lean on the major third (♭3:3 ratio 0.34–0.63, one at 0.91), and minor-key songs on the minor third (1.11–2.55). That is in line with the about-half Bilawal (major) and Asavari (natural minor) split reported for Hindi film hits (Choudhury et al., ISMIR 2013).
- **Your G chord travels furthest.** Of your four triads (Am, G, F, E), the ♭VII chord (G when A is home) is the most shared. It swings with the home chord in both minor songs (i ↔ ♭VII in 4) and major songs (I ↔ ♭VII in 4–5). The home chord ↔ V swing is the most common move overall (7 songs).
- **The Andalusian walk is an occasional colour, not a formula.** On the song's own home chord (i → ♭VII → ♭VI, Am → G → F with A as home), it appears in 3 songs: Chalte Chalte, Dilbar Mere Kab Tak and Saagar Kinare. The full walk to V (Am → G → F → E) appears in 1, Dilbar Mere Kab Tak. The same shape (a minor chord, then two major chords each a whole step lower) appears somewhere in 10 songs, but mostly on other degrees, such as vi → V → IV in a major key. Songs that have it use it 1–3 times.
- **Busy but simple harmony.** About 24 chord changes per minute, 8–9 main chords per song, and about 45% of ~4-second passages recur later.
- **A near-mono sound.** Median stereo correlation is 0.98. These files also have a high peak-to-average ratio (median crest 15 dB), but that reflects whichever master or transfer was downloaded, not the era: one 320 kbps file measured −5 LUFS, against a median of −14.

No dataset here can explain why these songs became hits. All 18 are famous and there is no comparison set of non-hits. Large studies find that audio features predict popularity poorly (Pachet & Roy 2008; Interiano et al. 2018).

## The songs

| Group | Songs |
| --- | --- |
| Profile (18) | Aa Chal Ke Tujhe, Chalte Chalte Mere Yeh Geet, Chehra Hai Ya Chaand Khila, Choo Kar Mere Man Ko, Dil Kya Kare Jab, Dilbar Mere Kab Tak, Dream Girl, Ek Ajnabee Haseena Se, Ek Ladki Bheegi Bheegi Si, Kitne Bhi Tu Karle Sitam, Mera Jeevan Kora Kagaz, Mere Sapnon Ki Rani, O Mere Dil Ke Chain, Saagar Kinare, Yeh Shaam Mastani, Roop Tera Mastana, Bachna Ae Haseeno, Pyar Diwana Hota Hai |
| Flagged, analysed separately | Hamen Tumse Pyar Kitna (a DJ remix, not the original recording); Yeh Dosti Hum Nahin (sad version), a 1:53 excerpt at 32 kHz / 40 kb/s |

Each profile file was decoded in full (3.6–6.7 minutes). Audio stays on the owner's machine. The repository holds only derived summary numbers in [dist/data/song-dna/kishore-kumar.json](../dist/data/song-dna/kishore-kumar.json): no audio, lyrics, melodies, chord timelines or section order. Source files are identified by a hash of their file name, not the name.

## Method

One analyser, [dist/song-dna.js](../dist/song-dna.js), runs both in Node (to build the profile) and in the browser (to compare a song), so the numbers are directly comparable.

- **Input.** Full song, stereo, 22.05 kHz; 4096-point STFT with a 1024-sample hop.
- **Tuning.** Magnitude-weighted circular mean of interpolated spectral peaks (80–2000 Hz), in cents from A440.
- **Chroma.** 98–2100 Hz, tuned. Each frame's median noise floor is subtracted, and every pitch class is normalised by the bin weight that feeds it.
- **Key.** Krumhansl–Kessler profile correlation, plus chord-function evidence: tonic, a major V and subdominant roles. The second step separates relative keys that pitch profiles confuse.
- **Chords.** 24 major and minor triads plus no-chord, on ~0.37 s windows, smoothed with an HMM (Viterbi). Labels are triads only.
- **Progressions.** Roman numerals relative to the key; 2-, 3- and 4-chord n-grams. The Andalusian cadence is detected without relying on the key (minor X → major X−2 → major X−4 → major X−5).
- **Tempo.** Autocorrelation of onset flux with a 110 BPM prior.
- **Loudness.** ITU-R BS.1770 K-weighting with gating; loudness range per EBU Tech 3342; crest factor.
- **Spectrum.** Third-octave long-term average, tilt from 100 Hz to 5 kHz, centroid, and share of energy in the 1–4 kHz presence band.
- **Stereo and repetition.** L/R correlation and side/mid ratio; repetition is the share of ~4.5 s chroma passages that recur at least 10 s away.

Rebuild:

```sh
node analysis/build_song_dna.mjs --dir ~/Desktop/songs/Kishore_Kumar --artist "Kishore Kumar" \
  --out dist/data/song-dna/kishore-kumar.json --exclude "DJ_"
.venv/bin/python -I analysis/song_dna_crosscheck.py --dir ~/Desktop/songs/Kishore_Kumar \
  --dna dist/data/song-dna/kishore-kumar.json --out data/song-dna/kishore-kumar-crosscheck.json
node analysis/compare_songs.mjs dist/data/song-dna/kishore-kumar.json path/to/other/songs/*.mp3
```

Adding an artist means running the same build with another folder. The page currently loads Kishore Kumar only; the data format already supports more artists.

## Validation

1. **Synthetic songs with known answers** ([tests/song-dna.test.mjs](../tests/song-dna.test.mjs)). These cover an Andalusian song in A minor tuned +18 cents, a I–V–vi–IV song in D, a −35-cent detuned song, and two songs with a broadband noise floor.
   - Keys correct.
   - Tuning within 1–3 cents.
   - Tempo within 1 BPM.
   - Chord accuracy 100%.
   - Sketches from the style-sketch generator are analysed back into 83–94% of their chords, and their melodies stay in key in every tested key.
2. **A bug found by real recordings.** The first version read 9 of 18 songs as A minor. Noise floors had pushed extra energy into pitch classes covered by one more octave at the edges of the range. The fix subtracts each frame's noise floor and normalises bin weights per pitch class. A regression test now fails on the old code: a noisy F# minor song was read as E, with the raw key profile saying A minor.
3. **Independent cross-check with librosa** (different algorithms; [data/song-dna/kishore-kumar-crosscheck.json](../data/song-dna/kishore-kumar-crosscheck.json)).
   - **Tuning:** mean absolute difference 3.4 cents.
   - **Tempo:** agrees on 17 of 20 songs (1 octave error, 2 different).
   - **Key:** agrees on 13 of 20. Of the 7 disagreements, 4 are a fifth apart and 2 are relative major/minor; only 1 is unrelated. Agreement between two estimators is not accuracy: neither is ground truth. State-of-the-art trained models reach about 68–80% exact accuracy on pop, with errors clustering on fifths and relative keys (Korzeniowski & Widmer 2018). Template methods on old film recordings are expected to do worse, so read key letters loosely until a musician checks a sample.
4. **Comparisons** ([data/song-dna/kishore-kumar-comparisons.json](../data/song-dna/kishore-kumar-comparisons.json)):

| Audio | Closeness to the profile |
| --- | --- |
| Each profile song against the other 17 | median 73% (52–87%) |
| The DJ remix (same song) | 74% |
| The low-quality 1:53 excerpt | 62% |
| Three ambient/binaural reference excerpts | 24–40% |
| Two generated sketches (Am–G–F–E and I–V–vi–IV) | 43–49% |

Closeness is half 13 measured features (tempo, loudness, brightness, chord density, repetition and more; tuning is shown but not scored, because it wraps around and reflects the recording) and half harmony (scale-note use compared with same-mode songs, and chord roles). So a song with the same chords but modern production can score lowish. A real contrast set, such as modern Hindi film songs, Western pop and other singers of the era, is the next test.

## Product: Song DNA page

[dist/songs.html](../dist/songs.html) does four things:
1. Shows the profile: home notes and tuning, key and mode, chord roles, scale-note use, your Andalusian triads and typical ranges.
2. Compares any song you own, in the browser and without uploading it, and shows its chord timeline (never stored).
3. Makes **style sketches**. These are original instrumentals in Keherwa or Dadra feel with pad, santoor-like or harmonium-like textures. They use only common building blocks: key, tempo and generic chord progressions. The melody is a seeded random walk over chord tones; no song's melody, lyrics or recording is used.
4. Learns taste from your ratings ("Calming / Neutral / Not for me"), stored on this device.

All playback goes through Still's safety chain and follows the comfort profile's current state (quieter during an attack).

## Next steps

- Add other artists (Rafi, R.D. Burman, Asha Bhosle, Lata Mangeshkar) with the same build script, plus a contrast set.
- Feed sketch ratings into the comfort profile's preference learner (progression × tempo × texture × feel).
- Add a roughness measure. Roughness is the cue most consistently linked to unpleasantness across cultures (Athanasopoulos 2021; Milne et al. 2023).
- Have a musician check the keys and chords of a few songs to measure real accuracy on this repertoire.
- Get legal review covering India and the US before any public or commercial launch. The recordings' rights mostly belong to labels such as Saregama.
