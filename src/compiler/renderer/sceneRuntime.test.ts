import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { SceneRuntime } from "./sceneRuntime";
import { TICK_HZ } from "./clock";
import { MatterWorld } from "./physicsWorld";
import type {
  IPhysicsWorld, BodyGeometry, BodyState, PhysicsParams, PinReason,
} from "./physicsWorld";
import type { IRAnimation, IRPhysics, IRSequence } from "../sceneIR";

/**
 * A world that records what it was told rather than simulating.
 *
 * The point of these tests is the *orchestration* — which call happens on
 * which tick, and in which phase. Real physics would only add noise.
 */
class RecordingWorld implements IPhysicsWorld {
  readonly calls: string[] = [];
  readonly pins = new Map<string, Set<PinReason>>();
  readonly positions = new Map<string, { x: number; y: number }>();
  readonly velocities = new Map<string, { x: number; y: number }>();
  readonly angleOverrides = new Map<string, number | null>();
  /** Test helper: the angle `readState` reports, so a body can be turned. */
  readonly angles = new Map<string, number>();
  idle = false;

  addBody(id: string, _g: BodyGeometry, x: number, y: number, _a: number, _p: PhysicsParams): void {
    this.pins.set(id, new Set());
    this.positions.set(id, { x, y });
    this.calls.push(`addBody:${id}`);
  }
  removeBody(id: string): void { this.calls.push(`removeBody:${id}`); }
  hasBody(id: string): boolean { return this.pins.has(id); }
  setParams(id: string, _p: PhysicsParams): void { this.calls.push(`setParams:${id}`); }
  pin(id: string, reason: PinReason): void {
    this.pins.get(id)?.add(reason);
    this.calls.push(`pin:${id}:${reason}`);
  }
  unpin(id: string, reason: PinReason): void {
    this.pins.get(id)?.delete(reason);
    this.calls.push(`unpin:${id}:${reason}`);
  }
  isPinned(id: string): boolean { return (this.pins.get(id)?.size ?? 0) > 0; }
  setPosition(id: string, x: number, y: number): void {
    this.positions.set(id, { x, y });
    this.calls.push(`setPosition:${id}:${x.toFixed(4)},${y.toFixed(4)}`);
  }
  setVelocity(id: string, vx: number, vy: number): void {
    this.velocities.set(id, { x: vx, y: vy });
    this.calls.push(`setVelocity:${id}:${vx.toFixed(4)},${vy.toFixed(4)}`);
  }
  setScale(id: string, sx: number, sy: number): void {
    this.calls.push(`setScale:${id}:${sx.toFixed(4)},${sy.toFixed(4)}`);
  }
  overrideAngle(id: string, radians: number | null): void {
    this.angleOverrides.set(id, radians);
    this.calls.push(`overrideAngle:${id}:${radians === null ? "null" : radians.toFixed(4)}`);
  }
  step(): void { this.calls.push("step"); }
  readState(id: string, _alpha: number): BodyState | null {
    const p = this.positions.get(id);
    return p ? { x: p.x, y: p.y, angle: this.angles.get(id) ?? 0 } : null;
  }
  idsOutsideBounds(_margin: number): string[] { return []; }
  isIdle(): boolean { return this.idle; }
  boundsOf(_id: string): null { return null; }
  isAsleep(_id: string): boolean { return false; }
  destroy(): void { this.calls.push("destroy"); }
}

const PHYSICS: IRPhysics = {
  velocity: { x: 0, y: 0 },
  gravity: { x: 0, y: 980 },
  airDrag: 0,
  bounce: 0.65,
  collideBounds: true,
  duration: 1,
};

function anim(over: Partial<IRAnimation> = {}): IRAnimation {
  return {
    property: "position",
    to: { x: 200, y: 0 },
    duration: 1,
    delay: 0,
    easing: "linear",
    loop: false,
    yoyo: false,
    handoff: false,
    ...over,
  };
}

/** animate to 120 over 6 ticks, then to 240 over 30, then simulate. */
const TWO_STEP_SEQUENCE: IRSequence = {
  steps: [
    { ...anim({ to: { x: 120, y: 0 }, duration: 6 / TICK_HZ }) },
    { ...anim({ to: { x: 240, y: 0 }, duration: 30 / TICK_HZ }) },
    { ...PHYSICS, duration: "indefinitely" },
  ],
};

/**
 * A minimal container carrying the `__`-prefixed runtime fields the runtime
 * reads. Built by hand rather than through `buildNode` so each test states
 * exactly the state it depends on.
 */
function makeContainer(over: {
  animations?: IRAnimation[];
  physics?: IRPhysics;
  sequence?: IRSequence;
  position?: { x: number; y: number };
  /**
   * The pivot-to-bbox-centre vector `origin` produces, `(0, 0)` at the default
   * origin — which is why every pre-origin caller leaves it out.
   */
  centreOffset?: { x: number; y: number };
} = {}): Container {
  const c = new Container();
  const pos = over.position ?? { x: 0, y: 0 };
  const off = over.centreOffset ?? { x: 0, y: 0 };
  c.__mareyLayout = {
    localPivotX: 0,
    localPivotY: 0,
    centreOffsetX: off.x,
    centreOffsetY: off.y,
    currentPos: { x: pos.x, y: pos.y },
    currentScale: { x: 1, y: 1 },
  };
  c.__updateLayout = () => {};
  c.__startProps = {
    position: { x: pos.x, y: pos.y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    alpha: 1,
  };
  c.__animations = over.animations ?? [];
  c.__sequences = over.sequence ? [over.sequence] : [];
  c.__physics = over.physics;
  c.__bodyShape = { kind: "circle", radius: 10 };
  return c;
}

function makeRoot(child: Container): Container {
  const root = new Container();
  root.addChild(child);
  return root;
}

describe("SceneRuntime · tick phase", () => {
  it("advances an animation by exactly one tick per advanceOneTick", () => {
    const c = makeContainer({ animations: [anim({ property: "alpha", to: 0 })] });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));

    rt.advanceOneTick();
    rt.paint(0);
    expect(c.alpha).toBeCloseTo(1 - 1 / TICK_HZ, 6);

    rt.advanceOneTick();
    rt.paint(0);
    expect(c.alpha).toBeCloseTo(1 - 2 / TICK_HZ, 6);
  });

  it("holds the visual state during a delay, in real tick-converted seconds, then starts on schedule", () => {
    // Exercises the full source-to-runtime wiring this task adds: the
    // contract's `delay` (seconds) threaded through builder.ts into
    // IRAnimation.delay, then converted to AnimTime.delayTicks by
    // sceneRuntime.ts's spawnAnim -- not just timeline.ts's pure functions,
    // which are covered directly by timeline.test.ts.
    const delayTicks = 2;
    const c = makeContainer({
      animations: [anim({ property: "alpha", to: 0, delay: delayTicks / TICK_HZ })],
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));

    rt.advanceOneTick();
    rt.paint(0);
    expect(c.alpha).toBe(1);

    rt.advanceOneTick();
    rt.paint(0);
    expect(c.alpha).toBe(1);

    // Delay spent; behaves exactly like the undelayed case above, offset by
    // the two ticks just spent.
    rt.advanceOneTick();
    rt.paint(0);
    expect(c.alpha).toBeCloseTo(1 - 1 / TICK_HZ, 6);
  });

  it("pins POS_ANIM at spawn and releases it on the completion tick, not on paint", () => {
    const c = makeContainer({ animations: [anim()], physics: PHYSICS });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;

    expect(world.pins.get(id)!.has("POS_ANIM")).toBe(true);

    // duration 1s at 120Hz completes on tick 120. Nothing may release it early,
    // and no paint call is made at all in this loop.
    for (let i = 0; i < TICK_HZ - 1; i++) rt.advanceOneTick();
    expect(world.pins.get(id)!.has("POS_ANIM")).toBe(true);

    rt.advanceOneTick();
    expect(world.pins.get(id)!.has("POS_ANIM")).toBe(false);
  });

  it("releases a rotation override on the completion tick, not in the paint phase", () => {
    // Phase 1 bug 3: the release lived in the paint-phase splice loop, so a
    // frame that advanced several ticks kept re-applying the override for ticks
    // after the animation had finished.
    const c = makeContainer({
      animations: [anim({ property: "rotation", to: 180 })],
      physics: PHYSICS,
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;

    // Burst of 12 ticks per "frame", which is LiveDriver's catch-up ceiling.
    let ticks = 0;
    while (ticks < TICK_HZ + 12) {
      for (let i = 0; i < 12; i++) { rt.advanceOneTick(); ticks++; }
      rt.paint(0.5);
    }

    // The release fires at tick 120, not at the end of the burst containing it.
    //
    // Note this asserts only WHEN the release fires. Whether it *sticks* is a
    // separate question, and today it does not — `pushAnimToWorld` re-arms the
    // override on the same tick. Task 3 fixes that and asserts it.
    const releaseIndex = world.calls.indexOf(`overrideAngle:${id}:null`);
    expect(releaseIndex).toBeGreaterThan(-1);
    const stepsBefore = world.calls.slice(0, releaseIndex).filter((c2) => c2 === "step").length;
    expect(stepsBefore).toBe(TICK_HZ - 1);
  });

  it("feeds the world the tick-aligned value, never an alpha-interpolated one", () => {
    // Invariant 3. pushAnimToWorld evaluates at alpha 0 so the simulation is not
    // a function of frame rate. A linear 1s animation from x=0 to x=200 has moved
    // 200 * (1/120) after one tick.
    const c = makeContainer({ animations: [anim()], physics: PHYSICS });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;

    rt.advanceOneTick();
    rt.paint(0.75);

    expect(world.positions.get(id)!.x).toBeCloseTo(200 / TICK_HZ, 6);
    // The painted position leads it by up to one tick — that is the documented cost.
    expect(c.__mareyLayout!.currentPos.x).toBeCloseTo((200 * 1.75) / TICK_HZ, 6);
  });

  it("parks a handoff velocity on the completion tick and flushes it when the last pin lifts", () => {
    const c = makeContainer({
      animations: [anim({ handoff: true, easing: "linear" })],
      physics: PHYSICS,
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;

    for (let i = 0; i < TICK_HZ; i++) rt.advanceOneTick();

    // linear hands off at average speed: 200px over 1s.
    expect(world.velocities.get(id)).toEqual({ x: 200, y: 0 });
  });

  it("pins FROZEN when a physics duration expires", () => {
    const c = makeContainer({ physics: { ...PHYSICS, duration: 1 } });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;

    expect(world.pins.get(id)!.has("FROZEN")).toBe(false);
    for (let i = 0; i < TICK_HZ; i++) rt.advanceOneTick();
    expect(world.pins.get(id)!.has("FROZEN")).toBe(true);
  });

  it("leaves the angle released after a rotation animation finishes", () => {
    // The release must STICK. tickAnim nulls the override on the completion
    // tick, but pushAnimToWorld runs straight after over the same not-yet-
    // spliced list, so a naive ordering re-arms it — and since the runner is
    // spliced in the paint phase, nothing would ever clear it again. The body
    // would hold the animation's final angle for the rest of the scene.
    const c = makeContainer({
      animations: [anim({ property: "rotation", to: 180 })],
      physics: { ...PHYSICS, duration: "indefinitely" },
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;

    for (let i = 0; i < TICK_HZ; i++) rt.advanceOneTick();
    rt.paint(1);
    expect(world.angleOverrides.get(id)).toBeNull();

    // And it stays released on later ticks, with the runner spliced away.
    for (let i = 0; i < 10; i++) rt.advanceOneTick();
    rt.paint(1);
    expect(world.angleOverrides.get(id)).toBeNull();
  });

  it("stops pushing a completed position animation for the rest of a burst", () => {
    // Defect B. LiveDriver advances up to 12 ticks in one frame, so an
    // animation that finishes early in a burst keeps re-teleporting its body
    // to the endpoint for every remaining tick — and how many that is depends
    // on the wall clock, which makes the simulation frame-rate dependent.
    //
    // The completion tick's own push is kept deliberately: it is what leaves
    // the body exactly at the target rather than one tick short.
    const c = makeContainer({
      animations: [anim({ duration: 6 / TICK_HZ, to: { x: 200, y: 0 } })],
      physics: { ...PHYSICS, duration: "indefinitely" },
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));

    for (let i = 0; i < 12; i++) rt.advanceOneTick();
    rt.paint(1);

    const pushes = world.calls.filter((s) => s.startsWith("setPosition:"));
    expect(pushes).toHaveLength(6);
    // The last one is the completion tick, and it lands exactly on target.
    expect(pushes[5]).toBe("setPosition:b0:200.0000,0.0000");
  });

  it("stops pushing a completed scale animation, but lands its final value", () => {
    // The other half of the asymmetry. Without this, hoisting the rotation
    // guard to the top of pushAnimToWorld — the exact "simplify it back into a
    // bug" move — leaves the scale regression green.
    const c = makeContainer({
      animations: [anim({ property: "scale", duration: 6 / TICK_HZ, to: { x: 2, y: 2 } })],
      physics: { ...PHYSICS, duration: "indefinitely" },
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));

    for (let i = 0; i < 12; i++) rt.advanceOneTick();
    rt.paint(1);

    // bindPhysicsBodies emits one setScale at bind time; drop it.
    const pushes = world.calls.filter((s) => s.startsWith("setScale:")).slice(1);
    expect(pushes).toHaveLength(6);
    expect(pushes[5]).toBe("setScale:b0:2.0000,2.0000");
  });

  it("releases the POS_ANIM hold on the tick a non-looping yoyo completes", () => {
    // P3A-10. The return leg is part of the runtime, so the hold lifts at
    // 2 x duration — and it does lift, which it never did before this phase.
    const c = makeContainer({
      animations: [anim({ duration: 6 / TICK_HZ, yoyo: true })],
      physics: { ...PHYSICS, duration: "indefinitely" },
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;

    for (let i = 0; i < 11; i++) rt.advanceOneTick();
    expect(world.pins.get(id)!.has("POS_ANIM")).toBe(true);

    rt.advanceOneTick();
    expect(world.pins.get(id)!.has("POS_ANIM")).toBe(false);
  });

  it("releases a rotation override when a rotation yoyo completes, and leaves it released", () => {
    // Same rotation-override family as the test above, on the path this task
    // opens: before it, a rotation yoyo never completed, so the latch was never
    // cleared at all.
    const c = makeContainer({
      animations: [anim({ property: "rotation", to: 180, duration: 6 / TICK_HZ, yoyo: true })],
      physics: { ...PHYSICS, duration: "indefinitely" },
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;

    for (let i = 0; i < 11; i++) rt.advanceOneTick();
    expect(world.angleOverrides.get(id)).not.toBeNull();

    // Checked before any paint() call: if the release ever moved into the
    // paint phase (invariant 2), this would still be non-null here and only
    // clear once paint ran below — the same class of bug as the sibling test
    // above, "not in the paint phase".
    rt.advanceOneTick();
    expect(world.angleOverrides.get(id)).toBeNull();

    rt.paint(1);
    expect(world.angleOverrides.get(id)).toBeNull();

    // And it stays released once the runner has been spliced.
    for (let i = 0; i < 10; i++) rt.advanceOneTick();
    rt.paint(1);
    expect(world.angleOverrides.get(id)).toBeNull();
  });

  it("hands a yoyo off from its target back toward its start, not outward", () => {
    // The exit velocity of a non-looping yoyo is the direction of its RETURN
    // leg. The plain-handoff test above pins the same displacement, duration and
    // easing with the opposite sign, so a blanket negation would fail there.
    const c = makeContainer({
      animations: [anim({ yoyo: true, handoff: true, easing: "linear" })],
      physics: { ...PHYSICS, duration: "indefinitely" },
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;

    // Nothing is handed off part-way through: the outbound leg is not an end.
    for (let i = 0; i < 2 * TICK_HZ - 1; i++) rt.advanceOneTick();
    expect(world.velocities.get(id)).toBeUndefined();

    rt.advanceOneTick();
    expect(world.velocities.get(id)).toEqual({ x: -200, y: 0 });
  });

  it("lets a real body fall again once a position yoyo completes", () => {
    // The lifecycle claim end to end, against the real solver rather than the
    // recorder: a completed yoyo hands the body back, and it resumes gravity.
    const c = makeContainer({
      position: { x: 400, y: 100 },
      animations: [anim({ to: { x: 400, y: 160 }, duration: 12 / TICK_HZ, easing: "linear", yoyo: true })],
      physics: { ...PHYSICS, duration: "indefinitely" },
    });
    const world = new MatterWorld(800, 600);
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;

    // 12 ticks out, 12 back. One short of that the animation still owns the
    // body — it sits one linear tick from home, and gravity has moved it none.
    for (let i = 0; i < 23; i++) rt.advanceOneTick();
    expect(world.isPinned(id)).toBe(true);
    expect(world.readState(id, 1)!.y).toBeCloseTo(105, 4);

    rt.advanceOneTick();
    expect(world.isPinned(id)).toBe(false);

    // Half a second of 980px/s^2 is ~122px. Pinned, it would not have moved.
    for (let i = 0; i < 60; i++) rt.advanceOneTick();
    expect(world.readState(id, 1)!.y).toBeGreaterThan(180);
    rt.destroy();
  });

  it("snaps a frozen container to the body's tick-aligned state, not its painted one", () => {
    // Without this the container keeps whatever position it was last PAINTED
    // at, which used the driver's wall-clock alpha — so a frozen object settles
    // a varying distance from where the simulation actually stopped it.
    const c = makeContainer({ physics: { ...PHYSICS, duration: 1 } });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;

    world.positions.set(id, { x: 777, y: 555 });
    c.__mareyLayout!.currentPos.x = -1;
    c.__mareyLayout!.currentPos.y = -1;

    for (let i = 0; i < TICK_HZ; i++) rt.advanceOneTick();

    expect(c.__mareyLayout!.currentPos).toEqual({ x: 777, y: 555 });
  });
});

/**
 * The fifth container→body handoff (docs/architecture/renderer.md).
 *
 * A 40x20 rectangle with `origin: (0.5, 1)` has its pivot on its bottom edge,
 * so `position` places that edge — but Matter places a body at its CENTRE OF
 * MASS, 10px above. `centreOffsetY: -10` is that vector, pointing up.
 */
const BOTTOM_ORIGIN = { x: 0, y: -10 };

/** Every `setPosition` the world was told, in order. */
function positionPushes(world: RecordingWorld): string[] {
  return world.calls.filter((s) => s.startsWith("setPosition:"));
}

describe("SceneRuntime · origin through the physics seam", () => {
  it("moves a bottom-origin body's centre as its scale animation grows it", () => {
    // A 40x20 rect standing on y = 500, origin (0.5, 1), growing 1x -> 3x in y.
    // At scale 1 its centre is 10 above the baseline; at scale 3, 30 above.
    //
    // PixiJS scales a container about its PIVOT, Matter scales a body about the
    // body's own CENTRE, so `setScale` alone leaves the collision shape behind
    // during exactly the "grow from a baseline" idiom this phase exists for.
    const c = makeContainer({
      position: { x: 100, y: 500 },
      centreOffset: BOTTOM_ORIGIN,
      animations: [anim({ property: "scale", to: { x: 1, y: 3 }, duration: 2 / TICK_HZ })],
      physics: { ...PHYSICS, duration: "indefinitely" },
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));

    // Bound at its centre: 500 - 10.
    expect(world.positions.get(c.__body!)).toEqual({ x: 100, y: 490 });

    rt.advanceOneTick();
    rt.advanceOneTick();

    expect(world.positions.get(c.__body!)!.y).toBeCloseTo(470, 6);
    // Half-way there on the tick in between, not in one jump at the end.
    expect(positionPushes(world)).toEqual([
      "setPosition:b0:100.0000,480.0000",
      "setPosition:b0:100.0000,470.0000",
    ]);
  });

  it("does not move a default-origin body's centre when its scale animates", () => {
    // The test that protects every existing scene: with the pivot already on
    // the centre the offset is exactly (0, 0), so a scale animation must still
    // push NO position at all, and the call sequence stays byte-identical.
    const c = makeContainer({
      position: { x: 100, y: 500 },
      animations: [anim({ property: "scale", to: { x: 1, y: 3 }, duration: 2 / TICK_HZ })],
      physics: { ...PHYSICS, duration: "indefinitely" },
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));

    rt.advanceOneTick();
    rt.advanceOneTick();

    expect(positionPushes(world)).toEqual([]);
  });

  it("pushes a bottom-origin body's centre during a position animation, not its origin point", () => {
    // The position branch lerps PIVOT-relative endpoints, so it owes the world
    // the same correction the bind path makes.
    const c = makeContainer({
      position: { x: 100, y: 500 },
      centreOffset: BOTTOM_ORIGIN,
      animations: [anim({ to: { x: 140, y: 500 }, duration: 2 / TICK_HZ })],
      physics: { ...PHYSICS, duration: "indefinitely" },
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));

    rt.advanceOneTick();
    rt.advanceOneTick();

    expect(positionPushes(world)).toEqual([
      "setPosition:b0:120.0000,490.0000",
      "setPosition:b0:140.0000,490.0000",
    ]);
  });

  it("rotates a position push's offset by the body's angle, not the container's", () => {
    // The position branch's half of the same question the scale branch answers
    // below. A position-animated body is pinned, so `syncWorldToContainers`
    // skips it and `container.rotation` is written only by `applyAnim` — at the
    // driver's wall-clock alpha, which invariant 3 forbids feeding the world.
    //
    // Turned a quarter turn, "10px above the pivot" points along +x, so each
    // push sits 10px to the RIGHT of the pivot rather than 10px above it.
    // Taking the container's rotation of 0 would give (120, 490)/(140, 490).
    const c = makeContainer({
      position: { x: 100, y: 500 },
      centreOffset: BOTTOM_ORIGIN,
      animations: [anim({ to: { x: 140, y: 500 }, duration: 2 / TICK_HZ })],
      physics: { ...PHYSICS, duration: "indefinitely" },
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    world.angles.set(c.__body!, Math.PI / 2);

    rt.advanceOneTick();
    rt.advanceOneTick();

    const pushes = positionPushes(world).map((s) => s.split(":")[2].split(",").map(Number));
    expect(pushes).toHaveLength(2);
    expect(pushes[0][0]).toBeCloseTo(130, 6);
    expect(pushes[0][1]).toBeCloseTo(500, 6);
    expect(pushes[1][0]).toBeCloseTo(150, 6);
    expect(pushes[1][1]).toBeCloseTo(500, 6);
  });

  it("offsets a position push by the concurrent scale animation's own lerped value", () => {
    // Two runners on one container. The offset scales with the object, so the
    // position branch needs the scale — and `layout.currentScale` is written by
    // `applyAnim` at the driver's wall-clock alpha, which is precisely the value
    // invariant 3 forbids feeding the world. It must use the scale runner's own
    // alpha-0 lerp instead.
    //
    // It also decides which branch owns the placement: the position branch
    // already pushes an absolute centre with the offset in it, so a
    // scale-driven delta on top would count the offset twice — and which of the
    // two ran first would decide the answer, since runners push in spawn order.
    const c = makeContainer({
      position: { x: 100, y: 500 },
      centreOffset: BOTTOM_ORIGIN,
      animations: [
        anim({ to: { x: 140, y: 500 }, duration: 2 / TICK_HZ }),
        anim({ property: "scale", to: { x: 1, y: 3 }, duration: 2 / TICK_HZ }),
      ],
      physics: { ...PHYSICS, duration: "indefinitely" },
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));

    rt.advanceOneTick();
    rt.advanceOneTick();

    // Tick 1: pivot 120, scale y 2, so the centre is 20 above it.
    // Tick 2: pivot 140, scale y 3, so the centre is 30 above it.
    // Reading the painted `currentScale` would give 490 on tick 1; letting the
    // scale branch add its delta as well would append two more pushes.
    expect(positionPushes(world)).toEqual([
      "setPosition:b0:120.0000,480.0000",
      "setPosition:b0:140.0000,470.0000",
    ]);
  });

  it("resumes the scale branch from where the position branch left the centre", () => {
    // The handover, by VALUE rather than by count. A position animation ending
    // part-way through a longer scale animation hands the placement back, and
    // the scale branch continues with a ONE-TICK delta — so the scale it last
    // told the world has to keep advancing during the ticks it was suppressed.
    // Carrying the spawn scale across instead replays the whole growth so far
    // on the first tick after the handover, which no call count can see.
    //
    // The invariant the sequence encodes: the body's centre is the pivot plus
    // the offset at this tick's scale, on every tick and through both branches.
    const c = makeContainer({
      position: { x: 100, y: 500 },
      centreOffset: BOTTOM_ORIGIN,
      animations: [
        anim({ to: { x: 140, y: 500 }, duration: 2 / TICK_HZ }),
        anim({ property: "scale", to: { x: 1, y: 3 }, duration: 4 / TICK_HZ }),
      ],
      physics: { ...PHYSICS, duration: "indefinitely" },
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));

    for (let i = 0; i < 4; i++) rt.advanceOneTick();

    // Ticks 1-2 are the position branch, at scale y 1.5 then 2. Ticks 3-4 are
    // the scale branch alone, at 2.5 then 3, with the pivot parked at 140.
    expect(positionPushes(world)).toEqual([
      "setPosition:b0:120.0000,485.0000",
      "setPosition:b0:140.0000,480.0000",
      "setPosition:b0:140.0000,475.0000",
      "setPosition:b0:140.0000,470.0000",
    ]);
  });

  it("corrects the centre once per body when two scale animations run on it", () => {
    // Nothing rejects two `animate scale` blocks on one object — builder.ts
    // `.filter`s animations where it `.find`s physics (validator.ts:229) — and
    // a `parallel` step may carry two as well. Both spawn, both push
    // `setScale`, and the LAST one is the scale the body actually carries.
    //
    // The centre correction is therefore a property of the body, not of the
    // runner: one delta per tick, from the runner that owns the scale. A delta
    // per runner sums them, and the collider walks off the drawing by the
    // amount the losing animation contributed.
    //
    // The invariant every row below encodes: the body's centre is 500 plus the
    // offset at whatever scale the world ends up holding that tick.
    const c = makeContainer({
      position: { x: 100, y: 500 },
      centreOffset: BOTTOM_ORIGIN,
      animations: [
        anim({ property: "scale", to: { x: 1, y: 2 }, duration: 4 / TICK_HZ }),
        anim({ property: "scale", to: { x: 1, y: 3 }, duration: 2 / TICK_HZ }),
      ],
      physics: { ...PHYSICS, duration: "indefinitely" },
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));

    for (let i = 0; i < 4; i++) rt.advanceOneTick();

    // Ticks 1-2 the short runner is last and owns the scale (y 2, then 3).
    // It completes on tick 2 and is still pushing there, so it still owns it —
    // handing ownership to the live runner on its completion tick would
    // disagree with the `setScale` the body just took.
    // Ticks 3-4 the long runner owns it alone (y 1.75, then 2), and resumes
    // from 3 rather than from its own last value, so the centre tracks the
    // shrink back.
    expect(positionPushes(world)).toEqual([
      "setPosition:b0:100.0000,480.0000",
      "setPosition:b0:100.0000,470.0000",
      "setPosition:b0:100.0000,482.5000",
      "setPosition:b0:100.0000,480.0000",
    ]);
  });

  it("rotates the offset by the body's tick-aligned angle, not the container's", () => {
    // A free body owns its own angle, and `container.rotation` only catches up
    // in the PAINT phase, at the driver's alpha (`syncWorldToContainers`). The
    // body's angle read at alpha 1 is the tick-aligned one.
    //
    // Turned a quarter turn, "10px above the pivot" points along +x instead, so
    // growing 1x -> 3x in y walks the centre 20px to the RIGHT rather than 20px
    // up. Using the container's rotation of 0 would give (100, 470).
    const c = makeContainer({
      position: { x: 100, y: 500 },
      centreOffset: BOTTOM_ORIGIN,
      animations: [anim({ property: "scale", to: { x: 1, y: 3 }, duration: 2 / TICK_HZ })],
      physics: { ...PHYSICS, duration: "indefinitely" },
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    world.angles.set(c.__body!, Math.PI / 2);

    rt.advanceOneTick();
    rt.advanceOneTick();

    const last = world.positions.get(c.__body!)!;
    expect(last.x).toBeCloseTo(120, 6);
    expect(last.y).toBeCloseTo(490, 6);
  });
});

describe("SceneRuntime · paint phase", () => {
  it("splices completed runners so isIdle can become true", () => {
    const c = makeContainer({ animations: [anim({ property: "alpha", to: 0 })] });
    const world = new RecordingWorld();
    world.idle = true;
    const rt = new SceneRuntime(world, makeRoot(c));

    expect(rt.isIdle()).toBe(false);
    for (let i = 0; i < TICK_HZ; i++) rt.advanceOneTick();
    expect(rt.isIdle()).toBe(false); // not spliced until paint
    rt.paint(1);
    expect(rt.isIdle()).toBe(true);
  });

  it("splices a completed yoyo, so a scene of yoyos can go idle and stop the ticker", () => {
    // The consequence LANGUAGE.md used to warn about: a non-looping yoyo held
    // the runner list open forever, so `isIdle()` never passed and the ticker
    // never stopped.
    const c = makeContainer({
      animations: [anim({ property: "alpha", to: 0, duration: 6 / TICK_HZ, yoyo: true })],
    });
    const world = new RecordingWorld();
    world.idle = true;
    const rt = new SceneRuntime(world, makeRoot(c));

    expect(rt.isIdle()).toBe(false);
    for (let i = 0; i < 12; i++) rt.advanceOneTick();
    expect(rt.isIdle()).toBe(false); // not spliced until paint
    rt.paint(0);
    expect(rt.isIdle()).toBe(true);
    // And it rests on its exact starting value, not one tick short of it.
    expect(c.alpha).toBe(1);
  });

  it("reports not idle while the world says a body is still moving", () => {
    const c = makeContainer({ physics: { ...PHYSICS, duration: "indefinitely" } });
    const world = new RecordingWorld();
    world.idle = false;
    const rt = new SceneRuntime(world, makeRoot(c));

    rt.advanceOneTick();
    rt.paint(1);
    expect(rt.isIdle()).toBe(false);
  });
});

/**
 * Frame pacing must not change what the physics world is told.
 *
 * Three separate defects in this phase have been "a wall-clock-derived value
 * reached the world", and none of them involved `driver.alpha` directly, which
 * is why reading invariant 3 literally did not prevent any of them. This runs a
 * scene at two very different frame pacings for an identical number of ticks
 * and requires the world to see the identical call sequence.
 */
const SEQUENCE_SUBJECT = (): Container => makeContainer({ sequence: TWO_STEP_SEQUENCE });

/**
 * A non-looping yoyo that completes on tick 10 — six ticks into a 7-tick frame
 * and ten into a 12-tick one, so the completion lands *inside* a burst rather
 * than on its last tick, which is the case that hides a burst-length defect.
 */
const YOYO_SUBJECT = (): Container =>
  makeContainer({
    position: { x: 400, y: 300 },
    animations: [
      anim({ to: { x: 420, y: 300 }, duration: 5 / TICK_HZ, easing: "linear", yoyo: true, handoff: true }),
    ],
    physics: { ...PHYSICS, duration: "indefinitely" },
  });

/**
 * A bottom-origin object growing from its baseline while its body is free.
 *
 * The scale branch pushed nothing into the world before this phase, so its new
 * `setPosition` needs its own pacing check. It is also the case that exposes
 * `layout.currentScale`: the paint phase writes it at the driver's alpha, so a
 * branch that read it instead of its own alpha-0 lerp would diverge here.
 * Twenty ticks, so the completion lands mid-burst at both pacings.
 */
const BOTTOM_ORIGIN_SCALE_SUBJECT = (): Container =>
  makeContainer({
    position: { x: 400, y: 300 },
    centreOffset: BOTTOM_ORIGIN,
    animations: [
      anim({ property: "scale", to: { x: 1, y: 3 }, duration: 20 / TICK_HZ, easing: "easeInOut" }),
    ],
    physics: { ...PHYSICS, duration: "indefinitely" },
  });

/**
 * The same object with a position animation over it, ending first.
 *
 * Covers the handover: while the position runner is alive it owns the
 * placement and reads the scale runner's alpha-0 lerp; once it completes the
 * scale branch takes over with its own delta.
 */
const BOTTOM_ORIGIN_BOTH_SUBJECT = (): Container =>
  makeContainer({
    position: { x: 400, y: 300 },
    centreOffset: BOTTOM_ORIGIN,
    animations: [
      anim({ to: { x: 460, y: 300 }, duration: 10 / TICK_HZ, easing: "easeInOut" }),
      anim({ property: "scale", to: { x: 1, y: 3 }, duration: 30 / TICK_HZ, easing: "easeInOut" }),
    ],
    physics: { ...PHYSICS, duration: "indefinitely" },
  });

function runAtPacing(
  ticksPerFrame: number,
  totalTicks: number,
  makeSubject: () => Container = SEQUENCE_SUBJECT
): string[] {
  const c = makeSubject();
  const world = new RecordingWorld();
  const rt = new SceneRuntime(world, makeRoot(c));
  let done = 0;
  while (done < totalTicks) {
    const n = Math.min(ticksPerFrame, totalTicks - done);
    for (let i = 0; i < n; i++) rt.advanceOneTick();
    // A deliberately awkward alpha: 0 and 1 are the two values that hide this.
    rt.paint(0.5);
    done += n;
  }
  return world.calls;
}

describe("SceneRuntime · frame pacing must not reach the world", () => {
  it("sends the world the same calls at 1 tick per frame as at 7", () => {
    expect(runAtPacing(7, 40)).toEqual(runAtPacing(1, 40));
  });

  it("sends the same calls at 12 ticks per frame — LiveDriver's catch-up ceiling", () => {
    expect(runAtPacing(12, 60)).toEqual(runAtPacing(1, 60));
  });

  it("sends the same calls at 7 ticks per frame as at 1 when a yoyo completes mid-burst", () => {
    // A yoyo that completes is new in this phase, and completion is exactly the
    // shape defect B took: the runner is not spliced until paint, so every tick
    // of the burst after it must still be a no-op for the world.
    expect(runAtPacing(7, 40, YOYO_SUBJECT)).toEqual(runAtPacing(1, 40, YOYO_SUBJECT));
  });

  it("sends the same calls at 12 ticks per frame when a yoyo completes mid-burst", () => {
    expect(runAtPacing(12, 40, YOYO_SUBJECT)).toEqual(runAtPacing(1, 40, YOYO_SUBJECT));
  });

  it("completes the paced yoyo on tick 10, inside a burst rather than at its end", () => {
    // Guards the harness itself: if the completion drifted onto the last tick
    // of every burst, the two tests above would pass without exercising the
    // stale-push window at all.
    const calls = runAtPacing(1, 40, YOYO_SUBJECT);
    const handoff = calls.indexOf("setVelocity:b0:-480.0000,0.0000");
    expect(handoff).toBeGreaterThan(-1);
    const ticksBefore = calls.slice(0, handoff).filter((s) => s === "step").length;
    expect(ticksBefore).toBe(9);

    // And it stops pushing after it completes: 10 pushes, not 40.
    expect(calls.filter((s) => s.startsWith("setPosition:"))).toHaveLength(10);
  });

  it("sends the same calls at 7 ticks per frame while a bottom-origin object grows", () => {
    expect(runAtPacing(7, 40, BOTTOM_ORIGIN_SCALE_SUBJECT))
      .toEqual(runAtPacing(1, 40, BOTTOM_ORIGIN_SCALE_SUBJECT));
  });

  it("sends the same calls at 12 ticks per frame while a bottom-origin object grows", () => {
    expect(runAtPacing(12, 40, BOTTOM_ORIGIN_SCALE_SUBJECT))
      .toEqual(runAtPacing(1, 40, BOTTOM_ORIGIN_SCALE_SUBJECT));
  });

  it("sends the same calls at 7 and 12 ticks per frame across the position-to-scale handover", () => {
    expect(runAtPacing(7, 40, BOTTOM_ORIGIN_BOTH_SUBJECT))
      .toEqual(runAtPacing(1, 40, BOTTOM_ORIGIN_BOTH_SUBJECT));
    expect(runAtPacing(12, 40, BOTTOM_ORIGIN_BOTH_SUBJECT))
      .toEqual(runAtPacing(1, 40, BOTTOM_ORIGIN_BOTH_SUBJECT));
  });

  it("actually pushes positions from both origin subjects, so the pacing checks are not vacuous", () => {
    // Guards the harness: at the default origin the scale branch pushes nothing
    // at all, so a subject that lost its offset would make the four comparisons
    // above agree on an empty set of position calls.
    const scaleOnly = runAtPacing(1, 40, BOTTOM_ORIGIN_SCALE_SUBJECT)
      .filter((s) => s.startsWith("setPosition:"));
    // One per tick of the 20-tick animation, then silence.
    expect(scaleOnly).toHaveLength(20);

    const both = runAtPacing(1, 40, BOTTOM_ORIGIN_BOTH_SUBJECT)
      .filter((s) => s.startsWith("setPosition:"));
    // Ten from the position runner, then twenty more from the scale runner
    // alone — the handover, not one branch doing all the work.
    expect(both).toHaveLength(30);
  });

  it("freezes a growing bottom-origin object at the same place at every pacing", () => {
    // The freeze snap's own pivot correction scales with the object, so it
    // needs a tick-aligned scale like everything else in the tick phase.
    // Reading `layout.currentScale` there takes whatever `applyAnim` last wrote
    // at the driver's alpha, and the frozen object lands a frame-rate-dependent
    // distance from its baseline — defeating the exact determinism the snap
    // exists to provide.
    //
    // Every other pacing subject in this file uses `duration: "indefinitely"`,
    // so none of them ever reaches `snapContainerToBody` at all. This one
    // freezes on tick 10, half way through a 20-tick growth.
    const frozenPivot = (ticksPerFrame: number): { x: number; y: number } => {
      const c = makeContainer({
        position: { x: 400, y: 300 },
        centreOffset: BOTTOM_ORIGIN,
        animations: [
          anim({ property: "scale", to: { x: 1, y: 3 }, duration: 20 / TICK_HZ, easing: "easeInOut" }),
        ],
        physics: { ...PHYSICS, duration: 10 / TICK_HZ },
      });
      const world = new RecordingWorld();
      const rt = new SceneRuntime(world, makeRoot(c));
      let done = 0;
      while (done < 20) {
        const n = Math.min(ticksPerFrame, 20 - done);
        for (let i = 0; i < n; i++) rt.advanceOneTick();
        rt.paint(0.5);
        done += n;
      }
      // A pinned body is skipped by the paint-phase sync, so this is still the
      // value the snap wrote on tick 10.
      return { x: c.__mareyLayout!.currentPos.x, y: c.__mareyLayout!.currentPos.y };
    };

    // The baseline does not move: at tick 10 the object is at scale y 2, its
    // centre 20px above the pivot, and the pivot is still exactly where the
    // object was placed.
    expect(frozenPivot(1).y).toBeCloseTo(300, 6);
    // 12 is the harder pacing here: no paint has happened at all before the
    // freeze, so `currentScale` is still the untouched build-time value.
    expect(frozenPivot(7)).toEqual(frozenPivot(1));
    expect(frozenPivot(12)).toEqual(frozenPivot(1));
  });

  it("starts a sequence's second animation from the first one's exact target", () => {
    // The specific mechanism: the second animation's startVal is read from
    // container state that the paint phase last wrote at the driver's alpha.
    const calls = runAtPacing(7, 40);
    const positions = calls.filter((s) => s.startsWith("setPosition:"));
    const firstTargetIndex = positions.indexOf("setPosition:b0:120.0000,0.0000");
    expect(firstTargetIndex).toBeGreaterThan(-1);
    // Whatever comes next must continue from 120, not jump back toward 0.
    const next = positions[firstTargetIndex + 1];
    const x = Number(next.split(":")[2].split(",")[0]);
    expect(x).toBeGreaterThanOrEqual(120);
  });
});
