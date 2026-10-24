export interface Visibility extends EventTarget { readonly hidden: boolean }

/** Browser suspension is not evidence that the speech worker has failed. */
export class ForegroundDeadline {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: { ms: number; expired: () => void } | undefined;
  private visibility: Visibility | undefined;
  constructor(visibility = globalThis.document as Visibility | undefined) {
    this.visibility = visibility;
    visibility?.addEventListener('visibilitychange', this.rearm);
  }
  set(ms: number, expired: () => void) {
    this.pending = { ms, expired }; this.rearm();
  }
  clear() { clearTimeout(this.timer); this.pending = undefined; }
  private rearm = () => {
    clearTimeout(this.timer);
    const pending = this.pending;
    if (!pending || this.visibility?.hidden) return;
    const due = Date.now() + pending.ms;
    this.timer = setTimeout(() => {
      if (this.pending !== pending || this.visibility?.hidden) return;
      // A frozen page may deliver an old timer before its visibility event.
      if (Date.now() - due > 1000) { this.rearm(); return; }
      this.pending = undefined; pending.expired();
    }, pending.ms);
  };
  dispose() { this.clear(); this.visibility?.removeEventListener('visibilitychange', this.rearm); }
}
