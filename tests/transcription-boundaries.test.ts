import test from 'node:test';
import assert from 'node:assert/strict';
import { Segmenter, SAMPLE_RATE } from '../src/experiments/transcription/audio.ts';
import { reconcile } from '../src/experiments/transcription/reconcile.ts';
import type { Segment, Word } from '../src/experiments/transcription/protocol.ts';

const segment = (start = 0, end = 8, final = false): Segment => ({ id: start ? 2 : 1, utterance: 1, start, end, overlap: start ? 3 : 0, final, wordTimings: true, audio: new Float32Array(0) });
const words = (text: string, start: number, step = 0.3): Word[] => text.split(' ').map((text, i) => ({ text: ` ${text}`, start: start + i * step, end: start + (i + 1) * step }));

test('overlap recovers an omitted ending and replaces a misrecognized trailing word', () => {
  const first = reconcile(undefined, segment(), '', words('Please save twelve recordings and', 5), 100);
  const next = reconcile(first, segment(5, 13, true), '', words('Please save twelve recordings and send the notes to Thomas', 0), 100);
  assert.equal(next.text, 'Please save twelve recordings and send the notes to Thomas');
  assert.equal(next.revisions, 2); assert.equal(next.final, true); assert.equal(next.boundaryReview, false);
  const wrong = { ...first, words: [...first.words, { text: ' some', start: 7.5, end: 7.8 }] };
  assert.equal(reconcile(wrong, segment(5, 13, true), '', words('Please save twelve recordings and send the notes to Thomas', 0), 100).text, next.text);
});

test('time-aligned overlap preserves intentional repeated phrases and repeated words', () => {
  const prefix = words('we need to save files', 0);
  const repeated = words('we need to save files we need to save files', 5.1);
  const first = reconcile(undefined, segment(), '', [...prefix, ...repeated.slice(0, 7)], 100);
  const next = reconcile(first, segment(5, 14, true), '', words('we need to save files we need to save files', 0.1), 100);
  assert.equal(next.text, 'we need to save files we need to save files we need to save files');
  const yes = reconcile(undefined, segment(), '', words('yes yes yes yes', 5.1), 100);
  assert.equal(reconcile(yes, segment(5, 14, true), '', words('yes yes yes yes yes', 0.1), 100).text, 'yes yes yes yes yes');
});

test('uncertain/empty overlap is flagged; a separate utterance is never deduplicated', () => {
  const first = reconcile(undefined, segment(), '', words('keep these original words', 0), 100);
  const empty = reconcile(first, segment(5, 13, true), '', [], 100);
  assert.equal(empty.text, first.text); assert.equal(empty.boundaryReview, true);
  const uncertain = reconcile(first, segment(5, 13, true), '', words('new unaligned phrase', 2), 100);
  assert.equal(uncertain.boundaryReview, true);
  const silent = reconcile(undefined, segment(), '', [], 100);
  assert.equal(reconcile(silent, segment(5, 13, true), '', words('recovered words', 0), 100).text, 'recovered words');
  assert.equal(reconcile(first, { ...segment(), utterance: 2, final: true }, '', words('keep these original words', 0), 100).text, first.text);
});

test('continuous speech keeps exact PCM overlap, bounded windows, and a final tail on Stop', () => {
  const output: Segment[] = [];
  const source = Float32Array.from({ length: SAMPLE_RATE * 17 }, (_, i) => 0.1 + i / 1e7);
  const segmenter = new Segmenter(item => output.push(item));
  for (let offset = 0; offset < source.length; offset += 2048) segmenter.push(source.subarray(offset, offset + 2048));
  segmenter.flush();
  assert.equal(output.length, 3); assert.equal(output[0].final, false); assert.equal(output[2].final, true);
  for (let i = 1; i < output.length; i++) {
    assert.ok(Math.abs(output[i - 1].end - output[i].start - 3) < 1e-6);
    assert.deepEqual(output[i].audio.subarray(0, SAMPLE_RATE * 3), output[i - 1].audio.slice(-SAMPLE_RATE * 3));
    assert.equal(output[i].utterance, 1);
    assert.ok(output[i].audio.length <= SAMPLE_RATE * 8 + 320);
  }
});
