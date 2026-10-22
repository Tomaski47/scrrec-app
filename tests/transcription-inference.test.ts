import test from 'node:test';
import assert from 'node:assert/strict';
import { precedingContext, suspectCoverage, timedWords } from '../src/experiments/transcription/inference.ts';

test('retry context precedes the incoming window without copying its overlap twice', () => {
  const prior = Float32Array.from({ length: 12 * 16_000 }, (_, i) => i);
  assert.deepEqual(precedingContext(prior, 4), prior.subarray(4 * 16_000, 8 * 16_000));
  assert.equal(precedingContext(prior, 0).length, 0, 'A new utterance or file must not inherit earlier speech');
  assert.equal(precedingContext(undefined, 4).length, 0);
});

test('word times remain inside actual audio and preceding context never becomes duplicate text', () => {
  const words = timedWords([
    { text: ' older', timestamp: [0, 2] },
    { text: ' sentence.', timestamp: [2, 4] },
    { text: ' Today', timestamp: [4, 4.5] },
    { text: ' we', timestamp: [4.5, 5] },
    { text: ' record.', timestamp: [15, 28.12] },
  ], 16, 4);
  assert.deepEqual(words, [
    { text: ' Today', start: 0, end: 0.5 },
    { text: ' we', start: 0.5, end: 1 },
    { text: ' record.', start: 11, end: 12 },
  ]);
  assert.equal(suspectCoverage([{ text: ' The', start: 2.68, end: 12 }], 12), true);
  assert.equal(suspectCoverage(words, 12), false);
  assert.equal(suspectCoverage([{ text: ' Yes.', start: 0, end: 0.4 }], 0.7), false, 'A short answer is not a sparse long window');
});
