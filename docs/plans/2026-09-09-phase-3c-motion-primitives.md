# Phase 3C Motion Primitives Implementation Plan

**Goal:** Give `animate` a `delay`, give shapes an `origin`, and relax the
zero-`scale` ban to exactly the objects where it protects nothing.

**Architecture:** Three independent language surfaces that meet in one place —
the renderer's pivot. `delay` is pure time arithmetic in `timeline.ts`. `origin`
moves the container pivot off the bounding-box centre, which forces the physics
seam to reconcile a pivot-relative `position` against Matter's centre-of-mass
placement. The scale rule becomes context-dependent: a local contract constraint
rejects negatives, and a separate tree-aware validator rule rejects zeros only
where they reach a divisor.

**Tech Stack:** TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`,
`verbatimModuleSyntax`), Vitest, PixiJS v8, matter-js 0.20.0 (pinned, no caret).

**Spec:** `docs/specs/2026-09-09-marey-phase-3c-motion-primitives-design.md`

## A note on this plan's use of code blocks

Test code below is verbatim and must be typed as written — a test is a
specification.

**That protection did not hold, and this plan's own execution notes record
why.** "Its RED run catches it immediately if it is wrong" is false whenever the
verbatim test is wrong *about the fixture rather than about the behaviour*:
plan defects #1 and #2 below specified tests calling fake-world APIs that do not
exist (`unpinAll`, `setReadState`, `runtimeWithScaleAnim`, `world.positionCalls`),
and Task 4's headline test read `world.positionCalls` from a
`RecordingWorld.setPosition` that was a no-op stub recording nothing. Each would
have gone RED — for the wrong reason, which is a **false RED** and not a red
flag. What actually caught them was a human-side pre-flight read of the fake
before dispatch. So: **verbatim test code is a claim about the fake's API, and
must be read against the fake before it is dispatched**, exactly as a plan
sketch citing a signature is a claim about the past. See AGENT-LESSONS §3d.

**Implementation code is given as exact call sites, exact formulas and exact
message strings, not as pasted function bodies**, for Tasks 3 and 4 in
particular. This is a deliberate deviation from the writing-plans skill's
"show the code" rule, and its evidence is in this repository: Phase 3B's Task 11
"contained complete, verbatim, and *wrong* code" which, inserted exactly where
instructed, rejected a legitimate construct — and the task was tiered Mechanical
*because* its brief contained complete code
(`2026-09-02-phase-3b-generative-expressiveness.md`, execution notes, plan
defect 14). Implementers are expected to read the file they are editing.

## Global Constraints

1. `LANGUAGE_CONTRACT` in `src/compiler/languageContract.ts` is the single
   source of truth for every property. Adding a property means editing it
   **once**; the type checker, Monaco hovers, snippets and completions derive
   from it. Never add a property name to a second list.
2. Durations and delays are in **seconds** in the IR, converted to ticks exactly
   once, at runner creation, through `secondsToTicks` from `sceneIR.ts`.
3. Renderer invariant 1: nothing that mutates scene state may take a time
   argument. Invariant 2: state mutation in the tick phase, painting in the
   paint phase. Invariant 3: nothing fed into the physics world may derive from
   the wall clock. See `docs/architecture/renderer.md`.
4. `renderer/transform.ts`, `sceneRuntime.ts`, `physicsSync.ts` and
   `timeline.ts` must not import `pixi.js` at runtime. Every `pixi.js` import in
   them is `import type`.
5. Verify tree cleanliness with `git diff --stat -- <path>`, **never**
   `git status`. `core.autocrlf` is on and `git status` reports modification on
   content-identical files.
6. Delete every probe or scratch file before reporting. The suite baseline on a
   clean tree at `f367544` is **20 files / 604 tests**; a leftover
   `*.test.ts` silently inflates it.
7. For every behaviour a task requires, delete the line that implements it and
   run the suite. Anything still green is untested. **Tie-break:** a gap this
   check finds in a behaviour the task *requires* is in scope to fix; a gap in
   an adjacent behaviour is filed, not fixed.
8. A reviewer *recommendation* is filed, not fixed, unless it blocks the next
   task.
9. Assert on wording only the code under test can produce. A short substring is
   likely to appear in a neighbouring diagnostic or a shared formatter.

---

### Task 1: `delay` on `animate`

**Tier:** Integration.

**Files:**
- Modify: `src/compiler/languageContract.ts` — `LocalConstraint` union (~line 8-14), `animateProperties` (~line 248-297)
- Modify: `src/compiler/typeChecker/validator.ts:65` — add a `switch` arm to `validateLocalConstraint`
- Modify: `src/compiler/sceneIR.ts:39-47` — `IRAnimation`
- Modify: `src/compiler/typeChecker/builder.ts` — wherever `IRAnimation` objects are constructed
- Modify: `src/compiler/renderer/timeline.ts:7-81` — `AnimTime`, `advanceAnimTime`, `animProgress`
- Modify: `src/compiler/renderer/sceneRuntime.ts:298-307` — `AnimTime` construction
- Test: `src/compiler/renderer/timeline.test.ts`, `src/compiler/typeChecker/validator.test.ts`, `src/compiler/languageContract.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `IRAnimation.delay: number` (seconds, default `0`, non-negative);
  `AnimTime.delayTicks: number` (remaining delay in ticks, counts down to 0);
  `LocalConstraint` variant `Readonly<{ kind: "nonNegative" }>`.

**The trap this task exists to avoid.** `secondsToTicks` is
`Math.max(1, Math.round(seconds * TICK_HZ))`, so **`secondsToTicks(0)` returns
1, not 0**. Converting the default `delay: 0` through it would add one tick of
delay to every animation in every existing scene, shifting all timings and
moving determinism goldens for a feature nobody used. `delayTicks` must be
computed as `anim.delay <= 0 ? 0 : secondsToTicks(anim.delay)`.

- [ ] **Step 1: Write the failing timeline tests**

Add to `src/compiler/renderer/timeline.test.ts`. Match the file's existing
helper style for constructing an `AnimTime`; if it builds them inline, build
these inline too.

```ts
describe("delay", () => {
  const delayed = (delayTicks: number, durationTicks = 4): AnimTime => ({
    elapsedTicks: 0, durationTicks, direction: 1,
    completed: false, loop: false, yoyo: false, delayTicks,
  });

  it("does not advance elapsed time while the delay is outstanding", () => {
    const t = delayed(3);
    advanceAnimTime(t);
    advanceAnimTime(t);
    expect(t.delayTicks).toBe(1);
    expect(t.elapsedTicks).toBe(0);
  });

  it("holds progress at exactly 0 during the delay, at any sub-tick alpha", () => {
    const t = delayed(3);
    expect(animProgress(t, 0.75)).toBe(0);
    advanceAnimTime(t);
    expect(animProgress(t, 0.99)).toBe(0);
  });

  it("advances normally on the tick after the delay is spent", () => {
    const t = delayed(2);
    advanceAnimTime(t);
    advanceAnimTime(t);
    expect(t.delayTicks).toBe(0);
    advanceAnimTime(t);
    expect(t.elapsedTicks).toBe(1);
  });

  it("completes a delayed animation delayTicks later than an undelayed one", () => {
    const plain = delayed(0, 3);
    const late = delayed(2, 3);
    let plainDone = -1;
    let lateDone = -1;
    for (let i = 0; i < 12; i++) {
      if (advanceAnimTime(plain)) plainDone = i;
      if (advanceAnimTime(late)) lateDone = i;
    }
    expect(plainDone).toBe(2);
    expect(lateDone).toBe(4);
  });

  // The decision, pinned. Roadmap 5.2's phase-offset criterion requires the
  // delay be spent ONCE. If it were re-armed per iteration the period would
  // become delay + duration, and varying delay across generated objects would
  // change period rather than phase -- the exact defect the roadmap records
  // for varying `duration`. Flip advanceAnimTime to re-arm delayTicks on the
  // loop branch and this test goes red; nothing else in the suite does.
  it("spends the delay once, so a looping animation's period stays duration", () => {
    const t: AnimTime = {
      elapsedTicks: 0, durationTicks: 4, direction: 1,
      completed: false, loop: true, yoyo: false, delayTicks: 5,
    };
    for (let i = 0; i < 5; i++) advanceAnimTime(t);
    // Delay spent; now time four ticks of the first cycle, which wraps to 0.
    for (let i = 0; i < 4; i++) advanceAnimTime(t);
    expect(t.elapsedTicks).toBe(0);
    expect(t.delayTicks).toBe(0);
    // The second cycle starts immediately -- no second delay.
    advanceAnimTime(t);
    expect(t.elapsedTicks).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests and read the failure**

Run: `npx vitest run src/compiler/renderer/timeline.test.ts`
Expected: FAIL — TypeScript rejects `delayTicks` as an excess property on
`AnimTime`. Read the message; do not proceed on an assumed failure.

- [ ] **Step 3: Add `delayTicks` to the timeline module**

In `src/compiler/renderer/timeline.ts`:
- Add `delayTicks: number` to `AnimTime`, documented as "remaining delay in
  ticks; counts down to 0 and is never re-armed" with the roadmap reason.
- In `advanceAnimTime`, after the `if (t.completed) return false;` guard and
  **before** `t.elapsedTicks += t.direction`, spend one tick of delay and return
  `false` if any remains.
- In `animProgress`, return `0` while `t.delayTicks > 0`, before the `sub`
  computation — otherwise the driver's sub-tick `alpha` leaks a small positive
  progress into a delayed animation.

- [ ] **Step 4: Run the timeline tests**

Run: `npx vitest run src/compiler/renderer/timeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing contract and validator tests**

Add to `src/compiler/typeChecker/validator.test.ts`:

```ts
describe("animate delay", () => {
  it("accepts a non-negative delay", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    animate { property: alpha, to: 0, duration: 1, delay: 0.25 }
  }
}`)).toEqual([]);
  });

  it("accepts an explicit zero delay", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    animate { property: alpha, to: 0, duration: 1, delay: 0 }
  }
}`)).toEqual([]);
  });

  it("rejects a negative delay, naming the value", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    animate { property: alpha, to: 0, duration: 1, delay: -0.5 }
  }
}`)).toEqual([
      "'animate' block on 'circle' object 'c': 'delay' must be 0 or greater, but got -0.5.",
    ]);
  });
});
```

**Before running:** the expected `label` prefix above is a guess at this
codebase's phrasing. Run the test, read the actual label the validator emits for
an `animate` block, and correct the expected string to match reality rather than
adjusting the implementation to match this plan.

- [ ] **Step 6: Run and read the failure**

Run: `npx vitest run src/compiler/typeChecker/validator.test.ts -t "animate delay"`
Expected: FAIL — `delay` reported as an unknown property on `animate`.

- [ ] **Step 7: Add the contract entry and the constraint**

In `src/compiler/languageContract.ts`:
- Add `| Readonly<{ kind: "nonNegative" }>` to `LocalConstraint`.
- Add a `delay` entry to `animateProperties`, after `duration` and before
  `easing`:

```ts
  delay: property(
    "number",
    "Seconds to wait before this animation begins. Applied once, before the first iteration -- a looping animation's period stays 'duration'.",
    "delay: 0.25",
    "0.25",
    { default: 0, constraint: { kind: "nonNegative" } },
  ),
```

In `src/compiler/typeChecker/validator.ts`, add a `case "nonNegative":` arm to
`validateLocalConstraint`'s switch, beside `case "positive":` at line 72,
returning `` `${label}: '${key}' must be 0 or greater, but got ${val.value}.` ``
for a `number` value below zero. Follow `positive`'s precedent of carrying no
bracketed diagnostic code.

- [ ] **Step 8: Run the validator tests**

Run: `npx vitest run src/compiler/typeChecker/validator.test.ts -t "animate delay"`
Expected: PASS, with the label corrected per Step 5's instruction.

- [ ] **Step 9: Thread `delay` through the IR**

- `src/compiler/sceneIR.ts`: add `readonly delay: number;` to `IRAnimation`,
  after `duration`, commented as seconds.
- `src/compiler/typeChecker/builder.ts`: at every site constructing an
  `IRAnimation`, resolve `delay` from the contract default the same way
  `easing`, `loop` and `yoyo` are resolved. Find them with
  `grep -n "handoff:" src/compiler/typeChecker/builder.ts` — every such site
  needs the new field, and TypeScript will fail the build for any that is
  missed.
- `src/compiler/renderer/sceneRuntime.ts:298-307`: add
  `delayTicks: anim.delay <= 0 ? 0 : secondsToTicks(anim.delay),` to the
  `AnimTime` literal, with a comment naming the `secondsToTicks(0) === 1` trap.

- [ ] **Step 10: Run the full suite and the typecheck**

Run: `npx tsc -b --noEmit && npx vitest run`
Expected: PASS. Determinism goldens containing animations **will move** —
`IRAnimation` gained a field. Do not run `vitest -u` yet; read the diff first
and confirm the only change is `"delay": 0` appearing on existing animations.

- [ ] **Step 11: Update the goldens deliberately**

Run: `npx vitest run -u src/compiler/determinism.test.ts`
Then `git diff -- src/compiler/__snapshots__/determinism.test.ts.snap` and
confirm every added line is a `delay` field with value `0`, and that **no other
value moved**. A moved coordinate here means Step 9 changed timing, which it
must not.

- [ ] **Step 12: Verify the delay is actually guarded**

Delete the delay-spending branch from `advanceAnimTime`, run
`npx vitest run`, and record which tests fail and how many. Restore it. Then do
the same for `animProgress`'s `delayTicks > 0` early return **separately** —
Global Constraint 7's corollary: reverting both at once tells you nothing about
which is guarded. Record both numbers in the commit message.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(animate): add delay, applied once before the first iteration"
```

---

### Task 2: `origin` on shapes, visual only

**Tier:** Integration.

**Files:**
- Modify: `src/compiler/languageContract.ts` — `visualProperties` (~line 134-140)
- Modify: `src/compiler/sceneIR.ts:71-82` — `IRVisualBase`
- Modify: `src/compiler/typeChecker/builder.ts:137-227` — the five shape cases
- Modify: `src/compiler/typeChecker/validator.ts:529` — `TYPE_ORIGIN_ON_GROUP`
- Modify: `src/compiler/renderer/builder.ts:43-74, 139-264` — `applyAnchorAndPivot` and the five `localPivot` sites
- Test: `src/compiler/renderer/builder.test.ts`, `src/compiler/typeChecker/validator.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `IRVisualBase.origin: IRPoint` (default `{x: 0.5, y: 0.5}`);
  `__mareyLayout.centreOffsetX` / `centreOffsetY` — the local vector **from the
  pivot to the bounding-box centre**, at scale 1 and rotation 0, which is
  `(0, 0)` at the default origin. Tasks 3 and 4 consume these two fields.

**Why `visualProperties` and `IRVisualBase` are the only edit points.**
`groupProperties` lists its five properties individually and does **not** spread
`visualProperties`; `IRGroupProps` likewise does not extend `IRVisualBase`. So
adding `origin` to each of those two shared definitions gives it to exactly
`circle`, `rectangle`, `polygon`, `line` and `text`, and to no group. Verify
this is still true before relying on it.

- [ ] **Step 1: Write the failing pivot tests**

Add to `src/compiler/renderer/builder.test.ts`, reusing that file's existing
`rect`, `circle` and `group` helpers. Those helpers build `IRObjectProps`
literals, so they need `origin: { x: 0.5, y: 0.5 }` added to their defaults for
the file to typecheck once Step 4 lands.

```ts
describe("origin", () => {
  it("defaults to the bounding-box centre, reproducing the pre-origin pivot", () => {
    const c = buildNode(rect("r", 0, 0, 40, 20));
    expect(c.pivot.x).toBe(20);
    expect(c.pivot.y).toBe(10);
  });

  it("places the pivot at the bottom-centre for origin (0.5, 1)", () => {
    const c = buildNode(rect("r", 0, 0, 40, 20, {
      origin: { x: 0.5, y: 1 },
    } as Partial<IRObjectProps>));
    expect(c.pivot.x).toBe(20);
    expect(c.pivot.y).toBe(20);
  });

  it("records the pivot-to-centre offset, which is zero at the default origin", () => {
    const c = buildNode(rect("r", 0, 0, 40, 20));
    expect(c.__mareyLayout!.centreOffsetX).toBe(0);
    expect(c.__mareyLayout!.centreOffsetY).toBe(0);
  });

  it("records a pivot-to-centre offset pointing up from a bottom origin", () => {
    const c = buildNode(rect("r", 0, 0, 40, 20, {
      origin: { x: 0.5, y: 1 },
    } as Partial<IRObjectProps>));
    expect(c.__mareyLayout!.centreOffsetX).toBe(0);
    expect(c.__mareyLayout!.centreOffsetY).toBe(-10);
  });

  it("offsets a circle's pivot within its 2r bounding box", () => {
    const c = buildNode(circle("c", 0, 0, 10, {
      origin: { x: 0, y: 0 },
    } as Partial<IRObjectProps>));
    expect(c.pivot.x).toBe(0);
    expect(c.pivot.y).toBe(0);
    expect(c.__mareyLayout!.centreOffsetX).toBe(10);
  });

  it("permits an origin outside the bounding box", () => {
    const c = buildNode(rect("r", 0, 0, 40, 20, {
      origin: { x: 0.5, y: 2 },
    } as Partial<IRObjectProps>));
    expect(c.pivot.y).toBe(40);
    expect(c.__mareyLayout!.centreOffsetY).toBe(-30);
  });
});
```

- [ ] **Step 2: Run and read the failure**

Run: `npx vitest run src/compiler/renderer/builder.test.ts -t "origin"`
Expected: FAIL — `origin` is not a property of `IRObjectProps`, and
`centreOffsetX` is not on `__mareyLayout`.

- [ ] **Step 3: Add the contract entry**

In `src/compiler/languageContract.ts`, define an `origin` property beside
`scale` and add it to `visualProperties`:

```ts
const origin = property(
  "point",
  "The point that 'position' places, and that 'scale' and 'rotation' act around, as a fraction of the object's bounding box: (0, 0) is its top-left corner, (1, 1) its bottom-right, (0.5, 0.5) its centre. Values outside 0..1 place the origin outside the box.",
  "origin: (0.5, 1)",
  "(0.5, 0.5)",
  { default: point(0.5, 0.5) },
);
```

No constraint: §4.1 of the spec permits values outside `0..1` deliberately.

- [ ] **Step 4: Add `origin` to the IR and the type-checker builder**

- `src/compiler/sceneIR.ts`: add `readonly origin: IRPoint;` to `IRVisualBase`,
  beside `scale`. Delete the stale `// anchor removed` comment on line 77 while
  you are there — it documents a property that has not existed since Phase 3A.
- `src/compiler/typeChecker/builder.ts`: add
  `origin: resolvePoint(p, "origin", contractPointDefault(<kind>, "origin")),`
  to each of the five shape cases (`circle`, `rectangle`, `polygon`, `line`,
  `text`), matching how `scale` is resolved on the adjacent line. Do **not** add
  it to the `group` case.

- [ ] **Step 5: Move the renderer pivot onto the origin**

In `src/compiler/renderer/builder.ts`:
- Give `applyAnchorAndPivot` the bounding box it currently only receives the
  centre of. The five call sites at lines 146, 159, 185, 223 and 253 each
  already compute the box (`minX`/`minY`/`w`/`h`, or the implied `0,0,2r,2r`
  and `0,0,w,h`); pass origin and box rather than a pre-computed centre, and
  compute `localPivot = bboxMin + origin ⊙ bboxSize` in one place.
- Add `centreOffsetX` / `centreOffsetY` to `__mareyLayout`'s declaration in the
  `declare module "pixi.js"` block, as `bboxCentre − localPivot`.
- The `group` case at line 271 keeps `localPivot = {x: 0, y: 0}` and gets
  `centreOffset` `{x: 0, y: 0}` — D16, unchanged.
- **Change the polygon's `__bodyShape` frame** (lines 202-203): its points
  become relative to the **bounding-box centre**, not to `localPivot`. At the
  default origin these are identical, so this is a no-op refactor today; it is
  what keeps the collision shape independent of a visual property. The
  declaration comment at line 36 already says the shape is centre-relative, so
  it becomes true rather than needing a change.

- [ ] **Step 6: Run the builder tests**

Run: `npx vitest run src/compiler/renderer/builder.test.ts`
Expected: PASS, including every pre-existing test in the file — a default
`origin` must reproduce the old pivots exactly.

- [ ] **Step 7: Write the failing `TYPE_ORIGIN_ON_GROUP` test**

```ts
it("rejects origin on a group, explaining D16's local-origin rule", () => {
  const out = errorsFor(`scene {
  size: (100, 100)
  group g {
    position: (50, 50)
    origin: (0.5, 1)
    circle c { position: (0, 0), radius: 5 }
  }
}`);
  expect(out).toHaveLength(1);
  expect(out[0]).toContain("[TYPE_ORIGIN_ON_GROUP]");
  expect(out[0]).toContain("a group's origin is its own local (0, 0)");
});
```

- [ ] **Step 8: Run and read the failure**

Run: `npx vitest run src/compiler/typeChecker/validator.test.ts -t "TYPE_ORIGIN_ON_GROUP"`
Expected: FAIL — the generic unknown-property message fires instead. **Read
that message.** If it is already adequate, say so in the report rather than
adding a code nobody needs; the spec's §4.2 asks for a named diagnostic, so the
default is to add it, but a controller ruling beats a silent judgement call.

- [ ] **Step 9: Add the targeted diagnostic**

In `src/compiler/typeChecker/validator.ts`, immediately before the unknown-property
push at line 529, special-case `typeName === "group" && key === "origin"` with a
`[TYPE_ORIGIN_ON_GROUP]` message that states the rule and the remedy: a group's
origin is its own local `(0, 0)`, so place its children relative to that point.
Write the sentence out with the real label substituted and read it aloud before
committing to it (AGENT-LESSONS §2e).

- [ ] **Step 10: Full suite, typecheck, goldens**

Run: `npx tsc -b --noEmit && npx vitest run`
Then read the determinism golden diff: every shape gains
`"origin": {"x": 0.5, "y": 0.5}` and **nothing else moves**. Update with
`npx vitest run -u src/compiler/determinism.test.ts` only after reading it.

- [ ] **Step 11: Verify the pivot change is guarded**

Revert `localPivot` to the hard-coded centre for **one shape kind at a time**
(rectangle, then circle, then polygon), running the suite after each, and record
the failure counts separately. Reverting all three at once proves nothing about
which is covered — this is the corollary in AGENT-LESSONS §2c, where two of
three edited gates turned out to be individually unguarded.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(shapes): add origin, a bounding-box-fraction pivot"
```

---

### Task 3: `origin` through the physics seam — placement and write-back

**Tier:** Architecture.

**Files:**
- Modify: `src/compiler/renderer/physicsSync.ts:110, 198, 228`
- Modify: `src/compiler/renderer/builder.ts:120-137` — `collectBodyParts`
- Test: `src/compiler/renderer/physicsSync.test.ts`, `src/compiler/renderer/builder.test.ts`

**Interfaces:**
- Consumes: `__mareyLayout.centreOffsetX` / `centreOffsetY` from Task 2.
- Produces: a shared helper for "this container's bbox centre, in its parent's
  space" — name it and export it from `physicsSync.ts` so Task 4 imports it
  rather than re-deriving the algebra. Task 4's brief names it
  `centreInParent(container): {x, y}`.

**The algebra.** The offset is in the container's own local frame, so it takes
the container's own rotation and scale but not its translation —
`rotateScaleVector` in `transform.ts` is exactly this operation and already
exists for `handoff`. Composing it with `layout.currentPos` gives the centre in
the parent's space; `toWorld` then takes that to scene space as it does today.
At the default origin the offset is `(0, 0)`, so every existing scene follows
the identical path with an added zero — which is why every pre-existing physics
test must stay green unchanged.

- [ ] **Step 1: Write the failing placement test**

Add to `src/compiler/renderer/physicsSync.test.ts`, using that file's existing
fake world (`addCalls`, `scaleCalls`) and its container fixtures — which set
`localPivotX: 0` and will need `centreOffsetX`/`centreOffsetY` added.

```ts
it("places a bottom-origin body at its centre, not at its origin point", () => {
  const world = new FakeWorld();
  // A 40x20 rect at (100, 500) with origin (0.5, 1): its bottom edge sits on
  // y = 500, so its centre is 10px above, at (100, 490).
  const c = containerWithBody({
    currentPos: { x: 100, y: 500 },
    currentScale: { x: 1, y: 1 },
    centreOffsetX: 0,
    centreOffsetY: -10,
  });
  bindPhysicsBodies(c, world);
  expect(world.addCalls[0].x).toBe(100);
  expect(world.addCalls[0].y).toBe(490);
});

it("scales the pivot-to-centre offset with the object's own scale", () => {
  const world = new FakeWorld();
  const c = containerWithBody({
    currentPos: { x: 100, y: 500 },
    currentScale: { x: 1, y: 3 },
    centreOffsetX: 0,
    centreOffsetY: -10,
  });
  bindPhysicsBodies(c, world);
  expect(world.addCalls[0].y).toBe(470);
});

it("leaves a default-origin body exactly where it is today", () => {
  const world = new FakeWorld();
  const c = containerWithBody({
    currentPos: { x: 100, y: 500 },
    currentScale: { x: 1, y: 1 },
    centreOffsetX: 0,
    centreOffsetY: 0,
  });
  bindPhysicsBodies(c, world);
  expect(world.addCalls[0].y).toBe(500);
});
```

The exact shape of `containerWithBody` is whatever that test file already uses
to build a body-owning container; adapt these to it rather than inventing a new
helper.

- [ ] **Step 2: Run and read the failure**

Run: `npx vitest run src/compiler/renderer/physicsSync.test.ts`
Expected: FAIL — the bottom-origin body is placed at y 500 instead of 490.

- [ ] **Step 3: Apply the offset at bind time**

In `physicsSync.ts`, at the `toWorld(t, layout.currentPos.x, layout.currentPos.y)`
call on line 110, pass the container's **centre in parent space** instead of its
`currentPos`. Extract that computation as the exported helper Task 4 will
consume.

- [ ] **Step 4: Run the placement tests**

Run: `npx vitest run src/compiler/renderer/physicsSync.test.ts`
Expected: PASS, with every pre-existing test in the file still green.

- [ ] **Step 5: Write the failing write-back test**

The world reports a body's centre; the container's `currentPos` is its origin
point. A round trip must return the value it started with.

```ts
it("round-trips a bottom-origin container through bind and write-back", () => {
  const world = new FakeWorld();
  const c = containerWithBody({
    currentPos: { x: 100, y: 500 },
    currentScale: { x: 1, y: 1 },
    centreOffsetX: 0,
    centreOffsetY: -10,
  });
  const bindings = bindPhysicsBodies(c, world);
  world.unpinAll();
  // The world reports the centre it was given at bind time.
  world.setReadState(bindings[0].id, { x: 100, y: 490, angle: 0 });
  syncWorldToContainers(bindings, world, 1);
  expect(c.__mareyLayout!.currentPos.y).toBe(500);
});
```

- [ ] **Step 6: Run, implement the inverse, run again**

Run the test and read the failure — expect `currentPos.y` to come back as 490.
Then subtract the same rotated-and-scaled offset after `toLocal` in **both**
`syncWorldToContainers` (line 198) and `snapContainerToBody` (line 228), and
re-run. Both sites, not one: they are two code paths for the same rule, and
AGENT-LESSONS §2 records a Phase 3B fix that was tested on one path while the
identical defect survived in the other with all 370 tests green.

- [ ] **Step 7: Offset the compound parts**

`collectBodyParts` (`builder.ts:128`) composes each child at `layout.currentPos`
— the child's pivot — and `placePart` then places the part there. A part must
sit at the child's **centre**. Apply the same offset when composing `childT`.
Write a test first, in `builder.test.ts`, asserting that a bottom-origin child of
a group produces a part whose `y` is half its height above the child's declared
position — the existing `partsOf` helper and its `{kind, width, height, x, y, angle}`
shape are what to assert against.

- [ ] **Step 8: Full suite and typecheck**

Run: `npx tsc -b --noEmit && npx vitest run`
Expected: PASS. No golden should move in this task — it changes runtime
placement, not the IR.

- [ ] **Step 9: Verify each site separately**

Revert the offset at each of the four sites **individually** — bind, the two
write-back sites, and `collectBodyParts` — running the suite after each and
recording the counts. Four numbers, not one.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "fix(physics): place bodies at the bbox centre when origin moves the pivot"
```

---

### Task 4: `origin` through the physics seam — scale-animation centre tracking

**Tier:** Architecture.

**Files:**
- Modify: `src/compiler/renderer/sceneRuntime.ts:269-279` — `pushAnimToWorld`'s scale branch
- Modify: `src/compiler/renderer/sceneRuntime.ts:255-259` — `pushAnimToWorld`'s position branch
- Test: `src/compiler/renderer/sceneRuntime.test.ts`

**Interfaces:**
- Consumes: `centreInParent` from Task 3; `__mareyLayout.centreOffsetX/Y` from Task 2.
- Produces: nothing later tasks depend on.

**The behaviour this task adds, which is the only genuinely new behaviour in the
phase.** PixiJS scales a container about its **pivot**; Matter's `Body.scale`
scales a body about the body's own **centre**. While the pivot is the centre
these agree and `pushAnimToWorld`'s scale branch needs only `setScale`. With an
origin at the baseline they do not: as the object grows, its drawn centre moves
away from the pivot, while its body's centre stays put. The collision shape and
the drawing drift apart during exactly the "grow from a baseline" idiom this
phase exists to enable. The scale branch must therefore also call `setPosition`
with the recomputed centre.

The position branch needs the same offset for a different reason: it lerps
`startVal`/`targetVal`, which are pivot-relative positions, and hands them to
`toWorld` — so it must add the offset before pushing, exactly as Task 3's bind
path does.

Invariant 3 applies throughout: this branch evaluates at `alpha = 0`
deliberately, and must keep doing so. Nothing here may read `driver.alpha`.

- [ ] **Step 1: Write the failing test**

Add to `src/compiler/renderer/sceneRuntime.test.ts`, using its existing fake
world and its `localPivotX: 0` container fixtures (which gain
`centreOffsetX`/`centreOffsetY`).

```ts
it("moves a bottom-origin body's centre as its scale animation grows it", () => {
  // A 40x20 rect standing on y = 500, origin (0.5, 1), growing 1x -> 3x in y.
  // At scale 1 its centre is 10 above the baseline; at scale 3, 30 above.
  const rt = runtimeWithScaleAnim({
    currentPos: { x: 100, y: 500 },
    centreOffsetX: 0,
    centreOffsetY: -10,
    from: { x: 1, y: 1 },
    to: { x: 1, y: 3 },
    durationTicks: 2,
  });

  rt.advanceOneTick();
  rt.advanceOneTick();

  const last = rt.world.positionCalls.at(-1)!;
  expect(last.y).toBeCloseTo(470, 6);
});

it("does not move a default-origin body's centre when its scale animates", () => {
  const rt = runtimeWithScaleAnim({
    currentPos: { x: 100, y: 500 },
    centreOffsetX: 0,
    centreOffsetY: 0,
    from: { x: 1, y: 1 },
    to: { x: 1, y: 3 },
    durationTicks: 2,
  });

  rt.advanceOneTick();
  rt.advanceOneTick();

  expect(rt.world.positionCalls).toEqual([]);
});
```

The second test is the one that protects every existing scene: with the pivot at
the centre, a scale animation must still push **no** position at all, exactly as
today.

- [ ] **Step 2: Run and read the failure**

Run: `npx vitest run src/compiler/renderer/sceneRuntime.test.ts`
Expected: FAIL on the first test — `positionCalls` is empty, because the scale
branch only calls `setScale` today. Confirm the *second* test passes already;
if it does not, the fixture is wrong, not the code.

- [ ] **Step 3: Implement**

In `pushAnimToWorld`'s scale branch, after `setScale`, recompute the centre from
the **lerped** scale (not the container's current painted scale, which the paint
phase may have written at a non-zero alpha — that is the `spawnAnim` defect
renderer invariant 3 records) and call `setPosition`. Skip the call entirely
when the offset is `(0, 0)`, so a default-origin object's call sequence is
byte-identical to today's.

Then apply the offset in the position branch before `toWorld` at line 255-259.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/compiler/renderer/sceneRuntime.test.ts`
Expected: PASS, both tests, and every pre-existing test in the file.

- [ ] **Step 5: Run the frame-pacing harness**

`sceneRuntime.test.ts` contains a frame-pacing test that runs the same scene for
the same number of ticks at 1, 7 and 12 ticks per frame and requires the world
to see identical calls. Extend it, or add a sibling, covering a bottom-origin
object with a scale animation. This is the test shape that catches
wall-clock leakage, and this task adds a new call into the world from a branch
that previously made none.

- [ ] **Step 6: Full suite and typecheck**

Run: `npx tsc -b --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Verify**

Delete the new `setPosition` call, run the suite, record the count, restore.
Then flip the "skip when the offset is zero" guard to always-call, run the
suite, and record whether anything notices — if nothing does, the second test in
Step 1 is not doing its job and needs strengthening.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "fix(physics): track a bottom-origin body's centre through a scale animation"
```

---

### Task 5: The zero-scale rule and the `animate to` narrowing

**Tier:** Integration.

**Files:**
- Modify: `src/compiler/languageContract.ts` — `LocalConstraint`, `scale`'s constraint
- Modify: `src/compiler/typeChecker/validator.ts:102-109` — the constraint arm; `:408-421` — the animate `to` checks; plus a new tree-aware rule
- Test: `src/compiler/typeChecker/validator.test.ts:656-680` and new cases

**Interfaces:**
- Consumes: nothing from Tasks 1-4.
- Produces: nothing later tasks depend on.

**The rule.** Read spec §2.4 in full before writing any code; this task
implements it and the reasoning is not reproduced here. In brief: negative is
banned everywhere with `TYPE_INVALID_SCALE`; zero is banned only for objects
that **participate in physics**, with `TYPE_ZERO_SCALE_PHYSICS`, under three
clauses — declares `physics` directly or in a sequence step; is a descendant of
a group that declares `physics`; is a group with a physics descendant. Both
rules apply to a declared `scale` **and** to an `animate` block's `to` when
`property: scale`.

- [ ] **Step 1: Write the failing tests for the relaxation**

```ts
describe("zero scale", () => {
  it("permits a zero scale component on a non-physical object", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  rectangle r { position: (50, 50), size: (10, 10), scale: (1, 0) }
}`)).toEqual([]);
  });

  it("permits a zero scale as an animation target on a non-physical object", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  rectangle r {
    position: (50, 50)
    size: (10, 10)
    animate { property: scale, to: (1, 0), duration: 1 }
  }
}`)).toEqual([]);
  });
});
```

- [ ] **Step 2: Write the failing tests for the ban that remains**

```ts
describe("zero scale under physics", () => {
  it("rejects a zero scale on an object that declares physics", () => {
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (50, 50)
    radius: 5
    scale: (1, 0)
    physics { duration: 1 }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("[TYPE_ZERO_SCALE_PHYSICS]");
  });

  it("rejects a zero scale on a group with a physics descendant", () => {
    const out = errorsFor(`scene {
  size: (100, 100)
  group g {
    position: (50, 50)
    scale: (1, 0)
    circle c { position: (0, 0), radius: 5, physics { duration: 1 } }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("[TYPE_ZERO_SCALE_PHYSICS]");
  });

  it("rejects a zero scale on a child of a physics group", () => {
    const out = errorsFor(`scene {
  size: (100, 100)
  group g {
    position: (50, 50)
    physics { duration: 1 }
    circle c { position: (0, 0), radius: 5, scale: (1, 0) }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("[TYPE_ZERO_SCALE_PHYSICS]");
  });

  it("rejects a zero animated scale target on a physical object", () => {
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (50, 50)
    radius: 5
    animate { property: scale, to: (0, 1), duration: 1 }
    physics { duration: 1 }
  }
}`);
    expect(out.filter((e) => e.includes("[TYPE_ZERO_SCALE_PHYSICS]"))).toHaveLength(1);
  });
});
```

Each of these four covers a different clause or a different reach of the rule.
If any passes before Step 5 is written, that clause is not being tested — say so.

- [ ] **Step 3: Write the failing narrowing test**

This is roadmap §5.2's required regression test for the narrowing.

```ts
describe("negative scale (the narrowing)", () => {
  it("rejects a negative animated scale target, which compiled before Phase 3C", () => {
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (50, 50)
    radius: 5
    animate { property: scale, to: (-3, 1), duration: 1 }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("[TYPE_INVALID_SCALE]");
    expect(out[0]).toContain("(-3, 1)");
  });
});
```

The `(-3, 1)` assertion is deliberate: it pins that the diagnostic names the
offending value, so the test cannot pass by way of a neighbouring
`TYPE_INVALID_SCALE` from the declared `scale` property.

- [ ] **Step 4: Run all three groups and read every failure**

Run: `npx vitest run src/compiler/typeChecker/validator.test.ts`
Expected: the relaxation tests FAIL with `TYPE_INVALID_SCALE`; the physics tests
FAIL because `TYPE_ZERO_SCALE_PHYSICS` does not exist; the narrowing test FAILS
because a negative `to` currently compiles clean. **Read all of them.** A test
that fails for the wrong reason is Phase 3B's Task 7 false-green.

- [ ] **Step 5: Implement**

1. In `languageContract.ts`, rename the constraint kind `positiveScale` to
   `nonNegativeScale` in the `LocalConstraint` union and at `scale`'s
   declaration. The kind's name should say what it does.
2. In `validator.ts`'s `validateLocalConstraint`, rename the arm and change it
   to reject `< 0` rather than `<= 0`. **Reword both messages** — see spec §5.1:
   "must be greater than zero" is false once zero is legal, and an author who
   reads it writes `0.001`, which is the workaround this phase deletes. The new
   wording must name negativity and must not mention zero.
3. Update the two pinned message assertions at `validator.test.ts:656-680` to
   the new wording, and add a case proving `scale: 0` on a non-physical object
   is now accepted.
4. Add the tree-aware zero rule. The validator already walks ancestry for
   `TYPE_PHYSICS_IN_PHYSICS_GROUP` and `TYPE_PHYSICS_IN_ANIMATED_GROUP` — find
   that traversal and extend it rather than adding a second walk.
5. Extend the animate `to` checks at `validator.ts:408-421` so a
   `property: scale` target goes through both rules.

- [ ] **Step 6: Run the suite**

Run: `npx tsc -b --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Confirm nothing first-party relied on the old rule**

Run, and record the output:

```bash
grep -rn "scale" eval/scenes eval/scenes-r2 eval/scenes-3b \
  tools/visual-check/scenes src/store/defaultScene.ts docs/LANGUAGE.md
```

Re-derive this yourself; do not carry forward any claim that "no first-party
file uses a negative or zero animated scale."

- [ ] **Step 8: Verify each clause separately**

Neutralise each of the three participation clauses **individually** and run the
suite, recording three separate counts. Then neutralise the `to`-side check
alone. Four numbers.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(scale): permit a zero component where it reaches no divisor"
```

---

### Task 6: Reference, fixtures, corpora, and the exit-criteria evidence

**Tier:** Integration.

**Files:**
- Modify: `docs/LANGUAGE.md`
- Create: `tools/visual-check/scenes/bars-reveal.marey`, `timeline-sweep.marey`, `ring-pulse.marey`
- Modify: `docs/architecture/README.md`, `docs/architecture/roadmap-and-process.md`
- Modify: `docs/plans/2026-09-09-phase-3c-motion-primitives.md` — Execution notes

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: the evidence table the phase is judged on.

- [ ] **Step 1: Document the three surfaces in the reference**

`docs/LANGUAGE.md` documents **behaviour only** — per-property tables are
deliberately absent, because a later phase generates them from
`LANGUAGE_CONTRACT`. So add behavioural prose, not a property table: what a
delay does to a looping animation's period, what `origin` means and that it is
not available on a group, and the zero-versus-negative scale rule with its
physics scoping.

Its fences are compiled by `languageDocs.test.ts`, which also rejects any fence
tag other than `marey` or `text`. A worked example that does not compile fails
the suite — that is the intended failure.

- [ ] **Step 2: Run the doc tests**

Run: `npx vitest run src/compiler/languageDocs.test.ts`
Expected: PASS.

- [ ] **Step 3: Rewrite the three explainer scenes without workarounds**

The originals are in `.visual-check/explainer/` (gitignored, throwaway).
`bars-reveal.marey` contains both workarounds: a no-op `sequence` first step
whose `duration` encodes a delay, and a `parallel` moving `position` and `scale`
together with a hand-computed centre. Rewrite it so the `sequence` and the
`parallel` are both gone — one `animate scale` with a `delay` and
`origin: (0.5, 1)` — and record the before and after line counts.

Add a fourth scene proving exit criterion 3: generated objects sharing one
constant `duration`, differing only in `delay`, forming a travelling wave.

Copy all four into `tools/visual-check/scenes/`.

- [ ] **Step 4: Compile the new fixtures headlessly**

```bash
EVAL_DIR=tools/visual-check/scenes npx vitest run --config eval/vitest.config.ts
```

Expected: every scene compiles clean. Note that this writes a report JSON beside
the directory; delete it if it is not wanted in the commit.

- [ ] **Step 5: Confirm both authorability corpora are untouched**

```bash
npx vitest run --config eval/vitest.config.ts
EVAL_DIR=eval/scenes-r2 npx vitest run --config eval/vitest.config.ts
EVAL_DIR=eval/scenes-3b npx vitest run --config eval/vitest.config.ts
git diff --stat -- eval/report.json eval/report-r2.json eval/report-3b.json
```

Expected: 20/20, 20/20, 3/3, and an **empty** diffstat — checked after the runs
have regenerated the files, not before. `git diff --stat`, never `git status`.

- [ ] **Step 6: Browser check**

Read `tools/visual-check/SKILL.md` first. Then:

```bash
npx vite --port 5199 --strictPort   # leave running
node tools/visual-check/check.mjs \
  --scene tools/visual-check/scenes/bars-reveal.marey \
  --at 300,1200,2400 --settle 6000 --out .visual-check/3c-bars
```

`--strictPort` is not optional: without it Vite walks to the next free port
while `check.mjs` still targets 5199, so a stale server absorbs every capture
and reports a confident pass without exercising your code. That has happened
twice. Repeat for the phase-offset scene. **Look at the PNGs**, not just the
JSON — a bar anchored to the wrong edge still compiles, still type-checks, and
is only visible in the geometry. Kill the server afterwards and confirm port
5199 is free.

- [ ] **Step 7: Production build**

Run: `npm run build`
Expected: exit 0, with only the pre-existing >500 kB chunk-size advisory and the
`vite:preact-jsx` esbuild-deprecation notice.

- [ ] **Step 8: Update both phase-status locations**

`docs/architecture/README.md`'s "Current phase" line and
`roadmap-and-process.md`'s phase-history bullet both state the phase, and
**all three transitions so far have shipped stale** (AGENT-LESSONS §5b). Update
both in this task, and delete any branch reference that no longer exists.
Treat this as part of finishing the phase, not as cleanup afterwards — the
evidence is that it never happens afterwards.

- [ ] **Step 9: Write the Execution notes**

Append an "Execution notes" section to this plan, following the structure of
`2026-09-02-phase-3b-generative-expressiveness.md`: final evidence table with
every number re-derived on a clean tree, exit criteria each with its settling
evidence, defects found in source beyond the plan, defects found in this plan,
deliberate deferrals each with what makes it harmless *today*, goldens moved,
and the mutation-test table.

Every number must be re-run while writing, not carried forward from a task
report. The report is a claim; the diff is the evidence.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "docs(3c): reference, regression fixtures, and phase evidence"
```

---

## Self-review

**Spec coverage.** §2 (the invariant) → Task 5, and the written answer is the
spec itself, which is already committed. §3 (`delay`) → Task 1. §4.1-4.3
(`origin`, pivot) → Task 2. §4.2 (not on group) → Task 2 Steps 7-9. §4.4
(physics seam) → Tasks 3 and 4. §5 (diagnostics) → Tasks 2 and 5. §5.1 (message
rewording) → Task 5 Step 5. §5.4 (the narrowing) → Task 5 Step 3. §6
(verification obligations) → Global Constraints 5-7 plus each task's verify
step; §6.1 goldens → Tasks 1 and 2; §6.6 Chromium → Task 6 Step 6. §7 (exit
criteria) → Task 6. §8 (task shape) → this plan's six tasks and their tiers.

**Gap found and closed during this review:** the spec's §6.3 requires flipping
`origin`'s default to the other answer and confirming the suite notices. Task 2
Step 11 reverts the pivot per shape kind, which is a different check. The
default-flip belongs with it and is folded into that step's instruction as a
separate recorded number — implementers should treat "revert per kind" and
"flip the default" as two distinct verifications with two distinct counts.

**Placeholder scan:** no TBD, TODO, "handle edge cases", or "similar to Task N".
Task 3's `containerWithBody` and Task 4's `runtimeWithScaleAnim` are explicitly
flagged as "adapt to whatever that test file already uses" rather than left as
undefined helpers.

**Type consistency:** `centreOffsetX`/`centreOffsetY` are introduced in Task 2's
Interfaces block and consumed under those exact names in Tasks 3 and 4.
`centreInParent` is produced by Task 3 and consumed by Task 4 under that name.
`IRVisualBase.origin` is `IRPoint`, matching `scale`'s type on the adjacent
line. `LocalConstraint` gains `nonNegative` in Task 1 and `positiveScale`
becomes `nonNegativeScale` in Task 5 — two separate edits to the same union, in
that order.

---

## Execution notes

Written 2026-09-10 at the close of Task 6, from `git diff f367544..HEAD`, the
five task reports, and the SDD ledger
(`.sdd/2026-09-09-phase-3c-motion-primitives/progress.md`) — **not**
from any single task's self-report. Every number in "Final evidence" and every
row marked *(re-run)* in "Mutation tests" was re-derived first-hand on a clean
tree while writing this, with each mutated file restored afterwards and
`git diff --stat` confirmed empty. Where a figure is quoted from the ledger
rather than re-run here, it says so.

**Two figures moved between the task reports and this re-derivation, and the
observation wins.** Task 1 recorded 4 failures for reverting `advanceAnimTime`'s
delay branch; it is **7** now. Task 2 recorded 3 for flipping `origin`'s
default; it is **7** now. Neither is a discrepancy — both were measured against
a smaller suite, and the tests Tasks 3, 4 and 6 added along the same seams pick
the mutations up too. A count is only meaningful beside the suite size it was
taken against, which is why every row below carries one.

### Final evidence

| Check | Command | Result |
|---|---|---|
| Unit suite | `npx vitest run` | **20 files / 677 tests / exit 0** |
| Typecheck | `npx tsc -b --noEmit` | exit 0 |
| Production build | `npm run build` | exit 0; only the pre-existing >500 kB chunk-size advisory and the `vite:preact-jsx` esbuild-deprecation notice |
| Reference examples | `npx vitest run src/compiler/languageDocs.test.ts` | 45/45 — 16 `marey` fences compiled, up from 14 |
| R1 corpus | `npx vitest run --config eval/vitest.config.ts` | **20/20 compiled clean (100%)** |
| R2 corpus | `EVAL_DIR=eval/scenes-r2 npx vitest run --config eval/vitest.config.ts` | **20/20 compiled clean (100%)** |
| 3B demonstration corpus | `EVAL_DIR=eval/scenes-3b npx vitest run --config eval/vitest.config.ts` | **3/3 compiled clean (100%)** |
| Reports unmoved | `git diff --stat -- eval/report.json eval/report-r2.json eval/report-3b.json` | empty — checked **after** all three runs had regenerated all three files, and with `git diff`, never `git status` (AGENT-LESSONS §6) |
| Visual-check fixtures | `EVAL_DIR=tools/visual-check/scenes npx vitest run --config eval/vitest.config.ts` | **17/17 compiled clean** — the 12 standing scenes plus this phase's 5. Its report JSON was deleted rather than committed |
| Tree | `git ls-files --others --exclude-standard`; `git diff --stat` | no stray files; no probe or scratch file survives — the one written while checking the sequence-delay claim (`src/compiler/__probe_seqdelay.test.ts`) was deleted, and the suite count above is the proof |

Branch shape: **11 commits**, `f367544..HEAD`. The ten implementation commits,
`f367544..106683e`, are **20 files, +3,820 / −92**; this documentation commit
adds the reference prose, five fixtures, three tests and these notes on top of
that.

*A single total for the whole branch is deliberately not quoted here.* It would
count the line that quotes it, and the two attempts at it made while writing
this were each wrong by exactly the size of their own correction — a small,
self-inflicted instance of AGENT-LESSONS §1, recorded rather than quietly
fixed. The two figures above are stable because neither is measured over a file
this section lives in.

**Baseline check.** The suite at the branch base `f367544` was 20 files / 604
tests; at Task 6's start it was 20 files / 672. This task added 5: two compiled
`marey` fences in `docs/LANGUAGE.md`, two facts about `delay` that nothing else
pinned, and one structural pin on D16's group offset. Net for the phase:
**+73 tests, no new test file.**

**Chromium** (`visual-check`, headless Chromium on SwiftShader, dev server
started with `npx vite --port 5199 --strictPort`, killed afterwards and the port
confirmed to have no `LISTENING` socket):

| Scene | compiled | rendered | frozen at rest | cpu at rest | deterministic across a cold reload | page errors |
|---|---|---|---|---|---|---|
| `bars-reveal` | true | true | **true** | 0.018 s / 2 s wall | **true** — `3e5445fea1fac6d9` in both runs | 0 |
| `origin-physics` | true | true | **true** | 0.018 s / 2 s wall | **true** — `420e63c2e46dd1a0` in both runs | 0 |
| `wave-row` | true | true | false | 0.071 s | n/a — `loop: true` never comes to rest, so both measures are meaningless here, and `SKILL.md` says so | 0 |
| `ring-pulse` | true | true | false | 0.060 s | n/a — same reason | 0 |
| `timeline-sweep` | true | true | false | 0.068 s | n/a — same reason | 0 |

**The PNGs were looked at, not just the JSON**, and this is the first point in
the phase at which that was possible at all: every pre-existing `.marey` file
uses the default origin, so before these fixtures existed a capture would have
exercised the added-zero path and proved nothing. Task 3 and Task 5 each filed
exactly that, and this is where it is closed.

- `bars-reveal` at 300 ms: four bars drawn, three still absent, the fourth
  mid-growth — a stagger caught in the act. At rest: seven bars in the ratio
  3:7:2:9:5:8:4, **each standing on the grey rule rather than straddling it**.
  That is the whole of the origin check: a bar anchored at its centre would sit
  half-buried below the rule and would still compile, still type-check, and
  still produce nine IR nodes.
- `origin-physics` at rest: the blue pillar has **fallen and landed standing on
  the ledge**, its bottom edge flush with the deck — the bind-time placement
  reconciliation. The amber bar has **grown upward out of the deck** with its
  bottom edge unmoved, and the white rider ball has been **carried up and rests
  on the bar's top edge** — the scale-animation centre tracking. Untracked, the
  bar's collider would have grown downward through the ledge as much as upward,
  and the ball would have stopped about 80 px short with the bar drawn through
  it.
- `wave-row` at 1000 ms and at 1800 ms: a single smooth S-curve spanning the
  row, and the same curve **translated along the row** in the later frame. One
  wavelength, one period, phase moving — criterion 3, in a form a still frame
  can carry.
- `ring-pulse` at 1100 ms: dot sizes vary smoothly around the ring, largest at
  the top and smallest at the bottom, with a monotone gradient down each side.
- `timeline-sweep` at 1600 ms: eleven ticks with the three majors at ordinals
  0, 5 and 10 in amber, and the playhead mid-sweep.

### Exit criteria (design §7), each with the evidence that settles it

| # | Criterion | Evidence |
|---|---|---|
| 1 | A staggered reveal across generated objects needs no no-op `sequence` step | `bars-reveal` rewritten: `grep -c 'sequence {'` **1 → 0**, `'parallel {'` **1 → 0**, `'animate {'` **3 → 1**. Code lines, excluding comments and blanks, **55 → 41 (−25%)**. The throwaway version is preserved at `.visual-check/explainer/bars-reveal.marey` (gitignored) as the "before" these were measured against |
| 2 | A bar grows from a baseline without a hand-computed centre coordinate | The same rewrite. The workaround line `to: (step * (i + 1), baseline - (v * unit) / 2)` is gone, and with it the second `animate` that carried it; `origin: (0.5, 1)` replaces both. `scale: (1, 0.001)` and `to: (1, 0.001)` became `scale: (1, 0)` and `to: (1, 1)`. Confirmed in the browser, not only in the source — see the `bars-reveal` capture above |
| 3 | A fixed-period phase-offset animation is expressible | `wave-row.marey`: one `duration` shared by fifteen generated beads, `delay: i * cycle / count` the only thing that varies. Rendered and **seen to travel** — two captures 800 ms apart show the same waveform displaced along the row. `ring-pulse.marey` is the same property in the scene that originally documented its absence: its `duration: 0.7 + i / 14` workaround, which changed each dot's *period*, is now a constant `duration: period` with the offset in `delay` |
| 4 | `TYPE_INVALID_SCALE`'s invariant is documented, and any narrowing has a regression test | Design §2, committed at `b084873` before any code. The narrowing — `to: (-3, 1)` compiled on `main` and does not now — is pinned by `"rejects a negative animated scale target, which compiled before Phase 3C"`, which asserts the code **and** the value `(-3, 1)`, so it cannot pass by way of a neighbouring declared-scale diagnostic. Neutralising the `to`-side rules fails 4 tests (mutation F). §2.4a, added at Task 6, records the rule's measured over-rejection as a deliberate cost |
| 5 | The three canonical scenes and both authorability corpora stay green | 20/20, 20/20, 3/3, all three report JSONs content-unchanged after regeneration. **`git diff f367544..HEAD -- .eval` is empty**: not one corpus file was touched by this phase, so the evidence they carry is untouched |
| + | The three explainer scenes are promoted to `tools/visual-check/scenes/` in workaround-free form | Done, plus two more — see "Five scenes, not four" below |

### Five scenes, not four

Task 6's brief asks for the three explainers rewritten plus "a fourth scene
proving exit criterion 3", and separately requires the capture set to include a
bottom-origin object **under physics**. Those two cannot both be four files:
none of the three explainers has physics, and a bar that grows from
`scale: (1, 0)` cannot acquire it — that is `TYPE_ZERO_SCALE_PHYSICS` by this
phase's own rule. So the set is five:

| Scene | Carries |
|---|---|
| `bars-reveal.marey` | Criteria 1 and 2 — rewritten, both workarounds gone |
| `ring-pulse.marey` | Rewritten: its varying-`duration` workaround replaced by a constant `duration` and a varying `delay` |
| `timeline-sweep.marey` | The control. It is the one of the three that needed no workaround, so it is promoted unchanged in substance and its header says why |
| `wave-row.marey` | The brief's fourth scene: criterion 3, deliberately a row rather than a ring, because a still frame shows a row's phase gradient and does not show a ring's |
| `origin-physics.marey` | `origin` × physics, both halves — placement and scale tracking. Nothing else in the repository exercises that seam in a browser |

### Defects found in source beyond the plan

Each names where it was fixed.

1. **`docs/architecture/renderer.md` stated a falsehood the same commit
   created.** "Every visual's pivot is the centre of its bounding box" is true
   only at the default origin, and the paragraph cited a line number Task 2's
   own edits had moved. Load-bearing rather than cosmetic: `README.md` orders
   every agent touching `src/compiler/renderer/` to read that file first, and
   Tasks 3 and 4 are exactly such agents — they would have been briefed off a
   document Task 2 had falsified. Fixed in `0056e75`.
2. **`LANGUAGE_CONTRACT` contradicted itself.** `centerPosition` and
   `bboxMidpointPosition` — Monaco hover strings, so user-visible — still
   promised that `position` places the geometric centre. A self-contradiction
   inside the single source of truth is the exact class of defect Global
   Constraint 1 exists to prevent. Fixed in `0056e75`.
3. **The exported `centreInParent` would have walked Task 4 into an
   invariant-3 violation.** It reads `container.rotation`, `layout.currentPos`
   **and** `layout.currentScale`, all last written by the *paint* phase at
   wall-clock alpha. Harmless at its two build-time call sites; a tick-phase
   caller would have leaked the wall clock into the physics world. Found by
   Task 3's review and fixed **structurally** rather than by comment: the
   tick-safe entry point `centreOffsetVector(layout, rot, scale)` takes every
   mutable input as a parameter and reads only `centreOffsetX/Y`, which is
   written once at construction and mutated nowhere, so there is no route from
   inside it to alpha-dependent state the caller did not choose to pass
   (`5c14e56`). The implementer found the third of the three reads itself — the
   review had named two, and the third was `applyAnim`'s write to
   `currentScale`, which is precisely the one the scale-animation task would
   have hit.
4. **An invariant-3 leak on the freeze path**, in Task 3's code, found by Task
   4's review. `snapContainerToBody` fed paint-written `layout.currentScale`
   into the pivot correction while a scale animation was live, so a frozen
   bottom-origin object's drawn position was frame-rate dependent by about a
   tick of offset growth. It survived the new frame-pacing coverage because
   every other pacing subject uses `duration: indefinitely`, so
   `snapContainerToBody` never fired at all. Fixed in `fa7facc` by making
   `tickScale` a **required** parameter — an optional one defaulting to
   `layout.currentScale` is the shape that readmits the bug.
5. **A scale base that goes stale when scale ownership moves between runners.**
   Two live scale runners each read the body's centre and pushed `before + Δᵢ`,
   so the world received `Δ_A + Δ_B` while `setScale` landed only one absolute
   value — the collider walks off the drawing. Fixing it exposed a second,
   latent defect independent of two-runner scenes: a *per-runner* base is wrong
   whenever a short runner completes and a long one takes over. Replaced with a
   per-container ledger seeded from the bindings plus a designated owner
   (`fa7facc`). Introduced by Task 4 and closed inside it.
6. **A comment that claimed more than was true** (AGENT-LESSONS §2c rung 5).
   `tickScaleOf`'s `completedThisTick` term was documented as redundant *by
   construction*. It is load-bearing with two runners in array order
   `[live, completing]`. The zero-failure result that produced the claim was a
   property of the test corpus, not of construction: after the two-runner test
   landed, reverting the same term fails **5** tests. Comment rewritten in
   `fa7facc`; the code never changed.
7. **`renderer.md` claimed a completeness the code lacked** — it enumerated the
   container→body handoffs as exhaustive while `pushAnimToWorld` was
   unreconciled. Corrected to "four of the five" with the fifth named, then to
   "all five" once Task 4 closed it.
8. **Seven required behaviours had no test at all** (AGENT-LESSONS §2c rung 4),
   each found by deleting the line and running the suite, none by reading:
   `builder.ts`'s `delay` resolution and `sceneRuntime.ts`'s `delayTicks`
   conversion (612/612 green with each hardcoded wrong), the `polygon` and
   `line` origin call sites (622/622 and 623/623 green when reverted to a fixed
   centre), `worldScale` recorded only when actually pushing (651/651), the
   position branch's offset **rotation** (652/652), and — found in this task —
   D16's rule that a group's `centreOffset` is unconditionally `(0, 0)`
   (mutation B below: before the pin, deriving a group's pivot from its
   children left the whole suite green).
9. **`docs/LANGUAGE.md` carried seven line-number citations this phase's own
   commits falsified.** `validateLocalConstraint` moved from `:47-172` to
   `:203-334`, `TYPE_TEXT_TOO_LONG` from `:113` to `:275`, the text-node ceiling
   from `:176`/`:202-208` to `:338`/`:363-372`, the 50-error cap from `:185` to
   `:347`, the physics limits from `:587-606` to `:786-805`, the
   animatable-property check from `:410` to `:567`, and `ANIMATABLE_PROPERTIES`
   from `languageContract.ts:52` to `:59`. All seven re-derived by reading the
   files and corrected in this task. The parser citations were re-checked in the
   same pass and are all still accurate — this phase did not touch `parser/`.

### Defects found in this plan

1. **Task 3 Step 5's fake-world API does not exist.** `world.unpinAll()` and
   `world.setReadState(...)` were the controller's guesses at a fake it had
   never read; the real `FakeWorld` offers `unpin(id, reason)` and
   `setState(id, state)`. Ruled adapt-to-reality before dispatch: preserve the
   *assertions*, not the spellings.
2. **Task 4's central assertion could not have been observed.** The plan names
   `runtimeWithScaleAnim` and `world.positionCalls`; neither exists, and worse,
   `RecordingWorld.setPosition(_id, _x, _y)` is a no-op stub with
   underscore-prefixed parameters that **records nothing**. The task's headline
   test needed recording added to the fake before it could fail for the right
   reason. Found by the controller reading the fake during Task 2's fix round
   and carried into the Task 4 dispatch.
3. **Task 4's Interfaces block specified the defect in source-item 3 above.**
   "Consumes: `centreInParent` from Task 3" is exactly the import that would
   have leaked paint-phase state into the tick phase. This plan's own type
   consistency check confirmed the *name* matched across tasks, which is a
   weaker property than it looks: the names agreed and the semantics did not.
4. **The controller predicted two test files would go RED, and was wrong about
   both, twice.** `constants.test.ts` enumerates nothing structurally — its only
   contract-derived content is `propertySections()`, which regenerates itself.
   `languageContract.test.ts`'s gap check fires only on an optional property
   with **neither** a `default` nor a `derivedDefault`, and both `delay` and
   `origin` have defaults. Both implementers checked rather than assuming, and
   said so; recorded here because a prediction asserted from a test's *purpose*
   rather than its *assertions* is a controller error, not an implementer one.
5. **Task 2 Step 1's first test is a regression pin, not a RED step.** "defaults
   to the bounding-box centre" asserts today's behaviour and passes before any
   work; the file's RED comes from the type error. Caught in the pre-flight scan
   and ruled before dispatch, so no implementer read its passing as progress.
6. **Task 5 Step 5.4's "extend the existing traversal" cannot be done.** The
   traversal it names is anchored on a `physics` node and walks **upward**;
   clause 2 is an upward walk anchored on the *object*, and clause 3 is a
   **downward** walk from a group. One loop cannot serve all three. The
   implementer said so rather than forcing it, and extracted the part that
   genuinely was shared — the D13 owner walk, now `ownerIndex()`, called from
   both the `physics` and `animate` branches instead of hand-copied.
7. **Task 6's own brief is short by one file, in two places.** Its file list
   omits the design spec, which its own carried item requires editing beside
   §2.4; and its Step 3 asks for four scenes while its Step 6 capture set needs
   a physics scene that none of the four can be. Both were resolved before
   dispatch and are recorded above.

### Deliberate gaps and deferrals

Each with what makes it harmless *today*, per AGENT-LESSONS §7 — not merely
inconvenient to fix.

| Deferred | Why it is safe to defer |
|---|---|
| **`TYPE_ZERO_SCALE_PHYSICS` over-rejects** a zero animated `to` on a child of a physics group, and a zero declared `scale` on a rectangle or circle child of one | A **spurious rejection carrying a named diagnostic**, not silent data loss: the author sees the error at the offending line. Design §2.4 chose one teachable rule over a minimal one *in writing*, so this is a measured cost rather than an oversight, and §2.4a now records it beside the rule with its reasoning and the shape any future narrowing should take. Re-verified in this task that no first-party `.marey` file has the shape. The cost stated honestly: in that one nested case an author must still write `0.001` |
| The `readState`-before-`setScale` ordering in `pushAnimToWorld`'s scale branch is **untested** | **Re-graded by the whole-branch review; the earlier grade of "unreachable" was false.** *Reachable:* the vector that read is protecting — a body's own centre-of-mass → bbox-centre offset, `rec.offsetX/Y` — is non-zero for a compound **and for any asymmetric polygon**, because `polygonBodyAtBboxCentre` (`renderer/physicsWorld.ts:238-250`) places the polygon's *bbox centre* at the requested point while `Bodies.fromVertices` places its *centre of mass*, leaving `addBody`'s `x - body.position.x` (`renderer/physicsWorld.ts:354`) equal to the gap — 7.5 px for the default scene's own triangle. `polygon` + `origin` + `physics` + `animate scale` is ordinary source (`tumble.marey` already proves `polygon` + `physics` is legal), so the branch runs with a non-zero offset. What *is* unreachable is only the **compound** half: `origin` on a group is `TYPE_ORIGIN_ON_GROUP` and D16 hard-codes a group's `centreOffset` to `(0, 0)`, so `tracksCentre` is false for every compound (`renderer/builder.ts:367`, mutation B). *Correct by construction:* `setPosition` subtracts the new offset from a base that still carries the old one, so the bbox centre moves by exactly the intended delta; reading *after* `setScale` would be the wrong one. *Untested:* `RecordingWorld.readState` (`renderer/sceneRuntime.test.ts:60-63`) models no offset at all, so reverting the ordering fails nothing. See the fixture filed below |
| `text`'s origin call site has no headless test | PixiJS `Text` needs a canvas, which `builder.test.ts`'s header comment has recorded since before this phase. The arithmetic is shared with the four kinds that *are* pinned — one `applyAnchorAndPivot`, five call sites — so what is unguarded is the call, not the rule. The browser path covers it |
| The two write-back sites duplicate ~8 lines | A **deliberate** non-extraction, with a comment saying so. Merging `syncWorldToContainers` and `snapContainerToBody` would collapse two independently-revertible sites into one and destroy the per-site check that proved them separately guarded — the exact failure AGENT-LESSONS §2 records from Phase 3B |
| A delayed bottom-origin scale animation pushes a zero-delta `setPosition` on every delay tick | A true numeric no-op, and deterministic. `delay × origin × scale` is a newly expressible combination with no test of its own |
| The dead `!previous` guard in `pushAnimToWorld` | Unreachable, but **not for the reason first recorded here**: `spawnAnim` no longer touches the `worldScale` ledger at all. The live reason is that the `SceneRuntime` constructor seeds `worldScale` for every binding, and `bindPhysicsBodies` only binds a container that has a `__mareyLayout` — so any container that can reach this line already has an entry |
| `centreInParent`'s layout-less `{x: 0, y: 0}` return is an absolute point, not a null offset | Unreachable, but from **two** production call sites, not four: `renderer/builder.ts:183` (`collectBodyParts`) and `renderer/physicsSync.ts:177` (`bindPhysicsBodies`), each of which guards on `layout` first. The "four" was Task 3's four *handoff sites*, and the other two never call this function. TypeScript rejects deleting the branch, so a revert check is impossible in the §2f sense, and its *contract* is pinned by a direct unit test instead |
| The zero rule is gated on a hardcoded `key === "scale"` rather than on the constraint kind | The sign half **is** contract-driven; the zero half cannot be a `LocalConstraint` at all, because it depends on the object's place in the tree rather than on the value. A contract flag meaning "this property also has a tree rule" is a design question, not a rename |
| `physicsParticipationReason`'s ancestor walk duplicates `TYPE_LINE_PHYSICS`'s | Behaviour-identical today; unifying them is a refactor with no behavioural claim attached |
| The clause *order* in `physicsParticipationReason` is unpinned | The §2f result, established rather than asserted: two clauses can only match the same object when physics nests inside physics, and D17 rejects every such program with `TYPE_PHYSICS_IN_PHYSICS_GROUP`. There is no clean source whose diagnostic differs between the orders, so a test would have to be written against source that is invalid for an unrelated reason. The reasoning sits in a comment beside the ordering, not only in a report |
| One-tick lag between the centre correction and a concurrent rotation animation | `overrideAngle` is applied inside `step()`, so the offset uses the previous tick's angle. Deterministic and frame-rate independent — the same one-tick cost `pushAnimToWorld` already documents for position. Closing it needs a getter on `IPhysicsWorld` |
| `applyAnchorAndPivot` returns a value five of its six callers discard | Cosmetic |
| `from` on `animate`, `stagger`, mirroring via negative scale, `origin` on `group` | Design §9 — deliberate scope, argued there. `stagger` is roadmap Phase 7 and explicitly conditioned on "`delay` having landed in 3C", which it now has |

**Filed for the next phase — the single highest-value test this branch does not
have.** A **`MatterWorld`-level fixture with a `polygon` carrying an `origin`, a
`physics` block, and an `animate scale`.** Filing rather than writing it is a
controller ruling: the code is verified correct, so this closes a *test gap*
rather than a defect, and one scoped re-review remains with no fix wave after
it — a new `MatterWorld` test surface would land under the thinnest review of
the phase.

- **The scene shape.** A single asymmetric `polygon` — the default scene's own
  triangle `[(0, -30), (26, 15), (-26, 15)]` does it: bbox centre `(0, -7.5)`,
  centroid `(0, 0)`, so `rec.offsetY` is 7.5 — with `origin: (0.5, 1)`, a
  `physics` block, and
  `animate { property: scale }`. `tools/visual-check/scenes/tumble.marey`
  already proves `polygon` + `physics` compiles; `origin-physics.marey` proves
  `origin` + `physics` + `animate scale` does. Nothing rejects the combination.
- **Why `RecordingWorld` cannot see it.** `renderer/sceneRuntime.test.ts:60-63`
  returns whatever `setPosition` last recorded, with **no** centre-of-mass offset
  modelled and no `setScale` effect on it — so the whole
  `readState`-before-`setScale` ordering is invisible to it, and swapping the two
  statements leaves the suite green. Only a real `MatterWorld` has `rec.offsetX/Y`
  and only `Matter.Body.scale` rescales them.
- **What the test would assert.** Drive the runtime against a real `MatterWorld`
  for the scale animation's ticks and assert the body's **bounding-box centre**
  (`boundsOf`, or `readState`, which already adds `rotatedOffset`) tracks the
  drawn bbox centre — i.e. the polygon's bottom edge stays put as it grows.
  Reverting the ordering to read *after* `setScale` must fail it; that revert is
  the check the current suite cannot make.

### Goldens

`sceneIR.ts` gained two fields, so goldens **moved, and that was the expected
result** — the inverse of Phase 3B, where an unmoved golden was the evidence.

`git diff f367544..HEAD -- src/compiler/__snapshots__/determinism.test.ts.snap`
is **122 added lines and zero deleted lines.** Zero deletions is the
load-bearing half: not one coordinate, tick count, duration or layer moved
anywhere in any of the three snapshots. The additions are exactly:

- **10 × `"delay": 0`** — one per `IRAnimation` the golden sources produce
  (Task 1, `d55e765`).
- **28 × `"origin": { "x": 0.5, "y": 0.5 }`**, 112 lines across four
  indentation levels — one per shape (Task 2, `f1bbbe4`).

`10 + 28 × 4 = 122`. ✓ Both diffs were read in full before `vitest -u` was run,
and the "no other value moved" claim was checked against the whole hunk rather
than the diff's tail, because a moved coordinate would have meant the change had
altered timing or placement. Tasks 3, 4, 5 and 6 moved no golden at all — they
change runtime behaviour and validation, not the IR.

### Mutation tests

Rows A–G were **re-run first-hand while writing these notes**, on a clean tree
at Task 6's HEAD, each mutation applied alone and the file restored afterwards
with `git diff --stat` confirmed empty. Every count is against the **677**-test
suite. Rows marked *(ledger)* are the checks performed during the tasks
themselves, against the smaller suites named beside them.

| # | Mutation | Observed |
|---|---|---|
| A *(re-run)* | `typeChecker/builder.ts`'s `delay` resolution hardcoded to `0` | **3 failed / 674.** `resolves an animation's explicit delay into the IR`, plus both of Task 6's new `LANGUAGE.md · Animation · delay` facts. At Task 1 this same mutation left **612/612 green** — the wiring between the contract and the IR had no test at all |
| B *(re-run)* | A group's pivot derived from its children's bounds instead of D16's fixed `(0, 0)` | **1 failed / 676**, and it is the pin added in this task. Before it, the suite had **no opinion** about a rule three separate mechanisms depend on — including the one that keeps `pushAnimToWorld`'s centre correction off compounds. (That is narrower than this row first claimed: it does not make the read-order question unreachable in general — see the deferrals table) |
| C *(re-run)* | `advanceAnimTime`'s delay-spending branch deleted | **7 failed / 670.** Was 4 of 612 at Task 1; the tests Tasks 4 and 6 added along the same seam pick it up too |
| D *(re-run)* | `animProgress`'s `delayTicks > 0` early return deleted | **1 failed / 676** — `holds progress at exactly 0 during the delay, at any sub-tick alpha`. Reverted **separately** from C, per AGENT-LESSONS §2c's breadth corollary: reverting both at once would say nothing about which is guarded, and the answer is that each guards a different test |
| E *(re-run)* | `origin`'s contract default flipped from `(0.5, 0.5)` to `(0, 0)` — design §6.3's required judgment-call flip | **7 failed / 670.** Was 3 of 623 at Task 2, all three determinism goldens; it is now goldens plus the physics-seam tests Tasks 3 and 4 added |
| F *(re-run)* | The `animate` `to` scale rules neutralised (`if (p === "scale")` → `if (false)`) | **4 failed / 673** — the narrowing test, the negative numeric `to`, and both zero-`to` cases. This is exit criterion 4's regression evidence, re-derived |
| G *(re-run)* | The scale branch's `setPosition` deleted | **6 failed / 671.** Matches Task 4's post-fix figure exactly |
| 1 *(ledger, 640)* | Each of Task 3's four sites reverted **individually** | bind **7**, `syncWorldToContainers` **3**, `snapContainerToBody` **2**, `collectBodyParts` **4**. The two **write-back** sites — `syncWorldToContainers` and `snapContainerToBody` — fail on **disjoint** sets, so neither rides on the other's coverage, which is the specific failure AGENT-LESSONS §2 records twice |
| 2 *(ledger, 672)* | Each of the three physics-participation clauses reverted individually, then the `to`-side check | clause 1 **4**, clause 2 **3**, clause 3 **2**, `to` side **4**. Plus two unasked: the negative ban's numeric arm **2**, its point arm **2** |
| 3 *(ledger, 672)* | Clause 2's reading of "a group that declares physics" flipped from `ownsPhysics` (D13: a sequence step counts) to direct `physics` children | **672/672 still green** — a §2d decision with no test. Closed with `rejects a zero scale under a group whose physics is a sequence step`; re-flipping now fails exactly 1 |
| 4 *(ledger, 672)* | Clause *order* reversed to descendant-first | **672/672 green, and deliberately left that way** — the §2f result in the deferrals table above |
| 5 *(ledger, 653→655)* | `scaleOwnerOf`'s `completedThisTick` term deleted | **0 → 5 failed.** The zero was a property of the corpus, not of construction; the claim that it was redundant *by construction* was rung 5, caught by a reviewer rather than by the suite |
| 6 *(ledger, 651/652)* | `worldScale` recorded only when actually pushing; the position branch's offset rotation forced to 0 | **0 and 0** — two required behaviours with no test. Both closed, and each now fails 1 |
| 7 *(ledger, 654)* | The zero-offset guard flipped to always-call | **1 failed** — the inherited `does not move a default-origin body's centre when its scale animates`. That is the test protecting every scene written before `origin` existed, and Task 4's brief asked explicitly whether it was doing its job |
| 8 *(ledger, 655)* | `tickScaleOf` forced to read the painted `layout.currentScale` | **4 failed**, including the 7-vs-12-ticks-per-frame pacing comparison across the position-to-scale handover — the invariant-3 leak caught by pacing alone, with no direct assertion naming it |
| 9 *(ledger, 623)* | Each shape kind's origin call site reverted individually | rectangle **3**, circle **1**, **polygon 0** — rung 4, closed with a polygon test that then fails 1. `line` was found the same way in the fix round |

The pattern is the one Phase 3B recorded and this phase repeats: **reading finds
contradictions; only execution finds coincidences.** Rows A, B, 3, 5, 6 and 9 —
six of the sixteen checks — were **green against the very thing they existed to
catch**, and not one of them was found by reading the code.

### Process, for the next phase

- **The tiering held, and the sizing test held with it.** Six tasks, four
  Integration and two Architecture, with the one genuinely new behaviour (§4.4's
  coupling) split across Tasks 3 and 4 precisely because a single task needing
  more than two implementer rounds should have been two tasks. No task needed
  more than **one** fix round, and Tasks 1 and 5 needed none.
- **Every fix round was batched.** Task 2 took three findings in one round,
  Task 3 two, Task 4 four. AGENT-LESSONS §7b measured a Phase 3B fix round at
  282,971 tokens against a `+37/−5` diff: the reload is the cost, so the number
  of rounds is what matters, and this phase paid three reloads in total.
- **The two most valuable findings of the phase came from reviewers, not from
  the suite,** and neither was visible in a green run: the exported helper that
  would have walked Task 4 into invariant 3, and the comment claiming a
  redundancy that measurement disproved 0-to-5. AGENT-LESSONS §8's point
  survives — budget the review that shares none of your reasoning.
- **Three controller predictions were wrong and were corrected by implementers
  who checked.** Two RED-file predictions, and one framing about what a diff can
  show. Each was reported rather than quietly reconciled, which is what made
  them cheap; the framing error in particular had primed a reviewer with a
  controller's own conclusion, which is AGENT-LESSONS §3.
- **One test is owed before Phase 4 bakes anything.** The `MatterWorld`-level
  `polygon` + `origin` + `physics` + `animate scale` fixture filed at the end of
  "Deliberate gaps and deferrals". It is the single highest-value test this
  branch does not have: it is the only way to see the
  `readState`-before-`setScale` ordering at all, `RecordingWorld` models no
  centre-of-mass offset, and the combination is ordinary Marey source that this
  phase was wrongly recorded as making unreachable. Phase 4 is composition and
  export foundation, so an untested placement rule is exactly the thing a baked
  keyframe would freeze in.
- **What is still owed:** the independent whole-branch review by someone with no
  stake in the prior reasoning (AGENT-LESSONS §8), and the merge. Phase 3A
  passed eleven task reviews and a whole-branch review and *then* an outside
  reviewer found four Important defects, two of which made published exit
  criteria false. **Phase 3C is not done until it has had one**, and both
  phase-status lines — `docs/architecture/README.md`'s "Current phase" and
  `roadmap-and-process.md`'s 3C bullet — must be updated together when it
  merges. They were written to say exactly that, because all three transitions
  so far shipped stale (AGENT-LESSONS §5b).
