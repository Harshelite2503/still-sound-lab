"""Compare the same sounds with the published inhibition and with weakened inhibition
(a model of the 'central gain' idea in sound sensitivity). Reads fly_sound.py outputs.

Usage: python analysis/fly_central_gain.py --runs base:<dir> 0.75:<dir> 0.5:<dir> --out figures/fly-sound
"""
import argparse, json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

SOUNDS = ['steady noise, quiet', 'steady noise', 'steady noise, loud', 'sudden bang', 'pulse song, 36 ms gaps (natural)', 'control: 36 ms pulse input, no pattern']

ap = argparse.ArgumentParser(); ap.add_argument('--runs', nargs='+', required=True); ap.add_argument('--out', default='figures/fly-sound')
a = ap.parse_args(); out = Path(a.out)
runs = {}
for spec in a.runs:
    label, d = spec.split(':', 1)
    z = np.load(Path(d) / 'responses.npz', allow_pickle=True)
    runs[label] = {s: dict(zip(z['flywire_id'].tolist(), z['rate'][i])) for i, s in enumerate(z['sounds']) if s in SOUNDS}
jo = set(json.load(open(out / 'jo_ids.json')))
res = {}
for label, d in runs.items():
    res[label] = {}
    for s in SOUNDS:
        if s not in d: continue
        r = {k: v for k, v in d[s].items() if k not in jo}
        res[label][s] = {'active_neurons': int(sum(v > 2 for v in r.values())), 'summed_rate_hz': round(float(sum(r.values())), 1),
                         'giant_fiber_hz': round(float(max(r.get(720575940622838154, 0), r.get(720575940632499757, 0))), 1)}
json.dump(res, open(out / 'central-gain.json', 'w'), indent=1)
labels = list(runs); lv = SOUNDS[:3]
fig, ax = plt.subplots(figsize=(5.4, 3.5))
for lab in labels:
    ax.plot(['quiet', 'normal', 'loud'], [res[lab][s]['active_neurons'] for s in lv], marker='o', label={'base': 'published inhibition'}.get(lab, f'inhibition x{lab}'))
ax.set(ylabel='neurons responding (beyond the ear)', title='Same sound, weaker inhibition: more of the brain responds'); ax.legend(fontsize=8)
fig.tight_layout(); fig.savefig(out / 'central-gain.png', dpi=160); fig.savefig(out / 'central-gain.svg')
print(json.dumps(res, indent=1))
