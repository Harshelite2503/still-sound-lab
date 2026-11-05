# Still for Video

**Status:** prototype, November 2026. Page: `dist/video.html`.
**Product hypothesis:** people whose sound sensitivity (migraine-related first) makes spoken video hard to finish can comfortably *understand* wanted content with Still, in cases where ordinary volume controls and a good preset are not enough.

The customer we are testing for:

> "I want to finish this lecture, tutorial or podcast, but the audio feels harsh. Turning it down makes the words hard to follow."

This doc covers what the prototype does, the design decisions behind it with their sources, the three-stage plan for the next 90 days, and the success criteria. The criteria are fixed in code (`analysis/video_study.mjs`) before any data exists.

## What the prototype does

| Capability | How it works | Where |
|---|---|---|
| 1. Process one selected browser tab, or a local file | Tab: `getDisplayMedia` captures the tab's audio, and `suppressLocalAudioPlayback` silences the tab's own playback so only the filtered version is heard. The required video track is kept alive at 1 frame per second, because no source says stopping it is safe for the audio. File: the page plays it through `createMediaElementSource`, so picture and sound stay together. | `dist/video-audio.js` (`captureTab`) |
| 2. "Make this gentler" | A fixed gentle preset starts immediately: an 80 Hz low cut, a −2 dB presence dip at 3.2 kHz, a −2 dB s-sound dip at 7 kHz, a −4 dB high shelf from 6 kHz and 2:1 compression, then a fixed limiter at −3 dBFS. Every band is a cut, and compression makeup never exceeds the state's level cut, so **nothing is ever louder than the original** at any frequency or level (tested from −90 to 0 dBFS). | `dist/comfort-filter.js` |
| 3. Brief tuning on actual speech | The last 6 seconds the person heard are kept in memory. That clip is rendered offline two ways and matched in loudness, so only the shaping differs. The person picks the version that is "gentler, with the words still clear", or marks one as making the words hard to follow, which rules out nearby settings. A Gaussian-process preference model picks each next pair. | `dist/video.js`, `dist/clip-tap.worklet.js` |
| 4. "More sensitive today" | Four understandable presets: calm, sensitive, very sensitive and recovering. They scale the shaping (high shelf up to −7 or −8 dB), hold peaks back more, and bring loud parts down 3 or 6 dB. Quiet words are lifted back to, never above, their original level. Every preset stays inside the speech guard. Per-state preferences are not learned yet; that waits for evidence. | `FILTER_STATES` |
| 5. Instant bypass and optional feedback | A **Hear original** button and the **B** key (which can be turned off) switch to the untouched sound with a 120 ms crossfade. The original path is delayed by the filter's 12 ms look-ahead, so switching does not comb-filter. After 45 seconds of sound actually heard, the page asks three optional questions: comfortable? words clear? anything worse? | `dist/video.js` |
| Blinded check | Unlocked after at least 5 tuning choices, and only if the person's setting differs from the preset. It uses a new moment: the clip buffer is cleared when tuning ends, and 20 more seconds must be heard first. Three versions play in a random order at the same loudness: the original turned down, the gentle preset and the person's own setting. All are rendered with identical timing and fades, so there is no click or offset cue. Each must be played before it can be rated for comfort (1–5) and clarity (1–5), with a box for "made something worse". Results are never shown on the page, so later checks stay blind. | `dist/video.js` |
| Study export (opt-in) | A study code (typed in from the study team, and kept when the record is cleared), timestamps, settings, comparison choices, ratings, seconds actually heard (and how many of those were filtered or original), device type, content type, state and the delay the browser reported. Each record covers one setting; a change of state or setting starts a new one. It holds no audio, titles, web addresses, file names or free text. | `dist/video-store.js` |

Graphs and explanations stay out of the way; the person should be listening usefully within seconds.

## Design decisions and their evidence

### Capture

- **Only desktop Chromium can capture a tab's audio.** That means Chrome since version 74, with Edge following. Firefox, Safari and Chrome on Android cannot (MDN browser-compat data; Firefox bug 1541425 is still open). The page says so to the user.
- **A page cannot ask for audio only.** `video:false` is rejected with a TypeError (W3C Screen Capture spec), so the page asks for video too. No primary source says what stopping the video track does to the audio track, so the page keeps it alive at 1 frame per second and stops both together.
- **"Share tab audio" is ticked by default** for tabs in Chrome's picker (Chromium `desktop_media_picker_views.cc`).
- **`suppressLocalAudioPlayback: true`** stops the captured tab playing locally while capture continues (Chrome 109+, spec: the browser "SHOULD stop relaying audio to the local speakers"). Where the browser reports it as unsupported, the page tells the person to mute that tab.
- **Echo cancellation, noise suppression and auto gain are turned off.** For `getDisplayMedia`, Chrome lets the browser decide these by default, and they could damage the content.
- **Copy-protected video** (most paid streaming) usually can't be captured. Chromium engineers say DRM video is not compatible with tab capture, and no primary source covers DRM audio. If the tab is silent after 6 seconds, the page says this may be the reason.
- **Alternative later:** a Chrome extension using `chrome.tabCapture` mutes the tab automatically and keeps working across navigation. In Manifest V3 it needs an offscreen document (Chrome 116+). It is the likely route for a product, but not for a first test.

### Delay and lip-sync

- No published figure exists for tab capture into Web Audio. A 2021 measurement found Chrome's default audio round trip was about 67 ms (about 19 ms tuned). The filter adds 12 ms (two 6 ms compressor look-aheads, measured with an impulse in Chrome).
- **Lip-sync limits** (positive means sound leads the picture):
  - ITU-R BT.1359-1: detectable at +45/−125 ms and acceptable at +90/−185 ms, as averages across viewers.
  - EBU R37: no more than 40 ms early or 60 ms late.
  - For understanding speech, lagging sound is tolerated up to about 160–200 ms (Grant et al., AVSP 2001).
  - Still only ever delays the sound, which is the tolerant direction.
- **Bluetooth** headphones add their own 150–350 ms in measured systems, so the page tells Bluetooth users that voices may land after lips. It shows the delay the browser reports, or says the browser doesn't report it.
- **File mode** plays the picture and filtered sound on the same page. Whether Chrome compensates for the Web Audio output delay there was not verified.

### The filter

- **Verified against the browser:** the biquad formulas in `comfort-filter.js` are the Web Audio spec's (§1.13.5; Q is in dB for high-pass and linear for peaking; shelves use S = 1). In Chrome, `getFrequencyResponse` matched them to within 0.000001 dB across every filter type used.
- **Compression:** `DynamicsCompressorNode` adds automatic makeup gain of (1/f(1))^0.6 (spec §1.19.4; Chromium uses the same 0.6 power). The chain cancels it and applies its own makeup, chosen so a typical speech level (−20 dBFS at the detector) stays where it was. In Chrome the measured static curve matched the model to within 0.3 dB from −40 to 0 dBFS. The spec's fixed 6 ms lookahead means the compressor adds 6 ms of delay.
- **Speech guard:** most speech information lies between about 1 and 4 kHz. ANSI S3.5 octave-band importance weights are 0.0617, 0.1671, 0.2373, 0.2648, 0.2142 and 0.0549 for 250 Hz to 8 kHz; the third-octave weights are in the code. Every setting must pass three rules, all relative to the 500 Hz band:
  - No single band at 1, 2 or 4 kHz may be more than 6 dB down.
  - The importance-weighted mean gain over 1–4 kHz may be at most 3 dB down (4 dB in more sensitive states).
  - The same holds for the weighted mean across 160 Hz–8 kHz.

  If a setting fails, the presence, s-sound and high-shelf cuts are scaled back together until it passes. The limits are engineering judgement built on the importance function, not published thresholds. Tests check every setting in every state.
- **Caps** follow the research:
  - Unpleasantness concentrates at 2.5–5.5 kHz combined with slow modulation (Kumar et al. 2008), so the presence dip sits at 3.2 kHz, capped at −4 dB.
  - Adults still identify about 97–99.8% of words with 4–5 kHz low-pass speech (PMC4282933), so a high shelf from 6 kHz is cheap for clarity. It is capped at −6 dB (−8 dB very sensitive).
  - /s/ peaks are at 4.2–6.9 kHz for male talkers and 6.3–8.8 kHz for female and child talkers, so the s-sound dip is static at 7 kHz and capped at −4 dB.
  - In quiet, compression ratio had little effect on intelligibility but quality fell as ratio rose (Souza 2002 review; the evidence comes from hearing-impaired listeners). The ratio is therefore capped at 3:1.
- **Level matters too:** migraine sound-aversion thresholds were about 15 dB lower than in controls, and fell about 15 dB further during attacks, evenly at 1, 4 and 8 kHz (pure tones; PMC5011402). Turning sound down may help as much as reshaping it. The blinded check tests exactly that by comparing shaping against the original turned down to the same loudness.
- **Why compression:** a 2025 study of assistive audio for neurodivergent listeners found dynamic range compression "proved the most effective" at reducing distress from trigger sounds (Popescu, Frost & Cernak, arXiv:2509.10202). Compression also brings quiet syllables up relative to loud peaks, which is the "turning it down loses the words" problem.
- **The state levels are small** (0, −3 and −6 dB). This is speech the person wants to follow, and the comfort-loop offsets (down to −14 dB) would push words below easy hearing.

### Tuning on content, not test tones

Preferences for generated comfort sounds may not carry over to a voice, so tuning uses the person's own content. Versions are loudness-matched by A-weighted level after rendering offline through the same node graph, with two passes in case the peak guard engages. Measured spread after matching was 0.000 dB. Without matching, people tend to pick the quieter version, which says nothing about the shaping. Loudness is measured over the whole clip in 8192-sample blocks. Every render is padded and trimmed by its own measured delay, so all versions start and end together.

## Competition and what must be shown

Comparable tools already exist. The edge has to be a **demonstrated benefit with less effort**, not a feature list.

| Product | What it does | Gap relative to our job |
|---|---|---|
| Mimi Sound Personalization (Chrome) | Personalizes from a hearing test or by age; about 1,000 users; last updated Aug 2024 | Tunes for hearing, not for comfort or sensitivity |
| AudioShield (hackathon project, Aug 2026) | Tab capture with seven sensitivity profiles, ML noise suppression, bypass, and an explicit aim of keeping speech clear | Not on the Web Store; no user testing yet; no tuning on the person's own speech. The closest idea to ours, so the evidence has to be the difference |
| AI Noise Cancellation For Listeners (Chrome) | Local real-time noise removal on tab audio; about 2,000 users | Removes noise, not harshness |
| Tab Tone, RedWave, Hearably, Modern Volume Booster | Speech or "vocal tamer" presets, night-mode compression, EQ | Generic presets; not aimed at sensitivity; tiny user bases |
| Misophonia Mode (Chrome) | Removes mouth noises on-device | Targets one trigger class |
| YouTube Stable volume and Voice boost, Prime Video Dialogue Boost, Windows Loudness Equalization | Platform loudness and dialogue tools | One setting for everyone, on one platform each |
| Loop, Flare Calmer | Passive earplugs for sound sensitivity | Turn everything down, words included |

**Testable claim:** for people in the target group, Still's personal setting rates as more comfortable than the original turned down to the same loudness, without a loss of clarity. It should also beat a good fixed preset; if it doesn't, the preset is the product and the AI isn't needed.

## Next 90 days: three decisions

| Period | Work | Decision |
|---|---|---|
| Days 1–15 | Interview 15–20 people who repeatedly abandon or struggle with spoken video because of sound. Observe their current workarounds on their actual content (guide below). | Is this a recurring problem, and do they want modified audio? |
| Days 16–45 | Run this prototype with 20–30 qualified users. Each does the blinded check at least twice, on their own content, on separate occasions. | Does shaping beat turning it down, with clarity kept? Does personal tuning beat the preset? |
| Days 46–90 | Measure voluntary reuse on the next relevant listening occasion, real payment and first renewals. Start the onboarding comparison if there is enough data. | Is there a paying product, and does shared learning strengthen it? |

These are product-discovery targets, not clinical efficacy thresholds.

### Success criteria (fixed before data, in `analysis/video_study.mjs`)

At least **20 participants**. For each participant, average the within-check differences, then:

- **Primary (shaping helps):** comfort, personal minus original turned down, has a mean of at least **+0.5 points** on the 1–5 scale with a 95% bootstrap CI above 0, **and** the lower CI bound of the clarity difference is above **−0.5**.
- **Secondary (personal beats preset):** comfort, personal minus preset, has a mean of at least **+0.3** with a CI above 0. If this fails, the fixed preset may be enough, and we should say so.
- **Safety signal:** at most **10%** of personal-setting ratings are marked "made something worse".
- Reported alongside: the share of real sessions rated both comfortable and clear, and return on the next relevant occasion. Return is measured per occasion, not daily, because the need is episodic.

The matched-loudness comparison isolates the shaping. It is a conservative test: in real life people can also turn the sound down further, so a later test should compare each person's preferred volume-only setting with Still at its preferred volume.

Run: `node analysis/video_study.mjs exports/*.json`. For each participant it keeps the newest export of each dataset (a cleared record or a second browser starts a new dataset under the same code) and merges them, de-duplicating sessions, rounds and checks. Real-use figures cover everyone who exported, including people who did no check. Return is reported as the share of people who came back on a later day of their own calendar (each session stores its local date), plus the median gap between listening days. That is a proxy, because the page cannot see when a relevant listening occasion happened.

### Shared learning: test it, don't assume it

Learning from earlier users might improve onboarding, but it is neither necessary nor sufficient for a large business. The comparison:

| Arm (new users only, same tuning budget) | What it shows |
|---|---|
| Gentle preset, then personal tuning | A strong simple baseline |
| Start informed by earlier users, then the same tuning | Whether shared learning adds value |

Measure time to an acceptable result, comfort and clarity on *new* content, abandonment, and cases where the shared start makes things worse. If personal tuning already works in a minute, saving two comparisons has little commercial value.

The study export links processing choices, context (state, device, content type) and outcomes, with explicit opt-in. That is the data this comparison needs. Random assignment to the two arms is **not built yet**. It needs a pool of earlier participants' settings first.

## Days 1–15 interview guide

**Who:** adults who say sound sensitivity, migraine-related first, makes them stop or avoid spoken video at least a few times a month. Screen out anyone whose main problem is hearing loss; that is a different job.

**Ask them to bring:** a video they recently gave up on, or one they need to watch.

1. Tell me about the last time you stopped a lecture, tutorial or podcast because of how it sounded. What was it, where were you, and what did you do next?
2. What exactly felt wrong? (Let them describe it first, then probe: sharpness, s-sounds, sudden loud moments, music under speech, background noise.)
3. What do you do now? Show me. (Observe: volume, earbuds versus speakers, captions, speed, giving up.)
4. When you turn it down, what happens to the words?
5. How often does this happen, and does it change with how you feel that day?
6. *(Play their content through Still for one minute, with bypass.)* What's different? Could you follow it? Would you use this next time?
7. What would make you stop using it?
8. If this worked, what would it be worth to you each month? (Then show a real price.)

**Decision rule (set before interviewing):** continue if at least 8 people describe a recurring problem (monthly or more often) where volume, captions or presets are not enough, **and** at least 6 say they would use modified audio for it.

## Evidence on the problem itself

In the MAST study of 6,045 people with migraine (Munjal et al., *Headache* 2020, PMC7027490):
- 92.5% reported phonophobia, but only 22.8% chose it as their **most bothersome** symptom.
- For comparison, 49.1% chose photophobia and 28.1% chose nausea.

Sensitivity to sound is near-universal in this group, but it is the main complaint for about one in four. Neither figure shows demand for Still. The interviews have to establish that.

## Known limits and risks

- Tab capture is desktop Chrome and Edge only, and copy-protected video may be silent.
- The delay added by capture is not reported by the browser; lip-sync over Bluetooth may suffer.
- Tuning and the check mute the live sound while comparing, so the person pauses their video too. In tab mode the person watches in the other tab, so they come back to this page to compare.
- On iPhone and iPad, sound routed through Web Audio follows the ring/silent switch.
- Whether Chrome's tab audio continues if the tab is backgrounded or the video track is throttled was reasoned from documentation, not tested end to end. Tab mode needs testing on real machines with real videos.
- Per-state preferences are presets, not learned.
- Feeling more comfortable is not evidence of any health effect, and the page claims none.

## Files

- `dist/video.html`, `video.css`, `video.js`: the page.
- `dist/comfort-filter.js`: filter design, speech guard, Web Audio formulas (runs in Node).
- `dist/video-audio.js`: Web Audio graph, capture, offline rendering, loudness matching.
- `dist/clip-tap.worklet.js`: ring buffer of the last 8 seconds of sound, skipping silence.
- `dist/video-store.js`: local storage, sanitising, study export.
- `analysis/video_study.mjs`: the pre-registered analysis.
- `tests/comfort-filter.test.mjs`: filter, storage, export and analysis tests.
