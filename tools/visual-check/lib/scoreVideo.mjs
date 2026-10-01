/**
 * The decode-and-score step `quality-check.mjs` and `x264-gate.mjs` share,
 * so both measure a video with one scorer rather than two copies that could
 * drift apart.
 *
 * `scoreInPage` decodes a video inside the page with mediabunny's
 * `VideoSampleSink` (a real `VideoDecoder`, as a viewer's browser would
 * use) and scores decoded frame k against reference PNG k: PSNR over RGB,
 * `10 * log10(65025 / mse)`, and "specks", pixels whose worst-channel delta
 * exceeds 64. These are the definitions
 * `docs/research/2026-09-24-export-quality-probes/matrix.ts`'s `score`
 * function uses. See `quality-check.mjs`'s header for what "against the
 * reference" means and why the scorer's launch flags matter.
 *
 * The scoring function runs in the page and does not care which encoder
 * produced the file: `quality-check.mjs` passes the WebCodecs file the dev
 * seam returns, `x264-gate.mjs` also passes files ffmpeg wrote from the
 * seam's own reference frames.
 */
import { readFileSync } from "node:fs";

/**
 * Inject mediabunny's self-contained ESM bundle into the page as an inline
 * module script and wait for `window.__mediabunny`. Resolves `true` once the
 * global is set, `false` if it never appears within 30 s.
 */
export async function installMediabunny(page, mediabunnyPath) {
  const bundleJs = readFileSync(mediabunnyPath, "utf8");
  await page.addScriptTag({
    content: `${bundleJs}\nwindow.__mediabunny = { Input, BufferSource, ALL_FORMATS, VideoSampleSink };`,
    type: "module",
  });
  // Wait for the global rather than reading it once. An inline module
  // script runs asynchronously, so `addScriptTag` can resolve before the
  // bundle has assigned `window.__mediabunny`. Measured 2026-09-26: an
  // immediate read failed on every run (4 of 4) with the GPU-accelerated
  // scorer (no --disable-accelerated-2d-canvas) and passed with the
  // software one.
  return page
    .waitForFunction(() => typeof window.__mediabunny === "object" && window.__mediabunny !== null, null, {
      timeout: 30_000,
      polling: 100,
    })
    .then(
      () => true,
      () => false,
    );
}

/**
 * Decode `videoBase64` in the page and score it against same-index references.
 *
 * Returns `{ ok: true, decodedFrameCount, referenceFrameCount, width, height,
 * perFrame, totalSpecks, specksPerFrame, psnr }`, or `{ ok: false, stage,
 * error }` where `stage` is one of `mediabunny-missing`, `no-video-track`,
 * `construct` or `decode`.
 */
export async function scoreInPage(page, videoBase64, referenceFramesBase64) {
  return page.evaluate(
    async ({ videoBase64, referenceFramesBase64 }) => {
      function b64ToBytes(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
      }

      async function pngToImageData(b64) {
        const img = new Image();
        const loaded = new Promise((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error("reference PNG failed to decode as an <img>"));
        });
        img.src = `data:image/png;base64,${b64}`;
        await loaded;
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return { width: c.width, height: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
      }

      const references = [];
      for (const b64 of referenceFramesBase64) references.push(b64 ? await pngToImageData(b64) : null);

      const mb = window.__mediabunny;
      if (!mb) return { ok: false, stage: "mediabunny-missing", error: "window.__mediabunny not installed" };

      let input;
      let track;
      let sink;
      try {
        const videoBytes = b64ToBytes(videoBase64);
        const bunnySource = new mb.BufferSource(videoBytes.buffer);
        input = new mb.Input({ formats: mb.ALL_FORMATS, source: bunnySource });
        track = await input.getPrimaryVideoTrack();
        if (!track) return { ok: false, stage: "no-video-track", error: "Input has no primary video track" };
        sink = new mb.VideoSampleSink(track);
      } catch (e) {
        return { ok: false, stage: "construct", error: String(e && e.message ? e.message : e) };
      }

      const decoded = [];
      try {
        for await (const sample of sink.samples()) {
          const c = document.createElement("canvas");
          c.width = sample.displayWidth;
          c.height = sample.displayHeight;
          const ctx = c.getContext("2d");
          sample.draw(ctx, 0, 0, sample.displayWidth, sample.displayHeight);
          decoded.push({
            width: c.width,
            height: c.height,
            data: ctx.getImageData(0, 0, c.width, c.height).data,
          });
          sample.close();
        }
      } catch (e) {
        return { ok: false, stage: "decode", error: String(e && e.message ? e.message : e) };
      } finally {
        input.dispose?.();
      }

      // Per-frame PSNR/specks against the SAME-INDEX reference -- direct
      // identity, not a nearest-neighbour search (that question belongs to
      // video-check.mjs; this script measures lossy-compression damage on
      // frames already known to correspond 1:1 by index).
      const perFrame = [];
      let totalSpecks = 0;
      let mseSum = 0;
      let scored = 0;
      for (let k = 0; k < decoded.length; k++) {
        const d = decoded[k];
        const ref = references[k];
        if (!ref || ref.width !== d.width || ref.height !== d.height) {
          perFrame.push({ k, error: "missing reference or size mismatch" });
          continue;
        }
        let se = 0;
        let specks = 0;
        for (let i = 0; i < d.data.length; i += 4) {
          const dr = d.data[i] - ref.data[i];
          const dg = d.data[i + 1] - ref.data[i + 1];
          const db = d.data[i + 2] - ref.data[i + 2];
          se += dr * dr + dg * dg + db * db;
          if (Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)) > 64) specks++;
        }
        const mse = se / ((d.data.length / 4) * 3);
        const psnr = mse === 0 ? Infinity : 10 * Math.log10(65025 / mse);
        perFrame.push({ k, specks, psnr: +psnr.toFixed(2) });
        totalSpecks += specks;
        mseSum += mse;
        scored++;
      }
      const overallPsnr = scored > 0 ? 10 * Math.log10(65025 / (mseSum / scored)) : null;

      return {
        ok: true,
        decodedFrameCount: decoded.length,
        referenceFrameCount: references.filter(Boolean).length,
        width: decoded[0]?.width ?? null,
        height: decoded[0]?.height ?? null,
        perFrame,
        totalSpecks,
        specksPerFrame: scored > 0 ? +(totalSpecks / scored).toFixed(1) : null,
        psnr: overallPsnr === null ? null : +overallPsnr.toFixed(2),
      };
    },
    { videoBase64, referenceFramesBase64 },
  );
}
