import { describe, it, expect } from "vitest";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import { planLottie } from "./lottieGeometry";
import type { IRObjectId, IRSceneNode } from "../sceneIR";
import type { Contour, MissingGlyph, TextGlyphRun, TextLayout } from "./textOutline";

function irFor(source: string): IRSceneNode {
  const { ast } = parse(lex(source));
  const { ir, errors } = typeCheck(ast!);
  if (!ir) throw new Error(`fixture did not compile: ${errors.map(e => e.message).join("; ")}`);
  return ir;
}

function codes(r: ReturnType<typeof planLottie>): string[] {
  return r.ok ? [] : r.diagnostics.map(d => d.code);
}

/** A two-vertex stand-in contour; `planLottie` only carries contours through. */
const CONTOUR: Contour = { v: [[1, 2], [3, 4]], i: [[0, 0], [0, 0]], o: [[0, 0], [0, 0]] };

/**
 * The `text` argument `planLottie` takes from the pipeline, hand-built: per
 * IR id, a layout (default 216 x 79, the numbers the anchor test reads) and
 * a glyph run (default one contour, nothing missing).
 */
function textFor(
  entries: Record<IRObjectId, { layout?: Partial<TextLayout>; contours?: ReadonlyArray<Contour>; missing?: ReadonlyArray<MissingGlyph> }>,
): { layouts: Map<IRObjectId, TextLayout>; runs: Map<IRObjectId, TextGlyphRun> } {
  const layouts = new Map<IRObjectId, TextLayout>();
  const runs = new Map<IRObjectId, TextGlyphRun>();
  for (const [id, e] of Object.entries(entries)) {
    layouts.set(id, { width: 216, height: 79, ascent: 60, lineHeight: 71, padding: 0, lines: ["x"], ...e.layout });
    runs.set(id, { contours: e.contours ?? [CONTOUR], missing: e.missing ?? [] });
  }
  return { layouts, runs };
}

describe("planLottie · refusals", () => {
  // Was "refuses a text node by name" (LOTTIE_UNSUPPORTED_TEXT), which Task 8
  // deletes: `text` is now exported as glyph outlines (spec §6.3). What is
  // still refused is a text node whose glyph run names a character the
  // export font has no glyph for (LOTTIE_TEXT_MISSING_GLYPH). Replaced, not
  // removed: each old text-refusal test keeps its shape (by name, nested in
  // a group, every node not only the first) on the new code.
  it("refuses a text node with a missing glyph, naming the object, the character and its code point", () => {
    const ir = irFor(`scene { size: (100, 100) duration: 1 text t { position: (0,0), content: "日" } }`);
    const r = planLottie(ir, textFor({ "scene.t": { missing: [{ char: "日", codePoint: 0x65e5 }] } }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.diagnostics).toHaveLength(1);
    const [d] = r.diagnostics;
    expect(d.code).toBe("LOTTIE_TEXT_MISSING_GLYPH");
    expect(d.message.startsWith("[LOTTIE_TEXT_MISSING_GLYPH] ")).toBe(true);
    // Names the offending object, not just the kind: a scene with twenty
    // objects and one bad string must say which one.
    expect(d.message).toContain("'scene.t'");
    expect(d.message).toContain("U+65E5");
    expect(d.message).toContain("'日'");
  });

  it("names every missing character of one object in a single diagnostic", () => {
    const ir = irFor(`scene { size: (100, 100) duration: 1 text t { position: (0,0), content: "a日🙂" } }`);
    const r = planLottie(ir, textFor({
      "scene.t": { missing: [{ char: "日", codePoint: 0x65e5 }, { char: "🙂", codePoint: 0x1f642 }] },
    }));
    if (r.ok) throw new Error("expected a refusal");
    expect(r.diagnostics).toHaveLength(1);
    expect(r.diagnostics[0].message).toContain("U+65E5");
    // Astral: the full code point, five hex digits, not a surrogate half.
    expect(r.diagnostics[0].message).toContain("U+1F642");
  });

  it("finds a missing glyph in a text node nested inside a group", () => {
    const ir = irFor(`scene { size: (100, 100) duration: 1 group g { position: (0,0) text t { position: (0,0), content: "日" } } }`);
    // The walk must recurse. A top-level-only scan is the obvious wrong
    // implementation and passes the tests above.
    const r = planLottie(ir, textFor({ "scene.g.t": { missing: [{ char: "日", codePoint: 0x65e5 }] } }));
    expect(codes(r)).toEqual(["LOTTIE_TEXT_MISSING_GLYPH"]);
  });

  it("reports every text node with a missing glyph, not only the first", () => {
    const ir = irFor(`scene { size: (100, 100) duration: 1 text t1 { position: (0,0), content: "日" } text t2 { position: (10,10), content: "🙂" } }`);
    const r = planLottie(ir, textFor({
      "scene.t1": { missing: [{ char: "日", codePoint: 0x65e5 }] },
      "scene.t2": { missing: [{ char: "🙂", codePoint: 0x1f642 }] },
    }));
    expect(codes(r)).toEqual(["LOTTIE_TEXT_MISSING_GLYPH", "LOTTIE_TEXT_MISSING_GLYPH"]);
    if (!r.ok) {
      expect(r.diagnostics[0].message).toContain("'scene.t1'");
      expect(r.diagnostics[1].message).toContain("'scene.t2'");
    }
  });

  it("plans a text node whose glyph run is complete, rather than refusing it", () => {
    const ir = irFor(`scene { size: (100, 100) duration: 1 text t { position: (0,0), content: "hi" } }`);
    expect(planLottie(ir, textFor({ "scene.t": {} })).ok).toBe(true);
  });

  it("throws an invariant, not a diagnostic, for a text node the pipeline gave no layout", () => {
    // A text node reaching planLottie without its measurements means the
    // pipeline skipped a step; guessing a box would misplace the anchor.
    const ir = irFor(`scene { size: (100, 100) duration: 1 text t { position: (0,0), content: "hi" } }`);
    const invariant = "[LOTTIE] text node 'scene.t' has no layout from the export pipeline";
    expect(() => planLottie(ir)).toThrow(invariant);
    const full = textFor({ "scene.t": {} });
    // Both entries are required, each on its own.
    expect(() => planLottie(ir, { layouts: full.layouts, runs: new Map() })).toThrow(invariant);
    expect(() => planLottie(ir, { layouts: new Map(), runs: full.runs })).toThrow(invariant);
  });

  it("plans a scene with a line ok, rather than refusing it", () => {
    // Was "refuses a line node by name" (LOTTIE_UNSUPPORTED_LINE), which
    // Task 2 deletes: `line` is now a supported kind. Replaced rather than
    // removed outright — the geometry it produces is pinned separately in
    // "planLottie · layer specs" below.
    const ir = irFor(`scene { size: (100, 100) duration: 1 line l { position: (0,0), points: [(0,0), (10,10)], thickness: 2 } }`);
    const r = planLottie(ir);
    expect(r.ok).toBe(true);
  });

  it("accepts the five text-free kinds with no text argument (text-free callers are unchanged)", () => {
    const ir = irFor(`scene { size: (100, 100) duration: 1
      circle c { position: (10,10), radius: 5 }
      rectangle r { position: (20,20), size: (4, 6) }
      polygon p { position: (30,30), points: [(0,0), (10,0), (5,10)] }
      line l { position: (35,35), points: [(0,0), (10,10)], thickness: 2 }
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

  it("plans a line as an open-path spec anchored like builder.ts's line case", () => {
    // builder.ts's "line" case (builder.ts:280-317) scans the raw points for
    // a min/max bbox, exactly like polygon — so this reuses `polygonBBox`
    // rather than a second copy of the same scan. bbox is (0,0)-(100,50);
    // origin 0.5/0.5 puts the anchor at its centre, (50,25).
    const ir = irFor(
      `scene { size: (100, 100) duration: 1 line l { position: (0,0), points: [(0,0), (100,0), (100,50)], thickness: 6, origin: (0.5, 0.5), color: #102030 } }`,
    );
    const r = planLottie(ir);
    if (!r.ok) throw new Error(`unexpected refusal: ${r.diagnostics.map((d) => d.code).join(",")}`);
    expect(r.layers[0].shape).toEqual({
      kind: "line",
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }],
      thickness: 6,
    });
    expect(r.layers[0].anchor).toEqual({ x: 50, y: 25 });
    expect(r.layers[0].color).toEqual([0x10 / 255, 0x20 / 255, 0x30 / 255]);
  });

  it("anchors a default-origin text at the centre of the pipeline's layout box", () => {
    // 216 x 79 is nothing "hi" at the default fontSize measures to, and the
    // IR carries no width at all: the only source of these numbers is the
    // layout the pipeline measured, so (108, 39.5) proves the anchor is
    // computed from it rather than recomputed here (spec §6.2).
    const r = planLottie(
      irFor(`scene { size: (100,100) duration: 1 text t { position: (5,5), content: "hi", color: #ff8000 } }`),
      textFor({ "scene.t": { layout: { width: 216, height: 79 } } }),
    );
    if (!r.ok) throw new Error(`unexpected refusal: ${r.diagnostics.map((d) => d.code).join(",")}`);
    expect(r.layers[0].anchor).toEqual({ x: 108, y: 39.5 });
    expect(r.layers[0].color).toEqual([1, 128 / 255, 0]);
    expect(r.layers[0].name).toBe("t");
  });

  it("applies a text's origin to the layout box, like builder.ts's text case", () => {
    // builder.ts pivots a text on the box (0,0)-(w,h) through `origin`, so
    // origin (0, 1) is the bottom-left corner of the measured box.
    const r = planLottie(
      irFor(`scene { size: (100,100) duration: 1 text t { position: (5,5), content: "hi", origin: (0, 1) } }`),
      textFor({ "scene.t": { layout: { width: 216, height: 79 } } }),
    );
    if (!r.ok) throw new Error("unexpected refusal");
    expect(r.layers[0].anchor).toEqual({ x: 0, y: 79 });
  });

  it("carries the glyph run's contours into a text shape spec unchanged", () => {
    const second: Contour = { v: [[5, 6], [7, 8], [9, 9]], i: [[0, 0], [1, 1], [0, 0]], o: [[0, 0], [0, 0], [2, 2]] };
    const r = planLottie(
      irFor(`scene { size: (100,100) duration: 1 group g { position: (0,0) text t { position: (0,0), content: "hi" } } }`),
      textFor({ "scene.g.t": { contours: [CONTOUR, second] } }),
    );
    if (!r.ok) throw new Error("unexpected refusal");
    const t = r.layers.find((l) => l.id === "scene.g.t")!;
    expect(t.shape).toEqual({ kind: "text", contours: [CONTOUR, second] });
    expect(t.parentId).toBe("scene.g");
  });
});
