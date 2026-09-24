import { describe, it, expect, vi, afterEach } from "vitest";
import { runVideoExport, type RunVideoExportOptions } from "./videoPipeline";

/**
 * `videoPipeline.ts`'s four refusal paths (compile, `planExport`,
 * `planVideo`, and since the Phase 5B fix wave the encoder probe), which all
 * execute before `new Application()` and therefore need no browser.
 *
 * Added in the Task 5 fix round (task-5-review.md, F3). The module shipped
 * with no test on the argument that "hooks in this repo are verified through
 * the app" -- fair for `useExportVideo.ts`, which would need a Preact test
 * renderer this repo does not have, but `videoPipeline.ts` is not a hook. It
 * is a plain module in `src/compiler/export/`, where `exportContract.ts`,
 * `videoContract.ts`, `frameRaster.ts`, `lottieEncode.ts` and
 * `lottieGeometry.ts` all have `.test.ts` files.
 *
 * These tests pin the property R23 rests on and which was previously
 * evidenced only by a one-off browser click: **the triggering diagnostic's
 * message reaches the caller verbatim**, with no added prefix and no
 * rewording, because `useExportVideo.ts` puts `error.message` straight into a
 * toast a person reads.
 *
 * Nothing here imports a message constant and compares the module's output to
 * it -- that mistake produces a test that passes whatever the constant says,
 * and this phase has already hit it twice. Instead every assertion is either
 * a literal written independently here, a structural property (how many
 * diagnostics, which separator, which prefix), or a value derived from the
 * *fixture* rather than from the module: the `101x100` check below can only
 * pass if the diagnostic actually read this test's scene.
 *
 * Each refusal is also paired with a control that changes one input and
 * shows the same assertion then comes out the other way, so none of them can
 * be passing because "everything throws in a node environment".
 */

const BASE: Omit<RunVideoExportOptions, "source"> = { container: "mp4", fps: 30 };

/**
 * The `.message` of `runVideoExport`'s rejection, or a hard failure if it
 * did not reject at all -- so an assertion of the form "the message does not
 * contain X" can never pass by the call having quietly succeeded.
 */
async function refusalMessage(opts: RunVideoExportOptions): Promise<string> {
  try {
    await runVideoExport(opts);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected runVideoExport to reject, but it resolved");
}

/**
 * Past `planVideo` the pipeline probes the browser's encoder
 * (`assertVideoEncodable`) before building anything. This suite runs in
 * `environment: "node"`, which has no `VideoEncoder`, so a request both
 * contracts accept is refused there with `[VIDEO_NO_WEBCODECS]`. The controls
 * below assert exactly that: it proves both contracts passed, and that the
 * probe is the next thing that runs.
 */
function passedBothContracts(message: string): boolean {
  return (
    message.startsWith("[VIDEO_NO_WEBCODECS] ") &&
    !message.includes("[EXPORT_") &&
    !message.startsWith("Source did not compile:")
  );
}

describe("runVideoExport · refusal path 1, compilation", () => {
  it("reports a parse failure and stops before either export contract", async () => {
    const message = await refusalMessage({ ...BASE, source: "scene {" });
    expect(message).toMatch(/^Source did not compile: PARSE: .+/);
    // This scene is *also* unbounded, so it would refuse at `planExport` too.
    // Compilation refusing first is the property: there is no IR to plan
    // against, and reporting a missing `duration` on a file that does not
    // parse would be a worse message than the parse error.
    expect(message).not.toContain("[EXPORT_");
  });

  it("joins multiple compile errors with ' | ' and tags each with its phase", async () => {
    const message = await refusalMessage({
      ...BASE,
      source: "scene { size: (100, 100) circle c { radius: -3 } }",
    });
    const prefix = "Source did not compile: ";
    expect(message.startsWith(prefix)).toBe(true);
    // Two independent type errors from one object: no `position`, and a
    // negative `radius`. Splitting on the separator rather than searching for
    // it is deliberate -- a `" "` join would make this one part, not two.
    const parts = message.slice(prefix.length).split(" | ");
    expect(parts).toHaveLength(2);
    expect(parts.every((p) => p.startsWith("TYPE: "))).toBe(true);
  });
});

describe("runVideoExport · refusal path 2, planExport", () => {
  it("surfaces an unbounded-scene refusal verbatim, with no added prefix", async () => {
    const message = await refusalMessage({ ...BASE, source: "scene { size: (100, 100) }" });
    expect(message.startsWith("[EXPORT_UNBOUNDED_SCENE] ")).toBe(true);
    // R23's actual requirement. `devVideoSeam.ts` prefixes its rethrows with
    // `[export] ` for a Node harness author; this path ends in a user's
    // toast, so the same prefix here would be noise.
    expect(message).not.toContain("[export]");
    expect(message).not.toContain("Source did not compile");
    expect(message).not.toContain("[VIDEO_");
  });

  it("stops refusing once an explicit bound is supplied", async () => {
    // The control for the test above: same scene, one option added. If the
    // assertion there were pinned to something that is true of every failure
    // in this environment, this would still contain `[EXPORT_`.
    const message = await refusalMessage({
      ...BASE,
      source: "scene { size: (100, 100) }",
      durationSeconds: 1,
    });
    expect(message).not.toContain("[EXPORT_");
    expect(passedBothContracts(message)).toBe(true);
  });

  it("joins two simultaneous planExport diagnostics with ' | '", async () => {
    // `planExport` accumulates rather than returning on the first problem
    // (`exportContract.ts:87-118`), so an unbounded scene at an unsupported
    // frame rate yields exactly two diagnostics. This is the case that makes
    // the separator matter: each message is a complete sentence, and a bare
    // space would run them together into one paragraph in a toast.
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

describe("runVideoExport · refusal path 3, planVideo", () => {
  it("refuses odd pixel dimensions for mp4, after planExport has passed", async () => {
    const message = await refusalMessage({
      ...BASE,
      source: "scene { size: (101, 100) duration: 1 }",
    });
    expect(message.startsWith("[VIDEO_ODD_DIMENSIONS] ")).toBe(true);
    // Derived from this test's fixture, not from anything the module owns:
    // a canned diagnostic that never looked at the scene could not produce
    // these numbers.
    expect(message).toContain("101x100");
    // Proof the failure came from `planVideo` and not from `planExport`
    // refusing earlier for some unrelated reason.
    expect(message).not.toContain("[EXPORT_");
  });

  it("accepts the same odd-dimensioned scene for webm", async () => {
    // The control: `VIDEO_ODD_DIMENSIONS` is an H.264 4:2:0 chroma
    // constraint, so VP9/WebM has no such limit. Same scene, same fps, one
    // container changed, and both contracts now pass.
    const message = await refusalMessage({
      ...BASE,
      container: "webm",
      source: "scene { size: (101, 100) duration: 1 }",
    });
    expect(message).not.toContain("[VIDEO_ODD_DIMENSIONS]");
    expect(passedBothContracts(message)).toBe(true);
  });
});

/**
 * Ruling R45 / whole-branch review I-4 and I-5: the encoder probe runs before
 * the scene is built or sampled, so a refusal does not wait for (or get
 * pre-empted by) a long sample-and-rasterize phase. In this node suite,
 * anything past the probe reaches `new Application()` and fails on the
 * missing DOM, so a VIDEO_UNSUPPORTED_CODEC refusal here can only have come
 * from a probe that ran first.
 */
describe("runVideoExport · refusal path 4, the encoder probe runs before sampling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const SCENE = "scene { size: (100, 100) duration: 1 }";

  it("refuses an unsupported codec before building the scene", async () => {
    const probed: string[] = [];
    vi.stubGlobal("VideoEncoder", {
      isConfigSupported: async (config: { codec: string }) => {
        probed.push(config.codec);
        return { supported: false };
      },
    });
    const message = await refusalMessage({ ...BASE, source: SCENE });
    expect(message.startsWith("[VIDEO_UNSUPPORTED_CODEC] ")).toBe(true);
    // The plan's own string reached the probe: level 3 for 100x100 at the
    // default 8 Mbit/s (see videoContract.test.ts).
    expect(probed).toEqual(["avc1.42001e"]);
  });

  it("goes on to build the scene once the probe accepts", async () => {
    // The control: same request, supported. Now the failure is the node
    // environment's missing DOM, past every refusal this module owns.
    vi.stubGlobal("VideoEncoder", {
      isConfigSupported: async () => ({ supported: true }),
    });
    const message = await refusalMessage({ ...BASE, source: SCENE });
    expect(message).not.toContain("[VIDEO_");
    expect(message).not.toContain("[EXPORT_");
    expect(message).not.toContain("Source did not compile");
  });
});
