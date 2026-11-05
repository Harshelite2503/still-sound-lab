// Keeps the last few seconds of the incoming (unfiltered) audio in a ring buffer, so tuning can
// compare filter settings on the person's own content. Nothing is recorded beyond this buffer,
// and it is only copied out when the page asks for a snapshot.
class ClipTap extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const seconds = options?.processorOptions?.seconds || 8;
    this.size = Math.ceil(seconds * sampleRate);
    this.channels = [new Float32Array(this.size), new Float32Array(this.size)];
    this.write = 0; this.filled = 0; this.sumSq = 0; this.frames = 0;
    this.port.onmessage = e => {
      if (e.data === 'snapshot') {
        const n = this.filled, out = this.channels.map(ch => {
          const copy = new Float32Array(n);
          for (let i = 0; i < n; i++) copy[i] = ch[(this.write - n + i + this.size) % this.size];
          return copy;
        });
        this.port.postMessage({ type: 'snapshot', rate: sampleRate, channels: out }, out.map(c => c.buffer));
      } else if (e.data === 'clear') { this.filled = 0; this.write = 0; }
    };
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    const n = input[0].length;
    // Skip digital silence (a paused video), so pausing before taking a clip keeps the last real sound.
    let peak = 0;
    for (let c = 0; c < input.length; c++) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(input[c][i]));
    this.frames += n;
    if (peak < SILENCE) { this.report(); return true; }
    for (let i = 0; i < n; i++) {
      const l = input[0][i], r = input[1] ? input[1][i] : l;
      this.channels[0][this.write] = l; this.channels[1][this.write] = r;
      this.write = (this.write + 1) % this.size;
      this.sumSq += (l * l + r * r) / 2;
    }
    this.filled = Math.min(this.size, this.filled + n);
    this.report();
    return true;
  }
  report() { // level four times a second, for the "is there sound?" hint
    if (this.frames < sampleRate / 4) return;
    this.port.postMessage({ type: 'level', rms: Math.sqrt(this.sumSq / this.frames) });
    this.sumSq = 0; this.frames = 0;
  }
}
const SILENCE = 10 ** (-70 / 20);
registerProcessor('clip-tap', ClipTap);
