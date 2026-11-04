const $ = id => document.getElementById(id);
const fmt = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString(undefined, {maximumFractionDigits: digits}) : 'Not available';
const hz = value => value >= 1000 ? `${fmt(value / 1000, 1)}k` : fmt(value, 0);
const isTone = item => !!item.ratings && !!item.generation;
const toneHz = item => item.generation?.dominant_tone_estimate_hz;
const colors = {sine: '#247586', square: '#b96445', sawtooth: '#778349'};
let data, tones = [], active, groupCursor = 0, scatterCursor = 0, sampleCursor = 0, loading = false;
let groups = [], views = {};

function setupCanvas(id, xDomain, yDomain, xLabel, yLabel, logX = true) {
  const canvas = $(id), g = canvas.getContext('2d');
  const width = Math.max(260, canvas.parentElement.clientWidth), height = canvas.parentElement.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const styles = getComputedStyle(document.body), ink = styles.getPropertyValue('--ink'), muted = styles.getPropertyValue('--muted'), grid = styles.getPropertyValue('--line');
  const left = 48, right = width - 17, top = 34, bottom = height - 46;
  const sx = value => left + (logX ? Math.log(value / xDomain[0]) / Math.log(xDomain[1] / xDomain[0]) : (value - xDomain[0]) / (xDomain[1] - xDomain[0])) * (right - left);
  const sy = value => bottom - (value - yDomain[0]) / (yDomain[1] - yDomain[0]) * (bottom - top);
  g.clearRect(0, 0, width, height); g.lineWidth = 1; g.font = '11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  const ticks = yDomain[0] === 1 ? [1,2,3,4,5] : [-80,-60,-40,-20,0];
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const tick of ticks) { const y = sy(tick); g.strokeStyle = grid; g.beginPath(); g.moveTo(left,y); g.lineTo(right,y); g.stroke(); g.fillStyle = muted; g.fillText(tick,left-9,y); }
  g.textAlign = 'center'; g.textBaseline = 'top';
  const xticks = width < 450 ? [20,100,1000,10000] : [20,50,100,250,1000,5000,20000];
  for (const tick of xticks) { if(tick<xDomain[0]||tick>xDomain[1])continue; const x=sx(tick); g.strokeStyle=grid;g.beginPath();g.moveTo(x,top);g.lineTo(x,bottom);g.stroke();g.fillStyle=muted;g.fillText(hz(tick),x,bottom+10); }
  g.fillStyle=muted;g.textAlign='left';g.fillText(yLabel,left,5);g.textAlign='center';g.fillText(xLabel,(left+right)/2,height-13);
  const view={canvas,g,sx,sy,left,right,top,bottom,width,height,ink,muted,points:[]}; views[id]=view;return view;
}

function drawGroups() {
  if(!groups.length)return;
  const v=setupCanvas('zone-chart',[20,8000],[1,5],'Estimated tone frequency (Hz · log)','Mean valence · 1 to 5');
  groups.forEach((group,i)=>{
    const x=v.sx(group.estimated_frequency_hz),y=v.sy(group.mean_valence),[lo,hi]=group.valence_range;
    v.g.strokeStyle=v.ink;v.g.lineWidth=i===groupCursor?2.5:1.4;v.g.beginPath();v.g.moveTo(x,v.sy(lo));v.g.lineTo(x,v.sy(hi));v.g.moveTo(x-4,v.sy(lo));v.g.lineTo(x+4,v.sy(lo));v.g.moveTo(x-4,v.sy(hi));v.g.lineTo(x+4,v.sy(hi));v.g.stroke();
    v.g.fillStyle=i===groupCursor?'#b96445':v.ink;v.g.beginPath();v.g.arc(x,y,i===groupCursor?5:4,0,Math.PI*2);v.g.fill();v.points.push({x,y,index:i});
  });
  const group=groups[groupCursor];$('zone-readout').textContent=`≈${fmt(group.estimated_frequency_hz,1)} Hz · ${group.n_stimuli} sounds · mean valence ${fmt(group.mean_valence,2)}/5 · sound means span ${fmt(group.valence_range[0],2)}–${fmt(group.valence_range[1],2)}/5.`;
}

function scatterValues(item){return {x:$('scatter-x').value==='carrier'?toneHz(item):item.features.centroid_hz,y:$('scatter-y').value==='valence'?item.ratings.valence_mean:item.ratings.arousal_mean};}
function drawScatter() {
  if(!tones.length)return;
  const carrier=$('scatter-x').value==='carrier', valence=$('scatter-y').value==='valence';
  const v=setupCanvas('scatter-chart',[20,carrier?8000:22050],[1,5],carrier?'Estimated tone frequency (Hz · log)':'Power centroid (Hz · log)',valence?'Mean valence · 1 to 5':'Mean arousal · 1 to 5');
  tones.forEach((item,i)=>{const point=scatterValues(item);if(!Number.isFinite(point.x)||point.x<=0)return;const x=v.sx(point.x),y=v.sy(point.y);v.g.fillStyle=colors[item.generation.waveform]||v.ink;v.g.globalAlpha=i===scatterCursor?1:.65;v.g.beginPath();v.g.arc(x,y,i===scatterCursor?6:3.6,0,Math.PI*2);v.g.fill();if(i===scatterCursor){v.g.strokeStyle=v.ink;v.g.lineWidth=1.5;v.g.stroke();}v.points.push({x,y,index:i});});v.g.globalAlpha=1;
  const item=tones[scatterCursor],point=scatterValues(item);
  $('scatter-readout').textContent=`${item.title} · ${fmt(point.x,1)} Hz ${carrier?'estimated tone':'centroid'} · mean ${valence?'valence':'arousal'} ${fmt(point.y,2)}/5. Enter or click to select.`;
  $('correlation-note').textContent='Ratings are means from the source study. Each sound is one point, not one independent participant. These observations are not joined to the birdsong trial or your personal comfort ratings.';
}

function drawSample() {
  if(!active)return;
  const s=active.spectrum,v=setupCanvas('sample-chart',[20,22050],[-80,0],'Frequency (Hz · log)','Relative energy per log bin (dB)');
  v.g.save();v.g.beginPath();v.g.rect(v.left,v.top,v.right-v.left,v.bottom-v.top);v.g.clip();v.g.strokeStyle=v.ink;v.g.lineWidth=1.7;v.g.beginPath();
  s.frequency_hz.forEach((frequency,i)=>{const x=v.sx(frequency),y=v.sy(Math.max(-80,Math.min(0,s.relative_db[i])));if(i===0)v.g.moveTo(x,y);else v.g.lineTo(x,y);v.points.push({x,y,index:i});});v.g.stroke();
  const x=v.sx(s.frequency_hz[sampleCursor]);v.g.strokeStyle='#b96445';v.g.setLineDash([3,3]);v.g.beginPath();v.g.moveTo(x,v.top);v.g.lineTo(x,v.bottom);v.g.stroke();v.g.restore();
  $('sample-readout').textContent=`Bin near ${fmt(s.frequency_hz[sampleCursor],1)} Hz · ${fmt(s.relative_db[sampleCursor],1)} dB relative · ${fmt(s.power_share[sampleCursor]*100,2)}% of analyzed spectral energy in this bin.`;
}

function nearestPoint(event,id,horizontal=false){const v=views[id];if(!v?.points.length)return null;const rect=v.canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*v.width/rect.width,y=(event.clientY-rect.top)*v.height/rect.height;return v.points.reduce((best,p)=>{const distance=(p.x-x)**2+(horizontal?0:(p.y-y)**2);return !best||distance<best.distance?{...p,distance}:best},null)?.index;}
function wireChart(id,count,inspect,select,horizontal=false){const canvas=$(id);canvas.addEventListener('pointermove',event=>{const i=nearestPoint(event,id,horizontal);if(i!==null)inspect(i);});canvas.addEventListener('click',event=>{const i=nearestPoint(event,id,horizontal);if(i!==null){inspect(i);select?.(i);}});canvas.addEventListener('keydown',event=>{let cursor=id==='zone-chart'?groupCursor:id==='scatter-chart'?scatterCursor:sampleCursor;if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','Home','End','Enter'].includes(event.key)){event.preventDefault();const n=count();if(!n)return;if(event.key==='Enter'){select?.(cursor);return;}cursor=event.key==='Home'?0:event.key==='End'?n-1:Math.max(0,Math.min(n-1,cursor+(['ArrowLeft','ArrowDown'].includes(event.key)?-1:1)));inspect(cursor);}});}

function collectionMatches(item){const filter=$('collection').value;return filter==='all'||(filter==='emosynth'?isTone(item):!isTone(item));}
function populateSelect(preferred){const items=data.items.filter(collectionMatches),select=$('recording-select');select.replaceChildren();for(const item of items){const option=document.createElement('option');option.value=item.id;option.textContent=item.title;select.append(option);}select.value=items.some(item=>item.id===preferred)?preferred:items[0].id;selectRecording(select.value);}
function makeValue(parent,label,value){const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;div.append(dt,dd);parent.append(div);}
function selectRecording(id){active=data.items.find(item=>item.id===id);if(!active)return;sampleCursor=0;$('recording-title').textContent=active.title;const a=active.audio,range=active.excerpt;
  $('recording-description').textContent=`${fmt(a.analyzed_seconds,2)} seconds analyzed · ${a.source_channels} source channel${a.source_channels===1?'':'s'} · ${fmt(a.sample_rate_hz/1000,1)} kHz analysis · ${isTone(active)?'full synthetic sound':`source interval ${fmt(range.start_seconds,0)}–${fmt(range.end_seconds,0)} seconds`}.`;
  const ratings=$('rating-values');ratings.replaceChildren();if(isTone(active)){for(const [name,mean,sd] of [['Valence',active.ratings.valence_mean,active.ratings.valence_sd],['Arousal',active.ratings.arousal_mean,active.ratings.arousal_sd]]){const box=document.createElement('div'),strong=document.createElement('strong'),text=document.createElement('span');strong.textContent=`${fmt(mean,2)} / 5`;text.textContent=`${name}${Number.isFinite(sd)?` · SD ${fmt(sd,2)}`:''}`;box.append(strong,text);ratings.append(box);}}else ratings.textContent='No per-clip valence or migraine-response label is assigned.';
  const features=$('sample-features');features.replaceChildren();makeValue(features,'Power centroid',`${fmt(active.features.centroid_hz,0)} Hz`);makeValue(features,'85% energy roll-off',`${fmt(active.features.rolloff85_hz,0)} Hz`);makeValue(features,'Spectral flatness',Number(active.features.flatness).toPrecision(3));makeValue(features,'Energy · 20–250 Hz',`${fmt(active.features.band_energy.low*100,1)}%`);
  $('sample-evidence').textContent=isTone(active)?`${active.generation.waveform} waveform · frequency index ${active.generation.frequency_index} · envelope ${active.generation.envelope_code} · duration ${active.generation.duration_code}. The original study reports 40 annotators overall; the number contributing to each sound is not supplied. Valence measures perceived negative/positive emotion, not pain relief.`:'This file belongs to a controlled study of six-minute soundscape exposure. The 30-second segment analyzed here has no separate efficacy test. Raw audio remains at the source because its reuse license is unspecified.';
  $('sample-source').href=active.source_url;drawSample();}

function validate(input){if(!Array.isArray(input?.items)||!input.items.length)throw Error('Missing measured sounds');const ids=new Set();for(const item of input.items){if(ids.has(item.id))throw Error('Duplicate sound ID');ids.add(item.id);const s=item.spectrum;if(!s?.frequency_hz?.length||s.relative_db.length!==s.frequency_hz.length||s.power_share.length!==s.frequency_hz.length)throw Error('Invalid spectrum');if(![...s.frequency_hz,...s.relative_db,...s.power_share].every(Number.isFinite)||s.frequency_hz.some((value,i)=>value<=0||(i&&value<=s.frequency_hz[i-1])))throw Error('Invalid frequency measurements');if(!item.features?.band_energy||!item.audio||!item.excerpt)throw Error('Missing audio metadata');if(new URL(item.source_url).protocol!=='https:')throw Error('Invalid provenance URL');if(item.ratings&&![item.ratings.valence_mean,item.ratings.arousal_mean].every(value=>Number.isFinite(value)&&value>=1&&value<=5))throw Error('Invalid rating scale');}return input;}

async function loadData(){if(loading)return;loading=true;$('library-error').hidden=true;try{const response=await fetch('data/expanded-dataset.json');if(!response.ok)throw Error('Data fetch failed');data=validate(await response.json());tones=data.items.filter(isTone);groups=data.summary.emosynth.carrier_groups;groupCursor=0;scatterCursor=0;
  $('total-count').textContent=data.items.length;$('tone-count').textContent=tones.length;$('study-count').textContent=data.items.length-tones.length;
  $('version-note').textContent=`Version check: the publication describes 144 sounds; the corrected archive used here contains ${tones.length} WAV files with ${tones.length} matching aggregate rating rows. The archive count is shown explicitly rather than assuming the versions match.`;
  const body=$('zone-table');body.replaceChildren();for(const group of groups){const tr=document.createElement('tr');for(const value of [`≈${fmt(group.estimated_frequency_hz,1)} Hz`,group.n_stimuli,fmt(group.mean_valence,2),`${fmt(group.valence_range[0],2)}–${fmt(group.valence_range[1],2)}`]){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);}
  $('analysis-method').textContent='Local Python analysis uses Hann-windowed Fourier power estimates and averages channel powers. Features cover 20 Hz to half the analysis sample rate. The spectrum uses 160 logarithmic display bins. The repository records exact parameters, source checksums and selected time intervals.';
  $('library-content').hidden=false;populateSelect();drawGroups();drawScatter();$('library-status').textContent=`${data.items.length} new source recordings analyzed · human ratings and study outcomes kept separate · no audio autoplay.`;
 }catch(error){$('library-content').hidden=true;$('library-error').hidden=false;$('library-status').textContent='Measurements unavailable.';console.error('Still dataset:',error.message);}finally{loading=false;}}

wireChart('zone-chart',()=>groups.length,i=>{groupCursor=i;drawGroups();},null,true);
wireChart('scatter-chart',()=>tones.length,i=>{scatterCursor=i;drawScatter();},i=>{$('collection').value='emosynth';populateSelect(tones[i].id);});
wireChart('sample-chart',()=>active?.spectrum.frequency_hz.length||0,i=>{sampleCursor=i;drawSample();},null,true);
$('collection').addEventListener('change',()=>populateSelect());$('recording-select').addEventListener('change',event=>selectRecording(event.target.value));
for(const id of ['scatter-x','scatter-y'])$(id).addEventListener('change',drawScatter);
$('retry-load').addEventListener('click',loadData);
$('dim-toggle').addEventListener('click',()=>{const on=document.body.classList.toggle('dim');$('dim-toggle').setAttribute('aria-pressed',String(on));$('dim-toggle').textContent=on?'Light screen':'Dim screen';drawGroups();drawScatter();drawSample();});
let resizeFrame;new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{drawGroups();drawScatter();drawSample();});}).observe($('zone-chart').parentElement);
loadData();
