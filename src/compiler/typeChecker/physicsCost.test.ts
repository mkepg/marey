import { describe, expect, it } from "vitest";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import type { CompilerError } from "../types";
import { countPhysicsCost } from "./physicsCost";

function diagnosticsFor(source: string): CompilerError[] {
  const parsed = parse(lex(source));
  if (parsed.errors.length > 0) return parsed.errors;
  return typeCheck(parsed.ast!).errors;
}

function costFor(source: string): { bodies: number; parts: number } {
  const parsed = parse(lex(source));
  expect(parsed.errors).toEqual([]);
  const cost = countPhysicsCost(parsed.ast!);
  return { bodies: cost.bodies, parts: cost.parts };
}

const scene = (body: string): string =>
  `scene {\n  size: (100, 100)\n${body}\n}`;

const physicalCircle = (i: number): string =>
  `  circle c${i} { position: (${i}, 10), radius: 1, physics { duration: 1 } }`;

const sequenceCircle = (i: number): string =>
  `  circle c${i} { position: (${i}, 10), radius: 1, sequence { physics { duration: 1 } } }`;

function physicalGroup(partCount: number, nested: boolean): string {
  const leaves = Array.from({ length: partCount }, (_, i) =>
    `    circle c${i} { position: (${i}, 10), radius: 1 }`
  ).join("\n");
  const contents = nested
    ? `    group inner {\n      position: (0, 0)\n${leaves}\n    }`
    : leaves;
  return `  group compound {\n    position: (50, 50)\n    physics { duration: 1 }\n${contents}\n  }`;
}

describe("physics body and collision-part ceilings", () => {
  it("counts ordinary physical bodies and one part per body", () => {
    expect(costFor(scene([
      physicalCircle(0),
      physicalCircle(1),
    ].join("\n")))).toEqual({ bodies: 2, parts: 2 });
  });

  it("counts sequence-created physics as one body and one part", () => {
    expect(costFor(scene([
      sequenceCircle(0),
      sequenceCircle(1),
    ].join("\n")))).toEqual({ bodies: 2, parts: 2 });
  });

  it("counts multiple physics steps on one object only once", () => {
    expect(costFor(scene(`  circle c {
    position: (0, 0)
    radius: 1
    physics { duration: 1 }
    sequence { physics { duration: 1 } }
  }`))).toEqual({ bodies: 1, parts: 1 });
  });

  it("counts physics in a sequence parallel step", () => {
    expect(costFor(scene(`  circle c {
    position: (0, 0)
    radius: 1
    sequence {
      parallel {
        animate { property: alpha, to: 0.5, duration: 1 }
        physics { duration: 1 }
      }
    }
  }`))).toEqual({ bodies: 1, parts: 1 });
  });

  it("counts every flattened leaf as a physical-group part", () => {
    expect(costFor(scene(physicalGroup(3, false)))).toEqual({ bodies: 1, parts: 3 });
  });

  it("counts leaves through nested visual groups without adding a body", () => {
    expect(costFor(scene(physicalGroup(3, true)))).toEqual({ bodies: 1, parts: 3 });
  });

  it("does not charge nonphysical visuals", () => {
    expect(costFor(scene([
      "  circle c { position: (0, 0), radius: 1 }",
      "  group g { position: (0, 0), circle d { position: (0, 0), radius: 1 } }",
    ].join("\n")))).toEqual({ bodies: 0, parts: 0 });
  });

  it("allows exactly 500 ordinary physics bodies", () => {
    const source = scene(Array.from({ length: 500 }, (_, i) => physicalCircle(i)).join("\n"));
    expect(diagnosticsFor(source)).toEqual([]);
  });

  it("rejects ordinary physics body 501", () => {
    const source = scene(Array.from({ length: 501 }, (_, i) => physicalCircle(i)).join("\n"));
    const errors = diagnosticsFor(source).filter((error) => error.message.includes("TYPE_PHYSICS_BODY_LIMIT"));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("501");
    expect(errors[0]).toMatchObject({ line: 503 });
  });

  it("allows exactly 500 sequence-created physics bodies", () => {
    const source = scene(Array.from({ length: 500 }, (_, i) => sequenceCircle(i)).join("\n"));
    expect(diagnosticsFor(source)).toEqual([]);
  });

  it("rejects sequence-created physics body 501", () => {
    const source = scene(Array.from({ length: 501 }, (_, i) => sequenceCircle(i)).join("\n"));
    const errors = diagnosticsFor(source).filter((error) => error.message.includes("TYPE_PHYSICS_BODY_LIMIT"));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("501");
  });

  it("counts generated physics bodies after expansion", () => {
    const source = scene(`  generate i from 0 to 500 {
    circle c { position: (i, 10), radius: 1, physics { duration: 1 } }
  }`);
    const errors = diagnosticsFor(source).filter((error) => error.message.includes("TYPE_PHYSICS_BODY_LIMIT"));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("501");
  });

  it("counts template instances after expansion", () => {
    const source = `template Ball() {
  circle c { position: (0, 0), radius: 1, physics { duration: 1 } }
}
${scene("  generate i from 0 to 500 { use Ball() ball }")}`;
    const errors = diagnosticsFor(source).filter((error) => error.message.includes("TYPE_PHYSICS_BODY_LIMIT"));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("501");
  });

  it("allows exactly 2,000 parts in one physical group", () => {
    expect(diagnosticsFor(scene(physicalGroup(2_000, false)))).toEqual([]);
  });

  it("rejects physical-group part 2,001", () => {
    const errors = diagnosticsFor(scene(physicalGroup(2_001, false)))
      .filter((error) => error.message.includes("TYPE_PHYSICS_PART_LIMIT"));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("2,001");
    expect(errors[0]).toMatchObject({ line: 2_006, col: 5 });
  });

  it("allows exactly 2,000 parts through a nested visual group", () => {
    expect(diagnosticsFor(scene(physicalGroup(2_000, true)))).toEqual([]);
  });

  it("rejects nested physical-group part 2,001", () => {
    const errors = diagnosticsFor(scene(physicalGroup(2_001, true)))
      .filter((error) => error.message.includes("TYPE_PHYSICS_PART_LIMIT"));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("2,001");
    expect(errors[0]).toMatchObject({ line: 2_008, col: 5 });
  });

  it("emits each physics-limit diagnostic at most once", () => {
    const source = scene([
      ...Array.from({ length: 501 }, (_, i) => physicalCircle(i)),
      physicalGroup(2_001, false),
    ].join("\n"));
    const errors = diagnosticsFor(source);
    expect(errors.filter((error) => error.message.includes("TYPE_PHYSICS_BODY_LIMIT"))).toHaveLength(1);
    expect(errors.filter((error) => error.message.includes("TYPE_PHYSICS_PART_LIMIT"))).toHaveLength(1);
  });

  it("keeps physics-limit diagnostics under the validator's 50-error ceiling", () => {
    const invalidLines = Array.from({ length: 60 }, (_, i) => `  line l${i} { position: (0, 0), points: [(0, 0), (1, 1)], thickness: 1, physics { duration: 1 } }`);
    const errors = diagnosticsFor(scene(invalidLines.join("\n")));
    expect(errors).toHaveLength(50);
    expect(errors.every((error) => error.message.includes("TYPE_LINE_PHYSICS"))).toBe(true);
  });

  it("does not charge more than 500 nonphysical objects to physics ceilings", () => {
    const source = scene(Array.from({ length: 501 }, (_, i) =>
      `  circle c${i} { position: (${i}, 10), radius: 1 }`
    ).join("\n"));
    expect(diagnosticsFor(source)).toEqual([]);
  });
});
