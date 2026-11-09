"""Fast re-implementation of the Shiu et al. (Nature 2024) whole-brain fly LIF model,
with time-varying Poisson input so sound-like patterns can drive sensory neurons.

Same equations, constants and per-step order as the Brian2 model in
github.com/eonsystemspbc/fly-brain (code/paper-phil-drosophila/model.py):

    dv/dt = (v_0 - v + g) / t_mbr      (unless refractory)
    dg/dt = -g / tau                   (unless refractory)
    spike when v > v_th; reset v = v_rst, g = 0; refractory t_rfc (0 for driven neurons)
    synapse: g += w after t_dly, w = (sign x synapse count) x w_syn
    Poisson input: v += w_syn x f_poi per event (one input event makes the neuron spike)

Each step follows Brian2's schedule: integrate (exact solution of the linear ODEs),
threshold, synaptic delivery and Poisson input, reset. As in Brian2, synaptic input that
arrives while a neuron is refractory is discarded (measured: membrane traces of a test
network match Brian2 to 1e-13 mV). `validate_against_brian2`
checks it against Brian2 itself.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from pathlib import Path

PARAMS = dict(
    v_0=-52.0, v_rst=-52.0, v_th=-45.0,  # mV
    t_mbr=20.0, tau=5.0, t_rfc=2.2, t_dly=1.8,  # ms
    w_syn=0.275, f_poi=250.0,  # mV, scale
    dt=0.1,  # ms (Brian2 default)
)


class FlyBrain:
    def __init__(self, path_comp: Path, path_con: Path, params: dict | None = None):
        self.p = {**PARAMS, **(params or {})}
        comp = pd.read_csv(path_comp, index_col=0)
        con = pd.read_parquet(path_con, columns=['Presynaptic_Index', 'Postsynaptic_Index', 'Excitatory x Connectivity'])
        self.ids = comp.index.to_numpy()
        self.index = {fid: i for i, fid in enumerate(self.ids)}
        self.n = len(self.ids)
        pre = con['Presynaptic_Index'].to_numpy(np.int64)
        post = con['Postsynaptic_Index'].to_numpy(np.int64)
        w = con['Excitatory x Connectivity'].to_numpy(np.float64) * self.p['w_syn']
        # Optional: scale all inhibitory synapses (1 = published model). Used to mimic the
        # reduced inhibition proposed for "central gain" in sound sensitivity.
        w[w < 0] *= self.p.get('inh_scale', 1.0)
        order = np.argsort(pre, kind='stable')  # CSR by presynaptic neuron, for spike delivery
        self.post, self.w = post[order].astype(np.int32), w[order].astype(np.float32)
        self.indptr = np.zeros(self.n + 1, np.int64)
        np.add.at(self.indptr, pre + 1, 1)
        self.indptr = np.cumsum(self.indptr)

    def idx(self, flywire_ids) -> np.ndarray:
        return np.array([self.index[f] for f in flywire_ids if f in self.index], dtype=np.int64)

    def run(self, t_ms: float, drive: dict[str, tuple[np.ndarray, np.ndarray]], seed: int = 0,
            silence: np.ndarray | None = None, record_v: np.ndarray | None = None):
        """Simulate for t_ms.

        drive: name -> (neuron indices, rate in Hz for every time step, length n_steps).
        Returns spike steps and neuron indices (arrays), plus optional membrane traces.
        """
        p, rng = self.p, np.random.default_rng(seed)
        dt, n = p['dt'], self.n
        steps = int(round(t_ms / dt))
        delay = int(round(p['t_dly'] / dt))
        a, b = 1.0 / p['t_mbr'], 1.0 / p['tau']
        ea, eb = np.exp(-a * dt), np.exp(-b * dt)
        cross = a * (eb - ea) / (a - b)  # exact coupling of g into v over one step
        v = np.full(n, p['v_0']); g = np.zeros(n)
        rfc = np.full(n, p['t_rfc'])
        driven = np.concatenate([d[0] for d in drive.values()]) if drive else np.array([], np.int64)
        rfc[driven] = 0.0  # as in poi(): Poisson-driven neurons have no refractory period
        ref_until = np.full(n, -1.0)
        w = self.w
        if silence is not None and len(silence):
            w = w.copy()
            mute = np.zeros(n, bool); mute[silence] = True
            pre_of = np.repeat(np.arange(n), np.diff(self.indptr))
            w[mute[pre_of] | mute[self.post]] = 0.0
        queue = [np.array([], np.int64)] * delay  # ring of `delay` slots: read what was written `delay` steps ago
        kick = p['w_syn'] * p['f_poi']
        out_t, out_i, traces = [], [], []
        for s in range(steps):
            t = s * dt
            active = ref_until < t  # 'unless refractory'
            u = v - p['v_0']
            v = np.where(active, p['v_0'] + u * ea + g * cross, v)
            g = np.where(active, g * eb, g)
            spk = np.flatnonzero((v > p['v_th']) & active)
            # synaptic delivery of spikes from `delay` steps ago
            due = queue[s % delay]
            if due.size:
                starts, ends = self.indptr[due], self.indptr[due + 1]
                sel = np.concatenate([np.arange(st, en) for st, en in zip(starts, ends)]) if due.size > 1 else np.arange(starts[0], ends[0])
                inc = np.bincount(self.post[sel], weights=w[sel], minlength=n)
                g += np.where(active, inc, 0.0)  # Brian2 discards input that arrives while a neuron is refractory
            # Poisson input (time-varying rate per driven group)
            for idxs, rate in drive.values():
                r = rate[s] if np.ndim(rate) else rate
                if r > 0:
                    hit = idxs[rng.random(idxs.size) < r * dt * 1e-3]
                    v[hit] += kick
            queue[s % delay] = spk
            if spk.size:
                v[spk] = p['v_rst']; g[spk] = 0.0
                ref_until[spk] = t + rfc[spk] - 1e-9
                out_t.append(np.full(spk.size, s, np.int32)); out_i.append(spk.astype(np.int32))
            if record_v is not None:
                traces.append(v[record_v].copy())
        st = np.concatenate(out_t) if out_t else np.array([], np.int32)
        si = np.concatenate(out_i) if out_i else np.array([], np.int32)
        return st, si, (np.array(traces) if record_v is not None else None)


def rates_hz(spike_idx: np.ndarray, n: int, t_ms: float) -> np.ndarray:
    return np.bincount(spike_idx, minlength=n) / (t_ms / 1000.0)
