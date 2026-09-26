import { describe, it, expect } from "vitest";
import { lex } from "../compiler/lexer";
import { parse } from "../compiler/parser";
import { typeCheck } from "../compiler/typeChecker";
import { planExport } from "../compiler/export/exportContract";
import { encodeCode, MAX_SHARE_LENGTH } from "../lib/share";
import { DEFAULT_CODE } from "./defaultScene";

/**
 * The default scene is the first thing a new user sees, so each way it can
 * make the app look broken on first load is checked on every run. Renderer
 * coverage used to be asserted here too; it moved with the old motion test
 * card to `src/compiler/renderer/testCard.test.ts`.
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

  it("can be exported from the top bar as it loads", () => {
    // The export buttons pass no explicit bound (`useExport.ts` exports
    // at a fixed 30 fps and takes its length from the scene), so a default
    // scene without a top-level `duration:` makes a first-timer's first
    // export click fail with EXPORT_UNBOUNDED_SCENE. That shipped once.
    const { ast } = parse(lex(DEFAULT_CODE));
    const { ir } = typeCheck(ast!);

    expect(ir!.duration).not.toBeNull();
    const planned = planExport(ir!, { fps: 30 });
    expect(planned.ok ? [] : planned.diagnostics).toEqual([]);
  });

  it("is small enough to share", () => {
    // A first-timer sees the share button disabled if the default scene does
    // not fit, which reads as the app being broken. This has regressed once
    // already, when the scene grew past the old limit.
    const encoded = encodeCode(DEFAULT_CODE);

    expect(encoded).not.toBeNull();
    expect(encoded!.length).toBeLessThanOrEqual(MAX_SHARE_LENGTH);
  });
});
