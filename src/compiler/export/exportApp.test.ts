import { describe, it, expect } from "vitest";
import { destroyExportApp } from "./exportApp";
// `?raw`, not `node:fs`: this project carries no Node types (see
// exportBoundary.test.ts's header comment).
import videoPipelineSource from "./videoPipeline.ts?raw";
import devExportSeamSource from "../../lib/devExportSeam.ts?raw";
import lottiePipelineSource from "./lottiePipeline.ts?raw";

/**
 * An export builds a second pixi Application beside the preview's long-lived
 * one. In pixi v8, `renderer.destroy(true)` means `releaseGlobalResources`,
 * which empties pools every Application on the page shares (TexturePool,
 * the batch pool, CanvasPool). Tearing the export down that way left the
 * preview holding destroyed batches and a wiped texture pool, so the next
 * Run failed with "Cannot read properties of null (reading 'clear')" or
 * "... of undefined (reading 'push')" and the preview stayed blank.
 */
describe("destroyExportApp", () => {
  function recordDestroy(): { args: unknown[][]; app: { destroy: (...a: unknown[]) => void } } {
    const args: unknown[][] = [];
    return { args, app: { destroy: (...a: unknown[]) => void args.push(a) } };
  }

  it("never asks pixi to release its page-wide resource pools", () => {
    const { args, app } = recordDestroy();
    destroyExportApp(app as never);

    expect(args).toHaveLength(1);
    const [rendererOptions] = args[0];
    expect(rendererOptions).not.toBe(true);
    expect(rendererOptions).toMatchObject({ releaseGlobalResources: false });
  });

  it("still destroys the export scene's display objects", () => {
    const { args, app } = recordDestroy();
    destroyExportApp(app as never);

    expect(args[0][1]).toMatchObject({ children: true });
  });

  it("is the only way the export paths destroy an Application", () => {
    for (const [file, source] of [
      ["videoPipeline.ts", videoPipelineSource],
      ["devExportSeam.ts", devExportSeamSource],
      ["lottiePipeline.ts", lottiePipelineSource],
    ] as const) {
      expect(source, file).not.toMatch(/\bapp\??\.destroy\(/);
      expect(source, file).toContain("destroyExportApp(app)");
    }
  });
});
