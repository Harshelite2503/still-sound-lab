# Still launch plan: from prototype to a validated migraine comfort product

*Written 4 November 2026. This builds on [product-strategy.md](product-strategy.md), which covers the evidence base, safety rails and the long-term engine roadmap. This document covers the business: which idea goes first, how to test it, and how to grow it.*

## 1. The decision

**Start with a personal sound-comfort companion for people with migraine. It should be ready the moment a headache starts.**

Ideas that were considered and parked for now:

- **After-work decompression, reading companion, task-start ritual, quiet companionship.** These are crowded categories (Calm, Endel, Brain.fm, Noisli, free YouTube and Spotify). They come back later as a free "everyday mode" that builds a habit between attacks.
- **Shared-home sound boundaries and travel continuity.** These become features later: a room-noise masker and offline profiles.
- **Tinnitus, misophonia, and the clinic tool.** These are the second wave, using the same engine.

Why migraine first:

| | |
|---|---|
| **Need** | About 1.1 billion people have migraine, and it is a leading cause of disability under 50. Sound becomes harder to tolerate during attacks. Sound is the *most* bothersome symptom for about 1 in 4–5 people with migraine (MAST, n=6,045; see product-strategy §1.1). |
| **Gap** | People use free YouTube "migraine music" with ads, sudden loud openings and no personalisation (our own comment review found all three complaints). Migraine Buddy has about 2–4 million registered users and tracks attacks, but it gives you nothing to *do* in the moment. |
| **Edge** | Still learns each person's comfort (the A/B tuner, comfort contour and state offsets), is protective during attacks, keeps data on the device, and is honest about evidence. A playlist can't copy that. |
| **Path** | Wellness claims now (FDA General Wellness guidance, 2026). Later, a clinician-partnered study, then reimbursement (Germany's DiGA, US digital-therapy codes) and licensing to earbud and hearing-aid makers. |

### Market size (vendor estimates, with definitions that vary)

| Market | 2025 size | Note |
|---|---|---|
| Migraine digital therapeutics (apps plus telehealth) | about $1.7B, growing about 23% a year, about $4.8B by 2030 | The Business Research Company |
| Migraine devices only (neuromodulation) | about $140M | DataM Intelligence, DelveInsight |
| Tinnitus management | about $3B, growing about 4% a year | Future Market Insights, IndustryARC; mostly hearing aids |
| Sleep and relaxation sound apps | about $2–3B | DataHorizzon; Calm alone makes about $227–300M a year (Sacra) |

**Bottom-up estimate (our own):**
- Smartphone users in the US, UK, EU and India who actively look for digital migraine help: roughly 4–5 million. At $49 a year, that's about $200M a year if Still served all of them.
- A realistic year-3 goal is 40–60k paying users, so about $2–3M a year, plus clinic revenue.

## 2. Phase 0: the validation build (done in this repository)

The goal is to find out, cheaply, whether people **come back to Still during their real headaches**. Nothing else matters until that's true.

| Piece | File | What it does |
|---|---|---|
| Quiet room | `dist/quiet.html`, `quiet.js`, `quiet.css` | Opens dark. Silence comes first, then *my comfort sound* (the tuned favourite from the comfort profile, or a gentle default), then *softer and darker*. It defaults to the during-an-attack level (−14 dB) and long fade-ins. It offers a dark screen with or without sound, a sleep timer, and "this is making it worse", which stops the sound and lowers that state's level 4 dB for next time. It never prompts while anything plays. |
| Episode journal | `dist/journal.html`, `journal.js`, `journal-store.js` | Sessions within 12 hours count as one episode. It shows what the person chose and how it felt afterwards (one optional tap), with an honesty note. People can note headaches when they *didn't* open Still, so we can measure the share of headaches where Still was used. Includes import, export and clear. |
| Pilot export | `journal.html` → *Download pilot summary* | A privacy-minimal JSON file with day offsets from first use, the categories tapped and durations. It has no dates, free text, sound settings or device details. |
| Pilot readout | `analysis/pilot_summary.py` | Computes the go/no-go metric across all participants' files. Standard library only. |
| Installable, offline | `dist/manifest.webmanifest`, `sw.js`, `pwa.js`, `icons/` | "Add to Home Screen" opens straight into the quiet room. Core pages work with no network. Includes Quiet room, Journal and Profile shortcuts. |
| Tests | `tests/journal.test.mjs`, `tests/pwa.test.mjs` | Episode grouping, metric honesty (no double counting), pilot-summary privacy, and offline file coverage. The claims linter also covers the new pages. |

**Known limits of a web app:** iOS may pause web audio when the screen locks, and lock-screen controls are not available. If the pilot passes, the first engineering task in Phase 1 is a thin native wrapper (Capacitor or similar) with background audio.

## 3. The pilot (weeks 1–10)

### Question and success criteria (fix these before recruiting)

- **Main metric:** among participants followed for 30 days or more, the share who used Still during **two or more separate headache episodes within 60 days** of first use.
  - **GO if ≥ 40%.**
  - **Rethink if < 25%.** The middle ground means: interview, change one thing, re-run with 20 people.
- **Secondary:**
  - Share of noted headaches where Still was opened (target ≥ 50%)
  - Median episodes per person
  - Which choice people reach for (silence, comfort or softer)
  - Share answering the follow-up
- **Safety:** every "made it worse" episode is reviewed. Any pattern (for example, one sound family) changes the defaults before the next cohort.
- **Not measured as success:** "felt better" counts. They're collected and described, never claimed. Placebo and natural course explain a lot (28.6% improve on placebo at 2 hours in acute trials).

### Who

- 50–100 adults (18+) who self-report migraine with at least 2 headache days a month, own headphones or earbuds, and have a smartphone.
- Exclude anyone whose headaches are new or changing and haven't been seen by a doctor.
- Aim for a mix: about 40% India, about 60% English-speaking countries elsewhere. Include people with and without aura.

### Where to find them (free channels first)

1. r/migraine and r/ChronicPain (read each community's self-promotion rules and ask moderators first), migraine Facebook groups, and Indian health communities.
2. Short posts that lead with the research angle: "We measured what's actually inside the famous migraine YouTube track. Want to help test a version that learns what *you* find tolerable?"
3. Personal network and friends of friends with migraine.
4. One or two patient advocates or creators. Offer early access, not payment, to avoid biasing the sample.

### Steps

| Week | Step |
|---|---|
| 0 | Final check: consent text (below), pilot codes P001–P100, a support email, and a short privacy notice. If a university or clinic partner is involved, get their ethics review first. |
| 1–2 | Onboard in small batches of about 10. A 15-minute video call or a written guide: install to the home screen, build the comfort profile on a calm day (questions, reference, tuner), and remember that the quiet room is for the next headache. |
| 1–10 | No reminders during headaches. One neutral check-in message at day 14 and day 30: "Any headaches? If you didn't open Still, you can note them in the journal." |
| 5, 9 | Participants download their pilot summary and send it in. Run `python3 analysis/pilot_summary.py <folder>`. |
| 9–10 | 20-minute interviews with 10 heavy users, 10 people who dropped off, and everyone with a "made it worse" episode. |
| 10 | Go/no-go decision, written up honestly whatever the result. |

### Consent text (short version)

> Still is a comfort tool. It does not diagnose, treat or prevent migraine, and you should keep your usual care. Everything stays on your phone. At weeks 5 and 9 we'll ask you to download a summary that contains only day numbers, what you tapped and for how long, with no dates, names or notes, and send it to us. You can stop at any time and ask us to delete what you sent. Stop using any sound that feels worse. A new, sudden or worst-ever headache needs medical care.

### Interview guide (20 minutes)

1. Walk me through your last bad headache. What did you do in the first 10 minutes?
2. Did you think of Still? What made you open it, or not?
3. What did you choose, and why? What would you have wanted instead?
4. Was anything uncomfortable: the sound, the screen, the steps?
5. Between headaches, did you use Still at all? For what?
6. If Still disappeared tomorrow, how would you feel? (Very disappointed, somewhat, not at all; the Sean Ellis test. Aim for ≥ 40% "very disappointed".)
7. What would you pay for it, and what would you expect at that price?

## 4. Phase 1: launch (months 3–9, only after GO)

### Product

1. Native wrapper with background audio and lock-screen controls. Ship to the App Store and Google Play.
2. **Everyday mode (free):** decompression, reading, task-start and companionship presets built from the same engine. This keeps the app in daily use, so it's remembered when a headache comes.
3. **Room-noise masker:** record 10 seconds of your space, and Still shapes noise to cover it. This covers shared homes, offices and hotels.
4. Thompson-sampling recommendations and the layer library (product-strategy roadmap items 10 and 18).

### Pricing

| Tier | Price | What it includes |
|---|---|---|
| Free | $0 | Quiet room with the default sound, journal, everyday mode |
| Premium | $5.99/month or $49/year (India ₹99/month or ₹799/year) | Comfort profile and tuner, personalised sounds per state, room masker, offline travel profiles, insights, export |
| Clinic (Phase 2) | $99–299 per clinic per month | Clinician view of exported journals and within-patient comparisons |

**Unit-economics targets:**
- Free-to-paid conversion of 3–5%
- Year-1 retention of paying users ≥ 50%
- Cost to acquire a paying user ≤ $30

### Marketing (in order; cheapest and most trusted first)

**Positioning:** "Find the sound, or the silence, that you can tolerate. Ready when your head hurts. Your data never leaves your phone." Never use cure, treat, relieve or heal. The claims linter enforces this on the site.

1. **Research-led short videos.** "What's actually inside the famous migraine YouTube track" (our measured 82 Hz tone pair and the evidence). "Why the same sound soothes one person and hurts another" (the 1.2-point spread). Post on YouTube Shorts, Reels and TikTok. Our analysis pages are the source material.
2. **Long YouTube sound videos.** Still's own gentle loops with no sudden starts, each ending with "this one learns what works for you" and a link. This catches people at the moment they search "migraine relief music".
3. **SEO pages:** sounds for a headache, what binaural beats really do, why sound hurts during a migraine, and brown vs pink noise.
4. **App Store keywords:** migraine, headache, sound sensitivity, brown noise, sleep sounds, tinnitus (in Phase 2).
5. **Community:** keep the pilot participants as a founding circle with early access, a feedback channel and referral codes.
6. **Clinicians:** offer headache specialists, neurologists and audiologists a free clinic view and a one-page handout. A recommendation from a doctor brings the most loyal users.
7. **Patient organisations:** the American Migraine Foundation, The Migraine Trust (UK), Migraine Canada and Indian headache societies. Use Migraine & Headache Awareness Month (June) for a campaign.
8. **Partners:** migraine glasses, cooling caps and sleep-headphone brands for bundles. Integrate with Apple Health and Health Connect. Approach Migraine Buddy, which tracks attacks while Still gives users something to do.
9. **Seasonal campaigns:** fireworks seasons (Diwali, the 4th of July, New Year's) for sound sensitivity, and exam season for the reading mode (big in India).
10. **Paid ads, last,** and only once 30-day retention is proven.

## 5. Phase 2 and 3 (months 9–36)

- **Tinnitus:** pitch matching and personalised masking. Same engine, a market of about $3B, with an audiologist channel.
- **Clinic tier and personal experiments:** the N-of-1 mode from product-strategy §4(e), with a clinician-readable export.
- **Clinical study** with an academic headache centre: a within-person randomised comparison of personalised vs non-personalised sound, with comfort as the primary outcome. It's the gateway to stronger claims and reimbursement.
- **Licensing:** the comfort profile becomes something earbuds, hearing aids and smart homes can read.

## 6. Team, money and milestones

| When | Milestone | Money |
|---|---|---|
| Month 0–3 | Pilot run and GO decision | About $0–500 (domain, a few creator gifts) |
| Month 3–6 | Native app, premium tier, 1–2 clinical advisors (a headache neurologist and an audiologist) | Grants: BIRAC BIG (India), NIH SBIR (US) or Innovate UK; or angels |
| Month 6–9 | 1,000 paying users, 3–5 clinic pilots | Pre-seed of $300–500k on the strength of the retention data |
| Month 12–18 | 10k paying users, study protocol registered | Seed |

**Hires, in order:** a clinical advisor (equity), a mobile engineer, then a content and community lead.

## 7. Risks and what we do about each

| Risk | Response |
|---|---|
| People don't come back during headaches | That's exactly what the pilot tests. Interview drop-outs, then change one thing at a time. |
| Effects are small or placebo-level | Sell comfort and control, which people value regardless. Never sell treatment. Publish honest results. |
| Regulation | Stay inside wellness wording until a study supports more. The claims linter runs in CI. |
| Hearing or sensory harm | The safety chain (limiter, −3 dBFS clip), state offsets, fade-ins, the "making it worse" button, and review of every harm report. |
| Big platforms copy generic soundscapes | Compete on personalisation per state, the clinician channel and on-device privacy. |
| Privacy | Data stays on the device by default. Any future sync needs separate consent and a GDPR / FTC Health Breach Notification Rule plan. |

## Sources for market figures

- Business Research Company, digital therapeutics for migraine 2025: https://www.gii.tw/report/tbrc1855861-digital-therapeutics-migraine-global-market-report.html
- DataM Intelligence, digital migraine treatment devices: https://www.finanzen.net/nachricht/aktien/digital-migraine-treatment-devices-market-to-reach-usd-298-71-million-by-2030-fueled-by-non-invasive-neuromodulation-and-expanding-clinical-adoption-datam-intelligence-14886200
- DelveInsight, digital migraine treatment devices: https://www.delveinsight.com/report-store/digital-migraine-treatment-devices-market
- Future Market Insights, tinnitus management: https://www.futuremarketinsights.com/reports/tinnitus-management-market
- IndustryARC, tinnitus management: https://www.industryarc.com/research/tinnitus-management-market-research-504286
- DataHorizzon, sleep sound apps: https://datahorizzonresearch.com/sleep-sound-app-market-77466
- Sacra, Calm: https://sacra.com/c/calm
- Healint (Migraine Buddy) user milestones: https://healint.com/press-release/2019/11/13/healint-hits-2-million-registered-users
