import test from 'node:test';
import assert from 'node:assert/strict';
import { TranscriptAssembler } from '../src/transcription/assembler.ts';
import { TranscriptionController, sessionExportText, sessionText } from '../src/transcription/controller.ts';
import type { CaptureTap, TapCallbacks } from '../src/transcription/capture.ts';
import type { Request, Response, Segment, Word } from '../src/transcription/protocol.ts';

const segment = (id: number, start = 0, final = false): Segment => ({ id, start, end: start + 12, utterance: 1, overlap: start ? 4 : 0, final, audio: new Float32Array(192000) });
const words = (start: number, count = 24): Word[] => Array.from({ length: count }, (_, i) => ({ text: ` word${start * 2 + i}`, start: i / 2, end: (i + 1) / 2 }));

test('three hours of continuous speech retain every word with a bounded revisable tail', () => {
  const assembler = new TranscriptAssembler();
  for (let start = 0; start <= 10784; start += 8) assembler.add(segment(start + 1, start), '', words(start), 1);
  assembler.finish();
  const expected = Array.from({ length: 21592 }, (_, i) => `word${i}`).join(' ');
  assert.equal(assembler.blocks.map(block => block.text).join('').trim(), expected);
  assert.ok(assembler.maxWorkingWords <= 24);
  assert.ok(assembler.blocks.length < 250);
  assert.equal(assembler.draft, undefined);
});

test('archiving preserves repeated utterances, punctuation and flagged empty overlaps', () => {
  const assembler = new TranscriptAssembler();
  const phrase: Word[] = [{ text: ' Meet at 9', start: 0, end: 1 }, { text: '.30.', start: 1, end: 2 }];
  assembler.add({ ...segment(1), final: true }, '', phrase, 1);
  assembler.add({ ...segment(2, 4), utterance: 2, overlap: 0 }, '', phrase, 1);
  assembler.add({ ...segment(3, 8), utterance: 2 }, '', [], 1);
  assembler.finish();
  assert.equal(assembler.blocks.map(block => block.text).join('').trim(), 'Meet at 9.30.\n\nMeet at 9.30.');
  assert.ok(assembler.blocks.at(-1)?.boundaryReview);
});

test('exporting an active draft preserves numeric token joins and paragraph breaks', () => {
  const assembler = new TranscriptAssembler();
  assembler.add(segment(1), '', [{ text: ' At 9', start: 0, end: 1 }, { text: '.30', start: 8, end: 9 }], 1);
  assembler.add(segment(2, 8), '', [{ text: '.30', start: 0, end: 1 }, { text: ' Friday.', start: 1, end: 2 }], 1);
  assert.equal((assembler.blocks.map(block => block.text).join('') + assembler.draftText).trim(), 'At 9.30 Friday.');
  assembler.finish();
  assembler.add({ ...segment(3, 20), utterance: 2, overlap: 0 }, '', [{ text: ' Again.', start: 0, end: 1 }], 1);
  assert.equal((assembler.blocks.map(block => block.text).join('') + assembler.draftText).trim(), 'At 9.30 Friday.\n\nAgain.');
});

class FakeWorker {
  onmessage: ((event: MessageEvent<Response>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  sent: Request[] = [];
  terminated = false;
  failSend = false;
  postMessage(message: Request) { if (this.failSend) throw new Error('worker unavailable'); this.sent.push(message); }
  terminate() { this.terminated = true; }
  reply(data: Response) { this.onmessage?.({ data } as MessageEvent<Response>); }
  result(text: string) {
    const job = this.sent.at(-1)!;
    assert.equal(job.type, 'transcribe');
    if (job.type !== 'transcribe') return;
    this.reply({ type: 'result', id: job.id, text, words: [{ text: ` ${text}`, start: 0, end: 1 }], ms: 10, retried: false, review: false });
  }
}
class FakeTap implements CaptureTap {
  callbacks: TapCallbacks; active = false; aborted = false; resumes = 0;
  constructor(callbacks: TapCallbacks) { this.callbacks = callbacks; }
  async attach() { this.callbacks.rate(48000); }
  activate() { this.active = true; }
  resume() { this.resumes++; }
  abort() { this.aborted = true; }
  async finish() { this.active = false; }
  emit(id: number) { this.callbacks.segment(segment(id, 0, true)); }
}
function setup() {
  const worker = new FakeWorker(), taps: FakeTap[] = [];
  const controller = new TranscriptionController({ worker: () => worker, tap: callbacks => { const tap = new FakeTap(callbacks); taps.push(tap); return tap; } });
  controller.load(); worker.reply({ type: 'ready', ms: 1 });
  return { controller, worker, taps };
}

test('late results belong to their recording session; cancelled acquisition leaves no transcript', async () => {
  const { controller, worker, taps } = setup();
  try {
    const cancelled = controller.beginCapture('cancelled', 'mic')!;
    await cancelled.finish(); assert.equal(controller.snapshot().sessions.length, 0);
    const first = controller.beginCapture('first', 'mic')!; controller.activateCapture();
    taps[1].emit(1); await first.finish();
    const second = controller.beginCapture('second', 'mic')!; controller.activateCapture(); taps[2].emit(1);
    worker.result('First session'); worker.result('Second session'); await second.finish();
    const sessions = controller.snapshot().sessions;
    assert.deepEqual(sessions.map(sessionText), ['First session', 'Second session']);
    assert.ok(sessions.every(session => session.finished && !session.incomplete));
    assert.equal(new Set(worker.sent.filter(job => job.type === 'transcribe').map(job => job.id)).size, 2);
  } finally { controller.dispose(); }
});

test('overload ends only the optional tap, drains accepted words and allows the next recording', async () => {
  const { controller, worker, taps } = setup();
  try {
    assert.equal(controller.snapshot().canStartCapture, true);
    const first = controller.beginCapture('first', 'mic')!; controller.activateCapture();
    assert.equal(controller.snapshot().canStartCapture, false);
    for (let id = 1; id <= 4; id++) taps[0].emit(id);
    assert.equal(controller.snapshot().queueDepth, 3); assert.ok(taps[0].aborted);
    assert.equal(controller.snapshot().canStartCapture, false);
    worker.result('one'); worker.result('two'); worker.result('three'); await first.finish();
    const session = controller.snapshot().sessions[0];
    assert.ok(session.incomplete); assert.equal(sessionText(session), 'one\n\ntwo\n\nthree'); assert.ok(session.finished);
    assert.equal(controller.snapshot().canStartCapture, true);
    assert.ok(controller.beginCapture('next', 'mic'));
  } finally { controller.dispose(); }
});

test('unloading preserves completed text and ignores terminated worker responses', async () => {
  const { controller, worker, taps } = setup();
  try {
    const capture = controller.beginCapture('one', 'mic')!; controller.activateCapture();
    taps[0].emit(1); worker.result('kept'); taps[0].emit(2);
    controller.unload(); worker.result('stale'); await capture.finish();
    assert.equal(sessionText(controller.snapshot().sessions[0]), 'kept');
    assert.ok(controller.snapshot().sessions[0].incomplete);
    assert.ok(worker.terminated && taps[0].aborted);
    assert.equal(controller.snapshot().queueDepth, 0);
  } finally { controller.dispose(); }
});

test('turning transcription off drains accepted text and keeps the model available', async () => {
  const { controller, worker, taps } = setup();
  try {
    const capture = controller.beginCapture('first', 'mic')!; controller.activateCapture();
    taps[0].emit(1); controller.stopCapture();
    assert.ok(taps[0].aborted); assert.equal(worker.terminated, false);
    assert.equal(controller.snapshot().modelStatus, 'ready');
    worker.result('kept'); await capture.finish();
    assert.equal(sessionText(controller.snapshot().sessions[0]), 'kept');
    assert.ok(controller.snapshot().sessions[0].finished && controller.snapshot().sessions[0].incomplete);
    assert.ok(controller.beginCapture('next', 'mic'));
    assert.equal(worker.sent.filter(message => message.type === 'load').length, 1);
  } finally { controller.dispose(); }
});

test('an unavailable model never creates a microphone tap', () => {
  let taps = 0;
  const controller = new TranscriptionController({ tap: () => { taps++; throw new Error('unexpected'); } });
  assert.equal(controller.beginCapture('one', 'mic'), undefined);
  assert.equal(taps, 0); assert.equal(controller.snapshot().sessions.length, 0);
  controller.dispose();
});

test('unexpected results leave the active job intact, and a failed next send preserves accepted text', async () => {
  const { controller, worker, taps } = setup();
  try {
    const capture = controller.beginCapture('one', 'mic')!; controller.activateCapture();
    taps[0].emit(1); taps[0].emit(2);
    worker.reply({ type: 'result', id: 999, text: 'stale', words: [], ms: 1, retried: false, review: false });
    assert.equal(controller.snapshot().queueDepth, 2);
    worker.failSend = true; worker.result('accepted'); await capture.finish();
    const session = controller.snapshot().sessions[0];
    assert.equal(sessionText(session), 'accepted'); assert.ok(session.finished && session.incomplete);
    assert.equal(controller.snapshot().modelStatus, 'error');
  } finally { controller.dispose(); }
});

test('tap failure before activation does not leave a phantom transcript', async () => {
  const { controller, taps } = setup();
  try {
    const capture = controller.beginCapture('one', 'mic')!;
    taps[0].callbacks.failure('Audio unavailable. Recording continues.');
    controller.activateCapture(); await capture.finish();
    assert.equal(controller.snapshot().sessions.length, 0);
    assert.ok(taps[0].aborted);
  } finally { controller.dispose(); }
});

test('model and inference timeouts release only engine resources and preserve text', async () => {
  const worker = new FakeWorker(), taps: FakeTap[] = [];
  const controller = new TranscriptionController({ worker: () => worker, loadTimeout: 10, jobTimeout: 10, tap: callbacks => { const tap = new FakeTap(callbacks); taps.push(tap); return tap; } });
  try {
    controller.load(); await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(controller.snapshot().modelStatus, 'error');
    controller.load(); worker.reply({ type: 'ready', ms: 1 });
    const capture = controller.beginCapture('one', 'mic')!; controller.activateCapture();
    taps[0].emit(1); worker.result('kept'); taps[0].emit(2);
    await new Promise(resolve => setTimeout(resolve, 25)); await capture.finish();
    const session = controller.snapshot().sessions[0];
    assert.equal(sessionText(session), 'kept'); assert.ok(session.finished && session.incomplete && taps[0].aborted);
  } finally { controller.dispose(); }
});

test('an interruption preserves the active session/model, exposes resume and retains marked gaps in exports', async () => {
  const { controller, worker, taps } = setup();
  try {
    const capture = controller.beginCapture('phone', 'mic')!; controller.activateCapture();
    taps[0].emit(1); worker.result('Before lock');
    taps[0].callbacks.interruption!({ start: 1, reason: 'Audio interrupted' }, false);
    const paused = controller.snapshot();
    assert.equal(paused.modelStatus, 'ready'); assert.equal(paused.canStartCapture, false);
    assert.ok(paused.sessions[0].capturing && paused.sessions[0].paused);
    assert.equal(taps[0].aborted, false); assert.equal(worker.terminated, false);
    controller.resumeCapture(); assert.equal(taps[0].resumes, 1);
    taps[0].callbacks.interruption!({ start: 1, end: 31, reason: 'Audio interrupted' }, true);
    taps[0].emit(2); worker.result('After unlock'); await capture.finish();
    const session = controller.snapshot().sessions[0];
    assert.equal(sessionText(session), 'Before lock\n\nAfter unlock');
    assert.equal(sessionExportText(session), '[Possible missing speech: 0:01 to 0:31.]\n\nBefore lock\n\nAfter unlock');
    assert.match(sessionExportText(paused.sessions[0]), /0:01 onward/);
    assert.equal(session.paused, false); assert.ok(session.finished && session.incomplete);
    assert.deepEqual(session.interruptions, [{ start: 1, end: 31, reason: 'Audio interrupted' }]);
    assert.equal(paused.sessions[0].interruptions[0].end, undefined, 'Published snapshots must not mutate');
    assert.equal(controller.snapshot().modelStatus, 'ready');
  } finally { controller.dispose(); }
});

test('stale interruption callbacks and wrappers cannot pause or stop the next capture', async () => {
  const { controller, taps } = setup();
  try {
    const first = controller.beginCapture('first', 'mic')!; controller.activateCapture(); await first.finish();
    controller.beginCapture('second', 'mic'); controller.activateCapture();
    taps[0].callbacks.interruption!({ start: 1, reason: 'late' }, false); first.abort(); first.activate(); first.resume?.();
    assert.equal(controller.snapshot().sessions[1].paused, false);
    assert.equal(controller.snapshot().sessions[1].capturing, true); assert.equal(taps[1].aborted, false);
    assert.equal(controller.snapshot().sessions[0].interruptions.length, 0);
  } finally { controller.dispose(); }
});

test('backgrounding during model preparation or inference does not expire the worker on unlock', async () => {
  class Visibility extends EventTarget { hidden = false; change(hidden: boolean) { this.hidden = hidden; this.dispatchEvent(new Event('visibilitychange')); } }
  const visibility = new Visibility(), worker = new FakeWorker(), taps: FakeTap[] = [];
  const controller = new TranscriptionController({ visibility, worker: () => worker, loadTimeout: 25, jobTimeout: 25,
    tap: callbacks => { const tap = new FakeTap(callbacks); taps.push(tap); return tap; } });
  try {
    controller.load(); visibility.change(true); await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(controller.snapshot().modelStatus, 'loading'); assert.equal(worker.terminated, false);
    worker.reply({ type: 'ready', ms: 1 }); visibility.change(false);
    const capture = controller.beginCapture('phone', 'mic')!; controller.activateCapture();
    taps[0].emit(1); visibility.change(true); await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(controller.snapshot().modelStatus, 'ready'); assert.equal(controller.snapshot().queueDepth, 1);
    visibility.change(false); worker.result('Preserved result'); await capture.finish();
    assert.equal(sessionText(controller.snapshot().sessions[0]), 'Preserved result');
    assert.equal(controller.snapshot().sessions[0].incomplete, ''); assert.equal(worker.terminated, false);
  } finally { controller.dispose(); }
});
