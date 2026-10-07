import { describe, it, expect } from "vitest";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import type { IRObjectNode, IRAnimation, IRSequence } from "../sceneIR";

function check(source: string) {
  const { ast, errors } = parse(lex(source));
  if (errors.length > 0) return { errors: errors.map((e) => e.message), ir: null };
  const out = typeCheck(ast!);
  return { errors: out.errors.map((e) => e.message), ir: out.ir };
}

function scene(body: string): string {
  return `scene {\n  size: (200, 200)\n${body}\n}`;
}

function firstAnim(node: IRObjectNode): IRAnimation {
  return node.props.animations[0];
}

const GROUP_ERROR = (name: string) =>
  `[TYPE_ANIM_COLOR_TARGET] 'property: color' can only animate a shape with a 'color' (circle, rectangle, polygon, line or text); '${name}' is a group.`;

describe("animate { property: color }", () => {
  it("accepts a hex colour and carries it into the IR normalised", () => {
    const { errors, ir } = check(scene(`
      circle c { position: (100, 100), radius: 10, color: red
        animate { property: color, to: #f80, duration: 1 } }`));
    expect(errors).toEqual([]);
    expect(firstAnim(ir!.children[0]).to).toBe("#ff8800");
  });

  it("accepts a named colour and a let binding", () => {
    const { errors, ir } = check(`let accent = #00ff80\n` + scene(`
      circle a { position: (50, 50), radius: 10, color: red
        animate { property: color, to: blue, duration: 1 } }
      circle b { position: (150, 50), radius: 10, color: red
        animate { property: color, to: accent, duration: 1 } }`));
    expect(errors).toEqual([]);
    expect(firstAnim(ir!.children[0]).to).toBe("#0000ff");
    expect(firstAnim(ir!.children[1]).to).toBe("#00ff80");
  });

  it("accepts colour steps inside a sequence and a parallel", () => {
    const { errors, ir } = check(scene(`
      rectangle r { position: (100, 100), size: (40, 40), color: red
        sequence {
          animate { property: color, to: blue, duration: 0.5 }
          parallel {
            animate { property: color, to: #00ff80, duration: 0.5 }
            animate { property: alpha, to: 0.5, duration: 0.5 }
          }
        } }`));
    expect(errors).toEqual([]);
    const seq: IRSequence = ir!.children[0].props.sequences[0];
    expect((seq.steps[0] as IRAnimation).to).toBe("#0000ff");
  });

  it("rejects a non-colour 'to' with the colour mismatch wording", () => {
    const { errors } = check(scene(`
      circle c { position: (100, 100), radius: 10, color: red
        animate { property: color, to: 0.5, duration: 1 } }`));
    expect(errors).toContain("[TYPE_ANIM_MISMATCH] Property 'color' expects a colour for 'to' (e.g., to: #ff8800).");
  });

  it("rejects a colour 'to' on a numeric property", () => {
    const { errors } = check(scene(`
      circle c { position: (100, 100), radius: 10, color: red
        animate { property: alpha, to: blue, duration: 1 } }`));
    expect(errors.join("\n")).toContain("[TYPE_ANIM_MISMATCH] Property 'alpha' expects a number for 'to'.");
  });

  it("rejects colour animation on a group, directly and through a sequence", () => {
    const direct = check(scene(`
      group g { position: (100, 100)
        circle c { position: (0, 0), radius: 10, color: red }
        animate { property: color, to: blue, duration: 1 } }`));
    expect(direct.errors).toContain(GROUP_ERROR("g"));

    const viaSeq = check(scene(`
      group g { position: (100, 100)
        circle c { position: (0, 0), radius: 10, color: red }
        sequence { animate { property: color, to: blue, duration: 1 } } }`));
    expect(viaSeq.errors).toContain(GROUP_ERROR("g"));
  });

  it("rejects colour animation on a use instance, which expands to a group", () => {
    // A `use` block holds only group-level properties, so the animate has to
    // come from the template body; the expansion is a group named after the
    // instance, and that group is the animate's owner.
    const { errors } = check(`template Dot(tone) {
  circle d { position: (0, 0), radius: 10, color: tone }
  animate { property: color, to: blue, duration: 1 }
}
` + scene(`
      use Dot(red) inst { position: (100, 100) }`));
    expect(errors).toContain(GROUP_ERROR("inst"));
  });

  it("lists five animatable properties when one is unknown", () => {
    const { errors } = check(scene(`
      circle c { position: (100, 100), radius: 10, color: red
        animate { property: radius, to: 5, duration: 1 } }`));
    expect(errors).toContain("[TYPE_ANIM_PROP] Cannot animate property 'radius'. Supported properties are: position, rotation, scale, alpha, color.");
  });

  it("rejects handoff on a colour animation through the existing rule", () => {
    const { errors } = check(scene(`
      circle c { position: (100, 100), radius: 10, color: red
        animate { property: color, to: blue, duration: 1, handoff: true }
        physics { gravity: (0, 900), duration: 2 } }`));
    expect(errors.join("\n")).toContain("[TYPE_HANDOFF_PROP]");
  });
});
