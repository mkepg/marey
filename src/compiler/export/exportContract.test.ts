import { describe, it, expect } from "vitest";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import { planExport, MAX_EXPORT_FRAMES } from "./exportContract";
import type { IRSceneNode } from "../sceneIR";

function irFor(source: string): IRSceneNode {
  const { ast } = parse(lex(source));
  const { ir, errors } = typeCheck(ast!);
  if (!ir) throw new Error(`fixture did not compile: ${errors.map(e => e.message).join("; ")}`);
  return ir;
}

const FINITE = irFor(`scene { size: (100, 100) duration: 5 }`);
const UNBOUNDED = irFor(`scene { size: (100, 100) }`);

function codes(result: ReturnType<typeof planExport>): string[] {
  return result.ok ? [] : result.diagnostics.map((d) => d.code);
}

describe("planExport · frame counts", () => {
  it.each([
    [24, 5, 120],
    [30, 4, 150],
    [60, 2, 300],
  ])("gives %ifps %i ticks per frame and %i frames for a 5s scene", (fps, ticksPerFrame, frameCount) => {
    const r = planExport(FINITE, { fps });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.ticksPerFrame).toBe(ticksPerFrame);
    expect(r.plan.frameCount).toBe(frameCount);
    expect(r.plan.durationTicks).toBe(600);
  });
});

describe("planExport · diagnostics", () => {
  it("refuses an indefinite scene with no explicit bound", () => {
    expect(codes(planExport(UNBOUNDED, { fps: 30 }))).toContain("EXPORT_UNBOUNDED_SCENE");
  });

  it("accepts an indefinite scene when given an explicit bound", () => {
    const r = planExport(UNBOUNDED, { fps: 30, durationSeconds: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.frameCount).toBe(60);
  });

  it("lets an explicit bound override the scene's own duration", () => {
    const r = planExport(FINITE, { fps: 30, durationSeconds: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.frameCount).toBe(30);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects the explicit bound %p",
    (durationSeconds) => {
      expect(codes(planExport(FINITE, { fps: 30, durationSeconds }))).toContain("EXPORT_INVALID_DURATION");
    },
  );

  it.each([25, 0, -30, 7, 1.5, 240])("rejects %pfps, which does not divide 120", (fps) => {
    expect(codes(planExport(FINITE, { fps }))).toContain("EXPORT_UNSUPPORTED_FPS");
  });

  it("rejects a bound too short to yield a single frame", () => {
    // 1/240s is half a frame at 30fps: secondsToTicks floors at 1 tick, and
    // one tick is less than the four a 30fps frame spans.
    expect(codes(planExport(FINITE, { fps: 30, durationSeconds: 1 / 240 }))).toContain("EXPORT_EMPTY_SEQUENCE");
  });

  it("rejects a request over the frame budget", () => {
    const seconds = (MAX_EXPORT_FRAMES + 1) / 60;
    expect(codes(planExport(FINITE, { fps: 60, durationSeconds: seconds }))).toContain("EXPORT_FRAME_BUDGET");
  });

  it("reports every applicable diagnostic, not only the first", () => {
    const out = codes(planExport(UNBOUNDED, { fps: 25 }));
    expect(out).toContain("EXPORT_UNBOUNDED_SCENE");
    expect(out).toContain("EXPORT_UNSUPPORTED_FPS");
  });
});

// Step 5 (AGENT-LESSONS §2d): both `Math.floor` in `frameCount` and the
// `7_200` value of MAX_EXPORT_FRAMES were flipped to their plausible other
// answer (`Math.round`, `72_000`) and the full suite stayed green in both
// cases before these two tests existed. Each test below is written so that
// flip fails it specifically.
describe("planExport · pinned judgment calls", () => {
  it("floors a fractional frame count instead of rounding up past the scene's end", () => {
    // 119 ticks / 4 ticks-per-frame = 29.75. `floor` gives 29, matching the
    // implementation comment that a duration which is not a whole number of
    // frames truncates rather than sampling past the scene's declared end.
    // `Math.round` would give 30. Flipping `floor` -> `round` left the rest
    // of the suite green, so this test is what makes the choice load-bearing.
    const r = planExport(FINITE, { fps: 30, durationSeconds: 119 / 120 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.frameCount).toBe(29);
  });

  it("accepts exactly MAX_EXPORT_FRAMES and rejects one frame over it", () => {
    // Written with the literal 7_200, not the imported MAX_EXPORT_FRAMES: the
    // "over budget" test above derives its bound from the live constant, so
    // it stays green no matter what the constant's value is and does not pin
    // it. This test is sensitive to which number the ceiling actually is.
    const atBudget = planExport(FINITE, { fps: 60, durationSeconds: 7_200 / 60 });
    expect(atBudget.ok).toBe(true);
    if (atBudget.ok) expect(atBudget.plan.frameCount).toBe(7_200);

    const overBudget = planExport(FINITE, { fps: 60, durationSeconds: 7_201 / 60 });
    expect(codes(overBudget)).toContain("EXPORT_FRAME_BUDGET");
  });
});
