/**
 * Places frames by `FrameSnapshot.index`, never by arrival order (5C ruling
 * T4-R2: keying by arrival let a reversed or swapped frame order go unseen).
 * `main.ts`'s export driver (Task 7) feeds it each frame as the routed
 * origin receives its `POST`, and reads back every frame that is now
 * contiguous with the ones already handed on, in order.
 */
export class FrameAssembler {
  private readonly frameCount: number;
  private readonly pending = new Map<number, Uint8Array>();
  private nextDue = 0;

  constructor(frameCount: number) {
    this.frameCount = frameCount;
  }

  /** Store frame `index`; return every frame now ready, in order, starting from the next one due. */
  add(index: number, bytes: Uint8Array): Array<{ index: number; bytes: Uint8Array }> {
    if (index < 0 || index >= this.frameCount) {
      throw new Error(`[export] frame ${index} is outside 0..${this.frameCount - 1}`);
    }
    // A frame already handed on (index < nextDue) or still held pending
    // (already in the map) has arrived before: either is a duplicate, not a
    // legitimate re-delivery.
    if (index < this.nextDue || this.pending.has(index)) {
      throw new Error(`[export] frame ${index} arrived twice`);
    }
    this.pending.set(index, bytes);

    const ready: Array<{ index: number; bytes: Uint8Array }> = [];
    while (this.pending.has(this.nextDue)) {
      const due = this.nextDue;
      const dueBytes = this.pending.get(due);
      if (dueBytes === undefined) break; // unreachable: `has` just returned true
      ready.push({ index: due, bytes: dueBytes });
      this.pending.delete(due);
      this.nextDue++;
    }
    return ready;
  }

  /** Throw unless every frame has been handed on. */
  finish(): void {
    if (this.nextDue < this.frameCount) {
      throw new Error(`[export] frame ${this.nextDue} never arrived`);
    }
  }
}
