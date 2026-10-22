import test from 'node:test';
import assert from 'node:assert/strict';
import { RecordingSession, recorderOptions, recordingFilename, type CompletedRecording, type SessionState } from '../src/recorder/session.ts';

class Track extends EventTarget {
  kind = 'video';
  readyState = 'live';
  stop() { this.readyState = 'ended'; }
  end() { this.stop(); this.dispatchEvent(new Event('ended')); }
}

function media(audio = false) {
  const track = new Track();
  track.kind = audio ? 'audio' : 'video';
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => audio ? [] : [track],
    getAudioTracks: () => audio ? [track] : [],
  } as unknown as MediaStream;
  return { track, stream };
}

class Recorder {
  state = 'inactive';
  mimeType = 'video/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  failStart = false;
  hangStop = false;
  stopDelay = 0;
  options: MediaRecorderOptions;
  constructor(options: MediaRecorderOptions) { this.options = options; this.mimeType = options.mimeType || 'video/mp4'; }
  start() {
    if (this.failStart) throw new Error('Encoder start failed');
    this.state = 'recording';
    this.chunk('first');
  }
  chunk(data: string) { this.ondataavailable?.({ data: new Blob([data], { type: this.mimeType }) }); }
  stop() {
    this.state = 'inactive';
    if (this.hangStop) return;
    setTimeout(() => { this.chunk('final'); this.onstop?.(); }, this.stopDelay);
  }
}

function fixture(configure?: (recorder: Recorder, index: number) => void) {
  const recorders: Recorder[] = [];
  const revoked: string[] = [];
  const messages: string[] = [];
  const states: SessionState[] = [];
  const byteCounts: number[] = [];
  let outputs: CompletedRecording[] = [];
  const session = new RecordingSession({
    state: state => states.push(state), recordings: entries => { outputs = entries; },
    bytes: bytes => byteCounts.push(bytes), message: message => messages.push(message),
  }, {
    createRecorder: (_stream, options) => {
      const recorder = new Recorder(options);
      configure?.(recorder, recorders.length);
      recorders.push(recorder);
      return recorder as unknown as MediaRecorder;
    },
    supports: mime => mime === 'video/mp4' || mime === 'audio/mp4',
    createURL: () => `blob:test-${outputs.length}`,
    revokeURL: url => revoked.push(url),
    stopTimeoutMs: 50,
  });
  return { session, recorders, revoked, messages, states, byteCounts, outputs: () => outputs };
}

async function record(f: ReturnType<typeof fixture>, input = media()) {
  await f.session.start(async owner => [{ label: 'Source', kind: 'screen', stream: owner.ownStream(input.stream) }], 'best');
  await f.session.stop();
  return input;
}

test('completed outputs survive a failed next start and a successful next recording until explicit clear', async () => {
  const f = fixture();
  await record(f);
  const first = f.outputs()[0];
  assert.equal(await first.blob.text(), 'firstfinal');
  await f.session.start(async () => { throw new Error('Picker cancelled'); }, 'best');
  assert.equal(f.outputs()[0], first);
  await record(f);
  assert.equal(f.outputs().length, 2);
  assert.equal(f.revoked.length, 0);
  f.session.clear();
  assert.equal(f.outputs().length, 0);
  assert.equal(f.revoked.length, 2);
});

test('startup is locked before an asynchronous picker completes; cancelling releases a late stream', async () => {
  const f = fixture();
  const input = media();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const start = f.session.start(async owner => { await pending; return [{ label: 'Late', kind: 'screen', stream: owner.ownStream(input.stream) }]; }, 'best');
  assert.equal(f.session.state, 'acquiring');
  assert.equal(await f.session.start(async () => { throw new Error('must not run'); }, 'best'), false);
  const stop = f.session.stop();
  assert.equal(f.session.state, 'stopping');
  release();
  assert.equal(await start, false);
  await stop;
  assert.equal(input.track.readyState, 'ended');
  assert.equal(f.session.state, 'idle');
  assert.equal(f.outputs().length, 0);
});

test('one acquisition ID associates all outputs and changes for the next recording', async () => {
  const f = fixture();
  let captureId = '';
  await f.session.start(async owner => {
    captureId = owner.sessionId;
    return ['screen', 'camera', 'mic'].map(kind => ({ kind: kind as 'screen' | 'camera' | 'mic', label: kind, stream: owner.ownStream(media().stream) }));
  }, 'low');
  await f.session.stop();
  assert.ok(captureId);
  assert.deepEqual(f.outputs().map(recording => recording.sessionId), [captureId, captureId, captureId]);
  await record(f);
  assert.notEqual(f.outputs().at(-1)?.sessionId, captureId);
});

test('Stop waits for queued final data even after recorder becomes inactive', async () => {
  const f = fixture(recorder => { recorder.stopDelay = 15; });
  await f.session.start(async owner => [{ label: 'Screen', kind: 'screen', stream: owner.ownStream(media().stream) }], 'best');
  f.recorders[0].stop(); // browser initiated termination queues the final events
  const stopped = f.session.stop();
  assert.equal(f.session.state, 'stopping');
  assert.equal(f.outputs().length, 0);
  await stopped;
  assert.equal(await f.outputs()[0].blob.text(), 'firstfinal');
  assert.equal(f.session.state, 'idle');
});

test('cancel during a later picker immediately releases earlier sources and closes a late source', async () => {
  const f = fixture();
  const first = media(); const late = media();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const started = f.session.start(async owner => {
    owner.ownStream(first.stream);
    await pending;
    return [{ label: 'Late screen', kind: 'screen', stream: owner.ownStream(late.stream) }];
  }, 'best');
  const stopped = f.session.stop();
  assert.equal(first.track.readyState, 'ended');
  release();
  await Promise.all([started, stopped]);
  assert.equal(late.track.readyState, 'ended');
  assert.equal(f.recorders.length, 0);
});

test('recorder construction failure releases acquired media without clearing prior output', async () => {
  const f = fixture((_recorder, index) => { if (index === 1) throw new Error('Unsupported encoder'); });
  await record(f);
  const previous = f.outputs()[0];
  const input = media();
  assert.equal(await f.session.start(async owner => [{ label: 'Screen', kind: 'screen', stream: owner.ownStream(input.stream) }], 'best'), false);
  assert.equal(input.track.readyState, 'ended');
  assert.equal(f.outputs()[0], previous);
  assert.equal(f.revoked.length, 0);
});

test('ending a source stops the full session, closes resources and preserves files', async () => {
  const f = fixture();
  const first = media(); const second = media(true);
  let cleaned = false;
  await f.session.start(async owner => {
    owner.ownCleanup(() => { cleaned = true; });
    return [
      { label: 'Screen', kind: 'screen', stream: owner.ownStream(first.stream) },
      { label: 'Mic', kind: 'mic', stream: owner.ownStream(second.stream) },
    ];
  }, 'best');
  first.track.end();
  await f.session.stop();
  assert.equal(f.session.state, 'idle');
  assert.equal(second.track.readyState, 'ended');
  assert.equal(cleaned, true);
  assert.equal(f.outputs().length, 2);
  assert.match(f.messages[0], /source ended/);
});

test('a partial encoder-start failure rolls back all tracks and retains the started source', async () => {
  const f = fixture((recorder, index) => { recorder.failStart = index === 1; });
  const a = media(); const b = media();
  assert.equal(await f.session.start(async owner => [a, b].map((input, index) => ({
    label: `Screen ${index}`, kind: 'screen', stream: owner.ownStream(input.stream),
  })), 'best'), false);
  assert.equal(f.outputs().length, 1);
  assert.equal(f.outputs()[0].partial, true);
  assert.equal(a.track.readyState, 'ended'); assert.equal(b.track.readyState, 'ended');
});

test('recorder errors finalize a marked partial file and unlock the session', async () => {
  const f = fixture();
  await f.session.start(async owner => [{ label: 'Mic', kind: 'mic', stream: owner.ownStream(media(true).stream) }], 'low');
  f.recorders[0].onerror?.();
  await f.session.stop();
  assert.equal(f.outputs()[0].partial, true);
  assert.equal(f.session.state, 'idle');
  assert.equal(f.recorders[0].options.audioBitsPerSecond, 64_000);
  assert.equal(f.byteCounts.at(-1), 10);
});

test('a stalled finalization is bounded and preserves received data', async () => {
  const f = fixture(recorder => { recorder.hangStop = true; });
  await record(f);
  assert.equal(await f.outputs()[0].blob.text(), 'first');
  assert.equal(f.outputs()[0].partial, true);
  assert.equal(f.session.state, 'idle');
  assert.match(f.messages.at(-1)!, /did not finish/);
});

test('dispose revokes outputs and does not publish late recordings', async () => {
  const f = fixture();
  await record(f);
  await f.session.start(async owner => [{ label: 'Mic', kind: 'mic', stream: owner.ownStream(media(true).stream) }], 'best');
  f.session.dispose();
  await f.session.stop();
  assert.equal(f.session.recordings.length, 0);
  assert.equal(f.revoked.length, 1);
});

test('format follows actual recorder MIME, and audio presets match the UI', async () => {
  const f = fixture();
  await record(f);
  assert.equal(f.outputs()[0].blob.type, 'video/mp4');
  assert.match(f.outputs()[0].filename, /\.mp4$/);
  const date = new Date('2026-09-22T12:34:56Z');
  assert.match(recordingFilename('mic', 'audio/mp4;codecs=mp4a', date, '2'), /\.m4a$/);
  assert.match(recordingFilename('mic', 'audio/webm;codecs=opus', date, '2'), /\.webm$/);
  for (const [quality, rate] of [['low', 64_000], ['mid', 128_000], ['best', 256_000]] as const) {
    assert.equal(recorderOptions(false, true, quality, () => false).audioBitsPerSecond, rate);
    assert.equal(recorderOptions(false, true, quality, () => false).mimeType, undefined);
    assert.equal(recorderOptions(false, true, quality, () => false).videoBitsPerSecond, undefined);
  }
});

test('video-only MIME negotiation excludes audio codecs so Firefox can finalize', () => {
  const advertised = new Set(['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8']);
  const supports = (mime: string) => advertised.has(mime);
  const videoOnly = recorderOptions(true, false, 'best', supports);
  assert.equal(videoOnly.mimeType, 'video/webm;codecs=vp8');
  assert.equal(videoOnly.audioBitsPerSecond, undefined);
  const withAudio = recorderOptions(true, true, 'best', supports);
  assert.equal(withAudio.mimeType, 'video/webm;codecs=vp8,opus');
  assert.equal(withAudio.audioBitsPerSecond, 256_000);
});

test('Apple mobile format preference selects native H.264/AAC containers with a supported fallback', () => {
  const supports = () => true;
  assert.equal(recorderOptions(true, true, 'best', supports, true).mimeType, 'video/mp4;codecs=avc1,mp4a.40.2');
  assert.equal(recorderOptions(true, false, 'best', supports, true).mimeType, 'video/mp4;codecs=avc1');
  assert.equal(recorderOptions(false, true, 'best', supports, true).mimeType, 'audio/mp4;codecs=mp4a.40.2');
  assert.equal(recorderOptions(true, true, 'best', mime => mime === 'video/webm', true).mimeType, 'video/webm');
  assert.equal(recorderOptions(true, true, 'best', supports).mimeType, 'video/webm;codecs=vp9,opus');
});
