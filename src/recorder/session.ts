export type SessionState = 'idle' | 'acquiring' | 'recording' | 'stopping';
export type AudioQuality = 'low' | 'mid' | 'best';
export const AUDIO_BITRATES: Record<AudioQuality, number> = { low: 64_000, mid: 128_000, best: 256_000 };

export interface RecordingSource {
  label: string;
  kind: 'screen' | 'camera' | 'mic';
  stream: MediaStream;
}

export interface CompletedRecording {
  id: string;
  label: string;
  kind: RecordingSource['kind'];
  blob: Blob;
  url: string;
  filename: string;
  createdAt: Date;
  duration: number;
  partial: boolean;
}

export interface Acquisition {
  signal: AbortSignal;
  ownStream: (stream: MediaStream) => MediaStream;
  ownCleanup: (cleanup: () => void | Promise<void>) => void;
}

interface Callbacks {
  state: (state: SessionState) => void;
  recordings: (recordings: CompletedRecording[]) => void;
  bytes: (bytes: number) => void;
  message: (message: string) => void;
}

interface Platform {
  createRecorder: (stream: MediaStream, options: MediaRecorderOptions) => MediaRecorder;
  supports: (mime: string) => boolean;
  createURL: (blob: Blob) => string;
  revokeURL: (url: string) => void;
  now: () => number;
  stopTimeoutMs: number;
}

interface Entry {
  source: RecordingSource;
  recorder: MediaRecorder;
  chunks: Blob[];
  done: Promise<void>;
  complete: () => void;
  finished: boolean;
  startedAt: number | null;
}

interface Run {
  abort: AbortController;
  streams: Set<MediaStream>;
  cleanup: Array<() => void | Promise<void>>;
  entries: Entry[];
  acquiring: boolean;
  partial: boolean;
  bytes: number;
  finishing?: Promise<void>;
  releasing?: Promise<void>;
  done: Promise<void>;
  resolve: () => void;
}

export function recorderOptions(hasVideo: boolean, hasAudio: boolean, quality: AudioQuality, supports: Platform['supports']): MediaRecorderOptions {
  const candidates = hasVideo
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac'];
  const mimeType = candidates.find(supports);
  // If none of our preferred containers is advertised, let the browser choose.
  return {
    ...(mimeType ? { mimeType } : {}),
    ...(hasVideo ? { videoBitsPerSecond: 8_000_000 } : {}),
    ...(hasAudio ? { audioBitsPerSecond: AUDIO_BITRATES[quality] } : {}),
  };
}

export function recordingFilename(kind: RecordingSource['kind'], mime: string, createdAt: Date, id: string): string {
  const container = mime.split(';')[0].toLowerCase();
  const extensions: Record<string, string> = {
    'video/webm': 'webm', 'audio/webm': 'webm', 'video/mp4': 'mp4', 'audio/mp4': 'm4a',
    'audio/aac': 'aac', 'audio/ogg': 'ogg', 'video/ogg': 'ogv',
  };
  const stamp = createdAt.toISOString().replace(/[:.]/g, '-');
  return `${kind}_${stamp}_${id}.${extensions[container] || 'bin'}`;
}

/** Owns one active capture and an independent collection of completed files. */
export class RecordingSession {
  private callbacks: Callbacks;
  private platform: Platform;
  private run: Run | null = null;
  private outputs: CompletedRecording[] = [];
  private sequence = 0;
  private disposed = false;
  state: SessionState = 'idle';
  startedAt: number | null = null;

  constructor(callbacks: Callbacks, platform: Partial<Platform> = {}) {
    this.callbacks = callbacks;
    this.platform = {
      createRecorder: (stream, options) => new MediaRecorder(stream, options),
      supports: mime => MediaRecorder.isTypeSupported(mime),
      createURL: blob => URL.createObjectURL(blob),
      revokeURL: url => URL.revokeObjectURL(url),
      now: () => Date.now(),
      stopTimeoutMs: 5000,
      ...platform,
    };
  }

  private setState(state: SessionState) {
    this.state = state;
    if (!this.disposed) this.callbacks.state(state);
  }

  private message(message: string) {
    if (!this.disposed) this.callbacks.message(message);
  }

  get recordings(): readonly CompletedRecording[] { return this.outputs; }

  async start(acquire: (owner: Acquisition) => Promise<RecordingSource[]>, quality: AudioQuality): Promise<boolean> {
    // This lock is synchronous, before acquisition or a React render can yield.
    if (this.run || this.disposed) return false;
    let resolve!: () => void;
    const run: Run = {
      abort: new AbortController(), streams: new Set(), cleanup: [], entries: [],
      acquiring: true, partial: false, bytes: 0,
      done: new Promise<void>(r => { resolve = r; }), resolve: () => resolve(),
    };
    this.run = run;
    this.setState('acquiring');
    this.callbacks.bytes(0);
    const check = () => { if (run.abort.signal.aborted) throw new DOMException('Capture cancelled', 'AbortError'); };
    try {
      const sources = await acquire({
        signal: run.abort.signal,
        ownStream: stream => {
          if (run.abort.signal.aborted) {
            stream.getTracks().forEach(track => track.stop());
            check();
          }
          run.streams.add(stream);
          const ended = () => {
            if (!run.abort.signal.aborted) {
              this.message('A recording source ended. The session has stopped; available recordings are kept below.');
              void this.stop();
            }
          };
          stream.getTracks().forEach(track => track.addEventListener('ended', ended));
          run.cleanup.push(() => stream.getTracks().forEach(track => track.removeEventListener('ended', ended)));
          return stream;
        },
        ownCleanup: cleanup => {
          run.cleanup.push(cleanup);
          if (run.abort.signal.aborted) void this.releaseResources(run);
        },
      });
      check();
      if (!sources.length) throw new Error('Choose at least one recording source.');
      for (const source of sources) {
        if (source.stream.getTracks().some(track => track.readyState === 'ended')) throw new Error(`${source.label} is no longer available. Choose the source again.`);
        const recorder = this.platform.createRecorder(source.stream, recorderOptions(
          source.stream.getVideoTracks().length > 0, source.stream.getAudioTracks().length > 0, quality, this.platform.supports,
        ));
        let complete!: () => void;
        const entry: Entry = {
          source, recorder, chunks: [], finished: false, startedAt: null,
          done: new Promise<void>(r => { complete = r; }), complete: () => complete(),
        };
        run.entries.push(entry);
        recorder.ondataavailable = event => {
          if (!entry.finished && event.data.size) {
            entry.chunks.push(event.data);
            run.bytes += event.data.size;
            if (!this.disposed) this.callbacks.bytes(run.bytes);
          }
        };
        recorder.onstop = () => {
          this.completeEntry(run, entry);
          if (!run.abort.signal.aborted && !run.acquiring) {
            this.message('Recording stopped by the browser. Available files are kept below.');
            void this.stop();
          }
        };
        recorder.onerror = () => {
          run.partial = true;
          this.message('The browser reported a recording error. Available files were kept; check playback before relying on them.');
          void this.stop();
        };
      }
      for (const entry of run.entries) {
        check();
        entry.recorder.start(1000);
        entry.startedAt = this.platform.now();
      }
      check();
      if (run.entries.some(entry => entry.finished || entry.recorder.state === 'inactive')) throw new Error('A source stopped before the session was ready. Please try again.');
      this.startedAt = this.platform.now();
      run.acquiring = false;
      this.setState('recording');
      return true;
    } catch (error) {
      run.partial = run.entries.some(entry => entry.startedAt !== null);
      if (!run.abort.signal.aborted) this.message(error instanceof Error ? error.message : 'Could not start recording. Check permissions and try again.');
      run.acquiring = false;
      await this.finish(run);
      return false;
    }
  }

  stop(): Promise<void> {
    const run = this.run;
    if (!run) return Promise.resolve();
    run.abort.abort();
    this.setState('stopping');
    // Native permission pickers cannot be programmatically dismissed. Late streams
    // are rejected by ownStream; keep the lock until acquisition returns.
    if (run.acquiring) void this.releaseResources(run);
    else void this.finish(run);
    return run.done;
  }

  private completeEntry(run: Run, entry: Entry) {
    if (entry.finished) return;
    entry.finished = true;
    if (entry.chunks.length && !this.disposed) {
      const mime = entry.recorder.mimeType || entry.chunks.find(chunk => chunk.type)?.type || '';
      const blob = new Blob(entry.chunks, { type: mime });
      const id = String(++this.sequence);
      const createdAt = new Date(entry.startedAt ?? this.platform.now());
      this.outputs = [...this.outputs, {
        id, label: entry.source.label, kind: entry.source.kind, blob,
        url: this.platform.createURL(blob), filename: recordingFilename(entry.source.kind, mime, createdAt, id),
        createdAt, duration: Math.max(0, this.platform.now() - createdAt.getTime()) / 1000, partial: run.partial,
      }];
      this.callbacks.recordings([...this.outputs]);
    }
    entry.chunks = [];
    entry.complete();
  }

  private finish(run: Run): Promise<void> {
    if (run.finishing) return run.finishing;
    run.abort.abort();
    this.setState('stopping');
    run.finishing = (async () => {
      for (const entry of run.entries) {
        if (entry.finished) continue;
        if (entry.startedAt === null) { this.completeEntry(run, entry); continue; }
        // An inactive recorder can still have final data/stop events queued.
        if (entry.recorder.state !== 'inactive') {
          try { entry.recorder.stop(); } catch { run.partial = true; }
        }
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.all(run.entries.map(entry => entry.done)),
        new Promise<void>(resolve => { timer = setTimeout(() => {
          run.partial = true;
          this.message('The browser did not finish every file. Partial recordings were kept; check playback.');
          run.entries.forEach(entry => this.completeEntry(run, entry));
          resolve();
        }, this.platform.stopTimeoutMs); }),
      ]);
      clearTimeout(timer);
      await this.releaseResources(run);
      if (this.run === run) {
        this.run = null;
        this.startedAt = null;
        this.setState('idle');
      }
      run.resolve();
    })();
    return run.finishing;
  }

  private releaseResources(run: Run): Promise<void> {
    run.streams.forEach(stream => stream.getTracks().forEach(track => track.stop()));
    run.streams.clear();
    const tasks = run.cleanup.splice(0).map(async cleanup => {
      try { await cleanup(); } catch { /* Continue releasing the remaining resources. */ }
    });
    run.releasing = Promise.all([run.releasing, ...tasks]).then(() => undefined);
    return run.releasing;
  }

  clear() {
    this.outputs.forEach(output => this.platform.revokeURL(output.url));
    this.outputs = [];
    if (!this.disposed) this.callbacks.recordings([]);
  }

  dispose() {
    this.disposed = true;
    this.clear();
    void this.stop();
  }
}
