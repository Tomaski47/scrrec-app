import type { CompletedRecording, RecordingCheckpoint } from '../recorder/session.ts';
import type { SpeechSession } from '../transcription/controller.ts';
import { ForegroundDeadline } from '../transcription/deadline.ts';

export type SavedRecording = Omit<CompletedRecording, 'url'>;
interface StoredRecording extends RecordingCheckpoint { blob?: Blob; finished: boolean; chunks: number }
interface StoredChunk { recordingId: string; index: number; blob: Blob }
export interface SavedSessions { recordings: SavedRecording[]; transcripts: SpeechSession[] }
const tables = ['meta', 'recordings', 'chunks', 'transcripts'];

export class ArchiveClearedError extends Error {
  constructor() { super('Local copies were cleared in another tab. Refresh to restart automatic saving; download anything still shown here first.'); this.name = 'ArchiveClearedError'; }
}

/** No URLs, streams, model files or permissions are stored. */
export class SessionStore {
  private db: IDBDatabase | undefined;
  private generation = 0;
  private opening: Promise<void> | undefined;
  private closed = false;
  private factory: IDBFactory | undefined;
  private name: string;
  constructor(factory: IDBFactory | undefined = globalThis.indexedDB, name = 'scrrec-local-sessions') { this.factory = factory; this.name = name; }

  open(): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Browser storage closed.'));
    if (this.opening) return this.opening;
    this.opening = new Promise<void>((resolve, reject) => {
      if (!this.factory) { reject(new Error('Browser storage is unavailable.')); return; }
      const request = this.factory.open(this.name, 1);
      let settled = false;
      const fail = (error: unknown) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } };
      const timer = setTimeout(() => fail(new Error('Browser storage did not open.')), 5000);
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error('Browser storage is blocked by another tab.'));
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('meta');
        db.createObjectStore('recordings', { keyPath: 'id' });
        db.createObjectStore('chunks', { keyPath: ['recordingId', 'index'] }).createIndex('recordingId', 'recordingId');
        db.createObjectStore('transcripts', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        if (settled || this.closed) { request.result.close(); fail(new Error('Browser storage closed.')); return; }
        const db = this.db = request.result;
        db.onversionchange = () => { db.close(); this.db = undefined; };
        const tx = db.transaction('meta', 'readonly');
        const generation = tx.objectStore('meta').get('generation');
        tx.oncomplete = () => { this.generation = generation.result ?? 0; settled = true; clearTimeout(timer); resolve(); };
        tx.onabort = () => fail(tx.error);
      };
    });
    return this.opening;
  }

  private async transaction(mode: IDBTransactionMode, operation: (tx: IDBTransaction) => void, clear = false) {
    await this.open();
    const db = this.db;
    if (!db) throw new Error('Browser storage closed. Refresh to restore local saving.');
    const generation = this.generation;
    return new Promise<void>((resolve, reject) => {
      // Prefer committing to durable storage before showing Saved. Older engines
      // without transaction options retain their normal IndexedDB guarantees.
      let tx: IDBTransaction;
      try { tx = db.transaction(tables, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined); }
      catch (error) {
        if (!(error instanceof TypeError)) { reject(error); return; }
        tx = db.transaction(tables, mode);
      }
      let failure: unknown;
      const deadline = new ForegroundDeadline();
      deadline.set(10000, () => {
        failure = new Error('Browser storage did not finish saving.');
        try { tx.abort(); } catch { /* The browser may already have released it. */ }
        deadline.dispose(); reject(failure);
      });
      tx.oncomplete = () => { deadline.dispose(); resolve(); };
      tx.onabort = () => { deadline.dispose(); reject(failure ?? tx.error ?? new Error('Local save did not complete.')); };
      const check = tx.objectStore('meta').get('generation');
      check.onsuccess = () => {
        if (!clear && (check.result ?? 0) !== generation) { failure = new ArchiveClearedError(); tx.abort(); return; }
        try {
          if (clear) {
            const next = (check.result ?? 0) + 1;
            operation(tx); tx.objectStore('meta').put(next, 'generation');
            tx.addEventListener('complete', () => { this.generation = next; });
          } else operation(tx);
        } catch (error) { failure = error; tx.abort(); }
      };
    });
  }

  append(recording: RecordingCheckpoint, index: number, blob: Blob) {
    return this.transaction('readwrite', tx => {
      const existing = tx.objectStore('recordings').get(recording.id);
      existing.onsuccess = () => {
        if (existing.result?.finished) return; // A late checkpoint cannot replace a finalized file.
        tx.objectStore('recordings').put({ ...recording, finished: false, chunks: index + 1 } satisfies StoredRecording);
        tx.objectStore('chunks').put({ recordingId: recording.id, index, blob } satisfies StoredChunk);
      };
    });
  }

  complete(recording: SavedRecording) {
    return this.transaction('readwrite', tx => {
      const { blob, ...metadata } = recording;
      tx.objectStore('recordings').put({ ...metadata, mime: blob.type, blob, finished: true, chunks: 0 } satisfies StoredRecording);
      const cursor = tx.objectStore('chunks').index('recordingId').openCursor(recording.id);
      cursor.onsuccess = () => { if (cursor.result) { cursor.result.delete(); cursor.result.continue(); } };
    });
  }

  transcript(session: SpeechSession) {
    return this.transaction('readwrite', tx => { tx.objectStore('transcripts').put(session); });
  }

  async load(): Promise<SavedSessions> {
    let records: StoredRecording[] = [], chunks: StoredChunk[] = [], transcripts: SpeechSession[] = [];
    await this.transaction('readonly', tx => {
      const files = tx.objectStore('recordings').getAll(); files.onsuccess = () => { records = files.result; };
      const parts = tx.objectStore('chunks').getAll(); parts.onsuccess = () => { chunks = parts.result; };
      const texts = tx.objectStore('transcripts').getAll(); texts.onsuccess = () => { transcripts = texts.result; };
    });
    const grouped = new Map<string, StoredChunk[]>();
    for (const part of chunks) {
      const list = grouped.get(part.recordingId) ?? []; list.push(part); grouped.set(part.recordingId, list);
    }
    const recordings = records.flatMap(record => {
      const parts = (grouped.get(record.id) ?? []).sort((a, b) => a.index - b.index);
      const blob = record.finished ? record.blob : new Blob(parts.map(part => part.blob), { type: record.mime });
      if (!blob?.size) return [];
      return [{ id: record.id, sessionId: record.sessionId, label: record.label, kind: record.kind, filename: record.filename,
        createdAt: new Date(record.createdAt), duration: record.duration, blob,
        partial: record.partial || !record.finished || (!record.blob && parts.some((part, index) => part.index !== index)) }];
    });
    return { recordings, transcripts };
  }

  clear() {
    return this.transaction('readwrite', tx => {
      for (const name of ['recordings', 'chunks', 'transcripts']) tx.objectStore(name).clear();
    }, true);
  }
  close() { this.closed = true; this.db?.close(); this.db = undefined; }
}
