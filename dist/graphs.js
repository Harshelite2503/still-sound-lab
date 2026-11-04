const $ = id => document.getElementById(id);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const number = (value, digits = 1) => Number(value).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
const hz = value => value >= 1000 ? `${number(value / 1000, value % 1000 ? 1 : 0)}k` : number(value, value % 1 ? 1 : 0);
const db = value => `${number(value, 1)} dB`;
let dataset;
let active;
let spectrumMode = 'low';
let loading = false;
const plots = [];

function theme() {
  const styles = getComputedStyle(document.body);
  return Object.fromEntries(['surface', 'ink', 'muted', 'grid', 'line', 'left', 'right', 'soft'].map(key => [key, styles.getPropertyValue(`--${key}`).trim()]));
}

function nearest(values, target) {
  let low = 0, high = values.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (values[mid] < target) low = mid + 1; else high = mid;
  }
  if (low > 0 && Math.abs(values[low - 1] - target) < Math.abs(values[low] - target)) return low - 1;
  return low;
}

function minMax(values, fallback = [0, 1]) {
  if (!values?.length) return fallback;
  return [values[0], values[values.length - 1]];
}

class Plot {
  constructor(id, readout) {
    this.canvas = $(id);
    this.context = this.canvas.getContext('2d');
    this.readout = $(readout);
    this.cursor = null;
    this.options = null;
    this.canvas.addEventListener('pointermove', event => this.inspect(event));
    this.canvas.addEventListener('pointerdown', event => this.inspect(event));
    this.canvas.addEventListener('pointerleave', () => { if (this.options?.type !== 'heatmap') { this.cursor = null; this.draw(); } });
    this.canvas.addEventListener('keydown', event => this.keyboard(event));
    plots.push(this);
  }

  set(options) {
    this.options = options;
    this.cursor = null;
    if (options.readoutHint) this.readout.textContent = options.readoutHint;
    this.draw();
  }

  geometry() {
    const width = Math.max(260, this.canvas.parentElement.clientWidth);
    const height = this.canvas.parentElement.clientHeight || 300;
    const density = Math.min(2.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * density);
    this.canvas.height = Math.round(height * density);
    this.context.setTransform(density, 0, 0, density, 0, 0);
    const right = this.options.type === 'heatmap' ? 55 : 18;
    this.area = { left: 54, top: 31, right: width - right, bottom: height - 45, width, height };
    return this.area;
  }

  sx(value) {
    const { xDomain: [min, max], xLog } = this.options;
    const proportion = xLog ? Math.log(value / min) / Math.log(max / min) : (value - min) / (max - min);
    return this.area.left + proportion * (this.area.right - this.area.left);
  }

  sy(value) {
    const { yDomain: [min, max], yLog } = this.options;
    const proportion = yLog ? Math.log(value / min) / Math.log(max / min) : (value - min) / (max - min);
    return this.area.bottom - proportion * (this.area.bottom - this.area.top);
  }

  xValue(pixel) {
    const proportion = clamp((pixel - this.area.left) / (this.area.right - this.area.left), 0, 1);
    const [min, max] = this.options.xDomain;
    return this.options.xLog ? min * (max / min) ** proportion : min + proportion * (max - min);
  }

  yValue(pixel) {
    const proportion = clamp((this.area.bottom - pixel) / (this.area.bottom - this.area.top), 0, 1);
    const [min, max] = this.options.yDomain;
    return this.options.yLog ? min * (max / min) ** proportion : min + proportion * (max - min);
  }

  axes(colors) {
    const g = this.context, a = this.area, o = this.options;
    g.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    g.lineWidth = 1;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (const tick of o.yTicks) {
      const y = this.sy(tick);
      g.strokeStyle = colors.grid; g.globalAlpha = o.type === 'heatmap' ? .16 : 1; g.beginPath(); g.moveTo(a.left, y); g.lineTo(a.right, y); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = colors.muted; g.fillText(o.yFormat ? o.yFormat(tick) : String(tick), a.left - 8, y);
    }
    g.textAlign = 'center'; g.textBaseline = 'top';
    const ticks = a.width < 430 && o.mobileXTicks ? o.mobileXTicks : o.xTicks;
    for (const tick of ticks) {
      const x = this.sx(tick);
      if (x < a.left - 1 || x > a.right + 1) continue;
      g.strokeStyle = colors.grid; g.globalAlpha = o.type === 'heatmap' ? .16 : 1; g.beginPath(); g.moveTo(x, a.top); g.lineTo(x, a.bottom); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = colors.muted; g.fillText(o.xFormat ? o.xFormat(tick) : String(tick), x, a.bottom + 9);
    }
    g.fillStyle = colors.muted;
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(o.yLabel, a.left, 4);
    g.textAlign = 'center';
    g.fillText(o.xLabel, (a.left + a.right) / 2, a.height - 13);
  }

  draw() {
    if (!this.options || this.canvas.closest('[hidden]')) return;
    this.geometry();
    const g = this.context, colors = theme(), a = this.area, o = this.options;
    g.clearRect(0, 0, a.width, a.height);
    g.fillStyle = colors.surface; g.fillRect(0, 0, a.width, a.height);
    if (o.type === 'heatmap') {
      this.heatmap();
      this.axes(colors);
      return;
    }
    this.axes(colors);
    g.save(); g.beginPath(); g.rect(a.left, a.top, a.right - a.left, a.bottom - a.top); g.clip();
    for (const [index, values] of o.series.entries()) {
      g.strokeStyle = index === 0 ? colors.left : colors.right;
      g.lineWidth = 1.65;
      g.setLineDash(index === 0 ? [] : [5, 3]);
      g.beginPath();
      let started = false;
      for (let i = 0; i < o.x.length; i++) {
        if (o.x[i] < o.xDomain[0] || o.x[i] > o.xDomain[1]) continue;
        const x = this.sx(o.x[i]), y = this.sy(clamp(values[i], o.yDomain[0], o.yDomain[1]));
        if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.setLineDash([]);
    if (this.cursor !== null) {
      const i = this.cursor, x = this.sx(o.x[i]);
      g.strokeStyle = colors.muted; g.lineWidth = 1; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(x, a.top); g.lineTo(x, a.bottom); g.stroke(); g.setLineDash([]);
      for (let c = 0; c < o.series.length; c++) {
        const y = this.sy(clamp(o.series[c][i], o.yDomain[0], o.yDomain[1]));
        g.fillStyle = c === 0 ? colors.left : colors.right;
        g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
  }

  heatmap() {
    const g = this.context, a = this.area, o = this.options;
    const times = o.x, freqs = o.frequencies;
    g.save(); g.beginPath(); g.rect(a.left, a.top, a.right - a.left, a.bottom - a.top); g.clip();
    for (let t = 0; t < times.length; t++) {
      const t0 = t === 0 ? o.xDomain[0] : (times[t - 1] + times[t]) / 2;
      const t1 = t === times.length - 1 ? o.xDomain[1] : (times[t] + times[t + 1]) / 2;
      const x0 = this.sx(t0), x1 = this.sx(t1);
      for (let f = 0; f < freqs.length; f++) {
        const f0 = f === 0 ? o.yDomain[0] : Math.sqrt(freqs[f - 1] * freqs[f]);
        const f1 = f === freqs.length - 1 ? o.yDomain[1] : Math.sqrt(freqs[f] * freqs[f + 1]);
        g.fillStyle = heatColor((o.matrix[t][f] - o.floor) / -o.floor);
        const y0 = this.sy(f1), y1 = this.sy(f0);
        g.fillRect(x0, y0, Math.max(1, x1 - x0 + .5), Math.max(1, y1 - y0 + .5));
      }
    }
    g.restore();
    const x = a.right + 12, barWidth = 8;
    const gradient = g.createLinearGradient(0, a.bottom, 0, a.top);
    for (let i = 0; i <= 10; i++) gradient.addColorStop(i / 10, heatColor(i / 10));
    g.fillStyle = gradient; g.fillRect(x, a.top, barWidth, a.bottom - a.top);
    g.fillStyle = theme().muted; g.font = '10px -apple-system, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('0', x + 12, a.top + 3); g.fillText(String(o.floor), x + 12, a.bottom - 3);
    g.fillText('dB', x + 3, a.top - 14);
  }

  inspect(event) {
    if (!this.options || !this.area) return;
    const rect = this.canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * this.area.width / rect.width;
    const py = (event.clientY - rect.top) * this.area.height / rect.height;
    if (px < this.area.left || px > this.area.right || py < this.area.top || py > this.area.bottom) return;
    const i = nearest(this.options.x, this.xValue(px));
    if (this.options.type === 'heatmap') {
      const f = nearest(this.options.frequencies, this.yValue(py));
      this.readout.textContent = `${number(this.options.x[i], 2)} s · ${number(this.options.frequencies[f], 1)} Hz · ${db(this.options.matrix[i][f])} relative`;
      this.heatCursor = [i, f];
    } else this.showPoint(i);
  }

  showPoint(i) {
    const o = this.options;
    this.cursor = clamp(i, nearest(o.x, o.xDomain[0]), nearest(o.x, o.xDomain[1]));
    this.readout.textContent = o.readout(this.cursor);
    this.draw();
  }

  keyboard(event) {
    if (!this.options || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const o = this.options;
    if (o.type === 'heatmap') {
      let [t, f] = this.heatCursor || [Math.floor(o.x.length / 2), Math.floor(o.frequencies.length / 2)];
      if (event.key === 'ArrowLeft') t--; if (event.key === 'ArrowRight') t++;
      if (event.key === 'ArrowDown') f--; if (event.key === 'ArrowUp') f++;
      if (event.key === 'Home') t = 0; if (event.key === 'End') t = o.x.length - 1;
      t = clamp(t, 0, o.x.length - 1); f = clamp(f, 0, o.frequencies.length - 1); this.heatCursor = [t, f];
      this.readout.textContent = `${number(o.x[t], 2)} s · ${number(o.frequencies[f], 1)} Hz · ${db(o.matrix[t][f])} relative`;
      return;
    }
    const start = nearest(o.x, o.xDomain[0]), end = nearest(o.x, o.xDomain[1]);
    const step = event.shiftKey ? Math.max(1, Math.round((end - start) / 50)) : 1;
    let next = this.cursor ?? Math.round((start + end) / 2);
    if (['ArrowLeft', 'ArrowDown'].includes(event.key)) next -= step;
    if (['ArrowRight', 'ArrowUp'].includes(event.key)) next += step;
    if (event.key === 'Home') next = start;
    if (event.key === 'End') next = end;
    this.showPoint(clamp(next, start, end));
  }
}

function heatColor(value) {
  const stops = [[23, 45, 44], [48, 89, 81], [105, 145, 111], [190, 196, 135], [238, 228, 160]];
  const position = clamp(value, 0, 1) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(position)), mix = position - i;
  return `rgb(${stops[i].map((v, c) => Math.round(v + (stops[i + 1][c] - v) * mix)).join(',')})`;
}

const spectrum = new Plot('spectrum-chart', 'spectrum-readout');
const spectrogram = new Plot('spectrogram-chart', 'spectrogram-readout');
const envelope = new Plot('envelope-chart', 'envelope-readout');
const zoomLow = new Plot('zoom-low-chart', 'zoom-low-readout');
const zoomHigh = new Plot('zoom-high-chart', 'zoom-high-readout');

function renderSpectrum() {
  if (!active) return;
  const s = active.spectrum;
  const full = spectrumMode === 'full';
  spectrum.set({
    type: 'line', x: s.frequency_hz, series: [s.left_db, s.right_db],
    xDomain: full ? [20, 8000] : [20, 650], xLog: full,
    yDomain: [s.floor_db ?? -70, 0], yTicks: [-60, -40, -20, 0],
    xTicks: full ? [20, 50, 100, 200, 500, 1000, 2000, 5000, 8000] : [20, 100, 200, 300, 400, 500, 600, 650],
    mobileXTicks: full ? [20, 100, 500, 2000, 8000] : [20, 200, 400, 650],
    xFormat: hz, xLabel: full ? 'Frequency (Hz · logarithmic)' : 'Frequency (Hz)', yLabel: 'Relative spectral power (dB)',
    readout: i => `${s.frequency_hz[i] > 650 ? 'Bin near ' : ''}${number(s.frequency_hz[i], s.frequency_hz[i] > 650 ? 1 : 2)} Hz · Left ${db(s.left_db[i])} · Right ${db(s.right_db[i])}${s.frequency_hz[i] > 650 ? ' · maximum power per display bin' : ''}`,
    readoutHint: 'Hover, tap, or focus the plot and use the arrow keys to inspect a frequency.'
  });
  spectrum.canvas.setAttribute('aria-label', `${active.label}: left and right relative frequency spectra, ${full ? '20 to 8,000 Hz logarithmic' : '20 to 650 Hz linear'}. Use arrow keys to inspect.`);
}

function renderReference() {
  if (!active) return;
  const start = `${Math.floor(active.start_seconds / 60)}:${String(active.start_seconds % 60).padStart(2, '0')}`;
  const finish = active.start_seconds + active.duration;
  const end = `${Math.floor(finish / 60)}:${String(Math.floor(finish % 60)).padStart(2, '0')}`;
  $('reference-caption').textContent = `${active.label} · ${start}–${end} · ${number(active.sample_rate / 1000, 1)} kHz stereo`;
  const link = $('reference-source'); link.href = active.source_url;
  renderSpectrum();
  const s = active.spectrogram;
  spectrogram.set({
    type: 'heatmap', x: s.times_s, frequencies: s.frequency_hz, matrix: s.db, floor: s.floor_db ?? -70,
    xDomain: [0, active.duration], yDomain: [20, 8000], yLog: true,
    xTicks: [0, 5, 10, 15, 20, 25, 30], mobileXTicks: [0, 10, 20, 30], yTicks: [20, 100, 500, 2000, 8000],
    yFormat: hz, xLabel: 'Time within excerpt (s)', yLabel: 'Frequency (Hz · log)',
    readoutHint: 'Hover or tap to inspect. Arrow keys explore time and frequency when focused.'
  });
  const e = active.envelope;
  envelope.set({
    type: 'line', x: e.times_s, series: [e.left_rms_dbfs, e.right_rms_dbfs],
    xDomain: [0, active.duration], yDomain: [-70, 0], yTicks: [-60, -40, -20, 0],
    xTicks: [0, 5, 10, 15, 20, 25, 30], mobileXTicks: [0, 10, 20, 30], xLabel: 'Time within excerpt (s)', yLabel: 'Digital RMS level (dBFS)',
    readout: i => `${number(e.times_s[i], 2)} s · Left ${number(e.left_rms_dbfs[i], 1)} dBFS · Right ${number(e.right_rms_dbfs[i], 1)} dBFS`,
    readoutHint: 'Hover, tap, or focus the plot and use arrow keys to inspect a moment.'
  });
  spectrogram.canvas.setAttribute('aria-label', `${active.label}: frequency energy across a 30-second excerpt. Arrow keys explore time and frequency.`);
  envelope.canvas.setAttribute('aria-label', `${active.label}: left and right digital RMS levels across 30 seconds. These are digital amplitude measurements, not headphone loudness.`);
  renderFeatures(active.features);
  $('load-status').textContent = 'Measured audio only · no playback or paid AI API calls.';
}

function renderFeatures(features) {
  $('feature-centroid').textContent = `${number(features.centroid_hz, 0)} Hz`;
  $('feature-rolloff').textContent = `${number(features.rolloff85_hz, 0)} Hz`;
  $('feature-flatness').textContent = features.flatness > 0 && features.flatness < 0.0001 ? Number(features.flatness).toExponential(2) : number(features.flatness, 4);
  const names = ['Low · 20–250 Hz', 'Mid · 250–2k Hz', 'High · above 2k Hz'];
  const colors = ['#657d60', '#a2b38e', '#d3d8b1'];
  const bands = ['low', 'mid', 'high'];
  const bar = $('band-plot'), labels = $('band-labels'); bar.replaceChildren(); labels.replaceChildren();
  const alt = [];
  bands.forEach((key, i) => {
    const value = clamp(Number(features.band_energy[key]) || 0, 0, 1);
    const segment = document.createElement('span'); segment.style.width = `${value * 100}%`; segment.style.background = colors[i]; bar.append(segment);
    const label = document.createElement('span'), marker = document.createElement('i'); marker.style.background = colors[i];
    label.append(marker, document.createTextNode(`${names[i]} · ${number(value * 100, 1)}%`)); labels.append(label);
    alt.push(`${names[i]}, ${number(value * 100, 1)} percent`);
  });
  bar.setAttribute('aria-label', alt.join('; '));
}

function renderZooms() {
  const first = dataset.recordings.find(r => r.tone_pairs?.zooms?.length >= 2);
  if (!first) return;
  $('stereo-section').hidden = false;
  const zooms = first.tone_pairs.zooms;
  for (const [i, plot] of [zoomLow, zoomHigh].entries()) {
    const z = zooms[i];
    const domain = i === 0 ? [78, 86] : [164, 176];
    plot.set({
      type: 'line', x: z.frequency_hz, series: [z.left_db, z.right_db],
      xDomain: domain, yDomain: [-70, 0], yTicks: [-60, -40, -20, 0],
      xTicks: i === 0 ? [78, 80, 82, 84, 86] : [164, 167, 170, 173, 176],
      mobileXTicks: i === 0 ? [78, 80, 82, 84, 86] : [164, 168, 172, 176],
      xLabel: 'Frequency (Hz)', yLabel: 'Relative spectral power (dB)',
      readout: n => `${number(z.frequency_hz[n], 2)} Hz · Left ${db(z.left_db[n])} · Right ${db(z.right_db[n])}`,
      readoutHint: 'First reference only. Hover, tap, or use arrow keys to inspect.'
    });
  }
}

function validateData(data) {
  if (!Array.isArray(data?.recordings) || data.recordings.length !== 3) throw new Error('Expected three measured references.');
  for (const r of data.recordings) {
    for (const group of [r.spectrum, r.envelope]) if (!group || typeof group !== 'object') throw new Error('Incomplete plotted data.');
    const s = r.spectrum, e = r.envelope, spect = r.spectrogram;
    if (!s.frequency_hz?.length || s.left_db?.length !== s.frequency_hz.length || s.right_db?.length !== s.frequency_hz.length) throw new Error('Invalid spectral arrays.');
    if (!e.times_s?.length || e.left_rms_dbfs?.length !== e.times_s.length || e.right_rms_dbfs?.length !== e.times_s.length) throw new Error('Invalid level arrays.');
    if (!spect?.times_s?.length || spect.db?.length !== spect.times_s.length || !spect.frequency_hz?.length || spect.db.some(row => row.length !== spect.frequency_hz.length)) throw new Error('Invalid spectrogram shape.');
    if (!r.features?.band_energy) throw new Error('Missing acoustic features.');
    const url = new URL(r.source_url);
    if (url.protocol !== 'https:' || !['www.youtube.com', 'youtube.com', 'youtu.be'].includes(url.hostname)) throw new Error('Unexpected reference source.');
  }
  return data;
}

async function loadData() {
  if (loading) return;
  loading = true;
  $('load-error').hidden = true;
  $('load-status').textContent = 'Loading local measurements…';
  try {
    const response = await fetch('./data/chart-data.json');
    if (!response.ok) throw new Error(`Data request returned ${response.status}`);
    dataset = validateData(await response.json());
    const select = $('reference-select'); select.replaceChildren();
    dataset.recordings.forEach(r => { const option = document.createElement('option'); option.value = r.id; option.textContent = r.label; select.append(option); });
    select.disabled = false;
    active = dataset.recordings[0];
    $('measurements').hidden = false;
    renderReference(); renderZooms();
    $('method-detail').textContent = 'Main spectra: 131,072-sample Hann windows with 50% overlap (about 0.336 Hz bin spacing). Stereo close-ups: full 30-second Hann window (about 0.033 Hz spacing). Bin spacing does not guarantee peak accuracy or resolving power. No interpolation turns these measurements into human-response data.';
  } catch (error) {
    $('load-error').hidden = false;
    $('load-status').textContent = 'Measurements unavailable. No substitute or simulated data is shown.';
    $('reference-select').disabled = true;
    console.error('Still chart loading failed:', error.message);
  } finally { loading = false; }
}

$('reference-select').addEventListener('change', event => {
  active = dataset.recordings.find(record => record.id === event.target.value);
  renderReference();
});
document.querySelectorAll('[name="spectrum-range"]').forEach(input => input.addEventListener('change', event => {
  spectrumMode = event.target.value; renderSpectrum();
}));
$('retry-load').addEventListener('click', loadData);
$('dim-toggle').addEventListener('click', () => {
  const on = document.body.classList.toggle('dim');
  $('dim-toggle').setAttribute('aria-pressed', String(on));
  $('dim-toggle').textContent = on ? 'Light screen' : 'Dim screen';
  plots.forEach(plot => plot.draw());
  document.dispatchEvent(new CustomEvent('still-theme-change', { detail: { dim: on } }));
});
let resizeFrame;
new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => plots.forEach(plot => plot.draw()));
}).observe($('spectrum-wrap'));
loadData();
