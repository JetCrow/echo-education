/* global AudioWorkletProcessor, registerProcessor, sampleRate, currentTime */
class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super(); this.id = 0; this.reset();
    this.port.onmessage = ({ data }) => {
      if (data.type === "start") { this.id = data.id; this.reset(); }
      if (data.id !== this.id) return;
      if (data.type === "pcm") {
        if (this.available + data.samples.length > 24000 * 120) {
          this.port.postMessage({ type: "overflow", id: this.id }); this.reset(); return;
        }
        this.queue.push(data.samples); this.available += data.samples.length;
      }
      if (data.type === "end") this.ended = true;
      if (data.type === "stop") {
        this.port.postMessage({ type: "stopped", id: this.id, audioTime: currentTime, lastNonSilent: this.lastNonSilent, underruns: this.underruns });
        this.reset(); this.id = 0;
      }
    };
  }
  reset() {
    this.queue = []; this.offset = 0; this.available = 0; this.phase = 0;
    this.started = false; this.ended = false; this.first = false;
    this.underruns = 0; this.starved = false; this.lastNonSilent = null; this.finished = false;
  }
  peek(next = 0) {
    const chunk = this.queue[0];
    if (!chunk) return 0;
    if (this.offset + next < chunk.length) return chunk[this.offset + next];
    return this.queue[1]?.[0] ?? chunk[chunk.length - 1];
  }
  consume(n) {
    while (n-- > 0 && this.available) {
      this.offset++; this.available--;
      if (this.offset === this.queue[0].length) { this.queue.shift(); this.offset = 0; }
    }
  }
  process(_inputs, outputs) {
    const output = outputs[0][0]; output.fill(0);
    if (!this.id || this.finished) return true;
    if (!this.started) {
      if (this.available < 3600 && !this.ended) return true; // 150 ms at 24 kHz
      this.started = true;
      this.port.postMessage({ type: "scheduled", id: this.id, audioTime: currentTime });
    }
    for (let i = 0; i < output.length; i++) {
      if (this.available < 2 && !this.ended) {
        if (!this.starved) { this.underruns++; this.starved = true; }
        break;
      }
      if (!this.available) {
        this.finished = true;
        this.port.postMessage({ type: "done", id: this.id, audioTime: currentTime + i / sampleRate, lastNonSilent: this.lastNonSilent, underruns: this.underruns });
        break;
      }
      this.starved = false;
      const value = this.peek() * (1 - this.phase) + this.peek(1) * this.phase;
      output[i] = value;
      if (Math.abs(value) > 0.0001) {
        this.lastNonSilent = currentTime + i / sampleRate;
        if (!this.first) { this.first = true; this.port.postMessage({ type: "first", id: this.id, audioTime: this.lastNonSilent }); }
      }
      this.phase += 24000 / sampleRate;
      const consumed = Math.floor(this.phase); this.phase -= consumed; this.consume(consumed);
    }
    return true;
  }
}
registerProcessor("pcm-player", PcmPlayer);
