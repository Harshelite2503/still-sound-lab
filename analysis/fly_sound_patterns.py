"""Find patterns in the fly-brain responses to sounds (output of fly_sound.py).

Questions:
 1. Does the temporal pattern matter, beyond the total input? (each patterned sound vs its
    unpatterned control with the same average input)
 2. Pulse-song gap tuning: does any cell type prefer the natural 35 ms gap?
 3. Temporal following: how well does each depth of the network follow the rhythm?
 4. Loudness: how does activity grow from quiet to loud, layer by layer?
 5. A sudden bang: how far and how fast does it spread; does it reach escape neurons?
 6. Which sounds does the brain treat as similar?

Usage: python analysis/fly_sound_patterns.py --results <fly_sound output> --data <data folder> --out figures/fly-sound
"""
from __future__ import annotations

import argparse, json
from collections import deque
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ACTIVE_HZ = 2.0
GIANT_FIBER = [720575940622838154, 720575940632499757]


def hop_distance(data: Path, sources: np.ndarray, n: int, min_syn: int = 5) -> np.ndarray:
    """Shortest number of synapses from any source neuron, using connections with >= min_syn synapses."""
    con = pd.read_parquet(data / '2025_Connectivity_783.parquet', columns=['Presynaptic_Index', 'Postsynaptic_Index', 'Connectivity'])
    con = con[con.Connectivity >= min_syn]
    order = np.argsort(con.Presynaptic_Index.to_numpy(), kind='stable')
    pre = con.Presynaptic_Index.to_numpy()[order]; post = con.Postsynaptic_Index.to_numpy()[order]
    ptr = np.searchsorted(pre, np.arange(n + 1))
    dist = np.full(n, -1); dist[sources] = 0
    q = deque(sources.tolist())
    while q:
        u = q.popleft()
        for v in post[ptr[u]:ptr[u + 1]]:
            if dist[v] < 0: dist[v] = dist[u] + 1; q.append(v)
    return dist


def vector_strength(psth_row: np.ndarray, bin_s: float, f: float) -> float:
    """How strongly a firing-rate trace is locked to frequency f (0 = not at all, 1 = perfectly)."""
    if psth_row.sum() <= 0: return np.nan
    t = (np.arange(len(psth_row)) + .5) * bin_s
    z = np.sum(psth_row * np.exp(2j * np.pi * f * t)) / psth_row.sum()
    return float(abs(z))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--results', required=True); ap.add_argument('--data', required=True); ap.add_argument('--out', default='figures/fly-sound')
    a = ap.parse_args()
    res, data, out = Path(a.results), Path(a.data), Path(a.out); out.mkdir(parents=True, exist_ok=True)
    z = np.load(res / 'responses.npz', allow_pickle=True)
    sounds = list(z['sounds']); neuron = z['neuron']; fid = z['flywire_id']; R = z['rate']
    psth = np.load(res / 'psth.npy'); bin_s = float(z['bin_ms']) / 1000; t_ms = float(z['t_ms'])
    S = {s: i for i, s in enumerate(sounds)}

    ann = pd.read_csv(data / 'annotations.tsv', sep='\t', low_memory=False,
                      usecols=['root_id', 'cell_type', 'hemibrain_type', 'super_class', 'cell_class', 'cell_sub_class', 'top_nt', 'side'])
    ann = ann.drop_duplicates('root_id').set_index('root_id')
    ctype = pd.Series(fid).map(ann.cell_type).fillna(pd.Series(fid).map(ann.hemibrain_type)).fillna('untyped').to_numpy()
    sclass = pd.Series(fid).map(ann.super_class).fillna('unknown').to_numpy()
    sub = pd.Series(fid).map(ann.cell_sub_class).fillna('').to_numpy()
    is_jo = None  # set from the hop distance below (distance 0 = the driven JO neurons)

    comp = pd.read_csv(data / '2025_Completeness_783.csv', index_col=0)
    n_all = len(comp); idx_of = {f: i for i, f in enumerate(comp.index)}
    jo_all = np.array([idx_of[f] for f in ann.index[(ann.cell_sub_class == 'auditory') & ann.cell_type.astype(str).str.startswith('JO-')] if f in idx_of])
    dist_all = hop_distance(data, jo_all, n_all)
    dist = dist_all[neuron]
    is_jo = dist == 0

    down = ~is_jo  # analyse the brain's response, not the driven input neurons
    summary = {'n_sounds': len(sounds), 'jo_driven': int(is_jo.sum())}

    # --- 0. how much of the brain responds to each sound
    active = (R > ACTIVE_HZ) & down
    summary['active_by_sound'] = {s: int(active[S[s]].sum()) for s in sounds}
    summary['active_by_depth'] = {s: {int(d): int(((dist == d) & active[S[s]]).sum()) for d in range(1, 6)} for s in sounds}
    summary['super_class_by_sound'] = {s: pd.Series(sclass[active[S[s]]]).value_counts().head(8).to_dict() for s in sounds}

    # --- 1. pattern vs same average input
    pairs = {
        'pulse song, 36 ms gaps (natural)': 'control: 36 ms pulse input, no pattern',
        'noise, flutter (10 Hz)': 'control: flutter input, no pattern',
        'sudden bang': 'control: bang input, spread out',
    }
    pat = {}
    for p, c in pairs.items():
        if p not in S or c not in S: continue
        rp, rc = R[S[p]], R[S[c]]
        m = down & ((rp > ACTIVE_HZ) | (rc > ACTIVE_HZ))
        diff = (rp - rc) * m  # only neurons in the comparison set
        top_up = np.argsort(-diff)[:8]; top_dn = np.argsort(diff)[:8]
        pat[p] = {
            'active_pattern': int((m & (rp > ACTIVE_HZ)).sum()), 'active_control': int((m & (rc > ACTIVE_HZ)).sum()),
            'total_rate_ratio': float(rp[m].sum() / max(rc[m].sum(), 1e-9)),
            'population_corr': float(np.corrcoef(rp[m], rc[m])[0, 1]) if m.sum() > 2 else None,
            'only_with_pattern': int((m & (rp > ACTIVE_HZ) & (rc <= .5)).sum()),
            'only_without_pattern': int((m & (rc > ACTIVE_HZ) & (rp <= .5)).sum()),
            'more_with_pattern': [(str(ctype[i]), round(float(rp[i]), 1), round(float(rc[i]), 1), int(dist[i])) for i in top_up if diff[i] > 0],
            'more_without_pattern': [(str(ctype[i]), round(float(rp[i]), 1), round(float(rc[i]), 1), int(dist[i])) for i in top_dn if diff[i] < 0],
        }
    summary['pattern_vs_control'] = pat

    # --- 2. gap (IPI) tuning by cell type, per pulse
    ipis = [16, 36, 56, 79, 96]
    names = ['pulse song, 16 ms gaps', 'pulse song, 36 ms gaps (natural)', 'pulse song, 56 ms gaps', 'pulse song, 79 ms gaps', 'pulse song, 96 ms gaps']
    if all(n in S for n in names):
        pulses = np.array([len(np.arange(.02, t_ms / 1000, i / 1000)) for i in ipis])
        df = pd.DataFrame({'type': ctype, 'down': down, 'dist': dist})
        for n, ip in zip(names, ipis): df[ip] = R[S[n]]
        g = df[df.down].groupby('type')[ipis].mean()
        g = g[(g.max(1) > 5) & (g.index != 'untyped')]
        per_pulse = g / pulses
        best_rate = g.idxmax(1); best_pp = per_pulse.idxmax(1)
        summary['ipi'] = {
            'types_tested': int(len(g)),
            'type_best_gap_by_rate': {int(k): int(v) for k, v in best_rate.value_counts().items()},
        }
        # Neuron level (types average away detail): which gap gives the biggest response per pulse?
        X = np.array([R[S[n]] for n in names])[:, down & (np.array([R[S[n]] for n in names]).max(0) > 5)]
        pp = X / pulses[:, None]; best = pp.argmax(0)
        ok = pp[2] > 0
        summary['ipi']['neurons_tested'] = int(X.shape[1])
        summary['ipi']['neuron_best_gap_per_pulse'] = {int(ipis[i]): int((best == i).sum()) for i in range(len(ipis))}
        summary['ipi']['per_pulse_36_over_56_median'] = float(np.median(pp[1][ok] / pp[2][ok])) if ok.any() else None
        known = [t for t in ['vpoEN', 'vpoIN', 'pC1a', 'pC1b', 'pC1c', 'pC1d', 'pC1e', 'AMMC-A1', 'DNp37', 'DNp01'] if t in g.index]
        summary['ipi']['shuffled_vs_regular_36'] = {
            'total_regular': float(R[S['pulse song, 36 ms gaps (natural)']][down].sum()),
            'total_shuffled': float(R[S['pulse song, shuffled gaps']][down].sum()) if 'pulse song, shuffled gaps' in S else None}
        summary['ipi']['known_song_neurons'] = {t: [round(float(v), 1) for v in g.loc[t]] for t in known}
        fig, ax = plt.subplots(1, 2, figsize=(9, 3.4))
        top = g.max(1).sort_values(ascending=False).index[:12]
        for t in top: ax[0].plot(ipis, g.loc[t], marker='o', lw=1, label=t)
        ax[0].set(xlabel='gap between pulses (ms)', ylabel='mean rate (Hz)', title='Total rate: more pulses, more activity'); ax[0].legend(fontsize=6, ncol=2)
        for t in top: ax[1].plot(ipis, per_pulse.loc[t] / per_pulse.loc[t].max(), marker='o', lw=1)
        ax[1].axvline(36, color='k', ls=':', lw=.8)
        ax[1].set(xlabel='gap between pulses (ms)', ylabel='response per pulse (norm.)', title='Per pulse: longer gaps, more each')
        fig.tight_layout(); fig.savefig(out / 'ipi-tuning.png', dpi=160); fig.savefig(out / 'ipi-tuning.svg'); plt.close(fig)

    # --- 3. temporal following by depth
    follow = {}
    mods = {'pulse song, 16 ms gaps': 1000 / 16, 'pulse song, 36 ms gaps (natural)': 1000 / 36, 'pulse song, 96 ms gaps': 1000 / 96,
            'noise, flutter (10 Hz)': 10.0, 'noise, slow swell (0.5 Hz)': .5}
    for s, f in mods.items():
        if s not in S: continue
        rows = {}
        for d in range(1, 6):
            sel = down & (dist == d) & (R[S[s]] > ACTIVE_HZ)
            if sel.sum() < 3: continue
            vs = [vector_strength(psth[S[s], i, 20:], bin_s, f) for i in np.flatnonzero(sel)]
            rows[d] = {'n': int(sel.sum()), 'median_locking': float(np.nanmedian(vs))}
        follow[s] = rows
    summary['temporal_following'] = follow
    fig, ax = plt.subplots(figsize=(5.2, 3.4))
    for s, rows in follow.items():
        if rows: ax.plot(list(rows), [r['median_locking'] for r in rows.values()], marker='o', label=f'{s} ({mods[s]:.1f} Hz)')
    ax.set(xlabel='synapses from the ear (JO)', ylabel='locking to the rhythm (0–1)', title='How far into the brain a rhythm survives', ylim=(0, 1))
    ax.legend(fontsize=6); fig.tight_layout(); fig.savefig(out / 'rhythm-by-depth.png', dpi=160); fig.savefig(out / 'rhythm-by-depth.svg'); plt.close(fig)

    # --- 4. loudness growth by depth
    lv = ['steady noise, quiet', 'steady noise', 'steady noise, loud']
    if all(l in S for l in lv):
        jo_in = json.load(open(res / 'run.json'))['jo_mean_rate']
        growth = {}
        for d in range(1, 6):
            sel = down & (dist == d)
            growth[d] = [float(R[S[l]][sel].sum()) for l in lv]
        summary['loudness'] = {'jo_input_rate': {l: jo_in[l] for l in lv}, 'summed_rate_by_depth': growth,
                               'active': {l: int(active[S[l]].sum()) for l in lv}}
        fig, ax = plt.subplots(figsize=(5.2, 3.4))
        x = [np.mean(list(jo_in[l].values())) for l in lv]
        for d, ys in growth.items():
            if max(ys) > 0: ax.plot(x, np.array(ys) / max(ys), marker='o', label=f'{d} synapses in')
        ax.set(xlabel='mean input rate at the ear (Hz)', ylabel='summed activity (norm.)', title='Louder sound recruits deeper layers')
        ax.legend(fontsize=7); fig.tight_layout(); fig.savefig(out / 'loudness-by-depth.png', dpi=160); fig.savefig(out / 'loudness-by-depth.svg'); plt.close(fig)

    # --- 5. sudden bang spread
    if 'sudden bang' in S:
        b = S['sudden bang']; on = int(.5 / bin_s)
        lat = {}
        for d in range(1, 7):
            sel = down & (dist == d) & (R[b] > 0)
            if not sel.sum(): continue
            p = psth[b, sel, on:on + 40].mean(0)
            lat[d] = {'n': int(sel.sum()), 'peak_ms_after_onset': float(np.argmax(p) * bin_s * 1000)}
        gf = [int(np.flatnonzero(fid == g)[0]) for g in GIANT_FIBER if (fid == g).any()]
        dn = down & (pd.Series(sclass).eq('descending').to_numpy()) & (R[b] > ACTIVE_HZ)
        summary['bang'] = {'spread': lat, 'giant_fiber_rate': [float(R[b][i]) for i in gf],
                           'descending_neurons_active': sorted(set(map(str, ctype[dn])))[:20]}

    # --- 6. similarity between sounds
    keep = down & (R.max(0) > ACTIVE_HZ)
    X = np.log1p(R[:, keep])
    C = np.corrcoef(X)
    summary['similarity'] = {'sounds': sounds, 'corr': np.round(C, 3).tolist()}
    Xc = X - X.mean(0); u, s_, vt = np.linalg.svd(Xc, full_matrices=False); pc = u[:, :2] * s_[:2]
    summary['pca_explained'] = (s_[:4] ** 2 / (s_ ** 2).sum()).round(3).tolist()
    fig, ax = plt.subplots(1, 2, figsize=(11, 4.6))
    im = ax[0].imshow(C, vmin=0, vmax=1, cmap='viridis'); ax[0].set_xticks(range(len(sounds))); ax[0].set_yticks(range(len(sounds)))
    short = [s.replace('control: ', 'ctrl: ').replace(' (natural)', '') for s in sounds]
    ax[0].set_xticklabels(short, rotation=90, fontsize=6); ax[0].set_yticklabels(short, fontsize=6); fig.colorbar(im, ax=ax[0], shrink=.7)
    ax[0].set_title('Similarity of whole-brain responses', fontsize=9)
    ax[1].scatter(pc[:, 0], pc[:, 1], s=14)
    for i, s in enumerate(short): ax[1].annotate(s, pc[i], fontsize=6)
    ax[1].set(xlabel='PC1', ylabel='PC2', title='Sound map from brain activity'); fig.tight_layout()
    fig.savefig(out / 'sound-similarity.png', dpi=160); fig.savefig(out / 'sound-similarity.svg'); plt.close(fig)

    # --- top responding cell types per sound (for the report)
    tops = {}
    for s in sounds:
        df = pd.DataFrame({'type': ctype[down], 'r': R[S[s]][down], 'd': dist[down]})
        g = df[df.type != 'untyped'].groupby('type').agg(rate=('r', 'mean'), n=('r', 'size'), depth=('d', 'min'))
        tops[s] = [(t, round(float(r.rate), 1), int(r.n), int(r.depth)) for t, r in g.sort_values('rate', ascending=False).head(10).iterrows()]
    summary['top_types'] = tops
    json.dump(summary, open(out / 'patterns.json', 'w'), indent=1, default=str)
    print(json.dumps({k: summary[k] for k in ['active_by_sound', 'pattern_vs_control']}, indent=1, default=str)[:6000])


if __name__ == '__main__':
    main()
