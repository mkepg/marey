import { runPngExport } from "../compiler/export/pngPipeline";
import { runApngExport } from "../compiler/export/apngPipeline";
import { runVideoExport } from "../compiler/export/videoPipeline";
import { runLottieExport } from "../compiler/export/lottiePipeline";
import { hashFrames } from "../compiler/export/frameHash";
import {
  EXPORT_ORIGIN,
  FRAME_PATH,
  toBase64,
  type CliExportRequest,
  type CliExportResult,
} from "./protocol";

/**
 * The export page: what `marey export` loads in headless Chromium (spec
 * §4.2). It has no UI. It installs one entry point, `window.__mareyCliExport`,
 * which compiles the source here, in the page, and runs the pipeline the
 * shipped export button runs for that format. The page only observes each
 * pipeline; it never re-implements one (ruling R45). `exportBoundary.test.ts`
 * pins what it may import.
 */

/** What `observer.onSampled` reported, read once the pipeline has returned. */
interface Sampled {
  /** `hashFrames` over the sampler's own output: simulation state, not pixels. */
  readonly hash: string;
  readonly frameCount: number;
}

function recordSampled(): {
  readonly onSampled: (frames: Parameters<typeof hashFrames>[0]) => void;
  readonly read: () => Sampled;
} {
  let sampled: Sampled | undefined;
  return {
    onSampled: (frames) => {
      sampled = { hash: hashFrames(frames), frameCount: frames.length };
    },
    read: () => {
      if (!sampled) throw new Error("[export] The pipeline returned without reporting its sampled frames.");
      return sampled;
    },
  };
}

/**
 * An APNG's width and height, from its IHDR chunk: the 8-byte PNG signature,
 * then IHDR's length and type, then width at bytes 16-19 and height at 20-23,
 * big-endian. Read from the file itself because `runApngExport` returns only
 * the bytes, and the size a caller reports should be the size it wrote.
 */
function apngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = String.fromCharCode(...bytes.subarray(12, 16));
  if (bytes.byteLength < 24 || type !== "IHDR") {
    throw new Error("[export] The APNG does not start with an IHDR chunk, so its size cannot be read.");
  }
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * Each frame's PNG goes to the CLI as it is produced, placed by
 * `frame.index`. The whole sequence is never held in the page.
 */
async function postFrame(index: number, png: Uint8Array): Promise<void> {
  const response = await fetch(EXPORT_ORIGIN + FRAME_PATH + index, {
    method: "POST",
    // TS 5.9's DOM lib narrows `BodyInit`'s buffers to `ArrayBuffer`-backed
    // views, while `pngBytesOf` returns `Uint8Array<ArrayBufferLike>`; the
    // bytes are an ordinary `ArrayBuffer`'s (`Blob.arrayBuffer()`).
    body: png as Uint8Array<ArrayBuffer>,
  });
  if (!response.ok) {
    throw new Error(`[export] The CLI refused frame ${index} (HTTP ${response.status}).`);
  }
}

/**
 * One export, by format. `fps` and `frameCount` come from what the pipeline
 * reports where it reports them (the PNG result, the `VideoPlan`, the Lottie
 * document's `fr`), and otherwise from the request and the sampled frames:
 * `planExport` accepts `fps` unchanged and the sampler returns one snapshot
 * per planned frame. Width and height are always read from what was produced,
 * with no pipeline signature changed for them: the PNG result, the video's
 * coded size, the APNG's IHDR, the Lottie document's `w`/`h`.
 */
async function exportFormat(request: CliExportRequest): Promise<CliExportResult> {
  const { source, fps, durationSeconds } = request;
  const sampled = recordSampled();
  const observer = { onSampled: sampled.onSampled };

  switch (request.format) {
    case "png": {
      const result = await runPngExport({
        source,
        fps,
        durationSeconds,
        onPng: (frame, png) => postFrame(frame.index, png),
        observer,
      });
      return {
        ok: true,
        fps: result.fps,
        frameCount: result.frameCount,
        width: result.width,
        height: result.height,
        hash: sampled.read().hash,
        fileBase64: null,
        text: null,
      };
    }
    case "apng": {
      const bytes = await runApngExport({ source, fps, durationSeconds, observer });
      const { hash, frameCount } = sampled.read();
      return { ok: true, fps, frameCount, ...apngSize(bytes), hash, fileBase64: toBase64(bytes), text: null };
    }
    // `mp4` goes through WebCodecs, exactly as `webm` does, until the
    // ffmpeg frames-out path (spec §5) replaces it.
    case "webm":
    case "mp4": {
      let planned: { fps: number; frameCount: number; width: number; height: number } | undefined;
      const bytes = await runVideoExport({
        source,
        container: request.format,
        fps,
        durationSeconds,
        observer: {
          ...observer,
          onPlanned: (plan) => {
            planned = { fps: plan.fps, frameCount: plan.frameCount, width: plan.width, height: plan.height };
          },
        },
      });
      if (!planned) throw new Error("[export] runVideoExport returned without reporting a plan.");
      return { ok: true, ...planned, hash: sampled.read().hash, fileBase64: toBase64(bytes), text: null };
    }
    case "lottie": {
      const doc = await runLottieExport({ source, fps, durationSeconds, observer });
      const { hash, frameCount } = sampled.read();
      return {
        ok: true,
        fps: doc.fr,
        frameCount,
        width: doc.w,
        height: doc.h,
        hash,
        fileBase64: null,
        text: JSON.stringify(doc),
      };
    }
    default: {
      // The request crosses `page.evaluate` untyped, so a format outside the
      // union can still arrive. Refuse it by name.
      const format: never = request.format;
      throw new Error(`[export] Unknown export format '${String(format)}'.`);
    }
  }
}

/**
 * Any thrown error becomes `{ ok: false }` with its message verbatim: the
 * pipelines' messages are already the `[EXPORT_*]`/`[VIDEO_*]` diagnostics a
 * person reads, and the CLI prints them as they are.
 */
async function cliExport(request: CliExportRequest): Promise<CliExportResult> {
  try {
    return await exportFormat(request);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

window.__mareyCliExport = cliExport;
