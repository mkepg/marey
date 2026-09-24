# Phase 5B Video Implementation Plan

**Goal:** Emit WebM and MP4 from a Marey scene through WebCodecs and a muxer, at
the requested frame rate and duration, such that roadmap §8.1's three exit
criteria are provable by decoding the emitted file back and comparing it against
the sampler's own frames — not by observing that it plays.

**Architecture:** One shared rasterization seam, `frameRaster.ts`, extracted from
the existing PNG exporter so both exporters agree by construction about size,
background and frame identity. Above it, a pure `videoContract.ts` holding every
diagnostic, every encoder-config decision and all timestamp arithmetic, and a
thin `videoEncode.ts` holding only the WebCodecs and mediabunny glue that cannot
be tested headlessly. Phase 4's `FrameSnapshot` / `SamplerPlan` boundary is
consumed unmodified; there is no second sampling path.

**Tech Stack:** TypeScript 5.9 (strict, `noUnusedLocals`, `noUnusedParameters`,
`verbatimModuleSyntax`, `erasableSyntaxOnly`), Vitest 4, PixiJS 8.16,
Matter.js 0.20.0 (pinned), Vite 8 beta, Playwright 1.62, mediabunny 1.58
(devDependency, added at `26972b7`), WebCodecs.

**Spec:** `docs/specs/2026-09-18-marey-phase-5b-video-design.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

1. **Baseline.** The suite is **29 files / 818 tests** at `e1dfb50`,
   `npx tsc -b --noEmit` exit 0, `npm run build` exit 0, `npm run build:cli`
   exit 0. Re-derive on a clean tree before quoting; a stray probe file silently
   inflates it (AGENT-LESSONS §6). Re-derived for this plan on 2026-09-18.
2. **Judge file changes with `git diff --stat -- <path>`, never `git status`.**
   `core.autocrlf=true` with no `.gitattributes` makes `git status` report
   modification on content identical after normalisation.
3. **Commit as you go, from the first step of every task.** Phase 5A took
   **seven** interruptions (five rate-limit kills, two stream stalls). Where the
   agent had committed incrementally a kill cost minutes; where it batched
   commits at the end it cost that task's entire evidence trail. Do not save one
   commit for the end.
4. **The two structural rules.** `videoContract.ts` must not import `pixi.js` in
   any form. `videoEncode.ts` must not import `pixi.js` **or** `sceneIR` in any
   form. These carry the phase's encoder-boundary claim. A violation is a defect
   even if every test passes. Task 2 makes both automated.
5. **The three renderer invariants** (`docs/architecture/renderer.md`): nothing
   that mutates scene state may take a time argument; state mutation in the tick
   phase, painting in the paint phase; nothing fed into the physics world may
   derive from the wall clock. This phase adds no tick-phase code, but every
   `Application` it constructs must use `autoStart: false`, as
   `devExportSeam.ts` does.
6. **`TICK_HZ = 120`** and `secondsToTicks` live in `src/compiler/sceneIR.ts`.
   Never write a second seconds-to-ticks conversion. This phase needs none —
   frame indices come from `SamplerPlan`, already validated by `planExport`.
7. **Do not modify `sceneIR.ts`, `frameSampler.ts`, or `exportContract.ts`.**
   The Phase 4 boundary is consumed as-is. If a task believes it needs a change
   there, that is a finding to report, not an edit to make.
8. **Delete-and-run, individually.** For every behaviour a task requires, delete
   the line implementing it and run the suite. Anything still green is untested.
   Where a change touches N call sites, revert each **separately**
   (AGENT-LESSONS §2c).
9. **The scope tie-break, stated once so no task has to guess** (AGENT-LESSONS
   §3b): *a gap the delete-and-run check finds in a behaviour the task
   **requires** is in scope and must be closed; a gap it finds in an **adjacent**
   behaviour is filed in the report, not fixed.*
10. **A RED must be read, not just observed.** A failure caused by a wrong
    fixture looks exactly like the failure the process is waiting for. Read the
    message and confirm it names the missing behaviour, not a missing method
    (AGENT-LESSONS §3d).
11. **Report what you did not do.** "I could not write that test, and here is
    why" is a valid result; a silently skipped check is not (AGENT-LESSONS §2f).
    This explicitly includes **not inventing a diagnostic for a case that cannot
    occur** — see Task 4 Q2 and Task 1's `VIDEO_ODD_DIMENSIONS`.
12. **No outbound HTTP from bash; `curl` returns 000.** `npm` does have network.
    `git push`/`pull` work. Use `WebFetch`/`WebSearch` for documentation.
13. **Browser harnesses need `npx vite --port 5199 --strictPort`.** Without
    `--strictPort` a stale server absorbs every capture and reports a confident
    false pass; that has now happened three times in this repository. Kill it
    afterwards and confirm no `LISTENING` socket remains on 5199 — match on a
    boundary, because a plain `grep ":5199"` also matches `:51999`.
14. **WebCodecs is `SecureContext`-gated.** Any probe page must be served over
    `localhost` or HTTPS. On `about:blank`, `VideoEncoder` is `undefined` while
    `VideoFrame` is defined, which reads exactly like "unsupported browser". This
    produced a false negative while writing this plan's spec.

### A note on this plan's use of code blocks

Phase 4's plan carried ten defects, Phase 3C's seven, Phase 5A's seven — every
one of them in a verbatim code block written against a file the plan had not
run. So, two labelled classes:

- **MEASURED.** Read from, or run against, real source at `e1dfb50` while
  writing this plan. Every block reproducing existing `pngSequence.ts` code is
  this kind, as is every mediabunny and WebCodecs fact in the spec's §2. If one
  is wrong, report it loudly — it means the file changed under this plan.
- **UNVERIFIED.** Written from type declarations or from reasoning, not from a
  run. **Treat it as a claim to verify, not text to paste.** If a symbol does
  not exist with that spelling, adapt to reality and report the discrepancy —
  preserve the assertion, not the spelling.

One specific warning, because it is this plan's most likely defect: the spec's
round-trip probe used mediabunny's **`CanvasSource`**, but this plan specifies
**`VideoSampleSource`**, because `extract.canvas()` returns a new canvas per
frame while `CanvasSource` wraps one canvas it re-reads. `VideoSampleSource` and
`VideoSample` were read from `mediabunny.d.ts` but **never executed**. Task 2
Step 1 exists to run them before anything is built on them.

---

## File structure

**Created**

| File | Responsibility |
|---|---|
| `src/compiler/export/frameRaster.ts` | `applySnapshot` (moved), `assertFrameSetMatchesTree`, `createFrameRasterizer`. The one place a sampled frame becomes pixels. |
| `src/compiler/export/frameRaster.test.ts` | Tests for the id-agreement guard, which has none today. |
| `src/compiler/export/videoContract.ts` | `VIDEO_*` diagnostics, `planVideo`, encoder-config resolution, timestamp arithmetic. Pure; imports `sceneIR` types and `exportContract` types only. |
| `src/compiler/export/videoContract.test.ts` | Tests for the above. |
| `src/compiler/export/videoEncode.ts` | WebCodecs + mediabunny. Imports neither `pixi.js` nor `sceneIR`. |
| `src/compiler/export/exportBoundary.test.ts` | Automated import-boundary guard for the two structural rules. |
| `src/lib/devVideoSeam.ts` | Dev-only `window.__mareyExportVideo`, modelled on `devExportSeam.ts`. |
| `src/hooks/useExportVideo.ts` | The UI action, modelled on `useShare.ts`. |
| `tools/visual-check/video-check.mjs` | Emit, decode back, compare against the sampler, report. |
| `eval/RESULTS-PHASE-5B.md` | Exit-criteria evidence, one section per criterion, with reproducing commands. |

**Modified**

| File | Change |
|---|---|
| `src/compiler/export/pngSequence.ts` | Use `frameRaster.ts`; `applySnapshot` moves out. |
| `src/compiler/renderer/frameSampler.test.ts` | One import line: `applySnapshot` now comes from `frameRaster`. |
| `src/main.tsx` | Install the dev video seam beside the PNG and Lottie ones. |
| `src/components/TopBar/TopBar.tsx` + `.module.scss` | The export control. |
| `src/store/index.ts` | `isExporting` state and its setter. |
| `tools/visual-check/SKILL.md` | The new harness and what it proves. |
| `docs/architecture/renderer.md` | The video encoder boundary; `applySnapshot`'s new home. |
| `docs/architecture/roadmap-and-process.md` | Phase 5B bullet. |
| `docs/architecture/README.md` | "Current phase" line, updated in the **same edit** as the bullet above. |
| `docs/plans/2026-09-18-phase-5b-video.md` | Execution notes (Task 7). |

---

## Task 0: Extract the shared rasterization seam

**Why first:** both exporters depend on it, and a refactor of working Phase 4
code must be proved behaviour-preserving *before* anything is built on top of
it. It also closes a real gap: `encodePngSequence`'s tree/frames id-agreement
check — the guard that stops a tree and a frame set from different compilations
being silently combined — **has no test at all today** (verified by grep at
`e1dfb50`: no file references `encodePngSequence` except `devExportSeam.ts`).

**Files:**
- Create: `src/compiler/export/frameRaster.ts`
- Create: `src/compiler/export/frameRaster.test.ts`
- Modify: `src/compiler/export/pngSequence.ts`
- Modify: `src/compiler/renderer/frameSampler.test.ts` (import line only)
- Modify: `docs/architecture/renderer.md`

**Interfaces:**
- Consumes: `FrameSnapshot`, `snapshotFor` from `../renderer/frameSampler`.
- Produces, for Tasks 2 and 3:
  - `applySnapshot(root: Container, frame: FrameSnapshot): void`
  - `assertFrameSetMatchesTree(root: Container, frames: ReadonlyArray<FrameSnapshot>): void`
  - `createFrameRasterizer(app: Application, root: Container, frames: ReadonlyArray<FrameSnapshot>): (frame: FrameSnapshot) => ICanvas`

- [ ] **Step 1: Create `frameRaster.ts` by moving, not rewriting**

**MEASURED** — `applySnapshot`'s body below is copied verbatim from
`pngSequence.ts:36-73` at `e1dfb50`, including its comments. Do not "improve" it
while moving it; a behaviour change hidden in a move is the hardest kind to
find.

```ts
import { Rectangle } from "pixi.js";
import type { Application, Container, ICanvas } from "pixi.js";
import { snapshotFor, type FrameSnapshot } from "../renderer/frameSampler";

/**
 * Write one sampled frame's transforms onto an already-built scene tree.
 *
 * Moved here from `pngSequence.ts` in Phase 5B, unchanged: it is not
 * PNG-specific, and the video exporter needs exactly the same inverse of
 * `snapshotFor`.
 *
 * The exact inverse of `snapshotFor` (`renderer/frameSampler.ts`), and the
 * reason an encoder needs a tree at all: an `ObjectSnapshot` carries only
 * transforms — no shape, colour, size or parent link — so the *tree* supplies
 * the geometry and the *snapshot* supplies the motion.
 *
 * Position and scale go through `layout.currentPos`/`currentScale` and
 * `__updateLayout()` rather than straight onto `container.position`, because
 * `position` places the container's PIVOT and `origin` may have moved that
 * pivot anywhere in the bounding box (`builder.ts`, D16/3C).
 *
 * Rotation, alpha and `visible` are written unmodified, which is exactly what
 * `snapshotFor` read off the container — so a round trip is byte-identical
 * rather than merely close.
 */
export function applySnapshot(root: Container, frame: FrameSnapshot): void {
  const byId = new Map<string, FrameSnapshot["objects"][number]>();
  for (const o of frame.objects) byId.set(o.id, o);

  const visit = (c: Container): void => {
    const id = c.__mareyId;
    const layout = c.__mareyLayout;
    if (id !== undefined && layout) {
      const snap = byId.get(id);
      if (snap) {
        layout.currentPos.x = snap.x;
        layout.currentPos.y = snap.y;
        layout.currentScale.x = snap.scaleX;
        layout.currentScale.y = snap.scaleY;
        // Not `?.()`: a container that carries `__mareyLayout` but no
        // `__updateLayout` is unreachable today (`builder.ts` always sets
        // both together), but a silent no-op here would mean the position is
        // updated in the snapshot's bookkeeping, `snapshotFor` would read it
        // back as moved, and the drawn container would silently stay put.
        // Numbers right, pixels wrong. Throwing loudly trades an
        // unreachable-today path for a defect that cannot ship silently.
        if (!c.__updateLayout) {
          throw new Error(
            `[export] Container '${id}' has __mareyLayout but no __updateLayout, so applySnapshot cannot write its position through to the drawn container.`,
          );
        }
        c.__updateLayout();
        c.rotation = snap.rotation;
        c.alpha = snap.alpha;
        c.visible = snap.visible;
      }
    }
    for (const child of c.children) visit(child as Container);
  };
  visit(root);
}

/**
 * Fail loudly when a scene tree and a sampled frame set disagree about which
 * objects exist.
 *
 * An id in the snapshots that matches no container renders as an object that
 * never moves; an id in the tree that no snapshot mentions renders as one
 * frozen where it was built. Both are silent, both survive every hash check,
 * and both mean the tree and the frames came from different compilations.
 *
 * Checked once per export, not per frame — `frames[0]`'s id set is the whole
 * sequence's, because `snapshotFor` walks the same tree every time.
 */
export function assertFrameSetMatchesTree(
  root: Container,
  frames: ReadonlyArray<FrameSnapshot>,
): void {
  if (frames.length === 0) return;
  const treeIds = new Set(snapshotFor(root).map((o) => o.id));
  const frameIds = new Set(frames[0].objects.map((o) => o.id));
  const missing = [...frameIds].filter((id) => !treeIds.has(id));
  const extra = [...treeIds].filter((id) => !frameIds.has(id));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `[export] The scene tree and the sampled frames disagree on which objects exist, so some would never move. Only in the frames: [${missing.join(", ")}]. Only in the tree: [${extra.join(", ")}].`,
    );
  }
}

/**
 * Bind an `Application` and a scene tree into a per-frame rasterizer.
 *
 * **This is the one place a sampled frame becomes pixels**, and both exporters
 * go through it so they cannot disagree about the result's size or background.
 * Every argument below encodes a decision that would otherwise be duplicated:
 *
 * - `frame: region` at the renderer's own width/height, `resolution: 1` — the
 *   output is the scene's declared pixel dimensions, never the preview's
 *   `devicePixelRatio`, and never a content bounding box that would change
 *   size as objects move.
 * - `renderer.extract.canvas` rather than reading the live canvas: PixiJS does
 *   not set `preserveDrawingBuffer`, so an in-page read returns a blank frame.
 *   A naive exporter writes blank output *and reports success*, because
 *   identical blank frames hash perfectly consistently. Extraction renders
 *   into a texture the caller owns and reads back from that.
 * - `clearColor` from the Application's own background, so an export is the
 *   scene's background rather than transparent.
 *
 * `generateTexture` hands the renderer its own translate-only transform, which
 * *replaces* the target container's local transform, so `fit` letterboxing on
 * `root` is bypassed rather than baked in. The exported artifact is the scene,
 * not the preview.
 */
export function createFrameRasterizer(
  app: Application,
  root: Container,
  frames: ReadonlyArray<FrameSnapshot>,
): (frame: FrameSnapshot) => ICanvas {
  assertFrameSetMatchesTree(root, frames);

  const region = new Rectangle(0, 0, app.renderer.width, app.renderer.height);
  const clearColor = app.renderer.background.colorRgba;

  return (frame: FrameSnapshot): ICanvas => {
    applySnapshot(root, frame);
    return app.renderer.extract.canvas({
      target: root,
      frame: region,
      resolution: 1,
      clearColor,
      antialias: true,
    });
  };
}
```

- [ ] **Step 2: Rewrite `pngSequence.ts` to consume it**

**MEASURED** — `pngBytesOf` is unchanged from `pngSequence.ts:76-98`. Keep its
docstring. `applySnapshot` is deleted from this file (it now lives in
`frameRaster.ts`), and `encodePngSequence`'s body becomes the loop below.

```ts
import type { Application, Container, ICanvas } from "pixi.js";
import type { FrameSnapshot } from "../renderer/frameSampler";
import { createFrameRasterizer } from "./frameRaster";

/** PNG bytes off an extracted canvas, whichever blob API the host provides. */
function pngBytesOf(canvas: ICanvas): Promise<Uint8Array> {
  // ... unchanged from e1dfb50 ...
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
 * argument is what it is.
 */
export async function encodePngSequence(
  app: Application,
  root: Container,
  frames: ReadonlyArray<FrameSnapshot>,
): Promise<Uint8Array[]> {
  if (frames.length === 0) return [];
  const rasterize = createFrameRasterizer(app, root, frames);
  const out: Uint8Array[] = [];
  for (const frame of frames) {
    out.push(await pngBytesOf(rasterize(frame)));
  }
  return out;
}
```

- [ ] **Step 3: Fix the one moved import**

`src/compiler/renderer/frameSampler.test.ts:8` reads:

```ts
import { applySnapshot } from "../export/pngSequence";
```

Change to:

```ts
import { applySnapshot } from "../export/frameRaster";
```

**MEASURED** — that is the only reference to `applySnapshot` outside
`pngSequence.ts` in `src/`, confirmed by grep at `e1dfb50`. If you find another,
report it; it means the file changed under this plan.

- [ ] **Step 4: Run the suite — expect exactly the baseline**

Run: `npx vitest run`
Expected: **29 files / 818 tests, exit 0.** This is a pure move plus an
extraction; a single failure here means the move was not faithful. Do not
proceed until the count matches the baseline exactly.

Also run `npx tsc -b --noEmit`; expect exit 0.

- [ ] **Step 5: Commit the refactor before adding tests to it**

```bash
git add src/compiler/export/frameRaster.ts src/compiler/export/pngSequence.ts src/compiler/renderer/frameSampler.test.ts
git commit -m "refactor(5b): extract the shared frame rasterization seam"
```

- [ ] **Step 6: Write the failing test for the id-agreement guard**

This guard is real, load-bearing, and currently untested. Create
`src/compiler/export/frameRaster.test.ts`.

**UNVERIFIED** — the fixture shape follows `frameSampler.test.ts`'s
(`irFor` + `buildNode` + real `Container`), which is MEASURED to work headlessly,
but this exact source has not been compiled. Compile it first; if it does not,
that is a finding to report, not a fixture to quietly reshape.

```ts
import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { buildNode } from "../renderer/builder";
import { snapshotFor } from "../renderer/frameSampler";
import { assertFrameSetMatchesTree } from "./frameRaster";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import type { IRSceneNode } from "../sceneIR";
import type { FrameSnapshot } from "../renderer/frameSampler";

function irFor(source: string): IRSceneNode {
  const { ast } = parse(lex(source));
  const { ir, errors } = typeCheck(ast!);
  if (!ir) throw new Error(`fixture did not compile: ${errors.map(e => e.message).join("; ")}`);
  return ir;
}

const TWO_OBJECTS = `
scene {
  size: (200, 200)
  duration: 1
  circle a { position: (50, 50) radius: 10 color: cyan }
  circle b { position: (150, 50) radius: 10 color: magenta }
}
`;

function treeFor(source: string): Container {
  const ir = irFor(source);
  const root = new Container();
  for (const node of ir.children) root.addChild(buildNode(node));
  return root;
}

function frameFrom(root: Container): FrameSnapshot {
  return { index: 0, tick: 0, objects: snapshotFor(root) };
}

describe("assertFrameSetMatchesTree", () => {
  it("accepts a frame set sampled from the same tree", () => {
    const root = treeFor(TWO_OBJECTS);
    expect(() => assertFrameSetMatchesTree(root, [frameFrom(root)])).not.toThrow();
  });

  it("names the object present only in the frames", () => {
    const root = treeFor(TWO_OBJECTS);
    const frame = frameFrom(root);
    // A frame set that mentions an object the tree does not have: the object
    // would render as one that never moves, and every hash check would pass.
    // No cast needed: `IRObjectId` is a plain `string` alias
    // (`sceneIR.ts:132`), unlike `SamplerPlan`, which IS branded. Verified
    // rather than assumed — an unnecessary cast here would teach the next
    // reader that a brand exists where none does.
    const withGhost: FrameSnapshot = {
      ...frame,
      objects: [...frame.objects, { ...frame.objects[0], id: "scene.ghost" }],
    };
    expect(() => assertFrameSetMatchesTree(root, [withGhost]))
      .toThrow(/Only in the frames: \[scene\.ghost\]/);
  });

  it("names the object present only in the tree", () => {
    const root = treeFor(TWO_OBJECTS);
    const frame = frameFrom(root);
    const missingOne: FrameSnapshot = {
      ...frame,
      objects: frame.objects.filter((o) => !o.id.endsWith("b")),
    };
    expect(() => assertFrameSetMatchesTree(root, [missingOne]))
      .toThrow(/Only in the tree: \[[^\]]*b[^\]]*\]/);
  });

  it("accepts an empty frame set rather than throwing on frames[0]", () => {
    // Guards the early return: without it this indexes undefined.
    const root = treeFor(TWO_OBJECTS);
    expect(() => assertFrameSetMatchesTree(root, [])).not.toThrow();
  });
});
```

- [ ] **Step 7: Run it and READ the failure**

Run: `npx vitest run src/compiler/export/frameRaster.test.ts`

These tests are written against code that already exists, so they should go
**GREEN on first run**. That is the shape of a test that asserts nothing
(AGENT-LESSONS, Phase 5A's composed-transform test), so Step 8 is not optional —
it is the only thing that makes this file worth committing.

If any test is RED, read the message before fixing anything: a failure naming a
missing method means the fixture is wrong, not the behaviour.

- [ ] **Step 8: Prove each test is load-bearing, individually**

Apply each mutation to **`frameRaster.ts`** — the production file, not the
test's own logic — one at a time, run the suite, record the count, restore.

| # | Mutation | Predicted |
|---|---|---|
| 1 | Delete the `missing.length > 0 ||` term from the `if` | RED — "present only in the frames" |
| 2 | Delete the `|| extra.length > 0` term | RED — "present only in the tree" |
| 3 | Delete the `if (frames.length === 0) return;` early return | RED — the empty-set test |
| 4 | Change `frames[0]` to `frames[frames.length - 1]` | **Predicted GREEN**, because every frame carries the same id set. Report it either way. If it reddens, the prediction was wrong and that is worth reporting (AGENT-LESSONS §3b). |

Record actual counts beside predictions. A prediction that was wrong is a
finding, not an embarrassment.

- [ ] **Step 9: Update `renderer.md`'s two citations of `applySnapshot`**

**MEASURED** — `docs/architecture/renderer.md` cites
`../export/pngSequence.ts`'s `applySnapshot` at two places in the `__mareyId`
paragraph. Both now say `frameRaster.ts`. Also add, to that paragraph, that the
rasterization seam is shared by the PNG and video exporters.

- [ ] **Step 10: Commit**

```bash
git add src/compiler/export/frameRaster.test.ts docs/architecture/renderer.md
git commit -m "test(5b): pin the tree/frames id-agreement guard, which had no test"
```

---

## Task 1: `videoContract.ts` — every decision that can be tested headlessly

**Files:**
- Create: `src/compiler/export/videoContract.ts`
- Create: `src/compiler/export/videoContract.test.ts`

**Interfaces:**
- Consumes: `SamplerPlan` from `./exportContract` (type only), `IRSceneNode` from
  `../sceneIR` (type only).
- Produces, for Tasks 2, 3 and 5:
  - `type VideoContainer = "mp4" | "webm"`
  - `type VideoDiagnosticCode = "VIDEO_NO_WEBCODECS" | "VIDEO_UNSUPPORTED_CODEC" | "VIDEO_ODD_DIMENSIONS"`
  - `interface VideoDiagnostic { code, message }`
  - `interface VideoPlan { container, fullCodecString, mediabunnyCodec, width, height, fps, frameCount, bitrate, encoderOptions }`
  - `function planVideo(ir, plan, request): VideoPlanResult`
  - `function frameTimestampSeconds(index, fps): number`
  - `function frameDurationSeconds(fps): number`
  - `function noWebCodecsDiagnostic(): VideoDiagnostic`
  - `function unsupportedCodecDiagnostic(fullCodecString, container): VideoDiagnostic`

**Note on `VIDEO_ODD_DIMENSIONS`:** it is specified below, but Task 4 Q2 must
*measure* whether the encoder rejects odd dimensions before it is trusted. If
measurement shows the encoder accepts them cleanly, the correct outcome is to
**delete this diagnostic and report that**, not to keep a guard that cannot
fire (Global Constraint 11). Task 1 writes it; Task 4 decides whether it lives.

- [ ] **Step 1: Write the failing tests**

**UNVERIFIED** — written against the interface this task defines. Create
`src/compiler/export/videoContract.test.ts`.

```ts
import { describe, it, expect } from "vitest";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import { planExport } from "./exportContract";
import {
  planVideo,
  frameTimestampSeconds,
  frameDurationSeconds,
  MP4_CODEC_STRING,
  WEBM_CODEC_STRING,
} from "./videoContract";
import type { IRSceneNode } from "../sceneIR";
import type { SamplerPlan } from "./exportContract";

function irFor(source: string): IRSceneNode {
  const { ast } = parse(lex(source));
  const { ir, errors } = typeCheck(ast!);
  if (!ir) throw new Error(`fixture did not compile: ${errors.map(e => e.message).join("; ")}`);
  return ir;
}

const EVEN = irFor(`scene { size: (800, 600) duration: 5 }`);
const ODD = irFor(`scene { size: (801, 601) duration: 5 }`);

function planFor(ir: IRSceneNode, fps = 30): SamplerPlan {
  const r = planExport(ir, { fps });
  if (!r.ok) throw new Error(`fixture plan failed: ${r.diagnostics.map(d => d.code).join(", ")}`);
  return r.plan;
}

function codes(r: ReturnType<typeof planVideo>): string[] {
  return r.ok ? [] : r.diagnostics.map((d) => d.code);
}

describe("frameTimestampSeconds", () => {
  // mediabunny takes SECONDS, not microseconds (VideoSampleInit.timestamp is
  // documented "in seconds"). Passing microseconds produces a file whose
  // frames are 1,000,000x too far apart -- which still plays, and still
  // decodes the right frame count, so nothing else in this suite would catch
  // the unit being wrong. That is why this is pinned explicitly.
  it.each([
    [0, 30, 0],
    [1, 30, 1 / 30],
    [29, 30, 29 / 30],
    [1, 24, 1 / 24],
    [1, 60, 1 / 60],
  ])("frame %i at %ifps is at %f seconds", (index, fps, expected) => {
    expect(frameTimestampSeconds(index, fps)).toBeCloseTo(expected, 12);
  });

  it("gives each frame a duration of exactly one frame period", () => {
    expect(frameDurationSeconds(30)).toBeCloseTo(1 / 30, 12);
    expect(frameDurationSeconds(24)).toBeCloseTo(1 / 24, 12);
  });

  it("advances monotonically with no accumulated drift across a long export", () => {
    // Computed from the index each time rather than accumulated, so frame
    // 7199 is exactly 7199/30 and not 7199 additions of 1/30.
    expect(frameTimestampSeconds(7_199, 30)).toBeCloseTo(7_199 / 30, 9);
  });
});

describe("planVideo · container and codec", () => {
  it("resolves mp4 to pinned H.264 baseline", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "mp4" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.container).toBe("mp4");
    expect(r.plan.fullCodecString).toBe(MP4_CODEC_STRING);
    expect(r.plan.mediabunnyCodec).toBe("avc");
  });

  it("resolves webm to pinned VP9", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "webm" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.container).toBe("webm");
    expect(r.plan.fullCodecString).toBe(WEBM_CODEC_STRING);
    expect(r.plan.mediabunnyCodec).toBe("vp9");
  });

  it("carries the scene's dimensions and the plan's frame rate and count", () => {
    const r = planVideo(EVEN, planFor(EVEN, 24), { container: "mp4" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.width).toBe(800);
    expect(r.plan.height).toBe(600);
    expect(r.plan.fps).toBe(24);
    expect(r.plan.frameCount).toBe(120);
  });
});

describe("planVideo · pinned encoder configuration", () => {
  // AGENT-LESSONS 2d: each of these was measured to change the emitted
  // bitstream (spec M4), and the code looks correct with any value. Without
  // this test, changing any one of them leaves the whole suite green and
  // silently makes exports non-reproducible.
  it("pins every field that was measured to change the bitstream", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "mp4" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.encoderOptions).toMatchObject({
      hardwareAcceleration: "prefer-software",
      latencyMode: "quality",
      bitrateMode: "constant",
    });
    expect(r.plan.encoderOptions.keyFrameInterval).toBeGreaterThan(0);
  });

  it("uses an explicit bitrate rather than a library default", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "mp4" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.bitrate).toBeGreaterThan(0);
  });

  it("lets the request override the bitrate", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "mp4", bitrate: 12_345_678 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.bitrate).toBe(12_345_678);
  });
});

describe("planVideo · diagnostics", () => {
  it("refuses odd dimensions, naming both the width and the height", () => {
    const out = planVideo(ODD, planFor(ODD), { container: "mp4" });
    expect(codes(out)).toContain("VIDEO_ODD_DIMENSIONS");
    if (!out.ok) {
      expect(out.diagnostics[0].message).toContain("801");
      expect(out.diagnostics[0].message).toContain("601");
    }
  });

  it("accepts odd dimensions for webm, where 4:2:0 is not forced", () => {
    // If Task 4 Q2 measures that VP9 also requires even dimensions, this test
    // is the one that must change -- and that change is a finding to report.
    expect(codes(planVideo(ODD, planFor(ODD), { container: "webm" }))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/compiler/export/videoContract.test.ts`
Expected: FAIL — `Failed to resolve import "./videoContract"`. Read the message
and confirm it names the missing *module*, not a missing *export*; the latter
would mean a partially-written file from an earlier interrupted run.

- [ ] **Step 3: Write `videoContract.ts`**

**UNVERIFIED.**

```ts
import type { IRSceneNode } from "../sceneIR";
import type { SamplerPlan } from "./exportContract";

/**
 * Diagnostics for a video export that cannot be honoured.
 *
 * Prefixed `VIDEO_` rather than `EXPORT_` because these are specific to
 * encoding: the request already passed `planExport`, so the frame rate and
 * duration are known good and are never re-checked here (AGENT-LESSONS §5 —
 * two structures that must agree are better as one that derives).
 */
export type VideoDiagnosticCode =
  | "VIDEO_NO_WEBCODECS"
  | "VIDEO_UNSUPPORTED_CODEC"
  | "VIDEO_ODD_DIMENSIONS";

export interface VideoDiagnostic {
  readonly code: VideoDiagnosticCode;
  readonly message: string;
}

export type VideoContainer = "mp4" | "webm";

export interface VideoRequest {
  readonly container: VideoContainer;
  /** Bits per second. Defaults to `DEFAULT_BITRATE`. */
  readonly bitrate?: number;
}

/**
 * H.264 baseline, level 3.1. Pinned rather than inferred: left to choose,
 * mediabunny selected High profile (`avc1.640c14`). Baseline is the most
 * broadly playable, and — the reason this is a constant rather than a
 * preference — a codec string that drifts between runs makes every
 * byte-identity claim in `eval/RESULTS-PHASE-5B.md` false without any code
 * appearing to change.
 */
export const MP4_CODEC_STRING = "avc1.42001f";

/** VP9 profile 0, level 1.0, 8-bit. Pinned for the same reason. */
export const WEBM_CODEC_STRING = "vp09.00.10.08";

export const DEFAULT_BITRATE = 8_000_000;

/**
 * Frames between keyframes. Explicit because an implicit muxer default is a
 * library-version dependency: a mediabunny upgrade that changed it would
 * change every emitted file while this repository's code stayed identical.
 */
export const KEY_FRAME_INTERVAL = 30;

export interface VideoEncoderOptions {
  readonly hardwareAcceleration: "prefer-software";
  readonly latencyMode: "quality";
  readonly bitrateMode: "constant";
  readonly keyFrameInterval: number;
}

export interface VideoPlan {
  readonly container: VideoContainer;
  readonly fullCodecString: string;
  /** mediabunny's own short codec name, distinct from the WebCodecs string. */
  readonly mediabunnyCodec: "avc" | "vp9";
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly frameCount: number;
  readonly bitrate: number;
  readonly encoderOptions: VideoEncoderOptions;
}

export type VideoPlanResult =
  | { readonly ok: true; readonly plan: VideoPlan }
  | { readonly ok: false; readonly diagnostics: ReadonlyArray<VideoDiagnostic> };

/**
 * Presentation time of one output frame, in **seconds**.
 *
 * Seconds, not microseconds: mediabunny documents `VideoSampleInit.timestamp`
 * as "the presentation timestamp of the frame in seconds". Getting this wrong
 * produces a file that still plays and still decodes the right number of
 * frames, so only an explicit test catches it.
 *
 * Computed from the index rather than accumulated, so frame N is exactly
 * `N / fps` and a long export cannot drift.
 */
export function frameTimestampSeconds(index: number, fps: number): number {
  return index / fps;
}

/** Duration of one output frame, in seconds. */
export function frameDurationSeconds(fps: number): number {
  return 1 / fps;
}

/** WebCodecs is absent — most often an insecure context, not an old browser. */
export function noWebCodecsDiagnostic(): VideoDiagnostic {
  return {
    code: "VIDEO_NO_WEBCODECS",
    message:
      "[VIDEO_NO_WEBCODECS] This browser exposes no VideoEncoder, so video cannot be encoded. WebCodecs is only available in a secure context — check the page is served over https:// or http://localhost, not from a file:// URL or an insecure origin.",
  };
}

/** The resolved codec is not supported by this browser's encoder. */
export function unsupportedCodecDiagnostic(
  fullCodecString: string,
  container: VideoContainer,
): VideoDiagnostic {
  return {
    code: "VIDEO_UNSUPPORTED_CODEC",
    message: `[VIDEO_UNSUPPORTED_CODEC] This browser's video encoder does not support '${fullCodecString}', which Marey uses for ${container.toUpperCase()} export. Try the other container.`,
  };
}

/**
 * Validate a video export request against an already-validated sampler plan.
 *
 * Takes the `SamplerPlan` rather than re-deriving frame count and rate: the
 * plan is branded, so holding one is proof `planExport` already validated the
 * request (`exportContract.ts`). This function adds only what is specific to
 * encoding.
 */
export function planVideo(
  ir: IRSceneNode,
  plan: SamplerPlan,
  request: VideoRequest,
): VideoPlanResult {
  const diagnostics: VideoDiagnostic[] = [];

  // H.264 4:2:0 stores chroma at half resolution in both axes, so an odd
  // dimension has no representation. Refused by name rather than silently
  // cropped or padded: a scene exported one pixel smaller than it was
  // authored is exactly the kind of quiet degradation Phase 5A's refusal
  // surface exists to prevent.
  if (request.container === "mp4" && (ir.width % 2 !== 0 || ir.height % 2 !== 0)) {
    diagnostics.push({
      code: "VIDEO_ODD_DIMENSIONS",
      message: `[VIDEO_ODD_DIMENSIONS] MP4 export uses H.264 4:2:0, which requires even pixel dimensions, but this scene is ${ir.width}x${ir.height}. Change the scene's 'size' to even numbers, or export WebM instead.`,
    });
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics: Object.freeze(diagnostics) };
  }

  const isMp4 = request.container === "mp4";
  return {
    ok: true,
    plan: Object.freeze({
      container: request.container,
      fullCodecString: isMp4 ? MP4_CODEC_STRING : WEBM_CODEC_STRING,
      mediabunnyCodec: isMp4 ? ("avc" as const) : ("vp9" as const),
      width: ir.width,
      height: ir.height,
      fps: plan.fps,
      frameCount: plan.frameCount,
      bitrate: request.bitrate ?? DEFAULT_BITRATE,
      encoderOptions: Object.freeze({
        hardwareAcceleration: "prefer-software" as const,
        latencyMode: "quality" as const,
        bitrateMode: "constant" as const,
        keyFrameInterval: KEY_FRAME_INTERVAL,
      }),
    }),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/compiler/export/videoContract.test.ts`
Expected: PASS. Then `npx vitest run` — expect **818 + the new tests**, exit 0,
and `npx tsc -b --noEmit` exit 0.

- [ ] **Step 5: Prove each required behaviour is guarded, individually**

Apply to `videoContract.ts`, one at a time, restore between:

| # | Mutation | Predicted |
|---|---|---|
| 1 | `MP4_CODEC_STRING = "avc1.640c14"` | RED — the pinned-codec test |
| 2 | `hardwareAcceleration: "no-preference"` | RED — the pinned-config test |
| 3 | `latencyMode: "realtime"` | RED — same |
| 4 | `bitrateMode: "variable"` | RED — same |
| 5 | Delete the whole `VIDEO_ODD_DIMENSIONS` block | RED — the odd-dimensions test |
| 6 | `frameTimestampSeconds` returns `index * 1_000_000 / fps` | RED — the units test. **This is the mutation that matters most**: it is the one whose defect survives every other check in the phase. |
| 7 | `frameTimestampSeconds` returns `index / fps` accumulated as a running sum | Predicted RED at the 7,199-frame test only. Report the count. |

Record actual counts. If mutation 6 leaves the suite green, stop and report —
it means the units test is not doing what it claims.

- [ ] **Step 6: Commit**

```bash
git add src/compiler/export/videoContract.ts src/compiler/export/videoContract.test.ts
git commit -m "feat(5b): videoContract -- diagnostics, pinned encoder config, timestamp math"
```

---

## Task 2: `videoEncode.ts` — the WebCodecs and mediabunny glue

**This is the task with no headless tests, and the plan says so rather than
pretending otherwise** (spec §3.4). Its correctness is established by Task 3's
decode-back harness. What this task *can* do, and must, is (a) verify the
mediabunny API before building on it, and (b) make the structural rules
automated rather than a grep someone remembers to run.

**Files:**
- Create: `src/compiler/export/videoEncode.ts`
- Create: `src/compiler/export/exportBoundary.test.ts`

**Interfaces:**
- Consumes: `VideoPlan`, `frameTimestampSeconds`, `frameDurationSeconds`,
  `noWebCodecsDiagnostic`, `unsupportedCodecDiagnostic` from `./videoContract`.
- Produces, for Tasks 3 and 5:
  - `async function encodeVideo(plan: VideoPlan, canvases: Iterable<CanvasImageSource>, onProgress?: (done: number, total: number) => void): Promise<Uint8Array>`
  - `class VideoExportError extends Error { readonly diagnostic: VideoDiagnostic }`

- [ ] **Step 1: Verify the mediabunny API before writing anything against it**

**This step exists because this plan specifies `VideoSampleSource` and
`VideoSample`, which were read from `mediabunny.d.ts` but never executed.** The
spec's probe used `CanvasSource`, a different class. AGENT-LESSONS §3d: verbatim
code in a plan is a claim about an API the plan did not run.

Write a throwaway probe (delete it before committing — Global Constraint from
AGENT-LESSONS §6 about probe files inflating the suite) that, in a page served
over `localhost`:

1. constructs `new VideoSampleSource({ codec: "avc", bitrate: 8_000_000, hardwareAcceleration: "prefer-software", latencyMode: "quality", bitrateMode: "constant", keyFrameInterval: 30, fullCodecString: "avc1.42001f" })`;
2. adds 10 samples built as `new VideoSample(canvas, { timestamp: i / 30, duration: 1 / 30 })` where `canvas` is a **different** `OffscreenCanvas` each iteration, since that is the case this class was chosen for;
3. muxes with `new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() })`;
4. reports: did it throw, how many bytes, and does `new Input(...)` +
   `VideoSampleSink.samples()` return 10 samples.

Report the result. **If `VideoSampleSource` does not behave as specified, adapt
and report the discrepancy** — preserve the assertion (a per-frame canvas must
be encodable without an extra blit), not the spelling.

- [ ] **Step 2: Write `videoEncode.ts`**

**UNVERIFIED** — adapt to whatever Step 1 measured.

```ts
import {
  Output,
  BufferTarget,
  Mp4OutputFormat,
  WebMOutputFormat,
  VideoSampleSource,
  VideoSample,
} from "mediabunny";
import {
  frameTimestampSeconds,
  frameDurationSeconds,
  noWebCodecsDiagnostic,
  unsupportedCodecDiagnostic,
  type VideoDiagnostic,
  type VideoPlan,
} from "./videoContract";

/**
 * A refusal carrying its diagnostic, so a UI can show the message and a
 * harness can assert on the code.
 */
export class VideoExportError extends Error {
  readonly diagnostic: VideoDiagnostic;
  constructor(diagnostic: VideoDiagnostic) {
    super(diagnostic.message);
    this.name = "VideoExportError";
    this.diagnostic = diagnostic;
  }
}

/**
 * Encode an already-rasterized frame sequence into muxed container bytes.
 *
 * **This module sees neither the scene graph nor the IR** — it takes a
 * `VideoPlan` of inert numbers and a sequence of canvases, and has no import
 * that could reach either (`exportBoundary.test.ts` enforces that). That is
 * the video half of the same structural claim Phase 5A made for Lottie:
 * "encoders see only sampled output" as an import-level fact rather than a
 * convention.
 *
 * It receives no runtime, no world and no driver, so it cannot advance the
 * simulation even by accident, and it reads no clock: every timestamp is
 * derived from the frame's index (`videoContract.ts`).
 *
 * Every encoder field comes from `plan.encoderOptions` rather than being
 * written here, because each was measured to change the emitted bitstream and
 * each is pinned by a test in `videoContract.test.ts`.
 */
export async function encodeVideo(
  plan: VideoPlan,
  canvases: Iterable<CanvasImageSource>,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  if (typeof VideoEncoder === "undefined") {
    throw new VideoExportError(noWebCodecsDiagnostic());
  }

  const support = await VideoEncoder.isConfigSupported({
    codec: plan.fullCodecString,
    width: plan.width,
    height: plan.height,
    bitrate: plan.bitrate,
    framerate: plan.fps,
  });
  if (!support.supported) {
    throw new VideoExportError(
      unsupportedCodecDiagnostic(plan.fullCodecString, plan.container),
    );
  }

  const target = new BufferTarget();
  const format =
    plan.container === "mp4"
      ? new Mp4OutputFormat({ fastStart: "in-memory" })
      : new WebMOutputFormat();
  const output = new Output({ format, target });

  const source = new VideoSampleSource({
    codec: plan.mediabunnyCodec,
    bitrate: plan.bitrate,
    fullCodecString: plan.fullCodecString,
    hardwareAcceleration: plan.encoderOptions.hardwareAcceleration,
    latencyMode: plan.encoderOptions.latencyMode,
    bitrateMode: plan.encoderOptions.bitrateMode,
    keyFrameInterval: plan.encoderOptions.keyFrameInterval,
  });

  output.addVideoTrack(source, { frameRate: plan.fps });
  await output.start();

  let index = 0;
  const duration = frameDurationSeconds(plan.fps);
  for (const canvas of canvases) {
    const sample = new VideoSample(canvas, {
      timestamp: frameTimestampSeconds(index, plan.fps),
      duration,
    });
    // Awaited per frame, not fired-and-forgotten: the returned promise is the
    // encoder's backpressure signal, and ignoring it on a 7,200-frame export
    // queues every frame at once.
    await source.add(sample);
    sample.close();
    index += 1;
    onProgress?.(index, plan.frameCount);
  }

  await output.finalize();
  if (!target.buffer) {
    throw new Error("[export] The muxer finalized without producing a buffer.");
  }
  return new Uint8Array(target.buffer);
}
```

- [ ] **Step 3: Write the import-boundary test**

`renderer.md` records that the renderer's five pure modules have **no automated
guard** and that the document is the only thing enforcing them. Phase 5A's two
Lottie rules were likewise "checkable with a grep". This makes the two new rules
automated, which is strictly better than a grep someone must remember.

**UNVERIFIED** — create `src/compiler/export/exportBoundary.test.ts`.

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (rel: string): string =>
  readFileSync(resolve(__dirname, rel), "utf8");

/**
 * The two structural rules that carry Phase 5B's encoder-boundary claim.
 *
 * Asserted against the source text rather than by importing the modules,
 * because a type-only import leaves no runtime trace to observe — and a
 * type-only `import type { Container } from "pixi.js"` in videoEncode.ts
 * would still be a violation of the rule as written.
 */
describe("export boundary", () => {
  it("videoContract.ts does not import pixi.js in any form", () => {
    expect(read("./videoContract.ts")).not.toMatch(/from\s+["']pixi\.js["']/);
  });

  it("videoEncode.ts does not import pixi.js in any form", () => {
    expect(read("./videoEncode.ts")).not.toMatch(/from\s+["']pixi\.js["']/);
  });

  it("videoEncode.ts does not import sceneIR in any form", () => {
    expect(read("./videoEncode.ts")).not.toMatch(/from\s+["'].*sceneIR["']/);
  });

  it("reads the file it claims to read", () => {
    // Without this, a typo in a path above makes readFileSync throw -- which
    // is a failure, not a false pass -- but a path that resolved to some
    // OTHER real file would pass silently. Pin that each file is the one
    // named, by a string only that file contains.
    expect(read("./videoEncode.ts")).toContain("export async function encodeVideo");
    expect(read("./videoContract.ts")).toContain("export function planVideo");
  });
});
```

- [ ] **Step 4: Run the suite**

Run: `npx vitest run` — expect green, and `npx tsc -b --noEmit` exit 0.

Note that `videoEncode.ts` is never *executed* by the suite. That is expected
and is the point of Step 5.

- [ ] **Step 5: Prove the boundary test is load-bearing**

| # | Mutation | Predicted |
|---|---|---|
| 1 | Add `import type { Container } from "pixi.js";` to `videoEncode.ts` | RED — the pixi rule. Confirms a **type-only** import is caught, which is the form most likely to be added by accident. |
| 2 | Add `import type { IRSceneNode } from "../sceneIR";` to `videoEncode.ts` | RED — the sceneIR rule |
| 3 | Add `import type { Application } from "pixi.js";` to `videoContract.ts` | RED — the contract rule |
| 4 | Change `read("./videoEncode.ts")` to `read("./videoContract.ts")` in the pixi test | Predicted GREEN (both are clean), which is exactly why the fourth test exists. Report whether the fourth test catches a similar swap. |

Mutation 4 is the AGENT-LESSONS §2a question in this task's own disguise: **could
this test have produced the other answer?** Report it explicitly.

- [ ] **Step 6: Commit**

```bash
git add src/compiler/export/videoEncode.ts src/compiler/export/exportBoundary.test.ts
git commit -m "feat(5b): videoEncode, with the two structural rules made automated"
```

---

## Task 3: The dev seam and the decode-back harness

**This task is where the phase's exit criteria actually get proved.** Everything
before it is scaffolding.

**Files:**
- Create: `src/lib/devVideoSeam.ts`
- Create: `tools/visual-check/video-check.mjs`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `encodeVideo` (Task 2), `planVideo` (Task 1),
  `createFrameRasterizer` (Task 0), plus the unchanged Phase 4 pipeline.
- Produces: `window.__mareyExportVideo(source, opts) => Promise<ExportVideoResult>`.

- [ ] **Step 1: Write `devVideoSeam.ts`**

**UNVERIFIED**, but structurally a direct copy of `devExportSeam.ts`
(MEASURED — read at `e1dfb50`), including its `try`/`finally` teardown and the
reasoning for where the `try` opens. Keep that reasoning; it exists because a
failed `init()` otherwise leaks a WebGL context per retry.

```ts
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
    __mareyExportVideo?: (
      source: string,
      opts: ExportVideoOptions,
    ) => Promise<ExportVideoResult>;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

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

    const bytes = await encodeVideo(video.plan, canvases);

    const referenceFrames: string[] = [];
    if (opts.withReferenceFrames !== false) {
      for (const canvas of canvases) {
        const blob = await (canvas as HTMLCanvasElement).convertToBlob?.({ type: "image/png" })
          ?? await new Promise<Blob>((res, rej) =>
            (canvas as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error("no blob"))), "image/png"));
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
```

**A known risk this step must report on:** `canvases` holds every frame's canvas
in memory at once. At 800x600 that is ~2 MB per frame uncompressed, so a
7,200-frame export would need ~14 GB. Task 4 Q4 measures where this breaks. If
it breaks below `MAX_EXPORT_FRAMES`, report it — the fix (rasterize lazily and
re-rasterize for reference frames) trades memory for a second render pass and is
a design decision, not an implementation detail.

- [ ] **Step 2: Wire it into `main.tsx`**

**MEASURED** — `main.tsx` at `e1dfb50` already has two dynamic imports inside
one `if (import.meta.env.DEV)` block. Add a third in the same shape, with the
same `.catch`, so a production build's constant-folding drops it too.

```ts
  // Same reasoning, same shape, for Phase 5B's video harness
  // (`tools/visual-check/video-check.mjs`).
  import("./lib/devVideoSeam")
    .then((m) => m.installVideoSeam())
    .catch((err) => console.error("[devVideoSeam] failed to install:", err));
```

- [ ] **Step 3: Commit before the harness**

```bash
git add src/lib/devVideoSeam.ts src/main.tsx
git commit -m "feat(5b): dev-only video export seam"
```

- [ ] **Step 4: Write `video-check.mjs`**

This is the phase's evidence engine. It must, in one run:

1. Start from a scene file, inject it through the `#code=` share hash (same as
   `export-check.mjs`, so the real load path is exercised), and call
   `window.__mareyExportVideo`.
2. Write the container bytes to `<out>/scene.<mp4|webm>`.
3. **Demux and decode those bytes back** with mediabunny `Input` +
   `VideoSampleSink`, in the page.
4. Write every decoded frame to `<out>/decoded_%04d.png` and every reference
   frame to `<out>/reference_%04d.png`, **so a human can look at them**.
5. Report, as JSON and on stdout:
   - `decodedFrameCount` vs `plan.frameCount`;
   - decoded `displayWidth`/`displayHeight` vs the scene's;
   - decoded timestamps, and whether they are strictly increasing;
   - the **nearest-neighbour matrix** (below);
   - per-frame max per-channel delta and share of differing pixels, against
     the reference frame.
6. Run the whole export **twice from cold** and compare the container bytes,
   with MP4's six known byte ranges maskable via `--mask-mp4-times`.

**The nearest-neighbour check, which is how criterion 3 is proved.** For each
decoded frame *k*, compute a distance to reference frames *k−2 … k+2* and
require `argmin === k`:

```js
// UNVERIFIED. Mean absolute difference over a downsampled grid: full-resolution
// comparison of 5 candidates per frame is O(frames x 5 x pixels) and dominates
// the run for no accuracy gain, since a dropped or reordered frame differs
// structurally, not subtly.
function distance(aData, bData, width, height, step = 4) {
  let sum = 0, n = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const o = (y * width + x) * 4;
      sum += Math.abs(aData[o] - bData[o])
           + Math.abs(aData[o + 1] - bData[o + 1])
           + Math.abs(aData[o + 2] - bData[o + 2]);
      n += 3;
    }
  }
  return sum / n;
}
```

**The tie caveat, which must be implemented and not just documented.** When the
scene is settled, consecutive reference frames are identical and `argmin` is
arbitrary. The harness must therefore report, per frame, whether the match was
**strict** (`d[k]` uniquely lowest) or **tied**, and count the two separately. A
run whose frames are mostly tied has not proved criterion 3 — it has proved the
fixture was wrong. Exit non-zero if any frame's `argmin !== k` *strictly*; report
ties as a separate, visible number rather than folding them into a pass.

Required flags: `--scene`, `--container mp4|webm`, `--fps`, `--duration`,
`--out`, `--url`, `--frames` (which decoded frames to write as PNG; default a
spread of five), `--mask-mp4-times`, `--headed`.

Launch args must match the other harnesses, including
`--disable-accelerated-2d-canvas` — the flag added on 2026-09-18 that made
Phase 5A's tolerance reproducible. Without it this harness inherits the same
session-dependent rasterization.

- [ ] **Step 5: Run it and READ the frames**

```bash
npx vite --port 5199 --strictPort    # leave running
node tools/visual-check/video-check.mjs \
  --scene eval/scenes-3b/compound-logo.marey \
  --container webm --fps 30 --out .visual-check/video/logo-webm
```

Then **open `decoded_0000.png`, a mid-motion frame, and the last frame with the
Read tool.** Numbers are not evidence here: Phase 4 shipped blank PNGs that
hashed perfectly consistently, and Phase 5A shipped a Lottie file that played
and showed the wrong thing. Both would pass every numeric check above.

Kill the Vite server afterwards and confirm no `LISTENING` socket remains on
5199, matching on a boundary.

- [ ] **Step 6: Prove the harness can fail**

A harness whose only guard cannot fire is a Global Constraint 11 violation, and
Phase 5A shipped exactly that (`data_failed` was unreachable with inline
`animationData`). So demonstrate each of these produces a non-zero exit:

| # | Injected fault | Must be caught by |
|---|---|---|
| 1 | Drop every 10th frame before encoding (temporary edit to the seam) | frame-count check **and** nearest-neighbour |
| 2 | Reverse the frame order before encoding | nearest-neighbour, not frame count |
| 3 | Duplicate frame 5 in place of frame 6 | nearest-neighbour |
| 4 | Encode at 60fps while claiming 30 | frame-count or timestamp check |

Restore after each. **Fault 2 is the important one**: it leaves the frame count
correct, so a harness that only counts frames reports a confident pass. Record
which check caught each fault; if any fault passes cleanly, the harness does not
yet prove criterion 3.

- [ ] **Step 7: Commit**

```bash
git add tools/visual-check/video-check.mjs
git commit -m "test(5b): decode-back harness with nearest-neighbour frame identity"
```

---

## Task 4: Settle the spec's open questions by measurement

Spec §11 lists five questions no task may treat as known. Phase 5A's §11 worked
this way and is the reason its Lottie facts are trustworthy.

**Files:**
- Modify: `docs/specs/2026-09-18-marey-phase-5b-video-design.md`
  (a dated correction appended, never a silent rewrite)
- Modify: `src/compiler/export/videoContract.ts` (only if Q2 requires it)

- [ ] **Step 1: Answer each question, recording the command and the output**

| # | Question | How to settle it |
|---|---|---|
| Q1 | Does mediabunny expose a Matroska timestamp scale finer than 1 ms? | Read `MkvOutputFormatOptions` in `mediabunny.d.ts`; if an option exists, set it and re-measure decoded timestamps |
| Q2 | Does the encoder reject odd dimensions, or silently adjust them? | `VideoEncoder.isConfigSupported` at 801x601 for both codecs, then actually encode one frame and read back `displayWidth`/`displayHeight` |
| Q3 | What does mediabunny default `keyFrameInterval` to, and is it byte-stable? | Encode twice with it unset, compare bytes; then with it set |
| Q4 | Where does `BufferTarget` + the eager canvas array exhaust memory? | Export at increasing frame counts until it fails; record the last that worked |
| Q5 | Does `prefer-software` get software encoding on a machine with a hardware encoder? | Likely **unanswerable here** — SwiftShader means there is no hardware encoder to prefer against |

- [ ] **Step 2: Act on Q2 specifically**

If odd dimensions are **rejected** by the encoder, `VIDEO_ODD_DIMENSIONS` stands
as written. If they are **silently adjusted**, the diagnostic still stands, and
the reason strengthens. If they are **accepted cleanly and losslessly**, delete
the diagnostic, delete its tests, and report that — per Global Constraint 11, a
guard that cannot fire is worse than no guard, because it looks like protection.

Whichever way it goes, say which, and show the measurement.

- [ ] **Step 3: Act on Q5 honestly**

If Q5 cannot be answered on this machine, **narrow the spec's §7 claim to what
was measured** rather than leaving a general statement standing on an
unmeasured assumption. "We could not test this, and here is the narrowed claim"
is the required shape (AGENT-LESSONS §2f). Do not quietly leave §7 as-is.

- [ ] **Step 4: Append a dated correction to the spec and commit**

Append to spec §11, never rewrite in place — Phase 5A's precedent is a dated
correction so a reader can see what was believed and what was measured.

```bash
git add docs/specs/2026-09-18-marey-phase-5b-video-design.md src/compiler/export/videoContract.ts
git commit -m "docs(5b): settle the five open questions by measurement"
```

---

## Task 5: The export control

Scope note, carried from spec §9: this pulls a Phase 6 surface forward
deliberately, at the user's direction. It is recorded in the spec so review sees
it as a decision rather than drift.

**Files:**
- Create: `src/hooks/useExportVideo.ts`
- Modify: `src/components/TopBar/TopBar.tsx`, `src/components/TopBar/TopBar.module.scss`
- Modify: `src/store/index.ts`

**Interfaces:**
- Consumes: the same pipeline `devVideoSeam.ts` uses. **Do not call
  `window.__mareyExportVideo`** — that seam is dev-only and constant-folded out
  of production. Extract the shared pipeline into a function both call, or have
  the hook call the modules directly. Report which you chose and why.

- [ ] **Step 1: Add `isExporting` to the store**

**MEASURED** — `src/store/index.ts` at `e1dfb50` has `AppState` with
`isCompiling: boolean` and `setIsCompiling`. Follow that exact shape:

```ts
  isExporting: boolean;
  setIsExporting: (val: boolean) => void;
```

with `isExporting: false` in the initial state and
`setIsExporting: (isExporting) => set({ isExporting }),` beside `setIsCompiling`.

- [ ] **Step 2: Write `useExportVideo.ts`**

**UNVERIFIED** — modelled on `useShare.ts` (MEASURED — read at `e1dfb50`),
including its `useCallback` shape, its `showToast` usage, and its blob-download
helper.

The hook must:
- take a `VideoContainer`;
- set `isExporting` true and false around the work, in a `finally`;
- report progress through `showToast` or a progress state — a 240-frame export
  takes seconds and must not present as a hung tab;
- download via `Blob` + object URL, filename `scene.mp4` / `scene.webm`,
  revoking the URL afterwards exactly as `downloadCode` does;
- on failure, `showToast(message, "error")` with the diagnostic's message
  verbatim — `VIDEO_*` and `EXPORT_*` messages are already written to be read by
  a person, and rewording them here would create a second copy to drift.

- [ ] **Step 3: Add the control to `TopBar.tsx`**

**MEASURED** — `TopBar.tsx` renders buttons as
`<button className={styles.btnIcon} onClick={...} aria-label={...} title={...}>`
with an inline SVG icon component and a lowercase text label. Follow that
pattern exactly; add a `VideoIcon` beside the existing `ShareIcon` etc.

Container choice: two buttons (`webm`, `mp4`) is acceptable and simplest; a
menu is not required. Disable while `isExporting`, and reflect that in the
label as the New/Example buttons reflect their confirm state.

- [ ] **Step 4: Verify in a real browser, not by reading the code**

Run the dev server, click the control, and confirm a file downloads and plays.
Then confirm the **production** build still drops the dev seam:

```bash
npm run build
grep -r "__mareyExportVideo\|devVideoSeam\|installVideoSeam" dist/ || echo "clean"
```

Expected: `clean`. The UI path must work in production **without** the dev seam;
if this grep finds a match, the hook is reaching through the seam and Step 2's
instruction was not followed.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useExportVideo.ts src/components/TopBar/ src/store/index.ts
git commit -m "feat(5b): export video control in the top bar"
```

---

## Task 6: Evidence for the three exit criteria

**Files:**
- Create: `eval/RESULTS-PHASE-5B.md`

One section per criterion, each with the reproducing command, the measured
output, and — where a behaviour is claimed — a performed-and-restored revert.
Model it on `eval/RESULTS-PHASE-5A.md` (MEASURED — its structure is one section
per criterion with commands inline).

- [ ] **Step 1: Criterion 1 — frame rate and duration**

For **both** containers, run `video-check.mjs` and record: requested fps and
duration, decoded frame count, decoded dimensions, decoded track duration,
timestamp monotonicity. Assert against the **file's own** metadata, not against
what was requested.

- [ ] **Step 2: Criterion 2 — repeated exports**

Run each container's export twice from cold. Record:
- WebM: full byte equality, or the diff if not.
- MP4: byte equality with the six §7.2 ranges masked, **and** that the
  unmasked diff contains only those ranges. Record the actual differing offsets
  measured on this run — do not copy the spec's numbers forward without
  re-deriving them (AGENT-LESSONS §1).

- [ ] **Step 3: Criterion 3 — no frame dropped, duplicated or reordered**

Record the nearest-neighbour result: how many frames matched strictly, how many
tied, and the maximum off-diagonal margin. Record the four injected faults from
Task 3 Step 6 and which check caught each — that table is the evidence that this
criterion's check can fail, without which a clean run proves nothing.

- [ ] **Step 4: Read the images and say what they show**

Read `decoded_0000.png`, a mid-motion frame, and the last frame with the Read
tool, and write a row per frame describing what is actually visible. Phase 5A's
notes record a draft that described a frame as "rotated off-axis" when the image
showed it near-upright; describe what is there, not what the scene should be
doing.

- [ ] **Step 5: Commit**

```bash
git add eval/RESULTS-PHASE-5B.md
git commit -m "docs(5b): exit-criteria evidence"
```

---

## Task 7: Documentation and execution notes

**Files:**
- Modify: `docs/architecture/renderer.md`, `docs/architecture/roadmap-and-process.md`,
  `docs/architecture/README.md`, `tools/visual-check/SKILL.md`
- Modify: `docs/plans/2026-09-18-phase-5b-video.md` (this file)

- [ ] **Step 1: `renderer.md` — a "video encoder boundary" section**

Beside the existing "Lottie encoder boundary (Phase 5A)" section. Cover: the two
structural rules and that they are now **automated** rather than grep-checked;
that `frameRaster.ts` is the single rasterization seam both exporters share, and
why that matters; and the container determinism asymmetry (WebM byte-identical,
MP4 six bytes of mandated wall clock).

- [ ] **Step 2: Both phase-status locations, in the same edit**

AGENT-LESSONS §5b: all three phase transitions so far shipped stale, because
`README.md`'s "Current phase" line and `roadmap-and-process.md`'s phase bullet
are hand-synced. Update both **in one commit**, and delete the branch reference
if the branch is gone.

- [ ] **Step 3: `SKILL.md` — the new harness**

What `video-check.mjs` does, what it proves, and specifically that it decodes the
file back rather than trusting playback.

- [ ] **Step 4: Execution notes in this plan**

Written from `git log`, the task reports, the reviews and the SDD ledger — **not
from any single task's self-report** (AGENT-LESSONS §1). Re-derive every number
first-hand on a clean tree. Record: defects found in this plan, defects found in
source, a mutation table with each result beside the suite size it was measured
against, deliberate gaps each with what makes it harmless today, and the process
record.

- [ ] **Step 5: Commit**

```bash
git add docs/ tools/visual-check/SKILL.md
git commit -m "docs(5b): renderer boundary, phase status in both locations, execution notes"
```

---

## What is still owed after Task 7

Per AGENT-LESSONS §8, **Phase 5B is not done at Task 7.** Phase 3A passed eleven
task reviews and a whole-branch review and *then* an outside reviewer found four
Important defects. Phase 4's independent review found three Important and twenty
Minor that nine task reviews had all missed.

Owed:

1. An **independent whole-branch review** by someone with no stake in this
   reasoning. Give it the question and the evidence to check, never the answer
   (AGENT-LESSONS §3).
2. The merge, with **both** phase-status locations updated in the same edit.

Every review dispatch in this phase carries Phase 5A's parting question:
**could this fixture, or this mutation, have produced the other answer?**

---

## Self-review

**Spec coverage.** §1 (goal) → all tasks. §2 (measured facts) → Global
Constraints, Task 2 Step 1. §3.1 (existing seam) → Global Constraint 7. §3.2
(modules) → file structure. §3.3 (structural rules) → Task 2 Step 3. §3.4
(untestable encoder) → Task 2 preamble, Task 3. §3.5 (extraction) → Task 0. §4
(frame path) → Task 3 Step 1. §5 (pinned config) → Task 1 Steps 3, 5. §6
(timestamps) → Task 1, Task 4 Q1. §7 (determinism) → Task 6 Step 2. §8
(refusals) → Task 1, Task 4 Q2. §9 (UI) → Task 5. §10 (verification) → Task 3,
Task 6. §11 (open questions) → Task 4. §12 (out of scope) → not implemented,
correctly. §13 (task shape) → this task list. §14 (review question) → "What is
still owed".

**Placeholder scan.** No "TBD", no "handle edge cases", no "similar to Task N".
Two places deliberately describe rather than show, and both name what to model
on: Task 3 Step 4's harness (Playwright glue whose shape depends on
`export-check.mjs` and `lottie-check.mjs`, both named) and Task 5 Step 2's hook
(modelled on `useShare.ts`, named, with every required behaviour enumerated).
Flagged rather than hidden.

**Type consistency.** `FrameSnapshot` and `snapshotFor` come from
`frameSampler.ts` unchanged. `SamplerPlan` is **branded**, so Task 1's tests must
obtain one from `planExport` — stated in the test fixture rather than left to be
discovered. `VideoPlan` is produced in Task 1 and consumed in Tasks 2, 3, 5 with
the same field names throughout. `createFrameRasterizer` is produced in Task 0
and consumed in Task 3. `VideoExportError` is produced in Task 2 and caught in
Tasks 3 and 5.

**Known risks, stated rather than smoothed over.**

1. **Task 3 Step 1's eager canvas array may not survive a large export.** Named
   in the step, measured by Task 4 Q4, with the fix and its trade-off stated in
   advance.
2. **Task 2 specifies an API this plan never executed.** `VideoSampleSource` and
   `VideoSample` were read from type declarations; the spec's probe used
   `CanvasSource`. Task 2 Step 1 exists solely to run them first. This is the
   plan's single most likely defect and it is named, per the lesson that a plan's
   verbatim code is a claim about a file the plan did not write.
3. **Task 0 Step 8's mutation 4 and Task 2 Step 5's mutation 4 are both
   predicted GREEN.** A plan that only handled the outcome it expected would be
   the AGENT-LESSONS §3b failure. If either reddens, the prediction was wrong and
   that is worth reporting.

**Fixtures compiled before dispatch.** All three `.marey` fixtures in this plan
were compiled headlessly at `e1dfb50` via
`EVAL_DIR=<dir> npx vitest run --config eval/vitest.config.ts`, and all three
pass: `even.marey` (0 nodes), `odd.marey` (0 nodes), `two-objects.marey`
(**2 nodes**, confirming the `circle a { … }` shape syntax is right). Phase 5A's
plan shipped a `line` fixture that did not compile and would have produced a
false RED; this is the check that prevents it. Note in particular that
**`801x601` compiles** — the type checker does not reject odd scene dimensions,
so Task 1's `VIDEO_ODD_DIMENSIONS` fixture is reachable and the diagnostic is
not dead on arrival.

**Defects found in this plan before dispatch (3).** Recorded so execution can
measure against a real starting count rather than pretending the plan began
clean.

1. **The spec specified `CanvasSource`, which cannot work here.** `extract.canvas()`
   returns a new canvas per frame; `CanvasSource` wraps one canvas it re-reads.
   Pasted as written it would have encoded the same canvas repeatedly or forced
   an undocumented extra blit. Found by reading `mediabunny.d.ts` against the
   probe, and fixed in the spec before this plan was written.
2. **An early draft of Task 0 left `applySnapshot` in `pngSequence.ts`.** That
   would have made the shared module import the PNG-specific one — the dependency
   pointing the wrong way. Found by checking which files actually reference
   `applySnapshot`: exactly one outside its own module
   (`frameSampler.test.ts:8`), which is why the move costs a single import line.
3. **Task 0's ghost-id fixture carried a pointless brand cast.** It read
   `id: "scene.ghost" as typeof frame.objects[0]["id"]`, written on the
   assumption that `IRObjectId` is branded the way `SamplerPlan` is. It is not —
   `sceneIR.ts:132` declares `export type IRObjectId = string`. The cast would
   have compiled and taught the next reader that a brand exists where none does.
   Found by opening the type rather than trusting the analogy.

## Execution notes

Written 2026-09-24 at the close of Task 7, from `git log`, the nine task
reports (Tasks 0–6, 6b, and this one), the eight task reviews and their
re-reviews, and the SDD ledger
(`.sdd/2026-09-18-phase-5b-video/progress.md`) — **not** from any
single task's self-report, per AGENT-LESSONS §1. Every number below was
re-derived first-hand on this tree while writing this, including the ruling
and defect counts, which were re-counted by grep rather than trusted from the
addendum that carried them into this task's dispatch.

**Written by the Task 7 implementer, dispatched normally** — unlike Phase 5A's
execution notes, which the controller wrote because the dispatched implementer
was lost to a rate-limit kill. No deviation to name on authorship this time.

### Final evidence

| Check | Command | Result |
|---|---|---|
| Unit suite | `npx vitest run` | **33 files / 862 tests / exit 0** |
| Typecheck | `npx tsc -b --noEmit` | exit 0 |
| Production build | `npm run build` | exit 0; only the pre-existing >500 kB chunk-size advisory |
| Dev seam dropped from production build | `npm run build`, then grep `dist/` for `__mareyExportVideo`, `devVideoSeam` | **zero matches** |
| mediabunny reaches the production bundle | grep `dist/` for `mediabunny`, `Matroska` | present, confined to `dist/assets/videoPipeline-*.js`, **279,404 bytes** — byte-identical to Task 5's own fix-round measurement of the same chunk, re-derived independently here rather than copied |
| Tree | `git diff --stat`; `git status --porcelain` (content-based per AGENT-LESSONS §6, not trusted alone) | clean throughout this task's own work |
| Ports 5199 / 4173 | `netstat -ano` filtered for a boundary-matched `:5199`/`:4173` LISTENING socket | neither bound, checked before and after this task's own build |

This task started no dev server and drove no browser, per its own Global
Constraints — the production build above is a one-shot `vite build`, not a
listener, and was safe to run under that restriction.

**Baseline check.** The plan's Global Constraint 1 records **29 files / 818
tests** re-derived on a clean tree at the branch's start commit. That commit
no longer resolves (see "The process record" below — R33), so it cannot be
re-checked out to confirm directly; it is carried forward as ledger-recorded
rather than re-verified, consistent with R33's own ruling that a stale SHA is
not something to chase, only its content. Current `HEAD` before this task's
own commits was 33 files / 862 tests: **+4 test files, +44 tests** for the
whole phase.

**Branch shape, as of `0a512ab`**, the commit immediately before this
execution-notes commit (a commit cannot contain its own diffstat, so this is a
snapshot rather than a live count): **40 commits** from the merge base with
`main` (`c560530`), **25 files, +6,212 / −133**.

### Defects found in this plan (17)

Re-counted by grepping the ledger for every `Plan defect #N` / `Plan Defect
#N` occurrence rather than trusted from the addendum that quoted it: `#4`
through `#17` inclusive, no gaps, no duplicates — 14 defects, plus the 3 this
plan's own self-review recorded before dispatch (§"Defects found in this plan
before dispatch" above), for **17 total**. This is **not** the brief's
original "3 found before dispatch" — that count was the plan's opening
position, not its final one, and the addendum's own instruction was to record
the number that actually happened.

**Found before dispatch (3):** the spec's `CanvasSource` mismatch, an early
Task 0 draft leaving `applySnapshot` in `pngSequence.ts`, and Task 0's
pointless `IRObjectId` brand cast — all three listed in full in this plan's
self-review above.

**Found during execution or review (14, #4–#17):**

4. **Task 0's "MEASURED" label on its `applySnapshot` code block was false.**
   The file had genuinely never changed since the label was written, but the
   block paraphrased it and silently dropped four pieces of documented
   reasoning (why a snapshot carries transforms not geometry; why writes go
   through `__updateLayout()`; the `visible`/`cullEscapedBodies` hazard
   paragraph; the no-`__mareyId` paragraph), plus a fifth in the guard comment
   caught only in self-review. Consequence carried into every later dispatch:
   "MEASURED" means "the author read the file," not "this is the file."
5. **Task 1's pinned-codec test was true by construction.** It compared
   `planVideo`'s output against the same constant re-imported from the module
   under test, so the assertion held regardless of the constant's value —
   proved by mutation 1 coming back GREEN 15/15. Fixed with literal pins
   (`toBe("avc1.42001f")`, `toBe("vp09.00.10.08")`).
6. **Two of Task 1's required exports had zero test coverage.**
   `noWebCodecsDiagnostic` and `unsupportedCodecDiagnostic` were both in the
   brief's required interface; deleting both bodies left the suite GREEN
   15/15. Fixed with two describe blocks; re-deletion then reddened 15/3.
7. **Two pinned values were guarded only by a sign check.** The brief's own
   `toBeGreaterThan(0)` assertions on `DEFAULT_BITRATE` and
   `KEY_FRAME_INTERVAL` let either be mutated to `1` with the whole suite
   green. Ruled for the finding against the plan (R8) and fixed with exact
   literal equality.
8. **`KEY_FRAME_INTERVAL` is documented and used in the wrong unit.**
   `videoContract.ts` calls it "frames between keyframes"; mediabunny's field
   is in **seconds**. The brief's own code would have requested a keyframe
   every 30 seconds instead of every 30 frames. Not argued — measured by
   reading back actual emitted packet types after encoding 60 frames at 30fps
   with `keyFrameInterval: 1`: keys landed at `[0, 17, 30, 47]`, and index 30
   is exactly the 1.0-second boundary the SECONDS hypothesis predicts, not the
   every-frame pattern FRAMES would force. Resolved at the point of use in
   `videoEncode.ts` (divide by `plan.fps`); the residual docstring trap was
   corrected in Task 4, not carried to this task as R15 originally planned
   (R15 revised — Task 4 was already authorized to touch that file).
9. **The brief's own boundary test used `node:fs`/`node:path`, which cannot
   compile here.** `tsconfig.app.json` carries only `"types": ["vite/client"]`
   — no Node types — so the brief's block fails `tsc` with three `TS2307`
   errors. Not guessed at: hit, then resolved against an existing precedent in
   this repo, `languageDocs.test.ts`, which documents the identical constraint
   and the identical `?raw`-import fix.
10. **`videoEncode.ts` leaked resources on the throw path.** If
    `source.add(sample)` threw mid-loop, `sample.close()` never ran and
    `output.cancel()` — mediabunny's documented release mechanism — was never
    called on any error path after `output.start()`. Inherited verbatim from
    the brief's Step 2 block, which had no `try`/`finally` either. Fixed with
    an outer `try`/`catch` (deliberately not `finally`, so `cancel()` cannot
    run after a successful loop where `finalize()` must run instead) and
    `await output.cancel().catch(() => {})` so a cleanup-time failure can
    never replace the original error.
11. **The boundary regexes anchored on the `from` keyword missed two of three
    import forms.** Neither `import("pixi.js")` nor a bare `import
    "pixi.js"` contains the literal token `from`, so both bypassed a guard
    whose own docstring claimed "any form" coverage. None of the plan's four
    mutations exercised this, because all four used `import type {...} from
    "..."`. Widened to cover all three forms.
12. **The MP4 root-cause attribution in Task 3's report was inferred by
    analogy, not measured on the failing pair.** The report ruled out
    rendering non-determinism because the WebM path (fed by the identical
    `canvases` pipeline) was byte-identical *on a different invocation* — an
    inference across separate runs, not a comparison within the one that
    actually failed. Fixed (R17) by adding a direct runA-vs-runB
    reference-frame comparison to the harness and re-running the failing MP4
    pair: bit-identical, 15/15, which is what let the evidence document's
    encoder-side attribution be a measurement rather than an analogy.
13. **One gate family had never been observed to fail.** All four of Task 3's
    original injected faults corrupted both cold runs identically, so none
    could make `hashesEqual` report false — an unfired gate is
    indistinguishable from a broken one. Fixed (R18) with a fifth fault that
    perturbs only one run's returned hash; it isolated `hashesEqual` cleanly,
    every other check staying clean in that run.
14. **Task 6's brief instructed masking a claim Task 3 had already falsified.**
    Step 2 said to mask spec §7.2's "six byte ranges" in MP4 output and show
    the unmasked diff contains only those ranges. Task 3 had already measured
    real MP4 output differing in *length* with ~61–63% of overlapping bytes
    differing inside `mdat` — there is no set of six ranges whose masking
    produces equality. Following the brief literally would have forced a
    fabricated passing comparison. Ruling R32 replaced it with the spec's own
    second exit-criterion branch: document the encoder-side reason instead.
15. **This task's own brief repeated defect #14's exact error, aimed at
    permanent documentation instead of a one-off evidence document.** Step 1
    instructed covering "the container determinism asymmetry (WebM
    byte-identical, MP4 six bytes of mandated wall clock)" — the identical
    falsified claim, this time for `renderer.md`, which future agents read as
    authority. Caught by the pre-Task-7 scan before this task was dispatched;
    ruling R34 replaced it with the framing this task's own `renderer.md`
    section above actually carries, and forbade a byte count entirely.
16. **This task's own Files list omitted three of the four edits rulings had
    deferred into it.** Only R19's `SKILL.md` edit was named in the brief;
    R7 (`frameSampler.ts`'s stale citations), R28 (mediabunny's MPL-2.0
    notice) and R31 (the `stripComments` docstring's understated limitation)
    were all routed here by earlier rulings the brief predates. Ruling R35
    carried all four into this task's addendum explicitly, which is why this
    task's diff is wider than the brief's own Files list — the addendum's
    §E says so and this document is the confirmation that the wideness was
    real and not scope creep.
17. **This task's own brief contradicted itself about who updates the
    phase-status locations.** Step 2 assigned that edit to this task; the same
    brief's own closing section assigned the identical edit to the merge.
    Settled by Phase 5A's own precedent (`20501f2`, written *after* 5A's
    whole-branch review, its text summarizing that review's outcome): status
    text that reports a review's result cannot be written before the review
    runs. Ruling R38 removed the phase-status edit from this task entirely —
    this document, and the rest of this task's diff, touch neither
    `docs/architecture/README.md` nor the phase bullet in
    `roadmap-and-process.md`.

Unlike Phase 5A's execution notes, this phase's ledger did not keep a separate
"defects found in source" bucket next to "defects found in this plan" — nearly
every defect above originated in a code or test block the plan's own brief
specified verbatim (the same "a plan's verbatim code is a claim about a file
the plan did not write" lesson Phase 5A's own notes name), so the ledger's
controller tracked all of them under one running count. Presented here as the
ledger recorded them, not re-bucketed to match the previous phase's shape.

### Mutation results, each beside its suite size

| Task | Mutation | Suite at the time | Result |
|---|---|---|---|
| 0 | Step 8: four `applySnapshot`/tree-agreement mutations | 822 | Three reddened as predicted; mutation 4 (first/last frame swap) was a **vacuous GREEN** — every fixture in `frameRaster.test.ts` uses a single-element frame array, so `frames[0]` and `frames[frames.length-1]` are the same element. Implementer reported this rather than banking the GREEN |
| 1 | Codec-string pin (defect #5) | 15 (file) | GREEN 15/15 before the literal pin; **RED 14/1** after |
| 1 | Two required-export bodies deleted (defect #6) | 15 (file) | GREEN 15/15 before coverage added; **RED 15/3** after |
| 1 | Accumulated-drift arithmetic (mutation 7) | 840 | Brief predicted RED; **measured GREEN** — drift at 7,199 frames is `-1.1056e-11` against a `toBeCloseTo(…, 9)` tolerance of `~5e-10`, about 45× looser. Tightened to exact equality, which then reddened: `expected 239.9666666666556 to be 239.96666666666667` |
| 1 | `DEFAULT_BITRATE`→`1` / `KEY_FRAME_INTERVAL`→`1` / hardcoded `width:800,height:600` (fix round, defect #7) | 841 | All three reddened: `expected 1 to be 8000000`; `expected 1 to be 30`; `expected 800 to be 640`. Restored byte-identical |
| 2 | Pixi-clean file swap (all four `exportBoundary.test.ts` tests pointed at one constant) | 845 | **GREEN 4/4.** Implementer answered the phase's carried question, "could this have produced the other answer," with **"Yes"** — the file could not tell which module it had actually inspected. Filed as an adjacent-property gap, then fixed (R13) with per-test identity strings; the same swap then reddened |
| 2 | `KEY_FRAME_INTERVAL` unit (defect #8) | n/a (real encode) | 60 frames at 30fps, `keyFrameInterval: 1` → key packets at `[0, 17, 30, 47]`, distinguishing SECONDS from FRAMES by which boundary 30 sits on |
| 2 | Import-form regex (defect #11, fix round) | 845 | `import("pixi.js")` and bare `import "pixi.js"` added to `videoEncode.ts` in a probe: old regex missed both; widened regex catches both |
| 3 | Five injected faults (drop every 10th frame; reverse order; duplicate frame 5→6; encode 60fps claiming 30; corrupt one run's hash only) | 845 (harness is `.mjs`, outside the suite) | **All five caught, exit 1 every time**, each by the specific mechanism predicted: frame count + nearest-neighbour; nearest-neighbour alone (frame count stayed correct — the case spec §10.2 flags as the one a count-only harness would miss); nearest-neighbour isolated to exactly the corrupted frame; the timestamp-schedule check alone; `hashesEqual` alone, isolated from every other check |
| 3 | Reference-frame bit-identity on the actually-failing MP4 pair (defect #12 fix) | 845 | **15/15 bit-identical**, both cold runs — the renderer exonerated by direct measurement of the failing pair, not by analogy across separate ones |
| 4 | Odd-dimension encode, both codecs (Q2) | n/a (real encode) | MP4/H.264: `isConfigSupported` false, encode throws the predicted even-dimensions error. WebM/VP9: `isConfigSupported` true, round-trips at exactly 801×601 with true corner-pixel content intact |
| 4 | `keyFrameInterval` omitted vs. `1` (Q3) | n/a (real encode) | Omitted: two independent 90-frame runs byte-identical, keys `[0, 60]` — every 2s at 30fps, the documented default. `keyFrameInterval: 1`: different bytes, different length, keys `[0, 30, 60]` — proof the option is live |
| 4 | Frame-count ramp (Q4) | n/a (real export seam) | 1,200/2,400/3,600/4,800 frames all completed (38s/101s/103s/223s); **6,000 failed after 166s** — faster than 4,800's successful 223s, consistent with a mid-job failure. `MAX_EXPORT_FRAMES` (7,200) never reached |
| 5 | R21's widened regex vs. a real `pixi.js/app` import (Task 5 review, added a 4th mutation nobody had run) | 850 | **The OLD ends-with regex passed this real violation** — proven load-bearing, not argued: the widening caught something the previous guard genuinely let through |
| 5 | `stripComments` sabotaged to `return ""` (fix round) | 862 (final) | All three R3 guards **and the stripper's own unit tests** went RED — 6 failed / 8 passed, the exact signature the implementer claimed. A stripper that ate code cannot report a clean file |
| 6b | Reference-frame swap (frames 5↔9) against the actually-clicked MP4 (Step 4) | n/a (harness) | **2 isolated strict mismatches** — frame 5's nearest reference became 4 (distance 1.1296), frame 9's became 8 (distance 1.2601) — proving the decode-and-compare check can fail on the real clicked artifact, not only on the dev-seam path |

### Deliberate gaps and deferrals, each with what makes it harmless today

1. **Superseded by the fix wave (see "Whole-branch review and fix wave"):
   the lazy path completed 7,200 frames at 800×600.** As written at Task 7:
   **`MAX_EXPORT_FRAMES` (7,200) does not protect this machine.** Q4 measured
   4,800 frames succeeding and 6,000 failing on this 16GB machine, with no
   named diagnostic — a generic browser-crash-shaped error. Ruling R23 left
   the constant unchanged. *Harmless today:* the constant lives inside the
   Phase 4 boundary Global Constraint 7 freezes; a ceiling derived from one
   machine's RAM would be a magic number wrong on every other machine; and at
   30fps the measured-good ceiling is ~160s of animation, well beyond any
   scene in `eval/`. Recorded as a measured bracket, not rounded into a rule.
2. **No scene lacking a top-level `duration:` can be exported from the UI at
   all**, not only the shipped default scene (R27, widened by R39 in Task 6b).
   `useExportVideo.ts` never threads `durationSeconds` to `runVideoExport`, so
   a real click always falls through to the scene's own `duration:` field.
   *Harmless today:* the failure is an honest, verbatim, human-readable
   diagnostic (`EXPORT_UNBOUNDED_SCENE`), not a crash or a silence; the two
   available remedies (a UI affordance, or a change to what scenes must
   declare) are product decisions outside an unattended execution's
   authority, and are recorded here for a human partner rather than chosen.
3. **Q5 (whether `prefer-software` genuinely excludes a real hardware
   encoder) is narrowed, not answered.** Every measurement this phase (and
   this harness) will ever produce runs headless Chromium with explicit
   software-rendering flags. *Harmless today:* the determinism claims this
   phase makes are stated as scoped to that forced-software harness on one
   machine, not as a general claim about an ordinary user's browser session —
   the limitation is disclosed rather than silently exceeded.
4. **`frameRaster.test.ts` test 3's regex is looser than its name.**
   `/Only in the tree: \[[^\]]*b[^\]]*\]/` matches any bracket content
   containing the letter "b," not the specific id. *Harmless today:* it
   over-matches in the safe direction — mutation 2 (Task 0 Step 8) confirms it
   still catches the defect it was written for.
5. **`assertFrameSetMatchesTree`'s docstring claims more than any test
   checks.** It states `frames[0]`'s id set represents the whole sequence's;
   no test distinguishes that from any other index. *Harmless today:* this is
   a property of `sampleFrames`'s own contract, adjacent to what this task's
   scope covers, not a claim this phase's code depends on being false.
6. **Three Task 3 minors; the first is moot since the fix wave removed
   `--mask-mp4-times` (R47).** `--mask-mp4-times` silently no-ops on
   WebM rather than warning (documented behaviour, cosmetic). The runA/runB
   reference-frame comparison (defect #12's fix) holds both runs' full PNG
   sets in Node memory simultaneously, adding to the scaling pressure Q4
   measures. Fault 5 (Task 3's hash-only fault) is recorded as prose rather
   than a fifth row in the Step 6 table — substance complete, formatting
   inconsistent. None share a defect class with anything Important, so none
   were folded into a fix round.
7. **One citation off-by-one, still open.** A comment in `videoEncode.ts`
   cites `mediabunny.mjs:35866` for where mediabunny closes internally-created
   clones; the actual line is 35867. Originated in a controller fix dispatch
   that copied a review finding's text without re-deriving it — the semantic
   claim is correct, the line number is not.
8. **Closed structurally by the fix wave (R45): the harness now runs the
   shipped `runVideoExport`.** As written at Task 7:
   **R22's deferral was discharged for one scene only.** Task 6b (R36) proved
   the shipped export button decodes correctly for `freeze-midair.marey`
   through a real click, closing the gap R22 opened. Every other scene this
   phase's evidence document covers, and the default-scene UI path itself,
   remain covered only through the dev seam. *Harmless today:* the residual
   risk is small — the fix round that preceded 6b verified line-by-line that
   the dev-seam and production paths call the same primitives with a
   byte-for-byte identical `app.init` options object — but it is a real,
   named gap in evidence, not a closed question.
9. **One imprecise citation, parked (R40).** `task-6b-report.md` cites an
   AGENT-LESSONS section thematically rather than exactly. *Harmless today:*
   the file is gitignored working material, not a deliverable.

### The process record

This is the section the next phase's plan should read first.

**Seven interruptions, all by rate-limit kills** (Phase 5A had seven too, five
rate-limit and two stream-stall; this phase's were all the same cause).
Ordered by what each one cost:

- Task 1 attempt 1, Task 2 attempts 1 and 2, and Task 3 attempt 1 **lost
  nothing** — the first three killed before writing anything durable, and
  Task 3's committed exactly at a Step-3 commit boundary and was resumed
  rather than restarted, so the seam's context was not rebuilt.
- Task 4 attempt 1 **cost a stray Vite server on port 5199** — the agent died
  between starting Vite and doing any work, leaving exactly the stale-server
  condition the environment brief warns produces confident false passes.
  Killed, port re-verified free, and a standing check was added for every
  later browser-touching dispatch: boundary-matched `netstat` on 5199 before
  dispatching, not only after.
- Task 5 fix round 1 (**Kill #6**) landed one fix committed and left a second,
  50-line, mostly-complete diff uncommitted. Read in full before deciding to
  keep it (R29) rather than discard and re-spend the tokens.
- **Task 6 (Kill #7) is the one with the real story.** The session resumed
  five days later to find the checkout on `main`, not `phase-5b-video`, and
  **every commit SHA recorded in this ledger above that point no longer
  resolved** (`git cat-file -t` on the last-known-good SHA: "Not a valid
  object name"; the reflog held nothing usable). The work itself was intact —
  all 26 Phase 5B commits recorded to that point were present, in order, with
  matching messages, and `tsc`/`vitest` reproduced the exact figures the
  ledger had recorded (33 files / 862 tests, exit 0) — but their *identity*
  had been rewritten by something outside the repository's own history.
  Ruling R33: old SHAs are treated as stale identifiers for verified-present
  content, never re-derived or "corrected" in place, and no SHA recorded
  above that point in the ledger may be pasted into a later dispatch — `BASE`
  is re-derived from `git rev-parse` at dispatch time instead.

**Commit-as-you-go is what made six of the seven kills cost nothing or close
to it**, the same finding Phase 5A's own process record made about three
kills out of seven — this phase adds a second axis to it: committing
protected *content* even when the *identifiers* pointing at it later became
unusable.

**Two forced model-tier deviations, opposite directions, both named.** Task 5's
task review was dispatched on **opus** deliberately — the highest-risk diff in
the phase (first production-bundle change, a dependency-graph change
affecting every visitor, a structural-guard widening that could be wrong in a
way that still passes) — and it earned the cost: it corrected the
controller's own stated reasoning about a local lazy-loading precedent that
did not exist, resized a self-reported "~4.4MB / 1.15MB" bundle cost down to
the real **+283,561 bytes (+6.6%) / ~+74 kB gzipped** by building both ends
itself, and ran a fourth R21 mutation nobody had — proving the widened import
guard load-bearing by finding a real violation the old guard passed clean.
Task 5's **fix round** then continued on opus for the opposite reason —
**availability, not capability** — because the sonnet pool was exhausted
mid-kill and the alternative was a stalled execution for hours; named
explicitly as a deviation from SDD's "rounds 1–3 resume the original
implementer" rule, since availability forced a handoff instead. Opus was
also deliberately **withheld** from Task 6 and 6b's reviews — both smaller,
narrower diffs — reserved instead for the independent whole-branch review
AGENT-LESSONS §8 requires, which this task's own "What is still owed" section
still names as outstanding. And Task 1's fix-round re-review ran on
**haiku**, a downward adjustment for a genuinely small (4.4 KB) diff — the
same tiering-by-risk AGENT-LESSONS §7b asks for, applied in both directions
in the same phase.

**Every task except Task 0 needed exactly one fix round; none needed two.**
Eight review-eligible units (Tasks 0–6 plus 6b) produced eight task reviews (14
review/re-review dispatches counting re-reviews), zero Critical findings at
any point, and **9 Important findings total** — Task 0: 0; Task 1: 1;
Task 2: 2; Task 3: 2; Task 4: 0 (1 Minor, fixed anyway — see below); Task 5:
2; Task 6: 2; Task 6b: 0. Every fix round's re-review returned clean on its
first pass, which is the AGENT-LESSONS §7b failure this phase avoided:
Phase 3B's Task 7 spent 282,971 tokens on unbatched rounds against a `+37/-5`
diff, and nothing in this phase repeated that shape.

**A minor finding fixed anyway, and why.** Task 4's one review finding was
Minor — the spec's Q5 passage presented an inference (GPU model names imply
hardware encoders) as a measurement. Ruling R24 fixed it rather than
deferring, on the grounds that it is the exact error class this phase exists
to catch, landing in the document Tasks 6 and 7 would cite as settled. The
controller then re-verified the fix's own justification independently before
dispatching the re-review — `git diff` showed the round was purely additive
with respect to everything that predated the task (zero deletion lines
against the task's own base) — and the re-reviewer, given only the question
and not the controller's arithmetic, reached the identical cumulative-diff
numbers independently and went further, grepping the whole repository for
the overclaiming phrasings to confirm no other document had already cited the
text being corrected.

**A withheld-finding test that passed.** Before dispatching Task 6's review,
the controller traced `devVideoSeam.ts` and `videoPipeline.ts` itself and
recorded, in the ledger, that every measurement in the phase's evidence
document to that point ran through the dev seam, not the path a real click
takes — then withheld that conclusion from the review dispatch, asking only
"trace which path the harness exercises, trace which path a click takes,
compare them, report what you find." The reviewer reached the identical
conclusion independently, before finding the controller's own note, and added
a detail the controller had not written down (that the only guard connecting
the two paths is an import-boundary test, not a behavioural-equivalence one).
A review that reproduces a finding its dispatch deliberately withheld is
doing its job rather than agreeing with its brief.

**A fix round corrected an error neither the controller nor the first
reviewer had caught — including inside the controller's own fix
instruction.** Task 6's evidence document justified box-tree-walking (instead
of hardcoded MP4 offsets) with a claim that its computed field offsets did not
match spec §7.2's static table. That claim was false, and the controller's own
fix-round dispatch repeated it as established fact. Because the dispatch also
said "re-derive rather than accept my description," the resumed implementer
re-diffed the still-on-disk diagnostic files and found the true reason (a
32-bit second-count field where only the low-order byte differs between two
runs seconds apart) — which still matched the spec table's numbers exactly,
just not for the reason anyone had written down. The general conclusion (walk
the box tree, never hardcode offsets) survived; the specific evidence offered
for it did not, until this round.

**A deferral nobody discharged is a process lesson, not just an event.**
Ruling R22 scoped Task 5's real-browser click test to download plumbing only
— "not evidence of frame fidelity" — explicitly because "the UI's own
fidelity is covered one task later in Task 6, at no loss." Task 6 then
measured all three exit criteria through the dev seam, the same path Task 5's
own scoping had set aside. Nobody had reported a gap; the controller found it
only by independently tracing the two files against each other while writing
Task 6's own limitations section, after the fact. The promise that justified
narrowing Task 5's scope was never checked against what Task 6 actually did
until it was almost too late to matter. Ruling R36 closed the gap with a new
Task 6b rather than parking it, specifically because parking it would have
retroactively turned R22 from a scheduling decision into a wrong one. The
lesson carried forward: **a deferral that trades scope for a later task's
promised coverage needs the receiving task checked against that promise
before the phase is declared done, not assumed kept because it was named.**

**Rulings that changed under measurement, not merely accumulated.** 40
rulings total (R1–R40, recounted by grep, not trusted from the addendum that
cited "38 at the time of writing" — two more landed in Task 6b after that).
The count matters less than which ones moved:

- **R15 → revised.** First routed the `KEY_FRAME_INTERVAL` docstring fix to
  this task as a comment-only edit; revised to send it to Task 4 instead once
  Task 4 was already authorized to touch that file for an unrelated reason.
- **R16 → settled by measurement, worse than first found.** First deferred
  the `importsModule` trailing-path gap as plausibly unreachable; Task 4
  measured `allowImportingTsExtensions: true` set in every `tsconfig*.json`
  in the repo, making the gap live, and found a second, more serious miss (a
  pixi.js export subpath) the original finding had not named.
- **R25 → accepted, then independently reproduced.** The controller ruled an
  in-place spec edit acceptable based on a zero-deletion `git diff`
  measurement; the re-reviewer, given only the question, reached the
  identical measurement and then went further, confirming by repo-wide grep
  that nothing else had cited the text being corrected.
- **R32 → replaces a plan step the plan's own later measurement had
  falsified** (defect #14 above).
- **R34 → keeps the identical falsified claim out of a second, more
  permanent document** (defect #15 above) — the same false claim R32 had
  already corrected once, caught a second time before it could land in
  `renderer.md`.
- **R36 → reopens coverage R22 had traded away on a promise Task 6 did not
  keep** (the deferral-not-discharged lesson above).
- **R38 → settled by cross-phase precedent** rather than by the plan's own
  contradictory text (defect #17 above).

**Spec-compliance verdicts, re-checked against the ledger rather than assumed
clean.** An earlier draft of this paragraph claimed no task review failed
spec compliance itself this phase. That is false, and the ledger it was
supposedly written from says so directly: `progress.md:109` records
"Task 1: review returned ❌ spec compliance, task quality **Needs fixes**,"
and `progress.md:167` records "Task 2: review returned ❌, task quality
**Needs fixes**." Caught by review of this document, not by re-reading it
here first.

Of the eight reviewed units, **six passed spec compliance on the first
review** (Tasks 0, 3, 4, 5, 6, 6b) and **two failed it outright**: Task 1 —
its one Important finding was defect #7 above, the pinned `DEFAULT_BITRATE`/
`KEY_FRAME_INTERVAL` values guarded only by a sign check — and Task 2 — its
two Important findings were defects #10 and #11 above, the throw-path
resource leak and the import-form regex gap. Both were resolved in exactly
one fix round each, and each re-review reported every finding addressed with
zero left open; the ledger does not record either re-review restating a
formal "spec compliance PASS" verdict, only that nothing was left
outstanding, so that stronger claim is not made here either. Two of eight
task reviews failed spec compliance on their first pass, and review caught
both before either reached a second round — a less clean record than the
paragraph this replaces claimed, and a more useful one for a future reader:
the two failures were exactly the kind of "the plan's own code was wrong"
defect this phase's mutation discipline exists to catch, and both were
caught before merge rather than after.

### Inherited, still open

**`eval/RESULTS-GATE-B.md`'s recorded snapshot hash still does not
reproduce**, unaffected by anything in this phase. Phase 5A's own execution
notes record the cause (a later Phase 4 commit added a field to
`ObjectSnapshot`, and `frameHash.ts` digests the whole JSON) and the decision
to document rather than retcon Phase 4's record. Nothing in Phase 5B touched
Gate B's record, its cause, or the decision to leave it as documented-but-open;
it is named here only so a reader of this phase's notes is not surprised to
find it still true.

### Whole-branch review and fix wave

Added 2026-09-24 after the rest of these notes were written. The independent
whole-branch review AGENT-LESSONS §8 requires
(`.sdd/2026-09-18-phase-5b-video/whole-branch-review.md`, range
`c560530..0d8f641`) found **0 Critical, 7 Important and 9 Minor** findings.
I-7 (the default scene cannot be exported from the button, and its toast
suggests a bound the UI cannot set) was already known (R27/R39) and goes to
the user, as does M-5 (the MPL-2.0 notice does not ship in the build). The
controller reproduced the load-bearing findings before ruling (R43–R51 in
`progress.md`), and one fix wave, dispatched once, addressed I-1..I-6 and
M-1..M-4, M-6..M-9. Its report, with every mutation and measurement, is
`.sdd/2026-09-18-phase-5b-video/fix-wave-report.md`.

**None of the six Important findings appears in any of the eight task
reviews or in the ledger.** Each was about a guard that did not exist or a
tested envelope nobody had left:

| Finding | What was wrong | Fix | Commit |
|---|---|---|---|
| I-3, M-2 | The encoder config "pinned by a test" was pinned in `VideoPlan` only; deleting `latencyMode` from the call site, or reverting the frames-to-seconds keyframe conversion (a real bug fixed in Task 2), left 862/862 green. The spec's `onEncoderConfig` record was dropped silently | `videoSourceConfig` / `videoOutputFormatOptions` in `videoContract.ts`; `videoEncode.test.ts` mocks mediabunny and pins what reaches it; the resolved config is recorded in `report.json` | `c7c491c` |
| I-5, M-8 | The pinned `avc1.42001f` (level 3.1) refused every MP4 above 921,600 coded pixels with a message blaming the browser; every piece of evidence was 800×600. The pinned VP9 string declared level 1.0, measured in every WebM the phase produced | Codec level chosen per plan from H.264 Table A-1 (03/2010 edition, levels 1–5.1) and libvpx's VP9 table; new `VIDEO_EXCEEDS_CODEC_LEVELS` refusal. 800×600 at 30 fps still selects `avc1.42001f`. 1920×1080 and 1080×1920 MP4 now decode 90/90 strict. Constraint byte `00` vs the stream's `0xC0` kept deliberately (disclosed residual) | `96c6880` |
| I-2, I-4 | The harness drove `devVideoSeam.ts`, a hand-copy of the orchestration, so reversing or thinning frames in the shipped `videoPipeline.ts` left the suite and the harness green. The shipped path rasterized every frame up front, held them all in memory, and froze the page for up to 15 s before the first progress tick | `runVideoExport` is the only orchestration; the seam observes it. Lazy rasterization, codec probe before sampling, yield every 100 ms. Longest freeze ~15 s → ~0.75 s (900 frames); 7,200 frames at 800×600 completes | `f299286` |
| I-1, M-7 | The harness computed `kInTiedSet` and read it nowhere, so a tie between two *other* references exited 0 — and the primary fixture's own WebM run had one (frame 2). `freeze-midair` frames 0–2 have no discriminating power, so R20's claim was false for them | Tie excluding *k* now fails the run; `linear-motion.marey` is the primary criterion-3 fixture | `584d208` |
| I-6 | MP4 raw bytes gated the exit code, so every MP4 run exited 1, a correct one and a frame-reversed one alike; the header and SKILL.md stated the rule backwards | MP4 bytes reported, never gating; WebM keeps gating; docs corrected | `cf89027` |
| M-1 | Guard docs claimed the encoder could not reach the IR or pixi.js through any import; the guard checks direct imports only | Docs corrected; no transitive guard built (R48) | `7662361` |
| M-3 | The lazy `videoPipeline` chunk (why mediabunny stays out of the entry chunk) was guarded by nothing | `exportBoundary.test.ts` fails on any static import of it from the hook | `41dc2ad` |
| M-4 | mediabunny caret-ranged while `matter-js` is pinned exactly | Pinned `1.58.0`, lockfile regenerated offline | `f27522c` |
| M-6, M-9 | The memory bullet dropped its resolution; criterion 2's MP4 reason was a location | Evidence document updated; the reviewer's raw-`VideoEncoder` measurement cited as the reviewer's (below the muxer) | this section's commit and the `eval/RESULTS-PHASE-5B.md` commits before it |

**GC11 proofs, on the behaviours a user would be hurt by.** Each mutation was
applied, run and reverted in one shell command, with `git diff --stat` empty
after. The ones that matter most: reversing the frame loop in `videoPipeline.ts`
makes `video-check.mjs` exit 1 (38 strict mismatches, 34 ties excluding *k*),
in WebM and in MP4; dropping every 10th frame there exits 1 (81/90 decoded, 9
frames never handed to the encoder); the unmutated control exits 0. Forcing
the MP4 string back to `avc1.42001f` reproduces the 1080p refusal. Deleting
`latencyMode`, forcing `prefer-hardware`, dropping `/ plan.fps`, writing
microsecond timestamps, or `fastStart: false` each turns the suite red. The
full table is in the fix-wave report.

**Measured facts the wave turned up that were not in the review:** Chromium
enforces the H.264 frame-size limit exactly but not the macroblock-rate limit,
and no VP9 level at all; mediabunny 1.58.0 already resolves an unset
`fastStart` to `"in-memory"` for a `BufferTarget`, so that field is explicit
for version-safety, not behaviour; two 1080p-sized MP4 runs were
byte-identical once the six timestamp fields were masked, while every 800×600
run was not (recorded, not explained); and the remaining ~0.75 s freeze sits
between sampling and the first encoded frame, not in the GC7-frozen
`sampleFrames`.

**The lesson, worth carrying into AGENT-LESSONS: mutate the product's
behaviours, not the tests' targets.** The controller's fifteen-mutation
sweep before the review fired every time, because every mutation pointed at a
guard that existed. A table built by walking the existing tests can only
confirm that the protection you already have works; it is structurally blind
to protection that is absent. I-2 and I-3 were both absences: nothing
checked the shipped orchestration's frame order, and nothing checked what
reached the encoder. The question to ask is "what would a user be hurt by,
and does anything go red when I break exactly that?", and it has to be asked
of the shipped path, not of the harness's copy of it. The fix wave's own
evidence shows the corollary: its strongest proofs (a reversed or thinned
loop in `videoPipeline.ts` making the harness exit 1) are mutations no test
pointed at before.

**After the wave:** `npx vitest run` → **34 files / 910 tests**; `npx tsc -b
--noEmit` exit 0; `npm run build` exit 0 (only the pre-existing >500 kB
advisory), `videoPipeline-*.js` **284,082 bytes** (was 279,404; the wave added
the level tables, the probe and the lazy loop), mediabunny still confined to
that chunk and the dev seam still absent from `dist/`. Still open for the user
at the merge: I-7, M-5, and Q5 (hardware encoder). Not yet done: the scoped
re-review of this wave.
