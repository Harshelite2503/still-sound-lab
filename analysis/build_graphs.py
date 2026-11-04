"""Build measured chart data and static scientific figures for the three reference excerpts.

Requires numpy, imageio-ffmpeg and (for figures) matplotlib. No network or model calls.
Usage:
  python build_graphs.py --audio-dir /path/to/excerpts --output-dir /path/to/graphs
  python build_graphs.py --data-only

Input excerpts are not bundled by this script. Relative digital levels are not dB SPL.
"""
from __future__ import annotations
import argparse
import csv
import json
import math
import os
from pathlib import Path
import subprocess
import numpy as np
import imageio_ffmpeg

HERE = Path(__file__).resolve().parent
RATE = 44100
PSD_N = 131072
FLOOR = -70.0
SOURCES = [
    {"id":"fyGmSFUPo8o", "filename":"fyGmSFUPo8o-1968-1998.m4a", "label":"Binaural reference", "start_seconds":1968, "end_seconds":1998},
    {"id":"Ttaf1IYt6F4", "filename":"Ttaf1IYt6F4-60-90.m4a", "label":"Handpan reference", "start_seconds":60, "end_seconds":90},
    {"id":"6Kj-ye-aYBA", "filename":"6Kj-ye-aYBA-60-90.m4a", "label":"Singing-bowl reference", "start_seconds":60, "end_seconds":90},
]


def decode(path: Path) -> np.ndarray:
    result = subprocess.run([
        imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error",
        "-i", str(path), "-t", "30", "-f", "f32le", "-acodec", "pcm_f32le",
        "-ar", str(RATE), "-ac", "2", "pipe:1",
    ], capture_output=True, check=True)
    audio = np.frombuffer(result.stdout, dtype="<f4").reshape(-1, 2).astype(np.float64)
    if len(audio) < RATE * 29.5 or not np.isfinite(audio).all():
        raise ValueError(f"Invalid or unexpectedly short decoded excerpt: {path.name}")
    return audio


def one_sided_power(block: np.ndarray, n: int | None = None) -> np.ndarray:
    n = len(block) if n is None else n
    window = np.hanning(len(block))
    centered = block - block.mean(axis=0)
    power = np.abs(np.fft.rfft(centered * window[:, None], n=n, axis=0)) ** 2
    power /= RATE * np.sum(window ** 2)
    power[1:-1] *= 2
    return power


def welch(audio: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    chunks = [one_sided_power(audio[i:i + PSD_N])
              for i in range(0, len(audio) - PSD_N + 1, PSD_N // 2)]
    return np.fft.rfftfreq(PSD_N, 1 / RATE), np.mean(chunks, axis=0)


def db_relative(power: np.ndarray, maximum: float) -> np.ndarray:
    return np.maximum(FLOOR, 10 * np.log10(np.maximum(power, 1e-50) / max(maximum, 1e-50)))


def rounded(values, digits=3):
    return np.round(np.asarray(values), digits).tolist()


def peak_frequency(power, index, n):
    a, b, c = np.log(np.maximum(power[index-1:index+2], 1e-50))
    denominator = a - 2 * b + c
    delta = np.clip(.5 * (a-c) / denominator, -.5, .5) if abs(denominator) > 1e-15 else 0
    return float((index + delta) * RATE / n)


def make_spectrum(frequencies, power):
    maximum = float(np.max(power[(frequencies >= 20) & (frequencies <= 8000)]))
    low = (frequencies >= 20) & (frequencies <= 650)
    axis = list(frequencies[low])
    values = [*power[low]]
    high_edges = np.geomspace(650, 8000, 181)
    for start, end in zip(high_edges[:-1], high_edges[1:]):
        selection = (frequencies > start) & (frequencies <= end)
        if np.any(selection):
            axis.append(math.sqrt(start * end))
            values.append(power[selection].max(axis=0))
    values = np.asarray(values)
    relative = db_relative(values, maximum)
    return {
        "frequency_hz": rounded(axis, 5), "left_db": rounded(relative[:,0]),
        "right_db": rounded(relative[:,1]), "floor_db": FLOOR,
        "normalization": "0 dB is the maximum single-channel bin in this excerpt's mean one-sided power spectral density from 20 Hz to 8 kHz; both channels share that reference.",
        "dense_bin_spacing_hz": RATE / PSD_N,
        "high_frequency_pooling": "Above 650 Hz, each logarithmic display bin retains the maximum power separately for each channel. These pooled points are for display, not feature calculations.",
    }


def make_spectrogram(audio):
    size = 4096
    starts = np.round(np.linspace(0, len(audio)-size, 150)).astype(int)
    frequencies = np.fft.rfftfreq(size, 1/RATE)
    edges = np.geomspace(20, 8000, 97)
    values = []
    for start in starts:
        power = one_sided_power(audio[start:start+size]).mean(axis=1)
        row = []
        for low, high in zip(edges[:-1], edges[1:]):
            indices = np.flatnonzero((frequencies >= low) & (frequencies < high))
            if len(indices):
                row.append(float(power[indices].mean()))
            else:
                # Display interpolation for bins narrower than the FFT's 10.77 Hz spacing.
                # It does not add spectral resolution and cannot resolve the 0.5 Hz pair.
                row.append(float(np.interp(math.sqrt(low*high), frequencies, power)))
        values.append(row)
    values = np.asarray(values)
    relative = db_relative(values, float(np.max(values)))
    return {
        "times_s": rounded((starts + size/2) / RATE, 5),
        "frequency_hz": rounded(np.sqrt(edges[:-1]*edges[1:]), 5),
        "frequency_edges_hz": rounded(edges, 5),
        "db": rounded(relative, 2), "floor_db": FLOOR,
        "normalization": "0 dB is this excerpt's highest displayed time-frequency power, after averaging L/R power; colors cannot compare absolute levels between recordings.",
        "fft_size": size, "fft_bin_spacing_hz": RATE / size,
        "method": "150 evenly spaced 4096-sample Hann windows; 96 logarithmic display bins. Narrow display bins interpolate the sampled PSD. This view cannot resolve sub-Hz carrier differences; use the long-window spectrum zooms.",
    }


def make_envelope(audio):
    size = 4410
    count = len(audio) // size
    rms = np.sqrt(np.mean(audio[:count*size].reshape(count, size, 2)**2, axis=1))
    db = 20 * np.log10(np.maximum(rms, 1e-10))
    return {
        "times_s": rounded((np.arange(count)+.5)*size/RATE, 3),
        "left_rms_dbfs": rounded(db[:,0]), "right_rms_dbfs": rounded(db[:,1]),
        "window_seconds": size/RATE,
        "method": "Non-overlapping 100 ms RMS windows, 20 log10(RMS), with digital full-scale amplitude 1. This is a level envelope, not a modulation spectrum or calibrated listening volume.",
    }


def make_features(audio, frequencies, power):
    combined = power.mean(axis=1)
    valid = frequencies >= 20
    fp = frequencies[valid]
    pp = combined[valid]
    total = pp.sum()
    rms = np.sqrt(np.mean(audio**2, axis=0))
    rolloff_index = int(np.searchsorted(np.cumsum(pp), .85*total))
    flatness = np.exp(np.mean(np.log(np.maximum(pp, 1e-50)))) / np.mean(pp)
    return {
        "centroid_hz": round(float((fp*pp).sum()/total), 3),
        "rolloff85_hz": round(float(fp[min(rolloff_index, len(fp)-1)]), 3),
        "flatness": float(flatness),
        "band_energy": {
            "low": round(float(pp[fp < 250].sum()/total), 6),
            "mid": round(float(pp[(fp >= 250) & (fp < 2000)].sum()/total), 6),
            "high": round(float(pp[fp >= 2000].sum()/total), 6),
        },
        "band_definitions_hz": {"low":[20,250], "mid":[250,2000], "high":[2000,RATE/2]},
        "rms_dbfs": {"left":round(float(20*np.log10(rms[0])),3), "right":round(float(20*np.log10(rms[1])),3)},
        "peak_dbfs": round(float(20*np.log10(np.max(np.abs(audio)))),3),
        "samples_at_or_above_full_scale": int(np.sum(np.abs(audio) >= 1)),
        "stereo_correlation": round(float(np.corrcoef(audio.T)[0,1]),6),
        "method": "Features use the unpooled mean one-sided power spectrum from 20 Hz to Nyquist. Flatness and centroid are power-based; spectral peaks are not automatically musical fundamentals.",
    }


def make_tone_pairs(audio):
    n = len(audio)
    frequencies = np.fft.rfftfreq(n, 1/RATE)
    power = one_sided_power(audio)
    maximum = float(np.max(power))
    relative = db_relative(power, maximum)
    pairs, zooms = [], []
    for label, low, high in [("Lower pair · approximately 0.5 Hz separation",78,86),
                             ("Upper pair · approximately 3.0 Hz separation",164,176)]:
        selected = (frequencies >= low) & (frequencies <= high)
        candidates = np.flatnonzero(selected)
        pair = []
        for channel in range(2):
            index = candidates[np.argmax(power[selected,channel])]
            pair.append(peak_frequency(power[:,channel],int(index),n))
        pairs.append({"left_hz":round(pair[0],6), "right_hz":round(pair[1],6),
                      "difference_hz":round(abs(pair[0]-pair[1]),6), "band_hz":[low,high]})
        zooms.append({"label":label,"frequency_hz":rounded(frequencies[selected],6),
                      "left_db":rounded(relative[selected,0]),"right_db":rounded(relative[selected,1])})
    return {
        "pairs":pairs,"zooms":zooms,"fft_bin_spacing_hz":RATE/n,
        "normalization":"Both channels and both zoom panels share the largest bin in the full-excerpt, 30-second Hann-window spectrum as 0 dB.",
        "interpretation":"These ear-separated stable carrier pairs are compatible with a binaural-stimulation design. They do not establish brain entrainment, pain relief, or a therapeutic frequency.",
    }


def validate_synthetic():
    t = np.arange(RATE*9)/RATE
    audio = np.column_stack([.1*np.sin(2*np.pi*220*t), .1*np.sin(2*np.pi*226*t)])
    frequencies, power = welch(audio)
    found = [peak_frequency(power[:,c],int(np.argmax(power[:,c])),PSD_N) for c in range(2)]
    assert max(abs(found[0]-220),abs(found[1]-226)) < .05, found
    assert abs(float((power.mean(axis=1)*frequencies).sum()/power.mean(axis=1).sum())-223)<.05
    assert np.isclose(float(np.sqrt(np.mean(audio[:,0]**2))), .1/np.sqrt(2), atol=1e-5)
    return {"status":"passed","synthetic_carriers_hz":[220,226],"estimated_carriers_hz":rounded(found,6),"centroid_expected_hz":223}


def validate_recording(record):
    for branch in [record['spectrum'],*record.get('tone_pairs',{}).get('zooms',[])]:
        x = np.asarray(branch['frequency_hz'])
        assert np.all(np.diff(x)>0)
        for key in ['left_db','right_db']:
            values=np.asarray(branch[key])
            assert values.shape == x.shape and np.isfinite(values).all()
            assert values.min()>=FLOOR and values.max()<=.001
    spec=record['spectrogram']
    values=np.asarray(spec['db'])
    assert values.shape==(len(spec['times_s']),len(spec['frequency_hz']))
    assert values.shape==(150,96) and np.isfinite(values).all()
    assert values.min()>=FLOOR and values.max()<=.001
    assert np.all(np.diff(spec['times_s'])>0) and np.all(np.diff(spec['frequency_hz'])>0)
    env=record['envelope']
    assert np.all(np.diff(env['times_s'])>0)
    for key in ['left_rms_dbfs','right_rms_dbfs']:
        assert len(env[key])==len(env['times_s']) and np.isfinite(env[key]).all()
    assert abs(sum(record['features']['band_energy'].values())-1)<2e-6


def write_csv(output, record):
    for name, keys in [('spectrum', ['frequency_hz','left_db','right_db']),
                       ('envelope',['times_s','left_rms_dbfs','right_rms_dbfs'])]:
        with (output/f"{record['id']}-{name}.csv").open('w', newline='') as f:
            writer=csv.writer(f);writer.writerow(keys)
            writer.writerows(zip(*(record[name][key] for key in keys)))
    for index, zoom in enumerate(record.get('tone_pairs',{}).get('zooms',[]),1):
        keys=['frequency_hz','left_db','right_db']
        with (output/f"{record['id']}-pair-{index}-spectrum.csv").open('w',newline='') as f:
            writer=csv.writer(f);writer.writerow(keys)
            writer.writerows(zip(*(zoom[key] for key in keys)))


def static_figures(data, output):
    # Keep Matplotlib's cache within the task output, never the home directory.
    os.environ.setdefault('MPLCONFIGDIR',str(output/'.matplotlib-cache'))
    os.environ.setdefault('XDG_CACHE_HOME',str(output/'.cache'))
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.colors import LinearSegmentedColormap, Normalize
    from matplotlib.ticker import FuncFormatter
    from matplotlib.lines import Line2D
    LEFT='#246d70';RIGHT='#c56f58';INK='#234336';MUTED='#607168';BG='#fcfcf8'
    plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.labelcolor':INK,
        'text.color':INK,'xtick.color':MUTED,'ytick.color':MUTED,'axes.edgecolor':'#b8c4bb',
        'axes.spines.top':False,'axes.spines.right':False,'axes.facecolor':BG,
        'figure.facecolor':BG,'savefig.facecolor':BG,'svg.fonttype':'none','pdf.fonttype':42})
    cmap=LinearSegmentedColormap.from_list('still',['#162e29','#37695d','#8bb89a','#e2e5b4'])
    fig,axes=plt.subplots(3,3,figsize=(15.6,11.5))
    fig.subplots_adjust(left=.067,right=.90,bottom=.13,top=.855,wspace=.32,hspace=.70)
    fig.suptitle('Three recordings, three acoustic profiles',x=.067,y=.975,ha='left',fontsize=22,fontweight='bold')
    fig.text(.067,.935,'Measured 30-second excerpts · separate stereo channels · no clinical inference',fontsize=11,color=MUTED)
    titles=['Frequency content','Time–frequency structure','Level over time']
    for c,title in enumerate(titles):
        axes[0,c].text(0,1.34,title,transform=axes[0,c].transAxes,fontsize=13,fontweight='bold')
    fig.legend(handles=[Line2D([0],[0],color=LEFT,lw=2,label='Left channel'),Line2D([0],[0],color=RIGHT,lw=2,label='Right channel')],loc='upper right',bbox_to_anchor=(.90,.961),frameon=False,ncol=2,fontsize=10)
    image=None
    for row,r in enumerate(data['recordings']):
        sp=r['spectrum'];sg=r['spectrogram'];en=r['envelope']
        ax=axes[row,0]
        for key,color in [('left_db',LEFT),('right_db',RIGHT)]:ax.plot(sp['frequency_hz'],sp[key],color=color,lw=1,alpha=.9)
        ax.set_xscale('log');ax.set_xlim(20,8000);ax.set_ylim(-72,3)
        ax.set_xticks([20,50,100,250,500,1000,2000,8000],labels=['20','50','100','250','500','1k','2k','8k'])
        ax.tick_params(axis='x',labelsize=8);ax.set_yticks([-70,-50,-30,-10,0])
        ax.set_xlabel('Frequency (Hz)');ax.set_ylabel('Relative spectral power (dB)')
        ax.grid(alpha=.18,which='major',lw=.6)
        start=r['start_seconds'];end=start+r['duration']
        timing=f'{int(start//60):02d}:{int(start%60):02d}–{int(end//60):02d}:{int(end%60):02d}'
        ax.set_title(r['label']+' · '+timing,loc='left',fontsize=10.8,pad=13,fontweight='bold')
        ax=axes[row,1]
        centers=np.asarray(sg['times_s']);time_edges=np.r_[0,(centers[:-1]+centers[1:])/2,r['duration']]
        image=ax.pcolormesh(time_edges,sg['frequency_edges_hz'],np.asarray(sg['db']).T,cmap=cmap,vmin=-70,vmax=0,shading='flat',rasterized=True)
        ax.set_yscale('log');ax.set_ylim(20,8000);ax.set_xlim(0,30)
        ax.set_yticks([20,100,500,2000,8000],labels=['20','100','500','2k','8k'])
        ax.set_xlabel('Time within excerpt (s)');ax.set_ylabel('Frequency (Hz)')
        ax.set_title('L/R power averaged',loc='left',fontsize=10,pad=13,color=MUTED)
        ax=axes[row,2]
        ax.plot(en['times_s'],en['left_rms_dbfs'],color=LEFT,lw=1.2)
        ax.plot(en['times_s'],en['right_rms_dbfs'],color=RIGHT,lw=1.1,alpha=.9)
        ax.set_xlim(0,30);ax.set_ylim(-45,-8);ax.set_yticks([-40,-30,-20,-10])
        ax.set_xlabel('Time within excerpt (s)');ax.set_ylabel('100 ms RMS level (dBFS)')
        ax.set_title(f"Centroid {r['features']['centroid_hz']:.0f} Hz · low-band energy {100*r['features']['band_energy']['low']:.0f}%",loc='left',fontsize=10,pad=13,color=MUTED)
        ax.grid(alpha=.18,lw=.6)
    cax=fig.add_axes([.921,.13,.011,.725]);cb=fig.colorbar(image,cax=cax,ticks=[-70,-50,-30,-10,0])
    cb.set_label('Relative time–frequency power (dB)',labelpad=9);cb.outline.set_visible(False)
    fig.text(.067,.077,'Methods: spectra average 131,072-sample Hann windows (50% overlap); 150 sampled short windows form each spectrogram.',fontsize=9,color=MUTED)
    fig.text(.067,.055,'Spectra and spectrograms each use an independent 0 dB reference per recording. Colors do not compare absolute loudness across recordings.',fontsize=9,color=MUTED)
    fig.text(.067,.033,'dBFS is a digital level, not ear-level dB SPL. These plots describe sound—not brainwaves, migraine relief, or a personal “sweet spot.”',fontsize=9,color=MUTED)
    for ext in ['png','svg','pdf']:fig.savefig(output/f'reference-audio-overview.{ext}',dpi=190)
    plt.close(fig)

    first=data['recordings'][0];pairs=first['tone_pairs']
    fig,axes=plt.subplots(1,2,figsize=(12.5,6.5))
    fig.subplots_adjust(left=.075,right=.97,bottom=.24,top=.72,wspace=.25)
    fig.suptitle('Two stereo tone pairs in the first reference',x=.075,y=.95,ha='left',fontsize=21,fontweight='bold')
    fig.text(.075,.892,'32:48–33:18 excerpt · full 30-second Hann window · 0.033 Hz FFT bin spacing',fontsize=11,color=MUTED)
    fig.legend(handles=[Line2D([0],[0],color=LEFT,lw=2,label='Left channel'),Line2D([0],[0],color=RIGHT,lw=2,label='Right channel')],loc='upper left',bbox_to_anchor=(.07,.862),frameon=False,ncol=2)
    for ax,zoom,pair in zip(axes,pairs['zooms'],pairs['pairs']):
        ax.plot(zoom['frequency_hz'],zoom['left_db'],color=LEFT,lw=1.7)
        ax.plot(zoom['frequency_hz'],zoom['right_db'],color=RIGHT,lw=1.7)
        ax.set_xlim(pair['band_hz']);ax.set_ylim(-72,8)
        ax.set_xlabel('Frequency (Hz)');ax.set_ylabel('Relative spectral power (dB)')
        ax.set_yticks([-70,-50,-30,-10,0]);ax.grid(alpha=.2,lw=.6)
        ax.set_title(f"Approx. {pair['difference_hz']:.1f} Hz separation",loc='left',fontweight='bold',fontsize=12,pad=12)
        for side,color,dx in [('left',LEFT,38),('right',RIGHT,-38)]:
            hz=pair[side+'_hz'];key=side+'_db';index=int(np.argmin(np.abs(np.asarray(zoom['frequency_hz'])-hz)))
            y=zoom[key][index]
            ax.annotate(f'{hz:.1f} Hz',xy=(hz,y),xytext=(dx,-27),textcoords='offset points',ha='center',va='top',fontsize=10,color=color,arrowprops={'arrowstyle':'-','color':color,'lw':.7})
    fig.text(.075,.143,'The two channels share one 0 dB reference. Rounded peak labels are shown; sub-bin estimates are not guaranteed resolving power.',fontsize=9,color=MUTED)
    fig.text(.075,.111,'The carrier frequencies and their differences are separate quantities. Ear-separated tones are compatible with binaural stimulation.',fontsize=9,color=MUTED)
    fig.text(.075,.079,'These measurements do not establish a perceived beat, brain entrainment, pain relief, or an effective treatment frequency.',fontsize=9,color=MUTED)
    fig.text(.075,.047,'Source: youtube.com/watch?v=fyGmSFUPo8o&t=1968s · Analysis limited to this excerpt.',fontsize=9,color=MUTED)
    for ext in ['png','svg','pdf']:fig.savefig(output/f'stereo-tone-pairs.{ext}',dpi=190)
    plt.close(fig)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audio-dir',type=Path,default=HERE)
    parser.add_argument('--output-dir',type=Path,default=HERE.parent/'graph-artifacts')
    parser.add_argument('--data-only',action='store_true')
    args=parser.parse_args();args.output_dir.mkdir(parents=True,exist_ok=True)
    validation=validate_synthetic()
    data={
        'schema_version':1,
        'methods':{'analysis_type':'Descriptive measured acoustics; no brain or clinical measurements',
            'spectrum_fft_size':PSD_N,'spectrum_window':'Hann','spectrum_overlap_fraction':.5,
            'spectrum_floor_db':FLOOR,'features_frequency_range_hz':[20,RATE/2],
            'feature_normalization':'Power-weighted; full unpooled mean PSD, not the logarithmic display bins',
            'limits':['30-second excerpts, not complete recordings','Per-recording relative spectrum and spectrogram normalization','Digital levels are not calibrated dB SPL','Personal comfort requires individual feedback; no sweet spot can be inferred from these recordings alone']},
        'sources':[],'recordings':[], 'validation':validation,
    }
    for source in SOURCES:
        path=args.audio_dir/source['filename']
        audio=decode(path);frequencies,power=welch(audio)
        record={**{k:source[k] for k in ['id','label','start_seconds']},
            'source_url':f"https://www.youtube.com/watch?v={source['id']}&t={source['start_seconds']}s",
            'duration':round(len(audio)/RATE,6),'sample_rate':RATE,
            'spectrum':make_spectrum(frequencies,power),'spectrogram':make_spectrogram(audio),
            'envelope':make_envelope(audio),'features':make_features(audio,frequencies,power)}
        if source['id']=='fyGmSFUPo8o':record['tone_pairs']=make_tone_pairs(audio)
        validate_recording(record);data['recordings'].append(record)
        data['sources'].append({**source,'url':record['source_url']})
        write_csv(args.output_dir,record)
    output=args.output_dir/'chart-data.json'
    output.write_text(json.dumps(data,separators=(',',':'),ensure_ascii=False))
    assert output.stat().st_size<2_000_000,output.stat().st_size
    print(json.dumps({'chart_data':str(output),'bytes':output.stat().st_size,'validation':validation,
        'recordings':[{'id':r['id'],'spectrum_points':len(r['spectrum']['frequency_hz']),'spectrogram_shape':list(np.shape(r['spectrogram']['db'])),'envelope_points':len(r['envelope']['times_s'])} for r in data['recordings']]}))
    if not args.data_only:
        static_figures(data,args.output_dir)
        print('Static figures exported as PNG, SVG and PDF.')


if __name__=='__main__':main()
