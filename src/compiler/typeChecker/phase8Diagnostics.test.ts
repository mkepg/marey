import { describe, it, expect } from "vitest";
import { compileSource } from "../compileSource";

function errorsOf(src: string): string[] {
  return compileSource(src).errors.map((e) => e.message);
}

function scene(body: string, world = ""): string {
  return `scene {\n  size: (800, 600)\n${world}\n${body}\n}`;
}

function worldWith(inner: string): string {
  return `  world {\n    ${inner}\n  }`;
}

function crate(physics: string, extra = ""): string {
  return `  rectangle crate {\n    position: (200, 200)\n    size: (50, 50)\n    physics { ${physics} }\n${extra}\n  }`;
}

const LOCK_IGNORED = (prop: string) =>
  `[TYPE_LOCK_IGNORED] The 'physics' block: '${prop}' has no effect on a body with 'lockPosition: true'. Remove it; only 'bounce' applies to a locked body.`;

describe("Phase 8 diagnostics", () => {
  it("TYPE_BOUNDS_EDGE names a bounds word that is not a scene edge", () => {
    expect(errorsOf(scene("", worldWith("bounds: [left, up]")))).toEqual([
      "[TYPE_BOUNDS_EDGE] The 'world' block: 'bounds' lists 'up', which is not a scene edge. The edges are left, right, top and bottom.",
    ]);
  });

  it("TYPE_BOUNDS_DUPLICATE fires once, on the repeat", () => {
    expect(errorsOf(scene("", worldWith("bounds: [left, bottom, left]")))).toEqual([
      "[TYPE_BOUNDS_DUPLICATE] The 'world' block: 'bounds' lists 'left' more than once.",
    ]);
  });

  it("a non-list bounds is the generic kind mismatch, naming scene edges", () => {
    expect(errorsOf(scene("", worldWith("bounds: true")))).toEqual([
      "The 'world' block: property 'bounds' expects a list of scene edges, such as [left, right, bottom], but got a boolean (true or false).",
    ]);
  });

  it.each([
    ["velocity", "velocity: (1, 0)"],
    ["gravity", "gravity: (0, 1)"],
    ["airDrag", "airDrag: 0.1"],
    ["spin", "spin: 10"],
    ["lockRotation", "lockRotation: true"],
    ["collideBounds", "collideBounds: false"],
    ["duration", "duration: 2"],
  ])("TYPE_LOCK_IGNORED names '%s' on a locked body", (prop, written) => {
    expect(errorsOf(scene(crate(`lockPosition: true, ${written}`)))).toEqual([LOCK_IGNORED(prop)]);
  });

  it("a locked body with only bounce and no duration has no errors", () => {
    expect(errorsOf(scene(crate("lockPosition: true, bounce: 0.5")))).toEqual([]);
  });

  it("lockPosition: false still requires a duration", () => {
    expect(errorsOf(scene(crate("lockPosition: false")))).toEqual([
      "The 'physics' block is missing the required property 'duration'.",
    ]);
  });

  it.each(["sequence", "parallel"])("TYPE_LOCK_IN_SEQUENCE in a %s step names the block kind", (kind) => {
    const step = `physics { lockPosition: true }`;
    const body = kind === "sequence"
      ? `sequence { ${step} }`
      : `sequence { parallel { ${step} } }`;
    expect(errorsOf(scene(`  rectangle r {\n position: (200, 200)\n size: (50, 50)\n ${body}\n }`))).toEqual([
      `[TYPE_LOCK_IN_SEQUENCE] 'lockPosition' is not allowed inside a '${kind}' block: a locked step never ends, so the steps after it could never start. Put it on the object's own 'physics' block.`,
    ]);
  });

  it("TYPE_LOCK_WITH_SEQUENCE fires for a locked physics beside a sequence", () => {
    const extra = `    sequence { animate { property: alpha, to: 0.5, duration: 1 } }`;
    expect(errorsOf(scene(crate("lockPosition: true", extra)))).toEqual([
      "[TYPE_LOCK_WITH_SEQUENCE] 'lockPosition: true' cannot be used on an object that also has a 'sequence' block, because the sequence waits for the object's physics to finish and a locked body's never does.",
    ]);
  });

  it("TYPE_LOCK_HANDOFF is the only handoff diagnostic for a locked receiver", () => {
    const extra = `    animate { property: position, to: (300, 100), duration: 1, handoff: true }`;
    const errs = errorsOf(scene(crate("lockPosition: true", extra)));
    expect(errs).toEqual([
      "[TYPE_LOCK_HANDOFF] 'handoff: true' cannot hand momentum to a body with 'lockPosition: true', which physics never moves.",
    ]);
    expect(errs.some((m) => m.includes("TYPE_HANDOFF_DURATION"))).toBe(false);
    expect(errs.some((m) => m.includes("TYPE_HANDOFF_AMBIGUITY"))).toBe(false);
  });

  it("TYPE_SPIN_LOCKED fires for spin with lockRotation: true", () => {
    expect(errorsOf(scene(crate("spin: 90, lockRotation: true, duration: 1")))).toEqual([
      "[TYPE_SPIN_LOCKED] The 'physics' block: 'spin' has no effect with 'lockRotation: true'. Remove one of them.",
    ]);
  });

  it("lockPosition with spin and lockRotation names each in TYPE_LOCK_IGNORED and adds no TYPE_SPIN_LOCKED", () => {
    expect(errorsOf(scene(crate("lockPosition: true, spin: 90, lockRotation: true")))).toEqual([
      LOCK_IGNORED("spin"),
      LOCK_IGNORED("lockRotation"),
    ]);
  });

  it("a scene using every feature at once compiles clean", () => {
    const src = `scene {
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
}`;
    expect(errorsOf(src)).toEqual([]);
  });
});
