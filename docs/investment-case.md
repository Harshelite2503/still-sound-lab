# Still: methodology and investment case

*Brief prepared 5 November 2026. Every number below comes from a source that was independently checked. Where the check corrected a figure, the corrected figure is used. Claims that could not be verified are left out or marked as such. Anything marked "Opinion" or "estimate" is judgement, not sourced fact.*

---

## 1. Straight answers

### Can a song vector index make a viral hit deterministic?

**No.** A song index is worth building, but not for that.

- **Success depends on social dynamics.** In a controlled experiment with 14,341 participants, letting people see download counts made song success both more unequal and less predictable across parallel "worlds". Quality only partly decided outcomes: the best songs rarely did badly and the worst rarely did well, but anything else could happen (Salganik, Dodds and Watts, *Science* 2006). That part of virality is not in the audio, so no audio embedding can capture it.
- **The best-known positive result is modest.** On a balanced 50/50 task (did a song reach the UK Top 100?), acoustic features alone gave 0.69–0.75 accuracy against a 0.50 baseline. Adding a single "superstar" variable (the artist charted in the previous five years) raised it to 0.82–0.86. Only 14,536 charting songs could be matched to acoustic features, and the 2014 test set was 526 hits against 526 non-hits (Interiano et al., *R. Soc. Open Sci.* 2018). Most of the gain came from fame, not sound.
- **Recent deep learning repeats the pattern.** A December 2025 IIT Bombay preprint (GAMENet, 113k tracks) reports R² = 0.13 from audio descriptors alone and 0.69 once artist-career features are added. The abstract does not say whether the train/test split was by time, so the 0.69 may be inflated by information from after release.
- **The "97% hit prediction from brain data" headline does not hold up.** The 97% was measured on synthetic data generated from 33 participants listening to 24 songs. On the 24 real songs the model scored 23 of 24, with no outside test set. A senior author is affiliated with the company that supplied the measurement platform (Merritt, Gaffuri and Zak, 2023).

**What the index is good for:** finding similar songs, modelling one listener's taste, and recommending comfortable sound to one person in a given state. Embeddings measure how alike two songs sound. They do not measure whether a song will succeed. Pitching "deterministic virality" to investors would not survive diligence and would damage credibility for the rest of the pitch.

### Can an app solve migraine?

**No. No drug, device or app cures migraine.** The honest benchmarks:

| Product | Type | Result against sham or placebo |
|---|---|---|
| CT-132 (Click Therapeutics) | CBT app, FDA De Novo April 2025 | **−0.90 monthly migraine days vs sham** (95% CI −1.53 to −0.27), 570 randomized, used alongside medication, 12 weeks |
| Nerivio (Theranica) | Neuromodulation armband | Prevention: −4.0 vs −1.3 monthly migraine days (n=248). Acute: 66.7% vs 38.8% pain relief at 2h (n=252) |
| RELAXaHEAD | Relaxation app | Disability (MIDAS) improved; **monthly headache days did not**. Comparator was diary only |
| Music or sound for adult migraine | — | **No published randomized trial found.** The only app study was a 20-person single-arm pilot |

In 2026 Germany removed the migraine app sinCephalea from reimbursement because its 0.53-day reduction fell below a clinical-relevance threshold of 0.8845 days. Even CT-132's 0.9 days barely clears that bar.

**A defensible goal:** Still becomes the trusted sound-comfort companion for people whose migraine makes them sensitive to sound. It generates its own controlled evidence and, if that evidence holds up, later earns a modest add-on clinical claim. That is a real company. "Solving migraine" is not a claim it can make, and in the US, EU or India, saying it publicly could make the app an unapproved medical device.

---

## 2. The problem and the market

### Size

- **About 1.2 billion people** had migraine in 2021 (95% UI 1.0–1.3B), the 7th most common specific condition worldwide. Headache disorders were the 3rd leading cause of years lived with disability, behind low back pain and depressive disorders (GBD 2021, *Cell Rep Med* 2025).
- **India:** a door-to-door survey in Karnataka (n=2,329) found **25.2%** one-year migraine prevalence (age-standardized), against a global literature figure of 14.7%. Rates were higher in women (31.6% vs 18.5%) and in rural areas (28.9% vs 21.7%). A Delhi/NCR study using the same protocol found 26.3% (Chowdhury et al. 2024). Only two states have been measured. The authors argue the results apply to all of India, but that is their judgement, not a national measurement.

### The gap in care

- **India:** only **30.3%** of people with migraine consulted any health professional for headache in a year, and 13.2% of those saw a specialist. Fieldwork was in **2009**.
- **US:** in the OVERCOME study, 40.4% of respondents were eligible for preventive medication, but only 16.8% of *all* respondents were using one. That points to a large under-treated group, but the paper gives no single "share of eligible patients treated" figure.
- **Cost:** in claims data, migraine patients cost **$8,924 a year more** than matched controls ($6,575 direct, $2,350 indirect), in 2014 US dollars (Bonafede et al., *Headache* 2018).

### Sound sensitivity, Still's niche

- Phonophobia was reported by **76.5%** of 187 consecutive patients at one Japanese headache clinic, and having several sensory sensitivities went with higher disability (Suzuki et al. 2021). This is a clinic sample, not a population estimate. The true share across all people with migraine is uncertain. Present it as "common, possibly the majority", not as a precise figure.
- People with migraine tolerate less sound even between attacks. Average sound-aversion thresholds were **~90 dB vs ~106 dB** in controls, falling to **~76 dB during attacks**, measured with pure tones (Ashkenazi et al. 2008).

### Willingness to pay in India

From the same 2009 survey, median willingness to pay was **INR 100 per 3 months** (mean INR 206), and 64.8% would pay INR 100 or less. Median actual spending was INR 10 per 3 months. The data are 17 years old and predate smartphones, but even generous updates will not make Indian consumer subscriptions fund the company. **Opinion:** India suits scale, data, research partnerships and product iteration. Revenue has to come mainly from elsewhere.

---

## 3. Competitive landscape and what is unoccupied

| Player | What it is | Evidence and regulation | Money | Lesson for Still |
|---|---|---|---|---|
| **Theranica Nerivio** | Phone-controlled armband | FDA De Novo 2019 (acute), prevention clearance Feb 2023, both on sham-controlled RCTs | ~$84–86M raised. US coverage of 130M lives (Feb 2026, credited to BCBS plans). Medicare equipment coverage reportedly denied Dec 2022 | The investable path is RCT, then clearance, then years of payer-by-payer coverage |
| **electroCore gammaCore** | Vagus nerve stimulator | Cleared device | FY2025 sales $32.0M (+27%); VA ~70% of 2024 sales; net loss $14.0M; cash $11.6M; CEO retiring | Even a decade-old cleared device is a fragile, single-payer business. Its wellness channel nearly doubled to ~$5.5M with no disease claims |
| **Click CT-132** | Prescription CBT app | First FDA-authorized prescription app for migraine prevention (Apr 2025), sham-controlled trial | Well funded | Holds the first regulatory position for software in migraine. Its effect size sets the bar |
| **Neurolief Relivion** | Head-worn neuromodulation | FDA 510(k), March 2021 | — | Cleared hardware is crowded |
| **Migraine Buddy (Healint)** | Free tracker | None | >$1M seed (2015) plus ~$300k angel; >2M users (2019); Novartis alliance (2018) | A capital-light app can build a large patient audience and partner with pharma |
| **Neura Health, Hemi Health** | Care delivery | — | Neura $11.4M Series A (Sept 2025); Hemi €4M seed (Feb 2026) | New money is going to care delivery |
| **Calm, Headspace, Endel, Brain.fm** | Wellness and functional audio | Brain.fm has a peer-reviewed paper; the others make no clinical claims | Calm valued at $2B (2020), cut 20% of staff in 2022; Headspace cut ~15% in 2023; Endel's last disclosed round was $15M in April 2022 | Consumer sound wellness can be large, but the category has cooled. Calm's revenue estimates vary too widely to cite |

**What is unoccupied (opinion, based on the table):**

1. **Sound as the problem, not just the solution.** Nobody treats phonophobia as the design constraint: sound that is safe for this person, in this state, at this level.
2. **Personalization learned from the user's own ratings and music**, with safety limits built in.
3. **Controlled evidence on personalized sound in adult migraine.** It does not exist, which makes it both a gap and an opportunity to publish first.
4. **A sound layer for others.** Device makers, trackers and pharma companies have patient relationships but no credible sound product to offer them.

What is not open: general migraine treatment, migraine diaries, and cleared neuromodulation.

---

## 4. Product strategy

### Wedge

**"The audio app that is safe to use when sound hurts."** It targets adults with migraine who are sensitive to sound. It offers personal comfort sound with hard loudness limits, separate levels for when the user feels fine, sensitive or recovering, and a quiet mode. It markets comfort and relaxation, never treatment.

> **Regulatory caution:** FDA's 2026 wellness guidance judges what a product *does*, not only what its copy says. Modes named "warning", "attack" and "recovering" tie the app's function to a disease. Get a regulatory lawyer to review the current state model and its naming before launch, and consider names based on how sensitive the user feels rather than on the disease.

### Core loop

1. The user checks in with their state (calm, sensitive, high sensitivity, recovering) and a 0–10 sound-tolerance score.
2. Still plays personalized sound within that state's safety limit: procedural textures, or original sketches matched to the user's own songs.
3. A one-tap comfort rating, plus an optional rating 15 minutes later.
4. The preference model updates (pairwise learning over sounds, Thompson sampling over sketch settings).
5. A light diary (headache days, MIDAS every 3 months) produces a monthly personal insight, for example "matched sound was rated more comfortable than plain in 9 of 12 blinded pairs."

The loop is useful on day one, which helps retention. The research data comes as a by-product of normal use.

### Moats, in honest order of strength

1. **A consented, longitudinal dataset linking state, sound and outcome.** Nobody else has data on which sounds people with migraine tolerate, in which state, and with what effect. This is the strongest asset, but only if consent and governance are done properly from the start (section 5).
2. **Personalization from a cold start.** Priors come from the user's own song library, analysed on the device, and are refined with very few ratings.
3. **Trust.** Safety limits, no hype, analysis on the device, published methods and results, including negative ones.
4. **Not a moat:** embedding models, vector search and procedural audio. They are cheap, open and easy to copy.

### Roadmap (opinion; timings are estimates)

**Months 0–6: launch the wellness product and build evidence infrastructure**
- Ship web and mobile with wellness-only claims. Review every surface: app, store listing, website, social posts and pitch deck.
- Make the paired matched-vs-plain test **blinded and randomized**. Today the user knows which version is playing.
- Add consent flows, an optional diary, adverse-event reporting ("this made it worse"), export and deletion.
- Find an academic partner with an ethics committee: an Indian headache centre, or IIT Bombay for the music side, since the GAMENet authors work there.
- Pre-register a blinded N-of-1 comfort study (section 5).
- Measure retention at 4, 8 and 12 weeks. Engagement decides outcomes in this category.

**Months 6–18: first controlled signal and first revenue channel**
- Run a randomized pilot against an attention control with matched loudness and duration: about 100–150 adults, 12 weeks, MIDAS and monthly migraine days. RELAXaHEAD is the template.
- Test pricing in the US, UK and EU. Use India for scale and research.
- Pilot one B2B partnership with a headache clinic network, a tracker or a device maker.
- If the pilot shows a signal, start a quality management system and IEC 62304-style software documentation.

**Months 18–36: commit to a clinical claim only if the data support it**
- Run a pre-registered, sham-controlled, multi-site trial sized for an effect of about 1 day per month or less.
- Choose a regulatory route (section 6).
- Consider DiGA only with a randomized result above Germany's ~0.88-day relevance threshold.
- Partner with pharma (an adjunct to preventive drugs) or device companies (a sound layer for their apps).

---

## 5. Methodology

### Evidence ladder

| Level | Question | Design | Claim it supports |
|---|---|---|---|
| 0 | Is it safe and tolerable? | Safety monitoring, adverse-event capture | None; required for every level |
| 1 | Does this person prefer matched or plain, and which texture? | Blinded, randomized N-of-1 pairs | "Personalized to what you find comfortable" |
| 2 | Does sound improve comfort and tension within minutes? | Micro-randomized trial | "Users rated it more calming than neutral audio" (wellness only; may still need substantiation for consumer-protection law) |
| 3 | Does daily use reduce disability? | Randomized pilot against attention control | Publishable signal; no disease claim |
| 4 | Does it reduce migraine days or attack burden more than sham? | Pre-registered, sham-controlled RCT | Basis for a device claim (FDA, CE, CDSCO) |
| 5 | Does it work in routine care and is it worth paying for? | Pragmatic trial, real-world evidence | Reimbursement (DiGA, payers) |

Uncontrolled before-and-after improvements in the app's data should **never** be presented as outcomes. Sham responses in migraine are large. Across preventive trials, 22% responded to oral placebo, 38% to sham acupuncture and 58% to sham surgery, and sham-acupuncture arms responded more than oral-placebo arms (OR 1.88) (Meissner et al. 2013). A ritual-heavy, sensory product like Still will draw strong expectation effects.

### Study designs

**N-of-1 (level 1).** For each user, randomly assign matched or plain within each pair and hide which one is playing. Ratings are collected immediately and after 15 minutes. After about 10–20 pairs, a per-user Bayesian estimate gives each person a credible answer for themselves, and pooling across users gives a population estimate. This is cheap, can be published as a methods or feasibility paper, and largely uses what already exists.

**Micro-randomized trial (level 2).** At each decision point (the user opens the app while sensitive, or a reminder fires), randomize between personalized sound, neutral audio matched for loudness, and silence or a breathing prompt. The near-term outcome is self-rated comfort and tension at 15 and 30 minutes. This shows *when* sound helps, which feeds back into the product. Note that the claim that micro-randomized trials are absent from migraine research could not be verified, so do not claim to be first without checking.

**Randomized pilot (level 3).** Two arms for 12 weeks: Still versus an attention control. The control could be a diary plus a neutral audio library with the same safety limits and similar session time. Primary outcome MIDAS, secondary monthly migraine days. RELAXaHEAD shows the expected pattern: disability improves before migraine days do, and benefit tracks usage. Its 2020 primary-care pilot was not significant (P=.10), and the 2025 emergency-department RCT was. Expect a sequence, not a single win.

**Sham-controlled RCT (level 4).** The core problem is blinding, because users can hear their intervention. The 2025 IHS guideline on neuromodulation devices gave even cleared devices only weak recommendations, partly over sham validity and blinding. Recommended sham: non-personalized neutral audio matched for loudness, duration and interface. Measure blinding with a formal index at the end. Plan sample size against about 1 migraine day per month or less versus sham. For scale, CT-132 randomized 570 people to show −0.9.

### Endpoints (IHS)

- **Preventive (daily use):** change in monthly migraine days. Key secondary: share of patients with at least a 50% reduction. Requires a 28-day baseline diary, ICHD-3 diagnosis and a 12-week treatment period (IHS Cephalalgia 2020).
- **Acute (use during attacks):** pain freedom at 2h. FDA pairs this with freedom from the most bothersome symptom at 2h (IHS Cephalalgia 2019). For Still, the most bothersome symptom may often be phonophobia, which is a natural fit.
- **Behavioural-trial design:** follow the American Headache Society's behavioural clinical trials guidelines (Penzien et al. 2005). These come from the AHS, not the IHS.
- In-app comfort ratings are an engagement and mechanism measure, **not** an efficacy endpoint.

### Safety

- Hard output limits per state, informed by the measured thresholds: ~76 dB during attacks and ~90 dB between attacks on average, with individual variation. Document the limiter, comfort contour and state levels as formal risk controls.
- Capture adverse events in every study: worsened phonophobia, headache triggered by audio, nausea.
- Set stopping rules. Larger trials need an independent safety board.

### Data, consent and ethics

- **Health data:** headache diaries and attack-state data are sensitive health data. India's DPDP Act 2023 and its rules, GDPR in the EU and UK, and HIPAA where it applies all need specialist review. This brief did **not** research them in depth, which is a known gap.
- **Separate consents:** one for using the product, one for research use of data, and one for each study, all revocable.
- **Data minimization:** analyse music on the device and store only derived features, never the audio.
- **Ethics committee approval** and **pre-registration** (ClinicalTrials.gov and/or the Clinical Trials Registry of India) before any study whose results will be cited.
- **Conflicts of interest:** the founder will be studying his own product. RELAXaHEAD's lead author disclosed a financial interest. Do the same, and give analysis to an academic partner.
- **Publish negative results.** Trust is part of the moat.

---

## 6. Regulatory pathway and claim discipline

| Jurisdiction | Wellness route | Route for a migraine claim | Notes |
|---|---|---|---|
| **US (FDA)** | General Wellness guidance, 6 Jan 2026. Pure wellness software with no link to disease is excluded from the device definition by statute. Claims linking a lifestyle to a chronic disease ("living well with migraine") rely only on FDA choosing not to enforce | De Novo, or possibly a 510(k) against CT-132 (21 CFR 882.5806) if technology and intended use are similar enough. Music is not CBT, so this is uncertain | FY2027 fees: De Novo $191,020 ($47,755 small business); FY2027 annual registration $13,785. FY2026 510(k): $26,067 ($6,517 small business). Small business means ≤$100M gross receipts, requalified every year. MDUFA V expires 30 Sep 2027. The trial, quality system and software and cybersecurity documentation, not the fees, drive the cost |
| **EU (MDR)** | Software intended only for lifestyle or well-being is not medical device software (MDCG 2019-11 Rev.1, 17 June 2025) | Under Rule 11, software that informs treatment decisions is Class IIa or higher and needs a notified body. The leftover "all other software" category is Class I and self-certified. M-sense was Class I under the older rules | The class depends on the exact wording of the intended purpose. Decide it deliberately with a regulatory consultant |
| **India (CDSCO)** | Software used solely for wellness or fitness is excluded, judged feature by feature | Classes A–D under the Medical Devices Rules 2017. Final guidance is circular CDSCO/MD/GD/MDSW/01/2026, dated 21 July 2026 | The guidance is not binding. Legal obligations come from the 2017 Rules. AI-enabled software is expected to document datasets, bias and validation on Indian populations. Any treatment claim made to Indian clinicians triggers licensing |
| **Germany (DiGA)** | n/a | Needs a CE mark plus proof of a positive care effect, usually an RCT | Sept 2020 to end-2025: ~1.6M prescriptions, ~€400M spent; 74 apps admitted, 16 removed, 58 remain. 2025 average price €544 set by makers, €227 after negotiation. From 2026 at least 20% of payment depends on performance. Two migraine apps have already failed (section 7) |

### Claim discipline

| Never say | Acceptable wellness wording (still review with counsel) |
|---|---|
| "Solves", "treats", "cures" or "prevents" migraine | "Comfort sound designed for people who are sensitive to sound" |
| "Reduces migraine days or attacks" | "Personal sound with built-in loudness limits" |
| "Healing frequencies", "binaural therapy" | "Learns which sounds you find calming" |
| "Clinically proven" (before level 4) | "We are running research with [partner]; here is what we've found so far" |

This applies to **every** surface: app, store listing, website, social posts, pitch deck and conversations with clinicians. US consumer-protection law (the FTC) may also require substantiation for wellness claims such as "calming". Confirm this with counsel; it was not verified in this research.

---

## 7. Business model options and unit economics

### Options, ranked by fit for a solo founder (opinion)

1. **Global consumer subscription, focused on the US, UK and EU.** Funds the company without depending on payers. Risk: consumer wellness apps are a cooled, crowded category.
2. **Partnerships and licensing:** a sound layer inside trackers, device-maker apps or pharma patient-support programmes. Migraine Buddy's Novartis alliance and electroCore's wellness channel show demand. This is the most capital-efficient route.
3. **Employers and benefits platforms.** The 2014-dollar excess cost of $8,924 per patient supports the case, but sales cycles are long and need outcome data, so this realistically comes after level 3.
4. **Research grants and academic partnerships.** These fund evidence generation. India is a strong fit.
5. **Payers and prescription (DiGA, FDA-cleared, reimbursed).** Only after a positive level-4 trial. A late option, not the core of the story.

### Unit economics considerations

- **Cost to serve is very low.** Analysis runs on the device and sound is procedural or synthesized, with no streaming licences. That is a real structural advantage.
- **Retention is the deciding number.** Engagement drives outcomes and revenue. Track it at 4, 8 and 12 weeks from launch, and do not raise money on download counts.
- **India:** a median willingness to pay around INR 100 per quarter means Indian users are an evidence and scale asset, not a revenue line. Consider a free tier in India and paid tiers elsewhere.
- **Customer acquisition:** patient communities, headache clinics and partners are likely cheaper than paid ads. This is untested.

### Lessons from failures

- **Pear Therapeutics:** among the strongest evidence and the first FDA-authorized prescription app, yet it filed for Chapter 11 in April 2023. 2022 revenue was $12.7M against a $75.5M net loss, and its assets sold for about $6M. Clearance did not lead to payment. Medicare has since created payment codes for digital mental-health devices (G0552–G0554, extended to ADHD in 2026), but **migraine software (882.5806) is not covered**.
- **M-sense (Germany):** the first migraine app on the DiGA list. Its maker withdrew it in 2022 after its EMMA study showed no care benefit, then became insolvent in August 2022.
- **sinCephalea (Germany):** a migraine app based on nutrition. It was removed on 22 January 2026 because its 0.53-day benefit was below the 0.8845-day relevance threshold, and a court upheld the removal.
- **electroCore:** a cleared, decade-old device that is still loss-making and depends on one payer.
- **Calm and Headspace layoffs, and Endel's lack of disclosed rounds since 2022:** consumer sound wellness does not raise money on its own.

**The common thread:** evidence, a payment channel and retention all have to be validated. Having one of them is not enough.

---

## 8. Music and AI strategy

### Embeddings: choose by licence first

| Model | Licence status | Use |
|---|---|---|
| MERT-v1-330M | **CC BY-NC 4.0** (confirmed) | Research only, unless separately licensed |
| Essentia / MTG models | **CC BY-NC-SA 4.0**, proprietary licence on request | Research only, unless licensed |
| OpenL3 | MIT code, CC BY 4.0 weights (confirmed) | Commercially usable with attribution |
| MusicFM | Tagged MIT on Hugging Face, but the model card is empty | Confirm the weight licence in writing before use |
| LAION CLAP, Microsoft CLAP, VGGish/YAMNet | Not verified in this research | Confirm before use |

Public benchmarks measure tagging, key, genre and similarity, not comfort. **Still has to build its own evaluation from its users' ratings and outcomes.** That evaluation set is itself part of the data moat.

### Index

FAISS (MIT), pgvector (PostgreSQL licence) and Qdrant (Apache-2.0) are mature and free. **Opinion:** for a personal library of hundreds to a few thousand songs, exact search on the device or in pgvector is enough. Infrastructure is neither a moat nor a significant cost.

**What to index:** derived features of the user's *own* files (key, chords, tempo, spectrum, loudness, embeddings), computed on the device. Song DNA already works this way. Do not upload or store commercial audio on servers.

### Data sources to avoid

- **Spotify:** audio-features and recommendation endpoints were closed to new apps on 27 Nov 2024. Its Developer Policy (effective 15 May 2025, Section III item 14) forbids training ML or AI models on Spotify content.
- **"Open" research audio is mostly non-commercial.** MTG-Jamendo is for non-commercial research only. Jamendo sued NVIDIA on 22 June 2026 (N.D. Cal., case 5:26-cv-06206), seeking at least €17.8M for commercial training on the dataset. A Belgian court allowed a parallel case to proceed. FMA audio carries per-track licences, and much of it is non-commercial.

### Generation

- **The industry is moving to licensed models.** UMG settled with Udio (~30 Oct 2025), Warner with Udio (19 Nov 2025) and Warner with Suno (25 Nov 2025). Suno v6 launched on 9 Sep 2026 with WMG, BMG and Believe as partners. On 18 Sep 2026, UMG and Sony filed a second lawsuit against Suno over v6, listing 60,202 recordings, and Sony is still suing Udio.
- **India:** DPIIT's December 2025 working paper proposes a mandatory blanket licence for AI training, with royalties set by government. It is a proposal, not law. IMI, T-Series and Saregama sought to intervene in ANI v OpenAI. Indian labels are asserting their rights.
- **Still's position:** keep generation **original and procedural**. Matching to the user's "sound zone" should stay at the level of frequency balance, tempo range and harmonic statistics. Never imitate a specific song's melody, lyrics or an artist's voice. If a generative model is added later, use one with licensed training data.

### On the "next viral song" idea

Even setting the evidence aside, a hit-prediction or hit-generation tool is a different business. It has different customers (labels and creators), much heavier copyright exposure, and well-funded competitors: Suno raised $250M at a $2.45B valuation in November 2025 and was reported at over $5B in May 2026. **Opinion:** pursuing it would dilute Still's credibility as a health product. The song index belongs inside the comfort engine.

---

## 9. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Claim creep** ("solves migraine", "healing") makes Still an unapproved device | High | Written claims policy, review of every surface, regulatory counsel before launch |
| **Disease-linked features** (attack mode) count against wellness status even with clean copy | Medium–High | Counsel review of feature design and naming; frame states by sensitivity |
| **No efficacy**: personalized sound may not beat a neutral control | High | Climb the evidence ladder cheaply, decide in advance what result ends a stage, keep a viable comfort-only business |
| **Sound makes symptoms worse** | Medium | Hard limits, per-state caps, adverse-event capture, stopping rules |
| **Placebo and blinding** inflate apparent benefit | High | Loudness-matched sham, blinding index, never present uncontrolled data as outcomes |
| **Reimbursement trap** (Pear, M-sense, sinCephalea) | High | Revenue that does not depend on payers first; payers only after a positive RCT |
| **India willingness to pay** | Medium | India for scale and research, revenue from global markets and partners |
| **Retention decays** | High | Day-one value, short sessions, measured cohorts, insights users can see |
| **Copyright and terms of service** (indexing commercial audio, Spotify, non-commercial datasets) | Medium–High | On-device analysis of user files, derived features only, commercially licensed models, procedural generation |
| **Embedding licence traps** (MERT and Essentia non-commercial) | Medium | Licence audit, written confirmation for every weight file |
| **Privacy and health-data law** (DPDP, GDPR, HIPAA) | Medium–High | Specialist review (not done here), minimization, separate consents |
| **Competition** from funded, cleared players | Medium | Stay in the sound-sensitivity niche, partner instead of competing |
| **Solo founder**: clinical, regulatory and engineering load | High | Clinical co-founder or advisor, academic partner, regulatory consultant on retainer |
| **Founder conflict of interest** in studies | Medium | Independent academic analysis, pre-registration, disclosure |

---

## 10. What investors will ask, and the milestones that de-risk each round

### Questions to expect

1. *Why sound, and why you?* Lived or domain insight, a working prototype, and a specific problem (sound sensitivity).
2. *What is the evidence?* Today there is none showing sound improves migraine outcomes. Say so, and show the ladder and its cost.
3. *What do you claim, and is it legal?* Show the claims policy and the regulatory memo.
4. *Will people keep using it?* Retention cohorts.
5. *How do you get paid?* Consumer revenue plus one validated partner. Not "insurers, eventually".
6. *What about Click and Theranica?* They treat migraine. Still owns sound comfort and can partner with them.
7. *What is the moat?* The consented dataset linking state, sound and outcome, plus personalization. Not the model or the index.
8. *Data rights and copyright?* On-device analysis, licence audit, procedural generation.
9. *Solo founder in India: who fills the gaps?* Clinical and regulatory advisors, an academic partner.
10. *Why would this beat Pear's fate?* No dependence on payers until the evidence justifies it.

### Milestones by round (opinion; figures are estimates)

| Round | De-risks | Milestones to reach before raising |
|---|---|---|
| **Pre-seed / angels / grants** | Can it be built, and will people use it? | Wellness launch with claims review; consent and diary in place; an academic partner with ethics approval; pre-registered N-of-1 study running; first retention cohorts |
| **Seed** | Do people want it, and is there a signal? | N-of-1 results (published or preprinted); 12-week retention benchmarked; paid conversion in at least one market outside India; one signed B2B or partner pilot; randomized pilot designed, registered and funded |
| **Series A** | Does it work, and can it scale? | Randomized pilot result on MIDAS and migraine days against an attention control; revenue growing from at least two channels; quality management system started; a regulatory strategy with a chosen jurisdiction and trial design; a clinical lead on the team |
| **Series B and later** | Can it earn a clinical claim and payment? | A sham-controlled pivotal RCT showing benefit above the ~0.9-day mark; regulatory submission or clearance; DiGA or payer pilots; partnerships at scale |

The market context is real: US digital-health venture funding was $14.2B across 482 deals in 2025, AI-enabled companies took 54%, and megadeals were 42% of dollars. But the growth was driven by nine companies, which means money flows to companies with traction and evidence, not to early stories.

---

## 11. References (verified)

**Burden and market**
- GBD 2021 Headache Collaborators, Cell Rep Med 2025 — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12629824/
- Kulkarni et al., J Headache Pain 2015 (Karnataka) — https://link.springer.com/article/10.1186/s10194-015-0549-x
- Chowdhury et al., J Headache Pain 2024 (Delhi/NCR) — https://thejournalofheadacheandpain.biomedcentral.com/counter/pdf/10.1186/s10194-024-01814-2.pdf
- Rao et al., J Headache Pain 2015 (India cost and willingness to pay; 2009 fieldwork) — https://pmc.ncbi.nlm.nih.gov/articles/PMC4639543
- Suzuki et al., J Headache Pain 2021 (phonophobia) — https://link.springer.com/content/pdf/10.1186/s10194-021-01294-8.pdf
- OVERCOME (US), Headache 2022 — https://pmc.ncbi.nlm.nih.gov/articles/PMC9305407
- Bonafede et al., Headache 2018, DOI 10.1111/head.13275
- Ashkenazi et al., Cephalalgia 2008, DOI 10.1111/j.1468-2982.2008.01834.x; Vingen et al. 1998 — https://pubmed.ncbi.nlm.nih.gov/9673802/

**Competitors and precedents**
- CT-132 FDA authorization (Business Wire) — https://businesswire.com/news/home/20250415826322/en/Click-Therapeutics-Announces-FDA-Marketing-Authorization-for-CT-132-the-First-Prescription-Digital-Therapeutic-for-the-Preventive-Treatment-of-Episodic-Migraine-in-the-United-States
- ReMMi-D enrollment and result (AAN 2025) — https://index.mirasmart.com/AAN2025/PDFfiles/AAN2025-002564.html
- Nerivio De Novo DEN180059 — https://510k.innolitics.com/device/DEN180059
- Nerivio prevention clearance — https://www.patientcareonline.com/view/nerivio-prescription-wearable-cleared-by-fda-for-preventive-treatment-of-migraine
- Theranica 130M-lives release (Feb 2026) — https://www.biospace.com/press-releases/theranica-announces-u-s-coverage-for-nerivio-reaching-130-million-lives-attaining-payer-scale-comparable-to-leading-migraine-drugs
- CMS equipment-coverage denial report (2022) — https://neurotechreports.com/pages/2022-scottsdale-headache-report.html
- electroCore FY2025 results — https://investor.electrocore.com/news-releases/news-release-details/electrocore-announces-full-year-2025-financial-results-and ; 10-K — https://www.sec.gov/Archives/edgar/data/1560258/000149315226011636/form10-k.htm
- Relivion 510(k) — https://www.businesswire.com/news/home/20210302005356/en/
- Healint / Migraine Buddy — https://healint.com/press-release/2019/11/13/healint-hits-2-million-registered-users
- Endel Series B — https://endel.io/pages/newsroom/press-releases/series-b/Endel-PressRelease-Funding.pdf
- MedRhythms Medicare decision — https://www.massdevice.com/medrhythms-medicare-win-stroke-gait-impairment/
- Pear bankruptcy — https://hlth.com/insights/articles/dtx-trailblazer-pear-therapeutics-files-for-bankruptcy-2023-04-14 ; financials — https://aishealth.mmitnetwork.com/blogs/health-plan-weekly/pear-bankruptcy-filing-highlights-reimbursement-barriers-for-digital-therapeutics
- Medicare digital mental health treatment codes (CY2026) — https://www.cms.gov/files/document/mm14315-medicare-physician-fee-schedule-final-rule-summary-cy-2026.pdf
- Rock Health 2025 — https://rockhealth.com/rock-weekly/2025-year-end-funding-14-2b-raised-across-482-deals/ ; https://www.fiercehealthcare.com/digital-health/jpm26-digital-health-funding-hit-142b-2025-ai-companies-taking-lions-share-dollars

**Regulatory and reimbursement**
- CRS Insight IN12657 (FDA General Wellness 2026) — https://www.everycrsreport.com/reports/IN12657.html
- Troutman on the 2026 wellness guidance — https://troutman.com/insights/fdas-2026-guidance-on-general-wellness-devices-policy-for-low-risk-devices
- FDA fees, FY2026 (Federal Register) — https://www.govinfo.gov/content/pkg/FR-2025-07-30/html/2025-14412.htm
- MDCG 2019-11 Rev.1 — https://health.ec.europa.eu/latest-updates/update-mdcg-2019-11-rev1-qualification-and-classification-software-regulation-eu-2017745-and-2025-06-17_en
- CDSCO medical device software guidance — https://nishithdesai.com/research-and-articles/hotline/pharma-healthcare-update/from-code-to-compliance-decoding-indias-medical-device-software-guidance-15623 ; https://www.emergobyul.com/news/india-cdsco-finalizes-guidance-medical-device-software
- GKV-Spitzenverband DiGA report 2025 — https://www.gkv-spitzenverband.de/media/dokumente/krankenversicherung_1/telematik/digitales/2025_DiGA_Bericht_GKV_SV.pdf ; press release — https://www.gkv-spitzenverband.de/gkv_spitzenverband/presse/pressemitteilungen_und_statements/pressemitteilung_2239872.jsp
- M-sense withdrawal — https://www.aerzteblatt.de/nachrichten/134294/Zweite-DiGA-kann-nicht-mehr-verordnet-werden ; https://www.ptaheute.de/aktuelles/2022/05/16/zwei-apps-aus-diga-verzeichnis-gestrichen
- sinCephalea and the clinical-relevance threshold — https://www.forvismazars.com/de/de/ueber-uns/aktuelles/presse-medien/newsletter/newsletter-healthcare/newsletter-healthcare-1-2026/diga-aufnahme-klinische-relevanz-als-schluessel

**Clinical methodology and evidence**
- IHS trial guidelines (prevention, Cephalalgia 2020) — https://journals.sagepub.com/doi/ref/10.1177/0333102420941827
- IHS 2025 neuromodulation guideline — https://ihs-headache.org/en/news/ihs-evidence-based-guidelines-for-neuromodulation-device-treatment-for-migraine-published/
- Meissner et al., JAMA Intern Med 2013 (placebo response); sham-acupuncture meta-analysis 2023 — https://www.aminer.org/pub/651fa2193fda6d7f06eea295/placebo-response-in-sham-acupuncture-controlled-trials-for-migraine-a-systematic-review
- Koenig et al., J Pain 2013 — https://pubmed.ncbi.nlm.nih.gov/23876282/
- Oelkers-Ax et al., Eur J Pain 2008;12(3):301–13
- Parlongue et al. 2021 (single-arm pilot) — https://www.sfetd-douleur.org/wp-content/uploads/2022/03/Parlongue-et-al_20211.pdf ; NCT03763058
- VA music-and-imagery feasibility study — https://clinicaltrials.gov/study/NCT06440876
- RELAXaHEAD RCT, JAMA Netw Open 2025 (doi:10.1001/jamanetworkopen.2025.34221) — https://nyulangone.org/news/smartphone-based-relaxation-program-reduces-disability-emergency-department-migraine-patients
- US Headache Consortium behavioural treatment summary — https://www.ccjm.org/content/77/7_suppl_3/S72.full.pdf

**Music, AI and copyright**
- Salganik, Dodds and Watts, Science 2006 — https://pdodds.w3.uvm.edu/research/papers/salganik2006a
- Interiano et al., R. Soc. Open Sci. 2018 — https://pmc.ncbi.nlm.nih.gov/articles/PMC5990848
- GAMENet preprint (IIT Bombay) — https://arxiv.org/abs/2512.06259
- Merritt, Gaffuri and Zak 2023 — https://www.frontiersin.org/articles/10.3389/frai.2023.1154663
- MERT-v1-330M model card — https://huggingface.co/m-a-p/MERT-v1-330M
- Essentia models — https://essentia.upf.edu/models.html
- FAISS — https://pypi.org/project/faiss-cpu/1.14.2/
- Spotify Developer Policy — https://developer.spotify.com/policy
- Jamendo v. NVIDIA — https://www.digitalmusicnews.com/2026/06/23/jamendo-nvidia-lawsuit/ ; https://www.musicbusinessworldwide.com/nvidia-hit-with-us-copyright-suit-claiming-it-trained-ai-models-on-winamp-subsidiary-jamendos-music-without-permission/
- Suno v6 — https://axios.com/2026/09/09/suno-v6-ai-music-warner-bmg
- UMG and Sony second suit against Suno — https://www.musicbusinessworldwide.com/universal-and-sony-sue-suno-for-a-second-time-claiming-platforms-v6-models-are-the-fruit-of-the-same-poisoned-tree/
- Warner–Suno settlement — https://siliconangle.com/2025/11/25/warner-music-inks-suno-deal-amid-cooling-tensions-ai-generated-music/
- Warner–Udio settlement — https://www.hollywoodreporter.com/music/music-industry-news/warner-music-group-settles-lawsuit-udio-1236431207/
- DPIIT working paper on generative AI and copyright — https://www.mondaq.com/india/copyright/1718746/exploring-the-dpiits-working-paper-on-generative-ai-and-copyright

**Known gaps not covered by verified sources:** India's DPDP Act requirements for health data; Indian consumer-app paid-conversion benchmarks; triptan non-response rates; US national migraine cost totals; FTC substantiation requirements for wellness claims; licences for LAION CLAP, Microsoft CLAP and VGGish weights.