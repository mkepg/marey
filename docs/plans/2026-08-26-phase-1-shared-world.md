# Phase 1: Shared Matter.js World Implementation Plan

**Goal:** Replace the per-object `NativePhysicsEngine` with a single shared Matter.js world so objects genuinely collide, tumble, settle and sleep.

**Architecture:** One pure module, `physicsWorld.ts`, owns the Matter engine and every unit conversion, and never imports `pixi.js` so it can be tested headlessly in Node. A second module, `physicsSync.ts`, is the only place PixiJS containers and physics bodies meet: it derives body geometry from a container, tracks why each body is pinned, and writes interpolated body transforms back onto containers. `adapter.ts` keeps the app, the ticker, and the animation and sequence runners, and shrinks by the whole physics integrator.

**Tech Stack:** TypeScript 5.9 (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), PixiJS 8, Matter.js 0.20.0, Vitest 4.

**Spec:** `docs/specs/2026-08-26-physics-shared-world-design.md` §6

---

## Background for the implementer

Marey compiles a scene DSL to a PixiJS scene graph. Phase 0 (merged at `717de75`)
converted the renderer to a fixed 120Hz tick: `adapter.ts` calls `driver.pump(deltaMS)` to
get a whole number of ticks, runs `advanceOneTick()` that many times, then paints once at
the leftover fraction `driver.alpha`. Read `docs/plans/2026-08-26-phase-0-deterministic-clock.md`,
especially its "Execution notes", before starting.

**The two invariants Phase 0 established, which this phase must not break:**

1. **Nothing that mutates scene state may take a time argument.** `advanceOneTick()`
   advances exactly one tick. `ticker.deltaMS` appears exactly once in the renderer, inside
   `driver.pump()`. `world.step()` therefore takes no argument either — that is what will
   let a Phase 5 export driver call it in a bare loop.
2. **State mutation belongs in the tick phase, painting in the paint phase.** `tickAnim`
   mutates and fires completion side effects; `applyAnim` only writes display properties.
   Moving a side effect into paint makes it fire once per *frame* instead of once per
   *tick*. This has been a bug once already.

**What today's physics does, and what replaces it.** `NativePhysicsEngine.tickContainer`
([adapter.ts:47-131](../../src/compiler/renderer/adapter.ts)) integrates one object's
velocity under gravity and drag, then clamps it inside the scene rectangle with a hand-rolled
bounce and a bespoke ground-rest hack. Objects never see each other. All of it is deleted.

**Three things about this codebase:**

- `matter-js` is in neither `package.json` nor the lockfile and is **not** currently in
  `node_modules`. Task 1 installs it. Reference sources are checked out at
  `../matter-js-master` (0.20.0) if you need to read them.
- Runtime state is attached to PixiJS containers via `__`-prefixed fields declared in a
  `declare module "pixi.js"` block at the top of
  [builder.ts](../../src/compiler/renderer/builder.ts). This phase replaces `__physicsState`
  with `__body`.
- Named colours (`red`, `cyan`, …) lex as their own token type and cannot be used as
  identifiers. Irrelevant to this phase, but it bites when writing test scenes.

**Matter 0.20.0 facts this plan depends on.** These are not the documented public API. They
were read out of `../matter-js-master/src` and are why spec §6.3 and §6.4 say what they do.
Do not "simplify" them away.

- `Body.setVelocity(body, v)` interprets `v` as **px per 1/60 s**, not px per tick
  (`Body.js:545`). Marey's `velocity` is px/s, so divide by 60.
- `Body.update` damps by `1 - body.frictionAir * (deltaTime / Common._baseDelta)`
  (`Body.js:754`). At 120Hz that parenthesis is `0.5`.
- `Body.create` defaults `body.deltaTime` to `1000/60` (`Body.js:99`). Left alone, the first
  tick runs with Matter's time correction at `0.5`.
- Inside `Engine.update`, `Sleeping.update` runs **before** gravity is applied, and
  force-wakes any body whose `force` is non-zero (`Sleeping.js:37`). Setting forces ourselves
  before calling `Engine.update` means nothing ever sleeps.
- `Engine._bodiesUpdate` and every `Resolver` path skip `body.isSleeping` regardless of
  `engine.enableSleeping`, so it is safe to turn the engine's own sleeping pass off and run
  `Sleeping.update` ourselves.
- A contact combines `restitution` with `max` and `friction` with `min` (`Pair.js:69-71`).
  So a static wall's `restitution: 0` does not cancel a falling object's `bounce`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/compiler/renderer/physicsWorld.ts` | **Create.** `IPhysicsWorld`, `MatterWorld`, `BodyGeometry`, all Marey↔Matter unit conversion, walls, the manual sleeping pass, `step()`, interpolated `readState`. **No `pixi.js` import.** |
| `src/compiler/renderer/physicsWorld.test.ts` | **Create.** Headless unit and snapshot tests. No Pixi, no DOM. |
| `src/compiler/renderer/physicsSync.ts` | **Create.** Container→`BodyGeometry`, `hasPhysicsAnywhere`, pin-reason bookkeeping, read-back onto containers, `Body.scale`, culling. Imports `pixi.js`. |
| `src/compiler/renderer/builder.ts` | **Modify.** Replace `__physicsState` with `__body` and `__pendingVelocity` in the `declare module` block. |
| `src/compiler/renderer/adapter.ts` | **Modify.** Delete `NativePhysicsEngine` and `IPhysicsEngine`; drive the world from `advanceOneTick`; rewire `spawnAnim`/`spawnPhysics`/`tickAnim` to pin reasons. |
| `src/store/defaultScene.ts` | **Modify.** The header comment claiming objects do not collide becomes false. |
| `package.json` | **Modify.** Add `matter-js` (pinned) and `@types/matter-js`. |

`physicsWorld.ts` is deliberately free of PixiJS imports (spec D9). If you find yourself
wanting `Container` in it, the code belongs in `physicsSync.ts` instead.

---

## Task 1: Install Matter.js and prove it imports under Vitest

**Files:**
- Modify: `package.json`
- Create: `src/compiler/renderer/physicsWorld.test.ts`

Matter.js ships a UMD bundle with no `exports` field. Named ESM imports from CJS are not
guaranteed to work under Node. This task settles the import style before any real code
depends on it.

- [ ] **Step 1: Install**

```bash
npm install matter-js@0.20.0 && npm install -D @types/matter-js
```

Note the exact version with no caret. Spec §12 records why: this phase depends on internal
Matter behaviour that is stable within 0.20.x but is not the documented API.

Expected: `added N packages`. If npm reports removing packages, that is the known
`node_modules` drift described in AGENTS.md and is fine.

- [ ] **Step 2: Verify `package.json` pinned the version**

Run: `node -e "const p=require('./package.json'); console.log(p.dependencies['matter-js'])"`
Expected: `0.20.0` exactly — no `^`, no `~`. If npm added a caret, edit `package.json` to
read `"matter-js": "0.20.0"` and re-run `npm install`.

- [ ] **Step 3: Write a test that pins the import style and the version**

Create `src/compiler/renderer/physicsWorld.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import Matter from "matter-js";

describe("matter-js interop", () => {
  it("resolves the default export with the modules this phase uses", () => {
    expect(typeof Matter.Engine.create).toBe("function");
    expect(typeof Matter.Bodies.circle).toBe("function");
    expect(typeof Matter.Body.setVelocity).toBe("function");
    expect(typeof Matter.Sleeping.update).toBe("function");
    expect(typeof Matter.Vertices.hull).toBe("function");
  });

  it("is the version whose internals spec 6.3 and 6.4 were derived from", () => {
    // This phase depends on Matter internals that are not the documented API:
    // Body._baseDelta normalisation, and the phase order inside Engine.update.
    // If this fails, re-derive the conversions before bumping the dependency.
    expect(Matter.Common._baseDelta).toBe(1000 / 60);
  });
});
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/compiler/renderer/physicsWorld.test.ts`
Expected: PASS, `2 passed`.

If the default import fails to resolve, try `import * as Matter from "matter-js"` and use
whichever works — but use the **same** style in `physicsWorld.ts`, and update this test to
match so the choice stays pinned.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: PASS with no output.

**Expect type friction here.** `@types/matter-js` does not declare the internals this phase
uses. If any of `Common._baseDelta`, `Common._seed`, `Body.deltaTime` or `Engine.pairs`
errors, add the augmentation below. Put it in **`physicsWorld.ts`** once Task 2 creates that
file — a `declare module` augmentation is global, so declaring it there covers the test file
too. For this task only, put it at the top of `physicsWorld.test.ts` and move it in Task 2.

```typescript
declare module "matter-js" {
  namespace Common {
    let _seed: number;
    const _baseDelta: number;
  }
  interface Body {
    deltaTime: number;
  }
  interface Engine {
    pairs: { list: Matter.Pair[] };
  }
}
```

Only include the members that actually error — `noUnusedLocals` does not apply to
augmentations, but redeclaring something the types already have correctly is a conflict.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/compiler/renderer/physicsWorld.test.ts
git commit -m "chore(deps): add matter-js 0.20.0 pinned, with an interop guard test"
```

---

## Task 2: Unit conversions

**Files:**
- Create: `src/compiler/renderer/physicsWorld.ts`
- Modify: `src/compiler/renderer/physicsWorld.test.ts`

Spec §6.3. These four functions are the whole reason this phase can be verified. Both
`airDragToFrictionAir` and `pxPerSecToMatter` were wrong in the original spec, so they get
assertions against the *old* engine's behaviour rather than against a snapshot.

Let `r = 60 / TICK_HZ` — the ratio Matter uses to normalise both drag and velocity. At 120Hz
it is `0.5`.

- [ ] **Step 1: Write the failing tests**

Append to `src/compiler/renderer/physicsWorld.test.ts`:

```typescript
import {
  MATTER_R,
  airDragToFrictionAir,
  pxPerSecToMatter,
  matterToPxPerSec,
  gravityToTickDelta,
} from "./physicsWorld";
import { TICK_HZ } from "./clock";

/**
 * What the old NativePhysicsEngine did to a velocity over one second:
 * a factor of pow(1 - airDrag, step * 60) applied once per tick, 120 times.
 * This is the oracle the conversion has to reproduce.
 */
function legacyOneSecondDamping(airDrag: number): number {
  let f = 1;
  for (let i = 0; i < TICK_HZ; i++) {
    f *= Math.pow(1 - airDrag, (1 / TICK_HZ) * 60);
  }
  return f;
}

/** What Matter does to a velocity over one second at the given frictionAir. */
function matterOneSecondDamping(frictionAir: number): number {
  let f = 1;
  for (let i = 0; i < TICK_HZ; i++) {
    f *= 1 - frictionAir * MATTER_R;
  }
  return f;
}

describe("airDragToFrictionAir", () => {
  it("reproduces one second of the old engine's damping", () => {
    for (const airDrag of [0, 0.006, 0.05, 0.25, 0.5, 0.9]) {
      const got = matterOneSecondDamping(airDragToFrictionAir(airDrag));
      expect(got).toBeCloseTo(legacyOneSecondDamping(airDrag), 6);
    }
  });

  it("makes airDrag 1.0 a full stop, which the original formula could not", () => {
    // The formula this replaced gave frictionAir 1, i.e. a half-per-tick decay,
    // so "maximum resistance" was unreachable.
    expect(matterOneSecondDamping(airDragToFrictionAir(1))).toBe(0);
  });

  it("leaves a vacuum undamped", () => {
    expect(airDragToFrictionAir(0)).toBe(0);
  });

  it("never damps more than fully in one tick", () => {
    for (const airDrag of [0, 0.5, 1]) {
      const perTick = 1 - airDragToFrictionAir(airDrag) * MATTER_R;
      expect(perTick).toBeGreaterThanOrEqual(0);
      expect(perTick).toBeLessThanOrEqual(1);
    }
  });
});

describe("pxPerSecToMatter", () => {
  it("converts to px per 1/60s, not px per tick", () => {
    // Body.setVelocity normalises against Body._baseDelta = 1000/60,
    // so its units do not follow the tick rate.
    expect(pxPerSecToMatter(600)).toBeCloseTo(10, 9);
  });

  it("round-trips", () => {
    expect(matterToPxPerSec(pxPerSecToMatter(347.5))).toBeCloseTo(347.5, 9);
  });
});

describe("gravityToTickDelta", () => {
  it("reaches the stated acceleration after one second of ticks", () => {
    // 980 px/s^2 for one second is 980 px/s, which in Matter units is 980/60.
    const perTick = gravityToTickDelta(980);
    expect(perTick * TICK_HZ).toBeCloseTo(pxPerSecToMatter(980), 9);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/compiler/renderer/physicsWorld.test.ts`
Expected: FAIL — `Failed to resolve import "./physicsWorld"`.

- [ ] **Step 3: Write the implementation**

Create `src/compiler/renderer/physicsWorld.ts`:

```typescript
import { TICK_HZ } from "./clock";

/**
 * Matter normalises velocity and air friction against `Common._baseDelta`
 * (1000/60 ms), independently of the delta actually passed to `Engine.update`.
 * `MATTER_R` is our tick expressed in those units.
 *
 * Every conversion below is written in terms of it rather than hard-coded for
 * 120Hz, so changing TICK_HZ cannot silently halve or double anything.
 */
export const MATTER_R = 60 / TICK_HZ;

/** Milliseconds of one fixed tick, as Matter wants it. */
export const MATTER_DELTA_MS = 1000 / TICK_HZ;

/** Matter's own velocity unit: pixels per 1/60 of a second. */
const MATTER_BASE_HZ = 60;

/**
 * Marey's `airDrag` is 0 = vacuum, 1 = maximum resistance, and was defined by
 * the old engine as `pow(1 - airDrag, 1/60)` applied once per tick.
 *
 * Matter damps by `1 - frictionAir * MATTER_R` once per tick. Matching one
 * second of the two gives `1 - fa*r = (1 - airDrag)^r`.
 */
export function airDragToFrictionAir(airDrag: number): number {
  const clamped = airDrag < 0 ? 0 : airDrag > 1 ? 1 : airDrag;
  return (1 - Math.pow(1 - clamped, MATTER_R)) / MATTER_R;
}

/** px/s (Marey) → px per 1/60s (Matter's `Body.setVelocity`). */
export function pxPerSecToMatter(pxPerSec: number): number {
  return pxPerSec / MATTER_BASE_HZ;
}

/** px per 1/60s (Matter) → px/s (Marey). */
export function matterToPxPerSec(matterVel: number): number {
  return matterVel * MATTER_BASE_HZ;
}

/**
 * px/s^2 (Marey) → the velocity delta, in Matter units, to add once per tick.
 *
 * This is deliberately not a force. See spec 6.4: a force set before
 * `Engine.update` is still in the buffer when Matter's sleeping pass reads it,
 * so nothing would ever sleep.
 */
export function gravityToTickDelta(pxPerSecSq: number): number {
  return pxPerSecToMatter(pxPerSecSq) / TICK_HZ;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/compiler/renderer/physicsWorld.test.ts`
Expected: PASS, `9 passed`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: PASS with no output.

- [ ] **Step 6: Commit**

```bash
git add src/compiler/renderer/physicsWorld.ts src/compiler/renderer/physicsWorld.test.ts
git commit -m "feat(renderer): add Marey-to-Matter unit conversions

Both the velocity and airDrag conversions differ from the original spec table,
which was written against Matter 0.19. 0.20 normalises against Common._baseDelta,
so velocity divides by 60 rather than 120 and frictionAir carries a factor of r.
Tested against the old engine's damping rather than a snapshot."
```

---

## Task 3: Bodies, walls, and the centroid offset

**Files:**
- Modify: `src/compiler/renderer/physicsWorld.ts`
- Modify: `src/compiler/renderer/physicsWorld.test.ts`

Spec §6.1, §6.5, §6.9 (centroid offset, D15).

The offset exists because `Bodies.fromVertices` places a body's **centre of mass** at the
point you give it, while a Marey container's pivot is its **bounding-box centre**. For a
triangle those are about a sixth of its height apart. We store the local vector from
centroid to bbox centre and rotate it by the body's angle on the way out.

- [ ] **Step 1: Write the failing tests**

Append to `src/compiler/renderer/physicsWorld.test.ts`:

```typescript
import { MatterWorld, type PhysicsParams } from "./physicsWorld";

const VACUUM: PhysicsParams = {
  gravityX: 0,
  gravityY: 0,
  airDrag: 0,
  bounce: 0,
  collideBounds: true,
};

/** An isoceles triangle whose centroid sits well below its bbox centre. */
const TRIANGLE = [
  { x: 0, y: -30 },
  { x: 26, y: 15 },
  { x: -26, y: 15 },
];

describe("MatterWorld body lifecycle", () => {
  it("reports a circle back at the position it was given", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 10 }, 100, 200, 0, VACUUM);
    expect(w.readState("a", 0)).toEqual({ x: 100, y: 200, angle: 0 });
    w.destroy();
  });

  it("returns null for an unknown id rather than throwing", () => {
    const w = new MatterWorld(800, 600);
    expect(w.readState("nope", 0)).toBe(null);
    expect(w.hasBody("nope")).toBe(false);
    w.destroy();
  });

  it("forgets a removed body", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 10 }, 100, 200, 0, VACUUM);
    w.removeBody("a");
    expect(w.hasBody("a")).toBe(false);
    expect(w.readState("a", 0)).toBe(null);
    w.destroy();
  });

  it("reports a polygon at its bbox centre, not its centroid", () => {
    // Without the D15 offset this comes back ~5px low, and the drawn shape
    // would drift off its collision shape as soon as the body rotates.
    const w = new MatterWorld(800, 600);
    w.addBody("t", { kind: "polygon", points: TRIANGLE }, 400, 300, 0, VACUUM);
    const s = w.readState("t", 0)!;
    expect(s.x).toBeCloseTo(400, 6);
    expect(s.y).toBeCloseTo(300, 6);
    w.destroy();
  });

  it("rotates the polygon offset with the body", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("t", { kind: "polygon", points: TRIANGLE }, 400, 300, 0, VACUUM);
    w.overrideAngle("t", Math.PI / 2);
    w.step();
    const s = w.readState("t", 1)!;
    // The bbox centre is still the bbox centre after a quarter turn about the
    // centre of mass — it just orbits, so it must not read back as (400, 300).
    expect(s.angle).toBeCloseTo(Math.PI / 2, 6);
    expect(Math.hypot(s.x - 400, s.y - 300)).toBeGreaterThan(1);
    w.destroy();
  });

  it("round-trips a position through setPosition for a polygon", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("t", { kind: "polygon", points: TRIANGLE }, 400, 300, 0, VACUUM);
    w.pin("t", "NO_RUNNER");
    w.setPosition("t", 120, 90);
    const s = w.readState("t", 1)!;
    expect(s.x).toBeCloseTo(120, 6);
    expect(s.y).toBeCloseTo(90, 6);
    w.destroy();
  });
});

describe("MatterWorld walls", () => {
  it("stops a falling body with collideBounds", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 20 }, 400, 100,
      0, { ...VACUUM, gravityY: 2000 });
    for (let i = 0; i < 600; i++) w.step();
    const s = w.readState("a", 1)!;
    expect(s.y).toBeLessThanOrEqual(600);
    expect(s.y).toBeGreaterThan(500);
    w.destroy();
  });

  it("lets a body fall straight through without collideBounds", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 20 }, 400, 100,
      0, { ...VACUUM, gravityY: 2000, collideBounds: false });
    for (let i = 0; i < 600; i++) w.step();
    expect(w.readState("a", 1)!.y).toBeGreaterThan(600);
    w.destroy();
  });

  it("still collides two bodies with each other when neither uses collideBounds", () => {
    // collideBounds toggles only the wall category. Objects always see objects.
    const w = new MatterWorld(800, 600);
    const params = { ...VACUUM, collideBounds: false };
    w.addBody("lower", { kind: "circle", radius: 20 }, 400, 300, 0, params);
    w.pin("lower", "FROZEN");
    w.addBody("upper", { kind: "circle", radius: 20 }, 400, 200,
      0, { ...params, gravityY: 2000 });
    for (let i = 0; i < 240; i++) w.step();
    expect(w.readState("upper", 1)!.y).toBeLessThan(300);
    w.destroy();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/compiler/renderer/physicsWorld.test.ts`
Expected: FAIL — `MatterWorld is not exported` or `not a constructor`.

- [ ] **Step 3: Write the implementation**

Append to `src/compiler/renderer/physicsWorld.ts`:

```typescript
import Matter from "matter-js";

/** Why a body is currently pinned. Reason-counted, so two holds need two releases. */
export type PinReason = "NO_RUNNER" | "POS_ANIM" | "FROZEN";

/**
 * Plain geometry, in the container's own local space with the origin at its
 * bounding-box centre. Deliberately free of any PixiJS type (spec D9).
 */
export type BodyGeometry =
  | { readonly kind: "circle"; readonly radius: number }
  | { readonly kind: "rectangle"; readonly width: number; readonly height: number }
  | {
      readonly kind: "polygon";
      readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
    };

/** Marey's physics properties, in Marey's units. px/s, px/s^2, 0..1. */
export interface PhysicsParams {
  readonly gravityX: number;
  readonly gravityY: number;
  readonly airDrag: number;
  readonly bounce: number;
  readonly collideBounds: boolean;
}

export interface BodyState {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export interface IPhysicsWorld {
  addBody(
    id: string,
    geometry: BodyGeometry,
    x: number,
    y: number,
    angle: number,
    params: PhysicsParams
  ): void;
  removeBody(id: string): void;
  hasBody(id: string): boolean;
  setParams(id: string, params: PhysicsParams): void;
  pin(id: string, reason: PinReason): void;
  unpin(id: string, reason: PinReason): void;
  isPinned(id: string): boolean;
  /** Drives a pinned body. px, scene space, at the bounding-box centre. */
  setPosition(id: string, x: number, y: number): void;
  /** px/s, converted internally. */
  setVelocity(id: string, vx: number, vy: number): void;
  setScale(id: string, sx: number, sy: number): void;
  /** Radians to hold the angle at, or null to release it back to the solver. */
  overrideAngle(id: string, radians: number | null): void;
  /** Advance exactly one fixed tick. Takes no time argument, ever. */
  step(): void;
  readState(id: string, alpha: number): BodyState | null;
  idsOutsideBounds(margin: number): string[];
  isIdle(): boolean;
  destroy(): void;
}

const CATEGORY_OBJECT = 0x0001;
const CATEGORY_WALL = 0x0002;

/** How far outside the scene the walls sit, and how thick they are. */
const WALL_THICKNESS = 200;

interface BodyRecord {
  readonly body: Matter.Body;
  gravityX: number;
  gravityY: number;
  /** Local vector from centre of mass to bounding-box centre, at scale 1. */
  readonly offsetX: number;
  readonly offsetY: number;
  scaleX: number;
  scaleY: number;
  readonly pinReasons: Set<PinReason>;
  angleOverride: number | null;
  prevX: number;
  prevY: number;
  prevAngle: number;
}

export class MatterWorld implements IPhysicsWorld {
  private readonly engine: Matter.Engine;
  private readonly records = new Map<string, BodyRecord>();
  private readonly width: number;
  private readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    // Matter's seeded RNG is module-global and survives between worlds in a
    // page session, so a second run would otherwise diverge from a cold load.
    Matter.Common._seed = 0;

    this.engine = Matter.Engine.create();
    // Marey's gravity is per object, so the world has none of its own.
    this.engine.gravity.scale = 0;
    // We run the sleeping pass ourselves; see step() and spec 6.4.
    this.engine.enableSleeping = false;

    Matter.Composite.add(this.engine.world, this.createWalls());
  }

  private createWalls(): Matter.Body[] {
    const t = WALL_THICKNESS;
    const w = this.width;
    const h = this.height;
    const opts = {
      isStatic: true,
      collisionFilter: { category: CATEGORY_WALL, mask: CATEGORY_OBJECT, group: 0 },
    };
    return [
      Matter.Bodies.rectangle(w / 2, -t / 2, w + t * 2, t, opts),
      Matter.Bodies.rectangle(w / 2, h + t / 2, w + t * 2, t, opts),
      Matter.Bodies.rectangle(-t / 2, h / 2, t, h + t * 2, opts),
      Matter.Bodies.rectangle(w + t / 2, h / 2, t, h + t * 2, opts),
    ];
  }

  addBody(
    id: string,
    geometry: BodyGeometry,
    x: number,
    y: number,
    angle: number,
    params: PhysicsParams
  ): void {
    let body: Matter.Body;
    let offsetX = 0;
    let offsetY = 0;

    if (geometry.kind === "circle") {
      body = Matter.Bodies.circle(x, y, Math.max(geometry.radius, 0.5));
    } else if (geometry.kind === "rectangle") {
      body = Matter.Bodies.rectangle(
        x, y,
        Math.max(geometry.width, 1),
        Math.max(geometry.height, 1)
      );
    } else {
      // Hull up front rather than letting Matter fall back internally: it warns
      // once per concave input about the poly-decomp we deliberately do not ship.
      const hull = Matter.Vertices.hull(
        geometry.points.map((p) => ({ x: p.x, y: p.y }))
      );
      const centroid = Matter.Vertices.centre(hull);
      // fromVertices puts the centre of MASS at the point given, so place the
      // centroid where it belongs relative to the bbox centre we were handed.
      body = Matter.Bodies.fromVertices(x + centroid.x, y + centroid.y, [hull]);
      offsetX = -centroid.x;
      offsetY = -centroid.y;
    }

    // Body.create defaults deltaTime to 1000/60. Left alone, the first tick
    // would run with Matter's time correction at 0.5.
    body.deltaTime = MATTER_DELTA_MS;
    // sleepThreshold is in Matter's own base-delta units, so it already means
    // the same wall-clock second at 120Hz as it does at 60Hz.
    Matter.Body.setAngle(body, angle);

    const rec: BodyRecord = {
      body,
      gravityX: params.gravityX,
      gravityY: params.gravityY,
      offsetX,
      offsetY,
      scaleX: 1,
      scaleY: 1,
      pinReasons: new Set(),
      angleOverride: null,
      prevX: body.position.x,
      prevY: body.position.y,
      prevAngle: body.angle,
    };
    this.records.set(id, rec);
    this.applyParams(rec, params);
    Matter.Composite.add(this.engine.world, body);
  }

  private applyParams(rec: BodyRecord, params: PhysicsParams): void {
    rec.gravityX = params.gravityX;
    rec.gravityY = params.gravityY;
    rec.body.restitution = params.bounce;
    rec.body.frictionAir = airDragToFrictionAir(params.airDrag);
    rec.body.collisionFilter.category = CATEGORY_OBJECT;
    rec.body.collisionFilter.mask = params.collideBounds
      ? CATEGORY_OBJECT | CATEGORY_WALL
      : CATEGORY_OBJECT;
  }

  setParams(id: string, params: PhysicsParams): void {
    const rec = this.records.get(id);
    if (rec) this.applyParams(rec, params);
  }

  removeBody(id: string): void {
    const rec = this.records.get(id);
    if (!rec) return;
    Matter.Composite.remove(this.engine.world, rec.body);
    this.records.delete(id);
  }

  hasBody(id: string): boolean {
    return this.records.has(id);
  }

  /** Local offset rotated into world space at the body's current angle and scale. */
  private rotatedOffset(rec: BodyRecord): { x: number; y: number } {
    if (rec.offsetX === 0 && rec.offsetY === 0) return { x: 0, y: 0 };
    const ox = rec.offsetX * rec.scaleX;
    const oy = rec.offsetY * rec.scaleY;
    const c = Math.cos(rec.body.angle);
    const s = Math.sin(rec.body.angle);
    return { x: ox * c - oy * s, y: ox * s + oy * c };
  }

  readState(id: string, alpha: number): BodyState | null {
    const rec = this.records.get(id);
    if (!rec) return null;
    const off = this.rotatedOffset(rec);
    const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    return {
      x: rec.prevX + (rec.body.position.x - rec.prevX) * a + off.x,
      y: rec.prevY + (rec.body.position.y - rec.prevY) * a + off.y,
      angle: rec.prevAngle + (rec.body.angle - rec.prevAngle) * a,
    };
  }

  setPosition(id: string, x: number, y: number): void {
    const rec = this.records.get(id);
    if (!rec) return;
    const off = this.rotatedOffset(rec);
    Matter.Body.setPosition(rec.body, { x: x - off.x, y: y - off.y });
  }

  destroy(): void {
    Matter.Composite.clear(this.engine.world, false, true);
    Matter.Engine.clear(this.engine);
    this.records.clear();
  }
}
```

Add the remaining `IPhysicsWorld` members as stubs so the class compiles; Tasks 4-6 fill
them in. Append them inside the class body, above `destroy()`:

```typescript
  pin(_id: string, _reason: PinReason): void {}
  unpin(_id: string, _reason: PinReason): void {}
  isPinned(_id: string): boolean { return false; }
  setVelocity(_id: string, _vx: number, _vy: number): void {}
  setScale(_id: string, _sx: number, _sy: number): void {}
  overrideAngle(_id: string, _radians: number | null): void {}
  step(): void {}
  idsOutsideBounds(_margin: number): string[] { return []; }
  isIdle(): boolean { return true; }
```

Note the `_` prefixes — this project builds with `noUnusedParameters`.

Some of the Task 3 tests exercise `pin`, `overrideAngle` and `step`, so they will still
fail until Tasks 4 and 5. That is expected and is the point of the ordering. To keep this
task's commit honest, mark those three tests `it.skip` for now and un-skip them in the task
that implements what they need. The four that only use `addBody`/`readState`/`setPosition`
must pass here.

Skip in this task, un-skip where noted:
- "rotates the polygon offset with the body" → un-skip in Task 4
- "stops a falling body with collideBounds" → un-skip in Task 4
- "lets a body fall straight through without collideBounds" → un-skip in Task 4
- "still collides two bodies with each other when neither uses collideBounds" → un-skip in Task 5
- "round-trips a position through setPosition for a polygon" → keep active; it only needs
  `pin` to be a no-op, and `setPosition` works on a dynamic body too.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/compiler/renderer/physicsWorld.test.ts`
Expected: PASS, with 4 skipped.

- [ ] **Step 5: Confirm the module is Pixi-free**

Run: `grep -c "pixi" src/compiler/renderer/physicsWorld.ts`
Expected: `0`. Spec D9 — if this ever becomes non-zero the headless tests stop working.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc -b --noEmit`
Expected: PASS with no output.

```bash
git add src/compiler/renderer/physicsWorld.ts src/compiler/renderer/physicsWorld.test.ts
git commit -m "feat(renderer): add MatterWorld bodies, walls and the centroid offset"
```

---

## Task 4: The step loop, gravity, sleeping and the angle override

**Files:**
- Modify: `src/compiler/renderer/physicsWorld.ts`
- Modify: `src/compiler/renderer/physicsWorld.test.ts`

Spec §6.4. **This is the task the phase turns on.** Read §6.4 before writing code.

The trap: applying per-body gravity as `body.force` before `Engine.update` means
`Sleeping.update` — which runs first inside `Engine.update` and force-wakes anything
carrying a force — never lets a body sleep. So we turn Matter's sleeping pass off and run
the same phases ourselves in the same order, injecting gravity as a velocity delta instead.

- [ ] **Step 1: Write the failing tests**

Un-skip these three from Task 3:
- "rotates the polygon offset with the body"
- "stops a falling body with collideBounds"
- "lets a body fall straight through without collideBounds"

Then append to `src/compiler/renderer/physicsWorld.test.ts`:

```typescript
/** Marey-unit velocity of a body, measured from one tick to the next. */
function measureVelocityPxPerSec(w: MatterWorld, id: string): { x: number; y: number } {
  const before = w.readState(id, 1)!;
  w.step();
  const after = w.readState(id, 1)!;
  return {
    x: (after.x - before.x) * TICK_HZ,
    y: (after.y - before.y) * TICK_HZ,
  };
}

describe("MatterWorld step", () => {
  it("accelerates a body at the stated px/s^2", () => {
    const w = new MatterWorld(800, 6000);
    w.addBody("a", { kind: "circle", radius: 5 }, 400, 100,
      0, { ...VACUUM, gravityY: 980, collideBounds: false });
    for (let i = 0; i < TICK_HZ; i++) w.step();
    expect(measureVelocityPxPerSec(w, "a").y).toBeCloseTo(980, 0);
    w.destroy();
  });

  it("keeps a launched body at its launch speed in a vacuum", () => {
    const w = new MatterWorld(8000, 600);
    w.addBody("a", { kind: "circle", radius: 5 }, 100, 300,
      0, { ...VACUUM, collideBounds: false });
    w.setVelocity("a", 600, 0);
    for (let i = 0; i < TICK_HZ; i++) w.step();
    // 600 px/s for one second, with no gravity and no drag.
    expect(w.readState("a", 1)!.x).toBeCloseTo(700, 0);
    w.destroy();
  });

  it("damps a launched body by airDrag over one second", () => {
    const w = new MatterWorld(8000, 600);
    w.addBody("a", { kind: "circle", radius: 5 }, 100, 300,
      0, { ...VACUUM, airDrag: 0.05, collideBounds: false });
    w.setVelocity("a", 600, 0);
    for (let i = 0; i < TICK_HZ; i++) w.step();
    // The old engine's oracle: 600 * (1 - airDrag)^60.
    const expected = 600 * Math.pow(1 - 0.05, 60);
    expect(measureVelocityPxPerSec(w, "a").x).toBeCloseTo(expected, 0);
    w.destroy();
  });

  it("holds an overridden angle and releases it back to the solver", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "rectangle", width: 40, height: 20 }, 400, 300,
      0, { ...VACUUM, collideBounds: false });
    w.overrideAngle("a", 1.25);
    for (let i = 0; i < 10; i++) w.step();
    expect(w.readState("a", 1)!.angle).toBeCloseTo(1.25, 9);
    w.overrideAngle("a", null);
    w.step();
    expect(w.readState("a", 1)!.angle).toBeCloseTo(1.25, 9);
    w.destroy();
  });

  it("lets a settled body fall asleep", () => {
    // The whole point of spec 6.4. If gravity is applied as a force this
    // never becomes true, because Sleeping.update force-wakes it every tick.
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 20 }, 400, 100,
      0, { ...VACUUM, gravityY: 980 });
    for (let i = 0; i < TICK_HZ * 6; i++) w.step();
    expect(w.isIdle()).toBe(true);
    w.destroy();
  });

  it("wakes a sleeping body when another lands on it", () => {
    const w = new MatterWorld(800, 600);
    const falling = { ...VACUUM, gravityY: 980 };
    w.addBody("bottom", { kind: "circle", radius: 20 }, 400, 100, 0, falling);
    for (let i = 0; i < TICK_HZ * 6; i++) w.step();
    expect(w.isIdle()).toBe(true);

    const restingY = w.readState("bottom", 1)!.y;
    w.addBody("top", { kind: "circle", radius: 20 }, 400, 100, 0, falling);
    for (let i = 0; i < TICK_HZ * 2; i++) w.step();

    expect(w.isIdle()).toBe(false);
    // The stack must not interpenetrate: two r=20 circles are 40px apart.
    const gap = restingY - w.readState("top", 1)!.y;
    expect(gap).toBeGreaterThan(30);
    w.destroy();
  });

  it("produces an identical state sequence on a second run", () => {
    const run = () => {
      const w = new MatterWorld(800, 600);
      const p = { ...VACUUM, gravityY: 980, bounce: 0.5 };
      w.addBody("a", { kind: "circle", radius: 18 }, 380, 80, 0, p);
      w.addBody("b", { kind: "rectangle", width: 40, height: 40 }, 410, 20, 0.3, p);
      w.addBody("c", { kind: "polygon", points: TRIANGLE }, 395, 160, 0, p);
      const trace: number[] = [];
      for (let i = 0; i < 300; i++) {
        w.step();
        for (const id of ["a", "b", "c"]) {
          const s = w.readState(id, 1)!;
          trace.push(s.x, s.y, s.angle);
        }
      }
      w.destroy();
      return trace;
    };
    expect(run()).toEqual(run());
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/compiler/renderer/physicsWorld.test.ts`
Expected: FAIL — bodies never move, because `step()` is still a stub.

- [ ] **Step 3: Implement `step`, gravity, `setVelocity` and `overrideAngle`**

Replace the `setVelocity`, `overrideAngle`, `step` and `isIdle` stubs in `MatterWorld` with:

```typescript
  setVelocity(id: string, vx: number, vy: number): void {
    const rec = this.records.get(id);
    if (!rec) return;
    Matter.Body.setVelocity(rec.body, {
      x: pxPerSecToMatter(vx),
      y: pxPerSecToMatter(vy),
    });
  }

  overrideAngle(id: string, radians: number | null): void {
    const rec = this.records.get(id);
    if (!rec) return;
    rec.angleOverride = radians;
    if (radians !== null) {
      Matter.Body.setAngle(rec.body, radians);
      Matter.Body.setAngularVelocity(rec.body, 0);
    }
  }

  /**
   * Advance exactly one fixed tick.
   *
   * The phase order matters and mirrors Engine.update's own. Matter applies
   * world gravity AFTER its sleeping pass and clears forces before the next
   * one, so at the moment Sleeping.update runs every force buffer is zero.
   * A force we set ourselves would still be there, and Sleeping.update
   * force-wakes anything carrying one — so nothing would ever sleep.
   *
   * We therefore drive the sleeping pass ourselves (enableSleeping is false)
   * and inject gravity as a velocity delta, which the sleeping pass cannot see.
   */
  step(): void {
    const allBodies = Matter.Composite.allBodies(this.engine.world);

    for (const rec of this.records.values()) {
      rec.prevX = rec.body.position.x;
      rec.prevY = rec.body.position.y;
      rec.prevAngle = rec.body.angle;
    }

    Matter.Sleeping.update(allBodies, MATTER_DELTA_MS);

    for (const rec of this.records.values()) {
      if (rec.body.isStatic || rec.body.isSleeping) continue;
      if (rec.gravityX === 0 && rec.gravityY === 0) continue;
      const v = Matter.Body.getVelocity(rec.body);
      Matter.Body.setVelocity(rec.body, {
        x: v.x + gravityToTickDelta(rec.gravityX),
        y: v.y + gravityToTickDelta(rec.gravityY),
      });
    }

    Matter.Engine.update(this.engine, MATTER_DELTA_MS);

    // D8: a rotation animation owns the angle while position stays dynamic.
    // Matter has no such mode, so force it back after the solver has run.
    for (const rec of this.records.values()) {
      if (rec.angleOverride === null) continue;
      Matter.Body.setAngle(rec.body, rec.angleOverride);
      Matter.Body.setAngularVelocity(rec.body, 0);
    }

    Matter.Sleeping.afterCollisions(this.engine.pairs.list);
  }

  isIdle(): boolean {
    for (const rec of this.records.values()) {
      if (!rec.body.isSleeping && !rec.body.isStatic) return false;
    }
    return true;
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/compiler/renderer/physicsWorld.test.ts`
Expected: PASS, 1 skipped (the two-body `collideBounds: false` test, which needs `pin`).

If "lets a settled body fall asleep" fails, the gravity injection has leaked into
`body.force` somewhere — that is exactly the D14 failure and the fix is in this file, not in
the test.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b --noEmit`
Expected: PASS with no output.

```bash
git add src/compiler/renderer/physicsWorld.ts src/compiler/renderer/physicsWorld.test.ts
git commit -m "feat(renderer): step the shared world with manual sleeping and per-body gravity

Gravity is injected as a velocity delta rather than a force. Sleeping.update
runs first inside Engine.update and force-wakes any body carrying a force, so
the force route would mean nothing ever sleeps - taking out both the
frozen-vs-asleep distinction and idle detection. See spec 6.4."
```

---

## Task 5: Reason-counted pinning and scale

**Files:**
- Modify: `src/compiler/renderer/physicsWorld.ts`
- Modify: `src/compiler/renderer/physicsWorld.test.ts`

Spec §6.6. Pinning generalises today's `__kinematicPosAnimCount`: an object can be pinned
for two reasons at once and releasing one must not release the other.

- [ ] **Step 1: Write the failing tests**

Un-skip "still collides two bodies with each other when neither uses collideBounds", then
append:

```typescript
describe("MatterWorld pinning", () => {
  it("holds a pinned body still under gravity", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 10 }, 400, 100,
      0, { ...VACUUM, gravityY: 980 });
    w.pin("a", "FROZEN");
    for (let i = 0; i < TICK_HZ; i++) w.step();
    expect(w.readState("a", 1)!.y).toBeCloseTo(100, 6);
    w.destroy();
  });

  it("needs every reason released before it moves again", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 10 }, 400, 100,
      0, { ...VACUUM, gravityY: 980 });
    w.pin("a", "NO_RUNNER");
    w.pin("a", "POS_ANIM");

    w.unpin("a", "NO_RUNNER");
    expect(w.isPinned("a")).toBe(true);
    for (let i = 0; i < 30; i++) w.step();
    expect(w.readState("a", 1)!.y).toBeCloseTo(100, 6);

    w.unpin("a", "POS_ANIM");
    expect(w.isPinned("a")).toBe(false);
    for (let i = 0; i < 30; i++) w.step();
    expect(w.readState("a", 1)!.y).toBeGreaterThan(100);
    w.destroy();
  });

  it("ignores an unpin for a reason that was never applied", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 10 }, 400, 100,
      0, { ...VACUUM, gravityY: 980 });
    w.pin("a", "FROZEN");
    w.unpin("a", "POS_ANIM");
    expect(w.isPinned("a")).toBe(true);
    w.destroy();
  });

  it("starts from rest when unpinned, not from accumulated velocity", () => {
    const w = new MatterWorld(800, 6000);
    w.addBody("a", { kind: "circle", radius: 10 }, 400, 100,
      0, { ...VACUUM, gravityY: 980, collideBounds: false });
    w.pin("a", "NO_RUNNER");
    for (let i = 0; i < TICK_HZ * 2; i++) w.step();
    w.unpin("a", "NO_RUNNER");
    expect(measureVelocityPxPerSec(w, "a").y).toBeLessThan(20);
    w.destroy();
  });

  it("still bounces off a wall after being pinned and unpinned", () => {
    // Body.setStatic zeroes restitution and restores it from _original on
    // release. If that restore is missed, bounce silently stops working.
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 10 }, 400, 100,
      0, { ...VACUUM, gravityY: 980, bounce: 0.8 });
    w.pin("a", "FROZEN");
    w.unpin("a", "FROZEN");
    for (let i = 0; i < TICK_HZ * 3; i++) w.step();
    expect(w.readState("a", 1)!.y).toBeLessThan(560);
    w.destroy();
  });
});

describe("MatterWorld scale", () => {
  it("grows the collision shape so a scaled body rests higher", () => {
    const small = new MatterWorld(800, 600);
    small.addBody("a", { kind: "rectangle", width: 40, height: 40 }, 400, 100,
      0, { ...VACUUM, gravityY: 980 });
    for (let i = 0; i < TICK_HZ * 4; i++) small.step();
    const restSmall = small.readState("a", 1)!.y;
    small.destroy();

    const big = new MatterWorld(800, 600);
    big.addBody("a", { kind: "rectangle", width: 40, height: 40 }, 400, 100,
      0, { ...VACUUM, gravityY: 980 });
    big.setScale("a", 2, 2);
    for (let i = 0; i < TICK_HZ * 4; i++) big.step();
    const restBig = big.readState("a", 1)!.y;
    big.destroy();

    expect(restBig).toBeLessThan(restSmall - 15);
  });

  it("is idempotent when the scale does not change", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "rectangle", width: 40, height: 40 }, 400, 300,
      0, { ...VACUUM, collideBounds: false });
    w.setScale("a", 1.5, 1.5);
    const area = w.readState("a", 1)!;
    for (let i = 0; i < 20; i++) w.setScale("a", 1.5, 1.5);
    expect(w.readState("a", 1)).toEqual(area);
    w.destroy();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/compiler/renderer/physicsWorld.test.ts`
Expected: FAIL — pinned bodies still fall, `isPinned` always returns false.

- [ ] **Step 3: Implement**

Replace the `pin`, `unpin`, `isPinned` and `setScale` stubs:

```typescript
  pin(id: string, reason: PinReason): void {
    const rec = this.records.get(id);
    if (!rec) return;
    const wasPinned = rec.pinReasons.size > 0;
    rec.pinReasons.add(reason);
    if (!wasPinned) Matter.Body.setStatic(rec.body, true);
  }

  unpin(id: string, reason: PinReason): void {
    const rec = this.records.get(id);
    if (!rec) return;
    if (!rec.pinReasons.delete(reason)) return;
    if (rec.pinReasons.size > 0) return;
    // setStatic collapses positionPrev onto position, so the body resumes from
    // rest. Callers that want momentum carried across call setVelocity after.
    Matter.Body.setStatic(rec.body, false);
    Matter.Sleeping.set(rec.body, false);
  }

  isPinned(id: string): boolean {
    const rec = this.records.get(id);
    return rec ? rec.pinReasons.size > 0 : false;
  }

  setScale(id: string, sx: number, sy: number): void {
    const rec = this.records.get(id);
    if (!rec) return;
    const safeX = Math.abs(sx) < 1e-4 ? 1e-4 : Math.abs(sx);
    const safeY = Math.abs(sy) < 1e-4 ? 1e-4 : Math.abs(sy);
    if (safeX === rec.scaleX && safeY === rec.scaleY) return;
    Matter.Body.scale(rec.body, safeX / rec.scaleX, safeY / rec.scaleY);
    rec.scaleX = safeX;
    rec.scaleY = safeY;
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/compiler/renderer/physicsWorld.test.ts`
Expected: PASS, 0 skipped.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b --noEmit`
Expected: PASS with no output.

```bash
git add src/compiler/renderer/physicsWorld.ts src/compiler/renderer/physicsWorld.test.ts
git commit -m "feat(renderer): add reason-counted pinning and body scaling"
```

---

## Task 6: Culling

**Files:**
- Modify: `src/compiler/renderer/physicsWorld.ts`
- Modify: `src/compiler/renderer/physicsWorld.test.ts`

Spec §6.9. A `collideBounds: false` body that leaves the scene must be removed, not left
falling forever — and per §6.7 the check happens **before** freeze, so it is removed rather
than frozen into an invisible off-screen obstacle.

- [ ] **Step 1: Write the failing test**

Append:

```typescript
describe("MatterWorld culling", () => {
  it("reports only bodies past the margin", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("inside", { kind: "circle", radius: 10 }, 400, 300, 0, VACUUM);
    w.addBody("nearby", { kind: "circle", radius: 10 }, -400, 300, 0, VACUUM);
    w.addBody("gone", { kind: "circle", radius: 10 }, 400, 2400, 0, VACUUM);
    expect(w.idsOutsideBounds(800).sort()).toEqual(["gone"]);
    w.destroy();
  });

  it("reports nothing when the world is empty", () => {
    const w = new MatterWorld(800, 600);
    expect(w.idsOutsideBounds(800)).toEqual([]);
    w.destroy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/compiler/renderer/physicsWorld.test.ts`
Expected: FAIL — `expected [] to deeply equal [ 'gone' ]`.

- [ ] **Step 3: Implement**

Replace the `idsOutsideBounds` stub:

```typescript
  idsOutsideBounds(margin: number): string[] {
    const out: string[] = [];
    for (const [id, rec] of this.records) {
      const { x, y } = rec.body.position;
      if (x < -margin || y < -margin || x > this.width + margin || y > this.height + margin) {
        out.push(id);
      }
    }
    return out;
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/compiler/renderer/physicsWorld.test.ts`
Expected: PASS, all green.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/renderer/physicsWorld.ts src/compiler/renderer/physicsWorld.test.ts
git commit -m "feat(renderer): report bodies that have escaped the scene bounds"
```

---

## Task 7: Body geometry on the container

**Files:**
- Modify: `src/compiler/renderer/builder.ts`

Spec §6.5. `builder.ts` already knows each node's exact geometry, so deriving the collision
shape there is one line per branch instead of a second pass that re-guesses it.

This task also swaps `__physicsState` for the fields the new sync layer needs. Nothing reads
them yet, so the build stays green.

- [ ] **Step 1: Update the `declare module` block**

In `src/compiler/renderer/builder.ts`, replace the `__physicsState` entry (lines 21-23) and
add the new fields, so the block reads:

```typescript
declare module "pixi.js" {
  interface Container {
    __mareyLayout?: {
      localPivotX: number;
      localPivotY: number;
      currentPos: { x: number; y: number };
      currentScale: { x: number; y: number };
    };
    __updateLayout?: () => void;
    __animations?: ReadonlyArray<IRAnimation>;
    __startProps?: {
      position: { x: number; y: number };
      rotation: number;
      scale: { x: number; y: number };
      alpha: number;
    };
    __physics?: IRPhysics;
    /** Id of this container's body in the shared world, if it has one. */
    __body?: string;
    /** Exit velocity written by a `handOff` animation, in px/s. */
    __pendingVelocity?: { x: number; y: number };
    /** Collision shape, in local space with the origin at the bbox centre. */
    __bodyShape?: BodyGeometry;
    __sequences?: ReadonlyArray<IRSequence>;
    __baseSize?: { w: number; h: number };
    __kinematicPosAnimCount?: number;
  }
}
```

Add the type-only import at the top of the file — this project uses
`verbatimModuleSyntax`, so the `type` keyword is required:

```typescript
import type { BodyGeometry } from "./physicsWorld";
```

- [ ] **Step 2: Set `__bodyShape` in each branch**

`circle` — after `wrapper.__baseSize = ...`:

```typescript
      wrapper.__bodyShape = { kind: "circle", radius: props.radius };
```

`rectangle` — after `wrapper.__baseSize = ...`:

```typescript
      wrapper.__bodyShape = { kind: "rectangle", width: props.width, height: props.height };
```

`polygon` — after `wrapper.__baseSize = ...`. Points are re-expressed relative to the bbox
centre, because that is the origin `BodyGeometry` is defined in:

```typescript
      wrapper.__bodyShape = {
        kind: "polygon",
        points: props.points.map((p) => ({
          x: p.x - localPivot.x,
          y: p.y - localPivot.y,
        })),
      };
```

`line` — after `wrapper.__baseSize = ...`. A line has no area, and a horizontal or vertical
one has a degenerate bounding box, so inflate to at least `thickness` (spec §6.5). A
validator error replaces this in Phase 3:

```typescript
      wrapper.__bodyShape = {
        kind: "rectangle",
        width: Math.max(w, props.thickness),
        height: Math.max(h, props.thickness),
      };
```

`text` — after `wrapper.__baseSize = ...`:

```typescript
      wrapper.__bodyShape = {
        kind: "rectangle",
        width: textObj.width,
        height: textObj.height,
      };
```

`group` — replace `wrapper.__baseSize = { w: 0, h: 0 };` with a real measurement. Children
are already added at this point, so `getLocalBounds()` is meaningful:

```typescript
      const groupBounds = wrapper.getLocalBounds();
      wrapper.__baseSize = { w: groupBounds.width, h: groupBounds.height };
      wrapper.__bodyShape = {
        kind: "rectangle",
        width: Math.max(groupBounds.width, 1),
        height: Math.max(groupBounds.height, 1),
      };
```

- [ ] **Step 3: Remove the old `__physicsState` initialisation**

Delete these lines near the bottom of `buildNode`:

```typescript
  if (props.physics) {
    wrapper.__physicsState = {
      velocity: { x: props.physics.velocity.x, y: props.physics.velocity.y }
    };
  }
```

`wrapper.__physics = props.physics;` immediately above it **stays** — it is what the new
`hasPhysicsAnywhere` predicate reads.

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: FAIL, with errors in `adapter.ts` on `__physicsState`. Those are fixed in Task 9,
which is why Tasks 7-9 land as one commit. Confirm the errors are **only** in `adapter.ts`
and are **only** about `__physicsState`; anything else means a mistake in this task.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS. `physicsWorld.test.ts` does not touch `builder.ts`.

Do **not** commit yet — the tree does not compile. Tasks 7, 8 and 9 commit together at the
end of Task 9. Phase 0's execution notes record why: a commit that fails `tsc` breaks
`npm run build` and `git bisect`.

---

## Task 8: The sync layer

**Files:**
- Create: `src/compiler/renderer/physicsSync.ts`

Spec §6.2, §6.6. This is the only module where PixiJS containers and physics bodies meet.

- [ ] **Step 1: Write the module**

Create `src/compiler/renderer/physicsSync.ts`:

```typescript
import type { Container } from "pixi.js";
import type { IRPhysics, IRSequenceStep } from "../sceneIR";
import type { IPhysicsWorld, PhysicsParams, PinReason } from "./physicsWorld";

/** A container and the id of the body that represents it. */
export interface PhysicsBinding {
  readonly id: string;
  readonly container: Container;
}

/** How far outside the scene a body may drift before it is culled. */
export const CULL_MARGIN = 800;

function stepHasPhysics(step: IRSequenceStep): boolean {
  if ("type" in step && step.type === "parallel") {
    return step.steps.some((sub) => !("property" in sub));
  }
  return !("property" in step);
}

/**
 * Spec D13: a body exists only for an object that declares `physics` — either
 * directly, or in any step of any sequence it owns.
 *
 * The sequence case matters for D6. A `sequence { animate position …; physics … }`
 * needs its body to exist during the animate step, pinned static, so the object
 * shoves a pile on its way in rather than ghosting through it.
 */
export function hasPhysicsAnywhere(container: Container): boolean {
  if (container.__physics) return true;
  const sequences = container.__sequences;
  if (!sequences) return false;
  for (const seq of sequences) {
    for (const step of seq.steps) {
      if (stepHasPhysics(step)) return true;
    }
  }
  return false;
}

export function physicsParamsFromIR(ph: IRPhysics): PhysicsParams {
  return {
    gravityX: ph.gravity.x,
    gravityY: ph.gravity.y,
    airDrag: ph.airDrag,
    bounce: ph.bounce,
    collideBounds: ph.collideBounds,
  };
}

/** Physics defaults for a body whose runner has not started yet. */
const RESTING_PARAMS: PhysicsParams = {
  gravityX: 0,
  gravityY: 0,
  airDrag: 0,
  bounce: 0,
  collideBounds: true,
};

/**
 * Walk the scene tree, create a body for every qualifying container, and return
 * the bindings in tree order — which is what makes body ids deterministic.
 *
 * Every body starts pinned for NO_RUNNER. `spawnPhysics` releases it.
 */
export function bindPhysicsBodies(root: Container, world: IPhysicsWorld): PhysicsBinding[] {
  const bindings: PhysicsBinding[] = [];
  let nextId = 0;

  const visit = (container: Container): void => {
    if (hasPhysicsAnywhere(container) && container.__bodyShape && container.__mareyLayout) {
      const id = `b${nextId++}`;
      const layout = container.__mareyLayout;
      const params = container.__physics
        ? physicsParamsFromIR(container.__physics)
        : RESTING_PARAMS;

      world.addBody(
        id,
        container.__bodyShape,
        layout.currentPos.x,
        layout.currentPos.y,
        container.rotation,
        params
      );
      world.setScale(id, layout.currentScale.x, layout.currentScale.y);
      world.pin(id, "NO_RUNNER");

      container.__body = id;
      bindings.push({ id, container });
    }

    for (const child of container.children) {
      visit(child as Container);
    }
  };

  visit(root);
  return bindings;
}

export function pinBody(container: Container, world: IPhysicsWorld, reason: PinReason): void {
  if (container.__body) world.pin(container.__body, reason);
}

export function unpinBody(container: Container, world: IPhysicsWorld, reason: PinReason): void {
  if (container.__body) world.unpin(container.__body, reason);
}

/**
 * Paint phase: write body transforms onto containers.
 *
 * Pinned bodies are skipped — for them the flow is container → body, which is
 * what keeps a frozen object tracking a sibling animation instead of drifting
 * off its own collision shape (spec 6.6).
 */
export function syncWorldToContainers(
  bindings: ReadonlyArray<PhysicsBinding>,
  world: IPhysicsWorld,
  alpha: number
): void {
  for (const { id, container } of bindings) {
    if (world.isPinned(id)) continue;
    const state = world.readState(id, alpha);
    if (!state) continue;
    const layout = container.__mareyLayout;
    if (!layout) continue;
    layout.currentPos.x = state.x;
    layout.currentPos.y = state.y;
    container.rotation = state.angle;
    container.__updateLayout?.();
  }
}

/**
 * Remove bodies that have drifted far outside the scene, and hide the
 * containers that went with them.
 *
 * Runs before freeze (spec 6.7), so an escaped `collideBounds: false` body is
 * removed rather than frozen into an invisible off-screen obstacle.
 */
export function cullEscapedBodies(
  bindings: ReadonlyArray<PhysicsBinding>,
  world: IPhysicsWorld,
  margin: number
): void {
  const escaped = world.idsOutsideBounds(margin);
  if (escaped.length === 0) return;
  const gone = new Set(escaped);
  for (const { id, container } of bindings) {
    if (!gone.has(id)) continue;
    world.removeBody(id);
    container.__body = undefined;
    container.visible = false;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: still FAIL, and still only on `__physicsState` in `adapter.ts`. If
`physicsSync.ts` itself produces errors, fix them before moving on.

Still no commit — Task 9 closes the loop.

---

## Task 9: Rewire the adapter

**Files:**
- Modify: `src/compiler/renderer/adapter.ts`

This deletes `NativePhysicsEngine` and `IPhysicsEngine` and drives the shared world instead.

**Two things to be careful about.**

First, **tick-alignment**. `applyAnim` paints at the wall-clock-dependent `alpha`. Anything
that feeds the physics world must be computed at `alpha = 0` in the tick phase instead,
otherwise body positions become a function of frame rate and the determinism Phase 0 bought
is gone. That is why position, rotation and scale animations push to the world from
`advanceOneTick` rather than from `applyAnim`.

Second, **the tick/paint split** (Phase 0 execution notes). Completion side effects go in
`tickAnim`, never in `applyAnim`.

- [ ] **Step 1: Replace the imports and delete the old engine**

Replace lines 1-11 of `src/compiler/renderer/adapter.ts`:

```typescript
import { Application, Container, Graphics, Ticker } from "pixi.js";
import type { IRSceneNode, IRendererAdapter, IRAnimation, IRPhysics, IRSequence, IRPoint, IRParallelStep } from "../sceneIR";
import { buildNode } from "./builder";
import { LiveDriver, secondsToTicks } from "./clock";
import {
  advanceAnimTime,
  animProgress,
  advancePhysicsTime,
  type AnimTime,
  type PhysicsTime,
} from "./timeline";
import { MatterWorld, type IPhysicsWorld } from "./physicsWorld";
import {
  bindPhysicsBodies,
  cullEscapedBodies,
  pinBody,
  physicsParamsFromIR,
  syncWorldToContainers,
  unpinBody,
  CULL_MARGIN,
  type PhysicsBinding,
} from "./physicsSync";
```

`TICK_SECONDS` is gone from the import list because the only thing that used it was the
integrator being deleted.

Then delete two whole blocks:
- `export interface IPhysicsEngine { ... }` (lines 38-45)
- `export class NativePhysicsEngine implements IPhysicsEngine { ... }` (lines 47-131)

- [ ] **Step 2: Add a world handle the spawn helpers can reach**

The spawn helpers are module-level functions and are called from the sequence runner as well
as from setup, so threading the world through every signature is noisy. Add a module-level
handle just below the `SequenceRunner` interface:

```typescript
/**
 * The world for the scene currently being rendered. Module-level because
 * spawnAnim/spawnPhysics are reached from several call sites; there is only
 * ever one scene rendering at a time, and `render` resets it.
 */
let activeWorld: IPhysicsWorld | null = null;
```

- [ ] **Step 3: Rewrite `tickAnim`**

Replace the whole `tickAnim` function.

**Read this before writing it.** The old engine read `container.__physicsState.velocity`
live on every tick, so a `handOff` animation could write velocity at any time and the
integrator would pick it up. A Matter body owns its own velocity, so a write that lands
after the body is already moving has to be pushed into the world explicitly — and a write
that lands while the body is still pinned has to be parked until the last pin lifts.

This matters for the default scene. Its `launcher` declares `animate` and `physics` as
**siblings**, so `spawnPhysics` runs at tick 0, long before the animation completes. Park
the velocity and never push it and the HANDOFF check in Task 11 fails: the ball stops dead
and drops straight down.

```typescript
function tickAnim(ra: RunningAnim): boolean {
  const justCompleted = advanceAnimTime(ra.time);

  // Completion side effects are state, not paint, so they must happen on the
  // tick they occur — not once per rendered frame. Deferring them would let
  // physics skip ticks while a stale kinematic count is still set.
  if (justCompleted && ra.isPosAnim && ra.container.__mareyLayout) {
    ra.container.__kinematicPosAnimCount = Math.max(0, (ra.container.__kinematicPosAnimCount || 1) - 1);

    if (ra.anim.handOff && ra.anim.duration > 0) {
      const startPt = ra.startVal as IRPoint;
      const targetPt = ra.targetVal as IRPoint;
      const deriv = getEasingDerivativeAtEnd(ra.anim.easing);
      const durSec = Math.max(ra.anim.duration, 0.001);

      ra.container.__pendingVelocity = {
        x: ((targetPt.x - startPt.x) / durSec) * deriv,
        y: ((targetPt.y - startPt.y) / durSec) * deriv,
      };
    }

    if (activeWorld) {
      unpinBody(ra.container, activeWorld, "POS_ANIM");
      flushPendingVelocity(ra.container, activeWorld);
    }
  }

  return justCompleted;
}

/**
 * Push a parked velocity into the world, if the body is free to take one.
 *
 * A Matter body owns its velocity, and unpinning collapses it back to rest, so
 * the value can only be applied once the last pin has lifted. Until then it
 * waits on the container and whichever call releases the final pin flushes it.
 */
function flushPendingVelocity(container: Container, world: IPhysicsWorld): void {
  const id = container.__body;
  const pending = container.__pendingVelocity;
  if (!id || !pending || world.isPinned(id)) return;
  world.setVelocity(id, pending.x, pending.y);
  container.__pendingVelocity = undefined;
}
```

- [ ] **Step 4: Add the tick-aligned push from animations into the world**

Add this function immediately after `tickAnim`. It is the piece that keeps physics
deterministic while animations still paint smoothly:

```typescript
/**
 * Push an animation's tick-aligned value into the physics world.
 *
 * Evaluated at alpha 0 deliberately. `applyAnim` paints at the driver's
 * wall-clock alpha, and feeding that to the world would make body positions a
 * function of frame rate — which is exactly the determinism Phase 0 bought.
 * The cost is that during a position animation the drawn position leads the
 * collision shape by up to one tick.
 */
function pushAnimToWorld(ra: RunningAnim, world: IPhysicsWorld): void {
  const id = ra.container.__body;
  if (!id) return;

  const e = evaluateEasing(animProgress(ra.time, 0), ra.anim.easing);

  if (ra.anim.property === "position") {
    const startPt = ra.startVal as IRPoint;
    const targetPt = ra.targetVal as IRPoint;
    world.setPosition(id, lerp(startPt.x, targetPt.x, e), lerp(startPt.y, targetPt.y, e));
  } else if (ra.anim.property === "rotation") {
    const deg = lerp(ra.startVal as number, ra.targetVal as number, e);
    world.overrideAngle(id, deg * (Math.PI / 180));
  } else if (ra.anim.property === "scale") {
    const startPt = ra.startVal as IRPoint;
    const targetPt = ra.targetVal as IRPoint;
    world.setScale(id, lerp(startPt.x, targetPt.x, e), lerp(startPt.y, targetPt.y, e));
  }
}
```

- [ ] **Step 5: Rewrite `spawnAnim` and `spawnPhysics`**

Replace both functions:

```typescript
function spawnAnim(container: Container, anim: IRAnimation, globalList: RunningAnim[], localList: AnimOrPhysics[]) {
  const isPos = anim.property === "position";
  if (isPos) {
    container.__kinematicPosAnimCount = (container.__kinematicPosAnimCount || 0) + 1;
  }

  // A new runner attaching to this container thaws it (spec 6.7).
  if (activeWorld) {
    unpinBody(container, activeWorld, "FROZEN");
    if (isPos) pinBody(container, activeWorld, "POS_ANIM");
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

function spawnPhysics(container: Container, phIR: IRPhysics, globalList: PhysicsRunner[], localList: AnimOrPhysics[]) {
  container.__physics = phIR;

  const id = container.__body;
  if (id && activeWorld) {
    activeWorld.setParams(id, physicsParamsFromIR(phIR));

    // A handoff that already fired wins over the declared velocity.
    container.__pendingVelocity = {
      x: container.__pendingVelocity?.x ?? phIR.velocity.x,
      y: container.__pendingVelocity?.y ?? phIR.velocity.y,
    };

    // Unpin before flushing: setStatic(false) collapses the body back to rest,
    // so a velocity written first would be discarded. If another reason still
    // holds the pin — a position animation running alongside this physics
    // block — the velocity stays parked and tickAnim flushes it later.
    activeWorld.unpin(id, "FROZEN");
    activeWorld.unpin(id, "NO_RUNNER");
    flushPendingVelocity(container, activeWorld);
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

- [ ] **Step 6: Fix `collectData`**

It currently gates on the deleted `__physicsState`. Replace that condition:

```typescript
  if (container.__physics) {
    spawnPhysics(container, container.__physics, physicsRunners, nodePhysics);
  }
```

- [ ] **Step 7: Rewrite the runner setup and ticker callback**

Replace from `const runningAnims:` through the end of the `activeTickerCallback`
assignment:

```typescript
    const runningAnims:    RunningAnim[]    = [];
    const physicsRunners:  PhysicsRunner[]  = [];
    const sequenceRunners: SequenceRunner[] = [];

    const world = new MatterWorld(logicalWidth, logicalHeight);
    activeWorld = world;

    // Bodies exist before any runner does, so an object animating in during a
    // sequence is a pinned static obstacle rather than a ghost (spec D6, D13).
    const bindings: PhysicsBinding[] = bindPhysicsBodies(sceneRoot, world);

    collectData(sceneRoot, runningAnims, physicsRunners, sequenceRunners);

    const driver = new LiveDriver();

    // Advance the whole scene exactly one fixed tick. Everything that changes
    // scene state lives here and takes no time argument, so an export driver
    // can call it in a bare loop with no wall clock involved.
    function advanceOneTick(): void {
      for (let i = 0; i < runningAnims.length; i++) {
        tickAnim(runningAnims[i]);
      }

      // Animations own their properties; push the tick-aligned values into the
      // world before it steps, so physics never sees a wall-clock-derived value.
      for (let i = 0; i < runningAnims.length; i++) {
        pushAnimToWorld(runningAnims[i], world);
      }

      // Before freeze, so an escaped body is removed rather than frozen into
      // an invisible off-screen obstacle (spec 6.7).
      cullEscapedBodies(bindings, world, CULL_MARGIN);

      for (let i = 0; i < physicsRunners.length; i++) {
        const pr = physicsRunners[i];
        if (advancePhysicsTime(pr.time)) {
          pinBody(pr.container, world, "FROZEN");
        }
      }

      world.step();

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
        applyAnim(runningAnims[i], driver.alpha);
      }

      // Physics writes after animations, so a dynamic body's position wins over
      // a stale one. A body driven by a position animation is pinned, and
      // syncWorldToContainers skips pinned bodies, so the two never fight.
      syncWorldToContainers(bindings, world, driver.alpha);

      for (let i = runningAnims.length - 1; i >= 0; i--) {
        const ra = runningAnims[i];
        if (!ra.time.completed) continue;
        // A completed rotation animation hands the angle back to the solver.
        if (ra.anim.property === "rotation" && ra.container.__body) {
          world.overrideAngle(ra.container.__body, null);
        }
        runningAnims.splice(i, 1);
      }
      for (let i = physicsRunners.length - 1; i >= 0; i--) {
        if (physicsRunners[i].time.completed) physicsRunners.splice(i, 1);
      }
      for (let i = sequenceRunners.length - 1; i >= 0; i--) {
        if (sequenceRunners[i].state === "DONE") sequenceRunners.splice(i, 1);
      }

      // Physics runners are no longer part of the idle test: a
      // `duration: indefinitely` runner never completes, so it would pin the
      // ticker open forever. The world reports idle once every body is asleep
      // or pinned.
      if (runningAnims.length === 0 && sequenceRunners.length === 0 && world.isIdle()) {
        sharedApp?.ticker.stop();
      }
    };
```

- [ ] **Step 8: Tear the world down with the scene**

In the cleanup function returned by `render`, add the world teardown. Replace the returned
closure with:

```typescript
    return () => {
      resizeObserver.disconnect();
      world.destroy();
      if (activeWorld === world) activeWorld = null;
      if (sharedApp) {
        const oldChildren = sharedApp.stage.removeChildren();
        oldChildren.forEach(c => c.destroy({ children: true, texture: true }));

        if (activeTickerCallback) {
          sharedApp.ticker.remove(activeTickerCallback);
          activeTickerCallback = null;
        }
      }
    };
```

- [ ] **Step 9: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: PASS with no output.

If errors remain they will be leftover `__physicsState` reads or the now-unused
`TICK_SECONDS` import. There should be no reference to `NativePhysicsEngine` anywhere.

Run: `grep -rn "__physicsState\|NativePhysicsEngine\|IPhysicsEngine" src/`
Expected: no output.

- [ ] **Step 10: Run the tests**

Run: `npm test`
Expected: PASS, all suites green.

- [ ] **Step 11: Build**

Run: `npm run build`
Expected: PASS — `tsc -b` clean, then a Vite build with no errors.

- [ ] **Step 12: Commit Tasks 7, 8 and 9 together**

```bash
git add src/compiler/renderer/builder.ts src/compiler/renderer/physicsSync.ts src/compiler/renderer/adapter.ts
git commit -m "feat(renderer): replace NativePhysicsEngine with the shared Matter world

Objects now genuinely collide, tumble and settle. Bodies exist for any object
declaring physics directly or in a sequence, and are created up front so an
object animating in is a static obstacle rather than a ghost.

Animations push tick-aligned values into the world from the tick phase rather
than the paint phase, so body state never depends on the wall-clock alpha.

Landed as one commit because builder.ts, physicsSync.ts and adapter.ts do not
compile independently of each other."
```

---

## Task 10: Update the default scene's claim about collisions

**Files:**
- Modify: `src/store/defaultScene.ts:28-29`

The motion test card documents what correct behaviour looks like, and one of its statements
is now false.

- [ ] **Step 1: Rewrite the note**

Replace these two lines:

```
// Note: falling objects pass through each other and land in a heap.
// That is expected — objects do not yet collide with one another.
```

with:

```
// 6. COLLISION  the amber ball and the rose square share one physics
//               world. They collide with each other and with the
//               scene edges, and tumble on impact.
```

- [ ] **Step 2: Run the default scene test**

Run: `npx vitest run src/store/defaultScene.test.ts`
Expected: PASS. The change is inside a comment, so the scene still parses.

- [ ] **Step 3: Commit**

```bash
git add src/store/defaultScene.ts
git commit -m "docs(scene): the test card's objects now collide"
```

---

## Task 11: Verify in the browser

There is no automated visual harness. **Do not skip this** — Task 4's headless tests prove
the solver behaves, but nothing so far proves the sync layer writes to the right containers.

**Files:** none modified.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL.

- [ ] **Step 2: Check the five existing behaviours still hold**

The motion test card loads automatically. Its header comment states what to look for:

1. **EASING** — four dots leave together and arrive together, fanning apart in between.
2. **HANDOFF** — the amber ball slides up-right, then keeps its momentum into a falling
   arc. It must **not** stop dead and drop straight down. This is the conversion in spec
   §6.3: if it drops at half speed, `pxPerSecToMatter` is dividing by the wrong number.
3. **SEQUENCE** — the rose square spins, then grows while sliding, then falls.
4. **LOOP** — the rings breathe forever at different rates.
5. **STAGGER** — the bar wave ripples.

- [ ] **Step 3: Check the new behaviour**

The amber ball and the rose square now share a world. Confirm all of:

- The square **tumbles** when it lands, rather than staying axis-aligned. This is the first
  phase in which physics rotates anything.
- Neither object sinks through the floor or through the other.
- Neither object escapes the scene rectangle.
- The stagger bars, easing dots, rings and text labels are **not** colliders — the ball
  passes straight through them. That is spec D13.

- [ ] **Step 4: Check idling**

Replace the editor contents with:

```
scene {
  size: (800, 600)
  background: #080811
  circle ball {
    position: (400, 80)
    radius: 20
    color: #38bdf8
    physics {
      gravity: (0, 980)
      bounce: 0.6
      collideBounds: true
      duration: indefinitely
    }
  }
}
```

The ball should fall, bounce, settle — and then the ticker should **stop**. Confirm CPU
usage drops in the browser's task manager once it comes to rest.

This is the payoff from spec §6.4 and is new: today a `duration: indefinitely` runner never
completes, so the ticker runs forever. If CPU stays pinned, gravity is reaching
`body.force` somewhere and nothing is sleeping.

- [ ] **Step 5: Check that objects collide and stack**

Replace the editor contents with:

```
scene {
  size: (800, 600)
  background: #080811
  generate i from 0 to 4 {
    rectangle box {
      position: (400 + i * 6, 60 - i * 70)
      size: (52, 52)
      color: #38bdf8
      physics {
        gravity: (0, 900)
        bounce: 0.2
        collideBounds: true
        duration: indefinitely
      }
    }
  }
}
```

Five boxes should fall and form a pile, not a single overlapping heap. They should tumble
against each other and come to rest. This is the feature the whole phase exists to deliver.

- [ ] **Step 6: Check reproducibility**

Reload the page twice with the scene from Step 5 and watch where the pile settles. It should
settle identically every time.

- [ ] **Step 7: Check freeze**

Change `duration: indefinitely` to `duration: 2` in the Step 5 scene. The boxes should
freeze mid-fall after two seconds and stay exactly where they are — including in mid-air
(spec D5). They remain collidable, so nothing passes through them.

- [ ] **Step 8: Commit the plan completion**

```bash
git commit --allow-empty -m "chore: phase 1 verified — shared Matter world complete"
```

---

## Done when

- `npm test` passes, including every conversion assertion in `physicsWorld.test.ts`.
- `npm run build` succeeds.
- All checks in Task 11 pass.
- `grep -rn "__physicsState\|NativePhysicsEngine\|IPhysicsEngine" src/` returns nothing.
- `grep -c "pixi" src/compiler/renderer/physicsWorld.ts` returns `0` (spec D9).
- `matter-js` is pinned to `0.20.0` in `package.json` with no caret (spec §12).

---

## Execution notes

Eight things changed during execution. Three were defects in this plan, three were bugs in
the implementation found by review, and two are gaps left open deliberately.

### Defects in this plan

**The `Sleeping.update` type augmentation was missing (Task 1).** The augmentation block
listed `Common._baseDelta`, `Common._seed`, `Body.deltaTime` and `Engine.pairs`, but
`@types/matter-js` also omits `Sleeping.update` and `Sleeping.afterCollisions`, both of
which §6.4 calls directly. `Common._seed` also has to be declared `let`, not `const`,
because the constructor assigns it.

**`Vertices.hull` does not accept plain points (Task 3).** It is typed
`(vertices: Vertex[]) => Vertex[]`, and `Vertex` requires `index`, `body` and `isInternal`.
Reading `../matter-js-master/src/geometry/Vertices.js` shows it only ever touches `.x` and
`.y`, so the signature is an inaccuracy in the types rather than a real requirement. Landed
as a documented `as Matter.Vertex[]` assertion at the one call site.

**Two of Task 4's tests were wrong, and the centroid offset was subtly wrong (Task 4).**
`measureVelocityPxPerSec` steps the world itself, so looping `TICK_HZ` times before calling
it measured tick 121, not 120 — the gravity assertion was off by exactly one tick of
acceleration (`988.17 = 980 + 980/120`) and the drag assertion by exactly one tick of
damping. At tick 120 both matched their oracles to ten significant digits, which is the
strongest evidence available that the corrected §6.3 conversions are right. Separately, the
plan's `addBody` computed `offset = -centroid`, assuming the incoming geometry's local
origin already *is* the bbox centre; it now derives the bbox centre from the hull, which is
what §6.9 actually specifies and what makes the offset non-zero for a real triangle.

The "wakes a sleeping body" test also sampled `isIdle()` at one arbitrary instant, by which
point the pile had already re-slept. It now samples a new `isAsleep(id)` accessor across the
whole window, which asserts the D14 property directly instead of inferring it.

### Bugs found by review, after the implementation was green

All three lived in `adapter.ts` — the one file with no test coverage. That is not a
coincidence; see the gaps below.

**A parked handoff velocity could be orphaned.** `flushPendingVelocity` was called after
unpinning in `tickAnim` and `spawnPhysics` but not in `spawnAnim`, which also unpins
`FROZEN`. A velocity parked while a body held two pin reasons was silently dropped if
`spawnAnim` happened to release the last one. Fixed by moving the flush inside
`unpinBody`, so no call site can forget it, and routing `spawnPhysics` through `unpinBody`
rather than unpinning the world directly.

**`overrideAngle` destroyed its own interpolation buffer.** It applied `Body.setAngle`
immediately, and `pushAnimToWorld` calls it from `advanceOneTick` *before* `world.step()` —
so by the time `step()` captured `prevAngle` from `body.angle`, that field already held the
current tick's target. `prevAngle === body.angle` every tick, and `readState`'s lerp
returned a constant. Animated rotation on a physics body snapped once per tick, defeating
the previous-state buffer §6.9 added specifically to close the judder deferred out of
Phase 0. `overrideAngle` now only records; `step()`'s existing post-solver loop applies it,
after the buffer is captured. Every existing test in `physicsWorld.test.ts` read at alpha 0
or 1, which is exactly why this was invisible — there is now one that reads at 0.5.

**The rotation-override release ran in the paint phase.** `overrideAngle(id, null)` sat in
the ticker's splice loop rather than in `tickAnim`. Since `advanceOneTick` runs up to 12
times per rendered frame and `step()` re-applies the override on each, a body stayed
angle-locked for up to ~9 ticks past the end of its animation under a catch-up burst. This
is the same tick/paint-split mistake the Phase 0 plan made and its notes warn about.

### Gaps left open deliberately

**Task 11's browser verification ran, and found a bug.** It was initially skipped for want
of a browser driver; Playwright plus headless Chromium was added afterwards and packaged as
the `visual-check` harness in `tools/`. Every check passed except one, and that one
mattered.

A body frozen by `duration` expiry rendered to one of two different pixel results depending
on the page load — reproducible with a *single box and no contacts at all*, frozen in free
fall. `syncWorldToContainers` skips pinned bodies and freezing pins, so a frozen object kept
the position it was last *painted* at, and that paint used the driver's wall-clock `alpha`.
It therefore settled up to one tick of motion away from where the simulation actually
stopped it, varying per run. Fixed in `f9de4a9` by snapping the container to the body's
tick-aligned state at the moment of the freeze; the probe scene is now byte-identical across
six independent page loads.

None of the 94 headless tests could have caught this: it lives entirely in the relationship
between the tick phase, the paint phase, and a real wall clock.

Two lessons worth carrying into later phases, both recorded in the skill:

- Reading canvas pixels in-page returns blank, because PixiJS does not set
  `preserveDrawingBuffer`. Screenshot from the driver instead. An in-page pixel read will
  confidently report a working scene as blank — it did, and cost time.
- **"Identical at rest" is a weak determinism check for a scene that settles.** A pile
  converges on the same fixed point even when the trajectory diverged. Testing a trajectory
  needs a scene that freezes mid-motion, which is how the bug above surfaced after four
  settling scenes had all reported clean.

**High-refresh smoothness was confirmed by eye**, which a screenshot cannot settle. A scene
running an animation-driven marker and a physics-driven marker down parallel lanes past
fixed posts — the animated one being the control, since animations have always interpolated
between ticks — showed no difference between them. That closes the judder issue the Phase 0
execution notes deferred into this phase.

The reviewing display's refresh rate was not recorded. The check is only meaningful on one
whose refresh does not divide 120Hz evenly (144Hz, 90Hz), because at 60 or 120 it looks
correct whether or not the interpolation works. If judder is ever reported on an odd-refresh
display, re-run it rather than trusting this line.

The sync layer also turned out to be headlessly testable after all — every import in
`physicsSync.ts` is `import type`, so it has no runtime dependency on PixiJS and now has 29
tests against a fake world.

**`adapter.ts` still has no tests**, and all three review findings were there. Testing it
needs a DOM and a PixiJS `Application`, which is out of scope here. The orchestration worth
covering is `pushAnimToWorld`, `flushPendingVelocity` (now covered, having moved into
`physicsSync.ts`), the pin lifecycle across `spawnAnim`/`spawnPhysics`/`tickAnim`, and the
`FROZEN` pin firing off `advancePhysicsTime`. Phase 3 builds a test harness; this belongs
with it.

**One unconfirmed risk, inherited rather than introduced.** `sharedApp` and the new
`activeWorld` are module-level singletons, and `render()` has `await` points before it
assigns `activeWorld`. Two renders dispatched in quick succession could in principle
interleave, leaving the module-level spawn helpers writing to a different world than the one
their closure steps. The unconditional stage teardown that makes this possible predates this
branch, and `activeWorld` follows the existing pattern rather than adding a new one. Not
reproduced; recorded so it is not rediscovered.
