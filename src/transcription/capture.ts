import { Resampler, Segmenter } from './audio.ts';
import type { Segment } from './protocol.ts';

export interface CaptureTap {
  attach(streams: MediaStream[]): Promise<void>;
  activate(): void;
  finish(): Promise<void>;
  abort(): void;
}
export interface TapCallbacks {
  segment: (segment: Segment) => void;
  failure: (message: string) => void;
  rate: (rate: number) => void;
}

async function bounded<T>(pending: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([pending, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Audio setup timed out.')), ms); })]); }
  finally { clearTimeout(timer); }
}

/** Owns only an optional PCM tap. Never stops or modifies capture tracks. */
export class MicrophoneTap implements CaptureTap {
  private context: AudioContext;
  private resumed: Promise<boolean>;
  private callbacks: TapCallbacks;
  private segmenter: Segmenter;
  private active = false;
  private closed = false;
  private tap: AudioWorkletNode | undefined;
  private nodes: AudioNode[] = [];
  private flushed: (() => void) | undefined;
  private finishing: Promise<void> | undefined;

  constructor(callbacks: TapCallbacks) {
    this.callbacks = callbacks;
    // Called synchronously from Start, before any source picker is awaited.
    this.context = new AudioContext();
    this.resumed = this.context.resume().then(() => true, () => false);
    this.segmenter = new Segmenter(segment => { if (!this.closed) callbacks.segment(segment); });
    this.context.onstatechange = () => {
      if (this.active && !this.closed && this.context.state !== 'running') {
        callbacks.failure('Audio processing paused. This transcript may be incomplete; recording continues.');
      }
    };
  }

  async attach(streams: MediaStream[]) {
    try {
      if (!streams.length) throw new Error('Select a microphone for transcription.');
      const resumed = await bounded(this.resumed, 2500);
      if (!resumed) throw new Error('Audio processing could not start.');
      await bounded(this.context.audioWorklet.addModule(new URL('./capture.worklet.js', import.meta.url)), 2500);
      if (this.closed) return;
      const tap = this.tap = new AudioWorkletNode(this.context, 'transcription-tap');
      const resampler = new Resampler(this.context.sampleRate);
      tap.port.onmessage = ({ data }) => {
        if (data === 'flushed') { this.flushed?.(); return; }
        if (this.active && !this.closed) this.segmenter.push(resampler.push(data));
      };
      const mute = this.context.createGain(); mute.gain.value = 0;
      tap.connect(mute); mute.connect(this.context.destination);
      this.nodes.push(tap, mute);
      for (const stream of streams) {
        const input = this.context.createMediaStreamSource(stream);
        const gain = this.context.createGain(); gain.gain.value = 1 / streams.length;
        input.connect(gain).connect(tap); this.nodes.push(input, gain);
      }
      this.callbacks.rate(this.context.sampleRate);
    } catch (error) {
      if (!this.closed) this.callbacks.failure(`Transcription could not start: ${error instanceof Error ? error.message : String(error)} Recording continues.`);
    }
  }

  activate() {
    if (this.closed) return;
    this.active = true;
    // The worklet discards acquisition/picker audio before MediaRecorder starts.
    this.tap?.port.postMessage('start');
  }

  finish(): Promise<void> {
    if (this.finishing) return this.finishing;
    this.finishing = (async () => {
      if (this.active && !this.closed) {
        await Promise.race([
          new Promise<void>(resolve => { this.flushed = resolve; this.tap?.port.postMessage('flush'); }),
          new Promise(resolve => setTimeout(resolve, 250)),
        ]);
        if (!this.closed) this.segmenter.flush();
      }
      this.abort();
    })();
    return this.finishing;
  }

  abort() {
    if (this.closed) return;
    this.closed = true; this.active = false;
    this.flushed?.(); this.tap?.port.close();
    this.nodes.forEach(node => { try { node.disconnect(); } catch { /* Already disconnected. */ } });
    this.nodes = [];
    void this.context.close().catch(() => undefined);
  }
}
