import type { ICanvas } from "pixi.js";

/**
 * PNG bytes off an extracted canvas, whichever blob API the host provides.
 *
 * Exported since Phase 5C Task 5 so `apngPipeline.ts`'s `runApngExport` could
 * read the same lossless per-frame PNG bytes this module already produced
 * for `encodePngSequence`, rather than a second copy of the `toBlob`/
 * `convertToBlob` branch. Task 4 of Phase 6 moved `encodePngSequence` itself
 * into `pngPipeline.ts`'s `runPngExport` (the PNG sequence's own lazy
 * rasterize loop, built on `rasterExport.ts`'s shared prefix), leaving this
 * function as the one thing both pipelines still share.
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
