# Phase 4 Composition and Export Foundation Implementation Plan

**Goal:** Give Marey a finite scene-level duration, one deterministic frame
sampler above `SceneRuntime`, a PNG sequence produced in the browser, a pure
compiler surface decoupled from the Web Worker, and a `marey check` CLI — such
that Gate B's five criteria are provable rather than asserted.

**Architecture:** A scene declares an optional finite `duration`. A pure
`planExport` validates an export request and is the only function that can
construct a `SamplerPlan`; `sampleFrames` requires one, so an invalid or
unbounded request cannot reach a renderer. The sampler drives
`SceneRuntime.advanceOneTick()` in a bare loop with no wall clock, painting
every tick through a new `paintExactTick()`, and emits immutable
`FrameSnapshot`s. Encoders receive only snapshots, so they structurally cannot
advance the simulation or see a clock.

**Tech Stack:** TypeScript 5.9 (strict, `noUnusedLocals`, `noUnusedParameters`,
`verbatimModuleSyntax`, `erasableSyntaxOnly`), Vitest 4, PixiJS 8.16,
Matter.js 0.20.0 (pinned, no caret), Vite 8 beta, Playwright 1.62.

**Spec:** `docs/specs/2026-09-10-marey-phase-4-composition-and-export-design.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

1. **Baseline.** The suite is **20 files / 677 tests** at `f032991`, `tsc -b
   --noEmit` exit 0, `npm run build` exit 0. Re-derive on a clean tree before
   quoting; a stray probe file silently inflates it (AGENT-LESSONS §6).
2. **Judge file changes with `git diff --stat -- <path>`, never `git status`.**
   `core.autocrlf=true` with no `.gitattributes` makes `git status` report
   modification on content that is identical after normalisation.
3. **`LANGUAGE_CONTRACT` is the single source of truth** for every block
   property. Adding a property means editing
   `src/compiler/languageContract.ts` once; `PROP_TYPES`, `REQUIRED_PROPS`,
   `RESERVED_PROPERTY_NAMES`, Monaco hovers, snippets and completions all
   derive from it. Never add a second list.
4. **The three renderer invariants** (`docs/architecture/renderer.md`):
   nothing that mutates scene state may take a time argument; state mutation in
   the tick phase, painting in the paint phase; **nothing fed into the physics
   world may derive from the wall clock.** Phase 3C violated invariant 3 twice
   with a fully green suite.
5. **Four modules must not import `pixi.js` at runtime** — `sceneRuntime.ts`,
   `physicsSync.ts`, `transform.ts`, `clock.ts`. `frameSampler.ts` joins them.
   Every `pixi.js` import in these is `import type`.
6. **`TICK_HZ = 120`** and `secondsToTicks` live in `src/compiler/sceneIR.ts`.
   Import from there or from `clock.ts`'s re-export. Never write a second
   seconds-to-ticks conversion.
7. **Delete-and-run, individually.** For every behaviour a task requires, delete
   the line implementing it and run the suite. Anything still green is
   untested. Where a change touches N call sites, revert each **separately**
   (AGENT-LESSONS §2c).
8. **The scope tie-break, stated once so no task has to guess** (AGENT-LESSONS
   §3b): *a gap the delete-and-run check finds in a behaviour the task
   **requires** is in scope and must be closed; a gap it finds in an **adjacent**
   behaviour is filed in the report, not fixed.*
9. **A RED must be read, not just observed.** A failure caused by a wrong
   fixture looks exactly like the failure the process is waiting for. Read the
   message and confirm it names the missing behaviour, not a missing method
   (AGENT-LESSONS §3d).
10. **Report what you did not do.** "I could not write that test, and here is
    why" is a valid result; a silently skipped check is not (AGENT-LESSONS §2f).

### A note on this plan's use of code blocks

Phase 3C's plan argued that test code is safe to specify verbatim because a
wrong test goes RED immediately. **That argument is false and its own execution
notes record two counter-examples**: a wrong fixture produces a *false RED*,
which is consumed as progress rather than raised as a defect.

So: every fixture API used verbatim below was opened and checked while writing
this plan.

- `RecordingWorld` — `src/compiler/renderer/sceneRuntime.test.ts:17-69`.
  Confirmed: `setPosition(id, x, y)` **does** record into `this.positions` and
  `this.calls`; `readState(id, _alpha)` returns the recorded position with
  **no centre-of-mass offset modelled**; `setScale` records into `calls` only
  and has no effect on `readState`.
- `buildNode(irNode): Container` — `src/compiler/renderer/builder.ts`, used
  exactly this way in `builder.test.ts:17-56`. PixiJS `Container` and
  `Graphics` run in plain Node; only `Text` needs a canvas.
- `MatterWorld.boundsOf(id)` — declared `src/compiler/renderer/physicsWorld.ts:181`,
  "Test-facing; the renderer does not need it."
- `errorsFor(source): string[]` — `src/compiler/typeChecker/validator.test.ts:9-14`.
  Returns messages, and every diagnostic message begins `[CODE] `.

Treat any code block below as a claim to verify, not as text to paste. If a
symbol does not exist with that spelling, **adapt to reality and report the
discrepancy** — preserve the assertion, not the spelling.

---

## File structure

**Created**

| File | Responsibility |
|---|---|
| `src/compiler/compileSource.ts` | The one `lex → parse → typeCheck` pipeline. No DOM, no Worker, no pixi. |
| `src/compiler/export/exportContract.ts` | `planExport`, the five `EXPORT_*` diagnostics, frame arithmetic. Pure. |
| `src/compiler/export/exportContract.test.ts` | Tests for the above. |
| `src/compiler/export/frameHash.ts` | Dependency-free FNV-1a over stable-ordered snapshot JSON. |
| `src/compiler/renderer/frameSampler.ts` | `sampleFrames`, `FrameSnapshot`, `ObjectSnapshot`. No runtime pixi. |
| `src/compiler/renderer/frameSampler.test.ts` | Tests for the above. |
| `src/compiler/export/pngSequence.ts` | Browser-only. Snapshots → PNG bytes via `renderer.extract`. |
| `src/cli/check.ts` | `marey check` entry. |
| `src/cli/check.test.ts` | Tests for the CLI's pure argument and formatting layer. |
| `bin/marey.mjs` | Launcher; `bin` target in `package.json`. |
| `vite.cli.config.ts` | Library-mode build of the CLI for Node. |
| `tools/visual-check/export-check.mjs` | Playwright harness: PNGs to disk, hashes, twice. |
| `eval/scenes-3b/compound-logo.marey` | Canonical scene old §5.3, which does not exist today. |

**Modified**

| File | Change |
|---|---|
| `src/compiler/languageContract.ts` | `scene.duration`; `AbsentMeaning`; `PropertySpec.absentMeans`. |
| `src/compiler/languageContract.test.ts` | Gap check gains a third `continue`; new assertions. |
| `src/compiler/sceneIR.ts` | `IRSceneNode.duration: number | null`. |
| `src/compiler/typeChecker/resolvers.ts` | `resolveOptionalNumber`. |
| `src/compiler/typeChecker/builder.ts` | Build `duration` into the scene node. |
| `src/compiler/typeChecker/validator.ts` | `TYPE_SCENE_DURATION_INDEFINITE`. |
| `src/compiler/renderer/sceneRuntime.ts` | `paintAt` private; `paint` delegates; `paintExactTick`. |
| `src/compiler/renderer/builder.ts` | `__mareyId` on every built container. |
| `src/compiler/compiler.worker.ts` | Delegates to `compileSource`. |
| `eval/compile.test.ts` | Delegates to `compileSource`. |
| `package.json` | `bin`, `build:cli`, `check` scripts. |
| `docs/LANGUAGE.md` | `duration` under "Scene model", with a compiled fence. |
| `src/compiler/__snapshots__/determinism.test.ts.snap` | `"duration": null` per scene golden. |
| `docs/architecture/renderer.md` | The sampler, `paintExactTick`, and the alpha conventions. |
| `docs/architecture/roadmap-and-process.md` | Phase 4 bullet; the §16-vs-§6 correction. |
| `docs/architecture/README.md` | "Current phase" line, updated with the bullet above. |
| `tools/visual-check/SKILL.md` | `export-check.mjs`; the new scene. |

---

### Task 1: The `MatterWorld` fixture Phase 3C filed

Phase 3C's execution notes call this *"the single highest-value test this branch
does not have"* and *"one test is owed before Phase 4 bakes anything."* It is
first because export bakes whatever the placement rule does.

The seam: `pushAnimToWorld`'s scale branch reads `world.readState(id, 1)`
**before** its own `setScale` lands (`sceneRuntime.ts:444`). That ordering is
correct and **untested**, because `RecordingWorld.readState` models no
centre-of-mass offset, so swapping the two statements fails nothing. Only a real
`MatterWorld` has `rec.offsetX/Y`.

Why an asymmetric polygon: `polygonBodyAtBboxCentre` places the polygon's
**bbox centre** at the requested point while `Bodies.fromVertices` places its
**centre of mass**, so `addBody`'s `offsetY = y - body.position.y` equals the
gap. For the default scene's own triangle `[(0,-30), (26,15), (-26,15)]` the
bbox centre is `(0, -7.5)` and the centroid is `(0, 0)`, so the gap is **7.5 px**.

**Files:**
- Test: `src/compiler/renderer/sceneRuntime.test.ts` (append a new `describe`)

**Interfaces:**
- Consumes: `buildNode` from `./builder`; `MatterWorld`, `boundsOf` from
  `./physicsWorld`; `SceneRuntime` from `./sceneRuntime`.
- Produces: nothing. This task adds coverage only. No production file changes.

- [ ] **Step 1: Write the failing test**

Append to `src/compiler/renderer/sceneRuntime.test.ts`:

```ts
describe("SceneRuntime · a bottom-origin polygon body under a scale animation", () => {
  // The default scene's own triangle: bbox centre (0, -7.5), centroid (0, 0),
  // so MatterWorld's centre-of-mass-to-bbox-centre offset is 7.5px. That is the
  // vector `pushAnimToWorld`'s read-before-setScale ordering exists to protect,
  // and RecordingWorld models none of it (sceneRuntime.test.ts:60-63).
  const TRIANGLE = [{ x: 0, y: -30 }, { x: 26, y: 15 }, { x: -26, y: 15 }];

  function triangleNode(): IRObjectNode {
    return {
      id: "tri",
      props: {
        kind: "polygon",
        points: TRIANGLE,
        position: { x: 400, y: 300 },
        color: "#ff0000",
        rotation: 0,
        scale: { x: 1, y: 1 },
        alpha: 1,
        layer: 0,
        // Bottom-centre: the pivot sits on the triangle's base, so growing it
        // must keep that base still.
        origin: { x: 0.5, y: 1 },
        animations: [
          {
            property: "scale",
            to: { x: 1, y: 2 },
            duration: 20 / TICK_HZ,
            delay: 0,
            easing: "linear",
            loop: false,
            yoyo: false,
            handoff: false,
          },
        ],
        sequences: [],
        physics: {
          velocity: { x: 0, y: 0 },
          // No gravity: the only thing that may move this body is the scale
          // correction under test. Gravity would swamp a 7.5px effect.
          gravity: { x: 0, y: 0 },
          airDrag: 0,
          bounce: 0,
          collideBounds: false,
          duration: "indefinitely",
        },
      } as unknown as IRObjectProps,
      children: [],
    };
  }

  it("keeps the polygon's bottom edge still while its scale animates", () => {
    const world = new MatterWorld(800, 600);
    const container = buildNode(triangleNode());
    const root = new Container();
    root.addChild(container);
    const rt = new SceneRuntime(world, root);

    const id = container.__body!;
    const bottomAtStart = world.boundsOf(id)!.max.y;

    for (let t = 0; t < 20; t++) {
      rt.advanceOneTick();
      rt.paint(0);
    }

    const boundsAtEnd = world.boundsOf(id)!;

    // The base is the origin, so it must not move at all.
    expect(boundsAtEnd.max.y).toBeCloseTo(bottomAtStart, 3);
    // ...and the body must actually have grown, or the assertion above is
    // vacuously true for a body that never scaled.
    expect(boundsAtEnd.max.y - boundsAtEnd.min.y).toBeGreaterThan(55);

    world.destroy();
  });
});
```

Add `IRObjectNode`, `IRObjectProps` to the existing `import type` from
`"../sceneIR"`, `buildNode` from `"./builder"`, and confirm `Container`,
`MatterWorld`, `SceneRuntime` and `TICK_HZ` are already imported at the top of
the file — they are.

- [ ] **Step 2: Run it and read the result**

Run: `npx vitest run src/compiler/renderer/sceneRuntime.test.ts -t "keeps the polygon's bottom edge still"`

Expected: **PASS.** This is a *regression pin on correct code*, not a RED step —
Phase 3C established the ordering is right and only its coverage is missing.
Report the actual output. If it FAILS, stop and report: either the fixture is
wrong or Phase 3C's correctness argument is, and which one matters.

- [ ] **Step 3: Prove the pin actually guards the ordering**

In `src/compiler/renderer/sceneRuntime.ts`, move the `readState` call to
**after** `setScale`:

```ts
      // MUTATION — restore after measuring
      this.world.setScale(id, t.sx * sx, t.sy * sy);
      const before: BodyState | null = owns ? this.world.readState(id, 1) : null;
```

Run: `npx vitest run`

Expected: the new test **FAILS**. Record the exact failure count and the
assertion output. Then restore the file and confirm
`git diff --stat -- src/compiler/renderer/sceneRuntime.ts` is empty.

If the mutation leaves the suite green, the test does not guard what it claims
and must be strengthened before commit — that is the whole point of this task.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: **20 files / 678 tests**, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/renderer/sceneRuntime.test.ts
git commit -m "test(4): pin the readState-before-setScale ordering on a real MatterWorld

The single highest-value test Phase 3C filed and did not write.
RecordingWorld models no centre-of-mass offset, so the ordering was
invisible to the suite; an asymmetric polygon carrying an origin gives
MatterWorld a 7.5px offset and makes it observable. Reverting the
ordering fails this test."
```

---

### Task 2: `paintExactTick`

The spec's §3 measured a one-tick skew between the paint phase's two
subsystems, running in opposite directions. No single alpha places both at
tick N. The sampler needs one that does.

**Files:**
- Modify: `src/compiler/renderer/sceneRuntime.ts` (the `paint` method, ~line 723)
- Test: `src/compiler/renderer/sceneRuntime.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SceneRuntime.paintExactTick(): void` — paints animations at
  `alpha = 0` and physics at `alpha = 1`, then splices completed runners
  exactly as `paint` does. Task 5 calls it once per tick.

- [ ] **Step 1: Write the failing test**

Append to `src/compiler/renderer/sceneRuntime.test.ts`:

```ts
describe("SceneRuntime · paintExactTick places both subsystems at the same tick", () => {
  it("paints a free body at its current tick, not interpolated toward the previous one", () => {
    const world = new MatterWorld(800, 600);
    const c = makeContainer({
      physics: { ...PHYSICS, gravity: { x: 0, y: 980 }, duration: "indefinitely" },
      position: { x: 100, y: 100 },
    });
    const rt = new SceneRuntime(world, makeRoot(c));

    for (let t = 0; t < 60; t++) rt.advanceOneTick();
    rt.paintExactTick();

    const id = c.__body!;
    const exact = world.readState(id, 1)!;
    // `paint(0)` would land on readState(0) — one whole tick behind.
    expect(c.__mareyLayout!.currentPos.y).toBeCloseTo(exact.y, 6);

    world.destroy();
  });

  it("paints an animation at its current tick, not one tick ahead", () => {
    const world = new RecordingWorld();
    const c = makeContainer({
      animations: [anim({ to: { x: 1200, y: 100 }, duration: 10 })],
      position: { x: 100, y: 100 },
    });
    const rt = new SceneRuntime(world, makeRoot(c));

    for (let t = 0; t < 60; t++) rt.advanceOneTick();
    rt.paintExactTick();

    // Linear, 10s = 1200 ticks, 100 -> 1200. After 60 ticks: 100 + 1100*60/1200.
    // `paint(1)` would land one tick further along.
    expect(c.__mareyLayout!.currentPos.x).toBeCloseTo(100 + (1100 * 60) / 1200, 6);
  });
});
```

- [ ] **Step 2: Run it and read the RED**

Run: `npx vitest run src/compiler/renderer/sceneRuntime.test.ts -t "paintExactTick"`

Expected: FAIL — `rt.paintExactTick is not a function`. **Read the message.**
That specific failure means the method is missing, which is the RED this step
wants. An assertion failure instead would mean the fixture is wrong; stop and
report.

- [ ] **Step 3: Implement**

In `src/compiler/renderer/sceneRuntime.ts`, replace the body of `paint` with a
delegation and add the two entry points. One implementation, never two copies
(Global Constraint 3's reasoning applies to code as well as to contracts):

```ts
  /**
   * Paint once, at the fractional position between the last two ticks.
   *
   * Display writes only. The one piece of bookkeeping here is splicing
   * completed runners, which is where it has always lived.
   */
  paint(alpha: number): void {
    this.paintAt(alpha, alpha);
  }

  /**
   * Paint the state at exactly the tick just advanced, with no sub-tick term.
   *
   * The two subsystems read `alpha` in **opposite temporal directions**, so no
   * single value places both at tick N:
   *
   * - `animProgress` computes `(elapsedTicks + alpha) / durationTicks`
   *   (`timeline.ts`), extending FORWARD from tick N into N+1 — so `0` is exact.
   * - `readState` lerps `prevX -> body.position` by alpha, and `prevX` is
   *   captured at the top of `step()` (`physicsWorld.ts`), so it interpolates
   *   BACKWARD across [N-1, N] — so `1` is exact. `snapContainerToBody` already
   *   relies on this and says so.
   *
   * Measured, not assumed: over 60 ticks, `paint(0)` placed a falling body
   * exactly one tick of fall short of `readState(id, 1)`, and `paint(1)` placed
   * a linear animation exactly one tick of travel past its tick-60 value.
   *
   * Live, that 8.3ms disagreement is invisible and `paint(driver.alpha)` stays
   * correct. Baked into an exported frame it is a permanent skew between
   * animated and simulated objects, which is why the frame sampler calls this
   * instead.
   */
  paintExactTick(): void {
    this.paintAt(0, 1);
  }

  private paintAt(animAlpha: number, physicsAlpha: number): void {
    for (let i = 0; i < this.runningAnims.length; i++) {
      applyAnim(this.runningAnims[i], animAlpha);
    }

    // Physics writes after animations, so a dynamic body's position wins over
    // a stale one. A body driven by a position animation is pinned, and
    // syncWorldToContainers skips pinned bodies, so the two never fight.
    syncWorldToContainers(this.bindings, this.world, physicsAlpha);

    for (let i = this.runningAnims.length - 1; i >= 0; i--) {
      // The rotation-override release lives in tickAnim (the tick phase),
      // not here — see the comment there. This loop only splices.
      if (this.runningAnims[i].time.completed) this.runningAnims.splice(i, 1);
    }
    for (let i = this.physicsRunners.length - 1; i >= 0; i--) {
      if (this.physicsRunners[i].time.completed) this.physicsRunners.splice(i, 1);
    }
    for (let i = this.sequenceRunners.length - 1; i >= 0; i--) {
      if (this.sequenceRunners[i].state === "DONE") this.sequenceRunners.splice(i, 1);
    }
  }
```

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: **20 files / 680 tests**, exit 0. Every existing test must still pass —
`paint(alpha)` is behaviour-identical, which is the point of routing it through
`paintAt`.

- [ ] **Step 5: Prove both arguments are load-bearing, separately**

Per Global Constraint 7, revert each independently and record the count:

1. `paintExactTick()` → `this.paintAt(0, 0)`. Run `npx vitest run`. Expect the
   physics test to fail.
2. Restore. `paintExactTick()` → `this.paintAt(1, 1)`. Run. Expect the animation
   test to fail.
3. Restore. Confirm `git diff --stat -- src/compiler/renderer/sceneRuntime.ts`
   shows only the intended change.

Record all three counts in the report. If either mutation leaves the suite
green, that argument is unpinned and a test is owed.

- [ ] **Step 6: Commit**

```bash
git add src/compiler/renderer/sceneRuntime.ts src/compiler/renderer/sceneRuntime.test.ts
git commit -m "feat(4): add paintExactTick for tick-aligned export frames

animProgress reads alpha forward from tick N; readState lerps backward
across [N-1, N]. No single alpha places both at tick N, so paint(alpha)
cannot produce an internally consistent exported frame. paintAt(0, 1)
does. paint(alpha) delegates and is unchanged in behaviour."
```

---

### Task 3: `scene { duration }`

**Files:**
- Modify: `src/compiler/languageContract.ts`
- Modify: `src/compiler/languageContract.test.ts:163-179`
- Modify: `src/compiler/sceneIR.ts:140-148`
- Modify: `src/compiler/typeChecker/resolvers.ts`
- Modify: `src/compiler/typeChecker/builder.ts:298-306`
- Modify: `src/compiler/typeChecker/validator.ts`
- Modify: `docs/LANGUAGE.md` ("Scene model")
- Modify: `src/compiler/__snapshots__/determinism.test.ts.snap`
- Test: `src/compiler/typeChecker/validator.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `IRSceneNode.duration: number | null` — seconds, or `null` for indefinite.
  - `PropertySpec.absentMeans?: AbsentMeaning`, `type AbsentMeaning = "indefinite"`.
  - `resolveOptionalNumber(props, key): number | null` in `resolvers.ts`.
  - Diagnostic code `TYPE_SCENE_DURATION_INDEFINITE`.

- [ ] **Step 1: Write the failing tests**

Append to `src/compiler/typeChecker/validator.test.ts`:

```ts
describe("scene duration", () => {
  it("accepts a finite positive duration", () => {
    expect(errorsFor(`scene { size: (100, 100) duration: 5 }`)).toEqual([]);
  });

  it("rejects a zero or negative duration", () => {
    const out = errorsFor(`scene { size: (100, 100) duration: 0 }`);
    expect(out.join("\n")).toContain("greater than zero");
  });

  it("rejects 'indefinitely' on a scene with its own named diagnostic", () => {
    const out = errorsFor(`scene { size: (100, 100) duration: indefinitely }`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_SCENE_DURATION_INDEFINITE");
    // The wording only this rule produces, so a neighbouring kind-mismatch
    // diagnostic cannot satisfy the assertion (AGENT-LESSONS §2b).
    expect(out[0]).toContain("omit 'duration' instead");
  });

  it("builds a null duration into the IR when omitted", () => {
    const { ast } = parse(lex(`scene { size: (100, 100) }`));
    const { ir } = typeCheck(ast!);
    expect(ir!.duration).toBeNull();
  });

  it("builds a declared duration into the IR in seconds", () => {
    const { ast } = parse(lex(`scene { size: (100, 100) duration: 2.5 }`));
    const { ir } = typeCheck(ast!);
    expect(ir!.duration).toBe(2.5);
  });
});
```

Append to `src/compiler/languageContract.test.ts`:

```ts
  it("declares scene.duration as optional with absence as its documented meaning", () => {
    const spec = LANGUAGE_CONTRACT.scene.properties.duration;
    expect(spec.required).toBeUndefined();
    expect(spec.default).toBeUndefined();
    expect(spec.derivedDefault).toBeUndefined();
    expect(spec.absentMeans).toBe("indefinite");
  });
```

- [ ] **Step 2: Run and read the RED**

Run: `npx vitest run src/compiler/typeChecker/validator.test.ts src/compiler/languageContract.test.ts`

Expected failures, and **read each one**:
- `unknown property 'duration'` on the scene block — the contract entry is missing.
- `ir!.duration` is `undefined` — the IR field is missing.
- The gap check `gives every optional property a contract default or a named
  derived-default strategy` will **not** fail yet, because the property does not
  exist yet. It fails in Step 4, and that is expected.

- [ ] **Step 3: Add the contract entry and the third fallback kind**

In `src/compiler/languageContract.ts`, after `DerivedDefaultStrategy`:

```ts
/**
 * What an optional property's **absence** means, for the cases where no value
 * can express it.
 *
 * `scene.duration` is the first: a scene with no declared duration is
 * *indefinite*, and there is no number that says so. Giving it a fixed
 * `default` would invent a length the author did not write; giving it a
 * `derivedDefault` would compute one, which for a physics scene is not
 * statically knowable at all.
 *
 * Declared here rather than left implicit so `languageContract.test.ts`'s gap
 * check keeps enumerating structurally: every optional property still has a
 * documented fallback, and this is a third kind of one rather than an
 * exception to the rule.
 */
export type AbsentMeaning = "indefinite";
```

Add to `PropertySpec`:

```ts
  readonly absentMeans?: AbsentMeaning;
```

Add to `PropertyOptions`:

```ts
  absentMeans?: AbsentMeaning;
```

Add to `sceneProperties`, after `fit`:

```ts
  duration: property(
    "number",
    "How long the scene runs, in seconds. Optional: a scene with no duration is indefinite and cannot be exported without an explicit export bound. Unlike 'physics', this does not accept 'indefinitely' — omit the property instead.",
    "duration: 5",
    "5",
    { constraint: { kind: "positive" }, absentMeans: "indefinite" },
  ),
```

- [ ] **Step 4: Teach the gap check about the third kind**

In `src/compiler/languageContract.test.ts:163-179`, add one `continue` beside
the existing two, and extend the comment:

```ts
        if (spec.derivedDefault !== undefined) continue;
        // A third documented fallback: the property's *absence* is itself the
        // value. `scene.duration` omitted means indefinite, and no number says
        // that. This is a third kind of documented fallback, not a hole in the
        // rule — the check still fails for a property with none of the three.
        if (spec.absentMeans !== undefined) continue;
```

- [ ] **Step 5: Add the IR field and the resolver**

`src/compiler/sceneIR.ts`, in `IRSceneNode` after `fit`:

```ts
  /** Scene length in seconds, or null for an indefinite scene. */
  readonly duration: number | null;
```

`src/compiler/typeChecker/resolvers.ts`, beside `resolveNumber`:

```ts
/**
 * A number property that may legitimately be absent, where absence is not the
 * same as any value. Distinct from `resolveNumber`, whose fallback is a number.
 */
export function resolveOptionalNumber(
  props: Record<string, AstValue>,
  key: string,
): number | null {
  const v = props[key];
  if (v?.kind === "number") return (v as NumberValue).value;
  return null;
}
```

`src/compiler/typeChecker/builder.ts`, in the frozen scene object after `fit`:

```ts
    duration:   resolveOptionalNumber(sceneAst.props, "duration"),
```

Add `resolveOptionalNumber` to the existing import from `./resolvers`.

- [ ] **Step 6: Add the diagnostic**

In `src/compiler/typeChecker/validator.ts`'s `checkNode`, after the `label` and
`contract` declarations and before the property loop:

```ts
    // `physics.duration` accepts `indefinitely`, so an author will try it here.
    // A named diagnostic beats the generic kind mismatch the contract would
    // otherwise produce, because the fix is not "write a different value" — it
    // is "write no value at all", which no type error can suggest.
    if (isScene && node.props["duration"]?.kind === "indefinitely") {
      const v = node.props["duration"];
      errors.push({
        phase: "TYPE",
        message: "[TYPE_SCENE_DURATION_INDEFINITE] The scene block: 'duration' does not accept 'indefinitely'. A scene with no fixed length is written by leaving 'duration' out — omit 'duration' instead.",
        line: v.line, col: v.col, endLine: v.endLine, endCol: v.endCol,
      });
    }
```

Confirm `AstValue` carries `line`/`col`/`endLine`/`endCol`; if the spelling
differs, use `errPosOf(v)` which already exists at `validator.ts:44`, and report
the discrepancy.

- [ ] **Step 7: Run and update the goldens**

Run: `npx vitest run`

Expect `determinism.test.ts` to fail on three snapshots. **Read the diff in
full before regenerating** — the expected change is `+1` line per scene golden
(`"duration": null`) and **zero deletions**. Zero deletions is the load-bearing
half: a moved coordinate, tick count or layer would mean this change altered
timing or placement, which it must not.

Then: `npx vitest run -u`

Verify with `git diff --stat -- src/compiler/__snapshots__/determinism.test.ts.snap`
that the change is `+3` and `-0`.

- [ ] **Step 8: Reach the language reference**

`docs/LANGUAGE.md`'s fences are compiled by `languageDocs.test.ts`, so a
language change that does not reach the reference cannot land green. That is
the intended failure, not an obstacle.

Add to the "Scene model" section, after the `fit` bullet list and before the
"Coordinates are in pixels" paragraph:

````markdown
`duration` is optional and takes a positive number of seconds. It declares how
long the scene runs, which is what an exporter samples. A scene that omits it is
**indefinite** — it still plays in the preview, but it cannot be exported without
an explicit export bound.

Unlike `physics`, `scene` does **not** accept `duration: indefinitely`
(`TYPE_SCENE_DURATION_INDEFINITE`). An indefinite scene is written by leaving
the property out, so there is exactly one spelling for each state rather than
two for one of them.

```marey
scene {
  size: (800, 600)
  duration: 4

  circle dot {
    position: (400, 300)
    radius: 40
    color: cyan
  }
}
```
````

- [ ] **Step 9: Run everything**

```bash
npx vitest run
npx tsc -b --noEmit
```

Expected: **20 files / 683 tests** (5 validator + 1 contract, less any that
merge), exit 0 both. Report the actual number rather than this estimate.

- [ ] **Step 10: Mutation checks, individually**

1. Delete `absentMeans: "indefinite"` from the contract entry → the contract
   test and the gap check must fail.
2. Delete the `TYPE_SCENE_DURATION_INDEFINITE` block → its test must fail.
3. Change `resolveOptionalNumber`'s `return null` to `return 0` → the
   `toBeNull()` test must fail.

Restore after each; confirm each `git diff --stat` is empty. Record all counts.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(4): a finite scene-level duration

scene { duration: N }, seconds, optional, positive. Omitted means
indefinite; there is deliberately no 'indefinitely' spelling, so each
state has exactly one form. The contract gains absentMeans as a third
documented fallback kind beside default and derivedDefault, so the
optional-property gap check keeps enumerating structurally instead of
being weakened for one property.

Goldens: +3 lines, zero deletions."
```

---

### Task 4: The export contract

Roadmap §6.1 requires unsupported-export diagnostics be **defined before any
encoder is added**. This task defines them; the first encoder is Task 8.

**Files:**
- Create: `src/compiler/export/exportContract.ts`
- Create: `src/compiler/export/exportContract.test.ts`

**Interfaces:**
- Consumes: `IRSceneNode` and `TICK_HZ`, `secondsToTicks` from `../sceneIR`
  (Global Constraint 6 — never a second conversion).
- Produces:
  - `interface ExportRequest { readonly fps: number; readonly durationSeconds?: number }`
  - `interface SamplerPlan { readonly fps: number; readonly ticksPerFrame: number; readonly durationTicks: number; readonly frameCount: number }`
  - `interface ExportDiagnostic { readonly code: ExportDiagnosticCode; readonly message: string }`
  - `type ExportPlanResult = { ok: true; plan: SamplerPlan } | { ok: false; diagnostics: readonly ExportDiagnostic[] }`
  - `function planExport(ir: IRSceneNode, request: ExportRequest): ExportPlanResult`
  - `const MAX_EXPORT_FRAMES = 7_200`

  Task 5's `sampleFrames` takes `SamplerPlan`. Task 7's CLI calls `planExport`.

- [ ] **Step 1: Write the failing tests**

Create `src/compiler/export/exportContract.test.ts`:

```ts
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
```

- [ ] **Step 2: Run and read the RED**

Run: `npx vitest run src/compiler/export/exportContract.test.ts`
Expected: FAIL — cannot resolve `./exportContract`. That is the missing-module
RED, not a fixture error.

- [ ] **Step 3: Implement**

Create `src/compiler/export/exportContract.ts`:

```ts
import { TICK_HZ, secondsToTicks, type IRSceneNode } from "../sceneIR";

/**
 * Diagnostics for an export request that cannot be honoured.
 *
 * Prefixed `EXPORT_` rather than `TYPE_` because these fire after compilation
 * has already succeeded, at export request: the source is valid Marey, and what
 * is wrong is the combination of scene and request. Roadmap §6.1 requires the
 * set be defined before any encoder exists, which is why this module lands
 * ahead of the PNG one.
 */
export type ExportDiagnosticCode =
  | "EXPORT_UNBOUNDED_SCENE"
  | "EXPORT_INVALID_DURATION"
  | "EXPORT_UNSUPPORTED_FPS"
  | "EXPORT_EMPTY_SEQUENCE"
  | "EXPORT_FRAME_BUDGET";

export interface ExportDiagnostic {
  readonly code: ExportDiagnosticCode;
  readonly message: string;
}

export interface ExportRequest {
  readonly fps: number;
  /** Explicit export bound in seconds. Overrides the scene's own duration. */
  readonly durationSeconds?: number;
}

export interface SamplerPlan {
  readonly fps: number;
  readonly ticksPerFrame: number;
  readonly durationTicks: number;
  readonly frameCount: number;
}

export type ExportPlanResult =
  | { readonly ok: true; readonly plan: SamplerPlan }
  | { readonly ok: false; readonly diagnostics: ReadonlyArray<ExportDiagnostic> };

/**
 * Most frames one export may produce: two minutes at 60fps, five at 24.
 *
 * Snapshots are held as an array, so an unbounded request would exhaust the
 * tab rather than fail. The same reasoning as `TYPE_PHYSICS_BODY_LIMIT` and the
 * 15,000-object parser budget: a ceiling that fails with a name beats one that
 * fails with a crash.
 */
export const MAX_EXPORT_FRAMES = 7_200;

/**
 * Validate an export request and resolve it into a sampler plan.
 *
 * **This is the only function that constructs a `SamplerPlan`**, and
 * `sampleFrames` requires one. That is what makes Gate B's "invalid or
 * unbounded duration fails before rendering begins" structural rather than a
 * convention a caller can forget: holding a plan is proof the request was
 * checked.
 *
 * Every applicable diagnostic is returned, not just the first, so one call
 * tells a caller everything wrong with the request.
 */
export function planExport(ir: IRSceneNode, request: ExportRequest): ExportPlanResult {
  const diagnostics: ExportDiagnostic[] = [];

  // Frame rate must divide the fixed tick rate exactly. `sceneIR.ts` chose
  // 120Hz precisely so 24, 30 and 60 do (5, 4 and 2 ticks per frame); a rate
  // that did not would force sampling *between* ticks, which is the
  // interpolation an exact export exists to avoid.
  const fpsOk =
    Number.isInteger(request.fps) && request.fps > 0 && TICK_HZ % request.fps === 0;
  if (!fpsOk) {
    diagnostics.push({
      code: "EXPORT_UNSUPPORTED_FPS",
      message: `[EXPORT_UNSUPPORTED_FPS] Frame rate ${request.fps} is not supported. It must be a positive whole number that divides the ${TICK_HZ}Hz simulation rate exactly, so every exported frame lands on a simulation tick. Supported rates include 24, 30 and 60.`,
    });
  }

  const explicit = request.durationSeconds;
  let seconds: number | null;
  if (explicit !== undefined) {
    if (!Number.isFinite(explicit) || explicit <= 0) {
      diagnostics.push({
        code: "EXPORT_INVALID_DURATION",
        message: `[EXPORT_INVALID_DURATION] The export bound must be a positive, finite number of seconds. Received ${explicit}.`,
      });
      seconds = null;
    } else {
      seconds = explicit;
    }
  } else if (ir.duration !== null) {
    seconds = ir.duration;
  } else {
    diagnostics.push({
      code: "EXPORT_UNBOUNDED_SCENE",
      message: "[EXPORT_UNBOUNDED_SCENE] This scene declares no 'duration', so it has no finite length to export. Add 'duration: <seconds>' to the scene block, or pass an explicit export bound.",
    });
    seconds = null;
  }

  if (seconds === null || !fpsOk) {
    return { ok: false, diagnostics: Object.freeze(diagnostics) };
  }

  const durationTicks = secondsToTicks(seconds);
  const ticksPerFrame = TICK_HZ / request.fps;
  // `floor`, not `round`: a duration that is not a whole number of frames
  // truncates rather than sampling past the declared end of the scene.
  const frameCount = Math.floor(durationTicks / ticksPerFrame);

  if (frameCount < 1) {
    diagnostics.push({
      code: "EXPORT_EMPTY_SEQUENCE",
      message: `[EXPORT_EMPTY_SEQUENCE] A ${seconds}s scene at ${request.fps}fps yields no frames. The scene must run at least one frame (${ticksPerFrame} ticks) to export.`,
    });
  }

  if (frameCount > MAX_EXPORT_FRAMES) {
    diagnostics.push({
      code: "EXPORT_FRAME_BUDGET",
      message: `[EXPORT_FRAME_BUDGET] This export would produce ${frameCount} frames, over the ${MAX_EXPORT_FRAMES}-frame ceiling. Export a shorter bound or a lower frame rate.`,
    });
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics: Object.freeze(diagnostics) };
  }

  return {
    ok: true,
    plan: Object.freeze({ fps: request.fps, ticksPerFrame, durationTicks, frameCount }),
  };
}
```

- [ ] **Step 4: Run**

Run: `npx vitest run src/compiler/export/exportContract.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Flip the judgment calls (AGENT-LESSONS §2d)**

Two decisions here have a plausible other answer. Flip each, run the **full**
suite, and record whether anything fails:

1. `Math.floor` → `Math.round` in `frameCount`.
2. `MAX_EXPORT_FRAMES` → `72_000`.

If a flip leaves the suite green, that decision is unpinned: add a test that
makes it load-bearing and put the reasoning in a comment beside it. For `floor`
the pinning test is a duration that is not a whole number of frames — e.g.
`durationSeconds: 1.01` at 30fps is 121 ticks, so `floor` gives 30 frames and
`round` gives 31.

- [ ] **Step 6: Run everything and commit**

```bash
npx vitest run && npx tsc -b --noEmit
git add src/compiler/export/
git commit -m "feat(4): the export contract, before any encoder

planExport is the only function that builds a SamplerPlan and
sampleFrames requires one, so an invalid or unbounded request cannot
reach a renderer. Five EXPORT_* diagnostics, defined ahead of the first
encoder as roadmap §6.1 requires. Frame rate must divide TICK_HZ, which
makes enforceable the reason sceneIR.ts gives for choosing 120Hz."
```

---

### Task 5: The frame sampler

**Files:**
- Create: `src/compiler/renderer/frameSampler.ts`
- Create: `src/compiler/renderer/frameSampler.test.ts`
- Create: `src/compiler/export/frameHash.ts`
- Modify: `src/compiler/renderer/builder.ts` (the `declare module` block, and `buildNode`)

**Interfaces:**
- Consumes: `SamplerPlan` from `../export/exportContract` (Task 4);
  `SceneRuntime.paintExactTick()` (Task 2); `buildNode`.
- Produces:
  - `interface ObjectSnapshot { readonly id: string; readonly x: number; readonly y: number; readonly rotation: number; readonly scaleX: number; readonly scaleY: number; readonly alpha: number }`
  - `interface FrameSnapshot { readonly index: number; readonly tick: number; readonly objects: ReadonlyArray<ObjectSnapshot> }`
  - `function sampleFrames(runtime: SceneRuntime, root: Container, plan: SamplerPlan): FrameSnapshot[]`
  - `function hashFrames(frames: ReadonlyArray<FrameSnapshot>): string` in `frameHash.ts`
  - `Container.__mareyId?: string`

- [ ] **Step 1: Write the failing tests**

Create `src/compiler/renderer/frameSampler.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { buildNode } from "./builder";
import { sampleFrames } from "./frameSampler";
import { SceneRuntime } from "./sceneRuntime";
import { MatterWorld } from "./physicsWorld";
import { hashFrames } from "../export/frameHash";
import { planExport } from "../export/exportContract";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import type { IRSceneNode, IRObjectNode } from "../sceneIR";
import type { SamplerPlan } from "../export/exportContract";

function irFor(source: string): IRSceneNode {
  const { ast } = parse(lex(source));
  const { ir, errors } = typeCheck(ast!);
  if (!ir) throw new Error(`fixture did not compile: ${errors.map(e => e.message).join("; ")}`);
  return ir;
}

/** A 5s scene: one circle sliding right, one falling body. No `text`. */
const SOURCE = `
scene {
  size: (800, 600)
  duration: 5

  circle slider {
    position: (100, 100)
    radius: 20
    color: cyan
    animate { property: position, to: (700, 100), duration: 4, easing: linear }
  }

  circle faller {
    position: (400, 50)
    radius: 15
    color: magenta
    physics { gravity: (0, 980), duration: indefinitely, collideBounds: true }
  }
}
`;

function buildRoot(ir: IRSceneNode): Container {
  const root = new Container();
  for (const node of ir.children) root.addChild(buildNode(node as IRObjectNode));
  return root;
}

function runExport(fps: number): { frames: ReturnType<typeof sampleFrames>; plan: SamplerPlan } {
  const ir = irFor(SOURCE);
  const result = planExport(ir, { fps });
  if (!result.ok) throw new Error(`plan failed: ${result.diagnostics.map(d => d.code).join(",")}`);
  const world = new MatterWorld(ir.width, ir.height);
  const root = buildRoot(ir);
  const runtime = new SceneRuntime(world, root);
  const frames = sampleFrames(runtime, root, result.plan);
  runtime.destroy();
  return { frames, plan: result.plan };
}

describe("sampleFrames · exact frame counts (Gate B criterion 1)", () => {
  it.each([[24, 120], [30, 150], [60, 300]])(
    "produces %i frames at %ifps for a 5s scene",
    (fps, expected) => {
      expect(runExport(fps).frames).toHaveLength(expected);
    },
  );

  it("samples frame 0 at tick 0, before any advance", () => {
    const { frames } = runExport(30);
    expect(frames[0].index).toBe(0);
    expect(frames[0].tick).toBe(0);
  });

  it("spaces frames by exactly ticksPerFrame", () => {
    const { frames, plan } = runExport(30);
    for (let i = 0; i < frames.length; i++) {
      expect(frames[i].tick).toBe(i * plan.ticksPerFrame);
    }
  });
});

describe("sampleFrames · repeated exports are identical (Gate B criterion 2)", () => {
  it("produces the same hash twice from cold", () => {
    expect(hashFrames(runExport(30).frames)).toBe(hashFrames(runExport(30).frames));
  });

  it("produces a hash that actually depends on the frames", () => {
    // Guards the other direction: a constant hash would satisfy the test above
    // vacuously (AGENT-LESSONS §2a — name the change that would make it fail).
    expect(hashFrames(runExport(30).frames)).not.toBe(hashFrames(runExport(60).frames));
  });
});

describe("sampleFrames · frame pacing cannot affect exported state (Gate B criterion 3)", () => {
  it("agrees between 30fps and 60fps on every coincident frame", () => {
    const at30 = runExport(30).frames;
    const at60 = runExport(60).frames;
    // 30fps frame k and 60fps frame 2k sample the same tick, so their objects
    // must be identical. If the sampler painted once per *frame* instead of
    // once per tick, the two rates would diverge here.
    for (let k = 0; k < at30.length; k++) {
      expect(at30[k].tick).toBe(at60[2 * k].tick);
      expect(at30[k].objects).toEqual(at60[2 * k].objects);
    }
  });

  it("agrees between 24fps and 60fps on the frames that coincide", () => {
    const at24 = runExport(24).frames;
    const at60 = runExport(60).frames;
    // 24fps frame k is tick 5k; 60fps frame j is tick 2j. They coincide when
    // 5k is even, i.e. on even k.
    for (let k = 0; k < at24.length; k += 2) {
      expect(at24[k].objects).toEqual(at60[(5 * k) / 2].objects);
    }
  });
});

describe("sampleFrames · snapshot shape", () => {
  it("carries every object in the scene, keyed by its IR id", () => {
    const { frames } = runExport(30);
    expect(frames[0].objects.map((o) => o.id)).toEqual(["slider", "faller"]);
  });

  it("records the slider moving and the faller falling", () => {
    const { frames } = runExport(30);
    const first = frames[0];
    const last = frames[frames.length - 1];
    const sliderOf = (f: typeof first) => f.objects.find((o) => o.id === "slider")!;
    const fallerOf = (f: typeof first) => f.objects.find((o) => o.id === "faller")!;
    expect(sliderOf(last).x).toBeGreaterThan(sliderOf(first).x + 500);
    expect(fallerOf(last).y).toBeGreaterThan(fallerOf(first).y + 100);
  });

  it("freezes each snapshot", () => {
    const { frames } = runExport(30);
    expect(Object.isFrozen(frames[0])).toBe(true);
    expect(Object.isFrozen(frames[0].objects[0])).toBe(true);
  });
});
```

- [ ] **Step 2: Run and read the RED**

Run: `npx vitest run src/compiler/renderer/frameSampler.test.ts`
Expected: FAIL — cannot resolve `./frameSampler`.

- [ ] **Step 3: Add `__mareyId` to the builder**

In `src/compiler/renderer/builder.ts`'s `declare module "pixi.js"` block, beside
`__body`:

```ts
    /**
     * This container's IR object id.
     *
     * The frame sampler keys snapshots by it. Nothing else in the renderer
     * needs a stable identity, which is why no such field existed before
     * Phase 4 — the scene graph was only ever walked, never addressed.
     */
    __mareyId?: string;
```

In `buildNode`, set it on the wrapper it returns, beside where `__animations`
and `__sequences` are attached. Find the single place `buildNode` returns the
wrapper for every kind and set `wrapper.__mareyId = node.id;` there — if there
is more than one return path, set it at each and **report how many there were**,
because that count decides how many separate revert checks Step 6 needs.

- [ ] **Step 4: Implement the hash**

Create `src/compiler/export/frameHash.ts`:

```ts
import type { FrameSnapshot } from "../renderer/frameSampler";

/**
 * A stable content hash for a sampled sequence.
 *
 * FNV-1a over the snapshots' JSON, written by hand rather than taken from a
 * dependency because it must produce the identical digest in Node and in the
 * browser — `node:crypto` is not available in one and `crypto.subtle` is async
 * in both. 32 bits is ample: this detects change, it is not a security
 * primitive.
 *
 * Values are **not** rounded before hashing. IEEE-754 arithmetic is
 * deterministic for an identical sequence of operations and Matter.js is
 * deterministic given identical call order, so exact values are both more
 * honest and equally stable. Rounding would hide a real divergence smaller
 * than its own precision.
 *
 * This hashes *simulation output*, so unlike a PNG byte hash it carries the
 * determinism claim across machines as well as across runs.
 */
export function hashFrames(frames: ReadonlyArray<FrameSnapshot>): string {
  let h = 0x811c9dc5;
  const text = JSON.stringify(frames);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
```

- [ ] **Step 5: Implement the sampler**

Create `src/compiler/renderer/frameSampler.ts`:

```ts
import type { Container } from "pixi.js";
import type { SceneRuntime } from "./sceneRuntime";
import type { SamplerPlan } from "../export/exportContract";

/** One object's transform at one sampled frame. */
export interface ObjectSnapshot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Radians, as the scene graph holds it. */
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly alpha: number;
}

/** One output frame: immutable, and the only thing an encoder ever sees. */
export interface FrameSnapshot {
  readonly index: number;
  readonly tick: number;
  readonly objects: ReadonlyArray<ObjectSnapshot>;
}

function snapshotObjects(root: Container): ObjectSnapshot[] {
  const out: ObjectSnapshot[] = [];
  // Depth-first in scene-graph order, which is IR order. The ordering is part
  // of the contract: a hash over the sequence is only stable if the sequence is.
  const visit = (c: Container): void => {
    const id = c.__mareyId;
    const layout = c.__mareyLayout;
    if (id !== undefined && layout) {
      out.push(Object.freeze({
        id,
        x: layout.currentPos.x,
        y: layout.currentPos.y,
        rotation: c.rotation,
        scaleX: layout.currentScale.x,
        scaleY: layout.currentScale.y,
        alpha: c.alpha,
      }));
    }
    for (const child of c.children) visit(child as Container);
  };
  visit(root);
  return out;
}

/**
 * Drive a scene for a plan's worth of ticks and return one snapshot per output
 * frame.
 *
 * A sibling of `LiveDriver`, not a replacement. `LiveDriver.pump(deltaMS)` maps
 * wall-clock milliseconds to ticks; this maps an output-frame index to ticks
 * and never sees a clock at all. Both call the same `advanceOneTick()`, which
 * takes no time argument — renderer invariant 1, and the whole reason Phase 2
 * lifted `SceneRuntime` out of `render()`'s closure.
 *
 * **It paints every tick, not every frame.** `spawnAnim` seeds a new runner's
 * start value from paint-written container state (`getCurrentVal` reads
 * `currentPos`, `rotation` and `alpha`), so a paint cadence that varied with the
 * requested frame rate would make the exported *simulation* frame-rate
 * dependent — Gate B criterion 3 failing. Painting once per tick makes the
 * cadence identical at every rate, which is what lets 30fps frame k and 60fps
 * frame 2k be asserted equal.
 *
 * Frame 0 samples tick 0, before any advance, so the first exported frame is
 * the scene as authored.
 */
export function sampleFrames(
  runtime: SceneRuntime,
  root: Container,
  plan: SamplerPlan,
): FrameSnapshot[] {
  const frames: FrameSnapshot[] = [];

  frames.push(Object.freeze({ index: 0, tick: 0, objects: Object.freeze(snapshotObjects(root)) }));

  for (let index = 1; index < plan.frameCount; index++) {
    for (let t = 0; t < plan.ticksPerFrame; t++) {
      runtime.advanceOneTick();
      runtime.paintExactTick();
    }
    frames.push(Object.freeze({
      index,
      tick: index * plan.ticksPerFrame,
      objects: Object.freeze(snapshotObjects(root)),
    }));
  }

  return frames;
}
```

- [ ] **Step 6: Run, then prove each required behaviour is guarded**

Run: `npx vitest run` — expect all frameSampler tests green.

Then, individually (Global Constraint 7), recording each count:

1. `runtime.paintExactTick()` → `runtime.paint(0)` → the 30-vs-60 test should
   still pass (both rates paint per tick) but any test asserting physics
   position should shift. Record what actually happens; if **nothing** fails,
   Task 2's method is unguarded from the sampler's side and a test is owed.
2. Move `paintExactTick()` out of the inner loop so it runs once per frame →
   the 30-vs-60 coincident-frame test must fail. **This is the check that
   settles the paint-cadence hypothesis.** If it passes, the hypothesis in the
   docstring is wrong: say so, correct the docstring, and report it — per
   Global Constraint 10 that is a result, not a failure.
3. `frames.push(... index: 0, tick: 0 ...)` deleted (start the loop at 0) → the
   frame-count tests must fail.
4. `wrapper.__mareyId = node.id` deleted → the id test must fail.

- [ ] **Step 7: Confirm the no-runtime-pixi rule**

```bash
grep -n "from \"pixi.js\"" src/compiler/renderer/frameSampler.ts
```

Expected: exactly one line, and it must read `import type { Container }`.
Global Constraint 5.

- [ ] **Step 8: Run everything and commit**

```bash
npx vitest run && npx tsc -b --noEmit && npm run build
git add -A
git commit -m "feat(4): the deterministic frame sampler

One sampler above SceneRuntime, a sibling of LiveDriver rather than a
replacement: it maps frame index to ticks and never sees a clock. It
paints every tick, not every frame, because spawnAnim seeds from
paint-written state and a rate-dependent paint cadence would make the
exported simulation rate-dependent. Encoders receive FrameSnapshot[] and
nothing else, so they cannot advance the simulation.

Exact counts at 24/30/60; 30fps frame k equals 60fps frame 2k."
```

---

### Task 6: The pure compiler surface

`lex → parse → typeCheck` is written out independently in
`src/compiler/compiler.worker.ts` and `eval/compile.test.ts`, and a CLI would
make it a third. That is AGENT-LESSONS §5 at module scale.

**Files:**
- Create: `src/compiler/compileSource.ts`
- Create: `src/compiler/compileSource.test.ts`
- Modify: `src/compiler/compiler.worker.ts`
- Modify: `eval/compile.test.ts:60-105`

**Interfaces:**
- Consumes: `lex`, `parse`, `typeCheck`.
- Produces: `function compileSource(source: string): CompileOutcome` where
  `CompileOutcome` is `{ readonly ok: boolean; readonly errors: ReadonlyArray<CompilerError>; readonly ir: IRSceneNode | null; readonly symbols: ReadonlyArray<string> }`.
  Task 7's CLI calls it.

- [ ] **Step 1: Write the failing tests**

Create `src/compiler/compileSource.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { compileSource } from "./compileSource";

describe("compileSource", () => {
  it("compiles a valid scene to IR", () => {
    const out = compileSource(`scene { size: (800, 600) circle c { position: (1, 2), radius: 3 } }`);
    expect(out.ok).toBe(true);
    expect(out.errors).toEqual([]);
    expect(out.ir!.width).toBe(800);
    expect(Object.keys(out.ir!.registry)).toEqual(["c"]);
  });

  it("returns parse errors and no IR", () => {
    const out = compileSource(`circle c { }`);
    expect(out.ok).toBe(false);
    expect(out.ir).toBeNull();
    expect(out.errors.length).toBeGreaterThan(0);
  });

  it("returns type errors and no IR", () => {
    const out = compileSource(`scene { size: (800, 600) circle c { position: (1, 2), radius: -3 } }`);
    expect(out.ok).toBe(false);
    expect(out.ir).toBeNull();
    expect(out.errors.map((e) => e.message).join("\n")).toContain("greater than zero");
  });

  it("reports binding and object names as symbols", () => {
    const out = compileSource(`let r = 5\nscene { size: (800, 600) circle dot { position: (1, 2), radius: r } }`);
    expect(out.symbols).toContain("r");
    expect(out.symbols).toContain("dot");
  });

  it("turns a thrown error into a diagnostic rather than propagating it", () => {
    // A source that throws inside the pipeline rather than returning errors
    // must still come back as a CompileOutcome — the worker relied on this and
    // so does the CLI's exit code.
    const out = compileSource(" ".repeat(4));
    expect(out.ok).toBe(false);
    expect(out.errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run and read the RED**

Run: `npx vitest run src/compiler/compileSource.test.ts`
Expected: FAIL — cannot resolve `./compileSource`.

- [ ] **Step 3: Implement**

Create `src/compiler/compileSource.ts`, moving `normaliseError` and
`getAstSymbols` out of `compiler.worker.ts` unchanged:

```ts
import { lex } from "./lexer";
import { parse } from "./parser";
import { typeCheck } from "./typeChecker";
import type { IRSceneNode } from "./sceneIR";
import type { AstNode, CompilerError, ObjectNode } from "./types";

export interface CompileOutcome {
  readonly ok: boolean;
  readonly errors: ReadonlyArray<CompilerError>;
  readonly ir: IRSceneNode | null;
  readonly symbols: ReadonlyArray<string>;
}
```

Then `normaliseError` and `getAstSymbols` verbatim from
`compiler.worker.ts:6-42`, and:

```ts
/**
 * The one `lex -> parse -> typeCheck` pipeline.
 *
 * Imports nothing from the DOM, the Web Worker API, or PixiJS, so it runs
 * unchanged in the worker, in Node under Vitest, and in the CLI. Before this
 * existed the pipeline was written out independently in `compiler.worker.ts`
 * and `eval/compile.test.ts`, and a third copy was about to be written for
 * `marey check` — the hand-synced-list anti-pattern at module scale.
 *
 * Log formatting deliberately stays with its consumers: the worker's `[lexer]`
 * / `[parser]` / `[type]` lines are presentation for one particular terminal
 * pane, and the CLI wants none of them.
 */
export function compileSource(source: string): CompileOutcome {
  try {
    const { ast, errors: parseErrors, env } = parse(lex(source));

    const symbols = new Set<string>();
    if (env) for (const k of Object.keys(env)) symbols.add(k);

    if (parseErrors.length > 0) {
      return { ok: false, errors: parseErrors, ir: null, symbols: Array.from(symbols) };
    }
    if (!ast) {
      return { ok: false, errors: [], ir: null, symbols: Array.from(symbols) };
    }

    for (const s of getAstSymbols(ast)) symbols.add(s);
    const { errors, ir } = typeCheck(ast);

    return {
      ok: errors.length === 0 && ir !== null,
      errors,
      ir,
      symbols: Array.from(symbols),
    };
  } catch (raw: unknown) {
    return { ok: false, errors: [normaliseError(raw)], ir: null, symbols: [] };
  }
}
```

- [ ] **Step 4: Rewire the worker**

In `src/compiler/compiler.worker.ts`, delete the local `normaliseError`,
`getAstSymbols` and `doLint`, import `compileSource`, and rebuild both message
handlers on top of it. The **log lines must be byte-identical** to today's, since
the Terminal pane and `visual-check`'s output scraping both read them — keep
`[lexer] N tokens`, `[parser] AST root: scene, N top-level object(s)`, and
`[type] no errors — Scene IR ready (N node(s))` exactly as they are.

Note that today's worker reports token count, which `compileSource` does not
return. Call `lex` once in the worker for the count **or** widen `CompileOutcome`
with a `tokenCount`. Prefer widening — lexing twice for a log line is worse than
one extra field. **Report which you chose and why.**

- [ ] **Step 5: Rewire the eval harness**

In `eval/compile.test.ts`, replace the inline `parse(lex(src))` / `typeCheck`
block with `compileSource(src)`. The report JSON's shape must not change: it
still has `file`, `ok`, `parseErrors`, `typeErrors`, `nodeCount`.

**Partition carefully — this is not a two-way split.** Six `phase` values exist
in the compiler: `LEX`, `PARSE`, `TYPE`, `RENDER`, `RUNTIME`, `SYSTEM`. Only
`TYPE` belongs in `typeErrors`; everything else belongs in `parseErrors`, which
is what today's harness effectively does, since it catches thrown lexer errors
into `parseErrors` as `THREW: …`.

Two behavioural details today's harness has and must keep:

- **Lexer errors are `throw`n, not returned** (`lexer/handlers.ts:28`), so they
  never appeared as structured errors at all. `compileSource` catches them and
  returns them as `phase: "LEX"` diagnostics, which is a *change in the report's
  text* for any corpus file that fails to lex. Check whether any file in any of
  the three corpora currently produces a `THREW:` entry — `grep -l THREW
  eval/report*.json`. If none does, the change is unobservable and Step 6's
  byte-identical check will confirm it. If one does, **stop and report**: the
  report JSONs are cited as phase exit criteria, and changing their text is a
  decision, not a refactor.
- The message format today is `` `L${e.line ?? "?"}: ${e.message}` ``. Keep it
  exactly.

- [ ] **Step 6: Prove the eval reports did not move**

```bash
npx vitest run --config eval/vitest.config.ts
EVAL_DIR=eval/scenes-r2 npx vitest run --config eval/vitest.config.ts
EVAL_DIR=eval/scenes-3b npx vitest run --config eval/vitest.config.ts
git diff --stat -- eval/report.json eval/report-r2.json eval/report-3b.json
```

Expected: 20/20, 20/20, 3/3 — and the final command **empty**, checked *after*
all three runs have regenerated all three files. Use `git diff`, never
`git status` (Global Constraint 2). A moved report means the refactor changed
behaviour, which it must not.

- [ ] **Step 7: Run everything and commit**

```bash
npx vitest run && npx tsc -b --noEmit && npm run build
git add -A
git commit -m "feat(4): one compiler surface, not coupled to the Web Worker

lex -> parse -> typeCheck was written out independently in
compiler.worker.ts and eval/compile.test.ts, and marey check was about
to make it three. compileSource is the one copy; the worker keeps its
postMessage shell and its log formatting, which is presentation.

All three eval report JSONs regenerate byte-identical."
```

---

### Task 7: `marey check`

There is no CLI today: `package.json` declares no `bin`, and its scripts are
only `dev`, `build`, `preview`, `test`, `test:watch`.

**Files:**
- Create: `src/cli/check.ts`
- Create: `src/cli/check.test.ts`
- Create: `bin/marey.mjs`
- Create: `vite.cli.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `compileSource` (Task 6); `planExport`, `MAX_EXPORT_FRAMES` (Task 4).
- Produces:
  - `function parseArgs(argv: readonly string[]): CheckArgs` where
    `CheckArgs = { readonly files: readonly string[]; readonly exportReady: boolean; readonly fps: number | null; readonly error: string | null }`
  - `function formatDiagnostic(file: string, e: CompilerError): string`
  - `function checkOne(file: string, source: string, args: CheckArgs): { readonly ok: boolean; readonly lines: readonly string[] }`
  - `async function main(argv: readonly string[]): Promise<number>` — the exit code.

- [ ] **Step 1: Write the failing tests**

The pure layer is what gets tested; file I/O is not. Create
`src/cli/check.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseArgs, formatDiagnostic, checkOne } from "./check";

describe("parseArgs", () => {
  it("collects file arguments", () => {
    expect(parseArgs(["a.marey", "b.marey"]).files).toEqual(["a.marey", "b.marey"]);
  });

  it("defaults to no export check and no fps", () => {
    const a = parseArgs(["a.marey"]);
    expect(a.exportReady).toBe(false);
    expect(a.fps).toBeNull();
  });

  it("reads --export-ready and --fps", () => {
    const a = parseArgs(["--export-ready", "--fps", "30", "a.marey"]);
    expect(a.exportReady).toBe(true);
    expect(a.fps).toBe(30);
  });

  it("rejects a non-numeric fps", () => {
    expect(parseArgs(["--fps", "soon", "a.marey"]).error).toContain("--fps");
  });

  it("rejects an empty file list", () => {
    expect(parseArgs([]).error).toContain("no files");
  });
});

describe("formatDiagnostic", () => {
  it("renders file, line and column", () => {
    const line = formatDiagnostic("scenes/a.marey", {
      phase: "TYPE", message: "[TYPE_X] bad", line: 4, col: 7,
    });
    expect(line).toContain("scenes/a.marey:4:7");
    expect(line).toContain("[TYPE_X] bad");
  });

  it("renders a diagnostic with no position without inventing one", () => {
    const line = formatDiagnostic("a.marey", { phase: "SYSTEM", message: "boom" });
    expect(line).toContain("a.marey");
    expect(line).not.toContain(":undefined");
  });
});

describe("checkOne", () => {
  const plain = parseArgs(["x.marey"]);
  const ready = parseArgs(["--export-ready", "x.marey"]);
  const ready30 = parseArgs(["--export-ready", "--fps", "30", "x.marey"]);

  it("passes a valid scene", () => {
    expect(checkOne("x.marey", `scene { size: (8, 6) }`, plain).ok).toBe(true);
  });

  it("fails an invalid scene and names the diagnostic", () => {
    const out = checkOne("x.marey", `scene { size: (8, 6) circle c { position: (1,2), radius: -3 } }`, plain);
    expect(out.ok).toBe(false);
    expect(out.lines.join("\n")).toContain("greater than zero");
  });

  it("ignores export-readiness unless asked", () => {
    expect(checkOne("x.marey", `scene { size: (8, 6) }`, plain).ok).toBe(true);
  });

  it("reports an unbounded scene under --export-ready with no fps", () => {
    const out = checkOne("x.marey", `scene { size: (8, 6) }`, ready);
    expect(out.ok).toBe(false);
    expect(out.lines.join("\n")).toContain("EXPORT_UNBOUNDED_SCENE");
  });

  it("accepts a bounded scene under --export-ready with an fps", () => {
    expect(checkOne("x.marey", `scene { size: (8, 6) duration: 2 }`, ready30).ok).toBe(true);
  });

  it("reports an unsupported fps only when an fps was given", () => {
    const at25 = parseArgs(["--export-ready", "--fps", "25", "x.marey"]);
    const out = checkOne("x.marey", `scene { size: (8, 6) duration: 2 }`, at25);
    expect(out.lines.join("\n")).toContain("EXPORT_UNSUPPORTED_FPS");
    expect(checkOne("x.marey", `scene { size: (8, 6) duration: 2 }`, ready).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run and read the RED**

Run: `npx vitest run src/cli/check.test.ts`
Expected: FAIL — cannot resolve `./check`.

- [ ] **Step 3: Implement the pure layer**

Create `src/cli/check.ts`. `parseArgs`, `formatDiagnostic` and `checkOne` are
pure; only `main` touches the filesystem, and it is the only part not unit
tested.

For `--export-ready` **without** `--fps`, run `planExport` at a rate that cannot
itself be the problem and report only the rate-independent diagnostics — filter
the result to codes other than `EXPORT_UNSUPPORTED_FPS`, `EXPORT_EMPTY_SEQUENCE`
and `EXPORT_FRAME_BUDGET`. Do **not** invent a default frame rate in the output;
the point is to answer "is this scene bounded at all?" without pretending a rate
was requested. Put that reasoning in a comment beside the filter.

`main(argv)` reads each file with `node:fs`, calls `checkOne`, prints, and
returns `0` or `1`.

- [ ] **Step 4: Create the launcher and the build**

`bin/marey.mjs`:

```js
#!/usr/bin/env node
// Thin launcher. The CLI is built to dist/cli/ by `npm run build:cli`, because
// the compiler's relative imports are extensionless under
// moduleResolution: "bundler" and Node's native type stripping cannot resolve
// them. (erasableSyntaxOnly is already on, so the source is strip-compatible;
// the resolution problem is separate and is not fixed by it.)
import { main } from "../dist/cli/marey.mjs";
process.exit(await main(process.argv.slice(2)));
```

`vite.cli.config.ts`: library mode, entry `src/cli/check.ts`, format `es`,
filename `marey.mjs`, `outDir: "dist/cli"`, `target: "node22"`,
`rollupOptions.external` covering `node:*`, and `emptyOutDir: false` so it does
not wipe the app build.

`package.json` gains:

```json
  "bin": { "marey": "bin/marey.mjs" },
```

and, in `scripts`:

```json
    "build:cli": "vite build --config vite.cli.config.ts",
    "check": "npm run build:cli && node bin/marey.mjs check",
```

Leave `"private": true` alone — publishing is Phase 6.

- [ ] **Step 5: Prove it runs end to end**

```bash
npm run build:cli
node bin/marey.mjs check eval/scenes-3b/bar-chart.marey; echo "exit=$?"
node bin/marey.mjs check --export-ready eval/scenes-3b/bar-chart.marey; echo "exit=$?"
```

Expected: the first exits **0**; the second exits **1** and prints
`EXPORT_UNBOUNDED_SCENE`, because `bar-chart.marey` declares no duration yet —
Task 8 gives it one. Paste the real output into the report.

Also run it against a deliberately broken file and confirm exit 1 with a
positioned diagnostic.

- [ ] **Step 6: Run everything and commit**

```bash
npx vitest run && npx tsc -b --noEmit && npm run build
git add -A
git commit -m "feat(4): marey check

The first CLI: package.json had no bin. Compiles each file, prints
positioned diagnostics, exits 1 on error. --export-ready runs planExport;
without --fps it reports only the rate-independent diagnostics rather
than inventing a default frame rate nobody asked for.

A build step is required because the compiler's relative imports are
extensionless under moduleResolution: bundler, which Node's native type
stripping cannot resolve."
```

---

### Task 8a: PNG from the browser

Roadmap §6.3's named trap: reading the PixiJS canvas in-page returns a **blank
frame**, because PixiJS does not set `preserveDrawingBuffer`. Verified still
true on `main` — the flag appears nowhere in `src/`, and Pixi's `extract` API is
used nowhere either. **A naive PNG export produces blank images and reports
success.**

`renderer.extract.canvas(container)` renders into a render texture the caller
owns and reads back from *that*, so the drawing buffer's contents are
irrelevant. That is the roadmap's preferred route and avoids taxing every live
frame for an export-only feature.

**Files:**
- Create: `src/compiler/export/pngSequence.ts`
- Create: `tools/visual-check/export-check.mjs`
- Modify: `tools/visual-check/SKILL.md`

**Interfaces:**
- Consumes: `FrameSnapshot` (Task 5); `planExport` (Task 4); `SceneRuntime`,
  `MatterWorld`, `buildNode`.
- Produces:
  - `function applySnapshot(root: Container, frame: FrameSnapshot): void`
  - `async function encodePngSequence(app: Application, root: Container, frames: ReadonlyArray<FrameSnapshot>): Promise<Uint8Array[]>`
  - `window.__mareyExportPng(source: string, opts: { fps: number; durationSeconds?: number }): Promise<{ frames: string[]; hash: string }>` — base64 PNGs, exposed for the harness.

- [ ] **Step 1: Implement `applySnapshot` and test it headlessly**

This half *is* headlessly testable — it writes container fields and needs no
GPU. Add to `src/compiler/renderer/frameSampler.test.ts`:

```ts
describe("applySnapshot", () => {
  it("round-trips: applying a frame's own snapshot changes nothing", () => {
    const ir = irFor(SOURCE);
    const result = planExport(ir, { fps: 30 });
    if (!result.ok) throw new Error("plan failed");
    const world = new MatterWorld(ir.width, ir.height);
    const root = buildRoot(ir);
    const runtime = new SceneRuntime(world, root);
    const frames = sampleFrames(runtime, root, result.plan);

    // Re-applying the last frame to the tree it came from must be a no-op.
    const before = JSON.stringify(frames[frames.length - 1].objects);
    applySnapshot(root, frames[frames.length - 1]);
    const after = JSON.stringify(snapshotFor(root));
    expect(after).toBe(before);

    runtime.destroy();
  });

  it("moves the tree to an earlier frame's state", () => {
    // ...build as above, then:
    applySnapshot(root, frames[0]);
    const slider = snapshotFor(root).find((o) => o.id === "slider")!;
    expect(slider.x).toBeCloseTo(100, 6);
  });
});
```

Export a small `snapshotFor(root)` from `frameSampler.ts` (the existing
`snapshotObjects`, made public) so the test can read the tree without
re-running the sampler.

- [ ] **Step 2: Implement `encodePngSequence`**

In `src/compiler/export/pngSequence.ts`. It receives `FrameSnapshot[]` and
**no runtime, no world, no driver**, so it cannot advance the simulation even by
accident — that is roadmap §6.2's "encoders never advance the simulation and
never see a wall clock", made structural.

Per frame: `applySnapshot(root, frame)`, then
`app.renderer.extract.canvas(root)`, then read PNG bytes off that canvas. Render
at the scene's logical size with no `fit` scaling — the exported artifact is the
scene, not the preview's letterboxing.

- [ ] **Step 3: Expose the harness seam**

Add `window.__mareyExportPng` in the app, guarded to `import.meta.env.DEV`, that
compiles a source with `compileSource`, plans with `planExport`, builds a scene
root, samples with `sampleFrames`, encodes with `encodePngSequence`, and returns
base64 frames plus `hashFrames(frames)`.

Document in `SKILL.md` that this seam exists and why: the harness needs to reach
the export path without a UI, and a narrow named seam beats driving a button
that does not exist.

- [ ] **Step 4: Write the harness**

`tools/visual-check/export-check.mjs`, modelled on the existing
`check.mjs`: load the app, inject the scene through the `#code=` share hash,
call the seam, write `frame_%04d.png` and `report.json` to `--out`, then reload
from cold and repeat, comparing per-frame PNG hashes and the snapshot hash.

Flags: `--scene`, `--fps`, `--duration`, `--out`, `--url`, `--headed`.

- [ ] **Step 5: Run it, and LOOK AT THE PNGs**

```bash
npx vite --port 5199 --strictPort   # leave running; --strictPort is mandatory
node tools/visual-check/export-check.mjs \
  --scene tools/visual-check/scenes/logo.marey \
  --fps 30 --duration 3 --out .visual-check/export/logo
```

Then **open several PNGs with the Read tool** — the first frame, one mid-motion,
and the last. A blank image is the exact failure mode this task exists to avoid,
and `report.json` cannot see it: a sequence of 90 identical blank frames hashes
consistently and would pass every numeric check.

If the images cannot actually be viewed, **say so plainly** rather than
implying they were.

Kill the server afterwards and confirm port 5199 has no `LISTENING` socket.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(4): PNG sequence export from the browser

renderer.extract.canvas renders into a render texture we own, so the
blank-frame trap does not apply and preserveDrawingBuffer stays off — no
per-frame cost for an export-only feature.

encodePngSequence receives FrameSnapshot[] and no runtime, world or
driver, so an encoder structurally cannot advance the simulation.

PNGs written to disk and looked at, not just their JSON."
```

---

### Task 8b: The canonical scene, Gate B evidence, and the record

**Files:**
- Create: `eval/scenes-3b/compound-logo.marey`
- Modify: `eval/scenes-3b/bar-chart.marey`, `radial-dots.marey`, `timeline-ticks.marey` (add `duration`)
- Modify: `eval/scenes-3b/README.md`, `eval/RESULTS-3B.md`
- Create: `eval/RESULTS-GATE-B.md`
- Modify: `docs/architecture/renderer.md`, `roadmap-and-process.md`, `README.md`
- Modify: `docs/plans/2026-09-10-phase-4-composition-and-export.md` (execution notes)

- [ ] **Step 1: Write the canonical scene old §5.3 names**

`eval/scenes-3b/compound-logo.marey`: a multi-part `group` that **animates in,
hands off to physics, and settles**, with a finite scene `duration`.

It must genuinely be all three, because old §5.3 says *"A multi-part visual
animates into a deterministic shared-world simulation and exports as baked
transforms."* `logo.marey` fails that — it has no `animate` block and is
`duration: indefinitely`. Note D17: `physics` inside a group is only legal under
a *static* group, so the animation belongs on the group's own timeline, not on a
child.

Compile it before going further:

```bash
EVAL_DIR=eval/scenes-3b npx vitest run --config eval/vitest.config.ts
```

- [ ] **Step 2: Give the other three canonical scenes a duration**

They are currently unbounded, so `marey check --export-ready` refuses them —
which Task 7 Step 5 already demonstrated. Add a `duration` to each. Choose it
from what the scene actually does: `bar-chart` and `radial-dots` are static, so
a short duration is honest; `timeline-ticks` loops, so pick a whole number of
its cycles and say so in a comment.

Confirm `eval/report-3b.json` regenerates and diff it deliberately — this time
it **is** expected to move, because the corpus gained a file and the scenes
gained a property. Read the diff before committing it.

- [ ] **Step 3: Write the Gate B evidence document**

`eval/RESULTS-GATE-B.md`, one section per criterion, each with the **command**
that reproduces it and the **revert** that reddens it. Evidence is reproducible
from the repository — commands, not claims (roadmap §14.2).

| Criterion | Command |
|---|---|
| Exact counts at 24/30/60 | `npx vitest run src/compiler/renderer/frameSampler.test.ts` |
| Identical hashes on repeat | the same, plus `export-check.mjs` run twice |
| Pacing cannot affect state | the 30-vs-60 and 24-vs-60 coincident-frame tests |
| Invalid/unbounded fails first | `npx vitest run src/compiler/export/exportContract.test.ts` |
| Canonical scenes, one sampler | a headless test iterating all four `.marey` files |

Add that last test to `frameSampler.test.ts`: read each of the four canonical
files, compile, plan at 24/30/60, sample, and assert the frame counts. Skip
`bar-chart.marey`'s **build** only if `text` genuinely prevents it headlessly —
and if so, say which criterion that leaves to the browser, rather than quietly
dropping the scene.

- [ ] **Step 4: Update the guidance documents**

- `docs/architecture/renderer.md`: the sampler's place beside `LiveDriver`,
  `paintExactTick` and the two opposite alpha conventions with the measured
  numbers, and `__mareyId`. This file is mandatory reading for anyone touching
  `src/compiler/renderer/`, so a Phase 4 that does not reach it leaves the next
  agent briefed off a stale document — exactly the defect Phase 3C recorded as
  its first source-beyond-the-plan finding.
- `docs/architecture/roadmap-and-process.md`: rewrite the Phase 4 bullet as
  done, and add the one corrective sentence about new §16 versus new §6.
- `docs/architecture/README.md`: the "Current phase" line. **Both phase-status
  locations must be updated in the same edit** — all three transitions so far
  shipped stale (AGENT-LESSONS §5b).
- `tools/visual-check/SKILL.md`: `export-check.mjs` and its flags.

- [ ] **Step 5: Write the execution notes**

Append an "Execution notes" section to this plan, from `git diff` and the task
reports — **not** from any single task's self-report. Every number re-derived
first-hand on a clean tree. Include:

- Final evidence table: suite count, typecheck, build, all four corpora, the
  Chromium run, tree cleanliness.
- Gate B criteria with the evidence that settles each.
- Defects found in source beyond the plan.
- Defects found in **this plan** — including any place a verbatim code block
  above turned out to be a claim about an API that does not exist.
- Deliberate gaps and deferrals, each with what makes it harmless *today*.
- Mutation tests, each count beside the suite size it was taken against.
- Process notes for Phase 5A.

- [ ] **Step 6: Final verification and commit**

```bash
npx vitest run
npx tsc -b --noEmit
npm run build
npm run build:cli
npx vitest run --config eval/vitest.config.ts
EVAL_DIR=eval/scenes-r2 npx vitest run --config eval/vitest.config.ts
EVAL_DIR=eval/scenes-3b npx vitest run --config eval/vitest.config.ts
EVAL_DIR=tools/visual-check/scenes npx vitest run --config eval/vitest.config.ts
git ls-files --others --exclude-standard
git diff --stat
```

Delete any probe or scratch file before reporting, and re-derive the suite count
afterwards — a leftover `.test.ts` inflates it by a number that looks right
unless you know the baseline.

```bash
git add -A
git commit -m "docs(4): canonical scene 5.3, Gate B evidence, and the record"
```

---

## What is still owed after Task 8b

Per AGENT-LESSONS §8, **Phase 4 is not done at Task 8b.** Phase 3A passed eleven
task reviews and a whole-branch review and *then* an outside reviewer found four
Important defects, two of which made published exit criteria false.

Owed:

1. An **independent whole-branch review** by someone with no stake in this
   reasoning. Give it the question and the evidence to check, never the answer
   (AGENT-LESSONS §3).
2. The merge, with **both** phase-status locations updated in the same edit.

---

## Self-review

**Spec coverage.** Every spec section maps to a task: §2 → Task 8b Step 1; §3
and §3.1 → Task 2; §4.1–4.3 → Task 3; §4.4–4.5 → Task 4; §5.1–5.3 → Task 5;
§5.4–5.5 → Task 5 Steps 3–5; §6.1 → Task 6; §6.2 → Task 7; §6.3–6.4 → Task 8a;
§7 → Global Constraints 7–10 plus each task's mutation step; §8 → Task 8b
Step 3; §10's deferrals are carried into Task 8b Step 5's notes. The Phase 3C
debt in §8's table is Task 1.

**Placeholder scan.** No "TBD", no "handle edge cases", no "similar to Task N".
Three steps deliberately describe an implementation rather than showing it —
Task 7 Step 3's `main`, Task 8a Steps 2–4 — because each is either
filesystem/browser glue whose exact shape depends on APIs the implementer must
read (`extract`, Playwright), or is a direct copy of an existing sibling file
(`check.mjs`). Each names the file to model on. Flagged rather than hidden.

**Type consistency.** `SamplerPlan` is produced in Task 4 and consumed in Task 5
with the same four fields. `FrameSnapshot`/`ObjectSnapshot` are produced in Task
5 and consumed in Task 8a. `CompileOutcome` is produced in Task 6 and consumed
in Task 7. `paintExactTick()` is produced in Task 2 and called in Task 5.
`__mareyId` is written in Task 5 Step 3 and read in Task 5 Step 5.
`hashFrames` is produced in Task 5 Step 4 and used in Tasks 5, 8a and 8b.
`absentMeans` is produced in Task 3 Step 3 and read in Task 3 Step 4.

**One known risk, stated rather than smoothed over.** Task 5's paint-cadence
argument is a hypothesis. Its Step 6 mutation 2 is what settles it, and the plan
tells the implementer what to do in *either* outcome — including correcting the
docstring and reporting it if the hypothesis is wrong. A plan that only handled
the outcome it expected would be the §3b failure: a check whose result nobody is
allowed to act on.

---

## Execution notes

Written 2026-09-11 at the close of Task 8b, from `git log`/`git diff
main..HEAD`, the nine task reports, and the SDD ledger
(`.sdd/2026-09-10-phase-4-composition-and-export/progress.md`) —
**not** from any single task's self-report, per AGENT-LESSONS §1. Every number
in "Final evidence" was re-derived first-hand on a clean tree while writing
this. Three of the mutation rows below were re-run first-hand for this
document specifically (marked *(re-run, 8b)*); the rest are drawn from the
ledger, each beside the suite size it was measured against, exactly as Phase
3C's notes did. Every mutated file was restored afterwards with
`git diff --stat` confirmed empty before moving to the next.

Task 8b itself was interrupted twice by API rate limits (infrastructure, not
the diff) and completed by a third agent — this one. Commit-as-you-go held
both times: `8a8bd38` and `0995d5e` survived the first kill, `cc552b3` and the
Gate B evidence document survived the second. Both inheritances were
independently checked before being built on, not assumed sound because they
were already committed — see "The inherited work" below.

### Final evidence

| Check | Command | Result |
|---|---|---|
| Unit suite | `npx vitest run` | **24 files / 760 tests / exit 0** |
| Typecheck | `npx tsc -b --noEmit` | exit 0 |
| Production build | `npm run build` | exit 0; only the pre-existing >500 kB chunk-size advisory |
| Production build carries no dev seam | `npm run build` then grep `dist/` for `__mareyExportPng`, `devExportSeam`, `installExportSeam` | **zero matches** — the DEV-only `window.__mareyExportPng` seam is dropped by Vite's dead-branch elimination, not merely left ungrepped |
| CLI build | `npm run build:cli` | exit 0, `dist/cli/marey.mjs` 92.10 kB |
| R1 corpus | `npx vitest run --config eval/vitest.config.ts` | **20/20 compiled clean**, `eval/report.json` unmoved |
| R2 corpus | `EVAL_DIR=eval/scenes-r2 npx vitest run --config eval/vitest.config.ts` | **20/20 compiled clean**, `eval/report-r2.json` unmoved |
| 3B demonstration corpus | `EVAL_DIR=eval/scenes-3b npx vitest run --config eval/vitest.config.ts` | **4/4 compiled clean** (was 3/3 before this task — see "`eval/report-3b.json` diff" below) |
| Visual-check fixtures | `EVAL_DIR=tools/visual-check/scenes npx vitest run --config eval/vitest.config.ts` | **17/17 compiled clean**, unchanged from Phase 3C's own count — this phase added no scene to that directory. Its report JSON was written to `tools/visual-check/report.json`, inspected, then **deleted rather than committed**, matching the Phase 3C precedent recorded in that phase's own execution notes |
| Reference examples | `npx vitest run src/compiler/languageDocs.test.ts` | 46/46 — the `duration` wording fix in this task did not touch a fenced block, and the suite confirms it |
| Tree | `git ls-files --others --exclude-standard`; `git diff --stat` | both empty |
| Port 5199 | `netstat -ano` grepped for `:5199` | no LISTENING socket. (One was found orphaned at the second kill — PID 3424 — and killed by the controller before the third dispatch; recorded in the ledger, not rediscovered here) |

**The Chromium evidence in this document is not re-run in this session.**
`eval/RESULTS-GATE-B.md`'s cross-environment section (`compound-logo.marey`
and `radial-dots.marey` through `export-check.mjs`) and Task 8a's own
Chromium run (`logo.marey`, three frames read with the Read tool) were both
performed and recorded before this task began, at a commit essentially
identical to this one (`cc552b3`, three documentation-only commits behind
`HEAD`). This task re-derived every **headless** number in this document on a
clean tree, and read `eval/RESULTS-GATE-B.md` in full before committing it,
but did not re-launch `npx vite --port 5199 --strictPort` or re-drive
Chromium itself — the environment note said the dev server should not be
needed, and it was not. Anything resting on the browser is cited from an
existing, reproducible document rather than re-demonstrated fresh; the
commands to reproduce it are in that document.

Branch shape, **as of `ad7f04e`, the commit immediately before this execution-notes
commit** (a commit cannot contain its own diffstat, so these figures are a
snapshot rather than a live count — running the same commands after this
commit lands will show one more commit and this document's own line count
added to the diff): **24 commits**, `main..HEAD` (merge base `f032991`),
**48 files, +6,076 / −171**. Tasks 1–8a (`ad4b16e..0519ea3`, **17 commits**) are
**36 files, +4,550 / −149**; Task 8b (`0519ea3..ad7f04e`, 6 commits —
`8a8bd38`, `0995d5e`, `cc552b3` from the first two attempts, plus this
session's `b4b6ad1`, `5024bd5`, `ad7f04e`) adds **15 files, +905 / −28** on
top of that, almost entirely documentation and the one four-scene test
addition to `frameSampler.test.ts`. As Phase 3C's notes observed, a single
grand total is not quoted as a round-trip check against itself — both figures
above are stable because neither is measured over a file this section lives
in.

**Baseline check.** The suite at the branch base `f032991` (Global Constraint
1) was 20 files / 677 tests. Task 8b's own dispatch base, `0519ea3` (Task 8a's
end), was 24 files / 749 tests; its own Steps 1–3 (the canonical scene plus
the four-canonical-scene describe block, 11 new cases) brought it to 24 files
/ 760 before this session began, confirmed by `git show
0519ea3:src/compiler/renderer/frameSampler.test.ts` carrying 16 `it`/`it.each`
call sites against the current file's 29 individual cases. This session added
no test. Net for the whole phase, base to current `HEAD`: **+4 files, +83
tests**.

### The inherited work (Task 8b, third attempt)

Verified before building on it, per AGENT-LESSONS §6's rule that an
interrupted agent's tree must be checked, not assumed:

- `src/compiler/export/frameHash.ts`'s docstring correction — read in full,
  cross-checked against `eval/RESULTS-GATE-B.md`'s own measured numbers
  (`-0.86602540378443848557` in Node, and the Chromium value one ULP away),
  and against a fresh `npx vitest run src/compiler/renderer/frameSampler.test.ts`
  (29/29 before touching anything). Coherent; committed as this task's first
  action, unmodified.
- `eval/RESULTS-GATE-B.md` (435 lines, untracked) — read in full. Verdict:
  sound. It performs and restores five reverts (one per Gate B criterion),
  each with `git diff --stat` confirmed empty afterward per its own text, and
  its central finding — the cross-machine hash gap — is independently
  reproducible from the commands it prints. Two of those five reverts were
  re-performed independently in this session (see "Mutation tests" below)
  rather than taken on the document's word alone, and matched exactly.
- `eval/scenes-3b/compound-logo.marey` and
  `src/compiler/renderer/frameSampler.test.ts` (already committed at
  `8a8bd38`/`cc552b3`/`0995d5e` by the time this attempt started) — the scene
  was retuned from a 6s to an 8s duration so the mark settles at 5.5s with
  2.5s of genuinely-settled frames remaining, `easeIn` was replaced with
  `linear` because `easeIn` threw the mark into the scene corner with its arms
  clipped, and `frameSampler.test.ts`'s canonical-corpus test moved with it
  (handoff frame 42→48). Confirmed by reading the scene's own comments against
  the test's assertions and by the full suite passing.

### `eval/report-3b.json` diff, read deliberately

Per the environment note, this file was expected to move and the diff was
read before committing it (already committed at `8a8bd38`, re-confirmed here
by regenerating on a clean tree and diffing against the committed blob — zero
difference):

```
+  {
+    "file": "compound-logo.marey",
+    "ok": true,
+    "parseErrors": [],
+    "typeErrors": [],
+    "nodeCount": 4
+  },
```

One addition, nothing else — `bar-chart.marey`, `radial-dots.marey` and
`timeline-ticks.marey` each gained a `duration` property in the same task, and
none of their `nodeCount`s moved, because `duration` is a scene-level property
in the IR, not a node. `compound-logo.marey`'s `nodeCount: 4` is the group
plus its three welded rectangles — the same four ids
(`scene.mark`, `.stem`, `.armTop`, `.armMid`) `frameSampler.test.ts` asserts.

### Gate B criteria, each with the evidence that settles it

Full detail, commands and reverts are in `eval/RESULTS-GATE-B.md`; this is
the index the roadmap (§6.4) asks for.

| # | Criterion | Proven headlessly | Rests on the browser |
|---|---|---|---|
| 1 | Exact frame counts at 24/30/60fps | Yes — `it.each` over all three rates, plus a physical-consequence check reading displacement ratios rather than labels | — |
| 2 | Repeated exports produce identical hashes | Yes, **same-machine and cross-reload** (headless-to-headless, and Chromium-to-Chromium via `export-check.mjs` twice-from-cold) | **Cross-machine (Node vs. Chromium) equality is not a corpus-wide property.** Proven for `compound-logo` (no trig in source); measured **false** for `radial-dots` (`Math.sin` at 240°, one ULP apart between V8 builds) |
| 3 | Frame pacing cannot affect exported state | Yes — 30-vs-60 and 24-vs-60 coincident-frame tests, both comparing full object content | — |
| 4 | Invalid/unbounded requests fail before rendering | Yes — 21/21 in `exportContract.test.ts`, including multi-diagnostic reporting | — |
| 5 | The canonical scenes export through one sampler | **Compile-and-plan half: all four scenes**, via `it.each(CANONICAL_SCENES)`. **Build-and-sample half: two of four** (`compound-logo`, `radial-dots`) | `bar-chart` and `timeline-ticks` declare `text`, which needs `document.createElement("canvas")` — absent under Vitest's `node` environment, confirmed with a scratch probe (deleted after use) rather than inferred. `bar-chart`'s build-and-sample half **is** demonstrated in the browser (`export-check.mjs`, this task); `timeline-ticks`'s is not separately re-verified here |

**Narrow evidentiary base, stated rather than hidden.** `bar-chart`,
`radial-dots` and `timeline-ticks` are all static by declaration — no
`animate`/`physics`/`sequence` anywhere in any of the three, confirmed by
reading each file. Every claim this corpus makes about *motion* — animating
in, handing off, settling under simulation — rests on `compound-logo.marey`
alone, the one scene this task added. `eval/RESULTS-GATE-B.md` names this
explicitly and is why its "compound-logo genuinely animates in..." test is
detailed rather than a one-line frame-count check.

### Defects found in source beyond the plan

Each names the commit it was fixed in. Ordered by task, not by severity.

1. **Task 5 — three Important review findings, all in the test layer, none in
   the sampler itself.** A `vi.spyOn` call-count assertion pinned per-tick
   paint *cadence* as a hard contract while the sampler's own docstring
   disclaims that cadence — one of the two had to change, and the test did.
   Two literal-vs-literal assertions (`frame 0 tick === 0`, `tick === i *
   ticksPerFrame`) could not distinguish a correct label from a lying one —
   the implementer's own mutation-3 finding was direct proof. And the
   reviewer's claim that "no behavioural assertion can distinguish
   `paintExactTick()` from `paint(0)`" was itself wrong: frame 0 is captured
   *before* any paint, so the lag does not cancel across that boundary the
   way it does in a cross-rate comparison. Fixed in `a8a59be` with a
   displacement-ratio assertion (~7/3 correct vs. 5/1 under the mutation, the
   choice of `3` as threshold independently confirmed to sit strictly between
   by a scoped re-review).
2. **Task 5 — `hashFrames` had no test file of its own**, so
   `frames.length.toString(16)` would have satisfied every existing hash
   assertion (both compare sequences of *different* length). Graded Minor by
   the reviewer, upgraded by the controller because it makes Gate B criterion
   2 vacuous regardless of the label on the finding. Fixed in `a8a59be`; this
   is the same test independently re-run in this session (see "Mutation
   tests").
3. **Task 6 — a false "unreachable" claim, on a path that drops a log line
   the CLI's own contract names.** The 51-error parser abort
   (`parser/state.ts:112-115`) is not an invariant violation; it is what
   happens when a user pastes a non-Marey document into the playground. It
   escapes every `ParseException` guard, lands in `compileSource`'s catch,
   normalises to `RUNTIME`, and on that path the worker dropped
   `[lexer]   N tokens` — one of the three log lines Global Constraint 3 names
   by hand. Fixed in `9c16cc6`, verified against the real 51-error boundary
   rather than by argument.
4. **Task 6 — the field the brief specifically asked for was the one field
   nothing asserted.** `tokenCount` was pinned for the wrong reason (padding
   in a log line, in a comment) while the suite's own rationale for pinning
   `topLevelObjectCount` was "don't leave a new field untested" — applied to
   one field and not its sibling. Fixed in `9c16cc6`.
5. **Task 6 — three byte-identical eval reports proved less than they
   sounded like.** All 43 entries across the three corpora are `ok: true`
   with empty error arrays, so the refactor's new three-way LEX/PARSE/TYPE
   phase partition was never exercised by any corpus file or test. Fixed by
   pinning the phase tags directly in `compileSource.test.ts` rather than by
   adding a failing file to an exit-criteria corpus, which would have changed
   what those corpora mean. Fixed in `9c16cc6`.
6. **Task 7 — a truncation bug real CI would have hit and the evidence
   structurally could not.** `bin/marey.mjs`'s `process.exit(await main(...))`
   (specified verbatim in the brief) forces Node to exit with async writes
   still pending; POSIX stdout to a **pipe** is asynchronous, so `marey check
   … | tee` can lose trailing diagnostics while still reporting exit 1. Every
   run in the original report went to a Windows TTY, where stdout is
   synchronous, so the existing evidence could not have found this — only
   reasoning about the target environment did. Fixed in `e7b3a4f` with
   `process.exitCode = await main(...)`, overriding the brief's own specified
   line.
7. **Task 7 — two false-pass argument-handling gaps, found and fixed
   together.** `--fps` without `--export-ready` was silently accepted and
   ignored, so a mistyped flag pair reported `ok` for a scene that would
   actually fail an export check — a verification tool's worst failure mode.
   Unknown `--`-prefixed flags were silently collected as filenames, so
   `--fps=30` (the common CLI idiom this parser does not accept) produced
   `ENOENT: … open '--fps=30'`, blaming a missing file for a syntax mistake.
   Both fixed in `e7b3a4f`.
8. **Task 8a — the inherited `devExportSeam.ts` leaked a live WebGL context
   on any setup throw.** Its `try` opened *after* `new Application()`,
   `app.init()`, the `buildNode` loop and `MatterWorld`/`SceneRuntime`
   construction, so the `finally` that destroys them never ran if any of that
   setup threw — a developer repeatedly calling the seam against a scene that
   fails to build would exhaust the browser's WebGL context limit and break
   the live preview too. The second implementer's own "verified and kept
   unchanged" review of the file missed this. Fixed in `0519ea3`, gated on
   `app.renderer` specifically rather than `app` — `app.destroy()`
   dereferences `this.renderer` with no null check, so gating on `app` alone
   would have thrown a second error from the cleanup path and masked the
   first.
9. **Task 8a — a silent no-op on the export write-back path**, the exact
   failure class ("moves in the JSON, stands still in the PNG") this task
   exists to defend against. `pngSequence.ts`'s `c.__updateLayout?.()` would
   silently do nothing for a container with a layout but no updater.
   Unreachable today (traced: `builder.ts`'s two assignment sites are
   unconditional and back-to-back across all six `buildNode` call sites), but
   made to throw loudly rather than stay a silent optional call. Fixed in
   `0519ea3`.

**Not fixed, and named as such.** Task 8a's controller recorded a residual
leak *beneath* the fix above, inside PixiJS itself: `autoDetectRenderer`
constructs a renderer and awaits `renderer.init()` before returning, so a
throw in that window allocates a context that is never exposed as
`app.renderer` and is therefore unreachable from any call site in this
codebase. Not introduced by this phase, not fixable from it, and it does not
make the Task 8a fix unsafe.

### Defects found in this plan

Ten in total — the running count the ledger kept live as implementers found
them, each treating a plan's code block as a claim to verify rather than text
to paste (AGENT-LESSONS §3d). All ten were caught before or during
implementation and none reached a merged commit uncorrected.

1–2. **Task 3.** The brief asserted the validator emits "greater than zero";
it emits "greater than 0" — a permanent false RED if pasted verbatim. The
brief's diagnostic snippet for `duration: indefinitely` produces **two**
diagnostics, contradicting its own `toHaveLength(1)`. Both found and corrected
by the implementer while implementing, inside `7799601`; both corrections
independently re-verified by an escalated (opus) reviewer, who confirmed the
reworded assertion is a *longer, more specific* substring than the one it
replaced (tightened, not loosened) and that the added `continue` is provably
unreachable without the diagnostic having already fired.

3. **Task 4.** The brief's own frame-budget test derived its input from the
live `MAX_EXPORT_FRAMES` constant it was meant to pin
(`(MAX_EXPORT_FRAMES + 1) / 60`), making it tautological under *any* positive
ceiling — it could not fail. Diagnosed by the implementer, not merely noted:
supplemented with literal `7_200`/`7_201` boundary values inside `d8c75d5`,
independently confirmed load-bearing by the reviewer (flipping the ceiling to
`72_000` genuinely reddens the literal-boundary test and leaves the
constant-derived one green either way).

4. **Task 5.** The brief's test asserted bare object names as snapshot ids
(`["slider", "faller"]`); real top-level IR ids are scope-qualified
(`scene.slider`). Corrected inside `20a62b3`.

5–8. **Task 6, four more in one brief.** Wrong error wording (a second
instance of the Task 3 pattern, in a different fixture), bare-vs-scope-qualified
registry ids (a second instance of the Task 5 pattern), a throw-test fixture
that did not actually throw, and an unpinned new field. All corrected inside
`692ba57`. This is the point the ledger's running count reached eight.

9. **Task 7.** The implementer applied the plan's own "flip the judgment call
and run the suite" check to a filter the brief never asked it to check, and
found a hole: removing the `--export-ready`-without-`--fps` rate-dependent
diagnostic filter left all of the brief's own tests green. Self-caught, fixed
by adding a fixture that makes the filter load-bearing (confirmed RED first),
committed separately as `6f97ec3`.

10. **Task 8a.** The brief's round-trip test would pass against an empty
`applySnapshot` body: `sampleFrames` leaves `root` already at the last sampled
frame's exact state, so re-applying that same frame and asserting nothing
changed asserts nothing at all. Found by review, fixed in `0519ea3` by moving
the tree to a different state first, then round-tripping.

**Pattern across all ten:** every one is a test-layer defect in specified
fixtures, not a specified behaviour that was wrong — the plan's *prose*
requirements held up; its *verbatim code blocks*, treated as claims about a
codebase they were written before or without re-reading, did not. This is the
same lesson Phase 3C's notes recorded under "Defects found in this plan," now
with three times the count, because Phase 4 had more tasks with fixture-heavy
verbatim tests (frame sampler assertions, CLI argument fixtures, a Playwright
round trip) than Phase 3C did.

### Two falsified claims, both mine, both caught by measurement

1. **The paint-cadence hypothesis (Task 5).** The plan argued the sampler
   *must* paint every tick because `spawnAnim` seeds a new runner's start
   value from paint-written container state. The plan's own prescribed
   experiment — moving `paintExactTick()` to run once per frame instead of
   once per tick — disproved it: the 30-vs-60 coincident-frame test still
   passed. Root cause: `tickAnim` already snaps a completing runner's value in
   the **tick** phase, independently of when paint next runs, so nothing in
   this suite's fixture was left for paint cadence to affect. Per-tick
   painting was **kept anyway**, as the conservative choice rather than a
   proven necessity — it is never less tick-aligned than per-frame painting,
   and a `sequence`-bearing scene remains untested for cadence sensitivity,
   which is a live reason not to loosen the rule on one fixture's evidence.
   The docstring in `frameSampler.ts` was rewritten from the unverified claim
   to the measurement (`20a62b3`/`a8a59be`).
2. **The cross-machine hash claim (Task 8b, this document and
   `frameHash.ts`'s own docstring).** Both claimed that because `hashFrames`
   hashes simulation output rather than pixels, it "carries the determinism
   claim across machines as well as across runs." Measured false:
   `compound-logo.marey`'s hash matches bit-for-bit between headless Node and
   Chromium; `radial-dots.marey`'s does not. Traced to `Math.sin` returning a
   different last bit at exactly 240° between Node's V8 and Playwright's
   bundled Chromium V8 (`-0.86602540378443848557` vs.
   `-0.86602540378443837454`) — IEEE-754 and ECMA-262 require `+ - * /` and
   `Math.sqrt` to be correctly rounded on every conformant engine;
   `Math.sin`/`Math.cos` are explicitly implementation-approximated and carry
   no such guarantee. `parseExpr.ts` folds `sin`/`cos` to literals at parse
   time, so any scene using trig can bake the divergence into its IR;
   `compound-logo.marey` has none, so its match is evidence that *that*
   scene has no source of the gap, not evidence the gap is corpus-wide.
   Corrected in `frameHash.ts`'s docstring and in
   `eval/RESULTS-GATE-B.md` (`b4b6ad1`).

Both were caught for the same reason: an implementer was told to measure a
claim rather than confirm it, and did. Both are the strongest evidence in this
phase for the roadmap's "commands, not claims" rule (§14.2) — a Gate B
document asserting cross-machine determinism on the strength of the original
argument alone would have shipped a falsehood the next phase built on.

### Deliberate gaps and deferrals

Structural gaps, each with what makes it harmless *today* — distinct from the
smaller findings in the next section.

| Deferred | Why it is safe to defer |
|---|---|
| `compiler.worker.ts` has **no automated test at all** | The largest untested surface the phase touched (Task 6, confirmed still true — no test file for it exists anywhere in the suite). Its branch order and its six exact log strings are guarded by nothing; a one-time manual browser observation during Task 6 is not a regression guard. Harmless only in the sense that nothing has reordered those branches since; it is not structurally protected |
| Criterion 5's build-and-sample half is unproven headlessly for `bar-chart` and `timeline-ticks` | Both declare `text`, which needs `document.createElement("canvas")` — absent under Vitest's `node` environment. `bar-chart`'s browser half **was** demonstrated this task (`export-check.mjs`); `timeline-ticks`'s was not separately re-verified. Harmless today because both scenes are static by declaration — a build failure would be immediately visible in the live preview, which every `.marey` file in this corpus is also exercised through |
| A `sequence`-bearing scene remains untested for paint-cadence sensitivity | The paint-cadence experiment's fixture had no `sequence` block. Per-tick painting is kept as the conservative superset, so this is a gap in *proof*, not in *behaviour* — nothing suggests a `sequence` step would behave differently, only that it has not been checked |
| `ObjectSnapshot.x`/`y` frame is undocumented for a nested child, and **is now partially, not fully, exercised** | Flagged in Task 5 as "no scene with a group appears anywhere in the suite" — no longer accurate as stated: `compound-logo.marey`'s `group mark` is now in the corpus and `frameSampler.test.ts` asserts its own `x`/`y` and its three children's **ids**. But the children's **coordinates** are still never read by any assertion, so whether `stem`/`armTop`/`armMid`'s `x`/`y` are parent-local (as `layout.currentPos` suggests) or scene-space is still unverified by a test, only inferable by reading `frameSampler.ts` itself. The premise moved; the gap it named did not close |
| `logo.marey`'s grey ledge is a dynamic body, not a static platform, and visibly tilts under impact | A language-capability gap (no lock-body syntax before Phase 8), not an export defect — `eval/RESULTS-GATE-B.md`'s appendix traces the mechanism (`physics` + zero gravity + no lock) and the scene's own commit history, and finds no evidence the tilt is deliberate. Harmless to Gate B specifically because no criterion depends on the ledge staying still; it does make `logo.marey` a weaker "lands on a fixed surface" reference than a first look suggests |
| `hashFrames` materialises the whole frame sequence as one JSON string before hashing | Tens of MB at the 7,200-frame ceiling. Correct today because nothing in this phase exports at the ceiling; a streaming hash would be needed before Phase 5B's longer video exports |

### Deferred minor findings (25)

Every line in the ledger beginning `Task <N>: minor (deferred)` — 25 of them,
confirmed by grep count on a clean tree, one per task from Task 1 through
Task 8a. Full text is in
`.sdd/2026-09-10-phase-4-composition-and-export/progress.md`
(search that exact string); not reproduced verbatim here because at full
length they exceed this section. By task: Task 1 — 1, Task 3 — 4, Task 4 — 1,
Task 5 — 6, Task 6 — 4, Task 7 — 8, Task 8a — 1. **One of the 25 (Task 1's
stale `sceneRuntime.ts` comment about an "untested" ordering) was already
closed as a side effect of Task 2's own edit to the same file** — confirmed by
grepping the current source for the quoted phrase: zero matches. The other 24
were checked for continued relevance where this document's own edits touched
the same file (`frameSampler.ts`, `frameHash.ts`, `docs/LANGUAGE.md`) and
found still accurate; the remainder were not individually re-verified in this
session, consistent with "deferred" rather than "resolved."

**The largest, restated because it is the one future work is most likely to
regret:** `compiler.worker.ts` has no automated test at all (Task 6, line 152
of the ledger). It is promoted to "Deliberate gaps and deferrals" above rather
than left in this list alone, because its blast radius — the Terminal pane and
`visual-check`'s own output-scraping both depend on those six exact log
strings — is larger than "minor" describes.

### Mutation tests

Rows marked *(re-run, 8b)* were re-run first-hand while writing this document,
on a clean tree at this task's `HEAD`, each mutation applied alone and the
file restored afterward with `git diff --stat` confirmed empty. Rows marked
*(ledger)* are the checks performed during the tasks themselves, against the
suite size named beside them, and were not re-run in this session.

| # | Mutation | Observed |
|---|---|---|
| *(re-run, 8b)* | `hashFrames` replaced with `frames.length.toString(16)` | **1 failed / 29** (`frameSampler.test.ts`) — `"distinguishes two same-length sequences that differ only in content"`. The two "same hash twice" / "different hash at a different rate" tests stay green under this mutation, which is why the third test is the one that matters (AGENT-LESSONS §2a) |
| *(re-run, 8b)* | `runtime.paintExactTick()` → `runtime.paint(0)` in the sampler's loop | **2 failed / 29** — the physical-consequence displacement-ratio test (`expected 5 to be less than 3`) and the `paintExactTick`-not-`paint` spy assertion. Matches `eval/RESULTS-GATE-B.md`'s own recorded numbers for the same revert exactly |
| *(re-run, 8b)* | `check.ts`'s `--export-ready`-without-`--fps` rate-dependent-code filter removed | **1 failed / 17** (`check.test.ts`) — `"does not surface a frame-budget overflow caused only by the probe rate"`. Confirms the fixture Task 7 added is now load-bearing, closing the hole the same revert found vacuous (0/13) before that fixture existed |
| *(ledger, 678)* | Task 1: `readState` moved after `setScale` in `pushAnimToWorld`'s scale branch | **1 failed** — `expected 292.5 to be close to 300, difference is 7.5`, the predicted bbox-centre/centroid gap for the default scene's triangle, not a coincidental number |
| *(ledger, 680)* | Task 2: `paintAt(0, 0)` | **1 failed / 680** — the physics test |
| *(ledger, 680)* | Task 2: `paintAt(1, 1)` | **1 failed / 680** — the animation test (different test than above; each alpha argument is independently load-bearing) |
| *(ledger, 687)* | Task 3: three Step 10 mutations, each reverted separately | **2, 1, 4 failed** respectively, each restored clean |
| *(ledger, ~708)* | Task 4: `Math.floor` → `Math.round` in `frameCount`; `MAX_EXPORT_FRAMES` 7,200 → 72,000 | Both **genuinely redden** the implementer-added literal-boundary tests (`floor(29.75)=29` vs `round=30`; `7201` stops exceeding a flipped `72_000` ceiling) while the brief's own constant-derived test stays green either way — the reason mutation 3 above exists |
| *(ledger, 21)* | Task 4: invalid `fps` traced to the arithmetic it could reach | Reviewer confirmed **no NaN/Infinity/div-zero path exists** — `!fpsOk` forces an early return before the division, so the invalid-fps guard is provably not decorative |
| *(ledger, 723)* | Task 5: `vi.spyOn` mutation 1, post-fix | **2 independent failures** — call-identity and the displacement ratio, the latter measuring exactly 5 (the value the reviewer derived by hand before the test existed) |
| *(ledger, 729→729)* | Task 6: 51-error abort miscategorised as unreachable | Verified empirically against the real 51-error boundary — pre-fix, the catch path returned a hardcoded `tokenCount: 0`; `expect(out.tokenCount).toBe(160)` would have failed against it |
| *(ledger, 746)* | Task 7: `--fps` without `--export-ready` silently accepted; unknown `--flag=val` read as a filename | Both traced by hand to genuinely redden their new rejection tests when reverted — deleting either branch leaves `error` as `null` and the assertion throws rather than passing vacuously |
| *(ledger, 749)* | Task 8a: stubbed empty `applySnapshot` against the fixed round-trip test | Failed **exactly at the guard**, confirming the tree really was moved to a different state before the round trip, not that the guard is decorative |
| *(RESULTS-GATE-B.md, 29)* | `ticksPerFrame = TICK_HZ / request.fps` → `+ 1` | **12/29** failed, including the three `it.each` frame-count cases and the canonical-corpus tests sharing the same arithmetic |
| *(RESULTS-GATE-B.md, 21)* | `EXPORT_UNBOUNDED_SCENE` branch replaced with a silent `seconds = 5` default | **2/21** failed (`exportContract.test.ts`) — the unbounded-refusal test and the multi-diagnostic test |
| *(RESULTS-GATE-B.md, 29)* | `compound-logo`'s `durationSeconds` in `CANONICAL_SCENES` changed from 8 to 6 | **2/29** failed, against the real committed `.marey` file, not a hypothetical |

The pattern Phase 3C's notes recorded repeats here at greater scale: reading
finds contradictions (the ten plan-fixture defects, all caught by an
implementer or reviewer reading the specified test against real source before
or instead of trusting it), but only execution finds coincidences (every row
above that measured a number nobody had computed by hand until the revert ran
— the displacement ratio, the 7.5 px gap, the exact failure counts).

### Process notes for Phase 5A

- **Commit-as-you-go is no longer optional advice; it is the reason this
  phase has a record at all.** Three separate rate-limit kills (Task 4's
  reviewer — infrastructure, no work lost; Task 7's implementer — died before
  writing anything, safe to re-dispatch cold; Task 8a's and Task 8b's
  implementers — both mid-flight, both saved by an incremental commit) hit
  this phase. Every one of the two that could have lost real work did not,
  because the controller had told implementers to commit each increment
  rather than save one commit for the end — a lesson Task 7's dispatch
  applied *after* Task 4's kill lost nothing only because it happened to die
  before writing code. Phase 5A should carry the instruction from the start
  of every task, not add it after the first kill that could have cost
  something.
- **Checking a killed agent's wreckage before resuming it paid for itself
  every time.** Task 8a's port-5199 check found no orphan; Task 8b's found one
  (PID 3424) and killed it before the third dispatch — exactly the condition
  that produces this repo's signature false pass. Task 8a's file check found
  one real, coherent, but completely unverified module
  (`devExportSeam.ts`) that the next implementer was told about explicitly
  rather than silently inheriting. Never assume an interrupted agent left
  nothing behind, and never assume what it left behind is either junk or
  trustworthy without checking — both assumptions have been wrong in this
  repo before.
- **Escalating review to opus tracked risk, not task size.** Task 3 (a
  validator control-flow change plus a language-surface change), Task 5 (a
  falsified hypothesis plus a deliberately implementation-shaped test), Task 6
  (a 133-line worker deletion plus a behaviour-preservation claim across three
  consumers), and Task 7 (a repo-wide tsconfig expansion) were escalated;
  Tasks 1, 2, 4 and 8b's reviews were not. Every escalated review found at
  least one Important-or-above defect; none of the non-escalated ones did.
  That is a small sample and not proof the calibration was exactly right, but
  it is consistent with AGENT-LESSONS §7b's tiering advice rather than
  contradicting it.
- **Named risks kept finding real problems, not clean bills of health.** Task
  4's two judgment-call risks, Task 5's implementation-shaped-test risk, Task
  6's twice-widened-type risk, Task 7's tsconfig-blast-radius risk, and Task
  8a's two named risks (the inherited file, and the harness matching its
  sibling) — every one of them surfaced a finding when checked rather than
  confirmed clean. AGENT-LESSONS §8's point holds again: budget the review
  that shares none of the prior reasoning, and give it a real question to
  answer rather than a conclusion to ratify.
- **Two controller-authored claims were falsified by the agents told to
  verify them, both published in a document meant to be relied on later.**
  The paint-cadence argument and the cross-machine hash claim were both
  written with confidence, both wrong, and both caught only because an
  implementer was instructed to measure rather than believe. Phase 5A's own
  design work should expect the same ratio: a plan's *prose requirements*
  survived this phase intact; its *specific technical claims* did not, at a
  rate of two per phase across the last two phases (3C had none recorded this
  way; this is the first phase to falsify a claim about the language runtime
  itself rather than about a test fixture).
- **What is still owed**, restated from Task 8b's own brief and unchanged by
  this session's work: an independent whole-branch review by someone with no
  stake in this reasoning (AGENT-LESSONS §8), and the merge, with both
  phase-status locations — `docs/architecture/README.md`'s "Current phase"
  and `roadmap-and-process.md`'s Phase 4 bullet — updated together. They were
  written this task to say exactly that, because all three prior transitions
  shipped stale (AGENT-LESSONS §5b), and a search for a third phase-status
  location (root `README.md` — does not exist yet; `AGENTS.md` —
  8-line forwarding files with no phase content; `package.json` — no phase
  field) found none, which is not proof none exists, only that this session's
  search did not find a third.
