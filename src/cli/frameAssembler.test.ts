import { describe, it, expect } from "vitest";
import { FrameAssembler } from "./frameAssembler";

const b = (n: number) => new Uint8Array([n]);

describe("FrameAssembler", () => {
  it("hands frames on in index order when they arrive in order", () => {
    const a = new FrameAssembler(2);
    expect(a.add(0, b(0)).map((f) => f.index)).toEqual([0]);
    expect(a.add(1, b(1)).map((f) => f.index)).toEqual([1]);
    expect(() => a.finish()).not.toThrow();
  });
  it("holds an early frame until the frames before it arrive (placed by index, not arrival)", () => {
    const a = new FrameAssembler(3);
    expect(a.add(2, b(2))).toEqual([]);
    expect(a.add(0, b(0)).map((f) => f.index)).toEqual([0]);
    expect(a.add(1, b(1)).map((f) => f.index)).toEqual([1, 2]);
  });
  it("refuses a duplicate", () => {
    const a = new FrameAssembler(2);
    a.add(0, b(0));
    expect(() => a.add(0, b(9))).toThrow("frame 0 arrived twice");
  });
  it("refuses an index outside the plan", () => {
    expect(() => new FrameAssembler(2).add(2, b(2))).toThrow("frame 2 is outside 0..1");
  });
  it("refuses to finish with a gap, naming the first missing frame", () => {
    const a = new FrameAssembler(3);
    a.add(0, b(0));
    a.add(2, b(2));
    expect(() => a.finish()).toThrow("frame 1 never arrived");
  });
});
