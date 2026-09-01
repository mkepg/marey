import { describe, it, expect } from "vitest";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";

function errorsFor(source: string): string[] {
  const { ast, errors } = parse(lex(source));
  if (errors.length > 0) return errors.map((e) => e.message);
  const { errors: typeErrors } = typeCheck(ast!);
  return typeErrors.map((e) => e.message);
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
