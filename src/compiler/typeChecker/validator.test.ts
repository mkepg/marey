import { describe, it, expect } from "vitest";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import type { AstValue, CompilerError } from "../types";
import { validateLocalConstraint } from "./validator";
import type { PropertySpec } from "../languageContract";

function errorsFor(source: string): string[] {
  const { ast, errors } = parse(lex(source));
  if (errors.length > 0) return errors.map((e) => e.message);
  const { errors: typeErrors } = typeCheck(ast!);
  return typeErrors.map((e) => e.message);
}

function diagnosticsFor(source: string): CompilerError[] {
  const { ast, errors } = parse(lex(source));
  if (errors.length > 0) return errors;
  return typeCheck(ast!).errors;
}

describe("released property names", () => {
  it.each(["anchor", "width", "height"])("allows %s as an object and binding name", (name) => {
    expect(errorsFor(`let ${name} = 12\nscene { size: (100, 100) circle ${name} { position: (50, 50), radius: ${name} } }`)).toEqual([]);
  });

  it("keeps removed reservations invalid as properties", () => {
    const out = errorsFor(`scene { size: (100,100) circle c { position:(50,50), radius:10, anchor: 0 } }`);
    expect(out.join("\n")).toContain("unknown property 'anchor'");
  });
});

describe("physics inside a group (spec D17)", () => {
  it("rejects physics on a child of a physics group", () => {
    const out = errorsFor(`
      scene {
        size: (800, 600)
        group logo {
          position: (400, 300)
          physics { gravity: (0, 900), duration: 2 }
          circle dot {
            position: (0, 0)
            radius: 10
            physics { gravity: (0, 900), duration: 2 }
          }
        }
      }
    `);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_PHYSICS_IN_PHYSICS_GROUP");
    expect(out[0]).toContain("logo");
  });

  it("rejects physics on a child of an animated group", () => {
    const out = errorsFor(`
      scene {
        size: (800, 600)
        group row {
          position: (100, 100)
          animate { property: position, to: (400, 100), duration: 1 }
          circle dot {
            position: (0, 0)
            radius: 10
            physics { gravity: (0, 900), duration: 2 }
          }
        }
      }
    `);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_PHYSICS_IN_ANIMATED_GROUP");
    expect(out[0]).toContain("row");
  });

  it("rejects physics reached through a sequence inside a physics group", () => {
    const out = errorsFor(`
      scene {
        size: (800, 600)
        group logo {
          position: (400, 300)
          physics { gravity: (0, 900), duration: 2 }
          circle dot {
            position: (0, 0)
            radius: 10
            sequence {
              animate { property: alpha, to: 0.5, duration: 0.5 }
              physics { gravity: (0, 900), duration: 2 }
            }
          }
        }
      }
    `);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_PHYSICS_IN_PHYSICS_GROUP");
  });

  it("rejects physics nested two groups deep under an animated ancestor", () => {
    const out = errorsFor(`
      scene {
        size: (800, 600)
        group outer {
          position: (100, 100)
          animate { property: rotation, to: 90, duration: 1 }
          group inner {
            position: (10, 10)
            circle dot {
              position: (0, 0)
              radius: 10
              physics { gravity: (0, 900), duration: 2 }
            }
          }
        }
      }
    `);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_PHYSICS_IN_ANIMATED_GROUP");
    expect(out[0]).toContain("outer");
  });

  it("allows physics under a static group", () => {
    expect(errorsFor(`
      scene {
        size: (800, 600)
        group layout {
          position: (400, 300)
          circle dot {
            position: (0, 0)
            radius: 10
            physics { gravity: (0, 900), duration: 2 }
          }
        }
      }
    `)).toEqual([]);
  });

  it("allows physics inside a template, whose use wrapper is a static group", () => {
    expect(errorsFor(`
      template Ball(tone) {
        circle b {
          position: (0, 0)
          radius: 12
          color: tone
          physics { gravity: (0, 900), duration: 2 }
        }
      }
      scene {
        size: (800, 600)
        generate i in 0 to 2 {
          use Ball(cyan) ball { position: (200 + i * 100, 80) }
        }
      }
    `)).toEqual([]);
  });

  it("allows physics on the group itself", () => {
    expect(errorsFor(`
      scene {
        size: (800, 600)
        group logo {
          position: (400, 300)
          physics { gravity: (0, 900), duration: 2 }
          circle dot { position: (0, 0), radius: 10 }
          rectangle bar { position: (30, 0), size: (40, 10) }
        }
      }
    `)).toEqual([]);
  });

  it("allows animate on a child of a physics group (D18: visual-only, not an error)", () => {
    expect(errorsFor(`
      scene {
        size: (800, 600)
        group logo {
          position: (400, 300)
          physics { gravity: (0, 900), duration: 2 }
          circle dot {
            position: (0, 0)
            radius: 10
            animate { property: alpha, to: 0.4, duration: 1, loop: true, yoyo: true }
          }
        }
      }
    `)).toEqual([]);
  });
});

describe("origin on a group (D16)", () => {
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
});

describe("physical line permissions", () => {
  it("rejects a line with direct physics at the line position", () => {
    const errors = diagnosticsFor(`scene {
  size: (100, 100)
  line wire {
    position: (10, 10)
    points: [(0, 0), (20, 20)]
    thickness: 1
    physics { duration: 1 }
  }
}`);
    const error = errors.find((entry) => entry.message.includes("TYPE_LINE_PHYSICS"));
    expect(error).toBeDefined();
    expect(error).toMatchObject({ line: 3, col: 3 });
  });

  it("rejects a line whose sequence creates physics at the line position", () => {
    const errors = diagnosticsFor(`scene {
  size: (100, 100)
  line wire {
    position: (10, 10)
    points: [(0, 0), (20, 20)]
    thickness: 1
    sequence {
      physics { duration: 1 }
    }
  }
}`);
    const error = errors.find((entry) => entry.message.includes("TYPE_LINE_PHYSICS"));
    expect(error).toBeDefined();
    expect(error).toMatchObject({ line: 3, col: 3 });
  });

  it("rejects a line directly inside a physical group", () => {
    const errors = diagnosticsFor(`scene {
  size: (100, 100)
  group logo {
    position: (50, 50)
    physics { duration: 1 }
    line wire {
      position: (0, 0)
      points: [(0, 0), (20, 20)]
      thickness: 1
    }
  }
}`);
    const error = errors.find((entry) => entry.message.includes("TYPE_LINE_PHYSICS"));
    expect(error).toBeDefined();
    expect(error).toMatchObject({ line: 6, col: 5 });
  });

  it("rejects a line inside a nested visual group below a physical group", () => {
    const errors = diagnosticsFor(`scene {
  size: (100, 100)
  group logo {
    position: (50, 50)
    physics { duration: 1 }
    group detail {
      position: (0, 0)
      line wire {
        position: (0, 0)
        points: [(0, 0), (20, 20)]
        thickness: 1
      }
    }
  }
}`);
    const error = errors.find((entry) => entry.message.includes("TYPE_LINE_PHYSICS"));
    expect(error).toBeDefined();
    expect(error).toMatchObject({ line: 8, col: 7 });
  });

  it("allows a nonphysical line and legal physical primitive kinds", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  line wire {
    position: (10, 10)
    points: [(0, 0), (20, 20)]
    thickness: 1
  }
}`)).toEqual([]);

    expect(errorsFor(`scene {
  size: (100, 100)
  circle c { position: (10, 10), radius: 1, physics { duration: 1 } }
  rectangle r { position: (20, 20), size: (2, 2), physics { duration: 1 } }
  polygon p { position: (30, 30), points: [(0, 0), (2, 0), (1, 2)], physics { duration: 1 } }
  text label { position: (40, 40), content: "ok", physics { duration: 1 } }
  group g {
    position: (50, 50)
    physics { duration: 1 }
    circle dot { position: (0, 0), radius: 1 }
  }
}`)).toEqual([]);
  });

  it("allows a line with animation only — a line is visual-only, not collision-free", () => {
    // The `animate`/`sequence` children below are not `physics`, so
    // `ownsPhysics` never fires for this line; only the direct-physics,
    // sequence-physics, and physics-group-ancestor cases above are rejected.
    expect(errorsFor(`scene {
  size: (100, 100)
  line wire {
    position: (10, 10)
    points: [(0, 0), (20, 20)]
    thickness: 1
    animate { property: alpha, to: 0.2, duration: 1 }
  }
}`)).toEqual([]);
  });
});

describe("handoff targets and duration ordering (P3A-8)", () => {
  it("allows an object-level handoff into a longer finite physics runner", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    animate { property: position, to: (50, 50), duration: 1, handoff: true }
    physics { duration: 2 }
  }
}`)).toEqual([]);
  });

  it("rejects an object-level handoff into an equal-duration physics runner", () => {
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    animate { property: position, to: (50, 50), duration: 1, handoff: true }
    physics { duration: 1 }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_HANDOFF_DURATION");
    expect(out[0]).toContain("1s");
  });

  it("rejects an object-level handoff into a shorter physics runner", () => {
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    animate { property: position, to: (50, 50), duration: 1, handoff: true }
    physics { duration: 0.5 }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_HANDOFF_DURATION");
  });

  it("allows an object-level handoff into duration: indefinitely", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    animate { property: position, to: (50, 50), duration: 1, handoff: true }
    physics { duration: indefinitely }
  }
}`)).toEqual([]);
  });

  it("allows a parallel handoff into a longer finite physics runner", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    sequence {
      parallel {
        animate { property: position, to: (50, 50), duration: 1, handoff: true }
        physics { duration: 2 }
      }
    }
  }
}`)).toEqual([]);
  });

  it("rejects a parallel handoff into a shorter or equal physics runner", () => {
    const shorter = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    sequence {
      parallel {
        animate { property: position, to: (50, 50), duration: 1, handoff: true }
        physics { duration: 0.5 }
      }
    }
  }
}`);
    expect(shorter).toHaveLength(1);
    expect(shorter[0]).toContain("TYPE_HANDOFF_DURATION");

    const equal = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    sequence {
      parallel {
        animate { property: position, to: (50, 50), duration: 1, handoff: true }
        physics { duration: 1 }
      }
    }
  }
}`);
    expect(equal).toHaveLength(1);
    expect(equal[0]).toContain("TYPE_HANDOFF_DURATION");
  });

  it("allows a sequence handoff into a shorter, later physics step", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    sequence {
      animate { property: position, to: (50, 50), duration: 1, handoff: true }
      physics { duration: 0.2 }
    }
  }
}`)).toEqual([]);
  });

  it("rejects a sequence handoff whose only physics step precedes the animation", () => {
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    sequence {
      physics { duration: 0.5 }
      animate { property: position, to: (50, 50), duration: 1, handoff: true }
    }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_HANDOFF_PHYSICS");
  });

  it("picks the first later physics step when a sequence has several after the animation", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    sequence {
      animate { property: position, to: (50, 50), duration: 1, handoff: true }
      physics { duration: 0.4 }
      physics { duration: 0.4, velocity: (5, 5) }
    }
  }
}`)).toEqual([]);
  });

  it("resolves the correctly-ordered later physics step, not an earlier one, when checking for ambiguity", () => {
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    sequence {
      physics { duration: 0.3 }
      animate { property: position, to: (50, 50), duration: 1, handoff: true }
      physics { duration: 0.3, velocity: (5, 5) }
    }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_HANDOFF_AMBIGUITY");
  });

  it("doubles the effective duration for a concurrent yoyo handoff", () => {
    // animation duration 1s, yoyo:true -> effective runtime 2s.
    // A physics duration of 1.5s is longer than the raw duration but
    // shorter than the doubled effective runtime, so it must be rejected.
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    animate { property: position, to: (50, 50), duration: 1, yoyo: true, handoff: true }
    physics { duration: 1.5 }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_HANDOFF_DURATION");
    expect(out[0]).toContain("2s");
  });

  it("allows a concurrent yoyo handoff once physics duration clears the doubled runtime", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    animate { property: position, to: (50, 50), duration: 1, yoyo: true, handoff: true }
    physics { duration: 2.5 }
  }
}`)).toEqual([]);
  });

  it("still rejects a resolved handoff target that carries an initial velocity", () => {
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    animate { property: position, to: (50, 50), duration: 1, handoff: true }
    physics { duration: 2, velocity: (10, 10) }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_HANDOFF_AMBIGUITY");
  });

  // --- Defect 1: validation must model every concurrent runner on the body,
  // not just the first physics sibling resolveHandoffTarget happens to find.
  // Reproduction confirmed live: both scenes below compile with zero errors
  // before the fix, yet the handoff's parked velocity is never flushed at
  // runtime because the body is still pinned (POS_ANIM or FROZEN, from a
  // *different* runner) when its own physics runner freezes.

  it("rejects a handoff when a second concurrent position animation can keep the body pinned past its physics runner's freeze", () => {
    // c has two direct position animations (concurrent scheduling): the
    // handoff one (1s) and a plain one (2s). Both hold the POS_ANIM pin
    // reason-count. The physics runner freezes at 1.5s, before the second
    // animation's own release at 2s, so the FROZEN reason is added while
    // POS_ANIM is still held by the second animation — the pin never reaches
    // zero again, and the handoff's parked velocity is never flushed.
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    animate { property: position, to: (20, 10), duration: 1, handoff: true }
    animate { property: position, to: (30, 10), duration: 2 }
    physics { duration: 1.5 }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_HANDOFF_SCHEDULE_AMBIGUOUS");
  });

  it("rejects a handoff when the object itself starts two concurrent physics blocks", () => {
    // Two direct physics children on one object both spawn PhysicsRunners
    // against the same body. Whichever freezes first adds FROZEN; nothing
    // ever removes that specific hold, so which of the two the validator
    // checks against TYPE_HANDOFF_DURATION is not the whole story.
    //
    // Fix round 1: TYPE_ONE_PHYSICS is general and no longer suppressed when a
    // handoff animation is present (see the TYPE_ONE_PHYSICS describe block
    // below), so it now co-fires here alongside TYPE_HANDOFF_SCHEDULE_AMBIGUOUS
    // — the same two-independently-true-diagnostics shape TYPE_ONE_STORY and a
    // sequence's own "must be inside a renderable" check already produce
    // elsewhere in this file.
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    animate { property: position, to: (20, 10), duration: 1, handoff: true }
    physics { duration: 2 }
    physics { duration: 0.25 }
  }
}`);
    expect(out).toHaveLength(2);
    expect(out.join()).toContain("TYPE_HANDOFF_SCHEDULE_AMBIGUOUS");
    expect(out.join()).toContain("TYPE_ONE_PHYSICS");
  });

  it("rejects a handoff whose parallel step starts two concurrent physics runners", () => {
    // The external reviewer's second shape: a sequence/parallel carrying two
    // physics runners (2s and 0.25s) alongside the handoff animation. Built
    // via 'sequence { parallel { ... } }' because 'parallel' is only legal
    // directly inside a 'sequence' — writing it straight in the object body
    // is itself a parse error and would prove nothing.
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    sequence {
      parallel {
        animate { property: position, to: (50, 50), duration: 1, handoff: true }
        physics { duration: 2 }
        physics { duration: 0.25 }
      }
    }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_HANDOFF_SCHEDULE_AMBIGUOUS");
  });

  it("allows a handoff alongside a concurrent non-position animation", () => {
    // Only position-property animations hold the POS_ANIM pin reason, so a
    // concurrent rotation animation on the same object is not a competing
    // release path and must not trip the new ambiguity check.
    expect(errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    animate { property: position, to: (20, 10), duration: 1, handoff: true }
    animate { property: rotation, to: 45, duration: 2 }
    physics { duration: 2 }
  }
}`)).toEqual([]);
  });

  it("allows a sequence handoff with two later physics steps (steps run exclusively, never concurrently)", () => {
    // Same shape as "picks the first later physics step..." above: two
    // physics steps after the handoff in one sequence are never concurrent
    // with each other (a sequence runs one step at a time), so this must
    // stay legal under the new ambiguity check.
    expect(errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    sequence {
      animate { property: position, to: (50, 50), duration: 1, handoff: true }
      physics { duration: 0.4 }
      physics { duration: 0.4 }
    }
  }
}`)).toEqual([]);
  });

  // --- Defect 2: the duration rule must compare converted tick counts (the
  // runtime's unit), not raw seconds, or a sub-tick gap in seconds can still
  // round to equal tick counts and reproduce the same-tick freeze-vs-flush
  // race TYPE_HANDOFF_DURATION exists to prevent.

  it("rejects a handoff whose physics duration is longer in seconds but rounds to the same tick count as the animation", () => {
    // Math.round(1 * 120) === Math.round(1.001 * 120) === 120. Before the
    // fix, the validator compared 1.001 > 1 in raw seconds and passed this.
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    animate { property: position, to: (50, 50), duration: 1, handoff: true }
    physics { duration: 1.001 }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_HANDOFF_DURATION");
  });

  it("allows a handoff once the physics duration clears the animation by at least one whole tick", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (10, 10)
    radius: 5
    animate { property: position, to: (50, 50), duration: 1, handoff: true }
    physics { duration: ${1 + 1 / 120} }
  }
}`)).toEqual([]);
  });
});

describe("TYPE_INVALID_SCALE (dead-contract-data fold-in)", () => {
  // scale's `positivePoint` contract constraint was dead data: this branch
  // special-cased `key === "scale"` before validateLocalConstraint ever ran,
  // so no consumer read the constraint. These pin the exact existing
  // messages so folding the check into the constraint system (or dropping
  // the dead entry) cannot silently change behaviour.
  //
  // Phase 3C reworded both. The code is unchanged, because the category (an
  // unusable scale value) is what tooling greps for, but "must be greater
  // than zero" became false when zero stopped being banned outright — and an
  // author who read it wrote `scale: 0.001`, the exact workaround Phase 3C
  // exists to delete (design §5.1). The wording names negativity and says
  // nothing about zero, which is now a separate rule with its own code.
  it("rejects a negative numeric scale with the exact TYPE_INVALID_SCALE message", () => {
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c { position: (10, 10), radius: 5, scale: -2 }
}`);
    expect(out).toEqual([
      "[TYPE_INVALID_SCALE] 'circle' object 'c': 'scale' cannot be negative, but got -2.",
    ]);
  });

  it("rejects a negative point scale component with the exact TYPE_INVALID_SCALE message", () => {
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c { position: (10, 10), radius: 5, scale: (2, -1) }
}`);
    expect(out).toEqual([
      "[TYPE_INVALID_SCALE] 'circle' object 'c': 'scale' cannot have a negative component, but got (2, -1).",
    ]);
  });

  it("allows a positive numeric or point scale", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  circle c { position: (10, 10), radius: 5, scale: 2 }
}`)).toEqual([]);
    expect(errorsFor(`scene {
  size: (100, 100)
  circle c { position: (10, 10), radius: 5, scale: (1.5, 0.5) }
}`)).toEqual([]);
  });

  it("allows a numeric zero scale on a non-physical object, which TYPE_INVALID_SCALE used to reject", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  circle c { position: (10, 10), radius: 5, scale: 0 }
}`)).toEqual([]);
  });
});

// Design §2.4. `TYPE_INVALID_SCALE` claimed to protect a WebGL matrix
// inversion Marey never performs; what is actually load-bearing is the
// physics seam — `transform.ts`'s `toLocal` divides by the ancestor chain's
// composed scale, and Matter's `Vertices.centre` divides a compound polygon
// part by its own area. An object's own visual scale reaches neither.
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

  it("permits a zero scale on a group whose descendants have no physics", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  group g {
    position: (50, 50)
    scale: (1, 0)
    circle c { position: (0, 0), radius: 5 }
  }
}`)).toEqual([]);
  });

  it("permits a zero scale on a non-physical child of a non-physical group", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  group g {
    position: (50, 50)
    circle c { position: (0, 0), radius: 5, scale: (1, 0) }
  }
}`)).toEqual([]);
  });
});

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
    // The full text, not a short substring: the clause that matched is part
    // of the requirement (design §5), and only clause 1 can produce this.
    expect(out[0]).toBe(
      "[TYPE_ZERO_SCALE_PHYSICS] 'circle' object 'c': 'scale' cannot have a zero component on an object that participates in physics, but got (1, 0). 'c' declares 'physics', and a zero-scaled body has no usable collision geometry.",
    );
  });

  it("rejects a zero scale on an object whose physics is a sequence step (D13)", () => {
    // Clause 1 follows `ownsPhysics`, not "has a direct physics child": D13
    // makes a sequence step's physics block the object's own body too.
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (50, 50)
    radius: 5
    scale: (1, 0)
    sequence {
      animate { property: alpha, to: 0.5, duration: 0.5 }
      physics { duration: 1 }
    }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("[TYPE_ZERO_SCALE_PHYSICS]");
    expect(out[0]).toContain("'c' declares 'physics'");
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
    expect(out[0]).toBe(
      "[TYPE_ZERO_SCALE_PHYSICS] 'group' object 'g': 'scale' cannot have a zero component on an object that participates in physics, but got (1, 0). Group 'g' contains an object with 'physics', and the group's scale is composed into that body's transform.",
    );
  });

  it("rejects a zero scale on a group whose physics descendant is two levels down", () => {
    const out = errorsFor(`scene {
  size: (100, 100)
  group outer {
    position: (50, 50)
    scale: (1, 0)
    group inner {
      position: (0, 0)
      circle c { position: (0, 0), radius: 5, physics { duration: 1 } }
    }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("[TYPE_ZERO_SCALE_PHYSICS]");
    expect(out[0]).toContain("Group 'outer' contains an object with 'physics'");
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
    expect(out[0]).toBe(
      "[TYPE_ZERO_SCALE_PHYSICS] 'circle' object 'c': 'scale' cannot have a zero component on an object that participates in physics, but got (1, 0). 'c' is inside group 'g', which declares 'physics' and bakes its children's geometry into one body.",
    );
  });

  it("rejects a zero scale under a group whose physics is a sequence step", () => {
    // Pins a judgment call clause 2 had to make and that nothing else in the
    // suite has an opinion about: "a group that declares physics" follows
    // `ownsPhysics` — D13's rule, so a sequence step counts — not "has a
    // direct 'physics' child". Narrowing it to direct children left the whole
    // suite green, and it would be wrong: the group still welds its children
    // into one compound body when that step runs, so this child's geometry
    // still reaches Matter's `Vertices.centre` and its zero area.
    const out = errorsFor(`scene {
  size: (100, 100)
  group g {
    position: (50, 50)
    sequence {
      animate { property: alpha, to: 0.5, duration: 0.5 }
      physics { duration: 1 }
    }
    circle c { position: (0, 0), radius: 5, scale: (1, 0) }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("[TYPE_ZERO_SCALE_PHYSICS]");
    expect(out[0]).toContain("'c' is inside group 'g', which declares 'physics'");
  });

  it("rejects a zero numeric scale, not only a zero point component", () => {
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (50, 50)
    radius: 5
    scale: 0
    physics { duration: 1 }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(
      "[TYPE_ZERO_SCALE_PHYSICS] 'circle' object 'c': 'scale' cannot be zero on an object that participates in physics, but got 0. 'c' declares 'physics', and a zero-scaled body has no usable collision geometry.",
    );
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
    expect(out[0]).toBe(
      "[TYPE_ZERO_SCALE_PHYSICS] The 'animate' block: the scale target 'to' cannot have a zero component on an object that participates in physics, but got (0, 1). 'c' declares 'physics', and a zero-scaled body has no usable collision geometry.",
    );
  });

  it("rejects a zero animated scale target inside a sequence step, whose owner is the object (D13)", () => {
    // The owning renderable is found by skipping `sequence`/`parallel`
    // wrappers, which D13 says are not owners — the same rule the
    // TYPE_PHYSICS_IN_PHYSICS_GROUP walk uses.
    const out = errorsFor(`scene {
  size: (100, 100)
  group g {
    position: (50, 50)
    physics { duration: 1 }
    circle c {
      position: (0, 0)
      radius: 5
      sequence {
        animate { property: scale, to: (0, 1), duration: 1 }
      }
    }
  }
}`);
    expect(out.filter((e) => e.includes("[TYPE_ZERO_SCALE_PHYSICS]"))).toHaveLength(1);
    expect(out[0]).toContain("'c' is inside group 'g'");
  });
});

describe("negative scale (the narrowing)", () => {
  // Roadmap §5.2's required regression test. `to: (-3, 1)` compiled with zero
  // errors before Phase 3C: `validator.ts`'s animate branch checked `to` by
  // *kind* only. The value assertion is deliberate — it pins that the
  // diagnostic names the offending value, so this cannot pass by way of a
  // neighbouring TYPE_INVALID_SCALE from a declared `scale` property.
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
    expect(out[0]).toBe(
      "[TYPE_INVALID_SCALE] The 'animate' block: the scale target 'to' cannot have a negative component, but got (-3, 1).",
    );
  });

  it("rejects a negative numeric animated scale target", () => {
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (50, 50)
    radius: 5
    animate { property: scale, to: -3, duration: 1 }
  }
}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(
      "[TYPE_INVALID_SCALE] The 'animate' block: the scale target 'to' cannot be negative, but got -3.",
    );
  });

  it("still allows a positive animated scale target", () => {
    expect(errorsFor(`scene {
  size: (100, 100)
  circle c {
    position: (50, 50)
    radius: 5
    animate { property: scale, to: (2, 0.5), duration: 1 }
  }
}`)).toEqual([]);
  });
});

describe("listOf's generic path (Fix 1)", () => {
  // No property in LANGUAGE_CONTRACT declares `listOf` with an element other
  // than "point" (only polygon.points and line.points use it, both
  // `element: "point"`), so no source text the parser accepts can drive
  // `validateLocalConstraint`'s listOf case down its non-point branch —
  // `collectErrors` only ever reaches that case with a `spec` read straight
  // out of `LANGUAGE_CONTRACT` (validator.ts, `collectErrors`, the
  // `LANGUAGE_CONTRACT[...].properties[key]` lookup feeding
  // `validateLocalConstraint`). `validateLocalConstraint` is exported
  // (validator.ts) for exactly this reason: calling it directly with a
  // synthetic `PropertySpec`/`AstValue` pair exercises the real function,
  // not a reimplementation of it, without needing a second non-point list
  // property to exist in the language just to reach it.
  const numberValue = (n: number, col: number): AstValue => ({
    kind: "number", value: n, line: 1, col, endLine: 1, endCol: col + String(n).length,
  });
  const numberList = (nums: number[]): AstValue => ({
    kind: "list",
    value: nums.map((n, i) => numberValue(n, i + 1)),
    line: 1, col: 1, endLine: 1, endCol: 10,
  });
  const numberListSpec = (min: number, max: number): PropertySpec => ({
    kinds: "list",
    description: "test-only",
    example: "test-only",
    placeholder: "test-only",
    constraint: { kind: "listOf", element: "number", min, max },
  });

  it("uses the element's plural noun instead of the hardcoded 'points' for a too-short list", () => {
    const err = validateLocalConstraint(
      "'star' object 's'", "star", "radii", numberList([1]), numberListSpec(2, 8),
    );
    expect(err?.message).toBe("'star' object 's': 'star' requires at least 2 numbers.");
  });

  it("uses a generic diagnostic code, not TYPE_POLYGON_TOO_LARGE, for a too-long non-point list", () => {
    const err = validateLocalConstraint(
      "'star' object 's'", "star", "radii", numberList([1, 2, 3]), numberListSpec(1, 2),
    );
    expect(err?.message).toBe(
      "[TYPE_LIST_TOO_LARGE] 'star' object 's': 'star' exceeds the maximum safe limit of 2 numbers.",
    );
  });

  it("reports nothing for a count within [min, max]", () => {
    const err = validateLocalConstraint(
      "'star' object 's'", "star", "radii", numberList([1, 2]), numberListSpec(1, 3),
    );
    expect(err).toBeUndefined();
  });
});

describe("TYPE_ONE_PHYSICS", () => {
  it("rejects a second direct physics block instead of silently dropping it", () => {
    const src = `
      scene {
        size: (100, 100)
        circle c {
          position: (0, 0)
          radius: 10
          physics { duration: 1 }
          physics { duration: 2 }
        }
      }
    `;
    const errors = diagnosticsFor(src);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("[TYPE_ONE_PHYSICS]");
    expect(errors[0].message).toContain("maximum of one 'physics' block");
  });

  it("fires with no handoff anywhere — the existing rule only covers the handoff shape", () => {
    const src = `
      scene {
        size: (100, 100)
        rectangle r {
          position: (0, 0)
          size: (10, 10)
          physics { duration: 1 }
          physics { duration: 1 }
        }
      }
    `;
    expect(errorsFor(src).join()).toContain("[TYPE_ONE_PHYSICS]");
  });

  it("still allows one direct physics block alongside a sequence that also has one", () => {
    const src = `
      scene {
        size: (100, 100)
        circle c {
          position: (0, 0)
          radius: 10
          physics { duration: 5 }
          sequence { physics { duration: 1 } }
        }
      }
    `;
    expect(errorsFor(src)).toEqual([]);
  });

  // Fix round 1: typeChecker/builder.ts's buildSequencesFromChildren builds every
  // physics child of a sequence/parallel step with a plain loop, not `.find` —
  // so a sequence (or parallel) with two direct physics phases is not the
  // .find()-truncation defect this rule guards against, and must stay legal.
  it("does not raise TYPE_ONE_PHYSICS for a sequence with two direct physics phases", () => {
    const src = `
      scene {
        size: (100, 100)
        circle c {
          position: (0, 0)
          radius: 10
          sequence {
            physics { duration: 1 }
            physics { duration: 1 }
          }
        }
      }
    `;
    expect(errorsFor(src)).toEqual([]);
  });

  it("does not raise TYPE_ONE_PHYSICS for a parallel with two direct physics children", () => {
    const src = `
      scene {
        size: (100, 100)
        circle c {
          position: (0, 0)
          radius: 10
          sequence {
            parallel {
              physics { duration: 1 }
              physics { duration: 1 }
              animate { property: alpha, to: 0.5, duration: 1 }
            }
          }
        }
      }
    `;
    expect(errorsFor(src)).toEqual([]);
  });

  // Fix round 1: the shipped rule suppressed itself entirely whenever the
  // object had a handoff: true animate child, relying solely on
  // TYPE_HANDOFF_SCHEDULE_AMBIGUOUS to say anything about the physics count.
  // That suppression is removed — this is the general, handoff-independent
  // rule the brief specified, and it must fire here regardless of whatever
  // else also fires.
  it("fires TYPE_ONE_PHYSICS on a handoff-adjacent object with two direct physics blocks", () => {
    const src = `
      scene {
        size: (100, 100)
        circle c {
          position: (10, 10)
          radius: 5
          animate { property: position, to: (50, 50), duration: 1, handoff: true }
          physics { duration: 2 }
          physics { duration: 0.5 }
        }
      }
    `;
    expect(errorsFor(src).join()).toContain("[TYPE_ONE_PHYSICS]");
  });
});

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
      "The 'animate' block: 'delay' must be 0 or greater, but got -0.5.",
    ]);
  });
});

describe("scene duration", () => {
  it("accepts a finite positive duration", () => {
    expect(errorsFor(`scene { size: (100, 100) duration: 5 }`)).toEqual([]);
  });

  it("rejects a zero or negative duration", () => {
    // The brief's fixture asserted "greater than zero" (spelled out), but the
    // existing `key === "duration"` special case in validateLocalConstraint's
    // "positive" branch (validator.ts) produces "greater than 0" with a
    // digit — the same wording `animate.duration` and `physics.duration`
    // already get. Asserting the real string here rather than the one that
    // never matches (AGENT-LESSONS §3d: a verbatim fixture is a claim to check).
    const out = errorsFor(`scene { size: (100, 100) duration: 0 }`);
    expect(out.join("\n")).toContain("must be strictly greater than 0");
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
