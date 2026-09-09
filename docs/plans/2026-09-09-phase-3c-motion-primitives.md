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
specification, and its RED run catches it immediately if it is wrong.
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
