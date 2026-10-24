import { BoundedQueue } from './audio.ts';
import { TranscriptAssembler, type TranscriptBlock } from './assembler.ts';
import { MicrophoneTap, type CaptureInterruption, type CaptureTap, type TapCallbacks } from './capture.ts';
import { ForegroundDeadline, type Visibility } from './deadline.ts';
import { MODELS, type Device, type Model, type Request, type Response, type Segment } from './protocol.ts';

export interface SpeechSession {
  id: string; createdAt: string; source: string; capturing: boolean; finished: boolean;
  incomplete: string; blocks: readonly TranscriptBlock[]; draft: string;
  paused: boolean; interruptions: CaptureInterruption[];
  restored?: boolean;
  model: typeof MODELS[Model]; device: Device; revision: string;
  stats: { windows: number; retries: number; inferenceMs: number; maxQueue: number; maxWorkingWords: number; contextRate: number };
}
export interface SpeechSnapshot {
  modelStatus: 'unloaded' | 'loading' | 'ready' | 'error'; message: string;
  canStartCapture: boolean; queueDepth: number; sessions: SpeechSession[];
}
interface EngineWorker {
  onmessage: ((event: MessageEvent<Response>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: Request, transfer?: Transferable[]): void;
  terminate(): void;
}
interface Options {
  worker?: () => EngineWorker; tap?: (callbacks: TapCallbacks) => CaptureTap;
  revision?: string; loadTimeout?: number; jobTimeout?: number;
  visibility?: Visibility;
}
interface Job extends Segment { sessionId: string }
interface Entry { view: SpeechSession; assembler: TranscriptAssembler; pending: number; ended: boolean; activated: boolean }

export const emptySpeech: SpeechSnapshot = { modelStatus: 'unloaded', message: '', canStartCapture: false, queueDepth: 0, sessions: [] };
export const sessionText = (session: SpeechSession) => (session.blocks.map(block => block.text).join('') + session.draft).trim();
/** Plain-text copies must not make an interrupted transcript look complete. */
export function sessionExportText(session: SpeechSession) {
  const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const gaps = session.interruptions.map(gap => `[Possible missing speech: ${time(gap.start)}${gap.end === undefined ? ' onward' : ` to ${time(gap.end)}`}.]`).join('\n');
  const recovery = session.restored && session.incomplete ? `[Recovered transcript: ${session.incomplete}]` : '';
  const notices = [recovery, gaps].filter(Boolean).join('\n');
  return notices ? `${notices}\n\n${sessionText(session)}`.trim() : sessionText(session);
}

/** The optional engine owns its worker and PCM tap, never recording tracks. */
export class TranscriptionController {
  private options: Options;
  private worker: EngineWorker | undefined;
  private queue: BoundedQueue<Job> | undefined;
  private deadline: ForegroundDeadline;
  private listeners = new Set<(state: SpeechSnapshot) => void>();
  private entries = new Map<string, Entry>();
  private restored = new Map<string, SpeechSession>();
  private active: { id: string; tap: CaptureTap } | undefined;
  private sequence = 0;
  private model: Model = 'tiny';
  private device: Device = 'wasm';
  private status: SpeechSnapshot['modelStatus'] = 'unloaded';
  private message = '';

  constructor(options: Options = {}) { this.options = options; this.deadline = new ForegroundDeadline(options.visibility); }
  subscribe(listener: (state: SpeechSnapshot) => void) {
    this.listeners.add(listener); listener(this.snapshot());
    return () => { this.listeners.delete(listener); };
  }
  snapshot(): SpeechSnapshot {
    return { modelStatus: this.status, message: this.message, queueDepth: this.queue?.depth ?? 0,
      canStartCapture: this.status === 'ready' && !this.active && (!!this.queue?.accepting || !this.queue?.depth),
      sessions: [...this.restored.values(), ...[...this.entries.values()].map(({ view, assembler }) => ({ ...view, interruptions: view.interruptions.map(gap => ({ ...gap })), stats: { ...view.stats }, blocks: [...assembler.blocks], draft: assembler.draftText }))] };
  }
  restore(sessions: SpeechSession[]) {
    for (const session of sessions) {
      if (this.entries.has(session.id) || this.restored.has(session.id)) continue;
      this.restored.set(session.id, { ...session, restored: true, capturing: false, paused: false, finished: true,
        incomplete: !session.finished || session.capturing
          ? [session.incomplete, 'Recovered after the page closed. Final speech may be missing; recording and transcription must be started again.'].filter(Boolean).join(' ')
          : session.incomplete });
    }
    this.publish();
  }
  private publish() { const state = this.snapshot(); this.listeners.forEach(listener => listener(state)); }
  private settle(entry: Entry) {
    if (entry.ended && !entry.pending) { entry.assembler.finish(); entry.view.finished = true; }
  }
  private makeQueue() {
    this.queue = new BoundedQueue<Job>(job => {
      this.deadline.set(this.options.jobTimeout ?? 90_000, () => this.fail('Speech processing took too long. Save the recording; this transcript may be incomplete.'));
      try { this.worker!.postMessage({ type: 'transcribe', id: job.id, audio: job.audio, overlap: job.overlap }, [job.audio.buffer]); }
      catch (error) { this.fail(`Speech processing failed: ${String(error)} Recording continues.`); }
    }, () => this.stopTap('Transcription fell behind. This transcript is incomplete; recording continues.'));
  }
  load(model: Model = 'tiny', device: Device = 'wasm') {
    this.unload(); this.model = model; this.device = device;
    this.status = 'loading'; this.message = 'Preparing transcription…';
    try {
      const worker = this.worker = this.options.worker?.() ?? new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.makeQueue();
      this.deadline.set(this.options.loadTimeout ?? 180_000, () => this.fail('Model loading timed out. Recording is still available.'));
      worker.onerror = event => { if (this.worker === worker) this.fail(event.message || 'Speech engine failed.'); };
      worker.onmessage = ({ data }) => {
        if (this.worker !== worker) return;
        if (data.type === 'progress') this.message = 'Preparing transcription. Downloaded files will be reused when available.';
        else if (data.type === 'ready') {
          this.deadline.clear(); this.status = 'ready'; this.message = '';
        } else if (data.type === 'error') { this.fail(data.message); return; }
        else {
          // Ignore stale/unexpected responses without clearing another job's timer.
          const queue = this.queue;
          const job = queue?.active;
          if (!queue || !job || job.id !== data.id) return;
          this.deadline.clear();
          const entry = this.entries.get(job.sessionId);
          if (entry) {
            entry.pending--;
            entry.assembler.add(job, data.text, data.words, data.ms, data.review);
            entry.view.stats.windows++; entry.view.stats.retries += Number(data.retried);
            entry.view.stats.inferenceMs += data.ms; entry.view.stats.maxWorkingWords = entry.assembler.maxWorkingWords;
            this.settle(entry);
          }
          queue.complete(data.id);
        }
        this.publish();
      };
      worker.postMessage({ type: 'load', model, device });
    } catch (error) { this.fail(`Could not prepare transcription: ${String(error)}`); }
    this.publish();
  }
  beginCapture(id: string, source: string): CaptureTap | undefined {
    if (this.status !== 'ready' || this.active || (this.queue && !this.queue.accepting && this.queue.depth)) {
      this.message = 'Recording started without transcription. Prepare the model before the next recording.'; this.publish(); return;
    }
    if (!this.queue?.accepting) this.makeQueue();
    const entry: Entry = { assembler: new TranscriptAssembler(), pending: 0, ended: false, activated: false,
      view: { id, createdAt: new Date().toISOString(), source, capturing: false, finished: false, incomplete: '', blocks: [], draft: '', paused: false, interruptions: [],
        model: MODELS[this.model], device: this.device, revision: this.options.revision ?? 'local',
        stats: { windows: 0, retries: 0, inferenceMs: 0, maxQueue: 0, maxWorkingWords: 0, contextRate: 0 } } };
    this.entries.set(id, entry);
    try {
      const callbacks: TapCallbacks = {
        segment: segment => {
          if (entry.ended || this.status !== 'ready') return;
          const queue = this.queue!;
          entry.pending++;
          if (!queue.add({ ...segment, id: ++this.sequence, sessionId: id })) entry.pending--;
          entry.view.stats.maxQueue = Math.max(entry.view.stats.maxQueue, queue.depth);
          this.settle(entry); this.publish();
        },
        rate: rate => { entry.view.stats.contextRate = rate; },
        failure: message => { if (this.active?.id === id) this.stopTap(message); },
        interruption: (gap, resumed) => {
          if (this.active?.id !== id || entry.ended) return;
          const last = entry.view.interruptions.at(-1);
          if (last && last.start === gap.start && last.end === undefined) entry.view.interruptions[entry.view.interruptions.length - 1] = gap;
          else entry.view.interruptions.push(gap);
          entry.view.paused = gap.end === undefined;
          entry.view.incomplete = 'Audio processing was interrupted. Some speech may be missing; check the saved recording.';
          this.message = resumed ? 'Transcription resumed. The interrupted interval is marked in your transcript.'
            : gap.end === undefined ? 'Transcription paused. Trying to resume automatically; return to this tab if needed.'
              : 'Transcription ended with an interrupted interval. Check the saved recording for missing speech.';
          this.publish();
        },
      };
      const tap = this.options.tap?.(callbacks) ?? new MicrophoneTap(callbacks);
      this.active = { id, tap }; this.message = 'Transcription will start with your recording.'; this.publish();
      let finished = false;
      return {
        attach: streams => tap.attach(streams), activate: () => { if (this.active?.id === id) this.activateCapture(); },
        abort: () => { if (this.active?.id === id) this.stopTap('Transcription stopped; recording continues.'); },
        resume: () => { if (this.active?.id === id) tap.resume?.(); },
        finish: async () => {
          if (finished) return; finished = true;
          try { await tap.finish(); }
          catch { entry.view.incomplete = 'Transcription could not finish. The recording is kept separately.'; tap.abort(); }
          if (this.active?.id === id) this.active = undefined;
          entry.ended = true; entry.view.capturing = false; entry.view.paused = false;
          if (!entry.view.incomplete) this.message = '';
          if (!entry.activated && !entry.pending) this.entries.delete(id);
          else this.settle(entry);
          this.publish();
        },
      };
    } catch (error) {
      this.entries.delete(id); this.message = `Recording continues without transcription: ${String(error)}`; this.publish();
    }
  }
  activateCapture() {
    if (!this.active) return;
    const entry = this.entries.get(this.active.id)!;
    entry.activated = true; entry.view.capturing = true; entry.view.createdAt = new Date().toISOString();
    this.message = 'Listening for speech.'; this.active.tap.activate(); this.publish();
  }
  resumeCapture() { this.active?.tap.resume?.(); }
  stopCapture() { this.stopTap('Transcription stopped. Existing text is kept; recording continues.'); }
  private stopTap(message: string) {
    if (this.active) {
      const entry = this.entries.get(this.active.id)!;
      this.active.tap.abort();
      entry.view.incomplete = message; entry.view.capturing = false; entry.ended = true;
      entry.view.paused = false; this.active = undefined; this.settle(entry);
    }
    this.message = message; this.publish();
  }
  private fail(message: string) { this.unload(message); this.status = 'error'; this.publish(); }
  unload(reason = 'Transcription stopped. Existing text is kept; recording continues.') {
    this.deadline.clear(); this.worker?.terminate(); this.worker = undefined;
    this.stopTap(reason); this.queue = undefined; this.status = 'unloaded';
    for (const entry of this.entries.values()) if (!entry.view.finished) {
      entry.view.incomplete = reason; entry.ended = true; entry.pending = 0; this.settle(entry);
    }
    this.publish();
  }
  clear() { this.unload(); this.entries.clear(); this.restored.clear(); this.publish(); }
  dispose() { this.listeners.clear(); this.unload(); this.deadline.dispose(); }
}
