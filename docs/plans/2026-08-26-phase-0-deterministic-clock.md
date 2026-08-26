# Phase 0: Deterministic Clock Implementation Plan

**Goal:** Convert Declare's renderer from wall-clock milliseconds to a fixed 120Hz frame-indexed clock, so the same scene produces an identical state sequence on every run.

**Architecture:** Two new pure modules with no PixiJS or DOM dependency — `clock.ts` (tick constants and the wall-clock-to-tick driver) and `timeline.ts` (frame-indexed advancement for animation and physics runners). `adapter.ts` is rewired to advance state a whole number of fixed ticks per rendered frame instead of integrating a variable delta. Behavior is preserved; only the clock changes.

**Tech Stack:** TypeScript 5.9 (strict), Vite 8 beta, PixiJS 8, Vitest 4 (added by this plan).

**Spec:** `docs/specs/2026-08-26-physics-shared-world-design.md` §5

---

## Background for the implementer

Declare compiles a scene DSL to a PixiJS scene graph. `src/compiler/renderer/adapter.ts`
runs the animation and physics loop from PixiJS's ticker, integrating `ticker.deltaMS`
directly. Every accumulator in that file is in milliseconds.

This phase replaces that with frame counting. The key insight: with millisecond
accumulators, a dropped frame changes the resulting state, so runs diverge. With **tick**
accumulators, dropping frames cannot change what tick 300 looks like — it only changes
whether tick 299 was ever displayed. The state sequence becomes deterministic; only
playback pacing varies, and pacing does not matter for the export path this unblocks.

**This phase must not change how anything looks.** That is what makes it verifiable — you
can compare against current behavior. If a scene looks different afterward, something is
wrong.

**Two things about this codebase:**

- `matter-js`, `poly-decomp`, and `@types/matter-js` exist in `node_modules` but are in
  neither `package.json` nor `package-lock.json`. Any `npm install` deletes them. That is
  expected and fine — Phase 0 does not use them.
- There is no existing test suite. Task 1 creates it.

---

## File structure

| File | Responsibility |
|---|---|
| `src/compiler/renderer/clock.ts` | **Create.** Tick rate constants, seconds→ticks conversion, `LiveDriver` (wall clock → whole ticks + interpolation alpha). No Pixi, no DOM. |
| `src/compiler/renderer/clock.test.ts` | **Create.** Unit tests for the above. |
| `src/compiler/renderer/timeline.ts` | **Create.** Pure frame-indexed time state for animations and physics runners. No Pixi, no DOM. |
| `src/compiler/renderer/timeline.test.ts` | **Create.** Unit tests for the above. |
| `src/compiler/renderer/adapter.ts` | **Modify.** Replace millisecond accumulators with the two modules above; drive from `LiveDriver`. |
| `vitest.config.ts` | **Create.** Test runner config. |
| `package.json` | **Modify.** Add `vitest` dev dependency and `test` script. |

`clock.ts` and `timeline.ts` are deliberately free of PixiJS imports. Spec decision D9
requires the physics module to be headless-testable in Phase 1, and these two modules are
the foundation it will sit on.

---

## Task 1: Test tooling

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/compiler/renderer/clock.test.ts` (placeholder, replaced in Task 2)

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

Expected: `added 25 packages`. It will also report removing `matter-js`, `poly-decomp`,
and `@types/matter-js` — this is expected (see Background) and not an error.

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

`environment: "node"` is deliberate — every module under test here is pure, and keeping
tests out of a DOM environment is what makes them fast and what will let Phase 1 test
physics headlessly.

- [ ] **Step 3: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a placeholder test to prove the runner works**

Create `src/compiler/renderer/clock.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("test runner", () => {
  it("runs", () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: PASS, `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/compiler/renderer/clock.test.ts
git commit -m "chore(test): add vitest runner"
```

---

## Task 2: The clock module

**Files:**
- Create: `src/compiler/renderer/clock.ts`
- Modify: `src/compiler/renderer/clock.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/compiler/renderer/clock.test.ts`:

```typescript
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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./clock"`.

- [ ] **Step 3: Write the implementation**

Create `src/compiler/renderer/clock.ts`:

```typescript
/**
 * The fixed simulation rate. 120Hz is chosen so that common export frame
 * rates divide evenly into it (24 → 5 ticks, 30 → 4, 60 → 2), which keeps
 * exported frames on exact simulation states rather than interpolations.
 */
export const TICK_HZ = 120;
export const TICK_MS = 1000 / TICK_HZ;
export const TICK_SECONDS = 1 / TICK_HZ;

/** Longest single frame we will honour; anything worse is treated as a hitch. */
export const MAX_FRAME_MS = 100;

/** Most ticks we will simulate in one rendered frame, to avoid a death spiral. */
export const MAX_CATCHUP_TICKS = 8;

/** Convert a duration in seconds to whole simulation ticks. */
export function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * TICK_HZ));
}

/**
 * Turns wall-clock frame deltas into a whole number of fixed ticks.
 *
 * The remainder is carried between calls, so the tick count after a given
 * amount of elapsed time does not depend on how that time was split into
 * frames. That is what makes playback reproducible.
 */
export class LiveDriver {
  private accumulator = 0;

  /** Fraction of a tick left unspent, for render interpolation. 0..1 */
  alpha = 0;

  /** Returns how many fixed ticks to advance for this frame. */
  pump(deltaMs: number): number {
    this.accumulator += Math.min(deltaMs, MAX_FRAME_MS);

    let ticks = 0;
    while (this.accumulator >= TICK_MS && ticks < MAX_CATCHUP_TICKS) {
      this.accumulator -= TICK_MS;
      ticks++;
    }

    // If we hit the ceiling there is still a backlog. Drop it rather than
    // letting it compound into progressively slower frames.
    if (this.accumulator >= TICK_MS) {
      this.accumulator = 0;
    }

    this.alpha = this.accumulator / TICK_MS;
    return ticks;
  }

  reset(): void {
    this.accumulator = 0;
    this.alpha = 0;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, `10 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/renderer/clock.ts src/compiler/renderer/clock.test.ts
git commit -m "feat(renderer): add fixed 120Hz clock and live driver"
```

---

## Task 3: Frame-indexed animation time

**Files:**
- Create: `src/compiler/renderer/timeline.ts`
- Create: `src/compiler/renderer/timeline.test.ts`

Existing behavior being preserved, from `adapter.ts:171-198`: a non-looping animation
completes at progress 1; `yoyo` reverses direction at the end; `loop` restarts at 0; a
yoyo without loop reverses once and then rests at 0 without ever completing.

- [ ] **Step 1: Write the failing tests**

Create `src/compiler/renderer/timeline.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { advanceAnimTime, animProgress, type AnimTime } from "./timeline";

function makeAnim(over: Partial<AnimTime> = {}): AnimTime {
  return {
    elapsedTicks: 0,
    durationTicks: 10,
    direction: 1,
    completed: false,
    loop: false,
    yoyo: false,
    ...over,
  };
}

describe("advanceAnimTime", () => {
  it("advances one tick per call", () => {
    const t = makeAnim();
    advanceAnimTime(t);
    expect(t.elapsedTicks).toBe(1);
    advanceAnimTime(t);
    expect(t.elapsedTicks).toBe(2);
  });

  it("completes exactly once, on the tick it reaches its duration", () => {
    const t = makeAnim({ durationTicks: 3 });
    expect(advanceAnimTime(t)).toBe(false);
    expect(advanceAnimTime(t)).toBe(false);
    expect(advanceAnimTime(t)).toBe(true);
    expect(t.completed).toBe(true);
    expect(advanceAnimTime(t)).toBe(false);
  });

  it("reverses direction at the end when yoyo is set", () => {
    const t = makeAnim({ durationTicks: 2, yoyo: true });
    advanceAnimTime(t);
    advanceAnimTime(t);
    expect(t.direction).toBe(-1);
    expect(t.completed).toBe(false);
    advanceAnimTime(t);
    expect(t.elapsedTicks).toBe(1);
  });

  it("restarts from zero when looping", () => {
    const t = makeAnim({ durationTicks: 2, loop: true });
    advanceAnimTime(t);
    advanceAnimTime(t);
    expect(t.elapsedTicks).toBe(0);
    expect(t.completed).toBe(false);
  });

  it("rests at zero when a yoyo without loop returns to the start", () => {
    const t = makeAnim({ durationTicks: 2, yoyo: true });
    for (let i = 0; i < 10; i++) advanceAnimTime(t);
    expect(t.elapsedTicks).toBe(0);
    expect(t.completed).toBe(false);
  });

  it("takes the same number of ticks regardless of how they are batched", () => {
    const a = makeAnim({ durationTicks: 240 });
    const b = makeAnim({ durationTicks: 240 });

    let aTicks = 0;
    while (!a.completed) { advanceAnimTime(a); aTicks++; }

    let bTicks = 0;
    for (let batch = 0; batch < 100 && !b.completed; batch++) {
      for (let i = 0; i < 7 && !b.completed; i++) { advanceAnimTime(b); bTicks++; }
    }

    expect(bTicks).toBe(aTicks);
    expect(aTicks).toBe(240);
  });
});

describe("animProgress", () => {
  it("reports progress as a fraction of the duration", () => {
    const t = makeAnim({ durationTicks: 10, elapsedTicks: 5 });
    expect(animProgress(t, 0)).toBeCloseTo(0.5, 5);
  });

  it("interpolates toward the next tick using alpha", () => {
    const t = makeAnim({ durationTicks: 10, elapsedTicks: 5 });
    expect(animProgress(t, 0.5)).toBeCloseTo(0.55, 5);
  });

  it("interpolates backwards when reversing", () => {
    const t = makeAnim({ durationTicks: 10, elapsedTicks: 5, direction: -1 });
    expect(animProgress(t, 0.5)).toBeCloseTo(0.45, 5);
  });

  it("ignores alpha once completed so the end state is exact", () => {
    const t = makeAnim({ durationTicks: 10, elapsedTicks: 10, completed: true });
    expect(animProgress(t, 0.9)).toBe(1);
  });

  it("clamps to the 0..1 range", () => {
    const low = makeAnim({ durationTicks: 10, elapsedTicks: 0, direction: -1 });
    expect(animProgress(low, 0.9)).toBe(0);

    const high = makeAnim({ durationTicks: 10, elapsedTicks: 10 });
    expect(animProgress(high, 0.9)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./timeline"`.

- [ ] **Step 3: Write the implementation**

Create `src/compiler/renderer/timeline.ts`:

```typescript
/**
 * Frame-indexed time state for a running animation.
 *
 * Everything is counted in fixed simulation ticks rather than milliseconds,
 * so a given tick index always corresponds to the same visual state.
 */
export interface AnimTime {
  elapsedTicks: number;
  durationTicks: number;
  /** 1 forwards, -1 while a yoyo is reversing. */
  direction: number;
  completed: boolean;
  loop: boolean;
  yoyo: boolean;
}

/**
 * Advance exactly one tick.
 * Returns true only on the tick where a non-looping animation finishes.
 */
export function advanceAnimTime(t: AnimTime): boolean {
  if (t.completed) return false;

  t.elapsedTicks += t.direction;

  if (t.elapsedTicks >= t.durationTicks) {
    if (t.yoyo) {
      t.elapsedTicks = t.durationTicks;
      t.direction = -1;
    } else if (t.loop) {
      t.elapsedTicks = 0;
    } else {
      t.elapsedTicks = t.durationTicks;
      t.completed = true;
      return true;
    }
  } else if (t.elapsedTicks <= 0 && t.direction === -1) {
    if (t.loop) {
      t.elapsedTicks = 0;
      t.direction = 1;
    } else {
      t.elapsedTicks = 0;
    }
  }

  return false;
}

/**
 * Progress through the animation, 0..1.
 *
 * `alpha` is the unspent fraction of a tick from the driver. Because easing is
 * a pure function of progress, animations interpolate smoothly just by
 * evaluating at a fractional tick — no previous-state buffer is needed.
 */
export function animProgress(t: AnimTime, alpha: number): number {
  if (t.durationTicks <= 0) return 1;

  const sub = t.completed ? 0 : alpha * t.direction;
  const p = (t.elapsedTicks + sub) / t.durationTicks;

  if (p < 0) return 0;
  if (p > 1) return 1;
  return p;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, `21 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/renderer/timeline.ts src/compiler/renderer/timeline.test.ts
git commit -m "feat(renderer): add frame-indexed animation time"
```

---

## Task 4: Frame-indexed physics time

**Files:**
- Modify: `src/compiler/renderer/timeline.ts`
- Modify: `src/compiler/renderer/timeline.test.ts`

Existing behavior being preserved, from `adapter.ts:56-61`: a physics runner with a
numeric duration completes once elapsed time reaches it; `duration: indefinitely` (stored
as `durationMs === null`) never completes.

- [ ] **Step 1: Write the failing tests**

Append to `src/compiler/renderer/timeline.test.ts`:

```typescript
import { advancePhysicsTime, type PhysicsTime } from "./timeline";

function makePhysics(over: Partial<PhysicsTime> = {}): PhysicsTime {
  return { elapsedTicks: 0, durationTicks: 10, completed: false, ...over };
}

describe("advancePhysicsTime", () => {
  it("advances one tick per call", () => {
    const t = makePhysics();
    advancePhysicsTime(t);
    expect(t.elapsedTicks).toBe(1);
  });

  it("completes exactly once, on the tick it reaches its duration", () => {
    const t = makePhysics({ durationTicks: 2 });
    expect(advancePhysicsTime(t)).toBe(false);
    expect(advancePhysicsTime(t)).toBe(true);
    expect(t.completed).toBe(true);
    expect(advancePhysicsTime(t)).toBe(false);
  });

  it("never completes when the duration is indefinite", () => {
    const t = makePhysics({ durationTicks: null });
    for (let i = 0; i < 1000; i++) advancePhysicsTime(t);
    expect(t.completed).toBe(false);
  });
});
```

Note: move the new `import` line to join the existing import from `./timeline` at the top
of the file rather than leaving a second import statement mid-file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `advancePhysicsTime is not a function` or a TypeScript resolution error.

- [ ] **Step 3: Write the implementation**

Append to `src/compiler/renderer/timeline.ts`:

```typescript
/** Frame-indexed time state for a running physics simulation. */
export interface PhysicsTime {
  elapsedTicks: number;
  /** null means `duration: indefinitely` — this runner never completes. */
  durationTicks: number | null;
  completed: boolean;
}

/**
 * Advance exactly one tick.
 * Returns true only on the tick where a finite simulation finishes.
 */
export function advancePhysicsTime(t: PhysicsTime): boolean {
  if (t.completed) return false;
  if (t.durationTicks === null) return false;

  t.elapsedTicks += 1;

  if (t.elapsedTicks >= t.durationTicks) {
    t.completed = true;
    return true;
  }

  return false;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, `24 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/renderer/timeline.ts src/compiler/renderer/timeline.test.ts
git commit -m "feat(renderer): add frame-indexed physics time"
```

---

## Task 5: Convert animation runners in the adapter

**Files:**
- Modify: `src/compiler/renderer/adapter.ts:5-14` (the `RunningAnim` interface)
- Modify: `src/compiler/renderer/adapter.ts:171-243` (`tickAnim`)
- Modify: `src/compiler/renderer/adapter.ts:261-282` (`spawnAnim`)

- [ ] **Step 1: Add the imports**

At the top of `adapter.ts`, after the existing imports:

```typescript
import { LiveDriver, secondsToTicks, TICK_SECONDS } from "./clock";
import {
  advanceAnimTime,
  animProgress,
  advancePhysicsTime,
  type AnimTime,
  type PhysicsTime,
} from "./timeline";
```

`TICK_SECONDS` and `advancePhysicsTime` are used in Task 6; importing them now keeps the
import block in one edit.

- [ ] **Step 2: Replace the `RunningAnim` interface**

Replace lines 5-14:

```typescript
export interface RunningAnim {
  container: Container;
  anim: IRAnimation;
  startVal: number | IRPoint;
  targetVal: number | IRPoint;
  time: AnimTime;
  isPosAnim: boolean;
}
```

The `elapsed`, `direction`, and `completed` fields move into `time`. Every read of
`ra.completed` becomes `ra.time.completed`.

- [ ] **Step 3: Replace `tickAnim`**

Replace the whole `tickAnim` function (lines 171-243) with:

```typescript
function tickAnim(ra: RunningAnim): boolean {
  return advanceAnimTime(ra.time);
}

function applyAnim(ra: RunningAnim, alpha: number, justCompleted: boolean): void {
  const e = evaluateEasing(animProgress(ra.time, alpha), ra.anim.easing);

  if (ra.anim.property === "alpha") {
    ra.container.alpha = lerp(ra.startVal as number, ra.targetVal as number, e);
  } else if (ra.anim.property === "rotation") {
    ra.container.rotation = lerp(ra.startVal as number, ra.targetVal as number, e) * (Math.PI / 180);
  } else if (ra.anim.property === "position" && ra.container.__declareLayout) {
    const layout = ra.container.__declareLayout;
    const startPt = ra.startVal as IRPoint;
    const targetPt = ra.targetVal as IRPoint;

    layout.currentPos.x = lerp(startPt.x, targetPt.x, e);
    layout.currentPos.y = lerp(startPt.y, targetPt.y, e);

    if (justCompleted && ra.isPosAnim) {
      ra.container.__kinematicPosAnimCount = Math.max(0, (ra.container.__kinematicPosAnimCount || 1) - 1);

      if (ra.anim.handOff && ra.anim.duration > 0) {
        if (!ra.container.__physicsState) {
          ra.container.__physicsState = { velocity: { x: 0, y: 0 } };
        }

        const deriv = getEasingDerivativeAtEnd(ra.anim.easing);
        const durSec = Math.max(ra.anim.duration, 0.001);
        const dx = targetPt.x - startPt.x;
        const dy = targetPt.y - startPt.y;

        ra.container.__physicsState.velocity.x = (dx / durSec) * deriv;
        ra.container.__physicsState.velocity.y = (dy / durSec) * deriv;
      }
    }

    ra.container.__updateLayout?.();
  } else if (ra.anim.property === "scale" && ra.container.__declareLayout) {
    const layout = ra.container.__declareLayout;
    const startPt = ra.startVal as IRPoint;
    const targetPt = ra.targetVal as IRPoint;
    layout.currentScale.x = lerp(startPt.x, targetPt.x, e);
    layout.currentScale.y = lerp(startPt.y, targetPt.y, e);
    ra.container.__updateLayout?.();
  }
}
```

Splitting advance from apply is what lets the loop tick N times and then paint once with
the leftover `alpha`, which is where the smooth interpolation comes from.

- [ ] **Step 4: Replace `spawnAnim`**

Replace lines 261-282:

```typescript
function spawnAnim(container: Container, anim: IRAnimation, globalList: RunningAnim[], localList: AnimOrPhysics[]) {
  const isPos = anim.property === "position";
  if (isPos) {
    container.__kinematicPosAnimCount = (container.__kinematicPosAnimCount || 0) + 1;
  }

  const sVal = getCurrentVal(container, anim.property);
  let tVal = anim.to;
  if ((anim.property === "position" || anim.property === "scale") && typeof tVal === "number") {
    tVal = { x: tVal, y: tVal };
  }

  const ra: RunningAnim = {
    container, anim,
    startVal: sVal,
    targetVal: tVal as number | IRPoint,
    time: {
      elapsedTicks: 0,
      durationTicks: secondsToTicks(anim.duration),
      direction: 1,
      completed: false,
      loop: anim.loop,
      yoyo: anim.yoyo,
    },
    isPosAnim: isPos
  };
  globalList.push(ra);
  localList.push(ra);
}
```

- [ ] **Step 5: Verify the type checker catches every remaining `.completed` read**

Run: `npx tsc -b --noEmit`
Expected: FAIL, with errors on `runningAnims[i].completed` and the `bp.completed` /
`sp.completed` reads in the sequence runner. These are fixed in Task 7 — this step just
confirms the compiler is finding them for you.

- [ ] **Step 6: Run the unit tests**

Run: `npm test`
Expected: PASS, `24 passed`. The new modules are unaffected by an in-progress `adapter.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/compiler/renderer/adapter.ts
git commit -m "refactor(renderer): convert animation runners to tick-indexed time"
```

---

## Task 6: Convert physics runners in the adapter

**Files:**
- Modify: `src/compiler/renderer/adapter.ts:16-21` (the `PhysicsRunner` interface)
- Modify: `src/compiler/renderer/adapter.ts:45-143` (`NativePhysicsEngine`)
- Modify: `src/compiler/renderer/adapter.ts:284-304` (`spawnPhysics`)

- [ ] **Step 1: Replace the `PhysicsRunner` interface**

Replace lines 16-21:

```typescript
export interface PhysicsRunner {
  container: Container;
  time: PhysicsTime;
}
```

- [ ] **Step 2: Replace the `IPhysicsEngine` interface**

Replace lines 34-43:

```typescript
export interface IPhysicsEngine {
  tickContainer(
    pr: PhysicsRunner,
    container: Container,
    logicalWidth: number,
    logicalHeight: number
  ): boolean;
}
```

The `dt` and `dtSeconds` parameters are gone. A tick is always the same length now, which
is exactly the property Phase 1's `step()` depends on.

- [ ] **Step 3: Replace `NativePhysicsEngine`**

Replace the whole class (lines 45-143):

```typescript
export class NativePhysicsEngine implements IPhysicsEngine {
  tickContainer(
    pr: PhysicsRunner,
    container: Container,
    logicalWidth: number,
    logicalHeight: number
  ): boolean {
    const justCompleted = advancePhysicsTime(pr.time);

    if ((container.__kinematicPosAnimCount || 0) > 0) {
      return justCompleted;
    }

    const p = container.__physics!;
    const s = container.__physicsState!;
    const layout = container.__declareLayout;
    if (!layout) return justCompleted;

    // One fixed tick of integration. Previously this was an accumulator loop
    // over a variable delta; the clock now guarantees a constant step.
    const step = TICK_SECONDS;

    s.velocity.x += p.gravity.x * step;
    s.velocity.y += p.gravity.y * step;

    // INVERTED DRAG FIX: 0 = vacuum, 1 = maximum resistance
    const f = Math.pow(1.0 - p.airDrag, step * 60);
    s.velocity.x *= f;
    s.velocity.y *= f;

    layout.currentPos.x += s.velocity.x * step;
    layout.currentPos.y += s.velocity.y * step;

    if (p.collideBounds && container.__baseSize) {
      const absScaleX = Math.abs(layout.currentScale.x);
      const absScaleY = Math.abs(layout.currentScale.y);

      const baseW = container.__baseSize.w * absScaleX;
      const baseH = container.__baseSize.h * absScaleY;

      const cos = Math.abs(Math.cos(container.rotation));
      const sin = Math.abs(Math.sin(container.rotation));

      const projW = baseW * cos + baseH * sin;
      const projH = baseW * sin + baseH * cos;

      const projAnchorX = projW * 0.5;
      const projAnchorY = projH * 0.5;

      const left   = layout.currentPos.x - projAnchorX;
      const top    = layout.currentPos.y - projAnchorY;
      const right  = left + projW;
      const bottom = top  + projH;

      if (left < 0) {
        layout.currentPos.x += -left;
        if (s.velocity.x < 0) s.velocity.x = -s.velocity.x * p.bounce;
      } else if (right > logicalWidth) {
        layout.currentPos.x -= (right - logicalWidth);
        if (s.velocity.x > 0) s.velocity.x = -s.velocity.x * p.bounce;
      }

      if (top < 0) {
        layout.currentPos.y += -top;
        if (s.velocity.y < 0) s.velocity.y = -s.velocity.y * p.bounce;
      } else if (bottom > logicalHeight) {
        layout.currentPos.y -= (bottom - logicalHeight);
        if (s.velocity.y > 0) {
          if (s.velocity.y < p.gravity.y * step * 2.5) {
            s.velocity.y = 0;
          } else {
            s.velocity.y = -s.velocity.y * p.bounce;
          }
        }
        if (s.velocity.y === 0 && p.gravity.y > 0) {
          s.velocity.x *= 0.95;
          if (Math.abs(s.velocity.x) < 5) s.velocity.x = 0;
        }
      }
    }

    container.__updateLayout?.();
    return justCompleted;
  }
}
```

Two behavioral notes. The resting threshold `p.gravity.y * step * 2.5` now uses a 1/120
step rather than the old 1/120 `MAX_STEP`, so it is unchanged. The horizontal damping
`*= 0.95` now runs at 120Hz instead of once per accumulator sub-step — which was also
120Hz, since `MAX_STEP` was `1/120`. Both are preserved.

- [ ] **Step 4: Replace `spawnPhysics`**

Replace lines 284-304:

```typescript
function spawnPhysics(container: Container, phIR: IRPhysics, globalList: PhysicsRunner[], localList: AnimOrPhysics[]) {
  const exitVelX = container.__physicsState?.velocity.x ?? phIR.velocity.x;
  const exitVelY = container.__physicsState?.velocity.y ?? phIR.velocity.y;
  container.__physics = phIR;

  if (!container.__physicsState) {
    container.__physicsState = { velocity: { x: exitVelX, y: exitVelY } };
  } else {
    container.__physicsState.velocity.x = exitVelX;
    container.__physicsState.velocity.y = exitVelY;
  }

  const pr: PhysicsRunner = {
    container,
    time: {
      elapsedTicks: 0,
      durationTicks: phIR.duration === "indefinitely"
        ? null
        : secondsToTicks(phIR.duration as number),
      completed: false,
    },
  };
  globalList.push(pr);
  localList.push(pr);
}
```

- [ ] **Step 5: Run the unit tests**

Run: `npm test`
Expected: PASS, `24 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/compiler/renderer/adapter.ts
git commit -m "refactor(renderer): convert physics runners to tick-indexed time"
```

---

## Task 7: Drive the render loop from the clock

**Files:**
- Modify: `src/compiler/renderer/adapter.ts:453-519` (runner setup and the ticker callback)

- [ ] **Step 1: Replace the runner setup and ticker callback**

Replace from `const runningAnims:` (line 453) through the end of the
`activeTickerCallback` assignment (line 516):

```typescript
    const runningAnims:    RunningAnim[]    = [];
    const physicsRunners:  PhysicsRunner[]  = [];
    const sequenceRunners: SequenceRunner[] = [];

    collectData(sceneRoot, runningAnims, physicsRunners, sequenceRunners);

    const physicsEngine = new NativePhysicsEngine();
    const driver = new LiveDriver();

    // Advance the whole scene exactly one fixed tick. Everything that changes
    // scene state lives here and takes no time argument, so an export driver
    // can call it in a bare loop with no wall clock involved.
    function advanceOneTick(): void {
      for (let i = 0; i < runningAnims.length; i++) {
        const ra = runningAnims[i];
        if (tickAnim(ra)) {
          ra.justCompletedThisTick = true;
        }
      }

      for (let i = 0; i < physicsRunners.length; i++) {
        const pr = physicsRunners[i];
        physicsEngine.tickContainer(pr, pr.container, logicalWidth, logicalHeight);
      }

      for (let i = 0; i < sequenceRunners.length; i++) {
        const sr = sequenceRunners[i];
        if (sr.state === "DONE") continue;

        if (sr.state === "WAITING") {
          let allBaseDone = true;
          for (const bp of sr.basePeers) {
            if (!bp.time.completed) { allBaseDone = false; break; }
          }
          if (allBaseDone) {
            sr.state = "RUNNING";
            startSequenceStep(sr, runningAnims, physicsRunners);
          }
        } else if (sr.state === "RUNNING") {
          let allStepsDone = true;
          for (const sp of sr.activeStepRunners) {
            if (!sp.time.completed) { allStepsDone = false; break; }
          }
          if (allStepsDone) {
            sr.stepIndex++;
            if (sr.stepIndex >= sr.sequence.steps.length) {
              sr.state = "DONE";
            } else {
              startSequenceStep(sr, runningAnims, physicsRunners);
            }
          }
        }
      }
    }

    activeTickerCallback = (ticker: Ticker) => {
      const ticks = driver.pump(ticker.deltaMS);

      for (let t = 0; t < ticks; t++) {
        advanceOneTick();
      }

      // Paint once, at the fractional position between the last two ticks.
      for (let i = 0; i < runningAnims.length; i++) {
        const ra = runningAnims[i];
        applyAnim(ra, driver.alpha, ra.justCompletedThisTick === true);
        ra.justCompletedThisTick = false;
      }

      for (let i = runningAnims.length - 1; i >= 0; i--) {
        if (runningAnims[i].time.completed) runningAnims.splice(i, 1);
      }
      for (let i = physicsRunners.length - 1; i >= 0; i--) {
        if (physicsRunners[i].time.completed) physicsRunners.splice(i, 1);
      }
      for (let i = sequenceRunners.length - 1; i >= 0; i--) {
        if (sequenceRunners[i].state === "DONE") sequenceRunners.splice(i, 1);
      }

      if (runningAnims.length === 0 && physicsRunners.length === 0 && sequenceRunners.length === 0) {
        sharedApp?.ticker.stop();
      }
    };
```

Note the ordering: a completed animation must be painted at its final state *before* it is
spliced out of the list, which is why removal happens after `applyAnim`.

- [ ] **Step 2: Add the `justCompletedThisTick` field**

`applyAnim` needs to know whether the handoff branch should fire, but ticking and painting
are now separate. Add the flag to `RunningAnim`:

```typescript
export interface RunningAnim {
  container: Container;
  anim: IRAnimation;
  startVal: number | IRPoint;
  targetVal: number | IRPoint;
  time: AnimTime;
  isPosAnim: boolean;
  justCompletedThisTick?: boolean;
}
```

- [ ] **Step 3: Typecheck the whole project**

Run: `npx tsc -b --noEmit`
Expected: PASS with no output.

If errors remain, they will be leftover `.completed` or `.elapsed` reads. Every one should
become `.time.completed`; there should be no remaining reads of `.elapsed` or `.durationMs`.

- [ ] **Step 4: Run the unit tests**

Run: `npm test`
Expected: PASS, `24 passed`.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: PASS — `tsc -b` clean, then a Vite build with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/compiler/renderer/adapter.ts
git commit -m "feat(renderer): drive the scene loop from the fixed clock"
```

---

## Task 8: Verify behavior is preserved

There is no automated visual harness — this phase is verified by inspection against the
current behavior, which is why it was sequenced first. **Do not skip this.**

**Files:** none modified.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL.

- [ ] **Step 2: Check the default scene**

The default scene loads automatically. Confirm all three of these:

1. Twenty purple stars fade in and out on a loop (a `loop: true` + `yoyo: true` alpha
   animation, exercising the yoyo path).
2. Five blue cubes fall from the top, bounce off the floor and walls, and settle.
3. The large purple ring in the centre pulses smoothly and continuously.

Motion should look the same as before this phase and should be smooth, not steppy. If
motion is visibly jerkier than before, the interpolation in `applyAnim` is not receiving
`driver.alpha` correctly.

- [ ] **Step 3: Check that the loop still stops**

Let the cubes come to rest. The ring and stars loop forever, so the ticker should keep
running — this scene never idles. To check idling, replace the editor contents with:

```
scene {
  size: (800, 600)
  background: #080811
  circle ball {
    position: (400, 100)
    radius: 20
    color: #38bdf8
    physics {
      gravity: (0, 980)
      bounce: 0.6
      collideBounds: true
      duration: 3
    }
  }
}
```

The ball should fall, bounce, and stop after three seconds. Confirm CPU usage drops in the
browser's task manager once it stops, proving `ticker.stop()` still fires.

- [ ] **Step 4: Check reproducibility**

Reload the page twice with the scene from Step 3 and watch where the ball comes to rest.
It should stop in the same place every time. This is the property the phase exists to
create.

- [ ] **Step 5: Check a sequence still advances**

Replace the editor contents with:

```
scene {
  size: (800, 600)
  background: #080811
  rectangle box {
    position: (100, 300)
    size: (60, 60)
    color: #f87171
    sequence {
      animate { property: position, to: (700, 300), duration: 1.5, easing: easeOut, handOff: true }
      physics { gravity: (0, 980), bounce: 0.5, collideBounds: true, duration: 3 }
    }
  }
}
```

The box should slide right, then fall and bounce — carrying its exit momentum into the
fall rather than dropping straight down. This exercises the sequence runner, the
`handOff` branch in `applyAnim`, and the `justCompletedThisTick` flag together.

- [ ] **Step 6: Commit the plan completion**

```bash
git commit --allow-empty -m "chore: phase 0 verified — deterministic clock complete"
```

---

## Deviations from the spec

Two items in spec §5.3 and §5.5 are deliberately scoped down. Both are recorded here so
they are visible choices rather than omissions.

**No `SceneClock` frame counter.** The spec sketches `SceneClock { frame, advance() }`.
This plan implements the advancement (`advanceOneTick`) but not the monotonic counter,
because nothing reads it yet — it becomes useful in Phase 5 when export needs "render
frames 0..N", and adding unused state now would be speculative. The counter is trivial to
add at that point.

**The "manual render path" is interpreted narrowly.** The spec calls for decoupling
rendering from `autoStart` as an export constraint. The substantive requirement is that
*scene state advancement is a function of tick count, not wall clock* — which
`advanceOneTick()` satisfies, since it takes no time argument and an export driver can
call it in a bare loop. Actually switching `autoStart` off and taking over PixiJS's render
call is deferred to Phase 5, where there will be a real consumer to validate it against.
Doing it now would add a code path nothing exercises.

---

## Done when

- `npm test` passes with 24 tests.
- `npm run build` succeeds.
- All five manual checks in Task 8 pass.
- No reads of `.elapsed`, `.durationMs`, or a bare `.completed` remain on runner objects in
  `adapter.ts`.
- `clock.ts` and `timeline.ts` contain no `pixi.js` import.
