import type { Segment, Transcript, Word } from './protocol.ts';

const normalized = (word: Word) => word.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const center = (word: Word) => (word.start + word.end) / 2;

/** Match monotonic words in the *early* overlap, where both windows have context.
 * Time proximity prevents a later, intentional repetition matching an old phrase.
 * Prefer more anchors, then smaller timing differences; allow ASR edits between.
 */
function anchors(previous: Word[], incoming: Word[], start: number, overlap: number) {
  const reliableEnd = start + overlap / 2;
  const old = previous.map((word, i) => ({ word, i })).filter(({ word }) => center(word) >= start && center(word) <= reliableEnd);
  const next = incoming.map((word, i) => ({ word, i })).filter(({ word }) => center(word) <= reliableEnd);
  type Match = { old: number; next: number; count: number; error: number; singleError: number };
  const matches: Match[] = [];
  for (const a of old) for (const b of next) {
    const error = Math.abs(center(a.word) - center(b.word));
    if (!normalized(a.word) || normalized(a.word) !== normalized(b.word) || error > 0.65) continue;
    let best: Match = { old: a.i, next: b.i, count: 1, error, singleError: error };
    for (const prior of matches) if (prior.old < a.i && prior.next < b.i) {
      const candidate = { ...best, count: prior.count + 1, error: prior.error + error };
      if (candidate.count > best.count || (candidate.count === best.count && candidate.error < best.error)) best = candidate;
    }
    matches.push(best);
  }
  return matches.sort((a, b) => b.count - a.count || a.error - b.error || b.next - a.next)[0];
}

export function reconcile(previous: Transcript | undefined, segment: Segment, text: string, words: Word[], inferenceMs: number): Transcript {
  if (previous?.id !== segment.utterance) previous = undefined;
  const incoming = words.map(word => ({ text: word.text, start: segment.start + word.start, end: segment.start + word.end }));
  let merged = incoming;
  let boundaryReview = previous?.boundaryReview || false;
  if (previous && segment.overlap > 0 && !incoming.length) {
    merged = previous.words; boundaryReview = true;
  } else if (previous && segment.overlap > 0 && !previous.words.length) {
    // The earlier window recognized nothing: do not trim words we can now hear.
    merged = incoming; boundaryReview = true;
  } else if (previous && segment.overlap > 0) {
    const anchor = anchors(previous.words, incoming, segment.start, segment.overlap);
    if (anchor && (anchor.count >= 2 || anchor.singleError <= 0.2)) {
      // Keep the stable prefix, replace the old ending with the better-context
      // next window. This recovers words omitted at the prior window's cut.
      merged = [...previous.words.slice(0, anchor.old + 1), ...incoming.slice(anchor.next + 1)];
    } else {
      // No trustworthy text anchor: keep the temporal join visible for review.
      const join = segment.start + segment.overlap / 2;
      merged = [...previous.words.filter(word => center(word) < join), ...incoming.filter(word => center(word) >= join)];
      boundaryReview = true;
    }
  }
  return {
    id: segment.utterance, start: previous?.start ?? segment.start, end: segment.end,
    text: merged.length ? merged.map(word => word.text).join('').trim() : text,
    words: merged, final: segment.final, revisions: (previous?.revisions || 0) + 1,
    inferenceMs: (previous?.inferenceMs || 0) + inferenceMs, boundaryReview,
  };
}
