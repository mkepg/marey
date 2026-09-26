import { describe, it, expect, vi } from "vitest";
import { Application, Container, Text } from "pixi.js";
import { compileSource } from "../compileSource";
import type { IRSceneNode } from "../sceneIR";
import { collectTextLayouts, runLottieExport, type RunLottieExportOptions } from "./lottiePipeline";

/**
 * `lottiePipeline.ts`'s refusal paths that execute before `new
 * Application()` and therefore need no browser (the ones after the build are
 * in `lottiePipeline.afterBuild.test.ts`) — modelled directly on
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
 * Lottie's own planning (`planLottie`) no longer runs before the build.
 * Phase 5C Task 8 (ruling T8-R1) moved it into `withRasterExport`'s
 * `afterBuild`, because text needs the built tree's measurements, so its
 * refusals arrive after `new Application()` and before sampling. Node
 * cannot get past `new Application()`, so those tests live in
 * `lottiePipeline.afterBuild.test.ts`, which stands in for the Application
 * alone. What is left to pin here is that a bounded scene with text passes
 * every pre-build step this module used to own and reaches the Application:
 * the control below fails on the missing DOM, with no diagnostic text.
 */
describe("runLottieExport · refusal path 3, after the build", () => {
  it("lets a bounded text scene reach new Application() with no pre-build Lottie refusal", async () => {
    // The font step runs for a text scene; report the font as loaded so the
    // run reaches the Application instead of refusing on the font.
    vi.stubGlobal("document", { fonts: { load: async () => [], check: () => true } });
    // Wraps the real `init`, recording the error it throws, so the test can
    // tell a failure inside `init` from one anywhere else.
    const realInit = Application.prototype.init;
    const thrownInsideInit: unknown[] = [];
    const init = vi.spyOn(Application.prototype, "init").mockImplementation(async function (
      this: Application,
      ...args: Parameters<Application["init"]>
    ) {
      try {
        return await realInit.apply(this, args);
      } catch (error) {
        thrownInsideInit.push(error);
        throw error;
      }
    });
    try {
      let rejection: unknown = null;
      try {
        await runLottieExport({
          ...BASE,
          source: 'scene { size: (100, 100) duration: 1 text t { position: (0,0), content: "日" } }',
        });
      } catch (error) {
        rejection = error;
      }
      // Before Task 8 this was `[LOTTIE_UNSUPPORTED_TEXT] ...`, from a
      // pre-build `planLottie`. Now nothing Lottie-specific can refuse
      // before the build, even for a character the font lacks: the run
      // reaches `app.init()` and fails inside it, where pixi's renderer
      // setup asks the stubbed `document` (fonts only) for an element.
      //
      // The assertion is on WHERE the rejection came from, not on its
      // wording. The wording is pixi's and V8's, not this module's (ruling
      // T8-R7; final review M-13): the rejection must be the very error
      // `init` threw, and it must carry no diagnostic prefix of ours.
      expect(init).toHaveBeenCalledTimes(1);
      expect(thrownInsideInit).toHaveLength(1);
      expect(rejection).toBe(thrownInsideInit[0]);
      const message = rejection instanceof Error ? rejection.message : String(rejection);
      expect(message).not.toContain("[LOTTIE_");
      expect(message).not.toContain("[EXPORT_");
    } finally {
      init.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

/**
 * `collectTextLayouts` (Task 7, spec §6.2-6.3): the layout and glyph-run
 * plumbing T8 encodes. Measuring needs pixi's canvas, so the measured
 * numbers are checked in the browser (`text-plumbing/plumbing-run.mjs`).
 * What Node can check is everything around the measurement: that a
 * text-free scene fetches nothing, and that a text node with no built
 * counterpart is an invariant failure rather than a silently missing layer.
 */
describe("collectTextLayouts", () => {
  function compileIr(source: string): IRSceneNode {
    const outcome = compileSource(source);
    if (!outcome.ok || !outcome.ir) throw new Error("fixture did not compile");
    return outcome.ir;
  }
  const TEXT_IR = () =>
    compileIr(`scene { size: (100, 100) duration: 1 group g { position: (0, 0) text t { position: (0, 0), content: "hi" } } }`);

  function countingFetch() {
    const counter = { calls: 0 };
    const fetchFont = async () => {
      counter.calls += 1;
      return new ArrayBuffer(0);
    };
    return { counter, fetchFont };
  }

  it("returns empty maps for a text-free scene without fetching the font", async () => {
    const ir = compileIr(`scene { size: (100, 100) duration: 1 circle c { position: (0, 0), radius: 5 } }`);
    const { counter, fetchFont } = countingFetch();
    const collected = await collectTextLayouts(new Container(), ir, fetchFont);
    expect(collected.textLayouts.size).toBe(0);
    expect(collected.glyphRuns.size).toBe(0);
    expect(counter.calls).toBe(0);
  });

  it("throws an invariant, naming the id, for a text node the built tree does not contain", async () => {
    const { counter, fetchFont } = countingFetch();
    const message = await collectTextLayouts(new Container(), TEXT_IR(), fetchFont).then(
      () => "resolved",
      (e: unknown) => (e as Error).message,
    );
    expect(message).toMatch(/^\[export\] collectTextLayouts: text node 'scene\.g\.t' has no built container/);
    expect(counter.calls).toBe(0);
  });

  it("finds a text node's container inside a group, and requires its Text child", async () => {
    // The wrapper is found (nested under the group's container), so the
    // failure moves on to the next invariant: it holds no pixi Text.
    const root = new Container();
    const group = new Container();
    // IR ids are full paths (`scene.g.t`), and `buildNode` stamps them as-is.
    group.__mareyId = "scene.g";
    const wrapper = new Container();
    wrapper.__mareyId = "scene.g.t";
    wrapper.__baseSize = { w: 10, h: 10 };
    group.addChild(wrapper);
    root.addChild(group);
    const { fetchFont } = countingFetch();
    const message = await collectTextLayouts(root, TEXT_IR(), fetchFont).then(
      () => "resolved",
      (e: unknown) => (e as Error).message,
    );
    expect(message).toMatch(/^\[export\] collectTextLayouts: text node 'scene\.g\.t' has no pixi Text child/);
  });

  it("requires the wrapper's __baseSize, the box the anchor was pivoted on", async () => {
    // Constructing a pixi Text measures nothing, so this runs in Node; the
    // failure is the missing size, reached before any measurement.
    const root = new Container();
    const wrapper = new Container();
    wrapper.__mareyId = "scene.g.t";
    wrapper.addChild(new Text({ text: "hi" }));
    root.addChild(wrapper);
    const { counter, fetchFont } = countingFetch();
    const message = await collectTextLayouts(root, TEXT_IR(), fetchFont).then(
      () => "resolved",
      (e: unknown) => (e as Error).message,
    );
    expect(message).toMatch(/^\[export\] collectTextLayouts: text node 'scene\.g\.t' has no __baseSize/);
    expect(counter.calls).toBe(0);
  });
});
