import { describe, it, expect } from "vitest";
import type { Container } from "pixi.js";
import type { IRPhysics, IRSequence, IRAnimation } from "../sceneIR";
import type { BodyGeometry, BodyState, IPhysicsWorld, PhysicsParams, PinReason } from "./physicsWorld";
import type { LocalTransform } from "./transform";
import {
  bindPhysicsBodies,
  centreInParent,
  centreOffsetVector,
  cullEscapedBodies,
  flushPendingVelocity,
  hasPhysicsAnywhere,
  physicsParamsFromIR,
  pinBody,
  snapContainerToBody,
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

  /** Test helper: the alpha of the most recent readState call. */
  lastReadAlpha: number | null = null;

  readState(id: string, alpha: number): BodyState | null {
    this.lastReadAlpha = alpha;
    return this.states.has(id) ? (this.states.get(id) ?? null) : null;
  }

  idsOutsideBounds(_margin: number): string[] {
    return this.outside;
  }

  isIdle(): boolean {
    return true;
  }

  boundsOf(_id: string): null {
    // Not exercised by physicsSync.
    return null;
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
  __mareyLayout?: {
    localPivotX: number;
    localPivotY: number;
    /**
     * Required, not optional, so a fixture cannot silently omit it and feed
     * `undefined` into the placement arithmetic as a NaN.
     */
    centreOffsetX: number;
    centreOffsetY: number;
    currentPos: { x: number; y: number };
    currentScale: { x: number; y: number };
  };
  __body?: string;
  __bodyTransform?: LocalTransform;
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

/** A static group: no physics, no animations, so it owns no body itself. */
function staticGroup(over: {
  x: number;
  y: number;
  rotation?: number;
  scale?: { x: number; y: number };
  children: MockContainer[];
}): MockContainer {
  return makeContainer({
    rotation: over.rotation ?? 0,
    children: over.children,
    __bodyShape: { kind: "compound", parts: [] },
    __mareyLayout: {
      localPivotX: 0,
      localPivotY: 0,
      // A group's pivot IS its local origin and its centre offset is always
      // zero (D16) — never derived from where its children sit.
      centreOffsetX: 0,
      centreOffsetY: 0,
      currentPos: { x: over.x, y: over.y },
      currentScale: { x: over.scale?.x ?? 1, y: over.scale?.y ?? 1 },
    },
  });
}

/** A leaf that declares physics, so it does own a body. */
function physicsChild(
  pos: { x: number; y: number },
  over: {
    centreOffset?: { x: number; y: number };
    rotation?: number;
    scale?: { x: number; y: number };
  } = {}
): MockContainer {
  return makeContainer({
    rotation: over.rotation ?? 0,
    __bodyShape: { kind: "circle", radius: 10 },
    __physics: {
      velocity: { x: 0, y: 0 },
      gravity: { x: 0, y: 980 },
      airDrag: 0,
      bounce: 0.65,
      collideBounds: true,
      duration: 1,
    },
    __mareyLayout: {
      localPivotX: 0,
      localPivotY: 0,
      centreOffsetX: over.centreOffset?.x ?? 0,
      centreOffsetY: over.centreOffset?.y ?? 0,
      currentPos: { x: pos.x, y: pos.y },
      currentScale: { x: over.scale?.x ?? 1, y: over.scale?.y ?? 1 },
    },
  });
}

const SHAPE: BodyGeometry = { kind: "circle", radius: 10 };

/**
 * The tick-aligned scale to hand `snapContainerToBody`.
 *
 * No scale animation runs anywhere in this file, so nothing is writing
 * `currentScale` at the driver's alpha and the container's own value is
 * already tick-aligned — the case that function's doc explicitly allows. A
 * caller with a live scale animation must pass that animation's own alpha-0
 * value instead, which is what `SceneRuntime`'s freeze path does.
 */
function tickScaleOf(c: { __mareyLayout?: { currentScale: { x: number; y: number } } }): {
  x: number;
  y: number;
} {
  return c.__mareyLayout?.currentScale ?? { x: 1, y: 1 };
}

/**
 * `cx`/`cy` are the pivot-to-bbox-centre offset, zero at the default origin —
 * which is why every pre-existing caller can leave them out.
 */
function layoutAt(x: number, y: number, sx = 1, sy = 1, cx = 0, cy = 0) {
  return {
    localPivotX: 0,
    localPivotY: 0,
    centreOffsetX: cx,
    centreOffsetY: cy,
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
  delay: 0,
  easing: "linear",
  loop: false,
  yoyo: false,
  handoff: false,
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
      __mareyLayout: layoutAt(1, 1),
    });
    const decorativeChild = makeContainer(); // no physics anywhere
    const child = makeContainer({
      __physics: PHYSICS,
      __bodyShape: SHAPE,
      __mareyLayout: layoutAt(2, 2),
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
    const first = makeContainer({ __physics: PHYSICS, __bodyShape: SHAPE, __mareyLayout: layoutAt(0, 0) });
    const second = makeContainer({ __physics: PHYSICS, __bodyShape: SHAPE, __mareyLayout: layoutAt(0, 0) });
    const thirdNested = makeContainer({ __physics: PHYSICS, __bodyShape: SHAPE, __mareyLayout: layoutAt(0, 0) });
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
    const c = makeContainer({ __physics: PHYSICS, __bodyShape: SHAPE, __mareyLayout: layoutAt(5, 5) });
    bindPhysicsBodies(asContainer(c), new FakeWorld());
    expect(c.__body).toBe("b0");
  });

  it("pins every new body with NO_RUNNER, since no runner has started yet", () => {
    const c = makeContainer({ __physics: PHYSICS, __bodyShape: SHAPE, __mareyLayout: layoutAt(5, 5) });
    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(c), world);
    expect(world.pinCalls).toEqual([{ id: "b0", reason: "NO_RUNNER" }]);
    expect(world.isPinned("b0")).toBe(true);
  });

  it("passes the container's current position, rotation and scale through", () => {
    const c = makeContainer({
      __physics: PHYSICS,
      __bodyShape: SHAPE,
      __mareyLayout: layoutAt(123, 456, 2, 3),
      rotation: 1.5,
    });
    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(c), world);

    expect(world.addCalls[0]).toMatchObject({ x: 123, y: 456, angle: 1.5, geometry: SHAPE });
    expect(world.scaleCalls).toEqual([{ id: "b0", sx: 2, sy: 3 }]);
  });

  it("skips a qualifying container that has no __bodyShape, rather than throwing", () => {
    const c = makeContainer({ __physics: PHYSICS, __mareyLayout: layoutAt(0, 0) });
    const world = new FakeWorld();
    expect(() => bindPhysicsBodies(asContainer(c), world)).not.toThrow();
    expect(world.addCalls).toHaveLength(0);
    expect(c.__body).toBeUndefined();
  });

  it("skips a qualifying container that has no __mareyLayout, rather than throwing", () => {
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
    const c = makeContainer({ __sequences: [seq], __bodyShape: SHAPE, __mareyLayout: layoutAt(0, 0) });
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
    const c = makeContainer({ __mareyLayout: layoutAt(0, 0), __body: "b0" });
    const world = new FakeWorld();
    world.addBody("b0", SHAPE, 0, 0, 0, physicsParamsFromIR(PHYSICS));
    world.setState("b0", { x: 42, y: 84, angle: 0.3 });

    const bindings: PhysicsBinding[] = [{ id: "b0", container: asContainer(c) }];
    syncWorldToContainers(bindings, world, 1);

    expect(c.__mareyLayout!.currentPos).toEqual({ x: 42, y: 84 });
    expect(c.rotation).toBe(0.3);
    expect(c.updateLayoutCalls).toBe(1);
  });

  it("skips a pinned body entirely, since the flow for it is container to body", () => {
    const c = makeContainer({ __mareyLayout: layoutAt(1, 2), __body: "b0", rotation: 0.1 });
    const world = new FakeWorld();
    world.addBody("b0", SHAPE, 1, 2, 0.1, physicsParamsFromIR(PHYSICS));
    world.pin("b0", "POS_ANIM");
    world.setState("b0", { x: 999, y: 999, angle: 9 });

    const bindings: PhysicsBinding[] = [{ id: "b0", container: asContainer(c) }];
    syncWorldToContainers(bindings, world, 1);

    expect(c.__mareyLayout!.currentPos).toEqual({ x: 1, y: 2 });
    expect(c.rotation).toBe(0.1);
    expect(c.updateLayoutCalls).toBe(0);
  });

  it("tolerates readState returning null for a culled body without throwing", () => {
    const c = makeContainer({ __mareyLayout: layoutAt(5, 5), __body: "b0" });
    const world = new FakeWorld();
    world.addBody("b0", SHAPE, 5, 5, 0, physicsParamsFromIR(PHYSICS));
    world.setState("b0", null);

    const bindings: PhysicsBinding[] = [{ id: "b0", container: asContainer(c) }];
    expect(() => syncWorldToContainers(bindings, world, 1)).not.toThrow();
    expect(c.__mareyLayout!.currentPos).toEqual({ x: 5, y: 5 });
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

describe("snapContainerToBody", () => {
  it("writes the tick-aligned state, ignoring sub-tick interpolation", () => {
    // The bug this exists to prevent: a frozen body keeps the position it was
    // last *painted* at, and that paint used the driver's wall-clock alpha, so
    // the object settles a slightly different place on every run.
    const world = new FakeWorld();
    const c = makeContainer({ __mareyLayout: layoutAt(0, 0), __body: "b0" });
    world.setState("b0", { x: 100, y: 200, angle: 0.5 });

    snapContainerToBody(asContainer(c), world, tickScaleOf(c));

    // A read at alpha 1 is the current tick's state, not a blend with the last.
    expect(world.lastReadAlpha).toBe(1);
    expect(c.__mareyLayout!.currentPos).toEqual({ x: 100, y: 200 });
    expect(c.rotation).toBe(0.5);
    expect(c.updateLayoutCalls).toBe(1);
  });

  it("does nothing for a container with no body", () => {
    const world = new FakeWorld();
    const c = makeContainer({ __mareyLayout: layoutAt(0, 0) });
    expect(() => snapContainerToBody(asContainer(c), world, tickScaleOf(c))).not.toThrow();
    expect(c.updateLayoutCalls).toBe(0);
  });

  it("does nothing when the body has already been culled", () => {
    const world = new FakeWorld();
    const c = makeContainer({ __mareyLayout: layoutAt(0, 0), __body: "gone" });
    expect(() => snapContainerToBody(asContainer(c), world, tickScaleOf(c))).not.toThrow();
    expect(c.updateLayoutCalls).toBe(0);
  });
});

describe("ancestor transforms (spec D17)", () => {
  it("places a body inside a translated group at its world position", () => {
    // The defect this fixes: a template carrying physics produced one body per
    // instance, all at (0, 0), because the child's LOCAL position was passed
    // through as a scene coordinate.
    const child = physicsChild({ x: 10, y: 20 });
    const g = staticGroup({ x: 400, y: 300, children: [child] });

    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(g), world);

    expect(world.addCalls).toHaveLength(1);
    expect(world.addCalls[0].x).toBeCloseTo(410, 8);
    expect(world.addCalls[0].y).toBeCloseTo(320, 8);
  });

  it("rotates and scales a child's position into the group's frame", () => {
    const child = physicsChild({ x: 10, y: 0 });
    const g = staticGroup({
      x: 100, y: 100, rotation: Math.PI / 2, scale: { x: 2, y: 2 },
      children: [child],
    });

    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(g), world);

    expect(world.addCalls[0].x).toBeCloseTo(100, 8);
    expect(world.addCalls[0].y).toBeCloseTo(120, 8);
    // The body's scale is the composed one, not the child's own.
    expect(world.scaleCalls).toEqual([{ id: "b0", sx: 2, sy: 2 }]);
  });

  it("converts a body's world position back into the child's local space", () => {
    const child = physicsChild({ x: 10, y: 20 });
    const g = staticGroup({ x: 400, y: 300, children: [child] });

    const world = new FakeWorld();
    const bindings = bindPhysicsBodies(asContainer(g), world);
    world.unpin("b0", "NO_RUNNER");
    world.setState("b0", { x: 500, y: 400, angle: 0 });

    syncWorldToContainers(bindings, world, 1);

    expect(child.__mareyLayout!.currentPos.x).toBeCloseTo(100, 8);
    expect(child.__mareyLayout!.currentPos.y).toBeCloseTo(100, 8);
  });

  it("subtracts the ancestor rotation on write-back", () => {
    const child = physicsChild({ x: 0, y: 0 });
    const g = staticGroup({ x: 0, y: 0, rotation: Math.PI / 2, children: [child] });

    const world = new FakeWorld();
    const bindings = bindPhysicsBodies(asContainer(g), world);
    world.unpin("b0", "NO_RUNNER");
    world.setState("b0", { x: 0, y: 0, angle: Math.PI });

    syncWorldToContainers(bindings, world, 1);

    expect(child.rotation).toBeCloseTo(Math.PI / 2, 8);
  });

  it("snapContainerToBody converts through the same transform", () => {
    const child = physicsChild({ x: 0, y: 0 });
    const g = staticGroup({ x: 400, y: 300, children: [child] });

    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(g), world);
    world.setState("b0", { x: 450, y: 360, angle: 0 });

    snapContainerToBody(asContainer(child), world, tickScaleOf(child));

    expect(child.__mareyLayout!.currentPos.x).toBeCloseTo(50, 8);
    expect(child.__mareyLayout!.currentPos.y).toBeCloseTo(60, 8);
  });

  it("rotates a parked handoff velocity into world space but does not translate it", () => {
    // A velocity is a direction and a magnitude, so it takes the ancestor's
    // rotation and scale but never its position.
    const child = physicsChild({ x: 0, y: 0 });
    const g = staticGroup({ x: 1000, y: 1000, rotation: Math.PI / 2, children: [child] });

    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(g), world);
    world.unpin("b0", "NO_RUNNER");
    child.__pendingVelocity = { x: 60, y: 0 };

    flushPendingVelocity(asContainer(child), world);

    expect(world.velocityCalls).toHaveLength(1);
    expect(world.velocityCalls[0].vx).toBeCloseTo(0, 8);
    expect(world.velocityCalls[0].vy).toBeCloseTo(60, 8);
  });

  it("leaves a top-level object's placement untouched", () => {
    // Identity transform — which is every object in every scene written before
    // Phase 2, so this is the no-regression case.
    const child = physicsChild({ x: 250, y: 175 });
    const root = makeContainer({ children: [child] });

    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(root), world);

    expect(world.addCalls[0].x).toBe(250);
    expect(world.addCalls[0].y).toBe(175);
    expect(world.scaleCalls).toEqual([{ id: "b0", sx: 1, sy: 1 }]);
  });
});

/**
 * A 40x20 rectangle with `origin: (0.5, 1)` has its pivot on its bottom edge,
 * so `position` places that edge — but Matter places a body at its CENTRE OF
 * MASS, 10px above. `centreOffsetY: -10` is that vector, pointing up.
 */
const BOTTOM_ORIGIN: { x: number; y: number } = { x: 0, y: -10 };

describe("origin through the physics seam · placement", () => {
  it("places a bottom-origin body at its centre, not at its origin point", () => {
    const c = makeContainer({
      __physics: PHYSICS,
      __bodyShape: SHAPE,
      __mareyLayout: layoutAt(100, 500, 1, 1, BOTTOM_ORIGIN.x, BOTTOM_ORIGIN.y),
    });
    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(c), world);

    expect(world.addCalls[0].x).toBe(100);
    expect(world.addCalls[0].y).toBe(490);
  });

  it("scales the pivot-to-centre offset with the object's own scale", () => {
    const c = makeContainer({
      __physics: PHYSICS,
      __bodyShape: SHAPE,
      __mareyLayout: layoutAt(100, 500, 1, 3, BOTTOM_ORIGIN.x, BOTTOM_ORIGIN.y),
    });
    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(c), world);

    expect(world.addCalls[0].y).toBe(470);
  });

  it("rotates the pivot-to-centre offset by the object's own rotation", () => {
    // Turned a quarter turn, "10px above the pivot" points along +x instead.
    const c = makeContainer({
      __physics: PHYSICS,
      __bodyShape: SHAPE,
      rotation: Math.PI / 2,
      __mareyLayout: layoutAt(100, 500, 1, 1, BOTTOM_ORIGIN.x, BOTTOM_ORIGIN.y),
    });
    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(c), world);

    expect(world.addCalls[0].x).toBeCloseTo(110, 8);
    expect(world.addCalls[0].y).toBeCloseTo(500, 8);
  });

  it("leaves a default-origin body exactly where it is today", () => {
    const c = makeContainer({
      __physics: PHYSICS,
      __bodyShape: SHAPE,
      __mareyLayout: layoutAt(100, 500),
    });
    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(c), world);

    expect(world.addCalls[0].x).toBe(100);
    expect(world.addCalls[0].y).toBe(500);
  });

  it("applies the offset in the child's own frame, then the ancestor's", () => {
    // The judgment call this pins: the offset is scaled and rotated by the
    // CHILD, and the result is then scaled and rotated by the GROUP — not
    // scaled and rotated once by the composed transform. The two answers
    // differ only when the child rotates and some scale is non-uniform, which
    // is exactly this fixture: child turned 90 degrees inside a group
    // stretched 2x on x alone.
    //
    // Child frame: (0, -10) rotated 90 degrees is (10, 0).
    // Group frame: (10, 0) scaled by (2, 1) is (20, 0).
    // Composing once instead would scale (0, -10) by (2, 1) to (0, -10) and
    // rotate to (10, 0) — half the answer.
    const child = physicsChild(
      { x: 0, y: 0 },
      { centreOffset: BOTTOM_ORIGIN, rotation: Math.PI / 2 }
    );
    const g = staticGroup({ x: 0, y: 0, scale: { x: 2, y: 1 }, children: [child] });

    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(g), world);

    expect(world.addCalls[0].x).toBeCloseTo(20, 8);
    expect(world.addCalls[0].y).toBeCloseTo(0, 8);
  });
});

describe("origin through the physics seam · write-back", () => {
  /** A bottom-origin container, stretched 3x on y so the offset also scales. */
  function bottomOriginBody(world: FakeWorld): {
    c: MockContainer;
    bindings: PhysicsBinding[];
  } {
    const c = makeContainer({
      __physics: PHYSICS,
      __bodyShape: SHAPE,
      __mareyLayout: layoutAt(100, 500, 1, 3, BOTTOM_ORIGIN.x, BOTTOM_ORIGIN.y),
    });
    const bindings = bindPhysicsBodies(asContainer(c), world);
    world.unpin(bindings[0].id, "NO_RUNNER");
    return { c, bindings };
  }

  it("round-trips a bottom-origin container through bind and write-back", () => {
    const world = new FakeWorld();
    const { c, bindings } = bottomOriginBody(world);

    // The world reports back exactly the centre it was handed at bind time, so
    // the container must land on the position it started from.
    const placed = world.addCalls[0];
    world.setState(bindings[0].id, { x: placed.x, y: placed.y, angle: placed.angle });
    syncWorldToContainers(bindings, world, 1);

    expect(c.__mareyLayout!.currentPos.x).toBeCloseTo(100, 8);
    expect(c.__mareyLayout!.currentPos.y).toBeCloseTo(500, 8);
  });

  it("snapContainerToBody round-trips the same container the same way", () => {
    const world = new FakeWorld();
    const { c, bindings } = bottomOriginBody(world);

    const placed = world.addCalls[0];
    world.setState(bindings[0].id, { x: placed.x, y: placed.y, angle: placed.angle });
    snapContainerToBody(asContainer(c), world, tickScaleOf(c));

    expect(c.__mareyLayout!.currentPos.x).toBeCloseTo(100, 8);
    expect(c.__mareyLayout!.currentPos.y).toBeCloseTo(500, 8);
  });

  it("un-rotates the offset by the body's new angle, not the container's old one", () => {
    // A tumbling body reports a centre and an angle together. The pivot's
    // position depends on where the offset points AFTER the rotation, so the
    // inverse must use the angle just read — not the angle the container is
    // still holding from the previous tick.
    //
    // Centre (110, 500) at a quarter turn: the offset (0, -10) rotates to
    // (10, 0), so the pivot is at (100, 500). Using the stale angle 0 instead
    // would put it at (110, 510).
    const world = new FakeWorld();
    const c = makeContainer({
      __physics: PHYSICS,
      __bodyShape: SHAPE,
      __mareyLayout: layoutAt(100, 500, 1, 1, BOTTOM_ORIGIN.x, BOTTOM_ORIGIN.y),
    });
    const bindings = bindPhysicsBodies(asContainer(c), world);
    world.unpin(bindings[0].id, "NO_RUNNER");
    world.setState(bindings[0].id, { x: 110, y: 500, angle: Math.PI / 2 });

    syncWorldToContainers(bindings, world, 1);

    expect(c.rotation).toBeCloseTo(Math.PI / 2, 8);
    expect(c.__mareyLayout!.currentPos.x).toBeCloseTo(100, 8);
    expect(c.__mareyLayout!.currentPos.y).toBeCloseTo(500, 8);
  });

  it("snapContainerToBody also un-rotates by the body's new angle", () => {
    const world = new FakeWorld();
    const c = makeContainer({
      __physics: PHYSICS,
      __bodyShape: SHAPE,
      __mareyLayout: layoutAt(100, 500, 1, 1, BOTTOM_ORIGIN.x, BOTTOM_ORIGIN.y),
    });
    bindPhysicsBodies(asContainer(c), world);
    world.setState(c.__body!, { x: 110, y: 500, angle: Math.PI / 2 });

    snapContainerToBody(asContainer(c), world, tickScaleOf(c));

    expect(c.rotation).toBeCloseTo(Math.PI / 2, 8);
    expect(c.__mareyLayout!.currentPos.x).toBeCloseTo(100, 8);
    expect(c.__mareyLayout!.currentPos.y).toBeCloseTo(500, 8);
  });

  it("write-back inverts the ancestor transform and the offset together", () => {
    // Both corrections at once, on the path a template's physics child takes:
    // the child's own quarter turn puts its offset along +x, and the group's
    // 2x stretch doubles it — so the pivot is 20 scene-px left of the centre.
    const world = new FakeWorld();
    const child = physicsChild(
      { x: 0, y: 0 },
      { centreOffset: BOTTOM_ORIGIN, rotation: Math.PI / 2 }
    );
    const g = staticGroup({ x: 300, y: 200, scale: { x: 2, y: 1 }, children: [child] });
    const bindings = bindPhysicsBodies(asContainer(g), world);
    world.unpin(bindings[0].id, "NO_RUNNER");

    const placed = world.addCalls[0];
    world.setState(bindings[0].id, { x: placed.x, y: placed.y, angle: placed.angle });
    syncWorldToContainers(bindings, world, 1);

    expect(child.__mareyLayout!.currentPos.x).toBeCloseTo(0, 8);
    expect(child.__mareyLayout!.currentPos.y).toBeCloseTo(0, 8);
  });
});

describe("centreOffsetVector", () => {
  it("is a vector, not a point: it never picks up the container's position", () => {
    // Same reason `handoff` velocities go through `rotateScaleVector` — an
    // offset has a direction and a magnitude, so translation must not leak in.
    const layout = layoutAt(999, 999, 1, 1, BOTTOM_ORIGIN.x, BOTTOM_ORIGIN.y);
    expect(centreOffsetVector(layout, 0, layout.currentScale)).toEqual({ x: 0, y: -10 });
  });

  it("uses the rotation and scale it is passed, not the ones on the layout", () => {
    // This is what lets a TICK-phase caller stay clear of invariant 3: the
    // container's rotation, currentPos and currentScale are all last written
    // by the paint phase at wall-clock alpha, so `pushAnimToWorld` must be
    // able to supply its own alpha-0 values. If this function reached for
    // `layout.currentScale` itself, it could not.
    const layout = layoutAt(0, 0, 5, 5, BOTTOM_ORIGIN.x, BOTTOM_ORIGIN.y);
    expect(centreOffsetVector(layout, 0, { x: 1, y: 1 })).toEqual({ x: 0, y: -10 });

    const turned = centreOffsetVector(layout, Math.PI / 2, { x: 1, y: 1 });
    expect(turned.x).toBeCloseTo(10, 8);
    expect(turned.y).toBeCloseTo(0, 8);
  });
});

describe("centreInParent", () => {
  it("returns currentPos untouched at the default origin", () => {
    const c = makeContainer({ __mareyLayout: layoutAt(7, 11) });
    expect(centreInParent(asContainer(c))).toEqual({ x: 7, y: 11 });
  });

  it("contributes no offset for a container with no layout, matching bodyTransformOf's identity default", () => {
    // The bare scene root is exactly this shape.
    const c = makeContainer();
    expect(centreInParent(asContainer(c))).toEqual({ x: 0, y: 0 });
  });
});
