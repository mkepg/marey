import { describe, it, expect } from "vitest";
import { runLottieExport, type RunLottieExportOptions } from "./lottiePipeline";

/**
 * `lottiePipeline.ts`'s refusal paths, which all execute before `new
 * Application()` and therefore need no browser — modelled directly on
 * `videoPipeline.test.ts` (Task 5's F3 fix round), which the same "hooks are
 * verified through the app" argument does not excuse a plain
 * `src/compiler/export/` module from either.
 *
 * These pin the property `useExport.ts`'s toast relies on: **the triggering
 * diagnostic's message reaches the caller verbatim**, joined with `" | "`
 * when there is more than one, with no added prefix — `devLottieSeam.ts` is
 * the one caller that would want a prefix, and it no longer adds one either
 * (Task 3 moved that decision here, unprefixed, matching `runVideoExport`).
 *
 * Every assertion is either a literal written independently here, a
 * structural property (how many diagnostics, which separator, which
 * prefix), or paired with a control that changes one input and gets the
 * opposite verdict — so none of these can be passing merely because
 * "everything throws in a node environment".
 */

const BASE: Omit<RunLottieExportOptions, "source"> = { fps: 30 };

/**
 * The `.message` of `runLottieExport`'s rejection, or a hard failure if it
 * did not reject at all.
 */
async function refusalMessage(opts: RunLottieExportOptions): Promise<string> {
  try {
    await runLottieExport(opts);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected runLottieExport to reject, but it resolved");
}

describe("runLottieExport · refusal path 1, compilation", () => {
  it("reports a parse failure and stops before either export contract", async () => {
    const message = await refusalMessage({ ...BASE, source: "scene {" });
    expect(message).toMatch(/^Source did not compile: PARSE: .+/);
    expect(message).not.toContain("[EXPORT_");
    expect(message).not.toContain("[LOTTIE_");
    // Unprefixed: `devLottieSeam.ts` no longer re-adds `[export] ` (Task 3
    // moved that decision into this module, matching `runVideoExport`).
    expect(message).not.toContain("[export]");
  });

  it("joins multiple compile errors with ' | ' and tags each with its phase", async () => {
    const message = await refusalMessage({
      ...BASE,
      source: "scene { size: (100, 100) circle c { radius: -3 } }",
    });
    const prefix = "Source did not compile: ";
    expect(message.startsWith(prefix)).toBe(true);
    const parts = message.slice(prefix.length).split(" | ");
    expect(parts).toHaveLength(2);
    expect(parts.every((p) => p.startsWith("TYPE: "))).toBe(true);
  });
});

describe("runLottieExport · refusal path 2, planExport", () => {
  it("surfaces an unbounded-scene refusal verbatim, with no added prefix", async () => {
    const message = await refusalMessage({ ...BASE, source: "scene { size: (100, 100) }" });
    expect(message.startsWith("[EXPORT_UNBOUNDED_SCENE] ")).toBe(true);
    expect(message).not.toContain("[export]");
    expect(message).not.toContain("Source did not compile");
    expect(message).not.toContain("[LOTTIE_");
  });

  it("joins two simultaneous planExport diagnostics with ' | '", async () => {
    const message = await refusalMessage({
      ...BASE,
      source: "scene { size: (100, 100) }",
      fps: 7,
    });
    const parts = message.split(" | ");
    expect(parts).toHaveLength(2);
    expect(parts[0].startsWith("[EXPORT_UNSUPPORTED_FPS] ")).toBe(true);
    expect(parts[1].startsWith("[EXPORT_UNBOUNDED_SCENE] ")).toBe(true);
  });
});

/**
 * Ruling/design §2's "diagnostics are properties of the scene, not of the
 * frames": `planLottie` runs before any Pixi object exists, so a `text`
 * node is refused before `new Application()` -- which would fail in this
 * node suite anyway (no DOM), but for a DIFFERENT reason. The control test
 * below is what actually proves `planLottie` ran first: a text-free scene
 * with the same bounds reaches past it and fails on the missing DOM
 * instead, with none of `planLottie`'s own diagnostic text.
 */
describe("runLottieExport · refusal path 3, planLottie", () => {
  it("refuses a text node verbatim, with no added prefix, before any Application exists", async () => {
    const message = await refusalMessage({
      ...BASE,
      source: 'scene { size: (100, 100) duration: 1 text t { position: (0,0), content: "hi" } }',
    });
    expect(message.startsWith("[LOTTIE_UNSUPPORTED_TEXT] ")).toBe(true);
    expect(message).not.toContain("[export]");
    expect(message).not.toContain("[EXPORT_");
    expect(message).not.toContain("Source did not compile");
  });

  it("goes on to build the scene once planLottie accepts, past every diagnostic this module owns", async () => {
    // The control: the same bounds, no `text` node. Both prior contracts and
    // `planLottie` all pass, so what actually stops this in a node
    // environment is `new Application()` failing on the missing DOM --
    // proving `planLottie` really did run (and pass) before reaching it.
    const message = await refusalMessage({
      ...BASE,
      source: "scene { size: (100, 100) duration: 1 circle c { position: (0,0), radius: 10 } }",
    });
    expect(message).not.toContain("[LOTTIE_");
    expect(message).not.toContain("[EXPORT_");
    expect(message).not.toContain("Source did not compile");
  });
});
