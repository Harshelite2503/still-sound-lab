"""Reproducible local analysis of three explicitly bounded YouTube audio excerpts.
Run from repository: python analysis/analyze_references.py
No network, model inference, clinical classification, or calibrated loudness measurement.
"""
from pathlib import Path
import json, math, subprocess, re, html
import numpy as np
import imageio_ffmpeg

ROOT=Path(__file__).resolve().parent
AUDIO_ROOT=ROOT.parent/"samples"
OUTPUT_ROOT=ROOT.parent/"data"
RATE=44100
FFT_SIZE=131072
EXCERPTS=[
    ('fyGmSFUPo8o','fyGmSFUPo8o-1968-1998.m4a',1968,1998,'Migraine / binaural-beat reference'),
    ('Ttaf1IYt6F4','Ttaf1IYt6F4-60-90.m4a',60,90,'Handpan reference'),
    ('6Kj-ye-aYBA','6Kj-ye-aYBA-60-90.m4a',60,90,'Singing-bowl reference'),
]

def decode(path):
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    p=subprocess.run([ffmpeg,'-hide_banner','-nostats','-i',str(path),'-t','30','-f','f32le','-acodec','pcm_f32le','-ar',str(RATE),'-ac','2','pipe:1'],capture_output=True,check=True)
    text=p.stderr.decode(errors='replace')
    audio_lines=[line.strip() for line in text.splitlines() if 'Audio:' in line]
    values=np.frombuffer(p.stdout,dtype='<f4').reshape(-1,2).astype(np.float64)
    return values,audio_lines

def interpolated_peak(power,index,rate=RATE,n=FFT_SIZE):
    if index<=0 or index>=len(power)-1:return float(index*rate/n)
    left,center,right=np.log(np.maximum(power[index-1:index+2],1e-50))
    denominator=left-2*center+right
    delta=np.clip(.5*(left-right)/denominator,-.5,.5) if abs(denominator)>1e-15 else 0
    return float((index+delta)*rate/n)

def top_peaks(power,rate=RATE,n=FFT_SIZE,count=10,min_hz=20,max_hz=10000,spacing=3):
    freq=np.fft.rfftfreq(n,1/rate)
    candidates=np.flatnonzero((power[1:-1]>power[:-2])&(power[1:-1]>=power[2:]))+1
    candidates=candidates[(freq[candidates]>=min_hz)&(freq[candidates]<=max_hz)]
    candidates=sorted(candidates,key=lambda i:power[i],reverse=True)
    output=[]
    pmax=max(float(np.max(power)),1e-50)
    for index in candidates:
        hz=interpolated_peak(power,index,rate,n)
        rel=10*math.log10(max(float(power[index])/pmax,1e-50))
        if rel < -50:break
        if any(abs(hz-v['frequency_hz'])<spacing for v in output):continue
        output.append({'frequency_hz':round(hz,3),'relative_peak_power_db':round(rel,2),'bin':int(index)})
        if len(output)>=count:break
    return output

def analyze(data):
    n=FFT_SIZE
    if len(data)<n:raise ValueError('Excerpt too short for selected FFT window')
    starts=list(range(0,len(data)-n+1,n//2))
    window=np.hanning(n)
    frequencies=np.fft.rfftfreq(n,1/RATE)
    ps=[]
    trajectories=[[],[]]
    valid=(frequencies>=20)
    for start in starts:
        block=data[start:start+n]
        block=block-block.mean(axis=0)
        p=np.abs(np.fft.rfft(block*window[:,None],axis=0))**2
        ps.append(p)
        for c in range(2):
            index=np.argmax(np.where(valid,p[:,c],0))
            trajectories[c].append(interpolated_peak(p[:,c],int(index)))
    mean=np.mean(ps,axis=0)
    combined=mean.mean(axis=1)
    denominator=np.sum(combined[valid])
    peaks=[top_peaks(mean[:,c]) for c in range(2)]
    combined_peaks=top_peaks(combined,count=12)
    comparison=[]
    for peak in combined_peaks:
        mask=np.abs(frequencies-peak['frequency_hz'])<=1.5
        energies=mean[mask].sum(axis=0)
        comparison.append({'frequency_hz':peak['frequency_hz'],'left_relative_to_right_db':round(float(10*np.log10(max(energies[0],1e-50)/max(energies[1],1e-50))),2), 'relative_peak_power_db':peak['relative_peak_power_db']})
    mid=(data[:,0]+data[:,1])/2
    side=(data[:,0]-data[:,1])/2
    total=float(np.mean(data**2))
    # Spectrum-wide similarity is descriptive, not a binaural-beat detector.
    spectrum_cosine=float(np.dot(mean[:,0],mean[:,1])/(np.linalg.norm(mean[:,0])*np.linalg.norm(mean[:,1])))
    rms=np.sqrt(np.mean(data**2,axis=0))
    traj=[]
    for values in trajectories:
        traj.append({'median_hz':round(float(np.median(values)),3),'min_hz':round(float(min(values)),3),'max_hz':round(float(max(values)),3),'values_hz':[round(v,3) for v in values]})
    difference=np.abs(np.array(trajectories[0])-np.array(trajectories[1]))
    return {
        'decoded_seconds':round(len(data)/RATE,4),'sample_rate_hz':RATE,'channels':2,
        'fft_size':n,'window_seconds':round(n/RATE,4),'fft_bin_spacing_hz':round(RATE/n,6),'window_count':len(starts),'window':'Hann','overlap_fraction':.5,
        'rms_dbfs_by_channel':[round(float(20*np.log10(max(v,1e-50))),2) for v in rms],
        'maximum_absolute_sample':round(float(np.max(np.abs(data))),6),'samples_at_or_above_full_scale':int(np.sum(np.abs(data)>=1)),
        'power_weighted_centroid_hz':round(float(np.sum(frequencies[valid]*combined[valid])/denominator),2),
        'energy_fraction_20_to_250hz':round(float(combined[(frequencies>=20)&(frequencies<250)].sum()/denominator),4),
        'energy_fraction_250_to_2000hz':round(float(combined[(frequencies>=250)&(frequencies<2000)].sum()/denominator),4),
        'energy_fraction_above_2000hz':round(float(combined[frequencies>=2000].sum()/denominator),4),
        'left_right_waveform_correlation':round(float(np.corrcoef(data.T)[0,1]),6),
        'left_right_power_spectrum_cosine':round(spectrum_cosine,6),
        'side_energy_fraction':round(float(np.mean(side**2)/total),6),
        'strongest_peaks_by_channel':peaks,'cross_channel_peak_comparison':comparison,
        'strongest_peak_trajectory':traj,
        'strongest_peak_separation_median_hz':round(float(np.median(difference)),3),
        'strongest_peak_separation_min_hz':round(float(difference.min()),3),
        'strongest_peak_separation_max_hz':round(float(difference.max()),3),
    }

def tone_pair_analysis(data):
    n=FFT_SIZE
    window=np.hanning(n)
    freqs=np.fft.rfftfreq(n,1/RATE)
    bands=[(78,86),(164,176)]
    tracks=[]
    for low,high in bands:
        values=[[],[]]
        for start in range(0,len(data)-n+1,n//2):
            block=data[start:start+n]
            powers=np.abs(np.fft.rfft((block-block.mean(axis=0))*window[:,None],axis=0))**2
            allowed=(freqs>=low)&(freqs<=high)
            for c in range(2):
                index=np.argmax(np.where(allowed,powers[:,c],0))
                values[c].append(interpolated_peak(powers[:,c],int(index)))
        diffs=np.abs(np.array(values[0])-np.array(values[1]))
        tracks.append({'band_hz':[low,high],'channel_median_hz':[round(float(np.median(v)),4) for v in values],'channel_peak_to_peak_range_hz':[round(float(np.ptp(v)),4) for v in values],'separation_median_hz':round(float(np.median(diffs)),4),'separation_min_hz':round(float(min(diffs)),4),'separation_max_hz':round(float(max(diffs)),4)})
    length=len(data)
    powers=np.abs(np.fft.rfft((data-data.mean(axis=0))*np.hanning(length)[:,None],axis=0))**2
    freqs=np.fft.rfftfreq(length,1/RATE)
    long_peaks=[top_peaks(powers[:,c],n=length,count=4,spacing=.2) for c in range(2)]
    leakage=[]
    for c in range(2):
        for peak in long_peaks[c][:2]:
            keep=np.abs(freqs-peak['frequency_hz'])<=.15
            energy=powers[keep].sum(axis=0)
            leakage.append({'carrier_channel':['left','right'][c],'frequency_hz':peak['frequency_hz'],'own_channel_over_other_db':round(float(10*np.log10(max(energy[c],1e-50)/max(energy[1-c],1e-50))),2)})
    return {'band_specific_pairs':tracks,'full_excerpt_fft_bin_spacing_hz':round(RATE/length,6),'full_excerpt_channel_peaks':long_peaks,'carrier_channel_separation':leakage,'interpretation':'Two stable ear-separated tone pairs are compatible with a binaural-stimulation design. This signal-level description does not demonstrate perception, brain entrainment, pain relief, or a therapeutic frequency.'}

def validate():
    t=np.arange(RATE*9)/RATE
    stereo=np.column_stack([.1*np.sin(2*np.pi*220*t),.1*np.sin(2*np.pi*226*t)])
    result=analyze(stereo)
    found=[x[0]['frequency_hz'] for x in result['strongest_peaks_by_channel']]
    assert abs(found[0]-220)<.05 and abs(found[1]-226)<.05,found
    mono=np.column_stack([.1*np.sin(2*np.pi*200*t)+.1*np.sin(2*np.pi*206*t)]*2)
    shared=analyze(mono)
    assert shared['left_right_waveform_correlation']>.9999
    assert shared['side_energy_fraction']<1e-10
    return {'status':'passed','separate_carrier_estimates_hz':found,'same_signal_stereo_correlation':shared['left_right_waveform_correlation'],'same_signal_side_fraction':shared['side_energy_fraction']}

def main():
    report={'method':'30-second stereo excerpts; local FFT analysis; not a clinical analysis','validation':validate(),'references':[],'missing_files':[]}
    for video_id,filename,start,end,label in EXCERPTS:
        path=AUDIO_ROOT/filename
        if not path.exists():report['missing_files'].append(filename);continue
        data,metadata=decode(path)
        item={'video_id':video_id,'label':label,'requested_start_seconds':start,'requested_end_seconds':end,'source_url':f'https://www.youtube.com/watch?v={video_id}&t={start}s','source_file':filename,'decoder_streams':metadata,**analyze(data)}
        if video_id=='fyGmSFUPo8o':item['tone_pairs']=tone_pair_analysis(data)
        report['references'].append(item)
        print(json.dumps({k:item[k] for k in ['video_id','decoded_seconds','power_weighted_centroid_hz','left_right_waveform_correlation','side_energy_fraction','strongest_peak_separation_median_hz','strongest_peaks_by_channel']},ensure_ascii=False))
    (OUTPUT_ROOT/'audio-findings.json').write_text(json.dumps(report,indent=2))
    rows=[]
    for item in report['references']:
        ps=item['strongest_peaks_by_channel']
        left=', '.join(f"{p['frequency_hz']:.1f}" for p in ps[0][:4])
        right=', '.join(f"{p['frequency_hz']:.1f}" for p in ps[1][:4])
        rows.append(f'<tr><td><a href="{item["source_url"]}">{html.escape(item["label"])}</a><br>{item["requested_start_seconds"]}–{item["requested_end_seconds"]} seconds</td><td>{left} Hz</td><td>{right} Hz</td><td>{item["power_weighted_centroid_hz"]:.1f} Hz</td><td>{item["left_right_waveform_correlation"]:.3f}</td></tr>')
    fragment='<h2>Measured audio excerpts</h2><p>Downloaded with yt-dlp; decoded locally at 44.1 kHz, stereo. These measurements describe short excerpts, not the full recordings or their health effects.</p><div class="table-wrap"><table><thead><tr><th>Reference / interval</th><th>Strongest left-channel peaks</th><th>Strongest right-channel peaks</th><th>Power-weighted brightness</th><th>L/R correlation</th></tr></thead><tbody>'+''.join(rows)+'</tbody></table></div><p>Peaks are listed by spectral power. Welch-style averaging used 131,072-sample Hann windows with 50% overlap (0.336 Hz bin spacing). Sub-bin interpolation is an estimate, not guaranteed resolving power. Spectral centroid depends on this power-weighted definition. Digital levels are not calibrated headphone loudness. Separate tone peaks are not proof of a binaural beat; the signal delivered to each ear must be considered.</p>'
    fragment += '<p><strong>First recording:</strong> the excerpt has stable tone pairs at approximately 171.5 Hz left / 168.5 Hz right (3.0 Hz apart) and 82.5 Hz left / 82.0 Hz right (about 0.5 Hz apart). Band-specific tracking and a full-excerpt spectrum confirm both pairs; alternating dominant peaks were not treated as a beat. This is compatible with binaural stimulation, but says nothing about whether it reduces migraine pain.</p><p><strong>The handpan and singing bowls:</strong> these are multi-tone, changing recordings. Their acoustic profiles differ from the first reference. No binaural-beat frequency is inferred by subtracting arbitrary left/right peaks, and neither a title nor a peak establishes a healing effect.</p><p>All excerpts decoded to 30.0 seconds. No decoded sample reached digital full scale; this does not establish a safe or comfortable headphone level.</p>'
    (OUTPUT_ROOT/'audio-fragment.html').write_text(fragment)

if __name__=='__main__':main()
