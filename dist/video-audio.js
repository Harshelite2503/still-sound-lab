// Still for Video: the Web Audio side. Builds the comfort filter as real nodes from the settings
// that comfort-filter.js designs, captures a tab or a file, and renders clips for tuning and checks.
import { filterSections, automaticMakeupDb, filterSettings, GENTLE_PRESET, clamp } from './comfort-filter.js';
import { aWeightedLevelDb } from './comfort-engine.js';

const dbToAmp = db => 10 ** (db / 20);
export const SAFETY = { thresholdDb: -3, ratio: 20, clipDb: -1 };
const RAMP_S = .12;
/** Each DynamicsCompressorNode delays its signal by a fixed 6 ms look-ahead (Web Audio spec §1.19). */
export const COMPRESSOR_LOOKAHEAD_S = .006;
/** Frames the wet chain lags the dry path: two compressors (comfort compressor and safety limiter). */
export const chainLatencyFrames = rate => 2 * Math.floor(COMPRESSOR_LOOKAHEAD_S * rate);

/**
 * One filter chain: input → 5 biquads → compressor → (cancel automatic makeup) → explicit makeup
 * → state level → safety limiter → hard clip → output. Every gain change ramps, so nothing clicks.
 */
export function createFilterChain(ctx, settings) {
  const input = ctx.createGain();
  const biquads = filterSections(settings).map(() => ctx.createBiquadFilter());
  const comp = ctx.createDynamicsCompressor();
  const cancel = ctx.createGain(), makeup = ctx.createGain(), level = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor(), limiterTrim = ctx.createGain(), clip = ctx.createWaveShaper();
  const output = ctx.createGain();
  limiter.threshold.value = SAFETY.thresholdDb; limiter.knee.value = 0; limiter.ratio.value = SAFETY.ratio;
  limiter.attack.value = .002; limiter.release.value = .25;
  limiterTrim.gain.value = dbToAmp(automaticMakeupDb(SAFETY.thresholdDb, SAFETY.ratio) * -1);
  const ceiling = dbToAmp(SAFETY.clipDb), curve = new Float32Array(4097);
  for (let i = 0; i < curve.length; i++) curve[i] = clamp(i / 2048 - 1, -ceiling, ceiling);
  clip.curve = curve;
  [input, ...biquads, comp, cancel, makeup, level, limiter, limiterTrim, clip, output].reduce((a, b) => (a.connect(b), b));

  function set(st, rampS = RAMP_S) {
    const t = ctx.currentTime;
    const ramp = (param, v) => { param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); param.linearRampToValueAtTime(v, t + rampS); };
    filterSections(st).forEach((s, i) => {
      biquads[i].type = s.type;
      ramp(biquads[i].frequency, s.frequency); ramp(biquads[i].Q, s.Q); ramp(biquads[i].gain, s.gain);
    });
    comp.knee.value = 0; comp.attack.value = st.attack; comp.release.value = st.release;
    ramp(comp.threshold, st.thresholdDb); ramp(comp.ratio, st.ratio);
    ramp(cancel.gain, dbToAmp(-automaticMakeupDb(st.thresholdDb, st.ratio)));
    ramp(makeup.gain, dbToAmp(st.makeupDb));
    ramp(level.gain, dbToAmp(st.levelDb));
  }
  set(settings, 0);
  return { input, output, set, nodes: { biquads, comp, limiter } };
}

/**
 * The live graph: source → tap (for tuning clips) and → [filtered | original] crossfade → volume → speakers.
 * Bypass switches to the untouched original instantly (a short crossfade), and back.
 */
export function createLiveGraph(ctx, tapNode) {
  const entry = ctx.createGain();
  const chain = createFilterChain(ctx, filterSettings(GENTLE_PRESET, 'calm'));
  const wet = ctx.createGain(), dry = ctx.createGain(), volume = ctx.createGain(), mute = ctx.createGain();
  // The original path is delayed by the wet chain's look-ahead, so switching never comb-filters.
  const align = ctx.createDelay(.1); align.delayTime.value = chainLatencyFrames(ctx.sampleRate) / ctx.sampleRate;
  dry.gain.value = 0;
  entry.connect(chain.input); chain.output.connect(wet); entry.connect(align); align.connect(dry);
  wet.connect(volume); dry.connect(volume); volume.connect(mute); mute.connect(ctx.destination);
  if (tapNode) entry.connect(tapNode);
  let source = null, bypassed = false, muted = false;
  const ramp = (param, v, s = RAMP_S) => { const t = ctx.currentTime; param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); param.linearRampToValueAtTime(v, t + s); };
  return {
    attach(node) { if (source) try { source.disconnect(entry); } catch {} source = node; node.connect(entry); tapNode?.port.postMessage('clear'); },
    detach() { if (source) try { source.disconnect(entry); } catch {} source = null; },
    setSettings: st => chain.set(st),
    setVolumeDb: db => ramp(volume.gain, dbToAmp(clamp(db, -30, 0))),
    setBypass(on) { bypassed = !!on; ramp(wet.gain, bypassed ? 0 : 1); ramp(dry.gain, bypassed ? 1 : 0); },
    get bypassed() { return bypassed; },
    setMuted(on) { muted = !!on; ramp(mute.gain, on ? 0 : 1, .25); },
    get muted() { return muted; },
  };
}

/** Load the clip tap worklet once per context. Returns null where AudioWorklet is unavailable. */
export async function createTap(ctx, seconds = 8) {
  if (!ctx.audioWorklet) return null;
  await ctx.audioWorklet.addModule(new URL('./clip-tap.worklet.js', import.meta.url));
  return new AudioWorkletNode(ctx, 'clip-tap', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit', processorOptions: { seconds } });
}

/** Ask the tap for the last few seconds as an AudioBuffer. */
export function snapshot(ctx, tap) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { tap.port.removeEventListener('message', on); reject(new Error('No answer from the audio tap')); }, 2000);
    function on(e) {
      if (e.data?.type !== 'snapshot') return;
      clearTimeout(timer); tap.port.removeEventListener('message', on);
      const { channels, rate } = e.data;
      if (!channels[0].length) return resolve(null);
      const buffer = ctx.createBuffer(2, channels[0].length, rate);
      channels.forEach((c, i) => buffer.copyToChannel(c, i));
      resolve(buffer);
    }
    tap.port.addEventListener('message', on); tap.port.start(); tap.port.postMessage('snapshot');
  });
}

/** Trim a clip to its last `seconds`, with short fades so playback never clicks. */
export function prepareClip(ctx, buffer, seconds = 6, fadeS = .06) {
  const n = Math.min(buffer.length, Math.round(seconds * buffer.sampleRate)), start = buffer.length - n;
  const out = ctx.createBuffer(buffer.numberOfChannels, n, buffer.sampleRate), f = Math.round(fadeS * buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c).subarray(start), dst = out.getChannelData(c);
    for (let i = 0; i < n; i++) dst[i] = src[i] * Math.min(1, i / f, (n - 1 - i) / f);
  }
  return out;
}

/** RMS level of a clip in dBFS (mono mix), used to check there is sound to tune on. */
export function clipLevelDb(buffer) {
  let sum = 0; const n = buffer.length, ch = buffer.numberOfChannels;
  for (let c = 0; c < ch; c++) { const d = buffer.getChannelData(c); for (let i = 0; i < n; i++) sum += d[i] * d[i]; }
  return 10 * Math.log10(sum / (n * ch) + 1e-20);
}

/**
 * Render a clip through a filter setting offline (or untouched when settings is null).
 * Uses the same node graph as live playback, so what is compared is what is heard. Every version
 * is rendered with padding and trimmed by its own latency, so all versions start and end at the
 * same moment and keep the clip's fades: timing gives no clue to which version is which.
 */
export async function renderClip(clip, settings) {
  const pad = Math.ceil(.05 * clip.sampleRate);
  const off = new OfflineAudioContext(clip.numberOfChannels, clip.length + pad, clip.sampleRate);
  const src = off.createBufferSource(); src.buffer = clip;
  if (settings) { const chain = createFilterChain(off, settings); src.connect(chain.input); chain.output.connect(off.destination); }
  else src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  const lat = settings ? await measuredLatencyFrames(clip.sampleRate) : 0;
  const out = new AudioBuffer({ numberOfChannels: rendered.numberOfChannels, length: clip.length, sampleRate: clip.sampleRate });
  for (let c = 0; c < rendered.numberOfChannels; c++) out.copyToChannel(rendered.getChannelData(c).subarray(lat, lat + clip.length), c);
  return out;
}

const latencyCache = new Map();
/** The filter chain's delay in frames, measured once per sample rate with an impulse (falls back to the spec value). */
export function measuredLatencyFrames(rate) {
  if (!latencyCache.has(rate)) latencyCache.set(rate, (async () => {
    try {
      const n = Math.ceil(.1 * rate), off = new OfflineAudioContext(1, n, rate);
      const imp = off.createBuffer(1, n, rate); imp.getChannelData(0)[0] = .01;
      const src = off.createBufferSource(); src.buffer = imp;
      const chain = createFilterChain(off, { ...filterSettings(GENTLE_PRESET, 'calm', { rate }), highpassHz: 20, lowShelfDb: 0, presenceDb: 0, sibilanceDb: 0, highShelfDb: 0 });
      src.connect(chain.input); chain.output.connect(off.destination); src.start();
      const d = (await off.startRendering()).getChannelData(0);
      let best = 0; for (let i = 1; i < d.length; i++) if (Math.abs(d[i]) > Math.abs(d[best])) best = i;
      return best > 0 && best < n / 2 ? best : chainLatencyFrames(rate);
    } catch { return chainLatencyFrames(rate); }
  })());
  return latencyCache.get(rate);
}

/** A-weighted level of a rendered clip (mono mix), power-averaged over the whole clip in 8192-sample blocks. */
export function weightedLevelDb(buffer) {
  const n = buffer.length, mix = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) { const d = buffer.getChannelData(c); for (let i = 0; i < n; i++) mix[i] += d[i] / buffer.numberOfChannels; }
  const block = Math.min(8192, 2 ** Math.floor(Math.log2(Math.max(2, n))));
  let sum = 0, count = 0;
  for (let start = 0; start < n; start += block) {
    const s0 = Math.min(start, n - block); // the last block ends at the clip's end, so every sample counts
    sum += 10 ** (aWeightedLevelDb(mix.subarray(s0, s0 + block), buffer.sampleRate) / 10); count++;
  }
  return 10 * Math.log10(sum / count + 1e-30);
}

/** Scale a buffer in place by db, with a peak guard so matching never pushes it past −1 dBFS. */
export function scaleBuffer(buffer, db) {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) for (const v of buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  const g = Math.min(dbToAmp(db), peak > 0 ? dbToAmp(SAFETY.clipDb) / peak : Infinity);
  for (let c = 0; c < buffer.numberOfChannels; c++) { const d = buffer.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; }
  return 20 * Math.log10(g);
}

/** Play a buffer once through `destination`; resolves when it ends or is stopped. */
export function playBuffer(ctx, buffer, destination, onSource) {
  return new Promise(resolve => {
    const src = ctx.createBufferSource(); src.buffer = buffer; src.connect(destination);
    src.onended = () => { try { src.disconnect(); } catch {} resolve(); };
    onSource?.(src); src.start();
  });
}

/** Only desktop Chromium (Chrome 109+, Edge) can share a tab's sound and silence the tab's own playback. */
export function tabAudioSupported() {
  if (!navigator.mediaDevices?.getDisplayMedia) return false;
  const brands = navigator.userAgentData?.brands?.map(b => b.brand) || [];
  const mobile = navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const chromium = brands.some(b => /Chromium|Google Chrome|Microsoft Edge/.test(b)) || (/Chrome\/\d+/.test(navigator.userAgent) && !/Firefox|FxiOS/.test(navigator.userAgent));
  return chromium && !mobile;
}

/**
 * Capture one browser tab's audio. The person picks the tab and keeps "share tab audio" ticked.
 * The tab's own sound is suppressed so only the filtered version plays. A page cannot ask for audio
 * alone, and no source says stopping the video track is safe for the audio track, so the video track
 * is kept alive at the lowest frame rate and stopped together with the audio.
 */
export async function captureTab() {
  if (!tabAudioSupported()) throw Object.assign(new Error('unsupported'), { code: 'unsupported' });
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser', frameRate: 1 },
    audio: { suppressLocalAudioPlayback: true, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    preferCurrentTab: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'exclude', windowAudio: 'exclude', monitorTypeSurfaces: 'exclude',
  });
  const audio = stream.getAudioTracks()[0], video = stream.getVideoTracks()[0];
  const surface = video?.getSettings?.().displaySurface;
  if (surface && surface !== 'browser') { stream.getTracks().forEach(t => t.stop()); throw Object.assign(new Error('not a tab'), { code: 'not-a-tab' }); }
  if (!audio) { stream.getTracks().forEach(t => t.stop()); throw Object.assign(new Error('no audio'), { code: 'no-audio' }); }
  video?.applyConstraints?.({ frameRate: 1 }).catch(() => {});
  const suppressed = audio.getSettings?.().suppressLocalAudioPlayback;
  return { stream, audioStream: new MediaStream([audio]), track: audio, suppressed: suppressed === true };
}

/** Delay this page adds between the incoming sound and the speakers, as far as the browser reports it (null if not reported). */
export function reportedLatencyMs(ctx) {
  const base = Number.isFinite(ctx.baseLatency) ? ctx.baseLatency : 0;
  const out = Number.isFinite(ctx.outputLatency) ? ctx.outputLatency : 0;
  const total = Math.round((base + out) * 1000);
  return total > 0 ? total + Math.round(chainLatencyFrames(ctx.sampleRate) / ctx.sampleRate * 1000) : null;
}
