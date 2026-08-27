import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { SceneRuntime } from "./sceneRuntime";
import { TICK_HZ } from "./clock";
import type {
  IPhysicsWorld, BodyGeometry, BodyState, PhysicsParams, PinReason,
} from "./physicsWorld";
import type { IRAnimation, IRPhysics } from "../sceneIR";

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
    return p ? { x: p.x, y: p.y, angle: 0 } : null;
  }
  idsOutsideBounds(_margin: number): string[] { return []; }
  isIdle(): boolean { return this.idle; }
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
    easing: "linear",
    loop: false,
    yoyo: false,
    handOff: false,
    ...over,
  };
}

/**
 * A minimal container carrying the `__`-prefixed runtime fields the runtime
 * reads. Built by hand rather than through `buildNode` so each test states
 * exactly the state it depends on.
 */
function makeContainer(over: {
  animations?: IRAnimation[];
  physics?: IRPhysics;
  position?: { x: number; y: number };
} = {}): Container {
  const c = new Container();
  const pos = over.position ?? { x: 0, y: 0 };
  c.__declareLayout = {
    localPivotX: 0,
    localPivotY: 0,
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
  c.__sequences = [];
  c.__physics = over.physics;
  c.__kinematicPosAnimCount = 0;
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

  it("releases a rotation override on the completion tick even under a catch-up burst", () => {
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
    expect(c.__declareLayout!.currentPos.x).toBeCloseTo((200 * 1.75) / TICK_HZ, 6);
  });

  it("parks a handOff velocity on the completion tick and flushes it when the last pin lifts", () => {
    const c = makeContainer({
      animations: [anim({ handOff: true, easing: "linear" })],
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
