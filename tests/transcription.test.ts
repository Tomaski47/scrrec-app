import test from 'node:test';
import assert from 'node:assert/strict';
import { BoundedQueue, Resampler, Segmenter } from '../src/experiments/transcription/audio.ts';

test('streaming resampling is invariant to worklet block boundaries at 44.1 and 48 kHz', () => {
  for (const rate of [44_100, 48_000]) {
    const input = Float32Array.from({ length: rate }, (_, i) => Math.sin(i * 0.03));
    const expected = new Resampler(rate).push(input);
    const resampler = new Resampler(rate);
    const actual: number[] = [];
    for (let offset = 0; offset < input.length; offset += 2048) actual.push(...resampler.push(input.subarray(offset, offset + 2048)));
    assert.equal(actual.length, expected.length);
    actual.forEach((sample, i) => assert.ok(Math.abs(sample - expected[i]) < 0.00001));
  }
});

test('speech timestamps include silence and Stop flushes a short final phrase', () => {
  const segments: Array<{ start: number; end: number }> = [];
  const segmenter = new Segmenter(segment => segments.push({ start: segment.start, end: segment.end }));
  segmenter.push(new Float32Array(32_000));
  segmenter.push(new Float32Array(8000).fill(0.1));
  segmenter.flush();
  assert.deepEqual(segments, [{ start: 1.8, end: 2.5 }]);
  segmenter.push(new Float32Array(16000)); segmenter.flush();
  assert.equal(segments.length, 1, 'Silence must not generate a transcription job');
});

test('transcription overload stops accepting PCM jobs, drains retained jobs and never stops media', () => {
  const sent: number[] = []; let overflow = 0;
  const queue = new BoundedQueue(segment => sent.push(segment.id), () => { overflow++; });
  for (let id = 1; id <= 10; id++) queue.add({ id, utterance: 1, overlap: 0, final: true, start: id, end: id + 1, audio: new Float32Array(16_000) });
  assert.equal(queue.depth, 3); assert.equal(overflow, 1); assert.equal(queue.accepting, false);
  assert.equal(queue.complete(999), undefined);
  for (let id = 1; id <= 3; id++) assert.equal(queue.complete(id)?.id, id);
  assert.deepEqual(sent, [1, 2, 3]); assert.equal(queue.depth, 0);
});
