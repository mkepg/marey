# Phase 8 — Physics Authoring Syntax Implementation Plan

> Execute task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `world { gravity, bounds }`, `lockPosition`, `lockRotation` and `spin`; a playground example built on them; the finish-line evidence; and a 0.5.0 package ready to publish.

**Architecture:** World gravity is a compile-time default folded into every `IRPhysics.gravity`, so the renderer's gravity path is untouched. `bounds` becomes `IRSceneNode.walls`, read by one factory that constructs the Matter world for both the playground and export. `lockPosition` is a new pin reason that is never released; `lockRotation` is infinite inertia reapplied wherever Matter resets inertia; `spin` rides the existing parked-velocity flush. Nothing in export changes: every output samples the same runtime.

**Tech Stack:** TypeScript (strict, `noUnusedLocals`, `verbatimModuleSyntax`), Preact + zustand, PixiJS 8, Matter.js 0.20.0, Vitest, Playwright Chromium for browser checks.

**Spec:** `docs/specs/2026-10-11-marey-phase-8-physics-authoring-syntax-design.md`. Every diagnostic's exact wording lives in the spec's §2; tasks cite it rather than restate it.

## Global Constraints

1. Run commands from `C:\Users\gomez\...` with a **capital** drive letter; a lower-case `c:` makes Vitest report "no tests" (engineering-lessons §6).
2. Every commit passes all four checks: `npm test`; `npx vitest run --config eval/vitest.config.ts`; `npm run build`; `npm run build:cli && node bin/marey.mjs check $(git ls-files '*.marey')`. Baseline before this plan, measured on `phase-8` after the spec commit: **68 test files, 1390 tests** in `npm test`; 5 eval tests. Re-derive it before Task 1.
3. Stage paths explicitly and read `git diff --staged` before committing. Never `git add -A`, `git add .` or `git add -f`. Commit subjects follow Conventional Commits (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`) with an optional scope. No `Co-Authored-By` or "Generated with" lines. Committed text describes the engineering, never the workflow that produced it, and never names an AI tool.
4. Never commit generated output (`dist/`, `.visual-check/`, `eval/render/`) or any file over 1 MB. Scratch and evidence captures go under `.visual-check/phase8/`.
5. `core.autocrlf` is on: judge changes with `git diff --stat -- <path>`, never `git status`.
6. Browser checks: `npx vite --port 5199 --strictPort`; kill the server afterwards and confirm port 5199 is free. "The file plays" is not evidence: measure outputs against a reference.
7. Diagnostic wording is **verbatim from spec §2**. A test asserts the full code-and-sentence, never a short substring (engineering-lessons §2b).
8. For every behaviour a task requires, delete the line that implements it and run that task's tests; anything still green is untested. A gap found this way in a behaviour the task **requires** is in scope; a gap in an adjacent behaviour is reported, not fixed (engineering-lessons §3b).
9. Renderer invariants 1–3 in `docs/architecture/renderer.md` hold: nothing that mutates state takes a time argument; state mutation in the tick phase, painting in the paint phase; nothing fed to the physics world derives from the wall clock. `physicsWorld.ts` never imports `pixi.js` (D9).
10. The frame-hash baseline committed in Task 1 must stay green at every later commit. If a task turns it red, that task has changed existing behaviour: stop and report, do not regenerate the baseline.
11. No new runtime dependency.

## Review Focus

1. **Existing scenes do not move.** Task 1's baseline, the recording world's call sequences (a `spin` of 0 makes no call), and the determinism snapshot's diff (new defaulted fields only).
2. **The lock survives every inertia reset.** Each of the three reapplication sites in `MatterWorld` has its own failing-when-removed test (spec §5.3).
3. **`LOCKED` is pinned before `NO_RUNNER` is released**, so a locked body is never dynamic for even one call (a recording-world call-order assertion).
4. **Walls come from one factory.** No production `new MatterWorld(` outside `createWorldForScene` (a test greps for it).
5. **Edge words stay unreserved.** `let top = 40` compiles; `top` as an object name compiles.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/compiler/renderer/sceneFrameHashes.test.ts` (new) | frame-hash regression baseline over the headless corpus | 1, 5 |
| `src/compiler/languageContract.ts` | `world` block, `edges` value kind and label, `lockPosition`/`lockRotation`/`spin` on `physics` | 2 |
| `src/compiler/types.ts` | `ObjectType` gains `world`; `SceneNode.world`; `EdgesValue` | 2 |
| `src/compiler/parser/index.ts`, `parseObject.ts`, `parseValue.ts` | `world` in the scene body; placement errors; `bounds` edge list | 2 |
| `src/compiler/parser/world.test.ts` (new) | parse-level tests | 2 |
| `src/compiler/typeChecker/validator.ts` | spec §2.2 rules; waive `duration` for a locked block | 3 |
| `src/compiler/typeChecker/phase8Diagnostics.test.ts` (new) | diagnostic matrix | 3 |
| `src/compiler/sceneIR.ts`, `typeChecker/builder.ts`, `typeChecker/resolvers.ts` | `IREdge`, `walls`, new `IRPhysics` fields, gravity folding, lock normalisation | 4 |
| `src/compiler/typeChecker/worldIR.test.ts` (new), `src/compiler/__snapshots__/determinism.test.ts.snap` | IR tests; snapshot update | 4 |
| `src/compiler/renderer/physicsWorld.ts` | wall list, `createWorldForScene`, `LOCKED`, `lockRotation`, `setAngularVelocity` | 5, 6, 7 |
| `src/compiler/renderer/adapter.ts`, `src/compiler/export/rasterExport.ts` | use `createWorldForScene` | 5 |
| `src/compiler/renderer/physicsSync.ts`, `sceneRuntime.ts` | `lockRotation` param, `LOCKED` pin, parked spin | 6, 7 |
| `src/compiler/renderer/physicsWorld.test.ts`, `sceneRuntime.test.ts`, `phase8Runtime.test.ts` (new) | runtime tests | 5, 6, 7 |
| `src/components/Editor/MonacoEditor/language.ts`, `constants.ts` | editor completions, hovers, derived keyword list | 8 |
| `docs/LANGUAGE.md` | reference | 8 |
| `src/examples/ledges.marey` (new), `src/examples/index.ts`, `src/examples/examples.test.ts` | example | 9 |
| `eval/RESULTS-PHASE-8.md` (new), `eval/RESULTS-FINISH-LINE.md` (new), status docs, roadmap, `README.md`, `package.json`, `package-lock.json` | evidence, finish line, 0.5.0 | 10 |

---

### Task 1: Frame-hash baseline

A guard committed **before any production change**, so every later task proves it left existing scenes byte-identical (spec E3).

**Files:**
- Create: `src/compiler/renderer/sceneFrameHashes.test.ts`

**Interfaces:**
- Consumes: `compileSource` (`../compileSource`), `buildNode` (`./builder`), `MatterWorld` (`./physicsWorld`), `SceneRuntime` (`./sceneRuntime`), `sampleFrames` (`./frameSampler`), `hashFrames` (`../export/frameHash`), `planExport` (`../export/exportContract`). Read `playback.test.ts` lines 10–40 for the corpus globs and `hasText`, and copy that pattern (it explains why `node:fs` cannot be used).
- Produces: `BASELINE` (path → hash) that Task 5 re-points at `createWorldForScene` without changing a value.

- [ ] **Step 1: Write the harness with an empty baseline**

```ts
import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { buildNode } from "./builder";
import { MatterWorld } from "./physicsWorld";
import { SceneRuntime } from "./sceneRuntime";
import { sampleFrames } from "./frameSampler";
import { hashFrames } from "../export/frameHash";
import { planExport } from "../export/exportContract";
import { compileSource } from "../compileSource";
import type { IRSceneNode } from "../sceneIR";

/*
 * Sampled-frame hashes of every first-party scene that runs headless, taken
 * before Phase 8 changed anything (spec E3). A red here means existing output
 * moved: find out why before touching BASELINE.
 *
 * Same corpus as playback.test.ts, through import.meta.glob for the same
 * reason (src/** type-checks with browser types only). Scenes with text are
 * skipped because text needs a DOM. Scenes added after the baseline are not
 * in it and are not compared.
 */
const SOURCES: Record<string, string> = {
  ...import.meta.glob("../../examples/*.marey", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../../eval/scenes-3b/*.marey", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../../tools/visual-check/scenes/*.marey", { query: "?raw", import: "default", eager: true }),
};

function hasText(ir: IRSceneNode): boolean {
  return Object.values(ir.registry).some((n) => n.props.kind === "text");
}

/** 4 s at 30 fps, overriding the scene's own length so indefinite scenes have an end. */
function hashScene(ir: IRSceneNode): string {
  const root = new Container();
  for (const node of ir.children) root.addChild(buildNode(node));
  const runtime = new SceneRuntime(new MatterWorld(ir.width, ir.height), root);
  const planned = planExport(ir, { fps: 30, durationSeconds: 4 });
  if (!planned.ok) throw new Error(planned.diagnostics.map((d) => d.message).join("; "));
  return hashFrames(sampleFrames(runtime, root, planned.plan));
}

const BASELINE: Readonly<Record<string, string>> = {};

describe("sampled frames of every headless first-party scene", () => {
  it("are byte-identical to the Phase 8 baseline", () => {
    const actual: Record<string, string> = {};
    for (const [key, source] of Object.entries(SOURCES)) {
      if (!(key in BASELINE) && Object.keys(BASELINE).length > 0) continue;
      const out = compileSource(source);
      if (!out.ir || hasText(out.ir)) continue;
      actual[key] = hashScene(out.ir);
    }
    expect(Object.keys(BASELINE).length).toBeGreaterThanOrEqual(15);
    expect(actual).toEqual(BASELINE);
  });
});
```

- [ ] **Step 2: Run it RED and read the diff.** `npx vitest run src/compiler/renderer/sceneFrameHashes.test.ts`. It fails on the length assertion; temporarily comment that line out, re-run, and copy the `actual` object from the `toEqual` diff into `BASELINE` (keys are the glob keys, e.g. `"../../examples/physics-pile.marey"`). Restore the length assertion. If fewer than 15 scenes qualify, set the floor to the real count and say so in the report.
- [ ] **Step 3: Prove it guards.** Run the test twice: green both times (determinism). Then change `durationSeconds: 4` to `3`: it must go red; restore. Report both outcomes.
- [ ] **Step 4: Run all four checks; commit**

```bash
git add src/compiler/renderer/sceneFrameHashes.test.ts
git diff --staged
git commit -m "test(renderer): pin sampled-frame hashes of the headless scene corpus"
```

---

### Task 2: Parse `world`, `bounds` and the new physics properties

**Files:**
- Modify: `src/compiler/languageContract.ts`, `src/compiler/types.ts`, `src/compiler/parser/index.ts`, `src/compiler/parser/parseObject.ts`, `src/compiler/parser/parseValue.ts`
- Create: `src/compiler/parser/world.test.ts`

**Interfaces:**
- Produces:
  - `ValueKind` gains `"edges"`; `KIND_LABEL.edges = "a list of scene edges, such as [left, right, bottom]"`.
  - `export const EDGE_VALUES = ["left", "right", "top", "bottom"] as const;` in `languageContract.ts` (canonical order; Task 4 and Task 5 import it).
  - `LANGUAGE_CONTRACT.world = block({ gravity, bounds })`: `gravity` kind `point`, **no default** (`absentMeans` describing "each physics block's own gravity, else (0, 980)"), example `gravity: (0, 980)`; `bounds` kind `edges`, default all four, example `bounds: [left, right, bottom]`, placeholder `[left, right, bottom]`. Read how `property()` takes `default` / `absentMeans` and follow the scene `duration` precedent for a property with no default.
  - `physics` gains `lockPosition` (boolean, default `false`), `lockRotation` (boolean, default `false`), `spin` (number, default `0`, no constraint). Descriptions: lockPosition — "Holds the body still for the whole scene. Other objects collide with it; 'animate' can still move it. Takes no 'duration'." lockRotation — "Stops collisions and physics from rotating the body. An 'animate' on rotation still turns it." spin — "Initial angular velocity in degrees per second, applied when the physics step starts. Positive is clockwise."
  - `types.ts`: `ObjectType` gains `"world"`; `SceneNode` gains `readonly world?: ObjectNode`; `AstValue` gains `EdgesValue` exactly as spec §4.2.
- Consumes: `parseValue`'s `property` precedent (`parseValue.ts`), `describeToken`, `state.currentContext`.

- [ ] **Step 1: Write failing parser tests** in `world.test.ts`, each compiling through `compileSource` (read `compileSource.test.ts` for the error shape) and asserting the **full** message from spec §2.1 where an error is expected:
  1. `scene { size: (400, 300) world { gravity: (0, 500) bounds: [left, right, bottom] } }` compiles with no errors.
  2. `world` inside a `group` → `In 'group' object 'g': 'world' blocks are only allowed directly inside the scene block.` — read `parseObject.ts` for the exact `currentContext` spelling of a group and write the expected string from it, then confirm by running.
  3. `world` inside a `circle` → the same sentence with the circle's context.
  4. Two `world` blocks → `In the scene: Only one 'world' block is allowed.`
  5. `world { physics { duration: 1 } }` → `In the 'world' block: 'world' blocks cannot contain nested objects or blocks. Found 'physics'.`
  6. `bounds: [left, 3]` → `In the 'world' block: 'bounds' lists scene edges by name (left, right, top, bottom), but found <describeToken of 3>.` — compute `<…>` from `describeToken` and pin the full string.
  7. `bounds: []` parses (no error) to an `edges` value with zero items.
  8. `let top = 40` followed by `circle c { position: (top, top) radius: 5 }` compiles: edge words are not reserved.
  9. `circle world { … }` → the existing reserved-word error `'world' is a reserved word and cannot be used as an object name.` (now that `world` is a keyword).
  10. `physics { lockPosition: true, lockRotation: false, spin: 90, duration: 1 }` on a circle produces no "unknown property" error.
- [ ] **Step 2: Run RED** and read each failure message; a test failing for its fixture rather than for the missing feature is a false RED (engineering-lessons §3d).
- [ ] **Step 3: Implement.**
  - Contract and types as in Interfaces. `KEYWORDS` picks up `world` from the contract keys with no edit.
  - `parseObject.ts`: name `world` blocks like `animate`/`physics` (`world_<line>_<col>`); extend the "cannot contain nested objects or blocks" branch to `world`; and before descending into any child keyword, reject `world` with the placement message (this covers groups, shapes and template bodies — the scene body never reaches `parseObject` with `world`).
  - `index.ts`: in the scene loop, `world` parses through `parseObject` and is stored on `SceneNode.world`; a second one throws the duplicate message. It is not pushed into `sceneChildren`.
  - `parseValue.ts`: when `currentKey === "bounds"` and the next token is `LBRACKET`, read `[` then zero or more `IDENT` tokens separated by commas, then `]`, into an `EdgesValue`. A token that is not an `IDENT` (or a comma or `]` in the right place) throws the §2.1 element message. Words are **not** checked against the edge list here — that is Task 3's `TYPE_BOUNDS_EDGE`, which needs a position per word. Any other `bounds` value falls through to `parseExpr`.
- [ ] **Step 4: Run GREEN, then delete-and-run** each of: the placement rejection, the duplicate check, the nested-block check, the edge-list branch. Each deletion must turn at least one Step 1 test red; report which.
- [ ] **Step 5: Run all four checks** (Task 1's baseline must stay green); **commit**

```bash
git add src/compiler/languageContract.ts src/compiler/types.ts src/compiler/parser/index.ts src/compiler/parser/parseObject.ts src/compiler/parser/parseValue.ts src/compiler/parser/world.test.ts
git diff --staged
git commit -m "feat(parser): parse the world block, bounds edges and the new physics properties"
```

---

### Task 3: Phase 8 diagnostics

**Files:**
- Modify: `src/compiler/typeChecker/validator.ts`
- Create: `src/compiler/typeChecker/phase8Diagnostics.test.ts`

**Interfaces:**
- Consumes: Task 2's `SceneNode.world`, `EdgesValue`, `EDGE_VALUES`, contract entries.
- Produces: the seven `TYPE_*` codes of spec §2.2 with verbatim wording; the waived `duration` requirement for a locked block.

- [ ] **Step 1: Write the matrix test.** One `it` per row, each a minimal scene, each asserting the full message from spec §2.2 (`toContainEqual(expect.objectContaining({ message: "<full>" }))` on `compileSource(src).errors`), plus:
  1. `TYPE_BOUNDS_EDGE` for `bounds: [left, up]` — message names `'up'`.
  2. `TYPE_BOUNDS_DUPLICATE` for `bounds: [left, bottom, left]` — names `'left'`, exactly one diagnostic.
  3. `TYPE_LOCK_IGNORED`, parameterised over all seven properties (`velocity: (1, 0)`, `gravity: (0, 1)`, `airDrag: 0.1`, `spin: 10`, `lockRotation: true`, `collideBounds: false`, `duration: 2`), each with `lockPosition: true`, one diagnostic naming that property.
  4. `bounce: 0.5` with `lockPosition: true` and no `duration` → **no errors at all** (this also pins the waived requirement).
  5. `lockPosition: false` with no `duration` → the existing `is missing the required property 'duration'` error (the waiver is for `true` only).
  6. `TYPE_LOCK_IN_SEQUENCE` in a `sequence` step and, separately, in a `parallel` step (the message names the block kind).
  7. `TYPE_LOCK_WITH_SEQUENCE` for a locked top-level `physics` beside a `sequence` with one `animate` step.
  8. `TYPE_LOCK_HANDOFF` for `animate { property: position, to: (300, 100), duration: 1, handoff: true }` beside `physics { lockPosition: true }` — and assert **no** `TYPE_HANDOFF_DURATION` or `TYPE_HANDOFF_AMBIGUITY` appears (exactly one handoff diagnostic, spec §2.2).
  9. `TYPE_SPIN_LOCKED` for `spin: 90, lockRotation: true, duration: 1`.
  10. `bounds: true` → the generic mismatch, whose full sentence you compose from the validator's existing template with `KIND_LABEL.edges`; read it aloud and confirm it reads as English before pinning it (engineering-lessons §2e).
  11. A clean scene using every feature at once (spec §1's example) compiles with zero errors.
- [ ] **Step 2: Run RED; read every failure.**
- [ ] **Step 3: Implement** in `validator.ts`:
  - Validate `ast.world` when present: `checkNode(world, ast, "scene", [])`, and add `world` to the block-label list so its label is `The 'world' block`.
  - Edge checks on `bounds` when its value is `edges`: unknown word → `TYPE_BOUNDS_EDGE` at that word's position; repeated → `TYPE_BOUNDS_DUPLICATE` at the repeat.
  - Lock rules, firing only when `lockPosition` is the literal boolean `true`. Skip the required-`duration` check for that block. For `TYPE_LOCK_HANDOFF`, find where `TYPE_HANDOFF_DURATION` and `TYPE_HANDOFF_AMBIGUITY` are computed and short-circuit both when the receiving physics block is locked.
- [ ] **Step 4: Run GREEN, then delete-and-run** each of the seven codes' emitting branch and the `duration` waiver, separately. Each must redden its own row. Report the count per deletion.
- [ ] **Step 5: All four checks; commit**

```bash
git add src/compiler/typeChecker/validator.ts src/compiler/typeChecker/phase8Diagnostics.test.ts
git diff --staged
git commit -m "feat(validator): name every misuse of world, bounds, locks and spin"
```

---

### Task 4: The IR

**Files:**
- Modify: `src/compiler/sceneIR.ts`, `src/compiler/typeChecker/builder.ts`, `src/compiler/typeChecker/resolvers.ts` (if a resolver is the natural home), `src/compiler/__snapshots__/determinism.test.ts.snap`
- Create: `src/compiler/typeChecker/worldIR.test.ts`

**Interfaces:**
- Produces (spec §4.3): `export type IREdge = (typeof EDGE_VALUES)[number]` (or the literal union — one source of truth either way); `IRSceneNode.walls: ReadonlyArray<IREdge>`; `IRPhysics.lockPosition`, `.lockRotation`, `.spin`.
- Consumes: `SceneNode.world`, `EDGE_VALUES`.

- [ ] **Step 1: Failing IR tests** (`compileSource(src).ir`):
  1. No `world`: `walls` equals `["left", "right", "top", "bottom"]`; a physics block with no gravity has `gravity {x: 0, y: 980}`; `lockPosition false`, `lockRotation false`, `spin 0`.
  2. `world { gravity: (0, 300) }` and a physics block with no gravity → `gravity {x: 0, y: 300}`; the same world with a block declaring `gravity: (0, -200)` → `{x: 0, y: -200}`.
  3. World gravity reaches a physics step inside a `sequence` and inside a `parallel` (read the IR's `sequences`).
  4. `bounds: [bottom, left]` → `walls` `["left", "bottom"]` (canonical order, not source order); `bounds: []` → `[]`.
  5. `physics { lockPosition: true, bounce: 0.4 }` → exactly `{ velocity {0,0}, gravity {0,0}, airDrag 0, bounce 0.4, collideBounds true, duration "indefinitely", lockPosition true, lockRotation false, spin 0 }` — under a world with nonzero gravity too.
  6. `spin: 90` → `spin 90` (degrees; the conversion is the renderer's).
  7. The IR is frozen: `Object.isFrozen(ir.walls)` (match how the builder freezes other arrays — read it first).
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement.** `buildPhysicsFromNode` takes the world gravity fallback (resolved once in `buildIR` from `ast.world`); every caller, including the sequence/parallel builders, passes it. Locked blocks are normalised as in Step 1.5. `walls` is resolved from `bounds` in canonical order.
- [ ] **Step 4: Update the determinism snapshot** with `npx vitest run src/compiler/determinism.test.ts -u`, then read `git diff -- src/compiler/__snapshots__/determinism.test.ts.snap`: every change must be an added `walls` array or added `lockPosition`/`lockRotation`/`spin` fields at their defaults. Any other change is a defect: stop and report. Quote the diff's line counts in the report.
- [ ] **Step 5: Delete-and-run** the gravity fallback, the sequence-path fallback, the canonical ordering, and the lock normalisation, separately.
- [ ] **Step 6: All four checks; commit**

```bash
git add src/compiler/sceneIR.ts src/compiler/typeChecker/builder.ts src/compiler/typeChecker/resolvers.ts src/compiler/typeChecker/worldIR.test.ts src/compiler/__snapshots__/determinism.test.ts.snap
git diff --staged
git commit -m "feat(ir): carry walls, locks and spin; fold world gravity into each physics block"
```
(Drop `resolvers.ts` from the `git add` if it was not changed.)

---

### Task 5: Walls in the runtime

**Files:**
- Modify: `src/compiler/renderer/physicsWorld.ts`, `src/compiler/renderer/adapter.ts`, `src/compiler/export/rasterExport.ts`, `src/compiler/renderer/sceneFrameHashes.test.ts`, `src/compiler/renderer/physicsWorld.test.ts`
- Create: `src/compiler/renderer/phase8Runtime.test.ts`

**Interfaces:**
- Produces:
  - `constructor(width: number, height: number, walls: ReadonlyArray<IREdge> = EDGE_VALUES)` on `MatterWorld`; it builds only the listed walls, each identical to today's body for that edge. Read `createWalls()`: today's array is top, bottom, left, right.
  - `export function createWorldForScene(ir: Pick<IRSceneNode, "width" | "height" | "walls">): MatterWorld` in `physicsWorld.ts`.
- Consumes: `IRSceneNode.walls` (Task 4).
- `phase8Runtime.test.ts` (Tasks 5–7) builds a compiled scene with one helper: `compileSource` → `buildNode` per child into a `Container` root → `new SceneRuntime(createWorldForScene(ir), root)`, and advances with the sampler's loop, `runtime.advanceOneTick(); runtime.paintExactTick();` per tick, so containers carry what the bodies did. Bodies are read through the world (`world.readState(container.__body!, 1)`), containers by tree order (`root.children[i]`).

- [ ] **Step 1: Failing tests.**
  - `physicsWorld.test.ts`, "MatterWorld walls": (a) `new MatterWorld(800, 600, ["left", "right", "bottom"])`, a circle (radius 20) added at `(400, -100)` with `{ ...VACUUM, gravityY: 2000 }`, 600 steps → its `y` is `> 500` and `<= 600` (it entered through the open top and rests on the floor); (b) the same with the default constructor stays above `y = 0` (the top wall stops it) — this is the contrast that makes (a) mean something; (c) `walls: []` → after 600 steps `y > 600`.
  - `phase8Runtime.test.ts`: compile `scene { size: (400, 300) world { bounds: [] } circle c { position: (200, 50) radius: 10 physics { duration: indefinitely } } }`, build it with `createWorldForScene(ir)` and `SceneRuntime`, advance up to 2400 ticks: the body is culled (`world.hasBody(id)` false) and the runtime reports idle. Read `sceneRuntime.ts` for the public idle query and `cullEscapedBodies` for what culling removes.
  - A guard test: read `adapter.ts` and `rasterExport.ts` as text through `import.meta.glob` (`?raw`) and assert neither contains `new MatterWorld(` while both contain `createWorldForScene(`.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement** the constructor argument, the factory, and the two call sites. Re-point Task 1's harness at `createWorldForScene(ir)`; its `BASELINE` must stay green **without edits**.
- [ ] **Step 4: Delete-and-run:** the wall filter (build all four regardless) must redden (a) and (c); the factory's use of `ir.walls` must redden the culling test.
- [ ] **Step 5: All four checks; commit**

```bash
git add src/compiler/renderer/physicsWorld.ts src/compiler/renderer/adapter.ts src/compiler/export/rasterExport.ts src/compiler/renderer/sceneFrameHashes.test.ts src/compiler/renderer/physicsWorld.test.ts src/compiler/renderer/phase8Runtime.test.ts
git diff --staged
git commit -m "feat(renderer): build only the walls a scene's bounds name, from one factory"
```

---

### Task 6: `lockPosition` in the runtime

**Files:**
- Modify: `src/compiler/renderer/physicsWorld.ts` (`PinReason`), `src/compiler/renderer/sceneRuntime.ts` (`spawnPhysics`), `src/compiler/renderer/sceneRuntime.test.ts`, `src/compiler/renderer/phase8Runtime.test.ts`

**Interfaces:**
- Produces: `PinReason` gains `"LOCKED"`. `spawnPhysics` calls `pinBody(container, world, "LOCKED")` when `phIR.lockPosition`, **before** its `unpinBody(…, "NO_RUNNER")`; nothing releases `LOCKED`.
- Consumes: `IRPhysics.lockPosition` (Task 4).

- [ ] **Step 1: Failing tests.**
  - `sceneRuntime.test.ts` (RecordingWorld): a container whose `__physics` has `lockPosition: true`; after the first tick the call log contains `pin:<id>:LOCKED` **before** `unpin:<id>:NO_RUNNER`, and `world.isPinned(id)` is true. Build the IR value with the file's existing helpers; read how `__physics` is set on a fixture container.
  - `phase8Runtime.test.ts` (real world, compiled): (a) a locked rectangle `ledge` at `(200, 200)` size `(200, 20)` and a circle dropped from `(200, 50)` under gravity: after 600 ticks the ledge's body position equals `(200, 200)` within `1e-9` and the circle rests above it (`y < 200`); (b) a locked rectangle with `animate { property: position, to: (300, 200), duration: 1, easing: linear }` from `(100, 200)`: at tick 60 its body `x` is within `1e-6` of 200, at tick 120 within `1e-6` of 300, and at tick 600 still 300 within `1e-6`; (c) a locked physics `group` of two rectangles stays put when a circle lands on it; (d) after 600 ticks of (a) the runtime is idle once the circle sleeps.
- [ ] **Step 2: RED.** **Step 3: Implement.** **Step 4: Delete-and-run** the `LOCKED` pin (all four real-world tests must redden) and swap its order with the `NO_RUNNER` release (the call-order test must redden).
- [ ] **Step 5: All four checks; commit**

```bash
git add src/compiler/renderer/physicsWorld.ts src/compiler/renderer/sceneRuntime.ts src/compiler/renderer/sceneRuntime.test.ts src/compiler/renderer/phase8Runtime.test.ts
git diff --staged
git commit -m "feat(renderer): hold locked bodies still for the whole scene"
```

---

### Task 7: `lockRotation` and `spin` in the runtime

**Files:**
- Modify: `src/compiler/renderer/physicsWorld.ts`, `src/compiler/renderer/physicsSync.ts`, `src/compiler/renderer/sceneRuntime.ts`, `src/compiler/renderer/physicsWorld.test.ts`, `src/compiler/renderer/sceneRuntime.test.ts` (RecordingWorld gains the new method), `src/compiler/renderer/phase8Runtime.test.ts`

**Interfaces:**
- Produces:
  - `PhysicsParams.lockRotation: boolean` (`RESTING_PARAMS` false; `physicsParamsFromIR` copies it). Every `PhysicsParams` literal in the test files needs the field — `tsc -b` will list them.
  - `IPhysicsWorld.setAngularVelocity(id: string, radiansPerSecond: number): void`; `MatterWorld` converts with `÷ 60` (Matter 0.20 scales `setAngularVelocity` by `deltaTime / _baseDelta` exactly as `setVelocity` — `node_modules/matter-js/src/body/Body.js:598`), through a named helper beside `pxPerSecToMatter`.
  - `MatterWorld` keeps `freeInertia` per body: captured at `addBody`, and after `Body.scale` **only when the body is not static** (a static compound's parent inertia is not recomputed by `Body.scale`; `Body.js:720`). A private `applyRotationLock(rec)` sets `Infinity` when `rec.lockRotation` and the body is dynamic, or restores `freeInertia` when it is not locked and the inertia is not already finite. It is called at the end of `applyParams`, after `setStatic(false)` in `unpin`, and at the end of `setScale`.
  - `container.__pendingSpin?: number` (radians per second), set by `spawnPhysics` when `phIR.spin !== 0`; `flushPendingVelocity` also flushes it through `setAngularVelocity` when the body is free. A `spin` of 0 sets nothing and makes no call.
- Consumes: `IRPhysics.lockRotation`, `.spin`.

- [ ] **Step 1: Failing tests.**
  - `physicsWorld.test.ts`: (a) a rectangle in a vacuum given `setAngularVelocity(id, 2 * Math.PI)` has `angle` within `1e-9` of `2π` after 120 steps (read the angle with `readState(id, 1).angle`); (b) with `airDrag: 0.02` it turns less than `2π` (damping applies); (c) a `lockRotation` square (`50×50`) dropped corner-first (angle `π/4`) onto a static wedge or the floor: its angle stays exactly `π/4` for 600 steps while its `y` changes by more than 50; the same square **without** the lock ends at an angle that differs from `π/4` by more than `0.1` — the contrast proves the fixture exercises rotation.
  - The three reapplication sites, **each its own test**: (d) params: add a body with `lockRotation: false`, then `setParams` with `lockRotation: true`, then an off-centre impact → angle unchanged; (e) unpin: add a locked body, `pin(id, "NO_RUNNER")`, `unpin(id, "NO_RUNNER")`, then an off-centre impact → angle unchanged; (f) scale: a locked dynamic body, `setScale(id, 1.5, 1.5)`, then an off-centre impact → angle unchanged. For "off-centre impact", drop a second body onto one end of a long locked bar, or set an off-centre velocity on a colliding body; read existing collision tests for a fixture shape.
  - (g) restore: a body stepped with `lockRotation: true` then `setParams` with `lockRotation: false` rotates again under the off-centre impact.
  - `sceneRuntime.test.ts` (RecordingWorld): a container with `spin: 90` logs `setAngularVelocity:<id>:1.5708` (4 d.p., `90°` in rad/s) after its unpin; a container with `spin: 0` logs no `setAngularVelocity` call at all.
  - `phase8Runtime.test.ts` (compiled): `scene { size: (800, 600) world { gravity: (0, 0) } rectangle r { position: (400, 300) size: (40, 40) physics { spin: 360, duration: indefinitely } } }` → after 120 ticks the container's rotation is `2π` within `1e-9`; and the world-gravity criterion: `world { gravity: (0, 980) }` with a block with no gravity reaches a vertical speed of 980 px/s after 120 ticks in a vacuum (measure from two consecutive `readState` positions × 120, tolerance `0.5`), and with `gravity: (0, -200)` reaches −200.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Delete-and-run, separately:** each of the three `applyRotationLock` call sites (each must redden only its own test among d/e/f — report if any other test also reddens), the restore branch (g), the `÷ 60` conversion, the `spin !== 0` guard (the spin-0 call-log test must redden).
- [ ] **Step 5: All four checks; commit**

```bash
git add src/compiler/renderer/physicsWorld.ts src/compiler/renderer/physicsSync.ts src/compiler/renderer/sceneRuntime.ts src/compiler/renderer/physicsWorld.test.ts src/compiler/renderer/sceneRuntime.test.ts src/compiler/renderer/phase8Runtime.test.ts
git diff --staged
git commit -m "feat(renderer): lock rotation through infinite inertia and start bodies spinning"
```

---

### Task 8: Editor and language reference

**Files:**
- Modify: `src/components/Editor/MonacoEditor/language.ts`, `src/components/Editor/MonacoEditor/constants.ts`, `docs/LANGUAGE.md`, plus any editor test that enumerates completions (find them with `grep -rln "registerLanguage\|KEYWORD_DOCS" src`)

- [ ] **Step 1: Editor.**
  - Derive the tokenizer's `keywords` from the lexer's `KEYWORDS` minus `let` (which has its own token class) instead of the hand-written array; add a test that `world` is in it. This retires a hand-synced list (engineering-lessons §5).
  - Offer `world` at scene level with a snippet `world {\n\tgravity: (0, 980)\n\tbounds: [left, right, bottom]\n}`; inside `world`, property completions come from the contract (read how `physics` gets its property completions and reuse that path).
  - `KEYWORD_DOCS.world`: "Settings for the whole simulated world: default gravity for every physics block, and which scene edges are walls." Hovers for the new physics properties come from the contract descriptions.
  - Read the existing editor tests and extend the one that covers block completions to include `world`.
- [ ] **Step 2: `docs/LANGUAGE.md`.**
  - New "### The world" subsection at the top of "## Physics" after its opening paragraphs: the gravity precedence (spec §1.1), `bounds` and the four edges, that the edge words are only special inside `bounds`, culling through an open edge.
  - Under "### Properties": `lockPosition`, `lockRotation`, `spin` with spec §1.2–1.4's behaviour, including the moving-paddle idiom and that `handoff` does not carry spin.
  - Replace "applied per object, not per scene — there is no scene-level gravity property" with the precedence rule, and rewrite `collideBounds`' paragraph so it no longer says the edges are always on.
  - At least three new `marey` examples: an open-top world, a locked ledge with a moving paddle, spin with `lockRotation` on another object. `languageDocs.test.ts` compiles them.
- [ ] **Step 3: All four checks; commit**

```bash
git add src/components/Editor/MonacoEditor/language.ts src/components/Editor/MonacoEditor/constants.ts docs/LANGUAGE.md <editor tests you changed>
git diff --staged
git commit -m "docs(language): document the world, locks and spin, and offer them in the editor"
```

---

### Task 9: The example

**Files:**
- Create: `src/examples/ledges.marey`
- Modify: `src/examples/index.ts`, `src/examples/examples.test.ts`, `tools/visual-check/transport-check.mjs`

- [ ] **Step 1: Write the scene.** Id `ledges`, title `Ledges`, description `Tiles fall in from above, glance off ledges and a sweeping paddle.` Requirements:
  - 800 × 600, a finite `duration` (8 to 10 s) so it exports as loaded.
  - `world { gravity: (0, 980), bounds: [left, right, bottom] }`; tiles start above the scene (negative `y`) and enter through the open top.
  - At least three angled `lockPosition` ledges, one `lockPosition` paddle with a looping, yoyo position animation, tiles with varied `spin`, and at least one `lockRotation` crate.
  - Generated with `generate` and `delay`-free physics (tiles staggered by starting height), using `let` for the shared values so it reads as source, not coordinates.
  - A header comment of one to three lines; small enough to share (`examples.test.ts` checks both).
  - Visual quality matters: this is what a visitor sees. Use a palette consistent with the existing examples.
- [ ] **Step 2: Register it** last in `EXAMPLES` and add its row to the registry test.
- [ ] **Step 3: Browser check.** Vite on 5199 `--strictPort`. Load the example through the picker; screenshot at 1 s, 3 s and at rest to `.visual-check/phase8/example/`; look at them. `transport-check.mjs` keeps its own `EXAMPLES` list: add `{ id: "ledges", index: 4 }` before `dusk-hills`, which must stay last (its comment says why), and correct the header comment's example count. Run `node tools/visual-check/transport-check.mjs --out .visual-check/phase8/transport` (seek equals play on every listed example) and `node tools/visual-check/playground-check.mjs --out .visual-check/phase8/playground`. Kill Vite; confirm 5199 is free.
- [ ] **Step 4: Export determinism.** With the CLI built (`npm run build:cli`), export the example twice in each format the export matrix covers (`tools/cli-check/export-matrix.mjs` lists them; reuse its approach or run `node bin/marey.mjs export` per its README) to `.visual-check/phase8/export/`, and compare hashes run-to-run. Then check the Lottie in lottie-web with `tools/visual-check/lottie-check.mjs` against Marey's PNG export; record the measured tolerance.
- [ ] **Step 5: All four checks; commit**

```bash
git add src/examples/ledges.marey src/examples/index.ts src/examples/examples.test.ts tools/visual-check/transport-check.mjs
git diff --staged
git commit -m "feat(examples): add Ledges, built on the world, locks and spin"
```

---

### Task 10: Evidence, the finish line and 0.5.0

**Files:**
- Create: `eval/RESULTS-PHASE-8.md`, `eval/RESULTS-FINISH-LINE.md`
- Modify: `docs/architecture/README.md`, `docs/architecture/roadmap-and-process.md`, `docs/specs/2026-09-09-marey-engineering-roadmap-design.md` (§11 and §12, dated amendment blocks in the file's existing style), `README.md`, `package.json`, `package-lock.json`

- [ ] **Step 1: `RESULTS-PHASE-8.md`.** One section per spec §7 criterion E1–E4 and E6: the command, the measured result, and for E2 the per-code delete-and-run outcome. Every number re-run on the tree being committed, not copied from a task report (engineering-lessons §1).
- [ ] **Step 2: `RESULTS-FINISH-LINE.md`.** Roadmap §12's six items, each with the command or file that shows it holds today and its output. Where an item rests on an earlier phase's evidence file, cite the file and re-run its command.
- [ ] **Step 3: Status.** The Phase 8 bullet in `roadmap-and-process.md` and the status paragraph in `docs/architecture/README.md` say what shipped and where the spec, plan and evidence are, without claiming a merge; both edited in this one commit (engineering-lessons §5b). Roadmap §11/§12 amendment blocks record that Phase 8 is done and the finish line reached, citing `RESULTS-FINISH-LINE.md`. `README.md`'s physics description mentions the world, locks and spin briefly, within its existing structure.
- [ ] **Step 4: Version.** `npm version 0.5.0 --no-git-tag-version`; then `npm run check:pack` must pass. Do not publish.
- [ ] **Step 5: All four checks plus `npm run check:export` and `npm run check:pack`; commit**

```bash
git add eval/RESULTS-PHASE-8.md eval/RESULTS-FINISH-LINE.md docs/architecture/README.md docs/architecture/roadmap-and-process.md docs/specs/2026-09-09-marey-engineering-roadmap-design.md README.md package.json package-lock.json
git diff --staged
git commit -m "docs(8): record Phase 8 evidence and declare the finish line; version 0.5.0"
```

---

## After Task 10

An independent whole-branch review over `daec822..HEAD` on the most capable model, sharing none of the implementation reasoning (engineering-lessons §8), followed by one fix wave and a scoped re-review. Then stop: merging `phase-8`, pushing, and `npm publish` are the owner's calls.
