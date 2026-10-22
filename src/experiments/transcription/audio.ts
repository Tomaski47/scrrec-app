import type { Segment } from './protocol.ts';
export const SAMPLE_RATE = 16_000;

/** Stateful linear resampling: preserves the fractional position across blocks. */
export class Resampler {
  private tail = new Float32Array(0);
  private position = 0;
  private inputRate: number;
  constructor(inputRate: number) { this.inputRate = inputRate; }
  push(block: Float32Array): Float32Array {
    const input = new Float32Array(this.tail.length + block.length);
    input.set(this.tail); input.set(block, this.tail.length);
    const result: number[] = [];
    const step = this.inputRate / SAMPLE_RATE;
    while (this.position + 1 < input.length) {
      const index = Math.floor(this.position), fraction = this.position - index;
      result.push(input[index] * (1 - fraction) + input[index + 1] * fraction);
      this.position += step;
    }
    const used = Math.min(Math.floor(this.position), input.length);
    this.tail = input.slice(used); this.position -= used;
    return Float32Array.from(result);
  }
}

/** Simple bounded energy gate, not a learned VAD. Absolute times include silence. */
export class Segmenter {
  private clock = 0;
  private sequence = 0;
  private start = 0;
  private samples: number[] = [];
  private silent = 0;
  private voiced = 0;
  private emit: (segment: Segment) => void;
  constructor(emit: (segment: Segment) => void) { this.emit = emit; }
  push(block: Float32Array) {
    // Worklet blocks are small; split further so gating does not depend on their size.
    for (let offset = 0; offset < block.length; offset += 320) {
      const frame = block.subarray(offset, offset + 320);
      const rms = Math.sqrt(frame.reduce((sum, x) => sum + x * x, 0) / frame.length);
      const speech = rms > 0.012;
      if (speech && !this.samples.length) this.start = this.clock;
      if (speech || this.samples.length) {
        for (const sample of frame) this.samples.push(sample);
        if (speech) { this.voiced += frame.length; this.silent = 0; }
        else this.silent += frame.length;
      }
      this.clock += frame.length;
      if (this.silent >= SAMPLE_RATE * 0.7 || this.samples.length >= SAMPLE_RATE * 8) this.flush();
    }
  }
  flush() {
    if (this.voiced >= SAMPLE_RATE * 0.2) {
      this.emit({ id: ++this.sequence, start: this.start / SAMPLE_RATE, end: (this.start + this.samples.length) / SAMPLE_RATE, audio: Float32Array.from(this.samples) });
    }
    this.samples = []; this.silent = 0; this.voiced = 0;
  }
}

/** One in flight + two queued phrases; on overload drop ASR only, never media. */
export class BoundedQueue {
  private waiting: Segment[] = [];
  active: Segment | undefined;
  accepting = true;
  private send: (segment: Segment) => void;
  private overflow: () => void;
  constructor(send: (segment: Segment) => void, overflow: () => void) { this.send = send; this.overflow = overflow; }
  add(segment: Segment) {
    if (!this.accepting) return;
    if (this.active && this.waiting.length >= 2) { this.accepting = false; this.overflow(); return; }
    this.waiting.push(segment); this.pump();
  }
  complete(id: number): Segment | undefined {
    if (this.active?.id !== id) return;
    const done = this.active; this.active = undefined; this.pump(); return done;
  }
  get depth() { return this.waiting.length + Number(!!this.active); }
  private pump() {
    if (this.active) return;
    this.active = this.waiting.shift();
    if (this.active) this.send(this.active);
  }
}
