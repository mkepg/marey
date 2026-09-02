import { describe, it, expect } from "vitest";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import type { CompilerError } from "../types";

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
        generate i from 0 to 2 {
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
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_HANDOFF_SCHEDULE_AMBIGUOUS");
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
  it("rejects a non-positive numeric scale with the exact TYPE_INVALID_SCALE message", () => {
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c { position: (10, 10), radius: 5, scale: 0 }
}`);
    expect(out).toEqual([
      "[TYPE_INVALID_SCALE] 'circle' object 'c': 'scale' must be greater than zero.",
    ]);
  });

  it("rejects a non-positive point scale with the exact TYPE_INVALID_SCALE message", () => {
    const out = errorsFor(`scene {
  size: (100, 100)
  circle c { position: (10, 10), radius: 5, scale: (2, -1) }
}`);
    expect(out).toEqual([
      "[TYPE_INVALID_SCALE] 'circle' object 'c': 'scale' components must be greater than zero, but got (2, -1).",
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
});
