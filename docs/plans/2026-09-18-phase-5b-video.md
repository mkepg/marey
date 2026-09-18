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
