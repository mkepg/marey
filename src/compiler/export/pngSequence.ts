import type { Application, Container, ICanvas } from "pixi.js";
import type { FrameSnapshot } from "../renderer/frameSampler";
import { createFrameRasterizer } from "./frameRaster";

/**
 * PNG bytes off an extracted canvas, whichever blob API the host provides.
 *
 * Exported since Phase 5C Task 5 so `apngPipeline.ts`'s `runApngExport` can
 * read the same lossless per-frame PNG bytes this module already produces
 * for `encodePngSequence`, rather than a second copy of the `toBlob`/
 * `convertToBlob` branch.
 */
export function pngBytesOf(canvas: ICanvas): Promise<Uint8Array> {
  const toBytes = async (blob: Blob): Promise<Uint8Array> =>
    new Uint8Array(await blob.arrayBuffer());

  if (typeof canvas.toBlob === "function") {
    const toBlob = canvas.toBlob.bind(canvas);
    return new Promise<Uint8Array>((resolve, reject) => {
      toBlob((blob) => {
        if (!blob) {
          reject(new Error("[export] Canvas.toBlob returned no blob for a frame."));
          return;
        }
        toBytes(blob).then(resolve, reject);
      }, "image/png");
    });
  }
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: "image/png" }).then(toBytes);
  }
  throw new Error(
    "[export] This canvas implementation offers neither toBlob nor convertToBlob, so PNG bytes cannot be read from it.",
  );
}

/**
 * Encode a sampled sequence to PNG bytes, one buffer per frame.
 *
 * **It receives `FrameSnapshot[]` and no runtime, no world and no driver**, so
 * it cannot advance the simulation even by accident. That is roadmap §6.2's
 * "encoders never advance the simulation and never see a wall clock" made
 * structural rather than conventional.
 *
 * Since Phase 5B the per-frame replay-and-extract lives in `frameRaster.ts`,
 * shared with the video exporter, so the two cannot disagree about the
 * exported size or background. See that module for why each extraction
 * argument is what it is, and for the wall-clock half of the claim above —
 * this function never reads `app` at all besides handing it to
 * `createFrameRasterizer`.
 */
export async function encodePngSequence(
  app: Application,
  root: Container,
  frames: ReadonlyArray<FrameSnapshot>,
): Promise<Uint8Array[]> {
  if (frames.length === 0) return [];
  // PNG export is not scaled (spec §2.1, O3: "2x" is a video-only decision;
  // APNG stays at 1x too) -- always the scene's own declared pixel size.
  const rasterize = createFrameRasterizer(app, root, frames, 1);
  const out: Uint8Array[] = [];
  for (const frame of frames) {
    out.push(await pngBytesOf(rasterize(frame)));
  }
  return out;
}
