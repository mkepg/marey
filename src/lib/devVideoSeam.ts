import { Application, Container } from "pixi.js";
import { compileSource } from "../compiler/compileSource";
import { planExport } from "../compiler/export/exportContract";
import { planVideo, type VideoContainer } from "../compiler/export/videoContract";
import { encodeVideo, VideoExportError } from "../compiler/export/videoEncode";
import { createFrameRasterizer } from "../compiler/export/frameRaster";
import { hashFrames } from "../compiler/export/frameHash";
import { buildNode } from "../compiler/renderer/builder";
import { sampleFrames } from "../compiler/renderer/frameSampler";
import { SceneRuntime } from "../compiler/renderer/sceneRuntime";
import { MatterWorld } from "../compiler/renderer/physicsWorld";

/** What `window.__mareyExportVideo` resolves to. */
export interface ExportVideoResult {
  /** Base64-encoded container bytes. No `data:` prefix. */
  readonly video: string;
  /** `hashFrames` over the sampled snapshots — simulation output, not pixels. */
  readonly hash: string;
  readonly container: VideoContainer;
  readonly fps: number;
  readonly frameCount: number;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  /** One base64 PNG per sampled frame, for the frame-by-frame comparison. */
  readonly referenceFrames: string[];
}

export interface ExportVideoOptions {
  readonly container: VideoContainer;
  readonly fps: number;
  readonly durationSeconds?: number;
  /** Omit reference PNGs when only the container bytes are wanted. */
  readonly withReferenceFrames?: boolean;
}

declare global {
  interface Window {
    /**
     * Dev-only video export seam for
     * `tools/visual-check/video-check.mjs`.
     *
     * Absent from a production build for the same reason
     * `window.__mareyExportPng` is (`devExportSeam.ts`): `main.tsx` reaches it
     * through a dynamic import inside `if (import.meta.env.DEV)`, which Vite
     * constant-folds to `false` when building, so this whole module — base64
     * encoding, frame hashing, reference-PNG re-extraction, the `window`
     * assignment below — is dropped rather than merely left unreferenced.
     *
     * That sentence used to end "and everything it pulls in, including
     * `mediabunny`". Corrected in Phase 5B Task 5: `mediabunny` **does** ship
     * to production now. The top bar's MP4/WebM buttons reach the same
     * encoder through `useExportVideo.ts` → `videoPipeline.ts`, so dropping
     * this seam no longer drops the encoder with it. It is still true that
     * *this module* is absent, and that is the property the sentence is here
     * to state. What the seam saves production is its own harness shape, not
     * `mediabunny`'s weight — that now lives in a click-loaded
     * `videoPipeline` chunk (`useExportVideo.ts`'s dynamic `import()`), which
     * is where the deferral actually happens.
     */
    __mareyExportVideo?: (
      source: string,
      opts: ExportVideoOptions,
    ) => Promise<ExportVideoResult>;
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
 * Compile, plan, build, sample, rasterize, encode — the whole video export
 * path, with no UI.
 *
 * Structurally a direct copy of `devExportSeam.ts`'s `exportPng`, including
 * its `try`/`finally` teardown and the reasoning for where the `try` opens.
 * That reasoning is not restated as a design choice here: it is copied
 * because it still applies unchanged. `app` is assigned before it is known
 * whether `init()` will succeed, on purpose: `Application.destroy()` reaches
 * straight into `this.renderer.destroy(...)` with no null check, and
 * `renderer` is only assigned once `init()`'s `autoDetectRenderer(...)`
 * resolves — so guarding on `app` alone would turn a failed `init()` into a
 * second, masking crash inside `finally`. Gating on `app.renderer` instead
 * means "destroy only if there is a renderer to destroy."
 *
 * The `try` starts at `new Application()`, rather than lower down: before
 * that fix (in `devExportSeam.ts`, carried forward here) it opened only after
 * `app`, `root`, `world` and `runtime` had all already been constructed, so a
 * throw from `app.init()`, the `buildNode` loop, or either constructor left
 * an initialised `Application` — a live canvas and WebGL context — never
 * destroyed. A caller retrying `window.__mareyExportVideo` against a scene
 * that fails to build would accumulate leaked contexts until the browser's
 * limit is exhausted, which breaks the live preview too, not just the
 * export.
 *
 * **A known risk this function carries, not yet resolved.** `canvases` below
 * holds every frame's rasterized canvas in memory at once, as
 * `HTMLCanvasElement`/`OffscreenCanvas` backing stores. At 800x600 that is
 * roughly 2 MB per frame uncompressed (`width * height * 4` bytes), so a
 * 7,200-frame export (`MAX_EXPORT_FRAMES`, `exportContract.ts`) would need on
 * the order of 14 GB resident at once. A later task is expected to measure
 * where this actually breaks; the fix — rasterize lazily during encoding and
 * re-rasterize a second time for the reference PNGs below — trades memory for
 * a second render pass and is a design decision this seam does not make
 * unilaterally.
 */
async function exportVideo(
  source: string,
  opts: ExportVideoOptions,
): Promise<ExportVideoResult> {
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

  const video = planVideo(ir, planned.plan, { container: opts.container });
  if (!video.ok) {
    throw new Error(`[export] ${video.diagnostics.map((d) => d.message).join(" | ")}`);
  }

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

    // Sample the whole scene first, then encode — `encodeVideo` never sees the
    // runtime, so the two phases cannot interleave even by mistake.
    const frames = sampleFrames(runtime, root, planned.plan);
    const rasterize = createFrameRasterizer(app, root, frames);

    // Rasterize eagerly into an array rather than lazily, so the reference
    // PNGs below are the SAME canvases the encoder consumed. A generator
    // would rasterize twice and compare an export against a re-render.
    const canvases = frames.map(rasterize);

    // `createFrameRasterizer` returns PixiJS's `ICanvas` — a structural
    // interface pixi defines for itself — which is NOT assignable to the DOM
    // `CanvasImageSource` union `encodeVideo` declares (`videoEncode.ts`'s own
    // docstring names this and explains why that signature stays narrow:
    // widening it to accept `ICanvas` would put a pixi type inside a module
    // `exportBoundary.test.ts` forbids from importing one). The cast
    // therefore belongs here, at the one call site that holds both types,
    // rather than in `videoEncode.ts`. At runtime this is not a lie: in every
    // environment this seam runs in (a real browser, `autoStart: false`),
    // `app.renderer.extract.canvas()` returns a real `HTMLCanvasElement` or
    // `OffscreenCanvas`, both of which satisfy `CanvasImageSource`.
    const bytes = await encodeVideo(video.plan, canvases as unknown as CanvasImageSource[]);

    // `createFrameRasterizer` -> `app.renderer.extract.canvas()` -> PixiJS's
    // `DOMAdapter.get().createCanvas()`, which the browser adapter
    // (`BrowserAdapter.mjs`, read directly rather than assumed) implements as
    // a plain `document.createElement("canvas")` — this seam never swaps the
    // adapter, so every `ICanvas` this function ever holds is a real
    // `HTMLCanvasElement`, never an `OffscreenCanvas`. The brief's Step 1
    // block called `.convertToBlob?.()` on a value cast to `HTMLCanvasElement`
    // — a method that type does not declare at all (`OffscreenCanvas`-only),
    // so `tsc` rejects it outright (TS2339) rather than silently returning
    // `undefined`. Fixed here to the one method this seam's actual runtime
    // type supports: `HTMLCanvasElement.toBlob`.
    const referenceFrames: string[] = [];
    if (opts.withReferenceFrames !== false) {
      for (const canvas of canvases) {
        const el = canvas as unknown as HTMLCanvasElement;
        const blob = await new Promise<Blob>((res, rej) =>
          el.toBlob((b) => (b ? res(b) : rej(new Error("no blob"))), "image/png"),
        );
        referenceFrames.push(toBase64(new Uint8Array(await blob.arrayBuffer())));
      }
    }

    return {
      video: toBase64(bytes),
      hash: hashFrames(frames),
      container: video.plan.container,
      fps: video.plan.fps,
      frameCount: video.plan.frameCount,
      width: ir.width,
      height: ir.height,
      byteLength: bytes.length,
      referenceFrames,
    };
  } catch (e) {
    if (e instanceof VideoExportError) throw new Error(`[export] ${e.diagnostic.message}`);
    throw e;
  } finally {
    runtime?.destroy();
    root?.destroy({ children: true, texture: true });
    if (app?.renderer) app.destroy(true, { children: true });
  }
}

export function installVideoSeam(): void {
  window.__mareyExportVideo = exportVideo;
}
