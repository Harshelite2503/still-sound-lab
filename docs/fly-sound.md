# Sounds in a model fly brain, and what that can and cannot tell us about people

**Status:** exploratory, November 2026. Code: `analysis/fly_lif.py`, `analysis/fly_sound.py`, `analysis/fly_sound_patterns.py`. Figures: `figures/fly-sound/`.

**The question:** if we play sounds into a model of a whole fly brain, what signals appear in its neurons, are there patterns, and could that help us understand sound for people, each of whom is different?

**The short answer:**
- **Real network principles.**
  - What the ear can't sense never reaches the brain.
  - Loudness works like a threshold.
  - Sudden sounds get through where the same energy spread out does not.
  - Weaker inhibition makes loud sounds, and only loud sounds, take over more of the brain.
- **What it can't show.** It doesn't capture the fly's own song-rhythm detection, because the biology that does that is missing from the model. It can't tell us what feels comfortable to a person.
- **Personalisation needs a different route.** That route is a model of each person's ear plus their measured tolerance, described at the end.

## How hearing works

### In people

1. **Ear to cochlea.** The outer and middle ear funnel air-pressure waves into the cochlea, a coiled, fluid-filled tube.
2. **A frequency map.** The basilar membrane inside it works like a piano keyboard laid along the tube: high pitches vibrate the start, low pitches the far end. Each place therefore stands for one frequency.
3. **Two kinds of hair cell.**
   - About 11,000–12,000 **outer hair cells** act as an amplifier. They boost quiet sounds and squash loud ones, which makes hearing both sensitive and sharply tuned. This amplifier is what noise and age damage first.
   - About 3,500 **inner hair cells** are the senders. They turn vibration into signals on the hearing nerve.
4. **The hearing nerve.** About 30,000 fibres per ear in adults, falling with age. Some fibres fire even in silence and catch quiet sounds but max out early; others are quiet at rest and carry information about loud sounds.
5. **Up through the brain.** The signal passes through a chain of relays:
   - cochlear nucleus,
   - superior olive (compares the two ears, for direction),
   - inferior colliculus (a midbrain hub),
   - thalamus,
   - auditory cortex (where sounds are recognised).

   A side route from the thalamus reaches the **amygdala**, the brain's threat and emotion centre, directly. That is part of why a sound can feel alarming before we know what it is.

### Why some people find everyday sound too much

These are several different mechanisms, which is one reason people differ so much:

- **Hidden nerve damage.** Noise can destroy nerve connections while the standard hearing test stays normal. The loud-sound fibres go first. In mice this goes with a stronger startle response. Human evidence is mixed.
- **The brain turns up its own volume ("central gain").** When the ear sends less signal, brain relays amplify more.
  - In animals, responses in the inferior colliculus rose 40–50% (Auerbach 2014).
  - People with low sound tolerance but normal hearing tests showed raised activity in the inferior colliculus, thalamus and auditory cortex (Gu 2010).
  - About 40% of people with tinnitus have hyperacusis, and 87% of people with hyperacusis have tinnitus.
- **Sound that hurts.** A separate kind of nerve fibre in mice still signals damaging noise, which is a candidate for sound that causes pain. Its role in people is debated.
- **Misophonia** is about the meaning of specific sounds, such as chewing, not their loudness. Trigger sounds over-activate the anterior insula, a brain area that flags what matters.
- **Migraine.**
  - Between attacks, people with migraine found sound unpleasant about 15 dB sooner than controls (90.4 vs 105.9 dB). During attacks it came about 15 dB sooner again (76.0 vs 91.0 dB). The shift was the same at 1, 4 and 8 kHz (Ashkenazi et al.).
  - Thalamic neurons that sense the brain's lining, where migraine pain starts, project to auditory cortex. Whether sound input meets them directly is not yet shown.

### In a fly

- **The "ear" is the antenna.** A fly hears with Johnston's organ, a sensor at the base of its antenna. It detects how air particles move near the fly, not air pressure, and only up to about 1 kHz. It is built for hearing a male's courtship song from millimetres away.
- **Two kinds of sound neuron.**
  - **JO-B** neurons prefer low frequencies, below about 100 Hz.
  - **JO-A** neurons prefer higher frequencies, about 100 Hz to 1 kHz, with a peak near 400 Hz.
  - Other Johnston's organ neurons sense wind and gravity.
- **Song pathway.** Signals pass to the AMMC and wedge (WED) brain regions, then to song-detecting neurons such as **vpoEN** and **pC2**. In real flies these respond best to pulses about 36 ms apart, the rhythm of the species' own courtship song.
- **Escape pathway.** JO-A neurons also connect to the **giant fiber**, the fly's escape neuron, largely through electrical synapses.

### Fly vs human: what could carry over

| Shared principle | Fly | Human |
|---|---|---|
| Split sound into frequency channels | JO-A vs JO-B, roughly frequency-mapped | Cochlear frequency map, about 30,000 fibres |
| An active amplifier that boosts quiet sounds and compresses loud ones | Antenna amplification | Outer hair cells |
| Rhythm filtering downstream | Song-rhythm detectors | Brainstem, midbrain and cortex |
| Inhibition shaping what gets through | AMMC inhibitory interneurons | Loss of inhibition is one cause of central gain |

What does **not** carry over:
- The fly hears air movement, under 1 kHz, through about 200 sound neurons per antenna.
- It has no cochlea, thalamus, cortex, amygdala, insula or trigeminal pain system. Those are exactly the parts implicated in hyperacusis, misophonia and migraine.

## The model and how it was checked

- **The model:** the whole-brain leaky integrate-and-fire (spiking) model of one adult female fly, Shiu et al., *Nature* 2024.
  - It covers 138,639 neurons and 15.1M connections, from the FlyWire connectome (materialization 783), via the eon systems repo.
  - All neurons share one set of parameters. Each synapse's sign comes from its predicted neurotransmitter.
- **My simulator:** `analysis/fly_lif.py` runs the same equations about 10× faster and accepts input whose rate changes over time, which sound needs.
- **Validated against the original Brian2 code:**
  - On a two-neuron test, membrane voltages match to 1e-13 mV, including refractory behaviour. Brian2 discards synaptic input that arrives while a neuron is refractory, and the first version of my simulator did not. The test found this.
  - On the paper's sugar test (23 sugar taste neurons at 200 Hz, 1 s), neuron-by-neuron firing rates correlate at **0.9992**, total activity is within 1%, and the feeding motor neuron MN9 fires at 92/61 Hz (mine) vs 94/60 Hz (Brian2).
- **Hearing neurons:** the FlyWire annotation table (flywire_annotations main at a83b2776d6, Sept 2026) labels 99 JO-A and about 240 JO-B auditory neurons. 99% of them are in the model.
- **Sound to model input (`analysis/fly_sound.py`):**
  1. Each JO neuron gets its own preferred frequency, drawn from the published ranges (JO-B 30–150 Hz, JO-A 150–800 Hz).
  2. Each sound passes through a half-octave filter at that frequency, and the signal is rectified and smoothed to its envelope.
  3. The envelope level, in dB, maps through an S-shaped curve to a firing rate of 0–200 Hz.
  4. That rate drives random (Poisson) spikes into that neuron.

  The direction of each step is from the literature. The exact numbers are my judgement, because single JO neuron firing rates have never been measured. That is why loudness is swept.
- **Controls:**
  - Each patterned sound has a twin with the same average input to every channel but no pattern.
  - The natural pulse song also has a version with the same number of pulses at random gaps.

## What we found

The run used 20 sounds and controls, 8 trials of 1.5 s each, with 342 JO-A and JO-B neurons driven. "Responding" means firing above 2 Hz, not counting the driven ear neurons. Numbers are from `figures/fly-sound/patterns.json` and `central-gain.json`.

**1. What the fly can't hear, its brain never sees.**
- High hiss at 2–4 kHz reached no neurons at all, because the antenna isn't tuned that high.
- The front end decides everything downstream. For people, this is the part that differs most between individuals: hearing loss, and which frequencies each person finds harsh.

**2. Signals fade fast.**
- Almost all responses sit within 1–2 synapses of the ear.
- No neuron 3 or more synapses away fired above 2 Hz for any sound.
- This matches an independent FlyWire hearing study, in which activity fell at each step from the ear inwards. In this model, without electrical synapses or ongoing background activity, sound stays near the periphery.

**3. Loudness is a threshold, not a dial.**

| Sound | Input rate at the ear (JO-A) | Neurons responding |
|---|---|---|
| Quiet noise | 16 Hz | 0 |
| Normal noise | 57 Hz | 22 |
| Loud noise | 126 Hz | 105 |

Second-layer activity rose about 20-fold from normal to loud, for about 2.2× more input. Small changes near threshold produce large changes in how much of the brain is involved. That is the shape you'd expect if a modest change in gain could tip a sound from fine to overwhelming.

**4. The model does not detect the song rhythm. Total input matters, not pattern.**
- **No preference by rate.** Every one of 28 responding cell types fired most for the shortest gap (16 ms), simply because that sound has the most pulses.
- **Pattern made no difference.** The natural 36 ms pulse song and an unpatterned input with the same average gave population responses correlated at **r = 0.99**, with total activity within 1%.
- **Shuffling the gaps barely mattered.** Random gaps with the same number of pulses changed total activity by only about 5%.
- **Per pulse, there is a small optimum.** Downstream neurons responded slightly more at 16–36 ms gaps (36 ms gave 1.3× the per-pulse response of 56 ms). Since the unpatterned control matches, this comes from how much input lands within a neuron's roughly 20 ms integration window, not from detecting the rhythm.
- **Contrast with real flies.** vpoEN and pC2 are band-pass tuned to about 36 ms, and FlyWire names neither of them in this table version. The disagreement points to the missing biology: graded relay neurons, electrical synapses, adaptation and timed inhibition.

**5. Rhythm survives only near the ear, and only if slow.**
How strongly firing locked to the rhythm (0 = not at all, 1 = perfectly):

| Rhythm | 1 synapse in | 2 synapses in |
|---|---|---|
| Pulses every 96 ms | 0.94 | — |
| Natural 36 ms song | 0.55 | 0.34 |
| Pulses every 16 ms | 0.08 | 0.05 |
| 10 Hz flutter | 0.74 | — |
| 0.5 Hz swell | 0.78 | — |

Fast rhythms smear into a steady level within one synapse.

**6. Suddenness matters even when the energy is the same.**
- A 50 ms bang activated 14 neurons beyond the ear, including the giant fiber, the escape neuron, and three other descending neurons (DNb05, DNg29, DNp12).
- The same total input spread evenly over 1.5 s activated **none**.
- A 10 Hz flutter activated twice as many neurons as its unpatterned twin (12 vs 6), with 44% more total activity.
- Concentrated energy crosses thresholds that spread-out energy never reaches. This is the clearest result relevant to people: peaks, not averages, decide what gets through. It supports the peak control in Still's comfort filter.

**7. The brain sorts sounds by channel.**
- The two main dimensions of the whole-brain response explain 48% and 30% of the variation across sounds.
- They separate **low-frequency** sounds (100 Hz tone, sine song: the JO-B channel) from **higher-frequency and pulse** sounds (JO-A), with loudness on top.
- Responses to a 150 Hz sine song and an 800 Hz tone are barely related (r = 0.09). All the pulse rhythms cluster together with their unpatterned control.

**8. Weaker inhibition makes loud sounds take over more of the brain, and leaves quiet ones alone.**
This mimics the reduced inhibition proposed in "central gain". All inhibitory synapses were scaled down:

| Inhibition | Quiet noise | Normal noise | Loud noise | Loud noise, total activity |
|---|---|---|---|---|
| Published (100%) | 0 neurons | 22 | 105 | 1,748 Hz |
| 75% | 0 | 22 | 126 | 2,019 Hz |
| 50% | 0 | 23 | 147 | 2,555 Hz (+46%) |

- The same loud sound recruited 40% more neurons when inhibition was halved, while quiet sounds were unchanged.
- That is the pattern of hyperacusis: quiet sounds are fine, loud everyday sounds become too much.
- In this model it is a direct consequence of inhibition only acting on neurons that are already active.
- It is a principle, not a measurement of any person. It shows how the **same sound** can land very differently in two nervous systems that differ in one setting. That is the honest version of "different for each person".

## Limits, stated plainly

- **No electrical synapses.** The connectome shows chemical synapses only. JO-A drives the giant fiber mainly through electrical synapses, which this model lacks.
- **The first song relay doesn't spike.** AMMC-B1 neurons respond with graded voltage, not spikes. An integrate-and-fire model cannot represent them faithfully.
- **Inhibition is weakened.** Neurons have no background firing, so inhibition onto a silent neuron does nothing. Real rhythm tuning relies on timed inhibition and on adaptation, neither of which the model has.
- **Input is a guess.** Poisson spike rates stand in for hearing, and they discard the carrier's fine timing.
- **The model's validation didn't cover hearing.** Its reported 91% accuracy is for feeding and grooming predictions, and the authors say absolute firing rates are unlikely to be accurate.
- **One female fly.** There is no male song pathway (vPN1), and nothing here can represent differences between individuals, flies or people.

So treat these as **what the wiring alone would do**. Where results disagree with real flies (for example, no preference for the 36 ms song rhythm), that is informative: it tells us the missing biology, such as electrical synapses, graded neurons and adaptation, is doing the work.

## What this means for Still, and the better route for people

The fly model is a good **teaching demo** of how a nervous system routes and filters sound. It cannot predict which sounds a person finds comfortable, and it cannot be personalised.

For people, the evidence points to a route that **can** be personalised. Each step is buildable with open-source tools whose licences allow it:

1. **Measure each person's tolerance by frequency.** Find the level at which a sound stops feeling comfortable at a few frequencies, as Ashkenazi et al. did at 1, 4 and 8 kHz. Still's comfort contour already does a version of this across 7 bands. Repeat it across sensitivity states, because migraine shifts tolerance by about 15 dB.
2. **Predict how loud each part of a sound will feel** with a standard loudness model. [MoSQITo](https://github.com/Eomys/MoSQITo) is Apache-2.0 and implements ISO 532-1 (Zwicker) loudness and sharpness. It is for normal hearing.
3. **Optionally model that person's ear.** The [BEZ2018 auditory-nerve model](https://github.com/msaddler/bez2018model) (MIT licence) takes sound plus a person's audiogram, through outer and inner hair-cell settings, and outputs simulated hearing-nerve spikes. Its physiology is from cats, with human frequency tuning.
   - The Verhulst 2018 and CoNNear human models are more accurate but are licensed for non-commercial research only. CoNNear also forbids diagnostic or treatment use, so neither can ship in Still without a licence from Ghent University.
4. **Compare predicted loudness with that person's own limits, band by band.** That tells the comfort filter (Still for Video) where to cut, for this person, today.

Even this route does not model central gain, misophonia's meaning-driven reactions or migraine sensitisation. Those are why the person's own ratings remain the final judge.

## Reproduce

```bash
python -m venv venv && ./venv/bin/pip install numpy scipy pandas pyarrow matplotlib brian2
# data: 2025_Completeness_783.csv and 2025_Connectivity_783.parquet from github.com/eonsystemspbc/fly-brain/data,
#       annotations.tsv = Supplemental_file1_neuron_annotations.tsv from github.com/flyconnectome/flywire_annotations
./venv/bin/python analysis/fly_sound.py --data <data folder> --out <results> --trials 8
./venv/bin/python analysis/fly_sound_patterns.py --results <results> --data <data folder> --out figures/fly-sound
```

The connectome data are not stored in this repository. FlyWire data are shared under their own terms, and the eon repository is GPL-2.0. `analysis/fly_lif.py` is a re-implementation of the published model's equations, written for this project.
