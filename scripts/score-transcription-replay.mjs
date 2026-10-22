import { readFileSync, writeFileSync } from 'node:fs';
import { reconcile } from '../src/transcription/reconcile.ts';

const label = process.argv[2];
if (!/^[a-z0-9-]+$/.test(label || '')) throw new Error('Pass a saved generated test label.');
const folder = new URL('../output/transcription-benchmark/', import.meta.url);
const replay = JSON.parse(readFileSync(new URL(`replay-${label}.json`, folder), 'utf8'));
if (replay.baseline.metrics.segments.length !== 1) throw new Error('This reference fixture expects one continuous utterance.');
let current;
for (const result of replay.results) {
  const segment = replay.baseline.metrics.windows.find(window => window.id === result.id);
  current = reconcile(current, { ...segment, utterance: 1 }, result.text, result.words, result.ms);
}
const canonical = text => text.toLowerCase()
  .replace(/\b9[.:]?30\b/g, 'nine thirty').replace(/\b12\b/g, 'twelve')
  .replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/);
const sentence = 'Today we are testing local transcription in the screen recorder. The meeting starts at nine thirty on Friday. Please save twelve recordings and send the notes to Thomas. Our next step is to compare the tiny model with the base model.';
const expected = canonical(Array(replay.baseline.speechRepetitions).fill(sentence).join(' '));
const actual = canonical(current.text);
let distance = Array.from({ length: actual.length + 1 }, (_, i) => i);
for (let i = 1; i <= expected.length; i++) {
  const next = [i];
  for (let j = 1; j <= actual.length; j++) {
    next[j] = Math.min(distance[j] + 1, next[j - 1] + 1,
      distance[j - 1] + Number(expected[i - 1] !== actual[j - 1]));
  }
  distance = next;
}
const summary = {
  label, words: actual.length, expected: expected.length, edits: distance.at(-1),
  wer: distance.at(-1) / expected.length,
  retried: replay.results.filter(result => result.retried).map(result => result.id),
  review: replay.results.filter(result => result.review).map(result => result.id),
  boundaryReview: current.boundaryReview,
};
writeFileSync(new URL(`replay-${label}-score.json`, folder), JSON.stringify({ ...summary, text: current.text, transcript: current }, null, 2) + '\n');
console.log(JSON.stringify(summary));
