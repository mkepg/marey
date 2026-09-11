import { describe, it, expect } from "vitest";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import { planLottie } from "./lottieGeometry";
import type { IRSceneNode } from "../sceneIR";

function irFor(source: string): IRSceneNode {
  const { ast } = parse(lex(source));
  const { ir, errors } = typeCheck(ast!);
  if (!ir) throw new Error(`fixture did not compile: ${errors.map(e => e.message).join("; ")}`);
  return ir;
}

function codes(r: ReturnType<typeof planLottie>): string[] {
  return r.ok ? [] : r.diagnostics.map(d => d.code);
}

describe("planLottie · refusals", () => {
  it("refuses a text node by name", () => {
    const ir = irFor(`scene { size: (100, 100) duration: 1 text t { position: (0,0), content: "hi" } }`);
    const r = planLottie(ir);
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain("LOTTIE_UNSUPPORTED_TEXT");
    // Names the offending object, not just the kind: a scene with twenty
    // objects and one text node must say which one.
    if (!r.ok) expect(r.diagnostics[0].message).toContain("scene.t");
  });

  it("refuses a line node by name", () => {
    const ir = irFor(`scene { size: (100, 100) duration: 1 line l { position: (0,0), points: [(0,0), (10,10)], thickness: 2 } }`);
    expect(codes(planLottie(ir))).toContain("LOTTIE_UNSUPPORTED_LINE");
  });

  it("finds an unsupported node nested inside a group", () => {
    const ir = irFor(`scene { size: (100, 100) duration: 1 group g { position: (0,0) text t { position: (0,0), content: "hi" } } }`);
    // The walk must recurse. A top-level-only scan is the obvious wrong
    // implementation and passes both tests above.
    expect(codes(planLottie(ir))).toContain("LOTTIE_UNSUPPORTED_TEXT");
  });

  it("reports every unsupported node, not only the first", () => {
    const ir = irFor(`scene { size: (100, 100) duration: 1 text t { position: (0,0), content: "hi" } line l { position: (0,0), points: [(0,0), (10,10)], thickness: 2 } }`);
    const out = codes(planLottie(ir));
    expect(out).toContain("LOTTIE_UNSUPPORTED_TEXT");
    expect(out).toContain("LOTTIE_UNSUPPORTED_LINE");
  });

  it("accepts the four supported kinds", () => {
    const ir = irFor(`scene { size: (100, 100) duration: 1
      circle c { position: (10,10), radius: 5 }
      rectangle r { position: (20,20), size: (4, 6) }
      polygon p { position: (30,30), points: [(0,0), (10,0), (5,10)] }
      group g { position: (40,40) circle inner { position: (0,0), radius: 2 } }
    }`);
    expect(planLottie(ir).ok).toBe(true);
  });
});
