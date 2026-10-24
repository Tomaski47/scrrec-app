import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { SessionStore, ArchiveClearedError } from '../src/storage/sessionStore.ts';
import { LocalArchive, type ArchiveStatus } from '../src/storage/localArchive.ts';
import { TranscriptionController, sessionExportText, sessionText, type SpeechSession } from '../src/transcription/controller.ts';
import { MODELS } from '../src/transcription/protocol.ts';
import type { CompletedRecording, RecordingCheckpoint } from '../src/recorder/session.ts';

function file(id: string = crypto.randomUUID()): CompletedRecording {
  return { id, sessionId: 'session-one', label: 'Microphone', kind: 'mic', blob: new Blob(['first-final'], { type: 'audio/mp4' }),
    url: 'blob:never-store-this', filename: `${id}.m4a`, createdAt: new Date('2026-10-24T20:00:00Z'), duration: 12, partial: false };
}
function checkpoint(recording = file()): RecordingCheckpoint {
  const { blob, url: _url, ...rest } = recording; void _url;
  return { ...rest, mime: blob.type };
}
function text(): SpeechSession {
  return { id: 'session-one', createdAt: '2026-10-24T20:00:00Z', source: 'Microphone', capturing: true, finished: false,
    incomplete: '', blocks: [{ id: 1, start: 0, end: 6, text: 'Saved words.', boundaryReview: false, recognitionReview: false }],
    draft: '\n\nLatest draft.', paused: false, interruptions: [], model: MODELS.tiny, device: 'wasm', revision: 'test',
    stats: { windows: 1, retries: 0, inferenceMs: 50, maxQueue: 1, maxWorkingWords: 20, contextRate: 48000 } };
}
function fixture() {
  const factory = new IDBFactory(), name = crypto.randomUUID(), stores: SessionStore[] = [];
  const open = () => { const store = new SessionStore(factory, name); stores.push(store); return store; };
  return { open, close: () => stores.forEach(store => store.close()) };
}

test('finished media and transcript snapshots survive a new connection with exact bytes, metadata and session association', async () => {
  const f = fixture(), store = f.open(), recording = file();
  try {
    const { url: _url, ...saved } = recording; void _url;
    await store.complete(saved); await store.transcript(text()); store.close();
    const restored = await f.open().load();
    assert.equal(restored.recordings.length, 1); assert.equal(await restored.recordings[0].blob.text(), 'first-final');
    assert.equal(restored.recordings[0].filename, recording.filename); assert.equal(restored.recordings[0].partial, false);
    assert.equal(restored.recordings[0].createdAt.toISOString(), recording.createdAt.toISOString());
    assert.equal(restored.recordings[0].sessionId, restored.transcripts[0].id);
    assert.equal('url' in restored.recordings[0], false); assert.equal(restored.transcripts[0].draft, '\n\nLatest draft.');
  } finally { f.close(); }
});

test('an unfinished capture restores only committed chunks, in order, marked partial', async () => {
  const f = fixture(), store = f.open(), meta = checkpoint();
  try {
    await store.append(meta, 0, new Blob(['begin-'])); await store.append({ ...meta, duration: 8 }, 1, new Blob(['middle']));
    store.close(); const recovered = (await f.open().load()).recordings[0];
    assert.equal(await recovered.blob.text(), 'begin-middle'); assert.equal(recovered.partial, true);
    assert.equal(recovered.blob.type, 'audio/mp4'); assert.equal(recovered.duration, 8);
  } finally { f.close(); }
});

test('finalization repairs a missed checkpoint and a late checkpoint cannot downgrade or duplicate the finished file', async () => {
  const f = fixture(), store = f.open(), recording = file(), meta = checkpoint(recording);
  try {
    await store.append(meta, 0, new Blob(['first-']));
    const { url: _url, ...saved } = recording; void _url;
    await store.complete(saved); await store.append(meta, 1, new Blob(['late']));
    const restored = await store.load();
    assert.equal(restored.recordings.length, 1); assert.equal(restored.recordings[0].partial, false);
    assert.equal(await restored.recordings[0].blob.text(), 'first-final');
  } finally { f.close(); }
});

test('clearing removes media, chunks and text atomically and rejects stale writes from another tab', async () => {
  const f = fixture(), first = f.open(), other = f.open(), meta = checkpoint();
  try {
    await first.append(meta, 0, new Blob(['old'])); await other.load(); await first.transcript(text()); await first.clear();
    await assert.rejects(other.append(meta, 1, new Blob(['stale'])), ArchiveClearedError);
    await assert.rejects(other.transcript(text()), ArchiveClearedError);
    const empty = await f.open().load(); assert.deepEqual(empty, { recordings: [], transcripts: [] });
    await first.append(checkpoint(file('new-file')), 0, new Blob(['new']));
    assert.equal((await first.load()).recordings[0].id, 'new-file');
  } finally { f.close(); }
});

test('transcript restore preserves stable and draft words, warns about unfinished work and never loads a model', () => {
  const controller = new TranscriptionController({ worker: () => { throw new Error('Must not load during restoration'); } });
  try {
    controller.restore([text()]); const snapshot = controller.snapshot(), session = snapshot.sessions[0];
    assert.equal(snapshot.modelStatus, 'unloaded'); assert.equal(session.capturing, false); assert.equal(session.paused, false);
    assert.equal(sessionText(session), 'Saved words.\n\nLatest draft.'); assert.equal(session.finished, true);
    assert.match(session.incomplete, /Recovered after the page closed/); assert.match(sessionExportText(session), /^\[Recovered transcript:/);
    controller.restore([text()]); assert.equal(controller.snapshot().sessions.length, 1);
    controller.unload(); assert.equal(controller.snapshot().sessions.length, 1);
    controller.clear(); assert.equal(controller.snapshot().sessions.length, 0);
  } finally { controller.dispose(); }
});

test('a finished transcript restores without an interruption warning or a changed export', () => {
  const controller = new TranscriptionController();
  try {
    controller.restore([{ ...text(), capturing: false, finished: true }]);
    const session = controller.snapshot().sessions[0]; assert.equal(session.incomplete, '');
    assert.equal(sessionExportText(session), 'Saved words.\n\nLatest draft.');
  } finally { controller.dispose(); }
});

test('autosave flushes the latest transcript snapshot, survives a reopen and cancels queued text when cleared', async () => {
  const f = fixture(), archive = new LocalArchive(() => undefined, f.open());
  try {
    await archive.load(); archive.saveTranscripts([text()]); archive.saveTranscripts([{ ...text(), draft: 'Newest draft.' }]);
    await archive.idle(); assert.equal((await f.open().load()).transcripts[0].draft, 'Newest draft.');
    archive.saveTranscripts([{ ...text(), draft: 'Do not resurrect after Clear.' }]);
    assert.equal(await archive.clear(), true); await archive.idle();
    assert.deepEqual(await f.open().load(), { recordings: [], transcripts: [] });
  } finally { archive.detach(); f.close(); }
});

test('quota failures are reported without throwing into recording callbacks; completed files can still be saved', async () => {
  const f = fixture();
  class FullStore extends SessionStore {
    override append() { return Promise.reject(new DOMException('Full', 'QuotaExceededError')); }
  }
  const states: ArchiveStatus[] = [], archive = new LocalArchive(status => states.push(status), new FullStore(new IDBFactory(), crypto.randomUUID()));
  try {
    await archive.load(); const recording = file(); archive.append(checkpoint(recording), 0, new Blob(['chunk']));
    await archive.idle(); assert.match(states.at(-1)!.error, /storage is full/); assert.equal(states.at(-1)!.pending, 0);
    archive.complete(recording); await archive.idle(); assert.ok(states.at(-1)!.lastSaved);
    assert.equal(archive.unsaved, true, 'A later success must not hide an earlier storage failure');
  } finally { archive.detach(); f.close(); }
});

test('unavailable storage unlocks recording with a visible fallback and never claims the data is saved', async () => {
  const states: ArchiveStatus[] = [];
  const unavailable = { open() { throw new Error('Disabled'); } } as unknown as IDBFactory;
  const archive = new LocalArchive(status => states.push(status), new SessionStore(unavailable));
  try {
    assert.deepEqual(await archive.load(), { recordings: [], transcripts: [] });
    assert.ok(states.at(-1)!.ready); assert.ok(states.at(-1)!.error); assert.equal(states.at(-1)!.lastSaved, null);
    archive.complete(file()); await archive.idle(); assert.equal(states.at(-1)!.lastSaved, null);
  } finally { archive.detach(); }
});
