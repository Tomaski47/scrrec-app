import { reconcile } from './reconcile.ts';
import type { Segment, Transcript, Word } from './protocol.ts';

export interface TranscriptBlock {
  id: number;
  start: number;
  end: number;
  text: string;
  boundaryReview: boolean;
  recognitionReview: boolean;
}

/** Only the revisable tail goes back through alignment. Older words become
 * timestamped text blocks; continuous speech cannot grow the working draft.
 */
export class TranscriptAssembler {
  private stable: TranscriptBlock[] = [];
  private tail: Transcript | undefined;
  private sequence = 0;
  private paragraphBreak = true;
  maxWorkingWords = 0;

  private commit(words: Word[], boundaryReview: boolean, recognitionReview: boolean) {
    if (!words.length) {
      const last = this.stable.at(-1);
      if (last && !this.paragraphBreak && (boundaryReview || recognitionReview)) this.stable[this.stable.length - 1] = {
        ...last, boundaryReview: last.boundaryReview || boundaryReview, recognitionReview: last.recognitionReview || recognitionReview,
      };
      return;
    }
    const raw = words.map(word => word.text).join('');
    const start = words[0].start, end = words.at(-1)!.end;
    const last = this.stable.at(-1);
    const text = last && this.paragraphBreak ? `\n\n${raw.trimStart()}` : raw;
    if (last && !this.paragraphBreak && end - last.start <= 60 && last.text.length + text.length <= 1200) {
      this.stable[this.stable.length - 1] = { ...last, end, text: last.text + text,
        boundaryReview: last.boundaryReview || boundaryReview, recognitionReview: last.recognitionReview || recognitionReview };
    } else this.stable.push({ id: ++this.sequence, start, end, text, boundaryReview, recognitionReview });
    this.paragraphBreak = false;
  }

  add(segment: Segment, text: string, words: Word[], ms: number, review = false) {
    if (this.tail && this.tail.id !== segment.utterance) this.finish();
    if (this.tail && segment.overlap > 0) {
      // reconcile never edits words before the incoming window's start.
      const cut = this.tail.words.findIndex(word => (word.start + word.end) / 2 >= segment.start);
      const count = cut < 0 ? this.tail.words.length : cut;
      this.commit(this.tail.words.slice(0, count), this.tail.boundaryReview, !!this.tail.recognitionReview);
      const remaining = this.tail.words.slice(count);
      this.tail = { ...this.tail, words: remaining, text: remaining.map(word => word.text).join('').trim(), start: remaining[0]?.start ?? segment.start };
    }
    const next = reconcile(this.tail, segment, text, words, ms);
    next.recognitionReview = !!this.tail?.recognitionReview || review;
    this.tail = next;
    this.maxWorkingWords = Math.max(this.maxWorkingWords, next.words.length);
    if (segment.final) this.finish();
  }

  finish() {
    if (this.tail) this.commit(this.tail.words, this.tail.boundaryReview, !!this.tail.recognitionReview);
    this.tail = undefined;
    this.paragraphBreak = true;
  }

  get blocks(): readonly TranscriptBlock[] { return this.stable; }
  get draft(): Transcript | undefined { return this.tail; }
  get draftText() {
    const raw = this.tail?.words.map(word => word.text).join('') ?? '';
    return raw && this.paragraphBreak && this.stable.length ? `\n\n${raw.trimStart()}` : raw;
  }
  get workingWords() { return this.tail?.words.length ?? 0; }
}
