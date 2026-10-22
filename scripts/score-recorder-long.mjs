import { readFileSync, writeFileSync } from 'node:fs';
const root = 'output/transcription-benchmark/';
const session = JSON.parse(readFileSync(root + 'integrated-long-transcript.json'));
const metrics = JSON.parse(readFileSync(root + 'integrated-long-measurements.json'));
const canonical = text => text.toLowerCase().replace(/\b9[.:]?30\b/g, 'nine thirty').replace(/\b12\b/g, 'twelve').replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
const reference = canonical('Today we are testing local transcription in the screen recorder. The meeting starts at nine thirty on Friday. Please save twelve recordings and send the notes to Thomas. Our next step is to compare the tiny model with the base model.');
// The fixture loops a 12.701375s source. End scoring at its last complete phrase;
// report any partial next phrase separately rather than treating Stop as an error.
const cutoff = session.text.toLowerCase().lastIndexOf('with the base model.');
if (cutoff < 0) throw new Error('Final complete reference ending missing.');
const completed = session.text.slice(0, cutoff + 'with the base model.'.length);
const repetitions = Math.floor((metrics.plannedSeconds - .2) / 12.701375);
const expected = Array.from({ length: repetitions }, () => reference).flat();
const actual = canonical(completed);
let row = Uint16Array.from({ length: actual.length + 1 }, (_, i) => i);
for (let i = 1; i <= expected.length; i++) {
  const next = new Uint16Array(actual.length + 1); next[0] = i;
  for (let j = 1; j <= actual.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + Number(expected[i - 1] !== actual[j - 1]));
  row = next;
}
const rss = readFileSync(root + 'integrated-long-rss.jsonl', 'utf8').trim().split('\n').map(line => JSON.parse(line));
const heaps = metrics.samples.map(sample => sample.heap).filter(Number.isFinite);
const score = { repetitions, expectedWords: expected.length, recognizedWords: actual.length, edits: row[actual.length], wordErrorRate: row[actual.length] / expected.length,
  partialEnding: session.text.slice(completed.length), reviews: session.blocks.filter(block => block.boundaryReview || block.recognitionReview).length,
  browserProcessRSS: { firstKiB: rss[0].rssKiB, minKiB: Math.min(...rss.map(sample => sample.rssKiB)), maxKiB: Math.max(...rss.map(sample => sample.rssKiB)), lastKiB: rss.at(-1).rssKiB, samples: rss.length, note: 'Sum of test browser process RSS; shared pages may be counted more than once. Not a unique RAM or worker-only measurement.' },
  mainThreadHeap: { minBytes: Math.min(...heaps), maxBytes: Math.max(...heaps), lastBytes: heaps.at(-1), excludesWorkerWASMAndMedia: true }, stats: session.stats };
writeFileSync(root + 'integrated-long-score.json', JSON.stringify(score, null, 2) + '\n');
console.log(JSON.stringify(score));
