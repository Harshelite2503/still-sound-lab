# Still: evidence-based product strategy for a sound-comfort lab built around individual differences

> **Implementation status (5 Nov 2026).** The comfort profile is now built and wired in: [dist/profile.html](../dist/profile.html), with a state selector shared with the sound lab, the questions, the reference level, a headphone check, the 7-band contour, the A/B tuner and the fingerprint player. All audio goes through one safety chain: a limiter with its makeup gain cancelled, then a hard clip at −3 dBFS. In place of the `confidence() ≥ 0.8` stopping rule below, the tuner uses a win streak: the favourite has to beat 4 challengers in a row, after at least 8 choices. In simulation, a GP "probability of being best" stayed pinned near 0.75 by unexplored regions, so it was not informative. Loudness matching uses A-weighting with low-frequency compensation capped at 8 dB, so dark sounds never clip. Still open from the roadmap below: the randomised spot check, the antiphase headphone test, Thompson sampling for the sound lab's sketches, the layer library and N-of-1 mode.


*Scope: a browser-only (plain HTML/JS, Web Audio, no backend) personal sound-comfort lab for people with migraine. This document only uses claims that a fact-checker marked **confirmed** or **partly-correct**, and partly-correct claims appear in their corrected form. Claims marked wrong, unverifiable or overstated are left out or restated honestly in Section 2. A few sources were added by the fact-checkers as "missed evidence" and were not themselves fact-checked. They are marked **[FC-added]**.*

*Repo state this plan builds on: `dist/comfort-engine.js` already has a 4-D spectral loop renderer (tilt, tonal mix, swell, cutoff), four listening states (`MODES`: 0 / -6 / -14 / -6 dB), a 7-band comfort contour (`CONTOUR_BANDS`, `contourEqDb` cuts only, capped at -12 dB), a Huggins-pitch stimulus and A-weighted level normalisation to -30 dBFS. `dist/preference-model.js` has a GP pairwise preference model (`PreferenceGP`, probit/Laplace, expected-improvement challenger, `startingPoint()`). Neither module is wired into the UI yet. `app.js` still uses `audio-engine.js` `recommend()`, which has fixed scores and a 6 Hz binaural example.*

---

## 1. What the evidence supports

Strength labels: **Strong** = guideline, standard, large or replicated study. **Moderate** = solid but small or single-group. **Weak** = conflicting or low certainty. **Preliminary** = pilot, n<30, or uncontrolled.

### 1.1 Sound sensitivity in migraine is real, varies with state, and differs a lot between people

- **Phonophobia is part of the definition of migraine without aura, but it is not required.** ICHD-3 1.1 criterion D needs nausea/vomiting **or** both photophobia and phonophobia. Migraine with aura (1.2) does not require phonophobia at all. ICHD-3 (IHS 2018). https://ichd-3.org/1-migraine/1-1-migraine-without-aura/ **Strong.**
- **Sound is the single most bothersome symptom for about 1 in 4-5 people.** In MAST (n=6,045 analysed, a US online research panel, 76% women, not a probability sample), the most bothersome symptom was photophobia for 49.1%, nausea for 28.1% and phonophobia for 22.8%. Phonophobia as the worst symptom was linked to cutaneous allodynia and less often to visual aura. Munjal et al. 2020, *Headache*. https://doi.org/10.1111/head.13708 **Strong** (size), but the panel is non-random.
- **Sensitivity persists between attacks in a minority.** In 274 patients at a single Spanish clinic, 24.5% reported interictal phonophobia. The number of hypersensitive senses predicted dizziness (OR 1.74) and vertigo (OR 1.72). Jaimes et al. 2025, *Brain and Behavior*. https://doi.org/10.1002/brb3.70874 **Moderate.**
- **Thresholds are lower between attacks and lower again during attacks.** Sound-aversion threshold (pure tones at 1/4/8 kHz, averaged, calibrated lab) was 90.4 dB in migraine vs 105.9 dB in controls. Within patients, it was 76.0 dB during attacks vs 91.0 dB between attacks. These are group means for the level at which a tone becomes "unpleasant or painful". They are not preferred listening levels for broadband sound. Ashkenazi et al. 2009, *Cephalalgia* (60 vs 52). https://doi.org/10.1111/j.1468-2982.2008.01834.x **Moderate.**
- **The direction has been replicated, and individual tolerance does not track severity.** In 65 migraineurs vs 80 controls, sound tolerance was lower both during and outside attacks, lower again when tested in pain, and not correlated with attack frequency, duration or severity. Vingen et al. 1998, *Cephalalgia*. https://pubmed.ncbi.nlm.nih.gov/9673802/ **Moderate.** (Pinheiro 2021 found *weak positive* correlations with frequency and intensity, so "clinical variables predict individual tolerance poorly and inconsistently" is the honest summary.)
- **Allodynia goes with greater sound sensitivity.** Allodynic patients' thresholds were 5.7 dB lower interictally (p=0.04) and 15.7 dB lower ictally (p=0.0008). Allodynia was measured by brushing with gauze, not with the ASC-12. Ashkenazi et al. 2010, *JNNP*. https://doi.org/10.1136/jnnp.2009.198481 **Moderate.**
- **Narrower comfort range across most frequencies, measured in a browser.** Online headphone test, 55 migraine vs 49 controls (unmatched, unsupervised): the range between just-audible and mildly-uncomfortable was narrower at 12 of 13 tones from 100 Hz to 12 kHz. 100 Hz was the only non-significant frequency, and the authors say "mid to high range" was most affected. Levels were uncalibrated slider positions set after a "rubbing palms" self-calibration. The during-attack subgroup was significant only on the cross-frequency average. Higher self-rated severity showed only a *tendency* toward wider ranges. Data are on GitHub. Mourgela, Vikelis & Reiss 2023, *Ear and Hearing* (CC BY 4.0). https://doi.org/10.1097/AUD.0000000000001339 **Moderate.**
- **How you measure changes the number.** In high-frequency/chronic migraine, ramp-type methods (method of limits, adaptive) gave lower thresholds than randomised constant stimuli (p=0.0002, p<0.0001), which the authors attribute to avoidance. Controls were stable across methods. Patients were still lower than controls under every method. Avoidance "modulates but does not condition" phonophobia. Ikumi et al. 2022, *Cephalalgia* (35 vs 25). https://doi.org/10.1177/03331024221111772 **Preliminary-to-moderate.**
- **Anxiety may gate day-to-day sound sensitivity.** In 6 patients tested over 27 days, sound sensitivity rose with headache intensity only when anxiety was high. Ikumi et al. 2024, *Cephalalgia*. https://doi.org/10.1177/03331024241230279 **Preliminary.**
- **Sound sensitivity is common in prodrome.** It appeared in 33.9% (1,630/4,802) of prodrome events in the PRODROME trial screening. That trial was industry-sponsored and enrolled only people who said they could recognise their prodromes, so this is not a population prevalence. Schwedt et al. 2025, *Neurology Clinical Practice*. https://doi.org/10.1212/CPJ.0000000000200359 **Moderate.**
- **Postdrome is common, and memory underestimates noise sensitivity.** 81% of 120 diary users reported at least one postdrome symptom, and 93% of attacks were back to normal within 24 h. The full text reports that light and noise sensitivity were underestimated on baseline recall compared with diary entries. Giffin et al. 2016, *Neurology* (full text PMC4955275). https://doi.org/10.1212/WNL.0000000000002789 **Moderate.**
- **Between attacks, cortical responses grow more steeply with loudness.** Intensity-dependence slope was 1.05 vs 0.64 µV/10 dB (14 vs 14), with potentiation instead of habituation. A pooled audit (624 vs 360) confirmed steeper intensity dependence but poor single-test diagnostic accuracy (sensitivity 45.7%, specificity 87.2%). Blinded studies have failed to replicate the habituation deficit [FC-added: Omland 2013]. Ambrosini et al. 2003, *Brain*; 2017, *Cephalalgia*. https://doi.org/10.1093/brain/awg206 **Moderate mechanism, contested.** Read this as indirect support for avoiding sudden loudness and identical repetition, and nothing more.
- **Everyday contexts matter between attacks.** Migraine groups reported more phonophobia in social situations. Migraine with aura and chronic migraine reported more when listening to conversations in noisy places. Pinheiro et al. 2021, *Applied Sciences* (women only, 4 x 30). https://www.mdpi.com/2076-3417/11/6/2474 **Preliminary.**
- **Blanket avoidance is not better than doing nothing; multi-component coping can help.** In an RCT (n=127, migraine and/or tension-type headache), "Learning to Cope with Triggers" (therapist-delivered graduated exposure plus CBT elements) reduced headaches by 35.9% vs +11.0% on waitlist. Pure avoidance (-13.2%) did not differ from waitlist. Martin et al. 2014, *Behav Res Ther*. https://doi.org/10.1016/j.brat.2014.07.002 **Moderate.** (The 2006 experiment's pattern of "short exposure sensitises, long exposure desensitises" was found in people **without** regular headaches. In headache sufferers it was "less clear". https://doi.org/10.1111/j.1526-4610.2006.00468.x)
- **Temporal auditory processing may differ.** Migraine groups performed worse on Gaps-in-Noise and Duration Pattern tests (n=41). Agessi et al. 2014, *J Headache Pain*. https://doi.org/10.1186/1129-2377-15-72 **Preliminary.**

### 1.2 Why one person's comfort is another's noise

- **Noise sensitivity is partly a trait.** Heritability was 36% (95% CI 20-50%) from a single questionnaire item in 573 twin pairs. Heinonen-Guzejev 2005. https://pubmed.ncbi.nlm.nih.gov/15989751/ The Big Five explained 33% of NoiSeQ variance, with the relationships differing by age and gender. Shepherd 2015. **Moderate.** (Long-term stability is not established by these sources.)
- **Misophonia is about pattern and meaning, not loudness.** Delphi consensus (15 experts): responses "do not seem to be elicited by the loudness", triggers are often repetitive and made by another person, and oral sounds are common. Swedo et al. 2022. https://doi.org/10.3389/fnins.2022.841816 In a UK Prolific sample stratified by sex, age and ethnicity, 18.4% (142/772) were above the S-Five cut-off. Vitoratou 2023. Trigger sounds produced exaggerated anterior insula responses. Kumar 2017. **Moderate.**
- **"Neutral" sounds are not neutral for everyone.** High-misophonia adults (n=132 vs 245 controls, online, self-identified) rated pleasant and neutral IADS sounds as more arousing, more unpleasant and more trigger-like. The IADS-M top list is: writing, whistling, restaurant, party, chewing. Trumbull et al. 2024, *PLoS One*. https://pmc.ncbi.nlm.nih.gov/articles/PMC11111082/ **Moderate.**
- **Hyperacusis covers different reactions.** These are grouped as loudness, annoyance, fear and pain. They are reaction categories, not validated subtypes. Tyler et al. 2014, *Am J Audiol*. https://doi.org/10.1044/2014_AJA-14-0010 **Moderate.**
- **The same noise helps one group and harms another.** White or pink noise improved lab attention tasks in youth and young adults with ADHD/elevated symptoms (g=0.249, k=13) and slightly impaired non-ADHD groups (g=-0.212, k=11). No brown-noise studies were found. Nigg et al. 2024, *JAACAP*. https://doi.org/10.1016/j.jaac.2023.12.014 **Moderate.**
- **Sensory differences in autism run in both directions.** Parent-reported auditory over-responsivity was 60.1% currently and 71.1% lifetime (single ADI-R item, mostly children). Carson 2022. https://doi.org/10.1007/s10803-021-04991-0 A meta-analysis found under-responsivity, over-responsivity *and* sensation seeking. Ben-Sasson 2009. **Moderate.**
- **Roughness aversion appears widely shared; consonance preference is learned.** Screams sit in a 30-150 Hz amplitude-modulation niche (roughness). Arnal 2015. https://doi.org/10.1016/j.cub.2015.06.043 Tsimane' listeners were indifferent to consonance but disliked roughness like Western listeners. McDermott 2016. **Moderate** (one non-Western population).
- **Among aversive sounds, unpleasantness concentrates at about 2.5-5.5 kHz with 1-16 Hz modulation.** Kumar et al. 2008, *JASA*. https://doi.org/10.1121/1.3006380 **Moderate.** The stimulus set was weighted toward screeching and grinding sounds. It explains what makes bad sounds worse, not what makes ambient sounds pleasant.
- **Amplitude modulation adds annoyance equivalent to extra level.** For broadband sound, 4-14 dB depth at 1-16 Hz carried a penalty equal to 4-12 dB more level (n=40). The "no penalty" condition was only 0.25 Hz at 1 dB depth. Virjonen et al. 2019. https://doi.org/10.1121/1.5133478 Modulation effects reached the equivalent of 8 dB, and random AM was worse than periodic AM (n=52, partly wind-turbine stimuli). Schäffer et al. 2018. **Moderate.**
- **Preferred spectral tilt is unsettled.** At 42 dB, a -7 dB/octave noise (**darker than brown**, which is -6) was most satisfying (n=23). Hongisto et al. 2015. https://doi.org/10.1121/1.4913273 A pilot (n=10) found high-frequency-heavy spectra more annoying. A wind-turbine-context study found more low-frequency energy more annoying. **Weak / conflicting.** [FC-added: Kuusinen, Rantanen & Hongisto 2024, n=40, supersedes the pilot.]
- **Soundscape perception reduces to two main axes.** Pleasantness explained 50% of variance and eventfulness 18% (100 listeners, 50 recordings). Axelsson et al. 2010. https://doi.org/10.1121/1.3493436 ISO/TS 12913-3 standardises the projection of 8 ratings onto these two axes (formula in Mitchell, Aletta & Kang 2022). Angles are English-centric, and language-specific angles exist. **Strong.**
- **Acoustics explain only a modest share of pleasantness.** In ARAUS (25,440 ratings, 605 young adults in Singapore), a 4-feature model cut validation MSE from 0.1553 (predict the mean) to 0.1357, and the best deep models reached about 0.121. Ooi et al. 2023. https://arxiv.org/abs/2207.01078 **Moderate.** The remaining variance mixes person-to-person differences with each person's own rating noise, so this *suggests* personalisation matters but does not prove it.
- **Water is not reliably calming as an added layer.** In ARAUS, 78.0% of bird maskers but only 19.5% of water maskers raised mean pleasantness. All wind, traffic and construction maskers lowered it, at -6 to +6 dB SMR on about 65 dB urban scenes. Water still did better than wind, traffic and construction. **Moderate.** A meta-analysis of natural sounds, by contrast, found the largest health and positive-affect effects for water (pooled g=1.63, CI 0.09-3.16, very heterogeneous) and lower stress/annoyance overall (g=-0.60). Buxton et al. 2021, *PNAS*. https://doi.org/10.1073/pnas.2013097118 **Weak-moderate.** Together: water depends on the person, the context and the level.
- **Feeling in control matters.** People with chronic pain chose music for "Cognitive Agency" and "Musical Integration". On average they preferred low energy, but individual choices ranged widely. Howlin et al. 2022, *Front Psychol* (n=70). https://doi.org/10.3389/fpsyg.2022.969377 **Preliminary.** In healthy volunteers under lab pain (n=76 analysed), personal preference dimensions predicted music analgesia. Basiński 2021. https://doi.org/10.1038/s41598-021-87943-z **Preliminary.** [FC-added: Howlin 2021 *Eur J Pain*: more perceived control of music predicted more pain tolerance.]
- **Music preference has a stable, genre-free structure.** Arousal, valence and depth track personality (N=9,454). Greenberg et al. 2016; Rentfrow et al. 2011. https://doi.org/10.1037/a0022406 **Moderate** (music only; applying it to noise textures is untested).

### 1.3 Interventions: what sound and audio can and cannot honestly offer

- **Music listening lowers pain by about 1 point out of 10 on average.** MD -1.13 across 97 RCTs, mostly procedural or perioperative, none in migraine attacks. Lee 2016. https://doi.org/10.1093/jmt/thw012 **Moderate.**
- **Self-chosen music may help more in chronic pain.** This comes from a subgroup comparison across 14 small, heterogeneous RCTs. Garza-Villarreal 2017. https://doi.org/10.36076/ppj/2017.7.597 In surgery, choice made no difference (Hole 2015; Kühlmann 2018). **Moderate, suggestive.**
- **App-delivered progressive muscle relaxation (PMR) reduced disability, not headache days.** MIDAS improved 25.09 vs 6.86 (P=.01), and 82.4% vs 45.7% improved by 5 or more points. Monthly headache days did not differ. **Median cumulative PMR use was 46.3 minutes over the whole study.** The dose-response split is post hoc. The authors have financial interests. 94 randomised, 69 analysed. Minen et al. 2025, *JAMA Netw Open*. https://doi.org/10.1001/jamanetworkopen.2025.34221 **Moderate.** The pilot showed feasibility at 2-4 sessions a week and about 11 minutes a session. Minen 2020. https://doi.org/10.1111/head.14010 **Preliminary.**
- **Behavioural therapies: guidelines are favourable, the Cochrane review is not.** The US Headache Consortium (2000) gave relaxation, biofeedback and CBT Grade A (confirmed via Buse et al. 2013, PMC3620418). The German 2017 guideline also lists them as effective (Kropp et al., https://doi.org/10.1007/s00482-017-0214-1). **But** [FC-added] Sharpe et al. 2019 Cochrane (21 RCTs) rated all the evidence very low quality, with no post-treatment effect on migraine frequency (SMD -0.02) and a higher responder rate (54% vs 24%). https://doi.org/10.1002/14651858.CD012295.pub2 **Moderate, contested.**
- **Biofeedback has a medium pooled effect, and home practice adds to it.** d=0.58 from 55 studies, mixing RCTs with pre-post designs. Nestoriuc & Martin 2007. https://doi.org/10.1016/j.pain.2006.09.007 **Moderate.**
- **Mindfulness (in-person MBSR) did not reduce migraine days.** It did improve disability, quality of life, self-efficacy and catastrophising. Wells et al. 2021 (n=89). https://doi.org/10.1001/jamainternmed.2020.7090 **Moderate.**
- **Music therapy for migraine has inconsistent evidence.** A positive explorative pediatric trial (Oelkers-Ax 2008, https://doi.org/10.1016/j.ejpain.2007.06.003) was followed by an adolescent trial no better than attention-placebo (Koenig 2013, https://pubmed.ncbi.nlm.nih.gov/23876282/). A systematic search found only 4 eligible studies. **Weak.**
- **A patient-controlled music app pilot reported fewer attacks.** -2.8 attacks a month, n=20, with no control group, so regression to the mean could explain it. Parlongue et al. 2021. https://doi.org/10.1016/j.ctim.2021.102779 **Preliminary.**
- **Binaural beats: low certainty for pain, inconsistent entrainment.** For pain, 16 RCTs were too heterogeneous to pool and rated low to very low certainty. Shamsi 2024. https://doi.org/10.1186/s12906-024-04339-y For EEG entrainment, 5 of 14 studies supported it, 8 contradicted and 1 was mixed, and no entrainment appeared when beats were embedded in pink noise. Ingendoh et al. 2023. https://doi.org/10.1371/journal.pone.0286023 **Weak.** [FC-added: Garcia-Argibay 2019, g=0.45 across mixed outcomes.]
- **Daily music improves subjective sleep in insomnia.** 25-60 minutes a day: PSQI MD -2.79, moderate certainty, compared against no treatment. Jespersen et al. 2022, Cochrane. https://doi.org/10.1002/14651858.CD010459.pub3 **Moderate.**
- **Continuous noise as a sleep aid has very low-quality evidence** and may harm sleep and hearing. Riedy et al. 2021. https://doi.org/10.1016/j.smrv.2020.101385 **Weak.**
- **Placebo response in acute migraine trials is large.** On placebo, 28.6% improved and 8.8% were pain-free at 2 h (98 trial reports). Macedo et al. 2006. https://pubmed.ncbi.nlm.nih.gov/16402240/ **Moderate.** In the Nerivio RCT the sham arm reached 38.8% pain relief at 2 h, against 66.7% active. Yarnitsky 2019. https://doi.org/10.1111/head.13551 **Strong.**
- **A useful analogy from vision.** Green light worsened migraine headache least among the colours tested. Noseda 2016, *Brain*. A small, unblinded, fixed-order follow-up reported fewer headache days. Martin 2021 (https://pmc.ncbi.nlm.nih.gov/articles/PMC8034831/). **Preliminary.** It supports framing Still as finding each person's *least-aversive* stimulus, not as offering relief.

### 1.4 Learning one person's preferences quickly

- **GP pairwise preference learning tuned 4 audio parameters in about 10-20 assessments (5-10 minutes)** for 10 hearing-impaired listeners, and the result was preferred over the clinical fit. **Correction:** each assessment used a continuous "degree of preference" slider, not a binary choice, so binary A/B may need more trials. Nielsen, Nielsen & Larsen 2015, *IEEE/ACM TASLP*. https://doi.org/10.1109/TASLP.2014.2377581 **Moderate.**
- **The GP preference model and its fitting method are standard.** Probit likelihood P(a≻b)=Φ((f(a)−f(b))/(√2σ)) with a Laplace approximation. Chu & Ghahramani 2005. https://doi.org/10.1145/1102351.1102369 **Strong (method).**
- **Active selection of the next comparison saves queries.** Expected improvement (Brochu et al. 2007) and preferential Bayesian optimisation (González et al. 2017, https://proceedings.mlr.press/v70/gonzalez17a) reduce comparisons by modelling correlation between settings. Evidence is simulation and small user applications. **Moderate.**
- **Single-slider "line search" converged faster than comparison designs**, in visual design tasks. Koyama et al. 2017. https://doi.org/10.1145/3072959.3073598 **Moderate** (not tested on audio).
- **Forced-choice pairwise judgements had the lowest measurement variance** of four methods (image quality). Mantiuk et al. 2012. https://doi.org/10.1111/j.1467-8659.2012.03188.x **Moderate.**
- **Information-gain pair selection ranks a discrete set without testing every pair.** Mikhailiuk et al. 2020 (ASAP). https://arxiv.org/abs/2004.05691 **Moderate.**
- **Thompson sampling** is a well-characterised way to balance trying new sounds against using known good ones. Russo et al. 2018. https://arxiv.org/abs/1707.02038 **Strong.** Pooling across users reduced regret by 26% in simulation built from mHealth data. Tomkins et al., *Machine Learning* 2021. https://doi.org/10.1007/s10994-021-05995-8 **Moderate.**
- **Micro-randomisation** (randomising the option offered at each decision point) makes within-person causal estimates possible. Klasnja et al. 2015. https://doi.org/10.1037/hea0000305 **Strong (method).**
- **App-supported N-of-1 trials were feasible and liked, but the main outcome was not significant.** PROMIS pain interference -1.36, 95% CI -2.91 to 0.19, P=.09. The trial was underpowered, so the result is inconclusive rather than proof of no effect. Kravitz et al. 2018. https://doi.org/10.1001/jamainternmed.2018.3981 **Strong design, inconclusive.**
- **Individual migraine association profiles are mostly unique.** 87% of 326 diary users had a profile, and 85% of those were unique. These are associations from 33 univariate tests per person with no multiplicity control, and the study was industry-funded. Peris et al. 2017. https://pubmed.ncbi.nlm.nih.gov/27179352/ **Moderate.**
- **Real adherence is low.** In a free consumer headache diary, median 90-day adherence was 0.34 and only 32.4% completed 90 days. Seng et al. 2018. https://pmc.ncbi.nlm.nih.gov/articles/PMC6945490 **Moderate.** Paid research EMA reaches about 82-84% (Williams 2021; Businelle 2024), and evening prompts had the highest completion at 89.9%.
- **Headphone screening can be done in the browser.** The Huggins-pitch test detects about 80% of headphone users but passes about 20% of loudspeaker users. Combined with the antiphase or beat test, false passes fall to about 7%. JS code is public. Milne et al. 2021. https://doi.org/10.3758/s13428-020-01514-0 **Moderate.**

### 1.5 Safety, regulation and privacy

- **WHO-ITU safe listening:** 80 dB(A) for 40 h/week (Mode 1) and 75 dB(A) for 40 h/week (Mode 2, children, and sensitive groups in WHO-ITU material), using equal-energy dosimetry. The in-force version is **H.870 V2 (03/2022)**. https://www.itu.int/rec/T-REC-H.870 and https://www.who.int/publications/i/item/9789241515276 (CC BY-NC-SA 3.0 IGO). **Strong.**
- **EU personal music players:** 80 dB(A) for 40 h, 89 dB(A) for 5 h (Decision 2009/490/EC). The 85 dB(A) default and 100 dB(A) maximum come from CENELEC safety standards, not from the Decision. **Strong.**
- **FDA General Wellness guidance (6 January 2026)** accepts software that coaches relaxation and "may help living well with migraine headaches". Music played to "soothe and relax" is not a device function. https://www.fda.gov/media/90652/download **Strong.** The migraine wording is tied to *relaxation coaching*, not to the sounds themselves.
- **EU MDR:** lifestyle and well-being software is not a medical device (Recital 19). Software that informs diagnostic or therapeutic decisions starts at Class IIa (Rule 11). MDCG 2019-11 Rev.1 (June 2025). **Moderate.**
- **Visual seizure risk is the established one.** WCAG 2.3.1: no more than three flashes in any one second. https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html **Strong.** No peer-reviewed report of a seizure caused by binaural beats was found. That absence does not prove safety.
- **Privacy:** 55% of headache diary apps with privacy policies said they used data for targeted advertising (a review of policies, not of traffic). Minen et al. 2018. https://doi.org/10.1111/head.13341 The FTC Health Breach Notification Rule, amended with effect from 29 July 2024, covers non-HIPAA health apps that are "vendors of personal health records". GDPR Art. 9 treats health data as special-category data. **Strong.**

---

## 2. What the evidence does NOT support (myths to avoid)

| Myth or tempting claim | What the evidence actually says |
|---|---|
| "Healing frequencies" (528 Hz, Solfeggio, any "migraine frequency") | No source in this review supports a frequency with healing properties. Still's own copy already calls 6 Hz "an example, not a proven treatment frequency". Keep it that way. |
| Binaural beats entrain the brain or treat migraine | Entrainment is inconsistent (5 of 14 studies support it). Pain evidence is low to very low certainty. No migraine RCT exists. The Lovati 2019 binaural migraine letter has no abstract, and its reported results are unverifiable. |
| Any sound or music prevents or treats migraine | Music therapy was no better than attention-placebo (Koenig 2013). The positive app pilot was uncontrolled (n=20). No dataset links sounds to migraine outcomes. |
| A before/after pain drop proves a sound worked | 28.6% improve on placebo at 2 h, and sham neuromodulation reached 38.8% relief. Natural attack course and regression to the mean are large. |
| Brown (or pink) noise is best for everyone | Studies conflict. The best-rated slope in one study (-7 dB/oct) is darker than brown. Tilt has to be personalised. |
| Water or nature sounds are universally calming | Only 19.5% of water maskers helped on average in ARAUS. Misophonia and YouTube feedback show strong aversions. A meta-analysis found water positive overall. It depends on the person. |
| Quieter and darker is always better / everyone with migraine is sound-sensitive | Migraine can be diagnosed via nausea without phonophobia. Noise helps some ADHD listeners and harms others. Sensation seeking exists. |
| Severity or attack frequency tells you someone's tolerance | Vingen 1998 found no correlation. Mourgela 2023 found an opposite-direction tendency. Pinheiro 2021 found weak positive correlations. Tolerance has to be measured. |
| Avoid every trigger | Pure avoidance was no better than waitlist in Martin 2014. But exposure work there was therapist-delivered and multi-component, so do not claim exposure therapy either. |
| "Short exposure sensitises migraineurs" (so sessions must be long) | Shown only in people without regular headaches. Do not set minimum session lengths from it. |
| The app can show dB SPL, measure cortical excitability, or diagnose | Browser output is uncalibrated. Evoked-potential markers do not diagnose individuals. Never show fake dB SPL. |
| Fast-modulated "focus music" suits migraine | Brain.fm's study was industry-led. Its benefit was specific to beta-range (~16 Hz) modulation in people with ADHD symptoms, and 1-16 Hz modulation raises annoyance. |
| Pink noise boosts deep sleep | That effect needs EEG-timed closed-loop delivery, which a browser cannot do. |
| Liking falls with overexposure (a "familiarity inverted-U") | Overstated. For familiarity, the follow-up found a linear rise. Any time decay is a heuristic. |
| "Phonophobia affects 41-77% of migraineurs" or any single headline % | Unsourced. Prevalence varies with phase and measurement. Do not show a single number. |
| "Sensitivity is greatest at high frequencies" (citing Ashkenazi) | Ashkenazi reported only averages across frequencies. Mourgela points to mid-high, with only 100 Hz non-significant. |
| "Loudness is first and sharpness second" as a universal ranking | Unverifiable from the cited sources. |
| Behavioural therapy for migraine is "strong" evidence | The 2000 Grade A guideline conflicts with the 2019 Cochrane review (very low quality). Say "recommended by guidelines; evidence quality debated". |
| Validated questionnaires can be embedded freely | HIT-6 is copyrighted (QualityMetric/GSK). ASC is licensed via Mapi. HQ, WNSS and S-Five need permission. |
| Every tested migraine product is hardware or a diary | Wrong: the RELAXaHEAD app was tested in RCTs. |
| Kumar's 2.5-5.5 kHz × 1-16 Hz region proves binaural beats are unpleasant | Misapplied. Dichotic beats have no amplitude modulation at either ear. Over **speakers**, though, the two carriers mix acoustically into real 1-12 Hz beating, which the AM-annoyance work (Virjonen) does penalise. |

---

## 3. Core insight: personalise a small set of perceptual dimensions on top of the person's state

The literature agrees with the YouTube comments: **between-person variance is large, structured, and poorly predicted by diagnosis or severity.** Acoustics alone predict only a modest share of pleasantness (ARAUS). Trait, condition, state and meaning all shift it. So Still should not search a library for "the best sound". It should learn **each person's comfort region** in a small, interpretable perceptual space, **separately for each state**, with hard vetoes for meanings the person cannot tolerate.

### 3.1 Five dimensions, a state modifier and a goal

| # | Dimension | Parameters Still controls | Why it is on the list | Default (migraine-safe) |
|---|---|---|---|---|
| 1 | **Level relative to personal ceiling** | gain in dB relative to the user's anchor; ceiling per state | Strongest and most consistent effect (Ashkenazi, Vingen, Mourgela). Loudness drives annoyance. | -6 dB under the anchor; ceiling = anchor + contour median + state offset |
| 2 | **Spectral balance** | tilt -9 to -1.5 dB/oct; soft top-end cutoff 300-6000 Hz; personal 7-band contour cuts (0 to -12 dB); optional 2.5-5.5 kHz soften | Range narrows in mid-high bands (Mourgela). Preferred tilt varies (Hongisto vs Schäffer). Aversive-sound region at 2.5-5.5 kHz (Kumar 2008). | Taken from `startingPoint()`: darker if hiss bothers the person, brighter if rumble does |
| 3 | **Temporal modulation** | slow swell 0.05-0.25 Hz at 0-6 dB depth; fluctuation 1-16 Hz (avoid); roughness 30-150 Hz (universal penalty) | AM adds annoyance equal to 4-12 dB of extra level. Roughness aversion is widely shared. | Swell ≤1 dB at ≤0.25 Hz (the only tested no-penalty point). No 1-16 Hz or 30-150 Hz modulation. |
| 4 | **Onset predictability / eventfulness** | fade-in/out length; transients per minute; crest factor; event density | Fear-type hyperacusis reactions. The painful "ping" report. Steeper loudness growth (Ambrosini). Eventfulness is the second soundscape axis. | Fade-in ≥3 s (6 s in attack). No UI sounds. Event density about 0. |
| 5 | **Semantic category** | tags: water/drips, mouth/breath, tapping/clicking/ticking, voices, birds, wind, tonal, user-uploaded | Misophonia does not respond to loudness changes. Water splits people (ARAUS, YouTube). | Water and mouth sounds are opt-in. Hard veto with one tap. |
| (5b) | **Spatial presentation** (constraint, not learned) | mono / narrow stereo / dichotic | Dizziness and multisensory sensitivity (Jaimes). Over speakers, binaural carriers produce monaural beating. | Mono or narrow stereo. Dichotic only after a passed headphone check. |
| **State** | normal / warning signs / attack / recovering | offset, shelf, swell cap, fade (already in `MODES`) | Thresholds about 15 dB lower in attacks. Prodrome, postdrome and anxiety effects. | 0 / -6 / -14 / -6 dB as *starting heuristics* the user overrides |
| **Goal** | relief / focus / wind-down | separate models per goal | The ADHD noise finding shows the best sound depends on the goal. Sleep evidence is separate. | Relief |

### 3.2 The measurable personal profile (stored locally, versioned JSON)

```text
profile.v1 = {
  traits: {                        // Tier-0 onboarding, original non-diagnostic items, answers 0-4
    attackSoundBother, mostBothersome, aura, suddenBother, highBother, lowBother,
    pulseBother, multisensory, dizziness, triggerCategories[], lovedCategories[],
    listening: 'headphones'|'speakers', goalDefault
  },
  device: { id: hash(outputDeviceLabel), headphoneCheck: {hp:pass|fail, ap:pass|fail, at} },
  calibration: {                   // all values in dB relative to REFERENCE_DBFS, per device
    anchorDb,                      // "comfortable" level for reference noise
    contour: { normal:[{hz,ceilingDb}x7], attack:[...]|null },
    spotCheck: { slope, l50 }      // logistic fit from the randomised-level check
  },
  learned: {
    gp: { normal:{points,comparisons}, attack:{...} },     // PreferenceGP.toJSON()
    champion: { normal:x[4], attack:x[4] },
    ranks: { soundId: {mu, s2} },                           // discrete library (Glicko-style)
    bandit: { "family|state|env": {s, f, lastAt} },         // Beta counts with decay
    vetoes: { hard:[category|soundId], soft:[{id, ctx, until}] }
  },
  sessions: [{ t, state, env, anxiety, painBefore?, comfortPad:{x,y}, followUp, soundId,
               x?, gainDb, durationS, propensity, armSet[] }],
  experiments: [ ... N-of-1 protocols and results ... ]
}
```

What the user sees is a **fingerprint card**, built by extending the existing `describeX()`. For example: "Between attacks you prefer *balanced, softened top end, steady*. During attacks you listen about 14 dB quieter and darker. Water and tapping are off. Based on 23 comparisons, confidence 0.81."

---

## 4. Product design

### 4(a) Onboarding: a sensitivity and comfort calibration that is safe during or near migraine

**Principles:** never push toward discomfort; start every sound from silence; release stops sound; set OS volume low *before* any sound plays; skip calibration entirely during an attack; label everything as relative and non-diagnostic.

**Tier 0. Questions (about 60 s, required, no sound).** Use original plain-language items, because validated scales are not licensed. Ask:
- How often sounds bother you in attacks (never / sometimes / usually / always)
- Most bothersome symptom
- Aura yes/no
- Bother from sudden / high-pitched / low rumble / pulsing sounds (0-4)
- Light, smell or motion sensitivity, and dizziness
- Categories you can't stand and categories you love (multi-select)
- Headphones or speakers
- Goal

These feed `startingPoint()` (already implemented). "Always" or sound-as-worst-symptom selects the conservative profile: an extra -6 dB, stronger shelf and longer fades.

**Tier 1. Comfort calibration (3-5 minutes, optional, between attacks only).**

0. *Pre-flight:* "Turn your device volume down to about a quarter." Read the output device (`navigator.mediaDevices.enumerateDevices`). Listen for `devicechange` to trigger a re-anchor later.
1. *Headphone check* (only needed to unlock dichotic content). Run Huggins-pitch **and** the antiphase test at -40 dBFS (about a 7% false-pass rate combined, vs about 20% for HP alone). `renderHuggins()` exists. Reuse or port the ChaitLabUCL/HeadphoneCheck_Test logic.
2. *Anchor.* Play reference noise at -6 dB/oct starting at -60 dBFS. A press-and-hold control raises it by +2 dB every 0.5 s with 0.5 s ramps, and releasing fades out over 300 ms. The user marks "comfortable, like quiet conversation". This sets the 0 dB anchor. The ramp is hard-capped at -12 dBFS.
3. *Contour* (an adapted Mourgela protocol, using narrowband noise rather than pure tones, through `renderBand()`). For each of the 7 bands (125-8000 Hz), start at anchor -30 dB and raise with the same press-and-hold control. The user marks **"the loudest that still feels fine"**. We do not ask for "mildly uncomfortable". Hard stop at anchor +10 dB. This gives `contour.normal`, and `contourEqDb()` turns it into cuts only (≤ -12 dB).
4. *Spot check against avoidance bias (Ikumi 2022).* Play 6-8 one-second clips (1 s fades) at **randomised** levels drawn only between anchor -12 dB and the marked ceiling. Never above it. The user answers OK or "too much". Fit P(too much) = 1/(1+e^{-(L−L50)/s}) and set the effective ceiling = min(marked ceiling, L50 − 3 dB).
5. *Tilt preference.* 3-4 loudness-matched two-alternative choices (A-weighted RMS, already in `renderComfortLoop`): -3 vs -7 dB/oct, then bisect.
6. *Modulation tolerance.* Steady vs 0.25 Hz/1 dB vs 0.25 Hz/3 dB, at equal loudness. Fast 4 Hz/6 dB is opt-in only.
7. *Categories.* 3-second previews with 1 s fades for chosen categories. Each preview can be vetoed.

**Attack-state calibration.** Do not run steps 2-6. Apply the state offset, then offer one "a bit quieter / OK" choice. Store any answer in `contour.attack`.

**Tier 2. Deeper profile (optional, later).** Add ASC-12, noise sensitivity, hyperacusis items, and HIT-6 or MIDAS every 4-12 weeks **only after licences are cleared**. Until then use original items labelled "not a validated scale".

### 4(b) Attack mode vs between-attack mode

| | Normal day | Warning signs | **During attack** | Recovering (≤24 h, then prompt) |
|---|---|---|---|---|
| Level offset vs normal ceiling | 0 dB | -6 dB | **-14 dB** (heuristic from Ashkenazi's group mean; user can override) | -6 dB |
| High shelf (≥3 kHz) | 0 | -3 dB | -6 dB, plus top-end cutoff ≤2-4 kHz | -3 dB |
| Swell cap | user-set (default 1 dB) | ≤1 dB | ≤1 dB (existing code says 1) | ≤1 dB |
| Fade-in / out | 3 s / 2 s | 4 s / 3 s | 6 s / 3 s; "too much" fades out over 300 ms | 4 s / 3 s |
| What's offered | full library, tuner, exploration (20% randomisation floor), N-of-1, PMR program | top-5 safe sounds + gentle new options | **"Silence + dark screen" first**, then top 3 *known-safe* sounds for this state. No new sounds. Binaural off. No exploration. | top-5 safe sounds |
| Prompts | 1 follow-up after session, optional evening check-in | 1 follow-up | **none** (do-not-disturb) | 1 follow-up |
| UI | dim default | dim | very dim, large targets, no animation, no countdown sound | dim |
| Optional audio skills | PMR 10-15 min, paced breathing, body scan, wind-down 25-45 min | short breathing | 5-minute slow-breathing voice, very low, optional | PMR short form |

Mode changes ramp the gain over 3-5 s and never jump. The "Recovering" state ends after 24 h with a prompt to switch back (Giffin 2016: 93% of attacks back to normal within 24 h).

### 4(c) Layered sound engine

All synthesis is offline in the frequency domain (existing `renderComfortLoop`), so every loop is seamless and level-normalised to `REFERENCE_DBFS` = -30 dBFS A-weighted.

| Layer | Content | Parameters and ranges | Notes |
|---|---|---|---|
| L0 Silence | explicit "no sound" arm | none | Counts as an option in learning and N-of-1. Shown first in attack mode. |
| L1 Bed | shaped noise | tilt -9 to -1.5 dB/oct; low-pass 300-6000 Hz (4th order); high-pass 40 Hz | existing x[0], x[3] |
| L2 Hum | soft harmonic tone | f0 100-350 Hz; harmonic mix x[1] 0-1; spectral roll-off follows tilt | Roughness guard: any detuned or chorused partials beat at <0.5 Hz, and no two non-harmonic partials in the same ear sit 30-150 Hz apart |
| L3 Events | rain/drip/bird/wind elements | density 0-30 events/min (default 0-3); impulsiveness 0-1 (default 0.1); per-element on/off | Disabled when the category is vetoed. Water is opt-in. Mixed ≥10 dB below the bed by default (a design choice; the ARAUS +10 dB idea was an untested hypothesis for wind) |
| L4 Library / uploads | CC0 loops or the user's own sounds | passed through the "soften" chain if flagged | analysis flags below |
| L5 Stereo carrier experiment (binaural) | L/R sines | carriers 100-600 Hz; difference 0-10 Hz (keep within the 5-10 Hz studied range when used) | Off by default. Headphones only (HP+AP pass). Mono-safe fallback with zero difference. Never in attack mode. Labelled "experimental" |
| L6 Voice | PMR / breathing guidance | pre-recorded or Web Speech; ducks beds by 6 dB | the evidence-backed core between attacks |
| Global swell | slow AM | 0.05-0.25 Hz; depth 0-6 dB (default ≤1 dB) | Only 0.25 Hz at 1 dB was penalty-free in the tested data. Note: the current `MODES.normal.swellCapDb = 6` should become a user cap, with a default of 1 |

**Master chain (every source, including uploads):**
`source → personal contour EQ (cuts only, ≤ -12 dB) → state shelf → gain node (slew-limited ≤6 dB/s, a heuristic) → DynamicsCompressorNode limiter (threshold = effective ceiling, ratio 20, knee 0, attack 0.002 s, release 0.25 s) → destination`.

- Gain ceiling = anchor + contour median + state offset. A one-time confirmation appears above +6 dB and a hard cap sits at +10 dB over the anchor.
- Fades run on start, stop, skip, `visibilitychange`, and `devicechange` (fade to 0, then ask the user to re-anchor).

**Analysis additions for uploads and recordings** (extending `analyzeAudio`):
- Crest factor (peak/RMS, flagged >12-15 dB, a heuristic)
- Transient count (onsets >12 dB above 400 ms short-term RMS)
- High-band (>4 kHz) energy share
- **Fluctuation index**: depth of the 50 ms-RMS envelope spectrum at 1-16 Hz
- **Roughness index**: envelope energy at 30-150 Hz (from the 2 ms-RMS envelope)
- **Mid-high index**: 2.5-5.5 kHz share × fluctuation depth (a new heuristic, not validated)

Each produces a plain tag ("has sudden peaks", "hissy", "flutters"). One tap on "soften" applies look-ahead compression, a -6 to -12 dB peak near 3.5 kHz with Q of about 1, and a high shelf.

### 4(d) Learning algorithm (browser-only, three tiers plus a simple first step)

**Step 0 (one-line replacement for the fixed 0.65 weight).**
`score_a = (k·prior_a + n_a·mean_a)/(k + n_a)` with k=4. Here prior_a is the acoustic score mapped to [-1,1], n_a is the number of ratings of sound a in this state and environment, and mean_a is their average comfort. Show "x% from your own ratings" = n/(n+k).

**Tier A: continuous comfort tuner (`PreferenceGP`, already written).**
- Space: x ∈ [0,1]^4 (tilt, tonal, swell, cutoff). Prior f ~ GP(0, k), with k(x,x') = s²·exp(−‖x−x'‖²/(2ℓ²)), s²=1 and ℓ=0.3 (grid {0.15, 0.25, 0.4} by marginal likelihood after 10 or more comparisons).
- Likelihood per comparison i (winner w, loser l, weight ω_i): ω_i·log Φ(z_i) with z_i = (f_w − f_l)/(√2σ) and σ=0.5.
- Laplace fit: Newton on Ψ(f) = Σ ω_i log Φ(z_i) − ½fᵀK⁻¹f, at most 20 iterations, tolerance 1e-6. Prediction: μ(x*) = k*ᵀK⁻¹f̂ and v(x*) = k** − k*ᵀ(K + W⁻¹)⁻¹k*, where W is the negative Hessian of the log-likelihood.
- Next pair: champion = argmax μ over evaluated points. Challenger = argmax expected improvement EI(x) = (μ−μ*)Φ(u) + √v·φ(u), with u=(μ−μ*)/√v, over 384 random candidates at distance ≥0.18 from the champion (existing `nextChallenger`).
- Answers:

| Answer | What the model records |
|---|---|
| A calmer / B calmer | ω=1 |
| A much calmer | ω=1.5, a graded response approximating Nielsen's slider |
| About the same | both directions at ω=0.5 |
| Both unpleasant | both points go to the soft-veto list and the search region shrinks away from them |
| This hurts, stop | instant 300 ms fade, both points hard-vetoed, session ends |

- Protocol: pairs are loudness-matched (A-weighted). A/B order is counterbalanced. Each clip is 6-8 s with 1.5 s fades and a 1 s gap. Sessions last at most 10 minutes. Stop when `confidence()` (P(champion is best) from posterior samples) is ≥0.8, or after 20 pairs. Every 10th pair retests an old pair to measure consistency, and low consistency raises σ.
- Keep **separate GPs per state** (normal and attack). The attack GP starts from the normal champion, darkened.

**Tier B: ranking the discrete library (Glicko/TrueSkill-style, closed form).**
Each sound i has skill N(μ_i, σ_i²), starting at μ=0, σ²=1, β=0.5. After w beats l:
`c² = 2β² + σ_w² + σ_l²`, `t = (μ_w − μ_l)/c`, `v = φ(t)/Φ(t)`, `ω = v(v + t)`
`μ_w += (σ_w²/c)·v`, `μ_l −= (σ_l²/c)·v`, `σ_w² *= 1 − (σ_w²/c²)·ω`, `σ_l² *= 1 − (σ_l²/c²)·ω`.
Next pair: maximise `(σ_i² + σ_j²)·exp(−(μ_i−μ_j)²/(2(σ_i²+σ_j²+β²)))` over non-vetoed pairs. Expected convergence of about 2-3 comparisons per item is unverified and should be checked by simulation.

**Tier C: "what to offer right now" (contextual Thompson sampling with safety constraints).**
- Arms are sound families (each instantiated at that user's tuned champion) plus Silence. The context bucket c = (state, environment).
- Reward r=1 if the follow-up says "more comfortable". "Same" gives r=0. "Worse" gives r=0 and adds 2 extra failures (a harm penalty).
- Prior from acoustic score p0 with strength m=2: α0 = 1 + m·p0, β0 = 1 + m(1−p0).
- Hierarchical back-off: `Beta(α0 + s_{a,c} + λ·s_{a,·}, β0 + f_{a,c} + λ·f_{a,·})`, λ=0.3.
- Counts decay as `count·0.5^(Δdays/60)`. This is a heuristic, not evidence-derived.
- Policy: drop hard-vetoed arms. In attack, the eligible set is the top 3 known-safe arms plus Silence, and there is no randomisation floor. Otherwise, with probability ε=0.2 pick uniformly from eligible arms, else take argmax of one Beta draw per arm (two Gamma draws via Marsaglia-Tsang). At most 1 in 3 offered arms may be new. **Log the propensity π(a|c)** with every offer.
- Within-person effect estimate (later, on device): `Δ̂(a vs Silence) = (1/N)Σ[r_t·1{a_t=a}/π_t − r_t·1{a_t=Silence}/π_t]`.

**Two quantities kept separate.** *Comfort preference* is learned quickly by Tiers A-C. *Pain effect* is only estimated in N-of-1 mode (4e). Raw before/after pain changes never become a badge or a ranking signal.

### 4(e) Personal N-of-1 experiments

- **Questions:** "Is my tuned sound better than silence?", "Rain vs hum?", "Is the stereo-carrier (binaural) version better than the same tones without the difference?" The last one is headphones-only. Its control is identical carriers in both ears, labelled neutrally as "Version K" and "Version M", with assignment hidden.
- **Design:** randomised blocks ABBA/BAAB with one condition per eligible episode (normal/warning days, or attack if the user opts in). Target 4-6 episodes per condition (8-12 total). The protocol is pre-registered in the app before the first episode and is locked.
- **Outcomes:**
  - Primary: comfort/discomfort 0-10 at 0 and 20-30 minutes.
  - Secondary: pain 0-10 change and a "made it worse" flag.
  - Optional: anxiety as a covariate.
- **Analysis:**
  - Per-episode change y_t. Model y_t = μ + δ·1{A} + ε, with ε ~ N(0, σ²) and σ estimated from the data with a floor of 1.5.
  - Skeptical prior δ ~ N(0, 1²).
  - With n_A and n_B episodes, using the difference of means d̄ and its variance s² = σ²(1/n_A + 1/n_B): posterior precision = 1 + 1/s², posterior mean = (d̄/s²)/(1 + 1/s²).
  - Report P(δ > 1 point) = 1 − Φ((1 − mean)/sd) as "likely helps you" (≥0.8), "unclear" (0.2-0.8) or "unlikely" (≤0.2).
- **Honesty:**
  - Always show "Many personal experiments end unclear. That is normal."
  - Explain the placebo and natural-course effect in one line.
  - The structure follows CENT 2015, and the result can be exported as a clinician-readable PDF/JSON.

### 4(f) Safety rails (non-negotiable)

1. **No sound the user did not start.** No UI sounds, chimes or startup ping. Every sound fades in (≥3 s, or 6 s in attack) and out (≥2 s), including on tab hide, skip, device change and errors.
2. **Personal ceiling, limiter and slew limiter on every output**, including uploads and the analyser's own playback. Confirmation above anchor +6 dB, hard cap at +10 dB. The ceiling is re-anchored whenever the output device changes.
3. **Never measure discomfort or pain thresholds.** Only "still feels fine" levels, from silence upward, with release-to-stop. Randomised spot checks stay below the user's own mark.
4. **Attack mode is protective:** Silence first, known-safe sounds only, no exploration, no prompts, no binaural.
5. **Vetoes always win.** "Hurts / stop" or "made me nauseous" creates a hard veto for that sound or category. "Both unpleasant" creates a soft veto. The recommender cannot sample vetoed items.
6. **Binaural is opt-in, headphones-gated (HP+AP), never during attack**, with a one-time notice: "If you have epilepsy or sound-triggered seizures, check with your clinician. Stop if you feel unwell or nauseous." Mono-safe fallback.
7. **Visuals:** WCAG 2.3.1 (never more than 3 flashes per second), respect `prefers-reduced-motion`, dim dark theme by default, and visuals never synchronised to beat frequencies. Spectrogram animation is off by default for users who report multisensory sensitivity or dizziness.
8. **Listening dose:** a weekly estimate based on relative gain × time (equal-energy, +3 dB halves the allowance). It is labelled "estimate, not measured". Sleep timer default 30-60 minutes with a 3-5 minute fade.
9. **No medical claims.** A claims linter in `npm test` fails the build on UI strings containing: treat, cure, relieve migraine, prevent, therapy, clinically proven, heal, reduce attacks. Approved wording: "a personal space to find sounds that feel tolerable", "relaxation skills that may help you live well with migraine".
10. **Red flags.** Persistent text: new or worst-ever headache, neurological symptoms, sudden hearing loss or new tinnitus → seek medical care.
11. **Gentle tolerance practice** (later, optional). Available only on normal days with pain ≤3/10. Steps of +1-2 dB or slightly brighter, user-initiated, never above the user's own mark, and never auto-escalating. Framed as "discuss with your clinician", because the supporting trial was therapist-delivered and multi-component.
12. **Privacy:**
    - Data stays in IndexedDB on the device.
    - Strict CSP (`connect-src 'self'`, no third-party scripts or analytics).
    - Optional passphrase encryption (WebCrypto AES-GCM with a PBKDF2-derived key).
    - One-click export and delete-all.
    - Microphone recordings are analysed locally and discarded by default.
    - Any future sync or research sharing requires separate consent per purpose and an HBNR/GDPR plan.

---

## 5. Datasets and tools worth using

| Resource | Licence | Concrete use in Still | Caveats |
|---|---|---|---|
| **Mourgela 2023 data** (github.com/amourgela/supplementalmaterial) | No licence file in the repo (article is CC BY 4.0). Ask the authors before redistributing. | Weak population prior on the shape of the 7-band contour (which bands narrow most) | Values are slider positions, not dB. Normalise per listener. |
| **SATP v1.5** (zenodo.org/records/18715282) | CC BY 4.0 | Commercial-safe training data for an offline pleasantness/eventfulness prior. **Validated wording in 21 languages** for the comfort pad. | London urban recordings |
| **ISD** (zenodo.org/record/5578572) | CC BY 4.0 | Cross-check that a prior generalises across cities and cultures. CC BY ambient material with attribution. | 16.2 GB; alpha release |
| **ARAUS v4.2** (doi:10.21979/N9/9OTEVX) | **CC BY-NC 4.0**; maskers carry their own CC licences | Non-commercial prototype only: an offline ridge model of ISOPleasant from browser-computable features × noise-sensitivity score, shipped as about 10 JSON coefficients | Young Singapore lab sample. Model inputs need calibrated levels, so use rank order only. |
| **FSD50K** (doi:10.5281/zenodo.4060432) | Dataset CC BY. **19,873 CC0 clips.** Contact the authors before commercial use. | Curate 20-40 CC0 loops (rain, stream, wind, birds), pre-screened with the analyser flags and loudness-normalised. Generate a licence manifest at build time. | Check per-clip licence metadata |
| **ESC-50** | CC BY-NC (ESC-10 is CC BY) | Offline benchmark for a category tagger only | Never ship its audio. Preprocessing leakage noted. |
| **Freesound API v2** | Free for non-commercial use only | Curation-time search (CC0 filter, roughness/brightness descriptors) | Never call it from the client (key exposure, terms) |
| **Meyda.js** | MIT | Sharpness, flux, Bark loudness (relative), spectral features for the analyser and prior | Loudness is not normalised. Centroid is in bins. |
| **Tone.js** | MIT (widely documented; not re-fetched) | Optional scheduler and ramps for the event layer | The current spectral renderer may be enough |
| **loudness-worklet** (npm) | MIT | BS.1770 LUFS/true-peak for uploads, measured offline | Young package (v2.1.0). Pin the version. |
| **MoSQITo** | Apache-2.0 | Reference implementation and test vectors for porting loudness, sharpness and roughness indices to JS | Python; validated on calibrated input |
| **Soundscapy** | BSD-3 | Offline ISO 12913-3 projection and density plots for building priors and reference maps | |
| **HeadphoneCheck_Test** (ChaitLabUCL) | Not verified | Port the Huggins-pitch and antiphase stimuli and pass rules | Cite Milne 2021 |
| **sequential-line-search** (Koyama) | MIT | Reference for a later "slide to comfort" mode | Visual domain |
| **ASAP** (gfxdisp/asap) | MIT | CPU reference to validate the Tier-B pair selector | |
| **StudyU** | MIT | Design reference for the N-of-1 protocol and export | |
| **CENT 2015** (doi:10.1136/bmj.h1738) | BMJ (check reuse) | Structure of the clinician export | |
| **Europe PMC REST API** (ebi.ac.uk endpoint) | Free API | Offline script to refresh the in-app evidence page | |
| **ITU-T H.870 V2 / WHO-ITU** | ITU terms; WHO CC BY-NC-SA 3.0 IGO | Spec for the dose meter and messaging | Quote the figures; do not reproduce the text commercially |
| **YAMNet** | tensorflow/models repo is Apache-2.0 | Later: on-device auto-tagging of uploads (water, chewing, speech) so vetoes apply automatically | Treat scores as rankings |
| **Avoid** | | | Essentia.js (AGPLv3 unless Still is AGPL). Kaggle 400-patient migraine set (single site, leakage, no sound data). IADS-2/E (restricted; use only the published IADS-M category list). Emo-Soundscapes, Emotify and PMEmo audio (unclear or copyrighted). DEAM (BY-NC). |

---

## 6. Prioritised build roadmap

### NOW: P0 safety pass (in the existing plain-JS prototype)

1. **Silence-first audio path.**
   - Remove every UI or startup sound.
   - Route all playback (sketches, uploads, analyser preview) through one `createOutputChain(ctx, profile)` that adds the contour EQ, state shelf, a slew-limited gain (`setTargetAtTime` with τ chosen for ≤6 dB/s), and a DynamicsCompressorNode limiter (ratio 20, attack 0.002, release 0.25, threshold = effective ceiling).
   - Fades ≥3 s in, ≥2 s out, including on `visibilitychange`, `devicechange` and errors.
   - Test: rendered output never exceeds the ceiling, and the first 100 ms of every start is below -40 dBFS.
2. **Binaural sketch.** Off by default, renamed "Stereo carrier tones (experimental)", gated behind HP+AP checks, mono-safe fallback, never in attack mode, epilepsy and nausea notice. In `recommend()`, its score stays lowest and it is excluded unless opted in.
3. **Visual safety.** `prefers-reduced-motion` respected, spectrogram animation capped at 3 flashes per second and below WCAG luminance thresholds, dim dark theme by default.
4. **Claims linter and red-flag copy.** `tests/claims.test.mjs` scans `dist/*.html|js` for banned words. Footer red-flag text.

### NOW: P1 wire up what is already built

5. **State selector** on every session (Normal / Warning signs / During attack / Recovering) using `MODES`, with the attack UI defined in 4(b). "Recovering" auto-expires after 24 h with a prompt.
6. **Tier-0 onboarding** (60 s, original items) → `startingPoint()` → first sound, plus trigger/love category picks → vetoes.
7. **"Find my comfort sound" tuner.**
   - Use `renderComfortLoop` + `PreferenceGP`.
   - Five buttons: A calmer / B calmer / about same / both unpleasant / stop.
   - A "much calmer" modifier.
   - 12-20 pairs; stop at `confidence() ≥ 0.8`.
   - Champion saved per state; fingerprint card from `describeX`.
   - Change the swell default to ≤1 dB, with the cap user-adjustable up to 6.
8. **Calibration flow** from 4(a): anchor, 7-band contour, randomised spot check, tilt and modulation choices. Stored per device id, with re-anchoring prompted on `devicechange`.
9. **Simulation tests for budgets.** A synthetic user with a known optimum and probit noise σ ∈ {0.5, 1.0}. Assert the champion lands within 0.2 of the optimum in ≤20 binary comparisons in at least 80% of seeds. If not, raise the budget or adopt graded responses. This turns Nielsen's 10-20 figure into a measured number for Still.

### NOW: P2 learning and logging

10. **Replace the fixed 0.65 weight** with Step-0 shrinkage (k=4) immediately, then Tier-C Beta-Thompson sampling with back-off, a 20% floor outside attacks, Silence as an arm, logged propensities, harm penalties and decay. Unit tests: vetoed arms are never chosen; attack offers only known-safe arms.
11. **Low-burden logging.**
    - Before playing: 3 taps (state, environment, optional pain 0-10, optional anxiety low/med/high).
    - One follow-up at 20-30 minutes: comfort better/same/worse, a "made it worse" flag, and an optional 2-D comfort pad (unpleasant↔pleasant × calm↔too much).
    - No daily diary, no streaks.
    - Optional evening check-in, opt-in only.
    - Store in IndexedDB with a versioned schema. Extend the existing JSON import/export in `comfort-map.js`.
12. **Analyser flags and "soften"**: crest factor, transients, high-band share, fluctuation (1-16 Hz), roughness (30-150 Hz) and mid-high indices with plain tags; soften = compression + 3.5 kHz cut + shelf. Uploads get category tags (manual for now).
13. **Comfort map v2**: ratings on pleasant × eventful axes, shown as a point cloud per state (not averages), with "based on n ratings" everywhere.

### NEXT (weeks)

14. **N-of-1 mode** (4e) with a locked protocol, neutral labels, the Bayesian readout and a CENT-style export.
15. **Relaxation core** between attacks: 10-minute PMR and 5-minute short form, paced breathing at about 6 breaths/min, body scan. Gentle weekly goal of about 3 sessions (no streaks). Track a monthly MIDAS-style "days affected" count with original wording until licensed. Expect low adherence and design for it.
16. **Wind-down mode**: 25-45 minutes with a sleep timer and 3-5 minute fade, plus a next-morning 1-item sleep rating. Framed as sleep quality, not migraine.
17. **Listening dose meter** (relative, labelled estimate).
18. **CC0 layer library** of 20-40 FSD50K CC0 loops with a licence manifest. Water and mouth sounds are opt-in. Per-element toggles.
19. **Tier-B discrete ranker** for library and uploads.
20. **Offline prior pipeline** (Python, not shipped): SATP/ISD (commercial-safe) or ARAUS (non-commercial) → ridge model on Meyda-computable features → `priors.v1.json` (about 10 coefficients plus per-family Beta priors). Validate across ISD and SATP languages.
21. **Multilingual rating vocabulary** from SATP.

### LATER

22. **Gentle tolerance practice** (4f #11), only after a clinician-advice review.
23. **Opt-in research export** (features plus ratings, no audio, no free text). Pre-registered outcomes. Ethics/IRB before any pooling. Re-estimated population priors shipped as new static JSON (the no-backend version of IntelligentPooling).
24. **"Slide to comfort" sequential line search**, compared against A/B within users.
25. **YAMNet on-device auto-tagging** so vetoes catch uploads automatically.
26. **Validated questionnaires** (ASC-12, HQ, HIT-6/MIDAS) once licences are obtained.
27. **Pilot study** of personalised vs non-personalised sounds within users (micro-randomised), with comfort as primary outcome and pain as secondary, reported honestly whatever the result.

### Do not build

Required daily diaries or streaks. Displays of dB SPL. A "turn it up until it hurts" test. Any "migraine frequency". Live Freesound calls from the client. Essentia.js in a closed app. Anything trained on the Kaggle migraine set. Recommendations framed as treatment ("play this instead of your medication").

---

## 7. References (verified sources only; [FC-added] = supplied by the fact-checkers and not itself fact-checked)

**Migraine and sound sensitivity**
- Headache Classification Committee of the IHS. ICHD-3, 1.1 Migraine without aura. 2018. https://ichd-3.org/1-migraine/1-1-migraine-without-aura/
- Munjal S et al. Most bothersome symptom in persons with migraine: MAST. *Headache* 2020;60(2):416-429. https://doi.org/10.1111/head.13708
- Jaimes A et al. Interictal sensory hypersensitivities and vestibular symptoms in migraine. *Brain Behav* 2025;15(10):e70874. https://doi.org/10.1002/brb3.70874
- Ashkenazi A, Mushtaq A, Yang I, Oshinsky ML. Ictal and interictal phonophobia in migraine. *Cephalalgia* 2009;29(10):1042-1048. https://doi.org/10.1111/j.1468-2982.2008.01834.x
- Ashkenazi A et al. Is phonophobia associated with cutaneous allodynia in migraine? *JNNP* 2010;81(11):1256-1260. https://doi.org/10.1136/jnnp.2009.198481
- Vingen JV et al. Phonophobia in migraine. *Cephalalgia* 1998;18(5):243-249. https://pubmed.ncbi.nlm.nih.gov/9673802/
- Mourgela A, Vikelis M, Reiss JD. Frequency-specific loudness discomfort levels in listeners with migraine. *Ear Hear* 2023;44(5):1007-1013. https://doi.org/10.1097/AUD.0000000000001339 (data: https://github.com/amourgela/supplementalmaterial)
- Ikumi N et al. Avoidance behaviour modulates but does not condition phonophobia in migraine. *Cephalalgia* 2022;42(13):1305-1316. https://doi.org/10.1177/03331024221111772
- Ikumi N et al. Quantifying sensory thresholds along the migraine cycle. *Cephalalgia* 2024;44(2). https://doi.org/10.1177/03331024241230279
- Ambrosini A et al. Lack of habituation causes high intensity dependence of auditory evoked cortical potentials in migraine. *Brain* 2003;126(9):2009-2015. https://doi.org/10.1093/brain/awg206
- Ambrosini A et al. Visual and auditory cortical evoked potentials in interictal episodic migraine: audit of 624 patients. *Cephalalgia* 2017;37(12):1126-1134. https://doi.org/10.1177/0333102416665224
- Pinheiro CF et al. Interictal photophobia and phonophobia related to aura and attack frequency. *Appl Sci* 2021;11(6):2474. https://www.mdpi.com/2076-3417/11/6/2474
- Schwedt TJ et al. Characterizing prodrome in migraine: PRODROME trial screening period. *Neurol Clin Pract* 2025;15(1):e200359. https://doi.org/10.1212/CPJ.0000000000200359
- Giffin NJ et al. Premonitory symptoms in migraine: an electronic diary study. *Neurology* 2003;60(6):935-940. https://doi.org/10.1212/01.wnl.0000052998.58526.a9
- Giffin NJ et al. The migraine postdrome: an electronic diary study. *Neurology* 2016;87(3):309-313. https://doi.org/10.1212/WNL.0000000000002789
- Martin PR, Reece J, Forsyth M. Noise as a trigger for headaches. *Headache* 2006;46(6):962-972. https://doi.org/10.1111/j.1526-4610.2006.00468.x
- Martin PR et al. Behavioral management of the triggers of recurrent headache: RCT. *Behav Res Ther* 2014;61:1-11. https://doi.org/10.1016/j.brat.2014.07.002
- Agessi LM et al. Central auditory processing and migraine. *J Headache Pain* 2014;15:72. https://doi.org/10.1186/1129-2377-15-72
- Lipton RB et al. Cutaneous allodynia in the migraine population. *Ann Neurol* 2008;63(2):148-158. https://doi.org/10.1002/ana.21211
- Khalfa S et al. Psychometric normalization of a hyperacusis questionnaire. *ORL* 2002;64(6):436-442. https://doi.org/10.1159/000067570
- Kosinski M et al. HIT-6. *Qual Life Res* 2003;12(8):963-974. https://doi.org/10.1023/a:1026119331193
- Stewart WF et al. MIDAS validity. *Pain* 2000;88(1):41-52. https://doi.org/10.1016/s0304-3959(00)00305-5
- Weinstein ND. Individual differences in reactions to noise. *J Appl Psychol* 1978;63(4):458-466. https://doi.org/10.1037/0021-9010.63.4.458
- Fioretti A et al. Italian validation of the Khalfa Hyperacusis Questionnaire. *Acta Otorhinolaryngol Ital* 2015;35(2):110-115. https://pubmed.ncbi.nlm.nih.gov/26019395/
- [FC-added] Omland PM et al. VEPs in interictal migraine: no confirmation of abnormal habituation. *Headache* 2013. https://doi.org/10.1111/head.12006
- [FC-added] Main A, Dowson A, Gross M. 1997, *Headache* 37(8):492-495. https://doi.org/10.1046/j.1526-4610.1997.3708492.x
- [FC-added] Woodhouse A, Drummond PD. 1993, *Cephalalgia* 13(6):417-421. https://doi.org/10.1046/j.1468-2982.1993.1306417.x

**Individual differences and psychoacoustics**
- Heinonen-Guzejev M et al. Genetic component of noise sensitivity. *Twin Res Hum Genet* 2005. https://pubmed.ncbi.nlm.nih.gov/15989751/
- Shepherd D et al. Noise sensitivity and personality. *Noise Health* 2015;17(76):165-171. https://pubmed.ncbi.nlm.nih.gov/25913556/
- Fong DYT et al. *Noise Health* 2017;19(89):193-199. https://pubmed.ncbi.nlm.nih.gov/28816206/
- Swedo SE et al. Consensus definition of misophonia. *Front Neurosci* 2022;16:841816. https://doi.org/10.3389/fnins.2022.841816
- Vitoratou S et al. Misophonia in the UK. *PLoS One* 2023;18(3):e0282777. https://pubmed.ncbi.nlm.nih.gov/36947525/
- Kumar S et al. The brain basis for misophonia. *Curr Biol* 2017;27:527-533. https://pubmed.ncbi.nlm.nih.gov/28162895/
- Trumbull J et al. Using the IADS to characterize misophonia. *PLoS One* 2024;19(5):e0301105. https://pmc.ncbi.nlm.nih.gov/articles/PMC11111082/
- Tyler RS et al. A review of hyperacusis, Part I. *Am J Audiol* 2014;23(4):402-419. https://doi.org/10.1044/2014_AJA-14-0010
- Kumar S, Forster HM, Bailey P, Griffiths TD. Mapping unpleasantness of sounds. *JASA* 2008;124(6):3810-3817. https://doi.org/10.1121/1.3006380
- Kumar S et al. Features versus feelings. *J Neurosci* 2012;32(41):14184-14192. https://www.jneurosci.org/content/32/41/14184
- Arnal LH et al. Human screams occupy a privileged niche. *Curr Biol* 2015;25(15):2051-2056. https://doi.org/10.1016/j.cub.2015.06.043
- McDermott JH et al. Indifference to dissonance in native Amazonians. *Nature* 2016;535:547-550. https://pubmed.ncbi.nlm.nih.gov/27409816/
- Virjonen P, Hongisto V, Radun J. Annoyance penalty of periodically amplitude-modulated wide-band sound. *JASA* 2019;146(6):4159. https://doi.org/10.1121/1.5133478
- Schäffer B et al. Spectral shape and AM of broadband noise and annoyance. *IJERPH* 2018;15(5):1029. https://pubmed.ncbi.nlm.nih.gov/29783747/
- Hongisto V, Oliva D, Rekola L. Spectrally different pseudorandom noises. *JASA* 2015;137(3):1344-1355. https://doi.org/10.1121/1.4913273
- Kuusinen A, Hongisto V. What kind of spectrum annoys us the least? Forum Acusticum 2023. https://doi.org/10.61782/fa.2023.0242
- Nigg JT et al. White or pink noise and task performance in ADHD: meta-analysis. *JAACAP* 2024;63(8):778-788. https://doi.org/10.1016/j.jaac.2023.12.014
- Söderlund GB et al. *Behav Brain Funct* 2010;6:55. https://pubmed.ncbi.nlm.nih.gov/20920224/
- Carson TB et al. Auditory sensory over-responsivity in autism. *J Autism Dev Disord* 2022;52(3):1395-1402. https://doi.org/10.1007/s10803-021-04991-0
- Ben-Sasson A et al. Sensory modulation in ASD: meta-analysis. 2009. https://pubmed.ncbi.nlm.nih.gov/18512135/
- Hoffman HJ et al. Declining prevalence of hearing loss in US adults. *JAMA Otolaryngol* 2017. https://pubmed.ncbi.nlm.nih.gov/27978564/
- WHO. Deafness and hearing loss fact sheet. https://www.who.int/news-room/fact-sheets/detail/deafness-and-hearing-loss
- Rentfrow PJ, Goldberg LR, Levitin DJ. The structure of musical preferences. *JPSP* 2011;100(6):1139-1157. https://doi.org/10.1037/a0022406
- Greenberg DM et al. The song is you. *SPPS* 2016;7(6):597-605. https://doi.org/10.1177/1948550616641473
- Axelsson Ö, Nilsson ME, Berglund B. A principal components model of soundscape perception. *JASA* 2010;128(5):2836-2846. https://doi.org/10.1121/1.3493436
- Mitchell A, Aletta F, Kang J. How to analyse and represent quantitative soundscape data. *JASA Express Lett* 2022;2:037201. https://pubmed.ncbi.nlm.nih.gov/36154625/
- Ooi K et al. ARAUS. *IEEE Trans Affect Comput* 2023. https://arxiv.org/abs/2207.01078 (data: https://doi.org/10.21979/N9/9OTEVX)
- Buxton RT et al. Health benefits of natural sounds. *PNAS* 2021. https://doi.org/10.1073/pnas.2013097118
- [FC-added] Kuusinen A, Rantanen, Hongisto V. 2024, *Building and Environment*. https://research.fi/en/results/publication/0685778624
- [FC-added] Kumar S et al. The motor basis for misophonia. *J Neurosci* 2021. https://doi.org/10.1523/JNEUROSCI.0261-21.2021
- [FC-added] McPherson MJ et al. *Nat Commun* 2020;11:2786. https://doi.org/10.1038/s41467-020-16448-6
- [FC-added] Chmiel A, Schubert E. 2019, *Musicae Scientiae* (familiarity linear). https://researchers.westernsydney.edu.au/en/publications/unusualness-as-a-predictor-of-music-preference/

**Interventions**
- Minen MT et al. Smartphone-based muscle relaxation for migraine in the ED: RCT. *JAMA Netw Open* 2025;8:e2534221. https://doi.org/10.1001/jamanetworkopen.2025.34221
- Minen MT et al. Smartphone-delivered PMR in primary care: RCT. *Headache* 2020. https://doi.org/10.1111/head.14010
- Nestoriuc Y, Martin A. Efficacy of biofeedback for migraine. *Pain* 2007. https://doi.org/10.1016/j.pain.2006.09.007
- Nestoriuc Y et al. Biofeedback for headache: efficacy review. *Appl Psychophysiol Biofeedback* 2008. https://doi.org/10.1007/s10484-008-9060-3
- Buse DC et al. AHS member knowledge of behavioural treatments (poster). *J Headache Pain* 2013;14(Suppl 1):P61. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3620418/
- Kropp P et al. German Migraine and Headache Society guideline. *Schmerz* 2017. https://doi.org/10.1007/s00482-017-0214-1
- Wells RE et al. Mindfulness vs headache education for migraine. *JAMA Intern Med* 2021. https://doi.org/10.1001/jamainternmed.2020.7090
- Powers SW et al. CBT plus amitriptyline for pediatric chronic migraine. *JAMA* 2013. https://doi.org/10.1001/jama.2013.282533
- Fisher E et al. Psychological therapies for pediatric chronic pain. Cochrane 2018. https://doi.org/10.1002/14651858.CD003968.pub5
- Lee JH. The effects of music on pain. *J Music Ther* 2016. https://doi.org/10.1093/jmt/thw012
- Garza-Villarreal EA et al. Music-induced analgesia in chronic pain. *Pain Physician* 2017. https://doi.org/10.36076/ppj/2017.7.597
- Hole J et al. Music and postoperative recovery. *Lancet* 2015. https://doi.org/10.1016/S0140-6736(15)60169-6
- Kühlmann AYR et al. *Br J Surg* 2018. https://doi.org/10.1002/bjs.10853
- Basiński K et al. Preferred musical attribute dimensions and music-induced analgesia. *Sci Rep* 2021. https://doi.org/10.1038/s41598-021-87943-z
- Howlin C et al. How people with chronic pain choose their music. *Front Psychol* 2022;13:969377. https://doi.org/10.3389/fpsyg.2022.969377
- Howlin C, Rooney B. *Psychology of Music* 2021. https://doi.org/10.1177/0305735620907155
- Oelkers-Ax R et al. Butterbur and music therapy in childhood migraine. *Eur J Pain* 2008. https://doi.org/10.1016/j.ejpain.2007.06.003
- Koenig J et al. Music therapy in adolescents with primary headache. *J Pain* 2013. https://pubmed.ncbi.nlm.nih.gov/23876282/
- Hall S, O'Brien H. Music therapy in migraine. *Music and Medicine* 2022. https://doi.org/10.47513/mmd.v14i1.842
- Parlongue G et al. Smartphone music intervention in episodic migraine: pilot. *Complement Ther Med* 2021. https://doi.org/10.1016/j.ctim.2021.102779
- Shamsi F et al. Binaural beats and pain: systematic review. *BMC Complement Med Ther* 2024. https://doi.org/10.1186/s12906-024-04339-y
- Gkolias V et al. *Eur J Pain* 2020. https://doi.org/10.1002/ejp.1615
- Ingendoh RM, Posny ES, Heine A. Binaural beats to entrain the brain? *PLoS One* 2023;18(5):e0286023. https://doi.org/10.1371/journal.pone.0286023
- Jespersen KV et al. Listening to music for insomnia in adults. Cochrane 2022. https://doi.org/10.1002/14651858.CD010459.pub3
- Riedy SM et al. Noise as a sleep aid. *Sleep Med Rev* 2021. https://doi.org/10.1016/j.smrv.2020.101385
- Ngo HV et al. Auditory closed-loop stimulation of sleep slow oscillations. *Neuron* 2013. https://doi.org/10.1016/j.neuron.2013.03.006
- Noseda R et al. Migraine photophobia originating in cone-driven retinal pathways. *Brain* 2016. https://pubmed.ncbi.nlm.nih.gov/27190022/
- Martin LF et al. Green light exposure in migraine. *Cephalalgia* 2021. https://pmc.ncbi.nlm.nih.gov/articles/PMC8034831/
- Yarnitsky D et al. Remote electrical neuromodulation for acute migraine. *Headache* 2019. https://doi.org/10.1111/head.13551
- Schoenen J et al. PREMICE. *Neurology* 2013;80:697-704.
- Macedo A, Farré M, Baños JE. Placebo response in acute migraine: meta-analysis. *Eur J Clin Pharmacol* 2006. https://pubmed.ncbi.nlm.nih.gov/16402240/
- Woods KJP et al. Rapid modulation in music supports attention. *Commun Biol* 2024;7:1376 (industry-affiliated; author corrections 2025/2026). https://pmc.ncbi.nlm.nih.gov/articles/PMC11499863/
- Huberty J et al. *PLoS One* 2021;e0244717.
- [FC-added] Sharpe L et al. Psychological therapies for migraine prevention in adults. Cochrane 2019. https://doi.org/10.1002/14651858.CD012295.pub2
- [FC-added] Howlin C et al. Cognitive agency in music interventions. *Eur J Pain* 2021. https://doi.org/10.1002/ejp.1780
- [FC-added] Tepper SJ et al. Relivion multicenter sham RCT. *Headache* 2022. https://doi.org/10.1111/head.14350
- [FC-added] Garcia-Argibay M et al. Binaural beats meta-analysis. *Psychol Res* 2019. https://doi.org/10.1007/s00426-018-1066-8
- [FC-added] Kelman L. Triggers of the acute migraine attack. *Cephalalgia* 2007. https://doi.org/10.1111/j.1468-2982.2007.01303.x

**Personalisation methods and adherence**
- Nielsen JB, Nielsen J, Larsen J. Perception-based personalization of hearing aids using GPs and active learning. *IEEE/ACM TASLP* 2015;23(1):162-173. https://doi.org/10.1109/TASLP.2014.2377581
- Chu W, Ghahramani Z. Preference learning with Gaussian processes. ICML 2005. https://doi.org/10.1145/1102351.1102369
- Brochu E, de Freitas N, Ghosh A. Active preference learning with discrete choice data. NIPS 2007.
- González J et al. Preferential Bayesian optimization. ICML 2017. https://proceedings.mlr.press/v70/gonzalez17a
- Koyama Y et al. Sequential line search. *ACM TOG* 2017;36(4):48. https://doi.org/10.1145/3072959.3073598
- Mantiuk RK, Tomaszewska A, Mantiuk R. Comparison of four subjective methods. *Comput Graph Forum* 2012. https://doi.org/10.1111/j.1467-8659.2012.03188.x
- Mikhailiuk A et al. ASAP active sampling. ICPR 2020. https://arxiv.org/abs/2004.05691
- Russo DJ et al. A tutorial on Thompson sampling. *Found Trends ML* 2018. https://arxiv.org/abs/1707.02038
- Tomkins S et al. IntelligentPooling. *Machine Learning* 2021;110:2685-2727. https://doi.org/10.1007/s10994-021-05995-8
- Klasnja P et al. Microrandomized trials. *Health Psychol* 2015. https://doi.org/10.1037/hea0000305
- Kravitz RL et al. Mobile N-of-1 trials for chronic musculoskeletal pain: RCT. *JAMA Intern Med* 2018. https://doi.org/10.1001/jamainternmed.2018.3981
- Peris F et al. Determining potential trigger factors in individual patients. *Cephalalgia* 2017. https://pubmed.ncbi.nlm.nih.gov/27179352/
- Seng EK et al. Anxiety, incentives and adherence to self-monitoring. *Headache* 2018. https://pmc.ncbi.nlm.nih.gov/articles/PMC6945490
- Williams MT et al. Compliance with mobile EMA: meta-analysis. *JMIR* 2021. https://doi.org/10.2196/17023
- Businelle MS et al. EMA best practices: factorial experiment. *JMIR* 2024. https://pmc.ncbi.nlm.nih.gov/articles/PMC11347889/
- Sorbi MJ et al. Mobile monitoring and coaching in chronic migraine. *JMIR* 2007. https://doi.org/10.2196/jmir.9.5.e38
- Vohra S et al. CENT 2015. *BMJ* 2015. https://doi.org/10.1136/bmj.h1738
- Konigorski S et al. StudyU. *JMIR* 2022. https://doi.org/10.2196/35884
- Milne AE et al. Online headphone screening based on dichotic pitch. *Behav Res Methods* 2021;53:1551-1562. https://doi.org/10.3758/s13428-020-01514-0
- Woods KJP et al. Headphone screening for web-based auditory experiments. *Atten Percept Psychophys* 2017. https://pmc.ncbi.nlm.nih.gov/articles/PMC5693749/
- [FC-added] Pérez-Ortiz M, Mantiuk RK. Practical guide for pairwise comparison experiments. 2017. https://arxiv.org/abs/1712.03686
- [FC-added] Liao P et al. Personalized HeartSteps. *IMWUT* 2020. https://doi.org/10.1145/3381007

**Safety, regulation, privacy**
- ITU-T H.870 (V2, 03/2022). https://www.itu.int/rec/T-REC-H.870
- WHO & ITU. Safe listening devices and systems. 2019. https://www.who.int/publications/i/item/9789241515276
- Commission Decision 2009/490/EC (summary). https://www.tid.gov.hk/archive/english/aboutus/tradecircular/cic/eu/2009/ci3702009.html
- FDA. General Wellness: Policy for Low Risk Devices. 6 Jan 2026. https://www.fda.gov/media/90652/download
- Regulation (EU) 2017/745 (MDR). https://eur-lex.europa.eu/eli/reg/2017/745/oj
- MDCG 2019-11 Rev.1 (2025). https://health.ec.europa.eu/latest-updates/update-mdcg-2019-11-rev1-qualification-and-classification-software-regulation-eu-2017745-and-2025-06-17_en
- W3C. WCAG 2.1 SC 2.3.1. https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html
- Minen MT et al. Privacy issues in headache/migraine apps. *Headache* 2018. https://doi.org/10.1111/head.13341
- FTC Health Breach Notification Rule (16 CFR 318). https://www.ftc.gov/legal-library/browse/rules/health-breach-notification-rule
- [FC-added] Kardous CA, Shaw PB. Smartphone sound-measurement apps. *JASA* 2014. https://doi.org/10.1121/1.4865269

**Datasets and tools**
- SATP v1.5: https://zenodo.org/records/18715282
- ISD: https://zenodo.org/record/5578572
- ARAUS: https://doi.org/10.21979/N9/9OTEVX
- FSD50K: https://doi.org/10.5281/zenodo.4060432
- ESC-50: https://github.com/karoldvl/ESC-50
- Freesound API terms: https://freesound.org/docs/api/terms_of_use.html
- Meyda: https://github.com/meyda/meyda
- Tone.js: https://github.com/Tonejs/Tone.js
- loudness-worklet: https://www.npmjs.com/package/loudness-worklet
- MoSQITo: https://github.com/Eomys/MoSQITo
- Soundscapy: https://github.com/MitchellAcoustics/Soundscapy
- HeadphoneCheck_Test: https://github.com/ChaitLabUCL/HeadphoneCheck_Test
- sequential-line-search: https://github.com/yuki-koyama/sequential-line-search
- ASAP: https://github.com/gfxdisp/asap
- StudyU: https://github.com/studyu-health/studyu
- YAMNet: https://github.com/tensorflow/models/tree/master/research/audioset/yamnet
- Europe PMC REST: https://www.ebi.ac.uk/europepmc/webservices/rest/search

---

*Code this plan builds on (uncommitted in the working tree): `/Users/harshelite/Desktop/still-sound-lab/dist/comfort-engine.js`, `/Users/harshelite/Desktop/still-sound-lab/dist/preference-model.js`, `/Users/harshelite/Desktop/still-sound-lab/tests/comfort-engine.test.mjs`. Recommendation logic still in use: `/Users/harshelite/Desktop/still-sound-lab/dist/audio-engine.js` (`recommend()`), which is only imported by `/Users/harshelite/Desktop/still-sound-lab/dist/app.js`.*