import { describe, it, expect } from "vitest";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import type { CompilerError } from "../types";
import type { IRAnimation } from "../sceneIR";

function check(source: string): { errors: CompilerError[]; anims: IRAnimation[] } {
  const { ast, errors } = parse(lex(source));
  if (errors.length > 0) return { errors, anims: [] };
  const out = typeCheck(ast!);
  return { errors: out.errors, anims: out.ir ? out.ir.children[0].props.animations.slice() : [] };
}

const messages = (errors: CompilerError[]) => errors.map((e) => e.message);

function scene(body: string): string {
  return `scene {\n  size: (200, 200)\n${body}\n}`;
}

describe("animate { from }", () => {
  it("builds from into the IR, and null when it is absent", () => {
    const withFrom = check(scene(`
  circle c { position: (100, 100), radius: 10, alpha: 1
    animate { property: alpha, from: 0, to: 1, duration: 1 } }`));
    expect(messages(withFrom.errors)).toEqual([]);
    expect(withFrom.anims[0].from).toBe(0);

    const without = check(scene(`
  circle c { position: (100, 100), radius: 10
    animate { property: alpha, to: 1, duration: 1 } }`));
    expect(messages(without.errors)).toEqual([]);
    expect(without.anims[0].from).toBeNull();
  });

  it("carries a point and a normalised colour the way 'to' does", () => {
    const { errors, anims } = check(scene(`
  circle c { position: (100, 100), radius: 10, color: red
    animate { property: position, from: (10, 20), to: (100, 100), duration: 1 }
    animate { property: scale, from: 0.5, to: 1, duration: 1 }
    animate { property: color, from: #f80, to: blue, duration: 1 } }`));
    expect(messages(errors)).toEqual([]);
    expect(anims.map((a) => a.from)).toEqual([{ x: 10, y: 20 }, 0.5, "#ff8800"]);
  });

  it("rejects a point 'from' on alpha with the mismatch wording naming 'from'", () => {
    const { errors } = check(scene(`
  circle c { position: (100, 100), radius: 10
    animate { property: alpha, from: (1, 1), to: 1, duration: 1 } }`));
    expect(messages(errors)).toEqual([
      "[TYPE_ANIM_MISMATCH] Property 'alpha' expects a number for 'from'.",
    ]);
  });

  it("names 'from' in every kind mismatch, each beside the 'to' wording it parallels", () => {
    const { errors } = check(scene(`
  circle c { position: (100, 100), radius: 10, color: red
    animate { property: position, from: 3, to: (1, 1), duration: 1 }
    animate { property: scale, from: red, to: 1, duration: 1 }
    animate { property: rotation, from: (1, 1), to: 90, duration: 1 }
    animate { property: color, from: 0.5, to: red, duration: 1 } }`));
    expect(messages(errors)).toEqual([
      "[TYPE_ANIM_MISMATCH] Property 'position' expects a point for 'from' (e.g., from: (100, 100)).",
      "[TYPE_ANIM_MISMATCH] Property 'scale' expects a number or point for 'from'.",
      "[TYPE_ANIM_MISMATCH] Property 'rotation' expects a number for 'from'.",
      "[TYPE_ANIM_MISMATCH] Property 'color' expects a colour for 'from' (e.g., from: #ff8800).",
    ]);
  });

  it("rejects a negative scale 'from' with TYPE_INVALID_SCALE", () => {
    const { errors } = check(scene(`
  circle c { position: (100, 100), radius: 10
    animate { property: scale, from: (-1, 1), to: 1, duration: 1 } }`));
    expect(messages(errors)).toEqual([
      "[TYPE_INVALID_SCALE] The 'animate' block: the scale start 'from' cannot have a negative component, but got (-1, 1).",
    ]);
  });

  it("rejects a zero scale 'from' on a physics object with TYPE_ZERO_SCALE_PHYSICS", () => {
    const { errors } = check(scene(`
  circle c { position: (100, 100), radius: 10
    physics { duration: 1 }
    animate { property: scale, from: (1, 0), to: 1, duration: 1 } }`));
    expect(messages(errors)).toEqual([
      "[TYPE_ZERO_SCALE_PHYSICS] The 'animate' block: the scale start 'from' cannot have a zero component on an object that participates in physics, but got (1, 0). 'c' declares 'physics', and a zero-scaled body has no usable collision geometry.",
    ]);
  });

  it("rejects a colour 'from' on a group's colour animation with TYPE_ANIM_COLOR_TARGET at the 'from' value", () => {
    const source = scene(`
  group g { position: (100, 100)
    circle c { position: (0, 0), radius: 10, color: red }
    animate { property: color, to: blue, from: #ff0000, duration: 1 } }`);
    const { errors } = check(source);
    const groupError =
      "[TYPE_ANIM_COLOR_TARGET] 'property: color' can only animate a shape with a 'color' (circle, rectangle, polygon, line or text); 'g' is a group.";
    const colourTargets = errors.filter((e) => e.message === groupError);
    // One for 'to', which has always pointed at 'property: color', and one for
    // 'from', which points at its own value so the two are not one diagnostic
    // printed twice.
    expect(colourTargets).toHaveLength(2);
    const lines = source.split("\n");
    const fromLine = lines.findIndex((l) => l.includes("from: #ff0000")) + 1;
    const fromCol = lines[fromLine - 1].indexOf("#ff0000") + 1;
    const propCol = lines[fromLine - 1].indexOf("color,") + 1;
    expect(colourTargets.map((e) => [e.line, e.col])).toEqual([
      [fromLine, propCol],
      [fromLine, fromCol],
    ]);
  });
});

describe("animate { to } mismatch wordings", () => {
  // The 'to' twin of the four-wordings test above. animateValueErrors builds
  // both slots' messages from one template, and the 'to' messages must read
  // exactly as they did before 'from' existed.
  it("words every kind mismatch on 'to' exactly as before 'from' existed", () => {
    const { errors } = check(scene(`
  circle c { position: (100, 100), radius: 10, color: red
    animate { property: position, to: 3, duration: 1 }
    animate { property: scale, to: red, duration: 1 }
    animate { property: rotation, to: (1, 1), duration: 1 }
    animate { property: color, to: 0.5, duration: 1 } }`));
    expect(messages(errors)).toEqual([
      "[TYPE_ANIM_MISMATCH] Property 'position' expects a point for 'to' (e.g., to: (100, 100)).",
      "[TYPE_ANIM_MISMATCH] Property 'scale' expects a number or point for 'to'.",
      "[TYPE_ANIM_MISMATCH] Property 'rotation' expects a number for 'to'.",
      "[TYPE_ANIM_MISMATCH] Property 'color' expects a colour for 'to' (e.g., to: #ff8800).",
    ]);
  });
});
