import { describe, expect, it } from "vitest";
import { lex } from "./lexer";
import { parse } from "./parser";
import { typeCheck } from "./typeChecker";

function irFor(source: string) {
  const parsed = parse(lex(source));
  expect(parsed.errors).toEqual([]);
  expect(parsed.ast).not.toBeNull();

  const checked = typeCheck(parsed.ast!);
  expect(checked.errors).toEqual([]);
  expect(checked.ir).not.toBeNull();
  return checked.ir!;
}

const COMPLEX_SOURCE = `
let radius = 6

template Badge(tone) {
  rectangle core {
    position: (0, 0)
    size: (10, 10)
    color: tone
  }
}

scene {
  size: (200, 200)
  fit: contain

  group stage {
    position: (10, 10)
    generate i in 0 to 1 {
      generate j in 0 to 1 {
        use Badge(cyan) item { position: (20 + i * 30, 20 + j * 30) }
      }
    }
  }

  circle mover {
    position: (40, 40)
    radius: radius
    animate {
      property: position
      to: (80, 40)
      duration: 1
      handoff: true
    }
    physics { gravity: (0, 10), duration: 2 }
    sequence {
      animate { property: rotation, to: 90, duration: 0.5 }
      parallel {
        animate { property: scale, to: (2, 2), duration: 0.5 }
        physics { gravity: (0, 10), duration: 0.5 }
      }
    }
  }

  circle body {
    position: (100, 100)
    radius: 8
    physics { gravity: (0, 10), duration: indefinitely }
  }
}
`;

const COMPACT_SOURCE = `scene { size:(100,100) fit:contain circle dot { position:(20,20) radius:5 layer:2 animate { property:position to:(40,20) duration:1 handoff:true } physics { duration:2 } } }`;

const EXPANDED_SOURCE = `
scene {
  size: (100, 100)
  fit: contain
  circle dot {
    position: (20, 20)
    radius: 5
    layer: 2
    animate {
      property: position
      to: (40, 20)
      duration: 1
      handoff: true
    }
    physics { duration: 2 }
  }
}
`;

const PRIMITIVE_GOLDEN_SOURCE = `
scene {
  size: (160, 120)
  background: #101820
  fit: cover
  circle back { position: (80, 60), radius: 30, color: cyan, layer: -1 }
  rectangle front { position: (80, 60), size: (40, 20), color: magenta, alpha: 0.5, layer: 1 }
  text label { position: (80, 100), content: "stable", fontSize: 12, color: white, layer: 2 }
}
`;

const MACRO_GOLDEN_SOURCE = `
let floor = 110

template Token(tone) {
  circle dot {
    position: (0, 0)
    radius: 5
    color: tone
    animate {
      property: position
      to: (20, 0)
      duration: 1
      handoff: true
    }
    physics { duration: 2 }
  }
}

scene {
  size: (240, 140)
  fit: fill
  generate i in 0 to 1 {
    use Token(cyan) token { position: (40 + i * 70, 30), layer: i }
  }
  rectangle staged {
    position: (120, 80)
    size: (20, 20)
    layer: 3
    sequence {
      animate { property: rotation, to: 90, duration: 0.25 }
      parallel {
        animate { property: position, to: (130, 80), duration: 0.5 }
        physics { gravity: (0, 20), duration: 0.5 }
      }
      physics { gravity: (0, 20), duration: 0.5 }
    }
  }
  circle floorBall {
    position: (200, floor)
    radius: 8
    physics { gravity: (0, 20), duration: indefinitely }
  }
}
`;

const PHASE_3B_GOLDEN_SOURCE = `
let radii = [20, 35, 20, 35, 20, 35]
let tones = [orange, cyan]
let count = length(radii)
let ring  = 220

scene {
  size: (800, 600)
  background: #0a0e1a

  generate r, i in radii {
    let major = i % 2 == 0
    let angle = i * 360 / count
    circle dot {
      position: (400 + ring * cos(angle), 300 + ring * sin(angle))
      radius: if major then r else r / 2
      color: tones[i % 2]
    }
  }
}
`;

describe("compiler determinism", () => {
  it("produces identical AST and IR on repeated compilation", () => {
    const parses = Array.from({ length: 20 }, () => parse(lex(COMPLEX_SOURCE)));
    for (const result of parses) expect(result.errors).toEqual([]);
    for (const result of parses.slice(1)) expect(result).toEqual(parses[0]);

    const checked = parses.map(({ ast }) => {
      const result = typeCheck(ast!);
      expect(result.errors).toEqual([]);
      expect(result.ir).not.toBeNull();
      return result.ir!;
    });
    const payloads = checked.map((ir) => JSON.stringify(ir));
    expect(new Set(payloads).size).toBe(1);
  });

  it("keeps IR independent of formatting-only changes", () => {
    expect(irFor(COMPACT_SOURCE)).toEqual(irFor(EXPANDED_SOURCE));
  });

  it("keeps primitive defaults and layer order in the Scene IR", () => {
    expect(irFor(PRIMITIVE_GOLDEN_SOURCE)).toMatchSnapshot();
  });

  it("keeps macro, sequence, parallel, and physics IR stable", () => {
    expect(irFor(MACRO_GOLDEN_SOURCE)).toMatchSnapshot();
  });

  it("keeps list, indexed generate, modulo, comparison, conditional, and trig IR stable", () => {
    expect(irFor(PHASE_3B_GOLDEN_SOURCE)).toMatchSnapshot();
  });
});

describe("trigonometry produces the coordinates it claims", () => {
  it("places twelve dots on a circle of radius 180 about (400, 300)", () => {
    const src = `
      scene {
        size: (800, 600)
        generate i in 0 to 11 {
          let angle = i * 30
          circle dot {
            position: (400 + 180 * cos(angle), 300 + 180 * sin(angle))
            radius: 9
          }
        }
      }
    `;
    const ir = irFor(src);
    const positions = ir!.children.map((c) => (c.props as { position: { x: number; y: number } }).position);
    expect(positions).toHaveLength(12);

    // Computed here from first principles, not read out of the compiler.
    for (let i = 0; i < 12; i++) {
      const rad = (i * 30 * Math.PI) / 180;
      expect(positions[i].x).toBeCloseTo(400 + 180 * Math.cos(rad), 9);
      expect(positions[i].y).toBeCloseTo(300 + 180 * Math.sin(rad), 9);
    }

    // Every dot is exactly 180 from the centre — the property a sign error breaks.
    for (const p of positions) {
      expect(Math.hypot(p.x - 400, p.y - 300)).toBeCloseTo(180, 9);
    }

    // ...and they are twelve distinct points, not one point twelve times.
    expect(new Set(positions.map((p) => `${p.x},${p.y}`)).size).toBe(12);
  });
});
