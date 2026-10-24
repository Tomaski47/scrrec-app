import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneTap, type CaptureInterruption } from '../src/transcription/capture.ts';
import { ForegroundDeadline } from '../src/transcription/deadline.ts';
import type { Segment } from '../src/transcription/protocol.ts';

class Visibility extends EventTarget {
  hidden = false;
  set(hidden: boolean) { this.hidden = hidden; this.dispatchEvent(new Event('visibilitychange')); }
}
class AudioNodeFake {
  gain = { value: 1 }; disconnected = false;
  connect(node: AudioNodeFake) { return node; }
  disconnect() { this.disconnected = true; }
}
class ContextFake {
  state = 'running'; sampleRate = 48000; resumes = 0; closes = 0; denied = false;
  onstatechange: (() => void) | null = null;
  destination = new AudioNodeFake();
  audioWorklet = { addModule: async () => undefined };
  change(state: string) { this.state = state; this.onstatechange?.(); }
  async resume() {
    this.resumes++;
    if (this.denied) throw new Error('User gesture required');
    this.change('running');
  }
  async close() { this.closes++; this.change('closed'); }
  createGain() { return new AudioNodeFake(); }
  createMediaStreamSource() { return new AudioNodeFake(); }
}
class Track extends EventTarget { muted = false; readyState = 'live'; stops = 0; stop() { this.stops++; } }
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const context = new ContextFake(), visibility = new Visibility(), events = new EventTarget(), track = new Track();
  const segments: Segment[] = [], gaps: Array<{ gap: CaptureInterruption; resumed: boolean }> = [], failures: string[] = [];
  const messages: string[] = [];
  let now = 0;
  const port = { onmessage: null as ((event: { data: unknown }) => void) | null, closed: false,
    close() { this.closed = true; }, postMessage(message: string) {
      messages.push(message);
      if (message === 'flush' && context.state === 'running') queueMicrotask(() => port.onmessage?.({ data: 'flushed' }));
    } };
  const node = Object.assign(new AudioNodeFake(), { port });
  const tap = new MicrophoneTap({ segment: segment => segments.push(segment), failure: message => failures.push(message), rate: () => undefined,
    interruption: (gap, resumed) => gaps.push({ gap, resumed }) }, {
    context: () => context as unknown as AudioContext,
    worklet: () => node as unknown as AudioWorkletNode,
    visibility: visibility as unknown as Document, events: events as unknown as Window, now: () => now,
  });
  const stream = { getAudioTracks: () => [track] } as unknown as MediaStream;
  return { tap, context, visibility, events, track, segments, gaps, failures, messages, port,
    attach: () => tap.attach([stream]), time: (ms: number) => { now = ms; },
    audio: () => port.onmessage?.({ data: new Float32Array(24000).fill(0.1) }) };
}

test('unlock resumes the existing PCM tap, preserves the preceding phrase and leaves a timestamped gap', async () => {
  const s = setup();
  try {
    await s.attach(); s.tap.activate(); s.time(500); s.audio();
    s.visibility.set(true); s.time(1000); s.context.change('interrupted');
    assert.equal(s.context.closes, 0); assert.equal(s.track.stops, 0); assert.deepEqual(s.failures, []);
    assert.equal(s.segments.length, 1, 'The pre-lock final phrase must not be discarded');
    const resumes = s.context.resumes;
    s.time(7000); s.visibility.set(false); await tick();
    assert.ok(s.context.resumes > resumes); assert.equal(s.context.state, 'running');
    assert.equal(s.gaps.length, 1, 'Resume must wait for real PCM before claiming Listening');
    s.audio(); s.time(7500); await s.tap.finish();
    assert.equal(s.gaps.length, 2); assert.equal(s.gaps[1].resumed, true);
    assert.ok(s.gaps[1].gap.end! >= 6.9);
    assert.equal(s.segments.length, 2); assert.equal(s.segments[1].overlap, 0);
    assert.notEqual(s.segments[0].utterance, s.segments[1].utterance);
    assert.ok(s.segments[1].start >= 6.9, 'Later words must not slide backward across the locked interval');
    assert.equal(s.track.stops, 0); assert.equal(s.context.closes, 1);
  } finally { s.tap.abort(); }
});

test('denied automatic resume remains recoverable with a gesture and never stops the microphone', async () => {
  const s = setup();
  try {
    await s.attach(); s.tap.activate(); s.time(500); s.audio();
    s.context.denied = true; s.visibility.set(true); s.context.change('interrupted');
    s.time(5000); s.visibility.set(false); await tick();
    assert.deepEqual(s.failures, []); assert.equal(s.context.closes, 0); assert.equal(s.gaps.length, 1);
    s.context.denied = false; s.tap.resume(); await tick(); s.audio();
    assert.equal(s.gaps.at(-1)?.resumed, true); assert.equal(s.track.stops, 0);
  } finally { s.tap.abort(); }
});

test('stopping while locked closes the gap without claiming recovery, and removes foreground listeners', async () => {
  const s = setup();
  await s.attach(); s.tap.activate(); s.time(500); s.audio();
  s.visibility.set(true); s.context.change('interrupted'); s.time(5500);
  await s.tap.finish();
  assert.equal(s.gaps.at(-1)?.resumed, false); assert.ok(s.gaps.at(-1)!.gap.end! >= 5);
  const resumes = s.context.resumes, gapCount = s.gaps.length;
  s.visibility.set(false); s.events.dispatchEvent(new Event('focus')); s.tap.resume(); s.audio();
  assert.equal(s.context.resumes, resumes); assert.equal(s.gaps.length, gapCount);
  assert.equal(s.context.closes, 1); assert.equal(s.track.stops, 0);
});

test('a running context with stalled PCM is detected on return and only actual audio clears the gap', async () => {
  const s = setup();
  try {
    await s.attach(); s.tap.activate(); s.time(500); s.audio();
    s.time(7000); s.events.dispatchEvent(new Event('pageshow')); await tick();
    assert.equal(s.gaps.length, 1); assert.equal(s.gaps[0].gap.end, undefined);
    s.audio(); assert.equal(s.gaps.length, 2); assert.equal(s.gaps[1].resumed, true);
    assert.equal(s.context.closes, 0);
  } finally { s.tap.abort(); }
});

test('muted input stays paused until audio returns; repeated state events create one gap', async () => {
  const s = setup();
  try {
    await s.attach(); s.tap.activate(); s.time(500); s.audio();
    s.track.muted = true; s.track.dispatchEvent(new Event('mute'));
    s.context.change('interrupted'); s.context.change('suspended'); s.audio();
    assert.equal(s.gaps.length, 1);
    s.track.muted = false; s.time(3000); s.track.dispatchEvent(new Event('unmute')); await tick(); s.audio();
    assert.equal(s.gaps.length, 2); assert.equal(s.gaps[1].resumed, true);
  } finally { s.tap.abort(); }
});

test('speech deadlines pause while hidden, restart on return and still expire for foreground failures', async () => {
  const visibility = new Visibility(), deadline = new ForegroundDeadline(visibility);
  let failures = 0;
  try {
    deadline.set(25, () => failures++); visibility.set(true);
    await new Promise(resolve => setTimeout(resolve, 50)); assert.equal(failures, 0);
    visibility.set(false); assert.equal(failures, 0);
    await new Promise(resolve => setTimeout(resolve, 50)); assert.equal(failures, 1);
    deadline.set(25, () => failures++); deadline.clear(); visibility.set(true); visibility.set(false);
    await new Promise(resolve => setTimeout(resolve, 50)); assert.equal(failures, 1);
  } finally { deadline.dispose(); }
});
