import { describe, it, expect } from "vitest";
import type { Container } from "pixi.js";
import type { IRPhysics, IRSequence, IRAnimation } from "../sceneIR";
import type { BodyGeometry, BodyState, IPhysicsWorld, PhysicsParams, PinReason } from "./physicsWorld";
import {
  bindPhysicsBodies,
  cullEscapedBodies,
  flushPendingVelocity,
  hasPhysicsAnywhere,
  physicsParamsFromIR,
  pinBody,
  syncWorldToContainers,
  unpinBody,
  type PhysicsBinding,
} from "./physicsSync";

/**
 * Records every call so tests can assert on them, and implements every method
 * of `IPhysicsWorld` so the compiler catches drift against the real interface.
 */
class FakeWorld implements IPhysicsWorld {
  readonly addCalls: Array<{
    id: string;
    geometry: BodyGeometry;
    x: number;
    y: number;
    angle: number;
    params: PhysicsParams;
  }> = [];
  readonly removeCalls: string[] = [];
  readonly scaleCalls: Array<{ id: string; sx: number; sy: number }> = [];
  readonly pinCalls: Array<{ id: string; reason: PinReason }> = [];
  readonly velocityCalls: Array<{ id: string; vx: number; vy: number }> = [];

  private readonly bodies = new Map<string, { pinned: Set<PinReason> }>();
  private readonly states = new Map<string, BodyState | null>();
  private outside: string[] = [];

  addBody(
    id: string,
    geometry: BodyGeometry,
    x: number,
    y: number,
    angle: number,
    params: PhysicsParams
  ): void {
    this.addCalls.push({ id, geometry, x, y, angle, params });
    this.bodies.set(id, { pinned: new Set() });
  }

  removeBody(id: string): void {
    this.removeCalls.push(id);
    this.bodies.delete(id);
    this.states.delete(id);
  }

  hasBody(id: string): boolean {
    return this.bodies.has(id);
  }

  setParams(_id: string, _params: PhysicsParams): void {
    // Not exercised by physicsSync.
  }

  pin(id: string, reason: PinReason): void {
    this.pinCalls.push({ id, reason });
    this.bodies.get(id)?.pinned.add(reason);
  }

  unpin(id: string, reason: PinReason): void {
    this.bodies.get(id)?.pinned.delete(reason);
  }

  isPinned(id: string): boolean {
    return (this.bodies.get(id)?.pinned.size ?? 0) > 0;
  }

  setPosition(_id: string, _x: number, _y: number): void {
    // Not exercised by physicsSync.
  }

  setVelocity(id: string, vx: number, vy: number): void {
    this.velocityCalls.push({ id, vx, vy });
  }

  setScale(id: string, sx: number, sy: number): void {
    this.scaleCalls.push({ id, sx, sy });
  }

  overrideAngle(_id: string, _radians: number | null): void {
    // Not exercised by physicsSync.
  }

  step(): void {
    // Not exercised by physicsSync.
  }

  readState(id: string, _alpha: number): BodyState | null {
    return this.states.has(id) ? (this.states.get(id) ?? null) : null;
  }

  idsOutsideBounds(_margin: number): string[] {
    return this.outside;
  }

  isIdle(): boolean {
    return true;
  }

  isAsleep(_id: string): boolean {
    return false;
  }

  destroy(): void {
    // Not exercised by physicsSync.
  }

  /** Test helper: what `readState` should return for a given id. */
  setState(id: string, state: BodyState | null): void {
    this.states.set(id, state);
  }

  /** Test helper: what `idsOutsideBounds` should report. */
  setOutside(ids: string[]): void {
    this.outside = ids;
  }
}

/**
 * Plain-object stand-in for a `Container`, carrying only the `__`-prefixed
 * fields `physicsSync.ts` reads. Kept as its own type so the factory below is
 * the single place that crosses into `Container` — everywhere else in this
 * file works with `MockContainer` directly.
 */
interface MockContainer {
  __physics?: IRPhysics;
  __sequences?: ReadonlyArray<IRSequence>;
  __bodyShape?: BodyGeometry;
  __declareLayout?: {
    localPivotX: number;
    localPivotY: number;
    currentPos: { x: number; y: number };
    currentScale: { x: number; y: number };
  };
  __body?: string;
  __pendingVelocity?: { x: number; y: number };
  __updateLayout?: () => void;
  rotation: number;
  visible: boolean;
  children: MockContainer[];
  /** Test helper: bumped by the default `__updateLayout` stub. */
  updateLayoutCalls: number;
}

function makeContainer(overrides: Partial<MockContainer> = {}): MockContainer {
  const c: MockContainer = {
    rotation: 0,
    visible: true,
    children: [],
    updateLayoutCalls: 0,
    ...overrides,
  };
  if (!overrides.__updateLayout) {
    c.__updateLayout = () => {
      c.updateLayoutCalls++;
    };
  }
  return c;
}

const SHAPE: BodyGeometry = { kind: "circle", radius: 10 };

function layoutAt(x: number, y: number, sx = 1, sy = 1) {
  return {
    localPivotX: 0,
    localPivotY: 0,
    currentPos: { x, y },
    currentScale: { x: sx, y: sy },
  };
}

const PHYSICS: IRPhysics = {
  velocity: { x: 0, y: 0 },
  gravity: { x: 0, y: 500 },
  airDrag: 0.1,
  bounce: 0.5,
  collideBounds: true,
  duration: "indefinitely",
};

const ANIMATION: IRAnimation = {
  property: "position",
  to: { x: 10, y: 10 },
  duration: 1,
  easing: "linear",
  loop: false,
  yoyo: false,
  handOff: false,
};

/** The single documented boundary crossing into the real `Container` type. */
function asContainer(c: MockContainer): Container {
  return c as unknown as Container;
}

describe("hasPhysicsAnywhere", () => {
  it("qualifies an object with a direct physics block", () => {
    const c = makeContainer({ __physics: PHYSICS });
    expect(hasPhysicsAnywhere(asContainer(c))).toBe(true);
  });

  it("qualifies an object whose sequence has a physics step, even with nothing physical at scene start", () => {
    // This is what lets an object animate in as a solid obstacle and only
    // then start falling: nothing at t=0 says "physical" except the sequence.
    const seq: IRSequence = { steps: [ANIMATION, PHYSICS] };
    const c = makeContainer({ __sequences: [seq] });
    expect(hasPhysicsAnywhere(asContainer(c))).toBe(true);
  });

  it("qualifies an object whose sequence has a physics step nested inside a parallel step", () => {
    const seq: IRSequence = {
      steps: [{ type: "parallel", steps: [ANIMATION, PHYSICS] }],
    };
    const c = makeContainer({ __sequences: [seq] });
    expect(hasPhysicsAnywhere(asContainer(c))).toBe(true);
  });

  it("does not qualify an object with only animate blocks", () => {
    const seq: IRSequence = { steps: [ANIMATION] };
    const c = makeContainer({ __sequences: [seq] });
    expect(hasPhysicsAnywhere(asContainer(c))).toBe(false);
  });

  it("does not qualify an object with an empty sequence", () => {
    // Keeps decorative labels and bars from silently becoming colliders.
    const c = makeContainer({ __sequences: [{ steps: [] }] });
    expect(hasPhysicsAnywhere(asContainer(c))).toBe(false);
  });

  it("does not qualify a plain object with neither physics nor sequences", () => {
    const c = makeContainer();
    expect(hasPhysicsAnywhere(asContainer(c))).toBe(false);
  });
});

describe("bindPhysicsBodies", () => {
  it("creates a body only for qualifying containers, walking nested children", () => {
    const grandchild = makeContainer({
      __physics: PHYSICS,
      __bodyShape: SHAPE,
      __declareLayout: layoutAt(1, 1),
    });
    const decorativeChild = makeContainer(); // no physics anywhere
    const child = makeContainer({
      __physics: PHYSICS,
      __bodyShape: SHAPE,
      __declareLayout: layoutAt(2, 2),
      children: [grandchild, decorativeChild],
    });
    const root = makeContainer({ children: [child] });

    const world = new FakeWorld();
    const bindings = bindPhysicsBodies(asContainer(root), world);

    expect(bindings).toHaveLength(2);
    expect(world.addCalls).toHaveLength(2);
    expect(world.addCalls.map((c) => c.id)).toEqual(["b0", "b1"]);
  });

  it("assigns ids in deterministic tree order", () => {
    // Determinism is the property the whole phase rests on: two runs over the
    // same tree must produce the same ids in the same order.
    const first = makeContainer({ __physics: PHYSICS, __bodyShape: SHAPE, __declareLayout: layoutAt(0, 0) });
    const second = makeContainer({ __physics: PHYSICS, __bodyShape: SHAPE, __declareLayout: layoutAt(0, 0) });
    const thirdNested = makeContainer({ __physics: PHYSICS, __bodyShape: SHAPE, __declareLayout: layoutAt(0, 0) });
    const secondsChild = makeContainer({ children: [thirdNested] });
    const root = makeContainer({ children: [first, second, secondsChild] });

    const world = new FakeWorld();
    const bindings = bindPhysicsBodies(asContainer(root), world);

    expect(bindings.map((b) => b.id)).toEqual(["b0", "b1", "b2"]);
    expect(bindings[0].container).toBe(asContainer(first));
    expect(bindings[1].container).toBe(asContainer(second));
    expect(bindings[2].container).toBe(asContainer(thirdNested));
  });

  it("sets container.__body to the assigned id", () => {
    const c = makeContainer({ __physics: PHYSICS, __bodyShape: SHAPE, __declareLayout: layoutAt(5, 5) });
    bindPhysicsBodies(asContainer(c), new FakeWorld());
    expect(c.__body).toBe("b0");
  });

  it("pins every new body with NO_RUNNER, since no runner has started yet", () => {
    const c = makeContainer({ __physics: PHYSICS, __bodyShape: SHAPE, __declareLayout: layoutAt(5, 5) });
    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(c), world);
    expect(world.pinCalls).toEqual([{ id: "b0", reason: "NO_RUNNER" }]);
    expect(world.isPinned("b0")).toBe(true);
  });

  it("passes the container's current position, rotation and scale through", () => {
    const c = makeContainer({
      __physics: PHYSICS,
      __bodyShape: SHAPE,
      __declareLayout: layoutAt(123, 456, 2, 3),
      rotation: 1.5,
    });
    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(c), world);

    expect(world.addCalls[0]).toMatchObject({ x: 123, y: 456, angle: 1.5, geometry: SHAPE });
    expect(world.scaleCalls).toEqual([{ id: "b0", sx: 2, sy: 3 }]);
  });

  it("skips a qualifying container that has no __bodyShape, rather than throwing", () => {
    const c = makeContainer({ __physics: PHYSICS, __declareLayout: layoutAt(0, 0) });
    const world = new FakeWorld();
    expect(() => bindPhysicsBodies(asContainer(c), world)).not.toThrow();
    expect(world.addCalls).toHaveLength(0);
    expect(c.__body).toBeUndefined();
  });

  it("skips a qualifying container that has no __declareLayout, rather than throwing", () => {
    const c = makeContainer({ __physics: PHYSICS, __bodyShape: SHAPE });
    const world = new FakeWorld();
    expect(() => bindPhysicsBodies(asContainer(c), world)).not.toThrow();
    expect(world.addCalls).toHaveLength(0);
    expect(c.__body).toBeUndefined();
  });

  it("uses resting params (no motion) for a container whose physics comes only from a sequence", () => {
    // At bind time, before any runner starts, an object that only becomes
    // physical partway through its sequence must not fall immediately.
    const seq: IRSequence = { steps: [ANIMATION, PHYSICS] };
    const c = makeContainer({ __sequences: [seq], __bodyShape: SHAPE, __declareLayout: layoutAt(0, 0) });
    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(c), world);
    expect(world.addCalls[0].params).toEqual({
      gravityX: 0,
      gravityY: 0,
      airDrag: 0,
      bounce: 0,
      collideBounds: true,
    });
  });
});

describe("syncWorldToContainers", () => {
  it("writes position and rotation onto an unpinned body's container and calls __updateLayout", () => {
    const c = makeContainer({ __declareLayout: layoutAt(0, 0), __body: "b0" });
    const world = new FakeWorld();
    world.addBody("b0", SHAPE, 0, 0, 0, physicsParamsFromIR(PHYSICS));
    world.setState("b0", { x: 42, y: 84, angle: 0.3 });

    const bindings: PhysicsBinding[] = [{ id: "b0", container: asContainer(c) }];
    syncWorldToContainers(bindings, world, 1);

    expect(c.__declareLayout!.currentPos).toEqual({ x: 42, y: 84 });
    expect(c.rotation).toBe(0.3);
    expect(c.updateLayoutCalls).toBe(1);
  });

  it("skips a pinned body entirely, since the flow for it is container to body", () => {
    const c = makeContainer({ __declareLayout: layoutAt(1, 2), __body: "b0", rotation: 0.1 });
    const world = new FakeWorld();
    world.addBody("b0", SHAPE, 1, 2, 0.1, physicsParamsFromIR(PHYSICS));
    world.pin("b0", "POS_ANIM");
    world.setState("b0", { x: 999, y: 999, angle: 9 });

    const bindings: PhysicsBinding[] = [{ id: "b0", container: asContainer(c) }];
    syncWorldToContainers(bindings, world, 1);

    expect(c.__declareLayout!.currentPos).toEqual({ x: 1, y: 2 });
    expect(c.rotation).toBe(0.1);
    expect(c.updateLayoutCalls).toBe(0);
  });

  it("tolerates readState returning null for a culled body without throwing", () => {
    const c = makeContainer({ __declareLayout: layoutAt(5, 5), __body: "b0" });
    const world = new FakeWorld();
    world.addBody("b0", SHAPE, 5, 5, 0, physicsParamsFromIR(PHYSICS));
    world.setState("b0", null);

    const bindings: PhysicsBinding[] = [{ id: "b0", container: asContainer(c) }];
    expect(() => syncWorldToContainers(bindings, world, 1)).not.toThrow();
    expect(c.__declareLayout!.currentPos).toEqual({ x: 5, y: 5 });
    expect(c.updateLayoutCalls).toBe(0);
  });
});

describe("cullEscapedBodies", () => {
  it("removes the escaped body from the world, clears __body, and hides the container", () => {
    const escaped = makeContainer({ __body: "b1" });
    const world = new FakeWorld();
    world.addBody("b1", SHAPE, 0, 0, 0, physicsParamsFromIR(PHYSICS));
    world.setOutside(["b1"]);

    const bindings: PhysicsBinding[] = [{ id: "b1", container: asContainer(escaped) }];
    cullEscapedBodies(bindings, world, 800);

    expect(world.removeCalls).toEqual(["b1"]);
    expect(escaped.__body).toBeUndefined();
    expect(escaped.visible).toBe(false);
  });

  it("leaves every other binding untouched", () => {
    const escaped = makeContainer({ __body: "b1", visible: true });
    const safe = makeContainer({ __body: "b2", visible: true });
    const world = new FakeWorld();
    world.addBody("b1", SHAPE, 0, 0, 0, physicsParamsFromIR(PHYSICS));
    world.addBody("b2", SHAPE, 0, 0, 0, physicsParamsFromIR(PHYSICS));
    world.setOutside(["b1"]);

    const bindings: PhysicsBinding[] = [
      { id: "b1", container: asContainer(escaped) },
      { id: "b2", container: asContainer(safe) },
    ];
    cullEscapedBodies(bindings, world, 800);

    expect(world.removeCalls).toEqual(["b1"]);
    expect(safe.__body).toBe("b2");
    expect(safe.visible).toBe(true);
  });

  it("does nothing at all when no body has escaped", () => {
    const c = makeContainer({ __body: "b1", visible: true });
    const world = new FakeWorld();
    world.addBody("b1", SHAPE, 0, 0, 0, physicsParamsFromIR(PHYSICS));
    world.setOutside([]);

    const bindings: PhysicsBinding[] = [{ id: "b1", container: asContainer(c) }];
    cullEscapedBodies(bindings, world, 800);

    expect(world.removeCalls).toEqual([]);
    expect(c.__body).toBe("b1");
    expect(c.visible).toBe(true);
  });
});

describe("unpinBody / flushPendingVelocity", () => {
  it("applies a velocity parked while two reasons hold the pin on the second unpin, not the first, and exactly once", () => {
    const c = makeContainer({ __body: "b0", __pendingVelocity: { x: 12, y: -34 } });
    const world = new FakeWorld();
    world.addBody("b0", SHAPE, 0, 0, 0, physicsParamsFromIR(PHYSICS));
    world.pin("b0", "POS_ANIM");
    world.pin("b0", "FROZEN");

    unpinBody(asContainer(c), world, "FROZEN");
    expect(world.velocityCalls).toEqual([]); // still pinned by POS_ANIM
    expect(c.__pendingVelocity).toEqual({ x: 12, y: -34 }); // still parked

    unpinBody(asContainer(c), world, "POS_ANIM");
    expect(world.velocityCalls).toEqual([{ id: "b0", vx: 12, vy: -34 }]);
  });

  it("clears __pendingVelocity after a successful flush", () => {
    const c = makeContainer({ __body: "b0", __pendingVelocity: { x: 5, y: 5 } });
    const world = new FakeWorld();
    world.addBody("b0", SHAPE, 0, 0, 0, physicsParamsFromIR(PHYSICS));
    world.pin("b0", "NO_RUNNER");

    unpinBody(asContainer(c), world, "NO_RUNNER");

    expect(c.__pendingVelocity).toBeUndefined();
  });

  it("does not call setVelocity when unpinning a body with no parked velocity", () => {
    const c = makeContainer({ __body: "b0" });
    const world = new FakeWorld();
    world.addBody("b0", SHAPE, 0, 0, 0, physicsParamsFromIR(PHYSICS));
    world.pin("b0", "NO_RUNNER");

    unpinBody(asContainer(c), world, "NO_RUNNER");

    expect(world.velocityCalls).toEqual([]);
  });

  it("flushPendingVelocity itself is a no-op while the body is still pinned", () => {
    const c = makeContainer({ __body: "b0", __pendingVelocity: { x: 1, y: 1 } });
    const world = new FakeWorld();
    world.addBody("b0", SHAPE, 0, 0, 0, physicsParamsFromIR(PHYSICS));
    world.pin("b0", "FROZEN");

    flushPendingVelocity(asContainer(c), world);

    expect(world.velocityCalls).toEqual([]);
    expect(c.__pendingVelocity).toEqual({ x: 1, y: 1 });
  });

  it("pinBody / unpinBody are no-ops on a container with no body", () => {
    const c = makeContainer();
    const world = new FakeWorld();
    expect(() => pinBody(asContainer(c), world, "FROZEN")).not.toThrow();
    expect(() => unpinBody(asContainer(c), world, "FROZEN")).not.toThrow();
  });
});

describe("physicsParamsFromIR", () => {
  it("maps every field across, flattening gravity.x/gravity.y to gravityX/gravityY", () => {
    const ph: IRPhysics = {
      velocity: { x: 1, y: 2 },
      gravity: { x: 3, y: 4 },
      airDrag: 0.25,
      bounce: 0.75,
      collideBounds: false,
      duration: 2.5,
    };
    expect(physicsParamsFromIR(ph)).toEqual({
      gravityX: 3,
      gravityY: 4,
      airDrag: 0.25,
      bounce: 0.75,
      collideBounds: false,
    });
  });
});
