# Phase 6C — Smooth Handoff Implementation Plan

**Goal:** Make an animation hand off to physics without a change of pace, in
exported frames and in the live preview.

**Architecture:** The curves move into a pure module, `easing.ts`, which
gains the four reshaped handoff curves. The runtime hands off the final
tick's velocity, and it releases a concurrent handoff after the step, the way
a sequence already does. `paint(alpha)` interpolates animations backward
across [N−1, N], as physics already does. Each of these is pinned by a test
against the real `MatterWorld` that fails before the change.

**Tech stack:** TypeScript, PixiJS 8 (containers only, in Node), Matter.js
via `MatterWorld`, Vitest 4.

**Spec:** `docs/specs/2026-10-03-marey-phase-6c-smooth-handoff-design.md`.
Read it before any task. This plan cites it as "spec §N", and where the two
differ, the spec wins.

**Branch:** `phase-6c`, from `main` at `7e09051`. The baseline is 1219 main
tests passing; the eval suite, the build and `marey check` also pass.

---

## Global Constraints

Every task's requirements include this section.

1. **Non-handoff animations keep their curve and their exported frames**
   (spec, "Preserves"). Only Task 3 changes how anything paints live, and
   `paintExactTick()` must paint exactly what it painted before.
2. **The compile rules, the IR, the type checker and the exporters are not
   touched.** The work is in `src/compiler/renderer/` and docs.
3. **Tests come first.** Every behaviour change is introduced by a test that
   fails on the code before it. The report quotes the failing output.
4. **Measured, not asserted.** Every number in docs or RESULTS comes from a
   command the report shows.
5. **Repository rules (AGENTS.md).**
   - Stage paths explicitly and read `git diff --staged`. Never use
     `git add -A`, `git add .` or `git add -f`.
   - `core.autocrlf` is on, so judge changes with
     `git diff --stat -- <path>`, not `git status`.
   - Use Conventional Commit subjects. No tool attribution, and no wording
     that names AI tools or an assistant workflow.
   - Nothing under `.visual-check/` or `dist/` is committed.
   - Before every commit, all four checks must pass:
     ```bash
     npm test
     npx vitest run --config eval/vitest.config.ts
     npm run build
     npm run build:cli && node bin/marey.mjs check $(git ls-files '*.marey')
     ```
6. **Do not push or merge.**

---

## File structure

| File | Responsibility | Tasks |
|---|---|---|
| `src/compiler/renderer/easing.ts` (new) | The pure curves, and which end a handoff releases at | 1 |
| `src/compiler/renderer/easing.test.ts` (new) | Curve endpoints, monotonicity, end slopes, and the legacy curves unchanged | 1 |
| `src/compiler/renderer/sceneRuntime.ts` | Final-tick velocity, release after the step, curve call sites, painting | 1, 2, 3 |
| `src/compiler/renderer/sceneRuntime.test.ts` | The seam tests against the real `MatterWorld` | 2, 3 |
| `src/compiler/renderer/timeline.ts` | `AnimTime.prevElapsedTicks`, `paintProgress` | 3 |
| `src/compiler/renderer/timeline.test.ts` | `paintProgress` at the forward, turning, completion, wrap and delay ticks | 3 |
| `docs/architecture/renderer.md` | The two subsystems now interpolate in the same direction | 3 |
| `docs/LANGUAGE.md` | The handoff rule, the release-speed table and the reshaped curves | 4 |
| `eval/scenes-3b/compound-logo.marey` and other scene comments | Drop the multiplier wording | 4 |
| `eval/RESULTS-PHASE-6.md` | The 6C section: before and after tables, compound-logo, the browser check | 4 |

---

## Task 1: The easing module (tier: mechanical)

This task moves the curves out of `sceneRuntime.ts` into a pure module and
adds the reshaped handoff curves. **Behaviour does not change:** the runtime
keeps calling the curves with no release end. It also captures the "before"
exports that Task 4 compares against.

**Files:**
- Create: `src/compiler/renderer/easing.ts`
- Create: `src/compiler/renderer/easing.test.ts`
- Modify: `src/compiler/renderer/sceneRuntime.ts`. Delete the local
  `evaluateEasing` (lines 59–69) and import it from `./easing`.
  `getEasingDerivativeAtEnd` stays for now; Task 2 deletes it.

**Interfaces:**
- Produces: `type ReleaseEnd = "start" | "end" | null`;
  `releaseEndOf(anim: Pick<IRAnimation, "handoff" | "yoyo" | "loop">): ReleaseEnd`;
  `evaluateEasing(t: number, easing: string, release?: ReleaseEnd): number`.
  Tasks 2 and 3 use all three.

- [ ] **Step 1: Capture the "before" exports.** Build first, then export
  each handoff scene as PNG frames. Task 4 compares against these. They stay
  under `.visual-check/`, which is gitignored.

```bash
npm run build && npm run build:export-page && npm run build:cli
for s in eval/scenes-3b/compound-logo.marey eval/scenes/throw-arc.marey tools/visual-check/scenes/test-card.marey tools/visual-check/scenes/hello-face.marey; do
  n=$(basename "$s" .marey)
  node bin/marey.mjs export "$s" --format png --out ".visual-check/6c/before/$n" | tee -a .visual-check/6c/before/summary.txt
done
```

Expected: one `wrote …` line per scene. Record the four `frames <hash>`
values in the report. `compound-logo` should read `frames 26cca4e9`.

- [ ] **Step 2: Write the failing test** `src/compiler/renderer/easing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { evaluateEasing, releaseEndOf, type ReleaseEnd } from "./easing";

const EASINGS = ["linear", "easeIn", "easeOut", "easeInOut"] as const;
const RELEASES: ReleaseEnd[] = [null, "end", "start"];

/**
 * Slope at t = 0 and t = 1 for every easing and release end. The reshaped
 * rows are Phase 6C spec §2.2; every other entry is the usual curve's slope.
 */
const SLOPES: Record<string, Record<(typeof EASINGS)[number], [number, number]>> = {
  none: { linear: [1, 1], easeIn: [0, 2], easeOut: [2, 0], easeInOut: [0, 0] },
  end: { linear: [1, 1], easeIn: [0, 2], easeOut: [2, 0.5], easeInOut: [0, 0.5] },
  start: { linear: [1, 1], easeIn: [0.5, 2], easeOut: [2, 0], easeInOut: [0.5, 0] },
};

/** The curves as they were before Phase 6C, kept here as the reference. */
function legacy(t: number, easing: string): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  switch (easing) {
    case "easeIn": return t * t;
    case "easeOut": return t * (2 - t);
    case "easeInOut": return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default: return t;
  }
}

describe("evaluateEasing", () => {
  for (const release of RELEASES) {
    for (const easing of EASINGS) {
      const label = `${easing}, release ${release ?? "none"}`;

      it(`${label}: starts at 0 and ends at 1`, () => {
        expect(evaluateEasing(0, easing, release)).toBe(0);
        expect(evaluateEasing(1, easing, release)).toBe(1);
      });

      it(`${label}: never moves backwards`, () => {
        let prev = 0;
        for (let i = 1; i <= 1000; i++) {
          const e = evaluateEasing(i / 1000, easing, release);
          expect(e).toBeGreaterThanOrEqual(prev);
          prev = e;
        }
      });

      it(`${label}: has the slopes of spec §2.2 at both ends`, () => {
        const h = 1e-6;
        const [s0, s1] = SLOPES[release ?? "none"][easing];
        expect(evaluateEasing(h, easing, release) / h).toBeCloseTo(s0, 3);
        expect((1 - evaluateEasing(1 - h, easing, release)) / h).toBeCloseTo(s1, 3);
      });
    }
  }

  for (const easing of EASINGS) {
    it(`${easing} with no release end is the pre-6C curve exactly`, () => {
      for (let i = 0; i <= 1000; i++) {
        expect(evaluateEasing(i / 1000, easing)).toBe(legacy(i / 1000, easing));
      }
    });
  }
});

describe("releaseEndOf", () => {
  it("is null without a handoff", () => {
    expect(releaseEndOf({ handoff: false, yoyo: false, loop: false })).toBeNull();
    expect(releaseEndOf({ handoff: false, yoyo: true, loop: false })).toBeNull();
  });

  it("is the end for a plain handoff and the start for a yoyo one", () => {
    expect(releaseEndOf({ handoff: true, yoyo: false, loop: false })).toBe("end");
    expect(releaseEndOf({ handoff: true, yoyo: true, loop: false })).toBe("start");
  });

  it("is null for a loop, which never completes and so never hands off", () => {
    expect(releaseEndOf({ handoff: true, yoyo: false, loop: true })).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to see it fail.**
  Run: `npx vitest run src/compiler/renderer/easing.test.ts`.
  Expected: FAIL, because `./easing` does not exist.

- [ ] **Step 4: Write `src/compiler/renderer/easing.ts`:**

```ts
/**
 * Easing curves, as pure functions of linear progress.
 *
 * Kept apart from `sceneRuntime.ts` for the reason `clock.ts` and
 * `timeline.ts` are: it imports nothing from `pixi.js`, so it is tested in
 * Node.
 */
import type { IRAnimation } from "../sceneIR";

/**
 * The end of its curve at which a `handoff` animation releases its body:
 * `"end"` for a plain animation, and `"start"` for a non-looping yoyo, which
 * finishes its return leg at progress 0. `null` when nothing is handed off.
 */
export type ReleaseEnd = "start" | "end" | null;

export function releaseEndOf(anim: Pick<IRAnimation, "handoff" | "yoyo" | "loop">): ReleaseEnd {
  // A loop never completes, so it never hands off (TYPE_HANDOFF_LOOP).
  if (!anim.handoff || anim.loop) return null;
  return anim.yoyo ? "start" : "end";
}

/**
 * Eased progress for linear progress `t`, clamped to [0, 1].
 *
 * With a release end, a curve that would arrive there at rest is swapped for
 * the cubic Hermite curve that arrives at half the average speed and keeps
 * the usual slope at its other end, so a handoff has momentum to hand over
 * (Phase 6C spec §2.2). A curve that already moves at its release end is
 * left alone.
 */
export function evaluateEasing(t: number, easing: string, release: ReleaseEnd = null): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  if (release === "end") {
    // Slopes 2 → 0.5 and 0 → 0.5.
    if (easing === "easeOut") return t * (2 + t * (-1.5 + 0.5 * t));
    if (easing === "easeInOut") return t * t * (2.5 - 1.5 * t);
  } else if (release === "start") {
    // Slopes 0.5 → 2 and 0.5 → 0.
    if (easing === "easeIn") return t * (0.5 + 0.5 * t * t);
    if (easing === "easeInOut") return t * (0.5 + t * (2 - 1.5 * t));
  }

  switch (easing) {
    case "easeIn":    return t * t;
    case "easeOut":   return t * (2 - t);
    case "easeInOut": return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case "linear":
    default:          return t;
  }
}
```

- [ ] **Step 5: Make `sceneRuntime.ts` import it.** Delete the local
  `function evaluateEasing` and add
  `import { evaluateEasing } from "./easing";` beside the other `./` imports.
  Leave the three call sites as they are, with no release argument, so
  behaviour is identical.

- [ ] **Step 6: Run the tests.**
  - `npx vitest run src/compiler/renderer/easing.test.ts`: expect PASS.
  - `npm test`: expect 1219 plus the new tests, all passing.

- [ ] **Step 7: Run the four checks, then commit:**

```bash
git add src/compiler/renderer/easing.ts src/compiler/renderer/easing.test.ts src/compiler/renderer/sceneRuntime.ts
git diff --staged
git commit -m "refactor(renderer): move easing curves to a pure module with the handoff shapes"
```

---

## Task 2: Hand off the final tick, after the step (tier: integration)

This task fixes defects 1–3 of spec §1 at tick level: the speed, the yoyo
end, and the concurrent release.

**Files:**
- Modify: `src/compiler/renderer/sceneRuntime.ts`
- Modify: `src/compiler/renderer/sceneRuntime.test.ts`

**Interfaces:**
- Consumes: `evaluateEasing`, `releaseEndOf` and `ReleaseEnd` from Task 1.
- Produces: the seam test's `describe` block, its `FREE` physics fixture and
  its `runSeam` helper. Task 3 extends all three.

- [ ] **Step 1: Write the failing seam test.** Append it to
  `sceneRuntime.test.ts`, which already has `makeContainer`, `makeRoot`,
  `anim`, `MatterWorld` and `TICK_HZ`. Add
  `import { evaluateEasing, releaseEndOf } from "./easing";` to its imports.

```ts
/**
 * Phase 6C spec §3: the handoff seam, against the real solver.
 *
 * 200 px over 1 s with gravity and air drag off, so any change of pace at
 * the seam is the handoff's own. "Concurrent" puts `physics` beside the
 * animation; "sequence" puts it in a step after.
 */
describe("SceneRuntime · the handoff seam", () => {
  const FREE: IRPhysics = {
    velocity: { x: 0, y: 0 },
    gravity: { x: 0, y: 0 },
    airDrag: 0,
    bounce: 0,
    collideBounds: false,
    duration: "indefinitely",
  };
  const START = { x: 200, y: 300 };
  const TO = { x: 400, y: 300 };
  const EASINGS = ["linear", "easeIn", "easeOut", "easeInOut"] as const;

  /**
   * Body x after every tick (index 0 = before the first), the tick the
   * animation started on, and the tick it released on.
   */
  function runSeam(arrangement: "concurrent" | "sequence", easing: string, yoyo: boolean) {
    const a = anim({ to: TO, duration: 1, easing: easing as IRAnimation["easing"], yoyo, handoff: true });
    const c = arrangement === "concurrent"
      ? makeContainer({ position: START, animations: [a], physics: FREE })
      : makeContainer({ position: START, sequence: { steps: [a, FREE] } });
    const world = new MatterWorld(2000, 2000);
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;
    const runTicks = (yoyo ? 2 : 1) * TICK_HZ;

    const xs = [world.readState(id, 1)!.x];
    const pinnedAfter: boolean[] = [true];
    for (let k = 1; k <= runTicks + 6; k++) {
      rt.advanceOneTick();
      xs.push(world.readState(id, 1)!.x);
      pinnedAfter.push(world.isPinned(id));
    }
    world.destroy();

    // The first tick that moves the body is the animation's first tick.
    const first = xs.findIndex((x, k) => k > 0 && x !== xs[k - 1]);
    return { xs, pinnedAfter, first, release: first - 1 + runTicks, a };
  }

  /** The curve's own final step, signed, in px (spec §3, check 2). */
  function finalStep(a: IRAnimation): number {
    const release = releaseEndOf(a);
    const [pPrev, pEnd] = release === "start" ? [1 / TICK_HZ, 0] : [1 - 1 / TICK_HZ, 1];
    return (TO.x - START.x) * (evaluateEasing(pEnd, a.easing, release) - evaluateEasing(pPrev, a.easing, release));
  }

  for (const arrangement of ["concurrent", "sequence"] as const) {
    for (const yoyo of [false, true]) {
      for (const easing of EASINGS) {
        it(`${arrangement}, ${easing}${yoyo ? ", yoyo" : ""}: crosses the seam at an even pace`, () => {
          const { xs, pinnedAfter, first, release: n, a } = runSeam(arrangement, easing, yoyo);
          const d = (k: number) => xs[k] - xs[k - 1];

          // 3. Released after tick N, never before, in both arrangements.
          expect(first).toBeGreaterThan(0);
          expect(pinnedAfter[n - 1]).toBe(true);
          expect(pinnedAfter[n]).toBe(false);

          // 2. Tick N moved the curve's final step: not doubled, not stalled.
          const step = finalStep(a);
          expect(Math.abs(d(n) - step)).toBeLessThanOrEqual(Math.abs(step) * 1e-3);

          // 1. The first free tick moves as far as the last animated one.
          expect(Math.abs(d(n + 1) - d(n))).toBeLessThanOrEqual(Math.abs(d(n)) * 1e-3);
        });
      }
    }
  }
});
```

- [ ] **Step 2: Run it to see it fail, and record the before numbers.**
  - Run: `npx vitest run src/compiler/renderer/sceneRuntime.test.ts -t "handoff seam"`.
  - Expected: most of the 16 cases FAIL. Every concurrent case fails check 2,
    and the sequence ease-out and yoyo cases fail check 1. Sequence `linear`
    may already pass.
  - Copy the failing values into the report as a table: for each case,
    `d(N−1)`, `d(N)` and `d(N+1)`. A temporary `console.log` is fine; remove
    it before committing.

- [ ] **Step 3: Pass the release end at every curve call site.** In
  `sceneRuntime.ts`, `applyAnim`, `scaleOf` and `pushAnimToWorld` each call
  `evaluateEasing(…, ra.anim.easing)`. Give each one
  `releaseEndOf(ra.anim)` as a third argument, so the body and the painted
  object follow the same curve (spec §2.5).

- [ ] **Step 4: Hand off the final tick's velocity.** Add this beside
  `lerp`, with `TICK_HZ` imported from `./clock`:

```ts
/**
 * The velocity an animation had over its final tick, in px/s: the
 * displacement of that tick times `TICK_HZ` (Phase 6C spec §2.1). A
 * non-looping yoyo's final tick is the last of its return leg, from progress
 * 1/N back to 0, so its direction needs no special case.
 */
function finalTickVelocity(ra: RunningAnim): IRPoint {
  const n = Math.max(ra.time.durationTicks, 1);
  const release = releaseEndOf(ra.anim);
  const [pPrev, pEnd] = release === "start" ? [1 / n, 0] : [(n - 1) / n, 1];
  const ePrev = evaluateEasing(pPrev, ra.anim.easing, release);
  const eEnd = evaluateEasing(pEnd, ra.anim.easing, release);
  const s = ra.startVal as IRPoint;
  const t = ra.targetVal as IRPoint;
  return {
    x: (lerp(s.x, t.x, eEnd) - lerp(s.x, t.x, ePrev)) * TICK_HZ,
    y: (lerp(s.y, t.y, eEnd) - lerp(s.y, t.y, ePrev)) * TICK_HZ,
  };
}
```

  In `tickAnim`, replace the body of `if (ra.anim.handoff && ra.anim.duration > 0) { … }`
  (from `const startPt` through the `__pendingVelocity` assignment) with
  `ra.container.__pendingVelocity = finalTickVelocity(ra);`. Keep only the
  part of the old yoyo comment that is still true. Then delete
  `getEasingDerivativeAtEnd`.

- [ ] **Step 5: Release a handoff after the step.**
  - In `tickAnim`, unpin `POS_ANIM` on completion only for non-handoff
    animations:
    `if (!ra.anim.handoff) unpinBody(ra.container, this.world, "POS_ANIM");`
  - In `advanceOneTick`, add this straight after `this.world.step();` and
    before the sequence loop:

```ts
    // A handoff lets its body go after the step of the tick it completed on,
    // so that step leaves the body at its release value and the first free
    // step is the next one, as in a sequence, where the NO_RUNNER pin already
    // holds it through this step (Phase 6C spec §2.3). Releasing before the
    // step moved the body twice in one tick.
    for (let i = 0; i < this.runningAnims.length; i++) {
      const ra = this.runningAnims[i];
      if (ra.completedThisTick && ra.isPosAnim && ra.anim.handoff && ra.container.__mareyLayout) {
        unpinBody(ra.container, this.world, "POS_ANIM");
      }
    }
```

  - Check that the comments on `spawnPhysics` and `unpinBody` (which
    describe when a parked velocity is flushed) still read true, and adjust
    them if not.

- [ ] **Step 6: Run the tests.**
  - `npx vitest run src/compiler/renderer/sceneRuntime.test.ts`: the 16 seam
    cases now pass.
  - Two existing tests compare velocities exactly: "parks a handoff velocity
    on the completion tick and flushes it when the last pin lifts" and
    "hands a yoyo off from its target back toward its start". They now fail
    in the last bits of a double (spec §2.6), for example
    `199.99999999999886`. Change each `toEqual({ x: ±200, y: 0 })` into two
    `toBeCloseTo(…, 6)` assertions, with one comment line explaining why.
  - Any other failing test must be explained in the report before it is
    changed. Do not edit a test just to make it pass.
  - Run `npm test` and expect everything to pass.

- [ ] **Step 7: Record the after numbers** (the same table as Step 2) in the
  report. Run the four checks, then commit:

```bash
git add src/compiler/renderer/sceneRuntime.ts src/compiler/renderer/sceneRuntime.test.ts
git diff --staged
git commit -m "fix(renderer): hand off the final tick's velocity, after the step"
```

---

## Task 3: Paint animations backward, as physics does (tier: architecture)

This task fixes defect 4 of spec §1, the one-tick loss in the live preview
(spec §2.4).

**Files:**
- Modify: `src/compiler/renderer/timeline.ts`
- Modify: `src/compiler/renderer/timeline.test.ts`
- Modify: `src/compiler/renderer/sceneRuntime.ts`
- Modify: `src/compiler/renderer/sceneRuntime.test.ts`
- Modify: `docs/architecture/renderer.md`. Rewrite the `frameSampler.ts`
  paragraph about "opposite temporal directions", currently around lines
  33–50.

**Interfaces:**
- Consumes: the seam `describe` block, `FREE` and `runSeam` from Task 2.
- Produces: `AnimTime.prevElapsedTicks: number`;
  `AnimTime.wrappedThisTick: boolean`;
  `paintProgress(t: AnimTime, alpha: number): number`, exported from
  `timeline.ts`.

- [ ] **Step 1: Write the failing `timeline.test.ts` cases.**
  - Add `prevElapsedTicks: 0` and `wrappedThisTick: false` to `makeAnim`'s
    defaults.
  - Import `paintProgress`.
  - Append:

```ts
describe("paintProgress", () => {
  /** Advance `t` by `n` ticks. */
  function run(t: AnimTime, n: number): AnimTime {
    for (let i = 0; i < n; i++) advanceAnimTime(t);
    return t;
  }

  it("interpolates backward from the previous tick to this one", () => {
    const t = run(makeAnim(), 4);
    expect(paintProgress(t, 0)).toBeCloseTo(0.3, 12);
    expect(paintProgress(t, 0.5)).toBeCloseTo(0.35, 12);
    expect(paintProgress(t, 1)).toBeCloseTo(0.4, 12);
  });

  it("turns a yoyo without leaving [0, 1] or skipping the turn", () => {
    const t = run(makeAnim({ yoyo: true }), 10); // the turning tick
    expect(paintProgress(t, 0)).toBeCloseTo(0.9, 12);
    expect(paintProgress(t, 1)).toBe(1);
    advanceAnimTime(t); // first tick of the return leg
    expect(paintProgress(t, 0)).toBe(1);
    expect(paintProgress(t, 1)).toBeCloseTo(0.9, 12);
  });

  it("paints a completion tick from the previous tick to the end", () => {
    const t = run(makeAnim(), 10);
    expect(t.completed).toBe(true);
    expect(paintProgress(t, 0)).toBeCloseTo(0.9, 12);
    expect(paintProgress(t, 1)).toBe(1);
  });

  it("holds still once completed, on later ticks of a catch-up burst", () => {
    const t = run(makeAnim(), 11);
    expect(paintProgress(t, 0)).toBe(1);
  });

  it("does not sweep back through the path when a loop wraps", () => {
    const t = run(makeAnim({ loop: true }), 10); // the wrap tick
    expect(t.elapsedTicks).toBe(0);
    expect(paintProgress(t, 0)).toBeCloseTo(0.9, 12);
    expect(paintProgress(t, 1)).toBe(1);
    advanceAnimTime(t);
    expect(paintProgress(t, 0)).toBe(0);
    expect(paintProgress(t, 1)).toBeCloseTo(0.1, 12);
  });

  it("stays at 0 through a delay and on the tick it ends", () => {
    const t = makeAnim({ delayTicks: 2 });
    advanceAnimTime(t);
    expect(paintProgress(t, 0.5)).toBe(0);
    advanceAnimTime(t);
    expect(paintProgress(t, 0.5)).toBe(0);
    advanceAnimTime(t);
    expect(paintProgress(t, 0.5)).toBeCloseTo(0.05, 12);
  });
});
```

- [ ] **Step 2: Write the failing painted-seam test.** In
  `sceneRuntime.test.ts`, inside the seam `describe` from Task 2, add a
  helper that paints and a 16-case loop for spec §3, check 4:

```ts
  /**
   * The painted x after `paint(a)` following each tick from `from` to `to`,
   * alongside the tick-level x the same run reaches.
   */
  function paintedSeam(arrangement: "concurrent" | "sequence", easing: string, yoyo: boolean, a: number) {
    const anim1 = anim({ to: TO, duration: 1, easing: easing as IRAnimation["easing"], yoyo, handoff: true });
    const c = arrangement === "concurrent"
      ? makeContainer({ position: START, animations: [anim1], physics: FREE })
      : makeContainer({ position: START, sequence: { steps: [anim1, FREE] } });
    const world = new MatterWorld(2000, 2000);
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;
    const runTicks = (yoyo ? 2 : 1) * TICK_HZ;
    const ticks = [world.readState(id, 1)!.x];
    const painted = [c.__mareyLayout!.currentPos.x];
    for (let k = 1; k <= runTicks + 6; k++) {
      rt.advanceOneTick();
      ticks.push(world.readState(id, 1)!.x);
      rt.paint(a);
      painted.push(c.__mareyLayout!.currentPos.x);
    }
    world.destroy();
    return { ticks, painted };
  }

  for (const arrangement of ["concurrent", "sequence"] as const) {
    for (const yoyo of [false, true]) {
      for (const easing of EASINGS) {
        it(`${arrangement}, ${easing}${yoyo ? ", yoyo" : ""}: the preview follows the tick path across the seam`, () => {
          const { release: n } = runSeam(arrangement, easing, yoyo);
          for (const a of [0.25, 0.5, 0.75]) {
            const { ticks, painted } = paintedSeam(arrangement, easing, yoyo, a);
            const d = (k: number) => ticks[k] - ticks[k - 1];
            for (let k = n - 3; k <= n + 3; k++) {
              const expected = (1 - a) * d(k - 1) + a * d(k);
              const got = painted[k] - painted[k - 1];
              // 1%, not 0.1%: an animation paints its curve at an interpolated
              // progress, which bends away from the straight line between two
              // ticks by up to 0.8% of a step where the curve bends (spec §3).
              expect(Math.abs(got - expected)).toBeLessThanOrEqual(Math.abs(expected) * 1e-2 + 1e-9);
            }
          }
        });
      }
    }
  }
```

  Run both test files and expect the new cases to FAIL. Put the failing
  values for the sequence `linear` case at a = 0.5 in the report: the
  painted steps around the seam against the expected ones.

  A point to investigate rather than assume: on the release tick, the body is
  stepped while pinned and only then let go. `readState`'s previous position
  is captured at the top of `step()`, so it may equal the current one on that
  tick, and physics paints after animations. If the painted step at tick N
  comes out wrong once Steps 3–4 are done, look there first. Whatever the
  fix, it must keep exported frames unchanged (Global Constraint 1).

- [ ] **Step 3: Implement `paintProgress` in `timeline.ts`.**
  - Add `prevElapsedTicks` and `wrappedThisTick` to `AnimTime`, with doc
    comments.
  - In `advanceAnimTime`:
    - first, set `t.prevElapsedTicks = t.elapsedTicks` and
      `t.wrappedThisTick = false`. This must also run on the early returns
      for `completed` and for a delay tick, so a runner that is not moving
      paints still;
    - in the `loop` wrap branch (`elapsedTicks >= durationTicks` with
      `t.loop`), set `t.wrappedThisTick = true`.
  - Add:

```ts
/**
 * Progress to paint at the driver's sub-tick `alpha`: the lerp from the
 * previous tick's progress to this tick's (Phase 6C spec §2.4). It is the
 * same backward interpolation `readState` gives physics, so a body and an
 * animation painted at one alpha sit at one moment, and an object handing
 * off from one to the other keeps its pace. A loop's wrap tick paints to the
 * end of the cycle; the jump back to the start falls between frames.
 */
export function paintProgress(t: AnimTime, alpha: number): number {
  if (t.durationTicks <= 0) return 1;
  if (t.delayTicks > 0) return 0;
  const to = t.wrappedThisTick ? t.durationTicks : t.elapsedTicks;
  const p = (t.prevElapsedTicks + (to - t.prevElapsedTicks) * alpha) / t.durationTicks;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}
```

  Add `prevElapsedTicks: 0, wrappedThisTick: false` wherever an `AnimTime` is
  built. Find every place with `grep -rn "delayTicks:" src`.

- [ ] **Step 4: Paint with it in `sceneRuntime.ts`.**
  - `applyAnim(ra, alpha)` becomes `applyAnim(ra, p)`, taking the progress
    from its caller.
  - `paint(alpha)` paints each running animation at
    `paintProgress(ra.time, alpha)`.
  - `paintExactTick()` keeps `animProgress(ra.time, 0)`, which is tick-exact
    and paints the start on a wrap tick (spec §2.4). Physics stays at
    `readState(…, 1)` there and `readState(…, alpha)` in `paint`.
  - The completion snap in `tickAnim` uses `animProgress(ra.time, 0)`.
  - Reshape `paintAt` however reads best, but keep a single loop that does
    the painting and splicing for both entry points.
  - Rewrite the docstrings that this makes untrue:
    - `paintExactTick`: drop "opposite temporal directions". Both
      subsystems now interpolate backward, so `paint(1)` and
      `paintExactTick()` agree except on a loop's wrap tick.
    - `pushAnimToWorld`: "the drawn position leads the collision shape by up
      to one tick" is no longer true. The drawn position now trails
      the body by under a tick, in step with physics.
    - `animProgress`: say it is the tick phase's tick-exact progress.
    - Any other comment `grep -n "alpha" src/compiler/renderer/sceneRuntime.ts`
      turns up that the change contradicts.

- [ ] **Step 5: Update the existing tests that encode forward painting.**
  "feeds the world the tick-aligned value, never an alpha-interpolated one"
  expects `(200 * 1.75) / TICK_HZ` after `paint(0.75)`. The painted value is
  now `(200 * 0.75) / TICK_HZ`. Rewrite the expectation and its comment: the
  painted position trails the body by a quarter tick, as a physics body's
  would. Any other failing test gets the same treatment, with the reason in
  the report. "paints an animation at its current tick" and "paints a free
  body at its current tick" must pass unchanged.

- [ ] **Step 6: Run** `npm test`. Expect everything to pass, including all
  32 seam cases.

- [ ] **Step 7: Update `docs/architecture/renderer.md`.** Rewrite the
  paragraph describing `paintExactTick()` and the "opposite temporal
  directions":
  - Both subsystems now interpolate backward across [N−1, N].
  - `paintExactTick()` reads tick-exact values: animations through
    `animProgress(…, 0)`, physics at `readState(…, 1)`.
  - The old offset was "invisible" between two objects but cost one tick on
    one object crossing a handoff. Cite the numbers from the Task 3 report.
  - Fix anything else in the file that states the old direction:
    `grep -n "forward\|alpha = 0 is exact\|leads" docs/architecture/renderer.md`.

- [ ] **Step 8: Run the four checks, then commit:**

```bash
git add src/compiler/renderer/timeline.ts src/compiler/renderer/timeline.test.ts src/compiler/renderer/sceneRuntime.ts src/compiler/renderer/sceneRuntime.test.ts docs/architecture/renderer.md
git diff --staged
git commit -m "fix(renderer): paint animations backward across the tick, as physics does"
```

---

## Task 4: Docs, scenes and the evidence (tier: integration)

**Files:**
- Modify: `docs/LANGUAGE.md` (the "handoff" section, around lines 528–575)
- Modify: `eval/scenes-3b/compound-logo.marey` (the comment at lines 44–48),
  plus any other comment the grep in Step 2 finds
- Modify: `eval/RESULTS-PHASE-6.md` (a new `## 6C: smooth handoff` section
  after the 6B section)

- [ ] **Step 1: Rewrite `docs/LANGUAGE.md` "handoff".**
  - Replace the two paragraphs from "The exit velocity is derived from…"
    through "…not a measurement of the curve." with three things:
    - the rule in spec §2.1, stated for a reader of the language: the body
      leaves at the velocity the animation had over its final tick;
    - one sentence on the reshaped curves: with `handoff: true`, an easing
      that would arrive at rest arrives at half the average speed instead;
    - the release-speed table from spec §2.2, with the "After" column only,
      headed "Release speed, as a multiple of the average speed".
  - Rewrite the yoyo paragraph so it says that a yoyo releases at the start
    of its curve, with the yoyo rows of the same table.
  - Keep the six rules and the example as they are.

- [ ] **Step 2: Fix scene comments.**
  - Run `git grep -n -i "multiplier\|average speed\|half of it\|exit velocity" -- '*.marey' docs src`.
  - Rewrite every comment that states the old multipliers, starting with
    `compound-logo.marey` lines 44–48. Its reasoning still stands: `linear`
    keeps the throw at the average speed, and `easeIn` threw too hard.
  - Do not change any scene's code.
  - Leave historical records alone: dated RESULTS sections, old specs and
    plans.

- [ ] **Step 3: Export the "after" frames and compare them.**

```bash
npm run build && npm run build:export-page && npm run build:cli
for s in eval/scenes-3b/compound-logo.marey eval/scenes/throw-arc.marey tools/visual-check/scenes/test-card.marey tools/visual-check/scenes/hello-face.marey; do
  n=$(basename "$s" .marey)
  node bin/marey.mjs export "$s" --format png --out ".visual-check/6c/after/$n" | tee -a .visual-check/6c/after/summary.txt
done
```

  Then compare each scene's before and after frames with a short Node
  script, kept under `.visual-check/6c/` and not committed. Use `pngjs`
  from `node_modules` if it is present, otherwise any PNG decoder already
  installed. For each scene, report:
  - whether the `frames` hash changed;
  - how many frames differ;
  - the largest per-channel difference;
  - the first frame index that differs.

  `compound-logo` must either keep `frames 26cca4e9` or differ by at most 1
  per channel (spec §3). If it differs by more, stop and report BLOCKED with
  the numbers. For the other three, the first differing frame should be at
  or after their handoff's start; say whether it is.

- [ ] **Step 4: Run the browser harness.**
  - Read `tools/visual-check/README.md` for how `check.mjs` is run against
    `test-card`.
  - Start `npx vite --port 5199 --strictPort`. It may bind only to `[::1]`,
    so use `http://[::1]:5199` if `localhost` fails.
  - Run the check and look at the captured handoff ball. It should arc, with
    no stop before it does.
  - Kill the server, then confirm the port is free:
    `netstat -ano | grep 5199` must print nothing.
  - Put the check's summary line in the report.

- [ ] **Step 5: Write `## 6C: smooth handoff` in `eval/RESULTS-PHASE-6.md`.**
  It should contain:
  - the spec path;
  - the before and after tick tables from the Task 2 report;
  - the painted-seam before and after from the Task 3 report;
  - the export comparison table from Step 3;
  - the browser check's summary.

  Every number must come from a command shown in a report. Keep the style
  of the 6B section above it.

- [ ] **Step 6: Run the four checks, then commit:**

```bash
git add docs/LANGUAGE.md eval/scenes-3b/compound-logo.marey eval/RESULTS-PHASE-6.md
# plus any other file Step 2 changed, each named explicitly
git diff --staged
git commit -m "docs: state the handoff rule and record the 6C measurements"
```

---

## Self-review

- **Spec coverage:**
  - §2.1 (final-tick velocity): Task 2, Steps 4 and 6.
  - §2.2 (curves): Task 1; wired in by Task 2, Step 3.
  - §2.3 (release after the step): Task 2, Step 5.
  - §2.4 (painting): Task 3.
  - §2.5 (code): Tasks 1–3.
  - §2.6 (docs, scenes, RESULTS): Task 3, Step 7 and Task 4.
  - §3: check 1–3 in Task 2, Step 1; check 4 in Task 3, Step 2; the curve
    tests in Task 1; the painting tests in Task 3, Step 1; the regression
    guards in Task 2, Step 6, Task 3, Step 5 and Task 4, Step 3; the browser
    harness in Task 4, Step 4.
- **Names used across tasks:**
  - `evaluateEasing`, `releaseEndOf` and `ReleaseEnd` (Task 1) are used
    with the same signatures in Tasks 2 and 3.
  - `runSeam`, `FREE`, `START`, `TO` and `EASINGS` (Task 2) are reused in
    Task 3.
  - `paintProgress`, `prevElapsedTicks` and `wrappedThisTick` are defined
    and used only in Task 3.
- **Known judgment points:**
  - Task 2, Step 6: which existing tests move, and why.
  - Task 3, Step 4: the shape of `paintAt`.
  - Task 3, Steps 4 and 7: the comment rewrites.
  - Task 4, Step 3: the comparison script.
