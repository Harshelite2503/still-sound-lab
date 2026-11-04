import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../dist/audio-engine.js',import.meta.url),'utf8');
const {analyzeAudio,synthesize,createDemoBuffer,recommend,encodeWav} = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
class BufferMock {
  constructor(channels,length,sampleRate) { this.numberOfChannels=channels; this.length=length; this.sampleRate=sampleRate; this.duration=length/sampleRate; this.data=Array.from({length:channels},()=>new Float32Array(length)); }
  getChannelData(c) { return this.data[c]; }
}
const ctx={sampleRate:44100,createBuffer:(c,n,r)=>new BufferMock(c,n,r)};
const stereo=ctx.createBuffer(2,44100*3,44100);
for(let c=0;c<2;c++) for(let i=0;i<stereo.length;i++) stereo.data[c][i]=.1*Math.sin(2*Math.PI*(220+c*6)*i/44100);
const features=analyzeAudio(stereo);
assert.ok(Math.abs(features.stereo.channelPeaksHz[0]-220)<1,JSON.stringify(features.stereo));
assert.ok(Math.abs(features.stereo.channelPeaksHz[1]-226)<1,JSON.stringify(features.stereo));
assert.ok(Math.abs(features.stereo.peakSeparationHz-6)<1);
assert.ok(features.bandEnergy.low>.99);
assert.ok(features.flatness<.01);
assert.ok(features.spectrogram.frames.length<=120);
assert.equal(features.spectrum.length,96);
assert.equal(features.fftSize,4096);assert.equal(features.fftBinHz,44100/4096);
assert.equal(features.frameCount,features.spectrogram.frames.length);
const anti=ctx.createBuffer(2,44100,44100);
for(let i=0;i<anti.length;i++) {anti.data[0][i]=.1*Math.sin(2*Math.PI*220*i/44100);anti.data[1][i]=-anti.data[0][i];}
const antiFeatures=analyzeAudio(anti);
assert.ok(Math.abs(antiFeatures.dominantHz-220)<1);
assert.ok(antiFeatures.rms>.06,'Out-of-phase stereo must not cancel in analysis');
const silence=analyzeAudio(ctx.createBuffer(2,44100,44100));
assert.equal(silence.silent,true); assert.equal(silence.dominantHz,0); assert.ok(silence.spectrum.every(x=>x===0));
assert.deepEqual(recommend(silence),[]);
const demo=createDemoBuffer(ctx); const demoFeatures=analyzeAudio(demo);
assert.ok(Math.abs(demoFeatures.dominantHz-174)<1);
const recommendations=recommend(demoFeatures);
assert.equal(recommendations.length,3);assert.equal(recommendations[0].kind,'warm');
const highPeak=recommend({...demoFeatures,dominantHz:880}).find(x=>x.id==='warm');
assert.equal(highPeak.frequency,220);assert.match(highPeak.reason,/Octave-folds/);assert.match(highPeak.reason,/not necessarily the fundamental/);
assert.ok(Number.isFinite(recommend({...demoFeatures,dominantHz:Infinity})[0].frequency));
for(const kind of ['warm','rain','binaural']) {
  const buffer=synthesize(ctx,{kind,frequency:220,beatHz:6,seconds:3,seed:1});
  assert.ok(buffer.data.every(c=>c.every(v=>Number.isFinite(v)&&Math.abs(v)<=.22)));
  assert.ok(buffer.data[0][0]===0);
  const wav=await encodeWav(buffer).arrayBuffer(), view=new DataView(wav);
  assert.equal(wav.byteLength,44+buffer.length*4);assert.equal(view.getUint16(22,true),2);assert.equal(view.getUint32(24,true),44100);
  if(kind==='binaural') assert.ok(Math.abs(analyzeAudio(buffer).stereo.peakSeparationHz-6)<1);
}
const control=synthesize(ctx,{kind:'binaural',frequency:220,beatHz:0,seconds:3});
assert.deepEqual(control.data[0],control.data[1]);
const long=ctx.createBuffer(1,44100*35,44100);const longFeatures=analyzeAudio(long);
assert.equal(longFeatures.analyzedSeconds,30);assert.equal(longFeatures.duration,35);
console.log(JSON.stringify({status:'passed',checks:['220/226 Hz stereo peaks','anti-phase preservation','silence handling','sample analysis','three recommendations','bounded synthesis','stereo WAV headers','zero-beat control','30-second cap'],peakEstimatesHz:features.stereo.channelPeaksHz}));
