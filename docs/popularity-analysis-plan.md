# Music popularity: exploratory analysis plan

Written on 2026-11-05 after inspecting source schemas, before calculating associations or fitting models. This is an internal analysis plan, not a registered study.

## Question and scope

Can tempo and other available audio descriptors distinguish greater chart success **among songs that already charted**? Does the result survive a chronological or artist-disjoint evaluation?

The source is the authors' MusicOSet research release, approximately 20,405 songs. It cannot estimate a new release's chance of entering the charts, diagnose comfort, or establish virality. There are no randomized exposure, individual preference, sharing, short-video reuse, or spectrogram measurements here.

## Outcomes and cohort

- Derive chart position as `101 - rank_score`, because the supplied score is inverted.
- Define success as reaching the Top 10 within 52 weeks of the first observed chart appearance.
- Require a full 52-week potential follow-up before the final observation date; do not count right-censored recent debuts as failures.
- Exclude first records whose `weeks_on_chart > 1`, which signal an already-running chart history at observation start or incomplete matching. Report exclusions.
- Keep one record per Spotify song ID; audit and collapse matching normalized Billboard title/artist identities before splits. Remaster mappings remain a limitation.
- Analyze Spotify's historical popularity snapshot only as a secondary descriptive outcome. It is not chart success at release and is not a viral-growth measure.

## Descriptive analysis

- Report Spearman associations of audio descriptors with continuous first-year chart success and with the Spotify snapshot. Also report chart associations after removing first-chart-year means from ranked variables.
- Show tempo distributions for Top-10 and other charting songs, and tempo-bin Top-10 rates by era. Bins are descriptive, not recommended composition settings.
- Do not interpret Spotify's proprietary danceability/energy/valence estimates as direct human judgments or particular frequency bands.

## Prediction checks

Fixed seed 20261105. No hyperparameter search on held-out labels.

- Random 80/20 split, stratified by Top-10 outcome: an easier retrospective diagnostic.
- Artist-disjoint split: assign connected components of credited artists together, so neither lead nor collaborating artists appear in both train and test.
- Forward-time split: train only on first appearances whose entire 52-week outcome window ends by 2010-01-01, evaluate on 2010 and later. The intervening label-maturation gap prevents training on future outcomes. This is a historical test, not a forecast of 2026.
- Compare constant prevalence, tempo alone, all acoustic descriptors, historical artist context, and acoustics plus context.
- Use fixed modest gradient-boosted trees for nonlinear interactions and a regularized logistic audio baseline. Fit preprocessing only on training data.
- Context may include debut year and artist history observed strictly **before** the song's debut week. Do not use current artist followers/popularity, final career totals, the song's chart run, or its Spotify popularity as predictors.
- Report ROC-AUC, average precision with test prevalence, Brier score and artist-cluster bootstrap uncertainty. Accuracy alone is insufficient.
- A limited chronological label-permutation check checks that the pipeline does not produce above-chance performance from randomized training labels.

## Interpretation

Correlations and predictions are observational. Genre, artist selection, recording versions, exposure, radio/label support and historical measurement differences remain possible explanations. A model's feature importance is not a causal recipe. Popularity, catchiness, urge to move, personal comfort and symptom relief are separate outcomes.

## Source-audit amendments, before model fitting

An independent schema/content audit identified problems requiring explicit exclusions:

- Debut counters are inconsistently encoded (usually 0, sometimes 1). Retain both; the original `>1` exclusion remains.
- Exclude the one song ID with conflicting song/week chart records rather than arbitrarily choosing a rank.
- The two duplicated Billboard identities actually link different artists/eras. Exclude all four affected IDs rather than collapse them.
- Exclude explicit karaoke, tribute, emulation, backing-track and similar markers in track/artist names. The published data include incorrect matches to these recordings.
- Repeat forward-time models and associations on a stricter artist-name-agreement subset. Name agreement does not certify a recording; disagreement can reflect legitimate aliases.
- Calendar anomalies are handled using elapsed time. We require potential follow-up, not 52 chart entries.
- Exclude the one nonpositive tempo estimate consistently from the shared analysis cohort. All valid tempos, including the one below 40 BPM, remain in distributions.
- Compare raw correlations on both outcomes in the main figure; give year-adjusted chart associations separately. Pairwise model comparisons use the same bootstrap resamples.

These changes address observed data defects and were selected before viewing correlations or model results. Residual incorrect recording matches remain a limitation.
