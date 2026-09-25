import { describe, it, expect } from "vitest";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
// `?raw` (declared by `vite/client`) rather than `node:fs`: this project has
// no Node types, the same constraint `languageDocs.test.ts` and
// `exportBoundary.test.ts` document.
import TEST_CARD from "../../../tools/visual-check/scenes/test-card.marey?raw";

/**
 * The motion test card was the app's default scene until the smiling face
 * replaced it. It still earns its keep as the scene for eyeballing renderer
 * changes (the visual-check harness's `scenes/test-card.marey`), so its
 * coverage is still checked here: if a zone is deleted, this fails rather
 * than silently reducing what a manual pass can catch.
 */
describe("the motion test card fixture", () => {
  const { ast, errors: parseErrors } = parse(lex(TEST_CARD));
  const { errors: typeErrors, ir } = typeCheck(ast!);

  it("compiles", () => {
    expect(parseErrors).toEqual([]);
    expect(typeErrors).toEqual([]);
    expect(ir).not.toBeNull();
  });

  it("exercises every timeline path the renderer implements", () => {
    const nodes = Object.values(ir!.registry);
    const anims = nodes.flatMap((n) => n.props.animations);

    expect(anims.some((a) => a.loop)).toBe(true);
    expect(anims.some((a) => a.yoyo)).toBe(true);
    expect(anims.some((a) => a.handoff)).toBe(true);

    const easings = new Set(anims.map((a) => a.easing));
    expect(easings).toContain("linear");
    expect(easings).toContain("easeIn");
    expect(easings).toContain("easeOut");
    expect(easings).toContain("easeInOut");

    const properties = new Set(anims.map((a) => a.property));
    expect(properties).toContain("position");
    expect(properties).toContain("rotation");
    expect(properties).toContain("scale");

    // A sequence containing a parallel step, and physics of both durations.
    const sequences = nodes.flatMap((n) => n.props.sequences);
    expect(sequences.length).toBeGreaterThan(0);
    expect(
      sequences.some((s) => s.steps.some((step) => "type" in step && step.type === "parallel"))
    ).toBe(true);

    const physics = nodes.map((n) => n.props.physics).filter((p) => p !== undefined);
    const seqPhysics = sequences.flatMap((s) =>
      s.steps.filter((step) => !("property" in step) && !("type" in step))
    );
    expect(physics.some((p) => p!.duration === "indefinitely")).toBe(true);
    expect(seqPhysics.some((p) => typeof (p as { duration: unknown }).duration === "number")).toBe(true);
  });

  it("covers every visual primitive", () => {
    const kinds = new Set(Object.values(ir!.registry).map((n) => n.props.kind));

    expect(kinds).toContain("circle");
    expect(kinds).toContain("rectangle");
    expect(kinds).toContain("polygon");
    expect(kinds).toContain("line");
    expect(kinds).toContain("text");
    expect(kinds).toContain("group");
  });
});
