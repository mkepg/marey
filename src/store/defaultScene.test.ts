import { describe, it, expect } from "vitest";
import { lex } from "../compiler/lexer";
import { parse } from "../compiler/parser";
import { typeCheck } from "../compiler/typeChecker";
import { DEFAULT_CODE } from "./defaultScene";

/**
 * The default scene is the first thing a new user sees and the scene used to
 * eyeball renderer changes. Shipping one that does not compile would be a
 * uniquely embarrassing regression, so it is checked on every run.
 */
describe("DEFAULT_CODE", () => {
  it("lexes and parses without errors", () => {
    const { ast, errors } = parse(lex(DEFAULT_CODE));

    expect(errors).toEqual([]);
    expect(ast).not.toBeNull();
  });

  it("type checks and produces a scene IR", () => {
    const { ast } = parse(lex(DEFAULT_CODE));
    const { errors, ir } = typeCheck(ast!);

    expect(errors).toEqual([]);
    expect(ir).not.toBeNull();
    expect(ir!.width).toBe(800);
    expect(ir!.height).toBe(600);
  });

  it("exercises every timeline path the renderer implements", () => {
    // The scene earns its keep as a visual test only if it actually covers
    // these. If a zone is deleted, this fails rather than silently reducing
    // what a manual pass can catch.
    const { ast } = parse(lex(DEFAULT_CODE));
    const { ir } = typeCheck(ast!);

    const nodes = Object.values(ir!.registry);
    const anims = nodes.flatMap((n) => n.props.animations);

    expect(anims.some((a) => a.loop)).toBe(true);
    expect(anims.some((a) => a.yoyo)).toBe(true);
    expect(anims.some((a) => a.handOff)).toBe(true);

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
    const { ast } = parse(lex(DEFAULT_CODE));
    const { ir } = typeCheck(ast!);

    const kinds = new Set(Object.values(ir!.registry).map((n) => n.props.kind));

    expect(kinds).toContain("circle");
    expect(kinds).toContain("rectangle");
    expect(kinds).toContain("polygon");
    expect(kinds).toContain("line");
    expect(kinds).toContain("text");
    expect(kinds).toContain("group");
  });
});
