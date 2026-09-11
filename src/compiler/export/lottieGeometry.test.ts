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

describe("planLottie · layer specs", () => {
  const layersOf = (source: string) => {
    const r = planLottie(irFor(source));
    if (!r.ok) throw new Error(`unexpected refusal: ${r.diagnostics.map(d => d.code).join(",")}`);
    return r.layers;
  };

  it("puts a default-origin circle's anchor at its centre", () => {
    const [c] = layersOf(`scene { size: (100,100) duration: 1 circle c { position: (10,10), radius: 5 } }`);
    expect(c.shape).toEqual({ kind: "circle", radius: 5 });
    // bbox is (0,0)-(10,10) and origin defaults to (0.5, 0.5), so the pivot
    // sits at (5, 5) — NOT at (0, 0). A circle is drawn at .circle(r, r, r),
    // so its own centre is (r, r) in local space too.
    expect(c.anchor).toEqual({ x: 5, y: 5 });
  });

  it("moves a bottom-origin rectangle's anchor to its baseline", () => {
    // origin (0.5, 1) is the "grow from a baseline" idiom Phase 3C added.
    // anchor = (w*0.5, h*1) = (2, 6). If the implementation ignores origin and
    // always centres, this is (2, 3) and the test reddens.
    const [r] = layersOf(`scene { size: (100,100) duration: 1 rectangle r { position: (20,20), size: (4,6), origin: (0.5, 1) } }`);
    expect(r.anchor).toEqual({ x: 2, y: 6 });
  });

  it("offsets a polygon's anchor by its bbox minimum", () => {
    // Points (0,-30), (26,15), (-26,15): minX -26, minY -30, w 52, h 45.
    // Default origin: anchor = (-26 + 26, -30 + 22.5) = (0, -7.5).
    // The -7.5 is the same bbox-centre/centroid gap D15 exists to correct and
    // that Phase 3C's filed MatterWorld fixture measured at 7.5px.
    const [p] = layersOf(`scene { size: (100,100) duration: 1 polygon p { position: (0,0), points: [(0,-30), (26,15), (-26,15)] } }`);
    expect(p.anchor).toEqual({ x: 0, y: -7.5 });
  });

  it("fixes a group's anchor at its own origin regardless of where its children sit", () => {
    // D16. A group whose only child sits at (40, 40) still anchors at (0, 0).
    const layers = layersOf(`scene { size: (100,100) duration: 1 group g { position: (5,5) circle inner { position: (40,40), radius: 2 } } }`);
    const g = layers.find(l => l.id === "scene.g")!;
    expect(g.shape).toEqual({ kind: "group" });
    expect(g.anchor).toEqual({ x: 0, y: 0 });
    expect(g.color).toBeNull();
  });

  it("links a child to its parent and leaves a top-level object unparented", () => {
    const layers = layersOf(`scene { size: (100,100) duration: 1 group g { position: (5,5) circle inner { position: (1,1), radius: 2 } } }`);
    expect(layers.find(l => l.id === "scene.g")!.parentId).toBeNull();
    expect(layers.find(l => l.id === "scene.g.inner")!.parentId).toBe("scene.g");
  });

  it("emits layers in IR order, which is already layer-sorted", () => {
    // typeChecker/builder.ts:265-269 sorts children by `layer` ascending with a
    // stable index tiebreak, and nothing in the renderer reads `layer` again.
    // So IR order IS paint order and this walk must not re-sort.
    const layers = layersOf(`scene { size: (100,100) duration: 1
      circle top { position: (0,0), radius: 1, layer: 5 }
      circle bottom { position: (0,0), radius: 1, layer: 1 }
    }`);
    expect(layers.map(l => l.id)).toEqual(["scene.bottom", "scene.top"]);
  });

  it("converts a hex colour to three 0-1 floats", () => {
    const [c] = layersOf(`scene { size: (100,100) duration: 1 circle c { position: (0,0), radius: 1, color: #ff8000 } }`);
    expect(c.color![0]).toBe(1);
    expect(c.color![1]).toBeCloseTo(128 / 255, 10);
    expect(c.color![2]).toBe(0);
  });
});
