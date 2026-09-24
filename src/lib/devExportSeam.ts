import { Application, Container } from "pixi.js";
import { compileSource } from "../compiler/compileSource";
import { destroyExportApp } from "../compiler/export/exportApp";
import { planExport } from "../compiler/export/exportContract";
import { encodePngSequence } from "../compiler/export/pngSequence";
import { hashFrames } from "../compiler/export/frameHash";
import { buildNode } from "../compiler/renderer/builder";
import { sampleFrames } from "../compiler/renderer/frameSampler";
import { SceneRuntime } from "../compiler/renderer/sceneRuntime";
import { MatterWorld } from "../compiler/renderer/physicsWorld";

/** What `window.__mareyExportPng` resolves to. */
export interface ExportPngResult {
  /** One base64-encoded PNG per frame, in order. No `data:` prefix. */
  readonly frames: string[];
  /** `hashFrames` over the sampled snapshots — simulation output, not pixels. */
  readonly hash: string;
  readonly fps: number;
  readonly frameCount: number;
  readonly width: number;
  readonly height: number;
}

export interface ExportPngOptions {
  readonly fps: number;
  readonly durationSeconds?: number;
}

declare global {
  interface Window {
    /**
     * Dev-only export seam for `tools/visual-check/export-check.mjs`.
     *
     * Absent from a production build: `main.tsx` reaches it through a dynamic
     * import inside `if (import.meta.env.DEV)`, which Vite constant-folds to
     * `false` when building, so the whole module is dropped rather than merely
     * unreferenced.
     */
    __mareyExportPng?: (source: string, opts: ExportPngOptions) => Promise<ExportPngResult>;
  }
}

/** Base64 without a FileReader round trip; chunked to stay under the arg limit. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Compile, plan, build, sample, encode — the whole export path, with no UI.
 *
 * No product UI ships this phase (an export button belongs with `marey export`
 * in Phase 6), so a browser harness has nothing to click. A narrow named seam
 * is better than driving a button that does not exist, and better than the
 * harness re-implementing the pipeline in page script where it could silently
 * diverge from the one the app actually runs.
 *
 * The `Application` is built here rather than reused from the preview, and
 * deliberately so: it is initialised at the scene's **logical** size with the
 * scene's own background, `autoStart: false` (nothing here may advance on a
 * wall clock) and `resolution: 1`. The preview's `Application` carries
 * `devicePixelRatio` and whatever `fit` scaling the pane needs; the exported
 * artifact is the scene, not the preview.
 */
async function exportPng(source: string, opts: ExportPngOptions): Promise<ExportPngResult> {
  const outcome = compileSource(source);
  if (!outcome.ok || !outcome.ir) {
    throw new Error(
      `[export] Source did not compile: ${outcome.errors.map((e) => `${e.phase}: ${e.message}`).join(" | ")}`,
    );
  }
  const ir = outcome.ir;

  const planned = planExport(ir, { fps: opts.fps, durationSeconds: opts.durationSeconds });
  if (!planned.ok) {
    throw new Error(`[export] ${planned.diagnostics.map((d) => d.message).join(" | ")}`);
  }

  // Constructed incrementally below and torn down in `finally`, which
  // destroys only what actually exists. `app` is assigned before it is known
  // whether `init()` will succeed, on purpose: `Application.destroy()` reaches
  // straight into `this.renderer.destroy(...)` with no null check, and
  // `renderer` is only assigned once `init()`'s `autoDetectRenderer(...)`
  // resolves — so guarding on `app` alone would turn a failed `init()` into a
  // second, masking crash inside `finally`. Gating on `app.renderer` instead
  // means "destroy only if there is a renderer to destroy."
  //
  // The `try` starts here, at `new Application()`, rather than lower down:
  // before this fix it opened only after `app`, `root`, `world` and `runtime`
  // had all already been constructed, so a throw from `app.init()`, the
  // `buildNode` loop, or either constructor left an initialised `Application`
  // — a live canvas and WebGL context — never destroyed. A caller retrying
  // `window.__mareyExportPng` against a scene that fails to build would
  // accumulate leaked contexts until the browser's limit is exhausted, which
  // breaks the live preview too, not just the export.
  let app: Application | undefined;
  let root: Container | undefined;
  let runtime: SceneRuntime | undefined;
  try {
    app = new Application();
    await app.init({
      width: ir.width,
      height: ir.height,
      background: ir.background,
      backgroundAlpha: 1,
      antialias: true,
      resolution: 1,
      autoDensity: false,
      autoStart: false,
    });

    root = new Container();
    for (const node of ir.children) root.addChild(buildNode(node));

    const world = new MatterWorld(ir.width, ir.height);
    runtime = new SceneRuntime(world, root);

    // Sample the whole scene first, then encode. `encodePngSequence` never
    // sees the runtime, so the two phases cannot interleave even by mistake.
    const frames = sampleFrames(runtime, root, planned.plan);
    const pngs = await encodePngSequence(app, root, frames);
    return {
      frames: pngs.map(toBase64),
      hash: hashFrames(frames),
      fps: planned.plan.fps,
      frameCount: planned.plan.frameCount,
      width: ir.width,
      height: ir.height,
    };
  } finally {
    runtime?.destroy();
    root?.destroy({ children: true, texture: true });
    if (app?.renderer) destroyExportApp(app);
  }
}

export function installExportSeam(): void {
  window.__mareyExportPng = exportPng;
}
