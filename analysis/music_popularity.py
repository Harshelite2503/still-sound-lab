#!/usr/bin/env python3
"""Exploratory MusicOSet analysis. Predict chart strength, never medical benefit.

Run with --data-dir pointing to extracted MusicOSet directories.
See docs/popularity-analysis-plan.md for choices made before modeling.
"""
import argparse
import ast
from functools import lru_cache
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import platform
import re
import unicodedata

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import scipy
from scipy.stats import rankdata, spearmanr
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SEED = 20261105
CONTINUOUS = ["tempo", "danceability", "energy", "loudness", "acousticness",
              "valence", "speechiness", "instrumentalness", "liveness", "duration_sec"]
AUDIO = CONTINUOUS + ["mode", "time_signature", "key_sin", "key_cos"]
CONTEXT = ["debut_year", "log_prior_artist_songs", "prior_artist_best_score"]
LABELS = {"tempo": "Tempo (BPM)", "danceability": "Danceability", "energy": "Energy",
          "loudness": "Loudness", "acousticness": "Acousticness", "valence": "Valence",
          "speechiness": "Speechiness", "instrumentalness": "Instrumentalness",
          "liveness": "Liveness", "duration_sec": "Duration"}


@lru_cache(maxsize=None)
def billboard_pair(raw):
    try:
        value = ast.literal_eval(raw)
        assert len(value) == 2
        return value
    except (SyntaxError, ValueError):
        # Some source strings contain unescaped apostrophes inside quoted tuple fields.
        match = re.fullmatch(r"\((['\"])(.*)\1,\s*(['\"])(.*)\3\)", raw)
        if not match:
            raise ValueError(f"Unrecognized Billboard identity: {raw!r}")
        return match.group(2), match.group(4)


class UnionFind:
    def __init__(self):
        self.p = {}

    def find(self, key):
        self.p.setdefault(key, key)
        if self.p[key] != key:
            self.p[key] = self.find(self.p[key])
        return self.p[key]

    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        if a != b:
            self.p[max(a, b)] = min(a, b)


def prepare(data_dir):
    paths = {
        "audio": data_dir / "musicoset_songfeatures/acoustic_features.csv",
        "songs": data_dir / "musicoset_metadata/songs.csv",
        "chart": data_dir / "musicoset_popularity/song_chart.csv",
    }
    tables = {k: pd.read_csv(p, sep="\t") for k, p in paths.items()}
    audio, songs, chart = (tables[k] for k in ["audio", "songs", "chart"])
    assert not audio.song_id.duplicated().any()
    assert not songs.song_id.duplicated().any()
    assert chart.rank_score.between(1, 100).all()
    duplicate_chart_ids = set(chart.loc[chart.duplicated(["song_id", "week"], keep=False), "song_id"])
    chart_duplicate_rows = int(chart.duplicated(["song_id", "week"]).sum())
    chart = chart[~chart.song_id.isin(duplicate_chart_ids)].copy()
    chart["week"] = pd.to_datetime(chart.week)
    chart = chart.sort_values(["week", "song_id"], kind="stable")
    assert not chart.duplicated(["song_id", "week"]).any()
    first = chart.drop_duplicates("song_id").set_index("song_id")
    last_date = chart.week.max()
    chart["first_date"] = chart.song_id.map(first.week)
    first_year = chart[chart.week < chart.first_date + pd.Timedelta(weeks=52)]
    outcome = first_year.groupby("song_id").agg(
        chart_success=("rank_score", "max"), chart_observations=("week", "size"))
    cohort = songs.merge(audio, on="song_id", validate="one_to_one").merge(
        outcome, on="song_id", validate="one_to_one")
    cohort["debut_date"] = cohort.song_id.map(first.week)
    cohort["initial_weeks"] = cohort.song_id.map(first.weeks_on_chart)
    cohort["complete_followup"] = cohort.debut_date + pd.Timedelta(weeks=52) <= last_date
    missing_start = cohort.initial_weeks > 1
    incomplete = ~cohort.complete_followup
    counts = {"audio_rows": len(audio), "song_metadata_rows": len(songs),
              "raw_chart_rows": len(tables["chart"]),
              "conflicting_song_week_duplicate_rows": chart_duplicate_rows,
              "conflicting_song_week_ids_excluded": len(duplicate_chart_ids),
              "chart_rows": len(chart), "chart_songs": chart.song_id.nunique(),
              "chart_first_date": str(chart.week.min().date()),
              "chart_last_date": str(last_date.date()),
              "merged_rows": len(cohort), "left_censored_or_missing_start": int(missing_start.sum()),
              "incomplete_52_week_followup": int(incomplete.sum()),
              "censoring_union_excluded": int((missing_start | incomplete).sum())}
    cohort = cohort[~missing_start & ~incomplete].copy()
    # Deduplicate identical source Billboard title+artist identities, ignoring punctuation/case.
    def canonical_identity(raw):
        title, artist = billboard_pair(raw)
        return re.sub(r"[^\w]+", "", (title + "||" + artist).casefold())
    cohort["canonical_identity"] = cohort.billboard.map(canonical_identity)
    ambiguous = cohort.canonical_identity.duplicated(keep=False)
    counts["ambiguous_billboard_identity_ids_excluded"] = int(ambiguous.sum())
    cohort = cohort[~ambiguous].sort_values(["debut_date", "song_id"]).copy()
    # Audit found chart originals mapped to tribute/chiptune recordings. Remove explicit markers.
    suspicious = re.compile(r"karaoke|tribute|(?:16|8)[ -]?bit|emulation|originally performed|originally by|"
                            r"made famous|in the style of|pop music workshop|arcade player|backing track", re.I)
    suspect = (cohort.song_name + " " + cohort.artists).map(lambda s: bool(suspicious.search(s)))
    counts["explicit_wrong_version_markers_excluded"] = int(suspect.sum())
    cohort = cohort[~suspect].copy()
    counts["invalid_tempo_excluded"] = int((cohort.tempo <= 0).sum())
    cohort = cohort[cohort.tempo > 0].copy()
    def normalize_name(s):
        s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().casefold()
        return re.sub(r"[^a-z0-9]", "", s)
    def artists_agree(row):
        expected = normalize_name(billboard_pair(row.billboard)[1])
        actual = [normalize_name(s) for s in ast.literal_eval(row.artists).values()]
        return any(len(a) >= 3 and (a in expected or expected in a) for a in actual)
    cohort["artist_name_agreement"] = cohort.apply(artists_agree, axis=1)
    counts["artist_name_disagreement_flagged"] = int((~cohort.artist_name_agreement).sum())
    artist_map = {r.song_id: list(ast.literal_eval(r.artists)) for r in songs.itertuples()}
    assert all(artist_map.values())
    cohort["artist_ids"] = cohort.song_id.map(artist_map)
    cohort["primary_artist"] = cohort.artist_ids.map(lambda x: x[0])
    uf = UnionFind()
    for ids in artist_map.values():
        for other in ids:
            uf.union(ids[0], other)
    cohort["artist_component"] = cohort.primary_artist.map(uf.find)

    # Snapshot previous weeks only, before processing ANY events in the debut week.
    histories, best = defaultdict(set), defaultdict(int)
    contexts = {}
    first_by_week = first.reset_index().groupby("week")["song_id"].apply(list).to_dict()
    for week, rows in chart.groupby("week", sort=True):
        for song_id in first_by_week.get(week, []):
            ids = artist_map[song_id]
            contexts[song_id] = (max(len(histories[a]) for a in ids), max(best[a] for a in ids))
        for r in rows.itertuples():
            for a in artist_map[r.song_id]:
                histories[a].add(r.song_id)
                best[a] = max(best[a], r.rank_score)
    cohort["prior_artist_songs"] = cohort.song_id.map(lambda k: contexts[k][0])
    cohort["log_prior_artist_songs"] = np.log1p(cohort.prior_artist_songs)
    cohort["prior_artist_best_score"] = cohort.song_id.map(lambda k: contexts[k][1])
    cohort["debut_year"] = cohort.debut_date.dt.year
    cohort["duration_sec"] = cohort.duration_ms / 1000
    cohort["key_sin"] = np.sin(2 * np.pi * cohort.key / 12)
    cohort["key_cos"] = np.cos(2 * np.pi * cohort.key / 12)
    cohort["top10"] = (cohort.chart_success >= 91).astype(int)
    cohort["peak_position_first_year"] = 101 - cohort.chart_success
    cohort = cohort.reset_index(drop=True)
    counts.update({"analysis_songs": len(cohort), "top10_songs": int(cohort.top10.sum()),
                   "top10_fraction": float(cohort.top10.mean()),
                   "first_debut_year": int(cohort.debut_year.min()),
                   "last_debut_year": int(cohort.debut_year.max()),
                   "artist_components": cohort.artist_component.nunique(),
                   "largest_artist_component_songs": int(cohort.artist_component.value_counts().max()),
                   "spotify_snapshot_zeros": int((cohort.popularity == 0).sum()),
                   "missing_model_values": int(cohort[AUDIO + CONTEXT].isna().sum().sum())})
    hashes = {str(p.relative_to(data_dir)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths.values()}
    return cohort, counts, hashes


def year_residual_rank(values, years):
    ranks = pd.Series(rankdata(values), index=years.index)
    return ranks - ranks.groupby(years).transform("mean")


def associations(df):
    rows = []
    yr = year_residual_rank(df.chart_success, df.debut_year)
    for feature in CONTINUOUS:
        xr = year_residual_rank(df[feature], df.debut_year)
        rows.append({"feature": feature,
                     "chart_spearman": float(spearmanr(df[feature], df.chart_success).statistic),
                     "chart_year_adjusted_rank_correlation": float(np.corrcoef(xr, yr)[0, 1]),
                     "spotify_snapshot_spearman": float(spearmanr(df[feature], df.popularity).statistic)})
    return rows


def make_model(kind="boosted"):
    if kind == "logistic":
        return make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                             LogisticRegression(C=1.0, max_iter=2000, random_state=SEED))
    return HistGradientBoostingClassifier(max_iter=150, max_depth=3, max_leaf_nodes=8,
                                         min_samples_leaf=40, learning_rate=.05,
                                         l2_regularization=2., early_stopping=False,
                                         random_state=SEED)


def metrics(y, p):
    return {"auc": float(roc_auc_score(y, p)), "average_precision": float(average_precision_score(y, p)),
            "brier": float(brier_score_loss(y, p))}


def bootstrap_auc(y, p, groups, repetitions=400, reference=None):
    rng = np.random.default_rng(SEED)
    unique, inverse = np.unique(groups, return_inverse=True)
    scores = []
    for _ in range(repetitions):
        counts = np.bincount(rng.integers(0, len(unique), len(unique)), minlength=len(unique))
        weights = counts[inverse]
        if np.sum(weights[y == 0]) and np.sum(weights[y == 1]):
            value = roc_auc_score(y, p, sample_weight=weights)
            if reference is not None:
                value -= roc_auc_score(y, reference, sample_weight=weights)
            scores.append(value)
    return [float(x) for x in np.quantile(scores, [.025, .975])]


def analyze_models(df):
    index = np.arange(len(df))
    random_split = train_test_split(index, test_size=.2, stratify=df.top10, random_state=SEED)
    group_split = next(GroupShuffleSplit(n_splits=1, test_size=.2, random_state=SEED).split(
        df, df.top10, groups=df.artist_component))
    cutoff = pd.Timestamp("2010-01-01")
    training_labels_known = df.debut_date + pd.Timedelta(weeks=52) <= cutoff
    splits = {"Random songs": random_split, "Unseen artist groups": group_split,
              "Later years (2010+)": (index[training_labels_known], index[df.debut_date >= cutoff])}
    feature_sets = {"Tempo only": ["tempo"], "Audio": AUDIO, "Artist history + year": CONTEXT,
                    "Audio + history + year": AUDIO + CONTEXT, "Audio (logistic)": AUDIO}
    results, split_info, outputs, paired_differences = [], [], {}, []
    for split_name, (train, test) in splits.items():
        tr, te = df.iloc[train], df.iloc[test]
        train_artists = set(a for ids in tr.artist_ids for a in ids)
        test_artists = set(a for ids in te.artist_ids for a in ids)
        overlap = len(train_artists & test_artists)
        if split_name == "Unseen artist groups":
            assert overlap == 0, "Artist leakage in grouped split"
        if split_name == "Later years (2010+)":
            assert tr.debut_date.max() < te.debut_date.min()
            assert (tr.debut_date + pd.Timedelta(weeks=52)).max() <= cutoff
        y = te.top10.to_numpy()
        groups = te.artist_component.to_numpy()
        split_info.append({"split": split_name, "train_n": len(tr), "test_n": len(te),
                           "train_top10_fraction": float(tr.top10.mean()),
                           "test_top10_fraction": float(te.top10.mean()),
                           "credited_artist_overlap": overlap,
                           "train_components": tr.artist_component.nunique(),
                           "test_components": te.artist_component.nunique()})
        predictions = {"y": y.tolist(), "song_id": te.song_id.tolist(), "artist_component": groups.tolist()}
        constant = np.full(len(te), tr.top10.mean())
        results.append({"split": split_name, "model": "Prevalence baseline", **metrics(y, constant),
                        "auc_cluster_ci95": [.5, .5]})
        for name, features in feature_sets.items():
            model = make_model("logistic" if "logistic" in name else "boosted")
            model.fit(tr[features], tr.top10)
            p = model.predict_proba(te[features])[:, 1]
            results.append({"split": split_name, "model": name, **metrics(y, p),
                            "auc_cluster_ci95": bootstrap_auc(y, p, groups)})
            predictions[name] = p.tolist()
        outputs[split_name] = predictions
        combined = np.asarray(predictions["Audio + history + year"])
        context_only = np.asarray(predictions["Artist history + year"])
        paired_differences.append({"split": split_name,
                                  "comparison": "Combined minus artist history + year",
                                  "auc_difference": float(roc_auc_score(y, combined) - roc_auc_score(y, context_only)),
                                  "paired_cluster_ci95": bootstrap_auc(y, combined, groups, reference=context_only)})
        print(f"Finished {split_name}: {len(tr)} train / {len(te)} test", flush=True)
    # Negative control: shuffle training labels, retaining the genuine future holdout.
    train, test = splits["Later years (2010+)"]
    rng = np.random.default_rng(SEED)
    null_auc = []
    for _ in range(10):
        model = make_model()
        model.fit(df.iloc[train][AUDIO], rng.permutation(df.iloc[train].top10.to_numpy()))
        null_auc.append(float(roc_auc_score(df.iloc[test].top10,
                                          model.predict_proba(df.iloc[test][AUDIO])[:, 1])))
    # Prespecified source-quality sensitivity check, triggered by the pre-model data audit.
    strict = df[df.artist_name_agreement]
    strict_train = strict[strict.debut_date + pd.Timedelta(weeks=52) <= cutoff]
    strict_test = strict[strict.debut_date >= cutoff]
    sensitivity = {"definition": "At least one credited Spotify artist name matches the Billboard artist string after normalization; alias mismatches can be valid originals",
                   "n": len(strict), "train_n": len(strict_train), "test_n": len(strict_test),
                   "test_top10_fraction": float(strict_test.top10.mean()), "models": []}
    for name, features in {"Tempo only": ["tempo"], "Audio": AUDIO,
                           "Audio + history + year": AUDIO + CONTEXT}.items():
        model = make_model()
        model.fit(strict_train[features], strict_train.top10)
        p = model.predict_proba(strict_test[features])[:, 1]
        sensitivity["models"].append({"model": name, **metrics(strict_test.top10, p)})
    sensitivity["correlations"] = associations(strict)
    return results, split_info, null_auc, outputs, sensitivity, paired_differences


def figures(df, correlations, results, output):
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10,
                         "axes.spines.top": False, "axes.spines.right": False,
                         "figure.facecolor": "#fbfaf7", "axes.facecolor": "#fbfaf7",
                         "axes.labelcolor": "#243534", "text.color": "#243534",
                         "savefig.facecolor": "#fbfaf7"})
    teal, orange, purple = "#16776f", "#ca7540", "#7664ad"
    fig, axes = plt.subplots(1, 2, figsize=(13, 6.2), gridspec_kw={"width_ratios": [1.15, 1]})
    corr = pd.DataFrame(correlations).sort_values("chart_spearman")
    yy = np.arange(len(corr))
    ax = axes[0]
    ax.barh(yy-.16, corr.chart_spearman, height=.30, color=teal,
            label="Chart strength (first-year peak)")
    ax.barh(yy+.16, corr.spotify_snapshot_spearman, height=.30, color=orange,
            label="Spotify popularity snapshot")
    ax.set_yticks(yy, [LABELS[f] for f in corr.feature])
    ax.axvline(0, color="#7b8985", lw=.8)
    ax.set_xlim(-.45, .45)
    ax.set_xlabel("Rank correlation (−1 to +1)")
    ax.set_title("Changing the outcome changes the pattern", loc="left", fontweight="bold", pad=15)
    ax.legend(loc="lower right", fontsize=8, frameon=False)
    ax.grid(axis="x", alpha=.13)
    ax = axes[1]
    bins = np.arange(0, 261, 10)
    for label, value, color in [("Other charting songs", 0, orange), ("Reached Top 10", 1, teal)]:
        vals = df.loc[df.top10 == value, "tempo"]
        ax.hist(vals, bins=bins, density=True, histtype="step", linewidth=2.2, label=label, color=color)
    ax.set_xlabel("Estimated tempo (BPM)")
    ax.set_ylabel("Density within each group")
    ax.set_title("Tempo distributions overlap", loc="left", fontweight="bold", pad=15)
    ax.legend(frameon=False, fontsize=9)
    ax.grid(axis="y", alpha=.13)
    fig.suptitle("What audio features tell us about chart success", x=.05, ha="left", fontsize=18, fontweight="bold")
    fig.text(.05, .03, f"MusicOSet · {len(df):,} already-charting songs · Top 10 within 52 weeks · observational associations\n"
             "Spotify popularity is a historical snapshot. Neither outcome measures viral sharing or personal comfort.", fontsize=9)
    fig.tight_layout(rect=(0, .11, 1, .92), w_pad=3)
    for ext in ["png", "svg", "pdf"]:
        fig.savefig(output / f"audio-associations.{ext}", dpi=180)
    plt.close(fig)

    fig, axes = plt.subplots(1, 3, figsize=(14, 5.5), sharey=True)
    model_names = ["Tempo only", "Audio", "Artist history + year", "Audio + history + year"]
    colors = [orange, teal, purple, "#263f53"]
    for ax, split_name in zip(axes, ["Random songs", "Unseen artist groups", "Later years (2010+)"]):
        selected = {r["model"]: r for r in results if r["split"] == split_name}
        for j, name in enumerate(model_names):
            r = selected[name]
            lo, hi = r["auc_cluster_ci95"]
            ax.errorbar(j, r["auc"], yerr=[[r["auc"]-lo], [hi-r["auc"]]], fmt="o",
                        color=colors[j], capsize=4, markersize=8)
            ax.annotate(f'{r["auc"]:.3f}', (j, r["auc"]), xytext=(0, 12), textcoords="offset points",
                        ha="center", fontsize=9)
        ax.axhline(.5, color="#87938f", ls="--", lw=1)
        ax.set_xticks(range(4), ["Tempo", "Audio", "History\n+ year", "Combined"])
        ax.set_xlim(-.5, 3.5)
        ax.set_ylim(.44, .88)
        ax.set_title(split_name, fontweight="bold", pad=18)
        ax.grid(axis="y", alpha=.13)
    axes[0].set_ylabel("ROC-AUC (0.50 = chance ranking)")
    fig.suptitle("Does the signal survive a different test?", x=.05, ha="left", fontsize=18, fontweight="bold")
    fig.text(.05, .025, "Predicting Top 10 among charting songs, not chart entry among all releases. Fixed models; no holdout tuning.\n"
             "Bars: 95% percentile bootstrap intervals, resampling connected artist groups; conditional on these fitted models.", fontsize=9)
    fig.tight_layout(rect=(0, .12, 1, .9))
    for ext in ["png", "svg", "pdf"]:
        fig.savefig(output / f"heldout-prediction.{ext}", dpi=180)
    plt.close(fig)

    # Era-conditioned BPM summaries: no pooled "winning frequency" label.
    edges = [0, 80, 100, 120, 140, 160, 250]
    labels = ["<80", "80–99", "100–119", "120–139", "140–159", "160+"]
    df = df.copy()
    df["tempo_band"] = pd.cut(df.tempo, edges, labels=labels, right=False)
    df["era"] = pd.cut(df.debut_year, [1960, 1980, 2000, 2018], right=False,
                       labels=["1960s–1970s", "1980s–1990s", "2000s–2010s"])
    grouped = df.groupby(["era", "tempo_band"], observed=True).top10.agg(["mean", "size", "sum"]).reset_index()
    grouped.to_json(output / "tempo-era-summary.json", orient="records", indent=2)
    fig, ax = plt.subplots(figsize=(10, 5.5))
    for era, color, offset in zip(df.era.cat.categories, [teal, orange, purple], [10, 10, -18]):
        g = grouped[grouped.era == era]
        x = np.arange(len(g))
        ax.plot(x, g["mean"]*100, marker="o", color=color, label=str(era), lw=2)
        for j, row in enumerate(g.itertuples()):
            ax.annotate(f"n={row.size:,}", (j, row.mean*100), xytext=(0, offset), textcoords="offset points",
                        ha="center", color=color, fontsize=8)
    ax.set_xticks(range(len(labels)), labels)
    ax.set_xlabel("Estimated tempo band (BPM)")
    ax.set_ylabel("Reached Top 10 within 52 weeks (%)")
    ax.set_ylim(0, 32)
    ax.set_title("Tempo patterns depend on the era", loc="left", fontsize=17, fontweight="bold", pad=20)
    ax.legend(frameon=False)
    ax.grid(axis="y", alpha=.15)
    fig.text(.08, .025, "Descriptive rates among already-charting songs. Counts are tracks, not independent listeners.\n"
             "Genre, artists and exposure remain uncontrolled. BPM estimates can use half/double time.", fontsize=9)
    fig.tight_layout(rect=(0, .12, 1, 1))
    for ext in ["png", "svg", "pdf"]:
        fig.savefig(output / f"tempo-by-era.{ext}", dpi=180)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    df, counts, hashes = prepare(args.data_dir)
    print(json.dumps(counts, indent=2), flush=True)
    correlations = associations(df)
    results, splits, null_auc, predictions, sensitivity, differences = analyze_models(df)
    summary = {"seed": SEED, "scope": "Top-10 strength among songs already charted, not virality or population hit probability",
               "target": "rank_score >= 91 within 52 weeks of first observed chart week",
               "cohort": counts, "correlations": correlations, "splits": splits, "models": results,
               "permuted_training_label_future_auc": null_auc, "source_file_sha256": hashes,
               "artist_match_sensitivity": sensitivity,
               "paired_auc_differences": differences,
               "versions": {"python": platform.python_version(), "numpy": np.__version__, "pandas": pd.__version__,
                            "scipy": scipy.__version__, "sklearn": sklearn.__version__, "matplotlib": matplotlib.__version__}}
    (args.output_dir / "results.json").write_text(json.dumps(summary, indent=2) + "\n")
    (args.output_dir / "predictions.json").write_text(json.dumps(predictions) + "\n")
    figures(df, correlations, results, args.output_dir)
    print(json.dumps({"correlations": correlations, "models": results, "null_auc": null_auc}, indent=2))


if __name__ == "__main__":
    main()
