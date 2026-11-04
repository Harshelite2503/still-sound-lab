/** Browser-local acoustic exploration. No inference of diagnosis or therapeutic frequency. */
const TAU = 2 * Math.PI;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const wr = Math.cos(-TAU / len), wi = Math.sin(-TAU / len);
    for (let start = 0; start < n; start += len) {
      let ur = 1, ui = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = start + j, b = a + len / 2;
        const tr = ur * re[b] - ui * im[b], ti = ur * im[b] + ui * re[b];
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const next = ur * wr - ui * wi;
        ui = ur * wi + ui * wr; ur = next;
      }
    }
  }
}

function peakHz(power, rate, size) {
  let peak = Math.max(1, Math.ceil(30 * size / rate));
  for (let i = peak + 1; i < power.length - 1; i++) if (power[i] > power[peak]) peak = i;
  if (power[peak] < 1e-14) return 0;
  const a = Math.log(power[peak - 1] + 1e-30), b = Math.log(power[peak] + 1e-30);
  const c = Math.log(power[peak + 1] + 1e-30), denominator = a - 2 * b + c;
  const delta = Math.abs(denominator) > 1e-12 ? clamp(.5 * (a - c) / denominator, -.5, .5) : 0;
  return (peak + delta) * rate / size;
}

/** FFT/STFT on the first 30 seconds; normalized visualization values are not dB SPL. */
export function analyzeAudio(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate;
  const channels = audioBuffer.numberOfChannels;
  if (!sampleRate || !channels || !audioBuffer.length) throw new Error('This recording contains no audio samples.');
  const length = Math.min(audioBuffer.length, Math.floor(sampleRate * 30));
  const size = 4096, bins = size / 2;
  const frameCount = Math.min(120, Math.max(1, Math.ceil(length / size)));
  const frames = [], frameRms = [], meanPower = new Float64Array(bins);
  const channelPower = Array.from({length:channels}, () => new Float64Array(bins));
  const window = Float64Array.from({length:size}, (_, i) => .5 - .5 * Math.cos(TAU * i / (size - 1)));
  const data = Array.from({length:channels}, (_, c) => audioBuffer.getChannelData(c));
  let squareSum = 0, samplePeak = 0;
  for (let c = 0; c < channels; c++) for (let i = 0; i < length; i++) {
    const value = Number.isFinite(data[c][i]) ? data[c][i] : 0;
    squareSum += value * value; samplePeak = Math.max(samplePeak, Math.abs(value));
  }
  const minHz = 50, maxHz = Math.min(12000, sampleRate / 2);
  const logBins = 96;
  const ranges = Array.from({length:logBins}, (_, i) => {
    const lo = minHz * (maxHz / minHz) ** (i / logBins);
    const hi = minHz * (maxHz / minHz) ** ((i + 1) / logBins);
    return [clamp(Math.floor(lo * size / sampleRate), 1, bins - 1), clamp(Math.ceil(hi * size / sampleRate), 1, bins - 1)];
  });
  const logProject = (power) => ranges.map(([a,b]) => {
    let sum = 0;
    for (let k = a; k <= b; k++) sum += power[k];
    return sum / Math.max(1, b - a + 1);
  });
  for (let f = 0; f < frameCount; f++) {
    const offset = frameCount === 1 ? 0 : Math.round(f * Math.max(0, length - size) / (frameCount - 1));
    const framePower = new Float64Array(bins);
    let frameSquares = 0;
    const available = Math.min(size, length - offset);
    for (let c = 0; c < channels; c++) {
      const re = new Float64Array(size), im = new Float64Array(size);
      let dc = 0;
      for (let j = 0; j < available; j++) dc += data[c][offset + j] || 0;
      dc /= Math.max(1, available);
      for (let j = 0; j < available; j++) {
        const value = data[c][offset + j] || 0;
        re[j] = (value - dc) * window[j]; frameSquares += value * value;
      }
      fft(re, im);
      for (let k = 1; k < bins; k++) {
        const power = (re[k] * re[k] + im[k] * im[k]) / (size * size);
        framePower[k] += power / channels;
        channelPower[c][k] += power / frameCount;
      }
    }
    for (let k = 1; k < bins; k++) meanPower[k] += framePower[k] / frameCount;
    frameRms.push(Math.sqrt(frameSquares / Math.max(1, available * channels)));
    frames.push(logProject(framePower));
  }
  let powerSum = 0, weightedSum = 0, logSum = 0, n = 0, low = 0, mid = 0, high = 0;
  const firstBin = Math.max(1, Math.ceil(30 * size / sampleRate));
  for (let k = firstBin; k < bins; k++) {
    const power = meanPower[k], hz = k * sampleRate / size;
    powerSum += power; weightedSum += hz * power; logSum += Math.log(Math.max(power, 1e-30)); n++;
    if (hz < 250) low += power; else if (hz < 2000) mid += power; else high += power;
  }
  const silent = squareSum / Math.max(1, length * channels) < 1e-12 || powerSum < 1e-14;
  let rolloffHz = 0, cumulative = 0;
  if (!silent) for (let k = firstBin; k < bins; k++) {
    cumulative += meanPower[k];
    if (cumulative >= powerSum * .85) { rolloffHz = k * sampleRate / size; break; }
  }
  const projected = logProject(meanPower);
  const maxPower = Math.max(1e-30, ...frames.flat(), ...projected);
  const normalizedDb = (power) => silent ? 0 : clamp((10 * Math.log10(Math.max(power, 1e-30) / maxPower) + 70) / 70, 0, 1);
  const meanRms = frameRms.reduce((a,b) => a+b,0) / frameRms.length;
  const rmsVariance = frameRms.reduce((a,b) => a + (b-meanRms)**2,0) / frameRms.length;
  const channelPeaksHz = channelPower.map(p => silent ? 0 : peakHz(p, sampleRate, size));
  return {
    duration: audioBuffer.length / sampleRate, analyzedSeconds: length / sampleRate,
    channels, sampleRate, silent, samplePeak,
    fftSize: size,
    fftBinHz: sampleRate / size,
    frameCount,
    windowSeconds: size / sampleRate,
    nominalHopSamples: frameCount === 1 ? 0 : Math.max(0, length - size) / (frameCount - 1),
    centroidHz: silent ? 0 : weightedSum / powerSum,
    rolloffHz,
    flatness: silent ? 0 : clamp(Math.exp(logSum / n) / (powerSum / n), 0, 1),
    rms: Math.sqrt(squareSum / (length * channels)),
    dominantHz: silent ? 0 : peakHz(meanPower, sampleRate, size),
    bandEnergy: {low: silent ? 0 : low/powerSum, mid:silent ? 0 : mid/powerSum, high:silent ? 0 : high/powerSum},
    variation: silent ? 0 : Math.sqrt(rmsVariance) / Math.max(meanRms, 1e-12),
    spectrum: projected.map(normalizedDb),
    spectrogram: {frames: frames.map(frame => frame.map(normalizedDb)), minHz, maxHz},
    stereo: {
      channelPeaksHz,
      peakSeparationHz: channels === 2 ? Math.abs(channelPeaksHz[0] - channelPeaksHz[1]) : null,
      note: 'Channel peak separation is descriptive; it does not establish a binaural beat in mixed audio.'
    }
  };
}

function randomGenerator(seed) {
  let state = (finite(seed, 41) >>> 0) || 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** Original procedural audio, not AI-generated music. Peak capped, not a calibrated listening level. */
export function synthesize(ctx, settings = {}) {
  const kind = ['warm','rain','binaural'].includes(settings.kind) ? settings.kind : 'warm';
  const frequency = clamp(finite(settings.frequency, 180), 100, 600);
  const beatHz = clamp(finite(settings.beatHz, 6), 0, 20);
  const brightness = clamp(finite(settings.brightness, .35), 0, 1);
  const seconds = clamp(finite(settings.seconds, 20), 1, 90);
  const rate = ctx.sampleRate || 44100, length = Math.round(seconds * rate);
  const buffer = ctx.createBuffer(2, length, rate), rng = randomGenerator(settings.seed);
  for (let c = 0; c < 2; c++) {
    const output = buffer.getChannelData(c);
    let pink = 0, slow = 0;
    const cutoff = 250 + brightness * 2000;
    const alpha = 1 - Math.exp(-TAU * cutoff / rate);
    for (let i = 0; i < length; i++) {
      const t = i/rate;
      const fadeSeconds = Math.min(2, seconds/3);
      const fadeIn = .5 - .5*Math.cos(Math.PI * Math.min(1, t/fadeSeconds));
      const fadeOut = .5 - .5*Math.cos(Math.PI * Math.min(1, (seconds-t)/fadeSeconds));
      let value;
      if (kind === 'binaural') {
        value = .065 * Math.sin(TAU * (frequency + c * beatHz) * t);
      } else if (kind === 'rain') {
        const white = rng()*2-1;
        pink += alpha * (white-pink);
        slow += .0003 * (white-slow);
        value = .13 * (pink + .6*slow) * (.85 + .15*Math.sin(TAU*.07*t+c*.2));
      } else {
        value = .052 * (
          Math.sin(TAU*frequency*t) +
          .24*Math.sin(TAU*frequency*1.5*t + c*.08) +
          brightness*.20*Math.sin(TAU*frequency*2*t)
        ) * (.91+.09*Math.sin(TAU*.08*t));
      }
      output[i] = clamp(value * fadeIn * fadeOut, -.22, .22);
    }
  }
  return buffer;
}

export function createDemoBuffer(ctx) {
  return synthesize(ctx, {kind:'warm', frequency:174, brightness:.26, seconds:12, seed:41});
}

/** Rule-based suggestions. Scores are ordering heuristics, never medical/comfort probabilities. */
export function recommend(features, history = []) {
  if (!features || features.silent) return [];
  const sourcePeak = finite(features.dominantHz,180) > 0 ? finite(features.dominantHz,180) : 180;
  let frequency = sourcePeak;
  while (frequency > 350) frequency /= 2;
  while (frequency < 120) frequency *= 2;
  const folded = Math.abs(frequency - sourcePeak) > .01;
  frequency = Math.round(clamp(frequency,120,350));
  const pitchReason = folded
    ? `Octave-folds the strongest spectral peak (~${Math.round(sourcePeak)} Hz, not necessarily the fundamental) to ${frequency} Hz within this prototype's 120–350 Hz synthesis range.`
    : `Uses a tone near the strongest spectral peak (${frequency} Hz), which is not necessarily the fundamental.`;
  const brightness = clamp((features.centroidHz - 150)/5000,.1,.7);
  const tonal = features.flatness < .08;
  const candidates = [
    {
      id:'warm', name:'Warm harmonic drift', kind:'warm', frequency, beatHz:0, brightness,
      reason: `${pitchReason} Adds gentle harmonics and slow variation. ${tonal ? 'Your sample is relatively tonal.' : 'A tonal alternative to compare with your sample.'}`,
      score: tonal ? .84 : .58,
    },
    {
      id:'rain', name:'Soft rainlike hush', kind:'rain', frequency, beatHz:0, brightness:Math.min(.45,brightness),
      reason: `Filtered noise with a ${brightness < .3 ? 'darker' : 'soft'} texture. ${tonal ? 'A contrasting texture to explore.' : 'Your sample has a broader noise texture.'}`,
      score: tonal ? .57 : .82,
    },
    {
      id:'binaural', name:'Stereo tone experiment', kind:'binaural', frequency, beatHz:6, brightness:0,
      reason:`Exploratory comparison: ${frequency} Hz left / ${frequency+6} Hz right with stereo headphones. The 6 Hz difference is an example, not a proven treatment frequency.`,
      score:.3,
    }
  ];
  // Feedback is intentionally not used as a treatment model; the parent interface logs it separately.
  return candidates.sort((a,b) => b.score-a.score);
}

/** Browser-downloadable PCM WAV with all supplied channels, interleaved. */
export function encodeWav(audioBuffer) {
  const channels = Math.min(2,audioBuffer.numberOfChannels), length = audioBuffer.length;
  const bytes = length * channels * 2, data = new ArrayBuffer(44 + bytes), view = new DataView(data);
  const text = (offset, value) => { for (let i=0;i<value.length;i++) view.setUint8(offset+i,value.charCodeAt(i)); };
  text(0,'RIFF'); view.setUint32(4,36+bytes,true); text(8,'WAVE'); text(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,channels,true);
  view.setUint32(24,audioBuffer.sampleRate,true); view.setUint32(28,audioBuffer.sampleRate*channels*2,true);
  view.setUint16(32,channels*2,true); view.setUint16(34,16,true); text(36,'data'); view.setUint32(40,bytes,true);
  const source = Array.from({length:channels},(_,c)=>audioBuffer.getChannelData(c));
  let offset=44;
  for(let i=0;i<length;i++) for(let c=0;c<channels;c++) {
    const v=clamp(source[c][i]||0,-1,1);
    view.setInt16(offset,Math.round(v<0?v*32768:v*32767),true); offset+=2;
  }
  return new Blob([data],{type:'audio/wav'});
}
