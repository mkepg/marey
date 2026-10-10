# Phase 8 — Physics authoring syntax

**Date:** 2026-10-11
**Status:** Approved design. Owner decisions taken 2026-10-10/11 are recorded in §0.
**Roadmap:** `2026-09-09-marey-engineering-roadmap-design.md` §11 (this phase) and §12 (the finish line).
**Authorities preserved:** decisions D1–D18 and §§1–7 of `2026-08-26-physics-shared-world-design.md`; the language cuts in roadmap §4.

---

## 0. Owner decisions

| # | Decision |
|---|---|
| O1 | `world { gravity }` is the default for every physics block; an object's own `gravity` overrides it. A scene with no `world` block behaves exactly as before. |
| O2 | `world { bounds }` lists which scene edges are walls, from `left`, `right`, `top`, `bottom`. Default: all four. `[]` means no walls. |
| O3 | `lockPosition: true` is solid scenery for the whole scene: no `duration`, and `animate` can still move it (a moving paddle). Properties that would do nothing on it are named errors. |
| O4 | Phase 8 also ships a new playground example built on the new syntax, declares the finish line (roadmap §12) with an evidence file, and bumps the package to 0.5.0 for publication. The owner runs `npm publish`. |

D13 stays in force (roadmap §11): an object is a collider only when a `physics` block is visible on it, in its `sequence`, or on its physics group. The old physics design's §9 "revisit D13" question is closed by the roadmap and is not reopened here.

---

## 1. What changes for an author

```marey
scene {
  size: (800, 600)
  world {
    gravity: (0, 980)
    bounds: [left, right, bottom]
  }

  rectangle ledge {
    position: (300, 400)
    size: (240, 16)
    rotation: -12
    physics { lockPosition: true }
  }

  rectangle tile {
    position: (420, -60)
    size: (40, 40)
    physics { spin: 180, duration: indefinitely }
  }

  rectangle crate {
    position: (200, -40)
    size: (50, 50)
    physics { lockRotation: true, duration: indefinitely }
  }
}
```

### 1.1 `world`

- A block written directly inside `scene`, at most once. Its two properties are optional.
- `gravity: (x, y)` — px/s², any point. Each physics block's gravity resolves as: its own `gravity` if written, else `world.gravity` if written, else `(0, 980)`. The rule applies to physics blocks in `sequence` and `parallel` steps too.
- `bounds: [edge, …]` — the scene edges that carry a wall. Edges are `left`, `right`, `top`, `bottom`, in any order, each at most once. Default: all four. `[]` is legal and means no walls.
- The four edge words are **not reserved**. They are read as edges only in the value of `bounds`; everywhere else they are ordinary names, so `let top = 40` stays legal. This follows the precedent of `property: position`, which `parseValue` reads by key name.
- Per-object `collideBounds: false` keeps its meaning: the object ignores whatever walls exist.
- An object that leaves through an open edge is culled 800 px past the scene, as today (`CULL_MARGIN`), so a scene with open edges still comes to rest.

### 1.2 `lockPosition`

A boolean physics property, default `false`. With `true`:

- The body is static for the whole scene. Other bodies collide with it; nothing physical moves it.
- `animate` on the same object still moves, turns and scales it, and its body follows (container → body, the pinned path every frozen and animating body already uses, physics design §6.6). A looping position animation therefore makes a moving paddle that shoves the pile.
- It needs no `duration`. Besides `lockPosition` itself, only `bounce` is allowed in the block.
- Allowed on an object's own top-level `physics` block, including a physics `group`'s (a locked compound). Not allowed in a `sequence` or `parallel` step, and not on an object that also has a `sequence` (§3).

`lockPosition: false` written explicitly is the default behaviour and triggers none of the lock rules.

### 1.3 `lockRotation`

A boolean physics property, default `false`. With `true` the body never rotates from contact or physics. An `animate { property: rotation }` still turns it (D8's override is independent). Allowed wherever `physics` is.

### 1.4 `spin`

A number, degrees per second, default `0`. The body's angular velocity at the moment its physics step starts — scene start for a top-level block, the step's start in a `sequence` — exactly as `velocity` is applied. Positive is clockwise on screen, the same direction as positive `rotation` in Marey's y-down space. `airDrag` damps it as it damps `velocity` (Matter applies `frictionAir` to both). `handoff` carries linear momentum only; it does not set or replace `spin`.

---

## 2. Diagnostics

Every rule below has fixed wording, pinned by a test that asserts the full code-and-sentence and is shown to fail when the rule is deleted (engineering-lessons §2, §2b). `<…>` is substituted.

### 2.1 Parse errors (no code, as every existing parse error)

| Situation | Message |
|---|---|
| `world` anywhere but directly in `scene` | `In <context>: 'world' blocks are only allowed directly inside the scene block.` |
| a second `world` in the scene | `In the scene: Only one 'world' block is allowed.` |
| a nested block or object inside `world` | `In 'world' block: 'world' blocks cannot contain nested objects or blocks. Found '<keyword>'.` |
| a `bounds` list element that is not a bare word | `In <context>: 'bounds' lists scene edges by name (left, right, top, bottom), but found <token>.` |

`<context>` is `state.currentContext`; `<token>` is `describeToken(tok)`.

### 2.2 Type errors

| Code | Fires when | Message |
|---|---|---|
| `TYPE_BOUNDS_EDGE` | a `bounds` word is not an edge | `[TYPE_BOUNDS_EDGE] The 'world' block: 'bounds' lists '<word>', which is not a scene edge. The edges are left, right, top and bottom.` |
| `TYPE_BOUNDS_DUPLICATE` | an edge appears twice | `[TYPE_BOUNDS_DUPLICATE] The 'world' block: 'bounds' lists '<edge>' more than once.` |
| `TYPE_LOCK_IGNORED` | with `lockPosition: true`, any of `velocity`, `gravity`, `airDrag`, `spin`, `lockRotation`, `collideBounds`, `duration` is written | `[TYPE_LOCK_IGNORED] The 'physics' block: '<prop>' has no effect on a body with 'lockPosition: true'. Remove it; only 'bounce' applies to a locked body.` |
| `TYPE_LOCK_IN_SEQUENCE` | `lockPosition: true` in a `sequence` or `parallel` step | `[TYPE_LOCK_IN_SEQUENCE] 'lockPosition' is not allowed inside a '<sequence\|parallel>' block: a locked step never ends, so the steps after it could never start. Put it on the object's own 'physics' block.` |
| `TYPE_LOCK_WITH_SEQUENCE` | `lockPosition: true` on an object that has a `sequence` | `[TYPE_LOCK_WITH_SEQUENCE] 'lockPosition: true' cannot be used on an object that also has a 'sequence' block, because the sequence waits for the object's physics to finish and a locked body's never does.` |
| `TYPE_LOCK_HANDOFF` | `handoff: true` on an animation whose sibling physics has `lockPosition: true` | `[TYPE_LOCK_HANDOFF] 'handoff: true' cannot hand momentum to a body with 'lockPosition: true', which physics never moves.` |
| `TYPE_SPIN_LOCKED` | `spin` and `lockRotation: true` in one block | `[TYPE_SPIN_LOCKED] The 'physics' block: 'spin' has no effect with 'lockRotation: true'. Remove one of them.` |

Interactions that must hold:

- A locked physics block with no `duration` produces **no** "missing the required property 'duration'" diagnostic. `duration` stays required on every unlocked block.
- `TYPE_LOCK_HANDOFF` replaces, for a locked receiver, the handoff checks that compare against the receiving physics `duration` (`TYPE_HANDOFF_DURATION`) or its `velocity` (`TYPE_HANDOFF_AMBIGUITY`); a locked receiver gets exactly one handoff diagnostic.
- `bounds: true` (or any non-list) is the generic kind mismatch, using a new `KIND_LABEL` entry: `a list of scene edges, such as [left, right, bottom]`. Read the composed sentence aloud before landing it (engineering-lessons §2e).

---

## 3. Why the lock rules are shaped this way

A `sequence` starts only after every top-level runner on its object completes (`sceneRuntime.ts`, sequence runner `WAITING` state). A locked body's physics runner never completes, so a locked object's sequence would never start — the same reason `TYPE_INDEFINITELY_WITH_SEQ` exists. A locked *step* inside a sequence would likewise stall every step after it. Both are rejected rather than given a special runtime meaning.

The ignored-property rule exists because roadmap §14.1 requires "every unsupported feature fails with a named diagnostic rather than silently". A `velocity` on a body that cannot move would otherwise compile and do nothing.

---

## 4. Compiler and IR

### 4.1 Contract

`LANGUAGE_CONTRACT` gains a `world` block with `gravity` (kind `point`, no default of its own — absence means "fall back to `(0, 980)`") and `bounds` (new value kind `edges`, default all four). Because `KEYWORDS` derives from the contract's keys, `world` becomes a keyword with no further edit. `physics` gains `lockPosition` (boolean, default `false`), `lockRotation` (boolean, default `false`) and `spin` (number, default `0`, no range constraint). `physics.duration` stays `required: true` in the contract; the validator waives it for a locked block (§2.2).

### 4.2 AST

- `SceneNode` gains `world?: ObjectNode` (an `ObjectNode` of type `world`, named `world_<line>_<col>` like `physics` blocks). It is **not** in `children`, so nothing that walks scene objects sees it.
- `AstValue` gains `EdgesValue { kind: "edges"; value: ReadonlyArray<{ name: string; line; col; endLine; endCol }>; line; col; endLine; endCol }`, produced only by `parseValue` when the key is `bounds` and the next token is `[`. A `bounds` value not starting with `[` is parsed as an ordinary expression and fails the kind check.

### 4.3 IR

```ts
export type IREdge = "left" | "right" | "top" | "bottom";

IRSceneNode.walls: ReadonlyArray<IREdge>     // canonical order left, right, top, bottom
IRPhysics.lockPosition: boolean
IRPhysics.lockRotation: boolean
IRPhysics.spin: number                       // degrees per second
```

- `walls` is always present: all four, in canonical order, when there is no `world` or no `bounds`.
- World gravity is **folded into each `IRPhysics.gravity` at build time.** The IR has no world gravity and the renderer's gravity path does not change.
- A locked block is written to the IR as what the body does: `lockPosition: true`, `velocity (0, 0)`, `gravity (0, 0)`, `airDrag 0`, `spin 0`, `lockRotation false`, `collideBounds true`, `duration "indefinitely"`, and its own `bounce`.
- Every existing scene's IR changes only by the new fields at their defaults. The determinism snapshot's diff must show exactly that and nothing else.

---

## 5. Runtime

### 5.1 Walls

`MatterWorld`'s constructor takes the wall list as an optional third argument defaulting to all four, and builds only the listed walls (each the same body it builds today). A single factory, `createWorldForScene(ir)`, is the only production constructor call; `adapter.ts` and `rasterExport.ts` both use it, so the playground and every export path cannot disagree about walls (engineering-lessons §5).

### 5.2 `lockPosition`

A new pin reason, `LOCKED`, added to `PinReason`. `spawnPhysics` pins `LOCKED` **before** it releases `NO_RUNNER`, and nothing ever releases it. Pinning is reason-counted (physics design §6.6), so a position animation on a locked object adds and removes `POS_ANIM` around a pin that `LOCKED` keeps held — the body follows the animation and stays static after it ends. A locked body is idle by construction (`isIdle` counts static bodies as idle) and its runner's `null` duration never completes, matching `duration: indefinitely`.

### 5.3 `lockRotation`

Implemented as infinite moment of inertia (`Body.setInertia(body, Infinity)`), Matter's documented idiom, so the contact solver treats the body as unable to rotate and puts the whole impulse into linear motion.

**This deviates from one sentence of the physics design.** §6.6 says "Phase 4's `lockRotation` uses the same mechanism" as D8's post-step angle override. The override lets the solver compute a contact for a body that can rotate and then discards the rotation afterwards; infinite inertia computes the contact for the body that actually exists. The deviation is stated here rather than taken quietly.

Matter resets inertia in three places the runtime reaches: `setStatic(false)` restores the saved finite inertia, `Body.scale` recomputes it, and params are set per physics step. `MatterWorld` therefore keeps each body's free (finite) inertia, updates it whenever `setScale` recomputes inertia, and reapplies the lock after `setParams`, after an unpin that makes the body dynamic, and after `setScale`. A step whose params have `lockRotation: false` restores the free inertia. Each of the three reapplication sites has its own test that fails when that one site is removed (engineering-lessons §2c, "revert each one separately").

### 5.4 `spin`

`IPhysicsWorld` gains `setAngularVelocity(id, radiansPerSecond)`. `MatterWorld` converts to Matter's per-1/60 s unit the same way `pxPerSecToMatter` converts linear velocity (`÷ 60`; Matter 0.20 scales `setAngularVelocity` by `deltaTime / _baseDelta` exactly as it scales `setVelocity`). `spawnPhysics` parks `spin` (converted to radians per second) on the container beside the parked linear velocity; the existing flush, which runs when the last pin lifts, applies both. A `spin` of `0` makes **no** call, so every existing scene's recorded world-call sequence stays byte-identical.

**A spun body sleeps by the speed of its rim (found in implementation, ruling R6).** Matter's sleeping pass measures `speed² + angularSpeed²` against `0.08` (`matter-js/src/core/Sleeping.js:18`, `:36`). Speed is in px per 1/60 s, but angular speed is in rad per 1/60 s, which is the speed of a point 1 px from the centre. So a body turning in place below about 972°/s counts as still. Measured: `spin: 360` in a vacuum went to sleep on tick 120, one tick short of 2π, and the runtime went idle with the object frozen mid-turn. `MatterWorld` therefore holds a body that has been given a non-zero spin to a stricter test. It may sleep only when its linear speed plus its angular speed times the distance from its centre to its farthest vertex is below Matter's threshold, which is how still Matter requires a body's centre to be. A spun body that lands and settles still sleeps, and the runtime goes idle. Bodies never given a spin keep Matter's rule unchanged, so existing scenes' frame hashes do not move.

### 5.5 Export

No export code changes. Every output samples the same runtime (`sampleFrames`), and Lottie bakes the resulting transforms, so spinning, locked and wall-bounded bodies reach PNG, APNG, video and Lottie with no new encoder work. This is verified, not assumed (§7, E4).

---

## 6. Editor and reference

- Monaco: `world` in the scene-level keyword completions and the hand-written keyword list in `language.ts`; property completions inside `world` and the new physics properties come from the contract; a `bounds` value completion offering `[left, right, bottom]`; hover docs for `world`, `bounds`, `lockPosition`, `lockRotation`, `spin`.
- `docs/LANGUAGE.md`: a "The world" subsection under Physics; the new properties under "Properties"; corrections to the two sentences that become false — "there is no scene-level gravity property" and the edges being "always on and cannot be turned off" (`collideBounds`' paragraph). Every new example compiles under `languageDocs.test.ts`.

---

## 7. Exit criteria

**E1 — The behaviours are measured, not asserted.** Headless tests on `MatterWorld` and through the compiled pipeline:

1. A body under world gravity `(0, 980)` and no gravity of its own reaches 980 px/s after one second; with its own `gravity: (0, -200)` under the same world it reaches −200 px/s.
2. `spin: 360` in a vacuum (no gravity, no walls in reach) has turned exactly `2π` radians after 120 ticks (tolerance `1e-9`).
3. A `lockRotation` box dropped corner-first onto a locked wedge keeps its angle exactly constant for 600 ticks while its position changes.
4. A locked body struck by a falling body does not move (position equal to `1e-9`); a locked body under `animate position` is at the animation's value at every tick and stays there after it ends.
5. With `bounds: [left, right, bottom]` a body starting at `y = −100` falls into the scene and comes to rest on the floor; with `bounds: []` a falling body leaves the scene, is culled, and the runtime goes idle.

**E2 — Every diagnostic in §2 fires with its exact wording** on a minimal fixture, and each is shown load-bearing by deleting its rule and watching its test fail.

**E3 — Nothing that existed changes.** Every first-party scene that runs headless (the corpus `playback.test.ts` already uses) produces byte-identical sampled-frame hashes at the end of the phase as at its base, checked by a test committed before any production change; the determinism snapshot changes only by the new defaulted IR fields.

**E4 — The new example is a real artifact.** It compiles, exports at 30 fps with identical hashes on two runs in every format the export matrix covers, plays in lottie-web, and passes the playground's browser checks (seek equals play).

**E5 — The finish line is declared with evidence.** A results file checks each of roadmap §12's six items against a command or a file in the repository; the two phase-status locations agree; an independent whole-branch review that shares none of the implementation reasoning has run and its findings are closed or ruled on (engineering-lessons §8).

**E6 — The package is ready to publish as 0.5.0.** `npm run check:pack` passes on the bumped version. Publishing is the owner's step, after merge.

---

## 8. Out of scope

- A rotation animation handing angular momentum to physics (`handoff` stays linear).
- Collision filtering, `mass`, `friction` — still cut (roadmap §4).
- Widening D13.
- A wall rectangle other than the scene's edges; a `lockPosition` body already makes a floor or ledge anywhere.
