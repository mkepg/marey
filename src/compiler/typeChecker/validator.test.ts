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
    expect(shorter.some((m) => m.includes("TYPE_HANDOFF_DURATION"))).toBe(true);

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
    expect(equal.some((m) => m.includes("TYPE_HANDOFF_DURATION"))).toBe(true);
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
});
