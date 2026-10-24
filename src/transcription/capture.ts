import { Resampler, Segmenter } from './audio.ts';
import type { Segment } from './protocol.ts';

export interface CaptureTap {
  attach(streams: MediaStream[]): Promise<void>;
  activate(): void;
  finish(): Promise<void>;
  abort(): void;
  resume?(): void;
}
export interface CaptureInterruption { start: number; end?: number; reason: string }
export interface TapCallbacks {
  segment: (segment: Segment) => void;
  failure: (message: string) => void;
  rate: (rate: number) => void;
  interruption?: (gap: CaptureInterruption, resumed: boolean) => void;
}
interface Environment {
  context: () => AudioContext;
  worklet: (context: AudioContext) => AudioWorkletNode;
  now: () => number;
  visibility: Document;
  events: Window;
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
  private ending = false;
  private tap: AudioWorkletNode | undefined;
  private nodes: AudioNode[] = [];
  private flushed: (() => void) | undefined;
  private finishing: Promise<void> | undefined;
  private resampler: Resampler | undefined;
  private interruption: { start: number; at: number; reason: string } | undefined;
  private resuming = false;
  private lastAudioAt = 0;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private tracks: MediaStreamTrack[] = [];
  private environment: Partial<Environment>;
  private cleanup: Array<() => void> = [];
  private now: () => number;

  constructor(callbacks: TapCallbacks, environment: Partial<Environment> = {}) {
    this.callbacks = callbacks;
    this.environment = environment;
    this.now = environment.now ?? Date.now;
    // Called synchronously from Start, before any source picker is awaited.
    this.context = environment.context?.() ?? new AudioContext();
    this.resumed = this.context.resume().then(() => true, () => false);
    this.segmenter = new Segmenter(segment => { if (!this.closed) callbacks.segment(segment); });
    this.context.onstatechange = () => {
      if (!this.active || this.closed || this.ending) return;
      if (this.context.state === 'closed') callbacks.failure('Audio processing closed. Existing text is kept; recording is managed separately.');
      else if (this.context.state !== 'running') this.pause();
      else this.resume();
    };
    const visibility = environment.visibility ?? globalThis.document;
    const events = environment.events ?? globalThis.window;
    const foreground = () => { if (!visibility?.hidden) this.resume(); };
    for (const [target, event] of [[visibility, 'visibilitychange'], [events, 'pageshow'], [events, 'focus']] as const) {
      target?.addEventListener(event, foreground);
      this.cleanup.push(() => target?.removeEventListener(event, foreground));
    }
  }

  async attach(streams: MediaStream[]) {
    try {
      if (!streams.length) throw new Error('Select a microphone for transcription.');
      const resumed = await bounded(this.resumed, 2500);
      if (!resumed) throw new Error('Audio processing could not start.');
      await bounded(this.context.audioWorklet.addModule(new URL('./capture.worklet.js', import.meta.url)), 2500);
      if (this.closed) return;
      const tap = this.tap = this.environment.worklet?.(this.context) ?? new AudioWorkletNode(this.context, 'transcription-tap');
      this.resampler = new Resampler(this.context.sampleRate);
      tap.port.onmessage = ({ data }) => {
        if (data === 'flushed') { this.flushed?.(); return; }
        if (!this.active || this.closed || this.context.state !== 'running' || this.muted()) return;
        if (this.interruption) this.closeGap(!this.ending);
        this.lastAudioAt = this.now();
        this.segmenter.push(this.resampler!.push(data));
      };
      const mute = this.context.createGain(); mute.gain.value = 0;
      tap.connect(mute); mute.connect(this.context.destination);
      this.nodes.push(tap, mute);
      for (const stream of streams) {
        for (const track of stream.getAudioTracks()) {
          this.tracks.push(track);
          const changed = () => { if (this.active && !this.closed) { if (this.muted()) this.pause(); else this.resume(); } };
          track.addEventListener('mute', changed); track.addEventListener('unmute', changed);
          this.cleanup.push(() => { track.removeEventListener('mute', changed); track.removeEventListener('unmute', changed); });
        }
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
    if (this.closed || this.active || this.ending) return;
    this.active = true;
    this.lastAudioAt = this.now();
    // The worklet discards acquisition/picker audio before MediaRecorder starts.
    this.tap?.port.postMessage('start');
    if (this.context.state !== 'running' || this.muted()) this.pause();
    this.heartbeat = setInterval(() => {
      if (this.closed || this.ending || !this.active || this.interruption) return;
      if (this.now() - this.lastAudioAt > 3000) { this.pause(); this.resume(); }
    }, 1500);
  }

  private muted() { return this.tracks.length > 0 && this.tracks.every(track => track.muted || track.readyState === 'ended'); }

  private pause() {
    if (this.interruption || this.closed || !this.active) return;
    // Keep the final phrase captured before interruption; later audio must not
    // be reconciled against it as if the missing interval never happened.
    this.segmenter.flush();
    if (this.closed) return; // A full recognition queue can stop just this tap.
    this.interruption = { start: this.segmenter.elapsedSeconds, at: this.lastAudioAt, reason: 'Audio processing was interrupted; speech in this interval may be missing.' };
    this.callbacks.interruption?.({ start: this.interruption.start, reason: this.interruption.reason }, false);
  }

  private closeGap(resumed: boolean) {
    const gap = this.interruption;
    if (!gap) return;
    this.interruption = undefined;
    const end = gap.start + Math.max(0, this.now() - gap.at) / 1000;
    this.segmenter.skipTo(end);
    this.resampler = new Resampler(this.context.sampleRate);
    this.callbacks.interruption?.({ start: gap.start, end, reason: gap.reason }, resumed);
  }

  resume() {
    if (!this.active || this.closed || this.ending || this.resuming || this.muted()) return;
    if (this.now() - this.lastAudioAt > 3000) this.pause();
    if ((this.environment.visibility ?? globalThis.document)?.hidden) return;
    if (!this.interruption && this.context.state === 'running') return;
    this.resuming = true;
    // Resume the existing tap only. Never acquire a microphone or touch the
    // MediaRecorder streams. Some Safari interruptions need a user gesture.
    void bounded(this.context.resume(), 2500).then(() => {
      if (!this.closed && !this.ending && this.active && this.context.state === 'running') this.tap?.port.postMessage('start');
    }).catch(() => { /* Stay paused; the visible Resume button permits a gesture. */ })
      .finally(() => { this.resuming = false; });
  }

  finish(): Promise<void> {
    if (this.finishing) return this.finishing;
    this.ending = true;
    clearInterval(this.heartbeat);
    this.finishing = (async () => {
      if (this.active && !this.closed) {
        await Promise.race([
          new Promise<void>(resolve => { this.flushed = resolve; this.tap?.port.postMessage('flush'); }),
          new Promise(resolve => setTimeout(resolve, 250)),
        ]);
        if (!this.closed) this.segmenter.flush();
      }
      this.closeGap(false);
      this.abort();
    })();
    return this.finishing;
  }

  abort() {
    if (this.closed) return;
    this.ending = true;
    this.closeGap(false);
    this.closed = true; this.active = false;
    clearInterval(this.heartbeat);
    this.context.onstatechange = null;
    this.cleanup.forEach(cleanup => cleanup()); this.cleanup = [];
    this.flushed?.(); this.tap?.port.close();
    this.nodes.forEach(node => { try { node.disconnect(); } catch { /* Already disconnected. */ } });
    this.nodes = [];
    void this.context.close().catch(() => undefined);
  }
}
