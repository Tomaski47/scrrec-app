import type { Word } from './protocol.ts';

type Chunk = { text: string; timestamp: [number, number | null] };

/** Whisper may align the final word into its padded 30-second input. Keep
 * reported times inside the actual audio, and remove only the extra context.
 */
export function timedWords(chunks: Chunk[], duration: number, prefixSeconds = 0): Word[] {
  return chunks.map(chunk => ({ text: chunk.text,
    start: Math.max(0, Math.min(duration, chunk.timestamp[0])),
    end: Math.max(0, Math.min(duration, chunk.timestamp[1] ?? duration)),
  })).filter(word => (word.start + word.end) / 2 >= prefixSeconds).map(word => ({ ...word,
    start: Math.max(0, word.start - prefixSeconds), end: Math.max(0, word.end - prefixSeconds),
  }));
}

/** A retry hint, not an accuracy score or a learned speech detector. */
export function suspectCoverage(words: Word[], duration: number): boolean {
  return duration >= 6 && (!words.length || words.length < 3 || words[0].start > 2);
}

/** Up to four seconds immediately before this window, excluding its overlap. */
export function precedingContext(previous: Float32Array | undefined, overlap: number): Float32Array {
  if (!previous || overlap <= 0) return new Float32Array(0);
  const end = Math.max(0, previous.length - Math.round(overlap * 16_000));
  return previous.subarray(Math.max(0, end - 4 * 16_000), end);
}
