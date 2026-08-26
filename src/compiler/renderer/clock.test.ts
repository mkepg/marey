import { describe, it, expect } from "vitest";
import {
  TICK_HZ,
  TICK_MS,
  MAX_CATCHUP_TICKS,
  secondsToTicks,
  LiveDriver,
} from "./clock";

describe("secondsToTicks", () => {
  it("converts whole seconds at the tick rate", () => {
    expect(secondsToTicks(1)).toBe(TICK_HZ);
    expect(secondsToTicks(1.5)).toBe(180);
    expect(secondsToTicks(4)).toBe(480);
  });

  it("never returns zero, so progress math cannot divide by zero", () => {
    expect(secondsToTicks(0)).toBe(1);
    expect(secondsToTicks(0.0001)).toBe(1);
  });
});

describe("LiveDriver", () => {
  it("advances two ticks for a 60fps frame at 120Hz", () => {
    const d = new LiveDriver();
    expect(d.pump(1000 / 60)).toBe(2);
  });

  it("returns no ticks when less than one tick of time has passed", () => {
    const d = new LiveDriver();
    expect(d.pump(4)).toBe(0);
  });

  it("carries the remainder across calls instead of discarding it", () => {
    const d = new LiveDriver();
    // Two 5ms frames is 10ms, which is one tick (8.33ms) plus a remainder.
    expect(d.pump(5)).toBe(0);
    expect(d.pump(5)).toBe(1);
  });

  it("reports alpha as the fraction of a tick left over", () => {
    const d = new LiveDriver();
    d.pump(TICK_MS * 1.5);
    expect(d.alpha).toBeCloseTo(0.5, 5);
  });

  it("clamps a long hitch instead of spiralling", () => {
    const d = new LiveDriver();
    expect(d.pump(10_000)).toBe(MAX_CATCHUP_TICKS);
  });

  it("does not accumulate a backlog after clamping", () => {
    const d = new LiveDriver();
    d.pump(10_000);
    // The dropped time must not reappear as a burst on the next frame.
    expect(d.pump(1000 / 60)).toBe(2);
  });

  it("is exactly reproducible for the same sequence of frame deltas", () => {
    // The core guarantee: identical input produces an identical tick sequence.
    const deltas = [3, 21, 7, 14, 5, 16, 16, 33, 8, 9];

    const runOnce = () => {
      const d = new LiveDriver();
      const out: number[] = [];
      for (let i = 0; i < 200; i++) out.push(d.pump(deltas[i % deltas.length]));
      return out;
    };

    expect(runOnce()).toEqual(runOnce());
  });

  it("yields the same tick count however the same total time is chopped up", () => {
    // A dropped or uneven frame must not change how far the simulation got.
    //
    // Note this is "within one tick", not bit-identical: floating-point
    // addition is not associative, so a different summation order can land a
    // hair either side of a tick boundary. That residue is why cross-machine
    // reproducibility is not promised in the spec.
    const even = new LiveDriver();
    let evenTicks = 0;
    for (let i = 0; i < 600; i++) evenTicks += even.pump(10);

    const ragged = new LiveDriver();
    let raggedTicks = 0;
    const pattern = [3, 21, 7, 14, 5];
    // 120 repetitions of a 50ms cycle is the same 6000ms total.
    for (let i = 0; i < 120; i++) {
      for (const ms of pattern) raggedTicks += ragged.pump(ms);
    }

    expect(Math.abs(raggedTicks - evenTicks)).toBeLessThanOrEqual(1);
    expect(evenTicks).toBeGreaterThanOrEqual(719);
    expect(evenTicks).toBeLessThanOrEqual(720);
  });

  it("clears accumulated time and alpha on reset", () => {
    const d = new LiveDriver();
    d.pump(5);
    expect(d.alpha).toBeGreaterThan(0);

    d.reset();
    expect(d.alpha).toBe(0);
    // The 5ms carried before reset must not contribute to the next tick.
    expect(d.pump(5)).toBe(0);
  });

  it("ignores a non-finite delta rather than corrupting the accumulator", () => {
    const d = new LiveDriver();
    d.pump(Number.NaN);
    expect(d.alpha).toBe(0);
    // The driver must still work normally afterward.
    expect(d.pump(1000 / 60)).toBe(2);
  });

  it("ignores a negative delta", () => {
    const d = new LiveDriver();
    d.pump(5);
    d.pump(-1000);
    // The -1000 must not have rolled the accumulator backwards.
    expect(d.pump(5)).toBe(1);
  });

  it("absorbs a full PixiJS ticker frame without dropping simulation time", () => {
    // PixiJS clamps its own deltaMS to 100ms (Ticker._maxElapsedMS). If our
    // catch-up ceiling were lower than that, a sustained low frame rate would
    // silently drop time every frame and run the scene in slow motion.
    const PIXI_MAX_ELAPSED_MS = 100;
    const d = new LiveDriver();

    expect(d.pump(PIXI_MAX_ELAPSED_MS)).toBe(Math.round(PIXI_MAX_ELAPSED_MS / TICK_MS));
    // Nothing left over means no time was discarded.
    expect(d.alpha).toBeCloseTo(0, 5);
  });
});
