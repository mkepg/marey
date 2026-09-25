# Phase 5C — Lottie completion and video quality Implementation Plan

**Goal:** Ship five things:
- MP4/WebM at 2× the scene size;
- a pixel-perfect APNG export;
- Lottie export of `line` and `text`;
- a Lottie button in the top bar.

Each is proven by measurement against the lossless frames.

**Architecture:** Every export has exactly one orchestration module; the dev
seams observe it rather than copy it. Encoders stay pure: `lottieEncode.ts` and
`lottieGeometry.ts` import neither pixi.js nor harfbuzzjs, and `apngEncode.ts`
imports nothing. Pixi supplies text layout, HarfBuzz supplies the glyphs, and
the pipeline joins them as plain data.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`), pixi.js 8.16.0,
mediabunny 1.58.0, harfbuzzjs 1.6.2 (new), Vitest 4, Playwright Chromium,
lottie-web 5.13.0, dotlottie-web.

**Spec:** `docs/specs/2026-09-24-marey-phase-5c-lottie-completion-and-video-quality-design.md`
("spec §N"). Read it before any task. The plan argues from it.

## Global Constraints

Every task's requirements implicitly include this section.

1. **Baseline.** At `4a23e1d` (the spec is `aad331d` on top), the suite is
   **37 files / 937 tests** and `npx tsc -b --noEmit` exits 0. Re-derive both
   on a clean tree before quoting. A stray probe file silently inflates the
   count (AGENT-LESSONS §6).
2. **Run everything from `C:\Users\gomez\repos\PROGRAMMING_LANGUAGE\marey`,
   with a capital `C:`.** With the shell's working directory spelled `c:\…`,
   `npx vitest run` fails all 37 files with "no tests". This was measured
   while taking the baseline. If a run reports "no tests", `cd` to the
   capital-C path and re-run before concluding anything.
3. **Judge file changes with `git diff --stat -- <path>`, never `git
   status`.** `core.autocrlf=true` with no `.gitattributes` makes `git
   status` report modification on content identical after normalisation.
4. **Commit as you go, from the first step of every task.** Phases 5A and 5B
   each took seven interruptions. Commits made before a kill cost nothing. Do
   not save one commit for the end.
5. **No AI attribution in any commit.** No `Co-Authored-By` trailer for any
   AI, and no "Generated with" line. This is the project owner's rule and it
   overrides any tool default.
6. **Structural rules** (spec §7). Each is a test in `exportBoundary.test.ts`
   by the end of the task that introduces the module:
   - `lottieEncode.ts` imports no pixi.js, sceneIR or harfbuzzjs;
   - `lottieGeometry.ts` imports no pixi.js or harfbuzzjs;
   - `textOutline.ts` imports no pixi.js or sceneIR;
   - `apngEncode.ts` imports no pixi.js or sceneIR;
   - no pipeline imports a dev seam;
   - `useExport.ts` loads pipelines only by dynamic `import()`.
7. **One orchestration per export** (5B ruling R45). A dev seam *observes* its
   pipeline and never re-implements it. If a task finds itself copying the
   compile → plan → build → sample loop, stop and report.
8. **Renderer invariants** (`docs/architecture/renderer.md`). Every export
   `Application` uses `autoStart: false`. Nothing here may read a wall clock
   into scene state.
9. **Do not modify `sceneIR.ts`, `frameSampler.ts` or `exportContract.ts`.**
   The one sanctioned exception is adding `EXPORT_FONT_UNAVAILABLE` (T7).
   That code does not belong in `exportContract.ts`, which gates timing. It
   goes in a new `exportFonts.ts`. If a task believes it needs any other
   change there, report it; do not make it.
10. **Mutate the product, not the tests** (spec §8; 5B's lesson). Each task
    lists the user-visible breakages it must prove are caught. Apply, run and
    revert each in one shell command, and confirm `git diff --stat` is empty
    afterwards.
11. **Delete-and-run, individually.** For every behaviour a task requires,
    delete the line implementing it and run. Anything still green is
    untested. Revert each of N call sites *separately* (AGENT-LESSONS §2c).
12. **Scope tie-break** (AGENT-LESSONS §3b). *A gap the delete-and-run check
    finds in a behaviour the task **requires** is in scope and must be
    closed. A gap it finds in an **adjacent** behaviour is filed in the
    report, not fixed.*
13. **Read every RED.** A failure caused by a wrong fixture or a missing
    method looks exactly like the failure you are waiting for. Confirm the
    message names the missing *behaviour* (AGENT-LESSONS §3d).
14. **Report what you did not do** (AGENT-LESSONS §2f). This includes not
    inventing a test for a case that cannot occur. Prove the unreachability
    instead.
15. **Browser checks need `npx vite --port 5199 --strictPort`.** Before
    starting it, confirm nothing is listening:
    `netstat -ano | grep -E "[:.]5199[[:space:]].*LISTENING"` must print
    nothing. Kill the server afterwards and re-run the same check. Stopping a
    background task can leave vite running.
16. **Network.** Bash has no outbound HTTP (`curl` returns 000). `npm` does
    reach the registry (measured: `npm view harfbuzzjs version` → `1.6.2`).
    Use WebFetch/WebSearch for documentation.
17. **"The file plays" is not evidence.** Every quality or fidelity claim is
    a number measured against the lossless frames, with the command that
    produced it.
18. **WebCodecs is `SecureContext`-gated.** Probe pages must be served from
    `localhost`, never `about:blank` or `file://`.

### A note on this plan's code blocks

Every Marey plan so far carried defects in its verbatim code blocks (5A seven,
5B seventeen). So two labelled classes:

- **MEASURED.** Read from real source at `aad331d`, or run against it while
  writing this plan. If one is wrong, report it loudly: the file changed.
- **UNVERIFIED.** Written from reasoning or from type declarations, not run.
  **A claim to verify, not text to paste.** If a symbol does not exist with
  that spelling, adapt and report. Preserve the assertion, not the spelling.
  Before relying on a verbatim test's call into a fake or helper, open the
  helper and confirm the method exists and *records what the assertion
  reads* (AGENT-LESSONS §3d).

Pure-module code (CRC-32, APNG chunk layout, quadratic-to-cubic conversion,
the line stroke item, the video-scale arithmetic) is given in full. Pipeline
and hook changes are given as call sites and required behaviour, because they
edit long files whose surrounding comments carry reasoning that must survive
(5B defect #4: a "MEASURED" paraphrase dropped four documented reasons).

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/compiler/export/videoContract.ts` | modify (T1) | `VIDEO_SCALE`, coded size in `VideoPlan`, the device-limit check and diagnostic, rewritten codec-level message |
| `src/compiler/export/frameRaster.ts` | modify (T1) | `scale` argument; the rule text |
| `src/compiler/export/videoPipeline.ts` | modify (T1, T4) | 2× app init and device-limit read (T1); uses `rasterExport.ts` (T4) |
| `src/compiler/export/pngSequence.ts` | modify (T1, T5) | passes `scale: 1` (T1); exports `pngBytesOf` (T5) |
| `src/compiler/export/lottieGeometry.ts` | modify (T2, T3, T8) | `line` spec (T2); export `hexToRgb01` (T3); text spec + `LOTTIE_TEXT_MISSING_GLYPH` (T8) |
| `src/compiler/export/lottieEncode.ts` | modify (T2, T8) | open path + stroke (T2); text contours + fill (T8) |
| `src/compiler/export/lottiePipeline.ts` | create (T3) | `runLottieExport`, the only Lottie orchestration |
| `src/lib/devLottieSeam.ts` | modify (T3) | observer of `runLottieExport` |
| `src/hooks/useExport.ts` | create (T3), replacing `useExportVideo.ts` | one hook for all export kinds |
| `src/components/TopBar/TopBar.tsx` | modify (T3, T5) | lottie button (T3); apng button (T5) |
| `src/compiler/export/rasterExport.ts` | create (T4) | shared compile/plan/build/sample/rasterize/teardown prefix; `ensureExportFonts` (T7) |
| `src/lib/devExportSeam.ts` | modify (T4) | PNG seam uses `rasterExport.ts` rather than its own copy |
| `src/compiler/export/apngEncode.ts` | create (T5) | pure APNG muxer + CRC-32 |
| `src/compiler/export/apngPipeline.ts` | create (T5) | `runApngExport` |
| `src/lib/devApngSeam.ts` | create (T5) | dev observer for `apng-check.mjs` |
| `src/compiler/export/textOutline.ts` | create (T7) | the only harfbuzzjs importer: shape + outline |
| `src/compiler/export/exportFonts.ts` | create (T7) | `EXPORT_FONT_UNAVAILABLE` and the font-ready helper |
| `src/compiler/export/exportBoundary.test.ts` | modify (every task that adds a module) | structural rules |
| `tools/visual-check/quality-check.mjs` | create (T1) | PSNR and specks against lossless 2× frames |
| `tools/visual-check/apng-check.mjs` | create (T5) | APNG decode-and-compare |
| `tools/visual-check/text-check.mjs` | create (T8) | layout agreement + ink-bbox position check |
| `tools/visual-check/scenes/*.marey` | create (T2, T8) | line and text fixtures |
| `vite-plugins/licenses/*`, `vite-plugins/thirdPartyLicenses.ts` | modify (T8) | HarfBuzz licence, full OFL |
| `eval/RESULTS-PHASE-5C.md` | create (T1), append in every task | exit evidence |
| `docs/architecture/renderer.md`, `docs/engineering-lessons.md`, `README.md`/`roadmap-and-process.md` phase lines | modify (T9) | docs and status |

---

## Task 1: 2× video

**Tier:** Integration. **Spec:** §2.

**Files:**
- Modify: `src/compiler/export/videoContract.ts`, `src/compiler/export/videoContract.test.ts`
- Modify: `src/compiler/export/frameRaster.ts`, `src/compiler/export/frameRaster.test.ts`
- Modify: `src/compiler/export/pngSequence.ts` (pass `1`), `src/compiler/export/videoPipeline.ts`, `src/lib/devVideoSeam.ts` (the result's width/height)
- Modify: `tools/visual-check/video-check.mjs`, `tools/visual-check/SKILL.md`
- Create: `tools/visual-check/quality-check.mjs`, `eval/RESULTS-PHASE-5C.md`

**Interfaces:**
- Produces:
  - `export const VIDEO_SCALE = 2;`
  - `VideoPlan` gains `readonly scale: number; readonly sceneWidth: number; readonly sceneHeight: number;`. `width`/`height` are now the **coded** size.
  - `export function deviceLimitDiagnostic(plan: VideoPlan, maxTextureSize: number, maxRenderbufferSize: number): VideoDiagnostic | null`
  - `VideoDiagnosticCode` gains `"VIDEO_EXCEEDS_DEVICE_LIMITS"`.
  - `createFrameRasterizer(app, root, frames, scale: number)`. The 4th argument is **required**, so a caller that forgets it is a type error, not a silent 1×.

- [ ] **Step 1: Write the failing contract tests** (UNVERIFIED; adapt to `videoContract.test.ts`'s existing helpers such as `codes(r)`, and read them first)

```ts
describe("2x video (Phase 5C)", () => {
  it("pins the scale at exactly 2", () => {
    expect(VIDEO_SCALE).toBe(2);
  });

  it("plans the coded size at twice the scene size and keeps the scene size", () => {
    const r = planVideo(sceneOf(800, 600), samplerPlan(30, 180), { container: "mp4" });
    if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
    expect([r.plan.width, r.plan.height]).toEqual([1600, 1200]);
    expect([r.plan.sceneWidth, r.plan.sceneHeight]).toEqual([800, 600]);
    expect(r.plan.scale).toBe(2);
  });

  it("chooses the codec level from the coded size, not the scene size", () => {
    // 800x600 at 1x selected avc1.42001f (level 3.1). 1600x1200 = 7,500 MBs > 3.1's 3,600.
    const r = planVideo(sceneOf(800, 600), samplerPlan(30, 180), { container: "mp4" });
    if (!r.ok) throw new Error("unexpected refusal");
    expect(r.plan.fullCodecString).not.toBe("avc1.42001f");
    expect(r.plan.fullCodecString).toBe(h264CodecString(h264LevelFor(1600, 1200, 30, DEFAULT_BITRATE)!));
  });

  it("names both sizes and the 2x factor when no codec level fits", () => {
    const r = planVideo(sceneOf(2400, 1600), samplerPlan(30, 30), { container: "mp4" });
    expect(r.ok).toBe(false);
    const msg = (r as { diagnostics: { message: string }[] }).diagnostics[0].message;
    expect(msg).toContain("exports at 2x the scene's size");
    expect(msg).toContain("2400x1600 scene");
    expect(msg).toContain("4800x3200 video");
  });

  it("refuses a coded size above the device texture or renderbuffer limit", () => {
    const r = planVideo(sceneOf(1200, 800), samplerPlan(30, 30), { container: "webm" });
    if (!r.ok) throw new Error("unexpected refusal");
    expect(deviceLimitDiagnostic(r.plan, 2048, 4096)?.code).toBe("VIDEO_EXCEEDS_DEVICE_LIMITS");
    expect(deviceLimitDiagnostic(r.plan, 4096, 2048)?.code).toBe("VIDEO_EXCEEDS_DEVICE_LIMITS");
    expect(deviceLimitDiagnostic(r.plan, 2400, 2400)).toBeNull();          // 2400 = coded width: allowed
    expect(deviceLimitDiagnostic(r.plan, 2399, 4096)?.message).toContain(
      "this device can render at most 2399x2399 pixels",
    );
  });

  it("keeps the odd-dimension check on the coded size, where 2x makes it unreachable", () => {
    const r = planVideo(sceneOf(801, 601), samplerPlan(30, 30), { container: "mp4" });
    expect(r.ok).toBe(true);    // 1602x1202: even
  });
});
```

`sceneOf`/`samplerPlan` stand for whatever fixture builders the file already
uses. Find them; do not add new ones if equivalents exist.

- [ ] **Step 2: Run and read the RED.** `npx vitest run src/compiler/export/videoContract.test.ts`. It should fail on the missing `VIDEO_SCALE`/`deviceLimitDiagnostic` imports and the 800×600 dimensions, *not* on a fixture helper name.

- [ ] **Step 3: Implement in `videoContract.ts`** (UNVERIFIED shape; keep every existing comment)

```ts
/**
 * Every MP4/WebM export is encoded at this multiple of the scene's declared
 * size (spec §2.1, owner decision O3). 2x lands 4:2:0 chroma at the scene's
 * own resolution, which is what lifted PSNR from ~40 to ~42 dB in findings
 * §1.2. A scene too large for it is refused, never silently exported at 1x.
 */
export const VIDEO_SCALE = 2;
```

In `planVideo`:
- compute `const width = ir.width * VIDEO_SCALE, height = ir.height * VIDEO_SCALE;` once;
- use them for the odd-dimension check, both `*LevelFor` calls and the diagnostic;
- add a comment on the odd-dimension check saying it is unreachable while `VIDEO_SCALE` is even, and is kept because it is correct for the coded size under any scale;
- return `width, height, scale: VIDEO_SCALE, sceneWidth: ir.width, sceneHeight: ir.height`.

Rewrite `exceedsCodecLevelsDiagnostic`'s message. The new parameters are the scene size and the coded size:

```ts
message: `[VIDEO_EXCEEDS_CODEC_LEVELS] Video exports at ${VIDEO_SCALE}x the scene's size, so a ${sceneWidth}x${sceneHeight} scene becomes a ${width}x${height} video; at ${fps}fps and ${bitrate / 1_000_000} Mbit/s that is too large or too fast for ${container.toUpperCase()} export, whose highest supported codec level is ${top}. ${advice}`,
```

Add:

```ts
export function deviceLimitDiagnostic(
  plan: VideoPlan,
  maxTextureSize: number,
  maxRenderbufferSize: number,
): VideoDiagnostic | null {
  const limit = Math.min(maxTextureSize, maxRenderbufferSize);
  if (plan.width <= limit && plan.height <= limit) return null;
  return {
    code: "VIDEO_EXCEEDS_DEVICE_LIMITS",
    message: `[VIDEO_EXCEEDS_DEVICE_LIMITS] Video exports at ${plan.scale}x the scene's size, so this ${plan.sceneWidth}x${plan.sceneHeight} scene needs a ${plan.width}x${plan.height} frame, but this device can render at most ${limit}x${limit} pixels. Make the scene's 'size' smaller.`,
  };
}
```

Existing tests pinning 800×600 → `avc1.42001f`, and 1920×1080 decoding, now
describe the coded size. Update each to the new truth and **say so in the
commit message**, listing every test whose expectation changed and why. Do
not delete one.

- [ ] **Step 4: Run** the contract file, then the whole suite. Commit: `feat(5c): plan video at 2x the scene size, with named refusals`.

- [ ] **Step 5: Rasterizer `scale`.** In `frameRaster.ts`, add the parameter,
  pass `resolution: scale`, and rewrite the docstring bullet to the spec §2.2
  rule text:

  > "the output is the scene's declared pixel size times the exporter's
  > scale; never the preview's `devicePixelRatio`, and never a content
  > bounding box"

  Add a paragraph explaining why the region stays in scene units
  (`GenerateTextureSystem` multiplies by resolution; research §6). Then
  update `pngSequence.ts` to pass `1`, and `videoPipeline.ts` to pass
  `video.plan.scale`.

  Add one `frameRaster.test.ts` case asserting the extract call receives
  `resolution: 2` when given 2. Open the existing test file first and use its
  mock pattern. If `extract.canvas` is not observable there, report that and
  rely on the browser check in Step 7.

- [ ] **Step 6: App resolution and device limits, in `videoPipeline.ts`.**
  - Change `app.init({ … resolution: 1 … })` to `resolution: video.plan.scale`, with a comment naming the Text-texture trap (spec §2.2).
  - After `init` and before `buildNode`, read the limits:
    ```ts
    const gl = (app.renderer as unknown as { gl: WebGL2RenderingContext }).gl;
    const refusal = deviceLimitDiagnostic(video.plan, gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    if (refusal) throw new Error(refusal.message);
    ```
    Verify `app.renderer.gl` is the property name in pixi 8.16.0's `WebGLRenderer` (`node_modules/pixi.js/lib/rendering/renderers/gl/`). If the renderer is WebGPU, report it.
  - Update `devVideoSeam.ts` so the result carries `width`/`height` (coded) and `sceneWidth`/`sceneHeight`.
  - Commit: `feat(5c): rasterize and encode video at 2x`.

- [ ] **Step 7: Harness at 2×.**
  - `video-check.mjs`: add a gate asserting `result.width === 2 * sceneWidth` and the same for height, and print both.
  - Reference frames already come from the canvases the encoder was given, so they are 2× automatically. Confirm by reading `onFrame`.
  - Create `quality-check.mjs` by porting `docs/research/2026-09-24-export-quality-probes/matrix-run.mjs` onto the dev seam. It exports once, decodes with `VideoDecoder`, and reports per container: PSNR over RGB, and specks (pixels whose max channel delta against the reference exceeds 64), per frame and total. It measures against `referenceFrames` and prints the command line into its report.
  - Document both in `SKILL.md`.
  - Commit.

- [ ] **Step 8: Measure** (vite on 5199, per GC15):
  - `video-check.mjs` on `linear-motion.marey`, MP4 and WebM. Every gate passes at 1600×1200-class sizes.
  - `quality-check.mjs` on the default scene: expect about 42 dB for both codecs. Record kbit/s, PSNR and specks per frame.
  - **Text sharpness** (spec §2.2): on a scene with `text` at fontSize 60, measure the antialiased edge-band width across a vertical stem in the 2× reference frame. Then temporarily set the app init back to `resolution: 1` and measure again. Record both, then revert.
  - Write all of it to `eval/RESULTS-PHASE-5C.md` under "Piece 1", with the commands.

- [ ] **Step 9: Product mutations** (GC10). Each must go red, and each is reverted:
  (a) `resolution: 1` in `frameRaster.ts`'s extract → the `video-check.mjs` size gate;
  (b) app init `resolution: 1` → the Step 8 edge-band measurement;
  (c) delete the `deviceLimitDiagnostic` throw → the contract test still covers the pure function, so state that the pipeline line itself is guarded only by the browser check, **or** add a browser check with a forced tiny limit. Report which.

  Record the results in the evidence. Commit.

---

## Task 2: `line` in Lottie

**Tier:** Integration. **Spec:** §3.

**Files:**
- Modify: `src/compiler/export/lottieGeometry.ts`, `lottieGeometry.test.ts`
- Modify: `src/compiler/export/lottieEncode.ts`, `lottieEncode.test.ts`
- Modify: `src/compiler/export/lottieRoundTrip.test.ts` if it enumerates kinds
- Modify: `src/compiler/export/exportBoundary.test.ts` (lottie rows of GC6)
- Create: `tools/visual-check/scenes/lottie-line-miter.marey`, `lottie-line-scale.marey`, `lottie-line-caps.marey`

**Interfaces:**
- Produces:
  - `LottieShapeSpec` gains `{ readonly kind: "line"; readonly points: ReadonlyArray<{x:number;y:number}>; readonly thickness: number }`
  - `LottieShapeItem` gains `{ ty: "st"; nm: string; c: LottieColorProperty; o: LottieScalarProperty; w: LottieScalarProperty; lc: 1; lj: 1; ml: number }`
  - `LottieDiagnosticCode` loses `"LOTTIE_UNSUPPORTED_LINE"`.

- [ ] **Step 1: Boundary rows first.** Add `exportBoundary.test.ts` cases, using
  the file's existing `importsModule` helper and `?raw` imports:
  - `lottieEncode.ts` imports neither `pixi.js`, `sceneIR` nor `harfbuzzjs`;
  - `lottieGeometry.ts` imports neither `pixi.js` nor `harfbuzzjs`.

  They pass today. Prove each can fail by temporarily adding `import "pixi.js";` to the target file, then revert. Commit.

- [ ] **Step 2: Failing geometry test** (UNVERIFIED; mirror the file's existing polygon test)

```ts
it("plans a line as an open-path spec anchored like builder.ts's line case", () => {
  const ir = sceneWith(lineNode("l", { points: [{x:0,y:0},{x:100,y:0},{x:100,y:50}], thickness: 6, origin: {x:0.5,y:0.5}, color: "#102030" }));
  const r = planLottie(ir);
  if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
  expect(r.layers[0].shape).toEqual({ kind: "line", points: [{x:0,y:0},{x:100,y:0},{x:100,y:50}], thickness: 6 });
  expect(r.layers[0].anchor).toEqual({ x: 50, y: 25 });   // bbox (0,0)-(100,50), origin 0.5
  expect(r.layers[0].color).toEqual([0x10/255, 0x20/255, 0x30/255]);
});
```

Also replace the existing `LOTTIE_UNSUPPORTED_LINE` test with one asserting a
scene containing a `line` plans `ok: true`. Read the old test first. Delete it
only in the same commit that adds its replacement.

- [ ] **Step 3: RED, then implement** a `case "line"` in `shapeGeometryFor`,
  reusing `polygonBBox`. Remove the `line` refusal arm from `walk`, and
  `"LOTTIE_UNSUPPORTED_LINE"` from the union. Run and commit.

- [ ] **Step 4: Failing encoder test** (UNVERIFIED)

```ts
it("encodes a line as an open path followed by a butt/miter/10 stroke, never a fill", () => {
  const doc = encodeLottie([lineSpec({ points: [{x:0,y:0},{x:10,y:0}], thickness: 4, color: [1,0,0] })], oneFrame, plan, scene);
  const items = (doc.layers.find((l) => l.ty === 4) as LottieShapeLayer).shapes;
  expect(items.map((i) => i.ty)).toEqual(["sh", "st"]);
  const sh = items[0] as Extract<LottieShapeItem, { ty: "sh" }>;
  expect(sh.ks.k.c).toBe(false);
  expect(sh.ks.k.i).toEqual([[0,0],[0,0]]);
  expect(sh.ks.k.o).toEqual([[0,0],[0,0]]);
  expect(items[1]).toMatchObject({ ty: "st", c: { a: 0, k: [1,0,0] }, o: { a: 0, k: 100 }, w: { a: 0, k: 4 }, lc: 1, lj: 1, ml: 10 });
});
```

- [ ] **Step 5: RED, then implement** in `shapeItemsFor`:

```ts
case "line": {
  // An open path (c: false) with straight edges — pixi's `.poly(points, false)`.
  const v = shape.points.map((p) => [p.x, p.y]);
  const zeros = v.map(() => [0, 0]);
  items.push({ ty: "sh", nm: name, ks: { a: 0, k: { i: zeros, o: zeros, v, c: false } } });
  break;
}
```

  After the switch, the style item depends on the kind. A line gets a
  **stroke** instead of the fill, placed after the path for the same
  backward-`searchShapes` reason the existing fill comment gives:

```ts
if (shape.kind === "line") {
  // pixi.js 8.16.0 GraphicsContext.defaultStrokeStyle: alignment 0.5 (centred,
  // which is the only alignment a Lottie stroke has), cap "butt" (lc 1), join
  // "miter" (lj 1), miterLimit 10 (ml). See spec §3.4 for what was measured.
  items.push({ ty: "st", nm: `${name} stroke`, c: { a: 0, k: [...color!] }, o: staticScalar(100), w: staticScalar(shape.thickness), lc: 1, lj: 1, ml: 10 });
} else if (color !== null) { /* existing fill push, unchanged */ }
```

  Run and commit.

- [ ] **Step 6: Flip the judgment calls** (§2d). Put the stroke *before* the
  path: the Step 4 test must go red. Emit `c: true`: red. Revert both and
  record the results.

- [ ] **Step 7: Measure the three spec §3.4 facts** in lottie-web (GC15; use
  `lottie-check.mjs --compare-png` and `--at`).

  1. **Miter.** For a corner of interior angle θ, the SVG miter ratio is
     `1/sin(θ/2)`. Write `lottie-line-miter.marey` with two lines, thickness
     20: one with θ = 14° (ratio ≈ 8.2, mitered under SVG's limit 10) and one
     with θ = 9° (ratio ≈ 12.7, bevelled under SVG). Sample the pixel just
     beyond the bevel line at each tip, in both Marey's PNG export and
     lottie-web. Record whether pixi and Lottie agree at each corner.
     - If they disagree, find the `ml` that reproduces pixi by reading
       pixi's `buildLine.mjs` miter test (`node_modules/pixi.js/lib/scene/graphics/shared/buildCommands/buildLine.mjs`),
       set it with a comment citing the line, and re-measure.
  2. **Non-uniform scale.** `lottie-line-scale.marey`: a horizontal and a
     vertical line, thickness 10, with `scale: (0.35, 0.5)`. Measure the
     stroke thickness in pixels in both renderers. They are expected to
     agree (vertical 5 px, horizontal 3.5 px).
  3. **Caps.** `lottie-line-caps.marey`: a two-point line, and a line with a
     repeated point. Compare the end pixels.

  Then Criterion 2 on each fixture (`--compare-png`): record maxDelta and
  share. Write it all under "Piece 2" in `eval/RESULTS-PHASE-5C.md`, with
  commands. Commit.

---

## Task 3: `runLottieExport`, the hook, and the lottie button

**Tier:** Integration. **Spec:** §4.

**Files:**
- Create: `src/compiler/export/lottiePipeline.ts`, `src/compiler/export/lottiePipeline.test.ts` (Node-side only if the file can run headlessly; see Step 1)
- Modify: `src/compiler/export/lottieGeometry.ts` (export `hexToRgb01`), `src/compiler/export/lottieRoundTrip.test.ts` (use the export)
- Modify: `src/lib/devLottieSeam.ts` (observer)
- Create: `src/hooks/useExport.ts`. Delete: `src/hooks/useExportVideo.ts`
- Modify: `src/components/TopBar/TopBar.tsx`, `src/compiler/export/exportBoundary.test.ts`, `src/compiler/export/exportApp.test.ts` (if it reads `devLottieSeam.ts?raw` for teardown patterns, move that assertion to `lottiePipeline.ts?raw`)
- Modify: `tools/visual-check/lottie-check.mjs` (comments only, unless the seam's result shape changes)
- Create: `tools/visual-check/lottie-click-check.mjs`

**Interfaces:**
- Consumes: `planLottie`, `encodeLottie`, `planExport`, `buildNode`, `sampleFrames`, `SceneRuntime`, `MatterWorld`, `destroyExportApp`, all as `devLottieSeam.ts` uses them today.
- Produces:

```ts
export interface LottieExportObserver {
  readonly onSampled?: (frames: ReadonlyArray<FrameSnapshot>) => void;
}
export interface RunLottieExportOptions {
  readonly source: string;
  readonly fps: number;
  readonly durationSeconds?: number;
  readonly observer?: LottieExportObserver;
}
export function runLottieExport(opts: RunLottieExportOptions): Promise<LottieDoc>;
```

and, in `useExport.ts`:

```ts
export type ExportKind = "mp4" | "webm" | "apng" | "lottie";
export interface ExportProgress { readonly kind: ExportKind; readonly done: number; readonly total: number }
export function useExport(): { readonly exportScene: (kind: ExportKind) => Promise<void>; readonly progress: ExportProgress | null };
```

`"apng"` is in the union from this task onward. Until T5 its branch throws
`new Error("[export] APNG export is not available yet.")`, and TopBar renders
no apng button. T5 replaces the branch.

- [ ] **Step 1: Move the orchestration.** Create `lottiePipeline.ts` by
  **moving** the body of `devLottieSeam.ts`'s `exportLottie`, not copying it.
  Keep every comment about `app`/`renderer` teardown ordering.
  - Errors are thrown with the diagnostic text **unprefixed**, joined with `" | "`, as `runVideoExport` does. The dev seam re-prefixes with `[export] `.
  - The document's `nm` becomes `"Marey scene"`.
  - `hexToRgb01` is imported from `lottieGeometry.ts`, which now exports it. Delete the seam's copy and `lottieRoundTrip.test.ts`'s copy, together with their "not a new instance of §5" comments, which stop being true.
  - `devLottieSeam.ts` becomes about 30 lines: call `runLottieExport` with `observer.onSampled` capturing `frames`, then return `{ doc, hash: hashFrames(frames), fps, frameCount }`. `fps`/`frameCount` come from the doc (`fr`, `op`) or from the frames; do not re-plan.
  - `npx tsc -b --noEmit`, run the suite, commit.

- [ ] **Step 2: Boundary guards** (UNVERIFIED names; mirror the existing R3 block at `exportBoundary.test.ts:369`):
  - `lottiePipeline.ts` does not import `devLottieSeam` and does not reach `__mareyExportLottie`;
  - `useExport.ts` does not import any `dev*Seam`;
  - `useExport.ts` loads `videoPipeline` and `lottiePipeline` only through dynamic `import()`. Use the file's static-vs-dynamic helper, which the "tells a static import of a module from a dynamic one" test proves;
  - `TopBar.tsx` does not import any dev seam.

  Retarget the existing `useExportVideo.ts` rows to `useExport.ts`; do not delete them. Prove one new row can fail with a temporary static import, then revert. Commit.

- [ ] **Step 3: The hook.** Create `useExport.ts` from `useExportVideo.ts`.
  Keep its docstring's reasoning (the toast flooding, the dynamic import and
  its measured +283,561 B, the `finally`), generalised.
  - One `download(bytes: Uint8Array | string, filename: string, mime: string)` helper.
  - `mp4`/`webm` call `runVideoExport` exactly as today.
  - `lottie` calls `runLottieExport({ source: code, fps: EXPORT_FPS })`, then `download(JSON.stringify(doc), "scene.json", "application/json")`, and toasts `Exported scene.json`.
  - Delete `useExportVideo.ts`. `grep -rn useExportVideo src` must be empty afterwards.
  - Commit.

- [ ] **Step 4: The button.** In `TopBar.tsx`, add a **lottie** button after
  **webm**, with the same markup pattern: `disabled={isExporting}`, the
  `btnExporting` class while running, and `aria-label` "Export scene as Lottie
  animation (JSON)" or, while running, "Exporting Lottie animation".
  - Its label while running is `…`. Lottie has no per-frame progress, so `exportLabel` returns `"…"` when `progress.kind === "lottie"`.
  - Use a small inline SVG icon in the file's existing icon style.
  - `npm run build` must exit 0. Commit.

- [ ] **Step 5: Criterion 2 regression on the shipped path** (GC15).
  `lottie-check.mjs` already calls the seam, which is now an observer of
  `runLottieExport`. Run 5A's documented command:

  ```bash
  node tools/visual-check/lottie-check.mjs --scene eval/scenes-3b/compound-logo.marey --fps 30 --frames 0,48,75,180,239 --compare-png --out .visual-check/5c/compound-logo
  ```

  Frame 180 must read **maxDelta 81, 569/480000 (0.1185%)**, and every
  other frame must match 5A's recorded rows (`eval/RESULTS-PHASE-5A.md`,
  Criterion 2 table). Any difference is a finding. Report it; do not tune.

- [ ] **Step 6: Real-click check.** Create `lottie-click-check.mjs` (model it
  on 5B Task 6b's click harness; find it by grepping `tools/visual-check/`
  for `waitForEvent("download")`, or report if none exists).
  - Load the app, and set the editor's code to a `text`-free scene (`compound-logo.marey`). Use the same method 6b used to set the code; read it rather than inventing one.
  - Click **lottie**, and capture the download.
  - Assert the filename is `scene.json` and that the JSON parses.
  - Render it in lottie-web on the same page, and compare frames 0 and 48 against `__mareyExportPng` of the same source, reporting maxDelta and share.
  - Then set the code to the default scene, click **lottie**, and assert the toast text begins `[LOTTIE_UNSUPPORTED_TEXT]`.
  - Record both runs under "Piece 3". Commit.

- [ ] **Step 7: Product mutations.**
  (a) Make `runLottieExport` encode `frames.slice().reverse()`: Step 5's `--compare-png` must go red on the frames that move.
  (b) Make the hook call `JSON.stringify(doc).slice(0, -1)`: Step 6's parse assertion must go red.

  Revert both and record them. Commit.

---

## Task 4: Extract the shared raster-export prefix

**Tier:** Mechanical-plus. **No behaviour change.** **Spec:** §5.2.

**Files:**
- Create: `src/compiler/export/rasterExport.ts`
- Modify: `src/compiler/export/videoPipeline.ts`, `src/lib/devExportSeam.ts`, `src/compiler/export/exportBoundary.test.ts`, `src/compiler/export/exportApp.test.ts` (teardown-pattern assertions follow the code)

**Interfaces:**
- Produces (UNVERIFIED shape; the implementer may narrow it, but must keep one copy):

```ts
export interface PreparedRasterExport {
  readonly ir: IRSceneNode;
  readonly plan: SamplerPlan;
  readonly app: Application;
  readonly root: Container;
  readonly frames: ReadonlyArray<FrameSnapshot>;
  readonly rasterize: (frame: FrameSnapshot) => ICanvas;
}
export interface RasterExportOptions {
  readonly source: string;
  readonly fps: number;
  readonly durationSeconds?: number;
  readonly scale: number | ((ir: IRSceneNode, plan: SamplerPlan) => number);
  /** Runs after planExport and before any Application exists; throw to refuse. */
  readonly beforeBuild?: (ir: IRSceneNode, plan: SamplerPlan) => Promise<void> | void;
  /** Runs after app.init, before buildNode; throw to refuse (device limits). */
  readonly afterInit?: (app: Application) => void;
}
/** Compile, plan, init, build, sample; call `use`; always tear down. */
export function withRasterExport<T>(opts: RasterExportOptions, use: (x: PreparedRasterExport) => Promise<T>): Promise<T>;
```

`runVideoExport`'s own `planVideo` and `assertVideoEncodable` stay in
`videoPipeline.ts`, called from `beforeBuild`, so the codec probe still runs
before the scene is built (5B I-4 order). Its lazy encode loop and yield stay
in `videoPipeline.ts`, inside `use`.

- [ ] **Step 1: Record the before-state.** On a clean tree:
  - run `video-check.mjs` on `linear-motion.marey` for MP4 and WebM, and keep the reports;
  - run `export-check.mjs` on one scene, and keep its hash;
  - run `lottie-check.mjs --compare-png` for frame 0 of `compound-logo`.

  Commit nothing yet.

- [ ] **Step 2: Extract.** Create `rasterExport.ts` by moving the prefix and
  `finally` teardown out of `runVideoExport`, with their comments. Rewrite
  `runVideoExport` on top of it. Rewrite `devExportSeam.ts`'s `exportPng` on
  top of it, with `scale: 1`. It is a second copy of the same prefix today,
  and Criterion 2 compares against its output. Run the suite and `tsc`.
  Commit.

- [ ] **Step 3: Prove no behaviour change.**
  - Re-run Step 1's three commands. The WebM bytes must be byte-identical to the Step 1 run, the PNG hash identical, and the Lottie compare numbers identical. MP4 is not byte-stable (5B), so compare its decode gates only.
  - Add an `exportBoundary.test.ts` row: `rasterExport.ts` does not import any dev seam.
  - Record the results under "Piece 4 (refactor)". Commit.

- [ ] **Step 4: Product mutation.** Reverse `frames` inside `withRasterExport`:
  `video-check.mjs` must exit 1 for WebM. Revert and record it.

---

## Task 5: APNG

**Tier:** Integration. **Spec:** §5.

**Files:**
- Create: `src/compiler/export/apngEncode.ts`, `src/compiler/export/apngEncode.test.ts`
- Create: `src/compiler/export/apngPipeline.ts`, `src/lib/devApngSeam.ts`
- Modify: `src/compiler/export/pngSequence.ts` (export `pngBytesOf`), `src/main.tsx` (install the seam, same shape as the others), `src/hooks/useExport.ts`, `src/components/TopBar/TopBar.tsx`, `src/compiler/export/exportBoundary.test.ts`
- Create: `tools/visual-check/apng-check.mjs`; modify `SKILL.md`

**Interfaces:**
- Produces:
  - `export function encodeApng(pngs: ReadonlyArray<Uint8Array>, opts: { readonly fps: number }): Uint8Array`
  - `export function crc32(bytes: Uint8Array): number`
  - `export function runApngExport(opts: { source: string; fps: number; durationSeconds?: number; onProgress?: (done: number, total: number) => void; observer?: { onFrame?: (canvas: HTMLCanvasElement, frame: FrameSnapshot) => void | Promise<void>; onSampled?: (f: ReadonlyArray<FrameSnapshot>) => void } }): Promise<Uint8Array>`

- [ ] **Step 1: Measure Chromium's PNG chunks before writing the muxer.**
  With vite on 5199, in the page:
  - `document.createElement("canvas")` at 800×600, filled opaque;
  - `toBlob("image/png")`;
  - list the chunk types, and `IHDR`'s colour type and bit depth.

  Repeat on a pixi `extract.canvas` result (via `__mareyExportPng` of one
  frame). Record the chunk list in the evidence. `apngEncode.ts` keeps exactly
  the chunk types found here that precede `IDAT`; the test pins that list.

- [ ] **Step 2: Failing tests** (UNVERIFIED helpers; write a tiny in-test chunk
  reader, which is independent of the muxer's own):

```ts
import { describe, it, expect } from "vitest";
import { crc32, encodeApng } from "./apngEncode";

function chunks(bytes: Uint8Array): { type: string; data: Uint8Array }[] {
  const out = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let o = 8; o < bytes.length; ) {
    const len = view.getUint32(o);
    const type = String.fromCharCode(...bytes.subarray(o + 4, o + 8));
    out.push({ type, data: bytes.subarray(o + 8, o + 8 + len) });
    o += 12 + len;
  }
  return out;
}

/** A minimal valid PNG: signature, IHDR (w,h, 8-bit RGBA), one IDAT with `payload`, IEND. */
function fakePng(w: number, h: number, payload: number[]): Uint8Array { /* build with crc32 */ }

describe("crc32", () => {
  it("matches the PNG spec's check value for IEND", () => {
    expect(crc32(new TextEncoder().encode("IEND"))).toBe(0xae426082);
  });
  it("matches the standard check value for '123456789'", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("encodeApng", () => {
  const a = fakePng(4, 2, [1, 2, 3]), b = fakePng(4, 2, [4, 5]), c = fakePng(4, 2, [6]);

  it("writes IHDR, acTL, then fcTL before frame 0's IDAT, and fdAT for later frames", () => {
    const types = chunks(encodeApng([a, b, c], { fps: 30 })).map((x) => x.type);
    expect(types).toEqual(["IHDR", "acTL", "fcTL", "IDAT", "fcTL", "fdAT", "fcTL", "fdAT", "IEND"]);
  });

  it("declares the frame count and loops forever (num_plays 0)", () => {
    const actl = chunks(encodeApng([a, b, c], { fps: 30 })).find((x) => x.type === "acTL")!.data;
    const v = new DataView(actl.buffer, actl.byteOffset);
    expect([v.getUint32(0), v.getUint32(4)]).toEqual([3, 0]);
  });

  it("gives every frame a 1/fps delay, full size, dispose NONE, blend SOURCE", () => {
    const fctls = chunks(encodeApng([a, b], { fps: 24 })).filter((x) => x.type === "fcTL");
    for (const f of fctls) {
      const v = new DataView(f.data.buffer, f.data.byteOffset);
      expect([v.getUint32(4), v.getUint32(8), v.getUint32(12), v.getUint32(16)]).toEqual([4, 2, 0, 0]);
      expect([v.getUint16(20), v.getUint16(22), f.data[24], f.data[25]]).toEqual([1, 24, 0, 0]);
    }
  });

  it("numbers fcTL and fdAT chunks with one shared sequence from 0", () => {
    const cs = chunks(encodeApng([a, b, c], { fps: 30 })).filter((x) => x.type === "fcTL" || x.type === "fdAT");
    expect(cs.map((x) => new DataView(x.data.buffer, x.data.byteOffset).getUint32(0))).toEqual([0, 1, 2, 3, 4]);
  });

  it("carries each frame's image data unchanged after the fdAT sequence number", () => {
    const fdats = chunks(encodeApng([a, b, c], { fps: 30 })).filter((x) => x.type === "fdAT");
    expect([...fdats[0].data.subarray(4)]).toEqual([4, 5]);
    expect([...fdats[1].data.subarray(4)]).toEqual([6]);
  });

  it("writes a correct CRC on every chunk", () => { /* recompute crc32(type+data) per chunk */ });

  it("refuses frames whose IHDR differs from frame 0's", () => {
    expect(() => encodeApng([a, fakePng(4, 3, [1])], { fps: 30 })).toThrow("frame 1's IHDR differs from frame 0's");
  });
  it("refuses zero frames and a non-PNG", () => {
    expect(() => encodeApng([], { fps: 30 })).toThrow("no frames");
    expect(() => encodeApng([new Uint8Array([1, 2, 3])], { fps: 30 })).toThrow("frame 0 is not a PNG");
  });
});
```

  If Step 1 found ancillary chunks (for example `sRGB`), add one test that a
  frame-0 `sRGB` is carried before `acTL`'s `IDAT`, and one that frames 1…n's
  ancillary chunks are dropped.

- [ ] **Step 3: RED** (read it), **then implement `apngEncode.ts`.** Code for
  the two load-bearing parts:

```ts
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** fcTL body (26 bytes): seq, w, h, x=0, y=0, delay 1/fps, dispose NONE, blend SOURCE. */
function fcTL(seq: number, w: number, h: number, fps: number): Uint8Array {
  const b = new Uint8Array(26), v = new DataView(b.buffer);
  v.setUint32(0, seq); v.setUint32(4, w); v.setUint32(8, h);
  v.setUint32(12, 0); v.setUint32(16, 0);
  v.setUint16(20, 1); v.setUint16(22, fps);
  b[24] = 0; b[25] = 0;
  return b;
}
```

  The rest:
  - a chunk writer (`len`, `type`, `data`, `crc32(type‖data)`);
  - a chunk reader that validates the 8-byte signature;
  - validation that `fps` is an integer in 1..65535 (else throw, naming the value);
  - the ordering from the tests.

  Comments must state:
  - why frame 0 uses `IDAT` (it is also the still image a non-APNG viewer shows);
  - the three judgment calls, `num_plays 0`, `SOURCE` and full frames, each with its reason (spec §5.1).

  Run and commit.

- [ ] **Step 4: Flip the judgment calls** (§2d): `num_plays 1`, `blend_op 1`,
  `delay_den fps+1`. Each must turn a Step 2 test red. Revert and record.

- [ ] **Step 5: Pipeline, seam, button.**
  - `pngSequence.ts` exports `pngBytesOf` unchanged.
  - `runApngExport` is built on `withRasterExport` (T4) with `scale: 1`. It rasterizes lazily: rasterize, call `observer.onFrame`, get `pngBytesOf`, zero the canvas, yield using the same `YIELD_EVERY_MS` pattern. Export the helper from `videoPipeline.ts`, or move it into `rasterExport.ts`, rather than copying it. Then `encodeApng(pngs, { fps: plan.fps })`.
  - `devApngSeam.ts` exposes `window.__mareyExportApng(source, { fps, durationSeconds })`. It returns `{ apng: base64, referenceRgba: base64[] }`, where `referenceRgba[k]` is `getImageData` of the canvas for sampled frame k, captured in `onFrame` and slotted by identity in `onSampled`'s array, exactly as `devVideoSeam.ts` does.
  - Install it in `main.tsx` inside the `import.meta.env.DEV` block, in the existing shape.
  - `useExport`'s `apng` branch downloads `scene.png` with MIME `image/apng` and toasts `Exported scene.png`.
  - TopBar gets an **apng** button after **webm**, with the percent label.
  - Boundary rows: `apngEncode.ts` imports no pixi.js or sceneIR; `apngPipeline.ts` imports no dev seam; `useExport.ts` loads `apngPipeline` only dynamically.
  - Build, and commit.

- [ ] **Step 6: `apng-check.mjs`.** Call the seam, then decode with
  `new ImageDecoder({ data, type: "image/png" })`. Assert:
  - `decoder.tracks.selectedTrack.frameCount === referenceRgba.length`;
  - each frame's `VideoFrame`, drawn to a canvas and read with `getImageData`, equals `referenceRgba[k]` **byte for byte**. Report the differing-byte count per frame, and the total;
  - each frame's `duration` (µs) is `1e6/fps` within 1 µs.

  Parse the file's `fcTL`s in Node and assert the delays. Run it twice and
  compare the APNG bytes (sha256). Record sizes for the default scene and for
  a ≥ 30 s scene, which is `--duration 30` on any looping fixture. Exit 1 on
  any mismatch. Document it in `SKILL.md`. Commit.

  If `ImageDecoder` in Playwright's Chromium will not decode APNG frames,
  report that. Then fall back to an in-Node inflate of each `fdAT`/`IDAT`
  stream, using `node:zlib` in the `.mjs`, which is fine there. Unfilter the
  scanlines and compare. Do not claim pixel identity without a decode.

- [ ] **Step 7: Product mutations.**
  (a) Drop frame 5 in `runApngExport`.
  (b) Swap frames 5 and 6.
  (c) Pass `fps + 1` to `encodeApng`.

  Each must make `apng-check.mjs` exit 1. Revert and record. Commit the
  evidence under "Piece 4 (APNG)".

---

## Task 6: Text spike — measure only

**Tier:** Measurement. **No production code.** Output:
`eval/RESULTS-PHASE-5C.md` "Piece 5 spike", plus a committed probe script
under `docs/research/2026-09-24-export-quality-probes/text-spike/` so it can
be re-run. **Spec:** §6; the plan's T7/T8 depend on these answers.

**Files:**
- Modify: `package.json`, `package-lock.json` (`npm install harfbuzzjs@1.6.2 --save-exact`). The dependency is needed for the Vite measurements. Pin it exactly, as mediabunny is (5B M-4).
- Create: probe scripts (dev-only page scripts are fine; do not put them under `src/`)

Answer each question with a number or a quoted source line:

- [ ] **Q1. harfbuzzjs in Vite.**
  - Does `import * as hb from "harfbuzzjs"` load and instantiate `harfbuzz.wasm` under `npm run dev` **and** in a `npm run build` + `npx vite preview` page? Record how the wasm URL is resolved: read `node_modules/harfbuzzjs/dist/index.mjs` and quote the loading line.
  - Record the emitted wasm filename and size in `dist/assets/`.
  - If it needs `?url` wiring, write down the exact working import.
- [ ] **Q2. Shaping parity in Chromium.** For `->`, `!=`, `==`, `a->b != c`,
  `hello!`, `e\u0301` (a combining mark) and `a\tb`: shape with harfbuzzjs in
  the page, then draw the glyphs from `glyphToPath` onto a 2D canvas at 60 px.
  Draw the same string with `fillText` in `60px 'JetBrains Mono'`. Report the
  ink bounding box of each and the pixel-difference count. Expected:
  - ligature strings match in bbox (±1 px);
  - the tab string matches only after the U+0020 replacement. Measure both with and without it.
- [ ] **Q3. Pixi's layout numbers.** For fontSize 60 and 16, a one-line and a
  two-line string: report `CanvasTextMetrics.measureText(...)` fields
  (`width`, `height`, `lines`, `lineWidths`, `lineHeight`,
  `fontProperties.{ascent,descent,fontSize}`), `style._getFinalPadding()`,
  and `textObj.width/height`.
  - State which of `metrics.width` / the bounding-box width wins in `_measureText` for JetBrains Mono.
  - State whether `__baseSize` equals `textObj.width/height` exactly.
  - Quote pixi's `NEWLINE_MATCH_REGEX` source line.
  - Confirm pixi passes `\t` through to `fillText` unchanged, quoting the line that calls `fillText`.
- [ ] **Q4. Overlapping contours.** Over every glyph reachable from ASCII
  32–126 plus the ligature glyphs from Q2, count glyphs where rendering the
  contours with `evenodd` differs from `nonzero`. Draw each glyph both ways on
  a canvas and count differing pixels. Name any such glyph. T8's fill-rule
  fixture uses one if it exists.
- [ ] **Q5. Font URL.** `global.scss` loads `url('/fonts/JetBrainsMono-Regular.ttf')`.
  - Confirm the built CSS's URL, and whether `import.meta.env.BASE_URL` is `/` in this project's `vite.config`.
  - State the exact URL `textOutline.ts` must fetch so that it gets the same file, and whether the fetch is a cache hit after `@font-face` loads (Network panel via Playwright `page.on("response")`).
- [ ] **Q6. Font readiness.** In a fresh page that never ran the preview,
  call `document.fonts.check("60px 'JetBrains Mono'")` before and after
  `document.fonts.load(...)`. Build a pixi `Text` before loading and report
  its `width`; this shows the fallback-font race is real. Then report its
  width after loading.
- [ ] **Q7. Missing glyph.** Shape `"日"` and `"🙂"`. Confirm the glyph id is
  `0` and what the preview draws (a fallback font, or tofu).

Commit the probes and the evidence. **Stop and report.** The controller
re-plans T7/T8's details against these answers before dispatching them.

---

## Task 7: `textOutline.ts`, layout plumbing, `ensureExportFonts`

**Tier:** Architecture, first half. **Spec:** §6.1–6.3.

**Files:**
- Create: `src/compiler/export/textOutline.ts`, `src/compiler/export/textOutline.test.ts`
- Create: `src/compiler/export/exportFonts.ts`, `src/compiler/export/exportFonts.test.ts`
- Modify: `src/compiler/export/rasterExport.ts` (calls `ensureExportFonts` in its prefix), `src/compiler/export/lottiePipeline.ts` (same, plus collects text layouts and glyph runs; does not encode them yet), `src/compiler/export/exportBoundary.test.ts`

**Interfaces:**
- Produces (UNVERIFIED shapes, to be confirmed against T6):

```ts
// textOutline.ts
export interface Contour { readonly v: ReadonlyArray<readonly [number, number]>; readonly i: ReadonlyArray<readonly [number, number]>; readonly o: ReadonlyArray<readonly [number, number]> }
export interface TextLayout { readonly width: number; readonly height: number; readonly ascent: number; readonly lineHeight: number; readonly padding: number; readonly lines: ReadonlyArray<string> }
export interface TextGlyphRun { readonly contours: ReadonlyArray<Contour>; readonly missing: ReadonlyArray<{ readonly char: string; readonly codePoint: number }> }
export interface TextOutliner { outline(layout: TextLayout, fontSize: number): TextGlyphRun; destroy(): void }
export function createTextOutliner(fontBytes: ArrayBuffer): Promise<TextOutliner>;
/** Exported for the unit test: SVG path data in font units → contours in px, y down. */
export function pathToContours(d: string, scale: number, dx: number, dy: number): Contour[];

// exportFonts.ts
export const EXPORT_FONT_FAMILY = "JetBrains Mono";
export function exportFontSizes(ir: IRSceneNode): number[];              // distinct fontSize of every text node
export function ensureExportFonts(ir: IRSceneNode, fonts?: Pick<FontFaceSet, "load" | "check">): Promise<void>;  // throws EXPORT_FONT_UNAVAILABLE text
```

- [ ] **Step 1: `pathToContours` tests first** (the pure core; full code below
  is the spec §6.3 rule, UNVERIFIED against harfbuzzjs's exact path grammar,
  which T6 Q1 quoted):

```ts
it("converts a quadratic to the exact cubic (2/3 rule), flipping y and scaling", () => {
  // M0,0 Q30,60 60,0 Z at scale 1, baseline dy = 100: y flips to 100 - y.
  const [c] = pathToContours("M0,0Q30,60 60,0Z", 1, 0, 100);
  expect(c.v).toEqual([[0, 100], [60, 100]]);
  expect(c.o[0]).toEqual([20, -40]);   // (2/3)·((30,40) − (0,100)) relative to v0
  expect(c.i[1]).toEqual([-20, -40]);  // (2/3)·((30,40) − (60,100)) relative to v1
});
it("gives straight segments zero tangents", () => {
  const [c] = pathToContours("M0,0L10,0L10,10Z", 1, 0, 0);
  expect(c.i.every(([x, y]) => x === 0 && y === 0)).toBe(true);
  expect(c.o.every(([x, y]) => x === 0 && y === 0)).toBe(true);
});
it("splits on M into separate contours (a glyph with a counter)", () => {
  expect(pathToContours("M0,0L1,0L1,1ZM2,2L3,2L3,3Z", 1, 0, 0)).toHaveLength(2);
});
it("drops the duplicate closing vertex when a contour ends where it began", () => { /* M0,0 L10,0 L0,0 Z → 2 vertices */ });
```

  The ⅔ rule, in absolute coordinates: for quadratic `P0, Q, P1`, the cubic
  controls are `C1 = P0 + ⅔(Q − P0)` and `C2 = P1 + ⅔(Q − P1)`. Lottie wants
  them **relative to their own vertex**: `o[k] = C1 − P0`, `i[k+1] = C2 − P1`.
  Apply the y flip (`y_px = dy − y_font·scale`) before taking differences.
  RED, implement, run, commit.

- [ ] **Step 2: `createTextOutliner` against the real font, headlessly.**
  harfbuzzjs runs in Node (measured during brainstorming). The test needs the
  font bytes without `node:fs` (tsconfig has no Node types; see
  `exportBoundary.test.ts`'s header).
  - Try `import fontUrl from "../../../public/fonts/JetBrainsMono-Regular.ttf?url"` followed by a read, **or** Vite's `?inline` (base64 data URL) and decoding it. Report which works under Vitest.
  - If neither does, put the test in a file that `tsconfig.node.json` covers, and say so.

  Assertions:
  - `->` produces a run whose glyph count differs from the cmap-per-character count. Assert on glyph ids via a debug field or a `shapeLine` export, **not** by pixel;
  - `"日"` yields `missing: [{ char: "日", codePoint: 0x65e5 }]`;
  - `"a\tb"` shapes identically to `"a b"` (the whitespace rule, spec §6.3 step 2);
  - two lines place the second baseline exactly `lineHeight` below the first.

  RED, implement, commit.

- [ ] **Step 3: `ensureExportFonts`.** Tests with a fake `FontFaceSet` that
  **records** the `load` calls it receives (check that the fake records what
  the assertion reads; §3d):
  - one `load("60px 'JetBrains Mono'")` per distinct size;
  - no call for a text-free scene;
  - when `check` is still false after `load`, it throws text beginning `[EXPORT_FONT_UNAVAILABLE]` and naming the family.

  Wire it into `withRasterExport`'s prefix, after `planExport` and before
  `new Application()`, and into `runLottieExport`. RED, implement, commit.

- [ ] **Step 4: Layout plumbing in `runLottieExport`** (no encoding yet).
  After `buildNode`, walk `root` for containers whose IR node is `text`. The
  implementer finds the mapping: `__mareyId` plus an id → IR-node map built
  from `ir`. For each, build its `TextLayout`:
  - `width`/`height` from `wrapper.__baseSize` (spec §6.2);
  - `ascent`, `lineHeight`, `lines` and `padding` from `CanvasTextMetrics.measureText(content, textObj.style)` and `style._getFinalPadding()`, per T6 Q3's answers.

  Fetch the font from T6 Q5's URL once per export, `createTextOutliner` it,
  and `outline` each layout. Keep the results in two maps, `textLayouts` and
  `glyphRuns`, keyed by id, for T8. Destroy the outliner in `finally`.
  Boundary rows: `textOutline.ts` imports no pixi.js or sceneIR;
  `lottiePipeline.ts` does not import harfbuzzjs (only `textOutline.ts` does).
  Commit.

- [ ] **Step 5: Product mutation.** Remove the `ensureExportFonts` call from
  `withRasterExport`. In a fresh browser context whose first action is an
  MP4 export of a text scene, with no preview run first, the text width in
  the reference frame changes. Use T6 Q6's method and record both widths.
  Revert.

---

## Task 8: Text geometry, encoding, refusal, licences, evidence

**Tier:** Architecture, second half. **Spec:** §6.3–6.6.

**Files:**
- Modify: `src/compiler/export/lottieGeometry.ts` (+ test), `src/compiler/export/lottieEncode.ts` (+ test), `src/compiler/export/lottiePipeline.ts`
- Modify: `vite-plugins/thirdPartyLicenses.ts` (+ test), `vite-plugins/licenses/*`
- Create: `tools/visual-check/text-check.mjs`, `tools/visual-check/scenes/lottie-text-*.marey`

**Interfaces:**
- Consumes: T7's `TextLayout`, `TextGlyphRun`, `Contour`.
- Produces:
  - `planLottie(ir, text?: { layouts: ReadonlyMap<IRObjectId, TextLayout>; runs: ReadonlyMap<IRObjectId, TextGlyphRun> })`. The parameter is optional, so text-free callers and tests are unchanged. A text node without both entries throws `[LOTTIE] text node '<id>' has no layout from the export pipeline`.
  - `LottieShapeSpec` gains `{ kind: "text"; contours: ReadonlyArray<Contour> }`.
  - `LottieDiagnosticCode` becomes `"LOTTIE_TEXT_MISSING_GLYPH"` (`LOTTIE_UNSUPPORTED_TEXT` is removed).

- [ ] **Step 1: Geometry tests.**
  - With a layout of `width 216, height 79` and `origin (0.5, 0.5)`, the anchor is `(108, 39.5)`, computed from the **layout**, not from anything recomputed.
  - A run with `missing: [{char:"日", codePoint: 0x65e5}]` yields one diagnostic whose message contains `U+65E5` and the object id, and begins `[LOTTIE_TEXT_MISSING_GLYPH]`.
  - Two missing characters in one object yield one diagnostic naming both.
  - The old `LOTTIE_UNSUPPORTED_TEXT` test is replaced in the same commit.

  RED, implement, commit.

- [ ] **Step 2: Encoder tests.** A text spec with two contours encodes as
  `["sh", "sh", "fl"]`, both `sh` with `c: true`, and `fl.r === 1`. Flip to
  `r: 2`: the test must go red, and T6 Q4's glyph (if any) must render wrong
  in lottie-web. Record which. RED, implement, commit.

- [ ] **Step 3: Pipeline.** Pass T7's maps into `planLottie`. The default
  scene now exports. Commit.

- [ ] **Step 4: Licences.**
  - Read `node_modules/harfbuzzjs/LICENSE`. If it does not reproduce HarfBuzz's own licence, add `vite-plugins/licenses/harfbuzzjs.txt` following the existing `@pixi__colord.txt` pattern (read that file and the plugin's comment at `thirdPartyLicenses.ts:229` first). Its text is HarfBuzz's `COPYING`, fetched via WebFetch from `https://raw.githubusercontent.com/harfbuzz/harfbuzz/main/COPYING`, with the fetch's verbatim-quality caveat noted in the file.
  - For the OFL: make the fonts section carry the **full OFL 1.1 text**. Take it from `https://openfontlicense.org/documents/OFL.txt` or the JetBrains Mono repository's `OFL.txt` via WebFetch, and compare two fetches for equality. The plugin test asserts the output contains `SIL OPEN FONT LICENSE Version 1.1` and the `PERMISSION & CONDITIONS` heading.
  - Run `npm run build` and grep the emitted file.
  - Commit.

- [ ] **Step 5: `text-check.mjs` and the fixtures.**
  - Fixtures:
    - `lottie-text-ascii.marey` (`"Marey 42"`, fontSize 60, origin default);
    - `lottie-text-ligature.marey` (`"a->b != c"`);
    - `lottie-text-multiline.marey` (`"one\ntwo\tthree"`, fontSize 32, origin `(0,0)`);
    - `lottie-text-scaled.marey` (the default scene's `hello!` group, including rotation and scale animation).
  - The harness does three things:
    1. **Layout agreement:** in the page, it shapes each line with `textOutline.ts` and compares the advance sum against pixi's `lineWidths` within 0.01 px.
    2. **Ink-bbox position check** at frames 0, the midpoint and the last frame: it thresholds alpha > 0 on text-only renders (background alpha 0 in both renderers, one text object per fixture) and compares the ink bbox of the lottie-web frame with Marey's PNG export frame. Each edge must be within **1 px**.
    3. **Criterion 2**, via `lottie-check.mjs --compare-png` per fixture, and on the default scene, recording maxDelta and share.
  - Also render each fixture in dotlottie-web (`lottie-check.mjs --renderer`) and record that it renders, with maxDelta against lottie-web.
  - Record everything under "Piece 5". Commit.

- [ ] **Step 6: Product mutations.** Each must go red:
  (a) Baseline `+ descent` → the ink-bbox check.
  (b) Skip shaping (per-character cmap outlining) → layout agreement or ink bbox on the ligature fixture, and Criterion 2 there.
  (c) Drop the `missing` check → the Step 1 test.
  (d) Omit the whitespace replacement → the multiline fixture.

  Revert and record. Commit.

- [ ] **Step 7: The build.**
  - `npm run build`: record the entry-chunk size before (the `aad331d` build) and after.
  - harfbuzzjs and the wasm must appear only in lazy chunks. grep `dist/assets/index-*.js` for `harfbuzz`: expect 0.
  - The dev seams must be absent (grep for `__mareyExport`).

  Record the results.

---

## Task 9: Docs, execution notes, status

**Tier:** Docs.

- [ ] `renderer.md`: the rasterizer rule (scale), the Text-texture resolution
  trap, the export-fonts rule, the text layout/glyph split and its boundary,
  and the line stroke mapping.
- [ ] `docs/engineering-lessons.md` §6: the lower-case drive-letter trap
  (GC2), with its evidence.
- [ ] This plan's "Execution notes": final evidence table, defects found in
  this plan, mutation results beside suite sizes, deferrals each with what
  makes it harmless today, and the process record. Write it from the ledger
  and `git log`, not from reports (AGENT-LESSONS §1).
- [ ] **Do not** edit the phase-status lines in `docs/architecture/README.md`
  or `roadmap-and-process.md` here. Status that reports a review cannot be
  written before the review (5B defect #17, R38). They are updated after the
  whole-branch review, in the same edit as each other.
- [ ] Update the auto-memory note `export-quality-decision-pending` to record
  the decision taken. This is a controller step, outside the repository.

---

## After Task 9

1. The independent whole-branch review (AGENT-LESSONS §8), on the whole range
   from `4a23e1d`, by a reviewer given the spec and plan but not the
   controller's conclusions.
2. One batched fix wave, and a scoped re-review.
3. Phase status in both locations.
4. **Stop and ask the owner before any merge or push.**

## Self-review

- **Spec coverage.** §2 → T1; §3 → T2; §4 → T3; §5.1/5.3 → T5; §5.2 → T4;
  §6.1 → T7 Step 3; §6.2 → T7 Step 4; §6.3 → T7 Steps 1–2 and T8 Step 1;
  §6.4 → T8 Step 2; §6.5 → T8 Step 4; §6.6 → T8 Step 5; §7 → the boundary
  rows in T2, T3, T4, T5, T7; §8 → each task's mutation step; §9 → the
  evidence steps; §11 → this task list. `EXPORT_FONT_UNAVAILABLE` lives in
  `exportFonts.ts`, per GC9's exception. That differs from the spec's "the
  export is refused" in location only.
- **Placeholders.** `fakePng`'s body, the CRC-per-chunk test body and the
  duplicate-vertex test are described, not written. Each is a few lines
  fully determined by the adjacent code and the PNG spec, and the
  implementer writes them test-first. No step says "handle edge cases"
  without naming them.
- **Type consistency.** `createFrameRasterizer(..., scale)` (T1) is used by
  T4 and T5. `withRasterExport` (T4) is used by T5 and T7. `TextLayout`,
  `TextGlyphRun` and `Contour` (T7) are consumed by T8. `ExportKind`
  includes `"apng"` from T3.
- **Defects this plan already knows it may carry.** Every "UNVERIFIED"
  block. In particular: the fixture helper names in T1/T2's tests; pixi's
  `renderer.gl` property; how Vitest can read the TTF bytes; and whether
  `ImageDecoder` decodes APNG frames in Playwright's Chromium. Each has a
  stated fallback.

---

## Addendum, 2026-09-25: Task 6 outcomes that amend Tasks 7 and 8

Written by the controller after Task 6's spike (evidence: `eval/RESULTS-PHASE-5C.md`,
"Piece 5 spike"; probes: `docs/research/2026-09-24-export-quality-probes/text-spike/`).
Where this addendum and a task body disagree, this addendum wins.

1. **harfbuzzjs 1.6.2's glyph positions are camelCase:** `xAdvance`, `yAdvance`,
   `xOffset`, `yOffset`. The spec's §6.3 step 4 and T7's text use snake_case, so
   read "x_offset" as `xOffset` and so on throughout. It loads under Vite dev and
   a production build with a plain `import * as hb from "harfbuzzjs"`. Rolldown
   emits `harfbuzz-*.wasm` (433,766 B) with no `?url` wiring.
2. **Pixi's layout rules for JetBrains Mono (T7 Step 4):**
   - Line width is `metrics.width`, which beats the bounding-box width.
   - `__baseSize` equals `textObj.width`/`height` exactly.
   - `lineHeight = fontProperties.fontSize = ascent + descent` (60 px →
     ascent 60, descent 11, lineHeight 71).
   - The final padding is 0 for Marey's styles.
   - `NEWLINE_MATCH_REGEX = /(?:\r\n|\r|\n)/`.
   - pixi passes `\t` to `fillText` unchanged, and canvas turns it into U+0020.
3. **Fill rule (T8 Step 2).** 19 of 100 glyphs render differently under
   nonzero and even-odd, among them common letters (a b d e g h m n p q r).
   So `r: 1` (nonzero) is load-bearing on ordinary text, not an edge case.
   The fixture glyph for the flip is `8`.
4. **Font fetch (T7 Step 4).** The URL is `/fonts/JetBrainsMono-Regular.ttf`,
   with `BASE_URL` `/`. It is **not** a cache hit under `vite preview`
   (`Cache-Control: no-cache`), so the export re-fetches about 115 KB. That is
   acceptable; do not add a cache layer.
5. **Measurement cache hazard (new, T7 Step 3/4).**
   `CanvasTextMetrics._measurementCache` is a global LRU keyed by
   `` `${text}-${style.styleKey}-wordWrap-…` `` (`CanvasTextMetrics.mjs:74`),
   and the key carries no font-load state. A measurement taken while the
   fallback font was active would therefore be served stale to a later
   export, because a fresh `TextStyle` with the same props has the same
   `styleKey`. T6 Q6 measured the stale return on a reused style. So
   `ensureExportFonts` alone is not sufficient. T7 must:
   - measure whether a **new** `TextStyle` with identical props hits a stale
     entry written before the font loaded;
   - if it does, invalidate before building, through a public pixi API if one
     exists (read `CanvasTextMetrics`), otherwise the narrowest private access,
     with a comment naming the pixi version;
   - pin it with a cold-page check: measure first with the fallback font, then
     load the font, then export, and the layout must match a warm export.
6. **Missing glyphs (T8).** `日` and `🙂` both shape to glyph 0, while the
   preview draws a real fallback glyph and a colour emoji, not tofu. This
   confirms `LOTTIE_TEXT_MISSING_GLYPH` is the honest behaviour.
