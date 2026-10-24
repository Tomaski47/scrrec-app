import type { CompletedRecording, RecordingCheckpoint } from '../recorder/session.ts';
import type { SpeechSession } from '../transcription/controller.ts';
import { SessionStore, type SavedSessions } from './sessionStore.ts';

export interface ArchiveStatus { ready: boolean; pending: number; lastSaved: number | null; error: string; clearing: boolean }
export const initialArchiveStatus: ArchiveStatus = { ready: false, pending: 0, lastSaved: null, error: '', clearing: false };

/** Serializes writes and keeps storage failures independent of media capture. */
export class LocalArchive {
  private status = { ...initialArchiveStatus };
  private tail: Promise<void> = Promise.resolve();
  private transcriptTimer: ReturnType<typeof setTimeout> | undefined;
  private transcripts = new Map<string, SpeechSession>();
  private savedTexts = new Map<string, string>();
  private attached = true;
  private cleanup: Array<() => void> = [];
  private notify: (status: ArchiveStatus) => void;
  private store: SessionStore;
  constructor(notify: (status: ArchiveStatus) => void, store = new SessionStore()) {
    this.notify = notify; this.store = store;
    const flush = () => this.flushTranscripts();
    for (const [target, name] of [[globalThis.window, 'pagehide'], [globalThis.document, 'visibilitychange']] as const) {
      target?.addEventListener(name, flush); this.cleanup.push(() => target?.removeEventListener(name, flush));
    }
  }
  private publish() { if (this.attached) this.notify({ ...this.status, pending: this.status.pending + this.transcripts.size }); }
  get unsaved() { return this.status.pending > 0 || this.transcripts.size > 0 || !!this.status.error; }
  private failure(error: unknown) {
    this.status.error = error instanceof Error && error.name === 'QuotaExceededError'
      ? 'Browser storage is full. New changes may not be saved locally. Download recordings and transcripts before leaving.'
      : error instanceof Error && error.name === 'ArchiveClearedError' ? error.message
        : 'Automatic local saving is unavailable or failed. Download recordings and transcripts before leaving.';
    this.publish();
  }
  async load(): Promise<SavedSessions> {
    try { return await this.store.load(); }
    catch (error) { this.failure(error); return { recordings: [], transcripts: [] }; }
    finally { this.status.ready = true; this.publish(); }
  }
  private write(operation: () => Promise<void>) {
    if (this.status.clearing) return;
    this.status.pending++; this.publish();
    this.tail = this.tail.then(operation).then(() => {
      this.status.lastSaved = Date.now();
    }, error => this.failure(error)).finally(() => { this.status.pending--; this.publish(); });
  }
  append(recording: RecordingCheckpoint, index: number, blob: Blob) { this.write(() => this.store.append(recording, index, blob)); }
  complete(recording: CompletedRecording) {
    const { url: _url, ...saved } = recording;
    void _url;
    this.write(() => this.store.complete(saved));
  }
  saveTranscripts(sessions: SpeechSession[]) {
    if (this.status.clearing) return;
    for (const session of sessions) {
      if (session.restored) continue;
      const text = JSON.stringify(session);
      if (this.savedTexts.get(session.id) === text) continue;
      this.savedTexts.set(session.id, text); this.transcripts.set(session.id, session);
    }
    if (this.transcripts.size && !this.transcriptTimer) this.transcriptTimer = setTimeout(() => this.flushTranscripts(), 250);
    this.publish();
  }
  flushTranscripts() {
    clearTimeout(this.transcriptTimer); this.transcriptTimer = undefined;
    for (const session of this.transcripts.values()) this.write(() => this.store.transcript(session));
    this.transcripts.clear();
    this.publish();
  }
  async idle() { this.flushTranscripts(); await this.tail; }
  async clear(): Promise<boolean> {
    this.status.clearing = true; this.publish();
    clearTimeout(this.transcriptTimer); this.transcriptTimer = undefined; this.transcripts.clear();
    try {
      await this.tail; await this.store.clear(); this.savedTexts.clear();
      this.status.lastSaved = null; this.status.error = ''; return true;
    } catch (error) { this.failure(error); return false; }
    finally { this.status.clearing = false; this.publish(); }
  }
  detach(after: Promise<void> = Promise.resolve()) {
    this.flushTranscripts(); this.attached = false;
    this.cleanup.forEach(remove => remove()); this.cleanup = [];
    // Allow queued checkpoints/finalization to settle after a component unmount.
    void after.finally(() => this.tail.finally(() => this.store.close()));
  }
}
